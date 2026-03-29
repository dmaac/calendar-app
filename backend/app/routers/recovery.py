"""Admin recovery endpoints -- list, restore, and purge soft-deleted records.

All endpoints require admin privileges.  Regular users cannot access these
routes; they only interact with soft-delete through normal DELETE endpoints
that now set ``deleted_at`` instead of removing the row.

Endpoints
---------
GET    /api/admin/recovery/deleted          -- list soft-deleted records
GET    /api/admin/recovery/tables           -- list protected tables
GET    /api/admin/recovery/stats            -- deletion stats per table
POST   /api/admin/recovery/restore/{table}/{record_id}  -- restore one record
DELETE /api/admin/recovery/purge            -- permanently remove old deletions
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlmodel.ext.asyncio.session import AsyncSession

from ..core.database import get_session
from ..models.user import User
from ..routers.auth import get_current_user
from ..services.data_protection_service import (
    count_deleted,
    get_deleted,
    get_protected_model,
    list_protected_tables,
    purge_all_expired,
    restore,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/recovery", tags=["admin", "recovery"])


# -----------------------------------------------------------------------
# Auth dependency -- reuse the existing admin guard
# -----------------------------------------------------------------------

async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Dependency that enforces admin access."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required.",
        )
    return current_user


# -----------------------------------------------------------------------
# Response schemas
# -----------------------------------------------------------------------

class DeletedRecordResponse(BaseModel):
    id: int
    user_id: int
    deleted_at: str
    deleted_by: Optional[int] = None
    # Extra fields are model-specific; we serialize whatever the model has.
    data: dict[str, Any]


class RestoreResponse(BaseModel):
    restored: bool
    table: str
    record_id: int
    message: str


class PurgeResponse(BaseModel):
    purged: dict[str, int]
    message: str


class DeletionStatsResponse(BaseModel):
    table: str
    deleted_count: int


# -----------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------

def _serialize_record(record: Any) -> dict[str, Any]:
    """Convert a SQLModel instance to a JSON-safe dict."""
    data: dict[str, Any] = {}
    for key in record.__fields__:
        value = getattr(record, key, None)
        # Convert datetimes to ISO strings for JSON
        if hasattr(value, "isoformat"):
            data[key] = value.isoformat()
        else:
            data[key] = value
    return data


def _resolve_model(table: str):
    """Look up a model by table name or raise 404."""
    model = get_protected_model(table)
    if model is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Table '{table}' is not registered for soft-delete recovery. "
                   f"Available tables: {', '.join(list_protected_tables())}",
        )
    return model


# -----------------------------------------------------------------------
# Endpoints
# -----------------------------------------------------------------------

@router.get("/tables")
async def get_protected_tables(
    admin: User = Depends(require_admin),
):
    """List all tables registered for soft-delete protection."""
    return {"tables": list_protected_tables()}


@router.get("/stats")
async def get_deletion_stats(
    user_id: Optional[int] = Query(None, description="Filter by user ID"),
    admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """Return count of soft-deleted records per protected table."""
    stats: list[dict[str, Any]] = []
    for table_name in list_protected_tables():
        model = get_protected_model(table_name)
        if model is None:
            continue
        count = await count_deleted(session, model, user_id=user_id)
        stats.append({"table": table_name, "deleted_count": count})
    return {"stats": stats, "user_id": user_id}


@router.get("/deleted")
async def list_deleted_records(
    table: str = Query(..., description="Table name (e.g. ai_food_log)"),
    user_id: Optional[int] = Query(None, description="Filter by user ID"),
    limit: int = Query(100, ge=1, le=500, description="Max records to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """List soft-deleted records from a specific table."""
    model = _resolve_model(table)
    records = await get_deleted(session, model, user_id=user_id, limit=limit, offset=offset)
    total = await count_deleted(session, model, user_id=user_id)

    serialized = []
    for record in records:
        data = _serialize_record(record)
        serialized.append({
            "id": getattr(record, "id", None),
            "user_id": getattr(record, "user_id", None),
            "deleted_at": getattr(record, "deleted_at", None).isoformat()
            if getattr(record, "deleted_at", None)
            else None,
            "deleted_by": getattr(record, "deleted_by", None),
            "data": data,
        })

    logger.info(
        "ADMIN_RECOVERY: admin=%s listed deleted records table=%s user=%s count=%d",
        admin.id,
        table,
        user_id,
        len(serialized),
    )

    return {
        "table": table,
        "user_id": user_id,
        "total": total,
        "records": serialized,
    }


@router.post("/restore/{table}/{record_id}")
async def restore_record(
    table: str,
    record_id: int,
    admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """Restore a single soft-deleted record."""
    model = _resolve_model(table)
    record = await restore(session, model, record_id)

    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Record {record_id} not found in {table} or is not deleted.",
        )

    await session.commit()

    logger.info(
        "ADMIN_RECOVERY: admin=%s restored record table=%s id=%s",
        admin.id,
        table,
        record_id,
    )

    return {
        "restored": True,
        "table": table,
        "record_id": record_id,
        "message": f"Record {record_id} in {table} has been restored.",
    }


@router.delete("/purge")
async def purge_old_deletions(
    older_than_days: int = Query(
        30,
        ge=1,
        le=365,
        description="Permanently delete records soft-deleted more than N days ago",
    ),
    admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """Permanently remove records that have been in the soft-delete bin
    for longer than ``older_than_days``.

    This is IRREVERSIBLE.  The default retention is 30 days.
    """
    purged = await purge_all_expired(session, days=older_than_days)

    total_purged = sum(purged.values())

    logger.warning(
        "ADMIN_RECOVERY: admin=%s PURGED %d records older_than_days=%d breakdown=%s",
        admin.id,
        total_purged,
        older_than_days,
        purged,
    )

    return {
        "purged": purged,
        "total_purged": total_purged,
        "older_than_days": older_than_days,
        "message": f"Permanently removed {total_purged} records older than {older_than_days} days."
        if total_purged > 0
        else "No records qualified for purge.",
    }
