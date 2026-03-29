"""
Async in-process event bus for Fitsi.
─────────────────────────────────────
Provides a lightweight publish/subscribe mechanism for internal events.
When an event is emitted, all registered subscribers run **concurrently**
in background tasks so the originating request is never blocked.

Supported events (extend as needed):
- meal_logged
- goal_reached
- streak_milestone
- workout_logged

Usage::

    from app.core.event_bus import event_bus

    # Register a handler (typically at import time or in lifespan)
    @event_bus.on("meal_logged")
    async def handle_meal_logged(data: dict) -> None:
        ...

    # Emit from any async context
    await event_bus.emit("meal_logged", {"user_id": 42, "calories": 350})

Design notes:
- Handlers are fire-and-forget: a failing handler does not affect others.
- Each handler runs in its own ``asyncio.Task`` so slow handlers do not
  block the caller or each other.
- This is an in-process bus.  When the system scales to multiple workers,
  replace the internal dispatch with Redis Pub/Sub or a proper message
  broker (RabbitMQ, SQS) while keeping the same ``emit()`` API.
"""

import asyncio
import logging
from collections import defaultdict
from typing import Any, Awaitable, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)

# Type alias for event handler functions
EventHandler = Callable[[dict], Awaitable[None]]


class EventBus:
    """Simple async event bus with publish/subscribe semantics."""

    def __init__(self) -> None:
        self._handlers: Dict[str, List[EventHandler]] = defaultdict(list)

    # ── Subscribe ────────────────────────────────────────────────────────────

    def on(self, event_name: str) -> Callable[[EventHandler], EventHandler]:
        """Decorator to register a handler for *event_name*.

        Example::

            @event_bus.on("meal_logged")
            async def notify_user(data: dict) -> None:
                ...
        """

        def decorator(fn: EventHandler) -> EventHandler:
            self._handlers[event_name].append(fn)
            logger.debug(
                "EventBus: registered handler %s for event '%s'",
                fn.__qualname__,
                event_name,
            )
            return fn

        return decorator

    def subscribe(self, event_name: str, handler: EventHandler) -> None:
        """Imperatively register a handler (non-decorator version)."""
        self._handlers[event_name].append(handler)
        logger.debug(
            "EventBus: subscribed %s to event '%s'",
            handler.__qualname__,
            event_name,
        )

    def unsubscribe(self, event_name: str, handler: EventHandler) -> None:
        """Remove a previously registered handler."""
        try:
            self._handlers[event_name].remove(handler)
        except ValueError:
            pass

    # ── Publish ──────────────────────────────────────────────────────────────

    async def emit(self, event_name: str, data: Optional[dict] = None) -> None:
        """Fire *event_name* with *data*, dispatching to all subscribers.

        Each handler runs in its own ``asyncio.Task`` so:
        - The caller is not blocked.
        - One failing handler does not prevent others from running.
        """
        handlers = self._handlers.get(event_name)
        if not handlers:
            logger.debug("EventBus: no handlers for event '%s'", event_name)
            return

        payload = data or {}
        logger.info(
            "EventBus: emitting '%s' to %d handler(s)",
            event_name,
            len(handlers),
        )

        for handler in handlers:
            asyncio.create_task(
                self._safe_dispatch(event_name, handler, payload)
            )

    # ── Internal ─────────────────────────────────────────────────────────────

    @staticmethod
    async def _safe_dispatch(
        event_name: str, handler: EventHandler, data: dict
    ) -> None:
        """Execute a handler inside a try/except so failures are logged
        without propagating to the caller or other handlers."""
        try:
            await handler(data)
        except Exception:
            logger.exception(
                "EventBus: handler %s for event '%s' raised an exception",
                handler.__qualname__,
                event_name,
            )

    # ── Introspection ────────────────────────────────────────────────────────

    @property
    def registered_events(self) -> List[str]:
        """Return list of event names that have at least one handler."""
        return [k for k, v in self._handlers.items() if v]

    def handler_count(self, event_name: str) -> int:
        """Return the number of handlers registered for *event_name*."""
        return len(self._handlers.get(event_name, []))


# ── Singleton instance ────────────────────────────────────────────────────────
event_bus = EventBus()
