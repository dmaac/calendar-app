"""
Data Operations Monitor Service
---------------------------------
Monitors critical data operations and alerts on anomalies to prevent
silent data loss. Provides integrity checks, bulk deletion detection,
storage-vs-DB reconciliation, and record count snapshots.

Usage:
    from app.services.data_monitor_service import DataMonitor
    monitor = DataMonitor()
    report = await monitor.check_data_integrity(user_id=42)
"""

import logging
import json
from dataclasses import dataclass, field, asdict
from datetime import datetime, date, timedelta, timezone
from enum import Enum
from typing import List, Optional, Dict, Any

from sqlalchemy import text as sa_text

from app.core.database import AsyncSessionLocal
from app.core.config import settings

logger = logging.getLogger(__name__)

# Dedicated logger for data integrity alerts — always structured JSON
data_alert_logger = logging.getLogger("fitsi.data_integrity")


# ---------------------------------------------------------------------------
# Data classes for structured reporting
# ---------------------------------------------------------------------------

class AlertSeverity(str, Enum):
    INFO = "INFO"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


@dataclass
class Alert:
    severity: AlertSeverity
    message: str
    table: Optional[str] = None
    user_id: Optional[int] = None
    record_count: Optional[int] = None
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    context: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class DataIntegrityReport:
    user_id: int
    checked_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    food_log_gaps: List[str] = field(default_factory=list)
    orphaned_images: List[str] = field(default_factory=list)
    broken_image_refs: List[str] = field(default_factory=list)
    summary_mismatches: List[Dict[str, Any]] = field(default_factory=list)
    orphaned_food_logs: int = 0
    record_count_decreased: bool = False
    alerts: List[Alert] = field(default_factory=list)
    is_healthy: bool = True

    def to_dict(self) -> dict:
        result = asdict(self)
        result["alerts"] = [a.to_dict() if isinstance(a, Alert) else a for a in self.alerts]
        return result


@dataclass
class ReconciliationReport:
    checked_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    total_storage_objects: int = 0
    total_db_references: int = 0
    orphaned_images: List[str] = field(default_factory=list)
    broken_references: List[Dict[str, Any]] = field(default_factory=list)
    unlinked_records: int = 0
    alerts: List[Alert] = field(default_factory=list)

    def to_dict(self) -> dict:
        result = asdict(self)
        result["alerts"] = [a.to_dict() if isinstance(a, Alert) else a for a in self.alerts]
        return result


# ---------------------------------------------------------------------------
# Tables to monitor — each entry is (table_name, user_fk_column)
# ---------------------------------------------------------------------------

MONITORED_TABLES = [
    ("ai_food_log", "user_id"),
    ("daily_nutrition_summary", "user_id"),
    ("meal_log", "user_id"),
    ("userfoodfavorite", "user_id"),
    ("workoutlog", "user_id"),
    ("subscription", "user_id"),
    ("feedback", "user_id"),
    ("onboarding_profile", "user_id"),
]

# Tables where we track global counts (no user filter)
GLOBAL_TABLES = [
    "user",
    "ai_food_log",
    "daily_nutrition_summary",
    "meal_log",
    "food",
    "ai_scan_cache",
    "userfoodfavorite",
    "workoutlog",
    "subscription",
    "feedback",
]


class DataMonitor:
    """Monitors critical data operations and alerts on anomalies."""

    async def check_data_integrity(self, user_id: int) -> DataIntegrityReport:
        """
        For a given user, verify:
        1. Food logs exist for recent days (no gaps)
        2. Storage images have matching food_log records
        3. Daily summaries match actual food log totals
        4. No orphaned records (food_logs without user)
        5. Record counts have not decreased since last check
        """
        report = DataIntegrityReport(user_id=user_id)

        async with AsyncSessionLocal() as session:
            # 1. Check for food log gaps in the last 7 days
            await self._check_food_log_gaps(session, user_id, report)

            # 2. Check image references in food logs
            await self._check_image_references(session, user_id, report)

            # 3. Verify daily summaries match food log totals
            await self._check_summary_accuracy(session, user_id, report)

            # 4. Check for orphaned food logs (user_id not in user table)
            await self._check_orphaned_records(session, user_id, report)

            # 5. Compare current counts with previous snapshot
            await self._check_record_count_trend(session, user_id, report)

        report.is_healthy = len(report.alerts) == 0

        # Log the result
        log_level = logging.CRITICAL if not report.is_healthy else logging.INFO
        data_alert_logger.log(
            log_level,
            json.dumps({
                "event": "data_integrity_check",
                "user_id": user_id,
                "is_healthy": report.is_healthy,
                "alert_count": len(report.alerts),
                "food_log_gaps": len(report.food_log_gaps),
                "orphaned_images": len(report.orphaned_images),
                "broken_refs": len(report.broken_image_refs),
                "summary_mismatches": len(report.summary_mismatches),
            }),
        )

        return report

    async def _check_food_log_gaps(
        self, session, user_id: int, report: DataIntegrityReport
    ) -> None:
        """Detect days with no food logs in the last 7 days where the user was active."""
        try:
            result = await session.execute(
                sa_text("""
                    SELECT DISTINCT DATE(logged_at) AS log_date
                    FROM ai_food_log
                    WHERE user_id = :uid
                      AND logged_at >= :since
                    ORDER BY log_date
                """),
                {"uid": user_id, "since": datetime.utcnow() - timedelta(days=7)},
            )
            logged_dates = {row.log_date for row in result}

            if not logged_dates:
                return  # User has not logged anything in the last 7 days; not necessarily a gap

            # Find the date range of the user's activity window
            min_date = min(logged_dates)
            max_date = max(logged_dates)
            current = min_date
            while current <= max_date:
                if current not in logged_dates:
                    gap_str = str(current)
                    report.food_log_gaps.append(gap_str)
                current += timedelta(days=1)

            if report.food_log_gaps:
                report.alerts.append(Alert(
                    severity=AlertSeverity.WARNING,
                    message=f"Food log gaps detected for user {user_id}: {report.food_log_gaps}",
                    table="ai_food_log",
                    user_id=user_id,
                    context={"gap_dates": report.food_log_gaps},
                ))
        except Exception as exc:
            logger.error("check_food_log_gaps failed for user=%s: %s", user_id, exc)

    async def _check_image_references(
        self, session, user_id: int, report: DataIntegrityReport
    ) -> None:
        """Find food logs with image URLs that may point to missing storage objects."""
        try:
            result = await session.execute(
                sa_text("""
                    SELECT id, image_url, food_name, logged_at
                    FROM ai_food_log
                    WHERE user_id = :uid
                      AND image_url IS NOT NULL
                      AND image_url != ''
                    ORDER BY logged_at DESC
                    LIMIT 500
                """),
                {"uid": user_id},
            )
            rows = result.mappings().all()

            for row in rows:
                url = row["image_url"]
                # Check for obviously broken references
                if url and not url.startswith(("http://", "https://", "file://")):
                    report.broken_image_refs.append(url)
                    report.alerts.append(Alert(
                        severity=AlertSeverity.WARNING,
                        message=f"Broken image reference in food log {row['id']}: {url}",
                        table="ai_food_log",
                        user_id=user_id,
                        context={"food_log_id": row["id"], "image_url": url},
                    ))

        except Exception as exc:
            logger.error("check_image_references failed for user=%s: %s", user_id, exc)

    async def _check_summary_accuracy(
        self, session, user_id: int, report: DataIntegrityReport
    ) -> None:
        """Verify daily summaries match the actual food log aggregations."""
        try:
            # Get summaries for the last 7 days
            result = await session.execute(
                sa_text("""
                    WITH actual AS (
                        SELECT
                            DATE(logged_at) AS log_date,
                            COALESCE(SUM(calories), 0) AS actual_cal,
                            COALESCE(SUM(protein_g), 0) AS actual_pro,
                            COALESCE(SUM(carbs_g), 0) AS actual_carb,
                            COALESCE(SUM(fats_g), 0) AS actual_fat,
                            COUNT(*) AS actual_count
                        FROM ai_food_log
                        WHERE user_id = :uid
                          AND logged_at >= :since
                        GROUP BY DATE(logged_at)
                    ),
                    summary AS (
                        SELECT date, total_calories, total_protein, total_carbs, total_fat
                        FROM daily_nutrition_summary
                        WHERE user_id = :uid
                          AND date >= :since_date
                    )
                    SELECT
                        a.log_date,
                        a.actual_cal,
                        a.actual_pro,
                        a.actual_carb,
                        a.actual_fat,
                        a.actual_count,
                        s.total_calories AS summary_cal,
                        s.total_protein AS summary_pro,
                        s.total_carbs AS summary_carb,
                        s.total_fat AS summary_fat
                    FROM actual a
                    LEFT JOIN summary s ON a.log_date = s.date
                    WHERE s.date IS NULL
                       OR ABS(a.actual_cal - s.total_calories) > 1.0
                       OR ABS(a.actual_pro - s.total_protein) > 0.5
                """),
                {
                    "uid": user_id,
                    "since": datetime.utcnow() - timedelta(days=7),
                    "since_date": (date.today() - timedelta(days=7)).isoformat(),
                },
            )
            mismatches = result.mappings().all()

            for m in mismatches:
                mismatch_info = {
                    "date": str(m["log_date"]),
                    "actual_calories": float(m["actual_cal"]),
                    "summary_calories": float(m["summary_cal"]) if m["summary_cal"] is not None else None,
                    "actual_protein": float(m["actual_pro"]),
                    "summary_protein": float(m["summary_pro"]) if m["summary_pro"] is not None else None,
                    "actual_count": int(m["actual_count"]),
                }
                report.summary_mismatches.append(mismatch_info)

            if report.summary_mismatches:
                report.alerts.append(Alert(
                    severity=AlertSeverity.WARNING,
                    message=f"Daily summary mismatches for user {user_id}: {len(report.summary_mismatches)} days",
                    table="daily_nutrition_summary",
                    user_id=user_id,
                    context={"mismatches": report.summary_mismatches},
                ))

        except Exception as exc:
            # The CTE may fail if daily_nutrition_summary does not exist yet
            logger.warning("check_summary_accuracy skipped for user=%s: %s", user_id, exc)

    async def _check_orphaned_records(
        self, session, user_id: int, report: DataIntegrityReport
    ) -> None:
        """Check for food_log records whose user_id does not exist in the user table."""
        try:
            result = await session.execute(
                sa_text("""
                    SELECT COUNT(*) AS cnt
                    FROM ai_food_log fl
                    LEFT JOIN "user" u ON fl.user_id = u.id
                    WHERE fl.user_id = :uid
                      AND u.id IS NULL
                """),
                {"uid": user_id},
            )
            orphan_count = result.scalar() or 0
            report.orphaned_food_logs = orphan_count

            if orphan_count > 0:
                report.alerts.append(Alert(
                    severity=AlertSeverity.CRITICAL,
                    message=f"Found {orphan_count} orphaned food logs for user_id={user_id} (user does not exist)",
                    table="ai_food_log",
                    user_id=user_id,
                    record_count=orphan_count,
                ))
        except Exception as exc:
            logger.error("check_orphaned_records failed for user=%s: %s", user_id, exc)

    async def _check_record_count_trend(
        self, session, user_id: int, report: DataIntegrityReport
    ) -> None:
        """Compare current record counts with the most recent snapshot."""
        try:
            # Get the previous snapshot for this user
            prev_result = await session.execute(
                sa_text("""
                    SELECT table_name, record_count
                    FROM data_integrity_snapshots
                    WHERE user_id = :uid
                    ORDER BY snapshot_at DESC
                    LIMIT 20
                """),
                {"uid": user_id},
            )
            prev_counts = {row.table_name: row.record_count for row in prev_result}

            if not prev_counts:
                return  # No previous snapshot; nothing to compare

            # Get current counts for the same tables
            for table_name, user_col in MONITORED_TABLES:
                try:
                    curr_result = await session.execute(
                        sa_text(f'SELECT COUNT(*) AS cnt FROM "{table_name}" WHERE {user_col} = :uid'),
                        {"uid": user_id},
                    )
                    current_count = curr_result.scalar() or 0
                    prev_count = prev_counts.get(table_name, 0)

                    if current_count < prev_count:
                        delta = prev_count - current_count
                        severity = AlertSeverity.CRITICAL if delta > 5 else AlertSeverity.WARNING
                        report.record_count_decreased = True
                        report.alerts.append(Alert(
                            severity=severity,
                            message=(
                                f"Record count decreased for {table_name}: "
                                f"{prev_count} -> {current_count} (lost {delta} records)"
                            ),
                            table=table_name,
                            user_id=user_id,
                            record_count=delta,
                            context={
                                "previous_count": prev_count,
                                "current_count": current_count,
                            },
                        ))
                except Exception:
                    # Table may not exist
                    pass

        except Exception as exc:
            # data_integrity_snapshots table may not exist yet
            logger.debug("check_record_count_trend skipped for user=%s: %s", user_id, exc)

    async def detect_bulk_deletion(self, threshold: int = 10) -> List[Alert]:
        """
        Alert if more than `threshold` records were deleted recently.
        Compares the latest two snapshots for each user+table combination.
        """
        alerts: List[Alert] = []

        async with AsyncSessionLocal() as session:
            try:
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
                        ),
                        deltas AS (
                            SELECT
                                curr.user_id,
                                curr.table_name,
                                prev.record_count AS prev_count,
                                curr.record_count AS curr_count,
                                prev.record_count - curr.record_count AS deleted,
                                curr.snapshot_at
                            FROM ranked curr
                            JOIN ranked prev
                                ON curr.user_id = prev.user_id
                               AND curr.table_name = prev.table_name
                               AND curr.rn = 1
                               AND prev.rn = 2
                            WHERE prev.record_count - curr.record_count > :threshold
                        )
                        SELECT * FROM deltas ORDER BY deleted DESC
                    """),
                    {"threshold": threshold},
                )
                rows = result.mappings().all()

                for row in rows:
                    alert = Alert(
                        severity=AlertSeverity.CRITICAL,
                        message=(
                            f"Bulk deletion detected: {row['table_name']} lost {row['deleted']} records "
                            f"for user_id={row['user_id']}"
                        ),
                        table=row["table_name"],
                        user_id=row["user_id"],
                        record_count=int(row["deleted"]),
                        context={
                            "previous_count": int(row["prev_count"]),
                            "current_count": int(row["curr_count"]),
                            "snapshot_at": str(row["snapshot_at"]),
                        },
                    )
                    alerts.append(alert)
                    data_alert_logger.critical(json.dumps({
                        "event": "bulk_deletion_detected",
                        **alert.to_dict(),
                    }))

            except Exception as exc:
                logger.warning("detect_bulk_deletion skipped: %s", exc)

        return alerts

    async def reconcile_storage_vs_db(self) -> ReconciliationReport:
        """
        Compare Supabase storage objects vs ai_food_log.image_url.
        Find: orphaned images (in storage but not in DB) and broken references
        (in DB but not in storage).
        """
        report = ReconciliationReport()

        async with AsyncSessionLocal() as session:
            # Get all image URLs from the database
            try:
                result = await session.execute(
                    sa_text("""
                        SELECT id, user_id, image_url, food_name, logged_at
                        FROM ai_food_log
                        WHERE image_url IS NOT NULL
                          AND image_url != ''
                    """)
                )
                db_rows = result.mappings().all()
                report.total_db_references = len(db_rows)
            except Exception as exc:
                logger.error("reconcile_storage_vs_db: failed to query DB: %s", exc)
                return report

        # Extract filenames from URLs for comparison
        db_filenames: Dict[str, Dict[str, Any]] = {}
        for row in db_rows:
            url = row["image_url"]
            if url:
                # Extract filename from URL path
                filename = url.rstrip("/").rsplit("/", 1)[-1] if "/" in url else url
                db_filenames[filename] = {
                    "food_log_id": row["id"],
                    "user_id": row["user_id"],
                    "image_url": url,
                    "food_name": row["food_name"],
                    "logged_at": str(row["logged_at"]),
                }

        # List storage objects from Supabase
        storage_filenames = await self._list_storage_objects("food-scans")
        report.total_storage_objects = len(storage_filenames)

        # Orphaned images: in storage but not referenced in DB
        for filename in storage_filenames:
            if filename not in db_filenames:
                report.orphaned_images.append(filename)

        # Broken references: in DB but not in storage
        for filename, meta in db_filenames.items():
            if filename not in storage_filenames and meta["image_url"].startswith("http"):
                report.broken_references.append({
                    "filename": filename,
                    "food_log_id": meta["food_log_id"],
                    "user_id": meta["user_id"],
                    "food_name": meta["food_name"],
                    "logged_at": meta["logged_at"],
                })

        # Records without any image at all
        async with AsyncSessionLocal() as session:
            try:
                result = await session.execute(
                    sa_text("""
                        SELECT COUNT(*) AS cnt
                        FROM ai_food_log
                        WHERE image_url IS NULL OR image_url = ''
                    """)
                )
                report.unlinked_records = result.scalar() or 0
            except Exception as exc:
                logger.error("reconcile_storage_vs_db: failed to count unlinked: %s", exc)

        # Generate alerts
        if report.orphaned_images:
            report.alerts.append(Alert(
                severity=AlertSeverity.WARNING,
                message=f"{len(report.orphaned_images)} orphaned images in storage (no matching DB record)",
                table="supabase_storage/food-scans",
                record_count=len(report.orphaned_images),
                context={"filenames": report.orphaned_images[:50]},  # Cap to avoid huge payloads
            ))

        if report.broken_references:
            report.alerts.append(Alert(
                severity=AlertSeverity.CRITICAL,
                message=f"{len(report.broken_references)} broken image references in DB (file missing from storage)",
                table="ai_food_log",
                record_count=len(report.broken_references),
                context={"references": report.broken_references[:50]},
            ))

        data_alert_logger.info(json.dumps({
            "event": "storage_reconciliation",
            "total_storage": report.total_storage_objects,
            "total_db_refs": report.total_db_references,
            "orphaned": len(report.orphaned_images),
            "broken": len(report.broken_references),
            "unlinked": report.unlinked_records,
        }))

        return report

    async def _list_storage_objects(self, bucket: str) -> set:
        """
        List all object filenames in a Supabase storage bucket.
        Returns a set of filenames (not full paths).
        """
        from app.core.supabase_config import is_supabase_configured, get_supabase_headers

        if not is_supabase_configured():
            # Dev mode: list local files
            import os
            local_dir = f"/tmp/fitsi-storage/{bucket}"
            if os.path.isdir(local_dir):
                return set(os.listdir(local_dir))
            return set()

        filenames = set()
        base = settings.supabase_url.rstrip("/")
        url = f"{base}/storage/v1/object/list/{bucket}"
        headers = get_supabase_headers(use_service_key=True)
        headers["Content-Type"] = "application/json"

        import httpx

        offset = 0
        limit = 1000

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                while True:
                    payload = {
                        "prefix": "",
                        "limit": limit,
                        "offset": offset,
                        "sortBy": {"column": "name", "order": "asc"},
                    }
                    response = await client.post(url, headers=headers, json=payload)
                    if response.status_code != 200:
                        logger.error(
                            "Supabase storage list failed: status=%d body=%.200s",
                            response.status_code, response.text,
                        )
                        break

                    objects = response.json()
                    if not objects:
                        break

                    for obj in objects:
                        name = obj.get("name", "")
                        if name and not name.endswith("/"):
                            filenames.add(name)

                    if len(objects) < limit:
                        break
                    offset += limit

        except Exception as exc:
            logger.error("_list_storage_objects failed for bucket=%s: %s", bucket, exc)

        return filenames

    async def snapshot_record_counts(self) -> dict:
        """
        Take a snapshot of record counts per table per user for trend monitoring.
        Stores results in the data_integrity_snapshots table.
        Returns a summary dict of the snapshot.
        """
        snapshot_time = datetime.utcnow()
        summary: Dict[str, Any] = {
            "snapshot_at": snapshot_time.isoformat(),
            "tables": {},
            "per_user_tables": 0,
            "errors": [],
        }

        async with AsyncSessionLocal() as session:
            # Global table counts
            for table_name in GLOBAL_TABLES:
                try:
                    result = await session.execute(
                        sa_text(f'SELECT COUNT(*) AS cnt FROM "{table_name}"')
                    )
                    count = result.scalar() or 0
                    summary["tables"][table_name] = count
                except Exception:
                    summary["tables"][table_name] = -1  # Table may not exist

            # Per-user counts for monitored tables
            inserted = 0
            for table_name, user_col in MONITORED_TABLES:
                try:
                    result = await session.execute(
                        sa_text(f"""
                            SELECT {user_col} AS uid, COUNT(*) AS cnt
                            FROM "{table_name}"
                            GROUP BY {user_col}
                        """)
                    )
                    rows = result.mappings().all()

                    for row in rows:
                        try:
                            await session.execute(
                                sa_text("""
                                    INSERT INTO data_integrity_snapshots
                                        (user_id, table_name, record_count, snapshot_at)
                                    VALUES (:uid, :tbl, :cnt, :ts)
                                """),
                                {
                                    "uid": row["uid"],
                                    "tbl": table_name,
                                    "cnt": row["cnt"],
                                    "ts": snapshot_time,
                                },
                            )
                            inserted += 1
                        except Exception as exc:
                            summary["errors"].append(
                                f"Insert failed for {table_name}/user={row['uid']}: {exc}"
                            )
                except Exception as exc:
                    summary["errors"].append(f"Query failed for {table_name}: {exc}")

            try:
                await session.commit()
            except Exception as exc:
                summary["errors"].append(f"Commit failed: {exc}")

            summary["per_user_tables"] = inserted

            # Prune old snapshots (keep last 7 days)
            try:
                await session.execute(
                    sa_text("""
                        DELETE FROM data_integrity_snapshots
                        WHERE snapshot_at < :cutoff
                    """),
                    {"cutoff": snapshot_time - timedelta(days=7)},
                )
                await session.commit()
            except Exception:
                pass

        data_alert_logger.info(json.dumps({
            "event": "snapshot_recorded",
            "snapshot_at": summary["snapshot_at"],
            "global_tables": summary["tables"],
            "per_user_rows": summary["per_user_tables"],
        }))

        return summary


# Module-level singleton
data_monitor = DataMonitor()
