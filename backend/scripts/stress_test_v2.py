#!/usr/bin/env python3
"""
Fitsi IA Stress Test Runner v2
==============================

A self-contained, async stress test suite for the Fitsi IA backend.
Uses only httpx (async) + standard library. No external load testing frameworks.

Usage:
    python scripts/stress_test_v2.py --scenario smoke --base-url http://localhost:8000
    python scripts/stress_test_v2.py --scenario all --base-url http://localhost:8000
    python scripts/stress_test_v2.py --scenario peak --base-url http://localhost:8000 --report-dir ./results

Scenarios:
    smoke           10 users,  1 min   -- verify endpoints work under light load
    baseline        50 users,  3 min   -- establish performance baselines
    normal         200 users,  5 min   -- simulate typical production traffic
    peak           500 users,  5 min   -- peak hour simulation
    stress        1000 users,  5 min   -- push beyond expected capacity
    spike      0->500 in 10s,  2 min   -- sudden traffic burst
    soak          200 users, 30 min   -- detect memory leaks and connection exhaustion
    ratelimit     auth hammering       -- verify rate limiting on auth endpoints
    ai_bottleneck concurrent scans     -- saturate the AI food scan pipeline
    db_exhaustion heavy DB queries     -- exhaust the database connection pool
    all           run all scenarios sequentially

Test users: user_0001@fitsi.test through user_0100@fitsi.test, password: Test1234

Prerequisites:
    pip install httpx
    python -m scripts.seed_users --count 100
    Backend server running at --base-url
"""

import argparse
import asyncio
import json
import math
import os
import random
import signal
import statistics
import sys
import time
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Optional

try:
    import httpx
except ImportError:
    print("ERROR: httpx is required. Install with: pip install httpx")
    sys.exit(1)


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SEED_EMAIL_DOMAIN = "fitsi.test"
SEED_PASSWORD = "Test1234"
TOTAL_SEED_USERS = 100

MEAL_TEMPLATES = [
    {
        "food_name": "Chicken Breast",
        "meal_type": "lunch",
        "calories": 165,
        "protein_g": 31.0,
        "carbs_g": 0.0,
        "fats_g": 3.6,
        "fiber_g": 0.0,
        "serving_size": "100",
    },
    {
        "food_name": "Brown Rice",
        "meal_type": "lunch",
        "calories": 112,
        "protein_g": 2.3,
        "carbs_g": 24.0,
        "fats_g": 0.8,
        "fiber_g": 1.8,
        "serving_size": "100",
    },
    {
        "food_name": "Greek Yogurt",
        "meal_type": "breakfast",
        "calories": 100,
        "protein_g": 17.0,
        "carbs_g": 6.0,
        "fats_g": 0.7,
        "fiber_g": 0.0,
        "serving_size": "170",
    },
    {
        "food_name": "Salmon Fillet",
        "meal_type": "dinner",
        "calories": 280,
        "protein_g": 37.0,
        "carbs_g": 0.0,
        "fats_g": 13.0,
        "fiber_g": 0.0,
        "serving_size": "150",
    },
    {
        "food_name": "Banana",
        "meal_type": "snack",
        "calories": 105,
        "protein_g": 1.3,
        "carbs_g": 27.0,
        "fats_g": 0.4,
        "fiber_g": 3.1,
        "serving_size": "120",
    },
    {
        "food_name": "Oatmeal",
        "meal_type": "breakfast",
        "calories": 300,
        "protein_g": 10.0,
        "carbs_g": 55.0,
        "fats_g": 6.0,
        "fiber_g": 8.0,
        "serving_size": "250",
    },
    {
        "food_name": "Mixed Nuts",
        "meal_type": "snack",
        "calories": 175,
        "protein_g": 5.0,
        "carbs_g": 6.0,
        "fats_g": 16.0,
        "fiber_g": 2.0,
        "serving_size": "30",
    },
    {
        "food_name": "Protein Shake",
        "meal_type": "snack",
        "calories": 220,
        "protein_g": 35.0,
        "carbs_g": 12.0,
        "fats_g": 4.0,
        "fiber_g": 2.0,
        "serving_size": "400",
    },
]

SEARCH_QUERIES = [
    "chicken", "rice", "banana", "salmon", "yogurt",
    "oat", "egg", "pasta", "steak", "tuna", "avocado", "protein",
]

# Minimal valid 1x1 red-pixel JPEG (267 bytes) for AI scan uploads
MINIMAL_JPEG = bytes([
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
    0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
    0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
    0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
    0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
    0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00,
    0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
    0x09, 0x0A, 0x0B, 0xFF, 0xC4, 0x00, 0xB5, 0x10, 0x00, 0x02, 0x01, 0x03,
    0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7D,
    0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
    0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xA1, 0x08,
    0x23, 0x42, 0xB1, 0xC1, 0x15, 0x52, 0xD1, 0xF0, 0x24, 0x33, 0x62, 0x72,
    0x82, 0x09, 0x0A, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x25, 0x26, 0x27, 0x28,
    0x29, 0x2A, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3A, 0x43, 0x44, 0x45,
    0x46, 0x47, 0x48, 0x49, 0x4A, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
    0x5A, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6A, 0x73, 0x74, 0x75,
    0x76, 0x77, 0x78, 0x79, 0x7A, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
    0x8A, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9A, 0xA2, 0xA3,
    0xA4, 0xA5, 0xA6, 0xA7, 0xA8, 0xA9, 0xAA, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6,
    0xB7, 0xB8, 0xB9, 0xBA, 0xC2, 0xC3, 0xC4, 0xC5, 0xC6, 0xC7, 0xC8, 0xC9,
    0xCA, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0xD8, 0xD9, 0xDA, 0xE1, 0xE2,
    0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA, 0xF1, 0xF2, 0xF3, 0xF4,
    0xF5, 0xF6, 0xF7, 0xF8, 0xF9, 0xFA, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01,
    0x00, 0x00, 0x3F, 0x00, 0x7B, 0x94, 0x11, 0x00, 0x00, 0x00, 0x00, 0xFF,
    0xD9,
])


# ---------------------------------------------------------------------------
# Data types
# ---------------------------------------------------------------------------

@dataclass
class RequestStat:
    """A single recorded request."""
    endpoint: str
    method: str
    status_code: int
    latency_ms: float
    timestamp: float
    error: Optional[str] = None


@dataclass
class EndpointStats:
    """Aggregated statistics for a single endpoint."""
    endpoint: str
    total_requests: int = 0
    success_count: int = 0
    fail_count: int = 0
    error_count: int = 0
    latencies_ms: list = field(default_factory=list)

    @property
    def p50(self) -> float:
        if not self.latencies_ms:
            return 0.0
        sorted_lat = sorted(self.latencies_ms)
        idx = int(len(sorted_lat) * 0.50)
        return sorted_lat[min(idx, len(sorted_lat) - 1)]

    @property
    def p95(self) -> float:
        if not self.latencies_ms:
            return 0.0
        sorted_lat = sorted(self.latencies_ms)
        idx = int(len(sorted_lat) * 0.95)
        return sorted_lat[min(idx, len(sorted_lat) - 1)]

    @property
    def p99(self) -> float:
        if not self.latencies_ms:
            return 0.0
        sorted_lat = sorted(self.latencies_ms)
        idx = int(len(sorted_lat) * 0.99)
        return sorted_lat[min(idx, len(sorted_lat) - 1)]

    @property
    def avg(self) -> float:
        if not self.latencies_ms:
            return 0.0
        return statistics.mean(self.latencies_ms)

    @property
    def min_lat(self) -> float:
        return min(self.latencies_ms) if self.latencies_ms else 0.0

    @property
    def max_lat(self) -> float:
        return max(self.latencies_ms) if self.latencies_ms else 0.0


@dataclass
class ScenarioResult:
    """Full result for a scenario run."""
    scenario: str
    started_at: str
    finished_at: str
    duration_seconds: float
    target_users: int
    total_requests: int
    total_success: int
    total_failures: int
    total_errors: int
    overall_rps: float
    endpoint_stats: dict = field(default_factory=dict)
    health_checks: list = field(default_factory=list)
    timeline: list = field(default_factory=list)


# ---------------------------------------------------------------------------
# Metrics collector (thread-safe via asyncio)
# ---------------------------------------------------------------------------

class MetricsCollector:
    """Collects and aggregates request metrics across all virtual users."""

    def __init__(self):
        self._stats: list[RequestStat] = []
        self._lock = asyncio.Lock()
        self._start_time: float = 0.0
        self._active_users: int = 0
        self._timeline: list[dict] = []

    async def record(self, stat: RequestStat):
        async with self._lock:
            self._stats.append(stat)

    async def set_active_users(self, count: int):
        async with self._lock:
            self._active_users = count

    async def get_active_users(self) -> int:
        async with self._lock:
            return self._active_users

    async def snapshot_timeline(self):
        """Take a periodic snapshot for timeline reporting."""
        async with self._lock:
            elapsed = time.time() - self._start_time if self._start_time else 0
            total = len(self._stats)
            success = sum(1 for s in self._stats if 200 <= s.status_code < 400)
            rps = total / elapsed if elapsed > 0 else 0
            self._timeline.append({
                "elapsed_s": round(elapsed, 1),
                "total_requests": total,
                "success_count": success,
                "active_users": self._active_users,
                "rps": round(rps, 1),
            })

    def start(self):
        self._start_time = time.time()

    def aggregate(self) -> dict[str, EndpointStats]:
        """Aggregate stats by endpoint name."""
        by_endpoint: dict[str, EndpointStats] = {}

        for stat in self._stats:
            key = f"{stat.method} {stat.endpoint}"
            if key not in by_endpoint:
                by_endpoint[key] = EndpointStats(endpoint=key)
            ep = by_endpoint[key]
            ep.total_requests += 1
            if stat.error:
                ep.error_count += 1
            elif 200 <= stat.status_code < 400:
                ep.success_count += 1
                ep.latencies_ms.append(stat.latency_ms)
            else:
                ep.fail_count += 1
                ep.latencies_ms.append(stat.latency_ms)

        return by_endpoint

    @property
    def total_requests(self) -> int:
        return len(self._stats)

    @property
    def total_success(self) -> int:
        return sum(1 for s in self._stats if 200 <= s.status_code < 400)

    @property
    def total_failures(self) -> int:
        return sum(1 for s in self._stats if s.status_code >= 400 and not s.error)

    @property
    def total_errors(self) -> int:
        return sum(1 for s in self._stats if s.error)

    @property
    def elapsed(self) -> float:
        return time.time() - self._start_time if self._start_time else 0

    @property
    def rps(self) -> float:
        elapsed = self.elapsed
        return self.total_requests / elapsed if elapsed > 0 else 0

    @property
    def timeline(self) -> list[dict]:
        return self._timeline


# ---------------------------------------------------------------------------
# Token cache for authenticated requests
# ---------------------------------------------------------------------------

class TokenCache:
    """Authenticates test users and caches their JWT tokens."""

    def __init__(self, base_url: str):
        self.base_url = base_url
        self._tokens: dict[str, str] = {}
        self._lock = asyncio.Lock()

    async def get_token(self, user_idx: int, client: httpx.AsyncClient) -> Optional[str]:
        """Return a cached token, or authenticate and cache it."""
        email = f"user_{user_idx:04d}@{SEED_EMAIL_DOMAIN}"

        async with self._lock:
            if email in self._tokens:
                return self._tokens[email]

        # Authenticate outside the lock to avoid blocking other users
        token = await self._authenticate(email, client)

        if token:
            async with self._lock:
                self._tokens[email] = token

        return token

    async def _authenticate(self, email: str, client: httpx.AsyncClient) -> Optional[str]:
        """Perform login and return the access token."""
        try:
            resp = await client.post(
                f"{self.base_url}/auth/login",
                data={"username": email, "password": SEED_PASSWORD},
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=30.0,
            )
            if resp.status_code == 200:
                return resp.json().get("access_token")
            return None
        except Exception:
            return None

    async def warm_up(self, count: int, client: httpx.AsyncClient):
        """Pre-authenticate a batch of users concurrently."""
        sem = asyncio.Semaphore(10)  # Limit concurrent auth requests during warmup

        async def _auth_one(idx: int):
            async with sem:
                await self.get_token(idx, client)

        tasks = [_auth_one(i) for i in range(1, min(count + 1, TOTAL_SEED_USERS + 1))]
        await asyncio.gather(*tasks, return_exceptions=True)

        cached = len(self._tokens)
        print(f"  Authenticated {cached}/{count} test users")
        if cached == 0:
            print("  WARNING: No users authenticated. Is the server running? Are test users seeded?")

    @property
    def token_count(self) -> int:
        return len(self._tokens)


# ---------------------------------------------------------------------------
# Endpoint definitions with weights
# ---------------------------------------------------------------------------

@dataclass
class EndpointDef:
    """Definition of an endpoint to test."""
    method: str
    path: str
    name: str
    weight: int = 1
    auth_required: bool = True
    body_factory: object = None   # callable() -> dict
    is_multipart: bool = False    # True for file upload endpoints


def _today() -> str:
    return date.today().isoformat()


def _random_past_date(days_back: int = 7) -> str:
    d = date.today() - timedelta(days=random.randint(0, days_back))
    return d.isoformat()


def _make_manual_meal() -> dict:
    meal = random.choice(MEAL_TEMPLATES).copy()
    multiplier = round(random.uniform(0.5, 2.5), 1)
    meal["calories"] = round(meal["calories"] * multiplier)
    meal["protein_g"] = round(meal["protein_g"] * multiplier, 1)
    meal["carbs_g"] = round(meal["carbs_g"] * multiplier, 1)
    meal["fats_g"] = round(meal["fats_g"] * multiplier, 1)
    return meal


def _water_body() -> dict:
    return {"ml": random.choice([250, 330, 500, 750])}


# Standard endpoint distribution for general traffic simulation.
# Weights approximate realistic mobile app usage patterns.
STANDARD_ENDPOINTS: list[EndpointDef] = [
    # Dashboard -- most frequent (users open the app, see daily summary)
    EndpointDef("GET", "/api/dashboard/today", "dashboard/today", weight=15),
    # Food logs -- check today's entries
    EndpointDef("GET", "/api/food/logs", "food/logs", weight=10),
    # Auth -- verify identity / refresh token
    EndpointDef("GET", "/auth/me", "auth/me", weight=5),
    # Meals summary (cached, 4-table JOIN)
    EndpointDef("GET", "/meals/summary", "meals/summary", weight=8),
    # Weekly summary (heavy 7-day aggregation)
    EndpointDef("GET", "/meals/weekly-summary", "meals/weekly-summary", weight=3),
    # Manual food logging
    EndpointDef("POST", "/api/food/manual", "food/manual", weight=6,
                body_factory=_make_manual_meal),
    # Water logging
    EndpointDef("POST", "/api/food/water", "food/water", weight=4,
                body_factory=_water_body),
    # Food search
    EndpointDef("GET", "/foods/search", "foods/search", weight=5),
    # Subscription check
    EndpointDef("GET", "/api/subscriptions/current", "subscriptions/current", weight=3),
    # Nutrition profile
    EndpointDef("GET", "/nutrition-profile/", "nutrition-profile", weight=3),
    # Favorites list
    EndpointDef("GET", "/api/favorites/", "favorites", weight=3),
    # Health check (unauthenticated, lightweight)
    EndpointDef("GET", "/health", "health", weight=2, auth_required=False),
]

# Endpoints that perform heavy DB queries for the db_exhaustion scenario
DB_HEAVY_ENDPOINTS: list[EndpointDef] = [
    EndpointDef("GET", "/meals/weekly-summary", "meals/weekly-summary", weight=5),
    EndpointDef("GET", "/api/export/my-data", "export/my-data", weight=3),
    EndpointDef("GET", "/meals/history", "meals/history-90d", weight=4),
    EndpointDef("GET", "/api/food/logs", "food/logs", weight=3),
    EndpointDef("GET", "/meals/summary", "meals/summary", weight=3),
    EndpointDef("GET", "/api/dashboard/today", "dashboard/today", weight=3),
    EndpointDef("GET", "/foods/", "foods/list-200", weight=2),
]

# Auth-focused endpoints for the ratelimit scenario
RATELIMIT_ENDPOINTS: list[EndpointDef] = [
    EndpointDef("POST", "/auth/login", "auth/login [ratelimit]", weight=10,
                auth_required=False),
    EndpointDef("POST", "/auth/register", "auth/register [ratelimit]", weight=3,
                auth_required=False),
    EndpointDef("GET", "/auth/me", "auth/me [ratelimit]", weight=5),
]

# AI-scan-heavy endpoints for the ai_bottleneck scenario
AI_BOTTLENECK_ENDPOINTS: list[EndpointDef] = [
    EndpointDef("POST", "/api/food/scan", "food/scan [ai]", weight=8,
                auth_required=True, is_multipart=True),
    EndpointDef("POST", "/api/food/manual", "food/manual [ai]", weight=5,
                body_factory=_make_manual_meal),
    EndpointDef("GET", "/api/food/logs", "food/logs [ai]", weight=3),
    EndpointDef("GET", "/foods/search", "foods/search [ai]", weight=4),
    EndpointDef("GET", "/api/dashboard/today", "dashboard/today [ai]", weight=3),
    EndpointDef("POST", "/api/food/water", "food/water [ai]", weight=2,
                body_factory=_water_body),
]


# ---------------------------------------------------------------------------
# Virtual user
# ---------------------------------------------------------------------------

class VirtualUser:
    """A simulated concurrent user that sends requests in a loop."""

    def __init__(
        self,
        user_id: int,
        base_url: str,
        token_cache: TokenCache,
        metrics: MetricsCollector,
        endpoints: list[EndpointDef],
        think_time: tuple[float, float] = (1.0, 5.0),
        scenario_name: str = "",
    ):
        self.user_id = user_id
        self.user_idx = (user_id % TOTAL_SEED_USERS) + 1
        self.base_url = base_url
        self.token_cache = token_cache
        self.metrics = metrics
        self.endpoints = endpoints
        self.think_time = think_time
        self.scenario_name = scenario_name
        self._running = True

    def stop(self):
        self._running = False

    async def run(self):
        """Main loop: pick endpoint, send request, record metrics, sleep."""
        limits = httpx.Limits(max_connections=5, max_keepalive_connections=2)
        timeout = httpx.Timeout(30.0, connect=10.0)

        async with httpx.AsyncClient(limits=limits, timeout=timeout) as client:
            # Get token for this user
            token = await self.token_cache.get_token(self.user_idx, client)

            while self._running:
                endpoint = self._pick_endpoint()
                await self._send_request(client, endpoint, token)

                # Simulate user think time between actions
                delay = random.uniform(*self.think_time)
                try:
                    await asyncio.sleep(delay)
                except asyncio.CancelledError:
                    break

    def _pick_endpoint(self) -> EndpointDef:
        """Weighted random endpoint selection."""
        weighted = []
        for ep in self.endpoints:
            weighted.extend([ep] * ep.weight)
        return random.choice(weighted)

    async def _send_request(
        self,
        client: httpx.AsyncClient,
        endpoint: EndpointDef,
        token: Optional[str],
    ):
        """Send a single request and record the result."""
        headers: dict[str, str] = {}
        if endpoint.auth_required and token:
            headers["Authorization"] = f"Bearer {token}"

        url = self._build_url(endpoint)
        body = None
        if endpoint.body_factory and not endpoint.is_multipart:
            body = endpoint.body_factory()
            headers["Content-Type"] = "application/json"

        start = time.monotonic()
        status_code = 0
        error_msg = None

        try:
            if endpoint.is_multipart:
                # File upload (AI scan)
                resp = await client.post(
                    url,
                    files={"image": ("test_food.jpg", MINIMAL_JPEG, "image/jpeg")},
                    data={"meal_type": random.choice(["breakfast", "lunch", "dinner", "snack"])},
                    headers=headers,
                )
            elif endpoint.method == "GET":
                resp = await client.get(url, headers=headers)
            elif endpoint.method == "POST":
                if endpoint.name.startswith("auth/login"):
                    # Login uses form data, not JSON
                    idx = random.randint(1, TOTAL_SEED_USERS)
                    email = f"user_{idx:04d}@{SEED_EMAIL_DOMAIN}"
                    resp = await client.post(
                        url,
                        data={"username": email, "password": SEED_PASSWORD},
                        headers={
                            **headers,
                            "Content-Type": "application/x-www-form-urlencoded",
                        },
                    )
                elif endpoint.name.startswith("auth/register"):
                    idx = random.randint(100001, 999999)
                    email = f"stress_{idx:06d}@{SEED_EMAIL_DOMAIN}"
                    resp = await client.post(
                        url,
                        json={
                            "email": email,
                            "password": "StressTest1234!",
                            "first_name": "Stress",
                            "last_name": f"User{idx}",
                        },
                        headers=headers,
                    )
                else:
                    resp = await client.post(url, json=body, headers=headers)
            else:
                resp = await client.get(url, headers=headers)

            status_code = resp.status_code

        except httpx.TimeoutException:
            error_msg = "timeout"
        except httpx.ConnectError:
            error_msg = "connection_refused"
        except httpx.ReadError:
            error_msg = "read_error"
        except httpx.PoolTimeout:
            error_msg = "pool_timeout"
        except Exception as exc:
            error_msg = f"error:{type(exc).__name__}"

        latency_ms = (time.monotonic() - start) * 1000

        stat = RequestStat(
            endpoint=endpoint.name,
            method=endpoint.method,
            status_code=status_code,
            latency_ms=round(latency_ms, 2),
            timestamp=time.time(),
            error=error_msg,
        )
        await self.metrics.record(stat)

    def _build_url(self, endpoint: EndpointDef) -> str:
        """Build the full URL with dynamic query parameters."""
        today = _today()

        if endpoint.name == "foods/search" or endpoint.name == "foods/search [ai]":
            q = random.choice(SEARCH_QUERIES)
            return f"{self.base_url}/foods/search?query={q}"

        if endpoint.name == "food/logs" or endpoint.name == "food/logs [ai]":
            return f"{self.base_url}/api/food/logs?date={today}"

        if endpoint.name == "meals/summary":
            return f"{self.base_url}/meals/summary?target_date={today}"

        if endpoint.name == "meals/weekly-summary":
            return f"{self.base_url}/meals/weekly-summary?end_date={today}"

        if endpoint.name == "meals/history-90d":
            return f"{self.base_url}/meals/history?days=90"

        if endpoint.name == "foods/list-200":
            return f"{self.base_url}/foods/?offset=0&limit=200"

        return f"{self.base_url}{endpoint.path}"


# ---------------------------------------------------------------------------
# Health monitor
# ---------------------------------------------------------------------------

class HealthMonitor:
    """Continuously polls /health in the background and records results."""

    def __init__(self, base_url: str, interval: float = 5.0):
        self.base_url = base_url
        self.interval = interval
        self._results: list[dict] = []
        self._running = True

    def stop(self):
        self._running = False

    async def run(self):
        async with httpx.AsyncClient(timeout=10.0) as client:
            while self._running:
                start = time.monotonic()
                try:
                    resp = await client.get(f"{self.base_url}/health")
                    latency = (time.monotonic() - start) * 1000
                    data = resp.json() if resp.status_code in (200, 503) else {}
                    self._results.append({
                        "timestamp": datetime.now().isoformat(),
                        "status_code": resp.status_code,
                        "latency_ms": round(latency, 2),
                        "server_status": data.get("status", "unknown"),
                        "inflight": data.get("inflight_requests", -1),
                        "db": data.get("components", {}).get("database", "unknown"),
                        "redis": data.get("components", {}).get("redis", "unknown"),
                    })
                except Exception as exc:
                    self._results.append({
                        "timestamp": datetime.now().isoformat(),
                        "status_code": 0,
                        "latency_ms": -1,
                        "error": str(exc)[:200],
                    })

                try:
                    await asyncio.sleep(self.interval)
                except asyncio.CancelledError:
                    break

    @property
    def results(self) -> list[dict]:
        return self._results


# ---------------------------------------------------------------------------
# Progress display
# ---------------------------------------------------------------------------

class ProgressDisplay:
    """Live terminal output showing test progress."""

    def __init__(self, scenario: str, metrics: MetricsCollector, duration_s: float):
        self.scenario = scenario
        self.metrics = metrics
        self.duration_s = duration_s
        self._running = True

    def stop(self):
        self._running = False

    async def run(self):
        while self._running:
            elapsed = self.metrics.elapsed
            pct = min(100, (elapsed / self.duration_s) * 100) if self.duration_s > 0 else 0
            bar_len = 30
            filled = int(bar_len * pct / 100)
            bar = "#" * filled + "-" * (bar_len - filled)

            active = await self.metrics.get_active_users()
            total = self.metrics.total_requests
            success = self.metrics.total_success
            failures = self.metrics.total_failures
            errors = self.metrics.total_errors
            rps = self.metrics.rps

            line = (
                f"\r  [{bar}] {pct:5.1f}% | "
                f"{int(elapsed):>4d}s/{int(self.duration_s)}s | "
                f"Users: {active:>4d} | "
                f"Reqs: {total:>6d} | "
                f"OK: {success:>6d} | "
                f"Fail: {failures:>4d} | "
                f"Err: {errors:>4d} | "
                f"RPS: {rps:>6.1f}"
            )
            sys.stdout.write(line)
            sys.stdout.flush()

            # Take a timeline snapshot for the JSON report
            await self.metrics.snapshot_timeline()

            try:
                await asyncio.sleep(2)
            except asyncio.CancelledError:
                break

        # Final newline after progress bar
        sys.stdout.write("\n")
        sys.stdout.flush()


# ---------------------------------------------------------------------------
# Scenario definitions
# ---------------------------------------------------------------------------

@dataclass
class ScenarioConfig:
    name: str
    target_users: int
    duration_seconds: int
    ramp_up_seconds: int = 30
    endpoints: list[EndpointDef] = field(default_factory=lambda: STANDARD_ENDPOINTS)
    think_time: tuple[float, float] = (1.0, 5.0)
    description: str = ""


SCENARIOS: dict[str, ScenarioConfig] = {
    "smoke": ScenarioConfig(
        name="smoke",
        target_users=10,
        duration_seconds=60,
        ramp_up_seconds=10,
        think_time=(2.0, 5.0),
        description="Light smoke test: 10 users, 1 minute",
    ),
    "baseline": ScenarioConfig(
        name="baseline",
        target_users=50,
        duration_seconds=180,
        ramp_up_seconds=30,
        think_time=(1.5, 4.0),
        description="Baseline measurement: 50 users, 3 minutes",
    ),
    "normal": ScenarioConfig(
        name="normal",
        target_users=200,
        duration_seconds=300,
        ramp_up_seconds=60,
        think_time=(1.0, 3.0),
        description="Normal traffic: 200 users, 5 minutes",
    ),
    "peak": ScenarioConfig(
        name="peak",
        target_users=500,
        duration_seconds=300,
        ramp_up_seconds=60,
        think_time=(0.5, 2.0),
        description="Peak hour: 500 users, 5 minutes",
    ),
    "stress": ScenarioConfig(
        name="stress",
        target_users=1000,
        duration_seconds=300,
        ramp_up_seconds=90,
        think_time=(0.3, 1.5),
        description="Stress test: 1000 users, 5 minutes",
    ),
    "spike": ScenarioConfig(
        name="spike",
        target_users=500,
        duration_seconds=120,
        ramp_up_seconds=10,
        think_time=(0.5, 2.0),
        description="Traffic spike: 0 to 500 users in 10 seconds, 2 minutes total",
    ),
    "soak": ScenarioConfig(
        name="soak",
        target_users=200,
        duration_seconds=1800,
        ramp_up_seconds=60,
        think_time=(2.0, 6.0),
        description="Soak test: 200 users sustained for 30 minutes",
    ),
    "ratelimit": ScenarioConfig(
        name="ratelimit",
        target_users=50,
        duration_seconds=120,
        ramp_up_seconds=5,
        endpoints=RATELIMIT_ENDPOINTS,
        think_time=(0.05, 0.2),
        description="Rate limit test: hammer auth endpoints (10/min login limit)",
    ),
    "ai_bottleneck": ScenarioConfig(
        name="ai_bottleneck",
        target_users=100,
        duration_seconds=180,
        ramp_up_seconds=20,
        endpoints=AI_BOTTLENECK_ENDPOINTS,
        think_time=(0.5, 1.5),
        description="AI bottleneck: concurrent food scan and manual log requests",
    ),
    "db_exhaustion": ScenarioConfig(
        name="db_exhaustion",
        target_users=300,
        duration_seconds=180,
        ramp_up_seconds=30,
        endpoints=DB_HEAVY_ENDPOINTS,
        think_time=(0.2, 1.0),
        description="DB exhaustion: heavy queries to saturate the connection pool",
    ),
}


# ---------------------------------------------------------------------------
# Scenario runner
# ---------------------------------------------------------------------------

class ScenarioRunner:
    """Orchestrates a full scenario execution with ramp-up, hold, and teardown."""

    def __init__(self, config: ScenarioConfig, base_url: str, report_dir: str):
        self.config = config
        self.base_url = base_url
        self.report_dir = report_dir
        self.metrics = MetricsCollector()
        self.token_cache = TokenCache(base_url)
        self.health_monitor = HealthMonitor(base_url, interval=5.0)
        self._users: list[VirtualUser] = []
        self._user_tasks: list[asyncio.Task] = []
        self._stop_event = asyncio.Event()
        self._started_at = ""

    async def run(self) -> ScenarioResult:
        """Execute the full scenario and return results."""
        config = self.config

        print(f"\n{'=' * 72}")
        print(f"  SCENARIO: {config.name.upper()}")
        print(f"  {config.description}")
        print(f"  Target: {config.target_users} users | "
              f"Duration: {config.duration_seconds}s | "
              f"Ramp: {config.ramp_up_seconds}s")
        print(f"{'=' * 72}")

        self._started_at = datetime.now().isoformat()

        # Phase 1: Warm up token cache
        print("\n  [1/4] Authenticating test users...")
        warm_up_count = min(config.target_users, TOTAL_SEED_USERS)
        async with httpx.AsyncClient(timeout=30.0) as client:
            await self.token_cache.warm_up(warm_up_count, client)

        if self.token_cache.token_count == 0:
            print("  ABORT: Cannot proceed without authenticated users.")
            return self._empty_result()

        # Phase 2: Start background monitors
        print("  [2/4] Starting health monitor...")
        self.metrics.start()
        health_task = asyncio.create_task(self.health_monitor.run())

        # Phase 3: Ramp up users with progress display
        print(f"  [3/4] Ramping up {config.target_users} users over "
              f"{config.ramp_up_seconds}s...")
        progress = ProgressDisplay(config.name, self.metrics, config.duration_seconds)
        progress_task = asyncio.create_task(progress.run())

        ramp_task = asyncio.create_task(
            self._ramp_up(config.target_users, config.ramp_up_seconds, config.endpoints)
        )

        # Phase 4: Hold for the configured duration
        try:
            await asyncio.wait_for(
                self._stop_event.wait(),
                timeout=config.duration_seconds,
            )
        except asyncio.TimeoutError:
            pass  # Expected: duration elapsed normally

        # Shutdown
        print("\n  [4/4] Shutting down virtual users...")
        progress.stop()
        self.health_monitor.stop()

        for user in self._users:
            user.stop()

        # Cancel all user tasks
        for task in self._user_tasks:
            task.cancel()

        # Wait for tasks to finish with a timeout
        if self._user_tasks:
            done, pending = await asyncio.wait(
                self._user_tasks, timeout=10.0, return_when=asyncio.ALL_COMPLETED
            )
            for t in pending:
                t.cancel()

        # Cancel background tasks
        for task in [ramp_task, health_task, progress_task]:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

        # Build, display, and save results
        result = self._build_result()
        self._print_summary(result)
        self._save_report(result)

        return result

    async def _ramp_up(
        self,
        target: int,
        ramp_seconds: int,
        endpoints: list[EndpointDef],
    ):
        """Progressively spawn virtual users over the ramp-up period."""
        if target <= 0:
            return

        # Calculate how many users to spawn per second
        users_per_second = target / max(1, ramp_seconds)
        interval = 1.0 / max(0.1, users_per_second) if users_per_second > 1 else 1.0
        batch_size = max(1, int(users_per_second))

        spawned = 0
        while spawned < target:
            remaining = target - spawned
            batch = min(batch_size, remaining)

            for _ in range(batch):
                user = VirtualUser(
                    user_id=spawned,
                    base_url=self.base_url,
                    token_cache=self.token_cache,
                    metrics=self.metrics,
                    endpoints=endpoints,
                    think_time=self.config.think_time,
                    scenario_name=self.config.name,
                )
                self._users.append(user)
                task = asyncio.create_task(user.run())
                self._user_tasks.append(task)
                spawned += 1

            await self.metrics.set_active_users(spawned)

            if spawned < target:
                try:
                    await asyncio.sleep(interval)
                except asyncio.CancelledError:
                    break

    def _build_result(self) -> ScenarioResult:
        """Compile the final scenario result from collected metrics."""
        aggregated = self.metrics.aggregate()
        ep_stats = {}

        for key, stats in aggregated.items():
            ep_stats[key] = {
                "total_requests": stats.total_requests,
                "success": stats.success_count,
                "failures": stats.fail_count,
                "errors": stats.error_count,
                "latency_ms": {
                    "min": round(stats.min_lat, 2),
                    "avg": round(stats.avg, 2),
                    "p50": round(stats.p50, 2),
                    "p95": round(stats.p95, 2),
                    "p99": round(stats.p99, 2),
                    "max": round(stats.max_lat, 2),
                },
                "rps": round(
                    stats.total_requests / self.metrics.elapsed
                    if self.metrics.elapsed > 0 else 0, 2
                ),
            }

        return ScenarioResult(
            scenario=self.config.name,
            started_at=self._started_at,
            finished_at=datetime.now().isoformat(),
            duration_seconds=round(self.metrics.elapsed, 2),
            target_users=self.config.target_users,
            total_requests=self.metrics.total_requests,
            total_success=self.metrics.total_success,
            total_failures=self.metrics.total_failures,
            total_errors=self.metrics.total_errors,
            overall_rps=round(self.metrics.rps, 2),
            endpoint_stats=ep_stats,
            health_checks=self.health_monitor.results,
            timeline=self.metrics.timeline,
        )

    def _empty_result(self) -> ScenarioResult:
        """Return an empty result when the scenario cannot run."""
        return ScenarioResult(
            scenario=self.config.name,
            started_at=self._started_at,
            finished_at=datetime.now().isoformat(),
            duration_seconds=0,
            target_users=self.config.target_users,
            total_requests=0,
            total_success=0,
            total_failures=0,
            total_errors=0,
            overall_rps=0,
        )

    def _print_summary(self, result: ScenarioResult):
        """Print a formatted summary table to the terminal."""
        w = 92  # table width

        print(f"\n{'=' * w}")
        print(f"  RESULTS: {result.scenario.upper()}")
        print(f"{'=' * w}")
        print(f"  Duration    : {result.duration_seconds:.1f}s")
        print(f"  Users       : {result.target_users}")
        print(f"  Total Reqs  : {result.total_requests}")
        print(f"  Success     : {result.total_success}")
        print(f"  Failures    : {result.total_failures}")
        print(f"  Errors      : {result.total_errors}")
        print(f"  Overall RPS : {result.overall_rps:.1f}")
        success_rate = (
            (result.total_success / result.total_requests * 100)
            if result.total_requests > 0 else 0
        )
        print(f"  Success Rate: {success_rate:.1f}%")

        # Per-endpoint table
        hdr = (
            f"  {'Endpoint':<38} "
            f"{'Reqs':>6} {'OK':>6} {'Fail':>5} {'Err':>4} "
            f"{'p50':>8} {'p95':>8} {'p99':>8} {'RPS':>7}"
        )
        sep = (
            f"  {'-' * 38} "
            f"{'-' * 6} {'-' * 6} {'-' * 5} {'-' * 4} "
            f"{'-' * 8} {'-' * 8} {'-' * 8} {'-' * 7}"
        )
        print(f"\n{hdr}")
        print(sep)

        for ep_name in sorted(result.endpoint_stats.keys()):
            stats = result.endpoint_stats[ep_name]
            lat = stats.get("latency_ms", {})
            # Truncate long endpoint names
            display_name = ep_name[:38]
            print(
                f"  {display_name:<38} "
                f"{stats['total_requests']:>6} "
                f"{stats['success']:>6} "
                f"{stats['failures']:>5} "
                f"{stats['errors']:>4} "
                f"{lat.get('p50', 0):>6.1f}ms"
                f"{lat.get('p95', 0):>6.1f}ms"
                f"{lat.get('p99', 0):>6.1f}ms"
                f"{stats['rps']:>6.1f}"
            )

        # Health check summary
        if result.health_checks:
            healthy = sum(
                1 for h in result.health_checks if h.get("status_code") == 200
            )
            degraded = sum(
                1 for h in result.health_checks if h.get("status_code") == 503
            )
            failed = sum(
                1 for h in result.health_checks
                if h.get("status_code", 0) not in (200, 503)
            )
            health_lats = [
                h["latency_ms"]
                for h in result.health_checks
                if h.get("latency_ms", -1) > 0
            ]
            avg_health = statistics.mean(health_lats) if health_lats else 0

            print(f"\n  Health Monitor:")
            print(
                f"    Checks: {len(result.health_checks)} | "
                f"Healthy: {healthy} | Degraded: {degraded} | Failed: {failed}"
            )
            print(f"    Avg /health latency: {avg_health:.1f}ms")

        print(f"\n{'=' * w}\n")

    def _save_report(self, result: ScenarioResult):
        """Save the full result as a JSON report file."""
        os.makedirs(self.report_dir, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"stress_{result.scenario}_{ts}.json"
        filepath = os.path.join(self.report_dir, filename)

        report = {
            "scenario": result.scenario,
            "started_at": result.started_at,
            "finished_at": result.finished_at,
            "duration_seconds": result.duration_seconds,
            "target_users": result.target_users,
            "summary": {
                "total_requests": result.total_requests,
                "total_success": result.total_success,
                "total_failures": result.total_failures,
                "total_errors": result.total_errors,
                "overall_rps": result.overall_rps,
                "success_rate_pct": round(
                    (result.total_success / result.total_requests * 100)
                    if result.total_requests > 0 else 0, 2
                ),
            },
            "endpoints": result.endpoint_stats,
            "health_checks": result.health_checks,
            "timeline": result.timeline,
        }

        with open(filepath, "w") as f:
            json.dump(report, f, indent=2, default=str)

        print(f"  Report saved: {filepath}")


# ---------------------------------------------------------------------------
# Run helpers
# ---------------------------------------------------------------------------

async def run_scenario(
    scenario_name: str, base_url: str, report_dir: str
) -> ScenarioResult:
    """Run a single scenario by name."""
    if scenario_name not in SCENARIOS:
        print(f"ERROR: Unknown scenario '{scenario_name}'")
        print(f"Available: {', '.join(sorted(SCENARIOS.keys()))}")
        sys.exit(1)

    config = SCENARIOS[scenario_name]
    runner = ScenarioRunner(config, base_url, report_dir)
    return await runner.run()


async def run_all_scenarios(base_url: str, report_dir: str):
    """Run all 10 scenarios in sequence with cooldown periods."""
    scenario_order = [
        "smoke", "baseline", "normal", "peak", "stress",
        "spike", "soak", "ratelimit", "ai_bottleneck", "db_exhaustion",
    ]

    results: list[ScenarioResult] = []

    print(f"\n{'=' * 72}")
    print("  FITSI IA STRESS TEST SUITE -- FULL RUN")
    print(f"  Running all {len(scenario_order)} scenarios sequentially")
    print(f"{'=' * 72}")

    for idx, name in enumerate(scenario_order, 1):
        print(f"\n  >>> Scenario {idx}/{len(scenario_order)}: {name}")
        result = await run_scenario(name, base_url, report_dir)
        results.append(result)

        # Brief pause between scenarios to let the server recover
        if idx < len(scenario_order):
            print("  Cooling down for 10 seconds before next scenario...")
            await asyncio.sleep(10)

    # Print aggregate summary across all scenarios
    _print_aggregate_summary(results, report_dir)


def _print_aggregate_summary(results: list[ScenarioResult], report_dir: str):
    """Print and save a combined summary of all scenario runs."""
    w = 92
    print(f"\n{'=' * w}")
    print("  AGGREGATE SUMMARY -- ALL SCENARIOS")
    print(f"{'=' * w}")

    hdr = (
        f"  {'Scenario':<16} "
        f"{'Users':>6} {'Reqs':>8} {'OK':>8} {'Fail':>6} {'Err':>5} "
        f"{'RPS':>8} {'Success%':>9}"
    )
    sep = (
        f"  {'-' * 16} "
        f"{'-' * 6} {'-' * 8} {'-' * 8} {'-' * 6} {'-' * 5} "
        f"{'-' * 8} {'-' * 9}"
    )
    print(hdr)
    print(sep)

    for r in results:
        pct = (
            (r.total_success / r.total_requests * 100)
            if r.total_requests > 0 else 0
        )
        print(
            f"  {r.scenario:<16} "
            f"{r.target_users:>6} "
            f"{r.total_requests:>8} "
            f"{r.total_success:>8} "
            f"{r.total_failures:>6} "
            f"{r.total_errors:>5} "
            f"{r.overall_rps:>7.1f} "
            f"{pct:>8.1f}%"
        )

    # Totals
    total_reqs = sum(r.total_requests for r in results)
    total_ok = sum(r.total_success for r in results)
    total_fail = sum(r.total_failures for r in results)
    total_err = sum(r.total_errors for r in results)
    total_pct = (total_ok / total_reqs * 100) if total_reqs > 0 else 0

    print(sep)
    print(
        f"  {'TOTAL':<16} "
        f"{'':>6} "
        f"{total_reqs:>8} "
        f"{total_ok:>8} "
        f"{total_fail:>6} "
        f"{total_err:>5} "
        f"{'':>8} "
        f"{total_pct:>8.1f}%"
    )
    print(f"\n{'=' * w}\n")

    # Save aggregate report
    os.makedirs(report_dir, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    agg_path = os.path.join(report_dir, f"stress_ALL_{ts}.json")
    agg_report = {
        "type": "aggregate",
        "generated_at": datetime.now().isoformat(),
        "scenarios": [
            {
                "scenario": r.scenario,
                "target_users": r.target_users,
                "duration_seconds": r.duration_seconds,
                "total_requests": r.total_requests,
                "total_success": r.total_success,
                "total_failures": r.total_failures,
                "total_errors": r.total_errors,
                "overall_rps": r.overall_rps,
                "success_rate_pct": round(
                    (r.total_success / r.total_requests * 100)
                    if r.total_requests > 0 else 0, 2
                ),
            }
            for r in results
        ],
        "totals": {
            "total_requests": total_reqs,
            "total_success": total_ok,
            "total_failures": total_fail,
            "total_errors": total_err,
            "success_rate_pct": round(total_pct, 2),
        },
    }
    with open(agg_path, "w") as f:
        json.dump(agg_report, f, indent=2, default=str)
    print(f"  Aggregate report saved: {agg_path}")


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Fitsi IA Stress Test Runner v2",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Scenarios:
  smoke           10 users,  1 min   -- verify endpoints work under light load
  baseline        50 users,  3 min   -- establish performance baselines
  normal         200 users,  5 min   -- simulate typical production traffic
  peak           500 users,  5 min   -- peak hour simulation
  stress        1000 users,  5 min   -- push beyond expected capacity
  spike      0->500 in 10s,  2 min   -- sudden traffic burst
  soak          200 users, 30 min   -- detect memory leaks, connection exhaustion
  ratelimit     auth hammering       -- verify rate limiting on auth endpoints
  ai_bottleneck concurrent scans     -- saturate the AI food scan pipeline
  db_exhaustion heavy DB queries     -- exhaust the database connection pool
  all           run all scenarios sequentially

Examples:
  python scripts/stress_test_v2.py --scenario smoke --base-url http://localhost:8000
  python scripts/stress_test_v2.py --scenario all --base-url http://localhost:8000
  python scripts/stress_test_v2.py --scenario peak --report-dir ./my_results
""",
    )
    parser.add_argument(
        "--scenario",
        required=True,
        choices=list(SCENARIOS.keys()) + ["all"],
        help="Scenario to run (or 'all' for sequential full run)",
    )
    parser.add_argument(
        "--base-url",
        default="http://localhost:8000",
        help="Base URL of the Fitsi IA backend (default: http://localhost:8000)",
    )
    parser.add_argument(
        "--report-dir",
        default="results",
        help="Directory for JSON reports (default: results/)",
    )

    args = parser.parse_args()

    # Handle graceful shutdown on Ctrl+C
    def _signal_handler(sig, frame):
        print("\n\n  Interrupted by user. Shutting down...")
        sys.exit(0)

    signal.signal(signal.SIGINT, _signal_handler)

    # Print banner
    print(f"\n{'=' * 72}")
    print("  FITSI IA STRESS TEST RUNNER v2")
    print(f"  Target : {args.base_url}")
    print(f"  Scenario: {args.scenario}")
    print(f"  Reports : {os.path.abspath(args.report_dir)}/")
    print(f"  Users   : user_0001@{SEED_EMAIL_DOMAIN} .. "
          f"user_{TOTAL_SEED_USERS:04d}@{SEED_EMAIL_DOMAIN}")
    print(f"{'=' * 72}")

    if args.scenario == "all":
        asyncio.run(run_all_scenarios(args.base_url, args.report_dir))
    else:
        asyncio.run(run_scenario(args.scenario, args.base_url, args.report_dir))


if __name__ == "__main__":
    main()
