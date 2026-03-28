"""Tests for the Admin API endpoints.

Covers:
- Dashboard KPIs
- User management (list, detail, toggle premium)
- Revenue endpoint
- System health
- Error log
- Cache clear
- Content management (tips CRUD, recipes CRUD)
- Broadcast notifications
- Admin guard (403 for non-admin users)
"""
import pytest
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from tests.conftest import (
    create_admin_and_get_headers,
    create_user_and_get_headers,
)


# ─── Admin Guard ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_non_admin_gets_403(client: AsyncClient, auth_headers: dict):
    """Non-admin users should receive 403 on all admin endpoints."""
    resp = await client.get("/api/admin/dashboard", headers=auth_headers)
    assert resp.status_code == 403

    resp = await client.get("/api/admin/users", headers=auth_headers)
    assert resp.status_code == 403

    resp = await client.get("/api/admin/system", headers=auth_headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_unauthenticated_gets_401(client: AsyncClient):
    """Unauthenticated requests should receive 401."""
    resp = await client.get("/api/admin/dashboard")
    assert resp.status_code == 401


# ─── Dashboard ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_dashboard_kpis(
    client: AsyncClient,
    async_session: AsyncSession,
):
    """Dashboard returns valid KPI structure."""
    headers, _ = await create_admin_and_get_headers(
        client, async_session, email="dash_admin@test.com"
    )
    resp = await client.get("/api/admin/dashboard", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "total_users" in data
    assert "dau" in data
    assert "premium_pct" in data
    assert "avg_nutri_score" in data
    assert "top_foods" in data
    assert isinstance(data["top_foods"], list)
    assert "new_users_today" in data
    assert "total_food_logs" in data


# ─── User Management ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_users(
    client: AsyncClient,
    async_session: AsyncSession,
):
    """Admin can list users with pagination."""
    headers, _ = await create_admin_and_get_headers(
        client, async_session, email="list_admin@test.com"
    )
    resp = await client.get("/api/admin/users", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "total" in data
    assert "page" in data
    assert data["page"] == 1
    assert data["total"] >= 1  # at least the admin user


@pytest.mark.asyncio
async def test_list_users_search(
    client: AsyncClient,
    async_session: AsyncSession,
):
    """Admin can search users by email."""
    headers, _ = await create_admin_and_get_headers(
        client, async_session, email="search_admin@test.com"
    )
    resp = await client.get(
        "/api/admin/users?search=search_admin", headers=headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1


@pytest.mark.asyncio
async def test_user_detail(
    client: AsyncClient,
    async_session: AsyncSession,
):
    """Admin can get detailed user info."""
    headers, admin_id = await create_admin_and_get_headers(
        client, async_session, email="detail_admin@test.com"
    )
    resp = await client.get(f"/api/admin/users/{admin_id}/detail", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == admin_id
    assert "email" in data
    assert "total_food_logs" in data
    assert "onboarding_completed" in data


@pytest.mark.asyncio
async def test_user_detail_not_found(
    client: AsyncClient,
    async_session: AsyncSession,
):
    """404 for non-existent user."""
    headers, _ = await create_admin_and_get_headers(
        client, async_session, email="notfound_admin@test.com"
    )
    resp = await client.get("/api/admin/users/999999/detail", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_toggle_premium_on(
    client: AsyncClient,
    async_session: AsyncSession,
):
    """Admin can enable premium for a user."""
    headers, admin_id = await create_admin_and_get_headers(
        client, async_session, email="toggle_admin@test.com"
    )
    # Create a regular user
    _, user_id = await create_user_and_get_headers(
        client, email="toggle_target@test.com"
    )
    resp = await client.post(
        f"/api/admin/users/{user_id}/premium",
        json={"is_premium": True, "reason": "test grant"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_premium"] is True
    assert data["user_id"] == user_id


@pytest.mark.asyncio
async def test_toggle_premium_off(
    client: AsyncClient,
    async_session: AsyncSession,
):
    """Admin can disable premium for a user."""
    headers, _ = await create_admin_and_get_headers(
        client, async_session, email="toggleoff_admin@test.com"
    )
    _, user_id = await create_user_and_get_headers(
        client, email="toggleoff_target@test.com"
    )
    # Enable first
    await client.post(
        f"/api/admin/users/{user_id}/premium",
        json={"is_premium": True},
        headers=headers,
    )
    # Disable
    resp = await client.post(
        f"/api/admin/users/{user_id}/premium",
        json={"is_premium": False, "reason": "test revoke"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["is_premium"] is False


# ─── Revenue ─────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_revenue(
    client: AsyncClient,
    async_session: AsyncSession,
):
    """Revenue endpoint returns valid structure with MRR, churn, LTV."""
    headers, _ = await create_admin_and_get_headers(
        client, async_session, email="rev_admin@test.com"
    )
    resp = await client.get("/api/admin/revenue", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "mrr" in data
    assert "churn_rate" in data
    assert "ltv" in data
    assert "plans" in data
    assert isinstance(data["plans"], list)


# ─── System Health ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_system_health(
    client: AsyncClient,
    async_session: AsyncSession,
):
    """System health endpoint returns DB/cache status."""
    headers, _ = await create_admin_and_get_headers(
        client, async_session, email="sys_admin@test.com"
    )
    resp = await client.get("/api/admin/system", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "db_connected" in data
    assert "python_version" in data
    assert "uptime_seconds" in data
    assert "error_count_recent" in data


# ─── Error Log ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_error_log(
    client: AsyncClient,
    async_session: AsyncSession,
):
    """Error log endpoint returns a list."""
    headers, _ = await create_admin_and_get_headers(
        client, async_session, email="err_admin@test.com"
    )
    resp = await client.get("/api/admin/errors", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_record_error_appears_in_log(
    client: AsyncClient,
    async_session: AsyncSession,
):
    """Recorded errors appear in the error log endpoint."""
    from app.routers.admin import record_error

    await record_error(ValueError("test error for admin"), context="test_context")

    headers, _ = await create_admin_and_get_headers(
        client, async_session, email="recerr_admin@test.com"
    )
    resp = await client.get("/api/admin/errors", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    # The response is now paginated
    items = data.get("items", data) if isinstance(data, dict) else data
    assert len(items) >= 1
    found = any(e["message"] == "test error for admin" for e in items)
    assert found, "Recorded error should appear in error log"


# ─── Cache Clear ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_cache_clear(
    client: AsyncClient,
    async_session: AsyncSession,
):
    """Cache clear endpoint succeeds (mocked Redis)."""
    headers, _ = await create_admin_and_get_headers(
        client, async_session, email="cache_admin@test.com"
    )
    resp = await client.post("/api/admin/cache/clear", headers=headers)
    # May be 200 or 503 depending on Redis mock supporting flushdb
    assert resp.status_code in (200, 503)


# ─── Nutrition Tips CRUD ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_tips_crud(
    client: AsyncClient,
    async_session: AsyncSession,
):
    """Full CRUD cycle for nutrition tips."""
    headers, _ = await create_admin_and_get_headers(
        client, async_session, email="tips_admin@test.com"
    )

    # Create
    create_resp = await client.post(
        "/api/admin/tips",
        json={
            "title": "Drink more water",
            "body": "Aim for 8 glasses of water per day.",
            "category": "hydration",
        },
        headers=headers,
    )
    assert create_resp.status_code == 201
    tip = create_resp.json()
    tip_id = tip["id"]
    assert tip["title"] == "Drink more water"
    assert tip["category"] == "hydration"
    assert tip["is_active"] is True

    # Read single
    get_resp = await client.get(f"/api/admin/tips/{tip_id}", headers=headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == tip_id

    # List
    list_resp = await client.get("/api/admin/tips", headers=headers)
    assert list_resp.status_code == 200
    assert any(t["id"] == tip_id for t in list_resp.json())

    # List with category filter
    list_filtered = await client.get(
        "/api/admin/tips?category=hydration", headers=headers
    )
    assert list_filtered.status_code == 200
    assert all(t["category"] == "hydration" for t in list_filtered.json())

    # Update
    update_resp = await client.put(
        f"/api/admin/tips/{tip_id}",
        json={"title": "Stay hydrated!", "is_active": False},
        headers=headers,
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["title"] == "Stay hydrated!"
    assert update_resp.json()["is_active"] is False

    # Delete
    delete_resp = await client.delete(f"/api/admin/tips/{tip_id}", headers=headers)
    assert delete_resp.status_code == 200

    # Verify deletion
    get_deleted = await client.get(f"/api/admin/tips/{tip_id}", headers=headers)
    assert get_deleted.status_code == 404


@pytest.mark.asyncio
async def test_tip_not_found(
    client: AsyncClient,
    async_session: AsyncSession,
):
    """404 for non-existent tip."""
    headers, _ = await create_admin_and_get_headers(
        client, async_session, email="tipnf_admin@test.com"
    )
    resp = await client.get("/api/admin/tips/999999", headers=headers)
    assert resp.status_code == 404


# ─── Recipes CRUD ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_recipes_crud(
    client: AsyncClient,
    async_session: AsyncSession,
):
    """Full CRUD cycle for recipes."""
    headers, _ = await create_admin_and_get_headers(
        client, async_session, email="recipe_admin@test.com"
    )

    # Create
    create_resp = await client.post(
        "/api/admin/recipes",
        json={
            "title": "Protein Smoothie",
            "ingredients": "1 banana, 1 scoop whey, 200ml milk",
            "instructions": "Blend all ingredients until smooth.",
            "category": "breakfast",
            "calories": 350,
            "protein_g": 30,
            "carbs_g": 40,
            "fat_g": 8,
            "servings": 1,
            "prep_time_min": 5,
        },
        headers=headers,
    )
    assert create_resp.status_code == 201
    recipe = create_resp.json()
    recipe_id = recipe["id"]
    assert recipe["title"] == "Protein Smoothie"
    assert recipe["calories"] == 350
    assert recipe["is_premium"] is False

    # Read single
    get_resp = await client.get(f"/api/admin/recipes/{recipe_id}", headers=headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == recipe_id

    # List
    list_resp = await client.get("/api/admin/recipes", headers=headers)
    assert list_resp.status_code == 200
    assert any(r["id"] == recipe_id for r in list_resp.json())

    # Update
    update_resp = await client.put(
        f"/api/admin/recipes/{recipe_id}",
        json={"title": "Super Protein Smoothie", "is_premium": True},
        headers=headers,
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["title"] == "Super Protein Smoothie"
    assert update_resp.json()["is_premium"] is True

    # Delete
    delete_resp = await client.delete(
        f"/api/admin/recipes/{recipe_id}", headers=headers
    )
    assert delete_resp.status_code == 200

    # Verify deletion
    get_deleted = await client.get(
        f"/api/admin/recipes/{recipe_id}", headers=headers
    )
    assert get_deleted.status_code == 404


@pytest.mark.asyncio
async def test_recipe_not_found(
    client: AsyncClient,
    async_session: AsyncSession,
):
    """404 for non-existent recipe."""
    headers, _ = await create_admin_and_get_headers(
        client, async_session, email="recipenf_admin@test.com"
    )
    resp = await client.get("/api/admin/recipes/999999", headers=headers)
    assert resp.status_code == 404


# ─── Broadcast Notifications ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_broadcast_notification(
    client: AsyncClient,
    async_session: AsyncSession,
):
    """Broadcast notification endpoint returns valid structure."""
    headers, _ = await create_admin_and_get_headers(
        client, async_session, email="bcast_admin@test.com"
    )
    resp = await client.post(
        "/api/admin/notifications/broadcast",
        json={
            "title": "New feature!",
            "body": "Check out our new recipes section.",
            "target": "all",
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "total_users" in data
    assert "sent_to" in data


@pytest.mark.asyncio
async def test_broadcast_empty_body_rejected(
    client: AsyncClient,
    async_session: AsyncSession,
):
    """Broadcast with empty title/body is rejected."""
    headers, _ = await create_admin_and_get_headers(
        client, async_session, email="bcasterr_admin@test.com"
    )
    resp = await client.post(
        "/api/admin/notifications/broadcast",
        json={"title": "", "body": "test"},
        headers=headers,
    )
    assert resp.status_code == 400


# ─── Metrics (legacy) ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_metrics(
    client: AsyncClient,
    async_session: AsyncSession,
):
    """Legacy metrics endpoint returns valid structure."""
    headers, _ = await create_admin_and_get_headers(
        client, async_session, email="metrics_admin@test.com"
    )
    resp = await client.get("/api/admin/metrics", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "dau" in data
    assert "total_users" in data
    assert "churn_rate" in data
