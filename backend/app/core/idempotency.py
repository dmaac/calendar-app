"""
Request Deduplication via X-Idempotency-Key
--------------------------------------------
Prevents duplicate resource creation when the mobile client retries a POST
request due to network timeouts, app backgrounding, or user double-taps.

How it works:
1. Client sends POST/PUT with header `X-Idempotency-Key: <uuid>`
2. On first request: execute normally, cache the response keyed by the
   idempotency key (in Redis with a TTL, or in-memory LRU as fallback).
3. On duplicate request (same key): return the cached response immediately
   without re-executing the handler.

The key is scoped per-user (extracted from the Bearer token) to prevent
cross-user replay attacks.

Only applies to:
- POST and PUT methods (idempotent by nature for GET/DELETE)
- Requests with an X-Idempotency-Key header present
- Successful responses (2xx) are cached; errors are NOT cached so the
  client can safely retry on transient failures.

TTL: 24 hours (enough for mobile retry scenarios).
"""

import hashlib
import json
import logging
import time
from typing import Dict, Optional, Tuple

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response as StarletteResponse

logger = logging.getLogger(__name__)

# In-memory fallback store when Redis is unavailable.
# Maps (user_scope, idempotency_key) -> (status_code, headers_json, body, timestamp)
_memory_store: Dict[str, Tuple[int, str, bytes, float]] = {}
_STORE_MAX_SIZE = 10_000  # Cap to prevent unbounded memory growth
_TTL_SECONDS = 24 * 3600  # 24 hours

# Methods that support idempotency
_IDEMPOTENT_METHODS = {"POST", "PUT"}


def _evict_expired() -> None:
    """Remove expired entries from the in-memory store."""
    now = time.time()
    expired_keys = [k for k, v in _memory_store.items() if now - v[3] > _TTL_SECONDS]
    for k in expired_keys:
        _memory_store.pop(k, None)


def _extract_user_scope(request: Request) -> str:
    """
    Extract a user-scoping identifier from the request.
    Uses the Bearer token hash so the idempotency key is per-user.
    Falls back to client IP if no auth header.
    """
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        # Hash the token -- we don't need to decode it, just scope by it
        return hashlib.sha256(auth[7:].encode()).hexdigest()[:16]
    # Fallback: IP-based scope (less precise but still prevents cross-client collisions)
    client_ip = request.client.host if request.client else "unknown"
    return f"ip:{client_ip}"


class IdempotencyMiddleware(BaseHTTPMiddleware):
    """
    Deduplicates POST/PUT requests that carry an X-Idempotency-Key header.
    """

    async def dispatch(self, request: Request, call_next) -> StarletteResponse:
        # Only process POST/PUT with an idempotency key
        if request.method not in _IDEMPOTENT_METHODS:
            return await call_next(request)

        idempotency_key = request.headers.get("x-idempotency-key")
        if not idempotency_key:
            return await call_next(request)

        # Validate key format (should be UUID-like, max 128 chars)
        if len(idempotency_key) > 128:
            return StarletteResponse(
                content=json.dumps({"detail": "X-Idempotency-Key too long (max 128 chars)"}),
                status_code=400,
                media_type="application/json",
            )

        user_scope = _extract_user_scope(request)
        store_key = f"{user_scope}:{idempotency_key}"

        # --- Try Redis first ---
        cached = await self._redis_get(store_key)
        if cached is None:
            # --- Fallback to in-memory ---
            cached = self._memory_get(store_key)

        if cached is not None:
            status_code, headers_json, body = cached
            headers = json.loads(headers_json)
            logger.info(
                "Idempotent request replayed: key=%s status=%d",
                idempotency_key[:32], status_code,
            )
            resp = StarletteResponse(
                content=body,
                status_code=status_code,
                media_type="application/json",
            )
            # Restore original headers (except content-length which Starlette recalculates)
            for k, v in headers.items():
                if k.lower() not in ("content-length", "transfer-encoding"):
                    resp.headers[k] = v
            resp.headers["X-Idempotent-Replayed"] = "true"
            return resp

        # --- Execute the request ---
        response: Response = await call_next(request)

        # Only cache successful responses
        if not (200 <= response.status_code < 300):
            return response

        # Read response body
        body_chunks = []
        async for chunk in response.body_iterator:  # type: ignore[attr-defined]
            if isinstance(chunk, str):
                chunk = chunk.encode("utf-8")
            body_chunks.append(chunk)
        body = b"".join(body_chunks)

        # Cache the response
        headers_to_cache = {
            k: v for k, v in response.headers.items()
            if k.lower() not in ("content-length", "transfer-encoding")
        }
        headers_json = json.dumps(headers_to_cache)

        await self._redis_set(store_key, response.status_code, headers_json, body)
        self._memory_set(store_key, response.status_code, headers_json, body)

        # Return the response with the body we read
        result = StarletteResponse(
            content=body,
            status_code=response.status_code,
            headers=dict(response.headers),
            media_type=response.media_type,
        )
        return result

    # --- Redis operations (best-effort) ---

    async def _redis_get(self, key: str) -> Optional[Tuple[int, str, bytes]]:
        """Try to get cached response from Redis."""
        try:
            from ..core.token_store import get_redis
            r = get_redis()
            data = await r.get(f"idempotency:{key}")
            if data:
                parsed = json.loads(data)
                return (
                    parsed["status_code"],
                    parsed["headers"],
                    parsed["body"].encode("latin-1"),
                )
        except Exception:
            pass
        return None

    async def _redis_set(
        self, key: str, status_code: int, headers_json: str, body: bytes
    ) -> None:
        """Cache response in Redis with TTL."""
        try:
            from ..core.token_store import get_redis
            r = get_redis()
            data = json.dumps({
                "status_code": status_code,
                "headers": headers_json,
                "body": body.decode("latin-1"),
            })
            await r.set(f"idempotency:{key}", data, ex=_TTL_SECONDS)
        except Exception:
            pass

    # --- In-memory fallback ---

    def _memory_get(self, key: str) -> Optional[Tuple[int, str, bytes]]:
        """Get from in-memory store if not expired."""
        entry = _memory_store.get(key)
        if entry is None:
            return None
        status_code, headers_json, body, timestamp = entry
        if time.time() - timestamp > _TTL_SECONDS:
            _memory_store.pop(key, None)
            return None
        return (status_code, headers_json, body)

    def _memory_set(
        self, key: str, status_code: int, headers_json: str, body: bytes
    ) -> None:
        """Store in in-memory cache with size cap."""
        if len(_memory_store) >= _STORE_MAX_SIZE:
            _evict_expired()
            # If still too large after eviction, drop oldest 10%
            if len(_memory_store) >= _STORE_MAX_SIZE:
                keys_to_drop = sorted(
                    _memory_store, key=lambda k: _memory_store[k][3]
                )[: _STORE_MAX_SIZE // 10]
                for k in keys_to_drop:
                    _memory_store.pop(k, None)
        _memory_store[key] = (status_code, headers_json, body, time.time())
