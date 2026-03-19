from typing import List
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlmodel.ext.asyncio.session import AsyncSession
from ..core.database import get_session
from ..models.user import User
from ..models.meal_log import MealLogCreate, MealLogRead
from ..services.meal_service import MealService
from ..services.nutrition_service import NutritionService
from ..schemas.nutrition import DailySummaryResponse, PaginatedResponse
from .auth import get_current_user

router = APIRouter(prefix="/meals", tags=["meals"])


@router.post("/", response_model=MealLogRead)
async def log_meal(
    meal_create: MealLogCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    meal_service = MealService(session)

    try:
        meal_log = await meal_service.log_meal(meal_create, current_user.id)

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


@router.get("/summary", response_model=DailySummaryResponse)
async def get_daily_summary(
    target_date: date = Query(..., description="Date to get summary for (YYYY-MM-DD)"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    meal_service = MealService(session)
    nutrition_service = NutritionService(session)

    data = await meal_service.get_daily_summary_with_fiber_sugar(current_user.id, target_date)
    profile = await nutrition_service.get_profile(current_user.id)

    meals = await meal_service.get_meals_by_date(current_user.id, target_date)

    return DailySummaryResponse(
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
        meals_count=len(meals),
    )


@router.get("/weekly-summary", response_model=List[DailySummaryResponse])
async def get_weekly_summary(
    end_date: date = Query(..., description="End date for weekly summary (YYYY-MM-DD)"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    meal_service = MealService(session)
    nutrition_service = NutritionService(session)
    profile = await nutrition_service.get_profile(current_user.id)

    summaries = await meal_service.get_weekly_summary(current_user.id, end_date)

    result = []
    for data in summaries:
        meals = await meal_service.get_meals_by_date(current_user.id, data["date"])
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
                meals_count=len(meals),
            )
        )

    return result


@router.get("/history", response_model=List[DailySummaryResponse])
async def get_history(
    days: int = Query(7, ge=1, le=90, description="Number of days of history"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    meal_service = MealService(session)
    nutrition_service = NutritionService(session)
    profile = await nutrition_service.get_profile(current_user.id)

    summaries = await meal_service.get_history(current_user.id, days)

    result = []
    for data in summaries:
        meals = await meal_service.get_meals_by_date(current_user.id, data["date"])
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
                meals_count=len(meals),
            )
        )

    return result


@router.get("/", response_model=PaginatedResponse[MealLogRead])
async def get_meals(
    target_date: date = Query(..., description="Date to get meals for (YYYY-MM-DD)"),
    offset: int = Query(0, ge=0, description="Number of items to skip"),
    limit: int = Query(50, ge=1, le=200, description="Max number of results"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    meal_service = MealService(session)
    total = await meal_service.count_meals_by_date(current_user.id, target_date)
    meals = await meal_service.get_meals_by_date(current_user.id, target_date, offset=offset, limit=limit)

    from ..services.food_service import FoodService
    food_service = FoodService(session)

    items = []
    for meal in meals:
        food = await food_service.get_food_by_id(meal.food_id)
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

    return PaginatedResponse(items=items, total=total, offset=offset, limit=limit)


@router.delete("/{meal_id}")
async def delete_meal(
    meal_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    meal_service = MealService(session)

    if not await meal_service.delete_meal(meal_id, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meal log not found",
        )

    return {"message": "Meal log deleted successfully"}


@router.post("/water")
async def update_water(
    target_date: date = Query(..., description="Date (YYYY-MM-DD)"),
    water_ml: float = Query(..., ge=0, description="Water intake in ml"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    meal_service = MealService(session)
    summary = await meal_service.update_water(current_user.id, target_date, water_ml)
    return {"message": "Water intake updated", "water_ml": summary.water_ml}
