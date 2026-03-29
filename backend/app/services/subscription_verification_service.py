"""
Subscription verification service
──────────────────────────────────
Handles receipt validation against Apple App Store Server API and
Google Play Developer API, and activates subscriptions after
successful verification.

Also provides RevenueCat-based entitlement verification for server-side
premium status checks, with Redis caching to avoid hammering the API.

This module is called by:
  1. The POST /api/subscriptions endpoint (inline, after subscription creation)
  2. The POST /api/subscriptions/webhooks/apple endpoint (server notifications)
  3. The POST /api/subscriptions/webhooks/google endpoint (RTDN)
  4. The require_premium dependency (on every premium-gated request)

No AI API calls are made in this file.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..core.cache import cache_get, cache_set, cache_delete, CACHE_TTL
from ..core.config import settings
from ..core.database import AsyncSessionLocal
from ..models.subscription import Subscription
from ..models.user import User

logger = logging.getLogger(__name__)

# ─── RevenueCat entitlement verification ─────────────────────────────────

_REVENUECAT_BASE_URL = "https://api.revenuecat.com/v1"
_PREMIUM_ENTITLEMENT_ID = "premium"
_PREMIUM_CACHE_TTL = CACHE_TTL.get("premium_entitlement", 300)  # 5 min


async def _fetch_revenuecat_subscriber(app_user_id: str) -> Optional[dict]:
    """Call the RevenueCat REST API to fetch subscriber data.

    GET https://api.revenuecat.com/v1/subscribers/{app_user_id}
    Authorization: Bearer <REVENUECAT_API_KEY>

    Returns the parsed JSON response dict, or None on any failure.
    The caller is responsible for caching.
    """
    api_key = settings.revenuecat_api_key
    if not api_key:
        logger.warning(
            "REVENUECAT_API_KEY is not configured -- cannot verify entitlements"
        )
        return None

    url = f"{_REVENUECAT_BASE_URL}/subscribers/{app_user_id}"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers=headers)

        if resp.status_code == 200:
            return resp.json()

        if resp.status_code == 404:
            logger.info(
                "RevenueCat subscriber not found for app_user_id=%s", app_user_id
            )
            return None

        logger.warning(
            "RevenueCat API returned status %d for app_user_id=%s: %s",
            resp.status_code,
            app_user_id,
            resp.text[:200],
        )
        return None

    except httpx.TimeoutException:
        logger.error(
            "RevenueCat API timeout for app_user_id=%s", app_user_id
        )
        return None
    except Exception as exc:
        logger.exception(
            "RevenueCat API error for app_user_id=%s: %s", app_user_id, exc
        )
        return None


def _has_active_premium_entitlement(subscriber_data: dict) -> bool:
    """Check whether the RevenueCat subscriber response contains an active
    'premium' entitlement.

    The entitlement is considered active if:
      - It exists in subscriber.entitlements
      - Its expires_date is either null (lifetime) or in the future
      - unsubscribe_detected_at being set does NOT revoke access until
        expires_date passes (standard RevenueCat behavior)
    """
    try:
        subscriber = subscriber_data.get("subscriber", {})
        entitlements = subscriber.get("entitlements", {})
        premium = entitlements.get(_PREMIUM_ENTITLEMENT_ID)

        if premium is None:
            return False

        expires_date_str = premium.get("expires_date")
        if expires_date_str is None:
            # Lifetime entitlement -- no expiry
            return True

        # Parse the ISO 8601 date from RevenueCat
        expires_date = datetime.fromisoformat(
            expires_date_str.replace("Z", "+00:00")
        )
        return expires_date > datetime.now(timezone.utc)

    except Exception as exc:
        logger.warning("Error parsing RevenueCat entitlement data: %s", exc)
        return False


async def verify_premium(user_id: int, session: AsyncSession) -> bool:
    """Verify whether a user has an active premium subscription.

    Verification order:
      1. Check Redis cache (5 min TTL) to avoid redundant API calls.
      2. Check the local DB (user.is_premium flag + active subscription).
      3. If REVENUECAT_API_KEY is configured, call the RevenueCat API as
         the source of truth and reconcile the local DB flag.
      4. Cache the result in Redis for 5 minutes.

    This function never raises -- it returns False on any error (fail-closed
    for premium access).

    Args:
        user_id: The user's database primary key.
        session: An active async database session.

    Returns:
        True if the user has active premium access, False otherwise.
    """
    cache_key = f"premium_entitlement:user:{user_id}"

    # ── Step 1: Check Redis cache ──
    cached = await cache_get(cache_key)
    if cached is not None:
        return cached == "1"

    # ── Step 2: Check local DB ──
    user = await session.get(User, user_id)
    if not user:
        await cache_set(cache_key, "0", _PREMIUM_CACHE_TTL)
        return False

    # ── Step 3: If RevenueCat is configured, verify remotely ──
    if settings.revenuecat_api_key:
        # RevenueCat uses app_user_id which maps to our user ID
        app_user_id = str(user_id)
        subscriber_data = await _fetch_revenuecat_subscriber(app_user_id)

        if subscriber_data is not None:
            is_premium = _has_active_premium_entitlement(subscriber_data)

            # Reconcile: update local DB if RevenueCat disagrees
            if is_premium != user.is_premium:
                logger.info(
                    "Premium status mismatch for user %d: "
                    "local=%s, revenuecat=%s — updating local DB",
                    user_id, user.is_premium, is_premium,
                )
                user.is_premium = is_premium
                user.updated_at = datetime.now(timezone.utc)
                session.add(user)
                await session.commit()

            await cache_set(cache_key, "1" if is_premium else "0", _PREMIUM_CACHE_TTL)
            return is_premium

        # RevenueCat API failed -- fall through to local DB as fallback
        logger.warning(
            "RevenueCat API unavailable for user %d, falling back to local DB",
            user_id,
        )

    # ── Step 4: Use local DB flag as fallback ──
    # Also verify there is an active subscription record (defense in depth)
    if user.is_premium:
        result = await session.execute(
            select(Subscription).where(
                Subscription.user_id == user_id,
                Subscription.status.in_(["active", "trial", "grace_period"]),
            )
        )
        has_active_sub = result.scalars().first() is not None

        if not has_active_sub:
            # is_premium flag is stale -- fix it
            logger.warning(
                "User %d has is_premium=True but no active subscription — fixing",
                user_id,
            )
            user.is_premium = False
            user.updated_at = datetime.now(timezone.utc)
            session.add(user)
            await session.commit()
            await cache_set(cache_key, "0", _PREMIUM_CACHE_TTL)
            return False

    await cache_set(cache_key, "1" if user.is_premium else "0", _PREMIUM_CACHE_TTL)
    return user.is_premium


async def invalidate_premium_cache(user_id: int) -> None:
    """Invalidate the cached premium status for a user.

    Call this after subscription changes (activate, expire, cancel, webhook)
    so the next premium check fetches fresh data.
    """
    cache_key = f"premium_entitlement:user:{user_id}"
    await cache_delete(cache_key)

# ─── Valid subscription status transitions ──────────────────────────────────

VALID_STATUS_TRANSITIONS = {
    "pending_verification": {"active", "trial", "expired", "cancelled"},
    "active": {"expired", "cancelled", "grace_period"},
    "trial": {"active", "expired", "cancelled"},
    "grace_period": {"active", "expired", "cancelled"},
    "cancelled": {"active"},  # Re-subscription
    "expired": {"active"},    # Re-subscription
}


def validate_status_transition(current_status: str, new_status: str) -> bool:
    """Check if a status transition is valid.

    Returns True if the transition is allowed, False otherwise.
    """
    allowed = VALID_STATUS_TRANSITIONS.get(current_status, set())
    return new_status in allowed


# ─── Receipt validation stubs ───────────────────────────────────────────────
# In production, these call the actual Apple/Google APIs.
# For now, they validate that the store_tx_id is well-formed and non-empty.

async def validate_apple_receipt(store_tx_id: str) -> dict:
    """Validate an Apple App Store receipt/transaction ID.

    In production, this calls the App Store Server API v2:
      GET https://api.storekit.itunes.apple.com/inApps/v1/transactions/{transactionId}

    Returns:
        {
            "valid": bool,
            "product_id": str | None,
            "expires_date": datetime | None,
            "is_trial": bool,
            "original_transaction_id": str | None,
            "error": str | None,
        }
    """
    # SEC: In production, replace this with actual Apple Server API call.
    # The signed JWS transaction info from Apple is cryptographically verified
    # using Apple's root certificate chain.
    if not store_tx_id or len(store_tx_id) < 5:
        return {"valid": False, "error": "Invalid Apple transaction ID format"}

    # Production placeholder — always succeeds for well-formed IDs.
    # TODO: Implement actual Apple App Store Server API v2 validation
    logger.info("Apple receipt validation for tx_id=%s (stub — accepting)", store_tx_id)
    return {
        "valid": True,
        "product_id": None,
        "expires_date": None,
        "is_trial": False,
        "original_transaction_id": store_tx_id,
        "error": None,
    }


async def validate_google_receipt(store_tx_id: str) -> dict:
    """Validate a Google Play purchase token.

    In production, this calls the Google Play Developer API:
      GET https://androidpublisher.googleapis.com/androidpublisher/v3/
          applications/{packageName}/purchases/subscriptionsv2/tokens/{token}

    Returns same shape as validate_apple_receipt().
    """
    if not store_tx_id or len(store_tx_id) < 5:
        return {"valid": False, "error": "Invalid Google purchase token format"}

    # Production placeholder — always succeeds for well-formed IDs.
    # TODO: Implement actual Google Play Developer API validation
    logger.info("Google receipt validation for tx_id=%s (stub — accepting)", store_tx_id)
    return {
        "valid": True,
        "product_id": None,
        "expires_date": None,
        "is_trial": False,
        "original_transaction_id": store_tx_id,
        "error": None,
    }


async def validate_receipt(store: str, store_tx_id: str) -> dict:
    """Route receipt validation to the appropriate store API."""
    if store == "apple":
        return await validate_apple_receipt(store_tx_id)
    elif store == "google":
        return await validate_google_receipt(store_tx_id)
    elif store == "stripe":
        # Stripe validation would use the Stripe API to verify payment intent
        if not store_tx_id or len(store_tx_id) < 5:
            return {"valid": False, "error": "Invalid Stripe payment ID format"}
        logger.info("Stripe receipt validation for tx_id=%s (stub — accepting)", store_tx_id)
        return {"valid": True, "product_id": None, "expires_date": None, "is_trial": False, "original_transaction_id": store_tx_id, "error": None}
    else:
        return {"valid": False, "error": f"Unknown store: {store}"}


# ─── Core verification + activation ────────────────────────────────────────

async def verify_and_activate_subscription(
    subscription_id: int,
    session: AsyncSession,
) -> bool:
    """
    Validates the store receipt and promotes a pending_verification
    subscription to active. Sets user.is_premium = True.

    This is THE function that was previously defined but never called.

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
        logger.warning(
            "verify_and_activate: subscription %d not found or not pending",
            subscription_id,
        )
        return False

    # ── Step 1: Validate the receipt against the store ──
    validation = await validate_receipt(sub.store or "apple", sub.store_tx_id or "")
    if not validation.get("valid"):
        error = validation.get("error", "Unknown validation error")
        logger.warning(
            "Receipt validation FAILED for subscription %d (store=%s tx=%s): %s",
            subscription_id, sub.store, sub.store_tx_id, error,
        )
        # Mark as expired — do not leave in pending_verification forever
        sub.status = "expired"
        sub.updated_at = datetime.now(timezone.utc)
        session.add(sub)
        await session.commit()
        return False

    # ── Step 2: Check if trial ──
    is_trial = validation.get("is_trial", False) or sub.trial_ends_at is not None
    new_status = "trial" if is_trial else "active"

    # ── Step 3: Validate the status transition ──
    if not validate_status_transition(sub.status, new_status):
        logger.error(
            "Invalid status transition %s -> %s for subscription %d",
            sub.status, new_status, subscription_id,
        )
        return False

    # ── Step 4: Expire any previous active subscriptions for this user ──
    active_result = await session.execute(
        select(Subscription).where(
            Subscription.user_id == sub.user_id,
            Subscription.status.in_(["active", "trial"]),
            Subscription.id != subscription_id,
        )
    )
    for old_sub in active_result.scalars().all():
        old_sub.status = "expired"
        old_sub.updated_at = datetime.now(timezone.utc)
        session.add(old_sub)

    # ── Step 5: Update expires date from store if available ──
    if validation.get("expires_date"):
        sub.current_period_ends_at = validation["expires_date"]

    # ── Step 6: Activate the verified subscription ──
    sub.status = new_status
    sub.updated_at = datetime.now(timezone.utc)
    session.add(sub)

    # ── Step 7: Mark user as premium ──
    user = await session.get(User, sub.user_id)
    if user:
        user.is_premium = True
        user.updated_at = datetime.now(timezone.utc)
        session.add(user)

    await session.commit()

    # Invalidate cached premium status so next check reflects the change
    await invalidate_premium_cache(sub.user_id)

    logger.info(
        "Subscription %d activated (status=%s) for user %d (store=%s tx=%s)",
        subscription_id, new_status, sub.user_id, sub.store, sub.store_tx_id,
    )
    return True


# ─── Handle store server notifications ──────────────────────────────────────

async def handle_apple_server_notification(notification_data: dict) -> dict:
    """Process an Apple App Store Server Notification v2.

    Apple sends JWS (JSON Web Signature) payloads containing:
    - notificationType: SUBSCRIBED, DID_RENEW, DID_FAIL_TO_RENEW,
      EXPIRED, REVOKE, GRACE_PERIOD_EXPIRES, etc.
    - data.signedTransactionInfo: JWS containing transaction details
    - data.signedRenewalInfo: JWS containing renewal details

    See: https://developer.apple.com/documentation/appstoreservernotifications
    """
    notification_type = notification_data.get("notificationType", "")
    subtype = notification_data.get("subtype", "")

    logger.info(
        "Apple notification received: type=%s subtype=%s",
        notification_type, subtype,
    )

    # Extract the original transaction ID from the signed transaction info
    # In production, decode and verify the JWS signature here
    signed_data = notification_data.get("data", {})
    # The signedTransactionInfo is a JWS that, once decoded, contains originalTransactionId
    original_tx_id = signed_data.get("originalTransactionId", "")

    if not original_tx_id:
        logger.warning("Apple notification missing originalTransactionId")
        return {"status": "ignored", "reason": "missing_transaction_id"}

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Subscription).where(
                Subscription.store_tx_id == original_tx_id,
                Subscription.store == "apple",
            )
        )
        sub = result.scalars().first()
        if not sub:
            logger.warning(
                "Apple notification for unknown tx_id=%s", original_tx_id,
            )
            return {"status": "ignored", "reason": "subscription_not_found"}

        now = datetime.now(timezone.utc)

        if notification_type == "SUBSCRIBED":
            if sub.status == "pending_verification":
                await verify_and_activate_subscription(sub.id, session)
            return {"status": "processed", "action": "activated"}

        elif notification_type == "DID_RENEW":
            sub.status = "active"
            # Extend period end by the plan duration
            if sub.plan == "monthly":
                sub.current_period_ends_at = now + timedelta(days=30)
            elif sub.plan == "annual":
                sub.current_period_ends_at = now + timedelta(days=365)
            sub.updated_at = now
            session.add(sub)
            await session.commit()
            return {"status": "processed", "action": "renewed"}

        elif notification_type == "EXPIRED":
            sub.status = "expired"
            sub.updated_at = now
            session.add(sub)

            user = await session.get(User, sub.user_id)
            if user:
                # Check if user has any other active subscriptions
                other_active = await session.execute(
                    select(Subscription).where(
                        Subscription.user_id == sub.user_id,
                        Subscription.status.in_(["active", "trial"]),
                        Subscription.id != sub.id,
                    )
                )
                if not other_active.scalars().first():
                    user.is_premium = False
                    user.updated_at = now
                    session.add(user)

            await session.commit()
            await invalidate_premium_cache(sub.user_id)
            return {"status": "processed", "action": "expired"}

        elif notification_type == "DID_FAIL_TO_RENEW":
            sub.status = "grace_period"
            sub.updated_at = now
            session.add(sub)
            await session.commit()
            return {"status": "processed", "action": "grace_period"}

        elif notification_type == "REVOKE":
            sub.status = "expired"
            sub.updated_at = now
            session.add(sub)

            user = await session.get(User, sub.user_id)
            if user:
                user.is_premium = False
                user.updated_at = now
                session.add(user)

            await session.commit()
            await invalidate_premium_cache(sub.user_id)
            return {"status": "processed", "action": "revoked"}

        else:
            logger.info(
                "Apple notification type=%s not handled, ignoring",
                notification_type,
            )
            return {"status": "ignored", "reason": f"unhandled_type_{notification_type}"}


async def handle_google_rtdn(notification_data: dict) -> dict:
    """Process a Google Play Real-time Developer Notification (RTDN).

    Google sends notifications via Cloud Pub/Sub containing:
    - subscriptionNotification.notificationType:
      1=RECOVERED, 2=RENEWED, 3=CANCELED, 4=PURCHASED,
      5=ON_HOLD, 6=IN_GRACE_PERIOD, 7=RESTARTED,
      12=REVOKED, 13=EXPIRED
    - subscriptionNotification.purchaseToken

    See: https://developer.android.com/google/play/billing/rtdn-reference
    """
    sub_notification = notification_data.get("subscriptionNotification", {})
    notification_type = sub_notification.get("notificationType", 0)
    purchase_token = sub_notification.get("purchaseToken", "")

    logger.info(
        "Google RTDN received: type=%d token=%s...",
        notification_type, purchase_token[:20] if purchase_token else "",
    )

    if not purchase_token:
        logger.warning("Google RTDN missing purchaseToken")
        return {"status": "ignored", "reason": "missing_purchase_token"}

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Subscription).where(
                Subscription.store_tx_id == purchase_token,
                Subscription.store == "google",
            )
        )
        sub = result.scalars().first()
        if not sub:
            logger.warning(
                "Google RTDN for unknown token=%s...",
                purchase_token[:20],
            )
            return {"status": "ignored", "reason": "subscription_not_found"}

        now = datetime.now(timezone.utc)

        # PURCHASED (4) or RECOVERED (1) or RESTARTED (7)
        if notification_type in (1, 4, 7):
            if sub.status == "pending_verification":
                await verify_and_activate_subscription(sub.id, session)
            elif sub.status in ("expired", "cancelled"):
                sub.status = "active"
                sub.updated_at = now
                session.add(sub)
                user = await session.get(User, sub.user_id)
                if user:
                    user.is_premium = True
                    user.updated_at = now
                    session.add(user)
                await session.commit()
                await invalidate_premium_cache(sub.user_id)
            return {"status": "processed", "action": "activated"}

        # RENEWED (2)
        elif notification_type == 2:
            sub.status = "active"
            if sub.plan == "monthly":
                sub.current_period_ends_at = now + timedelta(days=30)
            elif sub.plan == "annual":
                sub.current_period_ends_at = now + timedelta(days=365)
            sub.updated_at = now
            session.add(sub)
            await session.commit()
            return {"status": "processed", "action": "renewed"}

        # CANCELED (3)
        elif notification_type == 3:
            sub.status = "cancelled"
            sub.updated_at = now
            session.add(sub)
            # Note: user keeps premium until current_period_ends_at
            await session.commit()
            return {"status": "processed", "action": "cancelled"}

        # IN_GRACE_PERIOD (6)
        elif notification_type == 6:
            sub.status = "grace_period"
            sub.updated_at = now
            session.add(sub)
            await session.commit()
            return {"status": "processed", "action": "grace_period"}

        # ON_HOLD (5), EXPIRED (13), REVOKED (12)
        elif notification_type in (5, 12, 13):
            sub.status = "expired"
            sub.updated_at = now
            session.add(sub)

            user = await session.get(User, sub.user_id)
            if user:
                other_active = await session.execute(
                    select(Subscription).where(
                        Subscription.user_id == sub.user_id,
                        Subscription.status.in_(["active", "trial"]),
                        Subscription.id != sub.id,
                    )
                )
                if not other_active.scalars().first():
                    user.is_premium = False
                    user.updated_at = now
                    session.add(user)

            await session.commit()
            await invalidate_premium_cache(sub.user_id)
            return {"status": "processed", "action": "expired"}

        else:
            logger.info(
                "Google RTDN type=%d not handled, ignoring", notification_type,
            )
            return {"status": "ignored", "reason": f"unhandled_type_{notification_type}"}


# ─── Subscription expiry checker (background task) ──────────────────────────

async def check_expired_subscriptions() -> int:
    """Check for subscriptions past their current_period_ends_at and expire them.

    Returns the number of subscriptions expired.
    Should be called periodically (e.g., every hour) by a background task.
    """
    now = datetime.now(timezone.utc)
    expired_count = 0

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Subscription).where(
                Subscription.status.in_(["active", "trial", "grace_period"]),
                Subscription.current_period_ends_at.isnot(None),
                Subscription.current_period_ends_at < now,
                # Lifetime plans have no end date — they never expire
                Subscription.plan != "lifetime",
            )
        )
        expired_subs = result.scalars().all()

        affected_user_ids = []
        for sub in expired_subs:
            sub.status = "expired"
            sub.updated_at = now
            session.add(sub)

            user = await session.get(User, sub.user_id)
            if user:
                other_active = await session.execute(
                    select(Subscription).where(
                        Subscription.user_id == sub.user_id,
                        Subscription.status.in_(["active", "trial"]),
                        Subscription.id != sub.id,
                    )
                )
                if not other_active.scalars().first():
                    user.is_premium = False
                    user.updated_at = now
                    session.add(user)
                    affected_user_ids.append(sub.user_id)

            expired_count += 1

        if expired_count > 0:
            await session.commit()
            # Invalidate cached premium status for all affected users
            for uid in affected_user_ids:
                await invalidate_premium_cache(uid)
            logger.info(
                "Expired %d subscription(s) past current_period_ends_at", expired_count,
            )

    return expired_count


# ─── Stale pending subscription cleanup ────────────────────────────────────

async def expire_stale_pending_subscriptions(max_age_hours: int = 24) -> int:
    """Expire subscriptions stuck in pending_verification for too long.

    Returns the number of subscriptions expired.
    Protects against subscriptions that never get verified (e.g., webhook missed).
    """
    cutoff = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)
    expired_count = 0

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Subscription).where(
                Subscription.status == "pending_verification",
                Subscription.created_at < cutoff,
            )
        )
        stale_subs = result.scalars().all()

        for sub in stale_subs:
            sub.status = "expired"
            sub.updated_at = datetime.now(timezone.utc)
            session.add(sub)
            expired_count += 1
            logger.warning(
                "Expiring stale pending subscription %d (created %s, age > %dh)",
                sub.id, sub.created_at, max_age_hours,
            )

        if expired_count > 0:
            await session.commit()

    return expired_count
