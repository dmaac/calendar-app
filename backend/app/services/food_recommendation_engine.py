"""
Food Recommendation Engine — rule-based meal suggestions.

AI TOKEN COST: ZERO. This module is 100% rule-based.
Scores meals against the user's remaining daily macros and returns
personalized recommendations with Spanish explanations.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, time as dt_time, timedelta
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
    result = await session.exec(
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

    result = await session.exec(
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
# Scoring
# ---------------------------------------------------------------------------

def _score_meal(meal: MealTemplate, remaining: dict, recent_meal_ids: set[int]) -> float:
    """
    Score a meal from 0 to 100.
    - 40% protein match
    - 30% calorie match
    - 15% macro balance
    - 15% variety bonus (not recently recommended)
    """
    # Protein score (0-100): how well meal protein fills the remaining need
    rem_prot = max(remaining["protein_g"], 1)
    prot_ratio = meal.protein_g / rem_prot
    protein_score = max(0, 100 - abs(1.0 - prot_ratio) * 100)

    # Calorie score (0-100): how well meal calories fill the remaining need
    rem_cal = max(remaining["calories"], 1)
    cal_ratio = meal.calories / rem_cal
    calorie_score = max(0, 100 - abs(1.0 - cal_ratio) * 80)

    # Macro balance score: penalize if meal is extremely skewed
    total_macro_g = meal.protein_g + meal.carbs_g + meal.fat_g
    if total_macro_g > 0:
        prot_pct = meal.protein_g / total_macro_g
        balance_score = 100 if 0.15 <= prot_pct <= 0.45 else max(0, 60 - abs(0.30 - prot_pct) * 200)
    else:
        balance_score = 50

    # Variety bonus: meals not recently recommended get a boost
    variety_score = 100 if meal.id not in recent_meal_ids else 30

    final = (
        protein_score * 0.40
        + calorie_score * 0.30
        + balance_score * 0.15
        + variety_score * 0.15
    )
    return round(min(100, max(0, final)), 2)


# ---------------------------------------------------------------------------
# Explanation generator (rule-based, no AI)
# ---------------------------------------------------------------------------

def _generate_explanation(remaining: dict, meal: MealTemplate) -> str:
    """Generate a Spanish explanation for why this meal is recommended."""
    rem_prot = remaining["protein_g"]
    rem_cal = remaining["calories"]
    rem_carbs = remaining["carbs_g"]

    if rem_prot > 20 and meal.protein_g >= 15:
        return (
            f"Te faltan {int(rem_prot)}g de proteina hoy. "
            f"Esta comida aporta {int(meal.protein_g)}g."
        )
    if rem_cal > 400:
        return (
            f"Te faltan {int(rem_cal)} kcal para llegar a tu meta. "
            f"Esta opcion te acerca a tu objetivo."
        )
    if rem_carbs > 30 and meal.carbs_g >= 20:
        return (
            f"Te faltan {int(rem_carbs)}g de carbohidratos. "
            f"Esta comida aporta {int(meal.carbs_g)}g."
        )
    if rem_cal > 200:
        return f"Aun te faltan {int(rem_cal)} kcal. Buena opcion para avanzar."
    if rem_cal <= 200 and rem_cal > 0:
        return "Ya casi llegas a tu meta. Esta es una opcion ligera para cerrar el dia."
    return "Buena opcion para completar tu dia."


# ---------------------------------------------------------------------------
# Recent recommendations (for variety scoring)
# ---------------------------------------------------------------------------

async def _get_recent_recommendation_ids(
    user_id: int, session: AsyncSession, days: int = 3
) -> set[int]:
    """Get meal IDs recommended in the last N days."""
    since = datetime.utcnow() - timedelta(days=days)
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

    1. Get user's daily targets
    2. Get today's consumed totals
    3. Calculate remaining macros
    4. Auto-detect meal_type from current hour if not provided
    5. Query MealTemplate filtered by meal_type and calories <= remaining * 1.2
    6. Score each meal
    7. Return top N with explanation in Spanish
    """
    # 1. Goals and consumed
    goals = await _get_user_goals(user_id, session)
    consumed = await _get_today_totals(user_id, session)

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
    result = await session.exec(stmt)
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
        result = await session.exec(stmt)
        candidates = result.all()

    if not candidates:
        return {
            "meal_type": meal_type,
            "remaining": remaining,
            "goals": goals,
            "consumed": consumed,
            "recommendations": [],
            "message": "No hay comidas disponibles para este tipo de comida.",
        }

    # 5. Score meals
    recent_ids = await _get_recent_recommendation_ids(user_id, session)
    scored = []
    for meal in candidates:
        score = _score_meal(meal, remaining, recent_ids)
        explanation = _generate_explanation(remaining, meal)
        scored.append((meal, score, explanation))

    # Sort by score descending
    scored.sort(key=lambda x: x[1], reverse=True)
    top_meals = scored[:limit]

    # 6. Build response
    recommendations = []
    for meal, score, explanation in top_meals:
        # Fetch ingredients
        ing_result = await session.exec(
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

    return {
        "meal_type": meal_type,
        "remaining": remaining,
        "goals": goals,
        "consumed": consumed,
        "recommendations": recommendations,
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
    result = await session.exec(stmt)
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
    # Verify meal exists
    result = await session.exec(
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
