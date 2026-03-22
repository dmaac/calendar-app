"""
Pytest configuration and fixtures for testing.

Provides:
- Async SQLite in-memory DB with full schema (all SQLModel tables)
- Mock Redis (fakeredis) or in-memory stub
- Mock OpenAI responses
- AsyncClient for endpoint integration tests
- Auth helpers: create user, get headers, etc.
"""
import os
import json
import hashlib
from datetime import date, datetime, timedelta, timezone
from typing import AsyncGenerator, Optional
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from sqlmodel import SQLModel, Session, create_engine, select
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.pool import StaticPool
from httpx import AsyncClient, ASGITransport

# Set test environment BEFORE importing any app module
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["DATABASE_URL_ASYNC"] = "sqlite+aiosqlite:///:memory:"
os.environ["SECRET_KEY"] = "test-secret-key-for-unit-tests-only-32chars!"
os.environ["REFRESH_SECRET_KEY"] = "test-refresh-secret-key-for-tests-only!"
os.environ["REDIS_URL"] = "redis://localhost:6379/15"
os.environ["OPENAI_API_KEY"] = "sk-test-fake-key"
os.environ["ENV"] = "development"

from app.core.database import get_session
from app.core.security import (
    get_password_hash,
    create_access_token,
    create_refresh_token,
    verify_refresh_token,
)
from app.main import app
from app.models.user import User, UserCreate
from app.models.activity import Activity
from app.models.food import Food
from app.models.meal_log import MealLog
from app.models.daily_nutrition_summary import DailyNutritionSummary
from app.models.nutrition_profile import UserNutritionProfile
from app.models.user_food_favorite import UserFoodFavorite
from app.models.onboarding_profile import OnboardingProfile
from app.models.ai_food_log import AIFoodLog
from app.models.ai_scan_cache import AIScanCache
from app.models.subscription import Subscription
from app.models.nutrition_tip import NutritionTip
from app.models.recipe import Recipe


# ─── Async test engine ────────────────────────────────────────────────────────

TEST_ASYNC_URL = "sqlite+aiosqlite:///:memory:"

_test_async_engine = create_async_engine(
    TEST_ASYNC_URL,
    echo=False,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

TestAsyncSessionLocal = async_sessionmaker(
    bind=_test_async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# ─── Sync engine (for synchronous fixtures) ──────────────────────────────────

_test_sync_engine = create_engine(
    "sqlite:///:memory:",
    echo=False,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture(name="async_engine")
async def async_engine_fixture():
    """Create all tables in the async in-memory SQLite engine."""
    async with _test_async_engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    yield _test_async_engine
    async with _test_async_engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)


@pytest_asyncio.fixture(name="async_session")
async def async_session_fixture(async_engine) -> AsyncGenerator[AsyncSession, None]:
    """Provide an async session scoped to a single test."""
    async with TestAsyncSessionLocal() as session:
        yield session


@pytest_asyncio.fixture(name="client")
async def client_fixture(async_engine) -> AsyncGenerator[AsyncClient, None]:
    """
    Async HTTPX client wired to the FastAPI app with the test DB session.
    Also patches Redis to prevent real connections.
    """
    async def _override_get_session() -> AsyncGenerator[AsyncSession, None]:
        async with TestAsyncSessionLocal() as session:
            try:
                yield session
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_session] = _override_get_session

    # Patch Redis calls to prevent connection errors in tests
    with patch("app.core.token_store.get_redis") as mock_redis:
        redis_mock = _create_redis_mock()
        mock_redis.return_value = redis_mock
        with patch("app.core.cache.get_redis", return_value=redis_mock):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as ac:
                yield ac

    app.dependency_overrides.clear()


# ─── Redis mock ───────────────────────────────────────────────────────────────

def _create_redis_mock():
    """Create an in-memory Redis mock that supports basic operations."""
    store = {}

    redis = AsyncMock()

    async def mock_get(key):
        return store.get(key)

    async def mock_setex(key, ttl, value):
        store[key] = value

    async def mock_set(key, value, **kwargs):
        store[key] = value

    async def mock_delete(*keys):
        for k in keys:
            store.pop(k, None)

    async def mock_exists(key):
        return 1 if key in store else 0

    async def mock_scan(cursor=0, match=None, count=100):
        import fnmatch
        matched = [k for k in store if fnmatch.fnmatch(k, match or "*")]
        return (0, matched)

    async def mock_ping():
        return True

    async def mock_flushdb():
        store.clear()

    async def mock_incr(key):
        current = int(store.get(key, 0))
        store[key] = str(current + 1)
        return current + 1

    async def mock_info(section=None):
        return {"db0": {"keys": len(store)}}

    async def mock_ttl(key):
        return -2 if key not in store else 300

    async def mock_expire(key, ttl):
        return True

    redis.get = AsyncMock(side_effect=mock_get)
    redis.setex = AsyncMock(side_effect=mock_setex)
    redis.set = AsyncMock(side_effect=mock_set)
    redis.delete = AsyncMock(side_effect=mock_delete)
    redis.exists = AsyncMock(side_effect=mock_exists)
    redis.scan = AsyncMock(side_effect=mock_scan)
    redis.ping = AsyncMock(side_effect=mock_ping)
    redis.flushdb = AsyncMock(side_effect=mock_flushdb)
    redis.incr = AsyncMock(side_effect=mock_incr)
    redis.info = AsyncMock(side_effect=mock_info)
    redis.ttl = AsyncMock(side_effect=mock_ttl)
    redis.expire = AsyncMock(side_effect=mock_expire)

    # Expose store for test assertions
    redis._test_store = store
    return redis


# ─── User helpers ─────────────────────────────────────────────────────────────

@pytest_asyncio.fixture(name="test_user")
async def test_user_fixture(async_session: AsyncSession) -> User:
    """Create a standard test user."""
    user = User(
        email="test@example.com",
        first_name="Test",
        last_name="User",
        hashed_password=get_password_hash("Testpassword123"),
        is_active=True,
        provider="email",
        is_premium=False,
    )
    async_session.add(user)
    await async_session.commit()
    await async_session.refresh(user)
    return user


@pytest_asyncio.fixture(name="premium_user")
async def premium_user_fixture(async_session: AsyncSession) -> User:
    """Create a premium test user."""
    user = User(
        email="premium@example.com",
        first_name="Premium",
        last_name="User",
        hashed_password=get_password_hash("Premiumpass123"),
        is_active=True,
        provider="email",
        is_premium=True,
    )
    async_session.add(user)
    await async_session.commit()
    await async_session.refresh(user)
    return user


@pytest_asyncio.fixture(name="inactive_user")
async def inactive_user_fixture(async_session: AsyncSession) -> User:
    """Create an inactive test user."""
    user = User(
        email="inactive@example.com",
        first_name="Inactive",
        last_name="User",
        hashed_password=get_password_hash("Inactivepass123"),
        is_active=False,
        provider="email",
    )
    async_session.add(user)
    await async_session.commit()
    await async_session.refresh(user)
    return user


@pytest_asyncio.fixture(name="admin_user")
async def admin_user_fixture(async_session: AsyncSession) -> User:
    """Create an admin test user."""
    user = User(
        email="admin@example.com",
        first_name="Admin",
        last_name="User",
        hashed_password=get_password_hash("Adminpassword123"),
        is_active=True,
        provider="email",
        is_premium=True,
        is_admin=True,
    )
    async_session.add(user)
    await async_session.commit()
    await async_session.refresh(user)
    return user


# ─── Auth helpers ─────────────────────────────────────────────────────────────

async def create_user_and_get_headers(
    client: AsyncClient,
    email: str = "testuser@example.com",
    password: str = "Testpassword123",
    first_name: str = "Test",
    last_name: str = "User",
) -> tuple[dict, int]:
    """Register a user, log in, return (headers, user_id)."""
    # Register
    await client.post(
        "/auth/register",
        json={
            "email": email,
            "password": password,
            "first_name": first_name,
            "last_name": last_name,
        },
    )
    # Login
    login_resp = await client.post(
        "/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    data = login_resp.json()
    headers = {"Authorization": f"Bearer {data['access_token']}"}
    return headers, data["user_id"]


@pytest_asyncio.fixture(name="auth_headers")
async def auth_headers_fixture(client: AsyncClient) -> dict:
    """Register a user and return auth headers."""
    headers, _ = await create_user_and_get_headers(
        client, email="auth@example.com", password="Authpassword123"
    )
    return headers


@pytest_asyncio.fixture(name="auth_user_and_headers")
async def auth_user_and_headers_fixture(client: AsyncClient) -> tuple[dict, int]:
    """Register a user and return (headers, user_id)."""
    return await create_user_and_get_headers(
        client, email="authu@example.com", password="Authpassword123"
    )


async def create_admin_and_get_headers(
    client: AsyncClient,
    async_session: AsyncSession,
    email: str = "admin@fitsi.test",
    password: str = "Adminpassword123",
) -> tuple[dict, int]:
    """Register a user, promote to admin, log in, return (headers, user_id)."""
    # Register
    await client.post(
        "/auth/register",
        json={
            "email": email,
            "password": password,
            "first_name": "Admin",
            "last_name": "Test",
        },
    )
    # Promote to admin via direct DB update
    from sqlmodel import select as sm_select
    result = await async_session.execute(sm_select(User).where(User.email == email))
    user = result.scalars().first()
    if user:
        user.is_admin = True
        async_session.add(user)
        await async_session.commit()
    # Login
    login_resp = await client.post(
        "/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    data = login_resp.json()
    headers = {"Authorization": f"Bearer {data['access_token']}"}
    return headers, data["user_id"]


@pytest_asyncio.fixture(name="admin_auth_headers")
async def admin_auth_headers_fixture(
    client: AsyncClient,
    async_session: AsyncSession,
) -> dict:
    """Register an admin user and return auth headers."""
    headers, _ = await create_admin_and_get_headers(client, async_session)
    return headers


# ─── Food test data ──────────────────────────────────────────────────────────

@pytest.fixture(name="test_food")
def test_food_fixture() -> Food:
    """Create a test food (does not persist to DB — use in sync context)."""
    return Food(
        name="Chicken Breast",
        brand="Generic",
        serving_size=100.0,
        serving_unit="g",
        calories=165.0,
        protein_g=31.0,
        carbs_g=0.0,
        fat_g=3.6,
        fiber_g=0.0,
        sugar_g=0.0,
        is_verified=True,
    )


# ─── Mock OpenAI response ────────────────────────────────────────────────────

MOCK_GPT4O_NUTRITION = {
    "food_name": "Grilled Chicken with Rice",
    "calories": 450,
    "carbs_g": 40.0,
    "protein_g": 35.0,
    "fats_g": 12.0,
    "fiber_g": 2.5,
    "sugar_g": 1.0,
    "sodium_mg": 380.0,
    "serving_size": "1 plate ~350g",
    "confidence": 0.92,
}


def make_mock_openai_response(nutrition: Optional[dict] = None) -> dict:
    """Build a mock httpx response matching OpenAI chat completions format."""
    data = nutrition or MOCK_GPT4O_NUTRITION
    return {
        "choices": [
            {
                "message": {
                    "content": json.dumps(data),
                }
            }
        ]
    }


# ─── Onboarding data factories ───────────────────────────────────────────────

def make_onboarding_step_data(**overrides) -> dict:
    """Return a minimal step-save payload."""
    data = {"gender": "male", "workouts_per_week": 3}
    data.update(overrides)
    return data


def make_onboarding_complete_data(**overrides) -> dict:
    """Return a complete onboarding payload with all required fields."""
    data = {
        "gender": "male",
        "workouts_per_week": 3,
        "height_cm": 175.0,
        "weight_kg": 80.0,
        "unit_system": "metric",
        "birth_date": "1990-06-15",
        "goal": "lose",
        "target_weight_kg": 72.0,
        "weekly_speed_kg": 0.8,
        "diet_type": "Classic",
        "health_connected": False,
        "notifications_enabled": True,
    }
    data.update(overrides)
    return data


# ─── Manual food log data factory ─────────────────────────────────────────────

def make_manual_food_data(**overrides) -> dict:
    """Return a valid manual food log payload."""
    data = {
        "food_name": "Grilled Chicken",
        "calories": 350.0,
        "carbs_g": 0.0,
        "protein_g": 50.0,
        "fats_g": 10.0,
        "meal_type": "lunch",
    }
    data.update(overrides)
    return data


# ─── Subscription data factory ────────────────────────────────────────────────

def make_subscription_data(**overrides) -> dict:
    """Return a valid subscription creation payload."""
    data = {
        "plan": "monthly",
        "store": "apple",
        "price_paid": 9.99,
    }
    data.update(overrides)
    return data
