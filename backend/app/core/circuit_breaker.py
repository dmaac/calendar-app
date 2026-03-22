"""Circuit breaker for external service calls (OpenAI, etc.).

Prevents cascading failures by short-circuiting calls to failing services.

States::

    CLOSED  (normal)  ──5 failures in 60s──>  OPEN  (reject all)
    OPEN    (reject)  ──30s cooldown──>        HALF_OPEN  (allow 1 probe)
    HALF_OPEN (probe) ──success──>             CLOSED
    HALF_OPEN (probe) ──failure──>             OPEN

Usage::

    from app.core.circuit_breaker import circuit_breaker

    openai_breaker = circuit_breaker("openai", failure_threshold=5)

    @openai_breaker
    async def call_openai(prompt: str) -> dict:
        ...

Or manually::

    breaker = CircuitBreaker("openai")
    if breaker.allow_request():
        try:
            result = await call_openai(...)
            breaker.record_success()
        except Exception:
            breaker.record_failure()
            raise
"""
import asyncio
import functools
import logging
import time
from enum import Enum
from typing import Callable, Optional

logger = logging.getLogger(__name__)


class CircuitState(str, Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreakerOpen(Exception):
    """Raised when a call is rejected because the circuit is open."""

    def __init__(self, service: str, retry_after: float):
        self.service = service
        self.retry_after = retry_after
        super().__init__(
            f"Circuit breaker OPEN for '{service}'. "
            f"Service temporarily unavailable. Retry after {retry_after:.0f}s."
        )


class CircuitBreaker:
    """In-memory circuit breaker for a named external service.

    Thread-safe for asyncio (single-threaded event loop).
    """

    def __init__(
        self,
        service_name: str,
        failure_threshold: int = 5,
        failure_window: float = 60.0,
        recovery_timeout: float = 30.0,
    ):
        self.service_name = service_name
        self.failure_threshold = failure_threshold
        self.failure_window = failure_window
        self.recovery_timeout = recovery_timeout

        self._state = CircuitState.CLOSED
        self._failures: list[float] = []  # timestamps of recent failures
        self._last_failure_time: float = 0.0
        self._opened_at: float = 0.0

    @property
    def state(self) -> CircuitState:
        if self._state == CircuitState.OPEN:
            if time.monotonic() - self._opened_at >= self.recovery_timeout:
                self._state = CircuitState.HALF_OPEN
                logger.info(
                    "Circuit breaker '%s': OPEN -> HALF_OPEN (recovery probe allowed)",
                    self.service_name,
                )
        return self._state

    def allow_request(self) -> bool:
        """Return True if a request should be allowed through."""
        current = self.state
        if current == CircuitState.CLOSED:
            return True
        if current == CircuitState.HALF_OPEN:
            return True  # allow one probe request
        return False

    def record_success(self):
        """Record a successful call. Resets the breaker if half-open."""
        if self._state in (CircuitState.HALF_OPEN, CircuitState.OPEN):
            logger.info(
                "Circuit breaker '%s': %s -> CLOSED (success)",
                self.service_name,
                self._state.value,
            )
        self._state = CircuitState.CLOSED
        self._failures.clear()

    def record_failure(self):
        """Record a failed call. May trip the breaker."""
        now = time.monotonic()
        self._last_failure_time = now

        if self._state == CircuitState.HALF_OPEN:
            # Probe failed — re-open
            self._state = CircuitState.OPEN
            self._opened_at = now
            logger.warning(
                "Circuit breaker '%s': HALF_OPEN -> OPEN (probe failed)",
                self.service_name,
            )
            return

        # Prune old failures outside the window
        cutoff = now - self.failure_window
        self._failures = [t for t in self._failures if t > cutoff]
        self._failures.append(now)

        if len(self._failures) >= self.failure_threshold:
            self._state = CircuitState.OPEN
            self._opened_at = now
            logger.warning(
                "Circuit breaker '%s': CLOSED -> OPEN (%d failures in %.0fs)",
                self.service_name,
                len(self._failures),
                self.failure_window,
            )

    def retry_after(self) -> float:
        """Seconds until the breaker transitions to half-open."""
        if self._state != CircuitState.OPEN:
            return 0.0
        elapsed = time.monotonic() - self._opened_at
        return max(0.0, self.recovery_timeout - elapsed)

    def status(self) -> dict:
        """Return a dict describing the current breaker state."""
        return {
            "service": self.service_name,
            "state": self.state.value,
            "recent_failures": len(self._failures),
            "failure_threshold": self.failure_threshold,
            "retry_after": round(self.retry_after(), 1),
        }


# ─── Registry of named breakers ────────────────────────────────────────────

_breakers: dict[str, CircuitBreaker] = {}


def get_breaker(
    service_name: str,
    failure_threshold: int = 5,
    failure_window: float = 60.0,
    recovery_timeout: float = 30.0,
) -> CircuitBreaker:
    """Get or create a named circuit breaker (singleton per service name)."""
    if service_name not in _breakers:
        _breakers[service_name] = CircuitBreaker(
            service_name=service_name,
            failure_threshold=failure_threshold,
            failure_window=failure_window,
            recovery_timeout=recovery_timeout,
        )
    return _breakers[service_name]


def all_breaker_statuses() -> list[dict]:
    """Return status dicts for all registered breakers."""
    return [b.status() for b in _breakers.values()]


# ─── Decorator ──────────────────────────────────────────────────────────────

def circuit_breaker(
    service_name: str,
    failure_threshold: int = 5,
    failure_window: float = 60.0,
    recovery_timeout: float = 30.0,
    fallback: Optional[Callable] = None,
):
    """Decorator that wraps an async function with circuit breaker protection.

    Args:
        service_name: Identifier for the external service.
        failure_threshold: Number of failures within the window to trip the breaker.
        failure_window: Window in seconds to count failures.
        recovery_timeout: Seconds the breaker stays open before allowing a probe.
        fallback: Optional async callable invoked when the circuit is open.
                  If None, CircuitBreakerOpen is raised.

    Usage::

        @circuit_breaker("openai", failure_threshold=5)
        async def call_openai(prompt: str) -> dict:
            ...
    """
    breaker = get_breaker(service_name, failure_threshold, failure_window, recovery_timeout)

    def decorator(fn: Callable):
        @functools.wraps(fn)
        async def wrapper(*args, **kwargs):
            if not breaker.allow_request():
                if fallback is not None:
                    return await fallback(*args, **kwargs)
                raise CircuitBreakerOpen(service_name, breaker.retry_after())

            try:
                result = await fn(*args, **kwargs)
                breaker.record_success()
                return result
            except CircuitBreakerOpen:
                raise  # don't record our own sentinel as a failure
            except Exception:
                breaker.record_failure()
                raise

        wrapper.breaker = breaker
        return wrapper

    return decorator
