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

import logging
from datetime import date as date_type, datetime, time
from enum import Enum
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form, Query, status
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import col
from sqlalchemy import select, text, func

logger = logging.getLogger(__name__)

from ..core.database import get_session
from ..core.pagination import PaginatedResponse, build_paginated_response, paginate_params
from ..models.user import User
from ..models.ai_food_log import AIFoodLog
from ..routers.auth import get_current_user
from ..services.ai_scan_service import (
    scan_and_log_food,
    get_food_logs,
    get_daily_summary,
)
from ..core.cache import (
    cache_get, cache_set, cache_delete,
    daily_summary_key, invalidate_daily_summary,
    CACHE_TTL,
)
from ..services.nutrition_risk_service import invalidate_risk_cache
from ..services.celebration_engine import process_post_meal_events
from ..services.mission_engine import update_mission_progress
from pydantic import BaseModel, Field
from ..schemas.api_responses import (
    FoodLogItemResponse,
    FoodScanResponse,
    WaterLogResponse,
    FrequentFoodItem,
    FoodSearchResult,
    FoodLogUpdateResponse,
    FoodLogDeleteResponse,
)


class FoodLogSortBy(str, Enum):
    date = "date"
    calories = "calories"


class FoodLogSortOrder(str, Enum):
    asc = "asc"
    desc = "desc"

try:
    from slowapi import Limiter
    from slowapi.util import get_remote_address
    # TODO:SECURITY [Low] Rate limiting is currently IP-based (get_remote_address).
    # For production, upgrade to per-user limiting by replacing the key_func:
    #   key_func=lambda req: str(req.state.user_id)  # set in a middleware after auth
    # This prevents a single user from bypassing limits via different IPs (VPN, mobile).
    # Also ensure X-Forwarded-For is trusted only from known load balancer IPs.
    _limiter = Limiter(key_func=get_remote_address)
    _rate_limit_enabled = True
except ImportError:
    _rate_limit_enabled = False


# SEC: Strict enum for meal types prevents arbitrary string injection
class MealTypeEnum(str, Enum):
    breakfast = "breakfast"
    lunch = "lunch"
    dinner = "dinner"
    snack = "snack"


# SEC: Numeric bounds prevent absurd values from reaching the database
# Calories: 0-10000 kcal (a single food item cannot exceed 10000 kcal)
# Macros: 0-2000g (physiologically impossible to consume >2000g of a single macro in one meal)
class ManualFoodLog(BaseModel):
    food_name: str = Field(..., min_length=1, max_length=500, description="Name of the food item")
    calories: float = Field(..., ge=0, le=10000, description="Calories (kcal), 0-10000")
    carbs_g: float = Field(..., ge=0, le=2000, description="Carbohydrates (g), 0-2000")
    protein_g: float = Field(..., ge=0, le=2000, description="Protein (g), 0-2000")
    fats_g: float = Field(..., ge=0, le=2000, description="Fat (g), 0-2000")
    fiber_g: Optional[float] = Field(None, ge=0, le=500, description="Fiber (g), 0-500")
    serving_size: Optional[str] = Field(None, max_length=200, description="Serving size description")
    meal_type: MealTypeEnum = Field(MealTypeEnum.snack, description="Meal type: breakfast, lunch, dinner, snack")


class UpdateFoodLog(BaseModel):
    food_name: Optional[str] = Field(None, min_length=1, max_length=500, description="Name of the food item")
    calories: Optional[float] = Field(None, ge=0, le=10000, description="Calories (kcal), 0-10000")
    carbs_g: Optional[float] = Field(None, ge=0, le=2000, description="Carbohydrates (g), 0-2000")
    protein_g: Optional[float] = Field(None, ge=0, le=2000, description="Protein (g), 0-2000")
    fats_g: Optional[float] = Field(None, ge=0, le=2000, description="Fat (g), 0-2000")
    meal_type: Optional[MealTypeEnum] = Field(None, description="Meal type: breakfast, lunch, dinner, snack")


class WaterLog(BaseModel):
    ml: int = Field(..., ge=0, le=20000, description="Water intake in ml, 0-20000 (max 20L)")  # SEC: Cap at 20L to prevent absurd values

# ─── Free-tier scan quota (server-side enforcement) ──────────────────────────
# This MUST match the client-side constant in ScanScreen.tsx (FREE_SCAN_LIMIT).
# The client-side check is UX-only; this is the authoritative gate.
FREE_SCAN_LIMIT_PER_DAY = 3

router = APIRouter(prefix="/api", tags=["ai-food"])

# ─── Scan ─────────────────────────────────────────────────────────────────────

@router.post(
    "/food/scan",
    response_model=FoodScanResponse,
    summary="Scan food photo with AI",
    description=(
        "Upload a food photo (JPEG, PNG, WebP, HEIC; max 10 MB). "
        "AI identifies the food and logs the nutritional breakdown automatically. "
        "Free users are limited to 3 scans per day; premium users have unlimited scans. "
        "Rate limited to 10 requests per minute per IP."
    ),
    responses={
        200: {"description": "Food identified and logged successfully"},
        413: {"description": "Image exceeds 10 MB size limit"},
        415: {"description": "Unsupported image format"},
        422: {"description": "Invalid meal_type or image validation error"},
        429: {"description": "Daily scan limit reached (free tier) or rate limit exceeded"},
        502: {"description": "AI service temporarily unavailable"},
    },
)
@(_limiter.limit("10/minute") if _rate_limit_enabled else lambda f: f)
async def scan_food(
    request: Request,
    image: UploadFile = File(..., description="Food photo (JPEG/PNG, max 10MB)"),
    meal_type: MealTypeEnum = Form(MealTypeEnum.snack, description="breakfast | lunch | dinner | snack"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    # meal_type is validated by MealTypeEnum at the Pydantic/FastAPI layer

    # Validate content type (MIME check; also catches missing Content-Type)
    _ACCEPTED_TYPES = {
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "image/heic",
        "image/heif",
    }
    if image.content_type not in _ACCEPTED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unsupported image type. Accepted formats: JPEG, PNG, WebP, HEIC",
        )

    # Read image bytes then enforce size limits
    image_bytes = await image.read()
    if len(image_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Empty image file. Please upload a photo of your food.",
        )
    if len(image_bytes) < 1024:  # 1 KB minimum
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Image file too small. Please upload a clear photo of your food.",
        )
    if len(image_bytes) > 10 * 1024 * 1024:  # 10 MB
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Image file too large. Maximum allowed size is 10 MB.",
        )

    # ── Server-side free-tier scan quota ────────────────────────────────────
    # Premium users have unlimited scans.  Free users are capped per day.
    if not current_user.is_premium:
        from datetime import timezone as _tz
        today_start = datetime.combine(date_type.today(), time.min, tzinfo=_tz.utc)
        today_end = datetime.combine(date_type.today(), time.max, tzinfo=_tz.utc)
        scan_count_result = await session.execute(
            select(func.count(AIFoodLog.id)).where(
                AIFoodLog.user_id == current_user.id,
                AIFoodLog.logged_at >= today_start,
                AIFoodLog.logged_at <= today_end,
                AIFoodLog.ai_provider != "manual",
                AIFoodLog.deleted_at.is_(None),
            )
        )
        today_scan_count = scan_count_result.scalar() or 0
        if today_scan_count >= FREE_SCAN_LIMIT_PER_DAY:
            logger.warning(
                "Scan quota exceeded: user_id=%s scans_today=%d limit=%d",
                current_user.id, today_scan_count, FREE_SCAN_LIMIT_PER_DAY,
            )
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    f"Daily scan limit reached ({FREE_SCAN_LIMIT_PER_DAY} scans). "
                    "Upgrade to Premium for unlimited scans."
                ),
            )

    logger.info(
        "Food scan requested: user_id=%s meal_type=%s size_bytes=%d content_type=%s",
        current_user.id,
        meal_type,
        len(image_bytes),
        image.content_type,
    )

    try:
        result = await scan_and_log_food(
            user_id=current_user.id,
            image_bytes=image_bytes,
            meal_type=meal_type.value,
            session=session,
        )
    except ValueError as e:
        error_msg = str(e)[:200] if str(e) else ""
        # Distinguish image validation errors (user's fault) from AI service errors
        if any(keyword in error_msg.lower() for keyword in ["image too small", "image too large", "minimum dimensions"]):
            logger.warning("Image validation failed: user_id=%s error=%s", current_user.id, error_msg)
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=error_msg,
            )
        logger.error("Food scan failed: user_id=%s error=%s", current_user.id, error_msg)
        # SEC: The ai_scan_service already produces user-safe error messages in ValueError.
        # We pass them through but cap length to avoid any accidental data leakage.
        safe_msg = error_msg or "AI scan failed. Please try again."
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=safe_msg)
    except Exception as e:
        logger.error("Food scan unexpected error: user_id=%s type=%s error=%s", current_user.id, type(e).__name__, e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI scanning is temporarily unavailable. Please try again in a few seconds.",
        )

    try:
        await invalidate_daily_summary(current_user.id, date_type.today().isoformat())
    except Exception:
        pass

    invalidate_risk_cache(current_user.id)

    # Process post-meal celebrations and mission progress
    celebrations = []
    try:
        celebrations = await process_post_meal_events(current_user.id, session)
        completed_missions = await update_mission_progress(current_user.id, session)
        for mission in completed_missions:
            celebrations.append({
                "trigger": "mission_completed",
                "message": f"Mision completada: {mission['name']}! +{mission['xp_reward']} XP",
                "emoji": "\u2705",
                "intensity": "subtle",
                "data": mission,
            })
        await session.commit()
    except Exception as exc:
        logger.debug("Celebration processing failed (non-blocking): %s", exc)

    if isinstance(result, dict):
        result["celebrations"] = celebrations
    return result


# ─── Manual Log ───────────────────────────────────────────────────────────────

@router.post(
    "/food/manual",
    response_model=FoodScanResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Log food manually",
    description=(
        "Log a food entry manually without a photo. "
        "The user provides food name, calories, and macronutrient values. "
        "Useful when the user already knows the nutritional information."
    ),
    responses={
        201: {"description": "Food logged successfully"},
        422: {"description": "Invalid input or meal_type"},
    },
)
async def manual_food_log(
    body: ManualFoodLog,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    # meal_type is validated by MealTypeEnum at the Pydantic layer

    log = AIFoodLog(
        user_id=current_user.id,
        meal_type=body.meal_type.value,
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
    try:
        await session.commit()
        await session.refresh(log)
    except Exception:
        await session.rollback()
        logger.exception("Manual food log commit failed: user_id=%s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save food log. Please try again.",
        )

    try:
        await invalidate_daily_summary(current_user.id, date_type.today().isoformat())
    except Exception:
        pass

    invalidate_risk_cache(current_user.id)

    # Process post-meal celebrations and mission progress
    celebrations = []
    try:
        celebrations = await process_post_meal_events(current_user.id, session)
        completed_missions = await update_mission_progress(current_user.id, session)
        for mission in completed_missions:
            celebrations.append({
                "trigger": "mission_completed",
                "message": f"Mision completada: {mission['name']}! +{mission['xp_reward']} XP",
                "emoji": "\u2705",
                "intensity": "subtle",
                "data": mission,
            })
        await session.commit()
    except Exception as exc:
        logger.debug("Celebration processing failed (non-blocking): %s", exc)

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
        "celebrations": celebrations,
    }


# ─── Water Tracking ───────────────────────────────────────────────────────────

@router.post(
    "/food/water",
    response_model=WaterLogResponse,
    summary="Log water intake",
    description=(
        "Add water intake (in ml) to today's daily nutrition summary. "
        "The amount is additive: each call adds to the running total. "
        "Maximum single entry is 20,000 ml."
    ),
    responses={
        200: {"description": "Water intake updated, current total returned"},
        422: {"description": "Invalid ml value"},
        500: {"description": "Failed to update water intake"},
    },
)
async def log_water(
    body: WaterLog,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    from datetime import date as date_type
    from sqlmodel import select as sm_select
    from ..models.daily_nutrition_summary import DailyNutritionSummary

    today = date_type.today()

    # Fetch existing summary for today
    result = await session.execute(
        sm_select(DailyNutritionSummary).where(
            DailyNutritionSummary.user_id == current_user.id,
            DailyNutritionSummary.date == today,
        )
    )
    summary = result.scalars().first()

    if summary:
        summary.water_ml = (summary.water_ml or 0) + body.ml
    else:
        # Auto-create DailyNutritionSummary if it doesn't exist
        summary = DailyNutritionSummary(
            user_id=current_user.id,
            date=today,
            water_ml=float(body.ml),
        )

    session.add(summary)
    try:
        await session.commit()
        await session.refresh(summary)
    except Exception:
        # Handle race condition: another request may have created the row
        await session.rollback()
        result = await session.execute(
            sm_select(DailyNutritionSummary).where(
                DailyNutritionSummary.user_id == current_user.id,
                DailyNutritionSummary.date == today,
            )
        )
        summary = result.scalars().first()
        if summary:
            summary.water_ml = (summary.water_ml or 0) + body.ml
            session.add(summary)
            await session.commit()
            await session.refresh(summary)
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update water intake",
            )

    try:
        await invalidate_daily_summary(current_user.id, today.isoformat())
    except Exception:
        pass

    return {"water_ml": summary.water_ml}


# ─── Food Logs ────────────────────────────────────────────────────────────────

@router.get(
    "/food/logs",
    response_model=PaginatedResponse[FoodLogItemResponse],
    summary="List food logs",
    description=(
        "List the authenticated user's food logs with pagination, date range filters, "
        "meal type filter, and sorting. Supports both page-based (page/page_size) "
        "and legacy offset/limit pagination."
    ),
    responses={
        200: {"description": "Paginated list of food logs"},
        422: {"description": "Invalid date format or filter value"},
    },
)
async def list_food_logs(
    date: Optional[str] = Query(None, description="Filter by single date YYYY-MM-DD (legacy)"),
    date_from: Optional[str] = Query(None, description="Filter: start date YYYY-MM-DD (inclusive)"),
    date_to: Optional[str] = Query(None, description="Filter: end date YYYY-MM-DD (inclusive)"),
    meal_type: Optional[str] = Query(None, description="Filter: breakfast, lunch, dinner, snack"),
    sort_by: FoodLogSortBy = Query(FoodLogSortBy.date, description="Sort field: date or calories"),
    order: FoodLogSortOrder = Query(FoodLogSortOrder.desc, description="Sort order: asc or desc"),
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(50, ge=1, le=200, description="Items per page"),
    limit: int = Query(0, ge=0, description="Legacy: max results (use page_size instead)"),
    offset: int = Query(0, ge=0, description="Legacy: items to skip (use page instead)"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    List food logs with pagination, date range filters, meal type filter, and sorting.

    Supports both legacy offset/limit and new page/page_size pagination.
    When page > 1 is provided, page-based pagination takes precedence.

    Examples:
    - `GET /api/food/logs?page=1&page_size=20` -- latest 20 logs
    - `GET /api/food/logs?date_from=2026-03-01&date_to=2026-03-15&meal_type=breakfast`
    - `GET /api/food/logs?sort_by=calories&order=desc`
    """
    # Build base query -- exclude soft-deleted records
    query = select(AIFoodLog).where(AIFoodLog.user_id == current_user.id, AIFoodLog.deleted_at.is_(None))
    count_query = select(func.count()).select_from(AIFoodLog).where(AIFoodLog.user_id == current_user.id, AIFoodLog.deleted_at.is_(None))

    # Apply date filter (legacy single-date or new range)
    if date is not None and date_from is None and date_to is None:
        try:
            parsed = date_type.fromisoformat(date)
        except ValueError:
            raise HTTPException(status_code=422, detail="date must be YYYY-MM-DD")
        day_start = datetime.combine(parsed, time.min)
        day_end = datetime.combine(parsed, time.max)
        query = query.where(AIFoodLog.logged_at >= day_start, AIFoodLog.logged_at <= day_end)
        count_query = count_query.where(AIFoodLog.logged_at >= day_start, AIFoodLog.logged_at <= day_end)
    else:
        if date_from is not None:
            try:
                parsed_from = date_type.fromisoformat(date_from)
            except ValueError:
                raise HTTPException(status_code=422, detail="date_from must be YYYY-MM-DD")
            query = query.where(AIFoodLog.logged_at >= datetime.combine(parsed_from, time.min))
            count_query = count_query.where(AIFoodLog.logged_at >= datetime.combine(parsed_from, time.min))
        if date_to is not None:
            try:
                parsed_to = date_type.fromisoformat(date_to)
            except ValueError:
                raise HTTPException(status_code=422, detail="date_to must be YYYY-MM-DD")
            query = query.where(AIFoodLog.logged_at <= datetime.combine(parsed_to, time.max))
            count_query = count_query.where(AIFoodLog.logged_at <= datetime.combine(parsed_to, time.max))

    # Apply meal_type filter
    if meal_type is not None:
        valid_types = {"breakfast", "lunch", "dinner", "snack"}
        if meal_type not in valid_types:
            raise HTTPException(status_code=422, detail=f"meal_type must be one of: {', '.join(valid_types)}")
        query = query.where(AIFoodLog.meal_type == meal_type)
        count_query = count_query.where(AIFoodLog.meal_type == meal_type)

    # Apply sorting
    sort_col_map = {
        FoodLogSortBy.date: AIFoodLog.logged_at,
        FoodLogSortBy.calories: AIFoodLog.calories,
    }
    sort_col = sort_col_map[sort_by]
    if order == FoodLogSortOrder.desc:
        query = query.order_by(col(sort_col).desc())  # type: ignore
    else:
        query = query.order_by(col(sort_col).asc())  # type: ignore

    # Get total count
    try:
        total_result = await session.execute(count_query)
        total = total_result.scalar() or 0
    except Exception:
        logger.exception("Food logs count query failed: user_id=%s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load food logs. Please try again.",
        )

    # Determine pagination mode: prefer page-based when page > 1 or legacy params are default
    use_page_based = (page > 1) or (offset == 0 and limit == 0)

    if use_page_based:
        pg_offset, pg_limit = paginate_params(page, page_size)
        query = query.offset(pg_offset).limit(pg_limit)
    else:
        effective_limit = limit if limit > 0 else 50
        query = query.offset(offset).limit(effective_limit)

    try:
        result = await session.execute(query)
        logs = result.scalars().all()
    except Exception:
        logger.exception("Food logs query failed: user_id=%s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load food logs. Please try again.",
        )

    items = [
        {
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
        for log in logs
    ]

    if use_page_based:
        return build_paginated_response(items=items, total=total, page=page, page_size=page_size)

    # Legacy offset/limit response format
    return items


@router.get(
    "/food/logs/{log_id}",
    response_model=FoodLogItemResponse,
    summary="Get food log detail",
    description="Retrieve a single food log entry by its ID. Only returns logs owned by the authenticated user.",
    responses={
        200: {"description": "Food log entry"},
        404: {"description": "Food log not found or belongs to another user"},
    },
)
async def get_food_log(
    log_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(AIFoodLog).where(
            AIFoodLog.id == log_id,
            AIFoodLog.user_id == current_user.id,
            AIFoodLog.deleted_at.is_(None),
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


@router.put(
    "/food/logs/{log_id}",
    response_model=FoodLogUpdateResponse,
    summary="Edit a food log entry",
    description=(
        "Update one or more fields of an existing food log. "
        "Automatically sets was_edited=True. Invalidates the cached daily summary."
    ),
    responses={
        200: {"description": "Log updated successfully"},
        404: {"description": "Food log not found"},
        422: {"description": "Invalid meal_type or field value"},
    },
)
async def update_food_log(
    log_id: int,
    body: UpdateFoodLog,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(AIFoodLog).where(
            AIFoodLog.id == log_id,
            AIFoodLog.user_id == current_user.id,
            AIFoodLog.deleted_at.is_(None),
        )
    )
    log = result.scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="Food log not found")

    if body.food_name is not None:
        log.food_name = body.food_name
    if body.calories is not None:
        log.calories = body.calories
    if body.carbs_g is not None:
        log.carbs_g = body.carbs_g
    if body.protein_g is not None:
        log.protein_g = body.protein_g
    if body.fats_g is not None:
        log.fats_g = body.fats_g
    if body.meal_type is not None:
        # meal_type is validated by MealTypeEnum at the Pydantic layer
        log.meal_type = body.meal_type.value

    log.was_edited = True
    session.add(log)
    try:
        await session.commit()
    except Exception:
        await session.rollback()
        logger.exception("Food log update commit failed: log_id=%s user_id=%s", log_id, current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update food log. Please try again.",
        )

    try:
        await invalidate_daily_summary(current_user.id, log.logged_at.date().isoformat())
    except Exception:
        pass

    invalidate_risk_cache(current_user.id)

    return {"message": "Updated", "id": log.id}


@router.delete(
    "/food/logs/{log_id}",
    response_model=FoodLogDeleteResponse,
    summary="Delete a food log entry",
    description=(
        "Soft-delete a food log entry. The record is retained for 30 days "
        "and can be recovered via the recovery endpoints."
    ),
    responses={
        200: {"description": "Log soft-deleted, recoverable for 30 days"},
        404: {"description": "Food log not found"},
    },
)
async def delete_food_log(
    log_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    from ..services.data_protection_service import soft_delete

    record = await soft_delete(
        session,
        AIFoodLog,
        record_id=log_id,
        user_id=current_user.id,
    )

    if record is None:
        raise HTTPException(status_code=404, detail="Food log not found")

    log_date = record.logged_at.date().isoformat()
    await session.commit()

    try:
        await cache_delete(daily_summary_key(current_user.id, log_date))
    except Exception:
        pass

    invalidate_risk_cache(current_user.id)

    return {"message": "Deleted", "recoverable": True}


# ─── Frequent Foods (Quick Log) ──────────────────────────────────────────────

@router.get(
    "/food/frequent",
    response_model=List[FrequentFoodItem],
    summary="Get frequently logged foods",
    description=(
        "Return the user's most frequently logged foods, ordered by log count descending. "
        "Used by the Quick Log feature for rapid re-logging of common meals."
    ),
    responses={
        200: {"description": "List of frequent foods with log counts"},
    },
)
async def get_frequent_foods(
    limit: int = Query(10, ge=1, le=50, description="Number of frequent foods to return"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    try:
        result = await session.execute(
            text(
                "SELECT food_name, calories, protein_g, carbs_g, fats_g, "
                "fiber_g, sugar_g, sodium_mg, serving_size, meal_type, "
                "COUNT(*) as log_count, MAX(logged_at) as last_logged "
                "FROM ai_food_log "
                "WHERE user_id = :uid AND deleted_at IS NULL "
                "GROUP BY food_name, calories, protein_g, carbs_g, fats_g, "
                "fiber_g, sugar_g, sodium_mg, serving_size, meal_type "
                "ORDER BY log_count DESC, last_logged DESC "
                "LIMIT :limit"
            ),
            {"uid": current_user.id, "limit": limit},
        )
        rows = result.mappings().all()
    except Exception:
        logger.exception("Frequent foods query failed: user_id=%s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load frequent foods. Please try again.",
        )
    return [
        {
            "food_name": row["food_name"],
            "calories": row["calories"],
            "protein_g": row["protein_g"],
            "carbs_g": row["carbs_g"],
            "fats_g": row["fats_g"],
            "fiber_g": row["fiber_g"],
            "sugar_g": row["sugar_g"],
            "sodium_mg": row["sodium_mg"],
            "serving_size": row["serving_size"],
            "meal_type": row["meal_type"],
            "log_count": row["log_count"],
            "last_logged": row["last_logged"].isoformat() if row["last_logged"] else None,
        }
        for row in rows
    ]


# ─── Quick Log (re-log a previous food) ─────────────────────────────────────

class QuickLogRequest(BaseModel):
    """Re-log a food by copying data from a previous food log."""
    food_log_id: Optional[int] = Field(None, gt=0, description="ID of an existing food log to copy")
    food_name: Optional[str] = Field(None, min_length=1, max_length=500, description="Food name (if not using food_log_id)")
    calories: Optional[float] = Field(None, ge=0, le=10000, description="Calories (kcal), 0-10000")
    protein_g: Optional[float] = Field(None, ge=0, le=2000, description="Protein (g), 0-2000")
    carbs_g: Optional[float] = Field(None, ge=0, le=2000, description="Carbohydrates (g), 0-2000")
    fats_g: Optional[float] = Field(None, ge=0, le=2000, description="Fat (g), 0-2000")
    fiber_g: Optional[float] = Field(None, ge=0, le=500, description="Fiber (g), 0-500")
    sugar_g: Optional[float] = Field(None, ge=0, le=2000, description="Sugar (g), 0-2000")
    sodium_mg: Optional[float] = Field(None, ge=0, le=50000, description="Sodium (mg), 0-50000")
    serving_size: Optional[str] = Field(None, max_length=200, description="Serving size description")
    meal_type: MealTypeEnum = Field(MealTypeEnum.snack, description="Meal type: breakfast, lunch, dinner, snack")


@router.post(
    "/food/quick-log",
    response_model=FoodScanResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Quick-log a food",
    description=(
        "Re-log a food to today in a single request. Two modes: "
        "(1) By food_log_id -- copy all macros from an existing food log; "
        "(2) By food data -- provide food_name + macros directly."
    ),
    responses={
        201: {"description": "Food re-logged successfully"},
        404: {"description": "Source food log not found (mode 1)"},
        422: {"description": "Invalid input"},
    },
)
async def quick_log_food(
    body: QuickLogRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Re-log a food to today in a single request.

    Two modes:
    1. **By food_log_id**: Copy all macros from an existing food log (the user's own).
    2. **By food data**: Provide food_name + macros directly (used by the frequent foods list).

    Creates a new AIFoodLog entry for today with the same nutritional data.
    """
    # meal_type is validated by MealTypeEnum at the Pydantic layer

    if body.food_log_id is not None:
        # Mode 1: Copy from existing food log (exclude soft-deleted)
        result = await session.execute(
            select(AIFoodLog).where(
                AIFoodLog.id == body.food_log_id,
                AIFoodLog.user_id == current_user.id,
                AIFoodLog.deleted_at.is_(None),
            )
        )
        source_log = result.scalar_one_or_none()
        if not source_log:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Food log not found",
            )

        new_log = AIFoodLog(
            user_id=current_user.id,
            meal_type=body.meal_type.value,
            food_name=source_log.food_name,
            calories=source_log.calories,
            carbs_g=source_log.carbs_g,
            protein_g=source_log.protein_g,
            fats_g=source_log.fats_g,
            fiber_g=source_log.fiber_g,
            sugar_g=source_log.sugar_g,
            sodium_mg=source_log.sodium_mg,
            serving_size=source_log.serving_size,
            ai_provider="quick_log",
            ai_confidence=1.0,
            was_edited=False,
        )
    elif body.food_name is not None and body.calories is not None:
        # Mode 2: Direct food data (from frequent foods list)
        new_log = AIFoodLog(
            user_id=current_user.id,
            meal_type=body.meal_type.value,
            food_name=body.food_name,
            calories=body.calories,
            carbs_g=body.carbs_g or 0.0,
            protein_g=body.protein_g or 0.0,
            fats_g=body.fats_g or 0.0,
            fiber_g=body.fiber_g,
            sugar_g=body.sugar_g,
            sodium_mg=body.sodium_mg,
            serving_size=body.serving_size,
            ai_provider="quick_log",
            ai_confidence=1.0,
            was_edited=False,
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide either food_log_id or food_name + calories",
        )

    session.add(new_log)
    try:
        await session.commit()
        await session.refresh(new_log)
    except Exception:
        await session.rollback()
        logger.exception("Quick log commit failed: user_id=%s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save food log. Please try again.",
        )

    try:
        await invalidate_daily_summary(current_user.id, date_type.today().isoformat())
    except Exception:
        pass

    invalidate_risk_cache(current_user.id)

    # Process post-meal celebrations and mission progress
    celebrations = []
    try:
        celebrations = await process_post_meal_events(current_user.id, session)
        completed_missions = await update_mission_progress(current_user.id, session)
        for mission in completed_missions:
            celebrations.append({
                "trigger": "mission_completed",
                "message": f"Mision completada: {mission['name']}! +{mission['xp_reward']} XP",
                "emoji": "\u2705",
                "intensity": "subtle",
                "data": mission,
            })
        await session.commit()
    except Exception as exc:
        logger.debug("Celebration processing failed (non-blocking): %s", exc)

    return {
        "id": new_log.id,
        "food_name": new_log.food_name,
        "calories": new_log.calories,
        "carbs_g": new_log.carbs_g,
        "protein_g": new_log.protein_g,
        "fats_g": new_log.fats_g,
        "fiber_g": new_log.fiber_g,
        "sugar_g": new_log.sugar_g,
        "sodium_mg": new_log.sodium_mg,
        "serving_size": new_log.serving_size,
        "meal_type": new_log.meal_type,
        "logged_at": new_log.logged_at.isoformat(),
        "was_edited": new_log.was_edited,
        "cache_hit": False,
        "celebrations": celebrations,
    }


# ─── Food Search ──────────────────────────────────────────────────────────────

@router.get(
    "/food/search",
    response_model=List[FoodSearchResult],
    summary="Search food history",
    description=(
        "Search the user's previous food logs by name (autocomplete). "
        "Returns distinct foods ordered by frequency. Query must be 2+ characters."
    ),
    responses={
        200: {"description": "Matching foods with log counts"},
    },
)
async def search_food_history(
    q: str = Query(..., min_length=2, max_length=200, description="Search query (2-200 chars)"),
    limit: int = Query(10, ge=1, le=20, description="Number of results (1-20)"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Search user's previous food logs by name (autocomplete).
    Returns distinct foods ordered by frequency (most logged first).
    Requires q >= 2 characters.
    """
    if len(q.strip()) < 2:
        return []

    # SEC: Escape SQL LIKE wildcards in user input to prevent wildcard injection
    escaped_q = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")

    try:
        result = await session.execute(
            text(
                "SELECT food_name, calories, protein_g, carbs_g, fats_g, COUNT(*) as count "
                "FROM ai_food_log "
                "WHERE user_id = :uid AND LOWER(food_name) LIKE LOWER(:q) AND deleted_at IS NULL "
                "GROUP BY food_name, calories, protein_g, carbs_g, fats_g "
                "ORDER BY count DESC "
                "LIMIT :limit"
            ),
            {"uid": current_user.id, "q": f"%{escaped_q}%", "limit": limit},
        )
        rows = result.mappings().all()
    except Exception:
        logger.exception("Food search query failed: user_id=%s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Search failed. Please try again.",
        )
    return [
        {
            "food_name": row["food_name"],
            "calories": row["calories"],
            "protein_g": row["protein_g"],
            "carbs_g": row["carbs_g"],
            "fats_g": row["fats_g"],
            "count": row["count"],
        }
        for row in rows
    ]


# ─── Dashboard ────────────────────────────────────────────────────────────────

@router.get(
    "/dashboard/today",
    summary="Get daily nutrition dashboard",
    description=(
        "Daily nutrition summary used by the HomeScreen dashboard. "
        "Returns macro totals vs targets, streak information, and meals logged. "
        "Defaults to today if no date parameter is provided."
    ),
    responses={
        200: {"description": "Daily nutrition summary with totals and targets"},
        422: {"description": "Invalid date format"},
    },
)
async def dashboard_today(
    date: Optional[str] = Query(None, description="Date YYYY-MM-DD, defaults to today"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    target_date = date or date_type.today().isoformat()

    # Basic date format validation
    try:
        date_type.fromisoformat(target_date)
    except ValueError:
        raise HTTPException(status_code=422, detail="date must be YYYY-MM-DD")

    cache_key = daily_summary_key(current_user.id, target_date)

    try:
        cached = await cache_get(cache_key)
        if cached is not None:
            return cached
    except Exception:
        pass  # cache failure -- fall through to DB

    try:
        result = await get_daily_summary(
            user_id=current_user.id,
            date=target_date,
            session=session,
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Dashboard summary failed: user_id=%s date=%s", current_user.id, target_date)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load daily summary. Please try again.",
        )

    try:
        await cache_set(cache_key, result, CACHE_TTL["daily_summary"])
    except Exception:
        pass  # cache failure -- return result anyway

    return result


# ─── Orphan Scan Recovery ─────────────────────────────────────────────────────

@router.get(
    "/orphan-scans",
    summary="List orphan scans (pending re-analysis)",
    description=(
        "Returns food log entries that have an image_url but failed AI analysis "
        "(food_name='Analyzing...' or ai_provider='pending'). These can be "
        "recovered by calling POST /api/food/recover-scan/{id}."
    ),
)
async def list_orphan_scans(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(AIFoodLog).where(
            AIFoodLog.user_id == current_user.id,
            AIFoodLog.ai_provider == "pending",
            AIFoodLog.image_url.isnot(None),
        ).order_by(AIFoodLog.logged_at.desc())
    )
    orphans = result.scalars().all()
    return [
        {
            "id": o.id,
            "image_url": o.image_url,
            "image_hash": o.image_hash,
            "meal_type": o.meal_type,
            "logged_at": o.logged_at.isoformat() if o.logged_at else None,
        }
        for o in orphans
    ]


@router.post(
    "/recover-scan/{log_id}",
    summary="Re-analyze an orphan scan",
    description=(
        "Downloads the image from storage and re-runs AI analysis to fill in "
        "the missing nutrition data. Only works on scans with ai_provider='pending'."
    ),
)
async def recover_scan(
    log_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    import httpx

    result = await session.execute(
        select(AIFoodLog).where(
            AIFoodLog.id == log_id,
            AIFoodLog.user_id == current_user.id,
        )
    )
    log = result.scalars().first()
    if not log:
        raise HTTPException(status_code=404, detail="Food log not found")

    if log.ai_provider != "pending":
        return {"message": "Scan already analyzed", "food_name": log.food_name}

    if not log.image_url:
        raise HTTPException(status_code=422, detail="No image URL — cannot re-analyze")

    # Download image from storage
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(log.image_url, timeout=15)
            resp.raise_for_status()
            image_bytes = resp.content
    except Exception as e:
        logger.error("Failed to download image for recovery log_id=%s: %s", log_id, e)
        raise HTTPException(status_code=502, detail="Could not download image from storage")

    # Re-run AI analysis
    from ..services.ai_scan_service import _call_ai_vision, _sanitize_string, _sanitize_numeric

    try:
        ai_result = await _call_ai_vision(image_bytes)
    except Exception as e:
        logger.error("AI re-analysis failed for log_id=%s: %s", log_id, e)
        raise HTTPException(status_code=502, detail="AI analysis failed. Try again later.")

    # Update the log with real data
    log.food_name = _sanitize_string(ai_result.get("food_name", "Unknown"), 200)
    log.calories = _sanitize_numeric(ai_result.get("calories"), "calories")
    log.carbs_g = _sanitize_numeric(ai_result.get("carbs_g"), "carbs_g")
    log.protein_g = _sanitize_numeric(ai_result.get("protein_g"), "protein_g")
    log.fats_g = _sanitize_numeric(ai_result.get("fats_g"), "fats_g")
    log.fiber_g = _sanitize_numeric(ai_result.get("fiber_g"), "fiber_g") if ai_result.get("fiber_g") is not None else None
    log.sugar_g = _sanitize_numeric(ai_result.get("sugar_g"), "sugar_g") if ai_result.get("sugar_g") is not None else None
    log.sodium_mg = _sanitize_numeric(ai_result.get("sodium_mg"), "sodium_mg") if ai_result.get("sodium_mg") is not None else None
    log.serving_size = _sanitize_string(ai_result.get("serving_size", ""), 200)
    log.ai_provider = ai_result.get("ai_provider", "recovered")
    log.ai_confidence = float(ai_result.get("confidence", 0.8))

    session.add(log)
    await session.commit()
    await session.refresh(log)

    logger.info("Recovered scan log_id=%s food_name=%s calories=%s", log.id, log.food_name, log.calories)

    return {
        "id": log.id,
        "food_name": log.food_name,
        "calories": log.calories,
        "protein_g": log.protein_g,
        "carbs_g": log.carbs_g,
        "fats_g": log.fats_g,
        "meal_type": log.meal_type,
        "image_url": log.image_url,
        "recovered": True,
    }
