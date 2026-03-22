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
from .auth import get_current_user

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


@router.get("/", response_model=List[UserFoodFavoriteRead])
async def get_favorites(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """List all favorite foods for the current user."""
    food_service = FoodService(session)
    favorites = await food_service.get_favorites(current_user.id)

    # Batch-load foods for efficiency
    food_ids = [fav.food_id for fav in favorites]
    foods_map = await food_service.get_foods_by_ids(food_ids)

    return [
        _build_favorite_read(fav, foods_map.get(fav.food_id))
        for fav in favorites
    ]


@router.post("/", response_model=UserFoodFavoriteRead)
async def add_favorite(
    body: FavoriteCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Add a food to favorites."""
    food_service = FoodService(session)

    food = await food_service.get_food_by_id(body.food_id)
    if not food:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Food not found",
        )

    favorite = await food_service.add_favorite(current_user.id, body.food_id)
    return _build_favorite_read(favorite, food)


@router.delete("/{favorite_id}")
async def remove_favorite(
    favorite_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Remove a food from favorites by favorite ID."""
    food_service = FoodService(session)
    favorites = await food_service.get_favorites(current_user.id)
    target = next((f for f in favorites if f.id == favorite_id), None)

    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Favorite not found",
        )

    await food_service.remove_favorite(current_user.id, target.food_id)
    return {"message": "Favorite removed successfully"}


@router.post("/{favorite_id}/log", response_model=UserFoodFavoriteRead)
async def log_favorite(
    favorite_id: int,
    meal_type: MealType = Query(MealType.LUNCH, description="Meal type for the log"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Quick-log a favorite food to today's food log and increment times_logged."""
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
    await meal_service.log_meal(meal_create, current_user.id)

    # Increment times_logged
    target.times_logged += 1
    session.add(target)
    await session.commit()
    await session.refresh(target)

    return _build_favorite_read(target, food)
