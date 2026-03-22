"""
Webhook delivery service
────────────────────────
Handles the full lifecycle of webhook management and event delivery:

- Register / list / delete webhooks for a user
- Deliver payloads to registered URLs on event emission
- HMAC-SHA256 signature verification
- Retry with exponential backoff (3 attempts)
- Delivery history logging (success / fail)

The service self-registers as an event_bus subscriber at import time
so that any ``event_bus.emit("meal_logged", data)`` call automatically
fans out to every active webhook registered for that event.
"""

import asyncio
import hashlib
import hmac
import json
import logging
import secrets
import time
from datetime import datetime
from typing import List, Optional

import httpx
from sqlalchemy import select, func
from sqlmodel.ext.asyncio.session import AsyncSession

from ..core.database import AsyncSessionLocal
from ..core.event_bus import event_bus
from ..models.webhook import (
    DeliveryStatus,
    Webhook,
    WebhookDelivery,
    WebhookEvent,
)

logger = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────────────────────

MAX_RETRIES = 3
BACKOFF_BASE_SECONDS = 2  # 2s, 4s, 8s
DELIVERY_TIMEOUT_SECONDS = 10
RESPONSE_BODY_MAX_LENGTH = 5000


# ── Signature helpers ────────────────────────────────────────────────────────

def generate_secret() -> str:
    """Generate a cryptographically random 32-byte hex secret for HMAC signing."""
    return secrets.token_hex(32)


def compute_signature(payload: str, secret: str) -> str:
    """Compute HMAC-SHA256 signature for *payload* using *secret*.

    The signature is returned as a hex string prefixed with ``sha256=``
    (GitHub-style convention).
    """
    mac = hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256)
    return f"sha256={mac.hexdigest()}"


def verify_signature(payload: str, secret: str, signature: str) -> bool:
    """Verify that *signature* matches the expected HMAC-SHA256 of *payload*."""
    expected = compute_signature(payload, secret)
    return hmac.compare_digest(expected, signature)


# ── Service class ────────────────────────────────────────────────────────────

class WebhookService:
    """CRUD + delivery logic for webhooks.  Instantiate with a DB session."""

    def __init__(self, session: AsyncSession):
        self.session = session

    # ── CRUD ─────────────────────────────────────────────────────────────────

    async def create_webhook(
        self,
        user_id: int,
        url: str,
        event: WebhookEvent,
        description: Optional[str] = None,
    ) -> Webhook:
        """Register a new webhook.  A unique signing secret is generated automatically."""
        webhook = Webhook(
            user_id=user_id,
            url=url,
            event=event,
            secret=generate_secret(),
            description=description,
        )
        self.session.add(webhook)
        await self.session.commit()
        await self.session.refresh(webhook)
        logger.info(
            "Webhook created: id=%s user_id=%s event=%s url=%s",
            webhook.id, user_id, event, url,
        )
        return webhook

    async def list_webhooks(self, user_id: int) -> List[Webhook]:
        """Return all webhooks belonging to *user_id*."""
        result = await self.session.execute(
            select(Webhook).where(Webhook.user_id == user_id).order_by(Webhook.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_webhook(self, webhook_id: int, user_id: int) -> Optional[Webhook]:
        """Fetch a single webhook, scoped to the requesting user."""
        result = await self.session.execute(
            select(Webhook).where(Webhook.id == webhook_id, Webhook.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def delete_webhook(self, webhook_id: int, user_id: int) -> bool:
        """Delete a webhook.  Returns True if found and deleted, False otherwise."""
        webhook = await self.get_webhook(webhook_id, user_id)
        if not webhook:
            return False
        await self.session.delete(webhook)
        await self.session.commit()
        logger.info("Webhook deleted: id=%s user_id=%s", webhook_id, user_id)
        return True

    # ── Delivery history ─────────────────────────────────────────────────────

    async def list_deliveries(
        self,
        webhook_id: int,
        user_id: int,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[List[WebhookDelivery], int]:
        """Return paginated delivery history for a webhook owned by *user_id*.

        Returns (items, total_count).
        """
        # Verify ownership
        webhook = await self.get_webhook(webhook_id, user_id)
        if not webhook:
            return [], 0

        # Count
        count_result = await self.session.execute(
            select(func.count()).select_from(WebhookDelivery).where(
                WebhookDelivery.webhook_id == webhook_id
            )
        )
        total = count_result.scalar() or 0

        # Fetch page
        offset = (page - 1) * page_size
        result = await self.session.execute(
            select(WebhookDelivery)
            .where(WebhookDelivery.webhook_id == webhook_id)
            .order_by(WebhookDelivery.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        items = list(result.scalars().all())
        return items, total

    # ── Delivery engine ──────────────────────────────────────────────────────

    async def send_test_payload(self, webhook_id: int, user_id: int) -> WebhookDelivery:
        """Send a test payload to verify the webhook endpoint is reachable."""
        webhook = await self.get_webhook(webhook_id, user_id)
        if not webhook:
            raise ValueError("Webhook not found")

        test_payload = {
            "event": webhook.event,
            "test": True,
            "timestamp": datetime.utcnow().isoformat(),
            "data": {
                "message": "This is a test delivery from Fitsi IA",
                "webhook_id": webhook.id,
            },
        }

        delivery = await self._deliver(webhook, test_payload)
        return delivery

    async def _deliver(self, webhook: Webhook, payload_dict: dict) -> WebhookDelivery:
        """Attempt delivery with up to MAX_RETRIES, using exponential backoff.

        Logs every attempt as a WebhookDelivery row.
        """
        payload_json = json.dumps(payload_dict, default=str)
        signature = compute_signature(payload_json, webhook.secret)

        last_delivery: Optional[WebhookDelivery] = None

        for attempt in range(1, MAX_RETRIES + 1):
            start = time.perf_counter()
            delivery = WebhookDelivery(
                webhook_id=webhook.id,
                event=webhook.event,
                payload=payload_json,
                attempt=attempt,
                status=DeliveryStatus.PENDING,
            )

            try:
                async with httpx.AsyncClient(timeout=DELIVERY_TIMEOUT_SECONDS) as client:
                    response = await client.post(
                        webhook.url,
                        content=payload_json,
                        headers={
                            "Content-Type": "application/json",
                            "X-Fitsi-Signature": signature,
                            "X-Fitsi-Event": webhook.event,
                            "User-Agent": "Fitsi-Webhook/1.0",
                        },
                    )

                duration_ms = round((time.perf_counter() - start) * 1000, 2)
                delivery.duration_ms = duration_ms
                delivery.http_status = response.status_code
                delivery.response_body = response.text[:RESPONSE_BODY_MAX_LENGTH] if response.text else None

                if 200 <= response.status_code < 300:
                    delivery.status = DeliveryStatus.SUCCESS
                    self.session.add(delivery)
                    await self.session.commit()
                    await self.session.refresh(delivery)
                    logger.info(
                        "Webhook delivery success: webhook_id=%s attempt=%d status=%d duration=%.1fms",
                        webhook.id, attempt, response.status_code, duration_ms,
                    )
                    return delivery
                else:
                    delivery.status = DeliveryStatus.FAILED
                    delivery.error_message = f"HTTP {response.status_code}"
                    logger.warning(
                        "Webhook delivery failed: webhook_id=%s attempt=%d status=%d",
                        webhook.id, attempt, response.status_code,
                    )

            except httpx.TimeoutException:
                duration_ms = round((time.perf_counter() - start) * 1000, 2)
                delivery.duration_ms = duration_ms
                delivery.status = DeliveryStatus.FAILED
                delivery.error_message = "Connection timed out"
                logger.warning(
                    "Webhook delivery timeout: webhook_id=%s attempt=%d",
                    webhook.id, attempt,
                )

            except Exception as exc:
                duration_ms = round((time.perf_counter() - start) * 1000, 2)
                delivery.duration_ms = duration_ms
                delivery.status = DeliveryStatus.FAILED
                delivery.error_message = str(exc)[:2000]
                logger.error(
                    "Webhook delivery error: webhook_id=%s attempt=%d error=%s",
                    webhook.id, attempt, exc,
                )

            # Persist the failed attempt
            self.session.add(delivery)
            await self.session.commit()
            await self.session.refresh(delivery)
            last_delivery = delivery

            # Exponential backoff before next retry (skip sleep after last attempt)
            if attempt < MAX_RETRIES:
                backoff = BACKOFF_BASE_SECONDS ** attempt  # 2s, 4s
                logger.debug(
                    "Webhook retry backoff: webhook_id=%s sleeping %.1fs before attempt %d",
                    webhook.id, backoff, attempt + 1,
                )
                await asyncio.sleep(backoff)

        return last_delivery  # type: ignore[return-value]


# ── Event bus integration ────────────────────────────────────────────────────
# Each supported event is wired to dispatch_webhooks_for_event so that
# calling ``event_bus.emit("meal_logged", data)`` automatically fans out
# to all active webhooks registered for that event.

async def dispatch_webhooks_for_event(event_name: str, data: dict) -> None:
    """Look up active webhooks for *event_name* and deliver the payload.

    Runs inside its own DB session so it is fully independent of the
    originating request's transaction.
    """
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(Webhook).where(
                    Webhook.event == event_name,
                    Webhook.is_active == True,
                )
            )
            webhooks = list(result.scalars().all())

            if not webhooks:
                return

            logger.info(
                "Dispatching '%s' to %d webhook(s)",
                event_name, len(webhooks),
            )

            payload = {
                "event": event_name,
                "timestamp": datetime.utcnow().isoformat(),
                "data": data,
            }

            service = WebhookService(session)
            # Deliver to all webhooks concurrently
            tasks = [service._deliver(wh, payload) for wh in webhooks]
            await asyncio.gather(*tasks, return_exceptions=True)

    except Exception:
        logger.exception(
            "dispatch_webhooks_for_event failed for event '%s'", event_name
        )


def _register_event_bus_handlers() -> None:
    """Wire up the event bus so every supported event triggers webhook dispatch."""
    for evt in WebhookEvent:

        async def _handler(data: dict, _event_name: str = evt.value) -> None:
            await dispatch_webhooks_for_event(_event_name, data)

        event_bus.subscribe(evt.value, _handler)

    logger.debug(
        "WebhookService: registered event_bus handlers for %s",
        [e.value for e in WebhookEvent],
    )


# Auto-register on import
_register_event_bus_handlers()
