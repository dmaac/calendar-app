"""
Structured JSON Logging Configuration
---------------------------------------
Configures Python's logging module to emit structured JSON logs suitable for
log aggregation systems (CloudWatch, Datadog, ELK, etc.).

In development, a human-readable fallback format is used for convenience.
In production, every log line is a valid JSON object with consistent fields:
  - timestamp (ISO 8601)
  - level
  - logger (name)
  - message
  - module
  - function
  - line
  - request_id (when available via contextvars)
  - Extra fields are merged into the root object.

Request-ID injection:
  The ``request_id_var`` ContextVar is set by CorrelationIDMiddleware for each
  request.  Both the JSON formatter and the dev formatter automatically include
  it when present, so every log line emitted during a request carries the
  tracing identifier without callers having to pass it explicitly.

Usage:
    from app.core.logging_config import setup_logging, request_id_var
    setup_logging()  # Call once at app startup (in lifespan)

    # In middleware:
    request_id_var.set("abc-123")
"""

import json
import logging
import sys
from contextvars import ContextVar
from datetime import datetime, timezone
from typing import Any, Dict

# ContextVar holding the current request's correlation ID.  Set by
# CorrelationIDMiddleware, read by formatters and exception handlers.
request_id_var: ContextVar[str] = ContextVar("request_id", default="")


class JSONFormatter(logging.Formatter):
    """
    Formats log records as single-line JSON objects.

    Extra fields attached via ``logger.info("msg", extra={"user_id": 42})``
    are merged into the top-level JSON object.  The ``request_id`` ContextVar
    is always included when set.
    """

    # Fields from LogRecord that we explicitly handle or want to exclude
    _SKIP_FIELDS = {
        "args", "created", "exc_info", "exc_text", "filename", "funcName",
        "levelname", "levelno", "lineno", "message", "module", "msecs", "msg",
        "name", "pathname", "process", "processName", "relativeCreated",
        "stack_info", "thread", "threadName", "taskName",
    }

    def format(self, record: logging.LogRecord) -> str:
        log_entry: Dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(
                record.created, tz=timezone.utc
            ).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }

        # Inject request_id from contextvars (always present in request scope)
        rid = request_id_var.get("")
        if rid:
            log_entry["request_id"] = rid

        # Merge extra fields
        for key, value in record.__dict__.items():
            if key not in self._SKIP_FIELDS and not key.startswith("_"):
                log_entry[key] = value

        # Include exception info if present
        if record.exc_info and record.exc_info[1]:
            log_entry["exception"] = self.formatException(record.exc_info)

        if record.stack_info:
            log_entry["stack_info"] = self.formatStack(record.stack_info)

        return json.dumps(log_entry, default=str, ensure_ascii=False)


class _RequestIDFilter(logging.Filter):
    """Logging filter that injects ``request_id`` into every LogRecord.

    This makes ``%(request_id)s`` available in format strings for the
    development formatter.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get("")  # type: ignore[attr-defined]
        return True


# Human-readable format for development (now includes request_id when present)
_DEV_FORMAT = (
    "%(asctime)s | %(levelname)-8s | %(name)s:%(funcName)s:%(lineno)d"
    " | rid=%(request_id)s | %(message)s"
)


def setup_logging(*, production: bool = False, log_level: str = "INFO") -> None:
    """
    Configure the root logger with either JSON (production) or human-readable
    (development) formatting.

    Call this once during application startup, before any log messages are emitted.
    """
    root = logging.getLogger()

    # Clear any existing handlers to prevent duplicate output
    root.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)

    if production:
        handler.setFormatter(JSONFormatter())
    else:
        handler.addFilter(_RequestIDFilter())
        handler.setFormatter(logging.Formatter(_DEV_FORMAT, datefmt="%Y-%m-%d %H:%M:%S"))

    root.addHandler(handler)
    root.setLevel(getattr(logging, log_level.upper(), logging.INFO))

    # Reduce noise from third-party libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
