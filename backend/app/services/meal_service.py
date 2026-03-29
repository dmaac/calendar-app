"""
Meal Service
-------------
CRUD operations for MealLog entries and daily nutrition summary management.

Each meal log triggers a recalculation of the DailyNutritionSummary for
the relevant date. All DB operations are async.
"""

import logging
from typing import List, Optional

from datetime import date, timedelta
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select, func
from ..models.meal_log import MealLog, MealLogCreate
from ..models.food import Food
from ..models.daily_nutrition_summary import DailyNutritionSummary
from ..models.nutrition_profile import UserNutritionProfile

logger = logging.getLogger(__name__)


class MealService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def log_meal(self, meal_create: MealLogCreate, user_id: int) -> MealLog:
        """Log a new meal for the user.

        Fetches the Food entry to compute nutritional totals based on servings,
        then updates (or creates) the DailyNutritionSummary for the meal date.

        Raises:
            ValueError: If the food_id does not exist.
        """
        # Get food to calculate totals
        food = await self.session.get(Food, meal_create.food_id)
        if not food:
            raise ValueError(f"Food with id {meal_create.food_id} not found")

        # Validate servings (defense-in-depth; schema has gt=0 but we double-check)
        if meal_create.servings <= 0:
            raise ValueError(f"Servings must be positive, got {meal_create.servings}")

        # Calculate nutritional totals based on servings
        # Guard against None values that may exist in DB rows predating column additions
        total_calories = (food.calories or 0) * meal_create.servings
        total_protein = (food.protein_g or 0) * meal_create.servings
        total_carbs = (food.carbs_g or 0) * meal_create.servings
        total_fat = (food.fat_g or 0) * meal_create.servings
        total_fiber = (food.fiber_g or 0) * meal_create.servings
        total_sugar = (food.sugar_g or 0) * meal_create.servings

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

        try:
            self.session.add(meal_log)
            # Flush (not commit) so the summary update runs in the same transaction
            await self.session.flush()

            # Update daily summary within the same transaction
            await self._update_daily_summary(user_id, meal_create.date)

            await self.session.commit()
            await self.session.refresh(meal_log)
            logger.info(
                "Meal logged: user_id=%d food_id=%d date=%s calories=%.1f",
                user_id, meal_create.food_id, meal_create.date, meal_log.total_calories,
            )
            return meal_log
        except Exception:
            await self.session.rollback()
            logger.exception(
                "Failed to log meal: user_id=%d food_id=%d date=%s",
                user_id, meal_create.food_id, meal_create.date,
            )
            raise

    async def get_meals_by_date(
        self, user_id: int, target_date: date, offset: int = 0, limit: int = 0
    ) -> List[MealLog]:
        """Return meal logs for a user on a given date.

        Args:
            user_id: The user whose meals to fetch.
            target_date: The date to filter on.
            offset: Number of records to skip (only applied when limit > 0).
            limit: Maximum records to return. 0 means all records.
        """
        statement = select(MealLog).where(
            MealLog.user_id == user_id,
            MealLog.date == target_date,
        ).order_by(MealLog.created_at)  # type: ignore
        if limit > 0:
            statement = statement.offset(offset).limit(limit)
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def count_meals_by_date(self, user_id: int, target_date: date) -> int:
        """Return the number of meals logged by a user on a given date."""
        statement = select(func.count()).select_from(MealLog).where(
            MealLog.user_id == user_id,
            MealLog.date == target_date,
        )
        result = await self.session.execute(statement)
        return result.scalar_one()

    async def get_meal_by_id(self, meal_id: int) -> Optional[MealLog]:
        """Fetch a meal log by its primary key (no user scoping)."""
        return await self.session.get(MealLog, meal_id)

    async def get_meal_by_id_for_user(self, meal_id: int, user_id: int) -> Optional[MealLog]:
        """SEC: Fetch meal scoped to user_id to prevent IDOR timing leaks."""
        statement = select(MealLog).where(
            MealLog.id == meal_id,
            MealLog.user_id == user_id,
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def delete_meal(self, meal_id: int, user_id: int) -> bool:
        """Delete a meal log owned by the given user.

        Uses user-scoped query to prevent IDOR timing leaks.
        Returns True if deleted, False if not found or not owned.
        """
        # SEC: Use user-scoped lookup to prevent IDOR timing leaks
        meal = await self.get_meal_by_id_for_user(meal_id, user_id)
        if not meal:
            return False

        meal_date = meal.date
        try:
            await self.session.delete(meal)
            # Flush then update summary in the same transaction
            await self.session.flush()

            # Update daily summary after deletion
            await self._update_daily_summary(user_id, meal_date)

            await self.session.commit()
            logger.info("Meal deleted: meal_id=%d user_id=%d date=%s", meal_id, user_id, meal_date)
            return True
        except Exception:
            await self.session.rollback()
            logger.exception("Failed to delete meal: meal_id=%d user_id=%d", meal_id, user_id)
            raise

    async def get_daily_summary(self, user_id: int, target_date: date) -> DailyNutritionSummary:
        """Get (or create) the daily nutrition summary for a user on a given date."""
        statement = select(DailyNutritionSummary).where(
            DailyNutritionSummary.user_id == user_id,
            DailyNutritionSummary.date == target_date,
        )
        result = await self.session.execute(statement)
        summary = result.scalar_one_or_none()

        if not summary:
            # Get user's target calories from nutrition profile
            target_cals = await self._get_user_target_calories(user_id)

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

        total_fiber = round(sum((m.total_fiber or 0) for m in meals), 1)
        total_sugar = round(sum((m.total_sugar or 0) for m in meals), 1)

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
        """Return daily summaries for the last N days.

        Args:
            user_id: The user.
            days: Number of days to look back (must be >= 1).
        """
        if days < 1:
            days = 1
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
        result = await self.session.execute(stmt)
        summaries_by_date = {s.date: s for s in result.scalars().all()}

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
        meal_result = await self.session.execute(meal_agg_stmt)
        meal_aggs = {row[0]: row for row in meal_result.all()}

        # 3. Get user target calories once (fallback for days without a summary)
        target_cals_fallback = await self._get_user_target_calories(user_id)

        # 4. Build results for each day in range
        results: List[dict] = []
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
                    "target_calories": target_cals_fallback,
                    "water_ml": 0.0,
                    "meals_count": meals_count,
                })
            current += timedelta(days=1)

        return results

    async def update_water(self, user_id: int, target_date: date, water_ml: float) -> DailyNutritionSummary:
        """Update the water intake for a given date.

        Args:
            user_id: The user.
            target_date: The date to update.
            water_ml: Water intake in milliliters (must be >= 0).

        Raises:
            ValueError: If water_ml is negative.
        """
        if water_ml < 0:
            raise ValueError(f"water_ml must be non-negative, got {water_ml}")

        summary = await self.get_daily_summary(user_id, target_date)
        summary.water_ml = water_ml
        self.session.add(summary)
        await self.session.commit()
        await self.session.refresh(summary)
        return summary

    # -----------------------------------------------------------------------
    # Private helpers
    # -----------------------------------------------------------------------

    async def _get_user_target_calories(self, user_id: int) -> float:
        """Fetch the user's target calories from their nutrition profile.

        Returns 2000.0 as a safe default when no profile exists.
        """
        profile_stmt = select(UserNutritionProfile).where(
            UserNutritionProfile.user_id == user_id
        )
        profile_result = await self.session.execute(profile_stmt)
        profile = profile_result.scalar_one_or_none()
        return profile.target_calories if profile else 2000.0

    async def _update_daily_summary(self, user_id: int, target_date: date) -> None:
        """Recalculate daily summary from all meals for the given date.

        NOTE: This method uses flush() instead of commit() so callers can
        wrap it inside a larger transaction.
        """
        meals = await self.get_meals_by_date(user_id, target_date)

        total_calories = sum((m.total_calories or 0) for m in meals)
        total_protein = sum((m.total_protein or 0) for m in meals)
        total_carbs = sum((m.total_carbs or 0) for m in meals)
        total_fat = sum((m.total_fat or 0) for m in meals)

        # Get or create summary
        statement = select(DailyNutritionSummary).where(
            DailyNutritionSummary.user_id == user_id,
            DailyNutritionSummary.date == target_date,
        )
        result = await self.session.execute(statement)
        summary = result.scalar_one_or_none()

        if not summary:
            target_cals = await self._get_user_target_calories(user_id)
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
        # Use flush instead of commit -- caller controls the transaction boundary
        await self.session.flush()
