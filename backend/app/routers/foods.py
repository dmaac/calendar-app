from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlmodel.ext.asyncio.session import AsyncSession
from ..core.database import get_session
from ..models.user import User
from ..models.food import Food, FoodCreate, FoodRead, FoodUpdate
from ..models.user_food_favorite import UserFoodFavoriteRead
from ..services.food_service import FoodService
from ..schemas.nutrition import PaginatedResponse
from .auth import get_current_user

router = APIRouter(prefix="/foods", tags=["foods"])


@router.get("/favorites", response_model=List[UserFoodFavoriteRead])
async def get_favorites(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    food_service = FoodService(session)
    favorites = await food_service.get_favorites(current_user.id)

    # Batch-load all foods in a single query instead of N+1 individual queries
    food_ids = [fav.food_id for fav in favorites]
    food_map = await food_service.get_foods_by_ids(food_ids)

    result = []
    for fav in favorites:
        food = food_map.get(fav.food_id)
        result.append(
            UserFoodFavoriteRead(
                id=fav.id,
                user_id=fav.user_id,
                food_id=fav.food_id,
                created_at=fav.created_at,
                food_name=food.name if food else None,
                food_brand=food.brand if food else None,
            )
        )
    return result


@router.post("/favorites", response_model=UserFoodFavoriteRead)
async def add_favorite(
    food_id: int = Query(..., gt=0, description="Food ID to favorite"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    food_service = FoodService(session)

    # Verify food exists
    food = await food_service.get_food_by_id(food_id)
    if not food:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Food not found",
        )

    favorite = await food_service.add_favorite(current_user.id, food_id)
    return UserFoodFavoriteRead(
        id=favorite.id,
        user_id=favorite.user_id,
        food_id=favorite.food_id,
        created_at=favorite.created_at,
        food_name=food.name,
        food_brand=food.brand,
    )


@router.delete("/favorites")
async def remove_favorite(
    food_id: int = Query(..., gt=0, description="Food ID to unfavorite"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    food_service = FoodService(session)

    if not await food_service.remove_favorite(current_user.id, food_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Favorite not found",
        )

    return {"message": "Favorite removed successfully"}


@router.get("/recent", response_model=List[FoodRead])
async def get_recent_foods(
    limit: int = Query(20, ge=1, le=100, description="Max number of recent foods"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    food_service = FoodService(session)
    return await food_service.get_recent_foods(current_user.id, limit=limit)


@router.get("/search")
async def search_foods(
    query: str = Query(..., min_length=1, description="Search foods by name (supports fuzzy matching)"),
    offset: int = Query(0, ge=0, description="Number of items to skip"),
    limit: int = Query(20, ge=1, le=100, description="Max number of results"),
    min_calories: Optional[float] = Query(None, ge=0, description="Minimum calories filter"),
    max_calories: Optional[float] = Query(None, ge=0, description="Maximum calories filter"),
    diet_type: Optional[str] = Query(
        None,
        description="Diet filter: vegetarian, vegan, keto, low_fat, high_protein",
    ),
    sort_by: str = Query(
        "relevance",
        description="Sort by: relevance, name, calories, calories_desc, protein",
    ),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Search the food database with fuzzy matching and filters.

    Fuzzy matching allows typos (e.g. "poyo" finds "pollo").
    Results include a relevance_score (0.0 - 1.0).
    """
    food_service = FoodService(session)
    items, total = await food_service.search_foods(
        query=query,
        limit=limit,
        offset=offset,
        min_calories=min_calories,
        max_calories=max_calories,
        diet_type=diet_type,
        sort_by=sort_by,
    )
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.get("/", response_model=PaginatedResponse[FoodRead])
async def get_foods(
    query: str = Query(None, description="Search foods by name"),
    offset: int = Query(0, ge=0, description="Number of items to skip"),
    limit: int = Query(50, ge=1, le=200, description="Max number of results"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    food_service = FoodService(session)

    if query:
        # Use the basic ILIKE search for the generic list endpoint
        items, total = await food_service.search_foods(query, limit=limit, offset=offset)
    else:
        items, total = await food_service.get_all_foods(limit=limit, offset=offset)

    return PaginatedResponse(items=items, total=total, offset=offset, limit=limit)


@router.get("/{food_id}", response_model=FoodRead)
async def get_food(
    food_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    food_service = FoodService(session)
    food = await food_service.get_food_by_id(food_id)

    if not food:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Food not found",
        )

    return food


@router.post("/", response_model=FoodRead)
async def create_food(
    food_create: FoodCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    food_service = FoodService(session)
    food = await food_service.create_food(food_create, created_by=current_user.id)
    return food


@router.put("/{food_id}", response_model=FoodRead)
async def update_food(
    food_id: int,
    food_update: FoodUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    food_service = FoodService(session)

    # SECURITY: Verify ownership before allowing modification (IDOR prevention)
    food = await food_service.get_food_by_id(food_id)
    if not food:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Food not found",
        )
    # Only the creator can update their own foods.
    # System foods (created_by=None) cannot be modified by regular users.
    if food.created_by is None or food.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to modify this food",
        )

    updated_food = await food_service.update_food(food_id, food_update)
    return updated_food


@router.delete("/{food_id}")
async def delete_food(
    food_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    food_service = FoodService(session)

    # SECURITY: Verify ownership before allowing deletion (IDOR prevention)
    food = await food_service.get_food_by_id(food_id)
    if not food:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Food not found",
        )
    # Only the creator can delete their own foods.
    # System foods (created_by=None) cannot be deleted by regular users.
    if food.created_by is None or food.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to delete this food",
        )

    await food_service.delete_food(food_id)
    return {"message": "Food deleted successfully"}
