"""
Audit Service — Application-level audit logging + request-context middleware.

Responsibilities:
  1. Provide ``log_action()`` for explicit audit entries from application code.
  2. Inject per-request context (IP, user-agent, endpoint, request_id) into
     PostgreSQL session variables so the database trigger function
     (``audit_trigger_fn``) can tag every row-level change with the HTTP
     request that caused it.
  3. Query audit history for forensic investigation.
  4. Enforce a configurable retention policy (default: 90 days).

Design decisions:
  - The middleware uses ``SET LOCAL`` so context variables are scoped to the
    current database transaction and automatically cleared on commit/rollback.
  - ``log_action()`` is intentionally fire-and-forget (catches all exceptions)
    so an audit failure never blocks a user-facing request.
  - Retention cleanup runs as a daily background job, not inline.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional, Sequence

from fastapi import Request, Response
from sqlalchemy import delete, text
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from starlette.middleware.base import BaseHTTPMiddleware

from ..core.database import AsyncSessionLocal
from ..models.audit_log import AuditLog

logger = logging.getLogger(__name__)

# Default retention: 90 days
DEFAULT_RETENTION_DAYS = 90


# ---------------------------------------------------------------------------
# Request context helpers
# ---------------------------------------------------------------------------

def _extract_client_ip(request: Request) -> str:
    """Extract the real client IP, only trusting X-Forwarded-For from known proxies."""
    from ..core.ip_utils import get_client_ip
    return get_client_ip(request)


def _extract_user_id_from_request(request: Request) -> Optional[int]:
    """Best-effort extraction of user_id from JWT without a DB round-trip."""
    try:
        from ..core.security import verify_token

        auth = request.headers.get("authorization", "")
        if auth.startswith("Bearer "):
            return verify_token(auth[7:])
    except Exception:
        pass
    return None


# ---------------------------------------------------------------------------
# Middleware: inject audit context into PostgreSQL session variables
# ---------------------------------------------------------------------------

class AuditContextMiddleware(BaseHTTPMiddleware):
    """
    Sets PostgreSQL session-level variables that the ``audit_trigger_fn``
    reads when writing audit_log rows.

    Variables set via ``SET LOCAL``:
      - audit.ip_address
      - audit.user_agent
      - audit.endpoint
      - audit.request_id

    ``SET LOCAL`` scopes the values to the current transaction, so they are
    automatically cleared when the transaction commits or rolls back.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        # Gather context
        ip = _extract_client_ip(request)
        user_agent = (request.headers.get("user-agent") or "")[:500]
        endpoint = f"{request.method} {request.url.path}"[:200]
        request_id = getattr(request.state, "request_id", None) or str(uuid.uuid4())

        # Store on request.state so other code can access it
        request.state.audit_ip = ip
        request.state.audit_user_agent = user_agent
        request.state.audit_endpoint = endpoint
        request.state.audit_request_id = request_id

        response = await call_next(request)
        return response


async def set_audit_context_on_session(
    session: AsyncSession,
    request: Request,
) -> None:
    """
    Call this inside a route handler (after ``get_session()``) to propagate
    the HTTP request context into the PostgreSQL transaction so the trigger
    function can read it.

    Usage::

        @router.post("/api/food/logs")
        async def create_food_log(
            request: Request,
            session: AsyncSession = Depends(get_session),
        ):
            await set_audit_context_on_session(session, request)
            ...
    """
    ip = getattr(request.state, "audit_ip", "unknown")
    user_agent = getattr(request.state, "audit_user_agent", "")
    endpoint = getattr(request.state, "audit_endpoint", "")
    request_id = getattr(request.state, "audit_request_id", "")

    # SET LOCAL is transaction-scoped and safe against SQL injection when
    # using parameterized execution.  PostgreSQL custom GUC variables
    # (audit.*) require string values.
    await session.execute(
        text("SELECT set_config('audit.ip_address', :ip, TRUE)"),
        {"ip": ip},
    )
    await session.execute(
        text("SELECT set_config('audit.user_agent', :ua, TRUE)"),
        {"ua": user_agent},
    )
    await session.execute(
        text("SELECT set_config('audit.endpoint', :ep, TRUE)"),
        {"ep": endpoint},
    )
    await session.execute(
        text("SELECT set_config('audit.request_id', :rid, TRUE)"),
        {"rid": request_id},
    )


# ---------------------------------------------------------------------------
# Application-level audit logging
# ---------------------------------------------------------------------------

async def log_action(
    table_name: str,
    record_id: int,
    action: str,
    old_data: Optional[dict[str, Any]] = None,
    new_data: Optional[dict[str, Any]] = None,
    user_id: Optional[int] = None,
    request: Optional[Request] = None,
    session: Optional[AsyncSession] = None,
) -> Optional[AuditLog]:
    """
    Write an explicit audit log entry from application code.

    Use this when you need to log an action that is NOT captured by the
    PostgreSQL trigger (e.g., a soft-delete flag change, a business-level
    event, or a bulk operation).

    Parameters
    ----------
    table_name : str
        Logical table/entity name (e.g. ``"ai_food_log"``).
    record_id : int
        Primary key of the affected record.
    action : str
        ``"INSERT"``, ``"UPDATE"``, ``"DELETE"``, or a custom verb.
    old_data, new_data : dict, optional
        Snapshots of the record before/after the change.
    user_id : int, optional
        The user who initiated the action.
    request : Request, optional
        The current FastAPI request (for IP, user-agent, endpoint, request_id).
    session : AsyncSession, optional
        An existing DB session.  If ``None``, a new one is created.

    Returns
    -------
    AuditLog or None
        The persisted audit record, or ``None`` if an error occurred.
    """
    try:
        ip = None
        user_agent = None
        endpoint = None
        request_id = None

        if request is not None:
            ip = getattr(request.state, "audit_ip", _extract_client_ip(request))
            user_agent = getattr(request.state, "audit_user_agent", "")
            endpoint = getattr(request.state, "audit_endpoint", "")
            request_id = getattr(request.state, "audit_request_id", "")

        entry = AuditLog(
            table_name=table_name,
            record_id=record_id,
            action=action,
            old_data=old_data,
            new_data=new_data,
            user_id=user_id,
            ip_address=ip,
            user_agent=user_agent,
            endpoint=endpoint,
            request_id=request_id,
        )

        if session is not None:
            session.add(entry)
            await session.flush()
            return entry

        # No session provided -- create our own
        async with AsyncSessionLocal() as new_session:
            new_session.add(entry)
            await new_session.commit()
            await new_session.refresh(entry)
            return entry

    except Exception:
        logger.exception("Failed to write audit log entry for %s.%s", table_name, record_id)
        return None


# ---------------------------------------------------------------------------
# Query helpers
# ---------------------------------------------------------------------------

async def get_record_history(
    session: AsyncSession,
    table_name: str,
    record_id: int,
    limit: int = 100,
    offset: int = 0,
) -> Sequence[AuditLog]:
    """Return the full audit history for a single record, newest first."""
    stmt = (
        select(AuditLog)
        .where(AuditLog.table_name == table_name, AuditLog.record_id == record_id)
        .order_by(AuditLog.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    result = await session.execute(stmt)
    return result.scalars().all()


async def get_user_actions(
    session: AsyncSession,
    user_id: int,
    limit: int = 100,
    offset: int = 0,
) -> Sequence[AuditLog]:
    """Return all audit entries associated with a given user, newest first."""
    stmt = (
        select(AuditLog)
        .where(AuditLog.user_id == user_id)
        .order_by(AuditLog.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    result = await session.execute(stmt)
    return result.scalars().all()


async def get_recent_deletions(
    session: AsyncSession,
    days: int = 7,
    table_name: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
) -> Sequence[AuditLog]:
    """Return recent DELETE actions, optionally filtered by table."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    stmt = (
        select(AuditLog)
        .where(
            AuditLog.action == "DELETE",
            AuditLog.created_at >= since,
        )
        .order_by(AuditLog.created_at.desc())
    )
    if table_name:
        stmt = stmt.where(AuditLog.table_name == table_name)
    stmt = stmt.offset(offset).limit(limit)
    result = await session.execute(stmt)
    return result.scalars().all()


async def query_audit_log(
    session: AsyncSession,
    table_name: Optional[str] = None,
    record_id: Optional[int] = None,
    user_id: Optional[int] = None,
    action: Optional[str] = None,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    limit: int = 100,
    offset: int = 0,
) -> Sequence[AuditLog]:
    """Flexible query with optional filters on every column."""
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc())

    if table_name:
        stmt = stmt.where(AuditLog.table_name == table_name)
    if record_id is not None:
        stmt = stmt.where(AuditLog.record_id == record_id)
    if user_id is not None:
        stmt = stmt.where(AuditLog.user_id == user_id)
    if action:
        stmt = stmt.where(AuditLog.action == action.upper())
    if from_date:
        stmt = stmt.where(AuditLog.created_at >= from_date)
    if to_date:
        stmt = stmt.where(AuditLog.created_at <= to_date)

    stmt = stmt.offset(offset).limit(limit)
    result = await session.execute(stmt)
    return result.scalars().all()


# ---------------------------------------------------------------------------
# Retention policy
# ---------------------------------------------------------------------------

async def purge_old_entries(
    retention_days: int = DEFAULT_RETENTION_DAYS,
    session: Optional[AsyncSession] = None,
) -> int:
    """
    Delete audit_log entries older than ``retention_days``.

    Returns the number of rows deleted.  This is designed to run as a
    periodic background job (e.g., daily via the existing cleanup task).
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    stmt = delete(AuditLog).where(AuditLog.created_at < cutoff)

    if session is not None:
        result = await session.execute(stmt)
        await session.commit()
        deleted = result.rowcount  # type: ignore[union-attr]
    else:
        async with AsyncSessionLocal() as new_session:
            result = await new_session.execute(stmt)
            await new_session.commit()
            deleted = result.rowcount  # type: ignore[union-attr]

    logger.info(
        "Audit log retention: purged %d entries older than %d days (cutoff=%s)",
        deleted,
        retention_days,
        cutoff.isoformat(),
    )
    return deleted
