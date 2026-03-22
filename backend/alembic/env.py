"""Alembic environment configuration.

Uses an async engine (asyncpg) derived from app settings so that the same
DATABASE_URL used at runtime is also used for migrations — no duplication.

Running migrations:
    # Generate a new migration (autogenerate from model changes):
    alembic revision --autogenerate -m "describe your change"

    # Apply all pending migrations:
    alembic upgrade head

    # Roll back one step:
    alembic downgrade -1
"""
import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context
from sqlmodel import SQLModel

# ── App imports ───────────────────────────────────────────────────────────────
# Import settings so we can derive the async DB URL.
from app.core.config import settings

# Import ALL models so their tables are registered on SQLModel.metadata before
# autogenerate inspects it.  Add new model modules here as the schema grows.
import app.models.user  # noqa: F401
import app.models.activity  # noqa: F401
import app.models.ai_food_log  # noqa: F401
import app.models.ai_scan_cache  # noqa: F401
import app.models.daily_nutrition_summary  # noqa: F401
import app.models.food  # noqa: F401
import app.models.meal_log  # noqa: F401
import app.models.nutrition_profile  # noqa: F401
import app.models.onboarding_profile  # noqa: F401
import app.models.subscription  # noqa: F401
import app.models.user_food_favorite  # noqa: F401

# ── Alembic Config ────────────────────────────────────────────────────────────
config = context.config

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Point autogenerate at the full application metadata.
target_metadata = SQLModel.metadata

# Override sqlalchemy.url from alembic.ini with the async URL from settings.
# settings.database_url_async is derived automatically by the @validator in
# config.py (postgresql+asyncpg://...).
config.set_main_option("sqlalchemy.url", settings.database_url_async)


# ── Offline migrations (no live DB connection) ────────────────────────────────
def run_migrations_offline() -> None:
    """Run migrations without connecting to the database.

    Useful for generating SQL scripts to be reviewed or applied manually.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


# ── Online migrations (live async connection) ─────────────────────────────────
def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        # Emit COMMIT after each DDL statement so partial failures are visible.
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Create an async engine and run migrations inside a sync wrapper."""
    _connect_args = {}
    _db_url = settings.database_url_async
    if "supabase" in _db_url or "pooler.supabase" in _db_url:
        import ssl
        _ssl_ctx = ssl.create_default_context()
        _ssl_ctx.check_hostname = False
        _ssl_ctx.verify_mode = ssl.CERT_NONE
        _connect_args = {"ssl": _ssl_ctx, "statement_cache_size": 0}

    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        connect_args=_connect_args,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


# ── Entry point ───────────────────────────────────────────────────────────────
if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
