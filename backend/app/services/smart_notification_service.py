"""
Smart Notification Scheduler Service.

Analyzes user food-logging patterns to decide *when* to send reminders
and *what* message to deliver. This service produces **decisions**
(notification intents) and can also **dispatch** them via push.

Notification types
------------------
1. Pre-meal reminder: 15 min before predicted meal time
2. Evening summary: daily calorie/macro recap at user-configured hour
3. Streak at risk: no logs today and it is past the risk hour (default 8 PM)
4. Streak celebration: milestone reached (3, 7, 14, 30, 60, 100 days)
5. Inactivity: no app usage for 2+ days
6. Inactivity nudge: 4+ hours without a log during waking hours
7. Weekly progress summary: sent once a week on the user's chosen day
8. Goal milestone: triggered when user hits calorie/macro targets N days in a row
9. Achievement unlocked: triggered when a new achievement is earned

Key design principles
---------------------
- Idempotent: each notification has a unique key; duplicates are silently skipped.
- Quiet-hours aware: respects the user's do-not-disturb window.
- Template-driven: all copy is defined in NOTIFICATION_TEMPLATES for easy i18n.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from datetime import date, datetime, time as dt_time, timedelta, timezone
from enum import Enum
from typing import List, Optional

from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..models.ai_food_log import AIFoodLog
from ..models.daily_nutrition_summary import DailyNutritionSummary
from ..models.notification_log import NotificationLog
from ..models.notification_schedule import NotificationSchedule
from ..models.onboarding_profile import OnboardingProfile
from ..models.progress import AchievementDefinition, UserAchievement
from ..models.push_token import PushToken
from .notification_service import NotificationService

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

class NotificationType(str, Enum):
    MEAL_REMINDER = "meal_reminder"
    INACTIVITY_NUDGE = "inactivity_nudge"
    STREAK_CELEBRATION = "streak_celebration"
    EVENING_SUMMARY = "evening_summary"
    STREAK_AT_RISK = "streak_at_risk"
    INACTIVITY_REENGAGEMENT = "inactivity_reengagement"
    WEEKLY_SUMMARY = "weekly_summary"
    GOAL_MILESTONE = "goal_milestone"
    ACHIEVEMENT_UNLOCKED = "achievement_unlocked"


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
        idempotency_key: Optional[str] = None,
        category: str = "engagement",
    ):
        self.type = type
        self.title = title
        self.body = body
        self.scheduled_for = scheduled_for
        self.data = data or {}
        self.priority = priority
        self.idempotency_key = idempotency_key
        self.category = category

    def to_dict(self) -> dict:
        return {
            "type": self.type.value,
            "title": self.title,
            "body": self.body,
            "scheduled_for": self.scheduled_for.isoformat() if self.scheduled_for else None,
            "data": self.data,
            "priority": self.priority,
            "idempotency_key": self.idempotency_key,
            "category": self.category,
        }


# ---------------------------------------------------------------------------
# Notification templates -- all copy in one place for easy i18n
# ---------------------------------------------------------------------------

NOTIFICATION_TEMPLATES = {
    # -- Meal reminders ---
    "meal_reminder": {
        "breakfast": {
            "title": "Hora del desayuno",
            "body": "No olvides registrar tu desayuno en Fitsi para comenzar bien el dia.",
        },
        "lunch": {
            "title": "Hora del almuerzo",
            "body": "Registra tu almuerzo para mantener tu progreso al dia.",
        },
        "dinner": {
            "title": "Hora de cenar",
            "body": "No olvides registrar tu cena antes de terminar el dia.",
        },
        "snack": {
            "title": "Hora del snack",
            "body": "Registra tu snack para tener un conteo preciso.",
        },
    },

    # -- Streak at risk ---
    "streak_at_risk": {
        "title": "Tu racha esta en riesgo!",
        "body_template": "Llevas {streak} dias seguidos. Registra algo antes de medianoche para no perder tu racha!",
    },

    # -- Streak celebration ---
    "streak_celebration": {
        3: {"title": "3 dias seguidos!", "body": "Genial! 3 dias consecutivos registrando tu comida. Sigue asi!"},
        7: {"title": "Una semana completa!", "body": "7 dias sin parar! Tu disciplina es admirable."},
        14: {"title": "2 semanas seguidas!", "body": "14 dias de constancia. Estas construyendo un gran habito!"},
        30: {"title": "Un mes entero!", "body": "30 dias sin fallar. Tu compromiso es increible!"},
        60: {"title": "2 meses de constancia!", "body": "60 dias consecutivos. Eres una leyenda de Fitsi!"},
        100: {"title": "100 dias!", "body": "Increible! 100 dias consecutivos usando Fitsi. Eres imparable!"},
    },

    # -- Inactivity nudge ---
    "inactivity_nudge": {
        "title": "Ya comiste?",
        "body_no_logs": "No has registrado comida hoy. Abre Fitsi y registra lo que comiste!",
        "body_hours": "Llevas {hours} horas sin registrar comida. No olvides loguearlo!",
    },

    # -- Inactivity re-engagement ---
    "inactivity_reengagement": {
        2: {"title": "Te extraiiamos!", "body": "Llevas 2 dias sin registrar. Tu plan nutricional te espera!"},
        3: {"title": "No te rindas!", "body": "3 dias sin Fitsi. Volver a empezar es mas facil de lo que crees."},
        5: {"title": "Vuelve a Fitsi!", "body": "Tu progreso no se pierde. Registra tu proxima comida y retoma tu camino."},
        7: {"title": "Una semana sin Fitsi", "body": "Te extraiiamos! Un solo registro hoy puede reactivar tu racha."},
    },

    # -- Evening summary ---
    "evening_summary": {
        "title": "Resumen del dia",
        "body_no_meals": "No registraste comidas hoy. Manana sera un mejor dia!",
        "body_under": "Hoy consumiste {total} kcal de {target}. {suffix}\nP: {protein}g | C: {carbs}g | G: {fats}g",
        "body_over": "Hoy consumiste {total} kcal ({over} sobre tu meta de {target}).\nP: {protein}g | C: {carbs}g | G: {fats}g",
    },

    # -- Weekly summary ---
    "weekly_summary": {
        "title": "Resumen semanal",
        "body_template": (
            "Esta semana: {avg_cal} kcal/dia promedio ({days_logged} de 7 dias registrados).\n"
            "Mejor dia: {best_day}. Meta cumplida {days_on_target} veces."
        ),
        "body_no_data": "Esta semana no registraste comidas. La proxima semana puede ser diferente!",
    },

    # -- Goal milestone ---
    "goal_milestone": {
        3: {"title": "3 dias en meta!", "body": "Has cumplido tu meta calorica 3 dias seguidos. Excelente consistencia!"},
        5: {"title": "5 dias en meta!", "body": "5 dias consecutivos dentro de tu objetivo. Tu cuerpo lo agradece!"},
        7: {"title": "Una semana perfecta!", "body": "7 dias seguidos cumpliendo tu meta calorica. Increible disciplina!"},
        14: {"title": "2 semanas en meta!", "body": "14 dias consecutivos en tu objetivo. Los resultados se notan!"},
        30: {"title": "Un mes perfecto!", "body": "30 dias seguidos cumpliendo tu meta. Eres un ejemplo de constancia!"},
    },

    # -- Achievement unlocked ---
    "achievement_unlocked": {
        "title_template": "Logro desbloqueado: {name}!",
        "body_template": "{description}",
    },
}

# Streak milestones that trigger a celebration notification
_STREAK_MILESTONES = [3, 7, 14, 30, 60, 100]

# Goal milestone thresholds (consecutive days on target)
_GOAL_MILESTONES = [3, 5, 7, 14, 30]

# Waking-hours window -- nudges are only emitted within this range
_WAKING_HOUR_START = 8   # 08:00
_WAKING_HOUR_END = 22    # 22:00

# How many minutes before the predicted meal time to send the reminder
_REMINDER_LEAD_MINUTES = 15

# Minimum gap (hours) without a log before an inactivity nudge fires
_INACTIVITY_THRESHOLD_HOURS = 4

# How many days of history to analyse when building meal-time predictions
_ANALYSIS_WINDOW_DAYS = 14

# Tolerance for calorie goal: within +/- this percentage counts as "on target"
_GOAL_TOLERANCE_PERCENT = 10


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------

class SmartNotificationService:
    def __init__(self, session: AsyncSession):
        self.session = session

    # ------------------------------------------------------------------
    # Preferences CRUD
    # ------------------------------------------------------------------

    async def get_preferences(self, user_id: int) -> NotificationSchedule:
        """
        Return the user's notification preferences, creating defaults if
        none exist yet.
        """
        stmt = select(NotificationSchedule).where(
            NotificationSchedule.user_id == user_id
        )
        result = await self.session.execute(stmt)
        schedule = result.first()

        if schedule is None:
            schedule = NotificationSchedule(user_id=user_id)
            self.session.add(schedule)
            await self.session.commit()
            await self.session.refresh(schedule)

        return schedule

    async def update_preferences(
        self,
        user_id: int,
        updates: dict,
    ) -> NotificationSchedule:
        """
        Patch the user's notification preferences with the provided updates.
        Only fields present in the updates dict are changed.
        """
        schedule = await self.get_preferences(user_id)

        allowed_fields = {
            "notifications_enabled",
            "quiet_hours_enabled",
            "quiet_hours_start", "quiet_hours_end",
            "timezone_offset_minutes",
            "meal_reminders_enabled",
            "breakfast_reminder_hour", "breakfast_reminder_minute",
            "lunch_reminder_hour", "lunch_reminder_minute",
            "dinner_reminder_hour", "dinner_reminder_minute",
            "snack_reminder_hour", "snack_reminder_minute",
            "use_predicted_times",
            "reminder_lead_minutes",
            "evening_summary_enabled",
            "evening_summary_hour", "evening_summary_minute",
            "weekly_summary_enabled",
            "weekly_summary_day", "weekly_summary_hour", "weekly_summary_minute",
            "goal_milestones_enabled",
            "achievement_notifications_enabled",
            "streak_alerts_enabled",
            "streak_risk_hour", "streak_risk_minute",
            "streak_celebrations_enabled",
            "inactivity_nudge_enabled",
            "inactivity_days_threshold",
            "water_reminders_enabled",
            "water_reminder_interval_hours",
        }

        for key, value in updates.items():
            if key in allowed_fields and hasattr(schedule, key):
                setattr(schedule, key, value)

        schedule.updated_at = datetime.now(timezone.utc)
        self.session.add(schedule)
        await self.session.commit()
        await self.session.refresh(schedule)
        return schedule

    # ------------------------------------------------------------------
    # Public API -- evaluate all rules
    # ------------------------------------------------------------------

    async def evaluate_notifications(
        self,
        user_id: int,
        now: Optional[datetime] = None,
    ) -> List[NotificationIntent]:
        """
        Run all notification rules for *user_id* and return a list of
        intents that should be dispatched.
        """
        now = now or datetime.now(timezone.utc)
        prefs = await self.get_preferences(user_id)
        intents: List[NotificationIntent] = []

        if not prefs.notifications_enabled:
            return intents

        # Check quiet hours early -- skip everything during quiet hours
        local_hour = self._get_local_hour(now, prefs)
        if prefs.is_in_quiet_hours(local_hour):
            logger.debug("User %d is in quiet hours, skipping evaluation", user_id)
            return intents

        # 1. Pre-meal reminders
        if prefs.meal_reminders_enabled:
            meal_intents = await self._meal_time_reminders(user_id, now, prefs)
            intents.extend(meal_intents)

        # 2. Evening summary
        if prefs.evening_summary_enabled:
            summary = await self._evening_summary(user_id, now, prefs)
            if summary:
                intents.append(summary)

        # 3. Streak at risk
        if prefs.streak_alerts_enabled:
            risk = await self._streak_at_risk(user_id, now, prefs)
            if risk:
                intents.append(risk)

        # 4. Streak celebration
        if prefs.streak_celebrations_enabled:
            celebration = await self._streak_celebration(user_id, now)
            if celebration:
                intents.append(celebration)

        # 5. Inactivity nudge (same-day, 4+ hours)
        if prefs.inactivity_nudge_enabled:
            nudge = await self._inactivity_nudge(user_id, now)
            if nudge:
                intents.append(nudge)

        # 6. Multi-day inactivity re-engagement
        if prefs.inactivity_nudge_enabled:
            reengagement = await self._inactivity_reengagement(
                user_id, now, prefs.inactivity_days_threshold
            )
            if reengagement:
                intents.append(reengagement)

        # 7. Weekly progress summary
        if prefs.weekly_summary_enabled:
            weekly = await self._weekly_summary(user_id, now, prefs)
            if weekly:
                intents.append(weekly)

        # 8. Goal milestones
        if prefs.goal_milestones_enabled:
            goal = await self._goal_milestone(user_id, now)
            if goal:
                intents.append(goal)

        # 9. Achievement unlocked
        if prefs.achievement_notifications_enabled:
            achievements = await self._achievement_unlocked(user_id, now)
            intents.extend(achievements)

        intents.sort(key=lambda i: i.priority)
        return intents

    # ------------------------------------------------------------------
    # Dispatch -- actually send push notifications for intents
    # ------------------------------------------------------------------

    async def dispatch_notifications(
        self,
        user_id: int,
        intents: List[NotificationIntent],
    ) -> list[dict]:
        """
        Send each intent as a real push notification via Expo Push API.

        On permanent failure (all retries exhausted), the notification is
        recorded in the dead letter queue via NotificationService.send_to_dead_letter
        so it can be inspected and retried later.

        Returns the list of Expo push tickets (including failed ones).
        """
        if not intents:
            return []

        push_service = NotificationService(self.session)
        all_tickets: list[dict] = []

        for intent in intents:
            try:
                tickets = await push_service.send_push(
                    user_id=user_id,
                    title=intent.title,
                    body=intent.body,
                    data={
                        "type": intent.type.value,
                        "screen": self._screen_for_type(intent.type),
                        **intent.data,
                    },
                    notification_type=intent.type.value,
                    category=intent.category,
                    idempotency_key=intent.idempotency_key,
                )
                all_tickets.extend(tickets)
            except Exception as exc:
                logger.error(
                    "Failed to send %s notification for user %d: %s",
                    intent.type.value, user_id, exc,
                )
                # Send to dead letter queue for later retry
                try:
                    await push_service.send_to_dead_letter(
                        user_id=user_id,
                        notification_type=intent.type.value,
                        title=intent.title,
                        body=intent.body,
                        error_message=str(exc),
                        data={
                            "type": intent.type.value,
                            "screen": self._screen_for_type(intent.type),
                            **intent.data,
                        },
                    )
                except Exception as dlq_exc:
                    logger.error(
                        "Failed to record dead letter for user %d: %s",
                        user_id, dlq_exc,
                    )

        return all_tickets

    @staticmethod
    def _screen_for_type(notification_type: NotificationType) -> str:
        """Map notification type to the deep-link screen name."""
        mapping = {
            NotificationType.MEAL_REMINDER: "LogMain",
            NotificationType.EVENING_SUMMARY: "HomeMain",
            NotificationType.STREAK_AT_RISK: "LogMain",
            NotificationType.STREAK_CELEBRATION: "Achievements",
            NotificationType.INACTIVITY_NUDGE: "LogMain",
            NotificationType.INACTIVITY_REENGAGEMENT: "HomeMain",
            NotificationType.WEEKLY_SUMMARY: "HomeMain",
            NotificationType.GOAL_MILESTONE: "HomeMain",
            NotificationType.ACHIEVEMENT_UNLOCKED: "Achievements",
        }
        return mapping.get(notification_type, "HomeMain")

    @staticmethod
    def _get_local_hour(now: datetime, prefs: NotificationSchedule) -> int:
        """Convert UTC time to the user's local hour using their offset."""
        offset = timedelta(minutes=prefs.timezone_offset_minutes)
        local_time = now + offset
        return local_time.hour

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
        meal type. Returns a dict mapping meal_type -> predicted time
        (or None if insufficient data).
        """
        now = now or datetime.now(timezone.utc)
        since = now - timedelta(days=_ANALYSIS_WINDOW_DAYS)

        statement = select(AIFoodLog.meal_type, AIFoodLog.logged_at).where(
            AIFoodLog.user_id == user_id,
            AIFoodLog.logged_at >= since,
            AIFoodLog.deleted_at.is_(None),
        )
        result = await self.session.execute(statement)
        rows = result.all()

        # Group log timestamps by meal_type
        hours_by_meal: dict[str, list[float]] = defaultdict(list)
        for meal_type, logged_at in rows:
            fractional_hour = logged_at.hour + logged_at.minute / 60.0
            hours_by_meal[meal_type].append(fractional_hour)

        predictions: dict[str, Optional[dt_time]] = {}
        for meal_type in ("breakfast", "lunch", "dinner", "snack"):
            samples = hours_by_meal.get(meal_type)
            if samples and len(samples) >= 3:
                avg_hour = sum(samples) / len(samples)
                hour = int(avg_hour)
                minute = int((avg_hour - hour) * 60)
                predictions[meal_type] = dt_time(hour=min(hour, 23), minute=min(minute, 59))
            else:
                predictions[meal_type] = None

        return predictions

    async def _meal_time_reminders(
        self,
        user_id: int,
        now: datetime,
        prefs: NotificationSchedule,
    ) -> List[NotificationIntent]:
        """Generate reminder intents for meals the user hasn't logged yet today."""
        # Decide whether to use predicted times or manual schedule
        if prefs.use_predicted_times:
            predictions = await self.get_predicted_meal_times(user_id, now)
        else:
            predictions = {
                "breakfast": dt_time(hour=prefs.breakfast_reminder_hour, minute=prefs.breakfast_reminder_minute),
                "lunch": dt_time(hour=prefs.lunch_reminder_hour, minute=prefs.lunch_reminder_minute),
                "dinner": dt_time(hour=prefs.dinner_reminder_hour, minute=prefs.dinner_reminder_minute),
                "snack": dt_time(hour=prefs.snack_reminder_hour, minute=prefs.snack_reminder_minute),
            }

        today = now.date()

        # Find which meal types the user already logged today
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
        result = await self.session.execute(stmt)
        logged_meals = set(result.all())

        intents: List[NotificationIntent] = []
        templates = NOTIFICATION_TEMPLATES["meal_reminder"]
        lead_minutes = prefs.reminder_lead_minutes

        for meal_type, predicted_time in predictions.items():
            if predicted_time is None:
                continue
            if meal_type in logged_meals:
                continue

            predicted_dt = datetime.combine(today, predicted_time)
            reminder_dt = predicted_dt - timedelta(minutes=lead_minutes)

            # Only emit if the reminder window is in the near future
            # (within the next 60 minutes) or has just passed (within 5 min)
            delta = (reminder_dt - now).total_seconds() / 60.0
            if -5 <= delta <= 60:
                template = templates.get(meal_type, templates["snack"])
                idem_key = f"meal_reminder:{user_id}:{today.isoformat()}:{meal_type}"
                intents.append(
                    NotificationIntent(
                        type=NotificationType.MEAL_REMINDER,
                        title=template["title"],
                        body=template["body"],
                        scheduled_for=reminder_dt,
                        data={
                            "meal_type": meal_type,
                            "predicted_time": predicted_time.isoformat(),
                        },
                        priority=2,
                        idempotency_key=idem_key,
                        category="engagement",
                    )
                )

        return intents

    # ------------------------------------------------------------------
    # Evening summary
    # ------------------------------------------------------------------

    async def _evening_summary(
        self,
        user_id: int,
        now: datetime,
        prefs: NotificationSchedule,
    ) -> Optional[NotificationIntent]:
        """
        Generate an evening summary notification with today's calorie
        and macro totals. Only fires within 30 minutes of the configured
        summary hour.
        """
        summary_time = dt_time(hour=prefs.evening_summary_hour, minute=prefs.evening_summary_minute)
        summary_dt = datetime.combine(now.date(), summary_time)
        delta_minutes = (now - summary_dt).total_seconds() / 60.0

        # Only fire within a 30-minute window around the configured time
        if not (-5 <= delta_minutes <= 30):
            return None

        today = now.date()
        idem_key = f"evening_summary:{user_id}:{today.isoformat()}"

        # Get today's nutrition totals
        today_start = datetime.combine(today, dt_time.min)
        today_end = datetime.combine(today, dt_time.max)

        # Aggregate from food logs
        stmt = select(
            func.coalesce(func.sum(AIFoodLog.calories), 0),
            func.coalesce(func.sum(AIFoodLog.protein_g), 0),
            func.coalesce(func.sum(AIFoodLog.carbs_g), 0),
            func.coalesce(func.sum(AIFoodLog.fats_g), 0),
            func.count(AIFoodLog.id),
        ).where(
            AIFoodLog.user_id == user_id,
            AIFoodLog.logged_at >= today_start,
            AIFoodLog.logged_at <= today_end,
        )
        result = await self.session.execute(stmt)
        row = result.one()
        total_cal = int(row[0])
        total_protein = int(row[1])
        total_carbs = int(row[2])
        total_fats = int(row[3])
        meals_count = int(row[4])

        templates = NOTIFICATION_TEMPLATES["evening_summary"]

        if meals_count == 0:
            return NotificationIntent(
                type=NotificationType.EVENING_SUMMARY,
                title=templates["title"],
                body=templates["body_no_meals"],
                scheduled_for=summary_dt,
                data={"total_calories": 0, "meals_count": 0},
                priority=5,
                idempotency_key=idem_key,
                category="summary",
            )

        # Get calorie target from onboarding profile
        target_stmt = select(OnboardingProfile.daily_calories).where(
            OnboardingProfile.user_id == user_id
        )
        target_result = await self.session.execute(target_stmt)
        target_row = target_result.first()
        target_cal = int(target_row[0]) if target_row and target_row[0] else 2000

        # Build message from template
        if total_cal <= target_cal:
            diff = target_cal - total_cal
            suffix = "Perfecto!" if diff < 100 else "Buen trabajo!"
            body = templates["body_under"].format(
                total=f"{total_cal:,}",
                target=f"{target_cal:,}",
                suffix=suffix,
                protein=total_protein,
                carbs=total_carbs,
                fats=total_fats,
            )
        else:
            over = total_cal - target_cal
            body = templates["body_over"].format(
                total=f"{total_cal:,}",
                target=f"{target_cal:,}",
                over=over,
                protein=total_protein,
                carbs=total_carbs,
                fats=total_fats,
            )

        return NotificationIntent(
            type=NotificationType.EVENING_SUMMARY,
            title=templates["title"],
            body=body,
            scheduled_for=summary_dt,
            data={
                "total_calories": total_cal,
                "target_calories": target_cal,
                "total_protein": total_protein,
                "total_carbs": total_carbs,
                "total_fats": total_fats,
                "meals_count": meals_count,
            },
            priority=5,
            idempotency_key=idem_key,
            category="summary",
        )

    # ------------------------------------------------------------------
    # Streak at risk
    # ------------------------------------------------------------------

    async def _streak_at_risk(
        self,
        user_id: int,
        now: datetime,
        prefs: NotificationSchedule,
    ) -> Optional[NotificationIntent]:
        """
        If the user has a streak of 2+ days and hasn't logged anything
        today, and the current time is past the configured risk hour,
        send a warning.
        """
        risk_time = dt_time(hour=prefs.streak_risk_hour, minute=prefs.streak_risk_minute)
        risk_dt = datetime.combine(now.date(), risk_time)
        delta_minutes = (now - risk_dt).total_seconds() / 60.0

        # Only fire within a 60-minute window after the risk hour
        if not (0 <= delta_minutes <= 60):
            return None

        # Check if user already logged today
        today = now.date()
        today_start = datetime.combine(today, dt_time.min)
        today_end = datetime.combine(today, dt_time.max)

        stmt = select(func.count(AIFoodLog.id)).where(
            AIFoodLog.user_id == user_id,
            AIFoodLog.logged_at >= today_start,
            AIFoodLog.logged_at <= today_end,
            AIFoodLog.deleted_at.is_(None),
        )
        result = await self.session.execute(stmt)
        today_count = result.scalar() or 0

        if today_count > 0:
            return None  # Already logged today, streak is safe

        # Calculate current streak (excluding today since no logs)
        streak = await self._calculate_current_streak(user_id, today)

        if streak < 2:
            return None  # No meaningful streak to protect

        templates = NOTIFICATION_TEMPLATES["streak_at_risk"]
        idem_key = f"streak_at_risk:{user_id}:{today.isoformat()}"

        return NotificationIntent(
            type=NotificationType.STREAK_AT_RISK,
            title=templates["title"],
            body=templates["body_template"].format(streak=streak),
            scheduled_for=risk_dt,
            data={"streak_days": streak},
            priority=1,
            idempotency_key=idem_key,
            category="engagement",
        )

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
            templates = NOTIFICATION_TEMPLATES["streak_celebration"]
            template = templates.get(streak, templates[3])
            idem_key = f"streak_celebration:{user_id}:{now.date().isoformat()}:{streak}"

            return NotificationIntent(
                type=NotificationType.STREAK_CELEBRATION,
                title=template["title"],
                body=template["body"],
                data={"streak_days": streak},
                priority=4,
                idempotency_key=idem_key,
                category="achievement",
            )

        return None

    # ------------------------------------------------------------------
    # Multi-day inactivity re-engagement
    # ------------------------------------------------------------------

    async def _inactivity_reengagement(
        self,
        user_id: int,
        now: datetime,
        threshold_days: int = 2,
    ) -> Optional[NotificationIntent]:
        """
        If the user hasn't logged any food for threshold_days (default 2),
        send a re-engagement notification.
        """
        since = now - timedelta(days=threshold_days)

        stmt = select(func.count(AIFoodLog.id)).where(
            AIFoodLog.user_id == user_id,
            AIFoodLog.logged_at >= since,
            AIFoodLog.deleted_at.is_(None),
        )
        result = await self.session.execute(stmt)
        recent_count = result.scalar() or 0

        if recent_count > 0:
            return None  # User has been active recently

        # Find days since last log for better template matching
        last_log_stmt = select(func.max(AIFoodLog.logged_at)).where(
            AIFoodLog.user_id == user_id,
            AIFoodLog.deleted_at.is_(None),
        )
        last_result = await self.session.execute(last_log_stmt)
        last_log = last_result.scalar()

        actual_days = threshold_days
        if last_log:
            actual_days = (now - last_log).days

        # Pick the best matching template
        templates = NOTIFICATION_TEMPLATES["inactivity_reengagement"]
        best_key = threshold_days
        for key in sorted(templates.keys()):
            if actual_days >= key:
                best_key = key
        template = templates.get(best_key, templates[2])

        idem_key = f"inactivity_reengagement:{user_id}:{now.date().isoformat()}"

        return NotificationIntent(
            type=NotificationType.INACTIVITY_REENGAGEMENT,
            title=template["title"],
            body=template["body"],
            data={"days_inactive": actual_days},
            priority=6,
            idempotency_key=idem_key,
            category="engagement",
        )

    # ------------------------------------------------------------------
    # Inactivity nudge (same-day, 4+ hours)
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

        if current_hour < _WAKING_HOUR_START or current_hour >= _WAKING_HOUR_END:
            return None

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

        templates = NOTIFICATION_TEMPLATES["inactivity_nudge"]
        # Use hour-window idempotency: one nudge per 4-hour window
        window = current_hour // 4
        idem_key = f"inactivity_nudge:{user_id}:{today.isoformat()}:w{window}"

        if last_log_at is None:
            waking_start_dt = datetime.combine(today, dt_time(hour=_WAKING_HOUR_START))
            hours_since_wake = (now - waking_start_dt).total_seconds() / 3600.0
            if hours_since_wake >= _INACTIVITY_THRESHOLD_HOURS:
                return NotificationIntent(
                    type=NotificationType.INACTIVITY_NUDGE,
                    title=templates["title"],
                    body=templates["body_no_logs"],
                    data={"hours_since_last_log": round(hours_since_wake, 1)},
                    priority=3,
                    idempotency_key=idem_key,
                    category="engagement",
                )
            return None

        hours_since_last = (now - last_log_at).total_seconds() / 3600.0
        if hours_since_last >= _INACTIVITY_THRESHOLD_HOURS:
            return NotificationIntent(
                type=NotificationType.INACTIVITY_NUDGE,
                title=templates["title"],
                body=templates["body_hours"].format(hours=int(hours_since_last)),
                data={"hours_since_last_log": round(hours_since_last, 1)},
                priority=3,
                idempotency_key=idem_key,
                category="engagement",
            )

        return None

    # ------------------------------------------------------------------
    # Weekly progress summary
    # ------------------------------------------------------------------

    async def _weekly_summary(
        self,
        user_id: int,
        now: datetime,
        prefs: NotificationSchedule,
    ) -> Optional[NotificationIntent]:
        """
        Generate a weekly progress summary. Only fires on the user's
        configured summary day (default Monday) within a 60-minute window.
        """
        # Check if today is the right day of the week (0=Monday)
        if now.weekday() != prefs.weekly_summary_day:
            return None

        summary_time = dt_time(hour=prefs.weekly_summary_hour, minute=prefs.weekly_summary_minute)
        summary_dt = datetime.combine(now.date(), summary_time)
        delta_minutes = (now - summary_dt).total_seconds() / 60.0

        if not (-5 <= delta_minutes <= 60):
            return None

        today = now.date()
        idem_key = f"weekly_summary:{user_id}:{today.isoformat()}"

        # Get last 7 days of nutrition data
        week_start = today - timedelta(days=7)
        stmt = select(
            func.date(AIFoodLog.logged_at).label("log_date"),
            func.sum(AIFoodLog.calories).label("total_cal"),
        ).where(
            AIFoodLog.user_id == user_id,
            AIFoodLog.logged_at >= datetime.combine(week_start, dt_time.min),
            AIFoodLog.logged_at < datetime.combine(today, dt_time.min),
        ).group_by(
            func.date(AIFoodLog.logged_at),
        )
        result = await self.session.execute(stmt)
        daily_totals = result.all()

        templates = NOTIFICATION_TEMPLATES["weekly_summary"]

        if not daily_totals:
            return NotificationIntent(
                type=NotificationType.WEEKLY_SUMMARY,
                title=templates["title"],
                body=templates["body_no_data"],
                data={"days_logged": 0},
                priority=6,
                idempotency_key=idem_key,
                category="summary",
            )

        days_logged = len(daily_totals)
        total_calories = sum(int(row[1] or 0) for row in daily_totals)
        avg_cal = total_calories // days_logged if days_logged > 0 else 0

        # Find best day (closest to target)
        target_stmt = select(OnboardingProfile.daily_calories).where(
            OnboardingProfile.user_id == user_id
        )
        target_result = await self.session.execute(target_stmt)
        target_row = target_result.first()
        target_cal = int(target_row[0]) if target_row and target_row[0] else 2000

        tolerance = target_cal * _GOAL_TOLERANCE_PERCENT / 100.0
        days_on_target = 0
        best_day_name = "N/A"
        best_day_diff = float("inf")

        day_names = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"]
        for row in daily_totals:
            day_date = row[0]
            if isinstance(day_date, str):
                day_date = date.fromisoformat(day_date)
            elif isinstance(day_date, datetime):
                day_date = day_date.date()
            day_cal = int(row[1] or 0)
            diff = abs(day_cal - target_cal)
            if diff <= tolerance:
                days_on_target += 1
            if diff < best_day_diff:
                best_day_diff = diff
                best_day_name = day_names[day_date.weekday()]

        body = templates["body_template"].format(
            avg_cal=f"{avg_cal:,}",
            days_logged=days_logged,
            best_day=best_day_name,
            days_on_target=days_on_target,
        )

        return NotificationIntent(
            type=NotificationType.WEEKLY_SUMMARY,
            title=templates["title"],
            body=body,
            data={
                "avg_calories": avg_cal,
                "days_logged": days_logged,
                "days_on_target": days_on_target,
                "total_calories": total_calories,
            },
            priority=6,
            idempotency_key=idem_key,
            category="summary",
        )

    # ------------------------------------------------------------------
    # Goal milestone
    # ------------------------------------------------------------------

    async def _goal_milestone(
        self,
        user_id: int,
        now: datetime,
    ) -> Optional[NotificationIntent]:
        """
        If the user has hit their calorie target for N consecutive days
        (where N is a milestone), send a congratulatory notification.
        """
        today = now.date()

        # Get target
        target_stmt = select(OnboardingProfile.daily_calories).where(
            OnboardingProfile.user_id == user_id
        )
        target_result = await self.session.execute(target_stmt)
        target_row = target_result.first()
        if not target_row or not target_row[0]:
            return None
        target_cal = int(target_row[0])
        tolerance = target_cal * _GOAL_TOLERANCE_PERCENT / 100.0

        # Check last 30 days of daily totals (going backwards from yesterday)
        consecutive_on_target = 0
        for days_back in range(1, 31):
            check_date = today - timedelta(days=days_back)
            day_start = datetime.combine(check_date, dt_time.min)
            day_end = datetime.combine(check_date, dt_time.max)

            stmt = select(
                func.coalesce(func.sum(AIFoodLog.calories), 0),
                func.count(AIFoodLog.id),
            ).where(
                AIFoodLog.user_id == user_id,
                AIFoodLog.logged_at >= day_start,
                AIFoodLog.logged_at <= day_end,
            )
            result = await self.session.execute(stmt)
            row = result.one()
            day_cal = int(row[0])
            day_count = int(row[1])

            if day_count == 0:
                break  # No logs this day, streak broken

            if abs(day_cal - target_cal) <= tolerance:
                consecutive_on_target += 1
            else:
                break  # Off target, streak broken

        # Check if this count matches a milestone
        if consecutive_on_target in _GOAL_MILESTONES:
            templates = NOTIFICATION_TEMPLATES["goal_milestone"]
            template = templates.get(consecutive_on_target, templates[3])
            idem_key = f"goal_milestone:{user_id}:{today.isoformat()}:{consecutive_on_target}"

            return NotificationIntent(
                type=NotificationType.GOAL_MILESTONE,
                title=template["title"],
                body=template["body"],
                data={
                    "consecutive_days_on_target": consecutive_on_target,
                    "target_calories": target_cal,
                },
                priority=3,
                idempotency_key=idem_key,
                category="achievement",
            )

        return None

    # ------------------------------------------------------------------
    # Achievement unlocked
    # ------------------------------------------------------------------

    async def _achievement_unlocked(
        self,
        user_id: int,
        now: datetime,
    ) -> List[NotificationIntent]:
        """
        Check for achievements unlocked today that haven't been notified yet.
        Uses idempotency keys to avoid duplicate notifications.
        """
        today = now.date()
        today_start = datetime.combine(today, dt_time.min)
        today_end = datetime.combine(today, dt_time.max)

        # Get achievements unlocked today
        stmt = (
            select(UserAchievement, AchievementDefinition)
            .join(
                AchievementDefinition,
                UserAchievement.achievement_id == AchievementDefinition.id,
            )
            .where(
                UserAchievement.user_id == user_id,
                UserAchievement.unlocked_at >= today_start,
                UserAchievement.unlocked_at <= today_end,
            )
        )
        result = await self.session.execute(stmt)
        rows = result.all()

        if not rows:
            return []

        templates = NOTIFICATION_TEMPLATES["achievement_unlocked"]
        intents: List[NotificationIntent] = []

        for user_ach, ach_def in rows:
            idem_key = f"achievement_unlocked:{user_id}:{ach_def.code}:{today.isoformat()}"

            intents.append(
                NotificationIntent(
                    type=NotificationType.ACHIEVEMENT_UNLOCKED,
                    title=templates["title_template"].format(name=ach_def.name),
                    body=templates["body_template"].format(description=ach_def.description),
                    data={
                        "achievement_code": ach_def.code,
                        "achievement_name": ach_def.name,
                        "rarity": ach_def.rarity,
                        "xp_reward": ach_def.xp_reward,
                        "coins_reward": ach_def.coins_reward,
                    },
                    priority=3,
                    idempotency_key=idem_key,
                    category="achievement",
                )
            )

        return intents

    # ------------------------------------------------------------------
    # Streak calculation
    # ------------------------------------------------------------------

    async def _calculate_current_streak(self, user_id: int, today: date) -> int:
        """
        Count consecutive days ending yesterday-or-today with at least
        one food log.
        """
        stmt = (
            select(func.date(AIFoodLog.logged_at).label("log_date"))
            .where(AIFoodLog.user_id == user_id, AIFoodLog.deleted_at.is_(None))
            .distinct()
            .order_by(func.date(AIFoodLog.logged_at).desc())
        )
        result = await self.session.execute(stmt)
        rows = result.all()

        if not rows:
            return 0

        log_dates: set[date] = set()
        for row in rows:
            val = row[0]
            if isinstance(val, str):
                val = date.fromisoformat(val)
            elif isinstance(val, datetime):
                val = val.date()
            log_dates.add(val)

        streak = 0
        check = today
        if check not in log_dates:
            check = today - timedelta(days=1)

        while check in log_dates:
            streak += 1
            check -= timedelta(days=1)

        return streak

    # ------------------------------------------------------------------
    # Notification preferences check (legacy -- checks onboarding)
    # ------------------------------------------------------------------

    async def are_notifications_enabled(self, user_id: int) -> bool:
        """
        Check if the user opted-in to notifications. First checks the
        NotificationSchedule table, falls back to OnboardingProfile.
        """
        # Check dedicated schedule table first
        stmt = select(NotificationSchedule.notifications_enabled).where(
            NotificationSchedule.user_id == user_id
        )
        result = await self.session.execute(stmt)
        schedule_enabled = result.first()
        if schedule_enabled is not None:
            return bool(schedule_enabled)

        # Fall back to onboarding profile
        stmt2 = select(OnboardingProfile.notifications_enabled).where(
            OnboardingProfile.user_id == user_id
        )
        result2 = await self.session.execute(stmt2)
        enabled = result2.first()
        return bool(enabled) if enabled is not None else False

    # ------------------------------------------------------------------
    # Batch evaluation for all active users (background task)
    # ------------------------------------------------------------------

    async def evaluate_and_dispatch_all_users(
        self,
        now: Optional[datetime] = None,
        timeout_seconds: int = 300,
    ) -> dict:
        """
        Evaluate and dispatch notifications for ALL users who have active
        push tokens.

        Designed to be called by a periodic background task (e.g., every
        15 minutes via Celery or an asyncio loop).

        Improvements over the basic loop:
        - Progress logging every 50 users
        - Timeout guard (default 5 minutes)
        - Dead letter recording for permanently failed notifications
        - Per-user error isolation (one failure does not break the batch)

        Note: For production use, prefer calling ``nightly_notification_dispatch``
        from ``batch_jobs.py`` which adds metrics tracking on top.
        """
        import time as time_mod

        _t0 = time_mod.perf_counter()
        now = now or datetime.now(timezone.utc)

        # Get all user IDs with active push tokens
        stmt = (
            select(PushToken.user_id)
            .where(PushToken.is_active == True)  # noqa: E712
            .distinct()
        )
        result = await self.session.execute(stmt)
        user_ids = [row[0] for row in result.all()]

        stats = {
            "users_evaluated": 0,
            "users_skipped": 0,
            "notifications_sent": 0,
            "notifications_failed": 0,
            "errors": 0,
        }

        _PROGRESS_INTERVAL = 50

        logger.info(
            "evaluate_and_dispatch_all_users: starting for %d users at %s",
            len(user_ids), now.isoformat(),
        )

        for i, uid in enumerate(user_ids):
            # Timeout guard
            elapsed = time_mod.perf_counter() - _t0
            if elapsed > timeout_seconds:
                stats["users_skipped"] = len(user_ids) - i
                logger.warning(
                    "evaluate_and_dispatch_all_users: timeout after %.1fs -- %d users skipped",
                    elapsed, stats["users_skipped"],
                )
                break

            try:
                intents = await self.evaluate_notifications(uid, now)
                if intents:
                    tickets = await self.dispatch_notifications(uid, intents)
                    for ticket in tickets:
                        if isinstance(ticket, dict) and ticket.get("status") == "error":
                            stats["notifications_failed"] += 1
                        else:
                            stats["notifications_sent"] += 1
                stats["users_evaluated"] += 1
            except Exception as exc:
                logger.error(
                    "Error evaluating notifications for user %d: %s", uid, exc
                )
                stats["errors"] += 1

            # Progress logging
            if (i + 1) % _PROGRESS_INTERVAL == 0:
                logger.info(
                    "evaluate_and_dispatch_all_users: progress %d/%d (%.0f%%)",
                    i + 1, len(user_ids), (i + 1) / len(user_ids) * 100,
                )

        duration_ms = round((time_mod.perf_counter() - _t0) * 1000, 1)

        logger.info(
            "Batch notification dispatch complete: %d users evaluated, "
            "%d skipped, %d sent, %d failed, %d errors in %.1fms",
            stats["users_evaluated"],
            stats["users_skipped"],
            stats["notifications_sent"],
            stats["notifications_failed"],
            stats["errors"],
            duration_ms,
        )

        stats["duration_ms"] = duration_ms
        return stats
