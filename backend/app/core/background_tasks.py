"""Background task helpers for async processing.

Uses FastAPI's BackgroundTasks for fire-and-forget operations.
When the app scales beyond a single process, replace these with
Celery tasks backed by Redis broker.

Usage in a route::

    from fastapi import BackgroundTasks
    from app.core.background_tasks import send_notification_async

    @router.post("/food/scan")
    async def scan_food(bg: BackgroundTasks, ...):
        ...
        bg.add_task(send_notification_async, user_id, "Scan complete!", "Your meal was logged.")
        return result
"""
import logging
from datetime import date, datetime

logger = logging.getLogger(__name__)


# ─── Notification task ──────────────────────────────────────────────────────

async def send_notification_async(user_id: int, title: str, body: str):
    """Send a push notification to the user.

    Currently logs the notification. In production, integrate with
    Firebase Cloud Messaging (FCM) or Apple Push Notification Service (APNs).
    """
    logger.info(
        "NOTIFICATION [user=%s] title=%r body=%r",
        user_id, title, body,
    )
    # TODO: Integrate with FCM/APNs
    # from app.services.push import send_push
    # await send_push(user_id, title, body)


# ─── Daily summary aggregation ──────────────────────────────────────────────

async def calculate_daily_summary_async(user_id: int, summary_date: date):
    """Aggregate food logs into a daily nutrition summary.

    Computes totals for calories, macros, and meal count, then upserts
    into the daily_nutrition_summary table. Also updates the cache.
    """
    from app.core.database import AsyncSessionLocal
    from app.core.cache import cache_set, daily_summary_key, CACHE_TTL

    logger.info(
        "BACKGROUND: calculating daily summary for user=%s date=%s",
        user_id, summary_date,
    )

    try:
        async with AsyncSessionLocal() as session:
            from sqlalchemy import text as sa_text

            row = await session.execute(
                sa_text(
                    """
                    SELECT
                        COALESCE(SUM(calories), 0) AS total_calories,
                        COALESCE(SUM(protein_g), 0) AS total_protein,
                        COALESCE(SUM(carbs_g), 0) AS total_carbs,
                        COALESCE(SUM(fats_g), 0) AS total_fats,
                        COUNT(*) AS meals_logged
                    FROM ai_food_log
                    WHERE user_id = :uid
                      AND DATE(logged_at) = :d
                    """
                ),
                {"uid": user_id, "d": str(summary_date)},
            )
            result = row.mappings().first()
            if not result:
                return

            summary = {
                "user_id": user_id,
                "date": str(summary_date),
                "total_calories": float(result["total_calories"]),
                "total_protein": float(result["total_protein"]),
                "total_carbs": float(result["total_carbs"]),
                "total_fats": float(result["total_fats"]),
                "meals_logged": int(result["meals_logged"]),
            }

            # Upsert into daily_nutrition_summary if the table exists
            try:
                await session.execute(
                    sa_text(
                        """
                        INSERT INTO daily_nutrition_summary
                            (user_id, date, total_calories, total_protein_g,
                             total_carbs_g, total_fats_g, meals_logged)
                        VALUES (:uid, :d, :cal, :pro, :carb, :fat, :meals)
                        ON CONFLICT (user_id, date) DO UPDATE SET
                            total_calories = EXCLUDED.total_calories,
                            total_protein_g = EXCLUDED.total_protein_g,
                            total_carbs_g = EXCLUDED.total_carbs_g,
                            total_fats_g = EXCLUDED.total_fats_g,
                            meals_logged = EXCLUDED.meals_logged
                        """
                    ),
                    {
                        "uid": user_id,
                        "d": str(summary_date),
                        "cal": summary["total_calories"],
                        "pro": summary["total_protein"],
                        "carb": summary["total_carbs"],
                        "fat": summary["total_fats"],
                        "meals": summary["meals_logged"],
                    },
                )
                await session.commit()
            except Exception:
                # Table may not exist yet — just cache the result
                pass

            # Update cache
            cache_key = daily_summary_key(user_id, str(summary_date))
            await cache_set(cache_key, summary, CACHE_TTL["daily_summary"])

            logger.info(
                "BACKGROUND: daily summary complete for user=%s date=%s — %d kcal, %d meals",
                user_id, summary_date,
                summary["total_calories"], summary["meals_logged"],
            )

    except Exception as exc:
        logger.error(
            "BACKGROUND: daily summary failed for user=%s date=%s — %s",
            user_id, summary_date, exc,
        )


# ─── Token cleanup ──────────────────────────────────────────────────────────

async def cleanup_expired_tokens_async():
    """Remove expired refresh tokens from Redis.

    Redis handles TTL-based expiry natively, but this task cleans up
    any orphaned keys that might remain due to bugs or crashes.
    """
    from app.core.token_store import get_redis

    logger.info("BACKGROUND: cleaning up expired tokens")
    try:
        r = get_redis()
        cursor = 0
        cleaned = 0
        while True:
            cursor, keys = await r.scan(cursor, match="refresh:*", count=200)
            for key in keys:
                ttl = await r.ttl(key)
                if ttl == -1:
                    # Key exists but has no expiry — set a safe TTL
                    await r.expire(key, 30 * 86400)
                    cleaned += 1
            if cursor == 0:
                break
        logger.info("BACKGROUND: token cleanup complete — %d keys fixed", cleaned)
    except Exception as exc:
        logger.error("BACKGROUND: token cleanup failed — %s", exc)


# ─── Periodic scheduler (call from lifespan) ────────────────────────────────

async def start_periodic_cleanup(interval_hours: int = 24):
    """Run cleanup_expired_tokens_async every N hours.

    Call as a background coroutine from app lifespan::

        import asyncio
        asyncio.create_task(start_periodic_cleanup(interval_hours=24))
    """
    import asyncio
    while True:
        await asyncio.sleep(interval_hours * 3600)
        await cleanup_expired_tokens_async()
