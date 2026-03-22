"""
Food Recommendation Service
----------------------------
Analyzes a user's food history to recommend meals based on nutritional patterns.

Logic:
- If user consistently eats high protein -> recommend more high-protein meals
- If user is low on fiber -> suggest fruits and vegetables
- If user is low on water -> suggest hydrating foods
- If user exceeds calorie targets -> suggest lighter alternatives

All recommendations are data-driven from the last 7 days of food logs.
"""

import logging
from datetime import date, datetime, time as dt_time, timedelta
from typing import List, Optional

from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..models.ai_food_log import AIFoodLog
from ..models.onboarding_profile import OnboardingProfile
from ..models.nutrition_profile import UserNutritionProfile

logger = logging.getLogger(__name__)


# Pre-defined food suggestions by category
HIGH_PROTEIN_FOODS = [
    {"name": "Pechuga de pollo a la plancha", "calories": 165, "protein_g": 31, "carbs_g": 0, "fats_g": 3.6, "fiber_g": 0},
    {"name": "Huevos revueltos (3 unidades)", "calories": 210, "protein_g": 18, "carbs_g": 2, "fats_g": 15, "fiber_g": 0},
    {"name": "Salmon al horno", "calories": 208, "protein_g": 28, "carbs_g": 0, "fats_g": 10, "fiber_g": 0},
    {"name": "Yogur griego con nueces", "calories": 180, "protein_g": 15, "carbs_g": 10, "fats_g": 8, "fiber_g": 1},
    {"name": "Atun en agua con ensalada", "calories": 150, "protein_g": 25, "carbs_g": 5, "fats_g": 2, "fiber_g": 2},
    {"name": "Tofu salteado con verduras", "calories": 190, "protein_g": 16, "carbs_g": 8, "fats_g": 10, "fiber_g": 3},
]

HIGH_FIBER_FOODS = [
    {"name": "Ensalada de quinoa y garbanzos", "calories": 280, "protein_g": 12, "carbs_g": 40, "fats_g": 8, "fiber_g": 10},
    {"name": "Avena con chia y frutos rojos", "calories": 250, "protein_g": 8, "carbs_g": 38, "fats_g": 7, "fiber_g": 9},
    {"name": "Manzana con mantequilla de almendras", "calories": 200, "protein_g": 5, "carbs_g": 25, "fats_g": 10, "fiber_g": 6},
    {"name": "Lentejas guisadas", "calories": 230, "protein_g": 18, "carbs_g": 35, "fats_g": 1, "fiber_g": 12},
    {"name": "Brocoli al vapor con hummus", "calories": 150, "protein_g": 8, "carbs_g": 18, "fats_g": 6, "fiber_g": 8},
    {"name": "Pera con semillas de girasol", "calories": 160, "protein_g": 4, "carbs_g": 28, "fats_g": 5, "fiber_g": 7},
]

LOW_CALORIE_FOODS = [
    {"name": "Ensalada mediterranea", "calories": 180, "protein_g": 8, "carbs_g": 15, "fats_g": 10, "fiber_g": 4},
    {"name": "Sopa de verduras", "calories": 120, "protein_g": 5, "carbs_g": 18, "fats_g": 3, "fiber_g": 5},
    {"name": "Wrap de lechuga con pollo", "calories": 160, "protein_g": 20, "carbs_g": 5, "fats_g": 7, "fiber_g": 2},
    {"name": "Ceviche de pescado", "calories": 140, "protein_g": 22, "carbs_g": 8, "fats_g": 2, "fiber_g": 1},
    {"name": "Gazpacho", "calories": 90, "protein_g": 2, "carbs_g": 12, "fats_g": 4, "fiber_g": 2},
    {"name": "Poke bowl ligero", "calories": 200, "protein_g": 18, "carbs_g": 22, "fats_g": 5, "fiber_g": 3},
]

BALANCED_FOODS = [
    {"name": "Bowl de arroz integral con pollo y verduras", "calories": 350, "protein_g": 25, "carbs_g": 40, "fats_g": 8, "fiber_g": 5},
    {"name": "Tortilla de espinaca con pan integral", "calories": 300, "protein_g": 18, "carbs_g": 28, "fats_g": 12, "fiber_g": 4},
    {"name": "Pasta integral con salsa de tomate y atun", "calories": 380, "protein_g": 22, "carbs_g": 48, "fats_g": 8, "fiber_g": 6},
    {"name": "Burrito bowl con frijoles y aguacate", "calories": 400, "protein_g": 16, "carbs_g": 45, "fats_g": 15, "fiber_g": 10},
]


async def _get_user_targets(user_id: int, session: AsyncSession) -> dict:
    """Fetch nutrition targets from profile or onboarding."""
    result = await session.execute(
        select(UserNutritionProfile).where(UserNutritionProfile.user_id == user_id)
    )
    profile = result.scalar_one_or_none()

    if profile:
        return {
            "target_calories": profile.target_calories or 2000,
            "target_protein_g": profile.target_protein_g or 150,
            "target_carbs_g": profile.target_carbs_g or 200,
            "target_fat_g": profile.target_fat_g or 65,
        }

    result = await session.execute(
        select(OnboardingProfile).where(OnboardingProfile.user_id == user_id)
    )
    onboarding = result.scalar_one_or_none()

    if onboarding:
        return {
            "target_calories": onboarding.daily_calories or 2000,
            "target_protein_g": onboarding.daily_protein_g or 150,
            "target_carbs_g": onboarding.daily_carbs_g or 200,
            "target_fat_g": onboarding.daily_fats_g or 65,
        }

    return {
        "target_calories": 2000,
        "target_protein_g": 150,
        "target_carbs_g": 200,
        "target_fat_g": 65,
    }


async def _get_weekly_averages(user_id: int, session: AsyncSession) -> dict:
    """Calculate average daily nutrition over the last 7 days."""
    today = date.today()
    week_ago = today - timedelta(days=7)
    week_ago_dt = datetime.combine(week_ago, dt_time.min)

    result = await session.execute(
        select(
            func.coalesce(func.sum(AIFoodLog.calories), 0).label("total_calories"),
            func.coalesce(func.sum(AIFoodLog.protein_g), 0).label("total_protein"),
            func.coalesce(func.sum(AIFoodLog.carbs_g), 0).label("total_carbs"),
            func.coalesce(func.sum(AIFoodLog.fats_g), 0).label("total_fats"),
            func.coalesce(func.sum(AIFoodLog.fiber_g), 0).label("total_fiber"),
            func.count(func.distinct(func.date(AIFoodLog.logged_at))).label("active_days"),
        ).where(
            AIFoodLog.user_id == user_id,
            AIFoodLog.logged_at >= week_ago_dt,
        )
    )
    row = result.first()

    if not row or row.active_days == 0:
        return {
            "avg_calories": 0,
            "avg_protein_g": 0,
            "avg_carbs_g": 0,
            "avg_fats_g": 0,
            "avg_fiber_g": 0,
            "active_days": 0,
        }

    days = max(row.active_days, 1)
    return {
        "avg_calories": round(float(row.total_calories) / days, 1),
        "avg_protein_g": round(float(row.total_protein) / days, 1),
        "avg_carbs_g": round(float(row.total_carbs) / days, 1),
        "avg_fats_g": round(float(row.total_fats) / days, 1),
        "avg_fiber_g": round(float(row.total_fiber) / days, 1),
        "active_days": days,
    }


async def _get_frequent_foods(user_id: int, session: AsyncSession, limit: int = 5) -> List[str]:
    """Get the user's most frequently eaten foods in the last 14 days."""
    two_weeks_ago = datetime.combine(date.today() - timedelta(days=14), dt_time.min)

    result = await session.execute(
        select(
            AIFoodLog.food_name,
            func.count(AIFoodLog.id).label("count"),
        )
        .where(
            AIFoodLog.user_id == user_id,
            AIFoodLog.logged_at >= two_weeks_ago,
        )
        .group_by(AIFoodLog.food_name)
        .order_by(func.count(AIFoodLog.id).desc())
        .limit(limit)
    )
    rows = result.all()
    return [row.food_name for row in rows]


def _build_recommendations(
    targets: dict,
    averages: dict,
    frequent_foods: List[str],
) -> List[dict]:
    """Build personalized food recommendations based on nutritional analysis."""
    recommendations: List[dict] = []

    if averages["active_days"] == 0:
        # No data yet -- return balanced suggestions
        for food in BALANCED_FOODS[:3]:
            recommendations.append({
                **food,
                "reason": "Comida balanceada para empezar tu dia",
                "category": "balanced",
            })
        return recommendations

    target_calories = targets["target_calories"]
    target_protein = targets["target_protein_g"]

    # Minimum recommended fiber: 25g/day
    min_fiber_g = 25.0

    # Pattern 1: High protein eater (>80% of target) -> reinforce with more protein
    protein_ratio = averages["avg_protein_g"] / max(target_protein, 1)
    if protein_ratio >= 0.8:
        for food in HIGH_PROTEIN_FOODS[:2]:
            if food["name"] not in frequent_foods:
                recommendations.append({
                    **food,
                    "reason": "Tu consumo de proteina es bueno! Aqui tienes mas opciones altas en proteina.",
                    "category": "high_protein",
                })
                break

    # Pattern 2: Low protein (<60% of target) -> strongly suggest protein
    if protein_ratio < 0.6:
        count = 0
        for food in HIGH_PROTEIN_FOODS:
            if food["name"] not in frequent_foods and count < 2:
                recommendations.append({
                    **food,
                    "reason": f"Tu proteina promedio es {averages['avg_protein_g']}g/dia (meta: {target_protein}g). Necesitas mas proteina!",
                    "category": "high_protein",
                })
                count += 1

    # Pattern 3: Low fiber (<25g avg) -> suggest fiber-rich foods
    if averages["avg_fiber_g"] < min_fiber_g:
        count = 0
        for food in HIGH_FIBER_FOODS:
            if food["name"] not in frequent_foods and count < 2:
                recommendations.append({
                    **food,
                    "reason": f"Tu fibra promedio es {averages['avg_fiber_g']}g/dia. Intenta llegar a {min_fiber_g}g.",
                    "category": "high_fiber",
                })
                count += 1

    # Pattern 4: Calorie surplus (>110% of target) -> suggest lighter meals
    calorie_ratio = averages["avg_calories"] / max(target_calories, 1)
    if calorie_ratio > 1.1:
        count = 0
        for food in LOW_CALORIE_FOODS:
            if food["name"] not in frequent_foods and count < 2:
                recommendations.append({
                    **food,
                    "reason": f"Estas promediando {round(averages['avg_calories'])} kcal/dia (meta: {target_calories}). Prueba opciones mas ligeras.",
                    "category": "low_calorie",
                })
                count += 1

    # Fill up to at least 3 recommendations with balanced options
    if len(recommendations) < 3:
        for food in BALANCED_FOODS:
            if len(recommendations) >= 3:
                break
            if food["name"] not in frequent_foods:
                already_recommended = {r["name"] for r in recommendations}
                if food["name"] not in already_recommended:
                    recommendations.append({
                        **food,
                        "reason": "Una opcion balanceada para tu dia.",
                        "category": "balanced",
                    })

    # Cap at 5 recommendations
    return recommendations[:5]


async def get_recommendations(
    user_id: int,
    session: AsyncSession,
) -> dict:
    """
    Main entry point: generate personalized food recommendations.

    Returns a dict with analysis summary and list of recommended foods.
    """
    targets = await _get_user_targets(user_id, session)
    averages = await _get_weekly_averages(user_id, session)
    frequent_foods = await _get_frequent_foods(user_id, session)

    recommendations = _build_recommendations(targets, averages, frequent_foods)

    return {
        "user_id": user_id,
        "analysis_period_days": 7,
        "averages": averages,
        "targets": {
            "calories": targets["target_calories"],
            "protein_g": targets["target_protein_g"],
            "carbs_g": targets["target_carbs_g"],
            "fat_g": targets["target_fat_g"],
        },
        "frequent_foods": frequent_foods,
        "recommendations": recommendations,
        "generated_at": datetime.utcnow().isoformat(),
    }
