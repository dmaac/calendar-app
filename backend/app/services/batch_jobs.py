"""
Batch jobs for scheduled/nightly processing.

nightly_risk_recalculation — recalculate adherence for all users who logged food today.
"""

import logging
import time as time_mod
from datetime import date, datetime, time as dt_time

from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..models.ai_food_log import AIFoodLog
from .nutrition_risk_service import calculate_daily_adherence

logger = logging.getLogger(__name__)


async def nightly_risk_recalculation(session: AsyncSession) -> dict:
    """Recalculate adherence for all users who logged food today.

    Intended to be run as a nightly batch job (e.g., via cron or scheduler).

    Returns:
        {"users_processed": N, "duration_ms": X, "errors": []}
    """
    _t0 = time_mod.perf_counter()
    today = date.today()
    day_start = datetime.combine(today, dt_time.min)
    day_end = datetime.combine(today, dt_time.max)

    # Query distinct user_ids from AIFoodLog where logged_at is today
    result = await session.execute(
        select(func.distinct(AIFoodLog.user_id)).where(
            AIFoodLog.logged_at >= day_start,
            AIFoodLog.logged_at <= day_end,
        )
    )
    user_ids = [row[0] for row in result.all()]

    errors: list[dict] = []
    users_processed = 0

    for uid in user_ids:
        try:
            logger.info("nightly_risk_recalculation: processing user_id=%d", uid)
            await calculate_daily_adherence(uid, today, session)
            users_processed += 1
        except Exception as exc:
            logger.error(
                "nightly_risk_recalculation: error for user_id=%d — %s",
                uid,
                str(exc),
            )
            errors.append({"user_id": uid, "error": str(exc)})

    duration_ms = round((time_mod.perf_counter() - _t0) * 1000, 1)

    logger.info(
        "nightly_risk_recalculation: done — %d users processed in %.1fms, %d errors",
        users_processed,
        duration_ms,
        len(errors),
    )

    return {
        "users_processed": users_processed,
        "duration_ms": duration_ms,
        "errors": errors,
    }
