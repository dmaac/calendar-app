"""
API integration tests using FastAPI TestClient.
Tests: auth flow, meal logging flow, food search.
"""
import pytest
from datetime import date
from fastapi.testclient import TestClient


@pytest.mark.api
class TestAuthFlow:
    """Test the complete authentication flow via API."""

    def test_register_user(self, client: TestClient):
        response = client.post(
            "/auth/register",
            json={
                "email": "newuser@example.com",
                "first_name": "New",
                "last_name": "User",
                "password": "Securepass123",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "newuser@example.com"
        assert data["first_name"] == "New"
        assert "hashed_password" not in data

    def test_register_duplicate_email(self, client: TestClient):
        payload = {
            "email": "dup@example.com",
            "first_name": "Dup",
            "last_name": "User",
            "password": "Pass1234",
        }
        client.post("/auth/register", json=payload)
        response = client.post("/auth/register", json=payload)
        assert response.status_code == 400
        assert "already registered" in response.json()["detail"]

    def test_login_success(self, client: TestClient):
        # Register first
        client.post(
            "/auth/register",
            json={
                "email": "login@example.com",
                "first_name": "Login",
                "last_name": "User",
                "password": "Loginpass123",
            },
        )

        response = client.post(
            "/auth/login",
            data={"username": "login@example.com", "password": "Loginpass123"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_login_wrong_password(self, client: TestClient):
        client.post(
            "/auth/register",
            json={
                "email": "wrongpw@example.com",
                "first_name": "Wrong",
                "last_name": "PW",
                "password": "Correctpass1",
            },
        )

        response = client.post(
            "/auth/login",
            data={"username": "wrongpw@example.com", "password": "wrongpass"},
        )
        assert response.status_code == 401

    def test_login_nonexistent_user(self, client: TestClient):
        response = client.post(
            "/auth/login",
            data={"username": "nobody@example.com", "password": "pass"},
        )
        assert response.status_code == 401

    def test_get_current_user(self, client: TestClient, auth_headers: dict):
        response = client.get("/auth/me", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "auth@example.com"

    def test_get_current_user_no_token(self, client: TestClient):
        response = client.get("/auth/me")
        assert response.status_code == 401

    def test_get_current_user_invalid_token(self, client: TestClient):
        response = client.get(
            "/auth/me",
            headers={"Authorization": "Bearer invalidtoken"},
        )
        assert response.status_code == 401


@pytest.mark.api
class TestMealLoggingFlow:
    """Test meal logging endpoints."""

    def test_log_meal(self, client: TestClient, auth_client_with_food: tuple):
        headers, food_id = auth_client_with_food

        response = client.post(
            "/meals/",
            json={
                "date": "2025-01-15",
                "meal_type": "lunch",
                "food_id": food_id,
                "servings": 1.5,
            },
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["food_id"] == food_id
        assert data["servings"] == 1.5
        assert data["total_calories"] == round(165.0 * 1.5, 1)

    def test_log_meal_unauthenticated(self, client: TestClient):
        response = client.post(
            "/meals/",
            json={
                "date": "2025-01-15",
                "meal_type": "lunch",
                "food_id": 1,
                "servings": 1.0,
            },
        )
        assert response.status_code == 401

    def test_get_meals_by_date(self, client: TestClient, auth_client_with_food: tuple):
        headers, food_id = auth_client_with_food

        # Log a meal
        client.post(
            "/meals/",
            json={
                "date": "2025-02-01",
                "meal_type": "breakfast",
                "food_id": food_id,
                "servings": 1.0,
            },
            headers=headers,
        )

        response = client.get(
            "/meals/?target_date=2025-02-01",
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        # Response may be a list or paginated dict with "items"
        items = data["items"] if isinstance(data, dict) and "items" in data else data
        assert len(items) >= 1
        assert items[0]["date"] == "2025-02-01"

    def test_delete_meal(self, client: TestClient, auth_client_with_food: tuple):
        headers, food_id = auth_client_with_food

        # Log a meal
        log_resp = client.post(
            "/meals/",
            json={
                "date": "2025-03-01",
                "meal_type": "dinner",
                "food_id": food_id,
                "servings": 1.0,
            },
            headers=headers,
        )
        meal_id = log_resp.json()["id"]

        # Delete it
        delete_resp = client.delete(f"/meals/{meal_id}", headers=headers)
        assert delete_resp.status_code == 200

    def test_delete_nonexistent_meal(self, client: TestClient, auth_headers: dict):
        response = client.delete("/meals/99999", headers=auth_headers)
        assert response.status_code == 404

    def test_daily_summary(self, client: TestClient, auth_client_with_food: tuple):
        headers, food_id = auth_client_with_food

        # Log meals
        client.post(
            "/meals/",
            json={
                "date": "2025-04-01",
                "meal_type": "lunch",
                "food_id": food_id,
                "servings": 2.0,
            },
            headers=headers,
        )

        response = client.get(
            "/meals/summary?target_date=2025-04-01",
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total_calories"] == round(165.0 * 2.0, 1)
        assert data["meals_count"] == 1

    def test_update_water(self, client: TestClient, auth_client_with_food: tuple):
        headers, _ = auth_client_with_food

        response = client.post(
            "/meals/water?target_date=2025-04-01&water_ml=2500",
            headers=headers,
        )
        assert response.status_code == 200
        assert response.json()["water_ml"] == 2500.0


@pytest.mark.api
class TestFoodSearch:
    """Test food search endpoints."""

    def test_search_foods(self, client: TestClient, auth_client_with_food: tuple):
        headers, _ = auth_client_with_food

        response = client.get(
            "/foods/?query=Chicken",
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        # Response may be a list or paginated dict with "items"
        items = data["items"] if isinstance(data, dict) and "items" in data else data
        assert len(items) >= 1
        assert "Chicken" in items[0]["name"]

    def test_search_foods_no_results(self, client: TestClient, auth_headers: dict):
        response = client.get(
            "/foods/?query=xyznonexistent",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        items = data["items"] if isinstance(data, dict) and "items" in data else data
        assert items == []

    def test_get_food_by_id(self, client: TestClient, auth_client_with_food: tuple):
        headers, food_id = auth_client_with_food

        response = client.get(f"/foods/{food_id}", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == food_id

    def test_get_food_not_found(self, client: TestClient, auth_headers: dict):
        response = client.get("/foods/99999", headers=auth_headers)
        assert response.status_code == 404

    def test_create_food(self, client: TestClient, auth_headers: dict):
        response = client.post(
            "/foods/",
            json={
                "name": "Oatmeal",
                "brand": "Quaker",
                "serving_size": 40.0,
                "serving_unit": "g",
                "calories": 150.0,
                "protein_g": 5.0,
                "carbs_g": 27.0,
                "fat_g": 2.5,
            },
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Oatmeal"
        assert data["id"] is not None

    def test_foods_require_auth(self, client: TestClient):
        response = client.get("/foods/")
        assert response.status_code == 401
