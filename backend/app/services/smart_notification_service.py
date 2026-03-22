"""
Smart Notification Scheduler Service.

Analyzes user food-logging patterns to decide *when* to send reminders
and *what* message to deliver. This service only produces **decisions**
(notification intents); actual push delivery is delegated to
NotificationService.

Key behaviours
--------------
1. Predict meal times from historical log timestamps and send a
   reminder 15 minutes before the user's usual meal window.
2. If the user has not logged any food for 4+ hours during waking
   hours (08:00-22:00), generate a "did you eat?" nudge.
3. Celebrate logging streaks at milestone thresholds.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from datetime import date, datetime, time as dt_time, timedelta
from enum import Enum
from typing import List, Optional

from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..models.ai_food_log import AIFoodLog
from ..models.onboarding_profile import OnboardingProfile

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

class NotificationType(str, Enum):
    MEAL_REMINDER = "meal_reminder"
    INACTIVITY_NUDGE = "inactivity_nudge"
    STREAK_CELEBRATION = "streak_celebration"


class NotificationIntent:
    """
    Represents a notification that *should* be sent.

    The caller (router / background task) decides whether to enqueue
    the actual push via NotificationService.
    """

    def __init__(
        self,
        type: NotificationType,
        title: str,
        body: str,
        scheduled_for: Optional[datetime] = None,
        data: Optional[dict] = None,
        priority: int = 5,
    ):
        self.type = type
        self.title = title
        self.body = body
        self.scheduled_for = scheduled_for
        self.data = data or {}
        self.priority = priority

    def to_dict(self) -> dict:
        return {
            "type": self.type.value,
            "title": self.title,
            "body": self.body,
            "scheduled_for": self.scheduled_for.isoformat() if self.scheduled_for else None,
            "data": self.data,
            "priority": self.priority,
        }


# Streak milestones that trigger a celebration notification
_STREAK_MILESTONES = [3, 5, 7, 10, 14, 21, 30, 50, 75, 100]

# Waking-hours window — nudges are only emitted within this range
_WAKING_HOUR_START = 8   # 08:00
_WAKING_HOUR_END = 22    # 22:00

# How many minutes before the predicted meal time to send the reminder
_REMINDER_LEAD_MINUTES = 15

# Minimum gap (hours) without a log before an inactivity nudge fires
_INACTIVITY_THRESHOLD_HOURS = 4

# How many days of history to analyse when building meal-time predictions
_ANALYSIS_WINDOW_DAYS = 14


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------

class SmartNotificationService:
    def __init__(self, session: AsyncSession):
        self.session = session

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def evaluate_notifications(
        self,
        user_id: int,
        now: Optional[datetime] = None,
    ) -> List[NotificationIntent]:
        """
        Run all notification rules for *user_id* and return a list of
        intents that should be dispatched.

        Parameters
        ----------
        user_id : int
            The authenticated user.
        now : datetime, optional
            Override the current timestamp (useful for testing).

        Returns
        -------
        list[NotificationIntent]
            Zero or more notification intents sorted by priority (lower = more urgent).
        """
        now = now or datetime.utcnow()
        intents: List[NotificationIntent] = []

        # 1. Predict upcoming meals and suggest a reminder
        meal_intents = await self._meal_time_reminders(user_id, now)
        intents.extend(meal_intents)

        # 2. Inactivity nudge — no log in 4+ hours during waking hours
        inactivity = await self._inactivity_nudge(user_id, now)
        if inactivity:
            intents.append(inactivity)

        # 3. Streak celebration
        streak_intent = await self._streak_celebration(user_id, now)
        if streak_intent:
            intents.append(streak_intent)

        intents.sort(key=lambda i: i.priority)
        return intents

    # ------------------------------------------------------------------
    # Meal-time prediction
    # ------------------------------------------------------------------

    async def get_predicted_meal_times(
        self,
        user_id: int,
        now: Optional[datetime] = None,
    ) -> dict[str, Optional[dt_time]]:
        """
        Analyse historical logs to predict when the user usually eats each
        meal type.  Returns a dict mapping meal_type -> predicted time
        (or None if insufficient data).
        """
        now = now or datetime.utcnow()
        since = now - timedelta(days=_ANALYSIS_WINDOW_DAYS)

        statement = select(AIFoodLog.meal_type, AIFoodLog.logged_at).where(
            AIFoodLog.user_id == user_id,
            AIFoodLog.logged_at >= since,
        )
        result = await self.session.exec(statement)
        rows = result.all()

        # Group log timestamps by meal_type
        hours_by_meal: dict[str, list[float]] = defaultdict(list)
        for meal_type, logged_at in rows:
            # Convert to fractional hours for averaging
            fractional_hour = logged_at.hour + logged_at.minute / 60.0
            hours_by_meal[meal_type].append(fractional_hour)

        predictions: dict[str, Optional[dt_time]] = {}
        for meal_type in ("breakfast", "lunch", "dinner", "snack"):
            samples = hours_by_meal.get(meal_type)
            if samples and len(samples) >= 3:
                avg_hour = sum(samples) / len(samples)
                hour = int(avg_hour)
                minute = int((avg_hour - hour) * 60)
                predictions[meal_type] = dt_time(hour=hour, minute=minute)
            else:
                predictions[meal_type] = None

        return predictions

    async def _meal_time_reminders(
        self,
        user_id: int,
        now: datetime,
    ) -> List[NotificationIntent]:
        """Generate reminder intents for meals the user hasn't logged yet today."""
        predictions = await self.get_predicted_meal_times(user_id, now)
        today = now.date()

        # Find out which meal types the user already logged today
        today_start = datetime.combine(today, dt_time.min)
        today_end = datetime.combine(today, dt_time.max)

        stmt = (
            select(AIFoodLog.meal_type)
            .where(
                AIFoodLog.user_id == user_id,
                AIFoodLog.logged_at >= today_start,
                AIFoodLog.logged_at <= today_end,
            )
            .distinct()
        )
        result = await self.session.exec(stmt)
        logged_meals = set(result.all())

        intents: List[NotificationIntent] = []

        meal_labels = {
            "breakfast": "desayuno",
            "lunch": "almuerzo",
            "dinner": "cena",
            "snack": "snack",
        }

        for meal_type, predicted_time in predictions.items():
            if predicted_time is None:
                continue
            if meal_type in logged_meals:
                continue

            # Compute the reminder timestamp (15 min before predicted time)
            predicted_dt = datetime.combine(today, predicted_time)
            reminder_dt = predicted_dt - timedelta(minutes=_REMINDER_LEAD_MINUTES)

            # Only emit if the reminder window is in the near future
            # (within the next 60 minutes) or has just passed (within 5 min)
            delta = (reminder_dt - now).total_seconds() / 60.0
            if -5 <= delta <= 60:
                label = meal_labels.get(meal_type, meal_type)
                intents.append(
                    NotificationIntent(
                        type=NotificationType.MEAL_REMINDER,
                        title=f"Hora del {label}!",
                        body=f"En ~15 minutos es tu hora habitual de {label}. Registra tu comida en Fitsi.",
                        scheduled_for=reminder_dt,
                        data={"meal_type": meal_type, "predicted_time": predicted_time.isoformat()},
                        priority=2,
                    )
                )

        return intents

    # ------------------------------------------------------------------
    # Inactivity nudge
    # ------------------------------------------------------------------

    async def _inactivity_nudge(
        self,
        user_id: int,
        now: datetime,
    ) -> Optional[NotificationIntent]:
        """
        If the user has not logged any food in 4+ hours during waking hours,
        return a gentle nudge notification intent.
        """
        current_hour = now.hour

        # Only nudge during waking hours
        if current_hour < _WAKING_HOUR_START or current_hour >= _WAKING_HOUR_END:
            return None

        # Find the most recent log today
        today = now.date()
        today_start = datetime.combine(today, dt_time.min)

        stmt = (
            select(func.max(AIFoodLog.logged_at))
            .where(
                AIFoodLog.user_id == user_id,
                AIFoodLog.logged_at >= today_start,
                AIFoodLog.logged_at <= now,
            )
        )
        result = await self.session.execute(stmt)
        last_log_at = result.scalar()

        if last_log_at is None:
            # No logs at all today — if it is past the inactivity threshold
            # from waking-hour start, nudge
            waking_start_dt = datetime.combine(today, dt_time(hour=_WAKING_HOUR_START))
            hours_since_wake = (now - waking_start_dt).total_seconds() / 3600.0
            if hours_since_wake >= _INACTIVITY_THRESHOLD_HOURS:
                return NotificationIntent(
                    type=NotificationType.INACTIVITY_NUDGE,
                    title="Ya comiste?",
                    body="No has registrado comida hoy. Abre Fitsi y registra lo que comiste!",
                    data={"hours_since_last_log": round(hours_since_wake, 1)},
                    priority=3,
                )
            return None

        hours_since_last = (now - last_log_at).total_seconds() / 3600.0
        if hours_since_last >= _INACTIVITY_THRESHOLD_HOURS:
            return NotificationIntent(
                type=NotificationType.INACTIVITY_NUDGE,
                title="Ya comiste?",
                body=f"Llevas {int(hours_since_last)} horas sin registrar comida. No olvides loguearlo!",
                data={"hours_since_last_log": round(hours_since_last, 1)},
                priority=3,
            )

        return None

    # ------------------------------------------------------------------
    # Streak celebration
    # ------------------------------------------------------------------

    async def _streak_celebration(
        self,
        user_id: int,
        now: datetime,
    ) -> Optional[NotificationIntent]:
        """
        If the user's current streak just hit a milestone, return a
        celebration intent.
        """
        streak = await self._calculate_current_streak(user_id, now.date())

        if streak in _STREAK_MILESTONES:
            return NotificationIntent(
                type=NotificationType.STREAK_CELEBRATION,
                title=f"{streak} dias seguidos logueando!",
                body=self._streak_message(streak),
                data={"streak_days": streak},
                priority=4,
            )

        return None

    async def _calculate_current_streak(self, user_id: int, today: date) -> int:
        """
        Count consecutive days ending yesterday-or-today with at least
        one food log.

        Uses a portable Python approach (SELECT DISTINCT dates, then
        iterate backwards) instead of PostgreSQL-specific gap-and-island
        SQL so the same code works on SQLite during tests.
        """
        stmt = (
            select(func.date(AIFoodLog.logged_at).label("log_date"))
            .where(AIFoodLog.user_id == user_id)
            .distinct()
            .order_by(func.date(AIFoodLog.logged_at).desc())
        )
        result = await self.session.execute(stmt)
        rows = result.all()

        if not rows:
            return 0

        # Normalise to date objects
        log_dates: set[date] = set()
        for row in rows:
            val = row[0]
            if isinstance(val, str):
                val = date.fromisoformat(val)
            elif isinstance(val, datetime):
                val = val.date()
            log_dates.add(val)

        # Walk backwards from today (or yesterday if today has no log yet)
        streak = 0
        check = today
        if check not in log_dates:
            check = today - timedelta(days=1)

        while check in log_dates:
            streak += 1
            check -= timedelta(days=1)

        return streak

    @staticmethod
    def _streak_message(days: int) -> str:
        if days >= 30:
            return f"Un mes entero sin fallar! {days} dias de constancia increible."
        if days >= 14:
            return f"{days} dias seguidos! Tu disciplina es admirable."
        if days >= 7:
            return f"Una semana completa! {days} dias sin parar."
        if days >= 5:
            return f"{days} dias seguidos! Vas con todo."
        return f"Genial! {days} dias consecutivos logueando tu comida."

    # ------------------------------------------------------------------
    # Notification preferences check
    # ------------------------------------------------------------------

    async def are_notifications_enabled(self, user_id: int) -> bool:
        """
        Check if the user opted-in to notifications during onboarding.
        """
        stmt = select(OnboardingProfile.notifications_enabled).where(
            OnboardingProfile.user_id == user_id
        )
        result = await self.session.exec(stmt)
        enabled = result.first()
        return bool(enabled) if enabled is not None else False
