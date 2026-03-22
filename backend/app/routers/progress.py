"""
Progress & Celebration endpoints
─────────────────────────────────
POST /api/progress/post-meal     — process post-meal events, return celebrations
GET  /api/progress/weekly-summary — weekly progress summary
GET  /api/progress/missions       — today's daily missions
"""

import logging
from fastapi import APIRouter, Depends
from sqlmodel.ext.asyncio.session import AsyncSession

from ..core.database import get_session
from ..models.user import User
from ..routers.auth import get_current_user
from ..services.celebration_engine import (
    process_post_meal_events,
    generate_weekly_summary,
)
from ..services.mission_engine import (
    assign_daily_missions,
    get_today_missions,
    update_mission_progress,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/progress", tags=["progress"])


@router.post("/post-meal")
async def post_meal_events(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Process post-meal events: award XP, check missions, trigger celebrations.
    Call this after a food log is saved.
    Returns list of celebrations to display in the UI.
    """
    celebrations = await process_post_meal_events(current_user.id, session)

    # Also update mission progress
    completed_missions = await update_mission_progress(current_user.id, session)

    # Add mission completion celebrations
    for mission in completed_missions:
        celebrations.append({
            "trigger": "mission_completed",
            "message": f"Mision completada: {mission['name']}! +{mission['xp_reward']} XP",
            "emoji": "\u2705",
            "intensity": "subtle",
            "data": mission,
        })

    await session.commit()

    return {
        "celebrations": celebrations,
        "missions_completed": completed_missions,
    }


@router.get("/weekly-summary")
async def weekly_summary(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Weekly progress summary: XP earned, coins, missions, achievements, streak, level.
    Best called on Sundays or when viewing the weekly recap screen.
    """
    summary = await generate_weekly_summary(current_user.id, session)
    return summary


@router.get("/missions")
async def today_missions(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Get today's daily missions. If not yet assigned, assigns them first
    based on the user's current risk status.
    """
    missions = await get_today_missions(current_user.id, session)

    if not missions:
        # Auto-assign missions based on risk status
        risk_status = "optimal"  # default
        try:
            from ..services.nutrition_risk_service import get_user_risk_summary
            risk_summary = await get_user_risk_summary(current_user.id, session)
            risk_status = risk_summary.get("current_status", "optimal")
        except Exception:
            pass

        missions = await assign_daily_missions(
            current_user.id, risk_status, session
        )
        await session.commit()

    return {"missions": missions}
