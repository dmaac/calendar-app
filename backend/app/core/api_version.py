"""
API Version resolution middleware.

Detects the requested API version from:
  1. X-API-Version header
  2. Query parameter ``api_version``
  3. Falls back to default (v1)

Stores the resolved version in ``request.state.api_version`` for downstream
route handlers and logs usage of deprecated endpoints.

This module complements the existing ``versioning.py`` middleware (which reads
Accept-Version header and URL prefix). It can be stacked alongside it -- the
last writer to ``request.state.api_version`` wins, so order in ``main.py``
determines precedence.
"""

import logging
import time
from collections import defaultdict
from threading import Lock
from typing import Set

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)

# Supported versions — first is default
SUPPORTED_VERSIONS: Set[str] = {"v1", "v2"}
DEFAULT_VERSION: str = "v1"

# ─── Deprecated endpoint tracking ───────────────────────────────────────────
# Ring-buffer style counter per (version, path). Useful for observability
# without requiring an external metrics backend.

_deprecated_lock = Lock()
_deprecated_usage: dict[str, int] = defaultdict(int)
_DEPRECATED_ENDPOINTS: dict[str, set[str]] = {
    # Add deprecated endpoint paths per version here.
    # Example: "v1": {"/api/old-endpoint"},
}


def get_deprecated_usage_stats() -> dict:
    """Return a snapshot of deprecated endpoint usage counters."""
    with _deprecated_lock:
        return dict(_deprecated_usage)


class APIVersionHeaderMiddleware(BaseHTTPMiddleware):
    """
    Resolves API version from X-API-Version header or api_version query param.

    Resolution order (first match wins):
      1. ``X-API-Version`` request header  (e.g. ``v2``)
      2. ``api_version`` query parameter   (e.g. ``?api_version=v2``)
      3. Existing ``request.state.api_version`` (set by ``APIVersionMiddleware``)
      4. Default: ``v1``

    Unsupported versions fall back to default and a warning is logged.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        version: str | None = None

        # 1. Check X-API-Version header
        header_value = request.headers.get("x-api-version", "").strip().lower()
        if header_value:
            version = header_value

        # 2. Check query parameter (overrides header)
        query_value = request.query_params.get("api_version", "").strip().lower()
        if query_value:
            version = query_value

        # 3. Validate and fall back
        if version and version not in SUPPORTED_VERSIONS:
            logger.warning(
                "Unsupported API version requested: %s (path=%s). Falling back to %s.",
                version,
                request.url.path,
                DEFAULT_VERSION,
            )
            version = DEFAULT_VERSION

        if not version:
            # Preserve version set by the existing APIVersionMiddleware if present
            version = getattr(request.state, "api_version", DEFAULT_VERSION)

        request.state.api_version = version

        # 4. Log deprecated endpoint usage
        deprecated_paths = _DEPRECATED_ENDPOINTS.get(version, set())
        if request.url.path in deprecated_paths:
            with _deprecated_lock:
                key = f"{version}:{request.url.path}"
                _deprecated_usage[key] += 1
            logger.info(
                "DEPRECATED endpoint used: version=%s path=%s method=%s",
                version,
                request.url.path,
                request.method,
            )

        response: Response = await call_next(request)
        response.headers["X-API-Version"] = version
        return response
