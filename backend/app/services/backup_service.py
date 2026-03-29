"""
User Data Backup & Point-in-Time Recovery Service
---------------------------------------------------
Creates full JSON snapshots of all user data and stores them in Supabase
Storage (bucket: user-backups). Supports selective table restore, automatic
pre-destructive-operation backups, and backup listing.

Backed tables:
  user, onboarding_profile, ai_food_log, dailynutritionsummary,
  userfoodfavorite, weight_log, subscription, user_progress_profile

Storage layout:
  user-backups/user_{id}/user_{id}_YYYYMMDD_HHMMSS.json.gz

Design decisions:
  - Snapshots are gzipped JSON to minimize storage costs.
  - Each backup is registered in the backup_registry table for discoverability.
  - Restore is transactional: if any table fails, the entire operation rolls back.
  - The service never deletes the backup file from storage on failure --
    orphaned files are cheaper than lost data.
"""

from __future__ import annotations

import gzip
import json
import logging
import os
import re
from datetime import datetime, date, timezone
from typing import Any, Dict, List, Optional

import httpx
from sqlalchemy import text as sa_text
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..core.config import settings
from ..core.database import AsyncSessionLocal
from ..core.supabase_config import (
    get_supabase_headers,
    is_supabase_configured,
)
from ..models.backup_registry import BackupRegistry, BackupRegistryRead

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# SQL identifier validation (defence against injection via tampered backups)
# ---------------------------------------------------------------------------
# Only allow identifiers that start with a letter or underscore, followed by
# alphanumeric characters or underscores, and are at most 63 characters long
# (PostgreSQL identifier length limit).
_SAFE_IDENTIFIER = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]{0,62}$")


def _validate_identifier(name: str) -> str:
    """Validate that a string is a safe SQL identifier.

    Raises ValueError if the name contains characters that could allow SQL
    injection when interpolated into a query.  This is the primary defence
    against tampered backup files that supply malicious column or table names.
    """
    if not isinstance(name, str) or not _SAFE_IDENTIFIER.match(name):
        raise ValueError(
            f"Invalid SQL identifier rejected (possible injection attempt): {name!r}"
        )
    return name

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

BACKUP_BUCKET = "user-backups"

# All tables that contain user-owned data eligible for backup.
# Order matters: restore must respect foreign key dependencies (user first).
BACKABLE_TABLES = [
    "user",
    "onboarding_profile",
    "ai_food_log",
    "dailynutritionsummary",
    "userfoodfavorite",
    "weight_log",
    "subscription",
    "user_progress_profile",
]

_LOCAL_BACKUP_DIR = "/tmp/fitsi-backups"


# ---------------------------------------------------------------------------
# JSON serialisation helpers
# ---------------------------------------------------------------------------

class _BackupEncoder(json.JSONEncoder):
    """Handle datetime, date, bytes, and other non-serialisable types."""

    def default(self, obj: Any) -> Any:
        if isinstance(obj, datetime):
            return obj.isoformat()
        if isinstance(obj, date):
            return obj.isoformat()
        if isinstance(obj, bytes):
            return obj.decode("utf-8", errors="replace")
        return super().default(obj)


def _row_to_dict(row: Any) -> dict:
    """Convert a SQLAlchemy Row/RowMapping to a plain dict."""
    if hasattr(row, "_mapping"):
        return dict(row._mapping)
    if hasattr(row, "_asdict"):
        return row._asdict()
    return dict(row)


# ---------------------------------------------------------------------------
# Storage helpers
# ---------------------------------------------------------------------------

def _generate_backup_path(user_id: int) -> str:
    """Generate a deterministic path: user_{id}/user_{id}_YYYYMMDD_HHMMSS.json.gz"""
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"user_{user_id}_{ts}.json.gz"
    return f"user_{user_id}/{filename}"


async def _upload_backup(path: str, data: bytes) -> str:
    """Upload gzipped backup to Supabase Storage. Returns the storage path."""
    if not is_supabase_configured():
        logger.warning("Supabase not configured -- saving backup locally (dev mode)")
        local_dir = os.path.join(_LOCAL_BACKUP_DIR, os.path.dirname(path))
        os.makedirs(local_dir, exist_ok=True)
        local_path = os.path.join(_LOCAL_BACKUP_DIR, path)
        with open(local_path, "wb") as f:
            f.write(data)
        return path

    base = settings.supabase_url.rstrip("/")
    url = f"{base}/storage/v1/object/{BACKUP_BUCKET}/{path}"
    headers = get_supabase_headers(use_service_key=True)
    headers["Content-Type"] = "application/gzip"

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(url, headers=headers, content=data)
        if resp.status_code not in (200, 201):
            logger.error(
                "Backup upload failed: status=%d body=%.300s",
                resp.status_code,
                resp.text,
            )
            raise RuntimeError(
                f"Failed to upload backup to Supabase Storage (HTTP {resp.status_code})"
            )

    logger.info("Backup uploaded: %s (%d bytes)", path, len(data))
    return path


async def _download_backup(path: str) -> bytes:
    """Download a gzipped backup from Supabase Storage."""
    if not is_supabase_configured():
        local_path = os.path.join(_LOCAL_BACKUP_DIR, path)
        if not os.path.exists(local_path):
            raise FileNotFoundError(f"Local backup not found: {local_path}")
        with open(local_path, "rb") as f:
            return f.read()

    base = settings.supabase_url.rstrip("/")
    url = f"{base}/storage/v1/object/{BACKUP_BUCKET}/{path}"
    headers = get_supabase_headers(use_service_key=True)

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.get(url, headers=headers)
        if resp.status_code != 200:
            raise FileNotFoundError(
                f"Backup not found in storage: {path} (HTTP {resp.status_code})"
            )
        return resp.content


# ---------------------------------------------------------------------------
# Core service
# ---------------------------------------------------------------------------

class UserDataBackupService:
    """
    Create, list, and restore user data backups.

    Usage:
        svc = UserDataBackupService()
        record = await svc.create_backup(user_id=1)
        await svc.restore_from_backup(backup_id=record.id)
    """

    # ── Snapshot extraction ────────────────────────────────────────────────

    async def _extract_table(
        self,
        session: AsyncSession,
        table_name: str,
        user_id: int,
    ) -> List[dict]:
        """Fetch all rows for a user from a single table."""
        _validate_identifier(table_name)

        # user table is queried by id, all others by user_id
        if table_name == "user":
            query = sa_text(f'SELECT * FROM "user" WHERE id = :uid')
        else:
            query = sa_text(f"SELECT * FROM {table_name} WHERE user_id = :uid")

        result = await session.execute(query, {"uid": user_id})
        rows = result.fetchall()
        return [_row_to_dict(r) for r in rows]

    # ── Create backup ─────────────────────────────────────────────────────

    async def create_backup(
        self,
        user_id: int,
        backup_type: str = "manual",
        trigger_reason: Optional[str] = None,
        expires_at: Optional[datetime] = None,
    ) -> BackupRegistryRead:
        """
        Create a full JSON snapshot of all user data.

        Extracts data from every table in BACKABLE_TABLES, compresses it as
        gzipped JSON, uploads to Supabase Storage, and registers the backup
        in the backup_registry table.

        Returns a BackupRegistryRead with the backup metadata.
        """
        snapshot: Dict[str, Any] = {
            "version": "1.0",
            "user_id": user_id,
            "created_at": datetime.utcnow().isoformat(),
            "backup_type": backup_type,
            "tables": {},
        }
        record_counts: Dict[str, int] = {}
        tables_included: List[str] = []

        async with AsyncSessionLocal() as session:
            # Verify user exists
            user_check = await session.execute(
                sa_text('SELECT id FROM "user" WHERE id = :uid'),
                {"uid": user_id},
            )
            if not user_check.fetchone():
                raise ValueError(f"User {user_id} does not exist")

            for table_name in BACKABLE_TABLES:
                try:
                    rows = await self._extract_table(session, table_name, user_id)
                    snapshot["tables"][table_name] = rows
                    record_counts[table_name] = len(rows)
                    tables_included.append(table_name)
                except Exception as exc:
                    # Table might not exist yet (e.g., migration not applied).
                    # Log and continue -- partial backups are better than no backup.
                    logger.warning(
                        "Skipping table %s for user %d backup: %s",
                        table_name, user_id, exc,
                    )

        # Compress
        json_bytes = json.dumps(snapshot, cls=_BackupEncoder).encode("utf-8")
        compressed = gzip.compress(json_bytes, compresslevel=6)
        size_bytes = len(compressed)

        # Upload
        storage_path = _generate_backup_path(user_id)
        await _upload_backup(storage_path, compressed)

        # Register in DB
        registry_entry = BackupRegistry(
            user_id=user_id,
            backup_type=backup_type,
            storage_path=storage_path,
            tables_included=json.dumps(tables_included),
            record_counts=json.dumps(record_counts),
            size_bytes=size_bytes,
            trigger_reason=trigger_reason,
            expires_at=expires_at,
        )

        async with AsyncSessionLocal() as session:
            session.add(registry_entry)
            await session.commit()
            await session.refresh(registry_entry)

        logger.info(
            "Backup created: id=%d user=%d type=%s tables=%s size=%d bytes",
            registry_entry.id, user_id, backup_type,
            tables_included, size_bytes,
        )

        return BackupRegistryRead(
            id=registry_entry.id,
            user_id=registry_entry.user_id,
            backup_type=registry_entry.backup_type,
            storage_path=registry_entry.storage_path,
            tables_included=tables_included,
            record_counts=record_counts,
            size_bytes=registry_entry.size_bytes,
            trigger_reason=registry_entry.trigger_reason,
            created_at=registry_entry.created_at,
            expires_at=registry_entry.expires_at,
        )

    # ── Restore from backup ───────────────────────────────────────────────

    async def restore_from_backup(
        self,
        backup_id: int,
        tables: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Restore user data from a backup snapshot.

        If `tables` is provided, only those tables are restored. Otherwise,
        all tables in the backup are restored.

        The restore is transactional: if any table fails, the entire operation
        rolls back and no data is modified.

        Returns a summary dict with counts of restored records per table.
        """
        # Load registry entry
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(BackupRegistry).where(BackupRegistry.id == backup_id)
            )
            entry = result.scalars().first()
            if not entry:
                raise ValueError(f"Backup {backup_id} not found")

        user_id = entry.user_id
        storage_path = entry.storage_path
        available_tables = json.loads(entry.tables_included)

        # Download and decompress
        compressed = await _download_backup(storage_path)
        json_bytes = gzip.decompress(compressed)
        snapshot = json.loads(json_bytes)

        # Determine which tables to restore
        target_tables = tables if tables else available_tables
        invalid_tables = set(target_tables) - set(available_tables)
        if invalid_tables:
            raise ValueError(
                f"Tables not in backup: {invalid_tables}. "
                f"Available: {available_tables}"
            )

        # SECURITY: Validate all table names against the hardcoded whitelist.
        # The backup file or registry could have been tampered with, so we must
        # never trust table names from deserialized data without checking them.
        disallowed_tables = set(target_tables) - set(BACKABLE_TABLES)
        if disallowed_tables:
            raise ValueError(
                f"Restore blocked: tables {disallowed_tables} are not in the "
                f"allowed backup tables list"
            )

        # Restore in a single transaction
        restore_counts: Dict[str, int] = {}

        async with AsyncSessionLocal() as session:
            async with session.begin():
                for table_name in target_tables:
                    rows = snapshot.get("tables", {}).get(table_name, [])
                    if not rows:
                        restore_counts[table_name] = 0
                        continue

                    # Delete existing records for this user in this table
                    if table_name == "user":
                        # For user table, update in-place rather than delete+insert
                        # to preserve foreign key references
                        row = rows[0]
                        # Remove id and keep only updatable columns
                        update_cols = {
                            _validate_identifier(k): v
                            for k, v in row.items()
                            if k not in ("id", "created_at")
                        }
                        if update_cols:
                            set_clause = ", ".join(
                                f"{k} = :{k}" for k in update_cols
                            )
                            await session.execute(
                                sa_text(
                                    f'UPDATE "user" SET {set_clause} WHERE id = :uid'
                                ),
                                {**update_cols, "uid": user_id},
                            )
                        restore_counts[table_name] = 1
                    else:
                        # Validate table name (defence-in-depth; whitelist
                        # check above already covers this but belt-and-
                        # suspenders is appropriate for SQL construction).
                        _validate_identifier(table_name)

                        # Delete existing records
                        await session.execute(
                            sa_text(
                                f"DELETE FROM {table_name} WHERE user_id = :uid"
                            ),
                            {"uid": user_id},
                        )

                        # Insert backed-up records
                        for row in rows:
                            # Remove auto-generated id to let DB assign new ones
                            # and validate every column name from the backup JSON
                            row_data = {
                                _validate_identifier(k): v
                                for k, v in row.items()
                                if k != "id"
                            }
                            if not row_data:
                                continue
                            cols = ", ".join(row_data.keys())
                            placeholders = ", ".join(
                                f":{k}" for k in row_data.keys()
                            )
                            await session.execute(
                                sa_text(
                                    f"INSERT INTO {table_name} ({cols}) VALUES ({placeholders})"
                                ),
                                row_data,
                            )

                        restore_counts[table_name] = len(rows)

        logger.info(
            "Restore completed: backup_id=%d user=%d tables=%s counts=%s",
            backup_id, user_id, target_tables, restore_counts,
        )

        return {
            "backup_id": backup_id,
            "user_id": user_id,
            "restored_tables": target_tables,
            "record_counts": restore_counts,
            "status": "success",
        }

    # ── List backups ──────────────────────────────────────────────────────

    async def list_backups(self, user_id: int) -> List[BackupRegistryRead]:
        """
        List all available backups for a user, newest first.
        """
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(BackupRegistry)
                .where(BackupRegistry.user_id == user_id)
                .order_by(BackupRegistry.created_at.desc())
            )
            entries = result.scalars().all()

        return [
            BackupRegistryRead(
                id=e.id,
                user_id=e.user_id,
                backup_type=e.backup_type,
                storage_path=e.storage_path,
                tables_included=json.loads(e.tables_included),
                record_counts=json.loads(e.record_counts),
                size_bytes=e.size_bytes,
                trigger_reason=e.trigger_reason,
                created_at=e.created_at,
                expires_at=e.expires_at,
            )
            for e in entries
        ]

    # ── Preview restore ───────────────────────────────────────────────────

    async def preview_restore(self, backup_id: int) -> Dict[str, Any]:
        """
        Preview what a restore operation would do without modifying data.

        Returns backup metadata including available tables and record counts.
        """
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(BackupRegistry).where(BackupRegistry.id == backup_id)
            )
            entry = result.scalars().first()
            if not entry:
                raise ValueError(f"Backup {backup_id} not found")

        tables_included = json.loads(entry.tables_included)
        record_counts = json.loads(entry.record_counts)

        return {
            "backup_id": entry.id,
            "user_id": entry.user_id,
            "backup_type": entry.backup_type,
            "created_at": entry.created_at.isoformat() if entry.created_at else None,
            "tables_available": tables_included,
            "record_counts": record_counts,
            "size_bytes": entry.size_bytes,
            "warning": "Restoring will overwrite current data for the selected tables.",
        }

    # ── Auto backup before destructive operations ─────────────────────────

    async def auto_backup_before_destructive(
        self,
        user_id: int,
        operation: str,
    ) -> BackupRegistryRead:
        """
        Automatically create a backup before any destructive operation.

        Should be called before:
          - Bulk deleting food logs
          - Account deletion (GDPR Article 17)
          - Data migration scripts
          - Manual admin data corrections

        The backup_type is set to 'pre_delete' and the trigger_reason records
        which operation triggered the backup.
        """
        logger.info(
            "Auto-backup triggered for user %d before operation: %s",
            user_id, operation,
        )
        return await self.create_backup(
            user_id=user_id,
            backup_type="pre_delete",
            trigger_reason=f"Auto-backup before: {operation}",
        )

    # ── Cleanup expired backups ───────────────────────────────────────────

    async def cleanup_expired_backups(self) -> int:
        """
        Delete backup registry entries and storage files that have passed
        their expires_at timestamp.

        Returns the number of backups cleaned up.
        """
        now = datetime.utcnow()
        cleaned = 0

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(BackupRegistry).where(
                    BackupRegistry.expires_at.isnot(None),
                    BackupRegistry.expires_at < now,
                )
            )
            expired_entries = result.scalars().all()

            for entry in expired_entries:
                # Attempt to delete from storage (best-effort)
                try:
                    await _delete_backup_file(entry.storage_path)
                except Exception as exc:
                    logger.warning(
                        "Failed to delete expired backup file %s: %s",
                        entry.storage_path, exc,
                    )

                await session.delete(entry)
                cleaned += 1

            await session.commit()

        if cleaned:
            logger.info("Cleaned up %d expired backups", cleaned)
        return cleaned


async def _delete_backup_file(path: str) -> None:
    """Delete a backup file from Supabase Storage."""
    if not is_supabase_configured():
        local_path = os.path.join(_LOCAL_BACKUP_DIR, path)
        if os.path.exists(local_path):
            os.remove(local_path)
        return

    base = settings.supabase_url.rstrip("/")
    url = f"{base}/storage/v1/object/{BACKUP_BUCKET}/{path}"
    headers = get_supabase_headers(use_service_key=True)

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.delete(url, headers=headers)
        if resp.status_code not in (200, 204):
            logger.warning(
                "Failed to delete backup file %s: HTTP %d",
                path, resp.status_code,
            )
