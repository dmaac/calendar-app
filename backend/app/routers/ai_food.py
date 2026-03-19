"""
AI Food Scan + Food Log + Dashboard endpoints
─────────────────────────────────────────────
POST /api/food/scan        — upload image, get nutrition, auto-log
GET  /api/food/logs        — list user's food logs
GET  /api/food/logs/{id}   — single log detail
PUT  /api/food/logs/{id}   — edit a log (mark was_edited=True)
DELETE /api/food/logs/{id} — delete a log
GET  /api/dashboard/today  — daily summary for authenticated user
"""

from datetime import date as date_type
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, status
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy import select

from ..core.database import get_session
from ..models.user import User
from ..models.ai_food_log import AIFoodLog
from ..routers.auth import get_current_user
from ..services.ai_scan_service import (
    scan_and_log_food,
    get_food_logs,
    get_daily_summary,
)
from pydantic import BaseModel


class ManualFoodLog(BaseModel):
    food_name: str
    calories: float
    carbs_g: float
    protein_g: float
    fats_g: float
    fiber_g: Optional[float] = None
    serving_size: Optional[str] = None
    meal_type: str = "snack"


class WaterLog(BaseModel):
    ml: int  # millilitres to add

router = APIRouter(prefix="/api", tags=["ai-food"])

# ─── Scan ─────────────────────────────────────────────────────────────────────

@router.post("/food/scan")
async def scan_food(
    image: UploadFile = File(..., description="Food photo (JPEG/PNG, max 10MB)"),
    meal_type: str = Form("snack", description="breakfast | lunch | dinner | snack"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Upload a food photo → AI identifies nutrients → auto-logged for the user.
    Returns full nutrition breakdown + cache_hit flag.
    """
    # Validate meal_type
    valid_types = {"breakfast", "lunch", "dinner", "snack"}
    if meal_type not in valid_types:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"meal_type must be one of: {', '.join(valid_types)}",
        )

    # Read image
    if image.content_type not in ("image/jpeg", "image/jpg", "image/png", "image/webp"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only JPEG, PNG, and WebP images are supported",
        )

    image_bytes = await image.read()
    if len(image_bytes) > 10 * 1024 * 1024:  # 10 MB
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Image must be smaller than 10 MB",
        )

    try:
        result = await scan_and_log_food(
            user_id=current_user.id,
            image_bytes=image_bytes,
            meal_type=meal_type,
            session=session,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))

    return result


# ─── Manual Log ───────────────────────────────────────────────────────────────

@router.post("/food/manual", status_code=201)
async def manual_food_log(
    body: ManualFoodLog,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Log food manually (no photo required).
    Useful when the user knows the nutritional info and doesn't want to scan.
    """
    valid_types = {"breakfast", "lunch", "dinner", "snack"}
    if body.meal_type not in valid_types:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"meal_type must be one of: {', '.join(valid_types)}",
        )

    log = AIFoodLog(
        user_id=current_user.id,
        meal_type=body.meal_type,
        food_name=body.food_name,
        calories=body.calories,
        carbs_g=body.carbs_g,
        protein_g=body.protein_g,
        fats_g=body.fats_g,
        fiber_g=body.fiber_g,
        serving_size=body.serving_size,
        ai_provider="manual",
        ai_confidence=1.0,
        was_edited=False,
    )
    session.add(log)
    await session.commit()
    await session.refresh(log)

    return {
        "id": log.id,
        "food_name": log.food_name,
        "calories": log.calories,
        "carbs_g": log.carbs_g,
        "protein_g": log.protein_g,
        "fats_g": log.fats_g,
        "fiber_g": log.fiber_g,
        "meal_type": log.meal_type,
        "logged_at": log.logged_at.isoformat(),
        "was_edited": log.was_edited,
        "cache_hit": False,
    }


# ─── Water Tracking ───────────────────────────────────────────────────────────

@router.post("/food/water")
async def log_water(
    body: WaterLog,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Add water intake (ml) to today's daily summary."""
    from datetime import date as date_type
    from ..models.daily_nutrition_summary import DailyNutritionSummary

    today = date_type.today()
    result = await session.exec(
        select(DailyNutritionSummary).where(
            DailyNutritionSummary.user_id == current_user.id,
            DailyNutritionSummary.date == today,
        )
    )
    summary = result.first()

    if summary:
        summary.water_ml = (summary.water_ml or 0) + body.ml
    else:
        summary = DailyNutritionSummary(
            user_id=current_user.id,
            date=today,
            water_ml=float(body.ml),
        )
    session.add(summary)
    await session.commit()
    await session.refresh(summary)
    return {"water_ml": summary.water_ml}


# ─── Food Logs ────────────────────────────────────────────────────────────────

@router.get("/food/logs")
async def list_food_logs(
    date: Optional[str] = Query(None, description="Filter by date YYYY-MM-DD"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """List food logs for the current user."""
    return await get_food_logs(
        user_id=current_user.id,
        date=date,
        limit=limit,
        offset=offset,
        session=session,
    )


@router.get("/food/logs/{log_id}")
async def get_food_log(
    log_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get a single food log entry."""
    result = await session.execute(
        select(AIFoodLog).where(
            AIFoodLog.id == log_id,
            AIFoodLog.user_id == current_user.id,
        )
    )
    log = result.scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="Food log not found")

    return {
        "id": log.id,
        "food_name": log.food_name,
        "calories": log.calories,
        "carbs_g": log.carbs_g,
        "protein_g": log.protein_g,
        "fats_g": log.fats_g,
        "fiber_g": log.fiber_g,
        "sugar_g": log.sugar_g,
        "sodium_mg": log.sodium_mg,
        "serving_size": log.serving_size,
        "meal_type": log.meal_type,
        "logged_at": log.logged_at.isoformat(),
        "image_url": log.image_url,
        "ai_confidence": log.ai_confidence,
        "was_edited": log.was_edited,
    }


@router.put("/food/logs/{log_id}")
async def update_food_log(
    log_id: int,
    food_name: Optional[str] = None,
    calories: Optional[float] = None,
    carbs_g: Optional[float] = None,
    protein_g: Optional[float] = None,
    fats_g: Optional[float] = None,
    meal_type: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Edit a food log entry (marks was_edited=True)."""
    result = await session.execute(
        select(AIFoodLog).where(
            AIFoodLog.id == log_id,
            AIFoodLog.user_id == current_user.id,
        )
    )
    log = result.scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="Food log not found")

    if food_name is not None:
        log.food_name = food_name
    if calories is not None:
        log.calories = calories
    if carbs_g is not None:
        log.carbs_g = carbs_g
    if protein_g is not None:
        log.protein_g = protein_g
    if fats_g is not None:
        log.fats_g = fats_g
    if meal_type is not None:
        if meal_type not in {"breakfast", "lunch", "dinner", "snack"}:
            raise HTTPException(status_code=422, detail="Invalid meal_type")
        log.meal_type = meal_type

    log.was_edited = True
    session.add(log)
    await session.commit()

    return {"message": "Updated", "id": log.id}


@router.delete("/food/logs/{log_id}")
async def delete_food_log(
    log_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Delete a food log entry."""
    result = await session.execute(
        select(AIFoodLog).where(
            AIFoodLog.id == log_id,
            AIFoodLog.user_id == current_user.id,
        )
    )
    log = result.scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="Food log not found")

    await session.delete(log)
    await session.commit()
    return {"message": "Deleted"}


# ─── Dashboard ────────────────────────────────────────────────────────────────

@router.get("/dashboard/today")
async def dashboard_today(
    date: Optional[str] = Query(None, description="Date YYYY-MM-DD, defaults to today"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Daily nutrition summary: totals vs targets, streak, meals logged.
    Used by the HomeScreen dashboard.
    """
    target_date = date or date_type.today().isoformat()

    # Basic date format validation
    try:
        date_type.fromisoformat(target_date)
    except ValueError:
        raise HTTPException(status_code=422, detail="date must be YYYY-MM-DD")

    return await get_daily_summary(
        user_id=current_user.id,
        date=target_date,
        session=session,
    )
