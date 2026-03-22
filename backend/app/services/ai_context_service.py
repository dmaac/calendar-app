"""
AI Context Service — Compact context builder and smart routing for AI requests.

AI TOKEN COST: This module REDUCES token costs by:
1. Summarizing user history into a compact text (max ~200 tokens) instead of
   sending raw data arrays to the AI model.
2. Routing requests to the cheapest capable model tier based on complexity.

No AI API calls are made in this file — it only prepares context for others.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, time as dt_time, timedelta

from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..core.config import settings
from ..models.ai_food_log import AIFoodLog
from ..models.daily_nutrition_summary import DailyNutritionSummary
from ..models.onboarding_profile import OnboardingProfile
from ..models.nutrition_profile import UserNutritionProfile
from ..services.nutrition_risk_service import (
    _get_goals,
    get_user_risk_summary,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Compact context builder (Item 155)
# ---------------------------------------------------------------------------

async def build_compact_context(user_id: int, session: AsyncSession) -> str:
    """Build a minimal text summary for AI coach context.

    Returns a compact string (~200 tokens max) that replaces sending raw data
    arrays to the AI model. Format:

        User: 25M, 75kg, goal=lose, 2100kcal target
        Last 7d: avg 1800kcal (86%), protein 65% met, 5/7 days logged
        Risk: 35 (low), improving trend
        Top issue: low_protein

    Args:
        user_id: The user's database ID.
        session: Async database session.

    Returns:
        Compact context string ready to be injected into an AI prompt.
    """
    lines: list[str] = []

    # --- User profile ---
    profile = await _get_user_profile_summary(user_id, session)
    lines.append(profile)

    # --- Last 7 days nutrition ---
    nutrition_7d = await _get_7d_nutrition_summary(user_id, session)
    lines.append(nutrition_7d)

    # --- Risk summary ---
    risk_line = await _get_risk_summary_line(user_id, session)
    lines.append(risk_line)

    return "\n".join(lines)


async def _get_user_profile_summary(user_id: int, session: AsyncSession) -> str:
    """Build 'User: ...' line from profile data."""
    # Try nutrition profile first, then onboarding
    result = await session.exec(
        select(UserNutritionProfile).where(UserNutritionProfile.user_id == user_id)
    )
    nprofile = result.first()

    result = await session.exec(
        select(OnboardingProfile).where(OnboardingProfile.user_id == user_id)
    )
    onboarding = result.first()

    gender = "?"
    age = "?"
    weight = "?"
    goal = "maintain"
    target_cal = 2000

    if nprofile:
        if nprofile.gender:
            gender = nprofile.gender.value[0].upper() if hasattr(nprofile.gender, "value") else str(nprofile.gender)[0].upper()
        if nprofile.age:
            age = str(nprofile.age)
        if nprofile.weight_kg:
            weight = f"{int(nprofile.weight_kg)}kg"
        if nprofile.goal:
            goal = nprofile.goal.value if hasattr(nprofile.goal, "value") else str(nprofile.goal)
        target_cal = int(nprofile.target_calories)
    elif onboarding:
        if onboarding.gender:
            gender = onboarding.gender[0].upper()
        if onboarding.birth_date:
            today = date.today()
            age = str(today.year - onboarding.birth_date.year)
        if onboarding.weight_kg:
            weight = f"{int(onboarding.weight_kg)}kg"
        if onboarding.goal:
            goal = onboarding.goal
        if onboarding.daily_calories:
            target_cal = int(onboarding.daily_calories)

    return f"User: {age}{gender}, {weight}, goal={goal}, {target_cal}kcal target"


async def _get_7d_nutrition_summary(user_id: int, session: AsyncSession) -> str:
    """Build 'Last 7d: ...' line from food log aggregations."""
    today = date.today()
    week_ago = today - timedelta(days=6)

    goals = await _get_goals(user_id, session)
    target_cal = goals["calories"]
    target_protein = goals["protein_g"]

    # Aggregate last 7 days
    total_cal = 0.0
    total_protein = 0.0
    days_logged = 0

    for i in range(7):
        d = today - timedelta(days=i)
        day_start = datetime.combine(d, dt_time.min)
        day_end = datetime.combine(d, dt_time.max)

        result = await session.execute(
            select(
                func.coalesce(func.sum(AIFoodLog.calories), 0.0).label("cal"),
                func.coalesce(func.sum(AIFoodLog.protein_g), 0.0).label("prot"),
                func.count(AIFoodLog.id).label("cnt"),
            ).where(
                AIFoodLog.user_id == user_id,
                AIFoodLog.logged_at >= day_start,
                AIFoodLog.logged_at <= day_end,
            )
        )
        row = result.one()
        if int(row.cnt) > 0:
            days_logged += 1
            total_cal += float(row.cal)
            total_protein += float(row.prot)

    if days_logged > 0:
        avg_cal = int(total_cal / days_logged)
        cal_pct = int((avg_cal / target_cal) * 100) if target_cal > 0 else 0
        protein_pct = int((total_protein / (target_protein * days_logged)) * 100) if target_protein > 0 and days_logged > 0 else 0
    else:
        avg_cal = 0
        cal_pct = 0
        protein_pct = 0

    return f"Last 7d: avg {avg_cal}kcal ({cal_pct}%), protein {protein_pct}% met, {days_logged}/7 days logged"


async def _get_risk_summary_line(user_id: int, session: AsyncSession) -> str:
    """Build 'Risk: ...' line from risk summary."""
    try:
        summary = await get_user_risk_summary(user_id, session)
        risk_score = summary.get("avg_risk_score", 0)
        trend = summary.get("trend", "stable")
        status = summary.get("current_status", "unknown")

        # Derive risk label
        if risk_score <= 20:
            risk_label = "low"
        elif risk_score <= 50:
            risk_label = "moderate"
        elif risk_score <= 75:
            risk_label = "high"
        else:
            risk_label = "critical"

        # Determine top issue from intervention
        intervention = summary.get("intervention", {})
        top_issue = summary.get("primary_reason", "none")
        if not top_issue or top_issue == "none":
            # Fallback: derive from status
            if status in ("no_log", "critical"):
                top_issue = "no_log"
            elif "excess" in status:
                top_issue = "excess"
            else:
                top_issue = "none"

        line = f"Risk: {risk_score} ({risk_label}), {trend} trend"
        if top_issue and top_issue != "none":
            line += f"\nTop issue: {top_issue}"
        return line
    except Exception:
        return "Risk: unavailable"


# ---------------------------------------------------------------------------
# AI request routing (Item 156)
# ---------------------------------------------------------------------------

def route_ai_request(complexity: str) -> str:
    """Route AI requests to the cheapest capable model.

    Args:
        complexity: One of "simple", "medium", "complex", "expert".

    Returns:
        Model tier: "template" | "haiku" | "sonnet" | "opus"

    Routing rules:
    - "template": pre-built response, no API call (simple interventions, tips)
    - "haiku": quick, cheap responses (daily tips, simple coaching)
    - "sonnet": medium complexity (meal analysis, weekly summaries)
    - "opus": complex only (detailed nutritional analysis, multi-day plans)

    If ai_expensive_enabled is False (kill switch), sonnet/opus requests
    are downgraded to haiku/template respectively.
    """
    expensive_enabled = getattr(settings, "ai_expensive_enabled", True)

    routing_map: dict[str, str] = {
        "simple": "template",
        "medium": "haiku",
        "complex": "sonnet",
        "expert": "opus",
    }

    tier = routing_map.get(complexity, "haiku")

    # Apply kill switch: downgrade expensive tiers
    if not expensive_enabled:
        if tier == "opus":
            tier = "haiku"
        elif tier == "sonnet":
            tier = "haiku"

    return tier


def classify_request_complexity(request_type: str) -> str:
    """Classify a request type into a complexity level.

    Args:
        request_type: The type of AI request (e.g., "daily_tip",
            "meal_analysis", "weekly_summary", "detailed_plan").

    Returns:
        Complexity level: "simple" | "medium" | "complex" | "expert"
    """
    simple_types = {
        "daily_tip", "hydration_reminder", "streak_celebration",
        "simple_intervention", "quick_suggestion", "motivation",
    }
    medium_types = {
        "meal_feedback", "daily_coaching", "food_question",
        "snack_suggestion", "portion_advice",
    }
    complex_types = {
        "meal_analysis", "weekly_summary", "macro_breakdown",
        "diet_review", "recipe_suggestion",
    }
    # Everything else is expert
    expert_types = {
        "detailed_plan", "multi_day_plan", "nutritional_analysis",
        "diet_overhaul", "medical_nutrition",
    }

    if request_type in simple_types:
        return "simple"
    elif request_type in medium_types:
        return "medium"
    elif request_type in complex_types:
        return "complex"
    elif request_type in expert_types:
        return "expert"
    # Default to medium for unknown types
    return "medium"
