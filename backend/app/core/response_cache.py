"""
In-Memory Response Cache for GET Endpoints
--------------------------------------------
Provides a decorator-based LRU cache for GET endpoint responses that do not
change frequently (e.g., recipe lists, food search results).

Features:
- Configurable TTL per endpoint (default 300s / 5 min)
- Cache key incorporates: endpoint path + user_id + query parameters
- Automatic invalidation when POST/PUT/DELETE hits the same resource prefix
- In-memory LRU with a configurable max of 1000 entries (no Redis dependency)
- Thread-safe via threading.Lock

Usage::

    from app.core.response_cache import response_cached, invalidate_resource

    @router.get("/api/recipes")
    @response_cached(ttl=300)
    async def list_recipes(request: Request):
        ...

    @router.post("/api/recipes")
    async def create_recipe(request: Request, ...):
        invalidate_resource("/api/recipes")
        ...

The ``ResponseCacheMiddleware`` automatically invalidates cached entries when
mutating HTTP methods (POST, PUT, PATCH, DELETE) target a cached resource prefix.
"""

import functools
import hashlib
import logging
import threading
import time
from collections import OrderedDict
from typing import Any, Callable, Dict, Optional, Set, Tuple
from urllib.parse import urlencode

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)


# ─── LRU Cache Store ──────────────────────────────────────────────────────────

class _LRUCache:
    """Thread-safe in-memory LRU cache with TTL support.

    Each entry stores (value, expire_at). Expired entries are evicted on access
    and during periodic cleanup triggered by ``put()``.
    """

    def __init__(self, max_size: int = 1000):
        self._max_size = max_size
        self._store: OrderedDict[str, Tuple[Any, float]] = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key: str) -> Optional[Any]:
        """Retrieve a cached value, returning None if missing or expired."""
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            value, expire_at = entry
            if time.monotonic() > expire_at:
                # Expired — evict
                del self._store[key]
                return None
            # Move to end (most recently used)
            self._store.move_to_end(key)
            return value

    def put(self, key: str, value: Any, ttl: int) -> None:
        """Store a value with a TTL (seconds)."""
        expire_at = time.monotonic() + ttl
        with self._lock:
            if key in self._store:
                del self._store[key]
            self._store[key] = (value, expire_at)
            # Evict oldest entries if over capacity
            while len(self._store) > self._max_size:
                self._store.popitem(last=False)

    def invalidate(self, key: str) -> bool:
        """Remove a specific key. Returns True if the key existed."""
        with self._lock:
            if key in self._store:
                del self._store[key]
                return True
            return False

    def invalidate_prefix(self, prefix: str) -> int:
        """Remove all keys that start with the given prefix.

        Returns the number of evicted entries.
        """
        with self._lock:
            to_delete = [k for k in self._store if k.startswith(prefix)]
            for k in to_delete:
                del self._store[k]
            return len(to_delete)

    def clear(self) -> None:
        """Remove all entries."""
        with self._lock:
            self._store.clear()

    def stats(self) -> Dict[str, Any]:
        """Return cache size and capacity info."""
        with self._lock:
            now = time.monotonic()
            alive = sum(1 for _, (_, exp) in self._store.items() if exp > now)
            return {
                "total_entries": len(self._store),
                "alive_entries": alive,
                "expired_entries": len(self._store) - alive,
                "max_size": self._max_size,
            }


# Singleton cache instance
_cache = _LRUCache(max_size=1000)

# Track hit/miss stats
_stats_lock = threading.Lock()
_stats: Dict[str, int] = {"hits": 0, "misses": 0, "invalidations": 0}


# ─── Cache Key Builder ────────────────────────────────────────────────────────

def _build_cache_key(request: Request, user_id: Optional[str] = None) -> str:
    """Build a deterministic cache key from endpoint + user + query params."""
    path = request.url.path
    # Sort query params for deterministic ordering
    query_params = sorted(request.query_params.items())
    query_str = urlencode(query_params) if query_params else ""

    raw = f"{path}|user:{user_id or 'anon'}|q:{query_str}"
    key_hash = hashlib.md5(raw.encode()).hexdigest()  # noqa: S324 — not for security
    return f"rcache:{path}:{key_hash}"


def _extract_user_id(request: Request) -> Optional[str]:
    """Best-effort user_id extraction from JWT (no DB hit)."""
    try:
        from app.core.security import verify_token
        auth = request.headers.get("authorization", "")
        if auth.startswith("Bearer "):
            uid = verify_token(auth[7:])
            return str(uid) if uid else None
    except Exception:
        pass
    return None


def _resource_prefix(path: str) -> str:
    """Extract the resource prefix from a path for invalidation.

    Examples:
        /api/recipes/123  -> rcache:/api/recipes
        /api/v1/foods     -> rcache:/api/v1/foods
        /api/meals/daily  -> rcache:/api/meals
    """
    parts = path.rstrip("/").split("/")
    # Keep everything up to and including the resource name (skip IDs)
    # Heuristic: if the last segment is numeric, drop it
    if parts and parts[-1].isdigit():
        parts = parts[:-1]
    # Keep at most the first meaningful resource path
    return f"rcache:{'/'.join(parts)}"


# ─── Decorator ─────────────────────────────────────────────────────────────────

def response_cached(ttl: int = 300):
    """Decorator that caches the return value of a GET endpoint handler.

    The cache key is built from: endpoint path + authenticated user_id + query params.

    Args:
        ttl: Time-to-live in seconds (default 300 = 5 minutes).

    Usage::

        @router.get("/api/recipes")
        @response_cached(ttl=300)
        async def list_recipes(request: Request):
            ...
    """

    def decorator(fn: Callable):
        @functools.wraps(fn)
        async def wrapper(*args, **kwargs):
            global _stats
            # Extract the Request object from args or kwargs
            request: Optional[Request] = kwargs.get("request")
            if request is None:
                for arg in args:
                    if isinstance(arg, Request):
                        request = arg
                        break

            # If no request found, skip caching (shouldn't happen with FastAPI)
            if request is None or request.method != "GET":
                return await fn(*args, **kwargs)

            user_id = _extract_user_id(request)
            cache_key = _build_cache_key(request, user_id)

            # Check cache
            cached_value = _cache.get(cache_key)
            if cached_value is not None:
                with _stats_lock:
                    _stats["hits"] += 1
                logger.debug("Response cache HIT: %s", cache_key)
                return cached_value

            with _stats_lock:
                _stats["misses"] += 1

            # Execute the actual handler
            result = await fn(*args, **kwargs)

            # Cache the result
            _cache.put(cache_key, result, ttl)
            logger.debug("Response cache STORE: %s (ttl=%ds)", cache_key, ttl)

            return result

        return wrapper
    return decorator


# ─── Manual Invalidation ──────────────────────────────────────────────────────

def invalidate_resource(path: str) -> int:
    """Invalidate all cached entries for a resource path prefix.

    Call this from POST/PUT/DELETE handlers to bust the cache.

    Args:
        path: The resource path (e.g., "/api/recipes").

    Returns:
        Number of evicted cache entries.
    """
    prefix = f"rcache:{path}"
    count = _cache.invalidate_prefix(prefix)
    if count > 0:
        with _stats_lock:
            _stats["invalidations"] += count
        logger.info("Response cache invalidated %d entries for prefix: %s", count, prefix)
    return count


def invalidate_all() -> None:
    """Clear the entire response cache."""
    _cache.clear()
    logger.info("Response cache cleared entirely")


# ─── Auto-Invalidation Middleware ─────────────────────────────────────────────

_MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
_SKIP_PATHS: Set[str] = {
    "/health", "/api/health", "/docs", "/redoc", "/openapi.json", "/", "/metrics",
}


class ResponseCacheMiddleware(BaseHTTPMiddleware):
    """Automatically invalidates cached responses when mutating requests arrive.

    When a POST/PUT/PATCH/DELETE request is received, all cache entries matching
    the resource prefix are invalidated after the response is sent.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        response: Response = await call_next(request)

        # Only invalidate on successful mutating requests
        if (
            request.method in _MUTATING_METHODS
            and request.url.path not in _SKIP_PATHS
            and 200 <= response.status_code < 400
        ):
            prefix = _resource_prefix(request.url.path)
            count = _cache.invalidate_prefix(prefix)
            if count > 0:
                with _stats_lock:
                    _stats["invalidations"] += count
                logger.info(
                    "Auto-invalidated %d cache entries for %s %s",
                    count, request.method, prefix,
                )

        return response


# ─── Stats Endpoint Helper ────────────────────────────────────────────────────

def response_cache_stats() -> Dict[str, Any]:
    """Return response cache statistics for the /api/metrics/performance endpoint."""
    with _stats_lock:
        hit_miss = dict(_stats)
    total = hit_miss["hits"] + hit_miss["misses"]
    cache_info = _cache.stats()
    return {
        "hits": hit_miss["hits"],
        "misses": hit_miss["misses"],
        "invalidations": hit_miss["invalidations"],
        "hit_ratio": round(hit_miss["hits"] / total, 4) if total > 0 else 0.0,
        "total_requests": total,
        **cache_info,
    }
