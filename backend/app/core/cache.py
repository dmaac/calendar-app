"""Redis cache wrapper with in-memory LRU fallback, stampede protection, and warming.

When Redis is unavailable, all cache operations silently fall back to a
thread-safe in-memory LRU cache (max 2000 entries) so the application
continues to function without errors.  The in-memory fallback is also used
when Redis write/read fails on individual operations.

Key design decisions
--------------------
* ``cache_get`` / ``cache_set`` / ``cache_delete`` never raise.
* ``cache_get_or_refresh`` provides lock-based stampede protection.
* ``cached()`` decorator can be applied to any async function.
* ``invalidate_user_caches()`` wipes all per-user cache keys in one call
  (used after profile updates, GDPR delete, etc.).
* ``warm_cache()`` pre-populates food categories on startup.
"""

import asyncio
import functools
import hashlib
import json
import logging
import threading
import time
from collections import OrderedDict
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)


# ─── TTL presets (seconds) ─────────────────────────────────────────────────

CACHE_TTL = {
    "user_profile": 300,          # 5 min
    "nutrition_profile": 300,     # 5 min
    "onboarding": 600,            # 10 min
    "daily_summary": 120,         # 2 min
    "weekly_summary": 180,        # 3 min
    "subscription": 900,          # 15 min
    "ai_scan": 86400 * 30,        # 30 days (immutable)
    "food_search": 3600,          # 1 hour
    "food_categories": 3600,      # 1 hour
    "achievements": 300,          # 5 min
    "progress_profile": 120,      # 2 min
    "streak": 60,                 # 1 min
    "food_by_id": 3600,           # 1 hour (food records rarely change)
    "recent_foods": 120,          # 2 min
    "favorites": 120,             # 2 min
    # Analytics TTLs
    "analytics_user": 300,        # 5 min — per-user analytics
    "analytics_trends": 600,      # 10 min — calorie/macro trends
    "analytics_ranking": 900,     # 15 min — top foods ranking
    "analytics_admin": 120,       # 2 min — admin dashboard summary
    "risk_dashboard": 180,        # 3 min — risk admin dashboard
}


# ─── In-memory LRU fallback ───────────────────────────────────────────────

class _MemoryCache:
    """Thread-safe in-memory LRU cache with TTL, used when Redis is down."""

    def __init__(self, max_size: int = 2000):
        self._max_size = max_size
        self._store: OrderedDict[str, tuple[Any, float]] = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            value, expire_at = entry
            if time.monotonic() > expire_at:
                del self._store[key]
                return None
            self._store.move_to_end(key)
            return value

    def put(self, key: str, value: Any, ttl: int) -> None:
        expire_at = time.monotonic() + ttl
        with self._lock:
            if key in self._store:
                del self._store[key]
            self._store[key] = (value, expire_at)
            while len(self._store) > self._max_size:
                self._store.popitem(last=False)

    def delete(self, key: str) -> None:
        with self._lock:
            self._store.pop(key, None)

    def delete_prefix(self, prefix: str) -> int:
        with self._lock:
            to_del = [k for k in self._store if k.startswith(prefix)]
            for k in to_del:
                del self._store[k]
            return len(to_del)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()


_mem = _MemoryCache(max_size=2000)


# ─── Redis helper ─────────────────────────────────────────────────────────

def _redis():
    """Return a Redis client, or None if Redis is unavailable."""
    try:
        from app.core.token_store import get_redis
        return get_redis()
    except Exception:
        return None


# ─── Stats keys ────────────────────────────────────────────────────────────

_STATS_HITS_KEY = "cache:stats:hits"
_STATS_MISSES_KEY = "cache:stats:misses"
_LOCK_PREFIX = "cache:lock:"
_LOCK_TTL = 10  # seconds


# ─── Core get / set / delete ──────────────────────────────────────────────

async def cache_get(key: str, track_stats: bool = True) -> Optional[Any]:
    """Get a value from Redis, falling back to in-memory cache."""
    # Try Redis first
    r = _redis()
    if r is not None:
        try:
            val = await r.get(key)
            if val is not None:
                if track_stats:
                    try:
                        await r.incr(_STATS_HITS_KEY)
                    except Exception:
                        pass
                try:
                    return json.loads(val)
                except Exception:
                    return val
            if track_stats:
                try:
                    await r.incr(_STATS_MISSES_KEY)
                except Exception:
                    pass
        except Exception as exc:
            logger.debug("Redis cache_get failed (%s) — trying memory fallback", exc)

    # In-memory fallback
    val = _mem.get(key)
    if val is not None:
        return val
    return None


async def cache_set(key: str, value: Any, ttl: int = 300) -> None:
    """Set a value in Redis and in-memory cache.  Never raises."""
    serialized = value
    if isinstance(value, (dict, list)):
        serialized = json.dumps(value, default=str)

    # Always write to in-memory cache (fast local reads)
    _mem.put(key, value if not isinstance(value, str) else value, ttl)

    # Try Redis
    r = _redis()
    if r is not None:
        try:
            await r.setex(key, ttl, serialized)
        except Exception as exc:
            logger.debug("Redis cache_set failed (%s) — value stored in memory only", exc)


async def cache_delete(key: str) -> None:
    """Delete from both Redis and in-memory cache.  Never raises."""
    _mem.delete(key)
    r = _redis()
    if r is not None:
        try:
            await r.delete(key)
        except Exception:
            pass


async def cache_delete_pattern(pattern: str) -> None:
    """Delete all keys matching a glob pattern from Redis and memory."""
    # In-memory: convert glob to prefix (strip trailing *)
    prefix = pattern.rstrip("*")
    _mem.delete_prefix(prefix)

    r = _redis()
    if r is not None:
        try:
            cursor = 0
            while True:
                cursor, keys = await r.scan(cursor, match=pattern, count=100)
                if keys:
                    await r.delete(*keys)
                if cursor == 0:
                    break
        except Exception as exc:
            logger.debug("Redis cache_delete_pattern failed: %s", exc)


# ─── Cache stampede protection ─────────────────────────────────────────────

async def cache_get_or_refresh(
    key: str,
    ttl: int,
    refresh_fn: Callable[[], Any],
) -> Any:
    """Get from cache, or refresh with lock-based stampede protection.

    Only one caller acquires the lock and refreshes; others wait briefly
    then read the freshly populated value.  Falls back gracefully when
    Redis is unavailable.
    """
    value = await cache_get(key)
    if value is not None:
        return value

    r = _redis()
    if r is not None:
        lock_key = f"{_LOCK_PREFIX}{key}"
        try:
            acquired = await r.set(lock_key, "1", nx=True, ex=_LOCK_TTL)
        except Exception:
            acquired = True  # Redis down — skip locking, just compute

        if acquired:
            try:
                result = await refresh_fn()
                await cache_set(key, result, ttl)
                return result
            finally:
                try:
                    await r.delete(lock_key)
                except Exception:
                    pass
        else:
            # Wait for the lock holder to populate the cache.
            # Use short exponential backoff: 0.05s, 0.1s, 0.15s, 0.2s, 0.2s...
            # Total max wait ~1.5s instead of the previous 5s.
            delay = 0.05
            for _ in range(10):
                await asyncio.sleep(delay)
                value = await cache_get(key, track_stats=False)
                if value is not None:
                    return value
                delay = min(delay + 0.05, 0.2)
            return await refresh_fn()
    else:
        # No Redis — compute and store in memory
        result = await refresh_fn()
        await cache_set(key, result, ttl)
        return result


# ─── Cache stats ───────────────────────────────────────────────────────────

async def cache_stats() -> dict:
    """Return cache hit/miss stats and approximate key count."""
    r = _redis()
    if r is None:
        return {"hits": 0, "misses": 0, "hit_ratio": 0.0, "total_requests": 0, "total_keys": 0, "redis_available": False}

    try:
        hits = int(await r.get(_STATS_HITS_KEY) or 0)
        misses = int(await r.get(_STATS_MISSES_KEY) or 0)
        total = hits + misses
        info = await r.info("keyspace")
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
            "redis_available": True,
        }
    except Exception:
        return {"hits": 0, "misses": 0, "hit_ratio": 0.0, "total_requests": 0, "total_keys": 0, "redis_available": False}


async def cache_stats_reset():
    """Reset hit/miss counters."""
    r = _redis()
    if r is not None:
        try:
            await r.delete(_STATS_HITS_KEY, _STATS_MISSES_KEY)
        except Exception:
            pass


# ─── Decorator ─────────────────────────────────────────────────────────────

def cached(ttl: int = 120, key_prefix: str = "fn"):
    """Decorator that caches the return value of an async function.

    Cache key is built from key_prefix + function name + hashed args/kwargs.
    The first positional arg named ``self`` is excluded from the key so that
    service instances do not poison the hash.

    Usage::

        @cached(ttl=120, key_prefix="meals")
        async def get_user_meals(user_id: int, date: str):
            ...
    """
    def decorator(fn: Callable):
        @functools.wraps(fn)
        async def wrapper(*args, **kwargs):
            # Exclude `self` (first arg if it's a class instance) from key
            key_args = args
            if key_args and hasattr(key_args[0], "__class__") and not isinstance(key_args[0], (int, str, float, bool)):
                key_args = key_args[1:]

            raw = f"{fn.__name__}:{key_args}:{sorted(kwargs.items())}"
            arg_hash = hashlib.md5(raw.encode()).hexdigest()[:12]
            cache_key = f"cached:{key_prefix}:{fn.__name__}:{arg_hash}"

            value = await cache_get(cache_key)
            if value is not None:
                return value

            result = await fn(*args, **kwargs)

            # Only cache non-None results
            if result is not None:
                await cache_set(cache_key, result, ttl)

            return result

        async def invalidate(*args, **kwargs):
            """Manually invalidate the cache for specific arguments."""
            key_args = args
            if key_args and hasattr(key_args[0], "__class__") and not isinstance(key_args[0], (int, str, float, bool)):
                key_args = key_args[1:]
            raw = f"{fn.__name__}:{key_args}:{sorted(kwargs.items())}"
            arg_hash = hashlib.md5(raw.encode()).hexdigest()[:12]
            cache_key = f"cached:{key_prefix}:{fn.__name__}:{arg_hash}"
            await cache_delete(cache_key)

        async def invalidate_all():
            """Invalidate all cached entries for this function."""
            await cache_delete_pattern(f"cached:{key_prefix}:{fn.__name__}:*")

        wrapper.invalidate = invalidate
        wrapper.invalidate_all = invalidate_all
        return wrapper

    return decorator


# ─── Cache warming ─────────────────────────────────────────────────────────

async def warm_cache():
    """Pre-populate frequently accessed cache entries on startup.

    Called from app lifespan.  Failures are logged but do not block startup.
    """
    logger.info("Cache warming: starting")

    # Test Redis connectivity
    r = _redis()
    if r is not None:
        try:
            await r.ping()
            logger.info("Cache warming: Redis connected")
        except Exception as exc:
            logger.warning("Cache warming: Redis unavailable (%s) — using memory cache only", exc)

    # Reset stats counters on fresh startup
    await cache_stats_reset()

    # Pre-warm food categories (static data)
    try:
        from app.core.database import AsyncSessionLocal
        from app.models.food import Food
        from sqlmodel import select

        async with AsyncSessionLocal() as session:
            stmt = (
                select(Food.category)
                .where(Food.category.isnot(None))
                .distinct()
                .order_by(Food.category)
            )
            result = await session.execute(stmt)
            categories = [row for row in result.all() if row]
            if categories:
                await cache_set(food_categories_key(), categories, CACHE_TTL["food_categories"])
                logger.info("Cache warming: pre-loaded %d food categories", len(categories))
    except Exception as exc:
        logger.debug("Cache warming: could not pre-load food categories: %s", exc)

    logger.info("Cache warming: complete")


# ─── Key helpers ───────────────────────────────────────────────────────────

def user_profile_key(user_id: int) -> str:
    return f"user:{user_id}:profile"


def nutrition_profile_key(user_id: int) -> str:
    return f"user:{user_id}:nutrition_profile"


def onboarding_key(user_id: int) -> str:
    return f"user:{user_id}:onboarding"


def daily_summary_key(user_id: int, date: str) -> str:
    return f"user:{user_id}:daily:{date}"


def weekly_summary_key(user_id: int, end_date: str) -> str:
    return f"user:{user_id}:weekly:{end_date}"


def ai_scan_key(image_hash: str) -> str:
    return f"ai_scan:{image_hash}"


def subscription_key(user_id: int) -> str:
    return f"user:{user_id}:subscription"


def food_search_key(query: str, offset: int, limit: int, diet_type: Optional[str] = None) -> str:
    """Deterministic key for food search results."""
    raw = f"{query.lower().strip()}:{offset}:{limit}:{diet_type or ''}"
    h = hashlib.md5(raw.encode()).hexdigest()[:12]
    return f"food:search:{h}"


def food_categories_key() -> str:
    return "food:categories"


def food_by_id_key(food_id: int) -> str:
    return f"food:{food_id}"


def achievements_key(user_id: int) -> str:
    return f"user:{user_id}:achievements"


def progress_profile_key(user_id: int) -> str:
    return f"user:{user_id}:progress_profile"


def streak_key(user_id: int) -> str:
    return f"user:{user_id}:streak"


def recent_foods_key(user_id: int) -> str:
    return f"user:{user_id}:recent_foods"


def favorites_key(user_id: int) -> str:
    return f"user:{user_id}:favorites"


# ─── Bulk invalidation ────────────────────────────────────────────────────

async def invalidate_user_caches(user_id: int) -> None:
    """Remove ALL cached data for a user.

    Call this after:
    - Profile updates (nutrition, onboarding)
    - GDPR data deletion
    - Account deactivation
    - Subscription changes
    """
    await cache_delete_pattern(f"user:{user_id}:*")
    # Also clear any decorator-cached entries that include the user_id
    await cache_delete_pattern(f"cached:*:{user_id}*")
    logger.info("Invalidated all caches for user_id=%d", user_id)


async def invalidate_food_search_cache() -> None:
    """Clear all cached food search results.

    Call this when the food catalog is modified (new food added, food updated, etc.).
    """
    await cache_delete_pattern("food:search:*")


async def invalidate_daily_summary(user_id: int, date_str: str) -> None:
    """Invalidate daily summary, weekly summary, and alerts caches when a meal is logged/deleted."""
    await cache_delete(daily_summary_key(user_id, date_str))
    # Also invalidate any weekly summary that might include this date
    await cache_delete_pattern(f"user:{user_id}:weekly:*")
    # Invalidate nutrition alerts — they depend on today's food totals
    await cache_delete(f"user:{user_id}:alerts:daily")
