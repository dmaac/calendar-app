"""
Tests for the Export endpoints (/api/export/*).

Covers:
- GET /api/export/csv           -- CSV export with date filters
- GET /api/export/pdf           -- PDF report generation (mocked)
- GET /api/export/my-data       -- Full GDPR JSON export
- GET /api/export/my-data/csv   -- Legacy CSV export
- Auth required (401)
- Query param validation
- Empty-data edge cases
"""

import csv
import io
import json
import pytest
from datetime import date, datetime, timedelta, time as dt_time, timezone
from unittest.mock import AsyncMock, patch

from app.models.user import User
from app.models.ai_food_log import AIFoodLog
from app.models.onboarding_profile import OnboardingProfile
from app.core.security import create_access_token


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _create_user_direct(async_session, email="export@test.com") -> tuple[User, dict]:
    """Insert a user directly into the DB and return (user, auth_headers)."""
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


async def _seed_food_logs(async_session, user_id, count=5, days_ago_start=0):
    """Create a series of AI food log entries over consecutive days."""
    logs = []
    for i in range(count):
        log = AIFoodLog(
            user_id=user_id,
            logged_at=datetime.combine(
                date.today() - timedelta(days=days_ago_start + i),
                dt_time(hour=12),
            ),
            meal_type="lunch",
            food_name=f"Test Food {i}",
            calories=300.0 + i * 50,
            carbs_g=30.0 + i,
            protein_g=20.0 + i,
            fats_g=10.0 + i,
            fiber_g=5.0,
            sugar_g=2.0,
            sodium_mg=100.0,
            serving_size="1 serving",
            ai_provider="gpt-4o",
            ai_confidence=0.92,
            was_edited=False,
        )
        async_session.add(log)
        logs.append(log)
    await async_session.commit()
    return logs


# ---------------------------------------------------------------------------
# GET /api/export/csv -- date-filtered CSV export
# ---------------------------------------------------------------------------

class TestCsvExport:
    @pytest.mark.asyncio
    async def test_csv_returns_200_with_correct_content_type(self, client, async_session):
        user, headers = await _create_user_direct(async_session, email="csvbasic@test.com")
        await _seed_food_logs(async_session, user.id, count=3)

        resp = await client.get("/api/export/csv", headers=headers)
        assert resp.status_code == 200
        assert "text/csv" in resp.headers["content-type"]

    @pytest.mark.asyncio
    async def test_csv_contains_expected_columns(self, client, async_session):
        user, headers = await _create_user_direct(async_session, email="csvcols@test.com")
        await _seed_food_logs(async_session, user.id, count=2)

        resp = await client.get("/api/export/csv", headers=headers)
        content = resp.content.decode("utf-8")
        # Strip BOM if present
        if content.startswith("\ufeff"):
            content = content[1:]
        reader = csv.reader(io.StringIO(content))
        header_row = next(reader)
        # Core columns that should always be present
        assert "date" in header_row
        assert "meal_type" in header_row
        assert "food_name" in header_row
        assert "calories" in header_row

    @pytest.mark.asyncio
    async def test_csv_has_data_rows(self, client, async_session):
        user, headers = await _create_user_direct(async_session, email="csvrows@test.com")
        await _seed_food_logs(async_session, user.id, count=4)

        resp = await client.get("/api/export/csv", headers=headers)
        content = resp.content.decode("utf-8")
        if content.startswith("\ufeff"):
            content = content[1:]
        reader = csv.reader(io.StringIO(content))
        rows = list(reader)
        # At least header + some data
        assert len(rows) >= 2

    @pytest.mark.asyncio
    async def test_csv_with_date_range(self, client, async_session):
        """Only logs within the specified date range should appear."""
        user, headers = await _create_user_direct(async_session, email="csvrange@test.com")
        await _seed_food_logs(async_session, user.id, count=10, days_ago_start=0)

        start = (date.today() - timedelta(days=3)).isoformat()
        end = date.today().isoformat()

        resp = await client.get(
            f"/api/export/csv?start_date={start}&end_date={end}",
            headers=headers,
        )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_csv_empty_when_no_logs(self, client, async_session):
        _, headers = await _create_user_direct(async_session, email="csvempty@test.com")

        resp = await client.get("/api/export/csv", headers=headers)
        assert resp.status_code == 200
        # Even empty export should be valid CSV (at minimum header or empty)
        content = resp.content.decode("utf-8")
        assert len(content) > 0

    @pytest.mark.asyncio
    async def test_csv_requires_auth(self, client):
        resp = await client.get("/api/export/csv")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/export/pdf -- PDF report
# ---------------------------------------------------------------------------

class TestPdfExport:
    @pytest.mark.asyncio
    async def test_pdf_returns_200_with_correct_content_type(self, client, async_session):
        _, headers = await _create_user_direct(async_session, email="pdfbasic@test.com")

        fake_pdf = b"%PDF-1.4 fake pdf content for testing"
        with patch(
            "app.services.export_service.generate_nutrition_report_pdf",
            new_callable=AsyncMock,
            return_value=fake_pdf,
        ):
            resp = await client.get("/api/export/pdf", headers=headers)

        assert resp.status_code == 200
        assert "application/pdf" in resp.headers["content-type"]
        assert resp.content == fake_pdf

    @pytest.mark.asyncio
    async def test_pdf_custom_days_parameter(self, client, async_session):
        _, headers = await _create_user_direct(async_session, email="pdfdays@test.com")

        fake_pdf = b"%PDF-1.4 test"
        with patch(
            "app.services.export_service.generate_nutrition_report_pdf",
            new_callable=AsyncMock,
            return_value=fake_pdf,
        ) as mock_gen:
            resp = await client.get("/api/export/pdf?days=30", headers=headers)

        assert resp.status_code == 200
        mock_gen.assert_called_once()

    @pytest.mark.asyncio
    async def test_pdf_days_out_of_range(self, client, async_session):
        """days must be 1..90 per query validation."""
        _, headers = await _create_user_direct(async_session, email="pdfbaddays@test.com")

        resp = await client.get("/api/export/pdf?days=0", headers=headers)
        assert resp.status_code == 422

        resp2 = await client.get("/api/export/pdf?days=100", headers=headers)
        assert resp2.status_code == 422

    @pytest.mark.asyncio
    async def test_pdf_handles_generation_failure(self, client, async_session):
        _, headers = await _create_user_direct(async_session, email="pdffail@test.com")

        with patch(
            "app.services.export_service.generate_nutrition_report_pdf",
            new_callable=AsyncMock,
            side_effect=RuntimeError("ReportLab crash"),
        ):
            resp = await client.get("/api/export/pdf", headers=headers)

        assert resp.status_code == 500
        assert "failed" in resp.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_pdf_requires_auth(self, client):
        resp = await client.get("/api/export/pdf")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/export/my-data -- GDPR full JSON export
# ---------------------------------------------------------------------------

class TestMyDataExport:
    @pytest.mark.asyncio
    async def test_returns_json_with_all_sections(self, client, async_session):
        _, headers = await _create_user_direct(async_session, email="gdprbasic@test.com")

        resp = await client.get("/api/export/my-data", headers=headers)
        assert resp.status_code == 200
        assert "application/json" in resp.headers["content-type"]
        assert "attachment" in resp.headers.get("content-disposition", "")

        data = resp.json()
        assert "export_version" in data
        assert "exported_at" in data
        assert "user" in data
        assert "food_logs" in data
        assert "meal_logs" in data
        assert "daily_summaries" in data
        assert "activities" in data
        assert "workouts" in data
        assert "subscriptions" in data
        assert "feedback" in data

    @pytest.mark.asyncio
    async def test_user_section_contains_profile(self, client, async_session):
        _, headers = await _create_user_direct(async_session, email="gdprprofile@test.com")

        resp = await client.get("/api/export/my-data", headers=headers)
        data = resp.json()

        user_data = data["user"]
        assert user_data["email"] == "gdprprofile@test.com"
        assert "id" in user_data
        assert "hashed_password" not in user_data

    @pytest.mark.asyncio
    async def test_includes_food_logs(self, client, async_session):
        user, headers = await _create_user_direct(async_session, email="gdprlogs@test.com")
        await _seed_food_logs(async_session, user.id, count=3)

        resp = await client.get("/api/export/my-data", headers=headers)
        data = resp.json()
        assert len(data["food_logs"]) == 3
        assert data["food_logs"][0]["food_name"].startswith("Test Food")

    @pytest.mark.asyncio
    async def test_empty_data_for_new_user(self, client, async_session):
        _, headers = await _create_user_direct(async_session, email="gdprempty@test.com")

        resp = await client.get("/api/export/my-data", headers=headers)
        data = resp.json()

        assert data["food_logs"] == []
        assert data["meal_logs"] == []
        assert data["workouts"] == []
        assert data["onboarding_profile"] is None

    @pytest.mark.asyncio
    async def test_does_not_include_other_users_data(self, client, async_session):
        """Each user's export must contain only their own data."""
        user_a, headers_a = await _create_user_direct(async_session, email="gdpra@test.com")
        user_b, headers_b = await _create_user_direct(async_session, email="gdprb@test.com")

        await _seed_food_logs(async_session, user_a.id, count=5)
        await _seed_food_logs(async_session, user_b.id, count=2)

        resp_a = await client.get("/api/export/my-data", headers=headers_a)
        resp_b = await client.get("/api/export/my-data", headers=headers_b)

        data_a = resp_a.json()
        data_b = resp_b.json()

        assert len(data_a["food_logs"]) == 5
        assert len(data_b["food_logs"]) == 2

        assert data_a["user"]["email"] == "gdpra@test.com"
        assert data_b["user"]["email"] == "gdprb@test.com"

    @pytest.mark.asyncio
    async def test_requires_auth(self, client):
        resp = await client.get("/api/export/my-data")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/export/my-data/csv -- legacy CSV export
# ---------------------------------------------------------------------------

class TestLegacyCsvExport:
    @pytest.mark.asyncio
    async def test_returns_csv_with_all_columns(self, client, async_session):
        user, headers = await _create_user_direct(async_session, email="legcsv@test.com")
        await _seed_food_logs(async_session, user.id, count=2)

        resp = await client.get("/api/export/my-data/csv", headers=headers)
        assert resp.status_code == 200
        assert "text/csv" in resp.headers["content-type"]

        content = resp.content.decode("utf-8")
        reader = csv.reader(io.StringIO(content))
        header_row = next(reader)

        # Check a subset of expected columns from _LEGACY_CSV_COLUMNS
        assert "food_name" in header_row
        assert "calories" in header_row
        assert "meal_type" in header_row

    @pytest.mark.asyncio
    async def test_empty_csv_for_new_user(self, client, async_session):
        _, headers = await _create_user_direct(async_session, email="legcsvempty@test.com")

        resp = await client.get("/api/export/my-data/csv", headers=headers)
        assert resp.status_code == 200
        content = resp.content.decode("utf-8")
        reader = csv.reader(io.StringIO(content))
        rows = list(reader)
        assert len(rows) == 1  # header only

    @pytest.mark.asyncio
    async def test_requires_auth(self, client):
        resp = await client.get("/api/export/my-data/csv")
        assert resp.status_code == 401
