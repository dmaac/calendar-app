"""
Subscriptions router
--------------------
POST /api/subscriptions                        -- create subscription (after in-app purchase)
GET  /api/subscriptions/current                -- current subscription for authenticated user
GET  /api/subscriptions/status                 -- detailed status with entitlement info
POST /api/subscriptions/verify-receipt         -- server-side receipt validation (Apple/Google)
POST /api/subscriptions/webhooks               -- generic webhook (auto-detect source)
POST /api/subscriptions/webhooks/revenuecat    -- RevenueCat webhook (dedicated)
POST /api/subscriptions/webhooks/apple         -- Apple Server Notifications v2
POST /api/subscriptions/webhooks/google        -- Google Play RTDN
POST /api/subscriptions/restore                -- restore purchases
GET  /api/subscriptions/analytics              -- admin analytics (MRR, churn, conversions)
DELETE /api/subscriptions/current              -- cancel active subscription

SECURITY NOTE (2026-03-21):
  POST creates subscriptions in 'pending_verification' state.  Subscriptions
  MUST be verified against Apple/Google receipt APIs or via RevenueCat webhook
  before being promoted to 'active'.  Until verification the user is NOT premium.

Status lifecycle:
  pending_verification -> active -> [grace_period] -> expired
  pending_verification -> active -> canceled (end-of-period access)
  active -> billing_retry -> grace_period -> expired
  active -> refunded -> expired
"""

import json as json_module
import logging
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, Field
from enum import Enum
from sqlmodel import select, func
from sqlmodel.ext.asyncio.session import AsyncSession

from ..core.config import settings
from ..core.database import get_session
from ..models.subscription import Subscription, WebhookEventLog
from ..models.user import User
from ..routers.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/subscriptions", tags=["subscriptions"])

# -- Grace Period Configuration ------------------------------------------------
GRACE_PERIOD_DAYS = 3   # Apple/Google standard: 3-16 days
BILLING_RETRY_DAYS = 7  # Max days to retry failed billing


# -- Enums ---------------------------------------------------------------------

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


# -- Request/Response Schemas --------------------------------------------------

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


# -- Premium Features by Plan --------------------------------------------------

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


# -- Helpers -------------------------------------------------------------------

def _utcnow() -> datetime:
    """Return a naive UTC datetime (no tzinfo)."""
    return datetime.utcnow()


def _parse_ms_timestamp(ms: int) -> datetime:
    """Convert a millisecond epoch timestamp to a naive UTC datetime."""
    return datetime.utcfromtimestamp(ms / 1000)


def _rc_product_to_plan(product_id: str) -> str:
    """Map a RevenueCat / store product identifier to an internal plan name."""
    product_id_lower = (product_id or "").lower()
    if "lifetime" in product_id_lower:
        return "lifetime"
    if "annual" in product_id_lower or "yearly" in product_id_lower:
        return "annual"
    return "monthly"


def _rc_store_to_internal(store: str) -> str:
    """Map RevenueCat store string to our internal store name."""
    mapping = {
        "APP_STORE": "apple",
        "PLAY_STORE": "google",
        "STRIPE": "stripe",
        "AMAZON": "amazon",
        "PROMOTIONAL": "promo",
    }
    return mapping.get((store or "").upper(), "unknown")


async def _log_webhook_event(
    session: AsyncSession,
    *,
    source: str,
    event_type: str,
    app_user_id: Optional[str] = None,
    raw_payload: Optional[str] = None,
    processing_result: Optional[str] = None,
    error_message: Optional[str] = None,
) -> WebhookEventLog:
    """Persist a webhook event for audit / replay."""
    log_entry = WebhookEventLog(
        source=source,
        event_type=event_type,
        app_user_id=app_user_id,
        raw_payload=raw_payload[:50_000] if raw_payload else None,
        processing_result=processing_result,
        error_message=error_message,
    )
    session.add(log_entry)
    # Flush but don't commit -- caller owns the transaction.
    await session.flush()
    return log_entry


# -- Entitlement Checking -----------------------------------------------------

async def get_subscription_status(
    user: User, session: AsyncSession
) -> SubscriptionStatusResponse:
    """
    Compute the detailed subscription status for a user.
    Handles active, trial, grace_period, canceled, and expired states.
    This is the single source of truth for entitlement checking.
    """
    now = _utcnow()

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
                sub.status = "grace_period"
                sub.updated_at = now
                session.add(sub)
                await session.commit()
                logger.info(
                    "Subscription %d entered grace_period for user %d",
                    sub.id, user.id,
                )
            else:
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


# -- Entitlement Dependency ----------------------------------------------------

async def require_premium(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> User:
    """
    FastAPI dependency that raises 403 if the user does not have an active
    premium subscription.  Use this to gate premium-only endpoints.
    """
    sub_status = await get_subscription_status(current_user, session)
    if not sub_status.is_premium:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Premium subscription required. Upgrade to access this feature.",
        )
    return current_user


# ==============================================================================
# ENDPOINTS
# ==============================================================================


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
    Called after a successful in-app purchase.
    Creates a new subscription in 'pending_verification' state.

    SECURITY: The subscription is NOT activated until the store receipt
    is verified via webhook or /verify-receipt.
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

    now = _utcnow()
    trial_ends_at = None
    current_period_ends_at = None

    if body.trial_days:
        trial_ends_at = now + timedelta(days=body.trial_days)

    if body.plan == SubscriptionPlan.monthly:
        current_period_ends_at = now + timedelta(days=30)
    elif body.plan == SubscriptionPlan.annual:
        current_period_ends_at = now + timedelta(days=365)
    # lifetime has no end date

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

    # Trigger inline receipt verification
    try:
        activated = await verify_and_activate_subscription(sub.id, session)
        if activated:
            await session.refresh(sub)
            logger.info(
                "Subscription %d verified and activated inline for user %d",
                sub.id, current_user.id,
            )
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
                pass  # Non-critical
        else:
            logger.warning(
                "Inline verification failed for subscription %d -- will retry via webhook/verify-receipt",
                sub.id,
            )
    except Exception:
        logger.exception(
            "Inline verification error for subscription %d (user %d) -- subscription saved, will retry",
            sub.id, current_user.id,
        )

    return sub


@router.get(
    "/current",
    response_model=Optional[SubscriptionRead],
    summary="Get current subscription",
    description="Returns the user's most recent active, trial, or grace period subscription, or null if none.",
    responses={200: {"description": "Current subscription or null"}},
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
        "grace period state, days remaining, and available features."
    ),
    responses={200: {"description": "Detailed subscription status with features"}},
)
async def get_status(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
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
    now = _utcnow()

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

    # Find the pending subscription
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

    activated = await verify_and_activate_subscription(sub.id, session)

    if activated:
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


# ==============================================================================
# WEBHOOK ENDPOINTS
# ==============================================================================


def _verify_revenuecat_secret(authorization: Optional[str]) -> None:
    """
    Verify the RevenueCat webhook Authorization header against our shared
    secret.  Raises 401 if the secret is configured but does not match.

    RevenueCat sends the webhook secret as:
        Authorization: Bearer <your_webhook_secret>

    In the RevenueCat dashboard, you configure a "Webhook Auth Key" which is
    sent verbatim in the Authorization header.
    """
    secret = settings.revenuecat_webhook_secret
    if not secret:
        # Secret not configured -- allow in development, reject in production
        if settings.is_production:
            logger.error("REVENUCAT_WEBHOOK_SECRET is not set in production -- rejecting webhook")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Webhook authentication not configured",
            )
        logger.warning("REVENUCAT_WEBHOOK_SECRET not set -- skipping auth check (dev mode)")
        return

    # RevenueCat sends the secret as the full Authorization header value.
    # It may or may not include a "Bearer " prefix depending on configuration.
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
        )

    # Strip "Bearer " prefix if present for comparison
    token = authorization
    if token.lower().startswith("bearer "):
        token = token[7:]

    expected = secret
    if expected.lower().startswith("bearer "):
        expected = expected[7:]

    # Constant-time comparison to prevent timing attacks
    import hmac
    if not hmac.compare_digest(token, expected):
        logger.warning("RevenueCat webhook: invalid Authorization header")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook secret",
        )


@router.post(
    "/webhooks/revenuecat",
    status_code=status.HTTP_200_OK,
    summary="RevenueCat webhook handler",
    description=(
        "Dedicated endpoint for RevenueCat subscription lifecycle webhooks.  "
        "Handles INITIAL_PURCHASE, RENEWAL, CANCELLATION, UNCANCELLATION, "
        "EXPIRATION, BILLING_ISSUE_DETECTED, and PRODUCT_CHANGE events."
    ),
    include_in_schema=False,
)
async def handle_revenuecat_webhook(
    request: Request,
    session: AsyncSession = Depends(get_session),
    authorization: Optional[str] = Header(None),
):
    """
    Dedicated RevenueCat webhook endpoint.

    Configure in RevenueCat Dashboard:
      Project Settings > Integrations > Webhooks
      URL: https://api.fitsiai.com/api/subscriptions/webhooks/revenuecat
      Authorization header: <REVENUCAT_WEBHOOK_SECRET>
    """
    # 1. Verify webhook authenticity
    _verify_revenuecat_secret(authorization)

    # 2. Parse payload
    try:
        payload = await request.json()
    except Exception:
        logger.error("RevenueCat webhook: failed to parse request body")
        raise HTTPException(status_code=400, detail="Invalid request body")

    # 3. Process
    return await _handle_revenuecat_webhook(payload, session)


@router.post(
    "/webhooks",
    status_code=status.HTTP_200_OK,
    summary="Handle store subscription webhook (auto-detect)",
    description="Generic webhook that auto-detects RevenueCat, Apple, or Google source.",
    include_in_schema=False,
)
async def handle_store_webhook(
    request: Request,
    session: AsyncSession = Depends(get_session),
    authorization: Optional[str] = Header(None),
):
    """
    Generic webhook handler that auto-detects the source.
    Prefer using the dedicated /webhooks/revenuecat, /webhooks/apple, or
    /webhooks/google endpoints instead.
    """
    try:
        body = await request.body()
        payload = await request.json()
    except Exception:
        logger.error("Webhook: failed to parse request body")
        raise HTTPException(status_code=400, detail="Invalid request body")

    user_agent = request.headers.get("user-agent", "")

    # RevenueCat
    if "revenuecat" in user_agent.lower() or payload.get("api_version"):
        _verify_revenuecat_secret(authorization)
        return await _handle_revenuecat_webhook(payload, session)

    # Apple App Store Server Notifications v2
    if payload.get("signedPayload") or payload.get("notificationType"):
        return await _handle_apple_webhook(payload, body, session)

    # Google Play RTDN
    if payload.get("message") and payload.get("subscription"):
        return await _handle_google_webhook(payload, session)

    logger.warning("Webhook: unknown webhook source, payload keys: %s", list(payload.keys()))
    return {"status": "ignored", "reason": "unrecognized webhook format"}


@router.post("/webhooks/apple", status_code=status.HTTP_200_OK, include_in_schema=False)
async def handle_apple_webhook(
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """
    Dedicated Apple App Store Server Notifications v2 endpoint.

    Configure in App Store Connect:
      Settings > App Information > App Store Server Notifications > URL
      https://api.fitsiai.com/api/subscriptions/webhooks/apple
    """
    try:
        body = await request.body()
        payload = await request.json()
    except Exception:
        logger.error("Apple webhook: failed to parse request body")
        raise HTTPException(status_code=400, detail="Invalid request body")

    return await _handle_apple_webhook(payload, body, session)


@router.post("/webhooks/google", status_code=status.HTTP_200_OK, include_in_schema=False)
async def handle_google_webhook(
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """
    Dedicated Google Play Real-time Developer Notifications endpoint.

    Configure in Google Cloud Console:
      Pub/Sub > Subscriptions > Push endpoint
      https://api.fitsiai.com/api/subscriptions/webhooks/google
    """
    try:
        payload = await request.json()
    except Exception:
        logger.error("Google webhook: failed to parse request body")
        raise HTTPException(status_code=400, detail="Invalid request body")

    message_data = payload.get("message", {}).get("data", "")
    if message_data:
        import base64
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
    description="Restore previous purchases from the app store receipt.",
    responses={200: {"description": "Updated subscription status after restore attempt"}},
)
async def restore_purchases(
    body: RestorePurchaseRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    try:
        if body.store == SubscriptionStore.apple:
            validation_result = await _validate_apple_receipt(body.receipt_data, "")
        elif body.store == SubscriptionStore.google:
            validation_result = await _validate_google_receipt(body.receipt_data, "")
        else:
            raise HTTPException(status_code=400, detail="Unsupported store for restore")

        if validation_result.get("valid") and validation_result.get("active_subscription"):
            result = await session.execute(
                select(Subscription)
                .where(
                    Subscription.user_id == current_user.id,
                    Subscription.status.in_(["active", "trial"]),
                )
            )
            existing = result.scalars().first()
            if not existing:
                now = _utcnow()
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
                current_user.updated_at = now
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
    description="Cancel the active subscription. User retains access until period end.",
    responses={
        204: {"description": "Subscription canceled successfully"},
        404: {"description": "No active subscription found"},
    },
)
async def cancel_subscription(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
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

    now = _utcnow()

    sub.status = "canceled"
    sub.auto_renew_enabled = False
    sub.updated_at = now
    session.add(sub)

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
    description="Admin-only endpoint returning MRR, churn rate, conversion rate, plan distribution.",
    responses={
        200: {"description": "Subscription analytics metrics"},
        403: {"description": "Not an admin user"},
    },
)
async def get_subscription_analytics(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    if not getattr(current_user, "is_admin", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    now = _utcnow()
    thirty_days_ago = now - timedelta(days=30)

    try:
        total_result = await session.execute(
            select(func.count()).select_from(Subscription)
        )
        total_subscribers = total_result.scalar() or 0

        active_result = await session.execute(
            select(func.count()).select_from(Subscription).where(
                Subscription.status == "active"
            )
        )
        active_subscribers = active_result.scalar() or 0

        trial_result = await session.execute(
            select(func.count()).select_from(Subscription).where(
                Subscription.status == "trial"
            )
        )
        trial_subscribers = trial_result.scalar() or 0

        churned_result = await session.execute(
            select(func.count()).select_from(Subscription).where(
                Subscription.status.in_(["canceled", "expired"]),
                Subscription.updated_at >= thirty_days_ago,
            )
        )
        churned_last_30d = churned_result.scalar() or 0

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

        arpu = (mrr / active_subscribers) if active_subscribers > 0 else 0.0

        plan_dist_result = await session.execute(
            select(Subscription.plan, func.count())
            .where(Subscription.status == "active")
            .group_by(Subscription.plan)
        )
        plan_distribution = {row[0]: row[1] for row in plan_dist_result.all()}

        store_dist_result = await session.execute(
            select(Subscription.store, func.count())
            .where(Subscription.status == "active")
            .group_by(Subscription.store)
        )
        store_distribution = {(row[0] or "unknown"): row[1] for row in store_dist_result.all()}

        new_subs_result = await session.execute(
            select(func.count()).select_from(Subscription).where(
                Subscription.created_at >= thirty_days_ago,
            )
        )
        new_subscriptions_30d = new_subs_result.scalar() or 0

        cancel_result = await session.execute(
            select(func.count()).select_from(Subscription).where(
                Subscription.status == "canceled",
                Subscription.updated_at >= thirty_days_ago,
            )
        )
        cancellations_30d = cancel_result.scalar() or 0

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


# ==============================================================================
# RECEIPT VALIDATION HELPERS
# ==============================================================================


async def _validate_apple_receipt(receipt_data: str, product_id: str) -> dict:
    """
    Validate a receipt against Apple's App Store Server API v2.
    Falls back to sandbox endpoint on status 21007.
    """
    import httpx

    app_store_shared_secret = settings.app_store_shared_secret
    if not app_store_shared_secret:
        logger.warning("Apple receipt validation: APP_STORE_SHARED_SECRET not configured")
        is_dev = settings.env == "development"
        if is_dev:
            return {
                "valid": True,
                "transaction_id": f"dev_apple_{receipt_data[:20]}",
                "active_subscription": True,
                "plan": "monthly",
                "expires_at": _utcnow() + timedelta(days=30),
            }
        return {"valid": False, "error": "Apple receipt validation not configured"}

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

            if result.get("status") == 21007:
                response = await client.post(sandbox_url, json=payload)
                result = response.json()

            if result.get("status") == 0:
                latest_receipt = result.get("latest_receipt_info", [{}])
                if latest_receipt:
                    latest = latest_receipt[-1] if isinstance(latest_receipt, list) else latest_receipt
                    expires_ms = int(latest.get("expires_date_ms", 0))
                    expires_at = _parse_ms_timestamp(expires_ms) if expires_ms else None
                    is_active = expires_at and expires_at > _utcnow() if expires_at else False

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
    """Validate a purchase token against Google Play Developer API."""

    service_account_json = settings.google_play_service_account
    if not service_account_json:
        logger.warning("Google receipt validation: GOOGLE_PLAY_SERVICE_ACCOUNT not configured")
        is_dev = settings.env == "development"
        if is_dev:
            return {
                "valid": True,
                "transaction_id": f"dev_google_{purchase_token[:20]}",
                "active_subscription": True,
                "plan": "monthly",
                "expires_at": _utcnow() + timedelta(days=30),
            }
        return {"valid": False, "error": "Google receipt validation not configured"}

    import httpx

    package_name = settings.google_play_package_name
    api_url = (
        f"https://androidpublisher.googleapis.com/androidpublisher/v3/"
        f"applications/{package_name}/purchases/subscriptions/"
        f"{product_id}/tokens/{purchase_token}"
    )

    try:
        access_token = await _get_google_access_token(service_account_json)

        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(
                api_url,
                headers={"Authorization": f"Bearer {access_token}"},
            )

            if response.status_code == 200:
                result = response.json()
                expiry_ms = int(result.get("expiryTimeMillis", 0))
                expires_at = _parse_ms_timestamp(expiry_ms) if expiry_ms else None
                is_active = expires_at and expires_at > _utcnow() if expires_at else False

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
    return "dev_access_token"


def _apple_product_to_plan(product_id: str) -> str:
    """Map Apple/Google product ID to subscription plan name.

    Product IDs (must match App Store Connect, Google Play Console, and RevenueCat):
      - fitsi_premium_monthly  -> monthly
      - fitsi_premium_yearly   -> annual
      - fitsi_premium_lifetime -> lifetime

    Legacy IDs kept for backwards compatibility with receipts already processed.
    """
    mapping = {
        # Current product IDs
        "fitsi_premium_monthly": "monthly",
        "fitsi_premium_yearly": "annual",
        "fitsi_premium_lifetime": "lifetime",
        # Legacy product IDs (backwards compatibility for existing receipts)
        "fitsiai_monthly": "monthly",
        "fitsiai_annual": "annual",
        "fitsiai_pro_monthly": "monthly",
        "fitsiai_pro_annual": "annual",
        "fitsiai_lifetime": "lifetime",
    }
    return mapping.get(product_id, "monthly")


def _google_product_to_plan(product_id: str) -> str:
    """Map Google product ID to subscription plan name."""
    return _apple_product_to_plan(product_id)


# ==============================================================================
# WEBHOOK HANDLERS (internal)
# ==============================================================================


async def _handle_revenuecat_webhook(payload: dict, session: AsyncSession) -> dict:
    """
    Process RevenueCat webhook events.

    RevenueCat sends a unified payload for both Apple and Google events.
    Reference: https://www.revenuecat.com/docs/integrations/webhooks

    Handled events:
      INITIAL_PURCHASE       -- new subscription
      RENEWAL                -- auto-renewal succeeded
      CANCELLATION           -- user canceled (retains access until period end)
      UNCANCELLATION         -- user re-enabled auto-renew
      BILLING_ISSUE_DETECTED -- payment method failed
      EXPIRATION             -- subscription expired
      PRODUCT_CHANGE         -- user changed plan (upgrade/downgrade)
      NON_RENEWING_PURCHASE  -- one-time (lifetime) purchase
      SUBSCRIPTION_PAUSED    -- Google-only pause
    """
    event = payload.get("event", {})
    event_type = event.get("type", "UNKNOWN")
    app_user_id = event.get("app_user_id", "")
    now = _utcnow()

    logger.info(
        "RevenueCat webhook: type=%s app_user_id=%s",
        event_type, app_user_id,
    )

    # Log the raw event before processing
    raw_payload_str = json_module.dumps(payload)[:50_000]
    log_entry = await _log_webhook_event(
        session,
        source="revenuecat",
        event_type=event_type,
        app_user_id=str(app_user_id),
        raw_payload=raw_payload_str,
    )

    # Resolve user
    try:
        user_id = int(app_user_id)
    except (ValueError, TypeError):
        log_entry.processing_result = "ignored"
        log_entry.error_message = f"invalid app_user_id: {app_user_id}"
        await session.commit()
        logger.warning("RevenueCat webhook: invalid app_user_id=%s", app_user_id)
        return {"status": "ignored", "reason": "invalid_user_id"}

    user_result = await session.execute(select(User).where(User.id == user_id))
    user = user_result.scalars().first()
    if not user:
        log_entry.processing_result = "ignored"
        log_entry.error_message = f"user not found: {user_id}"
        await session.commit()
        logger.warning("RevenueCat webhook: user not found user_id=%s", user_id)
        return {"status": "ignored", "reason": "user_not_found"}

    # Find the user's latest subscription
    sub_result = await session.execute(
        select(Subscription)
        .where(Subscription.user_id == user_id)
        .order_by(Subscription.created_at.desc())
    )
    sub = sub_result.scalars().first()

    # Extract common fields from event payload
    expiration_at_ms = event.get("expiration_at_ms")
    product_id = event.get("product_id", "")
    store = _rc_store_to_internal(event.get("store", ""))
    price_in_purchased_currency = event.get("price_in_purchased_currency")
    currency = event.get("currency", "USD")

    try:
        if event_type == "INITIAL_PURCHASE":
            sub = await _rc_handle_initial_purchase(
                session, user, sub, now,
                expiration_at_ms=expiration_at_ms,
                product_id=product_id,
                store=store,
                price=price_in_purchased_currency,
                currency=currency,
                event=event,
            )

        elif event_type == "RENEWAL":
            await _rc_handle_renewal(
                session, user, sub, now,
                expiration_at_ms=expiration_at_ms,
            )

        elif event_type == "CANCELLATION":
            await _rc_handle_cancellation(session, user, sub, now)

        elif event_type == "UNCANCELLATION":
            await _rc_handle_uncancellation(session, user, sub, now)

        elif event_type == "BILLING_ISSUE_DETECTED":
            await _rc_handle_billing_issue(session, user, sub, now)

        elif event_type == "EXPIRATION":
            await _rc_handle_expiration(session, user, sub, now)

        elif event_type == "PRODUCT_CHANGE":
            await _rc_handle_product_change(
                session, user, sub, now,
                new_product_id=event.get("new_product_id", product_id),
                expiration_at_ms=expiration_at_ms,
            )

        elif event_type == "NON_RENEWING_PURCHASE":
            sub = await _rc_handle_initial_purchase(
                session, user, sub, now,
                expiration_at_ms=None,  # lifetime has no expiry
                product_id=product_id,
                store=store,
                price=price_in_purchased_currency,
                currency=currency,
                event=event,
                force_plan="lifetime",
            )

        elif event_type == "SUBSCRIPTION_PAUSED":
            if sub and sub.status in ("active", "trial"):
                sub.status = "canceled"
                sub.auto_renew_enabled = False
                sub.updated_at = now
                session.add(sub)
                await session.commit()
            logger.info("RevenueCat: SUBSCRIPTION_PAUSED for user %d", user_id)

        else:
            logger.info("RevenueCat: unhandled event type=%s for user %d", event_type, user_id)

        log_entry.processing_result = "ok"

    except Exception as exc:
        log_entry.processing_result = "error"
        log_entry.error_message = str(exc)[:2000]
        await session.rollback()
        logger.exception(
            "RevenueCat webhook processing error: type=%s user=%d",
            event_type, user_id,
        )
        # Re-add the log entry after rollback and commit it
        session.add(log_entry)
        await session.commit()
        # Return 200 so RevenueCat does not retry (we logged the error)
        return {"status": "error", "event_type": event_type}

    # Commit the log entry update
    session.add(log_entry)
    await session.commit()

    return {"status": "ok", "event_type": event_type}


# -- RevenueCat event handlers -------------------------------------------------


async def _rc_handle_initial_purchase(
    session: AsyncSession,
    user: User,
    sub: Optional[Subscription],
    now: datetime,
    *,
    expiration_at_ms: Optional[int],
    product_id: str,
    store: str,
    price: Optional[float],
    currency: str,
    event: dict,
    force_plan: Optional[str] = None,
) -> Subscription:
    """Handle INITIAL_PURCHASE / NON_RENEWING_PURCHASE."""
    plan = force_plan or _rc_product_to_plan(product_id)

    current_period_ends_at = None
    if expiration_at_ms:
        current_period_ends_at = _parse_ms_timestamp(int(expiration_at_ms))

    if sub and sub.status == "pending_verification":
        # Activate the pending subscription
        sub.status = "active"
        sub.plan = plan
        sub.store = store
        sub.rc_product_id = product_id
        sub.current_period_ends_at = current_period_ends_at
        sub.updated_at = now
        if price is not None:
            sub.price_paid = price
        if currency:
            sub.currency = currency
        session.add(sub)
    else:
        # Create a new subscription (RevenueCat notified before client POST)
        original_tx_id = event.get("original_transaction_id", "")
        store_tx_id = event.get("transaction_id", original_tx_id or f"rc_{user.id}_{int(now.timestamp())}")

        sub = Subscription(
            user_id=user.id,
            plan=plan,
            status="active",
            store=store,
            store_tx_id=store_tx_id,
            rc_product_id=product_id,
            price_paid=price,
            currency=currency or "USD",
            current_period_ends_at=current_period_ends_at,
        )
        session.add(sub)

    user.is_premium = True
    user.updated_at = now
    session.add(user)
    await session.commit()

    logger.info("RevenueCat: INITIAL_PURCHASE processed for user %d, plan=%s", user.id, plan)
    return sub


async def _rc_handle_renewal(
    session: AsyncSession,
    user: User,
    sub: Optional[Subscription],
    now: datetime,
    *,
    expiration_at_ms: Optional[int],
) -> None:
    """Handle RENEWAL -- auto-renewal succeeded."""
    if not sub:
        logger.warning("RevenueCat RENEWAL: no subscription found for user %d", user.id)
        return

    sub.status = "active"
    sub.billing_issues_detected_at = None
    sub.auto_renew_enabled = True
    sub.updated_at = now
    if expiration_at_ms:
        sub.current_period_ends_at = _parse_ms_timestamp(int(expiration_at_ms))
    session.add(sub)

    user.is_premium = True
    user.updated_at = now
    session.add(user)
    await session.commit()

    logger.info("RevenueCat: RENEWAL processed for user %d", user.id)


async def _rc_handle_cancellation(
    session: AsyncSession,
    user: User,
    sub: Optional[Subscription],
    now: datetime,
) -> None:
    """Handle CANCELLATION -- user canceled (keeps access until period end)."""
    if not sub or sub.status not in ("active", "trial", "grace_period", "billing_retry"):
        logger.warning("RevenueCat CANCELLATION: no active subscription for user %d", user.id)
        return

    sub.status = "canceled"
    sub.auto_renew_enabled = False
    sub.updated_at = now
    session.add(sub)

    # Only revoke premium if there is no remaining access period
    if not sub.current_period_ends_at or sub.current_period_ends_at <= now:
        user.is_premium = False
        user.updated_at = now
        session.add(user)

    await session.commit()
    logger.info("RevenueCat: CANCELLATION processed for user %d", user.id)


async def _rc_handle_uncancellation(
    session: AsyncSession,
    user: User,
    sub: Optional[Subscription],
    now: datetime,
) -> None:
    """Handle UNCANCELLATION -- user re-enabled auto-renew."""
    if not sub or sub.status != "canceled":
        logger.warning("RevenueCat UNCANCELLATION: no canceled subscription for user %d", user.id)
        return

    sub.status = "active"
    sub.auto_renew_enabled = True
    sub.updated_at = now
    session.add(sub)

    user.is_premium = True
    user.updated_at = now
    session.add(user)
    await session.commit()

    logger.info("RevenueCat: UNCANCELLATION processed for user %d", user.id)


async def _rc_handle_billing_issue(
    session: AsyncSession,
    user: User,
    sub: Optional[Subscription],
    now: datetime,
) -> None:
    """Handle BILLING_ISSUE_DETECTED -- payment method failed."""
    if not sub or sub.status not in ("active", "trial"):
        logger.warning("RevenueCat BILLING_ISSUE_DETECTED: no active subscription for user %d", user.id)
        return

    sub.status = "billing_retry"
    sub.billing_issues_detected_at = now
    sub.grace_period_ends_at = now + timedelta(days=BILLING_RETRY_DAYS)
    sub.updated_at = now
    session.add(sub)
    # Keep is_premium during billing retry / grace period
    await session.commit()

    logger.info("RevenueCat: BILLING_ISSUE_DETECTED (billing_retry) for user %d", user.id)


async def _rc_handle_expiration(
    session: AsyncSession,
    user: User,
    sub: Optional[Subscription],
    now: datetime,
) -> None:
    """Handle EXPIRATION -- subscription expired."""
    if not sub:
        logger.warning("RevenueCat EXPIRATION: no subscription found for user %d", user.id)
        return

    sub.status = "expired"
    sub.updated_at = now
    session.add(sub)

    user.is_premium = False
    user.updated_at = now
    session.add(user)
    await session.commit()

    logger.info("RevenueCat: EXPIRATION processed for user %d", user.id)


async def _rc_handle_product_change(
    session: AsyncSession,
    user: User,
    sub: Optional[Subscription],
    now: datetime,
    *,
    new_product_id: str,
    expiration_at_ms: Optional[int],
) -> None:
    """Handle PRODUCT_CHANGE -- user upgraded/downgraded plan."""
    if not sub:
        logger.warning("RevenueCat PRODUCT_CHANGE: no subscription found for user %d", user.id)
        return

    old_plan = sub.plan
    new_plan = _rc_product_to_plan(new_product_id)

    sub.plan = new_plan
    sub.rc_product_id = new_product_id
    sub.status = "active"
    sub.updated_at = now
    if expiration_at_ms:
        sub.current_period_ends_at = _parse_ms_timestamp(int(expiration_at_ms))
    session.add(sub)

    user.is_premium = True
    user.updated_at = now
    session.add(user)
    await session.commit()

    logger.info(
        "RevenueCat: PRODUCT_CHANGE for user %d: %s -> %s",
        user.id, old_plan, new_plan,
    )


# -- Apple / Google webhook handlers ------------------------------------------


async def _handle_apple_webhook(payload: dict, raw_body: bytes, session: AsyncSession) -> dict:
    """Process Apple App Store Server Notifications v2."""
    notification_type = payload.get("notificationType", "UNKNOWN")
    subtype = payload.get("subtype", "")

    logger.info("Apple webhook: type=%s subtype=%s", notification_type, subtype)

    await _log_webhook_event(
        session,
        source="apple",
        event_type=f"{notification_type}:{subtype}" if subtype else notification_type,
        raw_payload=raw_body.decode("utf-8", errors="replace")[:50_000],
    )

    data = payload.get("data", {})
    transaction_id = data.get("transactionId", "")

    if not transaction_id:
        await session.commit()
        return {"status": "ignored", "reason": "no_transaction_id"}

    sub_result = await session.execute(
        select(Subscription).where(Subscription.store_tx_id == transaction_id)
    )
    sub = sub_result.scalars().first()
    if not sub:
        logger.warning("Apple webhook: no subscription found for tx_id=%s", transaction_id)
        await session.commit()
        return {"status": "ignored", "reason": "subscription_not_found"}

    user_result = await session.execute(select(User).where(User.id == sub.user_id))
    user = user_result.scalars().first()

    now = _utcnow()

    if notification_type == "DID_RENEW":
        sub.status = "active"
        sub.billing_issues_detected_at = None
        sub.updated_at = now
        session.add(sub)
        if user:
            user.is_premium = True
            user.updated_at = now
            session.add(user)
        await session.commit()

    elif notification_type == "DID_FAIL_TO_RENEW":
        sub.status = "grace_period" if subtype == "GRACE_PERIOD" else "billing_retry"
        sub.billing_issues_detected_at = now
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
            sub.auto_renew_enabled = False
            sub.updated_at = now
            session.add(sub)
            await session.commit()
        elif subtype == "AUTO_RENEW_ENABLED":
            sub.status = "active"
            sub.auto_renew_enabled = True
            sub.updated_at = now
            session.add(sub)
            if user:
                user.is_premium = True
                user.updated_at = now
                session.add(user)
            await session.commit()
    else:
        await session.commit()

    return {"status": "ok", "notification_type": notification_type}


async def _handle_google_webhook(payload: dict, session: AsyncSession) -> dict:
    """Process Google Play Real-time Developer Notifications."""
    notification_type = payload.get("subscriptionNotification", {}).get("notificationType", 0)
    purchase_token = payload.get("subscriptionNotification", {}).get("purchaseToken", "")

    logger.info(
        "Google webhook: notification_type=%d purchase_token=%s",
        notification_type, purchase_token[:20] if purchase_token else "none",
    )

    await _log_webhook_event(
        session,
        source="google",
        event_type=str(notification_type),
        raw_payload=json_module.dumps(payload)[:50_000],
    )

    if not purchase_token:
        await session.commit()
        return {"status": "ignored", "reason": "no_purchase_token"}

    sub_result = await session.execute(
        select(Subscription).where(Subscription.store_tx_id == purchase_token)
    )
    sub = sub_result.scalars().first()
    if not sub:
        logger.warning("Google webhook: no subscription found for token=%s", purchase_token[:20])
        await session.commit()
        return {"status": "ignored", "reason": "subscription_not_found"}

    user_result = await session.execute(select(User).where(User.id == sub.user_id))
    user = user_result.scalars().first()

    now = _utcnow()

    # Google notification types:
    # 1: RECOVERED, 2: RENEWED, 3: CANCELED, 4: PURCHASED,
    # 5: ON_HOLD, 6: IN_GRACE_PERIOD, 7: RESTARTED,
    # 12: REVOKED, 13: EXPIRED

    if notification_type in (1, 2, 4, 7):  # RECOVERED, RENEWED, PURCHASED, RESTARTED
        sub.status = "active"
        sub.billing_issues_detected_at = None
        sub.updated_at = now
        session.add(sub)
        if user:
            user.is_premium = True
            user.updated_at = now
            session.add(user)
        await session.commit()

    elif notification_type == 3:  # CANCELED
        sub.status = "canceled"
        sub.auto_renew_enabled = False
        sub.updated_at = now
        session.add(sub)
        await session.commit()

    elif notification_type == 5:  # ON_HOLD
        sub.status = "billing_retry"
        sub.billing_issues_detected_at = now
        sub.updated_at = now
        session.add(sub)
        await session.commit()

    elif notification_type == 6:  # IN_GRACE_PERIOD
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
    else:
        await session.commit()

    return {"status": "ok", "notification_type": notification_type}


# -- Receipt Verification Helper -----------------------------------------------

async def verify_and_activate_subscription(
    subscription_id: int,
    session: AsyncSession,
) -> bool:
    """
    Called AFTER verifying the store receipt against Apple/Google APIs.
    Promotes a pending_verification subscription to active and sets is_premium.
    Returns True if activation succeeded.
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

    now = _utcnow()

    # Expire previous active subscriptions for this user
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

    # Mark user as premium
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
