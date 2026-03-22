"""
Analytics router — Aggregated product metrics
──────────────────────────────────────────────
GET /api/analytics/summary — DAU, WAU, MAU, retention (D1/D7/D30),
                             feature usage, revenue metrics
"""

import logging
from datetime import date, datetime, time as dt_time, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, text as sa_text
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..core.database import get_session
from ..models.ai_food_log import AIFoodLog
from ..models.subscription import Subscription
from ..models.user import User
from ..models.workout import WorkoutLog
from .auth import get_current_user
from .admin import require_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


# ─── Response schema ─────────────────────────────────────────────────────────


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


# ─── Helpers ─────────────────────────────────────────────────────────────────


async def _count_active_users(
    session: AsyncSession, since: datetime
) -> int:
    """Count distinct users who logged food since the given datetime."""
    result = await session.execute(
        select(func.count(func.distinct(AIFoodLog.user_id))).where(
            AIFoodLog.logged_at >= since,
        )
    )
    return result.scalar() or 0


async def _compute_retention(
    session: AsyncSession, today: date, days_ago: int
) -> float:
    """
    Compute retention for users who signed up exactly `days_ago` days ago.
    Retention = (users who were active on day N) / (users who signed up on day N-ago).
    """
    signup_date = today - timedelta(days=days_ago)
    signup_start = datetime.combine(signup_date, dt_time.min)
    signup_end = datetime.combine(signup_date, dt_time.max)

    # Users who signed up on that day
    signup_result = await session.execute(
        select(func.count(User.id)).where(
            User.created_at >= signup_start,
            User.created_at <= signup_end,
        )
    )
    cohort_size = signup_result.scalar() or 0
    if cohort_size == 0:
        return 0.0

    # Of those users, how many were active today (logged food)
    today_start = datetime.combine(today, dt_time.min)
    today_end = datetime.combine(today, dt_time.max)

    # Subquery: IDs of users who signed up on the cohort day
    from sqlalchemy import and_

    retained_result = await session.execute(
        select(func.count(func.distinct(AIFoodLog.user_id))).where(
            AIFoodLog.logged_at >= today_start,
            AIFoodLog.logged_at <= today_end,
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


# ─── Endpoint ───────────────────────────────────────────────────────────────


@router.get("/summary", response_model=AnalyticsSummary)
async def analytics_summary(
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """
    Aggregated analytics summary: DAU, WAU, MAU, retention, feature usage, revenue.
    Requires admin privileges.
    """
    try:
        return await _compute_analytics_summary(session)
    except Exception as e:
        logger.exception("Analytics summary computation failed")
        from fastapi import HTTPException
        raise HTTPException(
            status_code=500,
            detail="Failed to compute analytics summary. Please try again later.",
        )


async def _compute_analytics_summary(session: AsyncSession) -> AnalyticsSummary:
    """Internal implementation extracted for error handling."""
    today = date.today()
    now = datetime.utcnow()

    today_start = datetime.combine(today, dt_time.min)
    week_ago = datetime.combine(today - timedelta(days=7), dt_time.min)
    month_ago = datetime.combine(today - timedelta(days=30), dt_time.min)

    # ── Active users ─────────────────────────────────────────────────────
    dau = await _count_active_users(session, today_start)
    wau = await _count_active_users(session, week_ago)
    mau = await _count_active_users(session, month_ago)

    # ── Total users ──────────────────────────────────────────────────────
    total_result = await session.execute(select(func.count(User.id)))
    total_users = total_result.scalar() or 0

    # ── Retention ────────────────────────────────────────────────────────
    d1 = await _compute_retention(session, today, 1)
    d7 = await _compute_retention(session, today, 7)
    d30 = await _compute_retention(session, today, 30)

    # ── Feature usage (last 30 days) ─────────────────────────────────────
    # AI scans = entries with ai_provider set
    ai_scans_result = await session.execute(
        select(func.count(AIFoodLog.id)).where(
            AIFoodLog.logged_at >= month_ago,
            AIFoodLog.ai_provider.isnot(None),
        )
    )
    ai_food_scans = ai_scans_result.scalar() or 0

    # Manual logs = entries without ai_provider
    manual_result = await session.execute(
        select(func.count(AIFoodLog.id)).where(
            AIFoodLog.logged_at >= month_ago,
            AIFoodLog.ai_provider.is_(None),
        )
    )
    manual_food_logs = manual_result.scalar() or 0

    # Workouts logged
    workouts_result = await session.execute(
        select(func.count(WorkoutLog.id)).where(
            WorkoutLog.created_at >= month_ago,
        )
    )
    workouts_logged = workouts_result.scalar() or 0

    # Unique users with meals
    users_meals_result = await session.execute(
        select(func.count(func.distinct(AIFoodLog.user_id))).where(
            AIFoodLog.logged_at >= month_ago,
        )
    )
    total_users_with_meals = users_meals_result.scalar() or 0

    # Unique users with workouts
    users_workouts_result = await session.execute(
        select(func.count(func.distinct(WorkoutLog.user_id))).where(
            WorkoutLog.created_at >= month_ago,
        )
    )
    total_users_with_workouts = users_workouts_result.scalar() or 0

    # ── Revenue / Subscriptions ──────────────────────────────────────────
    total_subs_result = await session.execute(
        select(func.count(Subscription.id))
    )
    total_subscribers = total_subs_result.scalar() or 0

    active_subs_result = await session.execute(
        select(func.count(Subscription.id)).where(
            Subscription.status == "active",
        )
    )
    active_subscribers = active_subs_result.scalar() or 0

    # Per-plan breakdown (active only)
    monthly_result = await session.execute(
        select(func.count(Subscription.id)).where(
            Subscription.status == "active",
            Subscription.plan == "monthly",
        )
    )
    monthly_subscribers = monthly_result.scalar() or 0

    annual_result = await session.execute(
        select(func.count(Subscription.id)).where(
            Subscription.status == "active",
            Subscription.plan == "annual",
        )
    )
    annual_subscribers = annual_result.scalar() or 0

    lifetime_result = await session.execute(
        select(func.count(Subscription.id)).where(
            Subscription.status == "active",
            Subscription.plan == "lifetime",
        )
    )
    lifetime_subscribers = lifetime_result.scalar() or 0

    # Total revenue (sum of price_paid across all non-cancelled subscriptions)
    revenue_result = await session.execute(
        select(func.coalesce(func.sum(Subscription.price_paid), 0.0)).where(
            Subscription.status.in_(["active", "expired"]),
        )
    )
    total_revenue = float(revenue_result.scalar() or 0.0)

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
            total_subscribers=total_subscribers,
            active_subscribers=active_subscribers,
            monthly_subscribers=monthly_subscribers,
            annual_subscribers=annual_subscribers,
            lifetime_subscribers=lifetime_subscribers,
            total_revenue=round(total_revenue, 2),
        ),
    )
