"""
Nutrition Risk Engine router.

GET  /api/risk/summary    — risk summary for the authenticated user (last 7 days).
GET  /api/risk/daily      — today's adherence record for the authenticated user.
GET  /api/risk/history    — last N days of adherence records.
POST /api/risk/recalculate — recalculate today's adherence (Item 65).
POST /api/risk/backfill   — recalculate last N days (max 90) (Item 66).
GET  /api/risk/analytics  — aggregated risk analytics for the authenticated user.
GET  /api/risk/admin/dashboard — admin-only aggregated risk stats.
POST /api/risk/event      — track a risk analytics event.
GET  /api/risk/recovery-plan — 24h or 3-day recovery plan (Item 141).
GET  /api/risk/patterns   — detected patterns (weekend, etc.) (Item 145).
"""

# Note: Do NOT use `from __future__ import annotations` here.
# FastAPI needs real type objects at decoration time for Pydantic models.

import logging
import time as time_mod
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

# SEC: Rate limiting — uses slowapi if available (registered in main.py)
try:
    from slowapi import Limiter
    from slowapi.util import get_remote_address
    _limiter = Limiter(key_func=get_remote_address)
    _rate_limit_enabled = True
except ImportError:
    _rate_limit_enabled = False

_rl = lambda limit_str: (_limiter.limit(limit_str) if _rate_limit_enabled else lambda f: f)

from ..core.database import get_session
from ..models.nutrition_adherence import DailyNutritionAdherence
from ..models.onboarding_profile import OnboardingProfile
from ..models.user import User
from ..services.integrated_health_service import calculate_integrated_health_score
from ..services.nutrition_risk_service import calculate_daily_adherence, detect_weekend_pattern, get_user_risk_summary, recalculate_on_food_log
from ..services.recovery_plan_service import generate_24h_recovery_plan, generate_3day_recovery_plan
from ..services.risk_analytics_service import (
    get_admin_risk_dashboard,
    get_intervention_variant,
    get_user_risk_analytics,
    track_risk_event,
)
from .admin import require_admin
from .auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/risk", tags=["nutrition-risk"])


# --- Response models ---

class InterventionResponse(BaseModel):
    color: str
    push_title: Optional[str] = None
    push_body: Optional[str] = None
    home_banner: Optional[bool] = None
    coach_message: Optional[str] = None
    simplify_ui: Optional[bool] = None
    suggestions: Optional[List[str]] = None


class RecoveryResponse(BaseModel):
    recovering: bool
    improvement_pct: int


class RiskSummaryResponse(BaseModel):
    avg_risk_score: int
    avg_quality_score: int
    avg_calories_logged: int
    consecutive_no_log_days: int
    days_with_data: int
    trend: str
    current_status: str
    intervention: InterventionResponse
    consistency_score_7d: int = 0
    recovery: RecoveryResponse = RecoveryResponse(recovering=False, improvement_pct=0)


class DailyAdherenceResponse(BaseModel):
    date: date
    calories_target: int
    calories_logged: int
    calories_ratio: float
    meals_logged: int
    protein_target: int
    protein_logged: int
    carbs_target: int
    carbs_logged: int
    fats_target: int
    fats_logged: int
    diet_quality_score: int
    adherence_status: str
    nutrition_risk_score: int
    no_log_flag: bool


class IntegratedHealthScoreResponse(BaseModel):
    total_score: int
    nutrition_score: int
    activity_score: int
    consistency_score: int
    hydration_score: int
    trend: str
    top_improvement: str


class RiskAnalyticsResponse(BaseModel):
    total_impressions: int
    total_cta_clicks: int
    total_interventions: int
    total_corrections: int
    total_risk_improved: int
    correction_rate: float
    days: int


class TrackRiskEventRequest(BaseModel):
    event_type: str
    metadata: dict = {}


class TrackRiskEventResponse(BaseModel):
    id: int
    event_type: str
    variant: str


class RiskReasonCount(BaseModel):
    reason: str
    count: int


class AdminRiskDashboardResponse(BaseModel):
    users_at_risk: int
    users_critical: int
    avg_risk_score: int
    avg_quality_score: int
    intervention_effectiveness: float
    top_risk_reasons: List[RiskReasonCount]


# --- Endpoints ---

@router.get("/summary", response_model=RiskSummaryResponse)
@_rl("30/minute")
async def get_risk_summary(
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Return the 7-day risk summary for the authenticated user."""
    _t0 = time_mod.perf_counter()
    data = await get_user_risk_summary(current_user.id, session)
    response.headers["X-Risk-Calc-Time"] = f"{(time_mod.perf_counter() - _t0) * 1000:.1f}"
    return RiskSummaryResponse(
        avg_risk_score=data["avg_risk_score"],
        avg_quality_score=data["avg_quality_score"],
        avg_calories_logged=data.get("avg_calories_logged", 0),
        consecutive_no_log_days=data["consecutive_no_log_days"],
        days_with_data=data["days_with_data"],
        trend=data["trend"],
        current_status=data["current_status"],
        intervention=InterventionResponse(**data["intervention"]),
        consistency_score_7d=data.get("consistency_score_7d", 0),
        recovery=RecoveryResponse(**data.get("recovery", {"recovering": False, "improvement_pct": 0})),
    )


@router.get("/daily", response_model=DailyAdherenceResponse)
@_rl("30/minute")
async def get_daily_adherence(
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Calculate and return today's adherence record (timezone-aware)."""
    _t0 = time_mod.perf_counter()
    # Resolve user timezone from onboarding profile
    profile_result = await session.exec(
        select(OnboardingProfile).where(OnboardingProfile.user_id == current_user.id)
    )
    profile = profile_result.first()
    if profile and profile.timezone:
        try:
            user_tz = ZoneInfo(profile.timezone)
        except (KeyError, ValueError):
            user_tz = timezone.utc
    else:
        user_tz = timezone.utc
    today = datetime.now(user_tz).date()
    record = await calculate_daily_adherence(current_user.id, today, session)
    response.headers["X-Risk-Calc-Time"] = f"{(time_mod.perf_counter() - _t0) * 1000:.1f}"
    return DailyAdherenceResponse(
        date=record.date,
        calories_target=record.calories_target,
        calories_logged=record.calories_logged,
        calories_ratio=record.calories_ratio,
        meals_logged=record.meals_logged,
        protein_target=record.protein_target,
        protein_logged=record.protein_logged,
        carbs_target=record.carbs_target,
        carbs_logged=record.carbs_logged,
        fats_target=record.fats_target,
        fats_logged=record.fats_logged,
        diet_quality_score=record.diet_quality_score,
        adherence_status=record.adherence_status,
        nutrition_risk_score=record.nutrition_risk_score,
        no_log_flag=record.no_log_flag,
    )


@router.get("/history", response_model=List[DailyAdherenceResponse])
@_rl("30/minute")
async def get_adherence_history(
    request: Request,
    response: Response,
    days: int = Query(default=7, ge=1, le=90),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Return the last N days of adherence records (single query, no N+1)."""
    _t0 = time_mod.perf_counter()
    today = date.today()
    start = today - timedelta(days=days - 1)

    # Item 79: Single query with order_by — all fields in one DB round-trip
    result = await session.exec(
        select(DailyNutritionAdherence)
        .where(
            DailyNutritionAdherence.user_id == current_user.id,
            DailyNutritionAdherence.date >= start,
            DailyNutritionAdherence.date <= today,
        )
        .order_by(DailyNutritionAdherence.date.desc())
    )
    records = list(result.all())
    response.headers["X-Risk-Calc-Time"] = f"{(time_mod.perf_counter() - _t0) * 1000:.1f}"

    return [
        DailyAdherenceResponse(
            date=r.date,
            calories_target=r.calories_target,
            calories_logged=r.calories_logged,
            calories_ratio=r.calories_ratio,
            meals_logged=r.meals_logged,
            protein_target=r.protein_target,
            protein_logged=r.protein_logged,
            carbs_target=r.carbs_target,
            carbs_logged=r.carbs_logged,
            fats_target=r.fats_target,
            fats_logged=r.fats_logged,
            diet_quality_score=r.diet_quality_score,
            adherence_status=r.adherence_status,
            nutrition_risk_score=r.nutrition_risk_score,
            no_log_flag=r.no_log_flag,
        )
        for r in records
    ]


@router.get("/health-score", response_model=IntegratedHealthScoreResponse)
@_rl("30/minute")
async def get_health_score(
    request: Request,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Return the integrated health score combining nutrition, activity, consistency, and hydration."""
    data = await calculate_integrated_health_score(current_user.id, session)
    return IntegratedHealthScoreResponse(**data)


class BackfillResponse(BaseModel):
    records_updated: int
    days_processed: int


def _adherence_to_response(record: DailyNutritionAdherence) -> DailyAdherenceResponse:
    """Convert a DailyNutritionAdherence model to a DailyAdherenceResponse."""
    return DailyAdherenceResponse(
        date=record.date,
        calories_target=record.calories_target,
        calories_logged=record.calories_logged,
        calories_ratio=record.calories_ratio,
        meals_logged=record.meals_logged,
        protein_target=record.protein_target,
        protein_logged=record.protein_logged,
        carbs_target=record.carbs_target,
        carbs_logged=record.carbs_logged,
        fats_target=record.fats_target,
        fats_logged=record.fats_logged,
        diet_quality_score=record.diet_quality_score,
        adherence_status=record.adherence_status,
        nutrition_risk_score=record.nutrition_risk_score,
        no_log_flag=record.no_log_flag,
    )


@router.post("/recalculate", response_model=DailyAdherenceResponse)
@_rl("10/minute")
async def recalculate_today(
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Recalculate today's adherence record and return the updated result."""
    _t0 = time_mod.perf_counter()
    record = await recalculate_on_food_log(current_user.id, session)
    response.headers["X-Risk-Calc-Time"] = f"{(time_mod.perf_counter() - _t0) * 1000:.1f}"
    return _adherence_to_response(record)


@router.post("/backfill", response_model=BackfillResponse)
@_rl("10/minute")
async def backfill_adherence(
    request: Request,
    days: int = Query(default=30, ge=1, le=90),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Recalculate adherence records for the last N days (max 90). Returns count of records updated."""
    today = date.today()
    records_updated = 0
    for i in range(days):
        target_date = today - timedelta(days=i)
        await calculate_daily_adherence(current_user.id, target_date, session)
        records_updated += 1
    return BackfillResponse(records_updated=records_updated, days_processed=days)


@router.get("/analytics", response_model=RiskAnalyticsResponse)
@_rl("30/minute")
async def get_risk_analytics(
    request: Request,
    days: int = Query(default=7, ge=1, le=90),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Return aggregated risk analytics for the authenticated user."""
    data = await get_user_risk_analytics(current_user.id, days, session)
    return RiskAnalyticsResponse(**data)


@router.post("/event", response_model=TrackRiskEventResponse, status_code=status.HTTP_201_CREATED)
@_rl("10/minute")
async def post_risk_event(
    request: Request,
    body: TrackRiskEventRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Track a risk analytics event (impression, CTA click, intervention, etc.)."""
    try:
        event = await track_risk_event(
            user_id=current_user.id,
            event_type=body.event_type,
            metadata=body.metadata,
            session=session,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return TrackRiskEventResponse(
        id=event.id,
        event_type=event.event_type,
        variant=get_intervention_variant(current_user.id),
    )


# --- Recovery plan & patterns endpoints (Items 141, 145) ---


class SuggestedMealResponse(BaseModel):
    meal_type: str
    description: str
    est_calories: int
    est_protein_g: int


class WaterRecommendationResponse(BaseModel):
    current_water_ml: int
    target_water_ml: int
    remaining_water_ml: int
    message: str
    glasses_remaining: int


class RecoveryPlanMacroResponse(BaseModel):
    calories: int
    protein_g: int
    carbs_g: int
    fats_g: int


class RecoveryPlan24hResponse(BaseModel):
    horizon: str
    status: str
    targets: RecoveryPlanMacroResponse
    logged: RecoveryPlanMacroResponse
    remaining_calories: int
    remaining_protein_g: int
    remaining_carbs_g: int
    remaining_fats_g: int
    suggested_meals: List[SuggestedMealResponse]
    motivation: str
    water_recommendation: Optional[WaterRecommendationResponse] = None


class DayPlanResponse(BaseModel):
    date: str
    day_label: str
    calorie_target: int
    protein_target_g: int
    suggested_meals: List[SuggestedMealResponse]


class RecoveryPlan3dPeriodResponse(BaseModel):
    start: str
    end: str


class RecoveryPlan3dMacroResponse(BaseModel):
    calories: int
    protein_g: int
    carbs_g: Optional[int] = None
    fats_g: Optional[int] = None


class RecoveryPlan3dResponse(BaseModel):
    horizon: str
    status: str
    period: RecoveryPlan3dPeriodResponse
    targets_3d: RecoveryPlanMacroResponse
    logged_3d: RecoveryPlan3dMacroResponse
    deficit_calories: int
    deficit_protein_g: int
    daily_plans: List[DayPlanResponse]
    motivation: str
    water_recommendation: Optional[WaterRecommendationResponse] = None


class WeekendPatternResponse(BaseModel):
    weekend_avg_calories: int
    weekday_avg_calories: int
    weekend_avg_risk: int
    weekday_avg_risk: int
    weekend_risk_higher: bool
    pattern_detected: bool
    pct_difference: float
    data_days: int
    weekend_days: int
    weekday_days: int


@router.get("/recovery-plan")
@_rl("30/minute")
async def get_recovery_plan(
    request: Request,
    horizon: str = Query(default="24h", regex="^(24h|3d)$"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Return a recovery plan (24h or 3-day) with meal suggestions and water recommendation."""
    if horizon == "3d":
        data = await generate_3day_recovery_plan(current_user.id, session)
    else:
        data = await generate_24h_recovery_plan(current_user.id, session)
    return data


@router.get("/patterns", response_model=WeekendPatternResponse)
@_rl("30/minute")
async def get_patterns(
    request: Request,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Return detected nutrition patterns (weekend vs weekday) for the authenticated user."""
    data = await detect_weekend_pattern(current_user.id, session)
    return WeekendPatternResponse(**data)


@router.get("/admin/dashboard", response_model=AdminRiskDashboardResponse)
@_rl("30/minute")
async def admin_risk_dashboard(
    request: Request,
    admin_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """Admin-only: aggregated risk stats across all users."""
    logger.info("Admin dashboard accessed by user_id=%d", admin_user.id)
    data = await get_admin_risk_dashboard(session)
    return AdminRiskDashboardResponse(**data)
