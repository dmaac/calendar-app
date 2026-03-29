"""Admin API endpoints -- protected by is_admin flag on user.

All endpoints require authentication + admin privileges.

Sections:
  1. Dashboard API      -- KPIs, user metrics
  2. User Management    -- list, search, detail, toggle premium, gift, notify
  3. Subscription Mgmt  -- view, extend, cancel for a user
  4. Food Log Moderation-- view/delete flagged logs
  5. Revenue            -- MRR, churn, LTV, plan breakdown
  6. System Health      -- DB pool, response times, error rates, cache stats
  7. Error Log          -- DB-backed error log (replaces in-memory ring buffer)
  8. Content Management -- CRUD for nutrition tips and recipes
  9. Broadcast          -- notifications to all users
  10. Export            -- CSV user export
  11. Feedback          -- feedback summary
"""
import csv
import io
import logging
import sys
import time
import traceback
from datetime import date, datetime, time as dt_time, timedelta, timezone
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
from ..models.admin_error_log import AdminErrorLog
from ..models.admin_action_log import AdminActionLog
from ..routers.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _escape_like(s: str) -> str:
    """Escape special SQL LIKE/ILIKE metacharacters so they match literally."""
    return s.replace("%", "\\%").replace("_", "\\_")


# ─── DB-backed error logging ────────────────────────────────────────────────
# record_error() is called from exception handlers, middleware, or background
# tasks.  Errors are persisted to the admin_error_log table and pruned
# periodically.

_MAX_ERROR_LOG_ROWS = 10_000  # Pruning threshold


async def record_error(
    exc: Exception,
    context: str = "",
    severity: str = "error",
    user_id: Optional[int] = None,
    endpoint: Optional[str] = None,
    request_id: Optional[str] = None,
) -> None:
    """Persist an exception to the admin_error_log table.

    This function obtains its own session so it can be called from anywhere
    (middleware, background tasks, etc.) without requiring a caller-provided
    session.  Failures are logged but never propagated.
    """
    try:
        from ..core.database import AsyncSessionLocal

        tb = traceback.format_exception(type(exc), exc, exc.__traceback__)
        entry = AdminErrorLog(
            error_type=type(exc).__name__,
            message=str(exc)[:2000],
            context=context[:500] if context else "",
            stack_trace="".join(tb)[:10000],
            severity=severity,
            user_id=user_id,
            endpoint=endpoint,
            request_id=request_id,
        )
        async with AsyncSessionLocal() as session:
            session.add(entry)
            await session.commit()
    except Exception:
        # Never let error-logging crash the application
        logger.warning("Failed to persist error to admin_error_log", exc_info=True)


async def _log_admin_action(
    session: AsyncSession,
    admin_id: int,
    action: str,
    reason: Optional[str] = None,
    target_user_id: Optional[int] = None,
    details: Optional[dict] = None,
) -> None:
    """Record an admin action to the admin_action_log table."""
    entry = AdminActionLog(
        admin_id=admin_id,
        action=action,
        reason=reason,
        target_user_id=target_user_id,
        details=details,
    )
    session.add(entry)


# ─── Admin guard ────────────────────────────────────────────────────────────

async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Dependency that enforces admin access.

    Checks both authentication (via get_current_user) and the is_admin flag.
    Returns the admin User object for use in endpoint handlers.
    """
    if not getattr(current_user, "is_admin", False):
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
    reason: str = PydanticField(
        ..., min_length=1, max_length=1000,
        description="Reason for granting/revoking premium (required for audit)",
    )


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

class DBPoolStats(BaseModel):
    pool_size: int = 0
    checked_out: int = 0
    overflow: int = 0
    checked_in: int = 0


class APIResponseTimeStats(BaseModel):
    total_requests: int = 0
    total_errors: int = 0
    error_rate_pct: float = 0.0
    slow_requests: int = 0
    active_connections: int = 0
    active_users_24h: int = 0


class SystemHealthResponse(BaseModel):
    db_size_mb: Optional[float] = None
    db_connected: bool
    db_table_count: int = 0
    db_pool: DBPoolStats = DBPoolStats()
    api_stats: APIResponseTimeStats = APIResponseTimeStats()
    redis_connected: bool
    redis_keys: int = 0
    cache_hits: int = 0
    cache_misses: int = 0
    cache_hit_ratio: float = 0.0
    uptime_seconds: float = 0.0
    python_version: str
    error_count_24h: int = 0


class ErrorLogEntry(BaseModel):
    id: int
    timestamp: str
    error_type: str
    message: str
    context: str
    severity: str
    stack_trace: Optional[str] = None
    user_id: Optional[int] = None
    endpoint: Optional[str] = None


class PaginatedErrorLog(BaseModel):
    items: list[ErrorLogEntry]
    total: int
    page: int
    page_size: int


# ─── Subscription management schemas ─────────────────────────────────────

class SubscriptionDetail(BaseModel):
    id: int
    plan: str
    status: str
    price_paid: Optional[float] = None
    currency: str
    store: Optional[str] = None
    trial_ends_at: Optional[datetime] = None
    current_period_ends_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class ExtendSubscriptionRequest(BaseModel):
    days: int = PydanticField(..., ge=1, le=3650)
    reason: str = PydanticField(..., min_length=1, max_length=1000)


class CancelSubscriptionRequest(BaseModel):
    reason: str = PydanticField(..., min_length=1, max_length=1000)


# ─── Food log moderation schemas ─────────────────────────────────────────

class FoodLogModerationItem(BaseModel):
    id: int
    user_id: int
    food_name: str
    calories: float
    protein_g: float
    carbs_g: float
    fats_g: float
    meal_type: str
    ai_provider: Optional[str] = None
    ai_confidence: Optional[float] = None
    was_edited: bool
    logged_at: datetime
    image_url: Optional[str] = None
    notes: Optional[str] = None


class PaginatedFoodLogs(BaseModel):
    items: list[FoodLogModerationItem]
    total: int
    page: int
    page_size: int


class DeleteFoodLogRequest(BaseModel):
    reason: str = PydanticField(..., min_length=1, max_length=1000)


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


# ─── Admin action log schema ─────────────────────────────────────────────

class AdminActionLogEntry(BaseModel):
    id: int
    admin_id: int
    action: str
    reason: Optional[str] = None
    target_user_id: Optional[int] = None
    details: Optional[dict] = None
    created_at: datetime


class PaginatedAdminActions(BaseModel):
    items: list[AdminActionLogEntry]
    total: int
    page: int
    page_size: int


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
            AIFoodLog.deleted_at.is_(None),
        )
    )
    dau = dau_result.scalar() or 0

    # Premium %
    premium_result = await session.execute(
        select(func.count(User.id)).where(User.is_premium == True)  # noqa: E712
    )
    premium_count = premium_result.scalar() or 0
    premium_pct = round((premium_count / total_users * 100) if total_users > 0 else 0.0, 1)

    # Average NutriScore -- approximated as protein ratio, scaled
    nutri_result = await session.execute(
        select(
            func.avg(AIFoodLog.protein_g),
            func.avg(AIFoodLog.calories),
        ).where(
            AIFoodLog.logged_at >= week_ago,
            AIFoodLog.deleted_at.is_(None),
        )
    )
    row = nutri_result.one_or_none()
    avg_protein = float(row[0] or 0) if row else 0.0
    avg_cals = float(row[1] or 0) if row else 0.0
    if avg_cals > 0:
        protein_cal_ratio = (avg_protein * 4) / avg_cals
        avg_nutri_score = round(min(protein_cal_ratio * 100 * 3, 100), 1)
    else:
        avg_nutri_score = 0.0

    # Top 10 logged foods (last 7 days)
    top_foods_result = await session.execute(
        select(AIFoodLog.food_name, func.count(AIFoodLog.id).label("cnt"))
        .where(AIFoodLog.logged_at >= week_ago, AIFoodLog.deleted_at.is_(None))
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
    total_logs_result = await session.execute(select(func.count(AIFoodLog.id)).where(AIFoodLog.deleted_at.is_(None)))
    total_food_logs = total_logs_result.scalar() or 0

    # Total food logs today
    today_logs_result = await session.execute(
        select(func.count(AIFoodLog.id)).where(
            AIFoodLog.logged_at >= today_start,
            AIFoodLog.logged_at <= today_end,
            AIFoodLog.deleted_at.is_(None),
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
    """Paginated list of users with filters and search."""
    query = select(User)

    # Apply filters
    if premium is not None:
        query = query.where(User.is_premium == premium)
    if active is not None:
        query = query.where(User.is_active == active)
    if provider is not None:
        query = query.where(User.provider == provider)
    if search:
        like_pattern = f"%{_escape_like(search)}%"
        query = query.where(
            (User.email.ilike(like_pattern))
            | (User.first_name.ilike(like_pattern))
            | (User.last_name.ilike(like_pattern))
        )

    # Count total (uses COUNT on a subquery, never loads rows)
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await session.execute(count_query)
    total = total_result.scalar() or 0

    # Sort -- validate sort_by against allowed columns to prevent injection
    _ALLOWED_SORT_COLUMNS = {
        "created_at", "email", "first_name", "last_name",
        "is_premium", "is_active", "id",
    }
    if sort_by not in _ALLOWED_SORT_COLUMNS:
        sort_by = "created_at"
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


@router.get("/users/search")
async def search_users_by_email(
    email: str = Query(..., min_length=1, description="Email address (exact or partial)"),
    exact: bool = Query(False, description="Use exact match instead of partial"),
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
):
    """Search for users by email address.

    By default performs a case-insensitive partial match (ILIKE).
    Set exact=true for exact match.  Returns up to 20 results.
    """
    if exact:
        query = select(User).where(func.lower(User.email) == email.lower())
    else:
        query = select(User).where(User.email.ilike(f"%{_escape_like(email)}%"))

    query = query.order_by(User.created_at.desc()).limit(20)

    result = await session.execute(query)
    users = result.scalars().all()

    return {
        "results": [
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
        "count": len(users),
        "query": email,
        "exact": exact,
    }


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
        select(func.count(AIFoodLog.id)).where(AIFoodLog.user_id == user_id, AIFoodLog.deleted_at.is_(None))
    )
    total_food_logs = total_logs_result.scalar() or 0

    today_logs_result = await session.execute(
        select(func.count(AIFoodLog.id)).where(
            AIFoodLog.user_id == user_id,
            AIFoodLog.logged_at >= today_start,
            AIFoodLog.logged_at <= today_end,
            AIFoodLog.deleted_at.is_(None),
        )
    )
    total_meals_today = today_logs_result.scalar() or 0

    last_active_result = await session.execute(
        select(func.max(AIFoodLog.logged_at)).where(AIFoodLog.user_id == user_id, AIFoodLog.deleted_at.is_(None))
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
    """Grant or revoke premium status for a user.

    Requires a reason for audit trail.  When enabling, creates a subscription
    record.  When disabling, cancels all active subscriptions.
    All actions are logged to admin_action_log.
    """
    user = await session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    now = datetime.now(timezone.utc)
    old_premium = user.is_premium
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

    # Log the admin action with reason
    await _log_admin_action(
        session,
        admin_id=admin.id,
        action="premium_toggle",
        reason=body.reason,
        target_user_id=user_id,
        details={
            "old_premium": old_premium,
            "new_premium": body.is_premium,
        },
    )

    await session.commit()

    logger.info(
        "ADMIN: user %s toggled premium for user %s to %s (reason: %s)",
        admin.id, user_id, body.is_premium, body.reason,
    )

    return {
        "detail": f"Premium {'enabled' if body.is_premium else 'disabled'}",
        "user_id": user_id,
        "is_premium": body.is_premium,
        "reason": body.reason,
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

    now = datetime.now(timezone.utc)
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

    await _log_admin_action(
        session,
        admin_id=admin.id,
        action="gift_premium",
        reason=body.reason,
        target_user_id=user_id,
        details={"days": body.days, "expires_at": expires_at.isoformat()},
    )

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
# 4. SUBSCRIPTION MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════


@router.get("/users/{user_id}/subscriptions", response_model=list[SubscriptionDetail])
async def get_user_subscriptions(
    user_id: int,
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
):
    """List all subscriptions for a user, ordered by creation date descending."""
    user = await session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    result = await session.execute(
        select(Subscription)
        .where(Subscription.user_id == user_id)
        .order_by(Subscription.created_at.desc())
    )
    subs = result.scalars().all()

    return [
        SubscriptionDetail(
            id=s.id,
            plan=s.plan,
            status=s.status,
            price_paid=s.price_paid,
            currency=s.currency,
            store=s.store,
            trial_ends_at=s.trial_ends_at,
            current_period_ends_at=s.current_period_ends_at,
            created_at=s.created_at,
            updated_at=s.updated_at,
        )
        for s in subs
    ]


@router.post("/subscriptions/{subscription_id}/extend")
async def extend_subscription(
    subscription_id: int,
    body: ExtendSubscriptionRequest,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    """Extend an existing subscription's expiry date by N days."""
    sub = await session.get(Subscription, subscription_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")

    now = datetime.now(timezone.utc)

    # Calculate new expiry: extend from current expiry or from now if expired
    current_expiry = sub.current_period_ends_at or now
    if current_expiry < now:
        current_expiry = now

    new_expiry = current_expiry + timedelta(days=body.days)
    old_expiry = sub.current_period_ends_at

    sub.current_period_ends_at = new_expiry
    sub.status = "active"
    sub.updated_at = now
    session.add(sub)

    # Also ensure user has premium flag
    user = await session.get(User, sub.user_id)
    if user and not user.is_premium:
        user.is_premium = True
        user.updated_at = now
        session.add(user)

    await _log_admin_action(
        session,
        admin_id=admin.id,
        action="subscription_extend",
        reason=body.reason,
        target_user_id=sub.user_id,
        details={
            "subscription_id": subscription_id,
            "days_added": body.days,
            "old_expiry": old_expiry.isoformat() if old_expiry else None,
            "new_expiry": new_expiry.isoformat(),
        },
    )

    await session.commit()

    logger.info(
        "ADMIN: user %s extended subscription %s by %d days (reason: %s)",
        admin.id, subscription_id, body.days, body.reason,
    )

    return {
        "detail": f"Subscription extended by {body.days} days",
        "subscription_id": subscription_id,
        "new_expiry": new_expiry.isoformat(),
        "extended_by": admin.id,
    }


@router.post("/subscriptions/{subscription_id}/cancel")
async def cancel_subscription(
    subscription_id: int,
    body: CancelSubscriptionRequest,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    """Cancel an active subscription with a required reason."""
    sub = await session.get(Subscription, subscription_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")

    if sub.status != "active":
        raise HTTPException(
            status_code=400,
            detail=f"Subscription is already {sub.status}, cannot cancel",
        )

    now = datetime.now(timezone.utc)
    old_status = sub.status
    sub.status = "canceled"
    sub.updated_at = now
    session.add(sub)

    # Check if user has other active subscriptions
    other_active_result = await session.execute(
        select(func.count(Subscription.id)).where(
            Subscription.user_id == sub.user_id,
            Subscription.status == "active",
            Subscription.id != subscription_id,
        )
    )
    other_active_count = other_active_result.scalar() or 0

    # If no other active subscriptions, revoke premium
    if other_active_count == 0:
        user = await session.get(User, sub.user_id)
        if user and user.is_premium:
            user.is_premium = False
            user.updated_at = now
            session.add(user)

    await _log_admin_action(
        session,
        admin_id=admin.id,
        action="subscription_cancel",
        reason=body.reason,
        target_user_id=sub.user_id,
        details={
            "subscription_id": subscription_id,
            "plan": sub.plan,
            "old_status": old_status,
            "premium_revoked": other_active_count == 0,
        },
    )

    await session.commit()

    logger.info(
        "ADMIN: user %s canceled subscription %s (reason: %s)",
        admin.id, subscription_id, body.reason,
    )

    return {
        "detail": "Subscription canceled",
        "subscription_id": subscription_id,
        "premium_revoked": other_active_count == 0,
        "canceled_by": admin.id,
    }


# ═══════════════════════════════════════════════════════════════════════════
# 5. FOOD LOG MODERATION
# ═══════════════════════════════════════════════════════════════════════════


@router.get("/food-logs", response_model=PaginatedFoodLogs)
async def list_food_logs_for_moderation(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user_id: Optional[int] = Query(None, description="Filter by user ID"),
    flagged_only: bool = Query(False, description="Only show low-confidence or edited logs"),
    low_confidence_threshold: float = Query(
        0.5, ge=0.0, le=1.0,
        description="AI confidence threshold below which a log is considered flagged",
    ),
    meal_type: Optional[str] = Query(None, description="Filter by meal type"),
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
):
    """List food logs for moderation, with optional flagged-only filter.

    Flagged logs are those with:
    - AI confidence below the threshold (default 0.5)
    - Logs that were manually edited by the user (was_edited=true)
    - Logs with suspiciously high/low calorie values
    """
    query = select(AIFoodLog).where(AIFoodLog.deleted_at.is_(None))

    if user_id is not None:
        query = query.where(AIFoodLog.user_id == user_id)
    if meal_type:
        query = query.where(AIFoodLog.meal_type == meal_type)

    if flagged_only:
        from sqlalchemy import or_
        query = query.where(
            or_(
                AIFoodLog.ai_confidence < low_confidence_threshold,
                AIFoodLog.ai_confidence.is_(None),
                AIFoodLog.was_edited == True,  # noqa: E712
                AIFoodLog.calories > 5000,
                AIFoodLog.calories < 1,
            )
        )

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await session.execute(count_query)
    total = total_result.scalar() or 0

    # Paginate
    query = query.order_by(AIFoodLog.logged_at.desc())
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    result = await session.execute(query)
    logs = result.scalars().all()

    return PaginatedFoodLogs(
        items=[
            FoodLogModerationItem(
                id=log.id,
                user_id=log.user_id,
                food_name=log.food_name,
                calories=log.calories,
                protein_g=log.protein_g,
                carbs_g=log.carbs_g,
                fats_g=log.fats_g,
                meal_type=log.meal_type,
                ai_provider=log.ai_provider,
                ai_confidence=log.ai_confidence,
                was_edited=log.was_edited,
                logged_at=log.logged_at,
                image_url=log.image_url,
                notes=log.notes,
            )
            for log in logs
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.delete("/food-logs/{log_id}")
async def delete_food_log(
    log_id: int,
    body: DeleteFoodLogRequest,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    """Soft-delete a food log entry with a required reason.

    Uses the SoftDeleteMixin to mark the record as deleted rather than
    physically removing it.  The deletion is logged to admin_action_log.
    """
    log = await session.get(AIFoodLog, log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Food log not found")

    if log.is_deleted:
        raise HTTPException(status_code=400, detail="Food log is already deleted")

    log.mark_deleted(acting_user_id=admin.id)
    session.add(log)

    await _log_admin_action(
        session,
        admin_id=admin.id,
        action="food_log_delete",
        reason=body.reason,
        target_user_id=log.user_id,
        details={
            "food_log_id": log_id,
            "food_name": log.food_name,
            "calories": log.calories,
            "meal_type": log.meal_type,
            "logged_at": log.logged_at.isoformat(),
        },
    )

    await session.commit()

    logger.info(
        "ADMIN: user %s soft-deleted food log %s (reason: %s)",
        admin.id, log_id, body.reason,
    )

    return {
        "detail": "Food log deleted",
        "log_id": log_id,
        "deleted_by": admin.id,
    }


# ═══════════════════════════════════════════════════════════════════════════
# 6. METRICS (legacy endpoint -- kept for backward compat)
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
            AIFoodLog.deleted_at.is_(None),
        )
    )
    dau = dau_result.scalar() or 0

    # MAU
    mau_result = await session.execute(
        select(func.count(func.distinct(AIFoodLog.user_id))).where(
            AIFoodLog.logged_at >= thirty_days_ago,
            AIFoodLog.deleted_at.is_(None),
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
            AIFoodLog.deleted_at.is_(None),
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
                  AND prev.deleted_at IS NULL AND curr.deleted_at IS NULL
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
                AIFoodLog.deleted_at.is_(None),
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
# 7. REVENUE API (enhanced)
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

    # MRR
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

    # LTV = ARPU / churn_rate
    arpu = actual_this_month / active_subs if active_subs > 0 else 0.0
    ltv = round(arpu / churn_rate, 2) if churn_rate > 0 else round(arpu * 24, 2)

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
# 8. SYSTEM HEALTH API (enhanced with pool stats + response times)
# ═══════════════════════════════════════════════════════════════════════════


@router.get("/system", response_model=SystemHealthResponse)
async def get_system_health(
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
):
    """System health dashboard: DB pool stats, API response times, error rates, cache stats."""
    from ..core.database import async_engine

    # DB connection check
    db_connected = False
    db_size_mb = None
    db_table_count = 0
    try:
        result = await session.execute(sa_text("SELECT 1"))
        db_connected = True

        # DB size (PostgreSQL)
        try:
            size_result = await session.execute(
                sa_text("SELECT pg_database_size(current_database())")
            )
            size_bytes = size_result.scalar()
            if size_bytes is not None:
                db_size_mb = round(size_bytes / (1024 * 1024), 2)
        except Exception:
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
            try:
                table_result = await session.execute(
                    sa_text("SELECT count(*) FROM sqlite_master WHERE type='table'")
                )
                db_table_count = table_result.scalar() or 0
            except Exception:
                pass

    except Exception as exc:
        logger.warning("System health: DB check failed -- %s", exc)

    # DB connection pool statistics
    db_pool = DBPoolStats()
    try:
        pool = async_engine.pool
        db_pool = DBPoolStats(
            pool_size=pool.size(),
            checked_out=pool.checkedout(),
            overflow=pool.overflow(),
            checked_in=pool.checkedin(),
        )
    except Exception:
        pass

    # API response time / error rate stats from Prometheus metrics
    api_stats = APIResponseTimeStats()
    try:
        from ..core.metrics import (
            REQUEST_COUNT,
            ERROR_COUNT,
            SLOW_REQUEST_COUNT,
            ACTIVE_CONNECTIONS,
            get_active_user_count,
        )
        total_requests = int(REQUEST_COUNT.total())
        total_errors = int(ERROR_COUNT.total())
        error_rate = (total_errors / total_requests * 100) if total_requests > 0 else 0.0

        api_stats = APIResponseTimeStats(
            total_requests=total_requests,
            total_errors=total_errors,
            error_rate_pct=round(error_rate, 2),
            slow_requests=int(SLOW_REQUEST_COUNT.total()),
            active_connections=int(ACTIVE_CONNECTIONS.get()),
            active_users_24h=get_active_user_count(),
        )
    except Exception:
        pass

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

    # Error count in last 24h from DB
    error_count_24h = 0
    try:
        twenty_four_hours_ago = datetime.now(timezone.utc) - timedelta(hours=24)
        error_count_result = await session.execute(
            select(func.count(AdminErrorLog.id)).where(
                AdminErrorLog.created_at >= twenty_four_hours_ago,
            )
        )
        error_count_24h = error_count_result.scalar() or 0
    except Exception:
        pass

    return SystemHealthResponse(
        db_size_mb=db_size_mb,
        db_connected=db_connected,
        db_table_count=db_table_count,
        db_pool=db_pool,
        api_stats=api_stats,
        redis_connected=redis_connected,
        redis_keys=redis_keys,
        cache_hits=cache_hits,
        cache_misses=cache_misses,
        cache_hit_ratio=cache_hit_ratio,
        uptime_seconds=uptime_seconds,
        python_version=sys.version,
        error_count_24h=error_count_24h,
    )


# ═══════════════════════════════════════════════════════════════════════════
# 9. ERROR LOG (DB-backed)
# ═══════════════════════════════════════════════════════════════════════════


@router.get("/errors", response_model=PaginatedErrorLog)
async def get_error_log(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    severity: Optional[str] = Query(None, description="Filter by severity: error, warning, critical"),
    error_type: Optional[str] = Query(None, description="Filter by exception type"),
    context: Optional[str] = Query(None, description="Search in context field"),
    hours: int = Query(24, ge=1, le=720, description="Only show errors from the last N hours"),
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
):
    """Return paginated, filterable application errors from the DB.

    Replaces the old in-memory ring buffer with a persistent, queryable log.
    """
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    query = select(AdminErrorLog).where(AdminErrorLog.created_at >= since)

    if severity:
        query = query.where(AdminErrorLog.severity == severity)
    if error_type:
        query = query.where(AdminErrorLog.error_type.ilike(f"%{_escape_like(error_type)}%"))
    if context:
        query = query.where(AdminErrorLog.context.ilike(f"%{_escape_like(context)}%"))

    # Count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await session.execute(count_query)
    total = total_result.scalar() or 0

    # Paginate (most recent first)
    query = query.order_by(AdminErrorLog.created_at.desc())
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    result = await session.execute(query)
    entries = result.scalars().all()

    return PaginatedErrorLog(
        items=[
            ErrorLogEntry(
                id=e.id,
                timestamp=e.created_at.isoformat(),
                error_type=e.error_type,
                message=e.message,
                context=e.context,
                severity=e.severity,
                stack_trace=e.stack_trace,
                user_id=e.user_id,
                endpoint=e.endpoint,
            )
            for e in entries
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.delete("/errors/prune")
async def prune_error_log(
    keep_last: int = Query(1000, ge=100, le=50000, description="Number of recent errors to keep"),
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    """Prune old error log entries, keeping only the N most recent."""
    # Find the ID threshold
    threshold_result = await session.execute(
        select(AdminErrorLog.id)
        .order_by(AdminErrorLog.created_at.desc())
        .offset(keep_last)
        .limit(1)
    )
    threshold_id = threshold_result.scalar()

    if threshold_id is None:
        return {"detail": "Nothing to prune", "deleted": 0}

    # Delete older entries
    delete_result = await session.execute(
        sa_text("DELETE FROM admin_error_log WHERE id <= :threshold_id"),
        {"threshold_id": threshold_id},
    )
    await session.commit()

    deleted_count = delete_result.rowcount or 0

    logger.info(
        "ADMIN: user %s pruned error log, kept last %d, deleted %d",
        admin.id, keep_last, deleted_count,
    )

    return {
        "detail": f"Pruned {deleted_count} old error log entries",
        "deleted": deleted_count,
        "kept": keep_last,
    }


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
# 10. ADMIN ACTION LOG
# ═══════════════════════════════════════════════════════════════════════════


@router.get("/actions", response_model=PaginatedAdminActions)
async def list_admin_actions(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    admin_id: Optional[int] = Query(None, description="Filter by admin who performed the action"),
    action: Optional[str] = Query(None, description="Filter by action type"),
    target_user_id: Optional[int] = Query(None, description="Filter by target user"),
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
):
    """List admin actions with filtering and pagination."""
    query = select(AdminActionLog)

    if admin_id is not None:
        query = query.where(AdminActionLog.admin_id == admin_id)
    if action:
        query = query.where(AdminActionLog.action == action)
    if target_user_id is not None:
        query = query.where(AdminActionLog.target_user_id == target_user_id)

    # Count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await session.execute(count_query)
    total = total_result.scalar() or 0

    # Paginate
    query = query.order_by(AdminActionLog.created_at.desc())
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    result = await session.execute(query)
    actions = result.scalars().all()

    return PaginatedAdminActions(
        items=[
            AdminActionLogEntry(
                id=a.id,
                admin_id=a.admin_id,
                action=a.action,
                reason=a.reason,
                target_user_id=a.target_user_id,
                details=a.details,
                created_at=a.created_at,
            )
            for a in actions
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


# ═══════════════════════════════════════════════════════════════════════════
# 11. CONTENT MANAGEMENT -- NUTRITION TIPS
# ═══════════════════════════════════════════════════════════════════════════


@router.post("/tips", response_model=NutritionTipResponse, status_code=201)
async def create_tip(
    body: NutritionTipCreate,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    """Create a new nutrition tip."""
    now = datetime.now(timezone.utc)
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
    tip.updated_at = datetime.now(timezone.utc)
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
# 12. CONTENT MANAGEMENT -- RECIPES
# ═══════════════════════════════════════════════════════════════════════════


@router.post("/recipes", response_model=RecipeResponse, status_code=201)
async def create_recipe(
    body: RecipeCreate,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    """Create a new recipe."""
    now = datetime.now(timezone.utc)
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
    recipe.updated_at = datetime.now(timezone.utc)
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
# 13. BROADCAST NOTIFICATIONS
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
# 14. EXPORT
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
# 15. FEEDBACK SUMMARY
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
