import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field
from sqlmodel.ext.asyncio.session import AsyncSession

from ..core.database import get_session
from ..models.user import User
from ..models.food import Food, FoodCreate, FoodRead, FoodUpdate
from ..models.user_food_favorite import UserFoodFavoriteRead
from ..services.food_service import FoodService
from ..schemas.nutrition import PaginatedResponse
from .auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/foods", tags=["foods"])


# ---------------------------------------------------------------------------
# Request/response schemas for new endpoints
# ---------------------------------------------------------------------------

class CustomFoodCreate(BaseModel):
    """Request body for creating a custom food with validation."""
    name: str = Field(..., min_length=2, max_length=200, description="Food name")
    calories: float = Field(..., ge=0, le=5000, description="Calories (kcal)")
    protein_g: float = Field(..., ge=0, le=500, description="Protein (g)")
    carbs_g: float = Field(..., ge=0, le=500, description="Carbohydrates (g)")
    fat_g: float = Field(..., ge=0, le=500, description="Fat (g)")
    fiber_g: float = Field(0.0, ge=0, le=200, description="Fiber (g)")
    sugar_g: float = Field(0.0, ge=0, le=500, description="Sugar (g)")
    brand: Optional[str] = Field(None, max_length=200)
    category: Optional[str] = Field(None, max_length=100)
    serving_size: float = Field(100.0, gt=0, le=5000, description="Serving size")
    serving_unit: str = Field("g", max_length=30, description="Serving unit (g, ml, oz, cup, etc.)")


class ExternalLookupRequest(BaseModel):
    """Request body for external food database lookup."""
    query: str = Field(..., min_length=1, max_length=200, description="Search query or barcode")
    source: str = Field("usda", description="usda, openfoodfacts, or barcode")
    limit: int = Field(10, ge=1, le=25)


# ---------------------------------------------------------------------------
# Favorites
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Recent and frequent foods
# ---------------------------------------------------------------------------

@router.get("/recent")
async def get_recent_foods(
    limit: int = Query(20, ge=1, le=100, description="Max number of recent foods"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get recently eaten foods with usage metadata (last_eaten, eat_count).

    Returns enriched food dicts ordered by most recently eaten. Useful for
    the "quick re-log" feature on the home screen.
    """
    food_service = FoodService(session)
    return await food_service.get_recent_foods(current_user.id, limit=limit)


@router.get("/frequent")
async def get_frequent_foods(
    limit: int = Query(10, ge=1, le=50, description="Max number of frequent foods"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get the user's most frequently eaten foods (top N by count).

    Returns food dicts ordered by eat_count descending. Useful for
    "quick add" shortcuts on the home screen.
    """
    food_service = FoodService(session)
    return await food_service.get_frequent_foods(current_user.id, limit=limit)


# ---------------------------------------------------------------------------
# Autocomplete (type-ahead)
# ---------------------------------------------------------------------------

@router.get("/autocomplete")
async def autocomplete(
    q: str = Query(..., min_length=2, max_length=100, description="Partial food name"),
    limit: int = Query(8, ge=1, le=20, description="Max suggestions"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Type-ahead food name suggestions.

    Returns lightweight results (id, name, brand, calories) grouped by
    match_source: "recent", "favorite", or "exact". Personalized when
    the user has history.
    """
    food_service = FoodService(session)
    return await food_service.autocomplete(
        query=q,
        limit=limit,
        user_id=current_user.id,
    )


# ---------------------------------------------------------------------------
# Portion size multiplier
# ---------------------------------------------------------------------------

@router.get("/portion/{food_id}")
async def get_food_with_portion(
    food_id: int,
    multiplier: float = Query(1.0, gt=0, le=20, description="Portion multiplier (0.5 = half, 2.0 = double)"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get a food with macros scaled by portion_multiplier.

    Examples:
    - multiplier=0.5 returns half a serving
    - multiplier=1.0 returns one standard serving (default)
    - multiplier=2.0 returns double serving
    """
    food_service = FoodService(session)
    result = await food_service.get_food_with_portion(food_id, multiplier)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Food not found",
        )
    return result


# ---------------------------------------------------------------------------
# Custom food creation
# ---------------------------------------------------------------------------

@router.post("/custom")
async def create_custom_food(
    body: CustomFoodCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Create a custom food entry with comprehensive validation.

    Validates name, macro ranges, macro-calorie plausibility, serving unit,
    and duplicate detection. Returns the created food or 400 with details.
    """
    food_service = FoodService(session)
    try:
        result = await food_service.create_custom_food(
            user_id=current_user.id,
            name=body.name,
            calories=body.calories,
            protein_g=body.protein_g,
            carbs_g=body.carbs_g,
            fat_g=body.fat_g,
            fiber_g=body.fiber_g,
            sugar_g=body.sugar_g,
            brand=body.brand,
            category=body.category,
            serving_size=body.serving_size,
            serving_unit=body.serving_unit,
        )
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


# ---------------------------------------------------------------------------
# External database lookup (USDA / OpenFoodFacts)
# ---------------------------------------------------------------------------

@router.post("/lookup")
async def lookup_external_food(
    body: ExternalLookupRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Look up a food in an external database (USDA or OpenFoodFacts).

    Returns the API request configuration. The frontend or a background job
    can use this to make the actual HTTP request. Alternatively, use
    /foods/lookup/execute for a server-side lookup.
    """
    food_service = FoodService(session)
    try:
        config = await food_service.lookup_external(
            query=body.query,
            source=body.source,
            limit=body.limit,
        )
        return config
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/lookup/execute")
async def execute_external_lookup(
    body: ExternalLookupRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Execute a food lookup against an external database and return parsed results.

    Makes the HTTP request server-side and returns standardized food dicts.
    Requires httpx to be installed.
    """
    food_service = FoodService(session)
    try:
        config = await food_service.lookup_external(
            query=body.query,
            source=body.source,
            limit=body.limit,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    try:
        import httpx
    except ImportError:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="httpx is required for server-side lookup. Install with: pip install httpx",
        )

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                config["url"],
                params=config["params"],
                headers=config.get("headers", {}),
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as e:
        logger.warning("External lookup HTTP error: %s %s", e.response.status_code, body.source)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"External API returned status {e.response.status_code}",
        )
    except Exception as e:
        logger.exception("External lookup failed: source=%s query=%s", body.source, body.query)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to reach external food database",
        )

    source = config["source"]
    if source == "usda":
        foods = FoodService.parse_usda_response(data)
    elif source in ("openfoodfacts", "openfoodfacts_barcode"):
        foods = FoodService.parse_openfoodfacts_response(data)
    else:
        foods = []

    return {"source": source, "query": body.query, "results": foods, "count": len(foods)}


@router.post("/import-external")
async def import_external_food(
    food_data: dict,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Import a food from an external database lookup into the local catalog.

    Accepts a food dict from the /lookup/execute response and creates a
    local food entry. Deduplicates by name+brand.
    """
    food_service = FoodService(session)
    try:
        food = await food_service.import_from_external(food_data, current_user.id)
        return {
            "id": food.id,
            "name": food.name,
            "brand": food.brand,
            "calories": food.calories,
            "protein_g": food.protein_g,
            "carbs_g": food.carbs_g,
            "fat_g": food.fat_g,
            "imported": True,
        }
    except Exception:
        logger.exception("Import external food failed: user_id=%s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to import food. Please try again.",
        )


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------

@router.get("/search")
async def search_foods(
    query: str = Query(..., min_length=1, description="Search foods by name (supports fuzzy matching and typo correction)"),
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
    Common Spanish food name misspellings are auto-corrected.
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


# ---------------------------------------------------------------------------
# Browse catalog
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Single food CRUD
# ---------------------------------------------------------------------------

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
