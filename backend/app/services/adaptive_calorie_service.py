"""
Adaptive Calorie Service — Intelligent metabolic adjustment engine.

Compares predicted weight loss/gain (based on calorie intake vs TDEE) against
actual weight recorded by the user. When the trajectory diverges, the system
recommends a calorie target adjustment.

Scientific references:
  - Helms et al., 2014: Rate-based guidelines for lean-mass retention during cuts.
    Recommended loss rate: 0.5-1.0% bodyweight/week.
  - Hall et al., 2011: 1 lb fat ~ 3500 kcal deficit (first-order approximation).
  - ACSM Position Stand: Never go below BMR for sustained periods.
  - Maximum sustainable deficit: 25% of TDEE.

Key rules:
  1. Never recommend calories below BMR.
  2. Never create a deficit greater than 25% of TDEE.
  3. If losing >1% bodyweight/week, increase calories (muscle protection).
  4. If no progress in 2+ weeks with a loss goal, decrease calories 5-10%.
  5. If on track (within +/-0.5% bodyweight/week for loss), maintain.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..models.ai_food_log import AIFoodLog
from ..models.calorie_adjustment import (
    AdjustmentReason,
    AdaptiveTargetResponse,
    ApplyAdjustmentResponse,
    CalorieAdjustment,
    CalorieAdjustmentRead,
    WeightLog,
    WeightLogCreate,
    WeightLogRead,
    WeightTrend,
)
from ..models.nutrition_profile import (
    ActivityLevel,
    Gender,
    NutritionGoal,
    UserNutritionProfile,
)
from ..models.onboarding_profile import OnboardingProfile

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

KCAL_PER_KG_FAT = 7700  # ~3500 kcal/lb = ~7700 kcal/kg
MAX_DEFICIT_FRACTION = 0.25  # Never exceed 25% TDEE deficit
MAX_LOSS_RATE_PCT = 1.0  # Max 1% bodyweight/week (Helms et al.)
ON_TRACK_TOLERANCE_PCT = 0.5  # +/-0.5% bodyweight/week is "on track"
MIN_WEEKS_NO_PROGRESS = 2  # Weeks without progress before adjusting down
ADJUSTMENT_STEP_PCT = 0.075  # 7.5% step size for adjustments (midpoint of 5-10%)
MIN_ADJUSTMENT_KCAL = 50  # Minimum meaningful adjustment
MAX_ADJUSTMENT_KCAL = 300  # Cap single-step adjustment


# ---------------------------------------------------------------------------
# Service class
# ---------------------------------------------------------------------------

class AdaptiveCalorieService:
    def __init__(self, session: AsyncSession):
        self.session = session

    # -----------------------------------------------------------------------
    # Weight log CRUD
    # -----------------------------------------------------------------------

    async def log_weight(
        self, user_id: int, data: WeightLogCreate
    ) -> WeightLog:
        """Record a weight entry. Replaces any existing entry for the same date."""
        entry_date = data.date or date.today()

        # Check for existing entry on this date
        stmt = select(WeightLog).where(
            WeightLog.user_id == user_id,
            WeightLog.date == entry_date,
        )
        result = await self.session.execute(stmt)
        existing = result.scalars().first()

        if existing:
            existing.weight_kg = data.weight_kg
            existing.source = data.source
            existing.notes = data.notes
            self.session.add(existing)
            await self.session.commit()
            await self.session.refresh(existing)
            return existing

        entry = WeightLog(
            user_id=user_id,
            date=entry_date,
            weight_kg=data.weight_kg,
            source=data.source,
            notes=data.notes,
        )
        self.session.add(entry)
        await self.session.commit()
        await self.session.refresh(entry)

        # Also update the nutrition profile's weight_kg to keep it current
        await self._update_profile_weight(user_id, data.weight_kg)

        return entry

    async def get_weight_history(
        self, user_id: int, days: int = 90
    ) -> list[WeightLog]:
        """Return weight entries for the last N days, ordered by date."""
        since = date.today() - timedelta(days=days)
        stmt = (
            select(WeightLog)
            .where(WeightLog.user_id == user_id, WeightLog.date >= since)
            .order_by(WeightLog.date.asc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_latest_weight(self, user_id: int) -> Optional[WeightLog]:
        """Most recent weight entry for a user."""
        stmt = (
            select(WeightLog)
            .where(WeightLog.user_id == user_id)
            .order_by(WeightLog.date.desc())
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalars().first()

    # -----------------------------------------------------------------------
    # BMR / TDEE helpers
    # -----------------------------------------------------------------------

    def _calculate_bmr(
        self,
        weight_kg: float,
        height_cm: float,
        age: int,
        gender: Optional[str],
    ) -> float:
        """Mifflin-St Jeor BMR calculation."""
        if gender and gender.lower() == "male":
            return (10 * weight_kg) + (6.25 * height_cm) - (5 * age) + 5
        else:
            return (10 * weight_kg) + (6.25 * height_cm) - (5 * age) - 161

    def _activity_multiplier(self, activity_level: Optional[str]) -> float:
        """Activity level to TDEE multiplier."""
        multipliers = {
            "sedentary": 1.2,
            "lightly_active": 1.375,
            "moderately_active": 1.55,
            "very_active": 1.725,
            "extra_active": 1.9,
        }
        if activity_level:
            # Handle both enum and string values
            level_str = activity_level.value if hasattr(activity_level, 'value') else str(activity_level)
            return multipliers.get(level_str, 1.55)
        return 1.55

    def _calculate_tdee(
        self,
        weight_kg: float,
        height_cm: float,
        age: int,
        gender: Optional[str],
        activity_level: Optional[str],
    ) -> float:
        """TDEE = BMR * activity multiplier."""
        bmr = self._calculate_bmr(weight_kg, height_cm, age, gender)
        return bmr * self._activity_multiplier(activity_level)

    # -----------------------------------------------------------------------
    # Calorie intake aggregation
    # -----------------------------------------------------------------------

    async def _get_weekly_avg_calories(
        self, user_id: int, week_start: date, week_end: date
    ) -> Optional[float]:
        """Average daily calorie intake for a given week from food logs."""
        from datetime import time as dt_time

        day_start = datetime.combine(week_start, dt_time.min)
        day_end = datetime.combine(week_end, dt_time.max)

        stmt = select(
            func.avg(
                func.coalesce(
                    select(func.sum(AIFoodLog.calories))
                    .where(
                        AIFoodLog.user_id == user_id,
                        func.date(AIFoodLog.logged_at) == func.date(AIFoodLog.logged_at),
                    )
                    .correlate_except(AIFoodLog)
                    .scalar_subquery(),
                    0,
                )
            )
        )

        # Simpler approach: get total calories and days with data
        total_stmt = select(func.sum(AIFoodLog.calories)).where(
            AIFoodLog.user_id == user_id,
            AIFoodLog.logged_at >= day_start,
            AIFoodLog.logged_at <= day_end,
            AIFoodLog.deleted_at.is_(None),
        )
        total_result = await self.session.execute(total_stmt)
        total_calories = total_result.scalar()

        if total_calories is None:
            return None

        # Count distinct days with food logged
        days_stmt = select(func.count(func.distinct(func.date(AIFoodLog.logged_at)))).where(
            AIFoodLog.user_id == user_id,
            AIFoodLog.logged_at >= day_start,
            AIFoodLog.logged_at <= day_end,
            AIFoodLog.deleted_at.is_(None),
        )
        days_result = await self.session.execute(days_stmt)
        days_with_data = days_result.scalar() or 0

        if days_with_data == 0:
            return None

        return float(total_calories) / days_with_data

    async def _get_daily_calories_for_period(
        self, user_id: int, start: date, end: date
    ) -> list[tuple[date, float]]:
        """Get daily total calories for each day in a period."""
        from datetime import time as dt_time

        day_start = datetime.combine(start, dt_time.min)
        day_end = datetime.combine(end, dt_time.max)

        stmt = (
            select(
                func.date(AIFoodLog.logged_at).label("log_date"),
                func.sum(AIFoodLog.calories).label("total_cal"),
            )
            .where(
                AIFoodLog.user_id == user_id,
                AIFoodLog.logged_at >= day_start,
                AIFoodLog.logged_at <= day_end,
            )
            .group_by(func.date(AIFoodLog.logged_at))
            .order_by(func.date(AIFoodLog.logged_at))
        )
        result = await self.session.execute(stmt)
        return [(row.log_date, float(row.total_cal)) for row in result.all()]

    # -----------------------------------------------------------------------
    # Profile data retrieval
    # -----------------------------------------------------------------------

    async def _get_user_profile_data(self, user_id: int) -> dict:
        """
        Retrieve the user's physical metrics from NutritionProfile or OnboardingProfile.
        Returns dict with: weight_kg, height_cm, age, gender, activity_level, goal,
        target_calories, target_weight_kg.
        """
        # Try nutrition profile first
        stmt = select(UserNutritionProfile).where(
            UserNutritionProfile.user_id == user_id
        )
        result = await self.session.execute(stmt)
        profile = result.scalars().first()

        # Also get onboarding for target_weight
        ob_stmt = select(OnboardingProfile).where(
            OnboardingProfile.user_id == user_id
        )
        ob_result = await self.session.execute(ob_stmt)
        onboarding = ob_result.scalars().first()

        # Get latest weight from weight log if available
        latest_weight_entry = await self.get_latest_weight(user_id)

        if profile:
            weight = latest_weight_entry.weight_kg if latest_weight_entry else (profile.weight_kg or 70.0)
            gender_str = profile.gender.value if profile.gender else "other"
            activity_str = profile.activity_level.value if profile.activity_level else "moderately_active"
            goal_str = profile.goal.value if profile.goal else "maintain"

            return {
                "weight_kg": weight,
                "height_cm": profile.height_cm or 170.0,
                "age": profile.age or 30,
                "gender": gender_str,
                "activity_level": activity_str,
                "goal": goal_str,
                "target_calories": int(profile.target_calories),
                "target_weight_kg": onboarding.target_weight_kg if onboarding else None,
            }

        if onboarding:
            weight = latest_weight_entry.weight_kg if latest_weight_entry else (onboarding.weight_kg or 70.0)
            age = 30
            if onboarding.birth_date:
                today = date.today()
                age = (
                    today.year
                    - onboarding.birth_date.year
                    - (
                        (today.month, today.day)
                        < (onboarding.birth_date.month, onboarding.birth_date.day)
                    )
                )

            gender_str = (onboarding.gender or "other").lower()
            goal_raw = (onboarding.goal or "maintain").lower()
            goal_str = "maintain"
            if "lose" in goal_raw:
                goal_str = "lose_weight"
            elif "gain" in goal_raw:
                goal_str = "gain_muscle"

            workouts = onboarding.workouts_per_week or 3
            if workouts == 0:
                activity_str = "sedentary"
            elif workouts <= 2:
                activity_str = "lightly_active"
            elif workouts <= 4:
                activity_str = "moderately_active"
            elif workouts <= 6:
                activity_str = "very_active"
            else:
                activity_str = "extra_active"

            return {
                "weight_kg": weight,
                "height_cm": onboarding.height_cm or 170.0,
                "age": age,
                "gender": gender_str,
                "activity_level": activity_str,
                "goal": goal_str,
                "target_calories": int(onboarding.daily_calories or 2000),
                "target_weight_kg": onboarding.target_weight_kg,
            }

        # Absolute fallback
        weight = latest_weight_entry.weight_kg if latest_weight_entry else 70.0
        return {
            "weight_kg": weight,
            "height_cm": 170.0,
            "age": 30,
            "gender": "other",
            "activity_level": "moderately_active",
            "goal": "maintain",
            "target_calories": 2000,
            "target_weight_kg": None,
        }

    # -----------------------------------------------------------------------
    # Predicted weight calculation
    # -----------------------------------------------------------------------

    def calculate_predicted_weight(
        self,
        starting_weight: float,
        avg_daily_calories: float,
        tdee: float,
        days: int,
    ) -> float:
        """
        Predict weight change based on calorie balance.
        Uses the 7700 kcal/kg approximation (Hall et al., 2011).

        Args:
            starting_weight: Weight at beginning of period (kg)
            avg_daily_calories: Average daily calorie intake (kcal)
            tdee: Total daily energy expenditure (kcal)
            days: Number of days in the period

        Returns:
            Predicted weight after the period (kg)
        """
        daily_balance = avg_daily_calories - tdee
        total_balance = daily_balance * days
        weight_change_kg = total_balance / KCAL_PER_KG_FAT
        return round(starting_weight + weight_change_kg, 2)

    # -----------------------------------------------------------------------
    # Core adjustment calculation
    # -----------------------------------------------------------------------

    async def calculate_adjustment(
        self, user_id: int
    ) -> AdaptiveTargetResponse:
        """
        Calculate whether a calorie target adjustment is recommended.

        Algorithm:
        1. Get user profile (weight, height, age, gender, activity, goal, current target)
        2. Get last 2 weeks of calorie intake data
        3. Get weight entries from the last 2-4 weeks
        4. Calculate predicted weight vs actual weight
        5. Apply adjustment rules (Helms et al. guidelines)
        6. Return recommendation
        """
        profile = await self._get_user_profile_data(user_id)
        current_target = profile["target_calories"]
        weight_kg = profile["weight_kg"]
        height_cm = profile["height_cm"]
        age = profile["age"]
        gender = profile["gender"]
        activity_level = profile["activity_level"]
        goal = profile["goal"]
        target_weight_kg = profile.get("target_weight_kg")

        # Calculate BMR and TDEE
        bmr = self._calculate_bmr(weight_kg, height_cm, age, gender)
        tdee = self._calculate_tdee(weight_kg, height_cm, age, gender, activity_level)

        # Get weight entries (last 4 weeks)
        four_weeks_ago = date.today() - timedelta(weeks=4)
        weight_entries = await self.get_weight_history(user_id, days=28)

        # Get average calorie intake for the last 2 weeks
        two_weeks_ago = date.today() - timedelta(weeks=2)
        avg_calories = await self._get_weekly_avg_calories(
            user_id, two_weeks_ago, date.today()
        )

        # Check for existing pending (unapplied) adjustment
        pending = await self._get_pending_adjustment(user_id)

        # Insufficient data scenarios
        if len(weight_entries) < 2:
            return AdaptiveTargetResponse(
                current_target=current_target,
                recommended_target=current_target,
                adjustment=0,
                reason="Necesitamos al menos 2 registros de peso para analizar tu progreso. Sigue registrando tu peso semanalmente.",
                reason_code=AdjustmentReason.INSUFFICIENT_DATA.value,
                predicted_weight_this_week=None,
                actual_weight=weight_entries[-1].weight_kg if weight_entries else None,
                trend=WeightTrend.INSUFFICIENT_DATA.value,
                has_pending_adjustment=pending is not None,
                bmr=round(bmr, 0),
            )

        if avg_calories is None:
            return AdaptiveTargetResponse(
                current_target=current_target,
                recommended_target=current_target,
                adjustment=0,
                reason="No tenemos suficientes datos de alimentacion reciente. Registra tus comidas para recibir recomendaciones.",
                reason_code=AdjustmentReason.INSUFFICIENT_DATA.value,
                predicted_weight_this_week=None,
                actual_weight=weight_entries[-1].weight_kg if weight_entries else None,
                trend=WeightTrend.INSUFFICIENT_DATA.value,
                has_pending_adjustment=pending is not None,
                bmr=round(bmr, 0),
            )

        # Calculate weight trajectory
        # Get the earliest weight entry in our window as reference
        oldest_entry = weight_entries[0]
        newest_entry = weight_entries[-1]
        days_elapsed = (newest_entry.date - oldest_entry.date).days or 1

        # Actual weight change
        actual_change_kg = newest_entry.weight_kg - oldest_entry.weight_kg
        actual_weekly_change = actual_change_kg / (days_elapsed / 7.0)

        # Predicted weight based on calorie intake
        predicted_weight = self.calculate_predicted_weight(
            starting_weight=oldest_entry.weight_kg,
            avg_daily_calories=avg_calories,
            tdee=tdee,
            days=days_elapsed,
        )

        # Weight change as percentage of bodyweight per week
        weekly_loss_pct = abs(actual_weekly_change) / newest_entry.weight_kg * 100

        # Determine trend and recommendation
        trend, reason_code, adjustment_kcal, reason_text = self._apply_adjustment_rules(
            goal=goal,
            actual_weekly_change=actual_weekly_change,
            weekly_loss_pct=weekly_loss_pct,
            weight_entries=weight_entries,
            current_target=current_target,
            bmr=bmr,
            tdee=tdee,
            days_elapsed=days_elapsed,
        )

        # Calculate new target
        new_target = self._clamp_target(
            current_target + adjustment_kcal,
            bmr=bmr,
            tdee=tdee,
            gender=gender,
        )

        # Round to nearest 25 for cleaner UX
        new_target = round(new_target / 25) * 25
        final_adjustment = new_target - current_target

        # Store the adjustment record
        if abs(final_adjustment) >= MIN_ADJUSTMENT_KCAL:
            week_start = date.today() - timedelta(days=date.today().weekday())
            week_end = week_start + timedelta(days=6)

            await self._store_adjustment(
                user_id=user_id,
                week_start=week_start,
                week_end=week_end,
                predicted_weight=predicted_weight,
                actual_weight=newest_entry.weight_kg,
                weight_delta=newest_entry.weight_kg - predicted_weight,
                previous_target=current_target,
                new_target=new_target,
                adjustment_kcal=final_adjustment,
                adjustment_reason=reason_code,
                trend=trend,
            )

        return AdaptiveTargetResponse(
            current_target=current_target,
            recommended_target=new_target,
            adjustment=final_adjustment,
            reason=reason_text,
            reason_code=reason_code,
            predicted_weight_this_week=round(predicted_weight, 1),
            actual_weight=round(newest_entry.weight_kg, 1),
            trend=trend,
            has_pending_adjustment=abs(final_adjustment) >= MIN_ADJUSTMENT_KCAL,
            bmr=round(bmr, 0),
        )

    def _apply_adjustment_rules(
        self,
        goal: str,
        actual_weekly_change: float,
        weekly_loss_pct: float,
        weight_entries: list[WeightLog],
        current_target: int,
        bmr: float,
        tdee: float,
        days_elapsed: int,
    ) -> tuple[str, str, int, str]:
        """
        Apply the science-based adjustment rules.

        Returns: (trend, reason_code, adjustment_kcal, reason_text)
        """
        # Determine number of weeks with data
        weeks_elapsed = max(days_elapsed / 7.0, 1.0)

        if goal == "lose_weight":
            return self._rules_for_weight_loss(
                actual_weekly_change, weekly_loss_pct,
                weight_entries, current_target, bmr, tdee, weeks_elapsed,
            )
        elif goal == "gain_muscle":
            return self._rules_for_muscle_gain(
                actual_weekly_change, weekly_loss_pct,
                weight_entries, current_target, bmr, tdee, weeks_elapsed,
            )
        else:
            return self._rules_for_maintenance(
                actual_weekly_change, weekly_loss_pct,
                weight_entries, current_target, bmr, tdee,
            )

    def _rules_for_weight_loss(
        self,
        weekly_change: float,
        weekly_loss_pct: float,
        entries: list[WeightLog],
        current_target: int,
        bmr: float,
        tdee: float,
        weeks_elapsed: float,
    ) -> tuple[str, str, int, str]:
        """Rules for lose_weight goal."""
        # weekly_change is negative when losing weight
        is_losing = weekly_change < 0

        if is_losing and weekly_loss_pct > MAX_LOSS_RATE_PCT:
            # Losing too fast (>1% bodyweight/week)
            # Increase calories to protect lean mass
            increase = int(current_target * ADJUSTMENT_STEP_PCT)
            increase = min(increase, MAX_ADJUSTMENT_KCAL)
            increase = max(increase, MIN_ADJUSTMENT_KCAL)
            return (
                WeightTrend.LOSING_TOO_FAST.value,
                AdjustmentReason.LOSING_TOO_FAST.value,
                increase,
                f"Estas perdiendo peso demasiado rapido ({abs(weekly_change):.1f} kg/semana). "
                f"Subimos {increase} kcal para proteger tu masa muscular y mantener tu energia.",
            )

        if is_losing and weekly_loss_pct <= ON_TRACK_TOLERANCE_PCT:
            # Losing but very slowly — could be on track or stalling
            if weeks_elapsed >= MIN_WEEKS_NO_PROGRESS:
                # Check if weight has stalled (flat for 2+ weeks)
                if self._weight_stalled(entries, weeks=MIN_WEEKS_NO_PROGRESS):
                    decrease = int(current_target * ADJUSTMENT_STEP_PCT)
                    decrease = min(decrease, MAX_ADJUSTMENT_KCAL)
                    decrease = max(decrease, MIN_ADJUSTMENT_KCAL)
                    return (
                        WeightTrend.STABLE.value,
                        AdjustmentReason.NOT_LOSING.value,
                        -decrease,
                        f"Tu peso se ha mantenido estable por {MIN_WEEKS_NO_PROGRESS} semanas. "
                        f"Bajamos {decrease} kcal para reactivar tu progreso de forma segura.",
                    )
            # On track
            return (
                WeightTrend.LOSING_ON_TRACK.value,
                AdjustmentReason.ON_TRACK.value,
                0,
                "Tu ritmo de perdida de peso es saludable y sostenible. Sigue asi!",
            )

        if is_losing and ON_TRACK_TOLERANCE_PCT < weekly_loss_pct <= MAX_LOSS_RATE_PCT:
            # Losing at a healthy rate
            return (
                WeightTrend.LOSING_ON_TRACK.value,
                AdjustmentReason.ON_TRACK.value,
                0,
                f"Estas perdiendo {abs(weekly_change):.1f} kg/semana, un ritmo ideal para preservar musculo. Excelente!",
            )

        if not is_losing:
            # Not losing weight at all (or gaining) with a loss goal
            if weeks_elapsed >= MIN_WEEKS_NO_PROGRESS:
                decrease = int(current_target * ADJUSTMENT_STEP_PCT)
                decrease = min(decrease, MAX_ADJUSTMENT_KCAL)
                decrease = max(decrease, MIN_ADJUSTMENT_KCAL)
                return (
                    WeightTrend.STABLE.value,
                    AdjustmentReason.NOT_LOSING.value,
                    -decrease,
                    f"No has perdido peso en {int(weeks_elapsed)} semanas. "
                    f"Reducimos {decrease} kcal para crear un deficit efectivo.",
                )
            return (
                WeightTrend.STABLE.value,
                AdjustmentReason.ON_TRACK.value,
                0,
                "Aun estamos recopilando datos. Sigue registrando tu peso y comidas para ajustes mas precisos.",
            )

        # Fallback
        return (
            WeightTrend.STABLE.value,
            AdjustmentReason.ON_TRACK.value,
            0,
            "Tu progreso se ve bien. Seguimos monitoreando.",
        )

    def _rules_for_muscle_gain(
        self,
        weekly_change: float,
        weekly_loss_pct: float,
        entries: list[WeightLog],
        current_target: int,
        bmr: float,
        tdee: float,
        weeks_elapsed: float,
    ) -> tuple[str, str, int, str]:
        """Rules for gain_muscle goal."""
        is_gaining = weekly_change > 0

        if is_gaining and weekly_change > 0.5:
            # Gaining too fast — likely adding too much fat
            decrease = int(current_target * 0.05)
            decrease = min(decrease, MAX_ADJUSTMENT_KCAL)
            decrease = max(decrease, MIN_ADJUSTMENT_KCAL)
            return (
                WeightTrend.GAINING_TOO_FAST.value,
                AdjustmentReason.GAINING_TOO_FAST.value,
                -decrease,
                f"Estas ganando {weekly_change:.1f} kg/semana, lo cual puede incluir grasa excesiva. "
                f"Reducimos {decrease} kcal para una ganancia mas limpia.",
            )

        if is_gaining and weekly_change <= 0.5:
            # Gaining at a reasonable rate
            return (
                WeightTrend.GAINING_ON_TRACK.value,
                AdjustmentReason.ON_TRACK.value,
                0,
                f"Estas ganando {weekly_change:.1f} kg/semana. Buen ritmo para ganar musculo sin exceso de grasa!",
            )

        if not is_gaining:
            # Not gaining weight with a gain goal
            if weeks_elapsed >= MIN_WEEKS_NO_PROGRESS:
                increase = int(current_target * ADJUSTMENT_STEP_PCT)
                increase = min(increase, MAX_ADJUSTMENT_KCAL)
                increase = max(increase, MIN_ADJUSTMENT_KCAL)
                return (
                    WeightTrend.STABLE.value,
                    AdjustmentReason.NOT_GAINING.value,
                    increase,
                    f"No has ganado peso en {int(weeks_elapsed)} semanas. "
                    f"Subimos {increase} kcal para asegurar un superavit efectivo.",
                )
            return (
                WeightTrend.STABLE.value,
                AdjustmentReason.ON_TRACK.value,
                0,
                "Estamos evaluando tu progreso. Sigue registrando para ajustes mas precisos.",
            )

        return (
            WeightTrend.GAINING_ON_TRACK.value,
            AdjustmentReason.ON_TRACK.value,
            0,
            "Tu progreso de ganancia muscular se ve bien.",
        )

    def _rules_for_maintenance(
        self,
        weekly_change: float,
        weekly_loss_pct: float,
        entries: list[WeightLog],
        current_target: int,
        bmr: float,
        tdee: float,
    ) -> tuple[str, str, int, str]:
        """Rules for maintain goal."""
        # For maintenance, weight should stay within +/-0.5kg/week
        if abs(weekly_change) <= 0.25:
            return (
                WeightTrend.STABLE.value,
                AdjustmentReason.ON_TRACK.value,
                0,
                "Tu peso se mantiene estable. Tu plan de mantenimiento esta funcionando!",
            )

        if weekly_change < -0.25:
            # Unintentional weight loss during maintenance
            increase = int(abs(weekly_change) * KCAL_PER_KG_FAT / 7 * 0.5)
            increase = min(increase, MAX_ADJUSTMENT_KCAL)
            increase = max(increase, MIN_ADJUSTMENT_KCAL)
            return (
                WeightTrend.LOSING_ON_TRACK.value,
                AdjustmentReason.LOSING_TOO_FAST.value,
                increase,
                f"Estas perdiendo peso ({abs(weekly_change):.1f} kg/semana) pero tu objetivo es mantener. "
                f"Subimos {increase} kcal para estabilizar tu peso.",
            )

        # Unintentional weight gain
        decrease = int(weekly_change * KCAL_PER_KG_FAT / 7 * 0.5)
        decrease = min(decrease, MAX_ADJUSTMENT_KCAL)
        decrease = max(decrease, MIN_ADJUSTMENT_KCAL)
        return (
            WeightTrend.GAINING_ON_TRACK.value,
            AdjustmentReason.GAINING_TOO_FAST.value,
            -decrease,
            f"Estas ganando peso ({weekly_change:.1f} kg/semana) pero tu objetivo es mantener. "
            f"Reducimos {decrease} kcal para estabilizar.",
        )

    def _weight_stalled(self, entries: list[WeightLog], weeks: int = 2) -> bool:
        """Check if weight has been flat (within 0.3 kg) for the last N weeks."""
        if len(entries) < 2:
            return False

        cutoff = date.today() - timedelta(weeks=weeks)
        recent = [e for e in entries if e.date >= cutoff]

        if len(recent) < 2:
            return False

        weights = [e.weight_kg for e in recent]
        weight_range = max(weights) - min(weights)
        return weight_range < 0.3

    def _clamp_target(
        self,
        target: int,
        bmr: float,
        tdee: float,
        gender: str,
    ) -> int:
        """
        Enforce safety limits on calorie targets.
        Rule 1: Never below BMR.
        Rule 2: Never below gender-based clinical minimum (1500M / 1200F).
        Rule 3: Never create deficit > 25% of TDEE.
        """
        # Gender-based clinical minimum
        if gender.lower() == "male":
            clinical_min = 1500
        else:
            clinical_min = 1200

        # BMR floor
        floor = max(bmr, clinical_min)

        # Max deficit floor (TDEE * 0.75)
        max_deficit_floor = tdee * (1 - MAX_DEFICIT_FRACTION)
        floor = max(floor, max_deficit_floor)

        return max(int(target), int(floor))

    # -----------------------------------------------------------------------
    # Apply adjustment
    # -----------------------------------------------------------------------

    async def apply_adjustment(self, user_id: int) -> ApplyAdjustmentResponse:
        """
        Apply the most recent pending adjustment by updating the user's
        nutrition profile target_calories.
        """
        pending = await self._get_pending_adjustment(user_id)

        if not pending:
            # No pending adjustment — calculate one
            recommendation = await self.calculate_adjustment(user_id)
            if abs(recommendation.adjustment) < MIN_ADJUSTMENT_KCAL:
                return ApplyAdjustmentResponse(
                    success=False,
                    new_target=recommendation.current_target,
                    previous_target=recommendation.current_target,
                    adjustment=0,
                    message="No hay ajuste pendiente. Tu objetivo actual es adecuado.",
                )
            pending = await self._get_pending_adjustment(user_id)
            if not pending:
                return ApplyAdjustmentResponse(
                    success=False,
                    new_target=recommendation.current_target,
                    previous_target=recommendation.current_target,
                    adjustment=0,
                    message="No se pudo generar un ajuste. Intenta mas tarde.",
                )

        # Update nutrition profile
        stmt = select(UserNutritionProfile).where(
            UserNutritionProfile.user_id == user_id
        )
        result = await self.session.execute(stmt)
        profile = result.scalars().first()

        if profile:
            old_target = int(profile.target_calories)
            profile.target_calories = float(pending.new_target)

            # Recalculate macros proportionally
            ratio = pending.new_target / old_target if old_target > 0 else 1.0
            profile.target_protein_g = round(profile.target_protein_g * ratio)
            profile.target_carbs_g = round(profile.target_carbs_g * ratio)
            profile.target_fat_g = round(profile.target_fat_g * ratio)
            profile.updated_at = datetime.utcnow()

            self.session.add(profile)

        # Mark adjustment as applied
        pending.applied = True
        pending.applied_at = datetime.utcnow()
        self.session.add(pending)

        await self.session.commit()

        if profile:
            await self.session.refresh(profile)

        return ApplyAdjustmentResponse(
            success=True,
            new_target=pending.new_target,
            previous_target=pending.previous_target,
            adjustment=pending.adjustment_kcal,
            message=f"Objetivo actualizado a {pending.new_target} kcal. Tu plan de macros se ajusto proporcionalmente.",
        )

    async def dismiss_adjustment(self, user_id: int) -> dict:
        """Mark the most recent pending adjustment as dismissed."""
        pending = await self._get_pending_adjustment(user_id)
        if not pending:
            return {"success": False, "message": "No hay ajuste pendiente para descartar."}

        pending.dismissed = True
        self.session.add(pending)
        await self.session.commit()

        return {"success": True, "message": "Ajuste descartado. Te notificaremos de nuevo la proxima semana."}

    # -----------------------------------------------------------------------
    # Adjustment history
    # -----------------------------------------------------------------------

    async def get_adjustment_history(
        self, user_id: int, limit: int = 12
    ) -> list[CalorieAdjustment]:
        """Get the last N calorie adjustment records for a user."""
        stmt = (
            select(CalorieAdjustment)
            .where(CalorieAdjustment.user_id == user_id)
            .order_by(CalorieAdjustment.week_start.desc())
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    # -----------------------------------------------------------------------
    # Internal helpers
    # -----------------------------------------------------------------------

    async def _get_pending_adjustment(
        self, user_id: int
    ) -> Optional[CalorieAdjustment]:
        """Get the most recent unapplied, undismissed adjustment."""
        stmt = (
            select(CalorieAdjustment)
            .where(
                CalorieAdjustment.user_id == user_id,
                CalorieAdjustment.applied == False,
                CalorieAdjustment.dismissed == False,
            )
            .order_by(CalorieAdjustment.created_at.desc())
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalars().first()

    async def _store_adjustment(
        self,
        user_id: int,
        week_start: date,
        week_end: date,
        predicted_weight: float,
        actual_weight: float,
        weight_delta: float,
        previous_target: int,
        new_target: int,
        adjustment_kcal: int,
        adjustment_reason: str,
        trend: str,
    ) -> CalorieAdjustment:
        """Store or update a calorie adjustment record for the week."""
        # Check if one already exists for this week
        stmt = select(CalorieAdjustment).where(
            CalorieAdjustment.user_id == user_id,
            CalorieAdjustment.week_start == week_start,
        )
        result = await self.session.execute(stmt)
        existing = result.scalars().first()

        if existing:
            # Update existing record
            existing.predicted_weight = predicted_weight
            existing.actual_weight = actual_weight
            existing.weight_delta = weight_delta
            existing.previous_target = previous_target
            existing.new_target = new_target
            existing.adjustment_kcal = adjustment_kcal
            existing.adjustment_reason = adjustment_reason
            existing.trend = trend
            self.session.add(existing)
            await self.session.commit()
            await self.session.refresh(existing)
            return existing

        adj = CalorieAdjustment(
            user_id=user_id,
            week_start=week_start,
            week_end=week_end,
            predicted_weight=predicted_weight,
            actual_weight=actual_weight,
            weight_delta=weight_delta,
            previous_target=previous_target,
            new_target=new_target,
            adjustment_kcal=adjustment_kcal,
            adjustment_reason=adjustment_reason,
            trend=trend,
        )
        self.session.add(adj)
        await self.session.commit()
        await self.session.refresh(adj)
        return adj

    async def _update_profile_weight(
        self, user_id: int, weight_kg: float
    ) -> None:
        """Keep the nutrition profile's weight_kg in sync with the latest log."""
        stmt = select(UserNutritionProfile).where(
            UserNutritionProfile.user_id == user_id
        )
        result = await self.session.execute(stmt)
        profile = result.scalars().first()

        if profile:
            profile.weight_kg = weight_kg
            profile.updated_at = datetime.utcnow()
            self.session.add(profile)
            await self.session.commit()

    # -----------------------------------------------------------------------
    # Weight history with predictions (for chart)
    # -----------------------------------------------------------------------

    async def get_weight_with_predictions(
        self, user_id: int, weeks: int = 4
    ) -> dict:
        """
        Returns actual weight entries and predicted weight trajectory
        for the chart component.
        """
        profile = await self._get_user_profile_data(user_id)
        weight_entries = await self.get_weight_history(user_id, days=weeks * 7)

        # Build predicted trajectory
        predicted = []
        if weight_entries and len(weight_entries) >= 1:
            tdee = self._calculate_tdee(
                profile["weight_kg"],
                profile["height_cm"],
                profile["age"],
                profile["gender"],
                profile["activity_level"],
            )

            # Use the first entry as starting point
            start_weight = weight_entries[0].weight_kg
            start_date = weight_entries[0].date

            # Get daily calories for the period
            daily_cals = await self._get_daily_calories_for_period(
                user_id, start_date, date.today()
            )

            cal_by_date = {d: c for d, c in daily_cals}
            current_predicted = start_weight

            for i in range((date.today() - start_date).days + 1):
                d = start_date + timedelta(days=i)
                daily_cal = cal_by_date.get(d, profile["target_calories"])
                balance = daily_cal - tdee
                weight_change = balance / KCAL_PER_KG_FAT
                current_predicted += weight_change
                predicted.append({
                    "date": d.isoformat(),
                    "weight_kg": round(current_predicted, 2),
                })

        # Calculate 4-week change
        weight_change_4w = None
        if len(weight_entries) >= 2:
            weight_change_4w = round(
                weight_entries[-1].weight_kg - weight_entries[0].weight_kg, 2
            )

        return {
            "entries": [
                WeightLogRead(
                    id=e.id,
                    date=e.date,
                    weight_kg=e.weight_kg,
                    source=e.source,
                    notes=e.notes,
                    created_at=e.created_at,
                )
                for e in weight_entries
            ],
            "predicted_entries": predicted,
            "current_weight": weight_entries[-1].weight_kg if weight_entries else None,
            "target_weight": profile.get("target_weight_kg"),
            "weight_change_4w": weight_change_4w,
        }
