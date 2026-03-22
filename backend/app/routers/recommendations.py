"""Recommendations router — personalized meal suggestions."""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel.ext.asyncio.session import AsyncSession

from ..core.database import get_session
from ..models.user import User
from ..services.food_recommendation_engine import (
    browse_meals,
    get_meal_recommendations,
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
    """Get personalized meal recommendations based on remaining daily macros."""
    try:
        return await get_meal_recommendations(
            user_id=current_user.id,
            session=session,
            meal_type=meal_type,
            limit=limit,
        )
    except Exception as e:
        logger.exception("Error generating recommendations for user %s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al generar recomendaciones",
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
