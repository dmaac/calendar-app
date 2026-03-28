"""
Batch jobs for scheduled/nightly processing.

Jobs
-----
- nightly_risk_recalculation   -- recalculate adherence for all users who logged today
- nightly_daily_summaries      -- batch-aggregate daily nutrition summaries
- nightly_streak_evaluation    -- extend/break/freeze streaks for all active users
- nightly_notification_dispatch -- evaluate and dispatch smart notifications
- run_all_nightly_jobs         -- orchestrator that runs everything in sequence

Design principles
-----------------
1. **Batch over per-user** -- aggregate queries where possible.
2. **Isolation** -- one user failure never breaks the whole batch.
3. **Idempotency** -- re-running the same job for the same date produces the same result.
4. **Progress logging** -- every N users a progress line is emitted.
5. **Timeout guard** -- each job has a wall-clock budget; if exceeded it finishes
   the current user and stops.
6. **Metrics** -- counters and histograms feed the Prometheus /metrics endpoint.
7. **Dead letter tracking** -- persistent record of per-user failures for retry.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time as time_mod
import traceback
from datetime import date, datetime, time as dt_time, timedelta, timezone
from typing import Optional

from sqlalchemy import func, text as sa_text
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..core.metrics import (
    BATCH_JOB_DURATION,
    BATCH_JOB_USERS_PROCESSED,
    BATCH_JOB_ERRORS,
    BATCH_JOB_RUNS,
)
from ..models.ai_food_log import AIFoodLog
from ..models.onboarding_profile import OnboardingProfile
from ..models.progress import ProgressEvent, UserProgressProfile
from .nutrition_risk_service import calculate_daily_adherence

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# How often to emit a progress log line (every N users)
_PROGRESS_LOG_INTERVAL = 50

# Default wall-clock budget per job (seconds). The job will stop processing
# new users once this budget is exceeded, but will finish the current user.
_DEFAULT_TIMEOUT_SECONDS = 300  # 5 minutes

# Batch size for the daily summary SQL aggregation
_SUMMARY_BATCH_SIZE = 500

# Maximum number of errors before a job aborts early
_MAX_ERRORS_BEFORE_ABORT = 100


# ---------------------------------------------------------------------------
# Dead letter queue (in-DB record of failed items)
# ---------------------------------------------------------------------------

async def _record_dead_letter(
    session: AsyncSession,
    job_name: str,
    user_id: int,
    error_message: str,
    run_date: date,
) -> None:
    """Persist a failed-item record so it can be retried or inspected later.

    Uses the progress_event table with event_type='batch_dead_letter' to avoid
    requiring a new migration. The metadata_json field carries the details.
    """
    try:
        event = ProgressEvent(
            user_id=user_id,
            event_type="batch_dead_letter",
            metadata_json=json.dumps({
                "job": job_name,
                "date": str(run_date),
                "error": error_message[:500],  # truncate to avoid bloat
                "recorded_at": datetime.now(timezone.utc).isoformat(),
            }),
        )
        session.add(event)
        await session.flush()
    except Exception:
        # If we cannot write the dead letter, just log it -- never let DLQ
        # recording break the batch.
        logger.warning(
            "batch_jobs: failed to record dead-letter for job=%s user=%d",
            job_name, user_id,
        )


# ---------------------------------------------------------------------------
# Helper: user timezone resolution
# ---------------------------------------------------------------------------

async def _get_user_timezone(user_id: int, session: AsyncSession) -> Optional[str]:
    """Return the IANA timezone string from the user's onboarding profile."""
    result = await session.execute(
        select(OnboardingProfile.timezone).where(
            OnboardingProfile.user_id == user_id
        )
    )
    row = result.first()
    return row[0] if row else None


def _resolve_user_today(tz_name: Optional[str]) -> date:
    """Return 'today' in the user's timezone, falling back to UTC."""
    try:
        if tz_name:
            import zoneinfo
            tz = zoneinfo.ZoneInfo(tz_name)
            return datetime.now(tz).date()
    except Exception:
        pass
    return datetime.now(timezone.utc).date()


# ---------------------------------------------------------------------------
# Job 1: Nightly risk recalculation
# ---------------------------------------------------------------------------

async def nightly_risk_recalculation(
    session: AsyncSession,
    *,
    target_date: Optional[date] = None,
    timeout_seconds: int = _DEFAULT_TIMEOUT_SECONDS,
) -> dict:
    """Recalculate adherence for all users who logged food on *target_date*.

    Idempotent: calculate_daily_adherence uses ON CONFLICT / upsert internally,
    so re-running for the same date overwrites with the same result.

    Args:
        session: async DB session
        target_date: the day to recalculate (default: today UTC)
        timeout_seconds: wall-clock budget for the entire job

    Returns:
        {"users_processed": N, "users_skipped": M, "duration_ms": X, "errors": [...]}
    """
    job_name = "nightly_risk_recalculation"
    _t0 = time_mod.perf_counter()
    today = target_date or date.today()
    day_start = datetime.combine(today, dt_time.min)
    day_end = datetime.combine(today, dt_time.max)

    BATCH_JOB_RUNS.inc(job=job_name)

    # Single query to get all distinct user_ids who logged today
    result = await session.execute(
        select(func.distinct(AIFoodLog.user_id)).where(
            AIFoodLog.logged_at >= day_start,
            AIFoodLog.logged_at <= day_end,
            AIFoodLog.deleted_at.is_(None),
        )
    )
    user_ids = [row[0] for row in result.all()]

    errors: list[dict] = []
    users_processed = 0
    users_skipped = 0

    logger.info(
        "%s: starting for date=%s, %d users to process (timeout=%ds)",
        job_name, today, len(user_ids), timeout_seconds,
    )

    for i, uid in enumerate(user_ids):
        # Timeout guard
        elapsed = time_mod.perf_counter() - _t0
        if elapsed > timeout_seconds:
            users_skipped = len(user_ids) - i
            logger.warning(
                "%s: timeout after %.1fs -- %d users skipped",
                job_name, elapsed, users_skipped,
            )
            break

        try:
            await calculate_daily_adherence(uid, today, session)
            users_processed += 1
        except Exception as exc:
            logger.error(
                "%s: error for user_id=%d -- %s", job_name, uid, exc,
            )
            errors.append({"user_id": uid, "error": str(exc)})
            await _record_dead_letter(session, job_name, uid, str(exc), today)
            BATCH_JOB_ERRORS.inc(job=job_name)

            if len(errors) >= _MAX_ERRORS_BEFORE_ABORT:
                users_skipped = len(user_ids) - i - 1
                logger.error(
                    "%s: aborting -- reached %d errors", job_name, len(errors),
                )
                break

        # Progress logging
        if (i + 1) % _PROGRESS_LOG_INTERVAL == 0:
            logger.info(
                "%s: progress %d/%d (%.0f%%)",
                job_name, i + 1, len(user_ids),
                (i + 1) / len(user_ids) * 100,
            )

    duration_s = time_mod.perf_counter() - _t0
    duration_ms = round(duration_s * 1000, 1)
    BATCH_JOB_DURATION.observe(duration_s, job=job_name)
    BATCH_JOB_USERS_PROCESSED.inc(value=users_processed, job=job_name)

    logger.info(
        "%s: done -- %d processed, %d skipped, %d errors in %.1fms",
        job_name, users_processed, users_skipped, len(errors), duration_ms,
    )

    return {
        "job": job_name,
        "date": str(today),
        "users_processed": users_processed,
        "users_skipped": users_skipped,
        "duration_ms": duration_ms,
        "errors": errors,
    }


# ---------------------------------------------------------------------------
# Job 2: Batch daily summaries (single aggregate query, not per-user)
# ---------------------------------------------------------------------------

async def nightly_daily_summaries(
    session: AsyncSession,
    *,
    target_date: Optional[date] = None,
    timeout_seconds: int = _DEFAULT_TIMEOUT_SECONDS,
) -> dict:
    """Aggregate daily nutrition summaries for ALL users who logged food on
    *target_date* using a single SQL query with GROUP BY.

    Idempotent: uses ON CONFLICT (user_id, date) DO UPDATE so re-runs
    produce the same result.

    This replaces the old per-user approach in background_tasks.py with a
    batch aggregation that runs in one round-trip to the DB.
    """
    job_name = "nightly_daily_summaries"
    _t0 = time_mod.perf_counter()
    today = target_date or date.today()

    BATCH_JOB_RUNS.inc(job=job_name)

    logger.info("%s: starting for date=%s", job_name, today)

    try:
        # Single batch upsert: aggregate all food logs for the day and upsert
        # into daily_nutrition_summary in one statement.
        await session.execute(
            sa_text("""
                INSERT INTO daily_nutrition_summary
                    (user_id, date, total_calories, total_protein, total_carbs, total_fat)
                SELECT
                    user_id,
                    DATE(logged_at) AS log_date,
                    COALESCE(SUM(calories), 0),
                    COALESCE(SUM(protein_g), 0),
                    COALESCE(SUM(carbs_g), 0),
                    COALESCE(SUM(fats_g), 0)
                FROM ai_food_log
                WHERE DATE(logged_at) = :target_date
                GROUP BY user_id, DATE(logged_at)
                ON CONFLICT (user_id, date) DO UPDATE SET
                    total_calories = EXCLUDED.total_calories,
                    total_protein  = EXCLUDED.total_protein,
                    total_carbs    = EXCLUDED.total_carbs,
                    total_fat      = EXCLUDED.total_fat
            """),
            {"target_date": str(today)},
        )
        await session.commit()

        # Count how many rows were touched
        count_result = await session.execute(
            sa_text("""
                SELECT COUNT(DISTINCT user_id)
                FROM ai_food_log
                WHERE DATE(logged_at) = :target_date
            """),
            {"target_date": str(today)},
        )
        users_count = count_result.scalar() or 0

        duration_s = time_mod.perf_counter() - _t0
        duration_ms = round(duration_s * 1000, 1)
        BATCH_JOB_DURATION.observe(duration_s, job=job_name)
        BATCH_JOB_USERS_PROCESSED.inc(value=users_count, job=job_name)

        logger.info(
            "%s: done -- %d user summaries upserted in %.1fms",
            job_name, users_count, duration_ms,
        )

        return {
            "job": job_name,
            "date": str(today),
            "users_processed": users_count,
            "duration_ms": duration_ms,
            "errors": [],
        }

    except Exception as exc:
        duration_ms = round((time_mod.perf_counter() - _t0) * 1000, 1)
        BATCH_JOB_ERRORS.inc(job=job_name)
        logger.error("%s: failed -- %s", job_name, exc)
        return {
            "job": job_name,
            "date": str(today),
            "users_processed": 0,
            "duration_ms": duration_ms,
            "errors": [{"error": str(exc), "traceback": traceback.format_exc()}],
        }


# ---------------------------------------------------------------------------
# Job 3: Nightly streak evaluation (timezone-aware)
# ---------------------------------------------------------------------------

async def nightly_streak_evaluation(
    session: AsyncSession,
    *,
    target_date: Optional[date] = None,
    timeout_seconds: int = _DEFAULT_TIMEOUT_SECONDS,
) -> dict:
    """Evaluate streaks for all users with an active progress profile.

    Timezone handling: each user's 'today' is resolved from their
    onboarding_profile.timezone field. If not set, UTC is assumed.

    Idempotent: the streak engine checks for existing 'streak_extended'
    events on the same day, so re-running does not double-count.

    Args:
        target_date: override for testing; normally resolved per-user TZ.
        timeout_seconds: wall-clock budget.
    """
    from .streak_engine import update_streak_for_date

    job_name = "nightly_streak_evaluation"
    _t0 = time_mod.perf_counter()

    BATCH_JOB_RUNS.inc(job=job_name)

    # Get all users with a progress profile (they have interacted with gamification)
    result = await session.execute(
        select(UserProgressProfile.user_id)
    )
    user_ids = [row[0] for row in result.all()]

    errors: list[dict] = []
    users_processed = 0
    users_skipped = 0
    streaks_extended = 0
    streaks_frozen = 0
    streaks_lost = 0

    logger.info(
        "%s: starting for %d users (timeout=%ds)",
        job_name, len(user_ids), timeout_seconds,
    )

    for i, uid in enumerate(user_ids):
        elapsed = time_mod.perf_counter() - _t0
        if elapsed > timeout_seconds:
            users_skipped = len(user_ids) - i
            logger.warning(
                "%s: timeout after %.1fs -- %d users skipped",
                job_name, elapsed, users_skipped,
            )
            break

        try:
            # Resolve the user's local 'today'
            if target_date:
                user_today = target_date
            else:
                user_tz = await _get_user_timezone(uid, session)
                user_today = _resolve_user_today(user_tz)

            streak_result = await update_streak_for_date(uid, user_today, session)
            users_processed += 1

            if streak_result.get("extended"):
                streaks_extended += 1
            elif streak_result.get("frozen"):
                streaks_frozen += 1
            elif streak_result.get("lost"):
                streaks_lost += 1

        except Exception as exc:
            logger.error(
                "%s: error for user_id=%d -- %s", job_name, uid, exc,
            )
            errors.append({"user_id": uid, "error": str(exc)})
            await _record_dead_letter(session, job_name, uid, str(exc), target_date or date.today())
            BATCH_JOB_ERRORS.inc(job=job_name)

            if len(errors) >= _MAX_ERRORS_BEFORE_ABORT:
                users_skipped = len(user_ids) - i - 1
                logger.error("%s: aborting -- reached %d errors", job_name, len(errors))
                break

        if (i + 1) % _PROGRESS_LOG_INTERVAL == 0:
            logger.info(
                "%s: progress %d/%d (%.0f%%)",
                job_name, i + 1, len(user_ids),
                (i + 1) / len(user_ids) * 100,
            )

    duration_s = time_mod.perf_counter() - _t0
    duration_ms = round(duration_s * 1000, 1)
    BATCH_JOB_DURATION.observe(duration_s, job=job_name)
    BATCH_JOB_USERS_PROCESSED.inc(value=users_processed, job=job_name)

    logger.info(
        "%s: done -- %d processed, %d skipped, %d errors, "
        "%d extended, %d frozen, %d lost in %.1fms",
        job_name, users_processed, users_skipped, len(errors),
        streaks_extended, streaks_frozen, streaks_lost, duration_ms,
    )

    return {
        "job": job_name,
        "users_processed": users_processed,
        "users_skipped": users_skipped,
        "streaks_extended": streaks_extended,
        "streaks_frozen": streaks_frozen,
        "streaks_lost": streaks_lost,
        "duration_ms": duration_ms,
        "errors": errors,
    }


# ---------------------------------------------------------------------------
# Job 4: Batch notification dispatch
# ---------------------------------------------------------------------------

async def nightly_notification_dispatch(
    session: AsyncSession,
    *,
    now: Optional[datetime] = None,
    timeout_seconds: int = _DEFAULT_TIMEOUT_SECONDS,
) -> dict:
    """Evaluate and dispatch smart notifications for all eligible users.

    Wraps SmartNotificationService.evaluate_and_dispatch_all_users with
    proper timeout, progress logging, dead letter queue, and metrics.
    """
    from ..models.push_token import PushToken
    from .smart_notification_service import SmartNotificationService

    job_name = "nightly_notification_dispatch"
    _t0 = time_mod.perf_counter()
    now = now or datetime.now(timezone.utc)

    BATCH_JOB_RUNS.inc(job=job_name)

    # Get all user IDs with active push tokens
    result = await session.execute(
        select(PushToken.user_id).where(PushToken.is_active == True).distinct()
    )
    user_ids = [row[0] for row in result.all()]

    errors: list[dict] = []
    users_evaluated = 0
    users_skipped = 0
    notifications_sent = 0
    notifications_failed = 0

    svc = SmartNotificationService(session)

    logger.info(
        "%s: starting for %d users at %s (timeout=%ds)",
        job_name, len(user_ids), now.isoformat(), timeout_seconds,
    )

    for i, uid in enumerate(user_ids):
        elapsed = time_mod.perf_counter() - _t0
        if elapsed > timeout_seconds:
            users_skipped = len(user_ids) - i
            logger.warning(
                "%s: timeout after %.1fs -- %d users skipped",
                job_name, elapsed, users_skipped,
            )
            break

        try:
            intents = await svc.evaluate_notifications(uid, now)
            if intents:
                tickets = await svc.dispatch_notifications(uid, intents)
                for ticket in tickets:
                    if isinstance(ticket, dict) and ticket.get("status") == "error":
                        notifications_failed += 1
                    else:
                        notifications_sent += 1
            users_evaluated += 1
        except Exception as exc:
            logger.error(
                "%s: error for user_id=%d -- %s", job_name, uid, exc,
            )
            errors.append({"user_id": uid, "error": str(exc)})
            await _record_dead_letter(
                session, job_name, uid, str(exc),
                now.date(),
            )
            BATCH_JOB_ERRORS.inc(job=job_name)

            if len(errors) >= _MAX_ERRORS_BEFORE_ABORT:
                users_skipped = len(user_ids) - i - 1
                logger.error("%s: aborting -- reached %d errors", job_name, len(errors))
                break

        if (i + 1) % _PROGRESS_LOG_INTERVAL == 0:
            logger.info(
                "%s: progress %d/%d (%.0f%%)",
                job_name, i + 1, len(user_ids),
                (i + 1) / len(user_ids) * 100,
            )

    duration_s = time_mod.perf_counter() - _t0
    duration_ms = round(duration_s * 1000, 1)
    BATCH_JOB_DURATION.observe(duration_s, job=job_name)
    BATCH_JOB_USERS_PROCESSED.inc(value=users_evaluated, job=job_name)

    logger.info(
        "%s: done -- %d evaluated, %d skipped, %d sent, %d failed, %d errors in %.1fms",
        job_name, users_evaluated, users_skipped,
        notifications_sent, notifications_failed, len(errors), duration_ms,
    )

    return {
        "job": job_name,
        "users_evaluated": users_evaluated,
        "users_skipped": users_skipped,
        "notifications_sent": notifications_sent,
        "notifications_failed": notifications_failed,
        "duration_ms": duration_ms,
        "errors": errors,
    }


# ---------------------------------------------------------------------------
# Dead letter queue: retry and query
# ---------------------------------------------------------------------------

async def retry_dead_letters(
    session: AsyncSession,
    job_name: str,
    run_date: Optional[date] = None,
    max_retries: int = 50,
) -> dict:
    """Re-process dead-letter items for a given job and date.

    Looks up progress_event rows with event_type='batch_dead_letter' matching
    the job name and date, then re-runs the appropriate job logic for each
    user_id.

    Returns summary of successes and remaining failures.
    """
    run_date = run_date or date.today()
    _t0 = time_mod.perf_counter()

    # Find dead letters for this job + date
    result = await session.execute(
        select(ProgressEvent).where(
            ProgressEvent.event_type == "batch_dead_letter",
        ).order_by(ProgressEvent.created_at.desc())
    )
    events = result.scalars().all()

    # Filter by job name and date in metadata
    target_events = []
    for evt in events:
        if evt.metadata_json:
            meta = json.loads(evt.metadata_json)
            if meta.get("job") == job_name and meta.get("date") == str(run_date):
                target_events.append(evt)

    if not target_events:
        return {"retried": 0, "succeeded": 0, "still_failed": 0}

    # Deduplicate by user_id (only retry each user once)
    seen_users: set[int] = set()
    unique_events: list[ProgressEvent] = []
    for evt in target_events:
        if evt.user_id not in seen_users and len(unique_events) < max_retries:
            seen_users.add(evt.user_id)
            unique_events.append(evt)

    succeeded = 0
    still_failed = 0

    for evt in unique_events:
        try:
            if job_name == "nightly_risk_recalculation":
                await calculate_daily_adherence(evt.user_id, run_date, session)
            elif job_name == "nightly_streak_evaluation":
                from .streak_engine import update_streak_for_date
                user_tz = await _get_user_timezone(evt.user_id, session)
                user_today = _resolve_user_today(user_tz)
                await update_streak_for_date(evt.user_id, user_today, session)
            else:
                logger.warning("retry_dead_letters: unknown job %s", job_name)
                still_failed += 1
                continue

            # Success -- remove the dead letter
            await session.delete(evt)
            succeeded += 1
        except Exception as exc:
            logger.error(
                "retry_dead_letters: still failing for user_id=%d job=%s -- %s",
                evt.user_id, job_name, exc,
            )
            still_failed += 1

    await session.flush()

    duration_ms = round((time_mod.perf_counter() - _t0) * 1000, 1)
    logger.info(
        "retry_dead_letters: job=%s date=%s -- %d retried, %d succeeded, %d still failed (%.1fms)",
        job_name, run_date, len(unique_events), succeeded, still_failed, duration_ms,
    )

    return {
        "retried": len(unique_events),
        "succeeded": succeeded,
        "still_failed": still_failed,
        "duration_ms": duration_ms,
    }


async def get_dead_letter_summary(session: AsyncSession) -> list[dict]:
    """Return a summary of pending dead-letter items grouped by job and date."""
    result = await session.execute(
        select(ProgressEvent).where(
            ProgressEvent.event_type == "batch_dead_letter",
        ).order_by(ProgressEvent.created_at.desc())
    )
    events = result.scalars().all()

    # Group by (job, date)
    groups: dict[tuple[str, str], int] = {}
    for evt in events:
        if evt.metadata_json:
            meta = json.loads(evt.metadata_json)
            key = (meta.get("job", "unknown"), meta.get("date", "unknown"))
            groups[key] = groups.get(key, 0) + 1

    return [
        {"job": job, "date": dt, "count": count}
        for (job, dt), count in sorted(groups.items())
    ]


# ---------------------------------------------------------------------------
# Orchestrator: run all nightly jobs in sequence
# ---------------------------------------------------------------------------

async def run_all_nightly_jobs(
    session: AsyncSession,
    *,
    target_date: Optional[date] = None,
    timeout_seconds_per_job: int = _DEFAULT_TIMEOUT_SECONDS,
) -> dict:
    """Run all nightly batch jobs in the correct order.

    Order:
    1. Daily summaries (fast, single SQL)
    2. Risk recalculation (depends on summaries)
    3. Streak evaluation (depends on food logs)
    4. Notification dispatch (depends on streaks and summaries)

    Returns a combined report.
    """
    _t0 = time_mod.perf_counter()
    overall_name = "run_all_nightly_jobs"
    BATCH_JOB_RUNS.inc(job=overall_name)

    logger.info("%s: === NIGHTLY BATCH RUN STARTING ===", overall_name)

    results = {}

    # 1. Daily summaries
    try:
        results["daily_summaries"] = await nightly_daily_summaries(
            session, target_date=target_date, timeout_seconds=timeout_seconds_per_job,
        )
    except Exception as exc:
        logger.error("%s: daily_summaries failed -- %s", overall_name, exc)
        results["daily_summaries"] = {"error": str(exc)}

    # 2. Risk recalculation
    try:
        results["risk_recalculation"] = await nightly_risk_recalculation(
            session, target_date=target_date, timeout_seconds=timeout_seconds_per_job,
        )
    except Exception as exc:
        logger.error("%s: risk_recalculation failed -- %s", overall_name, exc)
        results["risk_recalculation"] = {"error": str(exc)}

    # 3. Streak evaluation
    try:
        results["streak_evaluation"] = await nightly_streak_evaluation(
            session, target_date=target_date, timeout_seconds=timeout_seconds_per_job,
        )
    except Exception as exc:
        logger.error("%s: streak_evaluation failed -- %s", overall_name, exc)
        results["streak_evaluation"] = {"error": str(exc)}

    # 4. Notification dispatch
    try:
        results["notification_dispatch"] = await nightly_notification_dispatch(
            session, timeout_seconds=timeout_seconds_per_job,
        )
    except Exception as exc:
        logger.error("%s: notification_dispatch failed -- %s", overall_name, exc)
        results["notification_dispatch"] = {"error": str(exc)}

    total_duration_s = time_mod.perf_counter() - _t0
    total_duration_ms = round(total_duration_s * 1000, 1)
    BATCH_JOB_DURATION.observe(total_duration_s, job=overall_name)

    logger.info(
        "%s: === NIGHTLY BATCH RUN COMPLETE in %.1fms ===",
        overall_name, total_duration_ms,
    )

    return {
        "total_duration_ms": total_duration_ms,
        "jobs": results,
    }
