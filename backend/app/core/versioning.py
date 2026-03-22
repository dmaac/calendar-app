"""
API Versioning middleware.
Detects the requested API version from:
  1. Accept-Version header (e.g. Accept-Version: v2)
  2. URL prefix (e.g. /api/v2/food/logs)
Stores the resolved version in request.state.api_version for downstream use.
"""

import re
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

# Supported versions — first is default
SUPPORTED_VERSIONS = ("v1", "v2")
DEFAULT_VERSION = "v1"

# Matches /api/v1/ or /api/v2/ at the start of the path
_URL_VERSION_RE = re.compile(r"^/api/(v\d+)/")


class APIVersionMiddleware(BaseHTTPMiddleware):
    """
    Resolves API version from header or URL prefix and stores it in request.state.
    If the version comes from the URL prefix, the prefix is stripped so routers
    do not need to duplicate path definitions per version.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        version = DEFAULT_VERSION

        # 1. Check Accept-Version header
        header_version = request.headers.get("accept-version", "").strip().lower()
        if header_version in SUPPORTED_VERSIONS:
            version = header_version

        # 2. Check URL prefix (takes precedence over header)
        match = _URL_VERSION_RE.match(request.url.path)
        if match:
            url_version = match.group(1).lower()
            if url_version in SUPPORTED_VERSIONS:
                version = url_version
                # Strip the version prefix so downstream routers match
                new_path = request.url.path[len(match.group(0)) - 1:]  # keep leading /
                request.scope["path"] = new_path

        request.state.api_version = version

        response: Response = await call_next(request)
        response.headers["X-API-Version"] = version
        return response
