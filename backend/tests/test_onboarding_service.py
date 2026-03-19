"""
Unit tests for OnboardingService.calculate_nutrition_plan()

These tests exercise the pure synchronous calculation method directly —
no DB session needed. OnboardingService is instantiated with None as the
session because calculate_nutrition_plan() never touches self.session.
"""
import pytest
from datetime import date

from app.models.onboarding_profile import OnboardingProfile
from app.services.onboarding_service import OnboardingService


def make_service() -> OnboardingService:
    """Return an OnboardingService with a None session (only calc methods used)."""
    return OnboardingService(session=None)  # type: ignore[arg-type]


def make_profile(**kwargs) -> OnboardingProfile:
    """Helper: build an OnboardingProfile without committing to a DB."""
    defaults = dict(
        user_id=1,
        gender="male",
        weight_kg=80.0,
        height_cm=175.0,
        birth_date=date(1990, 1, 1),
        workouts_per_week=3,
        goal="maintain",
        weekly_speed_kg=0.5,
    )
    defaults.update(kwargs)
    return OnboardingProfile(**defaults)


# ---------------------------------------------------------------------------
# calculate_nutrition_plan tests
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestCalculateNutritionPlan:

    def test_calculate_nutrition_plan_lose_weight(self):
        """Lose-weight goal should produce < 2500 kcal and positive macros."""
        service = make_service()
        profile = make_profile(goal="lose", weight_kg=80, height_cm=175,
                               gender="male", workouts_per_week=3,
                               birth_date=date(1990, 1, 1))

        plan = service.calculate_nutrition_plan(profile)

        assert plan.daily_calories < 2500
        assert plan.protein_g > 0
        assert plan.carbs_g > 0
        assert plan.fats_g > 0
        assert 0 <= plan.health_score <= 100

    def test_calculate_nutrition_plan_gain_weight(self):
        """Gain-weight goal should produce calories above 1800."""
        service = make_service()
        profile = make_profile(goal="gain", weight_kg=70, height_cm=180,
                               gender="male", workouts_per_week=4,
                               birth_date=date(1995, 6, 15))

        plan = service.calculate_nutrition_plan(profile)

        assert plan.daily_calories > 1800

    def test_calculate_nutrition_plan_maintain(self):
        """Maintain goal should produce a reasonable calorie target (1200-4000)."""
        service = make_service()
        profile = make_profile(goal="maintain", weight_kg=65, height_cm=165,
                               gender="female", workouts_per_week=2,
                               birth_date=date(1988, 3, 22))

        plan = service.calculate_nutrition_plan(profile)

        assert 1200 <= plan.daily_calories <= 4000
        assert plan.protein_g > 0
        assert plan.carbs_g > 0
        assert plan.fats_g > 0

    def test_calculate_nutrition_plan_minimum_calories(self):
        """Very low weight/height should be floored at 1200 kcal."""
        service = make_service()
        # Tiny values that would produce a very low BMR + aggressive deficit
        profile = make_profile(goal="lose", weight_kg=35, height_cm=140,
                               gender="female", workouts_per_week=0,
                               birth_date=date(1940, 1, 1),
                               weekly_speed_kg=2.0)

        plan = service.calculate_nutrition_plan(profile)

        assert plan.daily_calories >= 1200

    def test_calculate_nutrition_plan_health_score_bounds(self):
        """Health score must always be between 0 and 100 inclusive."""
        service = make_service()

        # Aggressive deficit scenario
        profile_deficit = make_profile(goal="lose", weight_kg=50, height_cm=155,
                                       gender="female", workouts_per_week=0,
                                       birth_date=date(1990, 1, 1),
                                       weekly_speed_kg=2.0)
        plan_deficit = service.calculate_nutrition_plan(profile_deficit)
        assert 0 <= plan_deficit.health_score <= 100

        # Active gain scenario
        profile_gain = make_profile(goal="gain", weight_kg=90, height_cm=185,
                                    gender="male", workouts_per_week=7,
                                    birth_date=date(1990, 1, 1))
        plan_gain = service.calculate_nutrition_plan(profile_gain)
        assert 0 <= plan_gain.health_score <= 100

    def test_calculate_nutrition_plan_macro_proportions(self):
        """Macros should follow roughly 30/40/30 (protein/carbs/fat) calorie split."""
        service = make_service()
        profile = make_profile(goal="maintain", weight_kg=75, height_cm=175,
                               gender="male", workouts_per_week=3,
                               birth_date=date(1990, 1, 1))

        plan = service.calculate_nutrition_plan(profile)

        # protein: 30% of calories / 4 kcal per g
        expected_protein = round((plan.daily_calories * 0.30) / 4)
        # carbs: 40% of calories / 4 kcal per g
        expected_carbs = round((plan.daily_calories * 0.40) / 4)
        # fats: 30% of calories / 9 kcal per g
        expected_fats = round((plan.daily_calories * 0.30) / 9)

        assert plan.protein_g == expected_protein
        assert plan.carbs_g == expected_carbs
        assert plan.fats_g == expected_fats

    def test_calculate_nutrition_plan_no_birth_date_uses_age30(self):
        """When birth_date is None, age defaults to 30 — result must still be sane."""
        service = make_service()
        profile = make_profile(goal="maintain", birth_date=None)
        # Should not raise
        plan = service.calculate_nutrition_plan(profile)
        assert plan.daily_calories >= 1200

    def test_calculate_nutrition_plan_gender_other_uses_female_formula(self):
        """Non-male gender falls through to the female Mifflin-St Jeor formula."""
        service = make_service()
        profile_other = make_profile(goal="maintain", gender="other",
                                     weight_kg=70, height_cm=170,
                                     birth_date=date(1990, 1, 1),
                                     workouts_per_week=3)
        profile_female = make_profile(goal="maintain", gender="female",
                                      weight_kg=70, height_cm=170,
                                      birth_date=date(1990, 1, 1),
                                      workouts_per_week=3)

        plan_other = service.calculate_nutrition_plan(profile_other)
        plan_female = service.calculate_nutrition_plan(profile_female)

        assert plan_other.daily_calories == plan_female.daily_calories

    def test_calculate_nutrition_plan_activity_multiplier_sedentary(self):
        """0 workouts/week uses sedentary multiplier (lowest TDEE)."""
        service = make_service()
        profile_sedentary = make_profile(goal="maintain", workouts_per_week=0,
                                         weight_kg=70, height_cm=170,
                                         birth_date=date(1990, 1, 1))
        profile_active = make_profile(goal="maintain", workouts_per_week=7,
                                      weight_kg=70, height_cm=170,
                                      birth_date=date(1990, 1, 1))

        plan_sedentary = service.calculate_nutrition_plan(profile_sedentary)
        plan_active = service.calculate_nutrition_plan(profile_active)

        assert plan_sedentary.daily_calories < plan_active.daily_calories

    def test_calculate_nutrition_plan_target_date_set_when_target_weight_given(self):
        """target_date should be set when target_weight_kg is provided."""
        service = make_service()
        profile = make_profile(goal="lose", weight_kg=80, height_cm=175,
                               gender="male", workouts_per_week=3,
                               birth_date=date(1990, 1, 1),
                               weekly_speed_kg=0.5)
        profile.target_weight_kg = 70.0

        plan = service.calculate_nutrition_plan(profile)

        assert plan.target_date is not None
        assert plan.target_date > date.today()
