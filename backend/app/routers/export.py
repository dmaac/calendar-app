"""
GDPR Data Export endpoints
──────────────────────────
GET /api/export/my-data      — Full JSON export of all user data (GDPR portability)
GET /api/export/my-data/csv  — CSV export of user's food logs
"""

import csv
import io
import json
import logging
from datetime import datetime

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy import select

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
from .auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/export", tags=["export"])


def _dt(val) -> str | None:
    """Serialize a datetime or date to ISO string, or None."""
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.isoformat()
    return str(val)


# ─── Full JSON export ────────────────────────────────────────────────────────

@router.get("/my-data")
async def export_my_data(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Export all user data as JSON for GDPR data portability (Article 20).

    Includes: profile, onboarding, nutrition targets, food logs, meal logs,
    daily summaries, activities, subscriptions, and feedback.
    """
    user_id = current_user.id

    # ── User profile ──
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

    # ── Onboarding profile ──
    ob_result = await session.execute(
        select(OnboardingProfile).where(OnboardingProfile.user_id == user_id)
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

    # ── Nutrition profile ──
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

    # ── AI food logs ──
    fl_result = await session.execute(
        select(AIFoodLog).where(AIFoodLog.user_id == user_id).order_by(AIFoodLog.logged_at.desc())
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
            "image_url": log.image_url,
        }
        for log in fl_result.scalars().all()
    ]

    # ── Meal logs ──
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

    # ── Daily summaries ──
    ds_result = await session.execute(
        select(DailyNutritionSummary).where(
            DailyNutritionSummary.user_id == user_id
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

    # ── Activities ──
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

    # ── Subscriptions ──
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

    # ── Feedback ──
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
        "export_version": "1.0",
        "exported_at": datetime.utcnow().isoformat(),
        "user": profile_data,
        "onboarding_profile": onboarding_data,
        "nutrition_profile": nutrition_data,
        "food_logs": food_logs,
        "meal_logs": meal_logs,
        "daily_summaries": daily_summaries,
        "activities": activities,
        "subscriptions": subscriptions,
        "feedback": feedback_list,
    }

    logger.info("GDPR data export: user_id=%s sections=%d", user_id, len(export) - 2)

    # Return as downloadable JSON file
    json_bytes = json.dumps(export, indent=2, ensure_ascii=False).encode("utf-8")
    filename = f"fitsi_export_{user_id}_{datetime.utcnow().strftime('%Y%m%d')}.json"

    return StreamingResponse(
        io.BytesIO(json_bytes),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─── CSV export (food logs) ─────────────────────────────────────────────────

CSV_COLUMNS = [
    "id", "food_name", "calories", "carbs_g", "protein_g", "fats_g",
    "fiber_g", "sugar_g", "sodium_mg", "serving_size", "meal_type",
    "logged_at", "ai_provider", "ai_confidence", "was_edited",
]


@router.get("/my-data/csv")
async def export_my_data_csv(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Export user's food logs as a CSV file.

    Useful for importing into spreadsheets or other nutrition tracking tools.
    """
    user_id = current_user.id

    result = await session.execute(
        select(AIFoodLog).where(AIFoodLog.user_id == user_id).order_by(AIFoodLog.logged_at.desc())
    )
    logs = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(CSV_COLUMNS)

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

    csv_bytes = output.getvalue().encode("utf-8")
    filename = f"fitsi_food_logs_{user_id}_{datetime.utcnow().strftime('%Y%m%d')}.csv"

    logger.info("CSV food log export: user_id=%s rows=%d", user_id, len(logs))

    return StreamingResponse(
        io.BytesIO(csv_bytes),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
