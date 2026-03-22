"""
ETag / Conditional Request Support
-----------------------------------
Middleware that adds ETag headers to GET responses and handles If-None-Match
for conditional requests, returning 304 Not Modified when appropriate.

This saves bandwidth on the mobile client side -- the client caches responses
and sends If-None-Match on subsequent requests.  If the content hasn't changed,
the server returns a 304 with an empty body instead of re-sending the full JSON.

Only applies to:
- GET requests
- Successful responses (2xx)
- JSON content types
- Responses with a body (not streaming)

Skips:
- /health, /metrics, /docs, /openapi.json (noise endpoints)
- Non-GET methods
- Non-2xx responses
"""

import hashlib
import logging
from typing import Set

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response as StarletteResponse

logger = logging.getLogger(__name__)

# Paths where ETag computation is unnecessary overhead
_SKIP_PATHS: Set[str] = {
    "/health",
    "/api/health",
    "/metrics",
    "/docs",
    "/redoc",
    "/openapi.json",
    "/",
}


class ETagMiddleware(BaseHTTPMiddleware):
    """
    Computes a weak ETag from the response body hash and supports
    If-None-Match conditional requests (304 Not Modified).
    """

    async def dispatch(self, request: Request, call_next) -> StarletteResponse:
        # Only process GET requests
        if request.method != "GET":
            return await call_next(request)

        # Skip noisy endpoints
        if request.url.path in _SKIP_PATHS:
            return await call_next(request)

        response: Response = await call_next(request)

        # Only ETag successful JSON responses
        if not (200 <= response.status_code < 300):
            return response

        content_type = response.headers.get("content-type", "")
        if "application/json" not in content_type:
            return response

        # Read the response body — requires collecting it from the streaming response
        body_chunks = []
        async for chunk in response.body_iterator:  # type: ignore[attr-defined]
            if isinstance(chunk, str):
                chunk = chunk.encode("utf-8")
            body_chunks.append(chunk)
        body = b"".join(body_chunks)

        if not body:
            return response

        # Compute weak ETag from body hash (weak because representation may vary
        # with Content-Encoding, Accept-Language, etc.)
        etag = f'W/"{hashlib.md5(body).hexdigest()}"'  # noqa: S324 — not for security

        # Check If-None-Match
        if_none_match = request.headers.get("if-none-match")
        if if_none_match and if_none_match == etag:
            return StarletteResponse(
                status_code=304,
                headers={"ETag": etag},
            )

        # Return full response with ETag header
        return StarletteResponse(
            content=body,
            status_code=response.status_code,
            headers=dict(response.headers),
            media_type=response.media_type,
        )
