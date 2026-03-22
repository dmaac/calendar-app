from typing import List
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select
from sqlalchemy import func
from datetime import date, datetime, time as dt_time

from ..models.ai_food_log import AIFoodLog
from ..models.daily_nutrition_summary import DailyNutritionSummary
from ..models.nutrition_profile import UserNutritionProfile
from ..models.onboarding_profile import OnboardingProfile


class Insight:
    def __init__(self, type: str, icon: str, message: str, priority: int):
        self.type = type
        self.icon = icon
        self.message = message
        self.priority = priority

    def to_dict(self) -> dict:
        return {
            "type": self.type,
            "icon": self.icon,
            "message": self.message,
            "priority": self.priority,
        }


async def _get_targets(user_id: int, session: AsyncSession) -> dict:
    """Fetch calorie/protein targets from nutrition profile or onboarding profile."""
    result = await session.exec(
        select(UserNutritionProfile).where(UserNutritionProfile.user_id == user_id)
    )
    profile = result.first()

    if profile:
        return {
            "target_calories": profile.target_calories,
            "target_protein_g": profile.target_protein_g,
        }

    # Fallback to onboarding profile
    result = await session.exec(
        select(OnboardingProfile).where(OnboardingProfile.user_id == user_id)
    )
    onboarding = result.first()

    if onboarding:
        return {
            "target_calories": getattr(onboarding, "daily_calories", 2000) or 2000,
            "target_protein_g": getattr(onboarding, "daily_protein_g", 150) or 150,
        }

    return {"target_calories": 2000, "target_protein_g": 150}


async def _get_today_totals(user_id: int, today: date, session: AsyncSession) -> dict:
    """Aggregate today's food log totals."""
    today_start = datetime.combine(today, dt_time.min)
    today_end = datetime.combine(today, dt_time.max)

    result = await session.execute(
        select(
            func.coalesce(func.sum(AIFoodLog.calories), 0).label("total_calories"),
            func.coalesce(func.sum(AIFoodLog.protein_g), 0).label("total_protein_g"),
            func.count(AIFoodLog.id).label("meals_logged"),
        ).where(
            AIFoodLog.user_id == user_id,
            AIFoodLog.logged_at >= today_start,
            AIFoodLog.logged_at <= today_end,
        )
    )
    row = result.first()
    return {
        "total_calories": float(row.total_calories) if row else 0,
        "total_protein_g": float(row.total_protein_g) if row else 0,
        "meals_logged": int(row.meals_logged) if row else 0,
    }


async def _get_water_ml(user_id: int, today: date, session: AsyncSession) -> float:
    """Get today's water intake from daily nutrition summary."""
    result = await session.exec(
        select(DailyNutritionSummary).where(
            DailyNutritionSummary.user_id == user_id,
            DailyNutritionSummary.date == today,
        )
    )
    summary = result.first()
    return summary.water_ml if summary else 0.0


async def _get_streak(user_id: int, today: date, session: AsyncSession) -> int:
    """Reuse the streak calculation from ai_scan_service."""
    from .ai_scan_service import _calculate_streak
    return await _calculate_streak(user_id, today, session)


async def get_daily_insights(user_id: int, session: AsyncSession) -> List[dict]:
    """Generate 3-5 personalized insights based on real user data for today."""
    today = date.today()

    targets = await _get_targets(user_id, session)
    totals = await _get_today_totals(user_id, today, session)
    water_ml = await _get_water_ml(user_id, today, session)
    streak = await _get_streak(user_id, today, session)

    insights: List[Insight] = []

    # 1. No food logged today
    if totals["meals_logged"] == 0:
        insights.append(Insight(
            type="no_food",
            icon="restaurant",
            message="Aun no registras comida hoy. Empieza con el desayuno!",
            priority=1,
        ))

    # 2. Protein below 80% of target
    target_protein = targets["target_protein_g"]
    if totals["meals_logged"] > 0 and target_protein > 0:
        protein_ratio = totals["total_protein_g"] / target_protein
        if protein_ratio < 0.8:
            current_g = round(totals["total_protein_g"], 1)
            insights.append(Insight(
                type="low_protein",
                icon="fitness-center",
                message=f"Tu proteina esta baja hoy ({current_g}g de {round(target_protein)}g). Agrega pollo o huevos.",
                priority=2,
            ))

    # 3. Calories over 110% of target
    target_calories = targets["target_calories"]
    if totals["meals_logged"] > 0 and target_calories > 0:
        calorie_ratio = totals["total_calories"] / target_calories
        if calorie_ratio > 1.1:
            current_cal = round(totals["total_calories"])
            insights.append(Insight(
                type="high_calories",
                icon="warning",
                message=f"Cuidado, estas sobre tu meta de calorias ({current_cal} de {round(target_calories)} kcal).",
                priority=2,
            ))

    # 4. Low water intake
    if water_ml < 1500:
        water_display = round(water_ml)
        insights.append(Insight(
            type="low_water",
            icon="water-drop",
            message=f"Recuerda hidratarte! Llevas solo {water_display}ml de agua.",
            priority=3,
        ))

    # 5. Streak celebration
    if streak > 7:
        insights.append(Insight(
            type="streak",
            icon="local-fire-department",
            message=f"Increible! Llevas {streak} dias seguidos. Sigue asi!",
            priority=4,
        ))

    # Sort by priority and return 3-5 insights
    insights.sort(key=lambda i: i.priority)
    return [i.to_dict() for i in insights[:5]]
