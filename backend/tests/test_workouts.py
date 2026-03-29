"""
Tests for the Workouts endpoints (/api/workouts/*).

Covers:
- POST   /api/workouts/              -- log a workout
- GET    /api/workouts/              -- list workouts (with date filters)
- GET    /api/workouts/summary       -- summary stats
- GET    /api/workouts/estimate-calories -- MET-based calorie estimation
- DELETE /api/workouts/{workout_id}  -- delete a workout
- Auth required (401/403 without token)
- Input validation (422)
- Edge cases (empty data, other user's data)
"""

import pytest
from datetime import datetime, date, timedelta, time as dt_time, timezone

from app.models.user import User
from app.models.workout import WorkoutLog, WorkoutType
from app.models.onboarding_profile import OnboardingProfile
from app.core.security import create_access_token
from app.services.workout_service import estimate_calories


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _create_user_direct(async_session, email="workout@test.com") -> tuple[User, dict]:
    """Insert a user directly into the DB and return (user, auth_headers).

    Bypasses /auth/register to avoid passlib/bcrypt version issues.
    """
    user = User(
        email=email,
        first_name="Test",
        last_name="User",
        hashed_password="not-a-real-hash",
        is_active=True,
        provider="email",
        is_premium=False,
    )
    async_session.add(user)
    await async_session.commit()
    await async_session.refresh(user)
    token = create_access_token(data={"sub": user.email})
    headers = {"Authorization": f"Bearer {token}"}
    return user, headers


def _make_workout_payload(**overrides):
    """Return a valid workout creation payload."""
    data = {
        "workout_type": "cardio",
        "duration_min": 30,
    }
    data.update(overrides)
    return data


async def _create_workouts_via_api(client, headers, count=3):
    """Create workout entries through the API and return their IDs."""
    ids = []
    for i in range(count):
        resp = await client.post(
            "/api/workouts/",
            json={
                "workout_type": "cardio",
                "duration_min": 20 + i * 10,
                "calories_burned": 200 + i * 50,
                "notes": f"Workout {i}",
            },
            headers=headers,
        )
        assert resp.status_code == 201
        ids.append(resp.json()["id"])
    return ids


# ---------------------------------------------------------------------------
# Unit tests -- estimate_calories (pure function)
# ---------------------------------------------------------------------------

class TestEstimateCalories:
    def test_cardio_estimation(self):
        # MET 7.0 * 70kg * 0.5h = 245
        cal = estimate_calories(WorkoutType.CARDIO, 30, 70.0)
        assert cal == 245

    def test_strength_estimation(self):
        # MET 5.0 * 80kg * 1h = 400
        cal = estimate_calories(WorkoutType.STRENGTH, 60, 80.0)
        assert cal == 400

    def test_flexibility_estimation(self):
        # MET 3.0 * 60kg * 0.5h = 90
        cal = estimate_calories(WorkoutType.FLEXIBILITY, 30, 60.0)
        assert cal == 90

    def test_sports_estimation(self):
        # MET 6.0 * 75kg * (45/60)h = 337.5 -> 338
        cal = estimate_calories(WorkoutType.SPORTS, 45, 75.0)
        assert cal == 338

    def test_other_estimation(self):
        # MET 4.0 * 65kg * (20/60)h = 86.67 -> 87
        cal = estimate_calories(WorkoutType.OTHER, 20, 65.0)
        assert cal == 87

    def test_returns_integer(self):
        cal = estimate_calories(WorkoutType.CARDIO, 15, 55.0)
        assert isinstance(cal, int)


# ---------------------------------------------------------------------------
# POST /api/workouts/ -- log a workout
# ---------------------------------------------------------------------------

class TestLogWorkout:
    @pytest.mark.asyncio
    async def test_log_with_calories_provided(self, client, async_session):
        _, headers = await _create_user_direct(async_session, email="wlog1@test.com")

        resp = await client.post(
            "/api/workouts/",
            json=_make_workout_payload(calories_burned=350),
            headers=headers,
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["workout_type"] == "cardio"
        assert body["duration_min"] == 30
        assert body["calories_burned"] == 350
        assert "id" in body
        assert "created_at" in body

    @pytest.mark.asyncio
    async def test_log_auto_estimates_calories(self, client, async_session):
        """When calories_burned is omitted, the server auto-estimates via MET formula."""
        _, headers = await _create_user_direct(async_session, email="wlogauto@test.com")

        resp = await client.post(
            "/api/workouts/",
            json=_make_workout_payload(),  # no calories_burned
            headers=headers,
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["calories_burned"] is not None
        assert body["calories_burned"] > 0

    @pytest.mark.asyncio
    async def test_log_uses_user_weight_for_estimation(self, client, async_session):
        """If the user has an onboarding profile with weight, use it for MET estimation."""
        user, headers = await _create_user_direct(async_session, email="wlogweight@test.com")

        profile = OnboardingProfile(user_id=user.id, weight_kg=90.0)
        async_session.add(profile)
        await async_session.commit()

        resp = await client.post(
            "/api/workouts/",
            json=_make_workout_payload(workout_type="strength", duration_min=60),
            headers=headers,
        )
        assert resp.status_code == 201
        body = resp.json()
        # MET 5.0 * 90kg * 1h = 450
        assert body["calories_burned"] == 450

    @pytest.mark.asyncio
    async def test_log_all_workout_types(self, client, async_session):
        """All enum values should be accepted."""
        _, headers = await _create_user_direct(async_session, email="walltypes@test.com")

        for wtype in ["cardio", "strength", "flexibility", "sports", "other"]:
            resp = await client.post(
                "/api/workouts/",
                json=_make_workout_payload(workout_type=wtype),
                headers=headers,
            )
            assert resp.status_code == 201, f"Failed for workout_type={wtype}"
            assert resp.json()["workout_type"] == wtype

    @pytest.mark.asyncio
    async def test_log_with_notes(self, client, async_session):
        _, headers = await _create_user_direct(async_session, email="wlognotes@test.com")

        resp = await client.post(
            "/api/workouts/",
            json=_make_workout_payload(notes="Morning run in the park"),
            headers=headers,
        )
        assert resp.status_code == 201
        assert resp.json()["notes"] == "Morning run in the park"

    @pytest.mark.asyncio
    async def test_log_invalid_workout_type(self, client, async_session):
        _, headers = await _create_user_direct(async_session, email="wlogbadtype@test.com")

        resp = await client.post(
            "/api/workouts/",
            json=_make_workout_payload(workout_type="swimming"),
            headers=headers,
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_log_zero_duration_rejected(self, client, async_session):
        _, headers = await _create_user_direct(async_session, email="wlogzero@test.com")

        resp = await client.post(
            "/api/workouts/",
            json=_make_workout_payload(duration_min=0),
            headers=headers,
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_log_negative_duration_rejected(self, client, async_session):
        _, headers = await _create_user_direct(async_session, email="wlogneg@test.com")

        resp = await client.post(
            "/api/workouts/",
            json=_make_workout_payload(duration_min=-10),
            headers=headers,
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_log_negative_calories_rejected(self, client, async_session):
        _, headers = await _create_user_direct(async_session, email="wlognegcal@test.com")

        resp = await client.post(
            "/api/workouts/",
            json=_make_workout_payload(calories_burned=-100),
            headers=headers,
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_log_missing_required_fields(self, client, async_session):
        _, headers = await _create_user_direct(async_session, email="wlogmissing@test.com")

        resp = await client.post(
            "/api/workouts/",
            json={},
            headers=headers,
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_log_requires_auth(self, client):
        resp = await client.post(
            "/api/workouts/",
            json=_make_workout_payload(),
        )
        # POST without auth may return 401 (missing token) or 403 (CSRF)
        assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# GET /api/workouts/ -- list workouts
# ---------------------------------------------------------------------------

class TestListWorkouts:
    @pytest.mark.asyncio
    async def test_list_returns_user_workouts(self, client, async_session):
        _, headers = await _create_user_direct(async_session, email="wlist@test.com")
        # Seed via API to ensure data is visible across sessions
        await _create_workouts_via_api(client, headers, count=3)

        resp = await client.get("/api/workouts/", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 3

    @pytest.mark.asyncio
    async def test_list_empty_for_new_user(self, client, async_session):
        _, headers = await _create_user_direct(async_session, email="wlistempty@test.com")

        resp = await client.get("/api/workouts/", headers=headers)
        assert resp.status_code == 200
        assert resp.json() == []

    @pytest.mark.asyncio
    async def test_list_does_not_include_other_users(self, client, async_session):
        _, headers_a = await _create_user_direct(async_session, email="wlista@test.com")
        _, headers_b = await _create_user_direct(async_session, email="wlistb@test.com")

        await _create_workouts_via_api(client, headers_a, count=4)
        await _create_workouts_via_api(client, headers_b, count=2)

        resp_a = await client.get("/api/workouts/", headers=headers_a)
        resp_b = await client.get("/api/workouts/", headers=headers_b)

        assert len(resp_a.json()) == 4
        assert len(resp_b.json()) == 2

    @pytest.mark.asyncio
    async def test_list_requires_auth(self, client):
        resp = await client.get("/api/workouts/")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/workouts/summary -- summary stats
# ---------------------------------------------------------------------------

class TestWorkoutSummary:
    @pytest.mark.asyncio
    async def test_summary_with_workouts(self, client, async_session):
        _, headers = await _create_user_direct(async_session, email="wsum@test.com")
        await _create_workouts_via_api(client, headers, count=3)

        resp = await client.get("/api/workouts/summary", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "total_workouts" in data
        assert "total_duration_min" in data
        assert "total_calories" in data
        assert "avg_duration_min" in data
        assert data["total_workouts"] >= 1

    @pytest.mark.asyncio
    async def test_summary_empty_for_new_user(self, client, async_session):
        _, headers = await _create_user_direct(async_session, email="wsumempty@test.com")

        resp = await client.get("/api/workouts/summary", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_workouts"] == 0
        assert data["total_duration_min"] == 0
        assert data["total_calories"] == 0
        assert data["avg_duration_min"] == 0.0

    @pytest.mark.asyncio
    async def test_summary_validates_days_range(self, client, async_session):
        _, headers = await _create_user_direct(async_session, email="wsumvalid@test.com")

        resp_low = await client.get("/api/workouts/summary?days=0", headers=headers)
        assert resp_low.status_code == 422

        resp_high = await client.get("/api/workouts/summary?days=999", headers=headers)
        assert resp_high.status_code == 422

    @pytest.mark.asyncio
    async def test_summary_requires_auth(self, client):
        resp = await client.get("/api/workouts/summary")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/workouts/estimate-calories -- calorie estimation
# ---------------------------------------------------------------------------

class TestCalorieEstimate:
    @pytest.mark.asyncio
    async def test_estimate_returns_calculation(self, client, async_session):
        _, headers = await _create_user_direct(async_session, email="westimate@test.com")

        resp = await client.get(
            "/api/workouts/estimate-calories"
            "?workout_type=cardio&duration_min=30&weight_kg=70",
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "estimated_calories" in data
        assert data["estimated_calories"] == 245  # MET 7 * 70 * 0.5
        assert data["workout_type"] == "cardio"
        assert data["duration_min"] == 30

    @pytest.mark.asyncio
    async def test_estimate_missing_params(self, client, async_session):
        _, headers = await _create_user_direct(async_session, email="westmissing@test.com")

        resp = await client.get(
            "/api/workouts/estimate-calories?workout_type=cardio&duration_min=30",
            headers=headers,
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_estimate_invalid_workout_type(self, client, async_session):
        _, headers = await _create_user_direct(async_session, email="westbadtype@test.com")

        resp = await client.get(
            "/api/workouts/estimate-calories"
            "?workout_type=skydiving&duration_min=30&weight_kg=70",
            headers=headers,
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_estimate_zero_duration_rejected(self, client, async_session):
        _, headers = await _create_user_direct(async_session, email="westzerodur@test.com")

        resp = await client.get(
            "/api/workouts/estimate-calories"
            "?workout_type=cardio&duration_min=0&weight_kg=70",
            headers=headers,
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_estimate_zero_weight_rejected(self, client, async_session):
        _, headers = await _create_user_direct(async_session, email="westzerowt@test.com")

        resp = await client.get(
            "/api/workouts/estimate-calories"
            "?workout_type=cardio&duration_min=30&weight_kg=0",
            headers=headers,
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_estimate_requires_auth(self, client):
        resp = await client.get(
            "/api/workouts/estimate-calories"
            "?workout_type=cardio&duration_min=30&weight_kg=70",
        )
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# DELETE /api/workouts/{workout_id}
# ---------------------------------------------------------------------------

class TestDeleteWorkout:
    @pytest.mark.asyncio
    async def test_delete_own_workout(self, client, async_session):
        _, headers = await _create_user_direct(async_session, email="wdel@test.com")

        create_resp = await client.post(
            "/api/workouts/",
            json=_make_workout_payload(calories_burned=200),
            headers=headers,
        )
        workout_id = create_resp.json()["id"]

        del_resp = await client.delete(f"/api/workouts/{workout_id}", headers=headers)
        assert del_resp.status_code == 200
        assert "deleted" in del_resp.json()["message"].lower()

        # Verify it no longer appears in list
        list_resp = await client.get("/api/workouts/", headers=headers)
        ids = [w["id"] for w in list_resp.json()]
        assert workout_id not in ids

    @pytest.mark.asyncio
    async def test_delete_nonexistent_workout(self, client, async_session):
        _, headers = await _create_user_direct(async_session, email="wdelnone@test.com")

        resp = await client.delete("/api/workouts/99999", headers=headers)
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_cannot_delete_other_users_workout(self, client, async_session):
        _, headers_a = await _create_user_direct(async_session, email="wdela@test.com")
        _, headers_b = await _create_user_direct(async_session, email="wdelb@test.com")

        create_resp = await client.post(
            "/api/workouts/",
            json=_make_workout_payload(calories_burned=300),
            headers=headers_a,
        )
        workout_id = create_resp.json()["id"]

        del_resp = await client.delete(f"/api/workouts/{workout_id}", headers=headers_b)
        assert del_resp.status_code == 404

        # Verify it still exists for user A
        list_resp = await client.get("/api/workouts/", headers=headers_a)
        ids = [w["id"] for w in list_resp.json()]
        assert workout_id in ids

    @pytest.mark.asyncio
    async def test_delete_requires_auth(self, client):
        resp = await client.delete("/api/workouts/1")
        # DELETE without auth may return 401 or 403 (CSRF middleware)
        assert resp.status_code in (401, 403)
