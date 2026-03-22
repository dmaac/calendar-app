"""
Performance Monitoring Middleware
-----------------------------------
Request timing middleware that tracks response times, logs slow requests, and
exposes performance metrics via a dedicated endpoint.

Features:
- Adds ``X-Response-Time`` header (milliseconds) to every response
- Logs requests exceeding a configurable threshold (default 1 second)
- Maintains an in-memory rolling window of request durations for stats
- Computes avg, p50, p95, p99 response times from the rolling window
- Exposes ``GET /api/metrics/performance`` endpoint for real-time stats

Usage::

    from app.core.performance import PerformanceMiddleware, performance_stats
    app.add_middleware(PerformanceMiddleware)

    @app.get("/api/metrics/performance")
    async def get_performance():
        return performance_stats()
"""

import logging
import threading
import time
from collections import deque
from typing import Any, Deque, Dict, Optional, Set, Tuple

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)


# ─── Configuration ────────────────────────────────────────────────────────────

SLOW_REQUEST_THRESHOLD_S = 1.0       # Log requests slower than 1 second
ROLLING_WINDOW_MAX_SIZE = 5000       # Keep last 5000 request durations
ROLLING_WINDOW_MAX_AGE_S = 600       # Discard entries older than 10 minutes

# Paths to skip for performance tracking (noisy, low-value)
_SKIP_PATHS: Set[str] = {
    "/health", "/api/health", "/docs", "/redoc", "/openapi.json",
    "/metrics", "/api/metrics/performance",
}


# ─── Rolling Window Store ────────────────────────────────────────────────────

class _RollingWindow:
    """Thread-safe rolling window of (timestamp, duration_ms) tuples.

    Supports percentile calculations and automatic expiry of old entries.
    """

    def __init__(self, max_size: int = ROLLING_WINDOW_MAX_SIZE, max_age_s: float = ROLLING_WINDOW_MAX_AGE_S):
        self._max_size = max_size
        self._max_age_s = max_age_s
        self._entries: Deque[Tuple[float, float]] = deque(maxlen=max_size)
        self._lock = threading.Lock()
        # Per-endpoint tracking for top slow endpoints
        self._endpoint_totals: Dict[str, Tuple[float, int]] = {}  # path -> (total_ms, count)

    def record(self, duration_ms: float, endpoint: str = "") -> None:
        """Record a request duration."""
        now = time.monotonic()
        with self._lock:
            self._entries.append((now, duration_ms))
            # Track per-endpoint
            if endpoint:
                total, count = self._endpoint_totals.get(endpoint, (0.0, 0))
                self._endpoint_totals[endpoint] = (total + duration_ms, count + 1)

    def _prune(self) -> None:
        """Remove entries older than max_age_s. Must be called under lock."""
        cutoff = time.monotonic() - self._max_age_s
        while self._entries and self._entries[0][0] < cutoff:
            self._entries.popleft()

    def compute_stats(self) -> Dict[str, Any]:
        """Compute avg, p50, p95, p99 from current window entries."""
        with self._lock:
            self._prune()
            if not self._entries:
                return {
                    "total_requests_tracked": 0,
                    "window_size": 0,
                    "avg_ms": 0.0,
                    "p50_ms": 0.0,
                    "p95_ms": 0.0,
                    "p99_ms": 0.0,
                    "min_ms": 0.0,
                    "max_ms": 0.0,
                }

            durations = sorted(d for _, d in self._entries)
            n = len(durations)
            total = sum(durations)

            return {
                "total_requests_tracked": n,
                "window_size": n,
                "window_max_age_seconds": self._max_age_s,
                "avg_ms": round(total / n, 2),
                "p50_ms": round(durations[int(n * 0.50)], 2),
                "p95_ms": round(durations[int(n * 0.95)], 2),
                "p99_ms": round(durations[min(int(n * 0.99), n - 1)], 2),
                "min_ms": round(durations[0], 2),
                "max_ms": round(durations[-1], 2),
            }

    def top_slow_endpoints(self, limit: int = 10) -> list:
        """Return the top N endpoints by average response time."""
        with self._lock:
            ranked = []
            for path, (total_ms, count) in self._endpoint_totals.items():
                ranked.append({
                    "endpoint": path,
                    "avg_ms": round(total_ms / count, 2),
                    "total_requests": count,
                })
            ranked.sort(key=lambda x: x["avg_ms"], reverse=True)
            return ranked[:limit]


# Singleton rolling window
_window = _RollingWindow()

# Global slow request counter
_slow_request_count = 0
_slow_lock = threading.Lock()


# ─── Middleware ───────────────────────────────────────────────────────────────

class PerformanceMiddleware(BaseHTTPMiddleware):
    """Measures request duration, adds X-Response-Time header, and logs slow requests.

    All requests get the ``X-Response-Time`` header (value in milliseconds).
    Requests exceeding ``SLOW_REQUEST_THRESHOLD_S`` are logged at WARNING level
    with endpoint, method, and duration details.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        start = time.perf_counter()
        response: Response = await call_next(request)
        duration_s = time.perf_counter() - start
        duration_ms = round(duration_s * 1000, 2)

        # Always set the response time header
        response.headers["X-Response-Time"] = f"{duration_ms}ms"

        path = request.url.path

        # Skip tracking for noise endpoints
        if path in _SKIP_PATHS:
            return response

        # Record in rolling window
        _window.record(duration_ms, endpoint=f"{request.method} {path}")

        # Log slow requests
        if duration_s > SLOW_REQUEST_THRESHOLD_S:
            global _slow_request_count
            with _slow_lock:
                _slow_request_count += 1

            logger.warning(
                "SLOW REQUEST: %s %s completed in %.0fms (threshold: %.0fms) status=%d",
                request.method,
                path,
                duration_ms,
                SLOW_REQUEST_THRESHOLD_S * 1000,
                response.status_code,
            )

        return response


# ─── Stats API ────────────────────────────────────────────────────────────────

def performance_stats() -> Dict[str, Any]:
    """Return performance statistics for the GET /api/metrics/performance endpoint.

    Includes:
    - Rolling window percentiles (avg, p50, p95, p99)
    - Slow request count
    - Top 10 slowest endpoints by average response time
    """
    with _slow_lock:
        slow_count = _slow_request_count

    stats = _window.compute_stats()
    top_slow = _window.top_slow_endpoints(limit=10)

    return {
        "response_times": stats,
        "slow_requests": {
            "threshold_ms": SLOW_REQUEST_THRESHOLD_S * 1000,
            "count": slow_count,
        },
        "top_slow_endpoints": top_slow,
    }
