"""
Tests for the Adaptive Calorie Target system.

Covers:
  - Weight logging (create, update, history)
  - BMR/TDEE calculations
  - Predicted weight calculation
  - Adjustment rules (losing too fast, on track, stalled, gain goals)
  - Safety limits (BMR floor, max deficit)
  - API endpoints (GET/POST adaptive-target, weight)
"""
import pytest
import pytest_asyncio
from datetime import date, datetime, timedelta
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.calorie_adjustment import (
    CalorieAdjustment,
    WeightLog,
    WeightLogCreate,
    AdjustmentReason,
    WeightTrend,
)
from app.models.nutrition_profile import (
    UserNutritionProfile,
    Gender,
    ActivityLevel,
    NutritionGoal,
)
from app.models.ai_food_log import AIFoodLog
from app.models.user import User
from app.services.adaptive_calorie_service import AdaptiveCalorieService

from .conftest import create_user_and_get_headers


# ─── Unit tests for calculation logic ──────────────────────────────────────────


class TestBMRCalculation:
    """Test Mifflin-St Jeor BMR calculations."""

    def test_male_bmr(self):
        svc = AdaptiveCalorieService.__new__(AdaptiveCalorieService)
        bmr = svc._calculate_bmr(80.0, 175.0, 30, "male")
        # 10*80 + 6.25*175 - 5*30 + 5 = 800 + 1093.75 - 150 + 5 = 1748.75
        assert abs(bmr - 1748.75) < 0.01

    def test_female_bmr(self):
        svc = AdaptiveCalorieService.__new__(AdaptiveCalorieService)
        bmr = svc._calculate_bmr(65.0, 165.0, 28, "female")
        # 10*65 + 6.25*165 - 5*28 - 161 = 650 + 1031.25 - 140 - 161 = 1380.25
        assert abs(bmr - 1380.25) < 0.01

    def test_other_gender_uses_female_formula(self):
        svc = AdaptiveCalorieService.__new__(AdaptiveCalorieService)
        bmr_other = svc._calculate_bmr(70.0, 170.0, 30, "other")
        bmr_female = svc._calculate_bmr(70.0, 170.0, 30, "female")
        assert bmr_other == bmr_female


class TestTDEECalculation:
    """Test TDEE = BMR * activity multiplier."""

    def test_sedentary_multiplier(self):
        svc = AdaptiveCalorieService.__new__(AdaptiveCalorieService)
        tdee = svc._calculate_tdee(80.0, 175.0, 30, "male", "sedentary")
        bmr = svc._calculate_bmr(80.0, 175.0, 30, "male")
        assert abs(tdee - bmr * 1.2) < 0.01

    def test_very_active_multiplier(self):
        svc = AdaptiveCalorieService.__new__(AdaptiveCalorieService)
        tdee = svc._calculate_tdee(80.0, 175.0, 30, "male", "very_active")
        bmr = svc._calculate_bmr(80.0, 175.0, 30, "male")
        assert abs(tdee - bmr * 1.725) < 0.01

    def test_default_multiplier_for_unknown(self):
        svc = AdaptiveCalorieService.__new__(AdaptiveCalorieService)
        tdee = svc._calculate_tdee(80.0, 175.0, 30, "male", "unknown_level")
        bmr = svc._calculate_bmr(80.0, 175.0, 30, "male")
        assert abs(tdee - bmr * 1.55) < 0.01


class TestPredictedWeight:
    """Test predicted weight based on calorie balance."""

    def test_deficit_causes_weight_loss(self):
        svc = AdaptiveCalorieService.__new__(AdaptiveCalorieService)
        # 500 kcal/day deficit for 7 days = 3500 kcal = ~0.45 kg loss
        predicted = svc.calculate_predicted_weight(
            starting_weight=80.0,
            avg_daily_calories=2000.0,
            tdee=2500.0,
            days=7,
        )
        assert predicted < 80.0
        expected = 80.0 + (-500 * 7 / 7700)
        assert abs(predicted - expected) < 0.01

    def test_surplus_causes_weight_gain(self):
        svc = AdaptiveCalorieService.__new__(AdaptiveCalorieService)
        predicted = svc.calculate_predicted_weight(
            starting_weight=70.0,
            avg_daily_calories=3000.0,
            tdee=2500.0,
            days=7,
        )
        assert predicted > 70.0

    def test_maintenance_keeps_weight_stable(self):
        svc = AdaptiveCalorieService.__new__(AdaptiveCalorieService)
        predicted = svc.calculate_predicted_weight(
            starting_weight=75.0,
            avg_daily_calories=2500.0,
            tdee=2500.0,
            days=7,
        )
        assert abs(predicted - 75.0) < 0.01


class TestSafetyLimits:
    """Test calorie target clamping (BMR floor, max deficit)."""

    def test_never_below_bmr(self):
        svc = AdaptiveCalorieService.__new__(AdaptiveCalorieService)
        bmr = 1500.0
        tdee = 2500.0
        result = svc._clamp_target(1200, bmr=bmr, tdee=tdee, gender="male")
        assert result >= bmr

    def test_never_below_clinical_minimum_male(self):
        svc = AdaptiveCalorieService.__new__(AdaptiveCalorieService)
        result = svc._clamp_target(1000, bmr=1200.0, tdee=2000.0, gender="male")
        assert result >= 1500

    def test_never_below_clinical_minimum_female(self):
        svc = AdaptiveCalorieService.__new__(AdaptiveCalorieService)
        result = svc._clamp_target(900, bmr=1100.0, tdee=1800.0, gender="female")
        assert result >= 1200

    def test_max_deficit_25_percent(self):
        svc = AdaptiveCalorieService.__new__(AdaptiveCalorieService)
        tdee = 2800.0
        # 25% deficit = 2100 floor
        result = svc._clamp_target(1800, bmr=1600.0, tdee=tdee, gender="male")
        assert result >= tdee * 0.75


class TestAdjustmentRules:
    """Test the core adjustment rule engine."""

    def _make_service(self):
        return AdaptiveCalorieService.__new__(AdaptiveCalorieService)

    def _make_weight_entries(self, start_weight, weekly_change, weeks):
        entries = []
        for i in range(weeks):
            for day in range(7):
                d = date.today() - timedelta(weeks=weeks - i) + timedelta(days=day)
                w = start_weight + weekly_change * i + (day * weekly_change / 7)
                entry = WeightLog(
                    user_id=1,
                    date=d,
                    weight_kg=round(w, 1),
                    source="manual",
                )
                entries.append(entry)
        return entries

    def test_losing_too_fast_triggers_increase(self):
        svc = self._make_service()
        # Losing 1.5% bodyweight/week at 80kg = 1.2 kg/week
        entries = self._make_weight_entries(82.4, -1.2, 2)
        trend, reason, adj, text = svc._apply_adjustment_rules(
            goal="lose_weight",
            actual_weekly_change=-1.2,
            weekly_loss_pct=1.5,
            weight_entries=entries,
            current_target=1800,
            bmr=1600,
            tdee=2500,
            days_elapsed=14,
        )
        assert trend == WeightTrend.LOSING_TOO_FAST.value
        assert reason == AdjustmentReason.LOSING_TOO_FAST.value
        assert adj > 0  # Calories should increase

    def test_on_track_loss_no_adjustment(self):
        svc = self._make_service()
        # Losing 0.7% bodyweight/week at 80kg = 0.56 kg/week
        entries = self._make_weight_entries(80.56, -0.56, 2)
        trend, reason, adj, text = svc._apply_adjustment_rules(
            goal="lose_weight",
            actual_weekly_change=-0.56,
            weekly_loss_pct=0.7,
            weight_entries=entries,
            current_target=2000,
            bmr=1600,
            tdee=2500,
            days_elapsed=14,
        )
        assert trend == WeightTrend.LOSING_ON_TRACK.value
        assert reason == AdjustmentReason.ON_TRACK.value
        assert adj == 0

    def test_not_losing_triggers_decrease(self):
        svc = self._make_service()
        # Weight stable at 80kg for 3+ weeks with loss goal
        entries = self._make_weight_entries(80.0, 0.0, 3)
        trend, reason, adj, text = svc._apply_adjustment_rules(
            goal="lose_weight",
            actual_weekly_change=0.0,
            weekly_loss_pct=0.0,
            weight_entries=entries,
            current_target=2200,
            bmr=1600,
            tdee=2500,
            days_elapsed=21,
        )
        assert reason == AdjustmentReason.NOT_LOSING.value
        assert adj < 0  # Calories should decrease

    def test_gaining_too_fast_triggers_decrease(self):
        svc = self._make_service()
        entries = self._make_weight_entries(70.0, 0.8, 2)
        trend, reason, adj, text = svc._apply_adjustment_rules(
            goal="gain_muscle",
            actual_weekly_change=0.8,
            weekly_loss_pct=1.14,  # 0.8/70*100
            weight_entries=entries,
            current_target=3000,
            bmr=1700,
            tdee=2600,
            days_elapsed=14,
        )
        assert trend == WeightTrend.GAINING_TOO_FAST.value
        assert adj < 0  # Decrease to slow gain

    def test_maintenance_stable_no_adjustment(self):
        svc = self._make_service()
        entries = self._make_weight_entries(75.0, 0.0, 2)
        trend, reason, adj, text = svc._rules_for_maintenance(
            weekly_change=0.1,
            weekly_loss_pct=0.13,
            entries=entries,
            current_target=2500,
            bmr=1600,
            tdee=2500,
        )
        assert reason == AdjustmentReason.ON_TRACK.value
        assert adj == 0


# ─── Integration tests (API endpoints) ────────────────────────────────────────


@pytest.mark.asyncio
async def test_log_weight_creates_entry(client, auth_user_and_headers):
    """POST /api/nutrition/weight creates a weight entry."""
    headers, user_id = auth_user_and_headers

    resp = await client.post(
        "/api/nutrition/weight",
        json={"weight_kg": 78.5, "source": "manual"},
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["weight_kg"] == 78.5
    assert data["source"] == "manual"
    assert data["date"] == date.today().isoformat()


@pytest.mark.asyncio
async def test_log_weight_replaces_same_day(client, auth_user_and_headers):
    """POST /api/nutrition/weight on same day updates instead of duplicating."""
    headers, user_id = auth_user_and_headers

    resp1 = await client.post(
        "/api/nutrition/weight",
        json={"weight_kg": 78.5},
        headers=headers,
    )
    assert resp1.status_code == 201

    resp2 = await client.post(
        "/api/nutrition/weight",
        json={"weight_kg": 79.0},
        headers=headers,
    )
    assert resp2.status_code == 201
    assert resp2.json()["weight_kg"] == 79.0

    # Get history — should only have 1 entry for today
    history_resp = await client.get(
        "/api/nutrition/weight?days=7",
        headers=headers,
    )
    entries = history_resp.json()
    today_entries = [e for e in entries if e["date"] == date.today().isoformat()]
    assert len(today_entries) == 1
    assert today_entries[0]["weight_kg"] == 79.0


@pytest.mark.asyncio
async def test_weight_history_returns_sorted(client, auth_user_and_headers):
    """GET /api/nutrition/weight returns entries sorted by date."""
    headers, user_id = auth_user_and_headers

    # Log weights for 3 different dates
    for i in range(3):
        d = (date.today() - timedelta(days=2 - i)).isoformat()
        await client.post(
            "/api/nutrition/weight",
            json={"weight_kg": 78.0 + i * 0.5, "date": d},
            headers=headers,
        )

    resp = await client.get("/api/nutrition/weight?days=7", headers=headers)
    assert resp.status_code == 200
    entries = resp.json()
    assert len(entries) >= 3
    # Check sorted ascending
    dates = [e["date"] for e in entries]
    assert dates == sorted(dates)


@pytest.mark.asyncio
async def test_adaptive_target_insufficient_data(client, auth_user_and_headers):
    """GET /api/nutrition/adaptive-target with no weight data returns insufficient_data."""
    headers, user_id = auth_user_and_headers

    resp = await client.get("/api/nutrition/adaptive-target", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["reason_code"] == "insufficient_data"
    assert data["adjustment"] == 0


@pytest.mark.asyncio
async def test_adaptive_target_with_data(client, auth_user_and_headers):
    """GET /api/nutrition/adaptive-target with weight data returns a recommendation."""
    headers, user_id = auth_user_and_headers

    # Create nutrition profile
    await client.post(
        "/nutrition-profile/",
        json={
            "height_cm": 175,
            "weight_kg": 80,
            "age": 30,
            "gender": "male",
            "activity_level": "moderately_active",
            "goal": "lose_weight",
        },
        headers=headers,
    )

    # Log weight entries (2 weeks)
    for i in range(14):
        d = (date.today() - timedelta(days=13 - i)).isoformat()
        await client.post(
            "/api/nutrition/weight",
            json={"weight_kg": 80.0 - (i * 0.05), "date": d},
            headers=headers,
        )

    resp = await client.get("/api/nutrition/adaptive-target", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "current_target" in data
    assert "recommended_target" in data
    assert "reason" in data
    assert "trend" in data
    assert "bmr" in data
    assert data["bmr"] is not None


@pytest.mark.asyncio
async def test_adjustment_history_empty_initially(client, auth_user_and_headers):
    """GET /api/nutrition/adaptive-target/history returns empty list initially."""
    headers, user_id = auth_user_and_headers

    resp = await client.get(
        "/api/nutrition/adaptive-target/history",
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_dismiss_adjustment_no_pending(client, auth_user_and_headers):
    """POST /api/nutrition/adaptive-target/dismiss with no pending returns failure."""
    headers, user_id = auth_user_and_headers

    resp = await client.post(
        "/api/nutrition/adaptive-target/dismiss",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is False


@pytest.mark.asyncio
async def test_weight_chart_data(client, auth_user_and_headers):
    """GET /api/nutrition/weight/chart returns chart data structure."""
    headers, user_id = auth_user_and_headers

    resp = await client.get(
        "/api/nutrition/weight/chart?weeks=4",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "entries" in data
    assert "predicted_entries" in data
    assert "current_weight" in data
    assert "target_weight" in data


@pytest.mark.asyncio
async def test_unauthenticated_returns_401(client):
    """All endpoints require authentication."""
    endpoints = [
        ("GET", "/api/nutrition/weight"),
        ("POST", "/api/nutrition/weight"),
        ("GET", "/api/nutrition/adaptive-target"),
        ("POST", "/api/nutrition/adaptive-target/apply"),
        ("POST", "/api/nutrition/adaptive-target/dismiss"),
        ("GET", "/api/nutrition/adaptive-target/history"),
        ("GET", "/api/nutrition/weight/chart"),
    ]
    for method, path in endpoints:
        if method == "GET":
            resp = await client.get(path)
        else:
            resp = await client.post(path)
        assert resp.status_code == 401, f"{method} {path} should return 401"
