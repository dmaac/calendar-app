"""
Unit tests for MealService.
Tests: log_meal total calculations, daily summary aggregation, water update.
"""
import pytest
from datetime import date
from sqlmodel import Session

from app.models.food import Food
from app.models.meal_log import MealLog, MealLogCreate, MealType
from app.models.daily_nutrition_summary import DailyNutritionSummary
from app.models.nutrition_profile import UserNutritionProfile
from app.models.user import User
from app.services.meal_service import MealService
from app.core.security import get_password_hash


@pytest.mark.unit
class TestLogMeal:
    """Test MealService.log_meal calculates totals correctly."""

    def test_log_meal_single_serving(self, session: Session, test_user: User, test_food: Food):
        """Logging 1 serving should match food's base nutritional values."""
        service = MealService(session)
        meal_create = MealLogCreate(
            date=date(2025, 1, 15),
            meal_type=MealType.LUNCH,
            food_id=test_food.id,
            servings=1.0,
        )

        meal = service.log_meal(meal_create, test_user.id)

        assert meal.total_calories == 165.0
        assert meal.total_protein == 31.0
        assert meal.total_carbs == 0.0
        assert meal.total_fat == 3.6
        assert meal.user_id == test_user.id
        assert meal.food_id == test_food.id
        assert meal.id is not None

    def test_log_meal_multiple_servings(self, session: Session, test_user: User, test_food: Food):
        """Logging 2.5 servings should multiply nutritional values accordingly."""
        service = MealService(session)
        meal_create = MealLogCreate(
            date=date(2025, 1, 15),
            meal_type=MealType.DINNER,
            food_id=test_food.id,
            servings=2.5,
        )

        meal = service.log_meal(meal_create, test_user.id)

        assert meal.total_calories == round(165.0 * 2.5, 1)
        assert meal.total_protein == round(31.0 * 2.5, 1)
        assert meal.total_carbs == round(0.0 * 2.5, 1)
        assert meal.total_fat == round(3.6 * 2.5, 1)

    def test_log_meal_fractional_serving(self, session: Session, test_user: User, test_food: Food):
        """Logging 0.5 servings should halve nutritional values."""
        service = MealService(session)
        meal_create = MealLogCreate(
            date=date(2025, 1, 15),
            meal_type=MealType.SNACK,
            food_id=test_food.id,
            servings=0.5,
        )

        meal = service.log_meal(meal_create, test_user.id)

        assert meal.total_calories == round(165.0 * 0.5, 1)
        assert meal.total_protein == round(31.0 * 0.5, 1)

    def test_log_meal_invalid_food_raises(self, session: Session, test_user: User):
        """Logging a meal with a non-existent food_id should raise ValueError."""
        service = MealService(session)
        meal_create = MealLogCreate(
            date=date(2025, 1, 15),
            meal_type=MealType.BREAKFAST,
            food_id=99999,
            servings=1.0,
        )

        with pytest.raises(ValueError, match="not found"):
            service.log_meal(meal_create, test_user.id)

    def test_log_meal_updates_daily_summary(self, session: Session, test_user: User, test_food: Food):
        """Logging a meal should automatically update the daily summary."""
        service = MealService(session)
        meal_create = MealLogCreate(
            date=date(2025, 1, 15),
            meal_type=MealType.LUNCH,
            food_id=test_food.id,
            servings=1.0,
        )

        service.log_meal(meal_create, test_user.id)

        summary = service.get_daily_summary(test_user.id, date(2025, 1, 15))
        assert summary.total_calories == 165.0
        assert summary.total_protein == 31.0
        assert summary.total_carbs == 0.0
        assert summary.total_fat == 3.6


@pytest.mark.unit
class TestDailySummaryAggregation:
    """Test daily summary correctly aggregates multiple meals."""

    def test_summary_aggregates_multiple_meals(
        self, session: Session, test_user: User, test_food: Food, second_food: Food
    ):
        """Daily summary should sum totals from all meals on the same day."""
        service = MealService(session)
        target = date(2025, 2, 10)

        # Log two different meals
        service.log_meal(
            MealLogCreate(date=target, meal_type=MealType.BREAKFAST, food_id=test_food.id, servings=1.0),
            test_user.id,
        )
        service.log_meal(
            MealLogCreate(date=target, meal_type=MealType.LUNCH, food_id=second_food.id, servings=2.0),
            test_user.id,
        )

        summary = service.get_daily_summary(test_user.id, target)

        expected_cal = 165.0 + (112.0 * 2.0)
        expected_protein = 31.0 + (2.6 * 2.0)
        expected_carbs = 0.0 + (23.5 * 2.0)
        expected_fat = 3.6 + (0.9 * 2.0)

        assert summary.total_calories == round(expected_cal, 1)
        assert summary.total_protein == round(expected_protein, 1)
        assert summary.total_carbs == round(expected_carbs, 1)
        assert summary.total_fat == round(expected_fat, 1)

    def test_summary_empty_day(self, session: Session, test_user: User):
        """Daily summary for a day with no meals should have zero totals."""
        service = MealService(session)
        summary = service.get_daily_summary(test_user.id, date(2025, 3, 1))

        assert summary.total_calories == 0.0
        assert summary.total_protein == 0.0
        assert summary.total_carbs == 0.0
        assert summary.total_fat == 0.0
        assert summary.water_ml == 0.0

    def test_summary_default_target_calories(self, session: Session, test_user: User):
        """Without a nutrition profile, target calories should default to 2000."""
        service = MealService(session)
        summary = service.get_daily_summary(test_user.id, date(2025, 3, 1))
        assert summary.target_calories == 2000.0

    def test_summary_uses_profile_target(self, session: Session, test_user: User):
        """With a nutrition profile, target calories should come from the profile."""
        profile = UserNutritionProfile(
            user_id=test_user.id,
            target_calories=2500.0,
            target_protein_g=180.0,
            target_carbs_g=300.0,
            target_fat_g=70.0,
        )
        session.add(profile)
        session.commit()

        service = MealService(session)
        summary = service.get_daily_summary(test_user.id, date(2025, 3, 2))
        assert summary.target_calories == 2500.0

    def test_summary_after_delete(self, session: Session, test_user: User, test_food: Food):
        """Deleting a meal should recalculate the daily summary."""
        service = MealService(session)
        target = date(2025, 4, 1)

        meal = service.log_meal(
            MealLogCreate(date=target, meal_type=MealType.LUNCH, food_id=test_food.id, servings=2.0),
            test_user.id,
        )
        service.delete_meal(meal.id, test_user.id)

        summary = service.get_daily_summary(test_user.id, target)
        assert summary.total_calories == 0.0
        assert summary.total_protein == 0.0

    def test_summary_isolates_different_dates(
        self, session: Session, test_user: User, test_food: Food
    ):
        """Meals on different dates should not affect each other's summary."""
        service = MealService(session)

        service.log_meal(
            MealLogCreate(date=date(2025, 5, 1), meal_type=MealType.LUNCH, food_id=test_food.id, servings=1.0),
            test_user.id,
        )
        service.log_meal(
            MealLogCreate(date=date(2025, 5, 2), meal_type=MealType.LUNCH, food_id=test_food.id, servings=3.0),
            test_user.id,
        )

        summary_day1 = service.get_daily_summary(test_user.id, date(2025, 5, 1))
        summary_day2 = service.get_daily_summary(test_user.id, date(2025, 5, 2))

        assert summary_day1.total_calories == 165.0
        assert summary_day2.total_calories == round(165.0 * 3.0, 1)


@pytest.mark.unit
class TestWaterUpdate:
    """Test MealService.update_water."""

    def test_update_water(self, session: Session, test_user: User):
        """Should set water_ml on the daily summary."""
        service = MealService(session)
        target = date(2025, 6, 1)

        result = service.update_water(test_user.id, target, 2500.0)

        assert result.water_ml == 2500.0
        assert result.user_id == test_user.id
        assert result.date == target

    def test_update_water_overwrites(self, session: Session, test_user: User):
        """Subsequent water updates should overwrite the previous value."""
        service = MealService(session)
        target = date(2025, 6, 2)

        service.update_water(test_user.id, target, 1000.0)
        result = service.update_water(test_user.id, target, 3000.0)

        assert result.water_ml == 3000.0

    def test_update_water_preserves_meal_data(
        self, session: Session, test_user: User, test_food: Food
    ):
        """Updating water should not affect meal-based totals in the summary."""
        service = MealService(session)
        target = date(2025, 6, 3)

        service.log_meal(
            MealLogCreate(date=target, meal_type=MealType.LUNCH, food_id=test_food.id, servings=1.0),
            test_user.id,
        )
        result = service.update_water(test_user.id, target, 2000.0)

        assert result.water_ml == 2000.0
        assert result.total_calories == 165.0
        assert result.total_protein == 31.0
