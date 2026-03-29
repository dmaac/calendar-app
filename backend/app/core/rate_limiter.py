"""Sliding-window rate limiter with per-user tiers and burst allowance.

Uses Redis sorted sets for accurate sliding-window counting.
Falls back to in-memory sliding window when Redis is unavailable (fail-closed).

Usage::

    from app.core.rate_limiter import RateLimiterMiddleware
    app.add_middleware(RateLimiterMiddleware)

Or apply per-route with the dependency::

    from app.core.rate_limiter import rate_limit_dependency
    @router.get("/scan", dependencies=[Depends(rate_limit_dependency)])
    async def scan_food(): ...
"""
import threading
import time
import logging
from collections import defaultdict
from typing import Optional

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.core.token_store import get_redis

logger = logging.getLogger(__name__)

# ─── Tier definitions ───────────────────────────────────────────────────────

RATE_TIERS = {
    "free": {"requests_per_minute": 30, "burst": 10},
    "premium": {"requests_per_minute": 120, "burst": 10},
    "admin": {"requests_per_minute": 600, "burst": 50},
}

DEFAULT_TIER = "free"
WINDOW_SECONDS = 60

# Paths exempt from rate limiting
_EXEMPT_PATHS = {"/health", "/api/health", "/docs", "/redoc", "/openapi.json", "/"}

# ─── In-memory fallback for when Redis is unavailable ───────────────────────
# SEC: Rate limiting must NOT become a no-op when Redis is down. This
# in-memory sliding window provides degraded but functional rate limiting.
# Thread-safe via a lock; entries auto-expire to prevent unbounded memory growth.

_MEM_LOCK = threading.Lock()
_MEM_WINDOWS: dict[str, list[float]] = defaultdict(list)
_MEM_LAST_CLEANUP = time.time()
_MEM_CLEANUP_INTERVAL = 300  # Clean up stale entries every 5 minutes


def _mem_cleanup_if_needed() -> None:
    """Remove stale entries older than the window to prevent unbounded memory growth."""
    global _MEM_LAST_CLEANUP
    now = time.time()
    if now - _MEM_LAST_CLEANUP < _MEM_CLEANUP_INTERVAL:
        return
    _MEM_LAST_CLEANUP = now
    cutoff = now - WINDOW_SECONDS
    stale_keys = [k for k, v in _MEM_WINDOWS.items() if not v or v[-1] < cutoff]
    for k in stale_keys:
        del _MEM_WINDOWS[k]


def _check_rate_limit_memory(identifier: str, tier: str = DEFAULT_TIER) -> dict:
    """In-memory sliding-window rate check (fallback when Redis is unavailable)."""
    tier_config = RATE_TIERS.get(tier, RATE_TIERS[DEFAULT_TIER])
    max_requests = tier_config["requests_per_minute"]
    burst = tier_config["burst"]
    effective_limit = max_requests + burst

    now = time.time()
    window_start = now - WINDOW_SECONDS

    with _MEM_LOCK:
        _mem_cleanup_if_needed()
        # Remove expired timestamps
        timestamps = _MEM_WINDOWS[identifier]
        _MEM_WINDOWS[identifier] = [t for t in timestamps if t > window_start]
        current_count = len(_MEM_WINDOWS[identifier])

        if current_count >= effective_limit:
            oldest = _MEM_WINDOWS[identifier][0] if _MEM_WINDOWS[identifier] else now
            retry_after = max(0, WINDOW_SECONDS - (now - oldest))
            return {
                "allowed": False,
                "limit": max_requests,
                "remaining": 0,
                "reset": int(now + retry_after),
                "retry_after": int(retry_after) + 1,
            }

        _MEM_WINDOWS[identifier].append(now)
        remaining = max(0, effective_limit - current_count - 1)

    return {
        "allowed": True,
        "limit": max_requests,
        "remaining": remaining,
        "reset": int(now + WINDOW_SECONDS),
        "retry_after": 0,
    }


# ─── Core sliding-window logic ──────────────────────────────────────────────

async def _check_rate_limit(
    identifier: str,
    tier: str = DEFAULT_TIER,
) -> dict:
    """Check and consume one request against the sliding window.

    Returns dict with: allowed (bool), limit, remaining, reset (epoch), retry_after (seconds).
    Uses a Redis sorted set where each member is a unique request timestamp
    and score is the epoch time.
    """
    r = get_redis()
    tier_config = RATE_TIERS.get(tier, RATE_TIERS[DEFAULT_TIER])
    max_requests = tier_config["requests_per_minute"]
    burst = tier_config["burst"]
    effective_limit = max_requests + burst

    now = time.time()
    window_start = now - WINDOW_SECONDS
    key = f"ratelimit:{identifier}"

    pipe = r.pipeline()
    # Remove expired entries outside the window
    pipe.zremrangebyscore(key, 0, window_start)
    # Count current entries in the window
    pipe.zcard(key)
    results = await pipe.execute()
    current_count = results[1]

    if current_count >= effective_limit:
        # Find when the oldest request in the window expires
        oldest = await r.zrange(key, 0, 0, withscores=True)
        if oldest:
            retry_after = max(0, WINDOW_SECONDS - (now - oldest[0][1]))
        else:
            retry_after = WINDOW_SECONDS
        reset_at = int(now + retry_after)
        return {
            "allowed": False,
            "limit": max_requests,
            "remaining": 0,
            "reset": reset_at,
            "retry_after": int(retry_after) + 1,
        }

    # Add current request
    member = f"{now}:{id(now)}"  # unique member
    pipe2 = r.pipeline()
    pipe2.zadd(key, {member: now})
    pipe2.expire(key, WINDOW_SECONDS + 5)
    await pipe2.execute()

    remaining = max(0, effective_limit - current_count - 1)
    reset_at = int(now + WINDOW_SECONDS)

    return {
        "allowed": True,
        "limit": max_requests,
        "remaining": remaining,
        "reset": reset_at,
        "retry_after": 0,
    }


def _add_rate_limit_headers(response: Response, result: dict):
    """Attach X-RateLimit-* headers to the response."""
    response.headers["X-RateLimit-Limit"] = str(result["limit"])
    response.headers["X-RateLimit-Remaining"] = str(result["remaining"])
    response.headers["X-RateLimit-Reset"] = str(result["reset"])
    if result["retry_after"]:
        response.headers["Retry-After"] = str(result["retry_after"])


# ─── Identify caller ────────────────────────────────────────────────────────

def _get_user_id_from_request(request: Request) -> Optional[int]:
    """Best-effort extraction of user_id from JWT without DB hit."""
    try:
        from app.core.security import verify_token
        auth = request.headers.get("authorization", "")
        if auth.startswith("Bearer "):
            return verify_token(auth[7:])
    except Exception:
        pass
    return None


def _get_client_ip(request: Request) -> str:
    """Extract real client IP, only trusting X-Forwarded-For from known proxies."""
    from app.core.ip_utils import get_client_ip
    return get_client_ip(request)


def _get_user_tier(request: Request) -> str:
    """Determine the user's rate-limit tier.

    In a full implementation this would check the user's subscription status.
    For now, default to 'free' unless a header override is present (for testing).
    """
    # Check if the user object was attached by auth middleware
    user = getattr(request.state, "user", None)
    if user and getattr(user, "is_premium", False):
        return "premium"
    return DEFAULT_TIER


# ─── Middleware ──────────────────────────────────────────────────────────────

class RateLimiterMiddleware(BaseHTTPMiddleware):
    """Per-user sliding-window rate limiter.

    Identifies callers by user_id (JWT) when available, falling back to IP.
    """

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if path in _EXEMPT_PATHS or request.method == "OPTIONS":
            return await call_next(request)

        # Identify caller: prefer user_id, fallback to IP
        user_id = _get_user_id_from_request(request)
        if user_id:
            identifier = f"user:{user_id}"
            tier = _get_user_tier(request)
        else:
            identifier = f"ip:{_get_client_ip(request)}"
            tier = DEFAULT_TIER

        try:
            result = await _check_rate_limit(identifier, tier)
        except Exception as exc:
            # SEC: If Redis is down, fall back to in-memory rate limiting
            # instead of allowing all requests (fail-closed, not fail-open).
            logger.warning("Rate limiter Redis error — using in-memory fallback: %s", exc)
            result = _check_rate_limit_memory(identifier, tier)

        if not result["allowed"]:
            resp = JSONResponse(
                status_code=429,
                content={
                    "detail": "Rate limit exceeded. Please slow down.",
                    "retry_after": result["retry_after"],
                },
            )
            _add_rate_limit_headers(resp, result)
            return resp

        response = await call_next(request)
        _add_rate_limit_headers(response, result)
        return response
