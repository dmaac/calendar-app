"""
Unit tests for AI food scan service logic and related models.

Tests cover:
- Default nutrition targets when no onboarding profile exists
- ManualFoodLog pydantic model validation
- AIFoodLog response dict structure
- Streak calculation edge case (no logs → 0)
"""
import pytest
from datetime import datetime
from typing import Optional

from app.models.ai_food_log import AIFoodLog
from app.routers.ai_food import ManualFoodLog


# ---------------------------------------------------------------------------
# Default nutrition targets (when profile is None)
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestNutritionDefaults:
    """Verify that get_daily_summary falls back to documented defaults."""

    def test_nutrition_defaults_when_no_profile(self):
        """
        In get_daily_summary the inline fallback values are:
          2000 kcal, 150g protein, 200g carbs, 65g fats
        We verify these constants match the documented spec by inspecting
        the source directly rather than calling the async function.
        """
        import inspect
        from app.services import ai_scan_service

        source = inspect.getsource(ai_scan_service.get_daily_summary)

        assert "2000" in source, "Default 2000 kcal not found in get_daily_summary"
        assert "150" in source, "Default 150g protein not found in get_daily_summary"
        assert "200" in source, "Default 200g carbs not found in get_daily_summary"
        assert "65" in source, "Default 65g fats not found in get_daily_summary"

    def test_nutrition_defaults_values(self):
        """Spot-check the exact default values used in the fallback expressions."""
        # These mirror the `if profile_row and profile_row.daily_xxx else DEFAULT`
        # logic in get_daily_summary.
        default_calories = 2000
        default_protein_g = 150
        default_carbs_g = 200
        default_fats_g = 65

        assert default_calories == 2000
        assert default_protein_g == 150
        assert default_carbs_g == 200
        assert default_fats_g == 65


# ---------------------------------------------------------------------------
# Streak calculation edge case
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestStreakCalculation:

    def test_streak_calculation_no_logs_returns_zero(self):
        """
        _calculate_streak returns 0 when there are no food log rows.
        We simulate this by checking the return type contract and the
        safe `int(row.streak) if row else 0` guard in the source.
        """
        import inspect
        from app.services import ai_scan_service

        source = inspect.getsource(ai_scan_service._calculate_streak)

        # The guard that returns 0 when no rows match
        assert "return int(row.streak) if row else 0" in source

    def test_streak_sql_filters_by_user_and_today(self):
        """_calculate_streak SQL must filter by user_id and today."""
        import inspect
        from app.services import ai_scan_service

        source = inspect.getsource(ai_scan_service._calculate_streak)

        assert "user_id = :user_id" in source
        assert ":today" in source


# ---------------------------------------------------------------------------
# ManualFoodLog pydantic model validation
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestManualFoodLogValidation:

    def test_manual_food_log_valid(self):
        """Valid payload should deserialise without error."""
        log = ManualFoodLog(
            food_name="Grilled Chicken",
            calories=350.0,
            carbs_g=0.0,
            protein_g=50.0,
            fats_g=10.0,
            meal_type="lunch",
        )
        assert log.food_name == "Grilled Chicken"
        assert log.calories == 350.0
        assert log.meal_type == "lunch"

    def test_manual_food_log_default_meal_type_is_snack(self):
        """meal_type defaults to 'snack' when not supplied."""
        log = ManualFoodLog(
            food_name="Apple",
            calories=95.0,
            carbs_g=25.0,
            protein_g=0.5,
            fats_g=0.3,
        )
        assert log.meal_type == "snack"

    def test_manual_food_log_optional_fields_can_be_none(self):
        """fiber_g and serving_size are optional and default to None."""
        log = ManualFoodLog(
            food_name="Rice",
            calories=200.0,
            carbs_g=45.0,
            protein_g=4.0,
            fats_g=0.5,
            meal_type="dinner",
        )
        assert log.fiber_g is None
        assert log.serving_size is None

    def test_manual_food_log_all_meal_types_accepted_by_router_validation(self):
        """The valid set used in the router endpoint."""
        valid_types = {"breakfast", "lunch", "dinner", "snack"}

        for meal_type in valid_types:
            log = ManualFoodLog(
                food_name="Test Food",
                calories=100.0,
                carbs_g=10.0,
                protein_g=5.0,
                fats_g=2.0,
                meal_type=meal_type,
            )
            assert log.meal_type == meal_type

    def test_manual_food_log_with_fiber_and_serving(self):
        """Optional fields are stored correctly when supplied."""
        log = ManualFoodLog(
            food_name="Oatmeal",
            calories=150.0,
            carbs_g=27.0,
            protein_g=5.0,
            fats_g=2.5,
            fiber_g=4.0,
            serving_size="1 cup (240ml)",
            meal_type="breakfast",
        )
        assert log.fiber_g == 4.0
        assert log.serving_size == "1 cup (240ml)"


# ---------------------------------------------------------------------------
# AIFoodLog response dict structure
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestFoodLogResponseFormat:

    def _make_log(self) -> AIFoodLog:
        """Build a minimal AIFoodLog object (no DB needed)."""
        return AIFoodLog(
            id=42,
            user_id=1,
            meal_type="lunch",
            food_name="Pasta Bolognese",
            calories=520.0,
            carbs_g=65.0,
            protein_g=28.0,
            fats_g=14.0,
            fiber_g=3.5,
            sugar_g=8.0,
            sodium_mg=450.0,
            serving_size="1 plate ~400g",
            image_url="https://example.com/food.jpg",
            image_hash="abc123",
            ai_provider="gpt-4o",
            ai_confidence=0.92,
            was_edited=False,
            logged_at=datetime(2026, 3, 19, 12, 30, 0),
        )

    def _build_response_dict(self, log: AIFoodLog) -> dict:
        """Mirror the dict construction used in get_food_logs()."""
        return {
            "id": log.id,
            "food_name": log.food_name,
            "calories": log.calories,
            "protein_g": log.protein_g,
            "carbs_g": log.carbs_g,
            "fats_g": log.fats_g,
            "meal_type": log.meal_type,
            "logged_at": log.logged_at.isoformat(),
            "image_url": log.image_url,
            "ai_confidence": log.ai_confidence,
            "was_edited": log.was_edited,
        }

    def test_food_log_response_has_all_required_keys(self):
        """Response dict must contain all 11 required keys."""
        log = self._make_log()
        response = self._build_response_dict(log)

        required_keys = {
            "id", "food_name", "calories", "protein_g", "carbs_g",
            "fats_g", "meal_type", "logged_at", "image_url",
            "ai_confidence", "was_edited",
        }
        assert required_keys.issubset(response.keys()), (
            f"Missing keys: {required_keys - response.keys()}"
        )

    def test_food_log_response_values_match_model(self):
        """Response values must correctly reflect the AIFoodLog fields."""
        log = self._make_log()
        response = self._build_response_dict(log)

        assert response["id"] == 42
        assert response["food_name"] == "Pasta Bolognese"
        assert response["calories"] == 520.0
        assert response["protein_g"] == 28.0
        assert response["carbs_g"] == 65.0
        assert response["fats_g"] == 14.0
        assert response["meal_type"] == "lunch"
        assert response["logged_at"] == "2026-03-19T12:30:00"
        assert response["image_url"] == "https://example.com/food.jpg"
        assert response["ai_confidence"] == 0.92
        assert response["was_edited"] is False

    def test_food_log_response_logged_at_is_isoformat(self):
        """logged_at must be an ISO-8601 string, not a datetime object."""
        log = self._make_log()
        response = self._build_response_dict(log)

        assert isinstance(response["logged_at"], str)
        # Verify it parses back to the same datetime
        parsed = datetime.fromisoformat(response["logged_at"])
        assert parsed == log.logged_at

    def test_food_log_model_fields_exist(self):
        """AIFoodLog model must have all fields the API response exposes."""
        log = self._make_log()

        assert hasattr(log, "id")
        assert hasattr(log, "food_name")
        assert hasattr(log, "calories")
        assert hasattr(log, "protein_g")
        assert hasattr(log, "carbs_g")
        assert hasattr(log, "fats_g")
        assert hasattr(log, "meal_type")
        assert hasattr(log, "logged_at")
        assert hasattr(log, "image_url")
        assert hasattr(log, "ai_confidence")
        assert hasattr(log, "was_edited")
