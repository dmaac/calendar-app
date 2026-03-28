"""Food service -- search, autocomplete, recents, frequents, custom foods, USDA/OFF lookup.

Provides fuzzy search with typo tolerance, autocomplete for type-ahead UI,
recently/frequently eaten food retrieval, portion size multiplier support,
custom food creation with validation, and external food database lookup
patterns (USDA FoodData Central and OpenFoodFacts).
"""

import logging
import os
import re
from difflib import SequenceMatcher
from typing import Dict, List, Optional, Tuple

from sqlmodel import select, func, col, or_
from sqlmodel.ext.asyncio.session import AsyncSession

from ..core.cache import (
    cache_get, cache_set, cache_delete,
    food_search_key, food_categories_key, food_by_id_key,
    recent_foods_key, favorites_key,
    invalidate_food_search_cache,
    CACHE_TTL,
)
from ..models.food import Food, FoodCreate, FoodUpdate
from ..models.meal_log import MealLog
from ..models.user_food_favorite import UserFoodFavorite

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Fuzzy matching configuration
# ---------------------------------------------------------------------------

# Minimum similarity ratio for fuzzy matches (0.0 - 1.0)
_FUZZY_THRESHOLD = 0.45

# Common Spanish typo corrections for food names.
# Key = common misspelling, value = correct form.
_TYPO_MAP: Dict[str, str] = {
    "poyo": "pollo",
    "aros": "arroz",
    "arros": "arroz",
    "lechuha": "lechuga",
    "platano": "platano",
    "manzna": "manzana",
    "manzanna": "manzana",
    "brocoli": "brocoli",
    "brocoly": "brocoli",
    "qeso": "queso",
    "quzo": "queso",
    "serdo": "cerdo",
    "serdos": "cerdo",
    "serea": "cereal",
    "sereal": "cereal",
    "uevo": "huevo",
    "uebos": "huevo",
    "salchiha": "salchicha",
    "salchica": "salchicha",
    "ensalda": "ensalada",
    "yougrt": "yogurt",
    "yogur": "yogurt",
    "yoghurt": "yogurt",
    "hamon": "jamon",
    "juho": "jugo",
    "zumo": "jugo",
    "galeta": "galleta",
    "gayeta": "galleta",
}

# Allowed serving units for custom food validation
_VALID_SERVING_UNITS = {
    "g", "gr", "grams", "gramos",
    "ml", "milliliters", "mililitros",
    "oz", "ounce", "ounces", "onzas",
    "cup", "cups", "taza", "tazas",
    "tbsp", "tablespoon", "cucharada",
    "tsp", "teaspoon", "cucharadita",
    "piece", "pieces", "pieza", "piezas", "unidad", "unidades",
    "slice", "slices", "rebanada", "rebanadas",
    "serving", "servings", "porcion", "porciones",
    "lb", "lbs", "libra", "libras",
    "kg", "kilogramo", "kilogramos",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _normalize_query(query: str) -> str:
    """Normalize a search query: lowercase, strip, apply known typo corrections."""
    q = query.lower().strip()
    words = q.split()
    corrected = [_TYPO_MAP.get(w, w) for w in words]
    return " ".join(corrected)


def _fuzzy_score(query: str, name: str) -> float:
    """Return a similarity score between 0 and 1 for a query against a food name.

    Uses SequenceMatcher for trigram-like approximate matching.
    Handles partial matches by also checking if any word in the name
    is close to the query (e.g. "poyo" vs "pollo").
    """
    q = query.lower().strip()
    n = name.lower().strip()

    # Exact substring match gets highest score
    if q in n:
        return 1.0

    # Full-string similarity
    full_ratio = SequenceMatcher(None, q, n).ratio()

    # Word-level similarity (best word match)
    words = n.split()
    word_ratios = [SequenceMatcher(None, q, w).ratio() for w in words]
    best_word = max(word_ratios) if word_ratios else 0.0

    # Prefix bonus: if any word in the name starts with the query
    prefix_bonus = 0.0
    for w in words:
        if w.startswith(q):
            prefix_bonus = 0.15
            break

    # Take the best of the two strategies, plus prefix bonus
    return min(1.0, max(full_ratio, best_word) + prefix_bonus)


class FoodService:
    def __init__(self, session: AsyncSession):
        self.session = session

    # -----------------------------------------------------------------------
    # Single food retrieval
    # -----------------------------------------------------------------------

    async def get_food_by_id(self, food_id: int) -> Optional[Food]:
        return await self.session.get(Food, food_id)

    async def get_foods_by_ids(self, food_ids: List[int]) -> dict:
        """Batch-load foods by a list of IDs. Returns a dict mapping food_id -> Food."""
        if not food_ids:
            return {}
        statement = select(Food).where(col(Food.id).in_(food_ids))  # type: ignore
        result = await self.session.execute(statement)
        return {food.id: food for food in result.scalars().all()}

    # -----------------------------------------------------------------------
    # Fuzzy search (improved with typo normalization + dual-query fallback)
    # -----------------------------------------------------------------------

    async def search_foods(
        self,
        query: str,
        limit: int = 20,
        offset: int = 0,
        min_calories: Optional[float] = None,
        max_calories: Optional[float] = None,
        diet_type: Optional[str] = None,
        sort_by: str = "relevance",
    ) -> Tuple[List[dict], int]:
        """Search foods with fuzzy matching and optional filters.

        Returns a list of dicts with food data + relevance score, and total count.

        Search strategy:
        1. Normalize the query through a Spanish typo map (e.g. "poyo" -> "pollo").
        2. Try an ILIKE search with the normalized query.
        3. If no results and normalization changed the query, also try the original.
        4. Fall back to Python-side difflib fuzzy matching across a candidate pool.

        Results are cached for 1 hour when no calorie filters are applied
        (the most common search pattern).
        """
        normalized = _normalize_query(query)
        original_lower = query.lower().strip()

        # Check cache for simple searches (no calorie filters = most common)
        use_cache = min_calories is None and max_calories is None and sort_by == "relevance"
        if use_cache:
            cache_key = food_search_key(normalized, offset, limit, diet_type)
            try:
                cached = await cache_get(cache_key)
                if cached is not None:
                    return cached["items"], cached["total"]
            except Exception:
                pass

        extra_conditions = self._build_filters(min_calories, max_calories, diet_type)
        order_clause = self._sort_clause(sort_by)

        # --- Try ILIKE with normalized query ---
        items, total = await self._ilike_search(
            normalized, extra_conditions, order_clause, offset, limit,
        )
        if total > 0:
            scored = self._score_and_sort(items, normalized)
            if use_cache:
                self._cache_results(cache_key, scored, total)
            return scored, total

        # --- Retry with original query if normalization changed it ---
        if original_lower != normalized:
            items, total = await self._ilike_search(
                original_lower, extra_conditions, order_clause, offset, limit,
            )
            if total > 0:
                scored = self._score_and_sort(items, original_lower)
                if use_cache:
                    self._cache_results(cache_key, scored, total)
                return scored, total

        # --- Fuzzy fallback: load candidates from DB and match in Python ---
        fuzzy_stmt = select(Food)
        if extra_conditions:
            fuzzy_stmt = fuzzy_stmt.where(*extra_conditions)
        fuzzy_stmt = fuzzy_stmt.limit(2000)
        fuzzy_result = await self.session.execute(fuzzy_stmt)
        candidates = list(fuzzy_result.all())

        scored_candidates = []
        for food in candidates:
            score_norm = _fuzzy_score(normalized, food.name)
            score_orig = _fuzzy_score(original_lower, food.name) if original_lower != normalized else 0.0
            score = max(score_norm, score_orig)
            if score >= _FUZZY_THRESHOLD:
                scored_candidates.append((food, score))

        scored_candidates.sort(key=lambda x: x[1], reverse=True)
        total_fuzzy = len(scored_candidates)

        page = scored_candidates[offset : offset + limit]
        result_items = [
            self._food_with_score(food, round(score, 3)) for food, score in page
        ]
        if use_cache:
            self._cache_results(cache_key, result_items, total_fuzzy)
        return result_items, total_fuzzy

    async def _ilike_search(
        self,
        query_lower: str,
        extra_conditions: list,
        order_clause,
        offset: int,
        limit: int,
    ) -> Tuple[List[Food], int]:
        """Run an ILIKE search and return (foods, total_count)."""
        escaped = query_lower.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"
        conditions = [Food.name.ilike(pattern)]  # type: ignore

        count_stmt = (
            select(func.count())
            .select_from(Food)
            .where(*conditions, *extra_conditions)
        )
        total_result = await self.session.execute(count_stmt)
        total = total_result.one()

        if total == 0:
            return [], 0

        statement = (
            select(Food)
            .where(*conditions, *extra_conditions)
            .order_by(order_clause)
            .offset(offset)
            .limit(limit)
        )
        result = await self.session.execute(statement)
        return list(result.all()), total

    def _score_and_sort(self, foods: List[Food], query: str) -> List[dict]:
        """Score a list of foods against a query and return sorted dicts."""
        scored = []
        for food in foods:
            score = _fuzzy_score(query, food.name)
            scored.append(self._food_with_score(food, round(score, 3)))
        scored.sort(key=lambda x: x["relevance_score"], reverse=True)
        return scored

    @staticmethod
    def _cache_results(cache_key: str, items: list, total: int) -> None:
        """Fire-and-forget cache write (errors silenced at call site)."""
        import asyncio
        try:
            asyncio.ensure_future(
                cache_set(cache_key, {"items": items, "total": total}, CACHE_TTL["food_search"])
            )
        except Exception:
            pass

    # -----------------------------------------------------------------------
    # Autocomplete (type-ahead suggestions)
    # -----------------------------------------------------------------------

    async def autocomplete(
        self,
        query: str,
        limit: int = 8,
        user_id: Optional[int] = None,
    ) -> List[dict]:
        """Return lightweight food suggestions as the user types.

        Designed for the type-ahead search box on mobile.  Returns id, name,
        brand, calories, and a match_source field ("exact", "recent", or
        "favorite") so the UI can group or highlight results.

        Priority order:
        1. User's recent foods matching the prefix (if user_id provided)
        2. User's favorites matching the prefix (if user_id provided)
        3. Verified catalog foods matching with prefix ILIKE
        4. All catalog foods matching with contains ILIKE
        """
        if len(query.strip()) < 2:
            return []

        normalized = _normalize_query(query)
        escaped = normalized.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        contains_pattern = f"%{escaped}%"
        prefix_pattern = f"{escaped}%"

        results: List[dict] = []
        seen_ids: set = set()

        def _append(row, source: str) -> None:
            if row.id not in seen_ids:
                seen_ids.add(row.id)
                results.append({
                    "id": row.id,
                    "name": row.name,
                    "brand": row.brand,
                    "calories": row.calories,
                    "match_source": source,
                })

        # 1. Recent foods matching prefix (personalized, highest priority)
        if user_id:
            recent_stmt = (
                select(Food.id, Food.name, Food.brand, Food.calories)
                .join(MealLog, MealLog.food_id == Food.id)  # type: ignore
                .where(
                    MealLog.user_id == user_id,
                    Food.name.ilike(contains_pattern),  # type: ignore
                )
                .group_by(Food.id, Food.name, Food.brand, Food.calories)
                .order_by(func.max(MealLog.created_at).desc())
                .limit(3)
            )
            for row in (await self.session.execute(recent_stmt)).all():
                _append(row, "recent")

        # 2. Favorites matching prefix
        if user_id:
            fav_stmt = (
                select(Food.id, Food.name, Food.brand, Food.calories)
                .join(UserFoodFavorite, UserFoodFavorite.food_id == Food.id)  # type: ignore
                .where(
                    UserFoodFavorite.user_id == user_id,
                    Food.name.ilike(contains_pattern),  # type: ignore
                )
                .limit(3)
            )
            for row in (await self.session.execute(fav_stmt)).all():
                _append(row, "favorite")

        # 3. Verified foods with prefix match (name starts with query)
        remaining = limit - len(results)
        if remaining > 0:
            verified_stmt = (
                select(Food.id, Food.name, Food.brand, Food.calories)
                .where(
                    Food.is_verified == True,  # noqa: E712
                    Food.name.ilike(prefix_pattern),  # type: ignore
                )
                .order_by(Food.name)
                .limit(remaining)
            )
            for row in (await self.session.execute(verified_stmt)).all():
                _append(row, "exact")

        # 4. All foods with contains ILIKE (fills remaining slots)
        remaining = limit - len(results)
        if remaining > 0:
            all_stmt = (
                select(Food.id, Food.name, Food.brand, Food.calories)
                .where(Food.name.ilike(contains_pattern))  # type: ignore
                .order_by(Food.name)
                .limit(remaining + 5)
            )
            for row in (await self.session.execute(all_stmt)).all():
                if len(results) >= limit:
                    break
                _append(row, "exact")

        return results[:limit]

    # -----------------------------------------------------------------------
    # Recently eaten foods (quick re-log)
    # -----------------------------------------------------------------------

    async def get_recent_foods(self, user_id: int, limit: int = 20) -> List[dict]:
        """Get the last N distinct foods the user logged, ordered by most recent.

        Returns enriched dicts with food data plus last_eaten timestamp and
        eat_count so the UI can show "Eaten 5 times, last 2 hours ago".
        """
        cache_key = recent_foods_key(user_id)
        try:
            cached = await cache_get(cache_key)
            if cached is not None:
                return cached[:limit]
        except Exception:
            pass

        statement = (
            select(
                MealLog.food_id,
                func.max(MealLog.created_at).label("last_eaten"),
                func.count(MealLog.id).label("eat_count"),
            )
            .where(MealLog.user_id == user_id)
            .group_by(MealLog.food_id)
            .order_by(func.max(MealLog.created_at).desc())
            .limit(limit)
        )
        result = await self.session.execute(statement)
        rows = result.all()

        if not rows:
            return []

        food_ids = [row.food_id for row in rows]
        metadata_map = {
            row.food_id: {
                "last_eaten": row.last_eaten.isoformat() if row.last_eaten else None,
                "eat_count": row.eat_count,
            }
            for row in rows
        }

        foods_stmt = select(Food).where(col(Food.id).in_(food_ids))  # type: ignore
        foods_result = await self.session.execute(foods_stmt)
        food_map = {f.id: f for f in foods_result.all()}

        items = []
        for fid in food_ids:
            food = food_map.get(fid)
            if food:
                meta = metadata_map.get(fid, {})
                items.append({
                    "id": food.id,
                    "name": food.name,
                    "brand": food.brand,
                    "category": food.category,
                    "serving_size": food.serving_size,
                    "serving_unit": food.serving_unit,
                    "calories": food.calories,
                    "protein_g": food.protein_g,
                    "carbs_g": food.carbs_g,
                    "fat_g": food.fat_g,
                    "fiber_g": food.fiber_g,
                    "sugar_g": food.sugar_g,
                    "last_eaten": meta.get("last_eaten"),
                    "eat_count": meta.get("eat_count", 0),
                })

        try:
            await cache_set(cache_key, items, CACHE_TTL["recent_foods"])
        except Exception:
            pass

        return items

    # -----------------------------------------------------------------------
    # Frequently eaten foods (top N by count)
    # -----------------------------------------------------------------------

    async def get_frequent_foods(self, user_id: int, limit: int = 10) -> List[dict]:
        """Get the top N most frequently logged foods for a user.

        Ordered by total times eaten (descending).  Useful for "quick add"
        shortcuts on the home screen.
        """
        cache_key = f"user:{user_id}:frequent_foods"
        try:
            cached = await cache_get(cache_key)
            if cached is not None:
                return cached[:limit]
        except Exception:
            pass

        statement = (
            select(
                MealLog.food_id,
                func.count(MealLog.id).label("eat_count"),
                func.max(MealLog.created_at).label("last_eaten"),
            )
            .where(MealLog.user_id == user_id)
            .group_by(MealLog.food_id)
            .order_by(func.count(MealLog.id).desc())
            .limit(limit)
        )
        result = await self.session.execute(statement)
        rows = result.all()

        if not rows:
            return []

        food_ids = [row.food_id for row in rows]
        metadata_map = {
            row.food_id: {
                "eat_count": row.eat_count,
                "last_eaten": row.last_eaten.isoformat() if row.last_eaten else None,
            }
            for row in rows
        }

        foods_stmt = select(Food).where(col(Food.id).in_(food_ids))  # type: ignore
        foods_result = await self.session.execute(foods_stmt)
        food_map = {f.id: f for f in foods_result.all()}

        items = []
        for fid in food_ids:
            food = food_map.get(fid)
            if food:
                meta = metadata_map.get(fid, {})
                items.append({
                    "id": food.id,
                    "name": food.name,
                    "brand": food.brand,
                    "category": food.category,
                    "serving_size": food.serving_size,
                    "serving_unit": food.serving_unit,
                    "calories": food.calories,
                    "protein_g": food.protein_g,
                    "carbs_g": food.carbs_g,
                    "fat_g": food.fat_g,
                    "fiber_g": food.fiber_g,
                    "sugar_g": food.sugar_g,
                    "eat_count": meta.get("eat_count", 0),
                    "last_eaten": meta.get("last_eaten"),
                })

        try:
            await cache_set(cache_key, items, CACHE_TTL["recent_foods"])
        except Exception:
            pass

        return items

    # -----------------------------------------------------------------------
    # Portion size multiplier
    # -----------------------------------------------------------------------

    async def get_food_with_portion(
        self,
        food_id: int,
        portion_multiplier: float = 1.0,
    ) -> Optional[dict]:
        """Return a food with macros scaled by portion_multiplier.

        portion_multiplier=1.0 means one standard serving.
        portion_multiplier=0.5 means half a serving.
        portion_multiplier=2.0 means double serving.
        """
        food = await self.session.get(Food, food_id)
        if not food:
            return None

        m = max(0.01, min(portion_multiplier, 20.0))  # clamp to [0.01, 20]

        return {
            "id": food.id,
            "name": food.name,
            "brand": food.brand,
            "category": food.category,
            "base_serving_size": food.serving_size,
            "base_serving_unit": food.serving_unit,
            "portion_multiplier": round(m, 2),
            "adjusted_serving_size": round(food.serving_size * m, 1),
            "serving_unit": food.serving_unit,
            "calories": round(food.calories * m, 1),
            "protein_g": round(food.protein_g * m, 1),
            "carbs_g": round(food.carbs_g * m, 1),
            "fat_g": round(food.fat_g * m, 1),
            "fiber_g": round(food.fiber_g * m, 1),
            "sugar_g": round(food.sugar_g * m, 1),
            "is_verified": food.is_verified,
        }

    # -----------------------------------------------------------------------
    # Custom food creation with validation
    # -----------------------------------------------------------------------

    async def create_custom_food(
        self,
        user_id: int,
        name: str,
        calories: float,
        protein_g: float,
        carbs_g: float,
        fat_g: float,
        fiber_g: float = 0.0,
        sugar_g: float = 0.0,
        brand: Optional[str] = None,
        category: Optional[str] = None,
        serving_size: float = 100.0,
        serving_unit: str = "g",
    ) -> dict:
        """Create a custom food entry with comprehensive validation.

        Validates:
        - Name length and format
        - Macro plausibility (calories vs macro sum)
        - Serving unit is recognized
        - No exact duplicate for this user
        - Sugar <= carbs, fiber <= carbs

        Returns the created food dict or raises ValueError with a semicolon-
        separated list of validation errors.
        """
        errors: List[str] = []

        # --- Name validation ---
        name = name.strip()
        name = re.sub(r'^[\s\-_]+|[\s\-_]+$', '', name)
        if len(name) < 2:
            errors.append("El nombre debe tener al menos 2 caracteres.")
        if len(name) > 200:
            errors.append("El nombre no puede exceder 200 caracteres.")

        # --- Macro range validation ---
        if calories < 0 or calories > 5000:
            errors.append("Las calorias deben estar entre 0 y 5000.")
        if protein_g < 0 or protein_g > 500:
            errors.append("La proteina debe estar entre 0 y 500g.")
        if carbs_g < 0 or carbs_g > 500:
            errors.append("Los carbohidratos deben estar entre 0 y 500g.")
        if fat_g < 0 or fat_g > 500:
            errors.append("Las grasas deben estar entre 0 y 500g.")
        if fiber_g < 0 or fiber_g > 200:
            errors.append("La fibra debe estar entre 0 y 200g.")
        if sugar_g < 0 or sugar_g > 500:
            errors.append("El azucar debe estar entre 0 y 500g.")

        # --- Cross-field plausibility ---
        if sugar_g > carbs_g:
            errors.append("El azucar no puede ser mayor que los carbohidratos.")
        if fiber_g > carbs_g > 0:
            errors.append("La fibra no puede ser mayor que los carbohidratos.")

        # Macro-calorie plausibility (protein=4kcal/g, carbs=4kcal/g, fat=9kcal/g)
        computed_cal = (protein_g * 4) + (carbs_g * 4) + (fat_g * 9)
        if calories > 0 and computed_cal > 0:
            ratio = calories / computed_cal
            if ratio < 0.5 or ratio > 2.0:
                errors.append(
                    f"Las calorias ({int(calories)}) no son consistentes con los macros "
                    f"(estimado: {int(computed_cal)} kcal). Revisa los valores."
                )

        # --- Serving unit validation ---
        if serving_unit.lower().strip() not in _VALID_SERVING_UNITS:
            errors.append(
                f"Unidad de porcion '{serving_unit}' no reconocida. "
                f"Usa: g, ml, oz, cup, tbsp, tsp, piece, slice, serving."
            )

        if serving_size <= 0 or serving_size > 5000:
            errors.append("El tamano de porcion debe estar entre 0 y 5000.")

        # --- Duplicate check ---
        dup_stmt = select(Food).where(
            func.lower(Food.name) == name.lower(),
            Food.created_by == user_id,
        )
        dup_result = await self.session.execute(dup_stmt)
        if dup_result.first() is not None:
            errors.append(f"Ya tienes un alimento con el nombre '{name}'.")

        if errors:
            raise ValueError("; ".join(errors))

        # --- Create ---
        food = Food(
            name=name,
            brand=brand,
            category=category,
            serving_size=serving_size,
            serving_unit=serving_unit,
            calories=round(calories, 1),
            protein_g=round(protein_g, 1),
            carbs_g=round(carbs_g, 1),
            fat_g=round(fat_g, 1),
            fiber_g=round(fiber_g, 1),
            sugar_g=round(sugar_g, 1),
            is_verified=False,
            created_by=user_id,
        )
        self.session.add(food)
        await self.session.commit()
        await self.session.refresh(food)

        try:
            await invalidate_food_search_cache()
        except Exception:
            pass

        return self._food_with_score(food, 1.0)

    # -----------------------------------------------------------------------
    # External food database lookup (USDA / OpenFoodFacts)
    # -----------------------------------------------------------------------

    async def lookup_external(
        self,
        query: str,
        source: str = "usda",
        limit: int = 10,
    ) -> dict:
        """Build the API request config for an external food database lookup.

        Returns a dict with url, method, params, and headers ready for the
        router layer to execute via httpx.  This keeps the service layer free
        of HTTP client dependencies.

        Supported sources:
        - "usda"           -- USDA FoodData Central (requires USDA_API_KEY env var)
        - "openfoodfacts"  -- OpenFoodFacts search (no key required)
        - "barcode"        -- OpenFoodFacts barcode lookup (query = barcode string)
        """
        source = source.lower().strip()

        if source == "usda":
            api_key = os.getenv("USDA_API_KEY", "DEMO_KEY")
            return {
                "source": "usda",
                "url": "https://api.nal.usda.gov/fdc/v1/foods/search",
                "method": "GET",
                "params": {
                    "api_key": api_key,
                    "query": query,
                    "pageSize": min(limit, 25),
                    "dataType": "Foundation,SR Legacy,Branded",
                },
                "headers": {},
            }

        if source in ("openfoodfacts", "off"):
            return {
                "source": "openfoodfacts",
                "url": "https://world.openfoodfacts.org/cgi/search.pl",
                "method": "GET",
                "params": {
                    "search_terms": query,
                    "search_simple": 1,
                    "action": "process",
                    "json": 1,
                    "page_size": min(limit, 25),
                    "fields": "product_name,brands,nutriments,serving_size,categories_tags,code",
                },
                "headers": {"User-Agent": "FitsiIA/1.0 (contact@fitsi.app)"},
            }

        if source == "barcode":
            return {
                "source": "openfoodfacts_barcode",
                "url": f"https://world.openfoodfacts.org/api/v2/product/{query}.json",
                "method": "GET",
                "params": {
                    "fields": "product_name,brands,nutriments,serving_size,categories_tags,code",
                },
                "headers": {"User-Agent": "FitsiIA/1.0 (contact@fitsi.app)"},
            }

        raise ValueError(
            f"Fuente de datos no soportada: {source}. Usa 'usda', 'openfoodfacts', o 'barcode'."
        )

    @staticmethod
    def parse_usda_response(data: dict) -> List[dict]:
        """Parse USDA FoodData Central search response into standardized food dicts.

        Extracts food name, brand, and nutrient values from the USDA JSON format.
        Each nutrient is identified by its nutrient number (e.g. 208 = Energy kcal).
        """
        foods = []
        for item in data.get("foods", []):
            nutrients = {
                n.get("nutrientNumber"): n.get("value", 0)
                for n in item.get("foodNutrients", [])
                if n.get("nutrientNumber")
            }
            foods.append({
                "external_id": str(item.get("fdcId", "")),
                "source": "usda",
                "name": item.get("description", "Unknown"),
                "brand": item.get("brandName") or item.get("brandOwner"),
                "category": item.get("foodCategory"),
                "serving_size": 100.0,
                "serving_unit": "g",
                "calories": round(nutrients.get("208", 0), 1),
                "protein_g": round(nutrients.get("203", 0), 1),
                "carbs_g": round(nutrients.get("205", 0), 1),
                "fat_g": round(nutrients.get("204", 0), 1),
                "fiber_g": round(nutrients.get("291", 0), 1),
                "sugar_g": round(nutrients.get("269", 0), 1),
                "data_type": item.get("dataType"),
            })
        return foods

    @staticmethod
    def parse_openfoodfacts_response(data: dict) -> List[dict]:
        """Parse OpenFoodFacts search response into standardized food dicts.

        Handles the OFF JSON format where nutrients are nested under
        product.nutriments with keys like 'energy-kcal_100g'.
        """
        foods = []
        products = data.get("products", [])
        if not products and "product" in data:
            products = [data["product"]]

        for product in products:
            nut = product.get("nutriments", {})
            foods.append({
                "external_id": product.get("code", ""),
                "source": "openfoodfacts",
                "name": product.get("product_name", "Unknown"),
                "brand": product.get("brands"),
                "category": None,
                "serving_size": 100.0,
                "serving_unit": "g",
                "calories": round(nut.get("energy-kcal_100g", nut.get("energy-kcal", 0)), 1),
                "protein_g": round(nut.get("proteins_100g", nut.get("proteins", 0)), 1),
                "carbs_g": round(nut.get("carbohydrates_100g", nut.get("carbohydrates", 0)), 1),
                "fat_g": round(nut.get("fat_100g", nut.get("fat", 0)), 1),
                "fiber_g": round(nut.get("fiber_100g", nut.get("fiber", 0)), 1),
                "sugar_g": round(nut.get("sugars_100g", nut.get("sugars", 0)), 1),
                "barcode": product.get("code"),
            })
        return foods

    async def import_from_external(
        self,
        external_food: dict,
        user_id: int,
    ) -> Food:
        """Import a food from an external database lookup into the local catalog.

        Checks for duplicates by name+brand before creating a new entry.
        """
        name = external_food.get("name", "Unknown").strip()
        brand = external_food.get("brand")

        dup_conditions = [func.lower(Food.name) == name.lower()]
        if brand:
            dup_conditions.append(func.lower(Food.brand) == brand.lower())
        else:
            dup_conditions.append(Food.brand.is_(None))  # type: ignore

        dup_stmt = select(Food).where(*dup_conditions).limit(1)
        dup_result = await self.session.execute(dup_stmt)
        existing = dup_result.first()
        if existing:
            return existing

        food = Food(
            name=name,
            brand=brand,
            category=external_food.get("category"),
            serving_size=external_food.get("serving_size", 100.0),
            serving_unit=external_food.get("serving_unit", "g"),
            calories=external_food.get("calories", 0),
            protein_g=external_food.get("protein_g", 0),
            carbs_g=external_food.get("carbs_g", 0),
            fat_g=external_food.get("fat_g", 0),
            fiber_g=external_food.get("fiber_g", 0),
            sugar_g=external_food.get("sugar_g", 0),
            is_verified=False,
            created_by=user_id,
        )
        self.session.add(food)
        await self.session.commit()
        await self.session.refresh(food)

        try:
            await invalidate_food_search_cache()
        except Exception:
            pass

        return food

    # -----------------------------------------------------------------------
    # Browse all foods (catalog)
    # -----------------------------------------------------------------------

    async def get_all_foods(
        self,
        limit: int = 50,
        offset: int = 0,
        min_calories: Optional[float] = None,
        max_calories: Optional[float] = None,
        category: Optional[str] = None,
        sort_by: str = "name",
    ) -> Tuple[List[Food], int]:
        extra_conditions = self._build_filters(min_calories, max_calories, category=category)

        count_stmt = select(func.count()).select_from(Food)
        if extra_conditions:
            count_stmt = count_stmt.where(*extra_conditions)
        total_result = await self.session.execute(count_stmt)
        total = total_result.one()

        order_clause = self._sort_clause(sort_by)
        statement = select(Food).order_by(order_clause).offset(offset).limit(limit)
        if extra_conditions:
            statement = select(Food).where(*extra_conditions).order_by(order_clause).offset(offset).limit(limit)
        result = await self.session.execute(statement)
        items = list(result.all())
        return items, total

    # -----------------------------------------------------------------------
    # CRUD
    # -----------------------------------------------------------------------

    async def create_food(self, food_create: FoodCreate, created_by: Optional[int] = None) -> Food:
        food = Food(**food_create.dict(), created_by=created_by)
        self.session.add(food)
        await self.session.commit()
        await self.session.refresh(food)
        try:
            await invalidate_food_search_cache()
        except Exception:
            pass
        return food

    async def update_food(self, food_id: int, food_update: FoodUpdate) -> Optional[Food]:
        food = await self.session.get(Food, food_id)
        if not food:
            return None

        update_data = food_update.dict(exclude_unset=True)
        if update_data:
            for field, value in update_data.items():
                setattr(food, field, value)
            self.session.add(food)
            await self.session.commit()
            await self.session.refresh(food)
            try:
                await cache_delete(food_by_id_key(food_id))
                await invalidate_food_search_cache()
            except Exception:
                pass

        return food

    async def delete_food(self, food_id: int) -> bool:
        food = await self.session.get(Food, food_id)
        if not food:
            return False
        await self.session.delete(food)
        await self.session.commit()
        try:
            await cache_delete(food_by_id_key(food_id))
            await invalidate_food_search_cache()
        except Exception:
            pass
        return True

    # --- Favorites ---

    async def add_favorite(self, user_id: int, food_id: int) -> UserFoodFavorite:
        statement = select(UserFoodFavorite).where(
            UserFoodFavorite.user_id == user_id,
            UserFoodFavorite.food_id == food_id,
        )
        result = await self.session.execute(statement)
        existing = result.scalars().first()
        if existing:
            return existing

        favorite = UserFoodFavorite(user_id=user_id, food_id=food_id)
        self.session.add(favorite)
        await self.session.commit()
        await self.session.refresh(favorite)
        try:
            await cache_delete(favorites_key(user_id))
        except Exception:
            pass
        return favorite

    async def get_favorites(self, user_id: int) -> List[UserFoodFavorite]:
        statement = select(UserFoodFavorite).where(
            UserFoodFavorite.user_id == user_id
        ).order_by(col(UserFoodFavorite.created_at).desc())  # type: ignore
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def remove_favorite(self, user_id: int, food_id: int) -> bool:
        statement = select(UserFoodFavorite).where(
            UserFoodFavorite.user_id == user_id,
            UserFoodFavorite.food_id == food_id,
        )
        result = await self.session.execute(statement)
        favorite = result.scalars().first()
        if not favorite:
            return False
        await self.session.delete(favorite)
        await self.session.commit()
        try:
            await cache_delete(favorites_key(user_id))
        except Exception:
            pass
        return True

    # --- Catalog ---

    async def get_categories(self) -> List[str]:
        """Return all distinct non-null categories.  Cached for 1 hour."""
        cache_key = food_categories_key()
        try:
            cached = await cache_get(cache_key)
            if cached is not None:
                return cached
        except Exception:
            pass

        statement = (
            select(Food.category)
            .where(Food.category.isnot(None))  # type: ignore
            .distinct()
            .order_by(Food.category)  # type: ignore
        )
        result = await self.session.execute(statement)
        categories = [row for row in result.all() if row]

        try:
            await cache_set(cache_key, categories, CACHE_TTL["food_categories"])
        except Exception:
            pass

        return categories

    # --- Internal helpers ---

    @staticmethod
    def _build_filters(
        min_calories: Optional[float] = None,
        max_calories: Optional[float] = None,
        diet_type: Optional[str] = None,
        category: Optional[str] = None,
    ) -> list:
        """Build a list of SQLAlchemy filter conditions from optional parameters."""
        conditions = []
        if min_calories is not None:
            conditions.append(Food.calories >= min_calories)
        if max_calories is not None:
            conditions.append(Food.calories <= max_calories)
        if category is not None:
            conditions.append(Food.category.ilike(category))  # type: ignore
        if diet_type is not None:
            dt = diet_type.lower()
            if dt == "vegetarian":
                conditions.append(
                    or_(
                        Food.category.is_(None),  # type: ignore
                        ~Food.category.ilike("meat%"),  # type: ignore
                        ~Food.category.ilike("fish%"),  # type: ignore
                        ~Food.category.ilike("seafood%"),  # type: ignore
                    )
                )
            elif dt == "vegan":
                conditions.append(
                    or_(
                        Food.category.is_(None),  # type: ignore
                        ~Food.category.ilike("meat%"),  # type: ignore
                        ~Food.category.ilike("fish%"),  # type: ignore
                        ~Food.category.ilike("seafood%"),  # type: ignore
                        ~Food.category.ilike("dairy%"),  # type: ignore
                    )
                )
            elif dt == "keto":
                conditions.append(Food.carbs_g <= 10.0)
            elif dt == "low_fat":
                conditions.append(Food.fat_g <= 5.0)
            elif dt == "high_protein":
                conditions.append(Food.protein_g >= 15.0)
        return conditions

    @staticmethod
    def _sort_clause(sort_by: str):
        """Return an ORDER BY clause based on the sort_by parameter."""
        if sort_by == "calories":
            return Food.calories.asc()  # type: ignore
        elif sort_by == "calories_desc":
            return Food.calories.desc()  # type: ignore
        elif sort_by == "protein":
            return Food.protein_g.desc()  # type: ignore
        elif sort_by == "name":
            return Food.name.asc()  # type: ignore
        return Food.name.asc()  # type: ignore

    @staticmethod
    def _food_with_score(food: Food, score: float) -> dict:
        """Convert a Food model to a dict with an added relevance_score field."""
        return {
            "id": food.id,
            "name": food.name,
            "brand": food.brand,
            "category": food.category,
            "serving_size": food.serving_size,
            "serving_unit": food.serving_unit,
            "calories": food.calories,
            "protein_g": food.protein_g,
            "carbs_g": food.carbs_g,
            "fat_g": food.fat_g,
            "fiber_g": food.fiber_g,
            "sugar_g": food.sugar_g,
            "is_verified": food.is_verified,
            "created_by": food.created_by,
            "created_at": food.created_at.isoformat() if food.created_at else None,
            "relevance_score": score,
        }
