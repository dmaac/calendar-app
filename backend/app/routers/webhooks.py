"""
Webhook management endpoints
─────────────────────────────
POST   /api/webhooks              — Register a new webhook
GET    /api/webhooks              — List webhooks for the authenticated user
DELETE /api/webhooks/{id}         — Delete a webhook
GET    /api/webhooks/{id}/deliveries — Delivery history (paginated)
POST   /api/webhooks/test/{id}    — Send a test payload
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, HttpUrl
from sqlmodel.ext.asyncio.session import AsyncSession

from ..core.database import get_session
from ..core.pagination import PaginatedResponse, build_paginated_response
from ..models.user import User
from ..models.webhook import DeliveryStatus, WebhookEvent
from ..services.webhook_service import WebhookService
from .auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


# ── Request / Response schemas ───────────────────────────────────────────────

class WebhookCreateRequest(BaseModel):
    url: str = Field(
        ...,
        min_length=1,
        max_length=2048,
        description="HTTPS endpoint to receive POST payloads",
    )
    event: WebhookEvent = Field(..., description="Event type to subscribe to")
    description: Optional[str] = Field(
        None, max_length=500, description="Optional description"
    )


class WebhookResponse(BaseModel):
    id: int
    url: str
    event: WebhookEvent
    secret: str = Field(description="HMAC-SHA256 signing secret (shown once at creation)")
    is_active: bool
    description: Optional[str]
    created_at: str
    updated_at: str


class WebhookListItem(BaseModel):
    """Same as WebhookResponse but without the secret (list view)."""
    id: int
    url: str
    event: WebhookEvent
    is_active: bool
    description: Optional[str]
    created_at: str
    updated_at: str


class DeliveryResponse(BaseModel):
    id: int
    webhook_id: int
    event: WebhookEvent
    payload: str
    status: DeliveryStatus
    http_status: Optional[int]
    response_body: Optional[str]
    error_message: Optional[str]
    attempt: int
    duration_ms: Optional[float]
    created_at: str


class TestDeliveryResponse(BaseModel):
    detail: str
    delivery: DeliveryResponse


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("", response_model=WebhookResponse, status_code=status.HTTP_201_CREATED)
async def create_webhook(
    body: WebhookCreateRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Register a webhook for a specific event.

    The response includes the signing ``secret`` which should be stored
    securely by the consumer to verify incoming payloads via HMAC-SHA256.
    The secret is only shown once at creation time.
    """
    # Validate URL scheme
    if not body.url.startswith("https://"):
        # Allow http in development only
        from ..core.config import settings
        if settings.is_production:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Webhook URL must use HTTPS in production",
            )

    service = WebhookService(session)
    webhook = await service.create_webhook(
        user_id=current_user.id,
        url=body.url,
        event=body.event,
        description=body.description,
    )

    return WebhookResponse(
        id=webhook.id,
        url=webhook.url,
        event=webhook.event,
        secret=webhook.secret,
        is_active=webhook.is_active,
        description=webhook.description,
        created_at=webhook.created_at.isoformat(),
        updated_at=webhook.updated_at.isoformat(),
    )


@router.get("", response_model=List[WebhookListItem])
async def list_webhooks(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """List all webhooks registered by the authenticated user.

    The signing secret is **not** included in list responses for security.
    """
    service = WebhookService(session)
    webhooks = await service.list_webhooks(current_user.id)

    return [
        WebhookListItem(
            id=wh.id,
            url=wh.url,
            event=wh.event,
            is_active=wh.is_active,
            description=wh.description,
            created_at=wh.created_at.isoformat(),
            updated_at=wh.updated_at.isoformat(),
        )
        for wh in webhooks
    ]


@router.delete("/{webhook_id}", status_code=status.HTTP_200_OK)
async def delete_webhook(
    webhook_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Delete a webhook.  Only the owner can delete their own webhooks."""
    service = WebhookService(session)
    deleted = await service.delete_webhook(webhook_id, current_user.id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Webhook not found",
        )
    return {"detail": "Webhook deleted"}


@router.get(
    "/{webhook_id}/deliveries",
    response_model=PaginatedResponse[DeliveryResponse],
)
async def list_deliveries(
    webhook_id: int,
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Paginated delivery history for a specific webhook.

    Shows every attempt (including retries) with status, HTTP code,
    response body snippet, and round-trip duration.
    """
    service = WebhookService(session)
    items, total = await service.list_deliveries(
        webhook_id=webhook_id,
        user_id=current_user.id,
        page=page,
        page_size=page_size,
    )

    if total == 0:
        # Check if the webhook exists at all
        webhook = await service.get_webhook(webhook_id, current_user.id)
        if not webhook:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Webhook not found",
            )

    delivery_items = [
        DeliveryResponse(
            id=d.id,
            webhook_id=d.webhook_id,
            event=d.event,
            payload=d.payload,
            status=d.status,
            http_status=d.http_status,
            response_body=d.response_body,
            error_message=d.error_message,
            attempt=d.attempt,
            duration_ms=d.duration_ms,
            created_at=d.created_at.isoformat(),
        )
        for d in items
    ]

    return build_paginated_response(
        items=delivery_items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/test/{webhook_id}", response_model=TestDeliveryResponse)
async def test_webhook(
    webhook_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Send a test payload to verify the webhook endpoint is reachable.

    This creates a real delivery record in the history so you can
    inspect the result via ``GET /api/webhooks/{id}/deliveries``.
    """
    service = WebhookService(session)

    try:
        delivery = await service.send_test_payload(webhook_id, current_user.id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Webhook not found",
        )

    status_msg = (
        "Test payload delivered successfully"
        if delivery.status == DeliveryStatus.SUCCESS
        else f"Test payload delivery failed after {delivery.attempt} attempt(s)"
    )

    return TestDeliveryResponse(
        detail=status_msg,
        delivery=DeliveryResponse(
            id=delivery.id,
            webhook_id=delivery.webhook_id,
            event=delivery.event,
            payload=delivery.payload,
            status=delivery.status,
            http_status=delivery.http_status,
            response_body=delivery.response_body,
            error_message=delivery.error_message,
            attempt=delivery.attempt,
            duration_ms=delivery.duration_ms,
            created_at=delivery.created_at.isoformat(),
        ),
    )
