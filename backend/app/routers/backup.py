"""
Backup Admin Endpoints
-----------------------
CRUD for user data backups. All endpoints require admin authentication.

Endpoints:
  POST /api/admin/backup/{user_id}             -- create manual backup
  GET  /api/admin/backup/{user_id}             -- list backups for a user
  POST /api/admin/backup/restore/{backup_id}   -- restore from backup
  POST /api/admin/backup/restore/{backup_id}/preview -- preview restore
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from ..models.user import User
from ..models.backup_registry import (
    BackupCreateRequest,
    BackupRegistryRead,
    RestoreRequest,
    RestorePreviewResponse,
)
from ..routers.auth import get_current_user
from ..routers.admin import require_admin
from ..services.backup_service import UserDataBackupService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/backup", tags=["backup"])

# Singleton service instance
_backup_service = UserDataBackupService()


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------

class RestoreResponse(BaseModel):
    backup_id: int
    user_id: int
    restored_tables: List[str]
    record_counts: dict
    status: str


class CleanupResponse(BaseModel):
    cleaned_count: int
    message: str


# ---------------------------------------------------------------------------
# POST /api/admin/backup/{user_id} -- Create manual backup
# ---------------------------------------------------------------------------

@router.post(
    "/{user_id}",
    response_model=BackupRegistryRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a user data backup",
    description=(
        "Creates a full JSON snapshot of all user data (food logs, profile, "
        "subscriptions, etc.) and stores it in Supabase Storage. "
        "The backup is registered in the backup_registry table for future retrieval."
    ),
)
async def create_backup(
    user_id: int,
    body: Optional[BackupCreateRequest] = None,
    current_user: User = Depends(require_admin),
):
    if body is None:
        body = BackupCreateRequest()

    try:
        record = await _backup_service.create_backup(
            user_id=user_id,
            backup_type=body.backup_type,
            trigger_reason=body.trigger_reason or f"Manual backup by admin {current_user.id}",
            expires_at=body.expires_at,
        )
        return record
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        )
    except RuntimeError as exc:
        logger.error("Backup creation failed for user %d: %s", user_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to upload backup to storage. Please try again.",
        )


# ---------------------------------------------------------------------------
# GET /api/admin/backup/{user_id} -- List backups
# ---------------------------------------------------------------------------

@router.get(
    "/{user_id}",
    response_model=List[BackupRegistryRead],
    summary="List backups for a user",
    description="Returns all available backup snapshots for the specified user, newest first.",
)
async def list_backups(
    user_id: int,
    current_user: User = Depends(require_admin),
):
    backups = await _backup_service.list_backups(user_id)
    return backups


# ---------------------------------------------------------------------------
# POST /api/admin/backup/restore/{backup_id}/preview -- Preview restore
# ---------------------------------------------------------------------------

@router.post(
    "/restore/{backup_id}/preview",
    summary="Preview what a restore would do",
    description=(
        "Returns backup metadata including which tables are available and "
        "how many records each table contains. No data is modified."
    ),
)
async def preview_restore(
    backup_id: int,
    current_user: User = Depends(require_admin),
):
    try:
        preview = await _backup_service.preview_restore(backup_id)
        return preview
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        )


# ---------------------------------------------------------------------------
# POST /api/admin/backup/restore/{backup_id} -- Restore from backup
# ---------------------------------------------------------------------------

@router.post(
    "/restore/{backup_id}",
    response_model=RestoreResponse,
    summary="Restore user data from a backup",
    description=(
        "Restores user data from a previously created backup snapshot. "
        "Optionally specify which tables to restore; if omitted, all tables "
        "in the backup are restored. The operation is transactional -- if any "
        "table fails, no data is modified."
    ),
)
async def restore_from_backup(
    backup_id: int,
    body: Optional[RestoreRequest] = None,
    current_user: User = Depends(require_admin),
):
    tables = body.tables if body else None

    # Create a safety backup before restoring
    try:
        preview = await _backup_service.preview_restore(backup_id)
        target_user_id = preview["user_id"]
        await _backup_service.auto_backup_before_destructive(
            user_id=target_user_id,
            operation=f"restore from backup {backup_id}",
        )
    except Exception as exc:
        logger.warning(
            "Pre-restore backup failed for backup %d: %s (proceeding with restore)",
            backup_id, exc,
        )

    try:
        result = await _backup_service.restore_from_backup(
            backup_id=backup_id,
            tables=tables,
        )
        return RestoreResponse(**result)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        )
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Backup file not found in storage: {exc}",
        )
    except Exception as exc:
        logger.error("Restore failed for backup %d: %s", backup_id, exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Restore operation failed. No data was modified (transaction rolled back).",
        )


# ---------------------------------------------------------------------------
# POST /api/admin/backup/cleanup -- Remove expired backups
# ---------------------------------------------------------------------------

@router.post(
    "/cleanup",
    response_model=CleanupResponse,
    summary="Clean up expired backups",
    description="Deletes backup registry entries and storage files that have passed their expiration date.",
)
async def cleanup_expired_backups(
    current_user: User = Depends(require_admin),
):
    cleaned = await _backup_service.cleanup_expired_backups()
    return CleanupResponse(
        cleaned_count=cleaned,
        message=f"Cleaned up {cleaned} expired backup(s).",
    )
