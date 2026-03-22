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
  - Extra fields are merged into the root object.

Usage:
    from app.core.logging_config import setup_logging
    setup_logging()  # Call once at app startup (in lifespan)
"""

import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any, Dict


class JSONFormatter(logging.Formatter):
    """
    Formats log records as single-line JSON objects.

    Extra fields attached via `logger.info("msg", extra={"user_id": 42})`
    are merged into the top-level JSON object.
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


# Human-readable format for development
_DEV_FORMAT = (
    "%(asctime)s | %(levelname)-8s | %(name)s:%(funcName)s:%(lineno)d | %(message)s"
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
        handler.setFormatter(logging.Formatter(_DEV_FORMAT, datefmt="%Y-%m-%d %H:%M:%S"))

    root.addHandler(handler)
    root.setLevel(getattr(logging, log_level.upper(), logging.INFO))

    # Reduce noise from third-party libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
