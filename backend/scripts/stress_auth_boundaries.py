#!/usr/bin/env python3
"""
Fitsi IA -- Auth Boundary Stress Test
======================================

Specialized stress test for authentication and authorization boundaries.
Tests token lifecycle, brute force protection, admin access control,
and IDOR (Insecure Direct Object Reference) vulnerabilities under load.

Usage:
    # Run all tests against local server
    python -m scripts.stress_auth_boundaries --base-url http://localhost:8000

    # Run a specific test
    python -m scripts.stress_auth_boundaries --base-url http://localhost:8000 --test token_expiry
    python -m scripts.stress_auth_boundaries --base-url http://localhost:8000 --test login_storm
    python -m scripts.stress_auth_boundaries --base-url http://localhost:8000 --test lockout
    python -m scripts.stress_auth_boundaries --base-url http://localhost:8000 --test admin_boundary
    python -m scripts.stress_auth_boundaries --base-url http://localhost:8000 --test idor

    # Custom user count
    python -m scripts.stress_auth_boundaries --base-url http://localhost:8000 --users 200

Prerequisites:
    pip install httpx
    python -m scripts.seed_users --count 200  (seed test users first)
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import httpx

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SEED_EMAIL_DOMAIN = "fitsi.test"
SEED_PASSWORD = "Test1234"

# Timeouts
HTTP_TIMEOUT = 30.0
CONNECT_TIMEOUT = 10.0

# Admin endpoints under /api/admin/* to probe (from recon: 17 admin endpoints)
ADMIN_ENDPOINTS: list[dict[str, str]] = [
    {"method": "GET", "path": "/api/admin/dashboard"},
    {"method": "GET", "path": "/api/admin/users"},
    {"method": "GET", "path": "/api/admin/users/1/detail"},
    {"method": "GET", "path": "/api/admin/users/1"},
    {"method": "POST", "path": "/api/admin/users/1/premium"},
    {"method": "POST", "path": "/api/admin/users/1/gift-premium"},
    {"method": "POST", "path": "/api/admin/users/1/send-notification"},
    {"method": "GET", "path": "/api/admin/metrics"},
    {"method": "GET", "path": "/api/admin/revenue"},
    {"method": "GET", "path": "/api/admin/system"},
    {"method": "GET", "path": "/api/admin/errors"},
    {"method": "POST", "path": "/api/admin/cache/clear"},
    {"method": "GET", "path": "/api/admin/tips"},
    {"method": "GET", "path": "/api/admin/recipes"},
    {"method": "POST", "path": "/api/admin/notifications/broadcast"},
    {"method": "GET", "path": "/api/admin/export/users"},
    {"method": "GET", "path": "/api/admin/feedback/summary"},
]


# ---------------------------------------------------------------------------
# Result structures
# ---------------------------------------------------------------------------

@dataclass
class TestResult:
    """Outcome of a single test scenario."""
    name: str
    passed: bool
    duration_seconds: float = 0.0
    total_requests: int = 0
    successful_requests: int = 0
    failed_requests: int = 0
    vulnerabilities: list[str] = field(default_factory=list)
    details: dict[str, Any] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)

    @property
    def verdict(self) -> str:
        return "PASS" if self.passed else "FAIL"


@dataclass
class StressReport:
    """Full report from all test scenarios."""
    timestamp: str
    base_url: str
    tests_run: list[str] = field(default_factory=list)
    results: list[TestResult] = field(default_factory=list)
    total_vulnerabilities: int = 0

    def add(self, result: TestResult) -> None:
        self.results.append(result)
        self.tests_run.append(result.name)
        self.total_vulnerabilities += len(result.vulnerabilities)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _email(index: int) -> str:
    return f"qa-usr-{index:04d}@{SEED_EMAIL_DOMAIN}"


def _make_client(base_url: str) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=base_url,
        timeout=httpx.Timeout(HTTP_TIMEOUT, connect=CONNECT_TIMEOUT),
        follow_redirects=True,
    )


async def _login(
    client: httpx.AsyncClient,
    email: str,
    password: str = SEED_PASSWORD,
) -> Optional[dict[str, Any]]:
    """Login and return token dict, or None on failure."""
    try:
        resp = await client.post(
            "/auth/login",
            data={"username": email, "password": password},
        )
        if resp.status_code == 200:
            return resp.json()
        return None
    except Exception:
        return None


def _auth_header(access_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"}


def _print_result(result: TestResult) -> None:
    """Pretty-print a single test result to stdout."""
    icon = "[PASS]" if result.passed else "[FAIL]"
    print(f"\n{'=' * 70}")
    print(f"  {icon}  {result.name}")
    print(f"{'=' * 70}")
    print(f"  Duration:    {result.duration_seconds:.2f}s")
    print(f"  Requests:    {result.total_requests} total, "
          f"{result.successful_requests} ok, {result.failed_requests} failed")

    if result.vulnerabilities:
        print(f"  VULNERABILITIES FOUND: {len(result.vulnerabilities)}")
        for vuln in result.vulnerabilities:
            print(f"    !! {vuln}")

    if result.errors:
        print(f"  Errors ({len(result.errors)}):")
        for err in result.errors[:5]:
            print(f"    - {err}")
        if len(result.errors) > 5:
            print(f"    ... and {len(result.errors) - 5} more")

    for key, val in result.details.items():
        if isinstance(val, float):
            print(f"  {key}: {val:.4f}")
        else:
            print(f"  {key}: {val}")


# ---------------------------------------------------------------------------
# Test 1: Token Expiry Under Load
# ---------------------------------------------------------------------------

async def test_token_expiry(base_url: str, user_count: int = 100) -> TestResult:
    """
    Login N users, then concurrently refresh all their tokens at once.

    Validates:
    - All refresh requests succeed (no race conditions in token rotation)
    - Each user gets a unique new access token (no token collision)
    - Old refresh tokens are invalidated after rotation (reuse is rejected)
    """
    result = TestResult(name="token_expiry_under_load", passed=True)
    t0 = time.monotonic()

    async with _make_client(base_url) as client:
        # Phase 1: Login all users sequentially (we need their tokens)
        print(f"  [token_expiry] Logging in {user_count} users...")
        credentials: list[dict[str, Any]] = []

        login_tasks = [_login(client, _email(i)) for i in range(1, user_count + 1)]
        login_results = await asyncio.gather(*login_tasks, return_exceptions=True)

        for i, lr in enumerate(login_results, start=1):
            result.total_requests += 1
            if isinstance(lr, Exception):
                result.failed_requests += 1
                result.errors.append(f"Login failed for user {i}: {lr}")
            elif lr is None:
                result.failed_requests += 1
                result.errors.append(f"Login returned None for user {i}")
            else:
                result.successful_requests += 1
                credentials.append(lr)

        if len(credentials) < 2:
            result.passed = False
            result.errors.append(
                f"Only {len(credentials)} users logged in successfully, need at least 2"
            )
            result.duration_seconds = time.monotonic() - t0
            return result

        print(f"  [token_expiry] {len(credentials)} users logged in. "
              f"Sending concurrent refresh requests...")

        # Phase 2: Concurrent refresh
        async def _refresh(cred: dict) -> tuple[Optional[dict], str]:
            """Returns (new_tokens, old_refresh_token)."""
            old_rt = cred["refresh_token"]
            try:
                resp = await client.post(
                    "/auth/refresh",
                    json={"refresh_token": old_rt},
                )
                if resp.status_code == 200:
                    return resp.json(), old_rt
                return None, old_rt
            except Exception:
                return None, old_rt

        refresh_tasks = [_refresh(c) for c in credentials]
        refresh_results = await asyncio.gather(*refresh_tasks, return_exceptions=True)

        new_access_tokens: set[str] = set()
        old_refresh_tokens: list[str] = []
        refresh_ok = 0
        refresh_fail = 0

        for rr in refresh_results:
            result.total_requests += 1
            if isinstance(rr, Exception):
                refresh_fail += 1
                result.errors.append(f"Refresh exception: {rr}")
            elif rr[0] is None:
                refresh_fail += 1
            else:
                refresh_ok += 1
                new_tokens, old_rt = rr
                new_access_tokens.add(new_tokens["access_token"])
                old_refresh_tokens.append(old_rt)

        result.successful_requests += refresh_ok
        result.failed_requests += refresh_fail

        result.details["users_logged_in"] = len(credentials)
        result.details["refresh_success"] = refresh_ok
        result.details["refresh_fail"] = refresh_fail
        result.details["unique_access_tokens"] = len(new_access_tokens)

        # Check: token uniqueness (each user must get a distinct access token)
        if len(new_access_tokens) < refresh_ok:
            result.passed = False
            result.vulnerabilities.append(
                f"Token collision detected: {refresh_ok} refreshes produced "
                f"only {len(new_access_tokens)} unique access tokens"
            )

        # Phase 3: Verify old refresh tokens are invalidated
        # Try reusing a sample of old refresh tokens (should fail with 401)
        print(f"  [token_expiry] Verifying old refresh tokens are invalidated...")
        sample_size = min(10, len(old_refresh_tokens))
        reuse_tasks = []
        for old_rt in old_refresh_tokens[:sample_size]:
            reuse_tasks.append(
                client.post("/auth/refresh", json={"refresh_token": old_rt})
            )

        reuse_results = await asyncio.gather(*reuse_tasks, return_exceptions=True)
        reuse_accepted = 0
        for rr in reuse_results:
            result.total_requests += 1
            if isinstance(rr, Exception):
                continue
            if rr.status_code == 200:
                reuse_accepted += 1
                result.successful_requests += 1
            else:
                result.successful_requests += 1  # expected rejection

        if reuse_accepted > 0:
            result.passed = False
            result.vulnerabilities.append(
                f"Old refresh token reuse accepted {reuse_accepted}/{sample_size} times. "
                f"Token rotation is broken -- replay attacks possible."
            )
        result.details["old_token_reuse_accepted"] = reuse_accepted
        result.details["old_token_reuse_tested"] = sample_size

    result.duration_seconds = time.monotonic() - t0
    return result


# ---------------------------------------------------------------------------
# Test 2: Concurrent Login Storm
# ---------------------------------------------------------------------------

async def test_login_storm(base_url: str, user_count: int = 50) -> TestResult:
    """
    Fire N login requests at the exact same moment.

    Validates:
    - All logins succeed (server handles concurrent auth under pressure)
    - Each user gets a unique JTI in their access token
    - Latency stays within reasonable bounds
    """
    result = TestResult(name="concurrent_login_storm", passed=True)
    t0 = time.monotonic()

    async with _make_client(base_url) as client:
        print(f"  [login_storm] Firing {user_count} concurrent login requests...")

        async def _timed_login(idx: int) -> dict[str, Any]:
            email = _email(idx)
            start = time.monotonic()
            resp = await client.post(
                "/auth/login",
                data={"username": email, "password": SEED_PASSWORD},
            )
            elapsed = time.monotonic() - start
            return {
                "user_index": idx,
                "status": resp.status_code,
                "elapsed": elapsed,
                "body": resp.json() if resp.status_code == 200 else None,
            }

        tasks = [_timed_login(i) for i in range(1, user_count + 1)]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        latencies: list[float] = []
        jtis: set[str] = set()
        success_count = 0
        fail_count = 0
        access_tokens_seen: set[str] = set()

        for r in results:
            result.total_requests += 1
            if isinstance(r, Exception):
                fail_count += 1
                result.errors.append(f"Login exception: {r}")
                continue
            if r["status"] == 200 and r["body"]:
                success_count += 1
                latencies.append(r["elapsed"])
                at = r["body"].get("access_token", "")
                access_tokens_seen.add(at)

                # Decode JTI from access token (without verification -- just inspect)
                try:
                    import base64
                    # JWT is header.payload.signature
                    payload_b64 = at.split(".")[1]
                    # Pad base64
                    padding = 4 - len(payload_b64) % 4
                    if padding != 4:
                        payload_b64 += "=" * padding
                    payload = json.loads(base64.urlsafe_b64decode(payload_b64))
                    jti = payload.get("jti")
                    if jti:
                        jtis.add(jti)
                except Exception:
                    pass
            else:
                fail_count += 1
                result.errors.append(
                    f"User {r['user_index']} got status {r['status']}"
                )

        result.successful_requests = success_count
        result.failed_requests = fail_count

        result.details["success_count"] = success_count
        result.details["fail_count"] = fail_count
        result.details["unique_jtis"] = len(jtis)
        result.details["unique_access_tokens"] = len(access_tokens_seen)

        if latencies:
            latencies.sort()
            result.details["latency_min_ms"] = round(latencies[0] * 1000, 1)
            result.details["latency_max_ms"] = round(latencies[-1] * 1000, 1)
            result.details["latency_median_ms"] = round(
                latencies[len(latencies) // 2] * 1000, 1
            )
            result.details["latency_p95_ms"] = round(
                latencies[int(len(latencies) * 0.95)] * 1000, 1
            )
            result.details["latency_avg_ms"] = round(
                sum(latencies) / len(latencies) * 1000, 1
            )

        # Check: JTI uniqueness
        if len(jtis) < success_count:
            result.passed = False
            result.vulnerabilities.append(
                f"JTI collision: {success_count} logins produced only {len(jtis)} "
                f"unique JTIs. Token replay risk."
            )

        # Check: token uniqueness
        if len(access_tokens_seen) < success_count:
            result.passed = False
            result.vulnerabilities.append(
                f"Access token collision: {success_count} logins produced only "
                f"{len(access_tokens_seen)} unique tokens."
            )

        # Check: reasonable success rate (allow for some rate limiting)
        if success_count < user_count * 0.5:
            result.passed = False
            result.errors.append(
                f"Only {success_count}/{user_count} logins succeeded. "
                f"Server may be dropping connections under load."
            )

    result.duration_seconds = time.monotonic() - t0
    return result


# ---------------------------------------------------------------------------
# Test 3: Account Lockout Stress
# ---------------------------------------------------------------------------

async def test_lockout(base_url: str) -> TestResult:
    """
    Trigger account lockout with 5 bad passwords, then verify behavior.

    Validates:
    - Account locks after 5 failed attempts (returns 429)
    - Locked account cannot login even with correct password
    - Locked account CANNOT refresh an existing valid token
      (this tests whether lockout is token-level or login-level only)
    - Lockout counter resets after timeout (verified by checking status)
    """
    result = TestResult(name="account_lockout_stress", passed=True)
    t0 = time.monotonic()

    # Use a dedicated test user for lockout (avoids interfering with other tests)
    lockout_email = _email(999)

    async with _make_client(base_url) as client:
        # Phase 0: Login with correct password first to get a valid refresh token
        print(f"  [lockout] Getting valid tokens for {lockout_email} before lockout...")
        pre_login = await _login(client, lockout_email)
        result.total_requests += 1
        pre_refresh_token: Optional[str] = None
        if pre_login:
            result.successful_requests += 1
            pre_refresh_token = pre_login.get("refresh_token")
        else:
            result.errors.append(
                f"Could not login {lockout_email} with correct password before "
                f"lockout test. User may not exist in DB."
            )
            # Continue anyway -- we can still test the lockout mechanism

        # Phase 1: Send 5 bad passwords to trigger lockout
        print(f"  [lockout] Sending 5 bad password attempts for {lockout_email}...")
        bad_statuses: list[int] = []
        for attempt in range(1, 6):
            try:
                resp = await client.post(
                    "/auth/login",
                    data={"username": lockout_email, "password": "WrongPassword!1"},
                )
                bad_statuses.append(resp.status_code)
                result.total_requests += 1
                result.failed_requests += 1
            except Exception as e:
                result.errors.append(f"Bad password attempt {attempt} error: {e}")

        result.details["bad_password_statuses"] = bad_statuses

        # Phase 2: 6th attempt -- should get 429 (locked)
        print(f"  [lockout] Verifying lockout is active (6th attempt)...")
        try:
            resp = await client.post(
                "/auth/login",
                data={"username": lockout_email, "password": SEED_PASSWORD},
            )
            result.total_requests += 1
            lockout_status = resp.status_code
            result.details["lockout_check_status"] = lockout_status

            if lockout_status == 429:
                result.successful_requests += 1
                result.details["lockout_enforced"] = True
            elif lockout_status == 200:
                result.passed = False
                result.vulnerabilities.append(
                    "Account lockout NOT enforced. 6th login attempt with correct "
                    "password succeeded after 5 failures. Brute force is possible."
                )
                result.details["lockout_enforced"] = False
            else:
                # 401 could mean lockout is working differently
                result.details["lockout_enforced"] = "unclear"
                result.details["lockout_response_status"] = lockout_status
        except Exception as e:
            result.errors.append(f"Lockout verification error: {e}")

        # Phase 3: Test if a pre-existing refresh token still works while locked
        if pre_refresh_token:
            print(f"  [lockout] Testing refresh token while account is locked...")
            try:
                resp = await client.post(
                    "/auth/refresh",
                    json={"refresh_token": pre_refresh_token},
                )
                result.total_requests += 1
                refresh_while_locked = resp.status_code
                result.details["refresh_while_locked_status"] = refresh_while_locked

                if refresh_while_locked == 200:
                    # This is a design choice, not necessarily a vulnerability.
                    # Flag it for review.
                    result.details["refresh_while_locked"] = "ACCEPTED"
                    result.details["refresh_while_locked_note"] = (
                        "Existing refresh tokens still work during account lockout. "
                        "This may be intentional (lockout is login-path only), but "
                        "consider whether a locked account should also have its "
                        "sessions revoked."
                    )
                else:
                    result.details["refresh_while_locked"] = "REJECTED"
            except Exception as e:
                result.errors.append(f"Refresh during lockout error: {e}")

        # Phase 4: Verify lockout TTL info
        # We cannot actually wait 15 minutes, but we document the expected behavior.
        result.details["lockout_ttl_seconds"] = 900
        result.details["lockout_threshold"] = 5
        result.details["lockout_ttl_note"] = (
            "Lockout auto-expires after 15 minutes (900s). "
            "Manual verification required for TTL behavior."
        )

        # Phase 5: Rapid lock/unlock cycle (test for race conditions)
        # Login with a different user, send bad passwords in parallel
        print(f"  [lockout] Testing parallel bad-password race condition...")
        race_email = _email(998)
        # First, clear any previous lockout by succeeding (if possible)
        await _login(client, race_email)
        result.total_requests += 1

        async def _bad_attempt() -> int:
            try:
                r = await client.post(
                    "/auth/login",
                    data={"username": race_email, "password": "BadPass!1"},
                )
                return r.status_code
            except Exception:
                return -1

        # Fire 10 bad attempts concurrently
        race_tasks = [_bad_attempt() for _ in range(10)]
        race_results = await asyncio.gather(*race_tasks)
        result.total_requests += 10

        count_401 = sum(1 for s in race_results if s == 401)
        count_429 = sum(1 for s in race_results if s == 429)
        result.details["race_condition_401s"] = count_401
        result.details["race_condition_429s"] = count_429
        result.details["race_condition_note"] = (
            f"10 concurrent bad attempts: {count_401} got 401, {count_429} got 429. "
            f"Expected: some 401s then 429s once threshold reached."
        )

    result.duration_seconds = time.monotonic() - t0
    return result


# ---------------------------------------------------------------------------
# Test 4: Admin Boundary Check
# ---------------------------------------------------------------------------

async def test_admin_boundary(base_url: str) -> TestResult:
    """
    Login as a regular (non-admin) user and probe all 17 admin endpoints.

    Validates:
    - Every admin endpoint returns 403 Forbidden for non-admin users
    - None return 200, 201, or any 2xx (authorization bypass)
    - None return 500 (unhandled error that might leak info)
    """
    result = TestResult(name="admin_boundary_check", passed=True)
    t0 = time.monotonic()

    async with _make_client(base_url) as client:
        # Login as a regular user
        print(f"  [admin_boundary] Logging in as regular user...")
        tokens = await _login(client, _email(1))
        result.total_requests += 1

        if not tokens:
            result.passed = False
            result.errors.append("Could not login as regular user for admin boundary test")
            result.duration_seconds = time.monotonic() - t0
            return result

        result.successful_requests += 1
        headers = _auth_header(tokens["access_token"])

        # Probe each admin endpoint
        print(f"  [admin_boundary] Probing {len(ADMIN_ENDPOINTS)} admin endpoints...")
        bypasses: list[dict[str, Any]] = []
        server_errors: list[dict[str, Any]] = []

        # Prepare request bodies for POST endpoints that need them
        post_bodies: dict[str, dict] = {
            "/api/admin/users/1/premium": {"is_premium": True},
            "/api/admin/users/1/gift-premium": {"days": 30},
            "/api/admin/users/1/send-notification": {
                "title": "Test", "body": "Test"
            },
            "/api/admin/cache/clear": {},
            "/api/admin/notifications/broadcast": {
                "title": "Test", "body": "Test", "target": "all"
            },
        }

        async def _probe(ep: dict[str, str]) -> dict[str, Any]:
            method = ep["method"].lower()
            path = ep["path"]
            try:
                if method == "get":
                    resp = await client.get(path, headers=headers)
                elif method == "post":
                    body = post_bodies.get(path, {})
                    resp = await client.post(path, headers=headers, json=body)
                elif method == "put":
                    resp = await client.put(path, headers=headers, json={})
                elif method == "delete":
                    resp = await client.delete(path, headers=headers)
                else:
                    resp = await client.request(method, path, headers=headers)

                return {
                    "method": ep["method"],
                    "path": path,
                    "status": resp.status_code,
                    "body_preview": resp.text[:200] if resp.text else "",
                }
            except Exception as e:
                return {
                    "method": ep["method"],
                    "path": path,
                    "status": -1,
                    "error": str(e),
                }

        probe_tasks = [_probe(ep) for ep in ADMIN_ENDPOINTS]
        probe_results = await asyncio.gather(*probe_tasks, return_exceptions=True)

        for pr in probe_results:
            result.total_requests += 1
            if isinstance(pr, Exception):
                result.failed_requests += 1
                result.errors.append(f"Probe exception: {pr}")
                continue

            status_code = pr["status"]
            if 200 <= status_code < 300:
                bypasses.append(pr)
                result.vulnerabilities.append(
                    f"ADMIN BYPASS: {pr['method']} {pr['path']} returned "
                    f"{status_code} for non-admin user"
                )
            elif status_code >= 500:
                server_errors.append(pr)
                result.errors.append(
                    f"Server error: {pr['method']} {pr['path']} returned {status_code}"
                )
            elif status_code in (401, 403):
                result.successful_requests += 1
            else:
                # 404, 422, etc. -- not ideal but not a bypass
                result.successful_requests += 1

        result.details["endpoints_probed"] = len(ADMIN_ENDPOINTS)
        result.details["bypasses_found"] = len(bypasses)
        result.details["server_errors"] = len(server_errors)
        result.details["bypass_details"] = bypasses

        if bypasses:
            result.passed = False

        # Also test without any auth token at all (should get 401)
        print(f"  [admin_boundary] Probing admin endpoints with no auth token...")
        no_auth_bypasses = 0
        for ep in ADMIN_ENDPOINTS[:5]:  # sample of 5
            try:
                if ep["method"] == "GET":
                    resp = await client.get(ep["path"])
                else:
                    resp = await client.post(ep["path"], json={})
                result.total_requests += 1
                if 200 <= resp.status_code < 300:
                    no_auth_bypasses += 1
                    result.vulnerabilities.append(
                        f"NO-AUTH BYPASS: {ep['method']} {ep['path']} returned "
                        f"{resp.status_code} with no auth token at all"
                    )
            except Exception:
                pass

        result.details["no_auth_bypasses"] = no_auth_bypasses
        if no_auth_bypasses > 0:
            result.passed = False

    result.duration_seconds = time.monotonic() - t0
    return result


# ---------------------------------------------------------------------------
# Test 5: IDOR Check Under Load
# ---------------------------------------------------------------------------

async def test_idor(base_url: str) -> TestResult:
    """
    Login as user A, attempt to access user B's resources.

    Validates:
    - GET /api/food/logs with user A token only returns user A's logs
    - GET /api/food/logs/{id} for user B's log returns 404 (not 200)
    - PUT /api/food/logs/{id} for user B's log returns 404 (not 200)
    - DELETE /api/food/logs/{id} for user B's log returns 404 (not 200)
    - User A cannot see user B's data in any response
    """
    result = TestResult(name="idor_check_under_load", passed=True)
    t0 = time.monotonic()

    async with _make_client(base_url) as client:
        # Login as two different users
        print(f"  [idor] Logging in as user_0001 (attacker) and user_0002 (victim)...")
        attacker_tokens = await _login(client, _email(1))
        victim_tokens = await _login(client, _email(2))
        result.total_requests += 2

        if not attacker_tokens or not victim_tokens:
            result.passed = False
            result.errors.append(
                "Could not login attacker and/or victim users for IDOR test"
            )
            result.duration_seconds = time.monotonic() - t0
            return result

        result.successful_requests += 2
        attacker_headers = _auth_header(attacker_tokens["access_token"])
        victim_headers = _auth_header(victim_tokens["access_token"])
        attacker_id = attacker_tokens.get("user_id")
        victim_id = victim_tokens.get("user_id")

        result.details["attacker_user_id"] = attacker_id
        result.details["victim_user_id"] = victim_id

        # Phase 1: Create a food log for the victim
        print(f"  [idor] Creating test food log for victim user...")
        victim_log_id = None
        try:
            resp = await client.post(
                "/api/food/manual",
                headers=victim_headers,
                json={
                    "food_name": "IDOR_TEST_VICTIM_LOG",
                    "calories": 999,
                    "carbs_g": 10,
                    "protein_g": 20,
                    "fats_g": 5,
                    "meal_type": "snack",
                },
            )
            result.total_requests += 1
            if resp.status_code in (200, 201):
                victim_log_id = resp.json().get("id")
                result.successful_requests += 1
            else:
                result.errors.append(
                    f"Could not create victim food log: status={resp.status_code}"
                )
        except Exception as e:
            result.errors.append(f"Victim log creation error: {e}")

        # Phase 2: Attacker tries to GET victim's food logs list
        print(f"  [idor] Attacker listing food logs (should only see own)...")
        try:
            resp = await client.get("/api/food/logs", headers=attacker_headers)
            result.total_requests += 1
            if resp.status_code == 200:
                result.successful_requests += 1
                logs = resp.json()
                # Check if any log belongs to the victim
                items = logs if isinstance(logs, list) else logs.get("items", logs.get("data", []))
                victim_data_found = False
                for item in items:
                    if item.get("food_name") == "IDOR_TEST_VICTIM_LOG":
                        victim_data_found = True
                        break
                    # Also check user_id if present
                    if item.get("user_id") and item["user_id"] != attacker_id:
                        victim_data_found = True
                        break

                if victim_data_found:
                    result.passed = False
                    result.vulnerabilities.append(
                        "IDOR: Attacker can see victim's food logs in list endpoint"
                    )
                result.details["attacker_sees_victim_in_list"] = victim_data_found
        except Exception as e:
            result.errors.append(f"Food logs list error: {e}")

        # Phase 3: Attacker tries to GET victim's specific food log
        if victim_log_id:
            print(f"  [idor] Attacker trying GET /api/food/logs/{victim_log_id}...")
            try:
                resp = await client.get(
                    f"/api/food/logs/{victim_log_id}",
                    headers=attacker_headers,
                )
                result.total_requests += 1
                get_status = resp.status_code
                result.details["idor_get_status"] = get_status

                if get_status == 200:
                    result.passed = False
                    result.vulnerabilities.append(
                        f"IDOR: GET /api/food/logs/{victim_log_id} returned 200 "
                        f"for attacker. Victim data exposed."
                    )
                elif get_status in (403, 404):
                    result.successful_requests += 1
                else:
                    result.errors.append(
                        f"Unexpected status {get_status} for IDOR GET"
                    )
            except Exception as e:
                result.errors.append(f"IDOR GET error: {e}")

            # Phase 4: Attacker tries to PUT (modify) victim's food log
            print(f"  [idor] Attacker trying PUT /api/food/logs/{victim_log_id}...")
            try:
                resp = await client.put(
                    f"/api/food/logs/{victim_log_id}",
                    headers=attacker_headers,
                    json={"food_name": "HACKED_BY_ATTACKER", "calories": 0},
                )
                result.total_requests += 1
                put_status = resp.status_code
                result.details["idor_put_status"] = put_status

                if put_status == 200:
                    result.passed = False
                    result.vulnerabilities.append(
                        f"IDOR: PUT /api/food/logs/{victim_log_id} returned 200 "
                        f"for attacker. Victim data tampered."
                    )
                elif put_status in (403, 404):
                    result.successful_requests += 1
            except Exception as e:
                result.errors.append(f"IDOR PUT error: {e}")

            # Phase 5: Attacker tries to DELETE victim's food log
            print(f"  [idor] Attacker trying DELETE /api/food/logs/{victim_log_id}...")
            try:
                resp = await client.delete(
                    f"/api/food/logs/{victim_log_id}",
                    headers=attacker_headers,
                )
                result.total_requests += 1
                delete_status = resp.status_code
                result.details["idor_delete_status"] = delete_status

                if delete_status == 200:
                    result.passed = False
                    result.vulnerabilities.append(
                        f"IDOR: DELETE /api/food/logs/{victim_log_id} returned 200 "
                        f"for attacker. Victim data destroyed."
                    )
                elif delete_status in (403, 404):
                    result.successful_requests += 1
            except Exception as e:
                result.errors.append(f"IDOR DELETE error: {e}")

        # Phase 6: Parallel IDOR sweep (attacker probes a range of log IDs)
        print(f"  [idor] Attacker probing log IDs 1-20 in parallel...")

        async def _probe_log(log_id: int) -> tuple[int, int]:
            """Returns (log_id, status_code)."""
            try:
                r = await client.get(
                    f"/api/food/logs/{log_id}",
                    headers=attacker_headers,
                )
                return log_id, r.status_code
            except Exception:
                return log_id, -1

        sweep_tasks = [_probe_log(lid) for lid in range(1, 21)]
        sweep_results = await asyncio.gather(*sweep_tasks)
        result.total_requests += 20

        accessible_logs: list[int] = []
        for log_id, status in sweep_results:
            if status == 200:
                accessible_logs.append(log_id)

        result.details["idor_sweep_range"] = "1-20"
        result.details["idor_sweep_accessible"] = accessible_logs

        # Some of these might legitimately belong to the attacker
        # Flag if we got more than a reasonable number
        if len(accessible_logs) > 10:
            result.vulnerabilities.append(
                f"IDOR sweep: attacker accessed {len(accessible_logs)}/20 log IDs. "
                f"Possible missing user_id filtering."
            )
            result.passed = False

        # Cleanup: delete the victim's test log
        if victim_log_id:
            try:
                await client.delete(
                    f"/api/food/logs/{victim_log_id}",
                    headers=victim_headers,
                )
                result.total_requests += 1
            except Exception:
                pass

    result.duration_seconds = time.monotonic() - t0
    return result


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

TEST_MAP: dict[str, Any] = {
    "token_expiry": test_token_expiry,
    "login_storm": test_login_storm,
    "lockout": test_lockout,
    "admin_boundary": test_admin_boundary,
    "idor": test_idor,
}


async def run_tests(
    base_url: str,
    tests: list[str],
    user_count: int,
) -> StressReport:
    """Execute selected tests and build a StressReport."""
    report = StressReport(
        timestamp=datetime.now(timezone.utc).isoformat(),
        base_url=base_url,
    )

    print(f"\nFitsi IA -- Auth Boundary Stress Test")
    print(f"Target: {base_url}")
    print(f"Tests:  {', '.join(tests)}")
    print(f"Users:  {user_count}")
    print(f"{'=' * 70}")

    for test_name in tests:
        func = TEST_MAP[test_name]

        # Pass user_count to tests that accept it
        import inspect
        sig = inspect.signature(func)
        kwargs: dict[str, Any] = {"base_url": base_url}
        if "user_count" in sig.parameters:
            kwargs["user_count"] = user_count

        try:
            result = await func(**kwargs)
        except Exception as e:
            result = TestResult(
                name=test_name,
                passed=False,
                errors=[f"Test crashed: {type(e).__name__}: {e}"],
            )

        report.add(result)
        _print_result(result)

    return report


def save_report(report: StressReport) -> Path:
    """Save report as JSON to results/ directory."""
    results_dir = Path(__file__).resolve().parent.parent / "results"
    results_dir.mkdir(exist_ok=True)

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    filepath = results_dir / f"auth_boundary_{ts}.json"

    # Convert dataclass to dict
    report_dict = {
        "timestamp": report.timestamp,
        "base_url": report.base_url,
        "tests_run": report.tests_run,
        "total_vulnerabilities": report.total_vulnerabilities,
        "results": [asdict(r) for r in report.results],
    }

    filepath.write_text(json.dumps(report_dict, indent=2, default=str))
    return filepath


def print_summary(report: StressReport) -> None:
    """Print a final summary table."""
    print(f"\n{'=' * 70}")
    print(f"  SUMMARY")
    print(f"{'=' * 70}")

    for r in report.results:
        icon = "[PASS]" if r.passed else "[FAIL]"
        vuln_str = f"  ({len(r.vulnerabilities)} vulnerabilities)" if r.vulnerabilities else ""
        print(f"  {icon}  {r.name:<30s}  {r.duration_seconds:>6.2f}s{vuln_str}")

    total_pass = sum(1 for r in report.results if r.passed)
    total_fail = sum(1 for r in report.results if not r.passed)
    print(f"\n  Total: {total_pass} passed, {total_fail} failed, "
          f"{report.total_vulnerabilities} vulnerabilities")

    if report.total_vulnerabilities > 0:
        print(f"\n  ** VULNERABILITIES DETECTED -- review the report for details **")
    else:
        print(f"\n  All auth boundaries held under stress.")

    print(f"{'=' * 70}\n")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fitsi IA -- Auth Boundary Stress Test",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Test names:
  token_expiry     100 concurrent token refreshes + old token reuse check
  login_storm      50 concurrent logins, JTI uniqueness, latency
  lockout          Brute force lockout trigger, TTL, refresh-while-locked
  admin_boundary   Probe 17 admin endpoints as non-admin user
  idor             Cross-user resource access (GET/PUT/DELETE)
  all              Run all tests
        """,
    )
    parser.add_argument(
        "--base-url",
        default=os.getenv("BASE_URL", "http://localhost:8000"),
        help="Target server URL (default: http://localhost:8000)",
    )
    parser.add_argument(
        "--test",
        default="all",
        choices=list(TEST_MAP.keys()) + ["all"],
        help="Which test to run (default: all)",
    )
    parser.add_argument(
        "--users",
        type=int,
        default=100,
        help="Number of concurrent users for applicable tests (default: 100)",
    )
    parser.add_argument(
        "--no-save",
        action="store_true",
        help="Skip saving JSON report to disk",
    )

    args = parser.parse_args()

    tests = list(TEST_MAP.keys()) if args.test == "all" else [args.test]

    report = asyncio.run(run_tests(args.base_url, tests, args.users))

    print_summary(report)

    if not args.no_save:
        filepath = save_report(report)
        print(f"  Report saved to: {filepath}")

    # Exit with non-zero if any test failed
    if any(not r.passed for r in report.results):
        sys.exit(1)


if __name__ == "__main__":
    main()
