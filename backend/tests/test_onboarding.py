"""
Onboarding endpoint tests.

Covers:
- POST /api/onboarding/save-step   — partial update, create new profile
- POST /api/onboarding/complete    — validate required fields, calculate plan
- GET  /api/onboarding/profile     — read profile, 404 if missing
- Validation errors: negative height, invalid workouts, missing required fields
- Nutrition plan calculation correctness
"""
import pytest
from httpx import AsyncClient

from tests.conftest import (
    create_user_and_get_headers,
    make_onboarding_step_data,
    make_onboarding_complete_data,
)


@pytest.mark.asyncio
class TestSaveOnboardingStep:

    async def test_save_step_creates_profile(self, client: AsyncClient):
        headers, user_id = await create_user_and_get_headers(
            client, email="ob_step1@example.com"
        )
        resp = await client.post(
            "/api/onboarding/save-step",
            json={"gender": "male"},
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["gender"] == "male"
        assert data["user_id"] == user_id

    async def test_save_step_partial_update(self, client: AsyncClient):
        """Second save-step merges with existing profile."""
        headers, _ = await create_user_and_get_headers(
            client, email="ob_step2@example.com"
        )
        # First step: save gender
        await client.post(
            "/api/onboarding/save-step",
            json={"gender": "female"},
            headers=headers,
        )
        # Second step: save workouts (gender should persist)
        resp = await client.post(
            "/api/onboarding/save-step",
            json={"workouts_per_week": 5},
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["gender"] == "female"
        assert data["workouts_per_week"] == 5

    async def test_save_step_overwrites_previous_value(self, client: AsyncClient):
        headers, _ = await create_user_and_get_headers(
            client, email="ob_step3@example.com"
        )
        await client.post(
            "/api/onboarding/save-step",
            json={"goal": "lose"},
            headers=headers,
        )
        resp = await client.post(
            "/api/onboarding/save-step",
            json={"goal": "gain"},
            headers=headers,
        )
        assert resp.json()["goal"] == "gain"

    async def test_save_step_requires_auth(self, client: AsyncClient):
        resp = await client.post(
            "/api/onboarding/save-step",
            json={"gender": "male"},
        )
        assert resp.status_code in (401, 403)

    async def test_save_step_with_all_fields(self, client: AsyncClient):
        headers, _ = await create_user_and_get_headers(
            client, email="ob_step_all@example.com"
        )
        payload = make_onboarding_step_data(
            height_cm=175.0,
            weight_kg=80.0,
            goal="lose",
            diet_type="Vegan",
            notifications_enabled=True,
        )
        resp = await client.post(
            "/api/onboarding/save-step",
            json=payload,
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["height_cm"] == 175.0
        assert data["diet_type"] == "Vegan"


@pytest.mark.asyncio
class TestCompleteOnboarding:

    async def test_complete_onboarding_success(self, client: AsyncClient):
        headers, user_id = await create_user_and_get_headers(
            client, email="ob_complete@example.com"
        )
        payload = make_onboarding_complete_data()
        resp = await client.post(
            "/api/onboarding/complete",
            json=payload,
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["completed_at"] is not None
        assert data["daily_calories"] is not None
        assert data["daily_calories"] >= 1200  # Minimum enforced
        assert data["daily_protein_g"] is not None
        assert data["daily_carbs_g"] is not None
        assert data["daily_fats_g"] is not None
        assert data["health_score"] is not None

    async def test_complete_onboarding_calculates_correct_plan(self, client: AsyncClient):
        """Male, 175cm, 80kg, 30 years, 3 workouts, goal=lose, speed=0.8."""
        headers, _ = await create_user_and_get_headers(
            client, email="ob_plan@example.com"
        )
        payload = make_onboarding_complete_data(
            gender="male",
            height_cm=175.0,
            weight_kg=80.0,
            birth_date="1996-06-15",
            workouts_per_week=3,
            goal="lose",
            weekly_speed_kg=0.8,
        )
        resp = await client.post(
            "/api/onboarding/complete",
            json=payload,
            headers=headers,
        )
        data = resp.json()
        # Should have a reasonable calorie count
        assert 1200 <= data["daily_calories"] <= 3500
        # Protein should be positive and reasonable
        assert data["daily_protein_g"] > 0
        assert data["health_score"] > 0

    async def test_complete_onboarding_missing_required_field(self, client: AsyncClient):
        headers, _ = await create_user_and_get_headers(
            client, email="ob_missing@example.com"
        )
        # Missing 'gender' which is required in OnboardingComplete
        payload = {
            "workouts_per_week": 3,
            "height_cm": 175.0,
            "weight_kg": 80.0,
            "birth_date": "1990-06-15",
            "goal": "lose",
            "target_weight_kg": 72.0,
            "diet_type": "Classic",
        }
        resp = await client.post(
            "/api/onboarding/complete",
            json=payload,
            headers=headers,
        )
        assert resp.status_code == 422  # Validation error

    async def test_complete_onboarding_negative_height(self, client: AsyncClient):
        headers, _ = await create_user_and_get_headers(
            client, email="ob_neg_h@example.com"
        )
        payload = make_onboarding_complete_data(height_cm=-10.0)
        resp = await client.post(
            "/api/onboarding/complete",
            json=payload,
            headers=headers,
        )
        assert resp.status_code == 422

    async def test_complete_onboarding_negative_weight(self, client: AsyncClient):
        headers, _ = await create_user_and_get_headers(
            client, email="ob_neg_w@example.com"
        )
        payload = make_onboarding_complete_data(weight_kg=-5.0)
        resp = await client.post(
            "/api/onboarding/complete",
            json=payload,
            headers=headers,
        )
        assert resp.status_code == 422

    async def test_complete_onboarding_workouts_out_of_range(self, client: AsyncClient):
        headers, _ = await create_user_and_get_headers(
            client, email="ob_wk_bad@example.com"
        )
        payload = make_onboarding_complete_data(workouts_per_week=20)
        resp = await client.post(
            "/api/onboarding/complete",
            json=payload,
            headers=headers,
        )
        assert resp.status_code == 422

    async def test_complete_onboarding_requires_auth(self, client: AsyncClient):
        resp = await client.post(
            "/api/onboarding/complete",
            json=make_onboarding_complete_data(),
        )
        assert resp.status_code in (401, 403)

    async def test_complete_onboarding_for_female(self, client: AsyncClient):
        """Female produces lower calories than male (same inputs)."""
        headers_m, _ = await create_user_and_get_headers(
            client, email="ob_male@example.com"
        )
        headers_f, _ = await create_user_and_get_headers(
            client, email="ob_female@example.com"
        )

        base = make_onboarding_complete_data(
            height_cm=170.0, weight_kg=70.0, birth_date="1990-01-01",
            workouts_per_week=3, goal="lose", weekly_speed_kg=0.8,
        )

        resp_m = await client.post(
            "/api/onboarding/complete",
            json={**base, "gender": "male"},
            headers=headers_m,
        )
        resp_f = await client.post(
            "/api/onboarding/complete",
            json={**base, "gender": "female"},
            headers=headers_f,
        )

        assert resp_m.json()["daily_calories"] > resp_f.json()["daily_calories"]


@pytest.mark.asyncio
class TestGetOnboardingProfile:

    async def test_get_profile_after_save(self, client: AsyncClient):
        headers, user_id = await create_user_and_get_headers(
            client, email="ob_get@example.com"
        )
        await client.post(
            "/api/onboarding/save-step",
            json={"gender": "male", "goal": "maintain"},
            headers=headers,
        )
        resp = await client.get("/api/onboarding/profile", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["gender"] == "male"
        assert data["goal"] == "maintain"
        assert data["user_id"] == user_id

    async def test_get_profile_404_when_none(self, client: AsyncClient):
        headers, _ = await create_user_and_get_headers(
            client, email="ob_no_profile@example.com"
        )
        resp = await client.get("/api/onboarding/profile", headers=headers)
        assert resp.status_code == 404

    async def test_get_profile_requires_auth(self, client: AsyncClient):
        resp = await client.get("/api/onboarding/profile")
        assert resp.status_code in (401, 403)
