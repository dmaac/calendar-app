"""
Tests for the Favorites endpoints (POST/GET/DELETE /api/favorites).

Covers:
- List favorites (empty, with data)
- Add favorite by food_id (happy path, nonexistent food, duplicate)
- Add favorite by inline food_name + macros (AI-scanned path)
- Add favorite with invalid payload (missing both food_id and food_name)
- Remove favorite (happy path, nonexistent)
- Quick-log a favorite (POST /{id}/log)
- Auth required (401/403 without token)
- Input validation (422 with bad data)
"""

import pytest
from datetime import date

from app.models.user import User
from app.models.food import Food
from app.models.user_food_favorite import UserFoodFavorite
from app.core.security import create_access_token


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _create_user_direct(async_session, email="fav@test.com") -> tuple[User, dict]:
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


async def _create_food(async_session, name="Chicken Breast", calories=165.0, **kwargs) -> Food:
    """Insert a food entry into the test DB and return it."""
    food = Food(
        name=name,
        calories=calories,
        protein_g=kwargs.get("protein_g", 31.0),
        carbs_g=kwargs.get("carbs_g", 0.0),
        fat_g=kwargs.get("fat_g", 3.6),
    )
    async_session.add(food)
    await async_session.commit()
    await async_session.refresh(food)
    return food


# ---------------------------------------------------------------------------
# GET /api/favorites/ -- list favorites
# ---------------------------------------------------------------------------

class TestListFavorites:
    @pytest.mark.asyncio
    async def test_empty_list_for_new_user(self, client, async_session):
        _, headers = await _create_user_direct(async_session, email="favempty@test.com")
        resp = await client.get("/api/favorites/", headers=headers)
        assert resp.status_code == 200
        assert resp.json() == []

    @pytest.mark.asyncio
    async def test_returns_favorites_with_food_data(self, client, async_session):
        user, headers = await _create_user_direct(async_session, email="favlist@test.com")
        food = await _create_food(async_session, name="Salmon Fillet", calories=208.0)

        fav = UserFoodFavorite(user_id=user.id, food_id=food.id, times_logged=2)
        async_session.add(fav)
        await async_session.commit()

        resp = await client.get("/api/favorites/", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["food_name"] == "Salmon Fillet"
        assert data[0]["calories"] == 208.0
        assert data[0]["times_logged"] == 2

    @pytest.mark.asyncio
    async def test_requires_auth(self, client):
        resp = await client.get("/api/favorites/")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# POST /api/favorites/ -- add a favorite
# ---------------------------------------------------------------------------

class TestAddFavorite:
    @pytest.mark.asyncio
    async def test_add_by_food_id(self, client, async_session):
        _, headers = await _create_user_direct(async_session, email="favadd@test.com")
        food = await _create_food(async_session, name="Avocado", calories=160.0)

        resp = await client.post(
            "/api/favorites/",
            json={"food_id": food.id},
            headers=headers,
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["food_id"] == food.id
        assert body["food_name"] == "Avocado"
        assert body["times_logged"] == 0

    @pytest.mark.asyncio
    async def test_add_by_food_id_nonexistent(self, client, async_session):
        _, headers = await _create_user_direct(async_session, email="favnone@test.com")

        resp = await client.post(
            "/api/favorites/",
            json={"food_id": 99999},
            headers=headers,
        )
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_add_duplicate_returns_existing(self, client, async_session):
        """Adding the same food twice should return the existing favorite, not error."""
        _, headers = await _create_user_direct(async_session, email="favdup@test.com")
        food = await _create_food(async_session, name="Rice", calories=130.0)

        resp1 = await client.post(
            "/api/favorites/",
            json={"food_id": food.id},
            headers=headers,
        )
        assert resp1.status_code == 201
        fav_id_1 = resp1.json()["id"]

        resp2 = await client.post(
            "/api/favorites/",
            json={"food_id": food.id},
            headers=headers,
        )
        assert resp2.status_code == 201
        fav_id_2 = resp2.json()["id"]
        assert fav_id_1 == fav_id_2

    @pytest.mark.asyncio
    async def test_add_by_inline_food_data(self, client, async_session):
        """AI-scanned foods can be favorited with name + macros instead of food_id."""
        _, headers = await _create_user_direct(async_session, email="favinline@test.com")

        resp = await client.post(
            "/api/favorites/",
            json={
                "food_name": "AI Scanned Burrito",
                "calories": 550.0,
                "protein_g": 25.0,
                "carbs_g": 60.0,
                "fat_g": 20.0,
            },
            headers=headers,
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["food_name"] == "AI Scanned Burrito"
        assert body["calories"] == 550.0

    @pytest.mark.asyncio
    async def test_add_missing_both_food_id_and_name(self, client, async_session):
        """Payload with neither food_id nor food_name should be rejected."""
        _, headers = await _create_user_direct(async_session, email="favbad@test.com")

        resp = await client.post(
            "/api/favorites/",
            json={},
            headers=headers,
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_add_food_name_without_calories(self, client, async_session):
        """food_name without calories should be rejected (422)."""
        _, headers = await _create_user_direct(async_session, email="favnocal@test.com")

        resp = await client.post(
            "/api/favorites/",
            json={"food_name": "Mystery Food"},
            headers=headers,
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_add_requires_auth(self, client, async_session):
        food = await _create_food(async_session, name="No Auth Food")
        resp = await client.post(
            "/api/favorites/",
            json={"food_id": food.id},
        )
        # POST without auth may return 401 or 403 (CSRF)
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_add_negative_food_id_rejected(self, client, async_session):
        """food_id must be > 0 per the model validation."""
        _, headers = await _create_user_direct(async_session, email="favneg@test.com")

        resp = await client.post(
            "/api/favorites/",
            json={"food_id": -1},
            headers=headers,
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_add_negative_calories_rejected(self, client, async_session):
        """Negative calorie values should be rejected by model validation."""
        _, headers = await _create_user_direct(async_session, email="favnegcal@test.com")

        resp = await client.post(
            "/api/favorites/",
            json={
                "food_name": "Bad Food",
                "calories": -100.0,
                "protein_g": 10.0,
                "carbs_g": 10.0,
                "fat_g": 5.0,
            },
            headers=headers,
        )
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# DELETE /api/favorites/{favorite_id}
# ---------------------------------------------------------------------------

class TestRemoveFavorite:
    @pytest.mark.asyncio
    async def test_remove_existing(self, client, async_session):
        _, headers = await _create_user_direct(async_session, email="favdel@test.com")
        food = await _create_food(async_session, name="Broccoli", calories=34.0)

        add_resp = await client.post(
            "/api/favorites/",
            json={"food_id": food.id},
            headers=headers,
        )
        fav_id = add_resp.json()["id"]

        del_resp = await client.delete(f"/api/favorites/{fav_id}", headers=headers)
        assert del_resp.status_code == 200
        assert "removed" in del_resp.json()["message"].lower()

        list_resp = await client.get("/api/favorites/", headers=headers)
        assert len(list_resp.json()) == 0

    @pytest.mark.asyncio
    async def test_remove_nonexistent(self, client, async_session):
        _, headers = await _create_user_direct(async_session, email="favdelnone@test.com")

        resp = await client.delete("/api/favorites/99999", headers=headers)
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_remove_requires_auth(self, client):
        resp = await client.delete("/api/favorites/1")
        # DELETE without auth may return 401 or 403 (CSRF middleware)
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_cannot_remove_other_users_favorite(self, client, async_session):
        """User A cannot delete User B's favorite."""
        _, headers_a = await _create_user_direct(async_session, email="favownera@test.com")
        _, headers_b = await _create_user_direct(async_session, email="favownerb@test.com")

        food = await _create_food(async_session, name="Steak", calories=271.0)

        add_resp = await client.post(
            "/api/favorites/",
            json={"food_id": food.id},
            headers=headers_a,
        )
        fav_id = add_resp.json()["id"]

        del_resp = await client.delete(f"/api/favorites/{fav_id}", headers=headers_b)
        assert del_resp.status_code == 404  # not found for user B


# ---------------------------------------------------------------------------
# POST /api/favorites/{favorite_id}/log -- quick-log a favorite
# ---------------------------------------------------------------------------

class TestLogFavorite:
    @pytest.mark.asyncio
    async def test_log_increments_times_logged(self, client, async_session):
        _, headers = await _create_user_direct(async_session, email="favlog@test.com")
        food = await _create_food(async_session, name="Oatmeal", calories=150.0)

        add_resp = await client.post(
            "/api/favorites/",
            json={"food_id": food.id},
            headers=headers,
        )
        fav_id = add_resp.json()["id"]

        log_resp = await client.post(
            f"/api/favorites/{fav_id}/log?meal_type=breakfast",
            headers=headers,
        )
        assert log_resp.status_code == 200
        body = log_resp.json()
        assert body["times_logged"] == 1

        log_resp2 = await client.post(
            f"/api/favorites/{fav_id}/log?meal_type=lunch",
            headers=headers,
        )
        assert log_resp2.status_code == 200
        assert log_resp2.json()["times_logged"] == 2

    @pytest.mark.asyncio
    async def test_log_nonexistent_favorite(self, client, async_session):
        _, headers = await _create_user_direct(async_session, email="favlognone@test.com")

        resp = await client.post("/api/favorites/99999/log", headers=headers)
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_log_requires_auth(self, client):
        resp = await client.post("/api/favorites/1/log")
        # POST without auth may return 401 or 403 (CSRF)
        assert resp.status_code in (401, 403)
