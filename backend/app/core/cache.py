"""Redis cache wrapper with decorator, stampede protection, stats, and warming."""
import asyncio
import functools
import hashlib
import json
import logging
import time
from typing import Any, Callable, Optional

from app.core.token_store import get_redis

logger = logging.getLogger(__name__)

CACHE_TTL = {
    "user_profile": 300,       # 5 min
    "onboarding": 600,         # 10 min
    "daily_summary": 120,      # 2 min
    "subscription": 900,       # 15 min
    "ai_scan": 86400 * 30,     # 30 days (immutable)
    "food_search": 3600,       # 1 hour
}

# ─── Stats keys ─────────────────────────────────────────────────────────────

_STATS_HITS_KEY = "cache:stats:hits"
_STATS_MISSES_KEY = "cache:stats:misses"
_LOCK_PREFIX = "cache:lock:"
_LOCK_TTL = 10  # seconds — max time a single cache refresh can hold the lock


# ─── Core get / set / delete ────────────────────────────────────────────────

async def cache_get(key: str, track_stats: bool = True) -> Optional[Any]:
    r = get_redis()
    val = await r.get(key)
    if val is not None:
        if track_stats:
            await r.incr(_STATS_HITS_KEY)
        try:
            return json.loads(val)
        except Exception:
            return val
    if track_stats:
        await r.incr(_STATS_MISSES_KEY)
    return None


async def cache_set(key: str, value: Any, ttl: int = 300):
    r = get_redis()
    if isinstance(value, (dict, list)):
        value = json.dumps(value)
    await r.setex(key, ttl, value)


async def cache_delete(key: str):
    r = get_redis()
    await r.delete(key)


async def cache_delete_pattern(pattern: str):
    r = get_redis()
    cursor = 0
    while True:
        cursor, keys = await r.scan(cursor, match=pattern, count=100)
        if keys:
            await r.delete(*keys)
        if cursor == 0:
            break


# ─── Cache stampede protection ──────────────────────────────────────────────

async def cache_get_or_refresh(
    key: str,
    ttl: int,
    refresh_fn: Callable[[], Any],
) -> Any:
    """Get from cache, or refresh with lock-based stampede protection.

    Only one caller acquires the lock and refreshes; others wait briefly
    then read the freshly populated value.
    """
    value = await cache_get(key)
    if value is not None:
        return value

    r = get_redis()
    lock_key = f"{_LOCK_PREFIX}{key}"

    # Try to acquire refresh lock (NX = set-if-not-exists)
    acquired = await r.set(lock_key, "1", nx=True, ex=_LOCK_TTL)
    if acquired:
        try:
            result = await refresh_fn()
            await cache_set(key, result, ttl)
            return result
        finally:
            await r.delete(lock_key)
    else:
        # Another caller is refreshing — wait and retry
        for _ in range(10):
            await asyncio.sleep(0.5)
            value = await cache_get(key, track_stats=False)
            if value is not None:
                return value
        # Fallback: compute it ourselves
        return await refresh_fn()


# ─── Cache stats ────────────────────────────────────────────────────────────

async def cache_stats() -> dict:
    """Return cache hit/miss stats and approximate key count."""
    r = get_redis()
    hits = int(await r.get(_STATS_HITS_KEY) or 0)
    misses = int(await r.get(_STATS_MISSES_KEY) or 0)
    total = hits + misses
    info = await r.info("keyspace")
    # info["keyspace"] looks like {"db0": {"keys": 123, ...}}
    total_keys = 0
    for db_info in info.values():
        if isinstance(db_info, dict):
            total_keys += db_info.get("keys", 0)
    return {
        "hits": hits,
        "misses": misses,
        "hit_ratio": round(hits / total, 4) if total > 0 else 0.0,
        "total_requests": total,
        "total_keys": total_keys,
    }


async def cache_stats_reset():
    """Reset hit/miss counters."""
    r = get_redis()
    await r.delete(_STATS_HITS_KEY, _STATS_MISSES_KEY)


# ─── Decorator ──────────────────────────────────────────────────────────────

def cached(ttl: int = 120, key_prefix: str = "fn"):
    """Decorator that caches the return value of an async function.

    Cache key is built from key_prefix + function name + hashed args/kwargs.

    Usage::

        @cached(ttl=120, key_prefix="meals")
        async def get_user_meals(user_id: int, date: str):
            ...
    """

    def decorator(fn: Callable):
        @functools.wraps(fn)
        async def wrapper(*args, **kwargs):
            # Build a deterministic cache key from arguments
            raw = f"{fn.__name__}:{args}:{sorted(kwargs.items())}"
            arg_hash = hashlib.md5(raw.encode()).hexdigest()[:12]
            cache_key = f"cached:{key_prefix}:{fn.__name__}:{arg_hash}"

            value = await cache_get(cache_key)
            if value is not None:
                return value

            result = await fn(*args, **kwargs)
            await cache_set(cache_key, result, ttl)
            return result

        # Expose a manual invalidation helper
        async def invalidate(*args, **kwargs):
            raw = f"{fn.__name__}:{args}:{sorted(kwargs.items())}"
            arg_hash = hashlib.md5(raw.encode()).hexdigest()[:12]
            cache_key = f"cached:{key_prefix}:{fn.__name__}:{arg_hash}"
            await cache_delete(cache_key)

        wrapper.invalidate = invalidate
        return wrapper

    return decorator


# ─── Cache warming ──────────────────────────────────────────────────────────

async def warm_cache():
    """Pre-populate frequently accessed cache entries on startup.

    Called from app lifespan. Failures are logged but do not block startup.
    """
    logger.info("Cache warming: starting")
    try:
        r = get_redis()
        await r.ping()
    except Exception as exc:
        logger.warning("Cache warming skipped — Redis unavailable: %s", exc)
        return

    # Reset stats counters on fresh startup
    await cache_stats_reset()
    logger.info("Cache warming: complete (stats counters reset)")


# ─── Key helpers ────────────────────────────────────────────────────────────

def user_profile_key(user_id: int) -> str:
    return f"user:{user_id}:profile"


def onboarding_key(user_id: int) -> str:
    return f"user:{user_id}:onboarding"


def daily_summary_key(user_id: int, date: str) -> str:
    return f"user:{user_id}:daily:{date}"


def ai_scan_key(image_hash: str) -> str:
    return f"ai_scan:{image_hash}"


def subscription_key(user_id: int) -> str:
    return f"user:{user_id}:subscription"
