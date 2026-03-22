from difflib import SequenceMatcher
from typing import List, Optional, Tuple

from sqlmodel import select, func, col, or_
from sqlmodel.ext.asyncio.session import AsyncSession

from ..models.food import Food, FoodCreate, FoodUpdate
from ..models.meal_log import MealLog
from ..models.user_food_favorite import UserFoodFavorite


# Minimum similarity ratio for fuzzy matches (0.0 - 1.0)
_FUZZY_THRESHOLD = 0.45


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

    # Take the best of the two strategies
    return max(full_ratio, best_word)


class FoodService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_food_by_id(self, food_id: int) -> Optional[Food]:
        return await self.session.get(Food, food_id)

    async def get_foods_by_ids(self, food_ids: List[int]) -> dict:
        """Batch-load foods by a list of IDs. Returns a dict mapping food_id -> Food."""
        if not food_ids:
            return {}
        statement = select(Food).where(col(Food.id).in_(food_ids))  # type: ignore
        result = await self.session.exec(statement)
        return {food.id: food for food in result.all()}

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
        Fuzzy matching: if the ILIKE query returns few results, falls back to
        Python-side difflib matching so typos like "poyo" find "pollo".
        """
        # SEC: Escape SQL LIKE wildcards in user input to prevent wildcard injection
        escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"

        # Build base filter conditions
        conditions = [Food.name.ilike(pattern)]  # type: ignore
        extra_conditions = self._build_filters(min_calories, max_calories, diet_type)

        # --- Exact / ILIKE search first ---
        count_stmt = (
            select(func.count())
            .select_from(Food)
            .where(*conditions, *extra_conditions)
        )
        total_result = await self.session.exec(count_stmt)
        total = total_result.one()

        order_clause = self._sort_clause(sort_by)
        statement = (
            select(Food)
            .where(*conditions, *extra_conditions)
            .order_by(order_clause)
            .offset(offset)
            .limit(limit)
        )
        result = await self.session.exec(statement)
        ilike_items = list(result.all())

        # If ILIKE returned enough results, score them and return
        if total > 0:
            scored = []
            for food in ilike_items:
                score = _fuzzy_score(query, food.name)
                scored.append(self._food_with_score(food, round(score, 3)))
            scored.sort(key=lambda x: x["relevance_score"], reverse=True)
            return scored, total

        # --- Fuzzy fallback: load candidates from DB and match in Python ---
        fuzzy_stmt = select(Food)
        if extra_conditions:
            fuzzy_stmt = fuzzy_stmt.where(*extra_conditions)
        # Limit candidate pool to avoid loading the entire table
        fuzzy_stmt = fuzzy_stmt.limit(2000)
        fuzzy_result = await self.session.exec(fuzzy_stmt)
        candidates = list(fuzzy_result.all())

        scored_candidates = []
        for food in candidates:
            score = _fuzzy_score(query, food.name)
            if score >= _FUZZY_THRESHOLD:
                scored_candidates.append((food, score))

        # Sort by score descending
        scored_candidates.sort(key=lambda x: x[1], reverse=True)
        total_fuzzy = len(scored_candidates)

        # Apply offset/limit
        page = scored_candidates[offset : offset + limit]
        items = [
            self._food_with_score(food, round(score, 3)) for food, score in page
        ]
        return items, total_fuzzy

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
        total_result = await self.session.exec(count_stmt)
        total = total_result.one()

        order_clause = self._sort_clause(sort_by)
        statement = select(Food).order_by(order_clause).offset(offset).limit(limit)
        if extra_conditions:
            statement = select(Food).where(*extra_conditions).order_by(order_clause).offset(offset).limit(limit)
        result = await self.session.exec(statement)
        items = list(result.all())
        return items, total

    async def create_food(self, food_create: FoodCreate, created_by: Optional[int] = None) -> Food:
        food = Food(**food_create.dict(), created_by=created_by)
        self.session.add(food)
        await self.session.commit()
        await self.session.refresh(food)
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

        return food

    async def delete_food(self, food_id: int) -> bool:
        food = await self.session.get(Food, food_id)
        if not food:
            return False
        await self.session.delete(food)
        await self.session.commit()
        return True

    # --- Favorites ---

    async def add_favorite(self, user_id: int, food_id: int) -> UserFoodFavorite:
        # Check if already favorited
        statement = select(UserFoodFavorite).where(
            UserFoodFavorite.user_id == user_id,
            UserFoodFavorite.food_id == food_id,
        )
        result = await self.session.exec(statement)
        existing = result.first()
        if existing:
            return existing

        favorite = UserFoodFavorite(user_id=user_id, food_id=food_id)
        self.session.add(favorite)
        await self.session.commit()
        await self.session.refresh(favorite)
        return favorite

    async def get_favorites(self, user_id: int) -> List[UserFoodFavorite]:
        statement = select(UserFoodFavorite).where(
            UserFoodFavorite.user_id == user_id
        ).order_by(col(UserFoodFavorite.created_at).desc())  # type: ignore
        result = await self.session.exec(statement)
        return list(result.all())

    async def remove_favorite(self, user_id: int, food_id: int) -> bool:
        statement = select(UserFoodFavorite).where(
            UserFoodFavorite.user_id == user_id,
            UserFoodFavorite.food_id == food_id,
        )
        result = await self.session.exec(statement)
        favorite = result.first()
        if not favorite:
            return False
        await self.session.delete(favorite)
        await self.session.commit()
        return True

    # --- Recents ---

    async def get_recent_foods(self, user_id: int, limit: int = 20) -> List[Food]:
        """Get the last N distinct foods the user logged, ordered by most recent."""
        # Get distinct food_ids ordered by most recent meal log
        statement = (
            select(MealLog.food_id, func.max(MealLog.created_at).label("last_used"))
            .where(MealLog.user_id == user_id)
            .group_by(MealLog.food_id)
            .order_by(func.max(MealLog.created_at).desc())
            .limit(limit)
        )
        result = await self.session.exec(statement)
        results = result.all()
        food_ids = [row[0] for row in results]

        if not food_ids:
            return []

        # Fetch the food objects
        foods_stmt = select(Food).where(col(Food.id).in_(food_ids))  # type: ignore
        foods_result = await self.session.exec(foods_stmt)
        foods = list(foods_result.all())

        # Preserve the order from the original query
        food_map = {f.id: f for f in foods}
        return [food_map[fid] for fid in food_ids if fid in food_map]

    # --- Catalog ---

    async def get_categories(self) -> List[str]:
        """Return all distinct non-null categories."""
        statement = (
            select(Food.category)
            .where(Food.category.isnot(None))  # type: ignore
            .distinct()
            .order_by(Food.category)  # type: ignore
        )
        result = await self.session.exec(statement)
        return [row for row in result.all() if row]

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
                # Exclude known meat/fish categories
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
        # Default: name ascending (relevance sorting is done in Python)
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
