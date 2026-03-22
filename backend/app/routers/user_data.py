"""
GDPR User Data endpoints
────────────────────────
GET    /api/user/data  — Download ALL user data as JSON (GDPR right to portability, Art. 20)
DELETE /api/user/data  — Erase ALL user data (GDPR right to erasure, Art. 17)
"""

import io
import json
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy import delete, select

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
from ..models.push_token import PushToken
from ..models.user_food_favorite import UserFoodFavorite
from .auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/user", tags=["user-data"])


def _dt(val) -> str | None:
    """Serialize a datetime or date to ISO string, or None."""
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.isoformat()
    return str(val)


# ─── GET /api/user/data — Full data export (GDPR Art. 20) ───────────────────

@router.get("/data")
async def get_user_data(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Download ALL user data as a JSON file (GDPR right to data portability, Article 20).

    Returns a comprehensive JSON document containing every piece of data the
    system holds about the authenticated user: profile, onboarding answers,
    nutrition targets, food logs, meal logs, daily summaries, activities,
    workouts, subscriptions, push tokens, food favorites, and feedback.
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
        "is_admin": current_user.is_admin,
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
    np_obj = np_result.scalar_one_or_none()
    nutrition_data = None
    if np_obj:
        nutrition_data = {
            "height_cm": np_obj.height_cm,
            "weight_kg": np_obj.weight_kg,
            "age": np_obj.age,
            "gender": np_obj.gender.value if np_obj.gender else None,
            "activity_level": np_obj.activity_level.value if np_obj.activity_level else None,
            "goal": np_obj.goal.value if np_obj.goal else None,
            "target_calories": np_obj.target_calories,
            "target_protein_g": np_obj.target_protein_g,
            "target_carbs_g": np_obj.target_carbs_g,
            "target_fat_g": np_obj.target_fat_g,
            "created_at": _dt(np_obj.created_at),
            "updated_at": _dt(np_obj.updated_at),
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
            "notes": log.notes,
            "created_at": _dt(log.created_at),
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

    # ── Workouts ──
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

    # ── Push tokens ──
    pt_result = await session.execute(
        select(PushToken).where(PushToken.user_id == user_id)
    )
    push_tokens = [
        {
            "id": t.id,
            "platform": t.platform,
            "is_active": t.is_active,
            "created_at": _dt(t.created_at),
        }
        for t in pt_result.scalars().all()
    ]

    # ── Food favorites ──
    fav_result = await session.execute(
        select(UserFoodFavorite).where(UserFoodFavorite.user_id == user_id)
    )
    favorites = [
        {
            "id": fav.id,
            "food_id": fav.food_id,
            "created_at": _dt(fav.created_at),
        }
        for fav in fav_result.scalars().all()
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

    try:
        export = {
            "export_version": "1.1",
            "exported_at": datetime.utcnow().isoformat(),
            "gdpr_article": "Article 20 - Right to data portability",
            "user": profile_data,
            "onboarding_profile": onboarding_data,
            "nutrition_profile": nutrition_data,
            "food_logs": food_logs,
            "meal_logs": meal_logs,
            "daily_summaries": daily_summaries,
            "activities": activities,
            "workouts": workouts,
            "subscriptions": subscriptions,
            "push_tokens": push_tokens,
            "food_favorites": favorites,
            "feedback": feedback_list,
        }

        json_bytes = json.dumps(export, indent=2, ensure_ascii=False).encode("utf-8")
    except Exception as e:
        logger.exception("GDPR data export failed: user_id=%s", user_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to compile data export. Please try again later.",
        )

    logger.info(
        "GDPR data portability export: user_id=%s email=%s sections=%d",
        user_id, current_user.email, len(export) - 3,
    )

    filename = f"fitsi_all_data_{user_id}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"

    return StreamingResponse(
        io.BytesIO(json_bytes),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─── DELETE /api/user/data — Full data erasure (GDPR Art. 17) ───────────────

# Deletion order matters: child tables first, then parent tables, then the user
# record itself. This avoids foreign key constraint violations.
_CHILD_TABLES = [
    (AIFoodLog, "ai_food_log"),
    (MealLog, "meal_log"),
    (DailyNutritionSummary, "daily_nutrition_summary"),
    (Activity, "activity"),
    (WorkoutLog, "workoutlog"),
    (Subscription, "subscription"),
    (PushToken, "push_token"),
    (UserFoodFavorite, "userfoodfavorite"),
    (Feedback, "feedback"),
    (UserNutritionProfile, "nutrition_profile"),
    (OnboardingProfile, "onboarding_profile"),
]


@router.delete("/data", status_code=status.HTTP_200_OK)
async def delete_user_data(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Permanently delete ALL data belonging to the authenticated user (GDPR right
    to erasure, Article 17).

    This is an irreversible operation. The following data is deleted:
    - AI food logs (including image references)
    - Meal logs
    - Daily nutrition summaries
    - Activities
    - Workout logs
    - Subscriptions
    - Push notification tokens
    - Food favorites
    - Feedback submissions
    - Nutrition profile
    - Onboarding profile
    - The user account itself

    After this call, the authentication token is invalidated and the user must
    re-register to use the service again.

    Returns a confirmation summary with counts of deleted records per table.
    """
    user_id = current_user.id
    user_email = current_user.email

    logger.warning(
        "GDPR data erasure initiated: user_id=%s email=%s",
        user_id, user_email,
    )

    deleted_counts = {}

    try:
        # Delete all child records first (foreign key order)
        for model, label in _CHILD_TABLES:
            stmt = delete(model).where(model.user_id == user_id)
            result = await session.execute(stmt)
            count = result.rowcount
            deleted_counts[label] = count
            if count > 0:
                logger.info("GDPR erasure: deleted %d rows from %s for user_id=%s", count, label, user_id)

        # Delete the user record itself
        user_to_delete = await session.get(User, user_id)
        if user_to_delete:
            await session.delete(user_to_delete)
            deleted_counts["user"] = 1
        else:
            deleted_counts["user"] = 0

        await session.commit()
    except Exception as e:
        await session.rollback()
        logger.exception("GDPR data erasure failed: user_id=%s", user_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Data deletion failed. Please contact support.",
        )

    # Best-effort: blacklist the current access token so it cannot be reused
    try:
        from jose import jwt
        from ..core.config import settings
        from ..core.token_store import blacklist_access_token
        # We don't have the raw token here, but we can attempt to invalidate
        # via the token store if there's a mechanism for it. The user record
        # is already deleted, so any future token validation will fail anyway
        # because get_current_user queries the DB for the user.
        logger.info("GDPR erasure: user record deleted, token will fail on next use")
    except Exception:
        pass

    total_deleted = sum(deleted_counts.values())

    logger.warning(
        "GDPR data erasure completed: user_id=%s email=%s total_records=%d",
        user_id, user_email, total_deleted,
    )

    return {
        "status": "deleted",
        "message": (
            "All your data has been permanently deleted in compliance with "
            "GDPR Article 17 (Right to Erasure). This action is irreversible."
        ),
        "user_id": user_id,
        "deleted_at": datetime.utcnow().isoformat(),
        "deleted_counts": deleted_counts,
        "total_records_deleted": total_deleted,
    }
