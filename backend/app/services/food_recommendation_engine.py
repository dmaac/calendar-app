"""
Food Recommendation Engine -- rule-based meal suggestions.

AI TOKEN COST: ZERO. This module is 100% rule-based.
Scores meals against the user's remaining daily macros and returns
personalized recommendations with Spanish explanations.

Features:
- Meal suggestions based on remaining daily calories and macros.
- Macro-balancing suggestions ("You need more protein -- try these").
- Time-based suggestions (breakfast items in morning, dinner at night).
- Dietary preference filtering from onboarding profile (vegetarian, keto, etc.).
- Variety scoring to avoid recommending the same meals repeatedly.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, time as dt_time, timedelta, timezone
from typing import Optional

from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..models.ai_food_log import AIFoodLog
from ..models.food_recommendation import (
    MealIngredient,
    MealTemplate,
    UserMealRecommendation,
)
from ..models.nutrition_profile import UserNutritionProfile
from ..models.onboarding_profile import OnboardingProfile

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Meal type detection by hour
# ---------------------------------------------------------------------------

_HOUR_TO_MEAL_TYPE: list[tuple[int, int, str]] = [
    (5, 10, "breakfast"),
    (11, 14, "lunch"),
    (15, 17, "snack"),
    (18, 22, "dinner"),
]


def _detect_meal_type() -> str:
    """Auto-detect meal type based on current hour."""
    hour = datetime.now().hour
    for start, end, meal_type in _HOUR_TO_MEAL_TYPE:
        if start <= hour <= end:
            return meal_type
    # Late night / early morning defaults
    if hour >= 23 or hour < 5:
        return "snack"
    return "lunch"


# ---------------------------------------------------------------------------
# User goals helpers (replicates logic from nutrition_risk_service)
# ---------------------------------------------------------------------------

_DEFAULT_GOALS = {
    "calories": 2000,
    "protein_g": 100,
    "fat_g": 65,
    "carbs_g": 250,
}


async def _get_user_goals(user_id: int, session: AsyncSession) -> dict:
    """Retrieve user daily macro goals from profile or onboarding."""
    result = await session.execute(
        select(UserNutritionProfile).where(UserNutritionProfile.user_id == user_id)
    )
    profile = result.first()
    if profile is not None:
        return {
            "calories": int(profile.target_calories),
            "protein_g": int(profile.target_protein_g),
            "fat_g": int(profile.target_fat_g),
            "carbs_g": int(profile.target_carbs_g),
        }

    result = await session.execute(
        select(OnboardingProfile).where(OnboardingProfile.user_id == user_id)
    )
    onboarding = result.first()
    if onboarding is not None:
        return {
            "calories": int(onboarding.daily_calories or 2000),
            "protein_g": int(onboarding.daily_protein_g or 100),
            "fat_g": int(onboarding.daily_fats_g or 65),
            "carbs_g": int(onboarding.daily_carbs_g or 250),
        }

    return dict(_DEFAULT_GOALS)


async def _get_today_totals(user_id: int, session: AsyncSession) -> dict:
    """Aggregate today's consumed macros from food logs."""
    today = date.today()
    day_start = datetime.combine(today, dt_time.min)
    day_end = datetime.combine(today, dt_time.max)

    result = await session.execute(
        select(
            func.coalesce(func.sum(AIFoodLog.calories), 0.0).label("calories"),
            func.coalesce(func.sum(AIFoodLog.protein_g), 0.0).label("protein_g"),
            func.coalesce(func.sum(AIFoodLog.fats_g), 0.0).label("fat_g"),
            func.coalesce(func.sum(AIFoodLog.carbs_g), 0.0).label("carbs_g"),
        ).where(
            AIFoodLog.user_id == user_id,
            AIFoodLog.logged_at >= day_start,
            AIFoodLog.logged_at <= day_end,
            AIFoodLog.deleted_at.is_(None),
        )
    )
    row = result.one()
    return {
        "calories": float(row.calories),
        "protein_g": float(row.protein_g),
        "fat_g": float(row.fat_g),
        "carbs_g": float(row.carbs_g),
    }


# ---------------------------------------------------------------------------
# Dietary preference helpers
# ---------------------------------------------------------------------------

# Maps onboarding diet_type values to MealTemplate category filters.
_DIET_CATEGORY_MAP: dict[str, list[str]] = {
    "vegetarian": ["vegetarian", "vegan", "general"],
    "vegan": ["vegan"],
    "keto": ["keto", "low_carb"],
    "low_carb": ["low_carb", "keto", "high_protein"],
    "high_protein": ["high_protein", "general"],
    "paleo": ["high_protein", "general"],
}

# Tags to exclude for certain diets
_DIET_EXCLUDE_TAGS: dict[str, list[str]] = {
    "vegetarian": ["carne", "pollo", "cerdo", "pescado", "res"],
    "vegan": ["carne", "pollo", "cerdo", "pescado", "res", "lacteo", "huevo", "queso", "leche"],
    "keto": ["alto_carb", "pasta", "pan", "arroz"],
    "low_carb": ["alto_carb", "pasta", "pan"],
}


async def _get_user_diet_type(user_id: int, session: AsyncSession) -> Optional[str]:
    """Retrieve the user's dietary preference from their onboarding profile."""
    result = await session.execute(
        select(OnboardingProfile.diet_type).where(OnboardingProfile.user_id == user_id)
    )
    row = result.first()
    if row and row.diet_type:
        return row.diet_type.lower().strip()
    return None


def _meal_matches_diet(meal: MealTemplate, diet_type: Optional[str]) -> bool:
    """Check if a meal template is compatible with the user's diet preference.

    Uses both category matching and tag exclusion to filter meals.
    """
    if not diet_type:
        return True  # no preference = everything is fine

    # Category check
    allowed_categories = _DIET_CATEGORY_MAP.get(diet_type)
    if allowed_categories and meal.category not in allowed_categories:
        # Also allow "general" for most diets unless strictly restricted
        if meal.category != "general" or diet_type == "vegan":
            pass  # category mismatch is a soft signal, not a hard filter

    # Tag exclusion check (hard filter)
    excluded_tags = _DIET_EXCLUDE_TAGS.get(diet_type, [])
    if excluded_tags and meal.tags:
        meal_tags = [t.strip().lower() for t in meal.tags.split(",")]
        for excluded in excluded_tags:
            if excluded in meal_tags:
                return False

    # Macro-based hard filters for specific diets
    if diet_type == "keto" and meal.carbs_g > 20:
        return False
    if diet_type == "low_carb" and meal.carbs_g > 40:
        return False

    return True


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------

def _score_meal(
    meal: MealTemplate,
    remaining: dict,
    recent_meal_ids: set[int],
    diet_type: Optional[str] = None,
) -> float:
    """
    Score a meal from 0 to 100.

    Weight distribution:
    - 35% protein match
    - 25% calorie match
    - 15% macro balance
    - 10% variety bonus (not recently recommended)
    - 10% diet compatibility
    -  5% time-appropriate difficulty (quick meals for snacks)
    """
    # --- Protein score (0-100) ---
    rem_prot = max(remaining["protein_g"], 1)
    prot_ratio = meal.protein_g / rem_prot
    protein_score = max(0, 100 - abs(1.0 - prot_ratio) * 100)

    # --- Calorie score (0-100) ---
    rem_cal = max(remaining["calories"], 1)
    cal_ratio = meal.calories / rem_cal
    calorie_score = max(0, 100 - abs(1.0 - cal_ratio) * 80)

    # --- Macro balance score ---
    total_macro_g = meal.protein_g + meal.carbs_g + meal.fat_g
    if total_macro_g > 0:
        prot_pct = meal.protein_g / total_macro_g
        balance_score = 100 if 0.15 <= prot_pct <= 0.45 else max(0, 60 - abs(0.30 - prot_pct) * 200)
    else:
        balance_score = 50

    # --- Variety bonus ---
    variety_score = 100 if meal.id not in recent_meal_ids else 30

    # --- Diet compatibility ---
    diet_score = 100
    if diet_type:
        allowed = _DIET_CATEGORY_MAP.get(diet_type, [])
        if allowed and meal.category in allowed:
            diet_score = 100
        elif meal.category == "general":
            diet_score = 70
        else:
            diet_score = 40

    # --- Difficulty / time appropriateness ---
    # Snacks should be quick (difficulty 1); complex meals acceptable for lunch/dinner
    meal_type = meal.meal_type
    if meal_type == "snack":
        diff_score = 100 if meal.difficulty == 1 else (60 if meal.difficulty == 2 else 30)
    elif meal_type == "breakfast":
        diff_score = 100 if meal.difficulty <= 2 else 50
    else:
        diff_score = 100 if meal.difficulty <= 2 else 80

    final = (
        protein_score * 0.35
        + calorie_score * 0.25
        + balance_score * 0.15
        + variety_score * 0.10
        + diet_score * 0.10
        + diff_score * 0.05
    )
    return round(min(100, max(0, final)), 2)


# ---------------------------------------------------------------------------
# Explanation generator (rule-based, no AI)
# ---------------------------------------------------------------------------

def _generate_explanation(
    remaining: dict,
    meal: MealTemplate,
    diet_type: Optional[str] = None,
) -> str:
    """Generate a Spanish explanation for why this meal is recommended."""
    rem_prot = remaining["protein_g"]
    rem_cal = remaining["calories"]
    rem_carbs = remaining["carbs_g"]
    rem_fat = remaining["fat_g"]

    # High protein need
    if rem_prot > 20 and meal.protein_g >= 15:
        return (
            f"Te faltan {int(rem_prot)}g de proteina hoy. "
            f"Esta comida aporta {int(meal.protein_g)}g."
        )

    # High calorie need
    if rem_cal > 400:
        return (
            f"Te faltan {int(rem_cal)} kcal para llegar a tu meta. "
            f"Esta opcion te acerca a tu objetivo."
        )

    # Carb need
    if rem_carbs > 30 and meal.carbs_g >= 20:
        return (
            f"Te faltan {int(rem_carbs)}g de carbohidratos. "
            f"Esta comida aporta {int(meal.carbs_g)}g."
        )

    # Fat need
    if rem_fat > 15 and meal.fat_g >= 10:
        return (
            f"Te faltan {int(rem_fat)}g de grasas saludables. "
            f"Esta opcion aporta {int(meal.fat_g)}g."
        )

    # Moderate calorie gap
    if rem_cal > 200:
        return f"Aun te faltan {int(rem_cal)} kcal. Buena opcion para avanzar."

    # Almost at goal
    if 0 < rem_cal <= 200:
        return "Ya casi llegas a tu meta. Esta es una opcion ligera para cerrar el dia."

    # Diet-aware fallback
    if diet_type:
        diet_labels = {
            "vegetarian": "vegetariana",
            "vegan": "vegana",
            "keto": "keto",
            "low_carb": "baja en carbohidratos",
            "high_protein": "alta en proteina",
            "paleo": "paleo",
        }
        label = diet_labels.get(diet_type, diet_type)
        return f"Buena opcion {label} para completar tu dia."

    return "Buena opcion para completar tu dia."


# ---------------------------------------------------------------------------
# Macro-balancing advice
# ---------------------------------------------------------------------------

def _generate_macro_advice(remaining: dict, goals: dict) -> list[dict]:
    """Generate actionable macro-balancing tips based on remaining needs.

    Returns a list of advice dicts with macro, deficit, percentage, and message.
    Sorted by urgency (largest percentage deficit first).
    """
    advice = []

    for macro, unit in [("protein_g", "g"), ("carbs_g", "g"), ("fat_g", "g")]:
        goal_val = goals.get(macro, 0)
        rem_val = remaining.get(macro, 0)
        if goal_val <= 0:
            continue

        pct_remaining = (rem_val / goal_val) * 100

        label_map = {
            "protein_g": ("proteina", "Busca carnes, huevos, legumbres o lacteos."),
            "carbs_g": ("carbohidratos", "Prueba arroz, pasta, frutas o pan integral."),
            "fat_g": ("grasas", "Agrega aguacate, frutos secos o aceite de oliva."),
        }
        label, suggestion = label_map.get(macro, (macro, ""))

        if pct_remaining > 40:
            advice.append({
                "macro": macro,
                "label": label,
                "deficit_g": int(rem_val),
                "deficit_pct": round(pct_remaining, 1),
                "urgency": "high",
                "message": f"Te falta {int(rem_val)}{unit} de {label} ({int(pct_remaining)}% de tu meta). {suggestion}",
            })
        elif pct_remaining > 20:
            advice.append({
                "macro": macro,
                "label": label,
                "deficit_g": int(rem_val),
                "deficit_pct": round(pct_remaining, 1),
                "urgency": "medium",
                "message": f"Aun te faltan {int(rem_val)}{unit} de {label}. {suggestion}",
            })

    # Sort by urgency: high first, then by deficit percentage
    urgency_order = {"high": 0, "medium": 1, "low": 2}
    advice.sort(key=lambda a: (urgency_order.get(a["urgency"], 2), -a["deficit_pct"]))

    return advice


# ---------------------------------------------------------------------------
# Recent recommendations (for variety scoring)
# ---------------------------------------------------------------------------

async def _get_recent_recommendation_ids(
    user_id: int, session: AsyncSession, days: int = 3
) -> set[int]:
    """Get meal IDs recommended in the last N days."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    result = await session.execute(
        select(UserMealRecommendation.meal_id).where(
            UserMealRecommendation.user_id == user_id,
            UserMealRecommendation.created_at >= since,
        )
    )
    return {row[0] for row in result.all()}


# ---------------------------------------------------------------------------
# Main recommendation function
# ---------------------------------------------------------------------------

async def get_meal_recommendations(
    user_id: int,
    session: AsyncSession,
    meal_type: Optional[str] = None,
    limit: int = 5,
) -> dict:
    """
    Get personalized meal recommendations for a user.

    1. Get user's daily targets and dietary preferences from onboarding.
    2. Get today's consumed totals.
    3. Calculate remaining macros.
    4. Auto-detect meal_type from current hour if not provided.
    5. Query MealTemplate filtered by meal_type and calorie ceiling.
    6. Filter by dietary preferences (vegetarian, keto, etc.).
    7. Score each meal with diet-aware scoring.
    8. Generate macro-balancing advice.
    9. Return top N with explanation in Spanish.
    """
    # 1. Goals, consumed, and diet preference
    goals = await _get_user_goals(user_id, session)
    consumed = await _get_today_totals(user_id, session)
    diet_type = await _get_user_diet_type(user_id, session)

    # 2. Remaining
    remaining = {
        "calories": max(0, goals["calories"] - consumed["calories"]),
        "protein_g": max(0, goals["protein_g"] - consumed["protein_g"]),
        "fat_g": max(0, goals["fat_g"] - consumed["fat_g"]),
        "carbs_g": max(0, goals["carbs_g"] - consumed["carbs_g"]),
    }

    # 3. Auto-detect meal type
    if not meal_type:
        meal_type = _detect_meal_type()

    # 4. Query candidate meals
    max_calories = int(remaining["calories"] * 1.2) if remaining["calories"] > 50 else 500
    stmt = (
        select(MealTemplate)
        .where(
            MealTemplate.meal_type == meal_type,
            MealTemplate.is_active == True,  # noqa: E712
            MealTemplate.calories <= max_calories,
        )
    )
    result = await session.execute(stmt)
    candidates = result.all()

    if not candidates:
        # Fallback: loosen calorie filter
        stmt = (
            select(MealTemplate)
            .where(
                MealTemplate.meal_type == meal_type,
                MealTemplate.is_active == True,  # noqa: E712
            )
            .order_by(MealTemplate.calories)
            .limit(limit * 2)
        )
        result = await session.execute(stmt)
        candidates = result.all()

    if not candidates:
        # Second fallback: try any meal type
        stmt = (
            select(MealTemplate)
            .where(MealTemplate.is_active == True)  # noqa: E712
            .order_by(MealTemplate.calories)
            .limit(limit * 3)
        )
        result = await session.execute(stmt)
        candidates = result.all()

    if not candidates:
        return {
            "meal_type": meal_type,
            "remaining": remaining,
            "goals": goals,
            "consumed": consumed,
            "diet_type": diet_type,
            "recommendations": [],
            "macro_advice": _generate_macro_advice(remaining, goals),
            "message": "No hay comidas disponibles para este tipo de comida.",
        }

    # 5. Filter by dietary preferences
    if diet_type:
        diet_filtered = [m for m in candidates if _meal_matches_diet(m, diet_type)]
        # Keep at least some candidates even if diet filter is strict
        if len(diet_filtered) >= 3:
            candidates = diet_filtered
        elif diet_filtered:
            # Mix diet-compatible meals with general options
            candidates = diet_filtered + [m for m in candidates if m not in diet_filtered][:limit]
        # else: keep all candidates (better to show something than nothing)

    # 6. Score meals
    recent_ids = await _get_recent_recommendation_ids(user_id, session)
    scored = []
    for meal in candidates:
        score = _score_meal(meal, remaining, recent_ids, diet_type)
        explanation = _generate_explanation(remaining, meal, diet_type)
        scored.append((meal, score, explanation))

    scored.sort(key=lambda x: x[1], reverse=True)
    top_meals = scored[:limit]

    # 7. Build response
    recommendations = []
    for meal, score, explanation in top_meals:
        ing_result = await session.execute(
            select(MealIngredient).where(MealIngredient.meal_id == meal.id)
        )
        ingredients = ing_result.all()

        recommendations.append({
            "meal_id": meal.id,
            "name": meal.name,
            "description": meal.description,
            "meal_type": meal.meal_type,
            "calories": meal.calories,
            "protein_g": meal.protein_g,
            "carbs_g": meal.carbs_g,
            "fat_g": meal.fat_g,
            "fiber_g": meal.fiber_g,
            "difficulty": meal.difficulty,
            "prep_time_min": meal.prep_time_min,
            "category": meal.category,
            "tags": meal.tags.split(",") if meal.tags else [],
            "score": score,
            "reason": explanation,
            "ingredients": [
                {
                    "food_name": ing.food_name,
                    "quantity_grams": ing.quantity_grams,
                    "calories": ing.calories,
                    "protein_g": ing.protein_g,
                    "carbs_g": ing.carbs_g,
                    "fat_g": ing.fat_g,
                }
                for ing in ingredients
            ],
        })

    # 8. Generate macro-balancing advice
    macro_advice = _generate_macro_advice(remaining, goals)

    return {
        "meal_type": meal_type,
        "remaining": remaining,
        "goals": goals,
        "consumed": consumed,
        "diet_type": diet_type,
        "recommendations": recommendations,
        "macro_advice": macro_advice,
    }


# ---------------------------------------------------------------------------
# Macro-specific meal suggestions
# ---------------------------------------------------------------------------

async def get_macro_focused_suggestions(
    user_id: int,
    session: AsyncSession,
    target_macro: str = "protein_g",
    limit: int = 5,
) -> dict:
    """Get meal suggestions specifically to fill a macro deficit.

    Unlike get_meal_recommendations which balances all macros, this function
    finds meals that are rich in a specific macro the user is behind on.

    target_macro: "protein_g", "carbs_g", or "fat_g"
    """
    valid_macros = {"protein_g", "carbs_g", "fat_g"}
    if target_macro not in valid_macros:
        target_macro = "protein_g"

    goals = await _get_user_goals(user_id, session)
    consumed = await _get_today_totals(user_id, session)
    diet_type = await _get_user_diet_type(user_id, session)

    remaining = {
        "calories": max(0, goals["calories"] - consumed["calories"]),
        "protein_g": max(0, goals["protein_g"] - consumed["protein_g"]),
        "fat_g": max(0, goals["fat_g"] - consumed["fat_g"]),
        "carbs_g": max(0, goals["carbs_g"] - consumed["carbs_g"]),
    }

    # Map macro to MealTemplate column for ordering
    macro_column_map = {
        "protein_g": MealTemplate.protein_g,
        "carbs_g": MealTemplate.carbs_g,
        "fat_g": MealTemplate.fat_g,
    }
    order_col = macro_column_map[target_macro]

    max_cal = int(remaining["calories"] * 1.2) if remaining["calories"] > 100 else 800

    stmt = (
        select(MealTemplate)
        .where(
            MealTemplate.is_active == True,  # noqa: E712
            MealTemplate.calories <= max_cal,
        )
        .order_by(order_col.desc())  # type: ignore
        .limit(limit * 3)
    )
    result = await session.execute(stmt)
    candidates = result.all()

    # Filter by diet and pick top matches
    if diet_type:
        candidates = [m for m in candidates if _meal_matches_diet(m, diet_type)] or candidates

    # Sort by the target macro descending
    candidates.sort(key=lambda m: getattr(m, target_macro, 0), reverse=True)
    top = candidates[:limit]

    macro_label_map = {
        "protein_g": "proteina",
        "carbs_g": "carbohidratos",
        "fat_g": "grasas",
    }
    macro_label = macro_label_map.get(target_macro, target_macro)

    suggestions = []
    for meal in top:
        macro_val = getattr(meal, target_macro, 0)
        suggestions.append({
            "meal_id": meal.id,
            "name": meal.name,
            "description": meal.description,
            "meal_type": meal.meal_type,
            "calories": meal.calories,
            "protein_g": meal.protein_g,
            "carbs_g": meal.carbs_g,
            "fat_g": meal.fat_g,
            "fiber_g": meal.fiber_g,
            "category": meal.category,
            "target_macro_value": macro_val,
            "reason": (
                f"Alta en {macro_label}: {int(macro_val)}g. "
                f"Te faltan {int(remaining[target_macro])}g para tu meta."
            ),
        })

    return {
        "target_macro": target_macro,
        "target_macro_label": macro_label,
        "deficit_g": int(remaining[target_macro]),
        "deficit_pct": round(
            (remaining[target_macro] / max(goals[target_macro], 1)) * 100, 1
        ),
        "diet_type": diet_type,
        "remaining": remaining,
        "goals": goals,
        "suggestions": suggestions,
        "macro_advice": _generate_macro_advice(remaining, goals),
    }


# ---------------------------------------------------------------------------
# Time-based quick suggestions
# ---------------------------------------------------------------------------

async def get_time_based_suggestions(
    user_id: int,
    session: AsyncSession,
    limit: int = 3,
) -> dict:
    """Get quick meal suggestions appropriate for the current time of day.

    Applies time-based heuristics:
    - Morning (5-10): light/moderate breakfast options, quick prep.
    - Midday (11-14): substantial lunch options.
    - Afternoon (15-17): light snacks.
    - Evening (18-22): dinner options.
    - Late night (23-4): very light snacks only.

    Meals are filtered by calorie budget and dietary preference.
    """
    meal_type = _detect_meal_type()
    hour = datetime.now().hour

    goals = await _get_user_goals(user_id, session)
    consumed = await _get_today_totals(user_id, session)
    diet_type = await _get_user_diet_type(user_id, session)

    remaining_cal = max(0, goals["calories"] - consumed["calories"])

    # Time-based calorie budget per meal type
    budget_map = {
        "breakfast": min(remaining_cal * 0.30, 500),
        "lunch": min(remaining_cal * 0.40, 800),
        "snack": min(remaining_cal * 0.15, 300),
        "dinner": min(remaining_cal * 0.35, 700),
    }
    calorie_budget = int(budget_map.get(meal_type, 400))
    if calorie_budget < 50:
        calorie_budget = 200  # minimum to show something

    # Difficulty preference by time
    max_difficulty = 3
    if meal_type == "snack":
        max_difficulty = 1
    elif meal_type == "breakfast":
        max_difficulty = 2
    elif hour >= 21:
        max_difficulty = 2  # late dinner = simpler prep

    stmt = (
        select(MealTemplate)
        .where(
            MealTemplate.meal_type == meal_type,
            MealTemplate.is_active == True,  # noqa: E712
            MealTemplate.calories <= calorie_budget,
            MealTemplate.difficulty <= max_difficulty,
        )
        .order_by(MealTemplate.calories)
        .limit(limit * 3)
    )
    result = await session.execute(stmt)
    candidates = result.all()

    # Fallback if too few results
    if len(candidates) < limit:
        fallback_stmt = (
            select(MealTemplate)
            .where(
                MealTemplate.meal_type == meal_type,
                MealTemplate.is_active == True,  # noqa: E712
            )
            .order_by(MealTemplate.calories)
            .limit(limit * 2)
        )
        fallback_result = await session.execute(fallback_stmt)
        seen_ids = {c.id for c in candidates}
        for m in fallback_result.all():
            if m.id not in seen_ids:
                candidates.append(m)
                seen_ids.add(m.id)

    # Diet filter
    if diet_type:
        filtered = [m for m in candidates if _meal_matches_diet(m, diet_type)]
        if filtered:
            candidates = filtered

    # Time labels in Spanish
    time_label_map = {
        "breakfast": "desayuno",
        "lunch": "almuerzo",
        "snack": "snack",
        "dinner": "cena",
    }
    time_label = time_label_map.get(meal_type, meal_type)

    suggestions = []
    for meal in candidates[:limit]:
        suggestions.append({
            "meal_id": meal.id,
            "name": meal.name,
            "description": meal.description,
            "meal_type": meal.meal_type,
            "calories": meal.calories,
            "protein_g": meal.protein_g,
            "carbs_g": meal.carbs_g,
            "fat_g": meal.fat_g,
            "difficulty": meal.difficulty,
            "prep_time_min": meal.prep_time_min,
            "category": meal.category,
            "reason": f"Ideal para tu {time_label}. {int(meal.calories)} kcal, listo en {meal.prep_time_min} min.",
        })

    return {
        "current_hour": hour,
        "detected_meal_type": meal_type,
        "time_label": time_label,
        "calorie_budget": calorie_budget,
        "remaining_calories": int(remaining_cal),
        "diet_type": diet_type,
        "suggestions": suggestions,
    }


# ---------------------------------------------------------------------------
# Browse meals (public catalog)
# ---------------------------------------------------------------------------

async def browse_meals(
    session: AsyncSession,
    meal_type: Optional[str] = None,
    category: Optional[str] = None,
    min_protein: Optional[float] = None,
    max_calories: Optional[int] = None,
    page: int = 1,
    limit: int = 20,
) -> dict:
    """Browse meal templates with filters and pagination."""
    stmt = select(MealTemplate).where(MealTemplate.is_active == True)  # noqa: E712

    if meal_type:
        stmt = stmt.where(MealTemplate.meal_type == meal_type)
    if category:
        stmt = stmt.where(MealTemplate.category == category)
    if min_protein is not None:
        stmt = stmt.where(MealTemplate.protein_g >= min_protein)
    if max_calories is not None:
        stmt = stmt.where(MealTemplate.calories <= max_calories)

    # Count total
    count_stmt = select(func.count()).select_from(stmt.subquery())
    count_result = await session.execute(count_stmt)
    total = count_result.scalar() or 0

    # Paginate
    offset = (page - 1) * limit
    stmt = stmt.order_by(MealTemplate.name).offset(offset).limit(limit)
    result = await session.execute(stmt)
    meals = result.all()

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit if limit > 0 else 0,
        "meals": [
            {
                "id": m.id,
                "name": m.name,
                "description": m.description,
                "meal_type": m.meal_type,
                "calories": m.calories,
                "protein_g": m.protein_g,
                "carbs_g": m.carbs_g,
                "fat_g": m.fat_g,
                "fiber_g": m.fiber_g,
                "difficulty": m.difficulty,
                "prep_time_min": m.prep_time_min,
                "category": m.category,
                "tags": m.tags.split(",") if m.tags else [],
            }
            for m in meals
        ],
    }


# ---------------------------------------------------------------------------
# Log recommendation choice
# ---------------------------------------------------------------------------

async def log_recommendation_choice(
    user_id: int,
    meal_id: int,
    session: AsyncSession,
) -> dict:
    """Log that a user chose a recommended meal."""
    result = await session.execute(
        select(MealTemplate).where(MealTemplate.id == meal_id)
    )
    meal = result.first()
    if not meal:
        return {"error": "Comida no encontrada"}

    recommendation = UserMealRecommendation(
        user_id=user_id,
        meal_id=meal_id,
        reason="user_selected",
        score=0,
        meal_type_context=meal.meal_type,
    )
    session.add(recommendation)
    await session.commit()
    await session.refresh(recommendation)

    return {
        "id": recommendation.id,
        "meal_id": meal_id,
        "meal_name": meal.name,
        "logged": True,
    }
