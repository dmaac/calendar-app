from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel.ext.asyncio.session import AsyncSession
from ..core.database import get_session
from ..models.user import User
from ..models.nutrition_profile import (
    UserNutritionProfileCreate,
    UserNutritionProfileRead,
    UserNutritionProfileUpdate,
)
from ..services.nutrition_service import NutritionService
from ..schemas.nutrition import MacroTargets, CalculateTargetsRequest
from .auth import get_current_user

router = APIRouter(prefix="/nutrition-profile", tags=["nutrition-profile"])


@router.get("/", response_model=UserNutritionProfileRead)
async def get_nutrition_profile(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    nutrition_service = NutritionService(session)
    profile = await nutrition_service.get_profile_with_fallback(current_user.id)

    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nutrition profile not found. Complete onboarding first.",
        )

    return profile


@router.post("/", response_model=UserNutritionProfileRead)
async def create_or_update_nutrition_profile(
    profile_data: UserNutritionProfileCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    nutrition_service = NutritionService(session)
    profile = await nutrition_service.create_or_update_profile(current_user.id, profile_data)
    return profile


@router.put("/", response_model=UserNutritionProfileRead)
async def update_nutrition_profile(
    profile_update: UserNutritionProfileUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    nutrition_service = NutritionService(session)
    profile = await nutrition_service.update_profile(current_user.id, profile_update)

    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nutrition profile not found. Create one first.",
        )

    return profile


@router.post("/calculate-targets", response_model=MacroTargets)
async def calculate_targets(
    request: CalculateTargetsRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    nutrition_service = NutritionService(session)
    targets = nutrition_service.calculate_targets(
        height_cm=request.height_cm,
        weight_kg=request.weight_kg,
        age=request.age,
        gender=request.gender,
        activity_level=request.activity_level,
        goal=request.goal,
    )
    return MacroTargets(**targets)
