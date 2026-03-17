"""
Pytest configuration and fixtures for testing.
Provides SQLite in-memory DB fixtures and helpers for API integration tests.
"""
import os
import pytest
from datetime import date
from sqlmodel import Session, create_engine, SQLModel
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

# Set test environment before importing app modules
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from app.core.database import get_session
from app.core.security import get_password_hash
from app.main import app
from app.models.user import User, UserCreate
from app.models.activity import Activity
from app.models.food import Food
from app.models.meal_log import MealLog
from app.models.daily_nutrition_summary import DailyNutritionSummary
from app.models.nutrition_profile import UserNutritionProfile


@pytest.fixture(name="engine")
def engine_fixture():
    """Create an in-memory SQLite engine for testing."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    return engine


@pytest.fixture(name="session")
def session_fixture(engine):
    """Create a new database session for a test."""
    with Session(engine) as session:
        yield session


@pytest.fixture(name="client")
def client_fixture(engine):
    """Create a FastAPI TestClient with overridden DB session."""

    def get_session_override():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = get_session_override
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


@pytest.fixture(name="test_user")
def test_user_fixture(session: Session) -> User:
    """Create a test user in the database."""
    user = User(
        email="test@example.com",
        first_name="Test",
        last_name="User",
        hashed_password=get_password_hash("testpassword123"),
        is_active=True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@pytest.fixture(name="test_food")
def test_food_fixture(session: Session) -> Food:
    """Create a test food item in the database."""
    food = Food(
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
    session.add(food)
    session.commit()
    session.refresh(food)
    return food


@pytest.fixture(name="second_food")
def second_food_fixture(session: Session) -> Food:
    """Create a second test food item."""
    food = Food(
        name="Brown Rice",
        brand="Generic",
        serving_size=100.0,
        serving_unit="g",
        calories=112.0,
        protein_g=2.6,
        carbs_g=23.5,
        fat_g=0.9,
        fiber_g=1.8,
        sugar_g=0.4,
        is_verified=True,
    )
    session.add(food)
    session.commit()
    session.refresh(food)
    return food


@pytest.fixture(name="auth_headers")
def auth_headers_fixture(client: TestClient) -> dict:
    """Register a user and return auth headers with a valid token."""
    # Register user
    client.post(
        "/auth/register",
        json={
            "email": "auth@example.com",
            "first_name": "Auth",
            "last_name": "User",
            "password": "authpassword123",
        },
    )
    # Login
    response = client.post(
        "/auth/login",
        data={"username": "auth@example.com", "password": "authpassword123"},
    )
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(name="auth_client_with_food")
def auth_client_with_food_fixture(client: TestClient, engine) -> tuple:
    """Register user, login, and create a food item. Returns (headers, food_id)."""
    # Register
    client.post(
        "/auth/register",
        json={
            "email": "mealuser@example.com",
            "first_name": "Meal",
            "last_name": "User",
            "password": "mealpassword123",
        },
    )
    # Login
    login_resp = client.post(
        "/auth/login",
        data={"username": "mealuser@example.com", "password": "mealpassword123"},
    )
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Create food directly in DB
    with Session(engine) as session:
        food = Food(
            name="Test Chicken",
            brand="Test Brand",
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
        session.add(food)
        session.commit()
        session.refresh(food)
        food_id = food.id

    return headers, food_id
