"""Admin API endpoints — protected by is_admin flag on user.

All endpoints require authentication + admin privileges.
"""
import csv
import io
import logging
from datetime import date, datetime, time as dt_time, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, text as sa_text
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..core.database import get_session
from ..models.user import User
from ..models.ai_food_log import AIFoodLog
from ..models.subscription import Subscription
from ..models.onboarding_profile import OnboardingProfile
from ..models.feedback import Feedback, FeedbackType, FeedbackStatus
from ..routers.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ─── Admin guard ────────────────────────────────────────────────────────────

async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Dependency that enforces admin access."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required.",
        )
    return current_user


# ─── Request / Response schemas ─────────────────────────────────────────────

class GiftPremiumRequest(BaseModel):
    days: int
    reason: Optional[str] = None


class SendNotificationRequest(BaseModel):
    title: str
    body: str


class AdminUserSummary(BaseModel):
    id: int
    email: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    is_active: bool
    is_premium: bool
    is_admin: bool
    provider: str
    created_at: datetime


class AdminUserDetail(AdminUserSummary):
    updated_at: datetime
    # Onboarding
    gender: Optional[str] = None
    goal: Optional[str] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    target_weight_kg: Optional[float] = None
    diet_type: Optional[str] = None
    daily_calories: Optional[int] = None
    onboarding_completed: bool = False
    # Subscription
    subscription_plan: Optional[str] = None
    subscription_status: Optional[str] = None
    subscription_expires: Optional[datetime] = None
    # Stats
    total_food_logs: int = 0
    total_meals_today: int = 0
    last_active: Optional[datetime] = None


class PaginatedUsers(BaseModel):
    items: list[AdminUserSummary]
    total: int
    page: int
    page_size: int
    total_pages: int


class AdminMetrics(BaseModel):
    dau: int
    mau: int
    total_users: int
    new_users_today: int
    premium_count: int
    free_count: int
    revenue_total: float
    revenue_this_month: float
    churn_rate: float
    avg_meals_per_user_today: float


# ─── GET /api/admin/users ───────────────────────────────────────────────────

@router.get("/users", response_model=PaginatedUsers)
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    premium: Optional[bool] = Query(None, description="Filter by premium status"),
    active: Optional[bool] = Query(None, description="Filter by active status"),
    provider: Optional[str] = Query(None, description="Filter by auth provider"),
    search: Optional[str] = Query(None, description="Search by email or name"),
    sort_by: str = Query("created_at", description="Sort field"),
    sort_order: str = Query("desc", description="asc or desc"),
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
):
    """Paginated list of users with filters."""
    query = select(User)

    # Apply filters
    if premium is not None:
        query = query.where(User.is_premium == premium)
    if active is not None:
        query = query.where(User.is_active == active)
    if provider is not None:
        query = query.where(User.provider == provider)
    if search:
        like_pattern = f"%{search}%"
        query = query.where(
            (User.email.ilike(like_pattern))
            | (User.first_name.ilike(like_pattern))
            | (User.last_name.ilike(like_pattern))
        )

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await session.execute(count_query)
    total = total_result.scalar() or 0

    # Sort
    sort_column = getattr(User, sort_by, User.created_at)
    if sort_order == "asc":
        query = query.order_by(sort_column.asc())
    else:
        query = query.order_by(sort_column.desc())

    # Paginate
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    result = await session.execute(query)
    users = result.scalars().all()

    total_pages = max(1, (total + page_size - 1) // page_size)

    return PaginatedUsers(
        items=[
            AdminUserSummary(
                id=u.id,
                email=u.email,
                first_name=u.first_name,
                last_name=u.last_name,
                is_active=u.is_active,
                is_premium=u.is_premium,
                is_admin=u.is_admin,
                provider=u.provider,
                created_at=u.created_at,
            )
            for u in users
        ],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


# ─── GET /api/admin/users/{id} ─────────────────────────────────────────────

@router.get("/users/{user_id}", response_model=AdminUserDetail)
async def get_user_detail(
    user_id: int,
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
):
    """Detailed user view with profile, subscription, and stats."""
    user = await session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Onboarding profile
    profile_result = await session.execute(
        select(OnboardingProfile).where(OnboardingProfile.user_id == user_id)
    )
    profile = profile_result.scalars().first()

    # Latest subscription
    sub_result = await session.execute(
        select(Subscription)
        .where(Subscription.user_id == user_id)
        .order_by(Subscription.created_at.desc())
        .limit(1)
    )
    sub = sub_result.scalars().first()

    # Food log stats
    today = date.today()
    today_start = datetime.combine(today, dt_time.min)
    today_end = datetime.combine(today, dt_time.max)

    total_logs_result = await session.execute(
        select(func.count(AIFoodLog.id)).where(AIFoodLog.user_id == user_id)
    )
    total_food_logs = total_logs_result.scalar() or 0

    today_logs_result = await session.execute(
        select(func.count(AIFoodLog.id)).where(
            AIFoodLog.user_id == user_id,
            AIFoodLog.logged_at >= today_start,
            AIFoodLog.logged_at <= today_end,
        )
    )
    total_meals_today = today_logs_result.scalar() or 0

    last_active_result = await session.execute(
        select(func.max(AIFoodLog.logged_at)).where(AIFoodLog.user_id == user_id)
    )
    last_active = last_active_result.scalar()

    return AdminUserDetail(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        is_active=user.is_active,
        is_premium=user.is_premium,
        is_admin=user.is_admin,
        provider=user.provider,
        created_at=user.created_at,
        updated_at=user.updated_at,
        # Onboarding
        gender=profile.gender if profile else None,
        goal=profile.goal if profile else None,
        height_cm=profile.height_cm if profile else None,
        weight_kg=profile.weight_kg if profile else None,
        target_weight_kg=profile.target_weight_kg if profile else None,
        diet_type=profile.diet_type if profile else None,
        daily_calories=profile.daily_calories if profile else None,
        onboarding_completed=bool(profile and profile.completed_at),
        # Subscription
        subscription_plan=sub.plan if sub else None,
        subscription_status=sub.status if sub else None,
        subscription_expires=sub.current_period_ends_at if sub else None,
        # Stats
        total_food_logs=total_food_logs,
        total_meals_today=total_meals_today,
        last_active=last_active,
    )


# ─── POST /api/admin/users/{id}/gift-premium ───────────────────────────────

@router.post("/users/{user_id}/gift-premium")
async def gift_premium(
    user_id: int,
    body: GiftPremiumRequest,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    """Gift premium subscription to a user for N days."""
    if body.days < 1 or body.days > 3650:
        raise HTTPException(status_code=400, detail="Days must be between 1 and 3650")

    user = await session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    now = datetime.utcnow()
    expires_at = now + timedelta(days=body.days)

    # Set premium flag
    user.is_premium = True
    user.updated_at = now
    session.add(user)

    # Create gift subscription record
    gift_sub = Subscription(
        user_id=user_id,
        plan="gift",
        status="active",
        price_paid=0.0,
        currency="USD",
        store="admin_gift",
        store_tx_id=f"gift_{admin.id}_{int(now.timestamp())}",
        current_period_ends_at=expires_at,
        created_at=now,
        updated_at=now,
    )
    session.add(gift_sub)
    await session.commit()

    logger.info(
        "ADMIN: user %s gifted %d days premium to user %s (reason: %s)",
        admin.id, body.days, user_id, body.reason,
    )

    return {
        "detail": f"Premium gifted for {body.days} days",
        "user_id": user_id,
        "expires_at": expires_at.isoformat(),
        "gifted_by": admin.id,
    }


# ─── POST /api/admin/users/{id}/send-notification ──────────────────────────

@router.post("/users/{user_id}/send-notification")
async def send_user_notification(
    user_id: int,
    body: SendNotificationRequest,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    """Send a push notification to a specific user."""
    user = await session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not body.title.strip() or not body.body.strip():
        raise HTTPException(status_code=400, detail="Title and body must not be empty")

    from ..core.background_tasks import send_notification_async
    await send_notification_async(user_id, body.title, body.body)

    logger.info(
        "ADMIN: user %s sent notification to user %s: %r",
        admin.id, user_id, body.title,
    )

    return {
        "detail": "Notification sent",
        "user_id": user_id,
        "title": body.title,
    }


# ─── GET /api/admin/metrics ────────────────────────────────────────────────

@router.get("/metrics", response_model=AdminMetrics)
async def get_admin_metrics(
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
):
    """Platform-wide metrics: DAU, MAU, revenue, new users, churn rate."""
    now = datetime.utcnow()
    today = date.today()
    today_start = datetime.combine(today, dt_time.min)
    today_end = datetime.combine(today, dt_time.max)
    thirty_days_ago = datetime.combine(today - timedelta(days=30), dt_time.min)

    # Total users
    total_result = await session.execute(select(func.count(User.id)))
    total_users = total_result.scalar() or 0

    # New users today
    new_today_result = await session.execute(
        select(func.count(User.id)).where(
            User.created_at >= today_start,
            User.created_at <= today_end,
        )
    )
    new_users_today = new_today_result.scalar() or 0

    # Premium / Free
    premium_result = await session.execute(
        select(func.count(User.id)).where(User.is_premium == True)
    )
    premium_count = premium_result.scalar() or 0
    free_count = total_users - premium_count

    # DAU — distinct users with food logs today
    dau_result = await session.execute(
        select(func.count(func.distinct(AIFoodLog.user_id))).where(
            AIFoodLog.logged_at >= today_start,
            AIFoodLog.logged_at <= today_end,
        )
    )
    dau = dau_result.scalar() or 0

    # MAU — distinct users with food logs in last 30 days
    mau_result = await session.execute(
        select(func.count(func.distinct(AIFoodLog.user_id))).where(
            AIFoodLog.logged_at >= thirty_days_ago,
        )
    )
    mau = mau_result.scalar() or 0

    # Revenue total
    revenue_total_result = await session.execute(
        select(func.coalesce(func.sum(Subscription.price_paid), 0.0))
    )
    revenue_total = float(revenue_total_result.scalar() or 0.0)

    # Revenue this month
    month_start = datetime.combine(today.replace(day=1), dt_time.min)
    revenue_month_result = await session.execute(
        select(func.coalesce(func.sum(Subscription.price_paid), 0.0)).where(
            Subscription.created_at >= month_start,
        )
    )
    revenue_this_month = float(revenue_month_result.scalar() or 0.0)

    # Churn rate — users active 30-60 days ago who are NOT active in last 30 days
    sixty_days_ago = datetime.combine(today - timedelta(days=60), dt_time.min)
    prev_active_result = await session.execute(
        select(func.count(func.distinct(AIFoodLog.user_id))).where(
            AIFoodLog.logged_at >= sixty_days_ago,
            AIFoodLog.logged_at < thirty_days_ago,
        )
    )
    prev_active = prev_active_result.scalar() or 0

    if prev_active > 0:
        # Users active 30-60 days ago who are also active in last 30 days
        retained_result = await session.execute(
            sa_text(
                """
                SELECT COUNT(DISTINCT prev.user_id)
                FROM ai_food_log prev
                INNER JOIN ai_food_log curr ON prev.user_id = curr.user_id
                WHERE prev.logged_at >= :sixty_ago AND prev.logged_at < :thirty_ago
                  AND curr.logged_at >= :thirty_ago
                """
            ),
            {
                "sixty_ago": sixty_days_ago,
                "thirty_ago": thirty_days_ago,
            },
        )
        retained = retained_result.scalar() or 0
        churned = prev_active - retained
        churn_rate = round(churned / prev_active, 4)
    else:
        churn_rate = 0.0

    # Avg meals per active user today
    avg_meals = round(dau and (
        (await session.execute(
            select(func.count(AIFoodLog.id)).where(
                AIFoodLog.logged_at >= today_start,
                AIFoodLog.logged_at <= today_end,
            )
        )).scalar() or 0
    ) / dau, 1) if dau > 0 else 0.0

    return AdminMetrics(
        dau=dau,
        mau=mau,
        total_users=total_users,
        new_users_today=new_users_today,
        premium_count=premium_count,
        free_count=free_count,
        revenue_total=round(revenue_total, 2),
        revenue_this_month=round(revenue_this_month, 2),
        churn_rate=churn_rate,
        avg_meals_per_user_today=avg_meals,
    )


# ─── GET /api/admin/export/users ────────────────────────────────────────────

@router.get("/export/users")
async def export_users_csv(
    premium: Optional[bool] = Query(None),
    active: Optional[bool] = Query(None),
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
):
    """Export users as CSV file with optional filters."""
    query = select(User)

    if premium is not None:
        query = query.where(User.is_premium == premium)
    if active is not None:
        query = query.where(User.is_active == active)

    query = query.order_by(User.created_at.desc())

    result = await session.execute(query)
    users = result.scalars().all()

    # Build CSV in memory
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "id", "email", "first_name", "last_name",
        "provider", "is_active", "is_premium", "is_admin",
        "created_at", "updated_at",
    ])

    for u in users:
        writer.writerow([
            u.id, u.email, u.first_name or "", u.last_name or "",
            u.provider, u.is_active, u.is_premium, u.is_admin,
            u.created_at.isoformat() if u.created_at else "",
            u.updated_at.isoformat() if u.updated_at else "",
        ])

    output.seek(0)
    filename = f"users_export_{date.today().isoformat()}.csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ─── GET /api/admin/feedback/summary ───────────────────────────────────────

class FeedbackSummaryItem(BaseModel):
    id: int
    user_id: int
    type: str
    status: str
    message: str
    created_at: str


class FeedbackSummary(BaseModel):
    total: int
    by_type: dict[str, int]
    by_status: dict[str, int]
    latest: list[FeedbackSummaryItem]


@router.get("/feedback/summary", response_model=FeedbackSummary)
async def get_feedback_summary(
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
):
    """Feedback overview: count by type, count by status, last 5 entries."""

    # Total
    total_result = await session.execute(select(func.count(Feedback.id)))
    total = total_result.scalar() or 0

    # Count by type
    type_result = await session.execute(
        select(Feedback.type, func.count(Feedback.id))
        .group_by(Feedback.type)
    )
    by_type: dict[str, int] = {}
    for fb_type in FeedbackType:
        by_type[fb_type.value] = 0
    for row in type_result.all():
        by_type[row[0]] = row[1]

    # Count by status
    status_result = await session.execute(
        select(Feedback.status, func.count(Feedback.id))
        .group_by(Feedback.status)
    )
    by_status: dict[str, int] = {}
    for fb_status in FeedbackStatus:
        by_status[fb_status.value] = 0
    for row in status_result.all():
        by_status[row[0]] = row[1]

    # Latest 5
    latest_result = await session.execute(
        select(Feedback)
        .order_by(Feedback.created_at.desc())
        .limit(5)
    )
    latest_items = latest_result.scalars().all()
    latest = [
        FeedbackSummaryItem(
            id=fb.id,
            user_id=fb.user_id,
            type=fb.type,
            status=fb.status,
            message=fb.message[:200] if fb.message else "",
            created_at=fb.created_at.isoformat(),
        )
        for fb in latest_items
    ]

    return FeedbackSummary(
        total=total,
        by_type=by_type,
        by_status=by_status,
        latest=latest,
    )


# ─── POST /api/admin/broadcast-notification ─────────────────────────────────

class BroadcastNotificationRequest(BaseModel):
    title: str
    body: str


@router.post("/broadcast-notification")
async def broadcast_notification(
    body: BroadcastNotificationRequest,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    """Send a push notification to all premium users via NotificationService."""
    if not body.title.strip() or not body.body.strip():
        raise HTTPException(status_code=400, detail="Title and body must not be empty")

    # Get all premium user IDs
    result = await session.execute(
        select(User.id).where(User.is_premium == True, User.is_active == True)
    )
    premium_user_ids = [row[0] for row in result.all()]

    if not premium_user_ids:
        return {
            "detail": "No premium users to notify",
            "sent_to": 0,
        }

    from ..services.notification_service import NotificationService
    notification_service = NotificationService(session)

    sent_count = 0
    failed_count = 0
    for uid in premium_user_ids:
        try:
            tickets = await notification_service.send_push(
                user_id=uid,
                title=body.title,
                body=body.body,
                data={"type": "admin_broadcast"},
            )
            if tickets:
                sent_count += 1
        except Exception as exc:
            logger.warning(
                "ADMIN: broadcast notification failed for user %s: %s", uid, exc,
            )
            failed_count += 1

    logger.info(
        "ADMIN: user %s broadcast notification to %d premium users (sent=%d, failed=%d): %r",
        admin.id, len(premium_user_ids), sent_count, failed_count, body.title,
    )

    return {
        "detail": "Broadcast sent",
        "total_premium_users": len(premium_user_ids),
        "sent_to": sent_count,
        "failed": failed_count,
        "title": body.title,
    }


# ─── GET /api/admin/revenue ────────────────────────────────────────────────

# Reference price map for estimating revenue from subscription counts.
# These are the prices shown in the paywall — actual price_paid may differ
# (discounts, gift subs, etc.), so we compute both estimated and actual.
_PLAN_PRICES = {
    "monthly": 9.99,
    "yearly": 59.99,
    "lifetime": 149.99,
    "gift": 0.0,
    "free": 0.0,
}


class RevenuePlanBreakdown(BaseModel):
    plan: str
    count: int
    active_count: int
    unit_price: float
    estimated_revenue: float
    actual_revenue: float


class RevenueResponse(BaseModel):
    total_subscriptions: int
    active_subscriptions: int
    estimated_monthly_revenue: float
    actual_revenue_total: float
    actual_revenue_this_month: float
    plans: list[RevenuePlanBreakdown]


@router.get("/revenue", response_model=RevenueResponse)
async def get_revenue(
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
):
    """Revenue breakdown: subscription counts * price per type, actual vs estimated."""
    today = date.today()
    month_start = datetime.combine(today.replace(day=1), dt_time.min)

    # All subscriptions grouped by plan
    plan_stats_result = await session.execute(
        select(
            Subscription.plan,
            func.count(Subscription.id),
            func.count(Subscription.id).filter(Subscription.status == "active"),
            func.coalesce(func.sum(Subscription.price_paid), 0.0),
        ).group_by(Subscription.plan)
    )
    plan_rows = plan_stats_result.all()

    plans: list[RevenuePlanBreakdown] = []
    total_subs = 0
    active_subs = 0
    estimated_monthly = 0.0
    actual_total = 0.0

    for plan_name, count, active_count, actual_rev in plan_rows:
        unit_price = _PLAN_PRICES.get(plan_name, 0.0)

        # For estimated monthly revenue: yearly is divided by 12, lifetime is one-time
        if plan_name == "yearly":
            monthly_estimate = active_count * (unit_price / 12)
        elif plan_name == "lifetime":
            monthly_estimate = 0.0  # one-time, not recurring
        else:
            monthly_estimate = active_count * unit_price

        plans.append(RevenuePlanBreakdown(
            plan=plan_name,
            count=count,
            active_count=active_count,
            unit_price=unit_price,
            estimated_revenue=round(monthly_estimate, 2),
            actual_revenue=round(float(actual_rev), 2),
        ))

        total_subs += count
        active_subs += active_count
        estimated_monthly += monthly_estimate
        actual_total += float(actual_rev)

    # Actual revenue this month
    month_rev_result = await session.execute(
        select(func.coalesce(func.sum(Subscription.price_paid), 0.0)).where(
            Subscription.created_at >= month_start,
        )
    )
    actual_this_month = float(month_rev_result.scalar() or 0.0)

    return RevenueResponse(
        total_subscriptions=total_subs,
        active_subscriptions=active_subs,
        estimated_monthly_revenue=round(estimated_monthly, 2),
        actual_revenue_total=round(actual_total, 2),
        actual_revenue_this_month=round(actual_this_month, 2),
        plans=plans,
    )
