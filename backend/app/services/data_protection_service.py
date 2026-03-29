"""Data Protection Service -- soft-delete, restore, purge, and safe queries.

This service exists because hard-deleting user nutrition data is
irreversible and has already caused data loss (34 food log records).
All delete operations on user-facing tables MUST go through this
service instead of calling ``session.delete()`` directly.

Architecture
------------
* ``soft_delete``   -- sets deleted_at + deleted_by (no row removal)
* ``bulk_soft_delete`` -- same, but for multiple records at once
* ``restore``       -- clears deleted_at (admin-only in router layer)
* ``get_deleted``   -- lists soft-deleted rows for a given user
* ``purge_expired`` -- permanently removes rows where deleted_at > N days
* ``active_query``  -- returns a SELECT pre-filtered to active records
* ``count_active``  -- counts non-deleted rows in a table for a user

All timestamps are UTC.  The ``deleted_by`` field creates an audit trail
so we always know who performed the deletion.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional, Sequence, Type, TypeVar

from sqlalchemy import delete as sa_delete, func
from sqlmodel import SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=SQLModel)


# -----------------------------------------------------------------------
# Registry of protected tables -- only these participate in soft-delete
# -----------------------------------------------------------------------

_PROTECTED_TABLE_MAP: dict[str, Type[SQLModel]] = {}


def register_protected_model(model: Type[SQLModel]) -> Type[SQLModel]:
    """Register a model class as soft-delete protected.

    Call this once per model at import time (e.g. in models/__init__.py).
    The table name (``__tablename__`` or class name lowercased) is used as
    the lookup key for the recovery API.
    """
    table_name = getattr(model, "__tablename__", model.__name__.lower())
    _PROTECTED_TABLE_MAP[table_name] = model
    return model


def get_protected_model(table_name: str) -> Type[SQLModel] | None:
    """Look up a model class by its table name.  Returns None if unknown."""
    return _PROTECTED_TABLE_MAP.get(table_name)


def list_protected_tables() -> list[str]:
    """Return the names of all registered soft-delete tables."""
    return sorted(_PROTECTED_TABLE_MAP.keys())


# -----------------------------------------------------------------------
# Core operations
# -----------------------------------------------------------------------

async def soft_delete(
    session: AsyncSession,
    model: Type[T],
    record_id: int,
    user_id: int,
    *,
    acting_user_id: int | None = None,
) -> T | None:
    """Soft-delete a single record by setting ``deleted_at``.

    Parameters
    ----------
    session : AsyncSession
        Active database session (caller must commit).
    model : type
        The SQLModel class (must have ``deleted_at`` column).
    record_id : int
        Primary key of the record.
    user_id : int
        Owner of the record -- used to scope the lookup so users cannot
        delete each other's data.
    acting_user_id : int | None
        The user performing the delete (defaults to ``user_id``).

    Returns
    -------
    The soft-deleted record instance, or ``None`` if not found.
    """
    stmt = select(model).where(
        model.id == record_id,  # type: ignore[attr-defined]
        model.user_id == user_id,  # type: ignore[attr-defined]
        model.deleted_at.is_(None),  # type: ignore[attr-defined]
    )
    result = await session.execute(stmt)
    record = result.scalar_one_or_none()

    if record is None:
        return None

    now = datetime.now(timezone.utc)
    record.deleted_at = now  # type: ignore[attr-defined]
    record.deleted_by = acting_user_id if acting_user_id is not None else user_id  # type: ignore[attr-defined]

    session.add(record)
    await session.flush()

    logger.info(
        "SOFT_DELETE table=%s id=%s user=%s actor=%s",
        getattr(model, "__tablename__", model.__name__),
        record_id,
        user_id,
        record.deleted_by,  # type: ignore[attr-defined]
    )
    return record


async def bulk_soft_delete(
    session: AsyncSession,
    model: Type[T],
    record_ids: Sequence[int],
    user_id: int,
    *,
    acting_user_id: int | None = None,
) -> int:
    """Soft-delete multiple records at once.  Returns count of affected rows."""
    if not record_ids:
        return 0

    stmt = select(model).where(
        model.id.in_(record_ids),  # type: ignore[attr-defined]
        model.user_id == user_id,  # type: ignore[attr-defined]
        model.deleted_at.is_(None),  # type: ignore[attr-defined]
    )
    result = await session.execute(stmt)
    records = result.scalars().all()

    now = datetime.now(timezone.utc)
    actor = acting_user_id if acting_user_id is not None else user_id
    count = 0
    for record in records:
        record.deleted_at = now  # type: ignore[attr-defined]
        record.deleted_by = actor  # type: ignore[attr-defined]
        session.add(record)
        count += 1

    await session.flush()

    logger.info(
        "BULK_SOFT_DELETE table=%s count=%d user=%s actor=%s",
        getattr(model, "__tablename__", model.__name__),
        count,
        user_id,
        actor,
    )
    return count


async def restore(
    session: AsyncSession,
    model: Type[T],
    record_id: int,
) -> T | None:
    """Restore a soft-deleted record (admin only -- access control in router).

    Parameters
    ----------
    session : AsyncSession
    model : type
    record_id : int

    Returns
    -------
    The restored record, or ``None`` if it was not found or was not deleted.
    """
    stmt = select(model).where(
        model.id == record_id,  # type: ignore[attr-defined]
        model.deleted_at.isnot(None),  # type: ignore[attr-defined]
    )
    result = await session.execute(stmt)
    record = result.scalar_one_or_none()

    if record is None:
        return None

    record.deleted_at = None  # type: ignore[attr-defined]
    record.deleted_by = None  # type: ignore[attr-defined]
    session.add(record)
    await session.flush()

    logger.info(
        "RESTORE table=%s id=%s",
        getattr(model, "__tablename__", model.__name__),
        record_id,
    )
    return record


async def get_deleted(
    session: AsyncSession,
    model: Type[T],
    user_id: int | None = None,
    *,
    limit: int = 100,
    offset: int = 0,
) -> list[T]:
    """List soft-deleted records, optionally filtered by user.

    If ``user_id`` is None, returns all deleted records (admin view).
    """
    stmt = select(model).where(
        model.deleted_at.isnot(None),  # type: ignore[attr-defined]
    )
    if user_id is not None:
        stmt = stmt.where(model.user_id == user_id)  # type: ignore[attr-defined]

    stmt = stmt.order_by(model.deleted_at.desc()).offset(offset).limit(limit)  # type: ignore[attr-defined]

    result = await session.execute(stmt)
    return list(result.scalars().all())


async def count_deleted(
    session: AsyncSession,
    model: Type[T],
    user_id: int | None = None,
) -> int:
    """Count soft-deleted records for a table/user."""
    stmt = select(func.count()).select_from(model).where(
        model.deleted_at.isnot(None),  # type: ignore[attr-defined]
    )
    if user_id is not None:
        stmt = stmt.where(model.user_id == user_id)  # type: ignore[attr-defined]

    result = await session.execute(stmt)
    return result.scalar() or 0


async def purge_expired(
    session: AsyncSession,
    model: Type[T],
    *,
    days: int = 30,
) -> int:
    """Permanently delete records that were soft-deleted more than ``days`` ago.

    This is the ONLY place where hard-deletes happen for protected tables.
    Should be called from a scheduled background job, not user-facing routes.

    Returns
    -------
    int : number of rows permanently removed.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    stmt = sa_delete(model).where(
        model.deleted_at.isnot(None),  # type: ignore[attr-defined]
        model.deleted_at < cutoff,  # type: ignore[attr-defined]
    )
    result = await session.execute(stmt)
    count = result.rowcount  # type: ignore[union-attr]

    if count > 0:
        logger.info(
            "PURGE table=%s older_than_days=%d purged=%d",
            getattr(model, "__tablename__", model.__name__),
            days,
            count,
        )

    return count


async def purge_all_expired(
    session: AsyncSession,
    *,
    days: int = 30,
) -> dict[str, int]:
    """Run ``purge_expired`` across every registered protected table.

    Returns a dict mapping table name to purge count.
    """
    results: dict[str, int] = {}
    for table_name, model in _PROTECTED_TABLE_MAP.items():
        count = await purge_expired(session, model, days=days)
        if count > 0:
            results[table_name] = count

    if results:
        await session.commit()

    return results


# -----------------------------------------------------------------------
# Query helpers
# -----------------------------------------------------------------------

def active_filter(model: Type[T]):
    """Return a SQLAlchemy filter clause for non-deleted rows.

    Usage::

        stmt = select(AIFoodLog).where(
            active_filter(AIFoodLog),
            AIFoodLog.user_id == user_id,
        )
    """
    return model.deleted_at.is_(None)  # type: ignore[attr-defined]


def active_query(model: Type[T]):
    """Return a ``select(model)`` pre-filtered to active (non-deleted) rows.

    Usage::

        stmt = active_query(AIFoodLog).where(AIFoodLog.user_id == uid)
        result = await session.execute(stmt)
    """
    return select(model).where(model.deleted_at.is_(None))  # type: ignore[attr-defined]


async def count_active(
    session: AsyncSession,
    model: Type[T],
    user_id: int | None = None,
) -> int:
    """Count active (non-deleted) records, optionally scoped to a user."""
    stmt = select(func.count()).select_from(model).where(
        model.deleted_at.is_(None),  # type: ignore[attr-defined]
    )
    if user_id is not None:
        stmt = stmt.where(model.user_id == user_id)  # type: ignore[attr-defined]

    result = await session.execute(stmt)
    return result.scalar() or 0
