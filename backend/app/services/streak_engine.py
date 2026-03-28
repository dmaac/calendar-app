"""
Streak Engine -- streak tracking, freeze management, and streak status.

AI TOKEN COST: ZERO. 100% rule-based.

Manages the user's daily streak: extending on log, breaking on miss,
freeze consumption, and comprehensive status reporting.

Works with UserProgressProfile for streak state and ProgressEvent for
audit trail. All text in Spanish (target audience: LATAM).

Timezone handling
-----------------
All date-boundary calculations now support an explicit ``target_date``
parameter via ``update_streak_for_date()``.  The batch job resolves
each user's local date from ``onboarding_profile.timezone`` (IANA format,
e.g. "America/Santiago") and passes it here.  The original
``update_streak()`` remains for backward compatibility and uses
``date.today()`` (server-local time).
"""

from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func, and_
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..models.ai_food_log import AIFoodLog
from ..models.progress import (
    ProgressEvent,
    UserProgressProfile,
)

logger = logging.getLogger(__name__)

# Minimum meals required per day to count as "active" for streak purposes
MIN_MEALS_FOR_STREAK = 1

# Streak milestone thresholds for bonus rewards
STREAK_MILESTONES = [3, 7, 14, 30, 60, 90, 180, 365]


# ---------------------------------------------------------------------------
# Core streak operations
# ---------------------------------------------------------------------------

async def _get_or_create_profile(
    user_id: int, session: AsyncSession
) -> UserProgressProfile:
    """Get or create progress profile for a user.

    Uses flush() instead of commit() so callers control the transaction.
    """
    result = await session.execute(
        select(UserProgressProfile).where(UserProgressProfile.user_id == user_id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        profile = UserProgressProfile(user_id=user_id)
        session.add(profile)
        await session.flush()
    return profile


async def _count_meals_for_date(
    user_id: int, target_date: date, session: AsyncSession
) -> int:
    """Count food logs for a specific date.

    Uses explicit date boundaries to avoid timezone ambiguity.
    The caller is responsible for passing the correct date (e.g. user's
    local date rather than UTC).
    """
    day_start = datetime.combine(target_date, datetime.min.time())
    day_end = datetime.combine(target_date, datetime.max.time())
    result = await session.execute(
        select(func.count(AIFoodLog.id)).where(
            and_(
                AIFoodLog.user_id == user_id,
                AIFoodLog.logged_at >= day_start,
                AIFoodLog.logged_at <= day_end,
                AIFoodLog.deleted_at.is_(None),
            )
        )
    )
    return result.scalar_one() or 0


async def _count_today_meals(user_id: int, session: AsyncSession) -> int:
    """Count food logs for today (server-local date).

    Backward-compatible wrapper. Prefer ``_count_meals_for_date`` with an
    explicit date when timezone matters.
    """
    return await _count_meals_for_date(user_id, date.today(), session)


async def _was_streak_extended_on_date(
    user_id: int, target_date: date, session: AsyncSession
) -> bool:
    """Check if streak was already extended on *target_date* (idempotency guard)."""
    day_start = datetime.combine(target_date, datetime.min.time())
    day_end = datetime.combine(target_date, datetime.max.time())
    result = await session.execute(
        select(func.count(ProgressEvent.id)).where(
            and_(
                ProgressEvent.user_id == user_id,
                ProgressEvent.event_type == "streak_extended",
                ProgressEvent.created_at >= day_start,
                ProgressEvent.created_at <= day_end,
            )
        )
    )
    return (result.scalar_one() or 0) > 0


async def _was_streak_frozen_on_date(
    user_id: int, target_date: date, session: AsyncSession
) -> bool:
    """Check if a freeze was already consumed on *target_date* (idempotency guard)."""
    day_start = datetime.combine(target_date, datetime.min.time())
    day_end = datetime.combine(target_date, datetime.max.time())
    result = await session.execute(
        select(func.count(ProgressEvent.id)).where(
            and_(
                ProgressEvent.user_id == user_id,
                ProgressEvent.event_type == "streak_frozen",
                ProgressEvent.created_at >= day_start,
                ProgressEvent.created_at <= day_end,
            )
        )
    )
    return (result.scalar_one() or 0) > 0


async def _was_streak_lost_on_date(
    user_id: int, target_date: date, session: AsyncSession
) -> bool:
    """Check if the streak was already marked as lost on *target_date*."""
    day_start = datetime.combine(target_date, datetime.min.time())
    day_end = datetime.combine(target_date, datetime.max.time())
    result = await session.execute(
        select(func.count(ProgressEvent.id)).where(
            and_(
                ProgressEvent.user_id == user_id,
                ProgressEvent.event_type == "streak_lost",
                ProgressEvent.created_at >= day_start,
                ProgressEvent.created_at <= day_end,
            )
        )
    )
    return (result.scalar_one() or 0) > 0


async def _was_streak_already_extended_today(
    user_id: int, session: AsyncSession
) -> bool:
    """Check if streak was already extended today (prevent double-counting).

    Backward-compatible wrapper. Prefer ``_was_streak_extended_on_date``.
    """
    return await _was_streak_extended_on_date(user_id, date.today(), session)


async def update_streak(
    user_id: int, session: AsyncSession
) -> dict:
    """Check today's meal count and extend, freeze, or break the streak.

    Called after a food log is created. Uses server-local ``date.today()``.
    For timezone-aware batch processing, use ``update_streak_for_date``.
    Uses flush() internally -- the caller must commit() when ready.

    Returns:
        {
            streak_days: int,
            extended: bool,
            frozen: bool,
            lost: bool,
            best_streak: int,
            milestone_hit: int | None,
            is_at_risk: bool,
        }
    """
    return await update_streak_for_date(user_id, date.today(), session)


async def update_streak_for_date(
    user_id: int,
    target_date: date,
    session: AsyncSession,
) -> dict:
    """Evaluate streak for *user_id* on a specific *target_date*.

    This is the timezone-aware variant used by the nightly batch job.
    The caller passes the user's local date (resolved from their IANA
    timezone in onboarding_profile.timezone).

    Idempotent: if the streak was already extended, frozen, or lost on
    *target_date*, the function returns the current state without making
    any changes.

    Args:
        user_id: the user to evaluate
        target_date: the user's local date (resolved by the caller)
        session: async DB session

    Returns:
        {
            streak_days: int,
            extended: bool,
            frozen: bool,
            lost: bool,
            best_streak: int,
            milestone_hit: int | None,
            is_at_risk: bool,
        }
    """
    try:
        profile = await _get_or_create_profile(user_id, session)
        day_meals = await _count_meals_for_date(user_id, target_date, session)
        already_extended = await _was_streak_extended_on_date(user_id, target_date, session)
        already_frozen = await _was_streak_frozen_on_date(user_id, target_date, session)
        already_lost = await _was_streak_lost_on_date(user_id, target_date, session)

        milestone_hit = None

        # --- Case 1: user logged enough meals ---
        if day_meals >= MIN_MEALS_FOR_STREAK:
            if already_extended:
                # Idempotent: already counted this date
                return {
                    "streak_days": profile.current_streak_days,
                    "extended": False,
                    "frozen": False,
                    "lost": False,
                    "best_streak": profile.best_streak_days,
                    "milestone_hit": None,
                    "is_at_risk": False,
                }

            # Extend streak
            profile.current_streak_days += 1
            if profile.current_streak_days > profile.best_streak_days:
                profile.best_streak_days = profile.current_streak_days

            # Check milestones
            if profile.current_streak_days in STREAK_MILESTONES:
                milestone_hit = profile.current_streak_days

            # Log event
            event = ProgressEvent(
                user_id=user_id,
                event_type="streak_extended",
                metadata_json=json.dumps({
                    "days": profile.current_streak_days,
                    "milestone": milestone_hit,
                    "evaluated_date": str(target_date),
                }),
            )
            session.add(event)
            profile.last_progress_event_at = datetime.now(timezone.utc)

            await session.flush()
            logger.info(
                "Streak extended: user_id=%d days=%d milestone=%s date=%s",
                user_id, profile.current_streak_days, milestone_hit, target_date,
            )

            return {
                "streak_days": profile.current_streak_days,
                "extended": True,
                "frozen": False,
                "lost": False,
                "best_streak": profile.best_streak_days,
                "milestone_hit": milestone_hit,
                "is_at_risk": False,
            }

        # --- Case 2: no meals -- check idempotency first ---
        if already_frozen or already_lost:
            # Already handled for this date -- idempotent return
            return {
                "streak_days": profile.current_streak_days,
                "extended": False,
                "frozen": already_frozen,
                "lost": already_lost,
                "best_streak": profile.best_streak_days,
                "milestone_hit": None,
                "is_at_risk": not already_frozen and profile.current_streak_days > 0,
            }

        # Try to use a freeze
        if profile.streak_freezes_available > 0 and profile.current_streak_days > 0:
            profile.streak_freezes_available -= 1
            event = ProgressEvent(
                user_id=user_id,
                event_type="streak_frozen",
                metadata_json=json.dumps({
                    "days": profile.current_streak_days,
                    "freezes_left": profile.streak_freezes_available,
                    "evaluated_date": str(target_date),
                }),
            )
            session.add(event)
            await session.flush()

            logger.info(
                "Streak frozen: user_id=%d days=%d freezes_left=%d date=%s",
                user_id, profile.current_streak_days,
                profile.streak_freezes_available, target_date,
            )

            return {
                "streak_days": profile.current_streak_days,
                "extended": False,
                "frozen": True,
                "lost": False,
                "best_streak": profile.best_streak_days,
                "milestone_hit": None,
                "is_at_risk": False,
            }

        # --- Case 3: streak lost ---
        old_streak = profile.current_streak_days
        if old_streak > 0:
            profile.current_streak_days = 0
            event = ProgressEvent(
                user_id=user_id,
                event_type="streak_lost",
                metadata_json=json.dumps({
                    "old_streak": old_streak,
                    "evaluated_date": str(target_date),
                }),
            )
            session.add(event)
            await session.flush()

            logger.info(
                "Streak lost: user_id=%d old_streak=%d date=%s",
                user_id, old_streak, target_date,
            )

        return {
            "streak_days": 0,
            "extended": False,
            "frozen": False,
            "lost": old_streak > 0,
            "best_streak": profile.best_streak_days,
            "milestone_hit": None,
            "is_at_risk": True,
        }
    except Exception:
        logger.exception(
            "Error updating streak: user_id=%d date=%s", user_id, target_date
        )
        raise


# ---------------------------------------------------------------------------
# Streak freeze management
# ---------------------------------------------------------------------------

async def use_streak_freeze(
    user_id: int, session: AsyncSession
) -> dict:
    """Manually consume a streak freeze to protect the current streak.

    Can be called by the user proactively (e.g. "I know I won't log today").

    Returns:
        {
            success: bool,
            error: str | None,
            streak_days: int,
            freezes_available: int,
            freezes_used_total: int,
        }
    """
    try:
        profile = await _get_or_create_profile(user_id, session)

        if profile.streak_freezes_available <= 0:
            return {
                "success": False,
                "error": "No tienes freezes disponibles. Compra mas en la tienda.",
                "streak_days": profile.current_streak_days,
                "freezes_available": 0,
                "freezes_used_total": await _count_freezes_used(user_id, session),
            }

        if profile.current_streak_days == 0:
            return {
                "success": False,
                "error": "No tienes una racha activa que proteger.",
                "streak_days": 0,
                "freezes_available": profile.streak_freezes_available,
                "freezes_used_total": await _count_freezes_used(user_id, session),
            }

        profile.streak_freezes_available -= 1

        event = ProgressEvent(
            user_id=user_id,
            event_type="streak_frozen",
            metadata_json=json.dumps({
                "days": profile.current_streak_days,
                "freezes_left": profile.streak_freezes_available,
                "manual": True,
            }),
        )
        session.add(event)
        await session.flush()

        freezes_used = await _count_freezes_used(user_id, session)

        logger.info(
            "Manual freeze used: user_id=%d streak=%d freezes_left=%d",
            user_id, profile.current_streak_days, profile.streak_freezes_available,
        )

        return {
            "success": True,
            "error": None,
            "streak_days": profile.current_streak_days,
            "freezes_available": profile.streak_freezes_available,
            "freezes_used_total": freezes_used,
        }
    except Exception:
        logger.exception("Error using streak freeze: user_id=%d", user_id)
        raise


async def _count_freezes_used(user_id: int, session: AsyncSession) -> int:
    """Count total streak freezes used historically."""
    result = await session.execute(
        select(func.count(ProgressEvent.id)).where(
            and_(
                ProgressEvent.user_id == user_id,
                ProgressEvent.event_type == "streak_frozen",
            )
        )
    )
    return result.scalar_one() or 0


# ---------------------------------------------------------------------------
# Streak status reporting
# ---------------------------------------------------------------------------

async def get_streak_status(
    user_id: int, session: AsyncSession
) -> dict:
    """Get comprehensive streak status for the frontend.

    Returns:
        {
            current_streak: int,
            best_streak: int,
            freezes_available: int,
            freezes_used_total: int,
            is_at_risk: bool,       -- No log today yet and has active streak
            logged_today: bool,
            next_milestone: int | None,
            days_to_milestone: int | None,
            streak_rank: str,       -- Descriptive rank label (Spanish)
            last_log_date: str | None,
        }
    """
    try:
        profile = await _get_or_create_profile(user_id, session)
        today_meals = await _count_today_meals(user_id, session)
        freezes_used = await _count_freezes_used(user_id, session)

        # Last log date
        last_log_q = await session.execute(
            select(func.max(func.date(AIFoodLog.logged_at))).where(
                AIFoodLog.user_id == user_id,
                AIFoodLog.deleted_at.is_(None),
            )
        )
        last_log_date = last_log_q.scalar()

        # Calculate at-risk (no log today AND has active streak)
        is_at_risk = (
            today_meals < MIN_MEALS_FOR_STREAK
            and profile.current_streak_days > 0
        )

        # Next milestone
        next_milestone = None
        days_to_milestone = None
        for m in STREAK_MILESTONES:
            if profile.current_streak_days < m:
                next_milestone = m
                days_to_milestone = m - profile.current_streak_days
                break

        # Streak rank label (Spanish)
        streak_rank = _get_streak_rank(profile.current_streak_days)

        return {
            "current_streak": profile.current_streak_days,
            "best_streak": profile.best_streak_days,
            "freezes_available": profile.streak_freezes_available,
            "freezes_used_total": freezes_used,
            "is_at_risk": is_at_risk,
            "logged_today": today_meals >= MIN_MEALS_FOR_STREAK,
            "next_milestone": next_milestone,
            "days_to_milestone": days_to_milestone,
            "streak_rank": streak_rank,
            "last_log_date": str(last_log_date) if last_log_date else None,
        }
    except Exception:
        logger.exception("Error getting streak status: user_id=%d", user_id)
        raise


def _get_streak_rank(days: int) -> str:
    """Return a descriptive rank label for the streak length (Spanish)."""
    if days == 0:
        return "Sin racha"
    if days < 3:
        return "Iniciando"
    if days < 7:
        return "En camino"
    if days < 14:
        return "Constante"
    if days < 30:
        return "Disciplinado"
    if days < 60:
        return "Imparable"
    if days < 90:
        return "Legendario"
    if days < 180:
        return "Maestro"
    if days < 365:
        return "Titan"
    return "Inmortal"


# ---------------------------------------------------------------------------
# Streak history for charts
# ---------------------------------------------------------------------------

async def get_streak_history(
    user_id: int,
    days: int,
    session: AsyncSession,
) -> list[dict]:
    """Get streak events for the last N days for charting.

    Args:
        user_id: The user.
        days: Number of days to look back (minimum 1).
        session: Async DB session.

    Returns:
        List of {date, event_type, streak_days} entries, ordered by date ascending.
    """
    if days < 1:
        days = 1

    since = datetime.combine(
        date.today() - timedelta(days=days),
        datetime.min.time(),
    )

    try:
        result = await session.execute(
            select(ProgressEvent)
            .where(
                and_(
                    ProgressEvent.user_id == user_id,
                    ProgressEvent.event_type.in_(["streak_extended", "streak_frozen", "streak_lost"]),
                    ProgressEvent.created_at >= since,
                )
            )
            .order_by(ProgressEvent.created_at.asc())
        )
        events = result.scalars().all()

        history: list[dict] = []
        for e in events:
            metadata = json.loads(e.metadata_json) if e.metadata_json else {}
            history.append({
                "date": e.created_at.strftime("%Y-%m-%d") if e.created_at else None,
                "event_type": e.event_type,
                "streak_days": metadata.get("days", metadata.get("old_streak", 0)),
            })

        return history
    except Exception:
        logger.exception("Error getting streak history: user_id=%d days=%d", user_id, days)
        raise
