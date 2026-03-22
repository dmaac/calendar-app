from typing import Optional
from datetime import datetime, date, timedelta
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select

from ..models.onboarding_profile import OnboardingProfile
from ..schemas.onboarding import OnboardingStepSave, OnboardingComplete, NutritionPlan


class OnboardingService:
    def __init__(self, session: AsyncSession):
        self.session = session

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def get_profile(self, user_id: int) -> Optional[OnboardingProfile]:
        statement = select(OnboardingProfile).where(
            OnboardingProfile.user_id == user_id
        )
        result = await self.session.exec(statement)
        return result.first()

    async def save_or_update_profile(
        self, user_id: int, data: OnboardingStepSave
    ) -> OnboardingProfile:
        """Upsert onboarding profile — only overwrites fields that are not None."""
        profile = await self.get_profile(user_id)

        update_data = data.model_dump(exclude_unset=True, exclude_none=True)

        if profile:
            for field, value in update_data.items():
                setattr(profile, field, value)
            profile.updated_at = datetime.utcnow()
        else:
            profile = OnboardingProfile(user_id=user_id, **update_data)

        self.session.add(profile)
        await self.session.commit()
        await self.session.refresh(profile)
        return profile

    async def complete_onboarding(
        self, user_id: int, data: OnboardingComplete
    ) -> OnboardingProfile:
        """Save all onboarding data, calculate nutrition plan, mark as completed."""
        profile = await self.get_profile(user_id)

        update_data = data.model_dump()

        if profile:
            for field, value in update_data.items():
                setattr(profile, field, value)
            profile.updated_at = datetime.utcnow()
        else:
            profile = OnboardingProfile(user_id=user_id, **update_data)

        # Calculate and persist the nutrition plan
        plan = self.calculate_nutrition_plan(profile)
        profile.daily_calories = plan.daily_calories
        profile.daily_carbs_g = plan.carbs_g
        profile.daily_protein_g = plan.protein_g
        profile.daily_fats_g = plan.fats_g
        profile.health_score = plan.health_score
        profile.completed_at = datetime.utcnow()
        profile.updated_at = datetime.utcnow()

        self.session.add(profile)
        await self.session.commit()
        await self.session.refresh(profile)
        return profile

    # ------------------------------------------------------------------
    # Nutrition calculation
    # ------------------------------------------------------------------

    def calculate_nutrition_plan(self, profile: OnboardingProfile) -> NutritionPlan:
        """
        Calculate a personalised nutrition plan using the Mifflin-St Jeor BMR.

        Activity is approximated from workouts_per_week:
          0   -> sedentary      (x1.2)
          1-2 -> lightly active (x1.375)
          3-4 -> moderately     (x1.55)
          5-6 -> very active    (x1.725)
          7+  -> extra active   (x1.9)
        """
        height_cm = profile.height_cm or 170.0
        weight_kg = profile.weight_kg or 70.0
        gender = (profile.gender or "other").lower()
        workouts = profile.workouts_per_week or 3

        # Age from birth_date; fallback to 30
        age = 30
        if profile.birth_date:
            today = date.today()
            age = (
                today.year
                - profile.birth_date.year
                - (
                    (today.month, today.day)
                    < (profile.birth_date.month, profile.birth_date.day)
                )
            )

        # Mifflin-St Jeor BMR
        if gender == "male":
            bmr = (10 * weight_kg) + (6.25 * height_cm) - (5 * age) + 5
        else:
            bmr = (10 * weight_kg) + (6.25 * height_cm) - (5 * age) - 161

        # Activity multiplier
        if workouts == 0:
            multiplier = 1.2
        elif workouts <= 2:
            multiplier = 1.375
        elif workouts <= 4:
            multiplier = 1.55
        elif workouts <= 6:
            multiplier = 1.725
        else:
            multiplier = 1.9

        tdee = bmr * multiplier

        # Goal adjustment
        goal = (profile.goal or "maintain").lower()
        weekly_speed = profile.weekly_speed_kg or 0.8
        daily_deficit = (weekly_speed * 7700) / 7  # 7700 kcal per kg

        if "lose" in goal:
            target_calories = tdee - daily_deficit
        elif "gain" in goal:
            # Cap surplus at 500 kcal/day to prevent excessive bulk
            target_calories = tdee + min(daily_deficit, 500)
        else:
            target_calories = tdee

        # Gender-differentiated calorie floor (clinical safety minimum)
        if gender == "male":
            target_calories = max(1500, round(target_calories))
        else:
            target_calories = max(1200, round(target_calories))

        # Macro split: 30% protein, 40% carbs, 30% fat (by calories)
        protein_g = round((target_calories * 0.30) / 4)
        carbs_g = round((target_calories * 0.40) / 4)
        fats_g = round((target_calories * 0.30) / 9)

        # Health score: simple heuristic 0-100
        health_score = self._compute_health_score(
            target_calories=target_calories,
            tdee=tdee,
            workouts=workouts,
        )

        # Estimated target date
        target_date: Optional[date] = None
        if profile.target_weight_kg and weight_kg and weekly_speed > 0:
            diff_kg = abs(weight_kg - profile.target_weight_kg)
            weeks_needed = diff_kg / weekly_speed
            target_date = date.today() + timedelta(weeks=weeks_needed)

        return NutritionPlan(
            daily_calories=target_calories,
            carbs_g=carbs_g,
            protein_g=protein_g,
            fats_g=fats_g,
            health_score=health_score,
            target_date=target_date,
        )

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _compute_health_score(
        self, target_calories: float, tdee: float, workouts: int
    ) -> float:
        """
        Simple heuristic health score (0-100).
        Penalises very aggressive deficits and rewards activity.
        """
        score = 70.0

        # Deficit ratio penalty (> 25% deficit is risky)
        if tdee > 0:
            deficit_ratio = (tdee - target_calories) / tdee
            if deficit_ratio > 0.25:
                score -= (deficit_ratio - 0.25) * 100

        # Activity bonus (up to +15)
        activity_bonus = min(workouts * 2.5, 15.0)
        score += activity_bonus

        return round(min(max(score, 0.0), 100.0), 1)
