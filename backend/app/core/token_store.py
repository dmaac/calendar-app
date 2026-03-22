"""Redis-backed token store: refresh token revocation, access token blacklist, login lockout."""
import logging
import redis.asyncio as redis
from redis.asyncio import ConnectionPool
from app.core.config import settings

logger = logging.getLogger(__name__)

_pool: ConnectionPool | None = None


def get_redis() -> redis.Redis:
    """Return a Redis client backed by a shared connection pool."""
    global _pool
    if _pool is None:
        _pool = ConnectionPool.from_url(
            settings.redis_url,
            decode_responses=True,
            max_connections=settings.redis_max_connections,
        )
    return redis.Redis(connection_pool=_pool)


# ─── Refresh token management ───────────────────────────────────────────────

async def save_refresh_token(user_id: int, jti: str, ttl_days: int = 30):
    r = get_redis()
    key = f"refresh:{user_id}:{jti}"
    await r.setex(key, ttl_days * 86400, "1")


async def is_refresh_token_valid(user_id: int, jti: str) -> bool:
    r = get_redis()
    key = f"refresh:{user_id}:{jti}"
    return bool(await r.exists(key))


async def revoke_refresh_token(user_id: int, jti: str):
    r = get_redis()
    key = f"refresh:{user_id}:{jti}"
    await r.delete(key)


async def revoke_all_user_tokens(user_id: int):
    """Revoke all refresh tokens for a user using SCAN (safe for large Redis)."""
    r = get_redis()
    pattern = f"refresh:{user_id}:*"
    cursor = 0
    keys_to_delete: list[str] = []
    while True:
        cursor, keys = await r.scan(cursor=cursor, match=pattern, count=100)
        keys_to_delete.extend(keys)
        if cursor == 0:
            break
    if keys_to_delete:
        await r.delete(*keys_to_delete)


# ─── Access token blacklist ──────────────────────────────────────────────────
# SEC: Used to invalidate access tokens before their natural expiry
# (e.g., after logout, password change, or account deactivation).

async def blacklist_access_token(jti: str, ttl_seconds: int = 1800):
    """Add an access token JTI to the blacklist.
    TTL should match the access token's remaining lifetime (default 30 min).
    """
    r = get_redis()
    key = f"blacklist:access:{jti}"
    await r.setex(key, ttl_seconds, "1")


async def is_access_token_blacklisted(jti: str) -> bool:
    """Check if an access token has been blacklisted."""
    r = get_redis()
    key = f"blacklist:access:{jti}"
    return bool(await r.exists(key))


# ─── Login lockout (brute force protection) ──────────────────────────────────
# SEC: After MAX_LOGIN_ATTEMPTS failed attempts, lock the account for LOCKOUT_SECONDS.

MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_SECONDS = 15 * 60  # 15 minutes


async def record_failed_login(email: str) -> int:
    """Increment failed login counter. Returns the new count."""
    r = get_redis()
    key = f"login_fail:{email}"
    count = await r.incr(key)
    if count == 1:
        # First failure — set TTL so counter auto-expires
        await r.expire(key, LOCKOUT_SECONDS)
    return count


async def is_login_locked(email: str) -> bool:
    """Check if account is locked due to too many failed login attempts."""
    r = get_redis()
    key = f"login_fail:{email}"
    count = await r.get(key)
    if count is None:
        return False
    return int(count) >= MAX_LOGIN_ATTEMPTS


async def clear_failed_logins(email: str):
    """Clear the failed login counter after a successful login."""
    r = get_redis()
    key = f"login_fail:{email}"
    await r.delete(key)


# ─── Per-user rate limiting ──────────────────────────────────────────────────
# SEC: Rate limit by user_id in addition to IP-based limiting (slowapi).

async def check_user_rate_limit(user_id: int, action: str, max_requests: int, window_seconds: int) -> bool:
    """Returns True if the user is within the rate limit, False if exceeded."""
    r = get_redis()
    key = f"rl:{action}:{user_id}"
    count = await r.incr(key)
    if count == 1:
        await r.expire(key, window_seconds)
    return count <= max_requests
