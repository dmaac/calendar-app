"""
Nutrition Service
-----------------
Manages UserNutritionProfile CRUD and calorie/macro target calculations
using the Mifflin-St Jeor equation.

All DB operations are async. Targets are auto-recalculated when enough
anthropometric data is present.
"""

import logging
from typing import Optional

from datetime import datetime, date, timezone
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select
from ..core.cache import (
    cache_get, cache_set, cache_delete,
    nutrition_profile_key, CACHE_TTL,
)
from ..models.nutrition_profile import (
    UserNutritionProfile,
    UserNutritionProfileCreate,
    UserNutritionProfileUpdate,
    Gender,
    ActivityLevel,
    NutritionGoal,
)
from ..models.onboarding_profile import OnboardingProfile

logger = logging.getLogger(__name__)

# Clinical safety minimums (kcal) -- should never auto-calculate below these
_CALORIE_FLOOR_MALE = 1500
_CALORIE_FLOOR_FEMALE = 1200
_CALORIE_FLOOR_OTHER = 1200


class NutritionService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_profile(self, user_id: int) -> Optional[UserNutritionProfile]:
        """Fetch the nutrition profile for a user, or None if not found.

        Results are cached in Redis for 5 minutes to avoid repeated DB lookups
        on the hot path (this is called on every daily summary, meal log, etc.).
        """
        cache_key = nutrition_profile_key(user_id)
        try:
            cached = await cache_get(cache_key)
            if cached is not None:
                return UserNutritionProfile(**cached)
        except Exception:
            pass

        statement = select(UserNutritionProfile).where(
            UserNutritionProfile.user_id == user_id
        )
        result = await self.session.execute(statement)
        profile = result.scalar_one_or_none()

        if profile is not None:
            try:
                await cache_set(
                    cache_key,
                    profile.model_dump(mode="json"),
                    CACHE_TTL["nutrition_profile"],
                )
            except Exception:
                pass

        return profile

    async def create_or_update_profile(
        self, user_id: int, profile_data: UserNutritionProfileCreate
    ) -> UserNutritionProfile:
        """Create a new nutrition profile or update an existing one.

        Auto-recalculates calorie/macro targets when sufficient data is present
        (height, weight, age, gender).
        """
        try:
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
                existing.updated_at = datetime.now(timezone.utc)

                self.session.add(existing)
                await self.session.commit()
                await self.session.refresh(existing)
                # Invalidate cached profile
                try:
                    await cache_delete(nutrition_profile_key(user_id))
                except Exception:
                    pass
                logger.info(
                    "Nutrition profile updated: user_id=%d calories=%d",
                    user_id, existing.target_calories,
                )
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
                # Invalidate cached profile
                try:
                    await cache_delete(nutrition_profile_key(user_id))
                except Exception:
                    pass
                logger.info(
                    "Nutrition profile created: user_id=%d calories=%d",
                    user_id, profile.target_calories,
                )
                return profile
        except Exception:
            await self.session.rollback()
            logger.exception("Failed to create/update nutrition profile: user_id=%d", user_id)
            raise

    async def update_profile(
        self, user_id: int, profile_update: UserNutritionProfileUpdate
    ) -> Optional[UserNutritionProfile]:
        """Partially update a nutrition profile.

        Returns the updated profile, or None if no profile exists for the user.
        """
        profile = await self.get_profile(user_id)
        if not profile:
            return None

        update_data = profile_update.dict(exclude_unset=True)
        if not update_data:
            return profile

        try:
            for field, value in update_data.items():
                setattr(profile, field, value)
            profile.updated_at = datetime.now(timezone.utc)
            self.session.add(profile)
            await self.session.commit()
            await self.session.refresh(profile)
            # Invalidate cached profile
            try:
                await cache_delete(nutrition_profile_key(user_id))
            except Exception:
                pass
            logger.info("Nutrition profile patched: user_id=%d fields=%s", user_id, list(update_data.keys()))
            return profile
        except Exception:
            await self.session.rollback()
            logger.exception("Failed to update nutrition profile: user_id=%d", user_id)
            raise

    def calculate_targets(
        self,
        height_cm: float,
        weight_kg: float,
        age: int,
        gender: str,
        activity_level: str,
        goal: str,
    ) -> dict:
        """Calculate calorie and macro targets using Mifflin-St Jeor equation.

        Args:
            height_cm: Height in centimeters (must be > 0).
            weight_kg: Weight in kilograms (must be > 0).
            age: Age in years (must be > 0).
            gender: One of 'male', 'female', 'other' (or Gender enum value).
            activity_level: One of 'sedentary', 'lightly_active', 'moderately_active',
                            'very_active', 'extra_active' (or ActivityLevel enum value).
            goal: One of 'lose_weight', 'maintain', 'gain_muscle'
                  (or NutritionGoal enum value).

        Returns:
            dict with target_calories, target_protein_g, target_carbs_g, target_fat_g.

        Raises:
            ValueError: If height_cm, weight_kg, or age are non-positive.
        """
        # --- Input validation ---
        if height_cm <= 0:
            raise ValueError(f"height_cm must be positive, got {height_cm}")
        if weight_kg <= 0:
            raise ValueError(f"weight_kg must be positive, got {weight_kg}")
        if age <= 0 or age > 150:
            raise ValueError(f"age must be between 1 and 150, got {age}")

        # --- Normalize enum values to strings for comparison ---
        gender_str = gender.value if isinstance(gender, Gender) else str(gender).lower()
        activity_str = activity_level.value if isinstance(activity_level, ActivityLevel) else str(activity_level).lower()
        goal_str = goal.value if isinstance(goal, NutritionGoal) else str(goal).lower()

        # Mifflin-St Jeor BMR
        if gender_str == "male":
            bmr = (10 * weight_kg) + (6.25 * height_cm) - (5 * age) + 5
        else:
            bmr = (10 * weight_kg) + (6.25 * height_cm) - (5 * age) - 161

        # Activity multiplier
        multipliers = {
            "sedentary": 1.2,
            "lightly_active": 1.375,
            "moderately_active": 1.55,
            "very_active": 1.725,
            "extra_active": 1.9,
        }
        multiplier = multipliers.get(activity_str, 1.55)
        tdee = bmr * multiplier

        # Goal adjustment
        if goal_str == "lose_weight":
            target_calories = tdee - 500  # ~0.5kg/week deficit
        elif goal_str == "gain_muscle":
            target_calories = tdee + 300  # lean bulk surplus
        else:
            target_calories = tdee

        target_calories = round(target_calories)

        # Gender-differentiated calorie floor (clinical safety minimum)
        if gender_str == "male":
            target_calories = max(_CALORIE_FLOOR_MALE, target_calories)
        else:
            target_calories = max(_CALORIE_FLOOR_FEMALE, target_calories)

        # Macro split: 30% protein, 40% carbs, 30% fat
        # Protein: 4 kcal/g, Carbs: 4 kcal/g, Fat: 9 kcal/g
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
        """Get UserNutritionProfile, falling back to generating one from OnboardingProfile.

        If no UserNutritionProfile exists but an OnboardingProfile does, a new
        UserNutritionProfile is derived and persisted so future requests are fast.

        Returns None only when neither profile exists.
        """
        profile = await self.get_profile(user_id)
        if profile:
            return profile

        # Fallback: generate from OnboardingProfile
        stmt = select(OnboardingProfile).where(OnboardingProfile.user_id == user_id)
        result = await self.session.execute(stmt)
        onboarding = result.scalar_one_or_none()
        if not onboarding:
            return None

        # Derive age from birth_date
        age = 30  # sensible default if birth_date is missing
        if onboarding.birth_date:
            today = date.today()
            age = (
                today.year
                - onboarding.birth_date.year
                - ((today.month, today.day) < (onboarding.birth_date.month, onboarding.birth_date.day))
            )
            # Guard against nonsensical ages from bad data
            if age <= 0 or age > 150:
                logger.warning(
                    "Computed invalid age %d from birth_date %s for user_id=%d, defaulting to 30",
                    age, onboarding.birth_date, user_id,
                )
                age = 30

        # Map onboarding goal to NutritionGoal
        goal = NutritionGoal.MAINTAIN
        raw_goal = (onboarding.goal or "").lower()
        if "lose" in raw_goal:
            goal = NutritionGoal.LOSE_WEIGHT
        elif "gain" in raw_goal:
            goal = NutritionGoal.GAIN_MUSCLE

        # Map gender
        gender = Gender.OTHER
        if onboarding.gender:
            g = onboarding.gender.lower()
            if g == "male":
                gender = Gender.MALE
            elif g == "female":
                gender = Gender.FEMALE

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
                gender=gender.value,
                activity_level=activity_level.value,
                goal=goal.value,
            )
            target_calories = targets["target_calories"]
            target_protein_g = targets["target_protein_g"]
            target_carbs_g = targets["target_carbs_g"]
            target_fat_g = targets["target_fat_g"]

        try:
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
            logger.info(
                "Nutrition profile auto-created from onboarding: user_id=%d calories=%d",
                user_id, new_profile.target_calories,
            )
            return new_profile
        except Exception:
            await self.session.rollback()
            logger.exception("Failed to auto-create nutrition profile from onboarding: user_id=%d", user_id)
            raise

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
