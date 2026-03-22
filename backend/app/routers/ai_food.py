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
from typing import Optional

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
from ..core.cache import cache_get, cache_set, cache_delete, daily_summary_key, CACHE_TTL
from pydantic import BaseModel, Field


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


# SEC: Numeric bounds prevent absurd values from reaching the database
class ManualFoodLog(BaseModel):
    food_name: str = Field(..., min_length=1, max_length=500)
    calories: float = Field(..., ge=0, le=99999)
    carbs_g: float = Field(..., ge=0, le=99999)
    protein_g: float = Field(..., ge=0, le=99999)
    fats_g: float = Field(..., ge=0, le=99999)
    fiber_g: Optional[float] = Field(None, ge=0, le=99999)
    serving_size: Optional[str] = Field(None, max_length=200)
    meal_type: str = "snack"


class UpdateFoodLog(BaseModel):
    food_name: Optional[str] = Field(None, min_length=1, max_length=500)
    calories: Optional[float] = Field(None, ge=0, le=99999)
    carbs_g: Optional[float] = Field(None, ge=0, le=99999)
    protein_g: Optional[float] = Field(None, ge=0, le=99999)
    fats_g: Optional[float] = Field(None, ge=0, le=99999)
    meal_type: Optional[str] = None


class WaterLog(BaseModel):
    ml: int = Field(..., ge=0, le=20000)  # SEC: Cap at 20L to prevent absurd values

# ─── Free-tier scan quota (server-side enforcement) ──────────────────────────
# This MUST match the client-side constant in ScanScreen.tsx (FREE_SCAN_LIMIT).
# The client-side check is UX-only; this is the authoritative gate.
FREE_SCAN_LIMIT_PER_DAY = 3

router = APIRouter(prefix="/api", tags=["ai-food"])

# ─── Scan ─────────────────────────────────────────────────────────────────────

@router.post("/food/scan")
@(_limiter.limit("20/minute") if _rate_limit_enabled else lambda f: f)
async def scan_food(
    request: Request,
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

    # Read image bytes then enforce 10 MB limit
    image_bytes = await image.read()
    if len(image_bytes) > 10 * 1024 * 1024:  # 10 MB
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Image file too large. Maximum allowed size is 10 MB",
        )

    # ── Server-side free-tier scan quota ────────────────────────────────────
    # Premium users have unlimited scans.  Free users are capped per day.
    if not current_user.is_premium:
        today_start = datetime.combine(date_type.today(), time.min)
        today_end = datetime.combine(date_type.today(), time.max)
        scan_count_result = await session.execute(
            select(func.count(AIFoodLog.id)).where(
                AIFoodLog.user_id == current_user.id,
                AIFoodLog.logged_at >= today_start,
                AIFoodLog.logged_at <= today_end,
                AIFoodLog.ai_provider != "manual",
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
            meal_type=meal_type,
            session=session,
        )
    except ValueError as e:
        logger.error("Food scan failed: user_id=%s error=%s", current_user.id, e)
        # SEC: The ai_scan_service already produces user-safe error messages in ValueError.
        # We pass them through but cap length to avoid any accidental data leakage.
        safe_msg = str(e)[:200] if str(e) else "AI scan failed. Please try again."
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=safe_msg)

    try:
        await cache_delete(daily_summary_key(current_user.id, date_type.today().isoformat()))
    except Exception:
        pass

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

    try:
        await cache_delete(daily_summary_key(current_user.id, date_type.today().isoformat()))
    except Exception:
        pass

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
    from sqlmodel import select as sm_select
    from ..models.daily_nutrition_summary import DailyNutritionSummary

    today = date_type.today()

    # Fetch existing summary for today
    result = await session.exec(
        sm_select(DailyNutritionSummary).where(
            DailyNutritionSummary.user_id == current_user.id,
            DailyNutritionSummary.date == today,
        )
    )
    summary = result.first()

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
        result = await session.exec(
            sm_select(DailyNutritionSummary).where(
                DailyNutritionSummary.user_id == current_user.id,
                DailyNutritionSummary.date == today,
            )
        )
        summary = result.first()
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
        await cache_delete(daily_summary_key(current_user.id, today.isoformat()))
    except Exception:
        pass

    return {"water_ml": summary.water_ml}


# ─── Food Logs ────────────────────────────────────────────────────────────────

@router.get("/food/logs")
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
    # Build base query
    query = select(AIFoodLog).where(AIFoodLog.user_id == current_user.id)
    count_query = select(func.count()).select_from(AIFoodLog).where(AIFoodLog.user_id == current_user.id)

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
    total_result = await session.execute(count_query)
    total = total_result.scalar() or 0

    # Determine pagination mode: prefer page-based when page > 1 or legacy params are default
    use_page_based = (page > 1) or (offset == 0 and limit == 0)

    if use_page_based:
        pg_offset, pg_limit = paginate_params(page, page_size)
        query = query.offset(pg_offset).limit(pg_limit)
    else:
        effective_limit = limit if limit > 0 else 50
        query = query.offset(offset).limit(effective_limit)

    result = await session.execute(query)
    logs = result.scalars().all()

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
    body: UpdateFoodLog,
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
        if body.meal_type not in {"breakfast", "lunch", "dinner", "snack"}:
            raise HTTPException(status_code=422, detail="Invalid meal_type")
        log.meal_type = body.meal_type

    log.was_edited = True
    session.add(log)
    await session.commit()

    try:
        await cache_delete(daily_summary_key(current_user.id, log.logged_at.date().isoformat()))
    except Exception:
        pass

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

    log_date = log.logged_at.date().isoformat()
    await session.delete(log)
    await session.commit()

    try:
        await cache_delete(daily_summary_key(current_user.id, log_date))
    except Exception:
        pass

    return {"message": "Deleted"}


# ─── Food Search ──────────────────────────────────────────────────────────────

@router.get("/food/search")
async def search_food_history(
    q: str = Query(..., description="Search query (min 2 chars)"),
    limit: int = Query(10, ge=1, le=20),
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

    result = await session.execute(
        text(
            "SELECT food_name, calories, protein_g, carbs_g, fats_g, COUNT(*) as count "
            "FROM ai_food_log "
            "WHERE user_id = :uid AND LOWER(food_name) LIKE LOWER(:q) "
            "GROUP BY food_name, calories, protein_g, carbs_g, fats_g "
            "ORDER BY count DESC "
            "LIMIT :limit"
        ),
        {"uid": current_user.id, "q": f"%{escaped_q}%", "limit": limit},
    )
    rows = result.mappings().all()
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

    cache_key = daily_summary_key(current_user.id, target_date)

    try:
        cached = await cache_get(cache_key)
        if cached is not None:
            return cached
    except Exception:
        pass  # cache failure — fall through to DB

    result = await get_daily_summary(
        user_id=current_user.id,
        date=target_date,
        session=session,
    )

    try:
        await cache_set(cache_key, result, CACHE_TTL["daily_summary"])
    except Exception:
        pass  # cache failure — return result anyway

    return result
