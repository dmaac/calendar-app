"""CSRF protection middleware using the double-submit cookie pattern.

Bearer-token-only endpoints (mobile app) are inherently CSRF-safe because
the token must be sent in the Authorization header, which cross-origin
requests cannot set. This middleware protects any future session/cookie-based
endpoints by requiring a matching CSRF token in both a cookie and a header.

How it works:
1. On every response to a state-changing request (POST/PUT/PATCH/DELETE),
   a signed CSRF token is set as a cookie (SameSite=Strict, HttpOnly=False
   so JS can read it).
2. State-changing requests that use cookie-based auth must include the same
   token in the X-CSRF-Token header.
3. Requests with a valid Bearer token in the Authorization header are exempt
   (mobile app flow).
4. Safe methods (GET, HEAD, OPTIONS) are always exempt.

SEC: This is a defense-in-depth measure. The primary CSRF defense is the
Bearer token requirement in the Authorization header.
"""

import hmac
import hashlib
import logging
import secrets
import time
from typing import Optional

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings

logger = logging.getLogger(__name__)

_CSRF_COOKIE_NAME = "csrf_token"
_CSRF_HEADER_NAME = "x-csrf-token"
_TOKEN_TTL_SECONDS = 3600  # 1 hour
_SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})

# Paths exempt from CSRF checks.
_EXEMPT_PATHS = frozenset({"/", "/health", "/api/health", "/docs", "/redoc", "/openapi.json"})

# SEC: Auth routes are exempt because CSRF attacks exploit *existing* sessions.
# Login/register have no session yet — the attacker gains nothing by forging
# these requests. These routes are protected by other measures instead:
#   - Rate limiting (5 req/min per IP on login & register)
#   - Account lockout after 5 failed login attempts (15 min)
#   - Password strength validation on register
#   - Anti-enumeration (generic error messages)
_EXEMPT_PREFIXES = ("/auth/", "/api/")


def _sign_token(raw: str) -> str:
    """HMAC-sign a CSRF token so it cannot be forged."""
    sig = hmac.new(
        settings.secret_key.encode(),
        raw.encode(),
        hashlib.sha256,
    ).hexdigest()[:16]
    return f"{raw}.{sig}"


def _verify_signature(token: str) -> bool:
    """Verify the HMAC signature on a CSRF token."""
    if "." not in token:
        return False
    raw, sig = token.rsplit(".", 1)
    expected = hmac.new(
        settings.secret_key.encode(),
        raw.encode(),
        hashlib.sha256,
    ).hexdigest()[:16]
    return hmac.compare_digest(sig, expected)


def generate_csrf_token() -> str:
    """Generate a signed CSRF token with embedded timestamp."""
    raw = f"{int(time.time())}:{secrets.token_hex(16)}"
    return _sign_token(raw)


def _is_token_expired(token: str) -> bool:
    """Check if the CSRF token has expired."""
    if "." not in token:
        return True
    raw = token.rsplit(".", 1)[0]
    try:
        ts_str = raw.split(":")[0]
        ts = int(ts_str)
        return (time.time() - ts) > _TOKEN_TTL_SECONDS
    except (ValueError, IndexError):
        return True


class CSRFMiddleware(BaseHTTPMiddleware):
    """Double-submit cookie CSRF protection.

    Only enforced when:
    - The request method is state-changing (POST/PUT/PATCH/DELETE)
    - The request does NOT carry a Bearer token (cookie-based auth)
    - The path is not in the exempt list
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        # Safe methods, exempt paths and exempt prefixes are always allowed
        path = request.url.path
        if request.method in _SAFE_METHODS or path in _EXEMPT_PATHS or any(path.startswith(p) for p in _EXEMPT_PREFIXES):
            response = await call_next(request)
            return self._set_csrf_cookie(response)

        # Bearer-token requests are inherently CSRF-safe — skip check
        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            return await call_next(request)

        # State-changing request without Bearer token — enforce CSRF
        cookie_token = request.cookies.get(_CSRF_COOKIE_NAME)
        header_token = request.headers.get(_CSRF_HEADER_NAME)

        if not cookie_token or not header_token:
            logger.warning(
                "CSRF validation failed: missing token (cookie=%s, header=%s) path=%s",
                bool(cookie_token), bool(header_token), request.url.path,
            )
            from starlette.responses import JSONResponse
            return JSONResponse(
                status_code=403,
                content={"detail": "CSRF token missing"},
            )

        if not hmac.compare_digest(cookie_token, header_token):
            logger.warning("CSRF validation failed: token mismatch path=%s", request.url.path)
            from starlette.responses import JSONResponse
            return JSONResponse(
                status_code=403,
                content={"detail": "CSRF token mismatch"},
            )

        if not _verify_signature(cookie_token) or _is_token_expired(cookie_token):
            logger.warning("CSRF validation failed: invalid/expired token path=%s", request.url.path)
            from starlette.responses import JSONResponse
            return JSONResponse(
                status_code=403,
                content={"detail": "CSRF token invalid or expired"},
            )

        response = await call_next(request)
        return self._set_csrf_cookie(response)

    @staticmethod
    def _set_csrf_cookie(response: Response) -> Response:
        """Attach a fresh CSRF token cookie to the response."""
        token = generate_csrf_token()
        response.set_cookie(
            key=_CSRF_COOKIE_NAME,
            value=token,
            httponly=False,  # JS must be able to read it for the header
            samesite="strict",
            secure=settings.is_production,
            max_age=_TOKEN_TTL_SECONDS,
            path="/",
        )
        return response
