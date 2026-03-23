from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

_is_sqlite = settings.database_url_async.startswith("sqlite")

_engine_kwargs: dict = {"echo": False}

# Enable SSL for Supabase/cloud PostgreSQL connections
_db_url = settings.database_url_async
if "supabase" in _db_url or "pooler.supabase" in _db_url:
    import ssl
    _ssl_ctx = ssl.create_default_context()
    _engine_kwargs["connect_args"] = {
        "ssl": _ssl_ctx,
        "statement_cache_size": 0,  # Required for Supabase pooler (transaction mode)
    }

if not _is_sqlite:
    # PostgreSQL-only pool parameters — not supported by SQLite
    #
    # Production recommendations:
    #   pool_size=20        — baseline persistent connections
    #   max_overflow=40     — burst capacity (total max = pool_size + max_overflow = 60)
    #   pool_timeout=30     — seconds to wait for a connection before raising
    #   pool_recycle=3600   — recycle connections every hour to avoid stale/idle drops
    #   pool_pre_ping=True  — test connection liveness before checkout (detects dead connections)
    #
    # For development, echo_pool="debug" logs pool checkout/checkin events.
    _engine_kwargs.update(
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        pool_timeout=settings.db_pool_timeout,
        pool_recycle=settings.db_pool_recycle,
        pool_pre_ping=True,
    )
    if not settings.is_production:
        _engine_kwargs["echo_pool"] = "debug"

async_engine = create_async_engine(settings.database_url_async, **_engine_kwargs)

AsyncSessionLocal = async_sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def create_db_and_tables():
    async with async_engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    logger.info("Database tables created/verified")


async def get_session():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
