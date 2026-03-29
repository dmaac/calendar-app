"""
Admin Audit Log endpoints.

Provides forensic investigation capabilities:
  - Query the full audit log with flexible filters
  - Get the complete history of any single record
  - Get all actions performed by or on behalf of a user
  - List recent deletions across all monitored tables

All endpoints require admin privileges.
"""
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel.ext.asyncio.session import AsyncSession

from ..core.database import get_session
from ..models.audit_log import AuditLogRead, AuditLogSummary
from ..models.user import User
from ..routers.admin import require_admin
from ..services.audit_service import (
    get_recent_deletions,
    get_record_history,
    get_user_actions,
    purge_old_entries,
    query_audit_log,
    DEFAULT_RETENTION_DAYS,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/audit", tags=["audit"])

# Maximum rows per page to protect against accidental full-table scans
MAX_PAGE_SIZE = 500


# ═══════════════════════════════════════════════════════════════════════════
# 1. Flexible query
# ═══════════════════════════════════════════════════════════════════════════

@router.get(
    "",
    response_model=list[AuditLogRead],
    summary="Query audit log with filters",
    description=(
        "Search the audit trail. All parameters are optional and act as AND "
        "filters. Results are ordered newest-first."
    ),
)
async def query_audit(
    table: Optional[str] = Query(None, description="Table name (e.g. ai_food_log)"),
    record_id: Optional[int] = Query(None, description="Primary key of the record"),
    user_id: Optional[int] = Query(None, description="User who triggered the action"),
    action: Optional[str] = Query(
        None,
        description="Action type: INSERT, UPDATE, or DELETE",
        regex="^(INSERT|UPDATE|DELETE)$",
    ),
    from_date: Optional[datetime] = Query(
        None,
        alias="from",
        description="Start of date range (ISO 8601)",
    ),
    to_date: Optional[datetime] = Query(
        None,
        alias="to",
        description="End of date range (ISO 8601)",
    ),
    limit: int = Query(50, ge=1, le=MAX_PAGE_SIZE, description="Page size"),
    offset: int = Query(0, ge=0, description="Skip N records"),
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    entries = await query_audit_log(
        session=session,
        table_name=table,
        record_id=record_id,
        user_id=user_id,
        action=action,
        from_date=from_date,
        to_date=to_date,
        limit=limit,
        offset=offset,
    )
    return entries


# ═══════════════════════════════════════════════════════════════════════════
# 2. Full history of a single record
# ═══════════════════════════════════════════════════════════════════════════

@router.get(
    "/record/{table}/{record_id}",
    response_model=list[AuditLogRead],
    summary="Full audit history of one record",
    description=(
        "Returns every audit entry for a specific record, ordered newest-first. "
        "Useful for investigating how a particular food log, subscription, or "
        "user record changed over time."
    ),
)
async def get_record_audit_history(
    table: str,
    record_id: int,
    limit: int = Query(100, ge=1, le=MAX_PAGE_SIZE),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    entries = await get_record_history(
        session=session,
        table_name=table,
        record_id=record_id,
        limit=limit,
        offset=offset,
    )
    if not entries:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No audit history found for {table}.{record_id}",
        )
    return entries


# ═══════════════════════════════════════════════════════════════════════════
# 3. All actions by a user
# ═══════════════════════════════════════════════════════════════════════════

@router.get(
    "/user/{user_id}",
    response_model=list[AuditLogSummary],
    summary="All actions by a user",
    description=(
        "Returns every audit entry triggered by or for a given user. "
        "Includes inserts, updates, and deletes across all monitored tables."
    ),
)
async def get_user_audit_history(
    user_id: int,
    limit: int = Query(100, ge=1, le=MAX_PAGE_SIZE),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    entries = await get_user_actions(
        session=session,
        user_id=user_id,
        limit=limit,
        offset=offset,
    )
    return entries


# ═══════════════════════════════════════════════════════════════════════════
# 4. Recent deletions
# ═══════════════════════════════════════════════════════════════════════════

@router.get(
    "/deletions",
    response_model=list[AuditLogRead],
    summary="Recent deletions across all tables",
    description=(
        "Lists all DELETE operations within the specified time window. "
        "This is the primary endpoint for investigating data loss events "
        "like the 34 missing food log records."
    ),
)
async def list_recent_deletions(
    days: int = Query(7, ge=1, le=365, description="Look back N days"),
    table: Optional[str] = Query(None, description="Filter by table name"),
    limit: int = Query(100, ge=1, le=MAX_PAGE_SIZE),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    entries = await get_recent_deletions(
        session=session,
        days=days,
        table_name=table,
        limit=limit,
        offset=offset,
    )
    return entries


# ═══════════════════════════════════════════════════════════════════════════
# 5. Retention management
# ═══════════════════════════════════════════════════════════════════════════

@router.post(
    "/purge",
    summary="Purge old audit entries",
    description=(
        "Delete audit_log entries older than the specified retention period. "
        "This is also run automatically as a daily background task."
    ),
)
async def purge_audit_entries(
    retention_days: int = Query(
        DEFAULT_RETENTION_DAYS,
        ge=7,
        le=3650,
        description="Delete entries older than N days",
    ),
    current_user: User = Depends(require_admin),
):
    deleted = await purge_old_entries(retention_days=retention_days)
    return {
        "deleted": deleted,
        "retention_days": retention_days,
        "message": f"Purged {deleted} audit entries older than {retention_days} days.",
    }
