"""
Unit tests for the /auth/* endpoints.

Fixtures come from conftest.py:
- client: sync FastAPI TestClient backed by an in-memory SQLite DB
- session: raw SQLModel Session (unused here, but available)
"""

REGISTER_URL = "/auth/register"
LOGIN_URL = "/auth/login"
ME_URL = "/auth/me"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_VALID_USER = {
    "email": "newuser@example.com",
    "first_name": "New",
    "last_name": "User",
    "password": "securepassword123",
}


def _register(client, payload=None):
    """Register a user and return the response."""
    return client.post(REGISTER_URL, json=payload or _VALID_USER)


def _login(client, username, password):
    """Login via form data and return the response."""
    return client.post(LOGIN_URL, data={"username": username, "password": password})


# ---------------------------------------------------------------------------
# 1. Successful registration
# ---------------------------------------------------------------------------

def test_register_success(client):
    """POST /auth/register with valid data returns 200 and the new user's data."""
    response = _register(client)

    assert response.status_code == 200

    body = response.json()
    assert body["email"] == _VALID_USER["email"]
    assert body["first_name"] == _VALID_USER["first_name"]
    assert body["last_name"] == _VALID_USER["last_name"]
    assert body["is_active"] is True
    assert "id" in body
    assert "created_at" in body
    # Password must never be returned
    assert "password" not in body
    assert "hashed_password" not in body


# ---------------------------------------------------------------------------
# 2. Duplicate-email registration
# ---------------------------------------------------------------------------

def test_register_duplicate_email(client):
    """Registering the same email twice returns 400 with a descriptive error."""
    _register(client)  # first registration must succeed

    response = _register(client)  # second attempt with identical email

    assert response.status_code == 400
    assert "already registered" in response.json()["detail"].lower()


# ---------------------------------------------------------------------------
# 3. Successful login
# ---------------------------------------------------------------------------

def test_login_success(client):
    """POST /auth/login with correct credentials returns a bearer access_token."""
    _register(client)

    response = _login(client, _VALID_USER["email"], _VALID_USER["password"])

    assert response.status_code == 200

    body = response.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"
    assert isinstance(body["access_token"], str)
    assert len(body["access_token"]) > 0


# ---------------------------------------------------------------------------
# 4. Login with wrong password
# ---------------------------------------------------------------------------

def test_login_wrong_password(client):
    """POST /auth/login with an incorrect password returns 401."""
    _register(client)

    response = _login(client, _VALID_USER["email"], "totally_wrong_password")

    assert response.status_code == 401
    assert "incorrect" in response.json()["detail"].lower()


# ---------------------------------------------------------------------------
# 5. GET /auth/me without a token
# ---------------------------------------------------------------------------

def test_me_without_token(client):
    """GET /auth/me without an Authorization header returns 401."""
    response = client.get(ME_URL)

    assert response.status_code == 401
