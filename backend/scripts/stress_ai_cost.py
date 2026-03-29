#!/usr/bin/env python3
"""
Fitsi AI -- AI Cost Abuse Vector Stress Test
=============================================

Identifies cost amplification vectors across all AI-powered endpoints:
  1. Food scan (GPT-4o Vision / Claude Vision) -- highest cost per call
  2. AI Coach chat, insight, meal suggestions -- medium cost per call
  3. Meal recommendations -- variable cost depending on AI involvement

Verifies:
  - Free-tier scan quota enforcement (3 scans/day)
  - Rate limit enforcement (10 scans/min via slowapi)
  - Coach endpoint abuse surface (no per-user rate limit found)
  - Recommendations burst behavior (no rate limit found)

Outputs:
  - Per-endpoint: total requests, successes, 429s, errors, latencies
  - Estimated AI cost projection (monthly)
  - JSON report: results/ai_cost_stress_TIMESTAMP.json

Usage:
    python -m scripts.stress_ai_cost --base-url http://localhost:8000 --users 10
    python -m scripts.stress_ai_cost --base-url http://localhost:8000 --users 50 --duration 120

Prerequisites:
    pip install httpx
    python -m scripts.seed_users --count 100   (seed test users first)
"""

from __future__ import annotations

import argparse
import asyncio
import io
import json
import logging
import os
import struct
import sys
import time
import zlib
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import httpx

logger = logging.getLogger("ai_cost_stress")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SEED_EMAIL_DOMAIN = "fitsi.test"
SEED_PASSWORD = "Test1234"

# Estimated cost per AI API call (USD).
# GPT-4o Vision: ~$0.01-0.03 per image depending on resolution.
# Claude Vision: ~$0.01-0.04 per image.
# Coach chat (GPT-4o text): ~$0.005-0.02 per message.
# Coach insight / meal suggestion: ~$0.005-0.02 per call.
# Recommendations: $0 if DB-only, ~$0.01 if AI-enriched.
COST_ESTIMATES = {
    "food_scan": 0.025,       # Vision API call -- highest cost
    "coach_chat": 0.015,      # Text completion -- medium
    "coach_insight": 0.010,   # Text completion -- shorter prompt
    "coach_suggest": 0.015,   # Text completion -- structured output
    "recommendations": 0.005, # Mostly DB, may trigger AI
    "recommendations_meals": 0.000,  # Pure DB browse -- no AI cost
}

# How many seconds of data to extrapolate to 30 days
SECONDS_PER_MONTH = 30 * 24 * 3600


# ---------------------------------------------------------------------------
# Minimal valid JPEG image generator (no PIL required)
# ---------------------------------------------------------------------------

def make_test_jpeg() -> bytes:
    """
    Generate a minimal valid 1x1 pixel JPEG image in memory.
    This avoids a dependency on PIL/Pillow for the stress test.
    The image is ~631 bytes -- well under any size limit.
    """
    # Minimal JPEG: SOI + APP0 + DQT + SOF0 + DHT + SOS + EOI
    # This is a hand-crafted minimal valid JPEG that decodes to a 1x1 red pixel.
    return bytes([
        # SOI (Start of Image)
        0xFF, 0xD8,
        # APP0 (JFIF marker)
        0xFF, 0xE0, 0x00, 0x10,
        0x4A, 0x46, 0x49, 0x46, 0x00,  # "JFIF\0"
        0x01, 0x01,  # version 1.1
        0x00,        # aspect ratio units: none
        0x00, 0x01,  # X density
        0x00, 0x01,  # Y density
        0x00, 0x00,  # no thumbnail
        # DQT (Define Quantization Table)
        0xFF, 0xDB, 0x00, 0x43, 0x00,
        # 64 bytes of quantization values (all 1s for minimal size)
        *([0x01] * 64),
        # SOF0 (Start of Frame, baseline DCT)
        0xFF, 0xC0, 0x00, 0x0B,
        0x08,        # precision: 8 bits
        0x00, 0x01,  # height: 1
        0x00, 0x01,  # width: 1
        0x01,        # 1 component (grayscale)
        0x01,        # component ID: 1
        0x11,        # sampling factors: 1x1
        0x00,        # quantization table: 0
        # DHT (Define Huffman Table -- DC table)
        0xFF, 0xC4, 0x00, 0x1F, 0x00,
        # Counts for codes of length 1..16
        0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01,
        0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        # Values
        0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B,
        # DHT (Define Huffman Table -- AC table)
        0xFF, 0xC4, 0x00, 0xB5, 0x10,
        # Counts for codes of length 1..16
        0x00, 0x02, 0x01, 0x03, 0x03, 0x02, 0x04, 0x03,
        0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7D,
        # Values (standard AC Huffman table)
        0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12,
        0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07,
        0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xA1, 0x08,
        0x23, 0x42, 0xB1, 0xC1, 0x15, 0x52, 0xD1, 0xF0,
        0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0A, 0x16,
        0x17, 0x18, 0x19, 0x1A, 0x25, 0x26, 0x27, 0x28,
        0x29, 0x2A, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39,
        0x3A, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49,
        0x4A, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
        0x5A, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69,
        0x6A, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79,
        0x7A, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
        0x8A, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98,
        0x99, 0x9A, 0xA2, 0xA3, 0xA4, 0xA5, 0xA6, 0xA7,
        0xA8, 0xA9, 0xAA, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6,
        0xB7, 0xB8, 0xB9, 0xBA, 0xC2, 0xC3, 0xC4, 0xC5,
        0xC6, 0xC7, 0xC8, 0xC9, 0xCA, 0xD2, 0xD3, 0xD4,
        0xD5, 0xD6, 0xD7, 0xD8, 0xD9, 0xDA, 0xE1, 0xE2,
        0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA,
        0xF1, 0xF2, 0xF3, 0xF4, 0xF5, 0xF6, 0xF7, 0xF8,
        0xF9, 0xFA,
        # SOS (Start of Scan)
        0xFF, 0xDA, 0x00, 0x08,
        0x01,        # 1 component
        0x01,        # component ID: 1
        0x00,        # DC/AC table selector
        0x00, 0x3F,  # spectral selection start/end
        0x00,        # successive approximation
        # Minimal scan data (encoded single pixel)
        0x7B, 0x40,
        # EOI (End of Image)
        0xFF, 0xD9,
    ])


def make_test_png() -> bytes:
    """
    Generate a minimal valid 1x1 pixel PNG image in memory.
    Fallback if the JPEG is rejected by the server.
    """
    # PNG signature
    sig = b'\x89PNG\r\n\x1a\n'

    def _chunk(chunk_type: bytes, data: bytes) -> bytes:
        raw = chunk_type + data
        return struct.pack('>I', len(data)) + raw + struct.pack('>I', zlib.crc32(raw) & 0xFFFFFFFF)

    # IHDR: 1x1, 8-bit RGB, no interlace
    ihdr_data = struct.pack('>IIBBBBB', 1, 1, 8, 2, 0, 0, 0)
    # IDAT: single red pixel (filter byte 0 + R G B)
    raw_row = b'\x00\xff\x00\x00'  # filter=none, red pixel
    idat_data = zlib.compress(raw_row)
    # IEND
    return sig + _chunk(b'IHDR', ihdr_data) + _chunk(b'IDAT', idat_data) + _chunk(b'IEND', b'')


# ---------------------------------------------------------------------------
# Data collection
# ---------------------------------------------------------------------------

@dataclass
class EndpointStats:
    """Aggregated stats for a single endpoint."""
    endpoint: str
    method: str
    total_requests: int = 0
    successes: int = 0
    rate_limited_429: int = 0
    quota_limited_429: int = 0
    auth_errors_401: int = 0
    client_errors_4xx: int = 0
    server_errors_5xx: int = 0
    total_latency_ms: float = 0.0
    min_latency_ms: float = float("inf")
    max_latency_ms: float = 0.0
    estimated_ai_cost_usd: float = 0.0

    @property
    def avg_latency_ms(self) -> float:
        return self.total_latency_ms / self.total_requests if self.total_requests else 0.0

    def record(self, status_code: int, latency_ms: float, cost_per_call: float, detail: str = ""):
        self.total_requests += 1
        self.total_latency_ms += latency_ms
        self.min_latency_ms = min(self.min_latency_ms, latency_ms)
        self.max_latency_ms = max(self.max_latency_ms, latency_ms)

        if 200 <= status_code < 300:
            self.successes += 1
            self.estimated_ai_cost_usd += cost_per_call
        elif status_code == 429:
            if "scan limit" in detail.lower() or "quota" in detail.lower() or "daily" in detail.lower():
                self.quota_limited_429 += 1
            else:
                self.rate_limited_429 += 1
        elif status_code == 401:
            self.auth_errors_401 += 1
        elif 400 <= status_code < 500:
            self.client_errors_4xx += 1
        else:
            self.server_errors_5xx += 1

    def to_dict(self) -> dict:
        d = asdict(self)
        d["avg_latency_ms"] = round(self.avg_latency_ms, 2)
        d["min_latency_ms"] = round(self.min_latency_ms, 2) if self.min_latency_ms != float("inf") else 0.0
        d["max_latency_ms"] = round(self.max_latency_ms, 2)
        d["estimated_ai_cost_usd"] = round(self.estimated_ai_cost_usd, 4)
        d["total_latency_ms"] = round(self.total_latency_ms, 2)
        return d


@dataclass
class UserSession:
    """Holds a single authenticated user session."""
    user_idx: int
    email: str
    token: str = ""
    login_failed: bool = False


# ---------------------------------------------------------------------------
# Test runner
# ---------------------------------------------------------------------------

class AICostStressTest:
    """
    Orchestrates concurrent AI cost abuse testing across multiple user sessions.
    """

    def __init__(
        self,
        base_url: str,
        num_users: int = 10,
        duration_seconds: int = 60,
        timeout_seconds: float = 30.0,
    ):
        self.base_url = base_url.rstrip("/")
        self.num_users = num_users
        self.duration_seconds = duration_seconds
        self.timeout_seconds = timeout_seconds

        self.test_image_jpeg = make_test_jpeg()
        self.test_image_png = make_test_png()

        self.stats: dict[str, EndpointStats] = {
            "food_scan": EndpointStats(endpoint="POST /api/food/scan", method="POST"),
            "coach_chat": EndpointStats(endpoint="POST /api/coach/chat", method="POST"),
            "coach_insight": EndpointStats(endpoint="GET /api/coach/insight", method="GET"),
            "coach_suggest": EndpointStats(endpoint="GET /api/coach/suggest/{meal_type}", method="GET"),
            "recommendations": EndpointStats(endpoint="GET /api/recommendations", method="GET"),
            "recommendations_meals": EndpointStats(endpoint="GET /api/recommendations/meals", method="GET"),
        }

        self.sessions: list[UserSession] = []
        self.start_time: float = 0.0
        self.end_time: float = 0.0

    # -- Authentication --------------------------------------------------------

    async def _login(self, client: httpx.AsyncClient, user_idx: int) -> UserSession:
        """Authenticate a single test user and return a UserSession."""
        email = f"user_{user_idx:04d}@{SEED_EMAIL_DOMAIN}"
        session = UserSession(user_idx=user_idx, email=email)

        try:
            resp = await client.post(
                f"{self.base_url}/auth/login",
                data={"username": email, "password": SEED_PASSWORD},
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=self.timeout_seconds,
            )
            if resp.status_code == 200:
                session.token = resp.json().get("access_token", "")
                if not session.token:
                    logger.warning("Login returned 200 but no access_token for %s", email)
                    session.login_failed = True
            else:
                logger.warning("Login failed for %s: HTTP %d", email, resp.status_code)
                session.login_failed = True
        except Exception as exc:
            logger.error("Login exception for %s: %s", email, exc)
            session.login_failed = True

        return session

    async def authenticate_all(self, client: httpx.AsyncClient) -> None:
        """Login all test users concurrently."""
        logger.info("Authenticating %d test users...", self.num_users)
        tasks = [self._login(client, i + 1) for i in range(self.num_users)]
        self.sessions = await asyncio.gather(*tasks)
        active = sum(1 for s in self.sessions if not s.login_failed)
        logger.info("Authenticated %d/%d users successfully", active, self.num_users)
        if active == 0:
            logger.error("No users authenticated. Ensure seed users exist. Aborting.")
            sys.exit(1)

    def _auth_headers(self, session: UserSession) -> dict[str, str]:
        return {"Authorization": f"Bearer {session.token}"}

    # -- Test vectors ----------------------------------------------------------

    async def _test_food_scan(
        self, client: httpx.AsyncClient, session: UserSession
    ) -> None:
        """
        POST /api/food/scan -- upload a test JPEG image.

        This is the most expensive endpoint: each successful call triggers
        a GPT-4o Vision or Claude Vision API call (~$0.025).

        Tests:
          - Free-tier quota enforcement (3 scans/day per user)
          - Rate limit enforcement (10/min per IP via slowapi)
          - Whether the server properly rejects after quota is exhausted
        """
        stat_key = "food_scan"
        cost = COST_ESTIMATES[stat_key]

        files = {"image": ("test_food.jpg", self.test_image_jpeg, "image/jpeg")}
        data = {"meal_type": "lunch"}

        t0 = time.monotonic()
        try:
            resp = await client.post(
                f"{self.base_url}/api/food/scan",
                files=files,
                data=data,
                headers=self._auth_headers(session),
                timeout=self.timeout_seconds,
            )
            latency = (time.monotonic() - t0) * 1000
            detail = ""
            if resp.status_code != 200:
                try:
                    detail = resp.json().get("detail", "")
                except Exception:
                    detail = resp.text[:200]
            self.stats[stat_key].record(resp.status_code, latency, cost, detail)
        except httpx.TimeoutException:
            latency = (time.monotonic() - t0) * 1000
            self.stats[stat_key].record(504, latency, 0.0, "timeout")
        except Exception as exc:
            latency = (time.monotonic() - t0) * 1000
            logger.debug("food_scan error: %s", exc)
            self.stats[stat_key].record(0, latency, 0.0, str(exc))

    async def _test_coach_chat(
        self, client: httpx.AsyncClient, session: UserSession
    ) -> None:
        """
        POST /api/coach/chat -- send a text message to the AI coach.

        No per-user rate limit was found on this endpoint.
        Each call triggers a GPT-4o text completion (~$0.015).

        Tests varying message lengths to measure cost sensitivity.
        """
        stat_key = "coach_chat"
        cost = COST_ESTIMATES[stat_key]

        # Vary message length to test cost amplification via longer prompts.
        # The schema allows max 1000 characters.
        messages = [
            "How are my macros today?",
            "I ate a big lunch with pasta and chicken. Should I eat less for dinner? What do you recommend?",
            ("Give me a detailed analysis of my nutrition this week. "
             "I want to know if I'm hitting my protein targets, whether my "
             "carb intake is too high, and suggestions for improving my overall "
             "diet quality. Also tell me about my calorie deficit progress and "
             "whether I should adjust my meal timing. " * 2)[:1000],
        ]
        import random
        message = random.choice(messages)

        t0 = time.monotonic()
        try:
            resp = await client.post(
                f"{self.base_url}/api/coach/chat",
                json={"message": message},
                headers={**self._auth_headers(session), "Content-Type": "application/json"},
                timeout=self.timeout_seconds,
            )
            latency = (time.monotonic() - t0) * 1000
            detail = ""
            if resp.status_code != 200:
                try:
                    detail = resp.json().get("detail", "")
                except Exception:
                    detail = resp.text[:200]
            self.stats[stat_key].record(resp.status_code, latency, cost, detail)
        except httpx.TimeoutException:
            latency = (time.monotonic() - t0) * 1000
            self.stats[stat_key].record(504, latency, 0.0, "timeout")
        except Exception as exc:
            latency = (time.monotonic() - t0) * 1000
            self.stats[stat_key].record(0, latency, 0.0, str(exc))

    async def _test_coach_insight(
        self, client: httpx.AsyncClient, session: UserSession
    ) -> None:
        """
        GET /api/coach/insight -- proactive daily insight from AI.

        No rate limit. Each call generates a personalized insight via LLM.
        """
        stat_key = "coach_insight"
        cost = COST_ESTIMATES[stat_key]

        t0 = time.monotonic()
        try:
            resp = await client.get(
                f"{self.base_url}/api/coach/insight",
                headers=self._auth_headers(session),
                timeout=self.timeout_seconds,
            )
            latency = (time.monotonic() - t0) * 1000
            detail = ""
            if resp.status_code != 200:
                try:
                    detail = resp.json().get("detail", "")
                except Exception:
                    detail = resp.text[:200]
            self.stats[stat_key].record(resp.status_code, latency, cost, detail)
        except httpx.TimeoutException:
            latency = (time.monotonic() - t0) * 1000
            self.stats[stat_key].record(504, latency, 0.0, "timeout")
        except Exception as exc:
            latency = (time.monotonic() - t0) * 1000
            self.stats[stat_key].record(0, latency, 0.0, str(exc))

    async def _test_coach_suggest(
        self, client: httpx.AsyncClient, session: UserSession
    ) -> None:
        """
        GET /api/coach/suggest/{meal_type} -- AI-generated meal suggestion.

        No rate limit. Each call triggers structured LLM output.
        """
        stat_key = "coach_suggest"
        cost = COST_ESTIMATES[stat_key]
        import random
        meal_type = random.choice(["breakfast", "lunch", "dinner", "snack"])

        t0 = time.monotonic()
        try:
            resp = await client.get(
                f"{self.base_url}/api/coach/suggest/{meal_type}",
                headers=self._auth_headers(session),
                timeout=self.timeout_seconds,
            )
            latency = (time.monotonic() - t0) * 1000
            detail = ""
            if resp.status_code != 200:
                try:
                    detail = resp.json().get("detail", "")
                except Exception:
                    detail = resp.text[:200]
            self.stats[stat_key].record(resp.status_code, latency, cost, detail)
        except httpx.TimeoutException:
            latency = (time.monotonic() - t0) * 1000
            self.stats[stat_key].record(504, latency, 0.0, "timeout")
        except Exception as exc:
            latency = (time.monotonic() - t0) * 1000
            self.stats[stat_key].record(0, latency, 0.0, str(exc))

    async def _test_recommendations(
        self, client: httpx.AsyncClient, session: UserSession
    ) -> None:
        """
        GET /api/recommendations -- personalized recommendations (may use AI).

        No rate limit found. Tests burst behavior.
        """
        stat_key = "recommendations"
        cost = COST_ESTIMATES[stat_key]
        import random
        meal_type = random.choice(["breakfast", "lunch", "dinner", "snack", None])
        params = {"limit": 10}
        if meal_type:
            params["meal_type"] = meal_type

        t0 = time.monotonic()
        try:
            resp = await client.get(
                f"{self.base_url}/api/recommendations",
                params=params,
                headers=self._auth_headers(session),
                timeout=self.timeout_seconds,
            )
            latency = (time.monotonic() - t0) * 1000
            detail = ""
            if resp.status_code != 200:
                try:
                    detail = resp.json().get("detail", "")
                except Exception:
                    detail = resp.text[:200]
            self.stats[stat_key].record(resp.status_code, latency, cost, detail)
        except httpx.TimeoutException:
            latency = (time.monotonic() - t0) * 1000
            self.stats[stat_key].record(504, latency, 0.0, "timeout")
        except Exception as exc:
            latency = (time.monotonic() - t0) * 1000
            self.stats[stat_key].record(0, latency, 0.0, str(exc))

    async def _test_recommendations_meals(
        self, client: httpx.AsyncClient, session: UserSession
    ) -> None:
        """
        GET /api/recommendations/meals -- browse meal templates (no auth required).

        No AI cost but tests if unauthenticated burst is possible.
        """
        stat_key = "recommendations_meals"
        cost = COST_ESTIMATES[stat_key]
        import random
        params = {"page": random.randint(1, 5), "limit": 20}

        t0 = time.monotonic()
        try:
            resp = await client.get(
                f"{self.base_url}/api/recommendations/meals",
                params=params,
                timeout=self.timeout_seconds,
            )
            latency = (time.monotonic() - t0) * 1000
            detail = ""
            if resp.status_code != 200:
                try:
                    detail = resp.json().get("detail", "")
                except Exception:
                    detail = resp.text[:200]
            self.stats[stat_key].record(resp.status_code, latency, cost, detail)
        except httpx.TimeoutException:
            latency = (time.monotonic() - t0) * 1000
            self.stats[stat_key].record(504, latency, 0.0, "timeout")
        except Exception as exc:
            latency = (time.monotonic() - t0) * 1000
            self.stats[stat_key].record(0, latency, 0.0, str(exc))

    # -- Phase orchestration ---------------------------------------------------

    async def _run_user_loop(
        self,
        client: httpx.AsyncClient,
        session: UserSession,
        test_fn,
        stop_event: asyncio.Event,
    ) -> None:
        """
        Continuously call test_fn for a single user until stop_event is set.
        No artificial delay -- maximum pressure to find rate limit gaps.
        """
        if session.login_failed:
            return
        while not stop_event.is_set():
            await test_fn(client, session)
            # Yield control to allow other coroutines to run
            await asyncio.sleep(0)

    async def run_phase(
        self,
        phase_name: str,
        test_fn,
        duration: int,
        client: httpx.AsyncClient,
    ) -> None:
        """Run a single test phase with all users for the given duration."""
        logger.info(
            "--- Phase: %s | %d users | %d seconds ---",
            phase_name, self.num_users, duration,
        )

        stop_event = asyncio.Event()
        active_sessions = [s for s in self.sessions if not s.login_failed]

        tasks = [
            asyncio.create_task(
                self._run_user_loop(client, s, test_fn, stop_event)
            )
            for s in active_sessions
        ]

        await asyncio.sleep(duration)
        stop_event.set()

        # Wait for all tasks to complete (they should exit quickly after stop)
        await asyncio.gather(*tasks, return_exceptions=True)

        logger.info("Phase %s complete.", phase_name)

    # -- Main entry point ------------------------------------------------------

    async def run(self) -> dict:
        """Execute all test phases and return the full report."""
        self.start_time = time.monotonic()
        start_dt = datetime.now(timezone.utc)

        limits = httpx.Limits(
            max_connections=self.num_users * 2,
            max_keepalive_connections=self.num_users,
        )
        async with httpx.AsyncClient(limits=limits) as client:
            # Step 1: Authenticate all users
            await self.authenticate_all(client)

            # Step 2: Run each test phase.
            # Allocate time across phases. Scan gets the most since it tests
            # both rate limiting and quota enforcement.
            phase_duration = max(self.duration_seconds // 5, 10)

            phases = [
                ("AI Food Scan (cost=$0.025/call)", self._test_food_scan, phase_duration * 2),
                ("Coach Chat (cost=$0.015/call)", self._test_coach_chat, phase_duration),
                ("Coach Insight (cost=$0.010/call)", self._test_coach_insight, phase_duration // 2),
                ("Coach Meal Suggest (cost=$0.015/call)", self._test_coach_suggest, phase_duration // 2),
                ("Recommendations (cost=$0.005/call)", self._test_recommendations, phase_duration // 2),
                ("Recommendations/Meals Browse (cost=$0.000)", self._test_recommendations_meals, phase_duration // 2),
            ]

            for name, fn, dur in phases:
                await self.run_phase(name, fn, dur, client)

        self.end_time = time.monotonic()
        elapsed = self.end_time - self.start_time

        return self._build_report(elapsed, start_dt)

    # -- Reporting -------------------------------------------------------------

    def _build_report(self, elapsed_seconds: float, start_dt: datetime) -> dict:
        """Build the final JSON report with cost projections."""
        total_ai_cost = 0.0
        total_requests = 0
        total_successes = 0
        total_429s = 0
        endpoint_reports = {}

        for key, stat in self.stats.items():
            total_ai_cost += stat.estimated_ai_cost_usd
            total_requests += stat.total_requests
            total_successes += stat.successes
            total_429s += stat.rate_limited_429 + stat.quota_limited_429
            endpoint_reports[key] = stat.to_dict()

        # Monthly projection: extrapolate from test duration to 30 days
        if elapsed_seconds > 0:
            cost_per_second = total_ai_cost / elapsed_seconds
            monthly_projection = cost_per_second * SECONDS_PER_MONTH
            requests_per_second = total_requests / elapsed_seconds
        else:
            cost_per_second = 0.0
            monthly_projection = 0.0
            requests_per_second = 0.0

        # Vulnerability assessment
        vulnerabilities = []
        for key, stat in self.stats.items():
            if stat.rate_limited_429 == 0 and stat.successes > 10 and key != "recommendations_meals":
                vulnerabilities.append({
                    "endpoint": stat.endpoint,
                    "severity": "HIGH" if COST_ESTIMATES.get(key, 0) >= 0.01 else "MEDIUM",
                    "finding": f"No rate limiting detected after {stat.successes} successful requests",
                    "estimated_cost_per_call": COST_ESTIMATES.get(key, 0),
                    "recommendation": "Add per-user rate limiting (e.g., slowapi with user-keyed limiter)",
                })

            if stat.quota_limited_429 == 0 and key == "food_scan" and stat.successes > 3:
                vulnerabilities.append({
                    "endpoint": stat.endpoint,
                    "severity": "CRITICAL",
                    "finding": (
                        f"Free-tier scan quota (3/day) NOT enforced -- "
                        f"{stat.successes} scans succeeded"
                    ),
                    "recommendation": "Verify FREE_SCAN_LIMIT_PER_DAY enforcement in ai_food.py",
                })

        report = {
            "test_metadata": {
                "started_at": start_dt.isoformat(),
                "duration_seconds": round(elapsed_seconds, 2),
                "base_url": self.base_url,
                "concurrent_users": self.num_users,
                "users_authenticated": sum(1 for s in self.sessions if not s.login_failed),
            },
            "aggregate": {
                "total_requests": total_requests,
                "total_successes": total_successes,
                "total_rate_limited_429": total_429s,
                "requests_per_second": round(requests_per_second, 2),
                "total_estimated_ai_cost_usd": round(total_ai_cost, 4),
                "cost_per_second_usd": round(cost_per_second, 6),
            },
            "cost_projection": {
                "monthly_cost_at_test_rate_usd": round(monthly_projection, 2),
                "monthly_cost_per_user_usd": round(
                    monthly_projection / self.num_users if self.num_users else 0, 2
                ),
                "note": (
                    "This is a worst-case projection assuming continuous abuse "
                    "at the observed test rate for 30 days."
                ),
            },
            "endpoints": endpoint_reports,
            "vulnerabilities": vulnerabilities,
            "vulnerability_count": len(vulnerabilities),
        }

        return report

    @staticmethod
    def print_report(report: dict) -> None:
        """Pretty-print the report to the console."""
        meta = report["test_metadata"]
        agg = report["aggregate"]
        proj = report["cost_projection"]

        print("\n" + "=" * 72)
        print("  FITSI AI -- AI COST ABUSE VECTOR STRESS TEST REPORT")
        print("=" * 72)

        print(f"\n  Started:     {meta['started_at']}")
        print(f"  Duration:    {meta['duration_seconds']}s")
        print(f"  Users:       {meta['concurrent_users']} ({meta['users_authenticated']} authenticated)")
        print(f"  Base URL:    {meta['base_url']}")

        print(f"\n  Total Requests:     {agg['total_requests']:,}")
        print(f"  Successes:          {agg['total_successes']:,}")
        print(f"  Rate Limited (429): {agg['total_rate_limited_429']:,}")
        print(f"  Requests/sec:       {agg['requests_per_second']:.1f}")

        print(f"\n  AI Cost (test run):     ${agg['total_estimated_ai_cost_usd']:.4f}")
        print(f"  Cost/second:            ${agg['cost_per_second_usd']:.6f}")

        print("\n" + "-" * 72)
        print("  COST PROJECTION (worst-case, 30 days continuous abuse)")
        print("-" * 72)
        print(f"  Monthly cost at test rate:   ${proj['monthly_cost_at_test_rate_usd']:,.2f}")
        print(f"  Monthly cost per abuser:     ${proj['monthly_cost_per_user_usd']:,.2f}")

        print("\n" + "-" * 72)
        print("  ENDPOINT BREAKDOWN")
        print("-" * 72)
        fmt = "  {:<40s} {:>6s} {:>6s} {:>6s} {:>8s} {:>8s}"
        print(fmt.format("Endpoint", "Total", "OK", "429", "Avg(ms)", "Cost($)"))
        print("  " + "-" * 68)
        for key, ep in report["endpoints"].items():
            total_429 = ep["rate_limited_429"] + ep["quota_limited_429"]
            print(fmt.format(
                ep["endpoint"][:40],
                str(ep["total_requests"]),
                str(ep["successes"]),
                str(total_429),
                f"{ep['avg_latency_ms']:.0f}",
                f"{ep['estimated_ai_cost_usd']:.4f}",
            ))

        vulns = report.get("vulnerabilities", [])
        if vulns:
            print("\n" + "-" * 72)
            print(f"  VULNERABILITIES FOUND: {len(vulns)}")
            print("-" * 72)
            for i, v in enumerate(vulns, 1):
                print(f"\n  [{i}] [{v['severity']}] {v['endpoint']}")
                print(f"      Finding: {v['finding']}")
                print(f"      Recommendation: {v['recommendation']}")
        else:
            print("\n  No cost abuse vulnerabilities detected.")

        print("\n" + "=" * 72 + "\n")

    @staticmethod
    def save_report(report: dict, output_dir: str = "results") -> str:
        """Save report as JSON and return the file path."""
        out_path = Path(output_dir)
        out_path.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"ai_cost_stress_{timestamp}.json"
        filepath = out_path / filename

        with open(filepath, "w") as f:
            json.dump(report, f, indent=2, default=str)

        logger.info("Report saved: %s", filepath)
        return str(filepath)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fitsi AI -- AI Cost Abuse Vector Stress Test",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python -m scripts.stress_ai_cost --base-url http://localhost:8000 --users 10\n"
            "  python -m scripts.stress_ai_cost --base-url http://localhost:8000 --users 50 --duration 120\n"
        ),
    )
    parser.add_argument(
        "--base-url",
        default=os.getenv("FITSI_BASE_URL", "http://localhost:8000"),
        help="Base URL of the Fitsi API (default: http://localhost:8000)",
    )
    parser.add_argument(
        "--users",
        type=int,
        default=10,
        help="Number of concurrent users to simulate (default: 10)",
    )
    parser.add_argument(
        "--duration",
        type=int,
        default=60,
        help="Total test duration in seconds (default: 60)",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=30.0,
        help="Per-request timeout in seconds (default: 30.0)",
    )
    parser.add_argument(
        "--output-dir",
        default="results",
        help="Directory for output reports (default: results/)",
    )
    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Enable debug logging",
    )
    return parser.parse_args()


async def main() -> None:
    args = parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    print(f"\nFitsi AI -- AI Cost Stress Test")
    print(f"Target:   {args.base_url}")
    print(f"Users:    {args.users}")
    print(f"Duration: {args.duration}s")
    print(f"Timeout:  {args.timeout}s per request\n")

    runner = AICostStressTest(
        base_url=args.base_url,
        num_users=args.users,
        duration_seconds=args.duration,
        timeout_seconds=args.timeout,
    )

    report = await runner.run()

    # Print and save
    runner.print_report(report)
    filepath = runner.save_report(report, output_dir=args.output_dir)
    print(f"Report saved to: {filepath}\n")


if __name__ == "__main__":
    asyncio.run(main())
