#!/usr/bin/env python3
"""
Fitsi IA — Enterprise Stress Test (Locust)
═══════════════════════════════════════════

Simulates up to 200,000 concurrent users with 5 distinct behavioral profiles
using the Locust load testing framework.

Usage:
    # Web UI (interactive)
    cd backend/
    locust -f scripts/stress_test.py --host http://localhost:8000

    # Headless (CLI)
    locust -f scripts/stress_test.py --host http://localhost:8000 \
        --headless -u 1000 -r 50 --run-time 5m

    # Use the run_stress_test.sh for progressive scaling (recommended)
    bash scripts/run_stress_test.sh

Prerequisites:
    pip install locust httpx
    python -m scripts.seed_users --count 1000   (seed test users first)

QA User Profiles (50 virtual clients):
    QA-USR-001 to QA-USR-010: Power Users — all features, 5-10 req/min
    QA-USR-011 to QA-USR-020: Casual Users — home + log only, 2-3 req/min
    QA-USR-021 to QA-USR-030: Scanner Users — heavy food scanning, 4-6 req/min
    QA-USR-031 to QA-USR-040: Profile Browsers — read-only browsing, 3-4 req/min
    QA-USR-041 to QA-USR-050: New Users — onboarding + paywall, 1-2 req/min
"""

import json
import logging
import random
import time
from datetime import date, timedelta

from locust import HttpUser, between, events, task, tag

logger = logging.getLogger("fitsi_stress")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SEED_EMAIL_DOMAIN = "fitsi.test"
SEED_PASSWORD = "Test1234"
TOTAL_SEED_USERS = 100  # How many seed users exist in the DB

# Meal data templates for POST requests
MEAL_TEMPLATES = [
    {
        "food_name": "Chicken Breast",
        "meal_type": "lunch",
        "calories": 165,
        "protein_g": 31.0,
        "carbs_g": 0.0,
        "fats_g": 3.6,
        "fiber_g": 0.0,
        "sugar_g": 0.0,
        "serving_size": 100,
        "serving_unit": "g",
    },
    {
        "food_name": "Brown Rice",
        "meal_type": "lunch",
        "calories": 112,
        "protein_g": 2.3,
        "carbs_g": 24.0,
        "fats_g": 0.8,
        "fiber_g": 1.8,
        "sugar_g": 0.4,
        "serving_size": 100,
        "serving_unit": "g",
    },
    {
        "food_name": "Greek Yogurt",
        "meal_type": "breakfast",
        "calories": 100,
        "protein_g": 17.0,
        "carbs_g": 6.0,
        "fats_g": 0.7,
        "fiber_g": 0.0,
        "sugar_g": 4.0,
        "serving_size": 170,
        "serving_unit": "g",
    },
    {
        "food_name": "Salmon Fillet",
        "meal_type": "dinner",
        "calories": 280,
        "protein_g": 37.0,
        "carbs_g": 0.0,
        "fats_g": 13.0,
        "fiber_g": 0.0,
        "sugar_g": 0.0,
        "serving_size": 150,
        "serving_unit": "g",
    },
    {
        "food_name": "Banana",
        "meal_type": "snack",
        "calories": 105,
        "protein_g": 1.3,
        "carbs_g": 27.0,
        "fats_g": 0.4,
        "fiber_g": 3.1,
        "sugar_g": 14.0,
        "serving_size": 120,
        "serving_unit": "g",
    },
    {
        "food_name": "Oatmeal",
        "meal_type": "breakfast",
        "calories": 300,
        "protein_g": 10.0,
        "carbs_g": 55.0,
        "fats_g": 6.0,
        "fiber_g": 8.0,
        "sugar_g": 1.0,
        "serving_size": 250,
        "serving_unit": "g",
    },
    {
        "food_name": "Mixed Nuts",
        "meal_type": "snack",
        "calories": 175,
        "protein_g": 5.0,
        "carbs_g": 6.0,
        "fats_g": 16.0,
        "fiber_g": 2.0,
        "sugar_g": 1.0,
        "serving_size": 30,
        "serving_unit": "g",
    },
    {
        "food_name": "Protein Shake",
        "meal_type": "snack",
        "calories": 220,
        "protein_g": 35.0,
        "carbs_g": 12.0,
        "fats_g": 4.0,
        "fiber_g": 2.0,
        "sugar_g": 6.0,
        "serving_size": 400,
        "serving_unit": "ml",
    },
]

ONBOARDING_DATA = {
    "gender": "male",
    "workouts_per_week": 4,
    "heard_from": "instagram",
    "used_other_apps": True,
    "height_cm": 175.0,
    "weight_kg": 78.0,
    "unit_system": "metric",
    "birth_date": "1995-06-15",
    "goal": "lose",
    "target_weight_kg": 72.0,
    "weekly_speed_kg": 0.5,
    "pain_points": ["lack_of_time", "cravings"],
    "diet_type": "classic",
    "notifications_enabled": True,
    "health_connected": False,
}


# ---------------------------------------------------------------------------
# Event hooks for aggregate reporting
# ---------------------------------------------------------------------------

_phase_stats: dict = {}


@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    """Log when the test starts."""
    logger.info("Fitsi IA Stress Test starting — host: %s", environment.host)


@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    """Log when the test ends."""
    logger.info("Fitsi IA Stress Test completed")


# ---------------------------------------------------------------------------
# Helper: get a random user index for login
# ---------------------------------------------------------------------------

def _random_user_idx() -> int:
    """Return a random seed user index (1-based)."""
    return random.randint(1, TOTAL_SEED_USERS)


def _today_str() -> str:
    return date.today().isoformat()


def _random_past_date(days_back: int = 7) -> str:
    d = date.today() - timedelta(days=random.randint(0, days_back))
    return d.isoformat()


# Fields accepted by ManualFoodLog schema
_MANUAL_FOOD_FIELDS = {"food_name", "calories", "carbs_g", "protein_g", "fats_g", "fiber_g", "serving_size", "meal_type"}


def _make_manual_meal() -> dict:
    """Pick a random meal template and format it for the ManualFoodLog API."""
    meal = random.choice(MEAL_TEMPLATES).copy()
    # Convert serving_size to string (API expects Optional[str])
    if "serving_size" in meal:
        meal["serving_size"] = str(meal["serving_size"])
    # Remove fields not in schema
    return {k: v for k, v in meal.items() if k in _MANUAL_FOOD_FIELDS}


# ---------------------------------------------------------------------------
# Base class with shared login logic
# ---------------------------------------------------------------------------

class FitsiBaseUser(HttpUser):
    """
    Abstract base — handles authentication on_start.
    Each subclass defines its own task set and timing.
    """
    abstract = True
    token: str = ""
    user_idx: int = 0
    qa_id: str = ""

    def on_start(self):
        """Login and store JWT token for subsequent requests."""
        self.user_idx = _random_user_idx()
        email = f"user_{self.user_idx:04d}@{SEED_EMAIL_DOMAIN}"

        with self.client.post(
            "/auth/login",
            data={"username": email, "password": SEED_PASSWORD},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            catch_response=True,
            name="POST /auth/login",
        ) as resp:
            if resp.status_code == 200:
                self.token = resp.json().get("access_token", "")
                resp.success()
            else:
                resp.failure(f"Login failed for {email}: {resp.status_code}")
                self.token = ""

    @property
    def auth_headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }

    def _get(self, path: str, name: str | None = None):
        """Authenticated GET."""
        if not self.token:
            return
        self.client.get(path, headers=self.auth_headers, name=name or f"GET {path}")

    def _post(self, path: str, payload: dict, name: str | None = None):
        """Authenticated POST with JSON body."""
        if not self.token:
            return
        self.client.post(
            path,
            json=payload,
            headers=self.auth_headers,
            name=name or f"POST {path}",
        )


# ===========================================================================
# Profile 1: POWER USERS (QA-USR-001 to QA-USR-010)
# Uses ALL features — heaviest load per user
# 5-10 req/min → wait 6-12s between tasks
# ===========================================================================

class FitsiPowerUser(FitsiBaseUser):
    """
    Power user — exercises every API endpoint.
    Weight ratio 3 (30% of spawned users).
    """
    wait_time = between(6, 12)
    weight = 3

    def on_start(self):
        super().on_start()
        self.qa_id = f"QA-USR-{random.randint(1, 10):03d}"

    @task(5)
    @tag("dashboard", "read")
    def dashboard_today(self):
        """GET /api/dashboard/today — most frequent action."""
        self._get("/api/dashboard/today", "GET /api/dashboard/today")

    @task(4)
    @tag("meals", "read")
    def list_meals(self):
        """GET /api/food/logs — list today's food logs."""
        self._get(
            f"/api/food/logs?date={_today_str()}",
            "GET /api/food/logs?date=[today]",
        )

    @task(3)
    @tag("meals", "write")
    def log_meal_manual(self):
        """POST /api/food/manual — log a meal manually."""
        meal = _make_manual_meal()
        self._post("/api/food/manual", meal, "POST /api/food/manual")

    @task(2)
    @tag("profile", "read")
    def get_profile(self):
        """GET /api/onboarding/profile — view user profile."""
        self._get("/api/onboarding/profile", "GET /api/onboarding/profile")

    @task(2)
    @tag("water", "write")
    def update_water(self):
        """POST /api/food/water — log water intake."""
        self._post(
            "/api/food/water",
            {"ml": random.choice([250, 330, 500, 750])},
            "POST /api/food/water",
        )

    @task(1)
    @tag("meals", "read")
    def get_history(self):
        """GET /api/food/logs — 7-day history."""
        past = _random_past_date(7)
        self._get(
            f"/api/food/logs?date={past}",
            "GET /api/food/logs?date=[past]",
        )

    @task(1)
    @tag("subscription", "read")
    def check_subscription(self):
        """GET /api/subscriptions/current — check subscription status."""
        self._get("/api/subscriptions/current", "GET /api/subscriptions/current")

    @task(1)
    @tag("meals", "read")
    def get_meals_summary(self):
        """GET /meals/summary — daily summary via meals router."""
        self._get(
            f"/meals/summary?target_date={_today_str()}",
            "GET /meals/summary",
        )

    @task(1)
    @tag("auth", "read")
    def get_me(self):
        """GET /auth/me — user info."""
        self._get("/auth/me", "GET /auth/me")

    @task(1)
    @tag("foods", "read")
    def search_foods(self):
        """GET /api/food/search — search food database."""
        queries = ["chicken", "rice", "banana", "salmon", "yogurt", "oat", "egg", "pasta"]
        self._get(
            f"/api/food/search?q={random.choice(queries)}",
            "GET /api/food/search",
        )

    @task(1)
    @tag("foods", "read")
    def list_foods(self):
        """GET /foods/ — browse food catalog."""
        self._get("/foods/?offset=0&limit=20", "GET /foods/")

    @task(1)
    @tag("nutrition", "read")
    def get_nutrition_profile(self):
        """GET /nutrition-profile/ — view nutrition targets."""
        self._get("/nutrition-profile/", "GET /nutrition-profile/")


# ===========================================================================
# Profile 2: CASUAL USERS (QA-USR-011 to QA-USR-020)
# Only dashboard + meal listing — light load
# 2-3 req/min → wait 20-30s between tasks
# ===========================================================================

class FitsiCasualUser(FitsiBaseUser):
    """
    Casual user — opens app, checks dashboard, maybe scrolls meals.
    Weight ratio 3 (30% of spawned users).
    """
    wait_time = between(20, 30)
    weight = 3

    def on_start(self):
        super().on_start()
        self.qa_id = f"QA-USR-{random.randint(11, 20):03d}"

    @task(5)
    @tag("dashboard", "read")
    def dashboard_today(self):
        """GET /api/dashboard/today."""
        self._get("/api/dashboard/today", "GET /api/dashboard/today")

    @task(3)
    @tag("meals", "read")
    def list_meals(self):
        """GET /api/food/logs — today's meals."""
        self._get(
            f"/api/food/logs?date={_today_str()}",
            "GET /api/food/logs?date=[today]",
        )

    @task(1)
    @tag("auth", "read")
    def get_me(self):
        """GET /auth/me."""
        self._get("/auth/me", "GET /auth/me")


# ===========================================================================
# Profile 3: SCANNER USERS (QA-USR-021 to QA-USR-030)
# Heavy food logging — simulates scan-heavy behavior
# 4-6 req/min → wait 10-15s between tasks
# ===========================================================================

class FitsiScannerUser(FitsiBaseUser):
    """
    Scanner user — primarily logs food via manual entry (simulating AI scan results).
    Weight ratio 2 (20% of spawned users).
    """
    wait_time = between(10, 15)
    weight = 2

    def on_start(self):
        super().on_start()
        self.qa_id = f"QA-USR-{random.randint(21, 30):03d}"

    @task(5)
    @tag("meals", "write")
    def log_meal_manual(self):
        """POST /api/food/manual — log a scanned/manual meal."""
        meal = _make_manual_meal()
        # Vary servings to simulate different portions
        multiplier = round(random.uniform(0.5, 2.5), 1)
        meal["calories"] = round(meal["calories"] * multiplier)
        meal["protein_g"] = round(meal["protein_g"] * multiplier, 1)
        meal["carbs_g"] = round(meal["carbs_g"] * multiplier, 1)
        meal["fats_g"] = round(meal["fats_g"] * multiplier, 1)
        self._post("/api/food/manual", meal, "POST /api/food/manual")

    @task(3)
    @tag("dashboard", "read")
    def dashboard_today(self):
        """GET /api/dashboard/today — check updated totals after logging."""
        self._get("/api/dashboard/today", "GET /api/dashboard/today")

    @task(2)
    @tag("meals", "read")
    def list_meals(self):
        """GET /api/food/logs — verify logged meals."""
        self._get(
            f"/api/food/logs?date={_today_str()}",
            "GET /api/food/logs?date=[today]",
        )

    @task(2)
    @tag("foods", "read")
    def search_foods(self):
        """GET /api/food/search — search before logging."""
        queries = ["chicken", "rice", "banana", "salmon", "yogurt", "oat",
                   "egg", "pasta", "steak", "tuna", "avocado", "protein"]
        self._get(
            f"/api/food/search?q={random.choice(queries)}",
            "GET /api/food/search",
        )

    @task(1)
    @tag("water", "write")
    def update_water(self):
        """POST /api/food/water."""
        self._post(
            "/api/food/water",
            {"ml": random.choice([250, 330, 500])},
            "POST /api/food/water",
        )


# ===========================================================================
# Profile 4: PROFILE BROWSERS (QA-USR-031 to QA-USR-040)
# Read-only users — browse profile, reports, progress
# 3-4 req/min → wait 15-20s between tasks
# ===========================================================================

class FitsiBrowserUser(FitsiBaseUser):
    """
    Browser user — reads profile, dashboard, history. Never writes.
    Weight ratio 1 (10% of spawned users).
    """
    wait_time = between(15, 20)
    weight = 1

    def on_start(self):
        super().on_start()
        self.qa_id = f"QA-USR-{random.randint(31, 40):03d}"

    @task(4)
    @tag("profile", "read")
    def get_profile(self):
        """GET /api/onboarding/profile."""
        self._get("/api/onboarding/profile", "GET /api/onboarding/profile")

    @task(3)
    @tag("dashboard", "read")
    def dashboard_today(self):
        """GET /api/dashboard/today."""
        self._get("/api/dashboard/today", "GET /api/dashboard/today")

    @task(3)
    @tag("meals", "read")
    def get_history_7d(self):
        """GET /api/food/logs — browse 7-day history."""
        past = _random_past_date(7)
        self._get(
            f"/api/food/logs?date={past}",
            "GET /api/food/logs?date=[past]",
        )

    @task(2)
    @tag("meals", "read")
    def get_meals_summary(self):
        """GET /meals/summary."""
        self._get(
            f"/meals/summary?target_date={_today_str()}",
            "GET /meals/summary",
        )

    @task(1)
    @tag("subscription", "read")
    def check_subscription(self):
        """GET /api/subscriptions/current."""
        self._get("/api/subscriptions/current", "GET /api/subscriptions/current")

    @task(1)
    @tag("nutrition", "read")
    def get_nutrition_profile(self):
        """GET /nutrition-profile/."""
        self._get("/nutrition-profile/", "GET /nutrition-profile/")

    @task(1)
    @tag("foods", "read")
    def list_foods(self):
        """GET /foods/ — browse catalog."""
        offset = random.randint(0, 100)
        self._get(f"/foods/?offset={offset}&limit=20", "GET /foods/")

    @task(1)
    @tag("auth", "read")
    def get_me(self):
        """GET /auth/me."""
        self._get("/auth/me", "GET /auth/me")


# ===========================================================================
# Profile 5: NEW USERS (QA-USR-041 to QA-USR-050)
# Registration + onboarding flow — slow, sequential
# 1-2 req/min → wait 30-60s between tasks
# ===========================================================================

class FitsiNewUser(FitsiBaseUser):
    """
    New user — goes through registration and onboarding.
    Weight ratio 1 (10% of spawned users).

    NOTE: Since seed users already exist, this simulates re-doing onboarding
    and checking the paywall. Registration attempts will get 409 (already exists)
    which is expected and tracked separately.
    """
    wait_time = between(30, 60)
    weight = 1

    def on_start(self):
        super().on_start()
        self.qa_id = f"QA-USR-{random.randint(41, 50):03d}"

    @task(3)
    @tag("onboarding", "write")
    def complete_onboarding(self):
        """POST /api/onboarding/save-step — submit onboarding data step by step."""
        if not self.token:
            return

        # Simulate saving onboarding steps one at a time (as the real app does)
        steps = [
            {"gender": random.choice(["male", "female"])},
            {"workouts_per_week": random.randint(0, 7)},
            {"heard_from": random.choice(["instagram", "tiktok", "friend", "google_search"])},
            {"height_cm": round(random.uniform(150, 195), 1),
             "weight_kg": round(random.uniform(50, 120), 1),
             "unit_system": "metric"},
            {"birth_date": f"{random.randint(1960, 2005)}-{random.randint(1,12):02d}-{random.randint(1,28):02d}"},
            {"goal": random.choice(["lose", "maintain", "gain"]),
             "target_weight_kg": round(random.uniform(55, 100), 1)},
            {"diet_type": random.choice(["classic", "vegetarian", "vegan", "keto"])},
        ]

        # Send 2-3 steps per "session" to simulate real user pacing
        chosen_steps = random.sample(steps, min(random.randint(2, 3), len(steps)))
        for step_data in chosen_steps:
            self._post(
                "/api/onboarding/save-step",
                step_data,
                "POST /api/onboarding/save-step",
            )
            time.sleep(random.uniform(1, 3))  # Simulate user thinking between steps

    @task(2)
    @tag("subscription", "read")
    def check_paywall(self):
        """GET /api/subscriptions/current — new users hit paywall frequently."""
        self._get("/api/subscriptions/current", "GET /api/subscriptions/current")

    @task(2)
    @tag("profile", "read")
    def get_profile(self):
        """GET /api/onboarding/profile — check their profile is saved."""
        self._get("/api/onboarding/profile", "GET /api/onboarding/profile")

    @task(1)
    @tag("dashboard", "read")
    def dashboard_today(self):
        """GET /api/dashboard/today — first look at dashboard."""
        self._get("/api/dashboard/today", "GET /api/dashboard/today")

    @task(1)
    @tag("auth", "read")
    def get_me(self):
        """GET /auth/me — verify account was created."""
        self._get("/auth/me", "GET /auth/me")

    @task(1)
    @tag("auth", "write")
    def attempt_register(self):
        """
        POST /auth/register — simulate registration attempt.
        Existing users will get 409 (expected). This tests the registration
        endpoint under load.
        """
        idx = random.randint(TOTAL_SEED_USERS + 1, TOTAL_SEED_USERS + 100000)
        email = f"stress_{idx:06d}@{SEED_EMAIL_DOMAIN}"
        with self.client.post(
            "/auth/register",
            json={
                "email": email,
                "password": SEED_PASSWORD,
                "first_name": random.choice(["Test", "Stress", "Load", "QA"]),
                "last_name": f"User{idx}",
            },
            catch_response=True,
            name="POST /auth/register",
        ) as resp:
            # Both 201 (created) and 409 (already exists) are acceptable
            if resp.status_code in (200, 201, 409):
                resp.success()
            else:
                resp.failure(f"Register failed: {resp.status_code}")
