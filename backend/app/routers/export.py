"""
Export endpoints
----------------
GET /api/export/pdf              -- Weekly nutrition PDF report
GET /api/export/food-logs        -- Food logs export (CSV or JSON, with date filters, streaming)
GET /api/export/weekly-summary   -- Weekly summary export (one row per day with totals)
GET /api/export/my-data          -- Full JSON export of all user data (GDPR portability)
GET /api/export/my-data/csv      -- CSV export of user's food logs (legacy, no filters)
"""

import csv
import io
import json
import logging
from datetime import date, datetime, time as dt_time, timedelta, timezone
from enum import Enum
from typing import AsyncIterator, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy import select, func

from ..core.database import get_session
from ..models.user import User
from ..models.onboarding_profile import OnboardingProfile
from ..models.nutrition_profile import UserNutritionProfile
from ..models.ai_food_log import AIFoodLog
from ..models.meal_log import MealLog
from ..models.daily_nutrition_summary import DailyNutritionSummary
from ..models.activity import Activity
from ..models.subscription import Subscription
from ..models.feedback import Feedback
from ..models.workout import WorkoutLog
from .auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/export", tags=["export"])

# Maximum date range allowed for exports (365 days)
_MAX_EXPORT_RANGE_DAYS = 365

# Batch size for streaming queries
_STREAM_BATCH_SIZE = 500

# UTF-8 BOM for Excel compatibility
_UTF8_BOM = b"\xef\xbb\xbf"


# ---- Export format enum ----

class ExportFormat(str, Enum):
    csv = "csv"
    json = "json"


# ---- Rate limiting for exports ----

async def _check_export_rate_limit(user_id: int) -> None:
    """Enforce max 1 export per minute per user via Redis.

    Raises HTTPException 429 if the user has exported within the last 60 seconds.
    Fails open (allows the request) if Redis is unavailable.
    """
    try:
        from ..core.token_store import get_redis
        r = get_redis()
        key = f"export_ratelimit:user:{user_id}"
        exists = await r.get(key)
        if exists:
            ttl = await r.ttl(key)
            raise HTTPException(
                status_code=429,
                detail=f"Export rate limit exceeded. Please wait {max(ttl, 1)} seconds before requesting another export.",
                headers={"Retry-After": str(max(ttl, 1))},
            )
        # Set the key with 60-second expiration
        await r.set(key, "1", ex=60)
    except HTTPException:
        raise
    except Exception as exc:
        # Redis unavailable -- fail open, allow the export
        logger.warning("Export rate limiter Redis error (allowing request): %s", exc)


# ---- Helpers ----

def _dt(val) -> str | None:
    """Serialize a datetime or date to ISO string, or None."""
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.isoformat()
    return str(val)


def _safe_round(val, digits: int = 1) -> str:
    """Round a numeric value safely, returning empty string for None."""
    if val is None:
        return ""
    return str(round(val, digits))


def _validate_date_range(
    start_date: Optional[date],
    end_date: Optional[date],
    default_days: int = 30,
) -> tuple[date, date]:
    """Validate and normalize date range parameters.

    Returns (start_date, end_date) with defaults applied.
    Raises HTTPException on invalid ranges.
    """
    today = date.today()

    if end_date is None:
        end_date = today
    if start_date is None:
        start_date = end_date - timedelta(days=default_days)

    if start_date > end_date:
        raise HTTPException(
            status_code=422,
            detail="start_date must be on or before end_date.",
        )

    if end_date > today:
        raise HTTPException(
            status_code=422,
            detail="end_date cannot be in the future.",
        )

    range_days = (end_date - start_date).days
    if range_days > _MAX_EXPORT_RANGE_DAYS:
        raise HTTPException(
            status_code=422,
            detail=f"Date range exceeds maximum of {_MAX_EXPORT_RANGE_DAYS} days. "
                   f"Requested range: {range_days} days.",
        )

    return start_date, end_date


# ---- Full food log columns (all fields from AIFoodLog) ----

_FOOD_LOG_CSV_COLUMNS = [
    "date",
    "time",
    "meal_type",
    "food_name",
    "calories",
    "protein_g",
    "carbs_g",
    "fat_g",
    "fiber_g",
    "sugar_g",
    "sodium_mg",
    "serving_size",
    "was_edited",
    "notes",
]


def _food_log_to_csv_row(log: AIFoodLog) -> list:
    """Convert a single AIFoodLog record to a CSV row list."""
    return [
        log.logged_at.strftime("%Y-%m-%d") if log.logged_at else "",
        log.logged_at.strftime("%H:%M") if log.logged_at else "",
        log.meal_type or "",
        log.food_name or "",
        _safe_round(log.calories, 1),
        _safe_round(log.protein_g, 1),
        _safe_round(log.carbs_g, 1),
        _safe_round(log.fats_g, 1),
        _safe_round(log.fiber_g, 1),
        _safe_round(log.sugar_g, 1),
        _safe_round(log.sodium_mg, 1),
        log.serving_size or "",
        "yes" if log.was_edited else "no",
        log.notes or "",
    ]


def _food_log_to_dict(log: AIFoodLog) -> dict:
    """Convert a single AIFoodLog record to a JSON-serializable dict."""
    return {
        "date": log.logged_at.strftime("%Y-%m-%d") if log.logged_at else None,
        "time": log.logged_at.strftime("%H:%M") if log.logged_at else None,
        "meal_type": log.meal_type,
        "food_name": log.food_name,
        "calories": round(log.calories, 1) if log.calories is not None else None,
        "protein_g": round(log.protein_g, 1) if log.protein_g is not None else None,
        "carbs_g": round(log.carbs_g, 1) if log.carbs_g is not None else None,
        "fat_g": round(log.fats_g, 1) if log.fats_g is not None else None,
        "fiber_g": round(log.fiber_g, 1) if log.fiber_g is not None else None,
        "sugar_g": round(log.sugar_g, 1) if log.sugar_g is not None else None,
        "sodium_mg": round(log.sodium_mg, 1) if log.sodium_mg is not None else None,
        "serving_size": log.serving_size,
        "was_edited": log.was_edited,
        "notes": log.notes,
    }


# ---- Streaming generators ----

async def _stream_food_logs_csv(
    user_id: int,
    start_dt: datetime,
    end_dt: datetime,
    session: AsyncSession,
) -> AsyncIterator[bytes]:
    """Stream food log CSV rows in batches to avoid loading all data in memory.

    Yields UTF-8 encoded bytes including BOM header for Excel compatibility.
    """
    # Yield BOM + header row
    header_buf = io.StringIO()
    writer = csv.writer(header_buf)
    writer.writerow(_FOOD_LOG_CSV_COLUMNS)
    yield _UTF8_BOM + header_buf.getvalue().encode("utf-8")

    offset = 0
    while True:
        query = (
            select(AIFoodLog)
            .where(
                AIFoodLog.user_id == user_id,
                AIFoodLog.deleted_at.is_(None),
                AIFoodLog.logged_at >= start_dt,
                AIFoodLog.logged_at <= end_dt,
            )
            .order_by(AIFoodLog.logged_at.asc())
            .offset(offset)
            .limit(_STREAM_BATCH_SIZE)
        )
        result = await session.execute(query)
        batch = result.scalars().all()

        if not batch:
            break

        buf = io.StringIO()
        writer = csv.writer(buf)
        for log in batch:
            writer.writerow(_food_log_to_csv_row(log))
        yield buf.getvalue().encode("utf-8")

        if len(batch) < _STREAM_BATCH_SIZE:
            break
        offset += _STREAM_BATCH_SIZE


async def _stream_food_logs_json(
    user_id: int,
    start_dt: datetime,
    end_dt: datetime,
    session: AsyncSession,
) -> AsyncIterator[bytes]:
    """Stream food logs as a JSON array, yielding chunks to avoid full memory load."""
    yield b'{"export_version":"1.2","exported_at":"'
    yield datetime.now(timezone.utc).isoformat().encode("utf-8")
    yield b'","food_logs":[\n'

    offset = 0
    first_row = True
    while True:
        query = (
            select(AIFoodLog)
            .where(
                AIFoodLog.user_id == user_id,
                AIFoodLog.deleted_at.is_(None),
                AIFoodLog.logged_at >= start_dt,
                AIFoodLog.logged_at <= end_dt,
            )
            .order_by(AIFoodLog.logged_at.asc())
            .offset(offset)
            .limit(_STREAM_BATCH_SIZE)
        )
        result = await session.execute(query)
        batch = result.scalars().all()

        if not batch:
            break

        for log in batch:
            row_json = json.dumps(_food_log_to_dict(log), ensure_ascii=False)
            if first_row:
                yield row_json.encode("utf-8")
                first_row = False
            else:
                yield b",\n" + row_json.encode("utf-8")

        if len(batch) < _STREAM_BATCH_SIZE:
            break
        offset += _STREAM_BATCH_SIZE

    yield b"\n]}\n"


# ---- Weekly summary columns ----

_WEEKLY_SUMMARY_CSV_COLUMNS = [
    "date",
    "total_calories",
    "total_protein_g",
    "total_carbs_g",
    "total_fat_g",
    "total_fiber_g",
    "meals_logged",
    "avg_calories_per_meal",
]


# =============================================================================
# ENDPOINTS
# =============================================================================


# ---- PDF export ----

@router.get("/pdf")
async def export_pdf(
    request: Request,
    days: int = Query(default=7, ge=1, le=90, description="Number of days to include in the report"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Generate a weekly nutrition PDF report.

    Includes: user profile summary, daily calorie chart data, macro averages,
    NutriScore trend, and a table of meals logged during the period.

    The `days` parameter controls how many days back the report covers (default 7, max 90).
    Uses ReportLab for PDF generation with styled tables, macro distribution,
    and a detailed food log section.

    Rate limited to 1 export per minute per user.
    """
    await _check_export_rate_limit(current_user.id)

    from ..services.export_service import generate_nutrition_report_pdf

    try:
        pdf_bytes = await generate_nutrition_report_pdf(
            user_id=current_user.id,
            session=session,
            days=days,
        )
    except Exception:
        logger.exception("PDF export failed: user_id=%s days=%d", current_user.id, days)
        raise HTTPException(
            status_code=500,
            detail="Failed to generate PDF report. Please try again later.",
        )

    filename = f"fitsi_report_{current_user.id}_{date.today().strftime('%Y%m%d')}.pdf"

    logger.info(
        "PDF export: user_id=%s days=%d size=%d bytes",
        current_user.id, days, len(pdf_bytes),
    )

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---- Food logs export (CSV or JSON, streaming, with date filters) ----

@router.get("/food-logs")
async def export_food_logs(
    request: Request,
    start_date: Optional[date] = Query(
        default=None,
        description="Start date for the export (inclusive). Defaults to 30 days ago.",
    ),
    end_date: Optional[date] = Query(
        default=None,
        description="End date for the export (inclusive). Defaults to today.",
    ),
    format: ExportFormat = Query(
        default=ExportFormat.csv,
        description="Export format: csv or json.",
    ),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Export food logs with all fields as CSV or JSON, with optional date range filtering.

    CSV columns: date, time, meal_type, food_name, calories, protein_g, carbs_g,
    fat_g, fiber_g, sugar_g, sodium_mg, serving_size, was_edited, notes.

    CSV output includes UTF-8 BOM for Excel compatibility and proper RFC 4180 escaping.
    Large exports are streamed in batches to avoid loading all data in memory.

    Rate limited to 1 export per minute per user.
    """
    await _check_export_rate_limit(current_user.id)

    user_id = current_user.id
    start_date, end_date = _validate_date_range(start_date, end_date, default_days=30)
    start_dt = datetime.combine(start_date, dt_time.min)
    end_dt = datetime.combine(end_date, dt_time.max)

    date_suffix = f"{start_date.strftime('%Y%m%d')}_{end_date.strftime('%Y%m%d')}"

    if format == ExportFormat.json:
        filename = f"fitsi_food_logs_{user_id}_{date_suffix}.json"
        logger.info(
            "Food logs JSON export (streaming): user_id=%s range=%s..%s",
            user_id, start_date, end_date,
        )
        return StreamingResponse(
            _stream_food_logs_json(user_id, start_dt, end_dt, session),
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    # Default: CSV
    filename = f"fitsi_food_logs_{user_id}_{date_suffix}.csv"
    logger.info(
        "Food logs CSV export (streaming): user_id=%s range=%s..%s",
        user_id, start_date, end_date,
    )
    return StreamingResponse(
        _stream_food_logs_csv(user_id, start_dt, end_dt, session),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---- Weekly summary export ----

@router.get("/weekly-summary")
async def export_weekly_summary(
    request: Request,
    start_date: Optional[date] = Query(
        default=None,
        description="Start date for the summary (inclusive). Defaults to 30 days ago.",
    ),
    end_date: Optional[date] = Query(
        default=None,
        description="End date for the summary (inclusive). Defaults to today.",
    ),
    format: ExportFormat = Query(
        default=ExportFormat.csv,
        description="Export format: csv or json.",
    ),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Export a weekly summary with one row per day containing daily nutrition totals.

    Columns: date, total_calories, total_protein_g, total_carbs_g, total_fat_g,
    total_fiber_g, meals_logged, avg_calories_per_meal.

    Aggregates food logs by day. Days with no logged meals are omitted.

    Rate limited to 1 export per minute per user.
    """
    await _check_export_rate_limit(current_user.id)

    user_id = current_user.id
    start_date, end_date = _validate_date_range(start_date, end_date, default_days=30)
    start_dt = datetime.combine(start_date, dt_time.min)
    end_dt = datetime.combine(end_date, dt_time.max)

    try:
        query = (
            select(
                func.date(AIFoodLog.logged_at).label("log_date"),
                func.coalesce(func.sum(AIFoodLog.calories), 0).label("total_calories"),
                func.coalesce(func.sum(AIFoodLog.protein_g), 0).label("total_protein_g"),
                func.coalesce(func.sum(AIFoodLog.carbs_g), 0).label("total_carbs_g"),
                func.coalesce(func.sum(AIFoodLog.fats_g), 0).label("total_fat_g"),
                func.coalesce(func.sum(AIFoodLog.fiber_g), 0).label("total_fiber_g"),
                func.count(AIFoodLog.id).label("meals_logged"),
            )
            .where(
                AIFoodLog.user_id == user_id,
                AIFoodLog.deleted_at.is_(None),
                AIFoodLog.logged_at >= start_dt,
                AIFoodLog.logged_at <= end_dt,
            )
            .group_by(func.date(AIFoodLog.logged_at))
            .order_by(func.date(AIFoodLog.logged_at).asc())
        )
        result = await session.execute(query)
        rows = result.all()
    except Exception:
        logger.exception("Weekly summary export query failed: user_id=%s", user_id)
        raise HTTPException(
            status_code=500,
            detail="Failed to generate weekly summary. Please try again later.",
        )

    date_suffix = f"{start_date.strftime('%Y%m%d')}_{end_date.strftime('%Y%m%d')}"

    if format == ExportFormat.json:
        summary_list = []
        for row in rows:
            total_cal = float(row.total_calories)
            meals = int(row.meals_logged)
            summary_list.append({
                "date": str(row.log_date),
                "total_calories": round(total_cal, 1),
                "total_protein_g": round(float(row.total_protein_g), 1),
                "total_carbs_g": round(float(row.total_carbs_g), 1),
                "total_fat_g": round(float(row.total_fat_g), 1),
                "total_fiber_g": round(float(row.total_fiber_g), 1),
                "meals_logged": meals,
                "avg_calories_per_meal": round(total_cal / meals, 1) if meals > 0 else 0.0,
            })

        export_payload = {
            "export_version": "1.2",
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "period": {"start_date": str(start_date), "end_date": str(end_date)},
            "daily_summaries": summary_list,
        }

        json_bytes = json.dumps(export_payload, indent=2, ensure_ascii=False).encode("utf-8")
        filename = f"fitsi_weekly_summary_{user_id}_{date_suffix}.json"

        logger.info(
            "Weekly summary JSON export: user_id=%s range=%s..%s days=%d",
            user_id, start_date, end_date, len(rows),
        )

        return StreamingResponse(
            io.BytesIO(json_bytes),
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    # Default: CSV with UTF-8 BOM
    output = io.BytesIO()
    output.write(_UTF8_BOM)

    text_buf = io.StringIO()
    writer = csv.writer(text_buf)
    writer.writerow(_WEEKLY_SUMMARY_CSV_COLUMNS)

    for row in rows:
        total_cal = float(row.total_calories)
        meals = int(row.meals_logged)
        avg_cal = round(total_cal / meals, 1) if meals > 0 else 0.0
        writer.writerow([
            str(row.log_date),
            round(total_cal, 1),
            round(float(row.total_protein_g), 1),
            round(float(row.total_carbs_g), 1),
            round(float(row.total_fat_g), 1),
            round(float(row.total_fiber_g), 1),
            meals,
            avg_cal,
        ])

    output.write(text_buf.getvalue().encode("utf-8"))
    output.seek(0)

    filename = f"fitsi_weekly_summary_{user_id}_{date_suffix}.csv"

    logger.info(
        "Weekly summary CSV export: user_id=%s range=%s..%s days=%d",
        user_id, start_date, end_date, len(rows),
    )

    return StreamingResponse(
        output,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---- Legacy CSV export (kept for backward compatibility, redirects) ----

@router.get("/csv")
async def export_csv(
    request: Request,
    start_date: Optional[date] = Query(
        default=None,
        description="Start date for the export (inclusive). Defaults to 30 days ago.",
    ),
    end_date: Optional[date] = Query(
        default=None,
        description="End date for the export (inclusive). Defaults to today.",
    ),
    format: ExportFormat = Query(
        default=ExportFormat.csv,
        description="Export format: csv or json.",
    ),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Export food logs as CSV or JSON with optional date range filtering.

    This endpoint is maintained for backward compatibility. It delegates
    to the /food-logs endpoint with the same parameters.

    Rate limited to 1 export per minute per user.
    """
    return await export_food_logs(
        request=request,
        start_date=start_date,
        end_date=end_date,
        format=format,
        current_user=current_user,
        session=session,
    )


# ---- Full JSON export (GDPR data portability) ----

@router.get("/my-data")
async def export_my_data(
    request: Request,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Export all user data as JSON for GDPR data portability (Article 20).

    Includes: profile, onboarding, nutrition targets, food logs, meal logs,
    daily summaries, activities, workouts, subscriptions, and feedback.

    Only returns data belonging to the authenticated user.
    Soft-deleted records are excluded.

    Rate limited to 1 export per minute per user.
    """
    await _check_export_rate_limit(current_user.id)

    user_id = current_user.id

    # -- User profile --
    profile_data = {
        "id": current_user.id,
        "email": current_user.email,
        "first_name": current_user.first_name,
        "last_name": current_user.last_name,
        "provider": current_user.provider,
        "is_premium": current_user.is_premium,
        "is_active": current_user.is_active,
        "created_at": _dt(current_user.created_at),
        "updated_at": _dt(current_user.updated_at),
    }

    # -- Onboarding profile --
    ob_result = await session.execute(
        select(OnboardingProfile).where(
            OnboardingProfile.user_id == user_id,
            OnboardingProfile.deleted_at.is_(None),
        )
    )
    ob = ob_result.scalar_one_or_none()
    onboarding_data = None
    if ob:
        onboarding_data = {
            "gender": ob.gender,
            "workouts_per_week": ob.workouts_per_week,
            "heard_from": ob.heard_from,
            "used_other_apps": ob.used_other_apps,
            "height_cm": ob.height_cm,
            "weight_kg": ob.weight_kg,
            "unit_system": ob.unit_system,
            "birth_date": _dt(ob.birth_date),
            "goal": ob.goal,
            "target_weight_kg": ob.target_weight_kg,
            "weekly_speed_kg": ob.weekly_speed_kg,
            "pain_points": ob.pain_points,
            "diet_type": ob.diet_type,
            "accomplishments": ob.accomplishments,
            "health_connected": ob.health_connected,
            "notifications_enabled": ob.notifications_enabled,
            "referral_code": ob.referral_code,
            "daily_calories": ob.daily_calories,
            "daily_carbs_g": ob.daily_carbs_g,
            "daily_protein_g": ob.daily_protein_g,
            "daily_fats_g": ob.daily_fats_g,
            "health_score": ob.health_score,
            "completed_at": _dt(ob.completed_at),
            "created_at": _dt(ob.created_at),
        }

    # -- Nutrition profile --
    np_result = await session.execute(
        select(UserNutritionProfile).where(UserNutritionProfile.user_id == user_id)
    )
    np = np_result.scalar_one_or_none()
    nutrition_data = None
    if np:
        nutrition_data = {
            "height_cm": np.height_cm,
            "weight_kg": np.weight_kg,
            "age": np.age,
            "gender": np.gender.value if np.gender else None,
            "activity_level": np.activity_level.value if np.activity_level else None,
            "goal": np.goal.value if np.goal else None,
            "target_calories": np.target_calories,
            "target_protein_g": np.target_protein_g,
            "target_carbs_g": np.target_carbs_g,
            "target_fat_g": np.target_fat_g,
        }

    # -- AI food logs (exclude soft-deleted) --
    fl_result = await session.execute(
        select(AIFoodLog)
        .where(AIFoodLog.user_id == user_id, AIFoodLog.deleted_at.is_(None))
        .order_by(AIFoodLog.logged_at.desc())
    )
    food_logs = [
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
            "logged_at": _dt(log.logged_at),
            "ai_provider": log.ai_provider,
            "ai_confidence": log.ai_confidence,
            "was_edited": log.was_edited,
            "notes": log.notes,
            "image_url": log.image_url,
        }
        for log in fl_result.scalars().all()
    ]

    # -- Meal logs --
    ml_result = await session.execute(
        select(MealLog).where(MealLog.user_id == user_id).order_by(MealLog.created_at.desc())
    )
    meal_logs = [
        {
            "id": m.id,
            "date": _dt(m.date),
            "meal_type": m.meal_type.value if hasattr(m.meal_type, "value") else m.meal_type,
            "food_id": m.food_id,
            "servings": m.servings,
            "total_calories": m.total_calories,
            "total_protein": m.total_protein,
            "total_carbs": m.total_carbs,
            "total_fat": m.total_fat,
            "total_fiber": m.total_fiber,
            "total_sugar": m.total_sugar,
            "created_at": _dt(m.created_at),
        }
        for m in ml_result.scalars().all()
    ]

    # -- Daily summaries (exclude soft-deleted) --
    ds_result = await session.execute(
        select(DailyNutritionSummary).where(
            DailyNutritionSummary.user_id == user_id,
            DailyNutritionSummary.deleted_at.is_(None),
        ).order_by(DailyNutritionSummary.date.desc())
    )
    daily_summaries = [
        {
            "date": _dt(s.date),
            "total_calories": s.total_calories,
            "total_protein": s.total_protein,
            "total_carbs": s.total_carbs,
            "total_fat": s.total_fat,
            "target_calories": s.target_calories,
            "water_ml": s.water_ml,
        }
        for s in ds_result.scalars().all()
    ]

    # -- Activities --
    act_result = await session.execute(
        select(Activity).where(Activity.user_id == user_id).order_by(Activity.created_at.desc())
    )
    activities = [
        {
            "id": a.id,
            "title": a.title,
            "description": a.description,
            "start_time": _dt(a.start_time),
            "end_time": _dt(a.end_time),
            "status": a.status.value if hasattr(a.status, "value") else a.status,
            "created_at": _dt(a.created_at),
        }
        for a in act_result.scalars().all()
    ]

    # -- Workouts --
    wk_result = await session.execute(
        select(WorkoutLog).where(WorkoutLog.user_id == user_id).order_by(WorkoutLog.created_at.desc())
    )
    workouts = [
        {
            "id": w.id,
            "workout_type": w.workout_type.value if hasattr(w.workout_type, "value") else w.workout_type,
            "duration_min": w.duration_min,
            "calories_burned": w.calories_burned,
            "notes": w.notes,
            "created_at": _dt(w.created_at),
        }
        for w in wk_result.scalars().all()
    ]

    # -- Subscriptions --
    sub_result = await session.execute(
        select(Subscription).where(Subscription.user_id == user_id).order_by(Subscription.created_at.desc())
    )
    subscriptions = [
        {
            "id": s.id,
            "plan": s.plan,
            "status": s.status,
            "price_paid": s.price_paid,
            "currency": s.currency,
            "discount_pct": s.discount_pct,
            "store": s.store,
            "trial_ends_at": _dt(s.trial_ends_at),
            "current_period_ends_at": _dt(s.current_period_ends_at),
            "created_at": _dt(s.created_at),
        }
        for s in sub_result.scalars().all()
    ]

    # -- Feedback --
    fb_result = await session.execute(
        select(Feedback).where(Feedback.user_id == user_id).order_by(Feedback.created_at.desc())
    )
    feedback_list = [
        {
            "id": f.id,
            "type": f.type.value if hasattr(f.type, "value") else f.type,
            "message": f.message,
            "screen": f.screen,
            "app_version": f.app_version,
            "status": f.status.value if hasattr(f.status, "value") else f.status,
            "created_at": _dt(f.created_at),
        }
        for f in fb_result.scalars().all()
    ]

    export = {
        "export_version": "1.2",
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "user": profile_data,
        "onboarding_profile": onboarding_data,
        "nutrition_profile": nutrition_data,
        "food_logs": food_logs,
        "meal_logs": meal_logs,
        "daily_summaries": daily_summaries,
        "activities": activities,
        "workouts": workouts,
        "subscriptions": subscriptions,
        "feedback": feedback_list,
    }

    logger.info("GDPR data export: user_id=%s sections=%d", user_id, len(export) - 2)

    # Return as downloadable JSON file
    json_bytes = json.dumps(export, indent=2, ensure_ascii=False).encode("utf-8")
    filename = f"fitsi_export_{user_id}_{datetime.now(timezone.utc).strftime('%Y%m%d')}.json"

    return StreamingResponse(
        io.BytesIO(json_bytes),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---- Legacy CSV export (food logs, no date filter) ----

_LEGACY_CSV_COLUMNS = [
    "id", "food_name", "calories", "carbs_g", "protein_g", "fats_g",
    "fiber_g", "sugar_g", "sodium_mg", "serving_size", "meal_type",
    "logged_at", "ai_provider", "ai_confidence", "was_edited",
]


@router.get("/my-data/csv")
async def export_my_data_csv(
    request: Request,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Export user's food logs as a CSV file (legacy endpoint, no date filtering).

    For date-filtered exports, use GET /api/export/food-logs instead.
    Excludes soft-deleted records. Includes UTF-8 BOM for Excel compatibility.

    Rate limited to 1 export per minute per user.
    """
    await _check_export_rate_limit(current_user.id)

    user_id = current_user.id

    result = await session.execute(
        select(AIFoodLog)
        .where(AIFoodLog.user_id == user_id, AIFoodLog.deleted_at.is_(None))
        .order_by(AIFoodLog.logged_at.desc())
    )
    logs = result.scalars().all()

    output = io.BytesIO()
    output.write(_UTF8_BOM)

    text_buf = io.StringIO()
    writer = csv.writer(text_buf)
    writer.writerow(_LEGACY_CSV_COLUMNS)

    for log in logs:
        writer.writerow([
            log.id,
            log.food_name,
            log.calories,
            log.carbs_g,
            log.protein_g,
            log.fats_g,
            log.fiber_g,
            log.sugar_g,
            log.sodium_mg,
            log.serving_size,
            log.meal_type,
            _dt(log.logged_at),
            log.ai_provider,
            log.ai_confidence,
            log.was_edited,
        ])

    output.write(text_buf.getvalue().encode("utf-8"))
    output.seek(0)

    filename = f"fitsi_food_logs_{user_id}_{datetime.now(timezone.utc).strftime('%Y%m%d')}.csv"

    logger.info("Legacy CSV food log export: user_id=%s rows=%d", user_id, len(logs))

    return StreamingResponse(
        output,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
