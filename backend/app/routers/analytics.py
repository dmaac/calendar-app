"""
Analytics router -- Admin product metrics + per-user analytics endpoints
--------------------------------------------------------------------------
Admin (require_admin):
    GET /api/analytics/summary          -- DAU, WAU, MAU, retention, feature usage, revenue
    GET /api/analytics/cohorts          -- cohort analysis (users by signup week, retention)
    GET /api/analytics/revenue          -- MRR, active subscriptions, conversion rate, trends

User-facing (authenticated):
    GET /api/analytics/me                  -- full analytics bundle
    GET /api/analytics/me/trends           -- weekly/monthly calorie trends
    GET /api/analytics/me/macro-balance    -- macro adherence scoring
    GET /api/analytics/me/streaks          -- streak statistics
    GET /api/analytics/me/top-foods        -- most-eaten foods ranking
    GET /api/analytics/me/meal-timing      -- meal timing analysis
    GET /api/analytics/me/consistency      -- calorie consistency score
    GET /api/analytics/me/goal-progress    -- progress toward goal
"""

import logging
from datetime import date, datetime, time as dt_time, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, text as sa_text
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..core.cache import cache_get, cache_set, CACHE_TTL
from ..core.database import get_session
from ..models.ai_food_log import AIFoodLog
from ..models.subscription import Subscription
from ..models.user import User
from ..models.workout import WorkoutLog
from ..services.insights_service import (
    get_calorie_consistency,
    get_calorie_trends,
    get_full_user_analytics,
    get_goal_progress,
    get_macro_balance_score,
    get_meal_timing_analysis,
    get_most_eaten_foods,
    get_streak_statistics,
)
from ..core.dependencies import require_premium
from .auth import get_current_user
from .admin import require_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


# ─── Response schemas ────────────────────────────────────────────────────────


class RetentionMetrics(BaseModel):
    d1: float  # % of users active day after signup
    d7: float
    d30: float


class FeatureUsage(BaseModel):
    ai_food_scans: int
    manual_food_logs: int
    workouts_logged: int
    total_users_with_meals: int
    total_users_with_workouts: int


class RevenueMetrics(BaseModel):
    total_subscribers: int
    active_subscribers: int
    monthly_subscribers: int
    annual_subscribers: int
    lifetime_subscribers: int
    total_revenue: Optional[float] = None


class AnalyticsSummary(BaseModel):
    generated_at: datetime
    dau: int  # Daily Active Users
    wau: int  # Weekly Active Users
    mau: int  # Monthly Active Users
    total_users: int
    retention: RetentionMetrics
    feature_usage: FeatureUsage
    revenue: RevenueMetrics


# ─── Cohort analysis schemas ────────────────────────────────────────────────

class CohortWeek(BaseModel):
    week_start: str  # ISO date of the Monday
    signups: int
    retained_w1: int  # active in week 1 after signup
    retained_w2: int
    retained_w4: int
    retention_w1_pct: float
    retention_w2_pct: float
    retention_w4_pct: float


class CohortAnalysisResponse(BaseModel):
    generated_at: datetime
    cohorts: list[CohortWeek]
    total_cohorts: int


# ─── Revenue analytics schemas ──────────────────────────────────────────────

class RevenueAnalyticsResponse(BaseModel):
    generated_at: datetime
    mrr: float
    active_subscriptions: int
    total_users: int
    paying_users: int
    conversion_rate_pct: float
    arpu: float  # Average Revenue Per User (paying)
    monthly_trend: list[dict]  # [{month, revenue, new_subs, churned}]


# ─── Admin helpers ───────────────────────────────────────────────────────────

_ADMIN_SUMMARY_TTL = 120      # 2 minutes
_COHORT_TTL = 300              # 5 minutes
_REVENUE_ANALYTICS_TTL = 180   # 3 minutes


async def _count_active_users(
    session: AsyncSession, since: datetime
) -> int:
    """Count distinct users who logged food since the given datetime.

    Uses COUNT(DISTINCT ...) -- never loads user objects into memory.
    """
    result = await session.execute(
        select(func.count(func.distinct(AIFoodLog.user_id))).where(
            AIFoodLog.logged_at >= since,
            AIFoodLog.deleted_at.is_(None),
        )
    )
    return result.scalar() or 0


async def _compute_retention(
    session: AsyncSession, today: date, days_ago: int
) -> float:
    """
    Compute retention for users who signed up exactly `days_ago` days ago.
    Retention = (users who were active on day N) / (users who signed up on day N-ago).

    Uses COUNT-based queries exclusively -- no objects loaded into memory.
    """
    signup_date = today - timedelta(days=days_ago)
    signup_start = datetime.combine(signup_date, dt_time.min)
    signup_end = datetime.combine(signup_date, dt_time.max)

    # Users who signed up on that day (COUNT query)
    signup_result = await session.execute(
        select(func.count(User.id)).where(
            User.created_at >= signup_start,
            User.created_at <= signup_end,
        )
    )
    cohort_size = signup_result.scalar() or 0
    if cohort_size == 0:
        return 0.0

    # Of those users, how many were active today (COUNT with subquery)
    today_start = datetime.combine(today, dt_time.min)
    today_end = datetime.combine(today, dt_time.max)

    retained_result = await session.execute(
        select(func.count(func.distinct(AIFoodLog.user_id))).where(
            AIFoodLog.logged_at >= today_start,
            AIFoodLog.logged_at <= today_end,
            AIFoodLog.deleted_at.is_(None),
            AIFoodLog.user_id.in_(
                select(User.id).where(
                    User.created_at >= signup_start,
                    User.created_at <= signup_end,
                )
            ),
        )
    )
    retained = retained_result.scalar() or 0
    return round(retained / cohort_size, 4)


# ─── Admin endpoint ─────────────────────────────────────────────────────────


@router.get("/summary", response_model=AnalyticsSummary)
async def analytics_summary(
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """
    Aggregated analytics summary: DAU, WAU, MAU, retention, feature usage, revenue.
    Requires admin privileges. Cached for 2 minutes to reduce DB load.
    """
    try:
        # Check cache first
        cache_key = "admin:analytics:summary"
        cached_val = await cache_get(cache_key)
        if cached_val is not None:
            return AnalyticsSummary(**cached_val)

        result = await _compute_analytics_summary(session)

        # Cache the computed result
        await cache_set(cache_key, result.model_dump(mode="json"), _ADMIN_SUMMARY_TTL)
        return result
    except Exception:
        logger.exception("Analytics summary computation failed")
        raise HTTPException(
            status_code=500,
            detail="Failed to compute analytics summary. Please try again later.",
        )


async def _compute_analytics_summary(session: AsyncSession) -> AnalyticsSummary:
    """Internal implementation -- all queries use COUNT/SUM aggregations."""
    today = date.today()
    now = datetime.utcnow()

    today_start = datetime.combine(today, dt_time.min)
    week_ago = datetime.combine(today - timedelta(days=7), dt_time.min)
    month_ago = datetime.combine(today - timedelta(days=30), dt_time.min)

    # ── Active users (COUNT queries) ─────────────────────────────────────
    dau = await _count_active_users(session, today_start)
    wau = await _count_active_users(session, week_ago)
    mau = await _count_active_users(session, month_ago)

    # ── Total users (COUNT query) ────────────────────────────────────────
    total_result = await session.execute(select(func.count(User.id)))
    total_users = total_result.scalar() or 0

    # ── Retention ────────────────────────────────────────────────────────
    d1 = await _compute_retention(session, today, 1)
    d7 = await _compute_retention(session, today, 7)
    d30 = await _compute_retention(session, today, 30)

    # ── Feature usage (last 30 days) -- single aggregation query ─────────
    feature_q = select(
        func.count(AIFoodLog.id).filter(AIFoodLog.ai_provider.isnot(None)).label("ai_scans"),
        func.count(AIFoodLog.id).filter(AIFoodLog.ai_provider.is_(None)).label("manual_logs"),
        func.count(func.distinct(AIFoodLog.user_id)).label("users_with_meals"),
    ).where(AIFoodLog.logged_at >= month_ago, AIFoodLog.deleted_at.is_(None))

    feature_result = await session.execute(feature_q)
    fr = feature_result.first()

    ai_food_scans = int(fr.ai_scans) if fr else 0
    manual_food_logs = int(fr.manual_logs) if fr else 0
    total_users_with_meals = int(fr.users_with_meals) if fr else 0

    # Workouts (single aggregation query)
    workouts_q = select(
        func.count(WorkoutLog.id).label("total"),
        func.count(func.distinct(WorkoutLog.user_id)).label("users"),
    ).where(WorkoutLog.created_at >= month_ago)

    workouts_result = await session.execute(workouts_q)
    wr = workouts_result.first()
    workouts_logged = int(wr.total) if wr else 0
    total_users_with_workouts = int(wr.users) if wr else 0

    # ── Revenue / Subscriptions -- single aggregation query ──────────────
    subs_q = select(
        func.count(Subscription.id).label("total"),
        func.count(Subscription.id).filter(
            Subscription.status == "active"
        ).label("active"),
        func.count(Subscription.id).filter(
            Subscription.status == "active",
            Subscription.plan == "monthly",
        ).label("monthly"),
        func.count(Subscription.id).filter(
            Subscription.status == "active",
            Subscription.plan == "annual",
        ).label("annual"),
        func.count(Subscription.id).filter(
            Subscription.status == "active",
            Subscription.plan == "lifetime",
        ).label("lifetime"),
        func.coalesce(
            func.sum(Subscription.price_paid).filter(
                Subscription.status.in_(["active", "expired"])
            ),
            0.0,
        ).label("revenue"),
    )

    subs_result = await session.execute(subs_q)
    sr = subs_result.first()

    return AnalyticsSummary(
        generated_at=now,
        dau=dau,
        wau=wau,
        mau=mau,
        total_users=total_users,
        retention=RetentionMetrics(d1=d1, d7=d7, d30=d30),
        feature_usage=FeatureUsage(
            ai_food_scans=ai_food_scans,
            manual_food_logs=manual_food_logs,
            workouts_logged=workouts_logged,
            total_users_with_meals=total_users_with_meals,
            total_users_with_workouts=total_users_with_workouts,
        ),
        revenue=RevenueMetrics(
            total_subscribers=int(sr.total) if sr else 0,
            active_subscribers=int(sr.active) if sr else 0,
            monthly_subscribers=int(sr.monthly) if sr else 0,
            annual_subscribers=int(sr.annual) if sr else 0,
            lifetime_subscribers=int(sr.lifetime) if sr else 0,
            total_revenue=round(float(sr.revenue), 2) if sr else 0.0,
        ),
    )


# ═══════════════════════════════════════════════════════════════════════════
# COHORT ANALYSIS
# ═══════════════════════════════════════════════════════════════════════════


@router.get("/cohorts", response_model=CohortAnalysisResponse)
async def cohort_analysis(
    weeks: int = Query(12, ge=1, le=52, description="Number of weekly cohorts to analyze"),
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """Cohort analysis: users grouped by signup week with retention at weeks 1, 2, and 4.

    All queries use COUNT-based aggregations. Results are cached for 5 minutes.
    """
    cache_key = f"admin:analytics:cohorts:{weeks}"
    cached_val = await cache_get(cache_key)
    if cached_val is not None:
        return CohortAnalysisResponse(**cached_val)

    today = date.today()
    now = datetime.utcnow()
    cohorts: list[CohortWeek] = []

    for week_offset in range(weeks):
        # Calculate the Monday of each cohort week
        # week_offset=0 is the most recent completed week
        days_back = (today.weekday() + 7 * (week_offset + 1))
        week_monday = today - timedelta(days=days_back)
        week_sunday = week_monday + timedelta(days=6)

        week_start_dt = datetime.combine(week_monday, dt_time.min)
        week_end_dt = datetime.combine(week_sunday, dt_time.max)

        # Count signups in this week (COUNT query)
        signup_result = await session.execute(
            select(func.count(User.id)).where(
                User.created_at >= week_start_dt,
                User.created_at <= week_end_dt,
            )
        )
        signups = signup_result.scalar() or 0

        if signups == 0:
            cohorts.append(CohortWeek(
                week_start=week_monday.isoformat(),
                signups=0,
                retained_w1=0, retained_w2=0, retained_w4=0,
                retention_w1_pct=0.0, retention_w2_pct=0.0, retention_w4_pct=0.0,
            ))
            continue

        # Subquery: user IDs who signed up in this week
        cohort_user_ids = select(User.id).where(
            User.created_at >= week_start_dt,
            User.created_at <= week_end_dt,
        )

        # Week 1 retention (7-13 days after signup week)
        w1_start = datetime.combine(week_monday + timedelta(days=7), dt_time.min)
        w1_end = datetime.combine(week_monday + timedelta(days=13), dt_time.max)

        # Week 2 retention (14-20 days after)
        w2_start = datetime.combine(week_monday + timedelta(days=14), dt_time.min)
        w2_end = datetime.combine(week_monday + timedelta(days=20), dt_time.max)

        # Week 4 retention (28-34 days after)
        w4_start = datetime.combine(week_monday + timedelta(days=28), dt_time.min)
        w4_end = datetime.combine(week_monday + timedelta(days=34), dt_time.max)

        async def _count_retained(start: datetime, end: datetime) -> int:
            if end.date() > today:
                return 0
            r = await session.execute(
                select(func.count(func.distinct(AIFoodLog.user_id))).where(
                    AIFoodLog.logged_at >= start,
                    AIFoodLog.logged_at <= end,
                    AIFoodLog.user_id.in_(cohort_user_ids),
                    AIFoodLog.deleted_at.is_(None),
                )
            )
            return r.scalar() or 0

        retained_w1 = await _count_retained(w1_start, w1_end)
        retained_w2 = await _count_retained(w2_start, w2_end)
        retained_w4 = await _count_retained(w4_start, w4_end)

        cohorts.append(CohortWeek(
            week_start=week_monday.isoformat(),
            signups=signups,
            retained_w1=retained_w1,
            retained_w2=retained_w2,
            retained_w4=retained_w4,
            retention_w1_pct=round(retained_w1 / signups * 100, 1) if signups > 0 else 0.0,
            retention_w2_pct=round(retained_w2 / signups * 100, 1) if signups > 0 else 0.0,
            retention_w4_pct=round(retained_w4 / signups * 100, 1) if signups > 0 else 0.0,
        ))

    result = CohortAnalysisResponse(
        generated_at=now,
        cohorts=cohorts,
        total_cohorts=len(cohorts),
    )

    await cache_set(cache_key, result.model_dump(mode="json"), _COHORT_TTL)
    return result


# ═══════════════════════════════════════════════════════════════════════════
# REVENUE METRICS
# ═══════════════════════════════════════════════════════════════════════════

_PLAN_PRICES = {
    "monthly": 9.99,
    "yearly": 59.99,
    "lifetime": 149.99,
}


@router.get("/revenue", response_model=RevenueAnalyticsResponse)
async def revenue_analytics(
    months: int = Query(6, ge=1, le=24, description="Number of months of trend data"),
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """Revenue analytics: MRR, conversion rate, ARPU, and monthly trends.

    All queries use COUNT/SUM aggregations. Results cached for 3 minutes.
    """
    cache_key = f"admin:analytics:revenue:{months}"
    cached_val = await cache_get(cache_key)
    if cached_val is not None:
        return RevenueAnalyticsResponse(**cached_val)

    now = datetime.utcnow()
    today = date.today()

    # ── Active subscriptions + MRR (single aggregation query) ────────────
    mrr_q = select(
        Subscription.plan,
        func.count(Subscription.id).label("cnt"),
    ).where(
        Subscription.status == "active",
    ).group_by(Subscription.plan)

    mrr_result = await session.execute(mrr_q)
    mrr = 0.0
    active_subscriptions = 0
    for plan, cnt in mrr_result.all():
        active_subscriptions += cnt
        price = _PLAN_PRICES.get(plan, 0.0)
        if plan == "yearly":
            mrr += cnt * (price / 12)
        elif plan == "lifetime":
            pass  # Lifetime does not contribute to MRR
        else:
            mrr += cnt * price

    mrr = round(mrr, 2)

    # ── Total users (COUNT) ──────────────────────────────────────────────
    total_users_result = await session.execute(select(func.count(User.id)))
    total_users = total_users_result.scalar() or 0

    # ── Paying users (COUNT DISTINCT) ────────────────────────────────────
    paying_result = await session.execute(
        select(func.count(func.distinct(Subscription.user_id))).where(
            Subscription.status == "active",
            Subscription.plan.in_(["monthly", "yearly", "lifetime"]),
        )
    )
    paying_users = paying_result.scalar() or 0

    # Conversion rate
    conversion_rate = round(
        (paying_users / total_users * 100) if total_users > 0 else 0.0, 2
    )

    # ARPU (average revenue per paying user, this month)
    month_start = datetime.combine(today.replace(day=1), dt_time.min)
    month_rev_result = await session.execute(
        select(func.coalesce(func.sum(Subscription.price_paid), 0.0)).where(
            Subscription.created_at >= month_start,
            Subscription.price_paid > 0,
        )
    )
    month_revenue = float(month_rev_result.scalar() or 0.0)
    arpu = round(month_revenue / paying_users, 2) if paying_users > 0 else 0.0

    # ── Monthly trend data (aggregation per month) ───────────────────────
    monthly_trend: list[dict] = []
    for month_offset in range(months):
        # Calculate month boundaries
        if month_offset == 0:
            m_start = today.replace(day=1)
        else:
            # Go back N months
            year = today.year
            month = today.month - month_offset
            while month <= 0:
                month += 12
                year -= 1
            m_start = date(year, month, 1)

        # End of month
        if m_start.month == 12:
            m_end = date(m_start.year + 1, 1, 1) - timedelta(days=1)
        else:
            m_end = date(m_start.year, m_start.month + 1, 1) - timedelta(days=1)

        m_start_dt = datetime.combine(m_start, dt_time.min)
        m_end_dt = datetime.combine(m_end, dt_time.max)

        # Revenue for this month (SUM aggregation)
        rev_result = await session.execute(
            select(func.coalesce(func.sum(Subscription.price_paid), 0.0)).where(
                Subscription.created_at >= m_start_dt,
                Subscription.created_at <= m_end_dt,
                Subscription.price_paid > 0,
            )
        )
        m_revenue = float(rev_result.scalar() or 0.0)

        # New subscriptions this month (COUNT)
        new_subs_result = await session.execute(
            select(func.count(Subscription.id)).where(
                Subscription.created_at >= m_start_dt,
                Subscription.created_at <= m_end_dt,
                Subscription.plan.in_(["monthly", "yearly", "lifetime"]),
            )
        )
        new_subs = new_subs_result.scalar() or 0

        # Churned this month (canceled or expired during this period, COUNT)
        churned_result = await session.execute(
            select(func.count(Subscription.id)).where(
                Subscription.updated_at >= m_start_dt,
                Subscription.updated_at <= m_end_dt,
                Subscription.status.in_(["canceled", "expired"]),
            )
        )
        churned = churned_result.scalar() or 0

        monthly_trend.append({
            "month": m_start.isoformat(),
            "revenue": round(m_revenue, 2),
            "new_subscriptions": new_subs,
            "churned": churned,
        })

    # Reverse so oldest is first
    monthly_trend.reverse()

    result = RevenueAnalyticsResponse(
        generated_at=now,
        mrr=mrr,
        active_subscriptions=active_subscriptions,
        total_users=total_users,
        paying_users=paying_users,
        conversion_rate_pct=conversion_rate,
        arpu=arpu,
        monthly_trend=monthly_trend,
    )

    await cache_set(cache_key, result.model_dump(mode="json"), _REVENUE_ANALYTICS_TTL)
    return result


# ─── User-facing analytics endpoints ────────────────────────────────────────


@router.get("/me")
async def user_analytics_full(
    current_user: User = Depends(require_premium),
    session: AsyncSession = Depends(get_session),
):
    """Full analytics bundle for the authenticated user. Requires premium."""
    return await get_full_user_analytics(current_user.id, session)


@router.get("/me/trends")
async def user_calorie_trends(
    days: int = Query(default=30, ge=7, le=90, description="Lookback period in days"),
    current_user: User = Depends(require_premium),
    session: AsyncSession = Depends(get_session),
):
    """Weekly/monthly calorie trends with linear regression slope. Requires premium."""
    return await get_calorie_trends(current_user.id, session, days=days)


@router.get("/me/macro-balance")
async def user_macro_balance(
    days: int = Query(default=7, ge=1, le=30, description="Lookback period in days"),
    current_user: User = Depends(require_premium),
    session: AsyncSession = Depends(get_session),
):
    """Macro adherence scoring (protein, carbs, fat, calories vs targets). Requires premium."""
    return await get_macro_balance_score(current_user.id, session, days=days)


@router.get("/me/streaks")
async def user_streak_stats(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Streak statistics: current, longest, total days, logging rate."""
    return await get_streak_statistics(current_user.id, session)


@router.get("/me/top-foods")
async def user_top_foods(
    days: int = Query(default=30, ge=7, le=90, description="Lookback period in days"),
    limit: int = Query(default=10, ge=5, le=25, description="Number of foods to return"),
    current_user: User = Depends(require_premium),
    session: AsyncSession = Depends(get_session),
):
    """Most-eaten foods ranking with calories and macro info. Requires premium."""
    return await get_most_eaten_foods(current_user.id, session, days=days, limit=limit)


@router.get("/me/meal-timing")
async def user_meal_timing(
    days: int = Query(default=30, ge=7, le=90, description="Lookback period in days"),
    current_user: User = Depends(require_premium),
    session: AsyncSession = Depends(get_session),
):
    """Meal timing analysis: when does the user typically eat each meal? Requires premium."""
    return await get_meal_timing_analysis(current_user.id, session, days=days)


@router.get("/me/consistency")
async def user_calorie_consistency(
    days: int = Query(default=14, ge=7, le=30, description="Lookback period in days"),
    current_user: User = Depends(require_premium),
    session: AsyncSession = Depends(get_session),
):
    """Calorie consistency score (coefficient of variation). Requires premium."""
    return await get_calorie_consistency(current_user.id, session, days=days)


@router.get("/me/goal-progress")
async def user_goal_progress(
    current_user: User = Depends(require_premium),
    session: AsyncSession = Depends(get_session),
):
    """Progress toward the user's weight/nutrition goal. Requires premium."""
    return await get_goal_progress(current_user.id, session)
