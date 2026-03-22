"""
Nutrition Risk Engine router.

GET /api/risk/summary — risk summary for the authenticated user (last 7 days).
GET /api/risk/daily   — today's adherence record for the authenticated user.
GET /api/risk/history  — last N days of adherence records.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..core.database import get_session
from ..models.nutrition_adherence import DailyNutritionAdherence
from ..models.onboarding_profile import OnboardingProfile
from ..models.user import User
from ..services.integrated_health_service import calculate_integrated_health_score
from ..services.nutrition_risk_service import calculate_daily_adherence, get_user_risk_summary
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


class RiskSummaryResponse(BaseModel):
    avg_risk_score: int
    avg_quality_score: int
    avg_calories_logged: int
    consecutive_no_log_days: int
    days_with_data: int
    trend: str
    current_status: str
    intervention: InterventionResponse


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


# --- Endpoints ---

@router.get("/summary", response_model=RiskSummaryResponse)
async def get_risk_summary(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Return the 7-day risk summary for the authenticated user."""
    data = await get_user_risk_summary(current_user.id, session)
    return RiskSummaryResponse(
        avg_risk_score=data["avg_risk_score"],
        avg_quality_score=data["avg_quality_score"],
        avg_calories_logged=data.get("avg_calories_logged", 0),
        consecutive_no_log_days=data["consecutive_no_log_days"],
        days_with_data=data["days_with_data"],
        trend=data["trend"],
        current_status=data["current_status"],
        intervention=InterventionResponse(**data["intervention"]),
    )


@router.get("/daily", response_model=DailyAdherenceResponse)
async def get_daily_adherence(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Calculate and return today's adherence record (timezone-aware)."""
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
async def get_adherence_history(
    days: int = Query(default=7, ge=1, le=90),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Return the last N days of adherence records."""
    today = date.today()
    start = today - timedelta(days=days - 1)

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
async def get_health_score(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Return the integrated health score combining nutrition, activity, consistency, and hydration."""
    data = await calculate_integrated_health_score(current_user.id, session)
    return IntegratedHealthScoreResponse(**data)
