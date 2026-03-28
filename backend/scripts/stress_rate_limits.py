#!/usr/bin/env python3
"""
Fitsi IA -- Rate Limit Stress Test
===================================

Targeted stress tests that validate rate limiting effectiveness across
authentication endpoints, unprotected routes, and bypass vectors.

Tests:
    1. brute_force  -- Auth endpoint brute force (login rate limit + lockout)
    2. registration -- Registration spam (register rate limit)
    3. flood        -- Unprotected endpoint flood (global tier limit)
    4. bypass       -- X-Forwarded-For header spoofing to reset rate counters
    5. all          -- Run every test sequentially

Usage:
    cd backend/

    # Run all tests
    python -m scripts.stress_rate_limits

    # Run a specific test
    python -m scripts.stress_rate_limits --test brute_force
    python -m scripts.stress_rate_limits --test registration
    python -m scripts.stress_rate_limits --test flood
    python -m scripts.stress_rate_limits --test bypass

    # Custom target
    python -m scripts.stress_rate_limits --base-url http://staging.fitsi.app --test all

Prerequisites:
    pip install httpx
    python -m scripts.seed_users --count 10  (at least one seed user for auth)
    Backend server running at --base-url
    Redis running (rate limiter depends on it)

Rate Limit Architecture (reference):
    - Middleware: RateLimiterMiddleware (sliding window via Redis sorted sets)
    - Tiers: free=30+10burst/min, premium=120+10burst/min, admin=600+50burst/min
    - Per-endpoint (slowapi): register=5/min, login=10/min
    - Login lockout: 5 failed attempts -> 15 min lock
    - Fail-open: Redis down = all requests allowed
    - X-Forwarded-For: trusted blindly (first value used as client IP)
"""

import argparse
import asyncio
import json
import os
import random
import string
import sys
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import httpx

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_BASE_URL = "http://localhost:8000"
SEED_EMAIL_DOMAIN = "fitsi.test"
SEED_PASSWORD = "Test1234"
RESULTS_DIR = Path(__file__).resolve().parent.parent / "results"

# Known rate limit thresholds from the codebase
EXPECTED_LOGIN_LIMIT = 10        # slowapi: 10/minute on /auth/login
EXPECTED_REGISTER_LIMIT = 5      # slowapi: 5/minute on /auth/register
EXPECTED_LOCKOUT_AFTER = 5       # token_store: MAX_LOGIN_ATTEMPTS = 5
EXPECTED_FREE_TIER_LIMIT = 30    # rate_limiter: free tier 30 req/min
EXPECTED_FREE_BURST = 10         # rate_limiter: free tier burst allowance
EXPECTED_FREE_EFFECTIVE = EXPECTED_FREE_TIER_LIMIT + EXPECTED_FREE_BURST  # 40


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class RequestRecord:
    """Single request outcome."""
    index: int
    status: int
    elapsed_ms: float
    rate_limit_limit: Optional[str] = None
    rate_limit_remaining: Optional[str] = None
    rate_limit_reset: Optional[str] = None
    retry_after: Optional[str] = None
    forwarded_for: Optional[str] = None


@dataclass
class TestResult:
    """Outcome of one test case."""
    test_name: str
    description: str
    verdict: str = "SKIP"  # PASS, FAIL, WARN, SKIP
    total_requests: int = 0
    status_200: int = 0
    status_401: int = 0
    status_409: int = 0
    status_422: int = 0
    status_429: int = 0
    status_other: int = 0
    first_429_at: Optional[int] = None
    expected_429_at: Optional[int] = None
    headers_present: bool = False
    retry_after_present: bool = False
    duration_seconds: float = 0.0
    notes: list = field(default_factory=list)
    requests: list = field(default_factory=list)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _print_banner(title: str):
    width = 70
    print()
    print("=" * width)
    print(f"  {title}")
    print("=" * width)


def _print_result(result: TestResult):
    tag = {"PASS": "[PASS]", "FAIL": "[FAIL]", "WARN": "[WARN]", "SKIP": "[SKIP]"}
    symbol = tag.get(result.verdict, "[????]")
    print(f"\n  {symbol}  {result.test_name}")
    print(f"         {result.description}")
    print(f"         Total: {result.total_requests}  |  "
          f"200: {result.status_200}  |  401: {result.status_401}  |  "
          f"409: {result.status_409}  |  422: {result.status_422}  |  "
          f"429: {result.status_429}  |  Other: {result.status_other}")
    if result.first_429_at is not None:
        print(f"         First 429 at request #{result.first_429_at} "
              f"(expected at #{result.expected_429_at})")
    if result.headers_present:
        print("         Rate limit headers: present")
    else:
        print("         Rate limit headers: MISSING")
    if result.retry_after_present:
        print("         Retry-After header: present")
    print(f"         Duration: {result.duration_seconds:.2f}s")
    for note in result.notes:
        print(f"         * {note}")


def _extract_rate_headers(response: httpx.Response) -> dict:
    return {
        "rate_limit_limit": response.headers.get("x-ratelimit-limit"),
        "rate_limit_remaining": response.headers.get("x-ratelimit-remaining"),
        "rate_limit_reset": response.headers.get("x-ratelimit-reset"),
        "retry_after": response.headers.get("retry-after"),
    }


def _classify(result: TestResult, record: RequestRecord):
    """Update counters based on a request record."""
    result.total_requests += 1
    s = record.status
    if s == 200:
        result.status_200 += 1
    elif s == 401:
        result.status_401 += 1
    elif s == 409:
        result.status_409 += 1
    elif s == 422:
        result.status_422 += 1
    elif s == 429:
        result.status_429 += 1
        if result.first_429_at is None:
            result.first_429_at = record.index
    else:
        result.status_other += 1

    if record.rate_limit_limit is not None:
        result.headers_present = True
    if record.retry_after is not None:
        result.retry_after_present = True

    result.requests.append(record)


def _random_ip() -> str:
    """Generate a random RFC 1918 IP address."""
    return f"10.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(1,254)}"


def _random_email() -> str:
    """Generate a unique random email for registration tests."""
    slug = "".join(random.choices(string.ascii_lowercase + string.digits, k=12))
    return f"stress_{slug}@{SEED_EMAIL_DOMAIN}"


# ---------------------------------------------------------------------------
# Test 1: Auth Endpoint Brute Force
# ---------------------------------------------------------------------------

async def test_brute_force(base_url: str) -> list[TestResult]:
    """Fire 50 login attempts in rapid succession and verify rate limiting.

    Sub-tests:
      A) 50 valid-format login attempts from same IP -> expect 429 after ~10
      B) 10 invalid-password attempts to trigger lockout after 5
      C) Rotate X-Forwarded-For to see if IP-based rate limit resets
    """
    results = []

    # ── Sub-test A: Raw login flood ──────────────────────────────────────
    _print_banner("Test 1A: Login Brute Force (50 attempts, same IP)")
    result_a = TestResult(
        test_name="brute_force_flood",
        description="50 login attempts from same IP; expect 429 after ~10 requests",
        expected_429_at=EXPECTED_LOGIN_LIMIT + 1,
    )
    email = f"user_0001@{SEED_EMAIL_DOMAIN}"
    t0 = time.monotonic()

    async with httpx.AsyncClient(base_url=base_url, timeout=10.0) as client:
        for i in range(1, 51):
            try:
                resp = await client.post(
                    "/auth/login",
                    data={"username": email, "password": SEED_PASSWORD},
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )
                headers = _extract_rate_headers(resp)
                record = RequestRecord(index=i, status=resp.status_code,
                                       elapsed_ms=resp.elapsed.total_seconds() * 1000,
                                       **headers)
                _classify(result_a, record)
            except httpx.RequestError as exc:
                result_a.notes.append(f"Request {i} failed: {exc}")
                result_a.total_requests += 1
                result_a.status_other += 1

    result_a.duration_seconds = time.monotonic() - t0

    # Verdict: 429 must appear, ideally at or near request #11
    if result_a.status_429 > 0:
        if result_a.first_429_at is not None and result_a.first_429_at <= EXPECTED_LOGIN_LIMIT + 3:
            result_a.verdict = "PASS"
        else:
            result_a.verdict = "WARN"
            result_a.notes.append(
                f"429 appeared at #{result_a.first_429_at}, expected near #{EXPECTED_LOGIN_LIMIT + 1}"
            )
    else:
        result_a.verdict = "FAIL"
        result_a.notes.append("No 429 received in 50 login attempts -- rate limit NOT enforced")

    if not result_a.headers_present:
        result_a.notes.append("X-RateLimit-* headers missing from responses")

    _print_result(result_a)
    results.append(result_a)

    # ── Sub-test B: Account lockout after failed passwords ───────────────
    _print_banner("Test 1B: Account Lockout (wrong password, 10 attempts)")
    result_b = TestResult(
        test_name="brute_force_lockout",
        description="10 wrong-password logins; expect 429 (locked) after 5 failures",
        expected_429_at=EXPECTED_LOCKOUT_AFTER + 1,
    )
    lockout_email = f"user_0002@{SEED_EMAIL_DOMAIN}"
    t0 = time.monotonic()

    async with httpx.AsyncClient(base_url=base_url, timeout=10.0) as client:
        for i in range(1, 11):
            try:
                resp = await client.post(
                    "/auth/login",
                    data={"username": lockout_email, "password": "WrongPassword999!"},
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )
                headers = _extract_rate_headers(resp)
                record = RequestRecord(index=i, status=resp.status_code,
                                       elapsed_ms=resp.elapsed.total_seconds() * 1000,
                                       **headers)
                _classify(result_b, record)
            except httpx.RequestError as exc:
                result_b.notes.append(f"Request {i} failed: {exc}")
                result_b.total_requests += 1
                result_b.status_other += 1

    result_b.duration_seconds = time.monotonic() - t0

    if result_b.status_429 > 0:
        if result_b.first_429_at is not None and result_b.first_429_at <= EXPECTED_LOCKOUT_AFTER + 2:
            result_b.verdict = "PASS"
        else:
            result_b.verdict = "WARN"
            result_b.notes.append(
                f"429 appeared at #{result_b.first_429_at}, expected near #{EXPECTED_LOCKOUT_AFTER + 1}"
            )
    else:
        result_b.verdict = "FAIL"
        result_b.notes.append(
            "No 429 received -- account lockout NOT enforced after repeated failures"
        )

    # Check: were the first 5 just 401 (wrong password)?
    first_five_401 = sum(
        1 for r in result_b.requests[:5] if r.status == 401
    )
    result_b.notes.append(f"First 5 attempts returned 401: {first_five_401}/5")

    _print_result(result_b)
    results.append(result_b)

    # ── Sub-test C: X-Forwarded-For spoofing on login ────────────────────
    _print_banner("Test 1C: Login with rotating X-Forwarded-For (20 attempts)")
    result_c = TestResult(
        test_name="brute_force_xff_bypass",
        description="20 login attempts, each with a different X-Forwarded-For; check if rate limit resets",
        expected_429_at=EXPECTED_LOGIN_LIMIT + 1,
    )
    xff_email = f"user_0003@{SEED_EMAIL_DOMAIN}"
    t0 = time.monotonic()

    async with httpx.AsyncClient(base_url=base_url, timeout=10.0) as client:
        for i in range(1, 21):
            spoofed_ip = _random_ip()
            try:
                resp = await client.post(
                    "/auth/login",
                    data={"username": xff_email, "password": SEED_PASSWORD},
                    headers={
                        "Content-Type": "application/x-www-form-urlencoded",
                        "X-Forwarded-For": spoofed_ip,
                    },
                )
                headers = _extract_rate_headers(resp)
                record = RequestRecord(index=i, status=resp.status_code,
                                       elapsed_ms=resp.elapsed.total_seconds() * 1000,
                                       forwarded_for=spoofed_ip, **headers)
                _classify(result_c, record)
            except httpx.RequestError as exc:
                result_c.notes.append(f"Request {i} failed: {exc}")
                result_c.total_requests += 1
                result_c.status_other += 1

    result_c.duration_seconds = time.monotonic() - t0

    # Analysis: if no 429 at all, X-Forwarded-For is bypassing IP-based limits
    if result_c.status_429 == 0 and result_c.status_200 >= 15:
        result_c.verdict = "FAIL"
        result_c.notes.append(
            "SECURITY: No 429 received with rotating X-Forwarded-For -- "
            "IP spoofing bypasses rate limiting entirely"
        )
    elif result_c.status_429 > 0:
        result_c.verdict = "PASS"
        result_c.notes.append(
            "Rate limiting held despite X-Forwarded-For rotation "
            "(rate limit is per-user or per-endpoint, not per-IP only)"
        )
    else:
        result_c.verdict = "WARN"
        result_c.notes.append("Inconclusive -- check response distribution")

    _print_result(result_c)
    results.append(result_c)

    return results


# ---------------------------------------------------------------------------
# Test 2: Registration Spam
# ---------------------------------------------------------------------------

async def test_registration(base_url: str) -> list[TestResult]:
    """Fire 20 registration attempts in rapid succession.

    Expected: 429 after 5 requests (slowapi limit on /auth/register).
    """
    _print_banner("Test 2: Registration Spam (20 attempts)")
    result = TestResult(
        test_name="registration_spam",
        description="20 registration attempts; expect 429 after 5 requests",
        expected_429_at=EXPECTED_REGISTER_LIMIT + 1,
    )
    t0 = time.monotonic()

    async with httpx.AsyncClient(base_url=base_url, timeout=10.0) as client:
        for i in range(1, 21):
            email = _random_email()
            try:
                resp = await client.post(
                    "/auth/register",
                    json={
                        "email": email,
                        "password": "StressTest1234!",
                        "first_name": "Stress",
                        "last_name": f"User{i}",
                    },
                )
                headers = _extract_rate_headers(resp)
                record = RequestRecord(index=i, status=resp.status_code,
                                       elapsed_ms=resp.elapsed.total_seconds() * 1000,
                                       **headers)
                _classify(result, record)
            except httpx.RequestError as exc:
                result.notes.append(f"Request {i} failed: {exc}")
                result.total_requests += 1
                result.status_other += 1

    result.duration_seconds = time.monotonic() - t0

    if result.status_429 > 0:
        if result.first_429_at is not None and result.first_429_at <= EXPECTED_REGISTER_LIMIT + 3:
            result.verdict = "PASS"
        else:
            result.verdict = "WARN"
            result.notes.append(
                f"429 appeared at #{result.first_429_at}, expected near #{EXPECTED_REGISTER_LIMIT + 1}"
            )
    else:
        result.verdict = "FAIL"
        result.notes.append(
            "No 429 received in 20 registration attempts -- rate limit NOT enforced"
        )

    # Note how many actually created accounts (200/201) vs rejected
    created = result.status_200 + result.status_other  # 201 counted in other
    created_201 = sum(1 for r in result.requests if r.status == 201)
    result.notes.append(
        f"Accounts created: {result.status_200} (200) + {created_201} (201) = {result.status_200 + created_201}"
    )

    _print_result(result)
    return [result]


# ---------------------------------------------------------------------------
# Test 3: Unprotected Endpoint Flood
# ---------------------------------------------------------------------------

async def test_flood(base_url: str) -> list[TestResult]:
    """Flood endpoints that have no per-endpoint rate limit.

    These rely solely on the global RateLimiterMiddleware tier limit
    (free = 30 + 10 burst = 40 effective per minute).

    Endpoints tested:
      - GET /api/food/logs
      - GET /api/dashboard/today
      - GET /meals/summary
    """
    results = []

    # First, obtain a valid auth token
    token = await _login_for_token(base_url, user_idx=5)
    if not token:
        skip = TestResult(
            test_name="flood_all",
            description="Could not authenticate -- skipping flood tests",
            verdict="SKIP",
        )
        skip.notes.append("Login failed; cannot run authenticated flood tests")
        _print_result(skip)
        return [skip]

    auth_headers = {"Authorization": f"Bearer {token}"}

    endpoints = [
        ("/api/food/logs", "GET", "flood_food_logs",
         "200 rapid GET /api/food/logs; expect 429 after ~40 requests"),
        ("/api/dashboard/today", "GET", "flood_dashboard",
         "200 rapid GET /api/dashboard/today; expect 429 after ~40 requests"),
        ("/meals/summary", "GET", "flood_meals_summary",
         "200 rapid GET /meals/summary; expect 429 after ~40 requests"),
    ]

    for path, method, name, desc in endpoints:
        _print_banner(f"Test 3: Flood {path} (200 requests)")
        result = TestResult(
            test_name=name,
            description=desc,
            expected_429_at=EXPECTED_FREE_EFFECTIVE + 1,
        )
        t0 = time.monotonic()

        # Fire 200 requests as fast as possible using a semaphore for concurrency
        semaphore = asyncio.Semaphore(20)  # 20 concurrent connections

        async def _fire(client: httpx.AsyncClient, idx: int) -> RequestRecord:
            async with semaphore:
                try:
                    resp = await client.get(path, headers=auth_headers)
                    headers = _extract_rate_headers(resp)
                    return RequestRecord(index=idx, status=resp.status_code,
                                         elapsed_ms=resp.elapsed.total_seconds() * 1000,
                                         **headers)
                except httpx.RequestError as exc:
                    return RequestRecord(index=idx, status=0, elapsed_ms=0)

        async with httpx.AsyncClient(base_url=base_url, timeout=15.0) as client:
            tasks = [_fire(client, i) for i in range(1, 201)]
            records = await asyncio.gather(*tasks)

        # Sort by index to find first_429 correctly
        records_sorted = sorted(records, key=lambda r: r.index)
        for record in records_sorted:
            _classify(result, record)

        result.duration_seconds = time.monotonic() - t0

        if result.status_429 > 0:
            result.verdict = "PASS"
            result.notes.append(
                f"Global tier limit engaged; first 429 at request #{result.first_429_at}"
            )
        else:
            result.verdict = "FAIL"
            result.notes.append(
                "No 429 in 200 requests -- global tier rate limit NOT enforced on this endpoint"
            )

        _print_result(result)
        results.append(result)

        # Brief pause between endpoints to let windows partially expire
        await asyncio.sleep(2)

    return results


# ---------------------------------------------------------------------------
# Test 4: Rate Limit Bypass via X-Forwarded-For
# ---------------------------------------------------------------------------

async def test_bypass(base_url: str) -> list[TestResult]:
    """Send requests with rotating X-Forwarded-For headers to test whether
    the rate limiter keys on IP or on authenticated user identity.

    Strategy:
      A) Unauthenticated: rotate X-Forwarded-For, hit a public endpoint.
         If rate limit resets with each new IP, the limiter is per-IP only.
      B) Authenticated: rotate X-Forwarded-For with valid JWT.
         If rate limit holds despite IP changes, limiter keys on user_id.
    """
    results = []

    # ── Sub-test A: Unauthenticated with rotating IPs ────────────────────
    _print_banner("Test 4A: Unauthenticated + Rotating X-Forwarded-For (80 requests)")
    result_a = TestResult(
        test_name="bypass_unauthenticated",
        description="80 requests with unique X-Forwarded-For each; check if rate limit resets per IP",
        expected_429_at=EXPECTED_FREE_EFFECTIVE + 1,
    )
    t0 = time.monotonic()

    async with httpx.AsyncClient(base_url=base_url, timeout=10.0) as client:
        for i in range(1, 81):
            spoofed_ip = _random_ip()
            try:
                resp = await client.get(
                    "/health",
                    headers={"X-Forwarded-For": spoofed_ip},
                )
                headers = _extract_rate_headers(resp)
                record = RequestRecord(index=i, status=resp.status_code,
                                       elapsed_ms=resp.elapsed.total_seconds() * 1000,
                                       forwarded_for=spoofed_ip, **headers)
                _classify(result_a, record)
            except httpx.RequestError as exc:
                result_a.notes.append(f"Request {i} error: {exc}")
                result_a.total_requests += 1
                result_a.status_other += 1

    result_a.duration_seconds = time.monotonic() - t0

    # /health is exempt from rate limiting, so test a non-exempt path instead
    # Re-do with a non-exempt unauthenticated path
    result_a.notes.append(
        "Note: /health is exempt from rate limiting. "
        "Re-testing with /auth/me (requires auth but still shows rate limit behavior)."
    )

    # ── Re-test with a non-exempt path ───────────────────────────────────
    _print_banner("Test 4A (retry): Unauthenticated + Rotating XFF on /auth/me (80 requests)")
    result_a2 = TestResult(
        test_name="bypass_unauthenticated_nonexempt",
        description="80 unauthenticated requests to /auth/me with unique X-Forwarded-For each",
        expected_429_at=EXPECTED_FREE_EFFECTIVE + 1,
    )
    t0 = time.monotonic()

    async with httpx.AsyncClient(base_url=base_url, timeout=10.0) as client:
        for i in range(1, 81):
            spoofed_ip = _random_ip()
            try:
                resp = await client.get(
                    "/auth/me",
                    headers={"X-Forwarded-For": spoofed_ip},
                )
                headers = _extract_rate_headers(resp)
                record = RequestRecord(index=i, status=resp.status_code,
                                       elapsed_ms=resp.elapsed.total_seconds() * 1000,
                                       forwarded_for=spoofed_ip, **headers)
                _classify(result_a2, record)
            except httpx.RequestError as exc:
                result_a2.notes.append(f"Request {i} error: {exc}")
                result_a2.total_requests += 1
                result_a2.status_other += 1

    result_a2.duration_seconds = time.monotonic() - t0

    if result_a2.status_429 == 0:
        result_a2.verdict = "FAIL"
        result_a2.notes.append(
            "SECURITY: 80 requests with unique IPs, zero 429 responses. "
            "X-Forwarded-For spoofing bypasses IP-based rate limiting completely."
        )
    elif result_a2.status_429 > 0 and result_a2.first_429_at and result_a2.first_429_at > 50:
        result_a2.verdict = "WARN"
        result_a2.notes.append(
            f"429 appeared late at #{result_a2.first_429_at} -- partial bypass may be possible"
        )
    else:
        result_a2.verdict = "PASS"
        result_a2.notes.append(
            "Rate limiting held despite rotating X-Forwarded-For"
        )

    _print_result(result_a2)
    results.append(result_a2)

    # ── Sub-test B: Authenticated with rotating IPs ──────────────────────
    _print_banner("Test 4B: Authenticated + Rotating X-Forwarded-For (80 requests)")
    result_b = TestResult(
        test_name="bypass_authenticated",
        description="80 authenticated requests with unique X-Forwarded-For; "
                    "rate limit should key on user_id, not IP",
        expected_429_at=EXPECTED_FREE_EFFECTIVE + 1,
    )

    token = await _login_for_token(base_url, user_idx=7)
    if not token:
        result_b.verdict = "SKIP"
        result_b.notes.append("Could not authenticate -- skipping")
        _print_result(result_b)
        results.append(result_b)
        return results

    t0 = time.monotonic()

    async with httpx.AsyncClient(base_url=base_url, timeout=10.0) as client:
        for i in range(1, 81):
            spoofed_ip = _random_ip()
            try:
                resp = await client.get(
                    "/auth/me",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "X-Forwarded-For": spoofed_ip,
                    },
                )
                headers = _extract_rate_headers(resp)
                record = RequestRecord(index=i, status=resp.status_code,
                                       elapsed_ms=resp.elapsed.total_seconds() * 1000,
                                       forwarded_for=spoofed_ip, **headers)
                _classify(result_b, record)
            except httpx.RequestError as exc:
                result_b.notes.append(f"Request {i} error: {exc}")
                result_b.total_requests += 1
                result_b.status_other += 1

    result_b.duration_seconds = time.monotonic() - t0

    if result_b.status_429 > 0:
        result_b.verdict = "PASS"
        result_b.notes.append(
            f"Rate limit keyed on user identity (not IP); "
            f"429 at #{result_b.first_429_at} despite IP rotation"
        )
    else:
        result_b.verdict = "FAIL"
        result_b.notes.append(
            "SECURITY: 80 authenticated requests with rotating IPs, zero 429. "
            "Rate limiter may be keying on IP even for authenticated users, "
            "allowing bypass via X-Forwarded-For spoofing."
        )

    _print_result(result_b)
    results.append(result_b)

    return results


# ---------------------------------------------------------------------------
# Test 5: Redis Failure Simulation (informational)
# ---------------------------------------------------------------------------

def test_redis_failure_info() -> TestResult:
    """Informational finding: the rate limiter is fail-open.

    This test does not send requests. It documents the architectural finding
    that if Redis goes down, all rate limits are silently disabled.
    """
    _print_banner("Test 5: Redis Failure Mode (informational)")
    result = TestResult(
        test_name="redis_failure_mode",
        description="Documents that the rate limiter is fail-open when Redis is unavailable",
        verdict="WARN",
    )
    result.notes.extend([
        "FINDING: RateLimiterMiddleware.dispatch() catches all Redis exceptions "
        "and calls `call_next(request)` -- fail OPEN.",
        "FINDING: token_store.check_user_rate_limit() returns True (allow) on Redis failure.",
        "IMPACT: If Redis goes down or is unreachable, ALL rate limiting is disabled. "
        "An attacker who can cause Redis downtime gets unlimited API access.",
        "CONTRAST: Token validation functions (is_refresh_token_valid, is_access_token_blacklisted, "
        "is_login_locked) correctly fail CLOSED.",
        "RECOMMENDATION: Consider a local in-memory fallback (e.g., a simple counter dict "
        "with TTL) so that rate limiting degrades gracefully rather than disappearing entirely.",
    ])
    _print_result(result)
    return result


# ---------------------------------------------------------------------------
# Auth helper
# ---------------------------------------------------------------------------

async def _login_for_token(base_url: str, user_idx: int = 1) -> Optional[str]:
    """Login as a seed user and return the access token, or None on failure."""
    email = f"user_{user_idx:04d}@{SEED_EMAIL_DOMAIN}"
    async with httpx.AsyncClient(base_url=base_url, timeout=10.0) as client:
        try:
            resp = await client.post(
                "/auth/login",
                data={"username": email, "password": SEED_PASSWORD},
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            if resp.status_code == 200:
                return resp.json().get("access_token")
            else:
                print(f"  [!] Login failed for {email}: HTTP {resp.status_code}")
                return None
        except httpx.RequestError as exc:
            print(f"  [!] Login request error for {email}: {exc}")
            return None


# ---------------------------------------------------------------------------
# Report writer
# ---------------------------------------------------------------------------

def _save_report(all_results: list[TestResult], base_url: str):
    """Write JSON report to results/ directory."""
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filepath = RESULTS_DIR / f"rate_limit_stress_{ts}.json"

    # Serialize: strip raw request records for the summary, keep them in detail
    summary = []
    for r in all_results:
        d = asdict(r)
        # Convert request records to compact form
        d["requests"] = [
            {
                "i": req["index"],
                "s": req["status"],
                "ms": round(req["elapsed_ms"], 1),
                "rl": req["rate_limit_remaining"],
                "ra": req["retry_after"],
                "xff": req["forwarded_for"],
            }
            for req in d["requests"]
        ]
        summary.append(d)

    report = {
        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
        "base_url": base_url,
        "reference_limits": {
            "free_tier_rpm": EXPECTED_FREE_TIER_LIMIT,
            "free_burst": EXPECTED_FREE_BURST,
            "free_effective": EXPECTED_FREE_EFFECTIVE,
            "login_per_min": EXPECTED_LOGIN_LIMIT,
            "register_per_min": EXPECTED_REGISTER_LIMIT,
            "lockout_after_failures": EXPECTED_LOCKOUT_AFTER,
        },
        "results": summary,
    }

    filepath.write_text(json.dumps(report, indent=2, default=str))
    print(f"\n  Report saved to: {filepath}")


# ---------------------------------------------------------------------------
# Aggregated summary
# ---------------------------------------------------------------------------

def _print_summary(all_results: list[TestResult]):
    _print_banner("RATE LIMIT STRESS TEST SUMMARY")
    pass_count = sum(1 for r in all_results if r.verdict == "PASS")
    fail_count = sum(1 for r in all_results if r.verdict == "FAIL")
    warn_count = sum(1 for r in all_results if r.verdict == "WARN")
    skip_count = sum(1 for r in all_results if r.verdict == "SKIP")
    total = len(all_results)

    for r in all_results:
        tag = {"PASS": "[PASS]", "FAIL": "[FAIL]", "WARN": "[WARN]", "SKIP": "[SKIP]"}
        print(f"  {tag.get(r.verdict, '[????]')}  {r.test_name}")

    print()
    print(f"  Total: {total}  |  PASS: {pass_count}  |  FAIL: {fail_count}  |  "
          f"WARN: {warn_count}  |  SKIP: {skip_count}")

    if fail_count > 0:
        print("\n  CONCLUSION: Rate limiting has gaps that should be addressed.")
    elif warn_count > 0:
        print("\n  CONCLUSION: Rate limiting works but has minor concerns.")
    else:
        print("\n  CONCLUSION: Rate limiting is operating as expected.")
    print()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def main():
    parser = argparse.ArgumentParser(
        description="Fitsi IA -- Rate Limit Stress Test",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Tests available:
  brute_force   Login brute force + lockout + XFF bypass
  registration  Registration endpoint spam
  flood         Unprotected endpoint flood (global tier limit)
  bypass        X-Forwarded-For spoofing to bypass rate limits
  all           Run every test sequentially
        """,
    )
    parser.add_argument(
        "--base-url",
        default=os.getenv("FITSI_BASE_URL", DEFAULT_BASE_URL),
        help=f"Backend URL (default: {DEFAULT_BASE_URL})",
    )
    parser.add_argument(
        "--test",
        choices=["brute_force", "registration", "flood", "bypass", "all"],
        default="all",
        help="Which test to run (default: all)",
    )

    args = parser.parse_args()
    base_url = args.base_url.rstrip("/")
    test_name = args.test

    _print_banner(f"Fitsi IA Rate Limit Stress Test -- target: {base_url}")
    print(f"  Test: {test_name}")
    print(f"  Time: {datetime.now(timezone.utc).isoformat()}Z")

    # Verify connectivity
    try:
        async with httpx.AsyncClient(base_url=base_url, timeout=5.0) as client:
            resp = await client.get("/health")
            print(f"  Health check: HTTP {resp.status_code}")
            if resp.status_code != 200:
                print("  [!] Health check did not return 200 -- server may not be ready")
    except httpx.RequestError as exc:
        print(f"  [!] Cannot reach {base_url}: {exc}")
        print("  Aborting.")
        sys.exit(1)

    all_results: list[TestResult] = []

    if test_name in ("brute_force", "all"):
        all_results.extend(await test_brute_force(base_url))
        # Pause to let sliding windows partially expire between test groups
        if test_name == "all":
            await asyncio.sleep(3)

    if test_name in ("registration", "all"):
        all_results.extend(await test_registration(base_url))
        if test_name == "all":
            await asyncio.sleep(3)

    if test_name in ("flood", "all"):
        all_results.extend(await test_flood(base_url))
        if test_name == "all":
            await asyncio.sleep(3)

    if test_name in ("bypass", "all"):
        all_results.extend(await test_bypass(base_url))

    # Always include the Redis failure finding
    all_results.append(test_redis_failure_info())

    _print_summary(all_results)
    _save_report(all_results, base_url)


if __name__ == "__main__":
    asyncio.run(main())
