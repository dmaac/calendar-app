"""Admin API endpoints -- protected by is_admin flag on user.

All endpoints require authentication + admin privileges.

Sections:
  1. Dashboard API      -- KPIs, user metrics
  2. User Management    -- list, detail, toggle premium, gift, notify
  3. Revenue            -- MRR, churn, LTV, plan breakdown
  4. System Health      -- DB size, cache stats, error log
  5. Content Management -- CRUD for nutrition tips and recipes
  6. Broadcast          -- notifications to all users
  7. Export             -- CSV user export
  8. Feedback           -- feedback summary
"""
import csv
import io
import logging
import sys
import time
import traceback
from collections import deque
from datetime import date, datetime, time as dt_time, timedelta
from threading import Lock
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field as PydanticField
from sqlalchemy import func, text as sa_text
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..core.database import get_session
from ..models.user import User
from ..models.ai_food_log import AIFoodLog
from ..models.subscription import Subscription
from ..models.onboarding_profile import OnboardingProfile
from ..models.feedback import Feedback, FeedbackType, FeedbackStatus
from ..models.food import Food
from ..models.nutrition_tip import NutritionTip
from ..models.recipe import Recipe
from ..routers.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ─── In-memory error log (ring buffer) ─────────────────────────────────────
# Captures the last N application errors for the /api/admin/errors endpoint.
# This avoids requiring an external log aggregation service for early-stage ops.

_MAX_ERROR_LOG = 100
_error_log: deque[dict] = deque(maxlen=_MAX_ERROR_LOG)
_error_lock = Lock()


def record_error(exc: Exception, context: str = "") -> None:
    """Record an exception into the admin error ring buffer.

    Call this from exception handlers, middleware, or background tasks
    to make errors visible in the admin panel.
    """
    tb = traceback.format_exception(type(exc), exc, exc.__traceback__)
    entry = {
        "timestamp": datetime.utcnow().isoformat(),
        "type": type(exc).__name__,
        "message": str(exc),
        "context": context,
        "stack_trace": "".join(tb),
    }
    with _error_lock:
        _error_log.append(entry)


# ─── Admin guard ────────────────────────────────────────────────────────────

async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Dependency that enforces admin access."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required.",
        )
    return current_user


# ═══════════════════════════════════════════════════════════════════════════
# 1. REQUEST / RESPONSE SCHEMAS
# ═══════════════════════════════════════════════════════════════════════════

class GiftPremiumRequest(BaseModel):
    days: int
    reason: Optional[str] = None


class TogglePremiumRequest(BaseModel):
    is_premium: bool
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


# ─── Dashboard KPI schema ──────────────────────────────────────────────────

class TopFoodItem(BaseModel):
    food_name: str
    count: int


class DashboardKPIs(BaseModel):
    total_users: int
    dau: int
    premium_pct: float
    avg_nutri_score: float
    top_foods: list[TopFoodItem]
    new_users_today: int
    new_users_this_week: int
    total_food_logs: int
    total_food_logs_today: int


# ─── Revenue schemas ───────────────────────────────────────────────────────

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
    mrr: float
    churn_rate: float
    ltv: float
    plans: list[RevenuePlanBreakdown]


# ─── System health schema ──────────────────────────────────────────────────

class SystemHealthResponse(BaseModel):
    db_size_mb: Optional[float] = None
    db_connected: bool
    db_table_count: int = 0
    redis_connected: bool
    redis_keys: int = 0
    cache_hits: int = 0
    cache_misses: int = 0
    cache_hit_ratio: float = 0.0
    uptime_seconds: float = 0.0
    python_version: str
    error_count_recent: int = 0


class ErrorLogEntry(BaseModel):
    timestamp: str
    type: str
    message: str
    context: str
    stack_trace: str


# ─── Content schemas ────────────────────────────────────────────────────────

class NutritionTipCreate(BaseModel):
    title: str = PydanticField(min_length=1, max_length=200)
    body: str = PydanticField(min_length=1, max_length=2000)
    category: str = PydanticField(default="general", max_length=50)
    is_active: bool = True


class NutritionTipUpdate(BaseModel):
    title: Optional[str] = PydanticField(default=None, max_length=200)
    body: Optional[str] = PydanticField(default=None, max_length=2000)
    category: Optional[str] = PydanticField(default=None, max_length=50)
    is_active: Optional[bool] = None


class NutritionTipResponse(BaseModel):
    id: int
    title: str
    body: str
    category: str
    is_active: bool
    created_by: Optional[int] = None
    created_at: datetime
    updated_at: datetime


class RecipeCreate(BaseModel):
    title: str = PydanticField(min_length=1, max_length=200)
    description: Optional[str] = PydanticField(default=None, max_length=1000)
    ingredients: str = PydanticField(min_length=1, max_length=5000)
    instructions: str = PydanticField(min_length=1, max_length=10000)
    category: str = PydanticField(default="general", max_length=50)
    cuisine: Optional[str] = PydanticField(default=None, max_length=50)
    calories: Optional[float] = PydanticField(default=None, ge=0)
    protein_g: Optional[float] = PydanticField(default=None, ge=0)
    carbs_g: Optional[float] = PydanticField(default=None, ge=0)
    fat_g: Optional[float] = PydanticField(default=None, ge=0)
    fiber_g: Optional[float] = PydanticField(default=None, ge=0)
    servings: int = PydanticField(default=1, ge=1)
    prep_time_min: Optional[int] = PydanticField(default=None, ge=0)
    cook_time_min: Optional[int] = PydanticField(default=None, ge=0)
    image_url: Optional[str] = None
    is_active: bool = True
    is_premium: bool = False


class RecipeUpdate(BaseModel):
    title: Optional[str] = PydanticField(default=None, max_length=200)
    description: Optional[str] = PydanticField(default=None, max_length=1000)
    ingredients: Optional[str] = PydanticField(default=None, max_length=5000)
    instructions: Optional[str] = PydanticField(default=None, max_length=10000)
    category: Optional[str] = PydanticField(default=None, max_length=50)
    cuisine: Optional[str] = PydanticField(default=None, max_length=50)
    calories: Optional[float] = PydanticField(default=None, ge=0)
    protein_g: Optional[float] = PydanticField(default=None, ge=0)
    carbs_g: Optional[float] = PydanticField(default=None, ge=0)
    fat_g: Optional[float] = PydanticField(default=None, ge=0)
    fiber_g: Optional[float] = PydanticField(default=None, ge=0)
    servings: Optional[int] = PydanticField(default=None, ge=1)
    prep_time_min: Optional[int] = PydanticField(default=None, ge=0)
    cook_time_min: Optional[int] = PydanticField(default=None, ge=0)
    image_url: Optional[str] = None
    is_active: Optional[bool] = None
    is_premium: Optional[bool] = None


class RecipeResponse(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    ingredients: str
    instructions: str
    category: str
    cuisine: Optional[str] = None
    calories: Optional[float] = None
    protein_g: Optional[float] = None
    carbs_g: Optional[float] = None
    fat_g: Optional[float] = None
    fiber_g: Optional[float] = None
    servings: int
    prep_time_min: Optional[int] = None
    cook_time_min: Optional[int] = None
    image_url: Optional[str] = None
    is_active: bool
    is_premium: bool
    created_by: Optional[int] = None
    created_at: datetime
    updated_at: datetime


# ─── Broadcast schema ──────────────────────────────────────────────────────

class BroadcastNotificationRequest(BaseModel):
    title: str
    body: str
    target: str = PydanticField(
        default="all",
        description="Target audience: 'all', 'premium', or 'free'",
    )


# ─── Feedback schemas ──────────────────────────────────────────────────────

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


# ═══════════════════════════════════════════════════════════════════════════
# 2. DASHBOARD API
# ═══════════════════════════════════════════════════════════════════════════


@router.get("/dashboard", response_model=DashboardKPIs)
async def admin_dashboard(
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
):
    """Dashboard KPIs: total users, DAU, premium %, avg NutriScore, top foods."""
    today = date.today()
    today_start = datetime.combine(today, dt_time.min)
    today_end = datetime.combine(today, dt_time.max)
    week_ago = datetime.combine(today - timedelta(days=7), dt_time.min)

    # Total users
    total_result = await session.execute(select(func.count(User.id)))
    total_users = total_result.scalar() or 0

    # DAU -- distinct users with food logs today
    dau_result = await session.execute(
        select(func.count(func.distinct(AIFoodLog.user_id))).where(
            AIFoodLog.logged_at >= today_start,
            AIFoodLog.logged_at <= today_end,
        )
    )
    dau = dau_result.scalar() or 0

    # Premium %
    premium_result = await session.execute(
        select(func.count(User.id)).where(User.is_premium == True)  # noqa: E712
    )
    premium_count = premium_result.scalar() or 0
    premium_pct = round((premium_count / total_users * 100) if total_users > 0 else 0.0, 1)

    # Average NutriScore -- approximated as (protein_g * 2 + fiber contribution - sugar penalty)
    # normalized to 0-100. We use a simplified version: avg ratio of protein intake to total cals.
    # In practice this is a placeholder until a dedicated NutriScore column is added.
    nutri_result = await session.execute(
        select(
            func.avg(AIFoodLog.protein_g),
            func.avg(AIFoodLog.calories),
        ).where(
            AIFoodLog.logged_at >= week_ago,
        )
    )
    row = nutri_result.one_or_none()
    avg_protein = float(row[0] or 0) if row else 0.0
    avg_cals = float(row[1] or 0) if row else 0.0
    # Simple score: protein_pct * 100 capped at 100
    if avg_cals > 0:
        protein_cal_ratio = (avg_protein * 4) / avg_cals  # protein cals / total cals
        avg_nutri_score = round(min(protein_cal_ratio * 100 * 3, 100), 1)  # scale up
    else:
        avg_nutri_score = 0.0

    # Top 10 logged foods (last 7 days)
    top_foods_result = await session.execute(
        select(AIFoodLog.food_name, func.count(AIFoodLog.id).label("cnt"))
        .where(AIFoodLog.logged_at >= week_ago)
        .group_by(AIFoodLog.food_name)
        .order_by(func.count(AIFoodLog.id).desc())
        .limit(10)
    )
    top_foods = [
        TopFoodItem(food_name=row[0], count=row[1])
        for row in top_foods_result.all()
    ]

    # New users today
    new_today_result = await session.execute(
        select(func.count(User.id)).where(
            User.created_at >= today_start,
            User.created_at <= today_end,
        )
    )
    new_users_today = new_today_result.scalar() or 0

    # New users this week
    new_week_result = await session.execute(
        select(func.count(User.id)).where(User.created_at >= week_ago)
    )
    new_users_this_week = new_week_result.scalar() or 0

    # Total food logs
    total_logs_result = await session.execute(select(func.count(AIFoodLog.id)))
    total_food_logs = total_logs_result.scalar() or 0

    # Total food logs today
    today_logs_result = await session.execute(
        select(func.count(AIFoodLog.id)).where(
            AIFoodLog.logged_at >= today_start,
            AIFoodLog.logged_at <= today_end,
        )
    )
    total_food_logs_today = today_logs_result.scalar() or 0

    return DashboardKPIs(
        total_users=total_users,
        dau=dau,
        premium_pct=premium_pct,
        avg_nutri_score=avg_nutri_score,
        top_foods=top_foods,
        new_users_today=new_users_today,
        new_users_this_week=new_users_this_week,
        total_food_logs=total_food_logs,
        total_food_logs_today=total_food_logs_today,
    )


# ═══════════════════════════════════════════════════════════════════════════
# 3. USER MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════


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


@router.get("/users/{user_id}/detail", response_model=AdminUserDetail)
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


# Backward-compatible alias: GET /api/admin/users/{id} still works
@router.get("/users/{user_id}", response_model=AdminUserDetail)
async def get_user_detail_compat(
    user_id: int,
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
):
    """Alias for /users/{id}/detail -- backward compatibility."""
    return await get_user_detail(user_id, session, _admin)


@router.post("/users/{user_id}/premium")
async def toggle_premium(
    user_id: int,
    body: TogglePremiumRequest,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    """Toggle premium status for a user.

    Set is_premium to True or False. When enabling, creates a subscription
    record. When disabling, cancels all active subscriptions.
    """
    user = await session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    now = datetime.utcnow()
    user.is_premium = body.is_premium
    user.updated_at = now
    session.add(user)

    if body.is_premium:
        # Create an admin-granted subscription
        admin_sub = Subscription(
            user_id=user_id,
            plan="admin_grant",
            status="active",
            price_paid=0.0,
            currency="USD",
            store="admin",
            store_tx_id=f"admin_toggle_{admin.id}_{int(now.timestamp())}",
            current_period_ends_at=now + timedelta(days=365),
            created_at=now,
            updated_at=now,
        )
        session.add(admin_sub)
    else:
        # Cancel all active subscriptions
        active_subs_result = await session.execute(
            select(Subscription).where(
                Subscription.user_id == user_id,
                Subscription.status == "active",
            )
        )
        for sub in active_subs_result.scalars().all():
            sub.status = "canceled"
            sub.updated_at = now
            session.add(sub)

    await session.commit()

    logger.info(
        "ADMIN: user %s toggled premium for user %s to %s (reason: %s)",
        admin.id, user_id, body.is_premium, body.reason,
    )

    return {
        "detail": f"Premium {'enabled' if body.is_premium else 'disabled'}",
        "user_id": user_id,
        "is_premium": body.is_premium,
        "toggled_by": admin.id,
    }


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


# ═══════════════════════════════════════════════════════════════════════════
# 4. METRICS (legacy endpoint -- kept for backward compat)
# ═══════════════════════════════════════════════════════════════════════════


@router.get("/metrics", response_model=AdminMetrics)
async def get_admin_metrics(
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
):
    """Platform-wide metrics: DAU, MAU, revenue, new users, churn rate."""
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
        select(func.count(User.id)).where(User.is_premium == True)  # noqa: E712
    )
    premium_count = premium_result.scalar() or 0
    free_count = total_users - premium_count

    # DAU
    dau_result = await session.execute(
        select(func.count(func.distinct(AIFoodLog.user_id))).where(
            AIFoodLog.logged_at >= today_start,
            AIFoodLog.logged_at <= today_end,
        )
    )
    dau = dau_result.scalar() or 0

    # MAU
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

    # Churn rate
    sixty_days_ago = datetime.combine(today - timedelta(days=60), dt_time.min)
    prev_active_result = await session.execute(
        select(func.count(func.distinct(AIFoodLog.user_id))).where(
            AIFoodLog.logged_at >= sixty_days_ago,
            AIFoodLog.logged_at < thirty_days_ago,
        )
    )
    prev_active = prev_active_result.scalar() or 0

    if prev_active > 0:
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


# ═══════════════════════════════════════════════════════════════════════════
# 5. REVENUE API (enhanced)
# ═══════════════════════════════════════════════════════════════════════════


_PLAN_PRICES = {
    "monthly": 9.99,
    "yearly": 59.99,
    "lifetime": 149.99,
    "gift": 0.0,
    "free": 0.0,
    "admin_grant": 0.0,
}


@router.get("/revenue", response_model=RevenueResponse)
async def get_revenue(
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
):
    """Revenue breakdown: MRR, churn, LTV, subscription counts by plan."""
    today = date.today()
    month_start = datetime.combine(today.replace(day=1), dt_time.min)
    thirty_days_ago = datetime.combine(today - timedelta(days=30), dt_time.min)
    sixty_days_ago = datetime.combine(today - timedelta(days=60), dt_time.min)

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

        if plan_name == "yearly":
            monthly_estimate = active_count * (unit_price / 12)
        elif plan_name == "lifetime":
            monthly_estimate = 0.0
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

    # MRR = estimated monthly recurring revenue from active paid subscriptions
    mrr = round(estimated_monthly, 2)

    # Churn rate (subscription-based)
    prev_active_result = await session.execute(
        select(func.count(func.distinct(Subscription.user_id))).where(
            Subscription.status.in_(["active", "canceled", "expired"]),
            Subscription.created_at >= sixty_days_ago,
            Subscription.created_at < thirty_days_ago,
        )
    )
    prev_sub_active = prev_active_result.scalar() or 0

    if prev_sub_active > 0:
        still_active_result = await session.execute(
            select(func.count(func.distinct(Subscription.user_id))).where(
                Subscription.status == "active",
                Subscription.user_id.in_(
                    select(Subscription.user_id).where(
                        Subscription.created_at >= sixty_days_ago,
                        Subscription.created_at < thirty_days_ago,
                    )
                ),
            )
        )
        still_active = still_active_result.scalar() or 0
        churn_rate = round((prev_sub_active - still_active) / prev_sub_active, 4)
    else:
        churn_rate = 0.0

    # LTV = ARPU / churn_rate (if churn > 0)
    arpu = actual_this_month / active_subs if active_subs > 0 else 0.0
    ltv = round(arpu / churn_rate, 2) if churn_rate > 0 else round(arpu * 24, 2)  # 24-month estimate if no churn

    return RevenueResponse(
        total_subscriptions=total_subs,
        active_subscriptions=active_subs,
        estimated_monthly_revenue=round(estimated_monthly, 2),
        actual_revenue_total=round(actual_total, 2),
        actual_revenue_this_month=round(actual_this_month, 2),
        mrr=mrr,
        churn_rate=churn_rate,
        ltv=ltv,
        plans=plans,
    )


# ═══════════════════════════════════════════════════════════════════════════
# 6. SYSTEM HEALTH API
# ═══════════════════════════════════════════════════════════════════════════


@router.get("/system", response_model=SystemHealthResponse)
async def get_system_health(
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
):
    """System health: DB size, cache stats, queue depth, error rate."""
    from ..core.database import async_engine

    # DB connection check
    db_connected = False
    db_size_mb = None
    db_table_count = 0
    try:
        result = await session.execute(sa_text("SELECT 1"))
        db_connected = True

        # Try to get DB size (PostgreSQL)
        try:
            size_result = await session.execute(
                sa_text("SELECT pg_database_size(current_database())")
            )
            size_bytes = size_result.scalar()
            if size_bytes is not None:
                db_size_mb = round(size_bytes / (1024 * 1024), 2)
        except Exception:
            # SQLite or unsupported -- skip
            pass

        # Table count
        try:
            table_result = await session.execute(
                sa_text(
                    "SELECT count(*) FROM information_schema.tables "
                    "WHERE table_schema = 'public'"
                )
            )
            db_table_count = table_result.scalar() or 0
        except Exception:
            # SQLite fallback
            try:
                table_result = await session.execute(
                    sa_text("SELECT count(*) FROM sqlite_master WHERE type='table'")
                )
                db_table_count = table_result.scalar() or 0
            except Exception:
                pass

    except Exception as exc:
        logger.warning("System health: DB check failed -- %s", exc)

    # Redis / cache stats
    redis_connected = False
    redis_keys = 0
    cache_hits = 0
    cache_misses = 0
    cache_hit_ratio = 0.0
    try:
        from ..core.cache import cache_stats
        stats = await cache_stats()
        redis_connected = True
        cache_hits = stats.get("hits", 0)
        cache_misses = stats.get("misses", 0)
        cache_hit_ratio = stats.get("hit_ratio", 0.0)
        redis_keys = stats.get("total_keys", 0)
    except Exception:
        pass

    # Uptime
    from ..main import _start_time
    uptime_seconds = round(time.time() - _start_time, 1) if _start_time else 0.0

    # Recent error count
    with _error_lock:
        error_count_recent = len(_error_log)

    return SystemHealthResponse(
        db_size_mb=db_size_mb,
        db_connected=db_connected,
        db_table_count=db_table_count,
        redis_connected=redis_connected,
        redis_keys=redis_keys,
        cache_hits=cache_hits,
        cache_misses=cache_misses,
        cache_hit_ratio=cache_hit_ratio,
        uptime_seconds=uptime_seconds,
        python_version=sys.version,
        error_count_recent=error_count_recent,
    )


@router.get("/errors", response_model=list[ErrorLogEntry])
async def get_error_log(
    limit: int = Query(50, ge=1, le=200),
    _admin: User = Depends(require_admin),
):
    """Return the last N application errors with stack traces."""
    with _error_lock:
        entries = list(_error_log)
    # Return most recent first, limited
    entries.reverse()
    return [
        ErrorLogEntry(
            timestamp=e["timestamp"],
            type=e["type"],
            message=e["message"],
            context=e["context"],
            stack_trace=e["stack_trace"],
        )
        for e in entries[:limit]
    ]


@router.post("/cache/clear")
async def clear_cache(
    _admin: User = Depends(require_admin),
):
    """Flush the entire Redis cache."""
    try:
        from ..core.token_store import get_redis
        r = get_redis()
        await r.flushdb()
        logger.info("ADMIN: cache cleared by user %s", _admin.id)
        return {"detail": "Cache cleared successfully"}
    except Exception as exc:
        logger.error("ADMIN: cache clear failed -- %s", exc)
        raise HTTPException(
            status_code=503,
            detail=f"Cache clear failed: {exc}",
        )


# ═══════════════════════════════════════════════════════════════════════════
# 7. CONTENT MANAGEMENT -- NUTRITION TIPS
# ═══════════════════════════════════════════════════════════════════════════


@router.post("/tips", response_model=NutritionTipResponse, status_code=201)
async def create_tip(
    body: NutritionTipCreate,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    """Create a new nutrition tip."""
    now = datetime.utcnow()
    tip = NutritionTip(
        title=body.title,
        body=body.body,
        category=body.category,
        is_active=body.is_active,
        created_by=admin.id,
        created_at=now,
        updated_at=now,
    )
    session.add(tip)
    await session.commit()
    await session.refresh(tip)

    logger.info("ADMIN: user %s created tip %s", admin.id, tip.id)
    return _tip_to_response(tip)


@router.get("/tips", response_model=list[NutritionTipResponse])
async def list_tips(
    active_only: bool = Query(False, description="Only return active tips"),
    category: Optional[str] = Query(None, description="Filter by category"),
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
):
    """List all nutrition tips with optional filters."""
    query = select(NutritionTip)
    if active_only:
        query = query.where(NutritionTip.is_active == True)  # noqa: E712
    if category:
        query = query.where(NutritionTip.category == category)
    query = query.order_by(NutritionTip.created_at.desc())

    result = await session.execute(query)
    tips = result.scalars().all()
    return [_tip_to_response(t) for t in tips]


@router.get("/tips/{tip_id}", response_model=NutritionTipResponse)
async def get_tip(
    tip_id: int,
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
):
    """Get a single nutrition tip by ID."""
    tip = await session.get(NutritionTip, tip_id)
    if not tip:
        raise HTTPException(status_code=404, detail="Tip not found")
    return _tip_to_response(tip)


@router.put("/tips/{tip_id}", response_model=NutritionTipResponse)
async def update_tip(
    tip_id: int,
    body: NutritionTipUpdate,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    """Update a nutrition tip. Only provided fields are changed."""
    tip = await session.get(NutritionTip, tip_id)
    if not tip:
        raise HTTPException(status_code=404, detail="Tip not found")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(tip, field, value)
    tip.updated_at = datetime.utcnow()
    session.add(tip)
    await session.commit()
    await session.refresh(tip)

    logger.info("ADMIN: user %s updated tip %s", admin.id, tip_id)
    return _tip_to_response(tip)


@router.delete("/tips/{tip_id}")
async def delete_tip(
    tip_id: int,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    """Delete a nutrition tip."""
    tip = await session.get(NutritionTip, tip_id)
    if not tip:
        raise HTTPException(status_code=404, detail="Tip not found")

    await session.delete(tip)
    await session.commit()

    logger.info("ADMIN: user %s deleted tip %s", admin.id, tip_id)
    return {"detail": "Tip deleted", "id": tip_id}


def _tip_to_response(tip: NutritionTip) -> NutritionTipResponse:
    return NutritionTipResponse(
        id=tip.id,
        title=tip.title,
        body=tip.body,
        category=tip.category,
        is_active=tip.is_active,
        created_by=tip.created_by,
        created_at=tip.created_at,
        updated_at=tip.updated_at,
    )


# ═══════════════════════════════════════════════════════════════════════════
# 8. CONTENT MANAGEMENT -- RECIPES
# ═══════════════════════════════════════════════════════════════════════════


@router.post("/recipes", response_model=RecipeResponse, status_code=201)
async def create_recipe(
    body: RecipeCreate,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    """Create a new recipe."""
    now = datetime.utcnow()
    recipe = Recipe(
        title=body.title,
        description=body.description,
        ingredients=body.ingredients,
        instructions=body.instructions,
        category=body.category,
        cuisine=body.cuisine,
        calories=body.calories,
        protein_g=body.protein_g,
        carbs_g=body.carbs_g,
        fat_g=body.fat_g,
        fiber_g=body.fiber_g,
        servings=body.servings,
        prep_time_min=body.prep_time_min,
        cook_time_min=body.cook_time_min,
        image_url=body.image_url,
        is_active=body.is_active,
        is_premium=body.is_premium,
        created_by=admin.id,
        created_at=now,
        updated_at=now,
    )
    session.add(recipe)
    await session.commit()
    await session.refresh(recipe)

    logger.info("ADMIN: user %s created recipe %s", admin.id, recipe.id)
    return _recipe_to_response(recipe)


@router.get("/recipes", response_model=list[RecipeResponse])
async def list_recipes(
    active_only: bool = Query(False, description="Only return active recipes"),
    category: Optional[str] = Query(None, description="Filter by category"),
    premium_only: Optional[bool] = Query(None, description="Filter by premium flag"),
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
):
    """List all recipes with optional filters."""
    query = select(Recipe)
    if active_only:
        query = query.where(Recipe.is_active == True)  # noqa: E712
    if category:
        query = query.where(Recipe.category == category)
    if premium_only is not None:
        query = query.where(Recipe.is_premium == premium_only)
    query = query.order_by(Recipe.created_at.desc())

    result = await session.execute(query)
    recipes = result.scalars().all()
    return [_recipe_to_response(r) for r in recipes]


@router.get("/recipes/{recipe_id}", response_model=RecipeResponse)
async def get_recipe(
    recipe_id: int,
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
):
    """Get a single recipe by ID."""
    recipe = await session.get(Recipe, recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return _recipe_to_response(recipe)


@router.put("/recipes/{recipe_id}", response_model=RecipeResponse)
async def update_recipe(
    recipe_id: int,
    body: RecipeUpdate,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    """Update a recipe. Only provided fields are changed."""
    recipe = await session.get(Recipe, recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(recipe, field, value)
    recipe.updated_at = datetime.utcnow()
    session.add(recipe)
    await session.commit()
    await session.refresh(recipe)

    logger.info("ADMIN: user %s updated recipe %s", admin.id, recipe_id)
    return _recipe_to_response(recipe)


@router.delete("/recipes/{recipe_id}")
async def delete_recipe(
    recipe_id: int,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    """Delete a recipe."""
    recipe = await session.get(Recipe, recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")

    await session.delete(recipe)
    await session.commit()

    logger.info("ADMIN: user %s deleted recipe %s", admin.id, recipe_id)
    return {"detail": "Recipe deleted", "id": recipe_id}


def _recipe_to_response(recipe: Recipe) -> RecipeResponse:
    return RecipeResponse(
        id=recipe.id,
        title=recipe.title,
        description=recipe.description,
        ingredients=recipe.ingredients,
        instructions=recipe.instructions,
        category=recipe.category,
        cuisine=recipe.cuisine,
        calories=recipe.calories,
        protein_g=recipe.protein_g,
        carbs_g=recipe.carbs_g,
        fat_g=recipe.fat_g,
        fiber_g=recipe.fiber_g,
        servings=recipe.servings,
        prep_time_min=recipe.prep_time_min,
        cook_time_min=recipe.cook_time_min,
        image_url=recipe.image_url,
        is_active=recipe.is_active,
        is_premium=recipe.is_premium,
        created_by=recipe.created_by,
        created_at=recipe.created_at,
        updated_at=recipe.updated_at,
    )


# ═══════════════════════════════════════════════════════════════════════════
# 9. BROADCAST NOTIFICATIONS
# ═══════════════════════════════════════════════════════════════════════════


@router.post("/notifications/broadcast")
async def broadcast_notification(
    body: BroadcastNotificationRequest,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    """Send a push notification to all/premium/free active users."""
    if not body.title.strip() or not body.body.strip():
        raise HTTPException(status_code=400, detail="Title and body must not be empty")

    # Build user filter based on target
    query = select(User.id).where(User.is_active == True)  # noqa: E712
    if body.target == "premium":
        query = query.where(User.is_premium == True)  # noqa: E712
    elif body.target == "free":
        query = query.where(User.is_premium == False)  # noqa: E712
    # "all" = no additional filter

    result = await session.execute(query)
    user_ids = [row[0] for row in result.all()]

    if not user_ids:
        return {
            "detail": "No users to notify",
            "sent_to": 0,
        }

    from ..services.notification_service import NotificationService
    notification_service = NotificationService(session)

    sent_count = 0
    failed_count = 0
    for uid in user_ids:
        try:
            tickets = await notification_service.send_push(
                user_id=uid,
                title=body.title,
                body=body.body,
                data={"type": "admin_broadcast", "target": body.target},
            )
            if tickets:
                sent_count += 1
        except Exception as exc:
            logger.warning(
                "ADMIN: broadcast notification failed for user %s: %s", uid, exc,
            )
            failed_count += 1

    logger.info(
        "ADMIN: user %s broadcast notification to %d users (target=%s, sent=%d, failed=%d): %r",
        admin.id, len(user_ids), body.target, sent_count, failed_count, body.title,
    )

    return {
        "detail": "Broadcast sent",
        "target": body.target,
        "total_users": len(user_ids),
        "sent_to": sent_count,
        "failed": failed_count,
        "title": body.title,
    }


# Backward-compatible alias
@router.post("/broadcast-notification")
async def broadcast_notification_compat(
    body: BroadcastNotificationRequest,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    """Alias for /notifications/broadcast -- backward compatibility."""
    return await broadcast_notification(body, session, admin)


# ═══════════════════════════════════════════════════════════════════════════
# 10. EXPORT
# ═══════════════════════════════════════════════════════════════════════════


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


# ═══════════════════════════════════════════════════════════════════════════
# 11. FEEDBACK SUMMARY
# ═══════════════════════════════════════════════════════════════════════════


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
