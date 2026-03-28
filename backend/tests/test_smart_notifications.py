"""
Tests for the Smart Notification Service and its router.

Covers:
- Meal-time prediction from historical log patterns
- Inactivity nudge logic (4+ hours without logging)
- Streak celebration at milestone thresholds
- Notification preference check
- Router endpoints (evaluate, meal-times)
"""

import pytest
import pytest_asyncio
from datetime import datetime, date, timedelta, time as dt_time, timezone

from app.models.ai_food_log import AIFoodLog
from app.models.onboarding_profile import OnboardingProfile
from app.services.smart_notification_service import (
    SmartNotificationService,
    NotificationType,
    _INACTIVITY_THRESHOLD_HOURS,
    _STREAK_MILESTONES,
)
from tests.conftest import create_user_and_get_headers


# ---------------------------------------------------------------------------
# Service-level tests
# ---------------------------------------------------------------------------

class TestMealTimePrediction:
    """Test that meal-time predictions are computed from historical logs."""

    @pytest.mark.asyncio
    async def test_predicts_breakfast_time(self, async_session, test_user):
        """With enough breakfast logs, the service should predict a time."""
        now = datetime.now(timezone.utc)

        # Seed 5 breakfast logs at ~08:30
        for i in range(5):
            log_time = (now - timedelta(days=i + 1)).replace(hour=8, minute=30, second=0)
            log = AIFoodLog(
                user_id=test_user.id,
                logged_at=log_time,
                meal_type="breakfast",
                food_name="Cereal",
                calories=300,
                carbs_g=40,
                protein_g=10,
                fats_g=5,
            )
            async_session.add(log)
        await async_session.commit()

        service = SmartNotificationService(async_session)
        predictions = await service.get_predicted_meal_times(test_user.id, now)

        assert predictions["breakfast"] is not None
        # Should be around 08:30
        assert predictions["breakfast"].hour == 8
        assert 25 <= predictions["breakfast"].minute <= 35

    @pytest.mark.asyncio
    async def test_no_prediction_with_insufficient_data(self, async_session, test_user):
        """With fewer than 3 logs, the prediction should be None."""
        now = datetime.now(timezone.utc)

        # Only 2 lunch logs
        for i in range(2):
            log_time = (now - timedelta(days=i + 1)).replace(hour=13, minute=0)
            log = AIFoodLog(
                user_id=test_user.id,
                logged_at=log_time,
                meal_type="lunch",
                food_name="Salad",
                calories=400,
                carbs_g=30,
                protein_g=20,
                fats_g=15,
            )
            async_session.add(log)
        await async_session.commit()

        service = SmartNotificationService(async_session)
        predictions = await service.get_predicted_meal_times(test_user.id, now)

        assert predictions["lunch"] is None


class TestInactivityNudge:
    """Test inactivity nudge logic."""

    @pytest.mark.asyncio
    async def test_nudge_when_no_logs_today_and_past_threshold(self, async_session, test_user):
        """Should fire if user has 0 logs and 4+ hours since waking start."""
        # Simulate 13:00 (5 hours after 08:00 waking start)
        now = datetime.now(timezone.utc).replace(hour=13, minute=0, second=0)

        service = SmartNotificationService(async_session)
        intents = await service.evaluate_notifications(test_user.id, now)

        nudges = [i for i in intents if i.type == NotificationType.INACTIVITY_NUDGE]
        assert len(nudges) == 1
        assert "Ya comiste?" in nudges[0].title

    @pytest.mark.asyncio
    async def test_no_nudge_during_night(self, async_session, test_user):
        """No nudge should fire outside waking hours (before 08:00)."""
        now = datetime.now(timezone.utc).replace(hour=6, minute=0, second=0)

        service = SmartNotificationService(async_session)
        intents = await service.evaluate_notifications(test_user.id, now)

        nudges = [i for i in intents if i.type == NotificationType.INACTIVITY_NUDGE]
        assert len(nudges) == 0

    @pytest.mark.asyncio
    async def test_no_nudge_if_recently_logged(self, async_session, test_user):
        """No nudge if the user logged food within the last 4 hours."""
        now = datetime.now(timezone.utc).replace(hour=14, minute=0, second=0)

        # Log food 2 hours ago
        recent_log = AIFoodLog(
            user_id=test_user.id,
            logged_at=now - timedelta(hours=2),
            meal_type="lunch",
            food_name="Sandwich",
            calories=500,
            carbs_g=40,
            protein_g=25,
            fats_g=15,
        )
        async_session.add(recent_log)
        await async_session.commit()

        service = SmartNotificationService(async_session)
        intents = await service.evaluate_notifications(test_user.id, now)

        nudges = [i for i in intents if i.type == NotificationType.INACTIVITY_NUDGE]
        assert len(nudges) == 0


class TestStreakCelebration:
    """Test streak milestone detection."""

    @pytest.mark.asyncio
    async def test_no_celebration_at_non_milestone(self, async_session, test_user):
        """A streak of 2 should not trigger a celebration."""
        now = datetime.now(timezone.utc)
        today = now.date()

        # Create logs for 2 consecutive days
        for i in range(2):
            log = AIFoodLog(
                user_id=test_user.id,
                logged_at=datetime.combine(today - timedelta(days=i), dt_time(hour=12)),
                meal_type="lunch",
                food_name="Rice",
                calories=400,
                carbs_g=60,
                protein_g=10,
                fats_g=5,
            )
            async_session.add(log)
        await async_session.commit()

        service = SmartNotificationService(async_session)
        intents = await service.evaluate_notifications(test_user.id, now)

        celebrations = [i for i in intents if i.type == NotificationType.STREAK_CELEBRATION]
        assert len(celebrations) == 0


class TestNotificationPreferences:
    """Test notification enabled check."""

    @pytest.mark.asyncio
    async def test_enabled_when_onboarding_says_yes(self, async_session, test_user):
        profile = OnboardingProfile(
            user_id=test_user.id,
            notifications_enabled=True,
        )
        async_session.add(profile)
        await async_session.commit()

        service = SmartNotificationService(async_session)
        enabled = await service.are_notifications_enabled(test_user.id)
        assert enabled is True

    @pytest.mark.asyncio
    async def test_disabled_when_onboarding_says_no(self, async_session, test_user):
        profile = OnboardingProfile(
            user_id=test_user.id,
            notifications_enabled=False,
        )
        async_session.add(profile)
        await async_session.commit()

        service = SmartNotificationService(async_session)
        enabled = await service.are_notifications_enabled(test_user.id)
        assert enabled is False

    @pytest.mark.asyncio
    async def test_disabled_when_no_profile(self, async_session, test_user):
        service = SmartNotificationService(async_session)
        enabled = await service.are_notifications_enabled(test_user.id)
        assert enabled is False


# ---------------------------------------------------------------------------
# Router integration tests
# ---------------------------------------------------------------------------

class TestSmartNotificationsRouter:
    """Integration tests for /api/smart-notifications endpoints."""

    @pytest.mark.asyncio
    async def test_evaluate_endpoint_returns_200(self, client):
        headers, user_id = await create_user_and_get_headers(
            client, email="smartnotif@test.com", password="Testpass123"
        )
        resp = await client.get("/api/smart-notifications/evaluate", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "intents" in data
        assert "notifications_enabled" in data
        assert "count" in data

    @pytest.mark.asyncio
    async def test_meal_times_endpoint_returns_200(self, client):
        headers, user_id = await create_user_and_get_headers(
            client, email="mealtimes@test.com", password="Testpass123"
        )
        resp = await client.get("/api/smart-notifications/meal-times", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "predictions" in data
        # Should contain all 4 meal types
        meal_types = {p["meal_type"] for p in data["predictions"]}
        assert meal_types == {"breakfast", "lunch", "dinner", "snack"}

    @pytest.mark.asyncio
    async def test_evaluate_requires_auth(self, client):
        resp = await client.get("/api/smart-notifications/evaluate")
        assert resp.status_code == 401
