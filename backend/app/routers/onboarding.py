from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel.ext.asyncio.session import AsyncSession

from ..core.database import get_session
from ..models.user import User
from ..schemas.onboarding import (
    OnboardingStepSave,
    OnboardingComplete,
    OnboardingProfileRead,
    NutritionPlan,
)
from ..services.onboarding_service import OnboardingService
from .auth import get_current_user

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


@router.post("/save-step", response_model=OnboardingProfileRead)
async def save_onboarding_step(
    data: OnboardingStepSave,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Save a single onboarding step (partial update — only provided fields are stored)."""
    service = OnboardingService(session)
    profile = await service.save_or_update_profile(current_user.id, data)
    return profile


@router.post("/complete", response_model=OnboardingProfileRead)
async def complete_onboarding(
    data: OnboardingComplete,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Complete the onboarding flow.
    Validates all required fields, calculates the nutrition plan, and marks the
    profile as completed.
    """
    service = OnboardingService(session)
    profile = await service.complete_onboarding(current_user.id, data)
    return profile


@router.get("/profile", response_model=OnboardingProfileRead)
async def get_onboarding_profile(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Return the current user's onboarding profile."""
    service = OnboardingService(session)
    profile = await service.get_profile(current_user.id)

    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Onboarding profile not found. Start the onboarding flow first.",
        )

    return profile
