"""Seed script protection -- prevent accidental data loss from seed operations.

Problem
-------
Running a seed script against a database that contains real user data can
wipe or corrupt production records.  This has already happened once.

Solution
--------
Every seed script must call ``require_empty_or_confirm()`` before inserting
data.  The guard checks whether the target table contains rows belonging to
real (non-test) users.  If it does, the script aborts unless the operator
explicitly confirms with ``--force``.

Usage
-----
    from app.services.seed_protection import require_empty_or_confirm

    async def main():
        async with AsyncSessionLocal() as session:
            await require_empty_or_confirm(
                session,
                "meal_template",
                force=("--force" in sys.argv),
            )
            # ... proceed with seeding ...


    # Or use the decorator form:
    @protected_seed("meal_template", "meal_ingredient")
    async def seed(session, force=False):
        ...
"""

from __future__ import annotations

import functools
import logging
import sys
from typing import Callable, Sequence

from sqlalchemy import text as sa_text
from sqlmodel.ext.asyncio.session import AsyncSession

logger = logging.getLogger(__name__)

# Emails that are considered "test accounts" and do NOT count as real users.
_TEST_EMAIL_PATTERNS = [
    "%@test.com",
    "%@example.com",
    "%+test@%",
    "test%@%",
    "seed%@%",
    "demo%@%",
]


async def _has_real_users(session: AsyncSession) -> tuple[bool, int]:
    """Check if the database contains non-test user accounts.

    Returns (has_real_users, total_user_count).
    """
    # Build NOT LIKE clauses for test emails
    not_clauses = " AND ".join(
        f"email NOT LIKE '{p}'" for p in _TEST_EMAIL_PATTERNS
    )

    query = sa_text(f"""
        SELECT COUNT(*) FROM "user"
        WHERE {not_clauses}
    """)

    result = await session.execute(query)
    real_count = result.scalar() or 0

    total_result = await session.execute(sa_text('SELECT COUNT(*) FROM "user"'))
    total_count = total_result.scalar() or 0

    return real_count > 0, total_count


async def _table_row_count(session: AsyncSession, table_name: str) -> int:
    """Return the number of rows in a table.  Returns 0 if table does not exist."""
    try:
        result = await session.execute(
            sa_text(f"SELECT COUNT(*) FROM {table_name}")
        )
        return result.scalar() or 0
    except Exception:
        return 0


async def require_empty_or_confirm(
    session: AsyncSession,
    table_name: str,
    *,
    force: bool = False,
) -> None:
    """Abort the seed script if the table has real user data.

    Parameters
    ----------
    session : AsyncSession
        Active database session.
    table_name : str
        The table that will be seeded.
    force : bool
        If True, skip the safety check (requires explicit ``--force`` flag).

    Raises
    ------
    SystemExit
        If real user data is detected and ``force`` is False.
    """
    if force:
        logger.warning(
            "SEED_PROTECTION: --force flag used, skipping safety check for table '%s'.",
            table_name,
        )
        return

    has_real, total_users = await _has_real_users(session)
    row_count = await _table_row_count(session, table_name)

    if has_real and row_count > 0:
        logger.error(
            "SEED_PROTECTION: BLOCKED -- table '%s' has %d rows and database "
            "contains %d real (non-test) user accounts.  "
            "Re-run with --force to override.",
            table_name,
            row_count,
            total_users,
        )
        print(
            f"\n  SEED BLOCKED\n"
            f"  Table '{table_name}' already contains {row_count} rows.\n"
            f"  Database has real user accounts ({total_users} total users).\n"
            f"  Running this seed could corrupt or overwrite production data.\n"
            f"\n"
            f"  To proceed anyway, re-run with: --force\n",
            file=sys.stderr,
        )
        raise SystemExit(1)

    if has_real and row_count == 0:
        logger.warning(
            "SEED_PROTECTION: table '%s' is empty but database has real users. "
            "Proceeding with caution.",
            table_name,
        )
    else:
        logger.info(
            "SEED_PROTECTION: table '%s' safe to seed (rows=%d, real_users=%s).",
            table_name,
            row_count,
            has_real,
        )


def protected_seed(*table_names: str) -> Callable:
    """Decorator that wraps an async seed function with safety checks.

    Usage::

        @protected_seed("meal_template", "meal_ingredient")
        async def seed(session: AsyncSession, force: bool = False):
            # ... insert seed data ...

    The decorated function receives ``session`` and ``force`` as arguments.
    ``force`` is automatically set to True if ``--force`` is in sys.argv.
    """

    def decorator(fn: Callable) -> Callable:
        @functools.wraps(fn)
        async def wrapper(session: AsyncSession, **kwargs):
            force = kwargs.pop("force", "--force" in sys.argv)

            for table in table_names:
                await require_empty_or_confirm(session, table, force=force)

            return await fn(session, force=force, **kwargs)

        return wrapper

    return decorator
