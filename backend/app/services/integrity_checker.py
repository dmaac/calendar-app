"""
Background Integrity Checker
------------------------------
Runs on a periodic schedule (default: every hour) via the existing background
task system. Compares current record counts with the previous snapshot and
raises CRITICAL alerts when data loss is detected.

Lifecycle:
    1. Take a fresh snapshot of all monitored table counts per user.
    2. Compare with the previous snapshot.
    3. If any user lost >5 records in an hour, log a CRITICAL alert.
    4. Run bulk deletion detection.
    5. Prune old snapshots to keep storage bounded.

Integration:
    Called from app lifespan via start_integrity_checker().

Storage:
    Uses the `data_integrity_snapshots` table (created by migration 013).
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import text as sa_text

from app.core.database import AsyncSessionLocal
from app.services.data_monitor_service import (
    DataMonitor,
    AlertSeverity,
    MONITORED_TABLES,
    data_alert_logger,
)

logger = logging.getLogger(__name__)

# Threshold: if a user loses more than this many records in a single
# check interval, emit a CRITICAL alert.
RECORD_LOSS_THRESHOLD = 5


async def run_integrity_check() -> dict:
    """
    Execute a single integrity check cycle.

    Returns a summary dict with the check results.
    """
    check_start = datetime.utcnow()
    monitor = DataMonitor()
    summary = {
        "started_at": check_start.isoformat(),
        "snapshot_result": None,
        "users_checked": 0,
        "critical_alerts": 0,
        "warning_alerts": 0,
        "bulk_deletions": 0,
        "errors": [],
    }

    # Step 1: Compare with previous snapshot before taking a new one
    try:
        await _compare_with_previous_snapshot(summary)
    except Exception as exc:
        summary["errors"].append(f"Comparison failed: {exc}")
        logger.error("Integrity check comparison failed: %s", exc)

    # Step 2: Take a fresh snapshot
    try:
        snapshot_result = await monitor.snapshot_record_counts()
        summary["snapshot_result"] = snapshot_result
    except Exception as exc:
        summary["errors"].append(f"Snapshot failed: {exc}")
        logger.error("Integrity check snapshot failed: %s", exc)

    # Step 3: Detect bulk deletions
    try:
        bulk_alerts = await monitor.detect_bulk_deletion(threshold=RECORD_LOSS_THRESHOLD)
        summary["bulk_deletions"] = len(bulk_alerts)
        summary["critical_alerts"] += sum(
            1 for a in bulk_alerts if a.severity == AlertSeverity.CRITICAL
        )
    except Exception as exc:
        summary["errors"].append(f"Bulk deletion check failed: {exc}")
        logger.error("Integrity check bulk deletion detection failed: %s", exc)

    check_duration = (datetime.utcnow() - check_start).total_seconds()
    summary["duration_seconds"] = round(check_duration, 2)

    # Update Prometheus metrics
    try:
        from app.core.metrics import INTEGRITY_CHECK_COUNT, INTEGRITY_ALERTS
        result_label = "critical" if summary["critical_alerts"] > 0 else "healthy"
        INTEGRITY_CHECK_COUNT.inc(result=result_label)
        for _ in range(summary["critical_alerts"]):
            INTEGRITY_ALERTS.inc(severity="CRITICAL")
        for _ in range(summary["warning_alerts"]):
            INTEGRITY_ALERTS.inc(severity="WARNING")
    except Exception:
        pass

    # Log the overall result
    log_level = logging.CRITICAL if summary["critical_alerts"] > 0 else logging.INFO
    data_alert_logger.log(log_level, json.dumps({
        "event": "integrity_check_complete",
        "started_at": summary["started_at"],
        "duration_seconds": summary["duration_seconds"],
        "users_checked": summary["users_checked"],
        "critical_alerts": summary["critical_alerts"],
        "warning_alerts": summary["warning_alerts"],
        "bulk_deletions": summary["bulk_deletions"],
        "errors": summary["errors"][:10],  # Cap error list
    }))

    return summary


async def _compare_with_previous_snapshot(summary: dict) -> None:
    """
    Compare the most recent two snapshots for each user+table combination.
    Flag any user who lost more than RECORD_LOSS_THRESHOLD records.
    """
    async with AsyncSessionLocal() as session:
        try:
            # Find users+tables where record count dropped by more than the threshold
            result = await session.execute(
                sa_text("""
                    WITH ranked AS (
                        SELECT
                            user_id,
                            table_name,
                            record_count,
                            snapshot_at,
                            ROW_NUMBER() OVER (
                                PARTITION BY user_id, table_name
                                ORDER BY snapshot_at DESC
                            ) AS rn
                        FROM data_integrity_snapshots
                    )
                    SELECT
                        curr.user_id,
                        curr.table_name,
                        prev.record_count AS prev_count,
                        curr.record_count AS curr_count,
                        prev.record_count - curr.record_count AS lost,
                        curr.snapshot_at AS current_snapshot,
                        prev.snapshot_at AS previous_snapshot
                    FROM ranked curr
                    JOIN ranked prev
                        ON curr.user_id = prev.user_id
                       AND curr.table_name = prev.table_name
                       AND curr.rn = 1
                       AND prev.rn = 2
                    WHERE prev.record_count - curr.record_count > :threshold
                    ORDER BY lost DESC
                """),
                {"threshold": RECORD_LOSS_THRESHOLD},
            )
            rows = result.mappings().all()

            users_affected = set()
            for row in rows:
                users_affected.add(row["user_id"])

                alert_data = {
                    "event": "record_loss_detected",
                    "severity": "CRITICAL",
                    "user_id": row["user_id"],
                    "table": row["table_name"],
                    "previous_count": int(row["prev_count"]),
                    "current_count": int(row["curr_count"]),
                    "records_lost": int(row["lost"]),
                    "current_snapshot": str(row["current_snapshot"]),
                    "previous_snapshot": str(row["previous_snapshot"]),
                }

                data_alert_logger.critical(json.dumps(alert_data))
                summary["critical_alerts"] += 1

            summary["users_checked"] = len(users_affected)

        except Exception as exc:
            # data_integrity_snapshots table may not exist yet
            logger.debug("_compare_with_previous_snapshot skipped: %s", exc)


async def run_full_user_integrity_check(user_ids: Optional[list] = None) -> dict:
    """
    Run a deep integrity check for specific users (or all active users).

    This is more thorough than the periodic snapshot comparison: it checks
    food log gaps, image references, and summary accuracy for each user.

    Intended for manual/on-demand use (e.g., after an incident).
    """
    monitor = DataMonitor()
    results = {
        "users_checked": 0,
        "healthy": 0,
        "unhealthy": 0,
        "alerts": [],
    }

    async with AsyncSessionLocal() as session:
        if user_ids is None:
            # Get all active users
            try:
                result = await session.execute(
                    sa_text('SELECT id FROM "user" WHERE is_active = true ORDER BY id')
                )
                user_ids = [row.id for row in result]
            except Exception as exc:
                logger.error("Failed to fetch user list: %s", exc)
                return results

    for uid in user_ids:
        try:
            report = await monitor.check_data_integrity(uid)
            results["users_checked"] += 1
            if report.is_healthy:
                results["healthy"] += 1
            else:
                results["unhealthy"] += 1
                results["alerts"].extend([a.to_dict() for a in report.alerts])
        except Exception as exc:
            logger.error("Integrity check failed for user=%s: %s", uid, exc)

    return results


async def start_integrity_checker(interval_hours: float = 1.0) -> None:
    """
    Periodic integrity checker loop.
    Runs every `interval_hours` (default: 1 hour).

    Usage in lifespan:
        import asyncio
        integrity_task = asyncio.create_task(start_integrity_checker(interval_hours=1.0))
    """
    logger.info(
        "Data integrity checker started (interval=%.1f hours)", interval_hours
    )

    # Wait a short period on first start to let the app fully initialize
    await asyncio.sleep(30)

    while True:
        try:
            result = await run_integrity_check()
            critical = result.get("critical_alerts", 0)
            if critical > 0:
                logger.critical(
                    "INTEGRITY CHECK: %d CRITICAL alerts detected", critical
                )
            else:
                logger.info(
                    "Integrity check completed: %d users checked, no critical issues",
                    result.get("users_checked", 0),
                )
        except Exception as exc:
            logger.error("Integrity checker cycle failed: %s", exc)

        await asyncio.sleep(interval_hours * 3600)
