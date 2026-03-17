"""
Unit tests for NutritionService.
Tests: BMR calculation (Mifflin-St Jeor), TDEE with activity multipliers,
       macro targets for different goals.
"""
import pytest
from sqlmodel import Session

from app.services.nutrition_service import NutritionService
from app.models.nutrition_profile import (
    UserNutritionProfile,
    UserNutritionProfileCreate,
    Gender,
    ActivityLevel,
    NutritionGoal,
)
from app.models.user import User
from app.core.security import get_password_hash


@pytest.mark.unit
class TestBMRCalculation:
    """Test Mifflin-St Jeor BMR calculation."""

    def test_male_bmr(self, session: Session):
        """Male BMR = (10 * weight_kg) + (6.25 * height_cm) - (5 * age) + 5."""
        service = NutritionService(session)
        targets = service.calculate_targets(
            height_cm=180.0,
            weight_kg=80.0,
            age=30,
            gender="male",
            activity_level="sedentary",
            goal="maintain",
        )
        # BMR = (10*80) + (6.25*180) - (5*30) + 5 = 800 + 1125 - 150 + 5 = 1780
        # TDEE = 1780 * 1.2 = 2136
        # maintain -> no adjustment
        assert targets["target_calories"] == 2136

    def test_female_bmr(self, session: Session):
        """Female BMR = (10 * weight_kg) + (6.25 * height_cm) - (5 * age) - 161."""
        service = NutritionService(session)
        targets = service.calculate_targets(
            height_cm=165.0,
            weight_kg=60.0,
            age=25,
            gender="female",
            activity_level="sedentary",
            goal="maintain",
        )
        # BMR = (10*60) + (6.25*165) - (5*25) - 161 = 600 + 1031.25 - 125 - 161 = 1345.25
        # TDEE = 1345.25 * 1.2 = 1614.3
        # maintain -> no adjustment
        assert targets["target_calories"] == round(1345.25 * 1.2)

    def test_male_bmr_with_enum(self, session: Session):
        """Should work with Gender enum values too."""
        service = NutritionService(session)
        targets = service.calculate_targets(
            height_cm=175.0,
            weight_kg=75.0,
            age=28,
            gender=Gender.MALE,
            activity_level=ActivityLevel.SEDENTARY,
            goal=NutritionGoal.MAINTAIN,
        )
        # BMR = (10*75) + (6.25*175) - (5*28) + 5 = 750 + 1093.75 - 140 + 5 = 1708.75
        # TDEE = 1708.75 * 1.2 = 2050.5
        assert targets["target_calories"] == round(1708.75 * 1.2)

    def test_female_bmr_with_enum(self, session: Session):
        """Should work with Gender enum for females."""
        service = NutritionService(session)
        targets = service.calculate_targets(
            height_cm=160.0,
            weight_kg=55.0,
            age=35,
            gender=Gender.FEMALE,
            activity_level=ActivityLevel.SEDENTARY,
            goal=NutritionGoal.MAINTAIN,
        )
        # BMR = (10*55) + (6.25*160) - (5*35) - 161 = 550 + 1000 - 175 - 161 = 1214
        # TDEE = 1214 * 1.2 = 1456.8
        assert targets["target_calories"] == round(1214 * 1.2)


@pytest.mark.unit
class TestTDEECalculation:
    """Test TDEE with different activity level multipliers."""

    @pytest.fixture(autouse=True)
    def setup(self, session: Session):
        self.service = NutritionService(session)
        # Base params: male, 180cm, 80kg, 30yo
        # BMR = (10*80) + (6.25*180) - (5*30) + 5 = 1780
        self.base_params = {
            "height_cm": 180.0,
            "weight_kg": 80.0,
            "age": 30,
            "gender": "male",
            "goal": "maintain",
        }
        self.bmr = 1780.0

    def test_sedentary(self):
        targets = self.service.calculate_targets(**self.base_params, activity_level="sedentary")
        assert targets["target_calories"] == round(self.bmr * 1.2)

    def test_lightly_active(self):
        targets = self.service.calculate_targets(**self.base_params, activity_level="lightly_active")
        assert targets["target_calories"] == round(self.bmr * 1.375)

    def test_moderately_active(self):
        targets = self.service.calculate_targets(**self.base_params, activity_level="moderately_active")
        assert targets["target_calories"] == round(self.bmr * 1.55)

    def test_very_active(self):
        targets = self.service.calculate_targets(**self.base_params, activity_level="very_active")
        assert targets["target_calories"] == round(self.bmr * 1.725)

    def test_extra_active(self):
        targets = self.service.calculate_targets(**self.base_params, activity_level="extra_active")
        assert targets["target_calories"] == round(self.bmr * 1.9)

    def test_unknown_activity_defaults_to_moderate(self):
        """Unknown activity level should default to 1.55 multiplier."""
        targets = self.service.calculate_targets(**self.base_params, activity_level="unknown")
        assert targets["target_calories"] == round(self.bmr * 1.55)


@pytest.mark.unit
class TestGoalAdjustment:
    """Test calorie adjustment based on nutrition goal."""

    @pytest.fixture(autouse=True)
    def setup(self, session: Session):
        self.service = NutritionService(session)
        self.base_params = {
            "height_cm": 180.0,
            "weight_kg": 80.0,
            "age": 30,
            "gender": "male",
            "activity_level": "moderately_active",
        }
        # BMR = 1780, TDEE = 1780 * 1.55 = 2759
        self.tdee = 1780.0 * 1.55

    def test_maintain_goal(self):
        """Maintain goal should not adjust TDEE."""
        targets = self.service.calculate_targets(**self.base_params, goal="maintain")
        assert targets["target_calories"] == round(self.tdee)

    def test_lose_weight_goal(self):
        """Lose weight should subtract 500 calories (0.5kg/week deficit)."""
        targets = self.service.calculate_targets(**self.base_params, goal="lose_weight")
        assert targets["target_calories"] == round(self.tdee - 500)

    def test_gain_muscle_goal(self):
        """Gain muscle should add 300 calories (lean bulk surplus)."""
        targets = self.service.calculate_targets(**self.base_params, goal="gain_muscle")
        assert targets["target_calories"] == round(self.tdee + 300)

    def test_lose_weight_with_enum(self):
        targets = self.service.calculate_targets(**self.base_params, goal=NutritionGoal.LOSE_WEIGHT)
        assert targets["target_calories"] == round(self.tdee - 500)

    def test_gain_muscle_with_enum(self):
        targets = self.service.calculate_targets(**self.base_params, goal=NutritionGoal.GAIN_MUSCLE)
        assert targets["target_calories"] == round(self.tdee + 300)


@pytest.mark.unit
class TestMacroTargets:
    """Test macro target calculation (30/40/30 split)."""

    def test_macro_split(self, session: Session):
        """Macros should follow 30% protein, 40% carbs, 30% fat split."""
        service = NutritionService(session)
        targets = service.calculate_targets(
            height_cm=180.0,
            weight_kg=80.0,
            age=30,
            gender="male",
            activity_level="moderately_active",
            goal="maintain",
        )

        cal = targets["target_calories"]

        # 30% protein at 4 cal/g
        assert targets["target_protein_g"] == round((cal * 0.30) / 4)
        # 40% carbs at 4 cal/g
        assert targets["target_carbs_g"] == round((cal * 0.40) / 4)
        # 30% fat at 9 cal/g
        assert targets["target_fat_g"] == round((cal * 0.30) / 9)

    def test_macro_split_lose_weight(self, session: Session):
        """Macro split should apply to adjusted calorie target, not TDEE."""
        service = NutritionService(session)
        targets = service.calculate_targets(
            height_cm=165.0,
            weight_kg=70.0,
            age=40,
            gender="female",
            activity_level="lightly_active",
            goal="lose_weight",
        )

        cal = targets["target_calories"]
        assert targets["target_protein_g"] == round((cal * 0.30) / 4)
        assert targets["target_carbs_g"] == round((cal * 0.40) / 4)
        assert targets["target_fat_g"] == round((cal * 0.30) / 9)


@pytest.mark.unit
class TestCreateOrUpdateProfile:
    """Test NutritionService.create_or_update_profile."""

    def test_create_profile(self, session: Session, test_user: User):
        """Creating a profile should auto-calculate targets."""
        service = NutritionService(session)
        profile_data = UserNutritionProfileCreate(
            height_cm=180.0,
            weight_kg=80.0,
            age=30,
            gender=Gender.MALE,
            activity_level=ActivityLevel.MODERATELY_ACTIVE,
            goal=NutritionGoal.MAINTAIN,
        )

        profile = service.create_or_update_profile(test_user.id, profile_data)

        assert profile.id is not None
        assert profile.user_id == test_user.id
        # BMR = 1780, TDEE = 1780 * 1.55 = 2759
        assert profile.target_calories == round(1780 * 1.55)

    def test_update_existing_profile(self, session: Session, test_user: User):
        """Updating an existing profile should recalculate targets."""
        service = NutritionService(session)
        # Create initial
        initial = UserNutritionProfileCreate(
            height_cm=180.0,
            weight_kg=80.0,
            age=30,
            gender=Gender.MALE,
            activity_level=ActivityLevel.SEDENTARY,
            goal=NutritionGoal.MAINTAIN,
        )
        service.create_or_update_profile(test_user.id, initial)

        # Update to more active
        updated_data = UserNutritionProfileCreate(
            height_cm=180.0,
            weight_kg=80.0,
            age=30,
            gender=Gender.MALE,
            activity_level=ActivityLevel.VERY_ACTIVE,
            goal=NutritionGoal.MAINTAIN,
        )
        profile = service.create_or_update_profile(test_user.id, updated_data)

        assert profile.target_calories == round(1780 * 1.725)

    def test_get_profile(self, session: Session, test_user: User):
        """Should retrieve existing profile."""
        service = NutritionService(session)
        service.create_or_update_profile(
            test_user.id,
            UserNutritionProfileCreate(
                height_cm=170.0,
                weight_kg=65.0,
                age=25,
                gender=Gender.FEMALE,
            ),
        )

        profile = service.get_profile(test_user.id)
        assert profile is not None
        assert profile.user_id == test_user.id

    def test_get_profile_nonexistent(self, session: Session):
        """Should return None for a user with no profile."""
        service = NutritionService(session)
        assert service.get_profile(99999) is None
