"""
AI Coach Router
----------------
Endpoints for the AI-powered nutrition coach.

POST /api/coach/chat          — Conversational chat with contextual coach
GET  /api/coach/insight       — Proactive daily insight based on real data
GET  /api/coach/suggest/{meal_type} — Meal suggestion based on remaining macros

All endpoints require authentication and return personalized responses
enriched with the user's nutrition data, streaks, and NutriScore.
"""

import logging
from enum import Enum
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel.ext.asyncio.session import AsyncSession

from ..core.database import get_session
from ..core.dependencies import require_premium
from ..models.user import User
from ..services.ai_coach_service import AICoachService
from .auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/coach", tags=["coach"])


# ─── Request/Response Schemas ────────────────────────────────────────────────

class CoachChatRequest(BaseModel):
    """Request body for the coach chat endpoint."""
    message: str = Field(
        ...,
        min_length=1,
        max_length=1000,
        description="The user's message to the coach (max 1000 characters).",
        examples=["Como voy con mis macros hoy?"],
    )


class CoachChatResponse(BaseModel):
    """Response from the coach chat endpoint."""
    response: str = Field(description="The coach's personalized response.")
    nutri_score: int = Field(description="Current NutriScore (0-100).")
    streak_days: int = Field(description="Current streak in consecutive days.")
    consumed_calories: int = Field(description="Calories consumed today.")
    target_calories: int = Field(description="Calorie target for today.")
    disclaimer: str = Field(description="Medical disclaimer text.")


class CoachInsightResponse(BaseModel):
    """Response from the daily insight endpoint."""
    insight: str = Field(description="Personalized daily insight text.")
    nutri_score: int = Field(description="Current NutriScore (0-100).")
    streak_days: int = Field(description="Current streak in consecutive days.")
    consumed_calories: int = Field(description="Calories consumed today.")
    target_calories: int = Field(description="Calorie target for today.")
    meals_logged: int = Field(description="Number of meals logged today.")
    alerts: list[str] = Field(description="Active health alerts.")
    disclaimer: str = Field(description="Medical disclaimer text.")


class MealSuggestionDetail(BaseModel):
    """Structured meal suggestion from the coach."""
    meal_name: str = Field(description="Name of the suggested meal.")
    description: str = Field(description="Meal description with ingredients and portions.")
    estimated_calories: float = Field(description="Estimated calories.")
    estimated_protein_g: float = Field(description="Estimated protein in grams.")
    estimated_carbs_g: float = Field(description="Estimated carbs in grams.")
    estimated_fats_g: float = Field(description="Estimated fats in grams.")
    tip: str = Field(default="", description="A brief tip from the coach.")


class CoachMealSuggestionResponse(BaseModel):
    """Response from the meal suggestion endpoint."""
    meal_type: str = Field(description="The requested meal type.")
    suggestion: MealSuggestionDetail = Field(description="The meal suggestion.")
    remaining_calories: int = Field(description="Remaining calories for the day.")
    remaining_protein_g: int = Field(description="Remaining protein in grams.")
    remaining_carbs_g: int = Field(description="Remaining carbs in grams.")
    remaining_fats_g: int = Field(description="Remaining fats in grams.")
    disclaimer: str = Field(description="Medical disclaimer text.")


class MealType(str, Enum):
    """Valid meal types for suggestions."""
    BREAKFAST = "breakfast"
    LUNCH = "lunch"
    DINNER = "dinner"
    SNACK = "snack"


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.post("/chat", response_model=CoachChatResponse)
async def coach_chat(
    request: CoachChatRequest,
    current_user: User = Depends(require_premium),
    session: AsyncSession = Depends(get_session),
):
    """
    Chat with the AI nutrition coach.

    The coach has access to the user's complete nutrition context:
    profile, today's food log, macros, NutriScore, alerts, and streaks.
    Responses are personalized and actionable.
    """
    try:
        result = await AICoachService.get_coach_response(
            user_id=current_user.id,
            user_message=request.message,
            session=session,
        )
        return CoachChatResponse(**result)
    except ValueError as e:
        logger.error("Coach chat error for user %s: %s", current_user.id, str(e))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
        )
    except Exception as e:
        logger.exception("Unexpected coach chat error for user %s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno del coach. Intenta de nuevo.",
        )


@router.get("/insight", response_model=CoachInsightResponse)
async def daily_insight(
    current_user: User = Depends(require_premium),
    session: AsyncSession = Depends(get_session),
):
    """
    Get a proactive daily insight from the AI coach.

    The insight is generated from real user data: today's consumption,
    calorie/macro adherence, streak, and any active health alerts.
    """
    try:
        result = await AICoachService.get_daily_insight(
            user_id=current_user.id,
            session=session,
        )
        return CoachInsightResponse(**result)
    except ValueError as e:
        logger.error("Coach insight error for user %s: %s", current_user.id, str(e))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
        )
    except Exception as e:
        logger.exception("Unexpected coach insight error for user %s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno del coach. Intenta de nuevo.",
        )


@router.get("/suggest/{meal_type}", response_model=CoachMealSuggestionResponse)
async def suggest_meal(
    meal_type: MealType,
    current_user: User = Depends(require_premium),
    session: AsyncSession = Depends(get_session),
):
    """
    Get a personalized meal suggestion based on remaining macros.

    The coach suggests a concrete meal with estimated nutritional values,
    considering the user's diet preferences and what they've already eaten today.

    **meal_type** must be one of: `breakfast`, `lunch`, `dinner`, `snack`.
    """
    try:
        result = await AICoachService.get_meal_suggestion(
            user_id=current_user.id,
            meal_type=meal_type.value,
            session=session,
        )
        # Convert nested suggestion dict to Pydantic model
        result["suggestion"] = MealSuggestionDetail(**result["suggestion"])
        return CoachMealSuggestionResponse(**result)
    except ValueError as e:
        error_msg = str(e)
        logger.error(
            "Coach meal suggestion error for user %s: %s",
            current_user.id, error_msg,
        )
        if "Tipo de comida invalido" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=error_msg,
            )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=error_msg,
        )
    except Exception as e:
        logger.exception(
            "Unexpected coach suggestion error for user %s", current_user.id
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno del coach. Intenta de nuevo.",
        )
