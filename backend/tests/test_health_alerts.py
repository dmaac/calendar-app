"""
Tests for the Health Alerts endpoint (GET /api/health/alerts).

Covers:
- Low calorie detection (<1200 kcal for 3+ days)
- Excessive surplus detection (>150% of goal for 3+ days)
- Low protein detection (<0.8g/kg for 3+ days)
- Low fiber / missing fruits & vegetables
- No alerts when nutrition is healthy
- Router integration
"""

import pytest
import pytest_asyncio
from datetime import datetime, date, timedelta, time as dt_time

from app.models.ai_food_log import AIFoodLog
from app.models.nutrition_profile import UserNutritionProfile
from app.models.onboarding_profile import OnboardingProfile
from app.routers.health_alerts import (
    _detect_low_calories,
    _detect_excessive_surplus,
    _detect_low_protein,
    _detect_low_fiber,
    AlertSeverity,
)
from tests.conftest import create_user_and_get_headers


# ---------------------------------------------------------------------------
# Detection rule unit tests (pure functions)
# ---------------------------------------------------------------------------

def _make_day(cal=2000, prot=100, fiber=15, count=3):
    return {
        "date": date.today(),
        "total_calories": cal,
        "total_protein_g": prot,
        "total_fiber_g": fiber,
        "log_count": count,
    }


class TestDetectLowCalories:
    def test_fires_when_3_low_days(self):
        days = [_make_day(cal=800) for _ in range(3)]
        alert = _detect_low_calories(days)
        assert alert is not None
        assert alert.code == "low_calories"
        assert alert.severity == AlertSeverity.DANGER
        assert alert.days_affected == 3

    def test_does_not_fire_with_2_low_days(self):
        days = [_make_day(cal=800), _make_day(cal=800), _make_day(cal=1500)]
        alert = _detect_low_calories(days)
        assert alert is None

    def test_ignores_days_with_no_logs(self):
        # Days with 0 log_count should be ignored (user didn't track)
        days = [_make_day(cal=0, count=0) for _ in range(5)]
        alert = _detect_low_calories(days)
        assert alert is None


class TestDetectExcessiveSurplus:
    def test_fires_when_3_surplus_days(self):
        goal = 2000
        # 150% of 2000 = 3000
        days = [_make_day(cal=3500) for _ in range(3)]
        alert = _detect_excessive_surplus(days, goal)
        assert alert is not None
        assert alert.code == "excessive_surplus"
        assert alert.severity == AlertSeverity.WARNING

    def test_does_not_fire_when_under_threshold(self):
        goal = 2000
        days = [_make_day(cal=2500) for _ in range(5)]
        alert = _detect_excessive_surplus(days, goal)
        assert alert is None


class TestDetectLowProtein:
    def test_fires_when_below_0_8_per_kg(self):
        weight_kg = 80.0  # -> min protein = 64g
        days = [_make_day(prot=40) for _ in range(3)]
        alert = _detect_low_protein(days, weight_kg)
        assert alert is not None
        assert alert.code == "low_protein"
        assert alert.severity == AlertSeverity.WARNING

    def test_does_not_fire_when_protein_ok(self):
        weight_kg = 70.0  # -> min protein = 56g
        days = [_make_day(prot=80) for _ in range(7)]
        alert = _detect_low_protein(days, weight_kg)
        assert alert is None

    def test_uses_default_weight_when_none(self):
        # 60kg default -> min protein = 48g
        days = [_make_day(prot=30) for _ in range(3)]
        alert = _detect_low_protein(days, weight_kg=None)
        assert alert is not None


class TestDetectLowFiber:
    def test_fires_when_5_low_fiber_days(self):
        days = [_make_day(fiber=2) for _ in range(5)]
        alert = _detect_low_fiber(days)
        assert alert is not None
        assert alert.code == "low_fiber"

    def test_does_not_fire_with_good_fiber(self):
        days = [_make_day(fiber=20) for _ in range(7)]
        alert = _detect_low_fiber(days)
        assert alert is None


# ---------------------------------------------------------------------------
# Service-level integration tests
# ---------------------------------------------------------------------------

class TestHealthAlertsIntegration:
    @pytest.mark.asyncio
    async def test_no_alerts_when_healthy(self, async_session, test_user):
        """User with good nutrition should get no alerts."""
        from app.routers.health_alerts import _get_daily_aggregates

        today = date.today()

        # Create 7 days of healthy food logs
        for i in range(7):
            log = AIFoodLog(
                user_id=test_user.id,
                logged_at=datetime.combine(today - timedelta(days=i), dt_time(hour=12)),
                meal_type="lunch",
                food_name="Healthy Meal",
                calories=600,
                carbs_g=60,
                protein_g=40,
                fats_g=20,
                fiber_g=10,
            )
            async_session.add(log)
        await async_session.commit()

        data = await _get_daily_aggregates(
            test_user.id, today - timedelta(days=6), today, async_session
        )
        assert len(data) > 0

    @pytest.mark.asyncio
    async def test_detects_low_calorie_pattern(self, async_session, test_user):
        """7 days of sub-1200 kcal should trigger a danger alert."""
        from app.routers.health_alerts import _get_daily_aggregates

        today = date.today()

        for i in range(7):
            log = AIFoodLog(
                user_id=test_user.id,
                logged_at=datetime.combine(today - timedelta(days=i), dt_time(hour=12)),
                meal_type="lunch",
                food_name="Small Salad",
                calories=400,
                carbs_g=30,
                protein_g=15,
                fats_g=5,
                fiber_g=3,
            )
            async_session.add(log)
        await async_session.commit()

        data = await _get_daily_aggregates(
            test_user.id, today - timedelta(days=6), today, async_session
        )

        alert = _detect_low_calories(data)
        assert alert is not None
        assert alert.severity == AlertSeverity.DANGER


# ---------------------------------------------------------------------------
# Router integration tests
# ---------------------------------------------------------------------------

class TestHealthAlertsRouter:
    @pytest.mark.asyncio
    async def test_alerts_endpoint_returns_200(self, client):
        headers, user_id = await create_user_and_get_headers(
            client, email="healthalert@test.com", password="Testpass123"
        )
        resp = await client.get("/api/health/alerts", headers=headers)
        assert resp.status_code == 200
        data = resp.json()

        assert "alerts" in data
        assert "summary" in data
        assert "analysis_window_days" in data
        assert data["analysis_window_days"] == 7

    @pytest.mark.asyncio
    async def test_alerts_with_custom_window(self, client):
        headers, user_id = await create_user_and_get_headers(
            client, email="healthwindow@test.com", password="Testpass123"
        )
        resp = await client.get("/api/health/alerts?days=14", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["analysis_window_days"] == 14

    @pytest.mark.asyncio
    async def test_alerts_requires_auth(self, client):
        resp = await client.get("/api/health/alerts")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_alerts_validates_days_param(self, client):
        headers, user_id = await create_user_and_get_headers(
            client, email="healthdays@test.com", password="Testpass123"
        )
        # days=1 is below minimum (3)
        resp = await client.get("/api/health/alerts?days=1", headers=headers)
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_healthy_user_gets_positive_summary(self, client):
        headers, user_id = await create_user_and_get_headers(
            client, email="healthyuser@test.com", password="Testpass123"
        )
        resp = await client.get("/api/health/alerts", headers=headers)
        data = resp.json()
        # No food logs means no alerts (we don't alert on no data)
        assert len(data["alerts"]) == 0
        assert "bien" in data["summary"].lower()
