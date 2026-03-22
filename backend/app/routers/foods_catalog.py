from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlmodel.ext.asyncio.session import AsyncSession
from ..core.database import get_session
from ..models.food import FoodRead
from ..services.food_service import FoodService
from ..schemas.nutrition import PaginatedResponse

router = APIRouter(prefix="/api/catalog", tags=["foods-catalog"])


@router.get("/foods", response_model=PaginatedResponse[FoodRead])
async def get_food_catalog(
    offset: int = Query(0, ge=0, description="Number of items to skip"),
    limit: int = Query(50, ge=1, le=200, description="Max number of results"),
    category: Optional[str] = Query(
        None,
        description="Filter by category (e.g. fruits, vegetables, proteins, dairy, grains, fats, beverages)",
    ),
    min_calories: Optional[float] = Query(None, ge=0, description="Minimum calories filter"),
    max_calories: Optional[float] = Query(None, ge=0, description="Maximum calories filter"),
    sort_by: str = Query(
        "name",
        description="Sort by: name, calories, calories_desc, protein",
    ),
    session: AsyncSession = Depends(get_session),
):
    """Public food catalog with pagination and category/calorie filters.

    No authentication required -- this endpoint serves the browseable
    food database for all users.
    """
    food_service = FoodService(session)
    foods, total = await food_service.get_all_foods(
        limit=limit,
        offset=offset,
        min_calories=min_calories,
        max_calories=max_calories,
        category=category,
        sort_by=sort_by,
    )
    return PaginatedResponse(items=foods, total=total, offset=offset, limit=limit)


@router.get("/categories", response_model=List[str])
async def get_food_categories(
    session: AsyncSession = Depends(get_session),
):
    """Return all available food categories for filtering."""
    food_service = FoodService(session)
    return await food_service.get_categories()
