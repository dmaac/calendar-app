from typing import Optional
from datetime import datetime
from sqlmodel import Session, select
from ..models.nutrition_profile import (
    UserNutritionProfile,
    UserNutritionProfileCreate,
    UserNutritionProfileUpdate,
    Gender,
    ActivityLevel,
    NutritionGoal,
)


class NutritionService:
    def __init__(self, session: Session):
        self.session = session

    def get_profile(self, user_id: int) -> Optional[UserNutritionProfile]:
        statement = select(UserNutritionProfile).where(
            UserNutritionProfile.user_id == user_id
        )
        return self.session.exec(statement).first()

    def create_or_update_profile(
        self, user_id: int, profile_data: UserNutritionProfileCreate
    ) -> UserNutritionProfile:
        existing = self.get_profile(user_id)

        if existing:
            update_data = profile_data.dict(exclude_unset=True)
            for field, value in update_data.items():
                setattr(existing, field, value)

            # Auto-calculate targets if we have enough data
            targets = self._calculate_targets(existing)
            existing.target_calories = targets["target_calories"]
            existing.target_protein_g = targets["target_protein_g"]
            existing.target_carbs_g = targets["target_carbs_g"]
            existing.target_fat_g = targets["target_fat_g"]
            existing.updated_at = datetime.utcnow()

            self.session.add(existing)
            self.session.commit()
            self.session.refresh(existing)
            return existing
        else:
            profile = UserNutritionProfile(
                user_id=user_id,
                **profile_data.dict(),
            )

            # Auto-calculate targets if we have enough data
            targets = self._calculate_targets(profile)
            profile.target_calories = targets["target_calories"]
            profile.target_protein_g = targets["target_protein_g"]
            profile.target_carbs_g = targets["target_carbs_g"]
            profile.target_fat_g = targets["target_fat_g"]

            self.session.add(profile)
            self.session.commit()
            self.session.refresh(profile)
            return profile

    def update_profile(
        self, user_id: int, profile_update: UserNutritionProfileUpdate
    ) -> Optional[UserNutritionProfile]:
        profile = self.get_profile(user_id)
        if not profile:
            return None

        update_data = profile_update.dict(exclude_unset=True)
        if update_data:
            for field, value in update_data.items():
                setattr(profile, field, value)
            profile.updated_at = datetime.utcnow()
            self.session.add(profile)
            self.session.commit()
            self.session.refresh(profile)

        return profile

    def calculate_targets(
        self,
        height_cm: float,
        weight_kg: float,
        age: int,
        gender: str,
        activity_level: str,
        goal: str,
    ) -> dict:
        """Calculate calorie and macro targets using Mifflin-St Jeor equation."""
        # Mifflin-St Jeor BMR
        if gender == Gender.MALE or gender == "male":
            bmr = (10 * weight_kg) + (6.25 * height_cm) - (5 * age) + 5
        else:
            bmr = (10 * weight_kg) + (6.25 * height_cm) - (5 * age) - 161

        # Activity multiplier
        multipliers = {
            ActivityLevel.SEDENTARY: 1.2,
            ActivityLevel.LIGHTLY_ACTIVE: 1.375,
            ActivityLevel.MODERATELY_ACTIVE: 1.55,
            ActivityLevel.VERY_ACTIVE: 1.725,
            ActivityLevel.EXTRA_ACTIVE: 1.9,
            "sedentary": 1.2,
            "lightly_active": 1.375,
            "moderately_active": 1.55,
            "very_active": 1.725,
            "extra_active": 1.9,
        }
        multiplier = multipliers.get(activity_level, 1.55)
        tdee = bmr * multiplier

        # Goal adjustment
        if goal == NutritionGoal.LOSE_WEIGHT or goal == "lose_weight":
            target_calories = tdee - 500  # ~0.5kg/week deficit
        elif goal == NutritionGoal.GAIN_MUSCLE or goal == "gain_muscle":
            target_calories = tdee + 300  # lean bulk surplus
        else:
            target_calories = tdee

        target_calories = round(target_calories)

        # Macro split: 30% protein, 40% carbs, 30% fat
        target_protein_g = round((target_calories * 0.30) / 4)
        target_carbs_g = round((target_calories * 0.40) / 4)
        target_fat_g = round((target_calories * 0.30) / 9)

        return {
            "target_calories": target_calories,
            "target_protein_g": target_protein_g,
            "target_carbs_g": target_carbs_g,
            "target_fat_g": target_fat_g,
        }

    def _calculate_targets(self, profile: UserNutritionProfile) -> dict:
        """Internal helper: calculate targets from a profile if enough data exists."""
        if profile.height_cm and profile.weight_kg and profile.age and profile.gender:
            return self.calculate_targets(
                height_cm=profile.height_cm,
                weight_kg=profile.weight_kg,
                age=profile.age,
                gender=profile.gender,
                activity_level=profile.activity_level,
                goal=profile.goal,
            )
        # Return current defaults if not enough data
        return {
            "target_calories": profile.target_calories,
            "target_protein_g": profile.target_protein_g,
            "target_carbs_g": profile.target_carbs_g,
            "target_fat_g": profile.target_fat_g,
        }
