"""
Tests for the Calorie Balance endpoint (GET /api/calories/net).

Covers:
- Consumed calories aggregation from AIFoodLog
- Burned calories from WorkoutLog (recorded + MET-estimated)
- Net calculation and deficit/surplus classification
- Goal retrieval fallback chain
- Router integration test
"""

import pytest
import pytest_asyncio
from datetime import datetime, date, timedelta, time as dt_time

from app.models.ai_food_log import AIFoodLog
from app.models.workout import WorkoutLog, WorkoutType
from app.models.nutrition_profile import (
    UserNutritionProfile,
    Gender,
    ActivityLevel,
    NutritionGoal,
)
from app.models.onboarding_profile import OnboardingProfile
from app.routers.calories import (
    _get_consumed_calories,
    _get_burned_calories,
    _get_calorie_goal,
    _get_user_weight,
)
from tests.conftest import create_user_and_get_headers


# ---------------------------------------------------------------------------
# Helper-level tests
# ---------------------------------------------------------------------------

class TestConsumedCalories:
    @pytest.mark.asyncio
    async def test_sums_food_logs_for_today(self, async_session, test_user):
        today = date.today()

        for cal in [300, 500, 200]:
            log = AIFoodLog(
                user_id=test_user.id,
                logged_at=datetime.combine(today, dt_time(hour=12)),
                meal_type="lunch",
                food_name="Food",
                calories=cal,
                carbs_g=10,
                protein_g=10,
                fats_g=5,
            )
            async_session.add(log)
        await async_session.commit()

        consumed = await _get_consumed_calories(test_user.id, today, async_session)
        assert consumed == 1000.0

    @pytest.mark.asyncio
    async def test_returns_zero_when_no_logs(self, async_session, test_user):
        consumed = await _get_consumed_calories(test_user.id, date.today(), async_session)
        assert consumed == 0.0


class TestBurnedCalories:
    @pytest.mark.asyncio
    async def test_uses_recorded_calories_when_available(self, async_session, test_user):
        today = date.today()
        workout = WorkoutLog(
            user_id=test_user.id,
            workout_type=WorkoutType.CARDIO,
            duration_min=30,
            calories_burned=350,
            created_at=datetime.combine(today, dt_time(hour=7)),
        )
        async_session.add(workout)
        await async_session.commit()

        burned = await _get_burned_calories(test_user.id, today, async_session, weight_kg=70.0)
        assert burned == 350.0

    @pytest.mark.asyncio
    async def test_estimates_with_met_when_no_calories(self, async_session, test_user):
        today = date.today()
        workout = WorkoutLog(
            user_id=test_user.id,
            workout_type=WorkoutType.CARDIO,
            duration_min=60,
            calories_burned=None,
            created_at=datetime.combine(today, dt_time(hour=7)),
        )
        async_session.add(workout)
        await async_session.commit()

        burned = await _get_burned_calories(test_user.id, today, async_session, weight_kg=70.0)
        # MET for cardio = 7.0, 70kg * 7.0 * 1.0 hour = 490
        assert burned == 490.0

    @pytest.mark.asyncio
    async def test_returns_zero_when_no_workouts(self, async_session, test_user):
        burned = await _get_burned_calories(test_user.id, date.today(), async_session)
        assert burned == 0.0


class TestCalorieGoal:
    @pytest.mark.asyncio
    async def test_uses_nutrition_profile(self, async_session, test_user):
        profile = UserNutritionProfile(
            user_id=test_user.id,
            target_calories=1800.0,
            target_protein_g=150.0,
            target_carbs_g=200.0,
            target_fat_g=60.0,
        )
        async_session.add(profile)
        await async_session.commit()

        goal = await _get_calorie_goal(test_user.id, async_session)
        assert goal == 1800.0

    @pytest.mark.asyncio
    async def test_falls_back_to_onboarding(self, async_session, test_user):
        profile = OnboardingProfile(
            user_id=test_user.id,
            daily_calories=2200,
        )
        async_session.add(profile)
        await async_session.commit()

        goal = await _get_calorie_goal(test_user.id, async_session)
        assert goal == 2200.0

    @pytest.mark.asyncio
    async def test_defaults_to_2000(self, async_session, test_user):
        goal = await _get_calorie_goal(test_user.id, async_session)
        assert goal == 2000.0


class TestUserWeight:
    @pytest.mark.asyncio
    async def test_returns_from_nutrition_profile(self, async_session, test_user):
        profile = UserNutritionProfile(
            user_id=test_user.id,
            weight_kg=80.0,
            target_calories=2000,
            target_protein_g=150,
            target_carbs_g=250,
            target_fat_g=65,
        )
        async_session.add(profile)
        await async_session.commit()

        weight = await _get_user_weight(test_user.id, async_session)
        assert weight == 80.0

    @pytest.mark.asyncio
    async def test_returns_none_when_no_data(self, async_session, test_user):
        weight = await _get_user_weight(test_user.id, async_session)
        assert weight is None


# ---------------------------------------------------------------------------
# Router integration tests
# ---------------------------------------------------------------------------

class TestCaloriesNetRouter:
    @pytest.mark.asyncio
    async def test_net_endpoint_returns_200(self, client):
        headers, user_id = await create_user_and_get_headers(
            client, email="calnet@test.com", password="Testpass123"
        )
        resp = await client.get("/api/calories/net", headers=headers)
        assert resp.status_code == 200
        data = resp.json()

        assert "consumed" in data
        assert "burned" in data
        assert "net" in data
        assert "goal" in data
        assert "remaining" in data
        assert "deficit_or_surplus" in data

    @pytest.mark.asyncio
    async def test_net_endpoint_with_date_param(self, client):
        headers, user_id = await create_user_and_get_headers(
            client, email="calnetdate@test.com", password="Testpass123"
        )
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        resp = await client.get(
            f"/api/calories/net?target_date={yesterday}",
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["date"] == yesterday

    @pytest.mark.asyncio
    async def test_net_endpoint_requires_auth(self, client):
        resp = await client.get("/api/calories/net")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_deficit_classification(self, client):
        headers, user_id = await create_user_and_get_headers(
            client, email="caldeficit@test.com", password="Testpass123"
        )
        # No food, no workouts -> 0 consumed, 0 burned -> net=0, goal=2000 -> deficit
        resp = await client.get("/api/calories/net", headers=headers)
        data = resp.json()
        assert data["deficit_or_surplus"] == "deficit"
