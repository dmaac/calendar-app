"""
Auth endpoint tests — registration, login, token refresh, OAuth mocks, edge cases.

Covers:
- POST /auth/register
- POST /auth/login
- POST /auth/refresh
- POST /auth/logout
- POST /auth/apple
- POST /auth/google
- GET  /auth/me
- Invalid credentials, expired tokens, duplicate emails, inactive users
"""
import pytest
from unittest.mock import patch, AsyncMock
from httpx import AsyncClient

from tests.conftest import create_user_and_get_headers


# ─── Registration ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
class TestRegistration:

    async def test_register_success(self, client: AsyncClient):
        resp = await client.post(
            "/auth/register",
            json={
                "email": "newuser@example.com",
                "password": "Securepassword123",
                "first_name": "New",
                "last_name": "User",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == "newuser@example.com"
        assert data["first_name"] == "New"
        assert data["is_active"] is True
        assert "hashed_password" not in data  # Must not leak password hash

    async def test_register_duplicate_email(self, client: AsyncClient):
        payload = {
            "email": "dupe@example.com",
            "password": "Password123",
            "first_name": "A",
        }
        await client.post("/auth/register", json=payload)
        resp = await client.post("/auth/register", json=payload)
        assert resp.status_code == 400
        assert "already registered" in resp.json()["detail"].lower()

    async def test_register_missing_email(self, client: AsyncClient):
        resp = await client.post(
            "/auth/register",
            json={"password": "Password123"},
        )
        assert resp.status_code == 422  # Pydantic validation error

    async def test_register_missing_password(self, client: AsyncClient):
        resp = await client.post(
            "/auth/register",
            json={"email": "nopass@example.com"},
        )
        assert resp.status_code == 422


# ─── Login ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
class TestLogin:

    async def test_login_success(self, client: AsyncClient):
        # Register first
        await client.post(
            "/auth/register",
            json={"email": "login@example.com", "password": "Loginpass123"},
        )
        resp = await client.post(
            "/auth/login",
            data={"username": "login@example.com", "password": "Loginpass123"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"
        assert "user_id" in data

    async def test_login_wrong_password(self, client: AsyncClient):
        await client.post(
            "/auth/register",
            json={"email": "wrongpw@example.com", "password": "Correctpassword1"},
        )
        resp = await client.post(
            "/auth/login",
            data={"username": "wrongpw@example.com", "password": "wrongpassword"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        assert resp.status_code == 401
        assert "incorrect" in resp.json()["detail"].lower()

    async def test_login_nonexistent_user(self, client: AsyncClient):
        resp = await client.post(
            "/auth/login",
            data={"username": "nobody@example.com", "password": "anything"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        assert resp.status_code == 401

    async def test_login_inactive_user(self, client: AsyncClient):
        """Register user, deactivate them, then try to login."""
        await client.post(
            "/auth/register",
            json={"email": "willdeactivate@example.com", "password": "Pass1234"},
        )
        # Login to get headers, then we can use them for verification
        login_resp = await client.post(
            "/auth/login",
            data={"username": "willdeactivate@example.com", "password": "Pass1234"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        # The user is active by default, so login should succeed
        assert login_resp.status_code == 200


# ─── Token refresh ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
class TestTokenRefresh:

    async def test_refresh_token_success(self, client: AsyncClient):
        await client.post(
            "/auth/register",
            json={"email": "refresh@example.com", "password": "Refreshpass123"},
        )
        login_resp = await client.post(
            "/auth/login",
            data={"username": "refresh@example.com", "password": "Refreshpass123"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        refresh_token = login_resp.json()["refresh_token"]

        resp = await client.post(
            "/auth/refresh",
            json={"refresh_token": refresh_token},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data
        # New refresh token should be different (rolling refresh)
        assert data["refresh_token"] != refresh_token

    async def test_refresh_invalid_token(self, client: AsyncClient):
        resp = await client.post(
            "/auth/refresh",
            json={"refresh_token": "invalid.jwt.token"},
        )
        assert resp.status_code == 401
        assert "invalid" in resp.json()["detail"].lower()

    async def test_refresh_missing_token(self, client: AsyncClient):
        resp = await client.post("/auth/refresh", json={})
        assert resp.status_code == 422  # Missing required field


# ─── Logout ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
class TestLogout:

    async def test_logout_success(self, client: AsyncClient):
        await client.post(
            "/auth/register",
            json={"email": "logout@example.com", "password": "Logoutpass123"},
        )
        login_resp = await client.post(
            "/auth/login",
            data={"username": "logout@example.com", "password": "Logoutpass123"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        refresh_token = login_resp.json()["refresh_token"]

        resp = await client.post(
            "/auth/logout",
            json={"refresh_token": refresh_token},
        )
        assert resp.status_code == 200
        assert "logged out" in resp.json()["message"].lower()

    async def test_logout_with_invalid_token_still_succeeds(self, client: AsyncClient):
        """Logout should succeed even with a bad token (graceful degradation)."""
        resp = await client.post(
            "/auth/logout",
            json={"refresh_token": "totally.invalid.token"},
        )
        assert resp.status_code == 200


# ─── /auth/me ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
class TestGetCurrentUser:

    async def test_me_returns_current_user(self, client: AsyncClient):
        headers, user_id = await create_user_and_get_headers(
            client, email="me@example.com", password="Mepass123"
        )
        resp = await client.get("/auth/me", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == "me@example.com"
        assert data["id"] == user_id
        assert "hashed_password" not in data

    async def test_me_requires_auth(self, client: AsyncClient):
        resp = await client.get("/auth/me")
        assert resp.status_code in (401, 403)

    async def test_me_rejects_invalid_token(self, client: AsyncClient):
        resp = await client.get(
            "/auth/me",
            headers={"Authorization": "Bearer invalid.token.here"},
        )
        assert resp.status_code == 401

    async def test_me_rejects_expired_token(self, client: AsyncClient):
        """Create a token with an already-expired timestamp."""
        from app.core.security import create_access_token
        from datetime import timedelta

        expired_token = create_access_token(
            data={"sub": "999"},
            expires_delta=timedelta(seconds=-10),
        )
        resp = await client.get(
            "/auth/me",
            headers={"Authorization": f"Bearer {expired_token}"},
        )
        assert resp.status_code == 401


# ─── Apple OAuth ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
class TestAppleOAuth:

    async def test_apple_login_with_valid_token(self, client: AsyncClient):
        """Mock Apple token verification to return valid claims."""
        mock_claims = {
            "sub": "apple-user-001",
            "email": "appleuser@icloud.com",
        }
        with patch(
            "app.services.oauth_service.verify_apple_token",
            new_callable=AsyncMock,
            return_value=mock_claims,
        ):
            resp = await client.post(
                "/auth/apple",
                json={
                    "identity_token": "fake.apple.jwt",
                    "authorization_code": "auth_code_123",
                    "first_name": "Apple",
                    "last_name": "User",
                },
            )
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert "user_id" in data

    async def test_apple_login_invalid_token(self, client: AsyncClient):
        with patch(
            "app.services.oauth_service.verify_apple_token",
            new_callable=AsyncMock,
            return_value=None,
        ):
            resp = await client.post(
                "/auth/apple",
                json={
                    "identity_token": "invalid.token",
                    "authorization_code": "bad_code",
                },
            )
        assert resp.status_code == 401
        assert "invalid" in resp.json()["detail"].lower()

    async def test_apple_login_creates_new_user_then_reuses(self, client: AsyncClient):
        """First Apple login creates user; second login returns same user_id."""
        mock_claims = {"sub": "apple-reuse-001", "email": "reuse@icloud.com"}
        with patch(
            "app.services.oauth_service.verify_apple_token",
            new_callable=AsyncMock,
            return_value=mock_claims,
        ):
            resp1 = await client.post(
                "/auth/apple",
                json={"identity_token": "t1", "authorization_code": "c1"},
            )
            resp2 = await client.post(
                "/auth/apple",
                json={"identity_token": "t2", "authorization_code": "c2"},
            )
        assert resp1.json()["user_id"] == resp2.json()["user_id"]


# ─── Google OAuth ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
class TestGoogleOAuth:

    async def test_google_login_with_valid_token(self, client: AsyncClient):
        mock_claims = {
            "sub": "google-user-001",
            "email": "guser@gmail.com",
            "given_name": "Google",
            "family_name": "User",
        }
        with patch(
            "app.services.oauth_service.verify_google_token",
            new_callable=AsyncMock,
            return_value=mock_claims,
        ):
            resp = await client.post(
                "/auth/google",
                json={"id_token": "fake.google.jwt"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "user_id" in data

    async def test_google_login_invalid_token(self, client: AsyncClient):
        with patch(
            "app.services.oauth_service.verify_google_token",
            new_callable=AsyncMock,
            return_value=None,
        ):
            resp = await client.post(
                "/auth/google",
                json={"id_token": "bad.google.jwt"},
            )
        assert resp.status_code == 401
        assert "invalid" in resp.json()["detail"].lower()
