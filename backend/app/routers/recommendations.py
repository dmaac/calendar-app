"""Recommendations router -- personalized meal suggestions."""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel.ext.asyncio.session import AsyncSession

from ..core.database import get_session
from ..models.user import User
from ..services.food_recommendation_engine import (
    browse_meals,
    get_meal_recommendations,
    get_macro_focused_suggestions,
    get_time_based_suggestions,
    log_recommendation_choice,
)
from .auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/recommendations", tags=["recommendations"])


@router.get("")
async def recommendations(
    meal_type: Optional[str] = Query(None, description="breakfast, lunch, dinner, snack"),
    limit: int = Query(5, ge=1, le=20),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get personalized meal recommendations based on remaining daily macros.

    Now includes:
    - Dietary preference filtering from onboarding (vegetarian, keto, etc.)
    - Macro-balancing advice (which macros need attention)
    - Diet-aware scoring and explanations in Spanish
    """
    try:
        return await get_meal_recommendations(
            user_id=current_user.id,
            session=session,
            meal_type=meal_type,
            limit=limit,
        )
    except Exception:
        logger.exception("Error generating recommendations for user %s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al generar recomendaciones",
        )


@router.get("/macro-focus")
async def macro_focused(
    macro: str = Query(
        "protein_g",
        description="Target macro to focus on: protein_g, carbs_g, or fat_g",
    ),
    limit: int = Query(5, ge=1, le=20),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get meal suggestions specifically to fill a macro deficit.

    Unlike the general recommendations endpoint, this finds meals that are
    rich in a specific macro the user is behind on. Useful when the user
    taps "I need more protein" on the dashboard.

    Examples:
    - /api/recommendations/macro-focus?macro=protein_g
    - /api/recommendations/macro-focus?macro=fat_g&limit=3
    """
    try:
        return await get_macro_focused_suggestions(
            user_id=current_user.id,
            session=session,
            target_macro=macro,
            limit=limit,
        )
    except Exception:
        logger.exception("Error generating macro-focused suggestions for user %s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al generar sugerencias por macro",
        )


@router.get("/time-based")
async def time_based(
    limit: int = Query(3, ge=1, le=10),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get quick meal suggestions appropriate for the current time of day.

    Automatically detects whether it is breakfast, lunch, snack, or dinner
    time and suggests meals that fit the user's remaining calorie budget.

    Applies time-based heuristics:
    - Morning (5-10): light breakfast options with quick prep
    - Midday (11-14): substantial lunch options
    - Afternoon (15-17): light snacks
    - Evening (18-22): dinner options
    - Late night (23-4): very light snacks only

    Respects dietary preferences from onboarding.
    """
    try:
        return await get_time_based_suggestions(
            user_id=current_user.id,
            session=session,
            limit=limit,
        )
    except Exception:
        logger.exception("Error generating time-based suggestions for user %s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al generar sugerencias por horario",
        )


@router.get("/meals")
async def list_meals(
    meal_type: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    min_protein: Optional[float] = Query(None, ge=0),
    max_calories: Optional[int] = Query(None, ge=0),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
):
    """Browse all meal templates with filters. No auth required."""
    return await browse_meals(
        session=session,
        meal_type=meal_type,
        category=category,
        min_protein=min_protein,
        max_calories=max_calories,
        page=page,
        limit=limit,
    )


@router.post("/log")
async def log_choice(
    meal_id: int = Query(..., description="ID of the chosen meal"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Log that a user chose a recommended meal."""
    result = await log_recommendation_choice(
        user_id=current_user.id,
        meal_id=meal_id,
        session=session,
    )
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result
