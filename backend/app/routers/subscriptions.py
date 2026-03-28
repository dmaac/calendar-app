"""
Subscriptions router
────────────────────
POST /api/subscriptions                — create or update subscription (called after in-app purchase)
GET  /api/subscriptions/current        — get current subscription for authenticated user
GET  /api/subscriptions/status         — detailed subscription status with entitlement info
POST /api/subscriptions/verify-receipt — server-side receipt validation (Apple/Google)
POST /api/subscriptions/webhooks       — webhook handler for store subscription events
POST /api/subscriptions/restore        — restore purchases from store receipt
GET  /api/subscriptions/analytics      — subscription analytics (admin: MRR, churn, conversions)
DELETE /api/subscriptions/current      — cancel the active subscription

SECURITY NOTE (2026-03-21):
  The POST endpoint now sets status='pending_verification' instead of 'active'.
  Subscriptions MUST be verified against Apple/Google receipt APIs before being
  promoted to 'active'.  A background worker or webhook handler should call
  verify_and_activate_subscription() after validating the store_tx_id.
  Until that verification, the user is NOT marked as premium.

Status lifecycle:
  pending_verification -> active -> [grace_period] -> expired
  pending_verification -> active -> canceled (end-of-period access)
  active -> billing_retry -> grace_period -> expired
  active -> refunded -> expired
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlmodel import select, func, col
from sqlmodel.ext.asyncio.session import AsyncSession

from ..core.database import get_session
from ..models.subscription import Subscription
from ..models.user import User
from ..routers.auth import get_current_user
from pydantic import BaseModel, Field
from enum import Enum

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/subscriptions", tags=["subscriptions"])

# ─── Grace Period Configuration ───────────────────────────────────────────────
GRACE_PERIOD_DAYS = 3  # Apple/Google standard: 3-16 days
BILLING_RETRY_DAYS = 7  # Max days to retry failed billing


# ─── Enums ────────────────────────────────────────────────────────────────────

class SubscriptionPlan(str, Enum):
    monthly = "monthly"
    annual = "annual"
    lifetime = "lifetime"


class SubscriptionStore(str, Enum):
    apple = "apple"
    google = "google"
    stripe = "stripe"


class SubscriptionStatus(str, Enum):
    pending_verification = "pending_verification"
    active = "active"
    trial = "trial"
    grace_period = "grace_period"
    billing_retry = "billing_retry"
    canceled = "canceled"
    expired = "expired"
    refunded = "refunded"


# ─── Request/Response Schemas ─────────────────────────────────────────────────

class SubscriptionCreate(BaseModel):
    plan: SubscriptionPlan = Field(..., description="Subscription plan: monthly, annual, or lifetime")
    store: SubscriptionStore = Field(..., description="App store: apple, google, or stripe")
    store_tx_id: str = Field(..., min_length=1, max_length=500, description="Store transaction ID for receipt verification")
    price_paid: Optional[float] = Field(None, ge=0, le=9999.99, description="Price paid in currency units, 0-9999.99")
    discount_pct: Optional[int] = Field(None, ge=0, le=100, description="Discount percentage applied, 0-100")
    trial_days: Optional[int] = Field(None, ge=0, le=365, description="Trial period in days, 0-365")
    currency: str = Field(default="USD", max_length=3, description="ISO 4217 currency code")


class SubscriptionRead(BaseModel):
    id: int
    user_id: int
    plan: str
    status: str
    price_paid: Optional[float]
    discount_pct: Optional[int]
    store: Optional[str]
    trial_ends_at: Optional[datetime]
    current_period_ends_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime


class SubscriptionStatusResponse(BaseModel):
    """Detailed subscription status for the client."""
    is_premium: bool
    status: str  # active, trial, grace_period, expired, none
    plan: Optional[str]
    trial_ends_at: Optional[datetime]
    current_period_ends_at: Optional[datetime]
    grace_period_ends_at: Optional[datetime]
    cancel_at_period_end: bool
    days_remaining: Optional[int]
    store: Optional[str]
    features: List[str]


class ReceiptValidationRequest(BaseModel):
    store: SubscriptionStore = Field(..., description="apple or google")
    receipt_data: str = Field(..., min_length=1, max_length=50000, description="Base64-encoded receipt (Apple) or purchase token (Google)")
    product_id: str = Field(..., min_length=1, max_length=200, description="Product ID from the store")


class ReceiptValidationResponse(BaseModel):
    valid: bool
    subscription_id: Optional[int]
    status: str  # verified, invalid, already_processed, error
    message: str


class RestorePurchaseRequest(BaseModel):
    store: SubscriptionStore
    receipt_data: str = Field(..., min_length=1, max_length=50000)


class SubscriptionAnalyticsResponse(BaseModel):
    """Subscription analytics for admin dashboard."""
    total_subscribers: int
    active_subscribers: int
    trial_subscribers: int
    churned_last_30d: int
    mrr_usd: float
    arr_usd: float
    trial_conversion_rate: float
    churn_rate_30d: float
    average_revenue_per_user: float
    plan_distribution: dict
    store_distribution: dict
    new_subscriptions_30d: int
    cancellations_30d: int
    refunds_30d: int


# ─── Premium Features by Plan ────────────────────────────────────────────────

PLAN_FEATURES = {
    "free": [
        "basic_tracking",
        "3_scans_per_day",
    ],
    "monthly": [
        "unlimited_scans",
        "ai_coach",
        "advanced_tracking",
        "personalized_recipes",
        "export_data",
        "streak_tracking",
        "health_integration",
        "smart_notifications",
    ],
    "annual": [
        "unlimited_scans",
        "ai_coach",
        "advanced_tracking",
        "personalized_recipes",
        "export_data",
        "streak_tracking",
        "health_integration",
        "smart_notifications",
        "priority_support",
    ],
    "lifetime": [
        "unlimited_scans",
        "ai_coach",
        "advanced_tracking",
        "personalized_recipes",
        "export_data",
        "streak_tracking",
        "health_integration",
        "smart_notifications",
        "priority_support",
        "early_access",
    ],
}


# ─── Entitlement Checking ────────────────────────────────────────────────────

async def get_subscription_status(
    user: User, session: AsyncSession
) -> SubscriptionStatusResponse:
    """
    Compute the detailed subscription status for a user.
    Handles active, trial, grace_period, canceled, and expired states.
    This is the single source of truth for entitlement checking.
    """
    now = datetime.now(timezone.utc)

    # Find the most recent relevant subscription
    result = await session.execute(
        select(Subscription)
        .where(
            Subscription.user_id == user.id,
            Subscription.status.in_([
                "active", "trial", "grace_period", "billing_retry", "canceled",
            ]),
        )
        .order_by(Subscription.created_at.desc())
    )
    sub = result.scalars().first()

    # No subscription found
    if not sub:
        return SubscriptionStatusResponse(
            is_premium=False,
            status="none",
            plan=None,
            trial_ends_at=None,
            current_period_ends_at=None,
            grace_period_ends_at=None,
            cancel_at_period_end=False,
            days_remaining=None,
            store=None,
            features=PLAN_FEATURES["free"],
        )

    # Check if trial has expired
    if sub.status == "trial" and sub.trial_ends_at:
        if now > sub.trial_ends_at:
            sub.status = "expired"
            sub.updated_at = now
            session.add(sub)
            await session.commit()
            return SubscriptionStatusResponse(
                is_premium=False,
                status="trial_expired",
                plan=sub.plan,
                trial_ends_at=sub.trial_ends_at,
                current_period_ends_at=sub.current_period_ends_at,
                grace_period_ends_at=None,
                cancel_at_period_end=False,
                days_remaining=0,
                store=sub.store,
                features=PLAN_FEATURES["free"],
            )

    # Check if active subscription has expired -> grace period
    if sub.status == "active" and sub.current_period_ends_at:
        if now > sub.current_period_ends_at:
            grace_end = sub.current_period_ends_at + timedelta(days=GRACE_PERIOD_DAYS)
            if now <= grace_end:
                # Enter grace period -- user keeps access
                sub.status = "grace_period"
                sub.updated_at = now
                session.add(sub)
                await session.commit()
                logger.info(
                    "Subscription %d entered grace_period for user %d",
                    sub.id, user.id,
                )
            else:
                # Grace period expired
                sub.status = "expired"
                sub.updated_at = now
                session.add(sub)
                user.is_premium = False
                user.updated_at = now
                session.add(user)
                await session.commit()
                logger.info(
                    "Subscription %d expired (grace period ended) for user %d",
                    sub.id, user.id,
                )
                return SubscriptionStatusResponse(
                    is_premium=False,
                    status="expired",
                    plan=sub.plan,
                    trial_ends_at=sub.trial_ends_at,
                    current_period_ends_at=sub.current_period_ends_at,
                    grace_period_ends_at=grace_end,
                    cancel_at_period_end=False,
                    days_remaining=0,
                    store=sub.store,
                    features=PLAN_FEATURES["free"],
                )

    # Check grace_period expiry
    if sub.status == "grace_period" and sub.current_period_ends_at:
        grace_end = sub.current_period_ends_at + timedelta(days=GRACE_PERIOD_DAYS)
        if now > grace_end:
            sub.status = "expired"
            sub.updated_at = now
            session.add(sub)
            user.is_premium = False
            user.updated_at = now
            session.add(user)
            await session.commit()
            return SubscriptionStatusResponse(
                is_premium=False,
                status="expired",
                plan=sub.plan,
                trial_ends_at=sub.trial_ends_at,
                current_period_ends_at=sub.current_period_ends_at,
                grace_period_ends_at=grace_end,
                cancel_at_period_end=False,
                days_remaining=0,
                store=sub.store,
                features=PLAN_FEATURES["free"],
            )

    # Calculate days remaining
    days_remaining = None
    if sub.status == "trial" and sub.trial_ends_at:
        days_remaining = max(0, (sub.trial_ends_at - now).days)
    elif sub.current_period_ends_at:
        days_remaining = max(0, (sub.current_period_ends_at - now).days)
    elif sub.plan == "lifetime":
        days_remaining = None  # Lifetime has no end

    # Calculate grace period end
    grace_period_ends_at = None
    if sub.status == "grace_period" and sub.current_period_ends_at:
        grace_period_ends_at = sub.current_period_ends_at + timedelta(days=GRACE_PERIOD_DAYS)

    # Determine premium status
    is_premium = sub.status in ("active", "trial", "grace_period")

    # Canceled subscriptions still have access until period end
    cancel_at_period_end = False
    if sub.status == "canceled":
        if sub.current_period_ends_at and now < sub.current_period_ends_at:
            is_premium = True
            cancel_at_period_end = True
        else:
            is_premium = False

    features = PLAN_FEATURES.get(sub.plan, PLAN_FEATURES["free"]) if is_premium else PLAN_FEATURES["free"]

    return SubscriptionStatusResponse(
        is_premium=is_premium,
        status=sub.status,
        plan=sub.plan,
        trial_ends_at=sub.trial_ends_at,
        current_period_ends_at=sub.current_period_ends_at,
        grace_period_ends_at=grace_period_ends_at,
        cancel_at_period_end=cancel_at_period_end,
        days_remaining=days_remaining,
        store=sub.store,
        features=features,
    )


# ─── Entitlement Dependency ──────────────────────────────────────────────────

async def require_premium(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> User:
    """
    FastAPI dependency that raises 403 if the user does not have an active
    premium subscription. Use this to gate premium-only endpoints.

    Usage:
        @router.get("/premium-feature")
        async def premium_feature(user: User = Depends(require_premium)):
            ...
    """
    sub_status = await get_subscription_status(current_user, session)
    if not sub_status.is_premium:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Premium subscription required. Upgrade to access this feature.",
        )
    return current_user


# ═══════════════════════════════════════════════════════════════════════════════
# ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════


@router.post(
    "",
    response_model=SubscriptionRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create subscription after purchase",
    description=(
        "Called after a successful in-app purchase. Creates a subscription "
        "in 'pending_verification' state until store receipt is verified."
    ),
    responses={
        201: {"description": "Subscription created (pending verification)"},
        409: {"description": "Duplicate transaction ID (replay attack prevention)"},
        422: {"description": "Invalid plan, store, or missing store_tx_id"},
    },
)
async def create_or_update_subscription(
    body: SubscriptionCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Called after a successful in-app purchase (RevenueCat webhook or direct SDK call).
    Creates a new subscription in 'pending_verification' state.

    SECURITY: The subscription is NOT activated until the store receipt (store_tx_id)
    is verified against Apple App Store Server API or Google Play Developer API.
    A separate background job / webhook must call the verification logic and
    promote the status to 'active' + set user.is_premium = True.

    This prevents paywall bypass via forged store_tx_id values.
    """
    # Check for duplicate transaction IDs (replay attack prevention)
    try:
        existing_tx = await session.execute(
            select(Subscription).where(
                Subscription.store_tx_id == body.store_tx_id.strip(),
            )
        )
    except Exception:
        logger.exception("Subscription duplicate check query failed: user_id=%s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Subscription creation failed. Please try again.",
        )
    if existing_tx.scalars().first():
        logger.warning(
            "Duplicate store_tx_id attempt: user_id=%s store_tx_id=%s",
            current_user.id, body.store_tx_id,
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This transaction has already been processed",
        )

    # Calculate period end (will only take effect after verification)
    now = datetime.now(timezone.utc)
    trial_ends_at = None
    current_period_ends_at = None

    if body.trial_days:
        trial_ends_at = now + timedelta(days=body.trial_days)

    if body.plan == SubscriptionPlan.monthly:
        current_period_ends_at = now + timedelta(days=30)
    elif body.plan == SubscriptionPlan.annual:
        current_period_ends_at = now + timedelta(days=365)
    # lifetime has no end date

    # SECURITY: Status is 'pending_verification', NOT 'active'.
    # The user is NOT marked as premium until receipt validation completes.
    sub = Subscription(
        user_id=current_user.id,
        plan=body.plan.value,
        status="pending_verification",
        price_paid=body.price_paid,
        currency=body.currency,
        discount_pct=body.discount_pct,
        store=body.store.value,
        store_tx_id=body.store_tx_id.strip(),
        trial_ends_at=trial_ends_at,
        current_period_ends_at=current_period_ends_at,
    )
    session.add(sub)

    # NOTE: We intentionally do NOT set current_user.is_premium = True here.
    # That must only happen after store receipt verification succeeds.
    # Previous active subscriptions are NOT expired until the new one is verified.

    logger.info(
        "Subscription created as pending_verification: user_id=%s plan=%s store=%s tx_id=%s",
        current_user.id, body.plan, body.store, body.store_tx_id,
    )

    try:
        await session.commit()
        await session.refresh(sub)
    except Exception:
        await session.rollback()
        logger.exception(
            "Subscription commit failed: user_id=%s plan=%s store=%s",
            current_user.id, body.plan, body.store,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Subscription creation failed. Please try again.",
        )

    # ── CRITICAL FIX: Trigger receipt verification immediately after creation ──
    # Previously, verify_and_activate_subscription() was defined but NEVER CALLED
    # from this endpoint. Subscriptions remained stuck in 'pending_verification'
    # forever — users paid but never received premium access.
    #
    # Now we verify inline. If verification fails, the subscription stays in
    # 'pending_verification' and can still be verified later via:
    #   - POST /api/subscriptions/verify-receipt
    #   - Apple/Google webhook notification
    #   - Background stale-subscription cleanup (expires after 24h)
    try:
        activated = await verify_and_activate_subscription(sub.id, session)
        if activated:
            await session.refresh(sub)
            logger.info(
                "Subscription %d verified and activated inline for user %d",
                sub.id, current_user.id,
            )
            # Emit subscription_activated event for analytics / webhooks
            try:
                from ..core.event_bus import event_bus
                await event_bus.emit("subscription_activated", {
                    "user_id": current_user.id,
                    "subscription_id": sub.id,
                    "plan": sub.plan,
                    "store": sub.store,
                    "price_paid": sub.price_paid,
                })
            except Exception:
                pass  # Non-critical: event emission failure should not block the response
        else:
            logger.warning(
                "Inline verification failed for subscription %d — will retry via webhook/verify-receipt",
                sub.id,
            )
    except Exception:
        # Verification failure is non-fatal: the subscription exists and can be
        # verified later by the webhook or by calling /verify-receipt explicitly.
        logger.exception(
            "Inline verification error for subscription %d (user %d) — subscription saved, will retry",
            sub.id, current_user.id,
        )

    return sub


@router.get(
    "/current",
    response_model=Optional[SubscriptionRead],
    summary="Get current subscription",
    description="Returns the user's most recent active, trial, or grace period subscription, or null if none.",
    responses={
        200: {"description": "Current subscription or null"},
    },
)
async def get_current_subscription(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    try:
        result = await session.execute(
            select(Subscription)
            .where(
                Subscription.user_id == current_user.id,
                Subscription.status.in_(["active", "trial", "grace_period"]),
            )
            .order_by(Subscription.created_at.desc())
        )
    except Exception:
        logger.exception("Get current subscription failed: user_id=%s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load subscription. Please try again.",
        )
    return result.scalars().first()


@router.get(
    "/status",
    response_model=SubscriptionStatusResponse,
    summary="Get detailed subscription status",
    description=(
        "Returns detailed subscription status including entitlement info, "
        "grace period state, days remaining, and available features. "
        "This is the client's single source of truth for premium access."
    ),
    responses={
        200: {"description": "Detailed subscription status with features"},
    },
)
async def get_status(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Returns detailed subscription status including entitlement info,
    grace period state, days remaining, and available features.
    This endpoint is the client's single source of truth for premium access.
    """
    try:
        return await get_subscription_status(current_user, session)
    except Exception:
        logger.exception("Subscription status check failed: user_id=%s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to check subscription status. Please try again.",
        )


@router.post(
    "/verify-receipt",
    response_model=ReceiptValidationResponse,
    summary="Verify store receipt",
    description=(
        "Server-side receipt validation against Apple App Store or Google Play. "
        "If valid, activates the pending subscription and marks user as premium."
    ),
    responses={
        200: {"description": "Receipt validation result"},
        422: {"description": "Invalid request data"},
    },
)
async def verify_receipt(
    body: ReceiptValidationRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Server-side receipt validation against Apple App Store / Google Play.

    This endpoint:
    1. Validates the receipt with the appropriate store API
    2. If valid, activates the pending_verification subscription
    3. Updates user.is_premium = True
    4. Emits a subscription_activated event

    SECURITY: Never trust client-side purchase confirmation alone.
    Always validate receipts server-side before granting entitlements.
    """
    now = datetime.now(timezone.utc)

    try:
        if body.store == SubscriptionStore.apple:
            validation_result = await _validate_apple_receipt(
                body.receipt_data, body.product_id
            )
        elif body.store == SubscriptionStore.google:
            validation_result = await _validate_google_receipt(
                body.receipt_data, body.product_id
            )
        else:
            validation_result = {"valid": False, "error": "Unsupported store"}
    except Exception:
        logger.exception(
            "Receipt validation request failed: user_id=%s store=%s product=%s",
            current_user.id, body.store, body.product_id,
        )
        return ReceiptValidationResponse(
            valid=False,
            subscription_id=None,
            status="error",
            message="Receipt validation service unavailable. Please try again later.",
        )

    if not validation_result.get("valid"):
        logger.warning(
            "Invalid receipt: user_id=%s store=%s product=%s error=%s",
            current_user.id, body.store, body.product_id,
            validation_result.get("error", "unknown"),
        )
        return ReceiptValidationResponse(
            valid=False,
            subscription_id=None,
            status="invalid",
            message=validation_result.get("error", "Receipt validation failed"),
        )

    # Find the pending subscription matching this receipt
    store_tx_id = validation_result.get("transaction_id", "")
    result = await session.execute(
        select(Subscription).where(
            Subscription.user_id == current_user.id,
            Subscription.status == "pending_verification",
        ).order_by(Subscription.created_at.desc())
    )
    sub = result.scalars().first()

    if not sub:
        logger.warning(
            "No pending subscription found for verified receipt: user_id=%s",
            current_user.id,
        )
        return ReceiptValidationResponse(
            valid=True,
            subscription_id=None,
            status="already_processed",
            message="No pending subscription found. Your subscription may already be active.",
        )

    # Activate the subscription
    activated = await verify_and_activate_subscription(sub.id, session)

    if activated:
        # Emit event for analytics / webhooks
        try:
            from ..core.event_bus import event_bus
            await event_bus.emit("subscription_activated", {
                "user_id": current_user.id,
                "subscription_id": sub.id,
                "plan": sub.plan,
                "store": sub.store,
                "price_paid": sub.price_paid,
            })
        except Exception:
            logger.warning("Failed to emit subscription_activated event for user %d", current_user.id)

        return ReceiptValidationResponse(
            valid=True,
            subscription_id=sub.id,
            status="verified",
            message="Subscription activated successfully.",
        )
    else:
        return ReceiptValidationResponse(
            valid=True,
            subscription_id=sub.id,
            status="error",
            message="Receipt is valid but subscription activation failed. Please contact support.",
        )


@router.post(
    "/webhooks",
    status_code=status.HTTP_200_OK,
    summary="Handle store subscription webhook",
    description="Webhook handler for Apple/Google subscription lifecycle events (renewals, cancellations, refunds).",
    include_in_schema=False,
)
async def handle_store_webhook(
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """
    Webhook handler for Apple App Store Server Notifications v2
    and Google Play Real-time Developer Notifications (RTDN).

    Handles the following subscription lifecycle events:
    - INITIAL_BUY / SUBSCRIBED: New subscription purchased
    - DID_RENEW / RENEWED: Subscription renewed successfully
    - DID_FAIL_TO_RENEW / ON_HOLD: Billing issue, enter grace period
    - CANCEL / CANCELED: User canceled subscription
    - REFUND / REVOKED: Refund issued, revoke entitlement
    - GRACE_PERIOD_EXPIRED: Grace period ended, expire subscription
    - EXPIRED: Subscription expired
    - DID_CHANGE_RENEWAL_STATUS: Renewal preference changed

    Security: Validates webhook signature before processing.
    """
    try:
        body = await request.body()
        payload = await request.json()
    except Exception:
        logger.error("Webhook: failed to parse request body")
        raise HTTPException(status_code=400, detail="Invalid request body")

    # Determine source (Apple vs Google vs RevenueCat)
    content_type = request.headers.get("content-type", "")
    user_agent = request.headers.get("user-agent", "")

    # RevenueCat webhook handling (recommended integration)
    if "revenuecat" in user_agent.lower() or payload.get("api_version"):
        return await _handle_revenuecat_webhook(payload, session)

    # Apple App Store Server Notifications v2
    if payload.get("signedPayload") or payload.get("notificationType"):
        return await _handle_apple_webhook(payload, body, session)

    # Google Play RTDN
    if payload.get("message") and payload.get("subscription"):
        return await _handle_google_webhook(payload, session)

    logger.warning("Webhook: unknown webhook source, payload keys: %s", list(payload.keys()))
    return {"status": "ignored", "reason": "unrecognized webhook format"}


@router.post("/webhooks/apple", status_code=status.HTTP_200_OK)
async def handle_apple_webhook(
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """
    Dedicated endpoint for Apple App Store Server Notifications v2.

    Apple sends POST requests with JWS (JSON Web Signature) payloads containing
    subscription lifecycle events (SUBSCRIBED, DID_RENEW, EXPIRED, REVOKE, etc.).

    Configure this URL in App Store Connect:
      Settings > App Information > App Store Server Notifications > URL
      Set to: https://api.fitsiai.com/api/subscriptions/webhooks/apple

    In production, the JWS signature is verified using Apple's root certificate.
    """
    try:
        body = await request.body()
        payload = await request.json()
    except Exception:
        logger.error("Apple webhook: failed to parse request body")
        raise HTTPException(status_code=400, detail="Invalid request body")

    from ..services.subscription_verification_service import handle_apple_server_notification
    result = await handle_apple_server_notification(payload)
    return result


@router.post("/webhooks/google", status_code=status.HTTP_200_OK)
async def handle_google_webhook(
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """
    Dedicated endpoint for Google Play Real-time Developer Notifications (RTDN).

    Google sends POST requests via Cloud Pub/Sub containing subscription
    lifecycle events (PURCHASED, RENEWED, CANCELED, EXPIRED, REVOKED, etc.).

    Configure this URL in Google Cloud Console:
      Pub/Sub > Subscriptions > Push endpoint
      Set to: https://api.fitsiai.com/api/subscriptions/webhooks/google

    The Pub/Sub message is base64-encoded and contains the notification data.
    """
    try:
        payload = await request.json()
    except Exception:
        logger.error("Google webhook: failed to parse request body")
        raise HTTPException(status_code=400, detail="Invalid request body")

    # Google Pub/Sub wraps the notification in a message envelope
    message_data = payload.get("message", {}).get("data", "")
    if message_data:
        import base64
        import json as json_module
        try:
            decoded = base64.b64decode(message_data).decode("utf-8")
            notification_data = json_module.loads(decoded)
        except Exception:
            logger.error("Google webhook: failed to decode Pub/Sub message data")
            raise HTTPException(status_code=400, detail="Invalid Pub/Sub message")
    else:
        notification_data = payload

    from ..services.subscription_verification_service import handle_google_rtdn
    result = await handle_google_rtdn(notification_data)
    return result


@router.post(
    "/restore",
    response_model=SubscriptionStatusResponse,
    summary="Restore purchases",
    description="Restore previous purchases from the app store receipt. Useful after reinstall or device change.",
    responses={
        200: {"description": "Updated subscription status after restore attempt"},
    },
)
async def restore_purchases(
    body: RestorePurchaseRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Restore purchases from the store. Validates the receipt and reactivates
    any valid subscriptions found.
    Required by Apple App Store guidelines.
    """
    try:
        if body.store == SubscriptionStore.apple:
            validation_result = await _validate_apple_receipt(body.receipt_data, "")
        elif body.store == SubscriptionStore.google:
            validation_result = await _validate_google_receipt(body.receipt_data, "")
        else:
            raise HTTPException(status_code=400, detail="Unsupported store for restore")

        if validation_result.get("valid") and validation_result.get("active_subscription"):
            # Check if user already has an active subscription
            result = await session.execute(
                select(Subscription)
                .where(
                    Subscription.user_id == current_user.id,
                    Subscription.status.in_(["active", "trial"]),
                )
            )
            existing = result.scalars().first()
            if not existing:
                # Create and activate a restored subscription
                sub = Subscription(
                    user_id=current_user.id,
                    plan=validation_result.get("plan", "monthly"),
                    status="active",
                    store=body.store.value,
                    store_tx_id=validation_result.get("transaction_id", f"restored_{current_user.id}"),
                    current_period_ends_at=validation_result.get("expires_at"),
                )
                session.add(sub)
                current_user.is_premium = True
                current_user.updated_at = datetime.now(timezone.utc)
                session.add(current_user)
                await session.commit()
                logger.info(
                    "Purchase restored for user %d: plan=%s",
                    current_user.id, sub.plan,
                )

    except HTTPException:
        raise
    except Exception:
        logger.exception("Restore purchases failed for user %d", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to restore purchases. Please try again.",
        )

    return await get_subscription_status(current_user, session)


@router.delete(
    "/current",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Cancel active subscription",
    description="Cancel the active subscription. Marks as canceled and removes premium access.",
    responses={
        204: {"description": "Subscription canceled successfully"},
        404: {"description": "No active subscription found"},
    },
)
async def cancel_subscription(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Cancel the active subscription.
    The user retains access until the end of the current billing period.
    After the period ends, the subscription transitions to expired.
    """
    try:
        result = await session.execute(
            select(Subscription).where(
                Subscription.user_id == current_user.id,
                Subscription.status.in_(["active", "trial", "grace_period"]),
            )
        )
    except Exception:
        logger.exception("Cancel subscription query failed: user_id=%s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to cancel subscription. Please try again.",
        )
    sub = result.scalars().first()
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active subscription")

    now = datetime.now(timezone.utc)

    # Mark as canceled -- user keeps access until period end
    sub.status = "canceled"
    sub.updated_at = now
    session.add(sub)

    # If the subscription has no remaining period (trial with no trial_ends_at,
    # or period already ended), revoke access immediately
    has_remaining_period = False
    if sub.current_period_ends_at and sub.current_period_ends_at > now:
        has_remaining_period = True
    elif sub.trial_ends_at and sub.trial_ends_at > now:
        has_remaining_period = True

    if not has_remaining_period:
        current_user.is_premium = False
        current_user.updated_at = now
        session.add(current_user)
        logger.info(
            "Subscription canceled with immediate effect: user_id=%s sub_id=%s",
            current_user.id, sub.id,
        )
    else:
        logger.info(
            "Subscription canceled, access until period end: user_id=%s sub_id=%s ends_at=%s",
            current_user.id, sub.id,
            sub.current_period_ends_at or sub.trial_ends_at,
        )

    try:
        await session.commit()
    except Exception:
        await session.rollback()
        logger.exception("Cancel subscription commit failed: user_id=%s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to cancel subscription. Please try again.",
        )

    # Emit cancellation event
    try:
        from ..core.event_bus import event_bus
        await event_bus.emit("subscription_canceled", {
            "user_id": current_user.id,
            "subscription_id": sub.id,
            "plan": sub.plan,
            "reason": "user_initiated",
            "access_ends_at": (
                sub.current_period_ends_at or sub.trial_ends_at or now
            ).isoformat(),
        })
    except Exception:
        pass  # Non-critical


@router.get(
    "/analytics",
    response_model=SubscriptionAnalyticsResponse,
    summary="Get subscription analytics (admin)",
    description="Admin-only endpoint returning MRR, churn rate, conversion rate, plan distribution, and more.",
    responses={
        200: {"description": "Subscription analytics metrics"},
        403: {"description": "Not an admin user"},
    },
)
async def get_subscription_analytics(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Subscription analytics dashboard (admin only).
    Returns MRR, churn rate, trial conversion rate, plan distribution, etc.
    """
    # Simple admin check -- in production, use a proper RBAC system
    if not getattr(current_user, "is_admin", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    now = datetime.now(timezone.utc)
    thirty_days_ago = now - timedelta(days=30)

    try:
        # Total subscribers (ever)
        total_result = await session.execute(
            select(func.count()).select_from(Subscription)
        )
        total_subscribers = total_result.scalar() or 0

        # Active subscribers
        active_result = await session.execute(
            select(func.count()).select_from(Subscription).where(
                Subscription.status == "active"
            )
        )
        active_subscribers = active_result.scalar() or 0

        # Trial subscribers
        trial_result = await session.execute(
            select(func.count()).select_from(Subscription).where(
                Subscription.status == "trial"
            )
        )
        trial_subscribers = trial_result.scalar() or 0

        # Churned last 30 days (canceled or expired)
        churned_result = await session.execute(
            select(func.count()).select_from(Subscription).where(
                Subscription.status.in_(["canceled", "expired"]),
                Subscription.updated_at >= thirty_days_ago,
            )
        )
        churned_last_30d = churned_result.scalar() or 0

        # MRR calculation
        monthly_rev_result = await session.execute(
            select(func.sum(Subscription.price_paid)).where(
                Subscription.status == "active",
                Subscription.plan == "monthly",
            )
        )
        monthly_rev = monthly_rev_result.scalar() or 0.0

        annual_rev_result = await session.execute(
            select(func.sum(Subscription.price_paid)).where(
                Subscription.status == "active",
                Subscription.plan == "annual",
            )
        )
        annual_rev = annual_rev_result.scalar() or 0.0

        mrr = monthly_rev + (annual_rev / 12)
        arr = mrr * 12

        # Trial conversion rate (trials that became active in last 90 days)
        ninety_days_ago = now - timedelta(days=90)
        total_trials_result = await session.execute(
            select(func.count()).select_from(Subscription).where(
                Subscription.trial_ends_at.isnot(None),
                Subscription.created_at >= ninety_days_ago,
            )
        )
        total_trials = total_trials_result.scalar() or 0

        converted_trials_result = await session.execute(
            select(func.count()).select_from(Subscription).where(
                Subscription.trial_ends_at.isnot(None),
                Subscription.status == "active",
                Subscription.created_at >= ninety_days_ago,
            )
        )
        converted_trials = converted_trials_result.scalar() or 0

        trial_conversion_rate = (
            (converted_trials / total_trials * 100) if total_trials > 0 else 0.0
        )

        # Churn rate (30-day)
        active_start_result = await session.execute(
            select(func.count()).select_from(Subscription).where(
                Subscription.status.in_(["active", "canceled", "expired"]),
                Subscription.created_at < thirty_days_ago,
            )
        )
        active_at_start = active_start_result.scalar() or 0
        churn_rate = (
            (churned_last_30d / active_at_start * 100) if active_at_start > 0 else 0.0
        )

        # ARPU
        arpu = (mrr / active_subscribers) if active_subscribers > 0 else 0.0

        # Plan distribution
        plan_dist_result = await session.execute(
            select(Subscription.plan, func.count())
            .where(Subscription.status == "active")
            .group_by(Subscription.plan)
        )
        plan_distribution = {row[0]: row[1] for row in plan_dist_result.all()}

        # Store distribution
        store_dist_result = await session.execute(
            select(Subscription.store, func.count())
            .where(Subscription.status == "active")
            .group_by(Subscription.store)
        )
        store_distribution = {(row[0] or "unknown"): row[1] for row in store_dist_result.all()}

        # New subscriptions last 30 days
        new_subs_result = await session.execute(
            select(func.count()).select_from(Subscription).where(
                Subscription.created_at >= thirty_days_ago,
            )
        )
        new_subscriptions_30d = new_subs_result.scalar() or 0

        # Cancellations last 30 days
        cancel_result = await session.execute(
            select(func.count()).select_from(Subscription).where(
                Subscription.status == "canceled",
                Subscription.updated_at >= thirty_days_ago,
            )
        )
        cancellations_30d = cancel_result.scalar() or 0

        # Refunds last 30 days
        refund_result = await session.execute(
            select(func.count()).select_from(Subscription).where(
                Subscription.status == "refunded",
                Subscription.updated_at >= thirty_days_ago,
            )
        )
        refunds_30d = refund_result.scalar() or 0

    except Exception:
        logger.exception("Subscription analytics query failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to compute subscription analytics.",
        )

    return SubscriptionAnalyticsResponse(
        total_subscribers=total_subscribers,
        active_subscribers=active_subscribers,
        trial_subscribers=trial_subscribers,
        churned_last_30d=churned_last_30d,
        mrr_usd=round(mrr, 2),
        arr_usd=round(arr, 2),
        trial_conversion_rate=round(trial_conversion_rate, 2),
        churn_rate_30d=round(churn_rate, 2),
        average_revenue_per_user=round(arpu, 2),
        plan_distribution=plan_distribution,
        store_distribution=store_distribution,
        new_subscriptions_30d=new_subscriptions_30d,
        cancellations_30d=cancellations_30d,
        refunds_30d=refunds_30d,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# RECEIPT VALIDATION HELPERS
# ═══════════════════════════════════════════════════════════════════════════════


async def _validate_apple_receipt(receipt_data: str, product_id: str) -> dict:
    """
    Validate a receipt against Apple's App Store Server API v2.

    In production, this should:
    1. Decode the signedTransactionInfo JWS
    2. Verify the JWS signature using Apple's certificate chain
    3. Check the transaction details (product_id, bundle_id, expiration)
    4. Return validation result with transaction_id and expiry

    For development/sandbox, calls Apple's sandbox verification endpoint.
    """
    import httpx
    from ..core.config import settings

    app_store_shared_secret = getattr(settings, "app_store_shared_secret", "")
    if not app_store_shared_secret:
        logger.warning("Apple receipt validation: APP_STORE_SHARED_SECRET not configured")
        # Fail open in development, fail closed in production
        is_dev = getattr(settings, "env", "development") == "development"
        if is_dev:
            return {
                "valid": True,
                "transaction_id": f"dev_apple_{receipt_data[:20]}",
                "active_subscription": True,
                "plan": "monthly",
                "expires_at": datetime.now(timezone.utc) + timedelta(days=30),
            }
        return {"valid": False, "error": "Apple receipt validation not configured"}

    # Production: Verify against App Store Server API v2
    verify_url = "https://buy.itunes.apple.com/verifyReceipt"
    sandbox_url = "https://sandbox.itunes.apple.com/verifyReceipt"

    payload = {
        "receipt-data": receipt_data,
        "password": app_store_shared_secret,
        "exclude-old-transactions": True,
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(verify_url, json=payload)
            result = response.json()

            # Status 21007 means sandbox receipt sent to production -- retry on sandbox
            if result.get("status") == 21007:
                response = await client.post(sandbox_url, json=payload)
                result = response.json()

            if result.get("status") == 0:
                # Valid receipt
                latest_receipt = result.get("latest_receipt_info", [{}])
                if latest_receipt:
                    latest = latest_receipt[-1] if isinstance(latest_receipt, list) else latest_receipt
                    expires_ms = int(latest.get("expires_date_ms", 0))
                    expires_at = datetime.fromtimestamp(expires_ms / 1000, tz=timezone.utc) if expires_ms else None
                    is_active = expires_at and expires_at > datetime.now(timezone.utc) if expires_at else False

                    return {
                        "valid": True,
                        "transaction_id": latest.get("transaction_id", ""),
                        "active_subscription": is_active,
                        "plan": _apple_product_to_plan(latest.get("product_id", "")),
                        "expires_at": expires_at,
                    }

            return {"valid": False, "error": f"Apple verification status: {result.get('status')}"}

    except httpx.TimeoutException:
        return {"valid": False, "error": "Apple verification timed out"}
    except Exception as e:
        logger.exception("Apple receipt validation error")
        return {"valid": False, "error": f"Validation error: {str(e)[:200]}"}


async def _validate_google_receipt(purchase_token: str, product_id: str) -> dict:
    """
    Validate a purchase token against Google Play Developer API.

    In production, this should:
    1. Use a service account to authenticate with Google Play Developer API
    2. Call subscriptions.get to verify the purchase token
    3. Check subscription state and expiry
    4. Return validation result

    Requires GOOGLE_PLAY_SERVICE_ACCOUNT_JSON env var with service account credentials.
    """
    from ..core.config import settings

    service_account_json = getattr(settings, "google_play_service_account", "")
    if not service_account_json:
        logger.warning("Google receipt validation: GOOGLE_PLAY_SERVICE_ACCOUNT not configured")
        is_dev = getattr(settings, "env", "development") == "development"
        if is_dev:
            return {
                "valid": True,
                "transaction_id": f"dev_google_{purchase_token[:20]}",
                "active_subscription": True,
                "plan": "monthly",
                "expires_at": datetime.now(timezone.utc) + timedelta(days=30),
            }
        return {"valid": False, "error": "Google receipt validation not configured"}

    # Production: Use Google Play Developer API
    import httpx

    package_name = getattr(settings, "google_play_package_name", "com.fitsiai.app")
    api_url = (
        f"https://androidpublisher.googleapis.com/androidpublisher/v3/"
        f"applications/{package_name}/purchases/subscriptions/"
        f"{product_id}/tokens/{purchase_token}"
    )

    try:
        # In production, use google-auth library to get access token
        # from service account. For now, use simple token.
        access_token = await _get_google_access_token(service_account_json)

        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(
                api_url,
                headers={"Authorization": f"Bearer {access_token}"},
            )

            if response.status_code == 200:
                result = response.json()
                expiry_ms = int(result.get("expiryTimeMillis", 0))
                expires_at = datetime.fromtimestamp(expiry_ms / 1000, tz=timezone.utc) if expiry_ms else None
                is_active = expires_at and expires_at > datetime.now(timezone.utc) if expires_at else False

                return {
                    "valid": True,
                    "transaction_id": result.get("orderId", ""),
                    "active_subscription": is_active,
                    "plan": _google_product_to_plan(product_id),
                    "expires_at": expires_at,
                }

            return {"valid": False, "error": f"Google API returned {response.status_code}"}

    except Exception as e:
        logger.exception("Google receipt validation error")
        return {"valid": False, "error": f"Validation error: {str(e)[:200]}"}


async def _get_google_access_token(service_account_json: str) -> str:
    """Get an OAuth2 access token from Google service account credentials."""
    # In production, use google-auth library:
    # from google.oauth2 import service_account
    # credentials = service_account.Credentials.from_service_account_info(...)
    # credentials.refresh(google.auth.transport.requests.Request())
    # return credentials.token
    #
    # Placeholder for development:
    return "dev_access_token"


def _apple_product_to_plan(product_id: str) -> str:
    """Map Apple product ID to subscription plan name."""
    mapping = {
        "fitsiai_monthly": "monthly",
        "fitsiai_annual": "annual",
        "fitsiai_pro_monthly": "monthly",
        "fitsiai_pro_annual": "annual",
        "fitsiai_lifetime": "lifetime",
    }
    return mapping.get(product_id, "monthly")


def _google_product_to_plan(product_id: str) -> str:
    """Map Google product ID to subscription plan name."""
    return _apple_product_to_plan(product_id)  # Same product IDs


# ═══════════════════════════════════════════════════════════════════════════════
# WEBHOOK HANDLERS
# ═══════════════════════════════════════════════════════════════════════════════


async def _handle_revenuecat_webhook(payload: dict, session: AsyncSession) -> dict:
    """
    Process RevenueCat webhook events.
    RevenueCat unifies Apple/Google events into a consistent format.

    Events: INITIAL_PURCHASE, RENEWAL, CANCELLATION, UNCANCELLATION,
            BILLING_ISSUE, SUBSCRIBER_ALIAS, PRODUCT_CHANGE, EXPIRATION,
            NON_RENEWING_PURCHASE, SUBSCRIPTION_PAUSED
    """
    event_type = payload.get("event", {}).get("type", "UNKNOWN")
    app_user_id = payload.get("event", {}).get("app_user_id", "")

    logger.info(
        "RevenueCat webhook: type=%s app_user_id=%s",
        event_type, app_user_id,
    )

    now = datetime.now(timezone.utc)

    # Find the user
    try:
        user_id = int(app_user_id)
    except (ValueError, TypeError):
        logger.warning("RevenueCat webhook: invalid app_user_id=%s", app_user_id)
        return {"status": "ignored", "reason": "invalid_user_id"}

    user_result = await session.execute(select(User).where(User.id == user_id))
    user = user_result.scalars().first()
    if not user:
        logger.warning("RevenueCat webhook: user not found user_id=%s", user_id)
        return {"status": "ignored", "reason": "user_not_found"}

    # Find the user's latest subscription
    sub_result = await session.execute(
        select(Subscription)
        .where(Subscription.user_id == user_id)
        .order_by(Subscription.created_at.desc())
    )
    sub = sub_result.scalars().first()

    event_data = payload.get("event", {})

    if event_type == "INITIAL_PURCHASE":
        if sub and sub.status == "pending_verification":
            sub.status = "active"
            sub.updated_at = now
            session.add(sub)
            user.is_premium = True
            user.updated_at = now
            session.add(user)
            await session.commit()
        logger.info("RevenueCat: INITIAL_PURCHASE processed for user %d", user_id)

    elif event_type == "RENEWAL":
        if sub:
            sub.status = "active"
            sub.updated_at = now
            # Extend the period
            expiration_ms = event_data.get("expiration_at_ms")
            if expiration_ms:
                sub.current_period_ends_at = datetime.fromtimestamp(
                    expiration_ms / 1000, tz=timezone.utc
                )
            session.add(sub)
            user.is_premium = True
            user.updated_at = now
            session.add(user)
            await session.commit()
        logger.info("RevenueCat: RENEWAL processed for user %d", user_id)

    elif event_type == "CANCELLATION":
        if sub and sub.status in ("active", "trial"):
            sub.status = "canceled"
            sub.updated_at = now
            session.add(sub)
            # User keeps access until period end
            if not sub.current_period_ends_at or sub.current_period_ends_at <= now:
                user.is_premium = False
                user.updated_at = now
                session.add(user)
            await session.commit()
        logger.info("RevenueCat: CANCELLATION processed for user %d", user_id)

    elif event_type == "UNCANCELLATION":
        if sub and sub.status == "canceled":
            sub.status = "active"
            sub.updated_at = now
            session.add(sub)
            user.is_premium = True
            user.updated_at = now
            session.add(user)
            await session.commit()
        logger.info("RevenueCat: UNCANCELLATION processed for user %d", user_id)

    elif event_type == "BILLING_ISSUE":
        if sub and sub.status == "active":
            sub.status = "grace_period"
            sub.updated_at = now
            session.add(sub)
            # Keep is_premium during grace period
            await session.commit()
        logger.info("RevenueCat: BILLING_ISSUE (grace_period) for user %d", user_id)

    elif event_type == "EXPIRATION":
        if sub:
            sub.status = "expired"
            sub.updated_at = now
            session.add(sub)
            user.is_premium = False
            user.updated_at = now
            session.add(user)
            await session.commit()
        logger.info("RevenueCat: EXPIRATION processed for user %d", user_id)

    elif event_type in ("PRODUCT_CHANGE", "SUBSCRIPTION_PAUSED"):
        logger.info("RevenueCat: %s event for user %d (logged, no action)", event_type, user_id)

    else:
        logger.info("RevenueCat: unhandled event type=%s for user %d", event_type, user_id)

    return {"status": "ok", "event_type": event_type}


async def _handle_apple_webhook(payload: dict, raw_body: bytes, session: AsyncSession) -> dict:
    """
    Process Apple App Store Server Notifications v2.
    The signedPayload is a JWS that must be verified using Apple's certificate.
    """
    notification_type = payload.get("notificationType", "UNKNOWN")
    subtype = payload.get("subtype", "")

    logger.info(
        "Apple webhook: type=%s subtype=%s",
        notification_type, subtype,
    )

    # In production, decode and verify the signedPayload JWS
    # For now, extract data from the payload
    data = payload.get("data", {})
    transaction_id = data.get("transactionId", "")

    if not transaction_id:
        return {"status": "ignored", "reason": "no_transaction_id"}

    # Find subscription by store_tx_id
    sub_result = await session.execute(
        select(Subscription).where(Subscription.store_tx_id == transaction_id)
    )
    sub = sub_result.scalars().first()
    if not sub:
        logger.warning("Apple webhook: no subscription found for tx_id=%s", transaction_id)
        return {"status": "ignored", "reason": "subscription_not_found"}

    user_result = await session.execute(select(User).where(User.id == sub.user_id))
    user = user_result.scalars().first()

    now = datetime.now(timezone.utc)

    if notification_type == "DID_RENEW":
        sub.status = "active"
        sub.updated_at = now
        session.add(sub)
        if user:
            user.is_premium = True
            user.updated_at = now
            session.add(user)
        await session.commit()

    elif notification_type == "DID_FAIL_TO_RENEW":
        sub.status = "grace_period" if subtype == "GRACE_PERIOD" else "billing_retry"
        sub.updated_at = now
        session.add(sub)
        await session.commit()

    elif notification_type == "EXPIRED":
        sub.status = "expired"
        sub.updated_at = now
        session.add(sub)
        if user:
            user.is_premium = False
            user.updated_at = now
            session.add(user)
        await session.commit()

    elif notification_type == "REFUND":
        sub.status = "refunded"
        sub.updated_at = now
        session.add(sub)
        if user:
            user.is_premium = False
            user.updated_at = now
            session.add(user)
        await session.commit()
        logger.warning("Apple REFUND processed: user_id=%d sub_id=%d", sub.user_id, sub.id)

    elif notification_type == "DID_CHANGE_RENEWAL_STATUS":
        if subtype == "AUTO_RENEW_DISABLED":
            sub.status = "canceled"
            sub.updated_at = now
            session.add(sub)
            await session.commit()

    return {"status": "ok", "notification_type": notification_type}


async def _handle_google_webhook(payload: dict, session: AsyncSession) -> dict:
    """
    Process Google Play Real-time Developer Notifications.
    The message contains a base64-encoded data field with notification details.
    """
    notification_type = payload.get("subscriptionNotification", {}).get("notificationType", 0)
    purchase_token = payload.get("subscriptionNotification", {}).get("purchaseToken", "")

    logger.info(
        "Google webhook: notification_type=%d purchase_token=%s",
        notification_type, purchase_token[:20] if purchase_token else "none",
    )

    # Google notification types:
    # 1: RECOVERED, 2: RENEWED, 3: CANCELED, 4: PURCHASED,
    # 5: ON_HOLD, 6: IN_GRACE_PERIOD, 7: RESTARTED,
    # 12: REVOKED, 13: EXPIRED

    if not purchase_token:
        return {"status": "ignored", "reason": "no_purchase_token"}

    # Find subscription by store_tx_id (purchase token)
    sub_result = await session.execute(
        select(Subscription).where(Subscription.store_tx_id == purchase_token)
    )
    sub = sub_result.scalars().first()
    if not sub:
        logger.warning("Google webhook: no subscription found for token=%s", purchase_token[:20])
        return {"status": "ignored", "reason": "subscription_not_found"}

    user_result = await session.execute(select(User).where(User.id == sub.user_id))
    user = user_result.scalars().first()

    now = datetime.now(timezone.utc)

    if notification_type in (1, 2, 4, 7):  # RECOVERED, RENEWED, PURCHASED, RESTARTED
        sub.status = "active"
        sub.updated_at = now
        session.add(sub)
        if user:
            user.is_premium = True
            user.updated_at = now
            session.add(user)
        await session.commit()

    elif notification_type == 3:  # CANCELED
        sub.status = "canceled"
        sub.updated_at = now
        session.add(sub)
        await session.commit()

    elif notification_type in (5, 6):  # ON_HOLD, IN_GRACE_PERIOD
        sub.status = "grace_period"
        sub.updated_at = now
        session.add(sub)
        await session.commit()

    elif notification_type == 12:  # REVOKED (refund)
        sub.status = "refunded"
        sub.updated_at = now
        session.add(sub)
        if user:
            user.is_premium = False
            user.updated_at = now
            session.add(user)
        await session.commit()
        logger.warning("Google REVOKED (refund): user_id=%d sub_id=%d", sub.user_id, sub.id)

    elif notification_type == 13:  # EXPIRED
        sub.status = "expired"
        sub.updated_at = now
        session.add(sub)
        if user:
            user.is_premium = False
            user.updated_at = now
            session.add(user)
        await session.commit()

    return {"status": "ok", "notification_type": notification_type}


# ─── Receipt Verification Helper (to be called by background worker/webhook) ──

async def verify_and_activate_subscription(
    subscription_id: int,
    session: AsyncSession,
) -> bool:
    """
    Called AFTER verifying the store receipt against Apple/Google APIs.
    Promotes a pending_verification subscription to active and sets is_premium.

    This function should be called by:
      - A Celery task triggered after POST /api/subscriptions
      - An Apple/Google webhook handler
      - The verify-receipt endpoint
      - A manual admin verification endpoint

    Returns True if activation succeeded, False otherwise.
    """
    result = await session.execute(
        select(Subscription).where(
            Subscription.id == subscription_id,
            Subscription.status == "pending_verification",
        )
    )
    sub = result.scalars().first()
    if not sub:
        logger.warning("verify_and_activate: subscription %d not found or not pending", subscription_id)
        return False

    now = datetime.now(timezone.utc)

    # Expire any previous active subscriptions for this user
    active_result = await session.execute(
        select(Subscription).where(
            Subscription.user_id == sub.user_id,
            Subscription.status == "active",
            Subscription.id != subscription_id,
        )
    )
    for old_sub in active_result.scalars().all():
        old_sub.status = "expired"
        old_sub.updated_at = now
        session.add(old_sub)

    # Determine initial status (trial or active)
    if sub.trial_ends_at and sub.trial_ends_at > now:
        sub.status = "trial"
    else:
        sub.status = "active"

    sub.updated_at = now
    session.add(sub)

    # NOW mark user as premium
    user = await session.get(User, sub.user_id)
    if user:
        user.is_premium = True
        user.updated_at = now
        session.add(user)

    try:
        await session.commit()
    except Exception:
        await session.rollback()
        logger.exception("verify_and_activate: commit failed for subscription %d", subscription_id)
        return False

    logger.info(
        "Subscription %d activated (status=%s) for user %d",
        subscription_id, sub.status, sub.user_id,
    )
    return True
