"""Sliding-window rate limiter with per-user tiers and burst allowance.

Uses Redis sorted sets for accurate sliding-window counting.

Usage::

    from app.core.rate_limiter import RateLimiterMiddleware
    app.add_middleware(RateLimiterMiddleware)

Or apply per-route with the dependency::

    from app.core.rate_limiter import rate_limit_dependency
    @router.get("/scan", dependencies=[Depends(rate_limit_dependency)])
    async def scan_food(): ...
"""
import time
import logging
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
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


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
            # If Redis is down, allow the request (fail open)
            logger.warning("Rate limiter Redis error — allowing request: %s", exc)
            return await call_next(request)

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
