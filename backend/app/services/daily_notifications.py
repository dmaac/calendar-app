"""
Daily Motivational Notification Service.

Generates personalized push notifications at three key moments of the day:
  - Morning (7-8 AM): greeting, yesterday summary, streak, motivational tip
  - Lunch (12-1 PM): progress check, macro balance tip
  - Evening (7-8 PM): daily summary, streak celebration/warning, tomorrow motivation

Also maintains a pool of 30+ rotating Spanish nutrition tips so users never
see the same tip twice within a month.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, time as dt_time
from typing import Optional

from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..models.ai_food_log import AIFoodLog
from ..models.notification_schedule import NotificationSchedule
from ..models.onboarding_profile import OnboardingProfile
from ..models.push_token import PushToken
from ..models.user import User
from .notification_service import NotificationService

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Rotating daily tips pool (Spanish, 31 tips -- one per day of month)
# ---------------------------------------------------------------------------

DAILY_TIPS: list[dict] = [
    # -- Hydration (1-5) --
    {
        "category": "hydration",
        "tip": "Beber agua antes de cada comida puede ayudarte a controlar las porciones.",
    },
    {
        "category": "hydration",
        "tip": "Tu cuerpo necesita al menos 2 litros de agua al dia. Lleva una botella contigo.",
    },
    {
        "category": "hydration",
        "tip": "Si sientes hambre entre comidas, prueba beber un vaso de agua primero. A veces la sed se confunde con hambre.",
    },
    {
        "category": "hydration",
        "tip": "El agua con limon en ayunas puede activar tu metabolismo por la manana.",
    },
    {
        "category": "hydration",
        "tip": "Evita las bebidas azucaradas. Un refresco puede tener mas de 150 kcal sin aportar nutrientes.",
    },
    # -- Protein (6-10) --
    {
        "category": "protein",
        "tip": "Incluir proteina en cada comida te ayuda a mantener la saciedad por mas tiempo.",
    },
    {
        "category": "protein",
        "tip": "Huevos, pollo, pescado, legumbres y tofu son excelentes fuentes de proteina.",
    },
    {
        "category": "protein",
        "tip": "La proteina es clave para recuperar tus musculos despues del ejercicio.",
    },
    {
        "category": "protein",
        "tip": "Un yogur griego tiene el doble de proteina que un yogur normal. Excelente opcion de snack.",
    },
    {
        "category": "protein",
        "tip": "Las legumbres como lentejas y garbanzos son fuentes de proteina vegetal muy economicas.",
    },
    # -- Fiber (11-15) --
    {
        "category": "fiber",
        "tip": "La fibra mejora tu digestion y te mantiene satisfecho. Frutas, verduras y cereales integrales son tu aliado.",
    },
    {
        "category": "fiber",
        "tip": "Intenta comer al menos 25g de fibra al dia. Las manzanas, peras y avena son excelentes fuentes.",
    },
    {
        "category": "fiber",
        "tip": "Reemplaza el pan blanco por pan integral. Pequenos cambios hacen grandes diferencias.",
    },
    {
        "category": "fiber",
        "tip": "Las semillas de chia y linaza son superalimentos ricos en fibra. Agregalas a tus batidos.",
    },
    {
        "category": "fiber",
        "tip": "Comer ensalada antes del plato principal te ayuda a consumir mas fibra y sentirte lleno antes.",
    },
    # -- Vitamins / micronutrients (16-20) --
    {
        "category": "vitamins",
        "tip": "Los colores en tu plato importan. Mientras mas variado, mas vitaminas y minerales obtendras.",
    },
    {
        "category": "vitamins",
        "tip": "El platano es rico en potasio, ideal para evitar calambres despues del ejercicio.",
    },
    {
        "category": "vitamins",
        "tip": "Las espinacas y el brocoli son bombas de nutrientes. Intenta incluir verduras verdes a diario.",
    },
    {
        "category": "vitamins",
        "tip": "La vitamina D se obtiene del sol y de alimentos como el salmon y los huevos. Es esencial para tus huesos.",
    },
    {
        "category": "vitamins",
        "tip": "Los frutos rojos son ricos en antioxidantes. Perfectos para tu snack de la tarde.",
    },
    # -- Meal timing (21-25) --
    {
        "category": "meal_timing",
        "tip": "Comer a horas regulares ayuda a tu metabolismo a funcionar mejor.",
    },
    {
        "category": "meal_timing",
        "tip": "No te saltes el desayuno. Romper el ayuno activa tu metabolismo para el dia.",
    },
    {
        "category": "meal_timing",
        "tip": "Cenar al menos 2-3 horas antes de dormir mejora la calidad de tu sueno y digestion.",
    },
    {
        "category": "meal_timing",
        "tip": "Planificar tus comidas con anticipacion reduce la tentacion de comer comida rapida.",
    },
    {
        "category": "meal_timing",
        "tip": "Un snack saludable entre comidas principales evita que llegues con mucha hambre al almuerzo o cena.",
    },
    # -- Portions (26-31) --
    {
        "category": "portions",
        "tip": "Usa platos mas pequenos. Tu cerebro percibe la porcion como mas grande y comes menos.",
    },
    {
        "category": "portions",
        "tip": "Masticar lento te ayuda a sentir saciedad antes. Dale a tu cerebro 20 minutos para procesar.",
    },
    {
        "category": "portions",
        "tip": "Una porcion de proteina debe ser del tamano de la palma de tu mano.",
    },
    {
        "category": "portions",
        "tip": "Cocinar en casa te da control total sobre las porciones y los ingredientes.",
    },
    {
        "category": "portions",
        "tip": "Servir la comida en la cocina y no llevar la fuente a la mesa reduce la tentacion de repetir.",
    },
    {
        "category": "portions",
        "tip": "Leer las etiquetas nutricionales te ayuda a entender lo que realmente estas comiendo.",
    },
]

# Goal-specific motivational messages (used in morning notification)
_GOAL_MORNING_MESSAGES: dict[str, list[str]] = {
    "lose": [
        "Cada decision saludable te acerca a tu peso ideal.",
        "Hoy es un gran dia para cuidar lo que comes.",
        "Tu constancia va a dar resultados. Sigue asi!",
        "Recuerda: no se trata de perfeccion, sino de progreso.",
    ],
    "maintain": [
        "Mantener es tan importante como lograr. Sigue con tus buenos habitos!",
        "La clave del equilibrio es la constancia diaria.",
        "Hoy es otro dia para mantener tu estilo de vida saludable.",
    ],
    "gain": [
        "Asegurate de comer suficiente proteina hoy para tu crecimiento muscular.",
        "No te saltes comidas. Cada una cuenta para alcanzar tu meta.",
        "Tu cuerpo necesita combustible para crecer. Come bien!",
    ],
}

# Evening motivational closings
_EVENING_MOTIVATIONS: list[str] = [
    "Manana es una nueva oportunidad para cuidarte.",
    "Descansa bien. Tu cuerpo se recupera mientras duermes.",
    "Cada dia que registras es un dia que mejoras.",
    "La constancia es tu superpoder. Nos vemos manana!",
    "Tu salud es una inversion, no un gasto. Sigue asi!",
]


# ---------------------------------------------------------------------------
# Helper: get the tip for today (rotates monthly, never repeats in 31 days)
# ---------------------------------------------------------------------------

def _get_daily_tip(today: date) -> dict:
    """Return the tip for today based on the day of the month (1-31 rotation)."""
    index = (today.day - 1) % len(DAILY_TIPS)
    return DAILY_TIPS[index]


def _get_goal_motivation(goal: Optional[str], today: date) -> str:
    """Return a goal-specific motivational message, rotating by day."""
    key = goal if goal in _GOAL_MORNING_MESSAGES else "lose"
    messages = _GOAL_MORNING_MESSAGES[key]
    index = today.timetuple().tm_yday % len(messages)
    return messages[index]


def _get_evening_motivation(today: date) -> str:
    """Return an evening motivational closing, rotating by day."""
    index = today.timetuple().tm_yday % len(_EVENING_MOTIVATIONS)
    return _EVENING_MOTIVATIONS[index]


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------

class DailyNotificationService:
    def __init__(self, session: AsyncSession):
        self.session = session

    # ------------------------------------------------------------------
    # Helper: fetch user + onboarding profile
    # ------------------------------------------------------------------

    async def _get_user_context(self, user_id: int) -> dict:
        """
        Load user name, onboarding goal, and daily calorie target.
        Returns a dict with user context or empty values if not found.
        """
        user_stmt = select(User).where(User.id == user_id)
        user_result = await self.session.execute(user_stmt)
        user = user_result.scalars().first()

        profile_stmt = select(OnboardingProfile).where(
            OnboardingProfile.user_id == user_id
        )
        profile_result = await self.session.execute(profile_stmt)
        profile = profile_result.scalars().first()

        first_name = ""
        if user and user.first_name:
            first_name = user.first_name

        return {
            "user": user,
            "profile": profile,
            "first_name": first_name,
            "goal": profile.goal if profile else None,
            "daily_calories": profile.daily_calories if profile else 2000,
            "daily_protein_g": profile.daily_protein_g if profile else None,
            "daily_carbs_g": profile.daily_carbs_g if profile else None,
            "daily_fats_g": profile.daily_fats_g if profile else None,
        }

    # ------------------------------------------------------------------
    # Helper: yesterday's summary data
    # ------------------------------------------------------------------

    async def _get_day_summary(self, user_id: int, day: date) -> dict:
        """
        Aggregate calorie and macro totals from AIFoodLog for a given day.
        """
        day_start = datetime.combine(day, dt_time.min)
        day_end = datetime.combine(day, dt_time.max)

        stmt = select(
            func.coalesce(func.sum(AIFoodLog.calories), 0),
            func.coalesce(func.sum(AIFoodLog.protein_g), 0),
            func.coalesce(func.sum(AIFoodLog.carbs_g), 0),
            func.coalesce(func.sum(AIFoodLog.fats_g), 0),
            func.count(AIFoodLog.id),
        ).where(
            AIFoodLog.user_id == user_id,
            AIFoodLog.logged_at >= day_start,
            AIFoodLog.logged_at <= day_end,
            AIFoodLog.deleted_at.is_(None),
        )
        result = await self.session.execute(stmt)
        row = result.one()

        return {
            "total_calories": int(row[0]),
            "total_protein": int(row[1]),
            "total_carbs": int(row[2]),
            "total_fats": int(row[3]),
            "meals_count": int(row[4]),
        }

    # ------------------------------------------------------------------
    # Helper: calculate current streak
    # ------------------------------------------------------------------

    async def _calculate_streak(self, user_id: int, today: date) -> int:
        """
        Count consecutive days ending at today (or yesterday) with at
        least one food log.
        """
        stmt = (
            select(func.date(AIFoodLog.logged_at).label("log_date"))
            .where(
                AIFoodLog.user_id == user_id,
                AIFoodLog.deleted_at.is_(None),
            )
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
    # MORNING NOTIFICATION (7-8 AM)
    # ------------------------------------------------------------------

    async def generate_morning_notification(
        self,
        user_id: int,
    ) -> dict:
        """
        Generate a morning notification with:
        - Personalized greeting
        - Yesterday's summary (if they logged)
        - Streak info (if active)
        - Goal-based motivational message
        - Water reminder

        Returns: {"title": str, "body": str, "data": dict}
        """
        today = datetime.utcnow().date()
        yesterday = today - timedelta(days=1)

        ctx = await self._get_user_context(user_id)
        first_name = ctx["first_name"]
        goal = ctx["goal"]
        target_cal = ctx["daily_calories"] or 2000

        # Build title
        greeting = f"Buenos dias, {first_name}!" if first_name else "Buenos dias!"

        # Body parts
        parts: list[str] = []

        # Yesterday summary
        yesterday_data = await self._get_day_summary(user_id, yesterday)
        if yesterday_data["meals_count"] > 0:
            parts.append(
                f"Ayer consumiste {yesterday_data['total_calories']:,} kcal. "
                f"Hoy tu meta es {target_cal:,} kcal."
            )

        # Streak
        streak = await self._calculate_streak(user_id, today)
        if streak >= 2:
            parts.append(f"Llevas {streak} dias de racha! No la pierdas hoy.")

        # Goal-based motivation
        motivation = _get_goal_motivation(goal, today)
        parts.append(motivation)

        # Daily tip
        tip = _get_daily_tip(today)
        parts.append(f"Tip: {tip['tip']}")

        # Water reminder
        parts.append("Empieza el dia con un vaso de agua.")

        body = "\n".join(parts)

        return {
            "title": greeting,
            "body": body,
            "data": {
                "type": "daily_morning",
                "screen": "HomeMain",
                "streak": streak,
                "yesterday_calories": yesterday_data["total_calories"],
                "target_calories": target_cal,
                "tip_category": tip["category"],
            },
        }

    # ------------------------------------------------------------------
    # LUNCH NOTIFICATION (12-1 PM)
    # ------------------------------------------------------------------

    async def generate_lunch_notification(
        self,
        user_id: int,
    ) -> dict:
        """
        Generate a mid-day notification with:
        - Progress check (if no meals logged, remind)
        - If on track, show calorie progress
        - Macro balance tip

        Returns: {"title": str, "body": str, "data": dict}
        """
        today = datetime.utcnow().date()

        ctx = await self._get_user_context(user_id)
        target_cal = ctx["daily_calories"] or 2000
        target_protein = ctx["daily_protein_g"]
        target_carbs = ctx["daily_carbs_g"]
        target_fats = ctx["daily_fats_g"]

        today_data = await self._get_day_summary(user_id, today)

        if today_data["meals_count"] == 0:
            # No meals logged yet
            title = "No olvides registrar tu almuerzo"
            body = (
                "Aun no has registrado comida hoy. "
                "Abre Fitsi y registra lo que has comido para mantener tu progreso."
            )
        else:
            consumed = today_data["total_calories"]
            remaining = max(0, target_cal - consumed)
            pct = round(consumed / target_cal * 100) if target_cal > 0 else 0

            title = "Asi vas hoy"

            parts: list[str] = []

            if pct <= 100:
                parts.append(
                    f"Vas bien! {consumed:,} kcal de {target_cal:,} consumidas ({pct}%)."
                )
                if remaining > 0:
                    parts.append(f"Te quedan {remaining:,} kcal para hoy.")
            else:
                over = consumed - target_cal
                parts.append(
                    f"Llevas {consumed:,} kcal, {over:,} sobre tu meta de {target_cal:,}."
                )
                parts.append("Elige opciones mas ligeras para el resto del dia.")

            # Macro balance tip
            macro_tip = self._get_macro_tip(
                today_data, target_protein, target_carbs, target_fats
            )
            if macro_tip:
                parts.append(macro_tip)

            body = "\n".join(parts)

        return {
            "title": title,
            "body": body,
            "data": {
                "type": "daily_lunch",
                "screen": "HomeMain",
                "calories_consumed": today_data["total_calories"],
                "target_calories": target_cal,
                "meals_logged": today_data["meals_count"],
            },
        }

    @staticmethod
    def _get_macro_tip(
        today_data: dict,
        target_protein: Optional[int],
        target_carbs: Optional[int],
        target_fats: Optional[int],
    ) -> Optional[str]:
        """
        Analyse current macro consumption vs targets and return a
        personalized tip, or None if targets are not set.
        """
        if not target_protein:
            return None

        consumed_protein = today_data["total_protein"]
        consumed_carbs = today_data["total_carbs"]
        consumed_fats = today_data["total_fats"]

        # Calculate what fraction of the day has passed (rough: assume lunch = 50%)
        half_target_protein = target_protein * 0.5
        half_target_carbs = (target_carbs or 0) * 0.5
        half_target_fats = (target_fats or 0) * 0.5

        if consumed_protein < half_target_protein * 0.6:
            return "Te falta proteina hoy. Prueba agregar pollo, huevos o legumbres."
        if target_carbs and consumed_carbs > half_target_carbs * 1.4:
            return "Vas alto en carbohidratos. Balancea con proteina y verduras."
        if target_fats and consumed_fats > half_target_fats * 1.4:
            return "Cuidado con las grasas hoy. Elige opciones mas ligeras."

        return None

    # ------------------------------------------------------------------
    # EVENING NOTIFICATION (7-8 PM)
    # ------------------------------------------------------------------

    async def generate_evening_notification(
        self,
        user_id: int,
    ) -> dict:
        """
        Generate an evening notification with:
        - Daily calorie summary with percentage
        - Streak celebration or warning
        - Tomorrow motivation

        Returns: {"title": str, "body": str, "data": dict}
        """
        today = datetime.utcnow().date()

        ctx = await self._get_user_context(user_id)
        target_cal = ctx["daily_calories"] or 2000

        today_data = await self._get_day_summary(user_id, today)
        consumed = today_data["total_calories"]
        streak = await self._calculate_streak(user_id, today)

        parts: list[str] = []

        # Daily summary
        if today_data["meals_count"] == 0:
            title = "Resumen del dia"
            parts.append("No registraste comidas hoy. Manana sera un mejor dia!")
        else:
            pct = round(consumed / target_cal * 100) if target_cal > 0 else 0
            title = "Resumen del dia"

            parts.append(
                f"Hoy consumiste {consumed:,} kcal ({pct}% de tu meta de {target_cal:,})."
            )
            parts.append(
                f"Macros: P {today_data['total_protein']}g | "
                f"C {today_data['total_carbs']}g | "
                f"G {today_data['total_fats']}g"
            )

        # Streak celebration or warning
        if streak >= 3:
            parts.append(f"Racha de {streak} dias! Sigue asi manana.")
        elif streak == 0 and today_data["meals_count"] == 0:
            parts.append("Registra al menos una comida antes de dormir para iniciar tu racha.")
        elif streak >= 1:
            parts.append(f"Llevas {streak} dia(s) de racha. Cada dia cuenta!")

        # Tomorrow motivation
        motivation = _get_evening_motivation(today)
        parts.append(motivation)

        body = "\n".join(parts)

        return {
            "title": title,
            "body": body,
            "data": {
                "type": "daily_evening",
                "screen": "HomeMain",
                "calories_consumed": consumed,
                "target_calories": target_cal,
                "streak": streak,
                "meals_logged": today_data["meals_count"],
            },
        }

    # ------------------------------------------------------------------
    # Batch dispatch: send daily notifications to all eligible users
    # ------------------------------------------------------------------

    async def dispatch_daily_notifications(
        self,
        slot: str,
        timeout_seconds: int = 300,
    ) -> dict:
        """
        Send the appropriate daily notification (morning/lunch/evening)
        to ALL users with active push tokens and notifications enabled.

        Args:
            slot: One of "morning", "lunch", "evening".
            timeout_seconds: Maximum time before aborting the batch.

        Returns:
            Stats dict with users_evaluated, notifications_sent, errors.
        """
        import time as time_mod

        if slot not in ("morning", "lunch", "evening"):
            raise ValueError(f"Invalid slot: {slot!r}. Must be morning, lunch, or evening.")

        _t0 = time_mod.perf_counter()

        # Find all user IDs with active push tokens
        stmt = (
            select(PushToken.user_id)
            .where(PushToken.is_active == True)  # noqa: E712
            .distinct()
        )
        result = await self.session.execute(stmt)
        user_ids = [row[0] for row in result.all()]

        stats = {
            "slot": slot,
            "users_evaluated": 0,
            "notifications_sent": 0,
            "errors": 0,
            "skipped_disabled": 0,
        }

        generator_map = {
            "morning": self.generate_morning_notification,
            "lunch": self.generate_lunch_notification,
            "evening": self.generate_evening_notification,
        }
        generator = generator_map[slot]

        notification_type_map = {
            "morning": "daily_morning",
            "lunch": "daily_lunch",
            "evening": "daily_evening",
        }
        notification_type = notification_type_map[slot]

        today_iso = datetime.utcnow().date().isoformat()

        push_service = NotificationService(self.session)

        logger.info(
            "dispatch_daily_notifications: slot=%s, %d candidate users",
            slot, len(user_ids),
        )

        for i, uid in enumerate(user_ids):
            # Timeout guard
            elapsed = time_mod.perf_counter() - _t0
            if elapsed > timeout_seconds:
                logger.warning(
                    "dispatch_daily_notifications: timeout after %.1fs at user %d/%d",
                    elapsed, i, len(user_ids),
                )
                break

            try:
                # Check if notifications are enabled
                enabled = await self._are_notifications_enabled(uid)
                if not enabled:
                    stats["skipped_disabled"] += 1
                    continue

                stats["users_evaluated"] += 1

                # Generate the notification content
                notification = await generator(uid)

                # Build idempotency key to prevent duplicates
                idem_key = f"{notification_type}:{uid}:{today_iso}"

                # Send via push
                tickets = await push_service.send_push(
                    user_id=uid,
                    title=notification["title"],
                    body=notification["body"],
                    data=notification["data"],
                    notification_type=notification_type,
                    category="engagement",
                    idempotency_key=idem_key,
                )

                if tickets:
                    stats["notifications_sent"] += 1

            except Exception as exc:
                logger.error(
                    "dispatch_daily_notifications: error for user %d: %s",
                    uid, exc,
                )
                stats["errors"] += 1

        duration_ms = round((time_mod.perf_counter() - _t0) * 1000, 1)
        stats["duration_ms"] = duration_ms

        logger.info(
            "dispatch_daily_notifications complete: slot=%s evaluated=%d sent=%d "
            "skipped=%d errors=%d duration=%.1fms",
            slot,
            stats["users_evaluated"],
            stats["notifications_sent"],
            stats["skipped_disabled"],
            stats["errors"],
            duration_ms,
        )

        return stats

    # ------------------------------------------------------------------
    # Helper: check if notifications are enabled for a user
    # ------------------------------------------------------------------

    async def _are_notifications_enabled(self, user_id: int) -> bool:
        """
        Check NotificationSchedule first, fall back to OnboardingProfile.
        """
        stmt = select(NotificationSchedule.notifications_enabled).where(
            NotificationSchedule.user_id == user_id
        )
        result = await self.session.execute(stmt)
        schedule_enabled = result.scalars().first()
        if schedule_enabled is not None:
            return bool(schedule_enabled)

        stmt2 = select(OnboardingProfile.notifications_enabled).where(
            OnboardingProfile.user_id == user_id
        )
        result2 = await self.session.execute(stmt2)
        enabled = result2.scalars().first()
        return bool(enabled) if enabled is not None else False
