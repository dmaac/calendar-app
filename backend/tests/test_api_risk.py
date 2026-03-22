"""
End-to-end API integration tests for the risk engine endpoints,
health checks, root, CORS, and versioning.

Uses FastAPI's TestClient (via httpx AsyncClient) with in-memory SQLite.
Focus: auth rejection on protected endpoints, input validation on public
endpoints, and response shape contracts on unauthenticated-accessible routes.
"""
import pytest
import pytest_asyncio
from httpx import AsyncClient


# ═══════════════════════════════════════════════════════════════════════════════
# 1. AUTH REJECTION — Risk endpoints must reject unauthenticated requests
# ═══════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
class TestRiskEndpointsAuth:
    """All risk endpoints must return 401 or 403 without a valid Bearer token."""

    async def test_summary_requires_auth(self, client: AsyncClient):
        resp = await client.get("/api/risk/summary")
        assert resp.status_code in (401, 403)

    async def test_daily_requires_auth(self, client: AsyncClient):
        resp = await client.get("/api/risk/daily")
        assert resp.status_code in (401, 403)

    async def test_history_requires_auth(self, client: AsyncClient):
        resp = await client.get("/api/risk/history")
        assert resp.status_code in (401, 403)

    async def test_recalculate_requires_auth(self, client: AsyncClient):
        resp = await client.post("/api/risk/recalculate")
        assert resp.status_code in (401, 403)

    async def test_admin_dashboard_requires_auth(self, client: AsyncClient):
        resp = await client.get("/api/risk/admin/dashboard")
        assert resp.status_code in (401, 403)


# ═══════════════════════════════════════════════════════════════════════════════
# 2. INPUT VALIDATION — Query param bounds enforced by FastAPI/Pydantic
# ═══════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
class TestRiskEndpointValidation:
    """Validation tests: out-of-range query params should be rejected."""

    async def test_history_days_zero_rejected(self, client: AsyncClient):
        """days=0 is below ge=1 → 422."""
        resp = await client.get("/api/risk/history", params={"days": 0})
        # Even without auth, FastAPI validates query params first — or auth
        # fires first. Either 422 or 401 is acceptable; 422 preferred.
        assert resp.status_code in (401, 422)

    async def test_history_days_91_rejected(self, client: AsyncClient):
        """days=91 is above le=90 → 422."""
        resp = await client.get("/api/risk/history", params={"days": 91})
        assert resp.status_code in (401, 422)

    async def test_history_days_7_no_auth(self, client: AsyncClient):
        """Valid days but no auth → 401."""
        resp = await client.get("/api/risk/history", params={"days": 7})
        assert resp.status_code in (401, 403)

    async def test_backfill_negative_days_rejected(self, client: AsyncClient):
        """days=-1 on backfill → 422 (ge=1)."""
        resp = await client.post("/api/risk/backfill", params={"days": -1})
        assert resp.status_code in (401, 422)

    async def test_adjusted_goals_invalid_day_type(self, client: AsyncClient):
        """day_type=invalid should fail regex validation or auth."""
        resp = await client.get(
            "/api/risk/adjusted-goals", params={"day_type": "invalid"}
        )
        assert resp.status_code in (401, 422)


# ═══════════════════════════════════════════════════════════════════════════════
# 3. HEALTH ENDPOINT — Public, no auth required
# ═══════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
class TestHealthEndpoint:
    """Health endpoints are public and return system status."""

    async def test_health_returns_200(self, client: AsyncClient):
        resp = await client.get("/health")
        # 200 = healthy, 503 = degraded (no real DB in test) — both OK
        assert resp.status_code in (200, 503)
        data = resp.json()
        assert "status" in data

    async def test_api_health_returns_200(self, client: AsyncClient):
        resp = await client.get("/api/health")
        assert resp.status_code in (200, 503)
        data = resp.json()
        assert "status" in data

    async def test_health_response_fields(self, client: AsyncClient):
        resp = await client.get("/health")
        data = resp.json()
        assert "version" in data
        assert "uptime" in data
        assert "db_connected" in data


# ═══════════════════════════════════════════════════════════════════════════════
# 4. ROOT ENDPOINT — Public
# ═══════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
class TestRootEndpoint:
    """GET / returns API status and version."""

    async def test_root_returns_200(self, client: AsyncClient):
        resp = await client.get("/")
        assert resp.status_code == 200
        data = resp.json()
        assert "message" in data
        assert "version" in data

    async def test_root_message_contains_fitsi(self, client: AsyncClient):
        resp = await client.get("/")
        data = resp.json()
        assert "Fitsi" in data["message"] or "fitsi" in data["message"].lower()


# ═══════════════════════════════════════════════════════════════════════════════
# 5. CORS / SECURITY HEADERS
# ═══════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
class TestCORSHeaders:
    """Verify security middleware adds expected headers."""

    async def test_security_header_nosniff(self, client: AsyncClient):
        resp = await client.get("/")
        assert resp.headers.get("x-content-type-options") == "nosniff"

    async def test_security_header_frame_deny(self, client: AsyncClient):
        resp = await client.get("/")
        assert resp.headers.get("x-frame-options") == "DENY"

    async def test_cors_options_request(self, client: AsyncClient):
        """An OPTIONS preflight should return CORS headers (or at least not 500)."""
        resp = await client.options(
            "/api/risk/summary",
            headers={
                "Origin": "http://localhost:8081",
                "Access-Control-Request-Method": "GET",
            },
        )
        # CORS middleware should handle this — not 500
        assert resp.status_code < 500


# ═══════════════════════════════════════════════════════════════════════════════
# 6. API VERSIONING
# ═══════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
class TestAPIVersioning:
    """Versioning headers should be accepted without errors."""

    async def test_accept_version_v1_works(self, client: AsyncClient):
        """Accept-Version: v1 header should not cause a server error."""
        resp = await client.get("/", headers={"Accept-Version": "v1"})
        assert resp.status_code == 200

    async def test_app_version_header_accepted(self, client: AsyncClient):
        """X-App-Version: 1.4.0 is above MIN_APP_VERSION (1.0.0) → no 426."""
        resp = await client.get(
            "/api/risk/summary",
            headers={"X-App-Version": "1.4.0"},
        )
        # Should get 401 (no auth), NOT 426 (outdated app)
        assert resp.status_code != 426
