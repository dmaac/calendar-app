import logging
from typing import List
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlmodel.ext.asyncio.session import AsyncSession
from ..core.database import get_session
from ..models.user import User
from ..models.meal_log import MealLog, MealType
from ..models.user_food_favorite import UserFoodFavoriteRead, FavoriteCreate
from ..services.food_service import FoodService
from ..services.meal_service import MealService
from ..schemas.api_responses import FavoriteRemovedResponse
from .auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/favorites", tags=["favorites"])


def _build_favorite_read(fav, food) -> UserFoodFavoriteRead:
    return UserFoodFavoriteRead(
        id=fav.id,
        user_id=fav.user_id,
        food_id=fav.food_id,
        times_logged=fav.times_logged,
        created_at=fav.created_at,
        food_name=food.name if food else None,
        food_brand=food.brand if food else None,
        calories=food.calories if food else None,
        protein_g=food.protein_g if food else None,
        carbs_g=food.carbs_g if food else None,
        fat_g=food.fat_g if food else None,
    )


@router.get(
    "/",
    response_model=List[UserFoodFavoriteRead],
    summary="List favorite foods",
    description="List all favorite foods for the authenticated user, including food details and log counts.",
    responses={
        200: {"description": "List of favorites with food details"},
    },
)
async def get_favorites(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    food_service = FoodService(session)
    try:
        favorites = await food_service.get_favorites(current_user.id)

        # Batch-load foods for efficiency
        food_ids = [fav.food_id for fav in favorites]
        foods_map = await food_service.get_foods_by_ids(food_ids)
    except Exception:
        logger.exception("Get favorites failed: user_id=%s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load favorites. Please try again.",
        )

    return [
        _build_favorite_read(fav, foods_map.get(fav.food_id))
        for fav in favorites
    ]


@router.post(
    "/",
    response_model=UserFoodFavoriteRead,
    status_code=status.HTTP_201_CREATED,
    summary="Add food to favorites",
    description=(
        "Add a food to favorites. Accepts either food_id (existing catalog entry) "
        "or food_name + macros (auto-creates a catalog entry for AI-scanned foods)."
    ),
    responses={
        201: {"description": "Favorite added successfully"},
        404: {"description": "Food not found (when using food_id)"},
        422: {"description": "Missing required fields"},
    },
)
async def add_favorite(
    body: FavoriteCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    from ..models.food import Food as FoodModel

    food_service = FoodService(session)
    food_id = body.food_id

    if food_id:
        # Standard path: favorite an existing catalog food
        food = await food_service.get_food_by_id(food_id)
        if not food:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Food not found",
            )
    elif body.food_name and body.calories is not None:
        # AI-scanned food path: find or create a food catalog entry by name
        from sqlmodel import select
        stmt = select(FoodModel).where(
            FoodModel.name == body.food_name,
            FoodModel.created_by == current_user.id,
        )
        result = await session.execute(stmt)
        food = result.scalars().first()

        if not food:
            # Auto-create a food catalog entry from the inline data
            food = FoodModel(
                name=body.food_name,
                calories=body.calories or 0,
                protein_g=body.protein_g or 0,
                carbs_g=body.carbs_g or 0,
                fat_g=body.fat_g or 0,
                created_by=current_user.id,
            )
            session.add(food)
            try:
                await session.commit()
                await session.refresh(food)
            except Exception:
                await session.rollback()
                logger.exception("Auto-create food for favorite failed: user_id=%s", current_user.id)
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to create food entry. Please try again.",
                )

        food_id = food.id
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide either food_id or food_name with macros (calories, protein_g, carbs_g, fat_g).",
        )

    try:
        favorite = await food_service.add_favorite(current_user.id, food_id)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Add favorite failed: user_id=%s food_id=%s", current_user.id, food_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to add favorite. Please try again.",
        )
    return _build_favorite_read(favorite, food)


@router.delete(
    "/{favorite_id}",
    response_model=FavoriteRemovedResponse,
    summary="Remove food from favorites",
    description="Remove a food from the user's favorites by favorite ID.",
    responses={
        200: {"description": "Favorite removed successfully"},
        404: {"description": "Favorite not found"},
    },
)
async def remove_favorite(
    favorite_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    food_service = FoodService(session)
    favorites = await food_service.get_favorites(current_user.id)
    target = next((f for f in favorites if f.id == favorite_id), None)

    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Favorite not found",
        )

    try:
        await food_service.remove_favorite(current_user.id, target.food_id)
    except Exception:
        logger.exception("Remove favorite failed: user_id=%s favorite_id=%s", current_user.id, favorite_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to remove favorite. Please try again.",
        )
    return {"message": "Favorite removed successfully"}


@router.post(
    "/{favorite_id}/log",
    response_model=UserFoodFavoriteRead,
    summary="Quick-log a favorite food",
    description=(
        "Log a favorite food to today's meal log and increment the times_logged counter. "
        "Creates a meal log entry with 1 serving for the specified meal type."
    ),
    responses={
        200: {"description": "Favorite logged and counter incremented"},
        404: {"description": "Favorite or associated food not found"},
    },
)
async def log_favorite(
    favorite_id: int,
    meal_type: MealType = Query(MealType.LUNCH, description="Meal type for the log"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    food_service = FoodService(session)
    favorites = await food_service.get_favorites(current_user.id)
    target = next((f for f in favorites if f.id == favorite_id), None)

    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Favorite not found",
        )

    food = await food_service.get_food_by_id(target.food_id)
    if not food:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Food not found",
        )

    # Create a meal log from the favorite
    from ..models.meal_log import MealLogCreate
    meal_create = MealLogCreate(
        date=date.today(),
        meal_type=meal_type,
        food_id=food.id,
        servings=1.0,
    )
    meal_service = MealService(session)
    try:
        await meal_service.log_meal(meal_create, current_user.id)

        # Increment times_logged
        target.times_logged += 1
        session.add(target)
        await session.commit()
        await session.refresh(target)
    except HTTPException:
        raise
    except Exception:
        await session.rollback()
        logger.exception("Log favorite failed: user_id=%s favorite_id=%s", current_user.id, favorite_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to log favorite food. Please try again.",
        )

    return _build_favorite_read(target, food)
