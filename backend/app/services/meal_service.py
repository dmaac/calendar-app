from typing import List, Optional, Tuple
from datetime import date, timedelta
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select, func, col
from ..models.meal_log import MealLog, MealLogCreate
from ..models.food import Food
from ..models.daily_nutrition_summary import DailyNutritionSummary
from ..models.nutrition_profile import UserNutritionProfile


class MealService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def log_meal(self, meal_create: MealLogCreate, user_id: int) -> MealLog:
        # Get food to calculate totals
        food = await self.session.get(Food, meal_create.food_id)
        if not food:
            raise ValueError(f"Food with id {meal_create.food_id} not found")

        # Calculate nutritional totals based on servings
        total_calories = food.calories * meal_create.servings
        total_protein = food.protein_g * meal_create.servings
        total_carbs = food.carbs_g * meal_create.servings
        total_fat = food.fat_g * meal_create.servings
        total_fiber = food.fiber_g * meal_create.servings
        total_sugar = food.sugar_g * meal_create.servings

        meal_log = MealLog(
            date=meal_create.date,
            meal_type=meal_create.meal_type,
            food_id=meal_create.food_id,
            servings=meal_create.servings,
            total_calories=round(total_calories, 1),
            total_protein=round(total_protein, 1),
            total_carbs=round(total_carbs, 1),
            total_fat=round(total_fat, 1),
            total_fiber=round(total_fiber, 1),
            total_sugar=round(total_sugar, 1),
            user_id=user_id,
        )
        self.session.add(meal_log)
        await self.session.commit()
        await self.session.refresh(meal_log)

        # Update daily summary
        await self._update_daily_summary(user_id, meal_create.date)

        return meal_log

    async def get_meals_by_date(self, user_id: int, target_date: date, offset: int = 0, limit: int = 0) -> List[MealLog]:
        statement = select(MealLog).where(
            MealLog.user_id == user_id,
            MealLog.date == target_date,
        ).order_by(MealLog.created_at)  # type: ignore
        if limit > 0:
            statement = statement.offset(offset).limit(limit)
        result = await self.session.exec(statement)
        return list(result.all())

    async def count_meals_by_date(self, user_id: int, target_date: date) -> int:
        statement = select(func.count()).select_from(MealLog).where(
            MealLog.user_id == user_id,
            MealLog.date == target_date,
        )
        result = await self.session.exec(statement)
        return result.one()

    async def get_meal_by_id(self, meal_id: int) -> Optional[MealLog]:
        return await self.session.get(MealLog, meal_id)

    async def get_meal_by_id_for_user(self, meal_id: int, user_id: int) -> Optional[MealLog]:
        """SEC: Fetch meal scoped to user_id to prevent IDOR timing leaks."""
        statement = select(MealLog).where(
            MealLog.id == meal_id,
            MealLog.user_id == user_id,
        )
        result = await self.session.exec(statement)
        return result.first()

    async def delete_meal(self, meal_id: int, user_id: int) -> bool:
        meal = await self.session.get(MealLog, meal_id)
        if not meal or meal.user_id != user_id:
            return False

        meal_date = meal.date
        await self.session.delete(meal)
        await self.session.commit()

        # Update daily summary after deletion
        await self._update_daily_summary(user_id, meal_date)
        return True

    async def get_daily_summary(self, user_id: int, target_date: date) -> DailyNutritionSummary:
        statement = select(DailyNutritionSummary).where(
            DailyNutritionSummary.user_id == user_id,
            DailyNutritionSummary.date == target_date,
        )
        result = await self.session.exec(statement)
        summary = result.first()

        if not summary:
            # Get user's target calories from nutrition profile
            profile_stmt = select(UserNutritionProfile).where(
                UserNutritionProfile.user_id == user_id
            )
            profile_result = await self.session.exec(profile_stmt)
            profile = profile_result.first()
            target_cals = profile.target_calories if profile else 2000.0

            summary = DailyNutritionSummary(
                user_id=user_id,
                date=target_date,
                total_calories=0.0,
                total_protein=0.0,
                total_carbs=0.0,
                total_fat=0.0,
                target_calories=target_cals,
                water_ml=0.0,
            )
            self.session.add(summary)
            await self.session.commit()
            await self.session.refresh(summary)

        return summary

    async def get_daily_summary_with_fiber_sugar(self, user_id: int, target_date: date) -> dict:
        """Get daily summary including fiber and sugar totals computed from meal logs."""
        summary = await self.get_daily_summary(user_id, target_date)
        meals = await self.get_meals_by_date(user_id, target_date)

        total_fiber = round(sum(m.total_fiber for m in meals), 1)
        total_sugar = round(sum(m.total_sugar for m in meals), 1)

        return {
            "date": summary.date,
            "total_calories": summary.total_calories,
            "total_protein": summary.total_protein,
            "total_carbs": summary.total_carbs,
            "total_fat": summary.total_fat,
            "total_fiber": total_fiber,
            "total_sugar": total_sugar,
            "target_calories": summary.target_calories,
            "water_ml": summary.water_ml,
            "meals_count": len(meals),
        }

    async def get_weekly_summary(self, user_id: int, end_date: date) -> List[dict]:
        """Return 7 daily summaries ending on end_date."""
        start_date = end_date - timedelta(days=6)
        return await self._get_range_summary(user_id, start_date, end_date)

    async def get_history(self, user_id: int, days: int) -> List[dict]:
        """Return daily summaries for the last N days."""
        end_date = date.today()
        start_date = end_date - timedelta(days=days - 1)
        return await self._get_range_summary(user_id, start_date, end_date)

    async def _get_range_summary(self, user_id: int, start_date: date, end_date: date) -> List[dict]:
        """Batch-fetch summaries + meal aggregates for a date range (avoids N+1)."""
        # 1. Fetch all existing daily summaries in range
        stmt = select(DailyNutritionSummary).where(
            DailyNutritionSummary.user_id == user_id,
            DailyNutritionSummary.date >= start_date,
            DailyNutritionSummary.date <= end_date,
        )
        result = await self.session.exec(stmt)
        summaries_by_date = {s.date: s for s in result.all()}

        # 2. Aggregate fiber/sugar + meal count per day from meal logs (single query)
        meal_agg_stmt = (
            select(
                MealLog.date,
                func.sum(MealLog.total_fiber).label("total_fiber"),
                func.sum(MealLog.total_sugar).label("total_sugar"),
                func.count().label("meals_count"),
            )
            .where(
                MealLog.user_id == user_id,
                MealLog.date >= start_date,
                MealLog.date <= end_date,
            )
            .group_by(MealLog.date)
        )
        meal_result = await self.session.exec(meal_agg_stmt)
        meal_aggs = {row[0]: row for row in meal_result.all()}

        # 3. Build results for each day in range
        results = []
        current = start_date
        while current <= end_date:
            summary = summaries_by_date.get(current)
            agg = meal_aggs.get(current)

            total_fiber = round(float(agg[1] or 0), 1) if agg else 0.0
            total_sugar = round(float(agg[2] or 0), 1) if agg else 0.0
            meals_count = int(agg[3]) if agg else 0

            if summary:
                results.append({
                    "date": current,
                    "total_calories": summary.total_calories,
                    "total_protein": summary.total_protein,
                    "total_carbs": summary.total_carbs,
                    "total_fat": summary.total_fat,
                    "total_fiber": total_fiber,
                    "total_sugar": total_sugar,
                    "target_calories": summary.target_calories,
                    "water_ml": summary.water_ml,
                    "meals_count": meals_count,
                })
            else:
                results.append({
                    "date": current,
                    "total_calories": 0.0,
                    "total_protein": 0.0,
                    "total_carbs": 0.0,
                    "total_fat": 0.0,
                    "total_fiber": total_fiber,
                    "total_sugar": total_sugar,
                    "target_calories": 2000.0,
                    "water_ml": 0.0,
                    "meals_count": meals_count,
                })
            current += timedelta(days=1)

        return results

    async def update_water(self, user_id: int, target_date: date, water_ml: float) -> DailyNutritionSummary:
        summary = await self.get_daily_summary(user_id, target_date)
        summary.water_ml = water_ml
        self.session.add(summary)
        await self.session.commit()
        await self.session.refresh(summary)
        return summary

    async def _update_daily_summary(self, user_id: int, target_date: date) -> None:
        """Recalculate daily summary from all meals for the given date."""
        meals = await self.get_meals_by_date(user_id, target_date)

        total_calories = sum(m.total_calories for m in meals)
        total_protein = sum(m.total_protein for m in meals)
        total_carbs = sum(m.total_carbs for m in meals)
        total_fat = sum(m.total_fat for m in meals)

        # Get or create summary
        statement = select(DailyNutritionSummary).where(
            DailyNutritionSummary.user_id == user_id,
            DailyNutritionSummary.date == target_date,
        )
        result = await self.session.exec(statement)
        summary = result.first()

        if not summary:
            profile_stmt = select(UserNutritionProfile).where(
                UserNutritionProfile.user_id == user_id
            )
            profile_result = await self.session.exec(profile_stmt)
            profile = profile_result.first()
            target_cals = profile.target_calories if profile else 2000.0

            summary = DailyNutritionSummary(
                user_id=user_id,
                date=target_date,
                target_calories=target_cals,
                water_ml=0.0,
            )

        summary.total_calories = round(total_calories, 1)
        summary.total_protein = round(total_protein, 1)
        summary.total_carbs = round(total_carbs, 1)
        summary.total_fat = round(total_fat, 1)

        self.session.add(summary)
        await self.session.commit()
