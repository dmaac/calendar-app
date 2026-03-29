#!/usr/bin/env python3
"""
Load test script — Simulate concurrent users hitting the Fitsi AI API.

Usage:
    cd backend/
    python -m scripts.load_test                           # 100 users, http://localhost:8000
    python -m scripts.load_test --users 50 --base-url http://localhost:8000

Prerequisites:
    - Backend server running
    - Seed users created (python -m scripts.seed_users)
    - All seed users have password: Test1234
"""

import argparse
import asyncio
import statistics
import sys
import time
from dataclasses import dataclass, field
from datetime import date

import httpx

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SEED_EMAIL_DOMAIN = "fitsi.test"
SEED_PASSWORD = "Test1234"
DEFAULT_BASE_URL = "http://localhost:8000"


@dataclass
class RequestResult:
    endpoint: str
    method: str
    status: int
    latency_ms: float
    error: str | None = None


@dataclass
class LoadTestReport:
    results: list[RequestResult] = field(default_factory=list)
    start_time: float = 0.0
    end_time: float = 0.0

    @property
    def duration_s(self) -> float:
        return self.end_time - self.start_time

    @property
    def total_requests(self) -> int:
        return len(self.results)

    @property
    def successful(self) -> int:
        return sum(1 for r in self.results if 200 <= r.status < 400)

    @property
    def errors(self) -> int:
        return sum(1 for r in self.results if r.status >= 400 or r.error)

    @property
    def rps(self) -> float:
        if self.duration_s == 0:
            return 0
        return self.total_requests / self.duration_s

    def latencies(self, endpoint: str | None = None) -> list[float]:
        items = self.results
        if endpoint:
            items = [r for r in items if r.endpoint == endpoint]
        return [r.latency_ms for r in items if r.error is None]

    def percentile(self, values: list[float], pct: float) -> float:
        if not values:
            return 0.0
        sorted_vals = sorted(values)
        idx = int(len(sorted_vals) * pct / 100)
        idx = min(idx, len(sorted_vals) - 1)
        return sorted_vals[idx]


# ---------------------------------------------------------------------------
# User simulation
# ---------------------------------------------------------------------------

async def login_user(client: httpx.AsyncClient, base_url: str, user_idx: int) -> str | None:
    """Login a seed user and return the access token."""
    email = f"user_{user_idx:04d}@{SEED_EMAIL_DOMAIN}"
    try:
        resp = await client.post(
            f"{base_url}/auth/login",
            data={"username": email, "password": SEED_PASSWORD},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if resp.status_code == 200:
            return resp.json().get("access_token")
        return None
    except Exception:
        return None


async def simulate_user(
    client: httpx.AsyncClient,
    base_url: str,
    user_idx: int,
    report: LoadTestReport,
    semaphore: asyncio.Semaphore,
) -> None:
    """Simulate a single user session: login + API calls."""
    async with semaphore:
        # Login
        t0 = time.monotonic()
        token = await login_user(client, base_url, user_idx)
        login_ms = (time.monotonic() - t0) * 1000

        if token is None:
            report.results.append(RequestResult(
                endpoint="POST /auth/login",
                method="POST",
                status=401,
                latency_ms=login_ms,
                error="Login failed",
            ))
            return

        report.results.append(RequestResult(
            endpoint="POST /auth/login",
            method="POST",
            status=200,
            latency_ms=login_ms,
        ))

        headers = {"Authorization": f"Bearer {token}"}
        today_str = date.today().isoformat()

        # Scenario: typical app session
        endpoints = [
            ("GET", f"/meals/summary?target_date={today_str}", "GET /meals/summary"),
            ("GET", f"/meals/?target_date={today_str}&offset=0&limit=50", "GET /meals/"),
            ("GET", "/api/onboarding/profile", "GET /api/onboarding/profile"),
            ("GET", "/foods/?offset=0&limit=20", "GET /foods/"),
            ("GET", "/auth/me", "GET /auth/me"),
        ]

        for method, path, label in endpoints:
            t0 = time.monotonic()
            try:
                if method == "GET":
                    resp = await client.get(f"{base_url}{path}", headers=headers)
                else:
                    resp = await client.post(f"{base_url}{path}", headers=headers)
                latency = (time.monotonic() - t0) * 1000
                report.results.append(RequestResult(
                    endpoint=label,
                    method=method,
                    status=resp.status_code,
                    latency_ms=latency,
                ))
            except Exception as e:
                latency = (time.monotonic() - t0) * 1000
                report.results.append(RequestResult(
                    endpoint=label,
                    method=method,
                    status=0,
                    latency_ms=latency,
                    error=str(e)[:100],
                ))


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

def print_report(report: LoadTestReport, num_users: int) -> None:
    print(f"\n{'='*72}")
    print(f"  FITSI AI — LOAD TEST REPORT")
    print(f"{'='*72}")
    print(f"  Concurrent users:  {num_users}")
    print(f"  Duration:          {report.duration_s:.2f}s")
    print(f"  Total requests:    {report.total_requests}")
    print(f"  Successful:        {report.successful}")
    print(f"  Errors:            {report.errors}")
    print(f"  Requests/sec:      {report.rps:.1f}")
    print(f"{'='*72}")

    # Per-endpoint breakdown
    endpoints = sorted(set(r.endpoint for r in report.results))
    header = f"{'Endpoint':<35} {'Count':>6} {'OK':>5} {'Err':>4} {'p50':>8} {'p95':>8} {'p99':>8} {'Avg':>8}"
    print(f"\n{header}")
    print("-" * len(header))

    for ep in endpoints:
        ep_results = [r for r in report.results if r.endpoint == ep]
        ok_count = sum(1 for r in ep_results if 200 <= r.status < 400)
        err_count = len(ep_results) - ok_count
        lats = [r.latency_ms for r in ep_results if r.error is None]

        if lats:
            p50 = report.percentile(lats, 50)
            p95 = report.percentile(lats, 95)
            p99 = report.percentile(lats, 99)
            avg = statistics.mean(lats)
        else:
            p50 = p95 = p99 = avg = 0.0

        print(f"{ep:<35} {len(ep_results):>6} {ok_count:>5} {err_count:>4} "
              f"{p50:>7.1f}ms {p95:>7.1f}ms {p99:>7.1f}ms {avg:>7.1f}ms")

    # Overall latency
    all_lats = report.latencies()
    if all_lats:
        print(f"\n{'OVERALL':<35} {report.total_requests:>6} {report.successful:>5} {report.errors:>4} "
              f"{report.percentile(all_lats, 50):>7.1f}ms "
              f"{report.percentile(all_lats, 95):>7.1f}ms "
              f"{report.percentile(all_lats, 99):>7.1f}ms "
              f"{statistics.mean(all_lats):>7.1f}ms")

    # Error details (first 10)
    errors = [r for r in report.results if r.error]
    if errors:
        print(f"\nFirst {min(10, len(errors))} errors:")
        for e in errors[:10]:
            print(f"  {e.endpoint}: {e.error}")

    print(f"\n{'='*72}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def main():
    parser = argparse.ArgumentParser(description="Fitsi AI Load Test")
    parser.add_argument("--users", type=int, default=100, help="Number of concurrent users")
    parser.add_argument("--base-url", type=str, default=DEFAULT_BASE_URL, help="Backend base URL")
    parser.add_argument("--concurrency", type=int, default=50, help="Max concurrent connections")
    args = parser.parse_args()

    print(f"Fitsi AI — Load Test")
    print(f"Base URL:    {args.base_url}")
    print(f"Users:       {args.users}")
    print(f"Concurrency: {args.concurrency}")
    print(f"{'='*60}")

    report = LoadTestReport()
    semaphore = asyncio.Semaphore(args.concurrency)

    limits = httpx.Limits(
        max_keepalive_connections=args.concurrency,
        max_connections=args.concurrency * 2,
    )
    timeout = httpx.Timeout(30.0, connect=10.0)

    async with httpx.AsyncClient(limits=limits, timeout=timeout) as client:
        # Verify server is up
        try:
            resp = await client.get(f"{args.base_url}/health")
            print(f"Server health: {resp.status_code}")
        except Exception as e:
            print(f"ERROR: Cannot reach server at {args.base_url}: {e}")
            print("Make sure the backend is running (uvicorn app.main:app)")
            sys.exit(1)

        print(f"\nStarting load test with {args.users} users...\n")
        report.start_time = time.monotonic()

        tasks = [
            simulate_user(client, args.base_url, i + 1, report, semaphore)
            for i in range(args.users)
        ]
        await asyncio.gather(*tasks)

        report.end_time = time.monotonic()

    print_report(report, args.users)


if __name__ == "__main__":
    asyncio.run(main())
