"""
Request Validation & Input Sanitization
-----------------------------------------
Middleware and utilities for validating incoming request sizes and sanitizing
user-provided text inputs.

Features:
- Max body size enforcement: 10 MB for image uploads, 1 MB for JSON payloads
- Text sanitization: strip HTML tags, enforce max length, normalize whitespace
- Reusable ``sanitize_input()`` function for use in Pydantic validators or handlers
- Middleware rejects oversized requests early with 413 Payload Too Large

Usage::

    # As middleware (registered in main.py):
    from app.core.validation import RequestValidationMiddleware
    app.add_middleware(RequestValidationMiddleware)

    # In endpoint handlers or Pydantic validators:
    from app.core.validation import sanitize_input
    clean_name = sanitize_input(raw_name, max_length=200)
"""

import logging
import re
from typing import Optional, Set

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

logger = logging.getLogger(__name__)


# ─── Size Limits ──────────────────────────────────────────────────────────────

MAX_JSON_BODY_BYTES = 1 * 1024 * 1024      # 1 MB
MAX_IMAGE_BODY_BYTES = 10 * 1024 * 1024     # 10 MB
MAX_DEFAULT_BODY_BYTES = 1 * 1024 * 1024    # 1 MB fallback

# Content-Type prefixes that indicate image/file uploads
_IMAGE_CONTENT_TYPES = {"image/", "multipart/form-data"}

# Paths that are exempt from body size validation (health checks, docs, etc.)
_EXEMPT_PATHS: Set[str] = {
    "/health", "/api/health", "/docs", "/redoc", "/openapi.json", "/", "/metrics",
}

# Methods that never carry a request body
_NO_BODY_METHODS = {"GET", "HEAD", "OPTIONS", "DELETE"}


# ─── HTML Stripping ──────────────────────────────────────────────────────────

# Pattern to match HTML/XML tags
_HTML_TAG_RE = re.compile(r"<[^>]+>")

# Pattern to match HTML entities (&amp; &lt; &#123; etc.)
_HTML_ENTITY_RE = re.compile(r"&[#\w]+;")

# Pattern to match multiple consecutive whitespace chars
_MULTI_WHITESPACE_RE = re.compile(r"\s+")

# Pattern to match common script/event handler injection patterns
_SCRIPT_PATTERN_RE = re.compile(
    r"(javascript\s*:|on\w+\s*=|<\s*script|<\s*iframe|<\s*object|<\s*embed)",
    re.IGNORECASE,
)


# ─── Sanitization ─────────────────────────────────────────────────────────────

def sanitize_input(
    text: Optional[str],
    max_length: int = 1000,
    strip_html: bool = True,
    normalize_whitespace: bool = True,
) -> str:
    """Sanitize a user-provided text input.

    Args:
        text: Raw input text (None is treated as empty string).
        max_length: Maximum allowed length after sanitization (default 1000).
        strip_html: Whether to remove HTML tags and entities (default True).
        normalize_whitespace: Whether to collapse multiple whitespace into single
            spaces and strip leading/trailing whitespace (default True).

    Returns:
        Sanitized string, truncated to ``max_length`` characters.

    Examples::

        >>> sanitize_input("<script>alert('xss')</script>Hello")
        'Hello'

        >>> sanitize_input("  too   many   spaces  ")
        'too many spaces'

        >>> sanitize_input("A" * 2000, max_length=100)
        'AAA...A'  # truncated to 100 chars
    """
    if text is None:
        return ""

    if not isinstance(text, str):
        text = str(text)

    # Strip leading/trailing whitespace first
    result = text.strip()

    if strip_html:
        # Remove HTML tags
        result = _HTML_TAG_RE.sub("", result)
        # Remove HTML entities
        result = _HTML_ENTITY_RE.sub("", result)
        # Remove script/injection patterns
        result = _SCRIPT_PATTERN_RE.sub("", result)

    if normalize_whitespace:
        # Collapse multiple whitespace into single spaces
        result = _MULTI_WHITESPACE_RE.sub(" ", result).strip()

    # Enforce max length
    if len(result) > max_length:
        result = result[:max_length]

    return result


def validate_text_length(text: Optional[str], field_name: str, max_length: int = 1000) -> str:
    """Validate and sanitize a text field, raising ValueError if too long before sanitization.

    This is useful in Pydantic validators where you want a clear error message.

    Args:
        text: Raw input.
        field_name: Name of the field (for error messages).
        max_length: Max allowed length.

    Returns:
        Sanitized text.

    Raises:
        ValueError: If the raw text exceeds 10x the max_length (clearly abusive input).
    """
    if text is None:
        return ""

    # Reject clearly abusive payloads (10x over limit)
    if len(text) > max_length * 10:
        raise ValueError(
            f"Field '{field_name}' is excessively long ({len(text)} chars). "
            f"Maximum allowed: {max_length} characters."
        )

    return sanitize_input(text, max_length=max_length)


# ─── Body Size Middleware ──────────────────────────────────────────────────────

def _get_max_body_size(content_type: str) -> int:
    """Determine the max allowed body size based on Content-Type."""
    if not content_type:
        return MAX_DEFAULT_BODY_BYTES

    content_type_lower = content_type.lower()
    for image_prefix in _IMAGE_CONTENT_TYPES:
        if image_prefix in content_type_lower:
            return MAX_IMAGE_BODY_BYTES

    return MAX_JSON_BODY_BYTES


class RequestValidationMiddleware(BaseHTTPMiddleware):
    """Validates incoming request body sizes before they reach endpoint handlers.

    - Rejects JSON payloads larger than 1 MB with 413 Payload Too Large
    - Rejects image/file uploads larger than 10 MB with 413 Payload Too Large
    - Skips validation for GET, HEAD, OPTIONS, DELETE (no body expected)
    - Skips health check and documentation paths
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        # Skip methods that don't carry request bodies
        if request.method in _NO_BODY_METHODS:
            return await call_next(request)

        # Skip exempt paths
        if request.url.path in _EXEMPT_PATHS:
            return await call_next(request)

        # Check Content-Length header if present (fast path)
        content_length = request.headers.get("content-length")
        content_type = request.headers.get("content-type", "")
        max_size = _get_max_body_size(content_type)

        if content_length:
            try:
                declared_size = int(content_length)
                if declared_size > max_size:
                    max_mb = max_size / (1024 * 1024)
                    logger.warning(
                        "Request body too large: %d bytes (max %.0f MB) for %s %s",
                        declared_size, max_mb, request.method, request.url.path,
                    )
                    return JSONResponse(
                        status_code=413,
                        content={
                            "detail": f"Request body too large. Maximum allowed: {max_mb:.0f} MB.",
                            "max_bytes": max_size,
                        },
                    )
            except (ValueError, TypeError):
                pass  # Malformed Content-Length — let the framework handle it

        return await call_next(request)
