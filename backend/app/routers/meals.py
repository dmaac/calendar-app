import logging
from typing import List, Optional
from datetime import date
from enum import Enum
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select, func, col
from ..core.database import get_session
from ..core.cache import (
    cache_get, cache_set, cache_delete,
    daily_summary_key, weekly_summary_key, invalidate_daily_summary,
    CACHE_TTL,
)
from ..core.pagination import PaginatedResponse, build_paginated_response, paginate_params
from ..models.user import User
from ..models.meal_log import MealLog, MealLogCreate, MealLogRead, MealType
from ..services.meal_service import MealService
from ..services.nutrition_service import NutritionService
from ..schemas.nutrition import DailySummaryResponse
from ..schemas.nutrition import PaginatedResponse as LegacyPaginatedResponse
from ..schemas.api_responses import MessageResponse, WaterUpdateResponse
from .auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/meals", tags=["meals"])


class MealSortBy(str, Enum):
    date = "date"
    calories = "calories"
    created_at = "created_at"


class SortOrder(str, Enum):
    asc = "asc"
    desc = "desc"


@router.post(
    "/",
    response_model=MealLogRead,
    status_code=status.HTTP_201_CREATED,
    summary="Log a meal",
    description="Log a new meal entry from the food database with serving size and meal type.",
    responses={
        201: {"description": "Meal logged successfully"},
        400: {"description": "Invalid meal data (e.g. food not found)"},
    },
)
async def log_meal(
    meal_create: MealLogCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    meal_service = MealService(session)

    try:
        meal_log = await meal_service.log_meal(meal_create, current_user.id)

        # Invalidate daily and weekly summary caches for this date
        try:
            await invalidate_daily_summary(current_user.id, meal_create.date.isoformat())
        except Exception:
            pass

        # Get food info for response
        from ..services.food_service import FoodService
        food_service = FoodService(session)
        food = await food_service.get_food_by_id(meal_log.food_id)

        return MealLogRead(
            id=meal_log.id,
            date=meal_log.date,
            meal_type=meal_log.meal_type,
            food_id=meal_log.food_id,
            servings=meal_log.servings,
            total_calories=meal_log.total_calories,
            total_protein=meal_log.total_protein,
            total_carbs=meal_log.total_carbs,
            total_fat=meal_log.total_fat,
            total_fiber=meal_log.total_fiber,
            total_sugar=meal_log.total_sugar,
            user_id=meal_log.user_id,
            created_at=meal_log.created_at,
            food_name=food.name if food else None,
            food_brand=food.brand if food else None,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get(
    "/summary",
    response_model=DailySummaryResponse,
    summary="Get daily nutrition summary",
    description="Get daily nutrition summary with macro totals vs targets for a specific date.",
    responses={
        200: {"description": "Daily summary with consumed and target macros"},
    },
)
async def get_daily_summary(
    target_date: date = Query(..., description="Date to get summary for (YYYY-MM-DD)"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    # Try cache first
    cache_key = daily_summary_key(current_user.id, target_date.isoformat())
    try:
        cached = await cache_get(cache_key)
        if cached is not None:
            return cached
    except Exception:
        pass

    meal_service = MealService(session)
    nutrition_service = NutritionService(session)

    # Safely fetch daily data — return zeroed summary if anything fails
    try:
        data = await meal_service.get_daily_summary_with_fiber_sugar(current_user.id, target_date)
    except Exception:
        data = {
            "date": target_date,
            "total_calories": 0.0,
            "total_protein": 0.0,
            "total_carbs": 0.0,
            "total_fat": 0.0,
            "total_fiber": 0.0,
            "total_sugar": 0.0,
            "water_ml": 0.0,
            "meals_count": 0,
        }

    profile = await nutrition_service.get_profile(current_user.id)

    response = DailySummaryResponse(
        date=data["date"],
        total_calories=data["total_calories"],
        total_protein=data["total_protein"],
        total_carbs=data["total_carbs"],
        total_fat=data["total_fat"],
        total_fiber=data["total_fiber"],
        total_sugar=data["total_sugar"],
        target_calories=profile.target_calories if profile else 2000.0,
        target_protein=profile.target_protein_g if profile else 150.0,
        target_carbs=profile.target_carbs_g if profile else 250.0,
        target_fat=profile.target_fat_g if profile else 65.0,
        water_ml=data["water_ml"],
        meals_count=data["meals_count"],
    )

    try:
        await cache_set(cache_key, response.model_dump(mode="json"), CACHE_TTL["daily_summary"])
    except Exception:
        pass

    return response


@router.get(
    "/weekly-summary",
    response_model=List[DailySummaryResponse],
    summary="Get weekly nutrition summary",
    description="Get 7-day nutrition summary ending on the specified end date. Cached for 3 minutes.",
    responses={
        200: {"description": "Array of 7 daily summaries"},
    },
)
async def get_weekly_summary(
    end_date: date = Query(..., description="End date for weekly summary (YYYY-MM-DD)"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    # Try cache first
    w_cache_key = weekly_summary_key(current_user.id, end_date.isoformat())
    try:
        cached = await cache_get(w_cache_key)
        if cached is not None:
            return cached
    except Exception:
        pass

    meal_service = MealService(session)
    nutrition_service = NutritionService(session)

    try:
        profile = await nutrition_service.get_profile(current_user.id)
        summaries = await meal_service.get_weekly_summary(current_user.id, end_date)
    except Exception:
        logger.exception("Weekly summary query failed: user_id=%s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load weekly summary. Please try again.",
        )

    result = []
    for data in summaries:
        result.append(
            DailySummaryResponse(
                date=data["date"],
                total_calories=data["total_calories"],
                total_protein=data["total_protein"],
                total_carbs=data["total_carbs"],
                total_fat=data["total_fat"],
                total_fiber=data["total_fiber"],
                total_sugar=data["total_sugar"],
                target_calories=profile.target_calories if profile else 2000.0,
                target_protein=profile.target_protein_g if profile else 150.0,
                target_carbs=profile.target_carbs_g if profile else 250.0,
                target_fat=profile.target_fat_g if profile else 65.0,
                water_ml=data["water_ml"],
                meals_count=data["meals_count"],
            )
        )

    # Cache the weekly summary
    try:
        serializable = [r.model_dump(mode="json") for r in result]
        await cache_set(w_cache_key, serializable, CACHE_TTL["weekly_summary"])
    except Exception:
        pass

    return result


@router.get(
    "/history",
    response_model=List[DailySummaryResponse],
    summary="Get nutrition history",
    description="Get daily nutrition summaries for the last N days (1-90). Defaults to 7 days.",
    responses={
        200: {"description": "Array of daily summaries"},
    },
)
async def get_history(
    days: int = Query(7, ge=1, le=90, description="Number of days of history"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    meal_service = MealService(session)
    nutrition_service = NutritionService(session)

    try:
        profile = await nutrition_service.get_profile(current_user.id)
        summaries = await meal_service.get_history(current_user.id, days)
    except Exception:
        logger.exception("History query failed: user_id=%s days=%d", current_user.id, days)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load history. Please try again.",
        )

    result = []
    for data in summaries:
        result.append(
            DailySummaryResponse(
                date=data["date"],
                total_calories=data["total_calories"],
                total_protein=data["total_protein"],
                total_carbs=data["total_carbs"],
                total_fat=data["total_fat"],
                total_fiber=data["total_fiber"],
                total_sugar=data["total_sugar"],
                target_calories=profile.target_calories if profile else 2000.0,
                target_protein=profile.target_protein_g if profile else 150.0,
                target_carbs=profile.target_carbs_g if profile else 250.0,
                target_fat=profile.target_fat_g if profile else 65.0,
                water_ml=data["water_ml"],
                meals_count=data["meals_count"],
            )
        )

    return result


@router.get(
    "/list",
    response_model=PaginatedResponse[MealLogRead],
    summary="List meal logs (paginated)",
    description=(
        "List meal logs with page-based pagination, date range filters, "
        "meal type filter, and sorting."
    ),
    responses={
        200: {"description": "Paginated list of meal logs"},
    },
)
async def list_meals_paginated(
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    date_from: Optional[date] = Query(None, description="Filter: start date (inclusive)"),
    date_to: Optional[date] = Query(None, description="Filter: end date (inclusive)"),
    meal_type: Optional[MealType] = Query(None, description="Filter: breakfast, lunch, dinner, snack"),
    sort_by: MealSortBy = Query(MealSortBy.date, description="Sort field"),
    order: SortOrder = Query(SortOrder.desc, description="Sort order"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    List meal logs with page-based pagination, date range filters, meal type filter, and sorting.

    Examples:
    - `GET /meals/list?page=1&page_size=20` -- latest 20 meals
    - `GET /meals/list?date_from=2026-03-01&date_to=2026-03-15&meal_type=breakfast`
    - `GET /meals/list?sort_by=calories&order=desc`
    """
    # Build base query
    query = select(MealLog).where(MealLog.user_id == current_user.id)
    count_query = select(func.count()).select_from(MealLog).where(MealLog.user_id == current_user.id)

    # Apply filters
    if date_from is not None:
        query = query.where(MealLog.date >= date_from)
        count_query = count_query.where(MealLog.date >= date_from)
    if date_to is not None:
        query = query.where(MealLog.date <= date_to)
        count_query = count_query.where(MealLog.date <= date_to)
    if meal_type is not None:
        query = query.where(MealLog.meal_type == meal_type)
        count_query = count_query.where(MealLog.meal_type == meal_type)

    # Apply sorting
    sort_column_map = {
        MealSortBy.date: MealLog.date,
        MealSortBy.calories: MealLog.total_calories,
        MealSortBy.created_at: MealLog.created_at,
    }
    sort_col = sort_column_map[sort_by]
    if order == SortOrder.desc:
        query = query.order_by(col(sort_col).desc())  # type: ignore
    else:
        query = query.order_by(col(sort_col).asc())  # type: ignore

    # Get total count
    try:
        total_result = await session.execute(count_query)
        total = total_result.scalar_one()
    except Exception:
        logger.exception("Meals count query failed: user_id=%s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load meals. Please try again.",
        )

    # Apply pagination
    offset, limit = paginate_params(page, page_size)
    query = query.offset(offset).limit(limit)

    try:
        result = await session.execute(query)
        meals = list(result.scalars().all())
    except Exception:
        logger.exception("Meals list query failed: user_id=%s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load meals. Please try again.",
        )

    # Batch-fetch food names
    from ..services.food_service import FoodService
    food_service = FoodService(session)
    food_ids = list({meal.food_id for meal in meals})
    food_map = await food_service.get_foods_by_ids(food_ids)

    items = []
    for meal in meals:
        food = food_map.get(meal.food_id)
        items.append(
            MealLogRead(
                id=meal.id,
                date=meal.date,
                meal_type=meal.meal_type,
                food_id=meal.food_id,
                servings=meal.servings,
                total_calories=meal.total_calories,
                total_protein=meal.total_protein,
                total_carbs=meal.total_carbs,
                total_fat=meal.total_fat,
                total_fiber=meal.total_fiber,
                total_sugar=meal.total_sugar,
                user_id=meal.user_id,
                created_at=meal.created_at,
                food_name=food.name if food else None,
                food_brand=food.brand if food else None,
            )
        )

    return build_paginated_response(items=items, total=total, page=page, page_size=page_size)


@router.get(
    "/",
    response_model=LegacyPaginatedResponse[MealLogRead],
    summary="Get meals by date",
    description="Get meals for a specific date with offset-based pagination (legacy).",
    responses={
        200: {"description": "Paginated list of meals for the given date"},
    },
)
async def get_meals(
    target_date: date = Query(..., description="Date to get meals for (YYYY-MM-DD)"),
    offset: int = Query(0, ge=0, description="Number of items to skip"),
    limit: int = Query(50, ge=1, le=200, description="Max number of results"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    meal_service = MealService(session)
    try:
        total = await meal_service.count_meals_by_date(current_user.id, target_date)
        meals = await meal_service.get_meals_by_date(current_user.id, target_date, offset=offset, limit=limit)
    except Exception:
        logger.exception("Get meals by date failed: user_id=%s date=%s", current_user.id, target_date)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load meals. Please try again.",
        )

    from ..services.food_service import FoodService
    food_service = FoodService(session)

    food_ids = list({meal.food_id for meal in meals})
    food_map = await food_service.get_foods_by_ids(food_ids)

    items = []
    for meal in meals:
        food = food_map.get(meal.food_id)
        items.append(
            MealLogRead(
                id=meal.id,
                date=meal.date,
                meal_type=meal.meal_type,
                food_id=meal.food_id,
                servings=meal.servings,
                total_calories=meal.total_calories,
                total_protein=meal.total_protein,
                total_carbs=meal.total_carbs,
                total_fat=meal.total_fat,
                total_fiber=meal.total_fiber,
                total_sugar=meal.total_sugar,
                user_id=meal.user_id,
                created_at=meal.created_at,
                food_name=food.name if food else None,
                food_brand=food.brand if food else None,
            )
        )

    return LegacyPaginatedResponse(items=items, total=total, offset=offset, limit=limit)


@router.delete(
    "/{meal_id}",
    response_model=MessageResponse,
    summary="Delete a meal log",
    description="Delete a meal log entry by its ID. Only deletes meals owned by the authenticated user.",
    responses={
        200: {"description": "Meal deleted successfully"},
        404: {"description": "Meal log not found"},
    },
)
async def delete_meal(
    meal_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    meal_service = MealService(session)

    # SEC: Fetch meal with user_id filter to prevent IDOR timing leak
    meal = await meal_service.get_meal_by_id_for_user(meal_id, current_user.id)
    meal_date = meal.date if meal else None

    if not await meal_service.delete_meal(meal_id, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meal log not found",
        )

    # Invalidate daily and weekly summary caches
    if meal_date:
        try:
            await invalidate_daily_summary(current_user.id, meal_date.isoformat())
        except Exception:
            pass

    return {"message": "Meal log deleted successfully"}


@router.post(
    "/water",
    response_model=WaterUpdateResponse,
    summary="Update water intake",
    description="Set water intake (in ml) for a specific date.",
    responses={
        200: {"description": "Water intake updated"},
        500: {"description": "Failed to update water intake"},
    },
)
async def update_water(
    target_date: date = Query(..., description="Date (YYYY-MM-DD)"),
    water_ml: float = Query(..., ge=0, le=20000, description="Water intake in ml (0-20000)"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    meal_service = MealService(session)
    try:
        summary = await meal_service.update_water(current_user.id, target_date, water_ml)
    except Exception:
        logger.exception("Water update failed: user_id=%s date=%s", current_user.id, target_date)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update water intake. Please try again.",
        )

    # Invalidate daily and weekly summary caches
    try:
        await invalidate_daily_summary(current_user.id, target_date.isoformat())
    except Exception:
        pass

    return {"message": "Water intake updated", "water_ml": summary.water_ml}
