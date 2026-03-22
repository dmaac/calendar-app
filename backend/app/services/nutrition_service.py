from typing import Optional
from datetime import datetime, date
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select
from ..models.nutrition_profile import (
    UserNutritionProfile,
    UserNutritionProfileCreate,
    UserNutritionProfileUpdate,
    Gender,
    ActivityLevel,
    NutritionGoal,
)
from ..models.onboarding_profile import OnboardingProfile


class NutritionService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_profile(self, user_id: int) -> Optional[UserNutritionProfile]:
        statement = select(UserNutritionProfile).where(
            UserNutritionProfile.user_id == user_id
        )
        result = await self.session.exec(statement)
        return result.first()

    async def create_or_update_profile(
        self, user_id: int, profile_data: UserNutritionProfileCreate
    ) -> UserNutritionProfile:
        existing = await self.get_profile(user_id)

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
            await self.session.commit()
            await self.session.refresh(existing)
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
            await self.session.commit()
            await self.session.refresh(profile)
            return profile

    async def update_profile(
        self, user_id: int, profile_update: UserNutritionProfileUpdate
    ) -> Optional[UserNutritionProfile]:
        profile = await self.get_profile(user_id)
        if not profile:
            return None

        update_data = profile_update.dict(exclude_unset=True)
        if update_data:
            for field, value in update_data.items():
                setattr(profile, field, value)
            profile.updated_at = datetime.utcnow()
            self.session.add(profile)
            await self.session.commit()
            await self.session.refresh(profile)

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

    async def get_profile_with_fallback(self, user_id: int) -> Optional[UserNutritionProfile]:
        """Get UserNutritionProfile, falling back to generating one from OnboardingProfile."""
        profile = await self.get_profile(user_id)
        if profile:
            return profile

        # Fallback: generate from OnboardingProfile
        stmt = select(OnboardingProfile).where(OnboardingProfile.user_id == user_id)
        result = await self.session.exec(stmt)
        onboarding = result.first()
        if not onboarding:
            return None

        # Derive age from birth_date
        age = 30
        if onboarding.birth_date:
            today = date.today()
            age = (
                today.year
                - onboarding.birth_date.year
                - ((today.month, today.day) < (onboarding.birth_date.month, onboarding.birth_date.day))
            )

        # Map onboarding goal to NutritionGoal
        goal = NutritionGoal.MAINTAIN
        raw_goal = (onboarding.goal or "").lower()
        if "lose" in raw_goal:
            goal = NutritionGoal.LOSE_WEIGHT
        elif "gain" in raw_goal:
            goal = NutritionGoal.GAIN_MUSCLE

        # Map gender
        gender = None
        if onboarding.gender:
            g = onboarding.gender.lower()
            if g == "male":
                gender = Gender.MALE
            elif g == "female":
                gender = Gender.FEMALE
            else:
                gender = Gender.OTHER

        # Map workouts_per_week to activity level
        workouts = onboarding.workouts_per_week or 3
        if workouts == 0:
            activity_level = ActivityLevel.SEDENTARY
        elif workouts <= 2:
            activity_level = ActivityLevel.LIGHTLY_ACTIVE
        elif workouts <= 4:
            activity_level = ActivityLevel.MODERATELY_ACTIVE
        elif workouts <= 6:
            activity_level = ActivityLevel.VERY_ACTIVE
        else:
            activity_level = ActivityLevel.EXTRA_ACTIVE

        # Use onboarding calculated values if available, otherwise compute
        if onboarding.daily_calories and onboarding.daily_protein_g:
            target_calories = float(onboarding.daily_calories)
            target_protein_g = float(onboarding.daily_protein_g)
            target_carbs_g = float(onboarding.daily_carbs_g or 250)
            target_fat_g = float(onboarding.daily_fats_g or 65)
        else:
            height = onboarding.height_cm or 170.0
            weight = onboarding.weight_kg or 70.0
            targets = self.calculate_targets(
                height_cm=height,
                weight_kg=weight,
                age=age,
                gender=gender.value if gender else "other",
                activity_level=activity_level.value,
                goal=goal.value,
            )
            target_calories = targets["target_calories"]
            target_protein_g = targets["target_protein_g"]
            target_carbs_g = targets["target_carbs_g"]
            target_fat_g = targets["target_fat_g"]

        # Create and persist the profile so future requests are fast
        new_profile = UserNutritionProfile(
            user_id=user_id,
            height_cm=onboarding.height_cm,
            weight_kg=onboarding.weight_kg,
            age=age,
            gender=gender,
            activity_level=activity_level,
            goal=goal,
            target_calories=target_calories,
            target_protein_g=target_protein_g,
            target_carbs_g=target_carbs_g,
            target_fat_g=target_fat_g,
        )
        self.session.add(new_profile)
        await self.session.commit()
        await self.session.refresh(new_profile)
        return new_profile

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
