#!/usr/bin/env python3
"""
Fitsi IA -- Database Connection Pool Saturation Stress Test
===========================================================

Specialized stress test targeting PostgreSQL connection pool exhaustion.
Tests the boundary conditions of the SQLAlchemy async pool:

    pool_size=20 + max_overflow=40 = 60 max connections
    pool_timeout=30 seconds

Four scenarios probe different failure modes:

    1. pool_exhaustion  -- 100 concurrent heavy queries to exceed 60 connections
    2. slow_query_cascade -- /export/my-data blocks /dashboard/today
    3. cache_miss_storm -- 50 users hit dashboard at exact same moment (cold cache)
    4. write_storm -- 100 concurrent POST writes testing for deadlocks

Usage:
    cd backend/

    # Run all scenarios
    python -m scripts.stress_db_saturation

    # Run a single scenario
    python -m scripts.stress_db_saturation --scenario pool_exhaustion
    python -m scripts.stress_db_saturation --scenario slow_query_cascade
    python -m scripts.stress_db_saturation --scenario cache_miss_storm
    python -m scripts.stress_db_saturation --scenario write_storm

    # Custom concurrency and target
    python -m scripts.stress_db_saturation --base-url http://staging.fitsi.app --users 200

Prerequisites:
    pip install httpx
    python -m scripts.seed_users --count 1000
    Backend running at --base-url (default http://localhost:8000)
"""

import argparse
import asyncio
import json
import logging
import os
import random
import statistics
import sys
import time
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional

import httpx

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("db_saturation")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SEED_EMAIL_DOMAIN = "fitsi.test"
SEED_PASSWORD = "Test1234"
TOTAL_SEED_USERS = 1000
DEFAULT_BASE_URL = "http://localhost:8000"

# Pool constants (must match app/core/database.py + app/core/config.py)
POOL_SIZE = 20
MAX_OVERFLOW = 40
POOL_MAX = POOL_SIZE + MAX_OVERFLOW  # 60
POOL_TIMEOUT = 30  # seconds

# Meal templates for write storm
MEAL_TEMPLATES = [
    {"food_name": "Chicken Breast", "meal_type": "lunch", "calories": 165,
     "protein_g": 31.0, "carbs_g": 0.0, "fats_g": 3.6, "fiber_g": 0.0},
    {"food_name": "Brown Rice", "meal_type": "lunch", "calories": 112,
     "protein_g": 2.3, "carbs_g": 24.0, "fats_g": 0.8, "fiber_g": 1.8},
    {"food_name": "Greek Yogurt", "meal_type": "breakfast", "calories": 100,
     "protein_g": 17.0, "carbs_g": 6.0, "fats_g": 0.7, "fiber_g": 0.0},
    {"food_name": "Salmon Fillet", "meal_type": "dinner", "calories": 280,
     "protein_g": 37.0, "carbs_g": 0.0, "fats_g": 13.0, "fiber_g": 0.0},
    {"food_name": "Banana", "meal_type": "snack", "calories": 105,
     "protein_g": 1.3, "carbs_g": 27.0, "fats_g": 0.4, "fiber_g": 3.1},
    {"food_name": "Oatmeal", "meal_type": "breakfast", "calories": 300,
     "protein_g": 10.0, "carbs_g": 55.0, "fats_g": 6.0, "fiber_g": 8.0},
    {"food_name": "Mixed Nuts", "meal_type": "snack", "calories": 175,
     "protein_g": 5.0, "carbs_g": 6.0, "fats_g": 16.0, "fiber_g": 2.0},
    {"food_name": "Protein Shake", "meal_type": "snack", "calories": 220,
     "protein_g": 35.0, "carbs_g": 12.0, "fats_g": 4.0, "fiber_g": 2.0},
]


# ---------------------------------------------------------------------------
# Data classes for result tracking
# ---------------------------------------------------------------------------

@dataclass
class RequestResult:
    """Single request outcome."""
    endpoint: str
    status_code: int
    latency_ms: float
    error: Optional[str] = None
    timed_out: bool = False
    wave: int = 0


@dataclass
class WaveResult:
    """Results for one wave of concurrent requests."""
    wave_number: int
    concurrency: int
    results: list = field(default_factory=list)
    start_time: float = 0.0
    end_time: float = 0.0

    @property
    def duration_s(self) -> float:
        return self.end_time - self.start_time

    @property
    def latencies(self) -> list:
        return [r.latency_ms for r in self.results if not r.timed_out]

    @property
    def timeout_count(self) -> int:
        return sum(1 for r in self.results if r.timed_out)

    @property
    def error_5xx_count(self) -> int:
        return sum(1 for r in self.results if r.status_code >= 500)

    @property
    def error_rate(self) -> float:
        total = len(self.results)
        if total == 0:
            return 0.0
        errors = sum(1 for r in self.results
                     if r.timed_out or r.status_code >= 500)
        return errors / total

    def summary_dict(self) -> dict:
        lats = self.latencies
        return {
            "wave": self.wave_number,
            "concurrency": self.concurrency,
            "total_requests": len(self.results),
            "success_count": sum(1 for r in self.results
                                 if 200 <= r.status_code < 400 and not r.timed_out),
            "timeout_count": self.timeout_count,
            "error_5xx_count": self.error_5xx_count,
            "error_rate_pct": round(self.error_rate * 100, 2),
            "latency_p50_ms": round(statistics.median(lats), 1) if lats else None,
            "latency_p95_ms": round(sorted(lats)[int(len(lats) * 0.95)] if lats else 0, 1),
            "latency_p99_ms": round(sorted(lats)[int(len(lats) * 0.99)] if lats else 0, 1),
            "latency_max_ms": round(max(lats), 1) if lats else None,
            "latency_mean_ms": round(statistics.mean(lats), 1) if lats else None,
            "duration_s": round(self.duration_s, 2),
        }


@dataclass
class ScenarioReport:
    """Full report for one scenario run."""
    scenario: str
    started_at: str
    finished_at: str = ""
    waves: list = field(default_factory=list)
    breaking_point: Optional[dict] = None
    estimated_max_connections: int = 0
    verdict: str = "UNKNOWN"

    def to_dict(self) -> dict:
        return {
            "scenario": self.scenario,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "total_waves": len(self.waves),
            "waves": [w.summary_dict() for w in self.waves],
            "breaking_point": self.breaking_point,
            "estimated_max_connections": self.estimated_max_connections,
            "verdict": self.verdict,
        }


# ---------------------------------------------------------------------------
# Auth helper -- login and cache tokens
# ---------------------------------------------------------------------------

_token_cache: dict[int, str] = {}


async def get_auth_token(client: httpx.AsyncClient, base_url: str, user_idx: int) -> str:
    """Login as seed user and return JWT. Caches tokens to avoid re-auth overhead."""
    if user_idx in _token_cache:
        return _token_cache[user_idx]

    email = f"user_{user_idx:04d}@{SEED_EMAIL_DOMAIN}"
    try:
        resp = await client.post(
            f"{base_url}/auth/login",
            data={"username": email, "password": SEED_PASSWORD},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=15.0,
        )
        if resp.status_code == 200:
            token = resp.json().get("access_token", "")
            _token_cache[user_idx] = token
            return token
    except Exception as exc:
        logger.warning("Auth failed for user %d: %s", user_idx, exc)
    return ""


async def _pre_auth(client: httpx.AsyncClient, base_url: str, count: int) -> None:
    """Pre-authenticate users so auth latency does not pollute test results."""
    sem = asyncio.Semaphore(20)

    async def _auth_one(idx: int):
        async with sem:
            await get_auth_token(client, base_url, idx)

    tasks = [_auth_one(i) for i in range(1, min(count + 1, TOTAL_SEED_USERS + 1))]
    await asyncio.gather(*tasks)
    ok = sum(1 for i in range(1, count + 1) if i in _token_cache)
    logger.info("Pre-authenticated %d/%d users", ok, count)


# ---------------------------------------------------------------------------
# Request helpers
# ---------------------------------------------------------------------------

def _random_user_idx(max_users: int) -> int:
    return random.randint(1, min(max_users, TOTAL_SEED_USERS))


def _today_str() -> str:
    return date.today().isoformat()


def _random_meal() -> dict:
    meal = random.choice(MEAL_TEMPLATES).copy()
    multiplier = round(random.uniform(0.5, 2.5), 1)
    meal["calories"] = round(meal["calories"] * multiplier)
    meal["protein_g"] = round(meal["protein_g"] * multiplier, 1)
    meal["carbs_g"] = round(meal["carbs_g"] * multiplier, 1)
    meal["fats_g"] = round(meal["fats_g"] * multiplier, 1)
    return meal


async def _make_request(
    client: httpx.AsyncClient,
    base_url: str,
    method: str,
    path: str,
    token: str,
    wave: int = 0,
    timeout_s: float = 60.0,
    json_body: Optional[dict] = None,
) -> RequestResult:
    """Execute a single HTTP request and return structured result."""
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    url = f"{base_url}{path}"
    t0 = time.monotonic()
    try:
        if method == "GET":
            resp = await client.get(url, headers=headers, timeout=timeout_s)
        elif method == "POST":
            resp = await client.post(url, headers=headers, json=json_body, timeout=timeout_s)
        else:
            resp = await client.request(method, url, headers=headers, timeout=timeout_s)
        elapsed = (time.monotonic() - t0) * 1000
        return RequestResult(
            endpoint=f"{method} {path}",
            status_code=resp.status_code,
            latency_ms=elapsed,
            wave=wave,
        )
    except httpx.TimeoutException:
        elapsed = (time.monotonic() - t0) * 1000
        return RequestResult(
            endpoint=f"{method} {path}",
            status_code=0,
            latency_ms=elapsed,
            timed_out=True,
            error="timeout",
            wave=wave,
        )
    except httpx.ConnectError as exc:
        elapsed = (time.monotonic() - t0) * 1000
        return RequestResult(
            endpoint=f"{method} {path}",
            status_code=0,
            latency_ms=elapsed,
            error=f"connect_error: {exc}",
            wave=wave,
        )
    except Exception as exc:
        elapsed = (time.monotonic() - t0) * 1000
        return RequestResult(
            endpoint=f"{method} {path}",
            status_code=0,
            latency_ms=elapsed,
            error=str(exc),
            wave=wave,
        )


# ---------------------------------------------------------------------------
# Terminal rendering
# ---------------------------------------------------------------------------

class Colors:
    HEADER = "\033[95m"
    BLUE = "\033[94m"
    CYAN = "\033[96m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    RED = "\033[91m"
    DIM = "\033[2m"
    BOLD = "\033[1m"
    END = "\033[0m"

    @staticmethod
    def disable():
        for attr in ("HEADER", "BLUE", "CYAN", "GREEN", "YELLOW", "RED", "DIM", "BOLD", "END"):
            setattr(Colors, attr, "")


def _bar(pct: float, width: int = 40) -> str:
    """Render a colored progress bar."""
    filled = int(width * min(pct, 1.0))
    if pct < 0.05:
        color = Colors.GREEN
    elif pct < 0.20:
        color = Colors.YELLOW
    else:
        color = Colors.RED
    return f"{color}{'#' * filled}{Colors.DIM}{'.' * (width - filled)}{Colors.END}"


def _print_wave_live(wave: WaveResult) -> None:
    """Print a single-line wave summary."""
    summary = wave.summary_dict()
    err_rate = summary["error_rate_pct"]
    p50 = summary["latency_p50_ms"] or 0
    p99 = summary["latency_p99_ms"] or 0
    timeouts = summary["timeout_count"]

    bar = _bar(err_rate / 100.0)
    err_color = Colors.GREEN if err_rate < 1 else (Colors.YELLOW if err_rate < 5 else Colors.RED)

    print(
        f"  Wave {summary['wave']:>3d} | "
        f"c={summary['concurrency']:>4d} | "
        f"p50={p50:>7.0f}ms | "
        f"p99={p99:>8.0f}ms | "
        f"5xx={summary['error_5xx_count']:>3d} | "
        f"T/O={timeouts:>3d} | "
        f"err={err_color}{err_rate:>5.1f}%{Colors.END} | "
        f"{bar}"
    )


def _print_banner(title: str) -> None:
    width = 72
    print()
    print(f"{Colors.BOLD}{'=' * width}{Colors.END}")
    print(f"{Colors.BOLD}  {title}{Colors.END}")
    print(f"{Colors.BOLD}{'=' * width}{Colors.END}")
    print()


def _print_section(title: str) -> None:
    print(f"\n{Colors.CYAN}--- {title} ---{Colors.END}")


def _print_verdict(report: ScenarioReport) -> None:
    if report.verdict == "PASS":
        color = Colors.GREEN
    elif report.verdict == "DEGRADED":
        color = Colors.YELLOW
    else:
        color = Colors.RED
    print(f"\n  {Colors.BOLD}Verdict: {color}{report.verdict}{Colors.END}")
    if report.breaking_point:
        bp = report.breaking_point
        print(
            f"  Breaking point: wave {bp['wave']} "
            f"(concurrency={bp['concurrency']}, "
            f"error_rate={bp['error_rate_pct']:.1f}%, "
            f"p99={bp['latency_p99_ms']}ms)"
        )
    print(f"  Estimated peak DB connections: ~{report.estimated_max_connections}")


# ---------------------------------------------------------------------------
# Scenario 1: Connection Pool Exhaustion
# ---------------------------------------------------------------------------

async def scenario_pool_exhaustion(
    client: httpx.AsyncClient,
    base_url: str,
    max_users: int,
) -> ScenarioReport:
    """
    Fire waves of increasing concurrency against heavy endpoints.
    Each wave uses a mix of:
        GET /api/dashboard/today    (4-table JOIN)
        GET /meals/weekly-summary   (7-day aggregation)
        GET /api/risk/summary       (nutrition risk computation)

    Waves: 10, 20, 30, 40, 50, 60, 70, 80, 100, 120, 150
    We expect failures around concurrency 60 (pool max).
    """
    _print_section("Scenario 1: Connection Pool Exhaustion")
    print(f"  Pool config: size={POOL_SIZE} + overflow={MAX_OVERFLOW} = {POOL_MAX} max")
    print(f"  Pool timeout: {POOL_TIMEOUT}s")
    print(f"  Strategy: ramp concurrency until error_rate > 5%")
    print()

    report = ScenarioReport(
        scenario="pool_exhaustion",
        started_at=datetime.now().isoformat(),
    )

    # Endpoint mix weighted toward heaviest queries
    heavy_endpoints = [
        ("GET", f"/api/dashboard/today"),
        ("GET", f"/meals/weekly-summary?end_date={_today_str()}"),
        ("GET", "/api/risk/summary"),
    ]

    concurrency_levels = [10, 20, 30, 40, 50, 60, 70, 80, 100, 120, 150]
    if max_users > 150:
        concurrency_levels.append(max_users)

    for wave_num, concurrency in enumerate(concurrency_levels, 1):
        wave = WaveResult(wave_number=wave_num, concurrency=concurrency)
        wave.start_time = time.monotonic()

        tasks = []
        for i in range(concurrency):
            user_idx = _random_user_idx(max_users)
            token = _token_cache.get(user_idx, "")
            if not token:
                continue
            method, path = random.choice(heavy_endpoints)
            tasks.append(
                _make_request(client, base_url, method, path, token,
                              wave=wave_num, timeout_s=POOL_TIMEOUT + 10)
            )

        results = await asyncio.gather(*tasks)
        wave.results = list(results)
        wave.end_time = time.monotonic()
        report.waves.append(wave)

        _print_wave_live(wave)

        # Estimate connections: concurrent requests that have not timed out
        active = sum(1 for r in results if not r.timed_out and r.status_code != 0)
        report.estimated_max_connections = max(report.estimated_max_connections, active)

        # Detect breaking point
        if wave.error_rate > 0.05 and report.breaking_point is None:
            report.breaking_point = wave.summary_dict()

        # Short pause between waves to let pool drain partially
        await asyncio.sleep(1.0)

    # Verdict
    if report.breaking_point is None:
        report.verdict = "PASS"
    elif report.breaking_point["concurrency"] > POOL_MAX:
        report.verdict = "DEGRADED"
    else:
        report.verdict = "FAIL"

    report.finished_at = datetime.now().isoformat()
    _print_verdict(report)
    return report


# ---------------------------------------------------------------------------
# Scenario 2: Slow Query Cascade
# ---------------------------------------------------------------------------

async def scenario_slow_query_cascade(
    client: httpx.AsyncClient,
    base_url: str,
    max_users: int,
) -> ScenarioReport:
    """
    Test whether a slow endpoint (/api/export/my-data, 10-30s) starves
    connection pool for fast endpoints (/api/dashboard/today, <500ms).

    Phase A: 10 concurrent export requests (hold connections for 10-30s)
    Phase B: While exports run, fire 50 dashboard requests
    Phase C: Fire 50 more dashboard requests after exports finish (baseline)

    Compare Phase B latencies vs Phase C latencies.
    """
    _print_section("Scenario 2: Slow Query Cascade")
    print("  Testing: /api/export/my-data (slow) blocking /api/dashboard/today (fast)")
    print("  Phase A: 10 concurrent exports, Phase B: 50 dashboard (concurrent)")
    print("  Phase C: 50 dashboard (after exports, baseline)")
    print()

    report = ScenarioReport(
        scenario="slow_query_cascade",
        started_at=datetime.now().isoformat(),
    )

    # Phase A + B: exports and dashboards run concurrently
    export_tasks = []
    for i in range(10):
        user_idx = _random_user_idx(max_users)
        token = _token_cache.get(user_idx, "")
        if token:
            export_tasks.append(
                _make_request(client, base_url, "GET", "/api/export/my-data",
                              token, wave=1, timeout_s=90.0)
            )

    dashboard_tasks_b = []
    for i in range(50):
        user_idx = _random_user_idx(max_users)
        token = _token_cache.get(user_idx, "")
        if token:
            dashboard_tasks_b.append(
                _make_request(client, base_url, "GET", "/api/dashboard/today",
                              token, wave=2, timeout_s=POOL_TIMEOUT + 10)
            )

    # Start exports, wait 2s for them to occupy connections, then fire dashboards
    wave_a = WaveResult(wave_number=1, concurrency=10)
    wave_a.start_time = time.monotonic()

    export_futures = [asyncio.ensure_future(t) for t in export_tasks]

    # Brief wait to let exports begin consuming connections
    await asyncio.sleep(2.0)

    # Phase B: dashboards while exports are running
    wave_b = WaveResult(wave_number=2, concurrency=50)
    wave_b.start_time = time.monotonic()
    dashboard_results_b = await asyncio.gather(*dashboard_tasks_b)
    wave_b.results = list(dashboard_results_b)
    wave_b.end_time = time.monotonic()

    # Wait for exports to finish
    export_results = await asyncio.gather(*export_futures)
    wave_a.results = list(export_results)
    wave_a.end_time = time.monotonic()

    report.waves.append(wave_a)
    report.waves.append(wave_b)

    print("  Phase A (exports):")
    _print_wave_live(wave_a)
    print("  Phase B (dashboard during exports):")
    _print_wave_live(wave_b)

    # Phase C: dashboards with no contention (baseline)
    await asyncio.sleep(3.0)
    dashboard_tasks_c = []
    for i in range(50):
        user_idx = _random_user_idx(max_users)
        token = _token_cache.get(user_idx, "")
        if token:
            dashboard_tasks_c.append(
                _make_request(client, base_url, "GET", "/api/dashboard/today",
                              token, wave=3, timeout_s=POOL_TIMEOUT + 10)
            )

    wave_c = WaveResult(wave_number=3, concurrency=50)
    wave_c.start_time = time.monotonic()
    dashboard_results_c = await asyncio.gather(*dashboard_tasks_c)
    wave_c.results = list(dashboard_results_c)
    wave_c.end_time = time.monotonic()

    report.waves.append(wave_c)

    print("  Phase C (dashboard baseline, no contention):")
    _print_wave_live(wave_c)

    # Analysis: compare phase B vs C
    b_lats = wave_b.latencies
    c_lats = wave_c.latencies
    if b_lats and c_lats:
        b_p50 = statistics.median(b_lats)
        c_p50 = statistics.median(c_lats)
        degradation = (b_p50 - c_p50) / c_p50 * 100 if c_p50 > 0 else 0

        print(f"\n  {Colors.BOLD}Impact analysis:{Colors.END}")
        print(f"    Dashboard p50 during exports:  {b_p50:.0f}ms")
        print(f"    Dashboard p50 baseline:        {c_p50:.0f}ms")
        if degradation > 0:
            color = Colors.YELLOW if degradation < 100 else Colors.RED
            print(f"    Degradation: {color}{degradation:+.1f}%{Colors.END}")
        else:
            print(f"    Degradation: {Colors.GREEN}{degradation:+.1f}%{Colors.END}")

        report.breaking_point = {
            "dashboard_p50_during_exports_ms": round(b_p50, 1),
            "dashboard_p50_baseline_ms": round(c_p50, 1),
            "degradation_pct": round(degradation, 1),
            "export_timeout_count": wave_a.timeout_count,
            "dashboard_timeout_during_exports": wave_b.timeout_count,
        }

        if degradation > 200 or wave_b.error_rate > 0.05:
            report.verdict = "FAIL"
        elif degradation > 50:
            report.verdict = "DEGRADED"
        else:
            report.verdict = "PASS"
    else:
        report.verdict = "INSUFFICIENT_DATA"

    report.estimated_max_connections = max(
        10 + sum(1 for r in dashboard_results_b if not r.timed_out),
        report.estimated_max_connections,
    )
    report.finished_at = datetime.now().isoformat()
    _print_verdict(report)
    return report


# ---------------------------------------------------------------------------
# Scenario 3: Cache Miss Storm
# ---------------------------------------------------------------------------

async def scenario_cache_miss_storm(
    client: httpx.AsyncClient,
    base_url: str,
    max_users: int,
) -> ScenarioReport:
    """
    Simulate cache expiry for /api/dashboard/today.

    Burst 1: 50 requests at same instant (all cache misses -> DB queries)
    Burst 2: 50 requests immediately after (should hit cache, fast)
    Burst 3: 50 requests 1s later (confirm cache is stable)

    Measures the thundering-herd effect on the connection pool.
    """
    _print_section("Scenario 3: Cache Miss Storm")
    print("  Simulating cache expiry with 50 concurrent users hitting /api/dashboard/today")
    print("  Burst 1: all cache misses (thundering herd)")
    print("  Burst 2: immediate re-hit (should be cached)")
    print("  Burst 3: 1s later (stable cache)")
    print()

    report = ScenarioReport(
        scenario="cache_miss_storm",
        started_at=datetime.now().isoformat(),
    )

    # Use the same set of users for all bursts to ensure same cache keys
    user_indices = [_random_user_idx(max_users) for _ in range(50)]

    for burst_num in range(1, 4):
        tasks = []
        for idx in user_indices:
            token = _token_cache.get(idx, "")
            if token:
                tasks.append(
                    _make_request(client, base_url, "GET", "/api/dashboard/today",
                                  token, wave=burst_num, timeout_s=POOL_TIMEOUT + 10)
                )

        wave = WaveResult(wave_number=burst_num, concurrency=len(tasks))
        wave.start_time = time.monotonic()
        results = await asyncio.gather(*tasks)
        wave.results = list(results)
        wave.end_time = time.monotonic()
        report.waves.append(wave)

        label = ["cache miss (cold)", "immediate re-hit", "stable cache"][burst_num - 1]
        print(f"  Burst {burst_num} ({label}):")
        _print_wave_live(wave)

        if burst_num == 1:
            report.estimated_max_connections = max(
                report.estimated_max_connections,
                sum(1 for r in results if not r.timed_out),
            )
            # No pause -- burst 2 is immediate
        elif burst_num == 2:
            await asyncio.sleep(1.0)

    # Analysis
    bursts = report.waves
    if len(bursts) == 3:
        b1_lats = bursts[0].latencies
        b2_lats = bursts[1].latencies
        b3_lats = bursts[2].latencies

        if b1_lats and b2_lats:
            b1_p50 = statistics.median(b1_lats)
            b2_p50 = statistics.median(b2_lats)
            speedup = b1_p50 / b2_p50 if b2_p50 > 0 else 0

            print(f"\n  {Colors.BOLD}Cache effect:{Colors.END}")
            print(f"    Burst 1 (miss) p50: {b1_p50:.0f}ms")
            print(f"    Burst 2 (hit)  p50: {b2_p50:.0f}ms")
            print(f"    Cache speedup: {Colors.GREEN}{speedup:.1f}x{Colors.END}")

            report.breaking_point = {
                "cache_miss_p50_ms": round(b1_p50, 1),
                "cache_hit_p50_ms": round(b2_p50, 1),
                "speedup_factor": round(speedup, 1),
                "burst1_timeouts": bursts[0].timeout_count,
                "burst1_5xx": bursts[0].error_5xx_count,
            }

            if bursts[0].error_rate > 0.05:
                report.verdict = "FAIL"
            elif b1_p50 > 5000:
                report.verdict = "DEGRADED"
            else:
                report.verdict = "PASS"
        else:
            report.verdict = "INSUFFICIENT_DATA"
    else:
        report.verdict = "INSUFFICIENT_DATA"

    report.finished_at = datetime.now().isoformat()
    _print_verdict(report)
    return report


# ---------------------------------------------------------------------------
# Scenario 4: Write Storm
# ---------------------------------------------------------------------------

async def scenario_write_storm(
    client: httpx.AsyncClient,
    base_url: str,
    max_users: int,
) -> ScenarioReport:
    """
    Concurrent write operations testing for deadlocks and constraint violations.

    Wave 1: 50 concurrent POST /api/food/manual (meal logging)
    Wave 2: 50 concurrent POST /api/food/water  (water logging)
    Wave 3: 50 manual + 50 water simultaneously (mixed writes)
    Wave 4: 100 mixed writes (double pressure)

    Track: deadlocks (HTTP 500 with specific error), constraint violations (409/422).
    """
    _print_section("Scenario 4: Write Storm")
    print("  Testing concurrent writes for deadlocks and constraint violations")
    print("  Wave 1: 50x POST /api/food/manual")
    print("  Wave 2: 50x POST /api/food/water")
    print("  Wave 3: 50 manual + 50 water (mixed)")
    print("  Wave 4: 100 mixed writes (max pressure)")
    print()

    report = ScenarioReport(
        scenario="write_storm",
        started_at=datetime.now().isoformat(),
    )

    async def _food_manual_request(user_idx: int, wave: int) -> RequestResult:
        token = _token_cache.get(user_idx, "")
        if not token:
            return RequestResult(endpoint="POST /api/food/manual", status_code=0,
                                 latency_ms=0, error="no_token", wave=wave)
        return await _make_request(
            client, base_url, "POST", "/api/food/manual",
            token, wave=wave, timeout_s=30.0, json_body=_random_meal(),
        )

    async def _water_request(user_idx: int, wave: int) -> RequestResult:
        token = _token_cache.get(user_idx, "")
        if not token:
            return RequestResult(endpoint="POST /api/food/water", status_code=0,
                                 latency_ms=0, error="no_token", wave=wave)
        return await _make_request(
            client, base_url, "POST", "/api/food/water",
            token, wave=wave, timeout_s=30.0,
            json_body={"ml": random.choice([250, 330, 500, 750])},
        )

    # Wave 1: 50 meal writes
    wave1 = WaveResult(wave_number=1, concurrency=50)
    wave1.start_time = time.monotonic()
    results1 = await asyncio.gather(
        *[_food_manual_request(_random_user_idx(max_users), 1) for _ in range(50)]
    )
    wave1.results = list(results1)
    wave1.end_time = time.monotonic()
    report.waves.append(wave1)
    print("  Wave 1 (50x food/manual):")
    _print_wave_live(wave1)

    await asyncio.sleep(0.5)

    # Wave 2: 50 water writes
    wave2 = WaveResult(wave_number=2, concurrency=50)
    wave2.start_time = time.monotonic()
    results2 = await asyncio.gather(
        *[_water_request(_random_user_idx(max_users), 2) for _ in range(50)]
    )
    wave2.results = list(results2)
    wave2.end_time = time.monotonic()
    report.waves.append(wave2)
    print("  Wave 2 (50x food/water):")
    _print_wave_live(wave2)

    await asyncio.sleep(0.5)

    # Wave 3: 50 manual + 50 water mixed
    wave3 = WaveResult(wave_number=3, concurrency=100)
    wave3.start_time = time.monotonic()
    mixed_tasks = []
    for _ in range(50):
        mixed_tasks.append(_food_manual_request(_random_user_idx(max_users), 3))
        mixed_tasks.append(_water_request(_random_user_idx(max_users), 3))
    results3 = await asyncio.gather(*mixed_tasks)
    wave3.results = list(results3)
    wave3.end_time = time.monotonic()
    report.waves.append(wave3)
    print("  Wave 3 (50 manual + 50 water mixed):")
    _print_wave_live(wave3)

    await asyncio.sleep(0.5)

    # Wave 4: 100 mixed (double pressure)
    wave4 = WaveResult(wave_number=4, concurrency=200)
    wave4.start_time = time.monotonic()
    mixed_tasks_2 = []
    for _ in range(100):
        mixed_tasks_2.append(_food_manual_request(_random_user_idx(max_users), 4))
        mixed_tasks_2.append(_water_request(_random_user_idx(max_users), 4))
    results4 = await asyncio.gather(*mixed_tasks_2)
    wave4.results = list(results4)
    wave4.end_time = time.monotonic()
    report.waves.append(wave4)
    print("  Wave 4 (100 manual + 100 water):")
    _print_wave_live(wave4)

    # Analyze for deadlocks and constraint errors
    all_results = list(results1) + list(results2) + list(results3) + list(results4)
    deadlock_count = sum(1 for r in all_results
                         if r.status_code == 500 and r.error and "deadlock" in str(r.error).lower())
    constraint_count = sum(1 for r in all_results if r.status_code in (409, 422))
    total_5xx = sum(1 for r in all_results if r.status_code >= 500)

    report.estimated_max_connections = max(
        report.estimated_max_connections,
        sum(1 for r in results4 if not r.timed_out and r.status_code != 0),
    )

    report.breaking_point = {
        "total_writes": len(all_results),
        "deadlock_count": deadlock_count,
        "constraint_violations": constraint_count,
        "total_5xx": total_5xx,
        "total_timeouts": sum(1 for r in all_results if r.timed_out),
    }

    print(f"\n  {Colors.BOLD}Write analysis:{Colors.END}")
    print(f"    Total writes:          {len(all_results)}")
    print(f"    Deadlocks detected:    {deadlock_count}")
    print(f"    Constraint violations: {constraint_count}")
    print(f"    5xx errors:            {total_5xx}")

    # Overall error rate across all waves
    total_errors = sum(1 for r in all_results if r.timed_out or r.status_code >= 500)
    overall_err_rate = total_errors / len(all_results) if all_results else 0

    if deadlock_count > 0 or overall_err_rate > 0.10:
        report.verdict = "FAIL"
    elif overall_err_rate > 0.02:
        report.verdict = "DEGRADED"
    else:
        report.verdict = "PASS"

    report.finished_at = datetime.now().isoformat()
    _print_verdict(report)
    return report


# ---------------------------------------------------------------------------
# Scenario registry
# ---------------------------------------------------------------------------

SCENARIOS = {
    "pool_exhaustion": scenario_pool_exhaustion,
    "slow_query_cascade": scenario_slow_query_cascade,
    "cache_miss_storm": scenario_cache_miss_storm,
    "write_storm": scenario_write_storm,
}


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

async def main():
    parser = argparse.ArgumentParser(
        description="Fitsi IA -- DB Connection Pool Saturation Stress Test",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--base-url",
        type=str,
        default=DEFAULT_BASE_URL,
        help=f"Backend base URL (default: {DEFAULT_BASE_URL})",
    )
    parser.add_argument(
        "--users",
        type=int,
        default=100,
        help="Number of test users to use (default: 100, max: 1000)",
    )
    parser.add_argument(
        "--scenario",
        type=str,
        default=None,
        choices=list(SCENARIOS.keys()),
        help="Run a specific scenario (default: run all)",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=None,
        help="Directory for JSON report (default: backend/results/)",
    )
    parser.add_argument(
        "--no-color",
        action="store_true",
        help="Disable terminal colors",
    )
    args = parser.parse_args()

    if args.no_color:
        Colors.disable()

    # Cap users to available seed users
    max_users = min(args.users, TOTAL_SEED_USERS)

    # Output path
    script_dir = Path(__file__).resolve().parent
    output_dir = Path(args.output_dir) if args.output_dir else script_dir.parent / "results"
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_path = output_dir / f"db_saturation_{timestamp}.json"

    # Determine which scenarios to run
    if args.scenario:
        scenarios_to_run = [args.scenario]
    else:
        scenarios_to_run = list(SCENARIOS.keys())

    _print_banner("FITSI IA -- DB CONNECTION POOL SATURATION TEST")
    print(f"  Base URL:      {args.base_url}")
    print(f"  Test users:    {max_users}")
    print(f"  Pool config:   size={POOL_SIZE} + overflow={MAX_OVERFLOW} = {POOL_MAX} max")
    print(f"  Pool timeout:  {POOL_TIMEOUT}s")
    print(f"  Scenarios:     {', '.join(scenarios_to_run)}")
    print(f"  Output:        {output_path}")

    # Run with a shared httpx client (large connection pool for the test runner itself)
    limits = httpx.Limits(
        max_connections=500,
        max_keepalive_connections=200,
        keepalive_expiry=30,
    )
    async with httpx.AsyncClient(limits=limits, follow_redirects=True) as client:
        # Pre-authenticate
        _print_section("Pre-authentication")
        await _pre_auth(client, args.base_url, max_users)

        authed = sum(1 for i in range(1, max_users + 1) if i in _token_cache)
        if authed == 0:
            print(f"\n  {Colors.RED}FATAL: No users authenticated. Is the backend running?{Colors.END}")
            print(f"  Tried: {args.base_url}/auth/login")
            sys.exit(1)

        # Run scenarios
        all_reports: list[ScenarioReport] = []
        for scenario_name in scenarios_to_run:
            try:
                scenario_fn = SCENARIOS[scenario_name]
                report = await scenario_fn(client, args.base_url, max_users)
                all_reports.append(report)
            except Exception as exc:
                logger.exception("Scenario %s crashed", scenario_name)
                crash_report = ScenarioReport(
                    scenario=scenario_name,
                    started_at=datetime.now().isoformat(),
                    finished_at=datetime.now().isoformat(),
                    verdict=f"CRASH: {exc}",
                )
                all_reports.append(crash_report)

            # Cool-down between scenarios
            if scenario_name != scenarios_to_run[-1]:
                print(f"\n  {Colors.DIM}Cooling down 5s between scenarios...{Colors.END}")
                await asyncio.sleep(5.0)

    # ── Summary ──
    _print_banner("FINAL SUMMARY")
    print(f"  {'Scenario':<25s} {'Verdict':<12s} {'Breaking Point':<30s} {'Est. Max Conns':>15s}")
    print(f"  {'-' * 25} {'-' * 12} {'-' * 30} {'-' * 15}")
    for r in all_reports:
        bp_str = "none"
        if r.breaking_point:
            if "wave" in r.breaking_point:
                bp_str = f"wave {r.breaking_point['wave']} @ c={r.breaking_point.get('concurrency', '?')}"
            elif "degradation_pct" in r.breaking_point:
                bp_str = f"degradation {r.breaking_point['degradation_pct']:+.0f}%"
            elif "speedup_factor" in r.breaking_point:
                bp_str = f"cache speedup {r.breaking_point['speedup_factor']:.1f}x"
            elif "deadlock_count" in r.breaking_point:
                bp_str = f"deadlocks={r.breaking_point['deadlock_count']} 5xx={r.breaking_point['total_5xx']}"

        if "PASS" in r.verdict:
            v_color = Colors.GREEN
        elif "DEGRADED" in r.verdict:
            v_color = Colors.YELLOW
        else:
            v_color = Colors.RED

        print(f"  {r.scenario:<25s} {v_color}{r.verdict:<12s}{Colors.END} {bp_str:<30s} {r.estimated_max_connections:>15d}")

    # ── Write JSON report ──
    final_report = {
        "test": "db_connection_pool_saturation",
        "timestamp": datetime.now().isoformat(),
        "config": {
            "base_url": args.base_url,
            "test_users": max_users,
            "pool_size": POOL_SIZE,
            "max_overflow": MAX_OVERFLOW,
            "pool_max": POOL_MAX,
            "pool_timeout_s": POOL_TIMEOUT,
        },
        "scenarios": [r.to_dict() for r in all_reports],
        "overall_verdict": (
            "PASS" if all(r.verdict == "PASS" for r in all_reports)
            else "FAIL" if any("FAIL" in r.verdict or "CRASH" in r.verdict for r in all_reports)
            else "DEGRADED"
        ),
    }

    output_path.write_text(json.dumps(final_report, indent=2, default=str), encoding="utf-8")
    print(f"\n  Report saved: {output_path}")
    print()


if __name__ == "__main__":
    asyncio.run(main())
