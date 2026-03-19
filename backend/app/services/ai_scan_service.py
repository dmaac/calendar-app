"""
AI Food Scan Service
────────────────────
1. Hash image → check Redis cache → check DB cache
2. On miss: call GPT-4o Vision → parse JSON response
3. Store result in DB + Redis (30-day TTL)
4. Save AIFoodLog row for the user

All OpenAI calls are async via httpx to stay non-blocking.
"""

import hashlib
import json
import base64
import logging
from typing import Optional
from datetime import datetime

import httpx
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy import select, update

from ..models.ai_food_log import AIFoodLog
from ..models.ai_scan_cache import AIScanCache
from ..core.config import settings
from ..core.cache import cache_get, cache_set, ai_scan_key

logger = logging.getLogger(__name__)

# ─── GPT-4o Vision ────────────────────────────────────────────────────────────

SCAN_PROMPT = """You are a precise nutrition analysis AI. Analyze this food image and return ONLY a JSON object with these exact fields:

{
  "food_name": "descriptive name of the food",
  "calories": <number>,
  "carbs_g": <number>,
  "protein_g": <number>,
  "fats_g": <number>,
  "fiber_g": <number or null>,
  "sugar_g": <number or null>,
  "sodium_mg": <number or null>,
  "serving_size": "description of portion (e.g. '1 plate ~350g')",
  "confidence": <0.0-1.0>
}

Rules:
- All macro values in grams, calories as kcal
- Estimate for the FULL portion visible in the image
- If multiple foods, sum all macros and list main items in food_name
- Return ONLY the JSON, no markdown, no explanation
- If you cannot identify food, return confidence: 0.1 with best guess"""


async def _call_gpt4o_vision(image_bytes: bytes, mime_type: str = "image/jpeg") -> dict:
    """Call GPT-4o Vision API and parse the nutrition JSON response."""
    if not settings.openai_api_key:
        raise ValueError("OPENAI_API_KEY not configured")

    b64_image = base64.b64encode(image_bytes).decode("utf-8")

    payload = {
        "model": "gpt-4o",
        "max_tokens": 500,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": SCAN_PROMPT},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{mime_type};base64,{b64_image}",
                            "detail": "low",  # faster + cheaper; "high" for better accuracy
                        },
                    },
                ],
            }
        ],
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.openai_api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        response.raise_for_status()

    data = response.json()
    raw_content = data["choices"][0]["message"]["content"].strip()

    # Strip markdown code fences if present
    if raw_content.startswith("```"):
        lines = raw_content.split("\n")
        raw_content = "\n".join(lines[1:-1]) if len(lines) > 2 else raw_content

    result = json.loads(raw_content)
    result["_raw"] = raw_content
    return result


# ─── Cache helpers ────────────────────────────────────────────────────────────

def _hash_image(image_bytes: bytes) -> str:
    return hashlib.sha256(image_bytes).hexdigest()


async def _get_cached_scan(image_hash: str, session: AsyncSession) -> Optional[dict]:
    """Check Redis then DB for a cached scan result."""
    # 1. Redis (fastest)
    redis_key = ai_scan_key(image_hash)
    cached = await cache_get(redis_key)
    if cached:
        # cache_get already parses JSON, may return dict or string
        return cached if isinstance(cached, dict) else json.loads(cached)

    # 2. DB
    stmt = select(AIScanCache).where(AIScanCache.image_hash == image_hash)
    result = await session.execute(stmt)
    row = result.scalar_one_or_none()
    if row:
        # Increment hit counter async (fire-and-forget)
        await session.execute(
            update(AIScanCache)
            .where(AIScanCache.image_hash == image_hash)
            .values(hit_count=AIScanCache.hit_count + 1)
        )
        await session.commit()

        scan_data = {
            "food_name": row.food_name,
            "calories": row.calories,
            "carbs_g": row.carbs_g,
            "protein_g": row.protein_g,
            "fats_g": row.fats_g,
            "fiber_g": row.fiber_g,
            "ai_provider": row.ai_provider,
        }
        # Warm Redis cache
        await cache_set(redis_key, json.dumps(scan_data), ttl=30 * 24 * 3600)
        return scan_data

    return None


async def _save_scan_cache(image_hash: str, result: dict, session: AsyncSession) -> None:
    """Persist scan result to DB + Redis."""
    # DB
    existing = (await session.execute(
        select(AIScanCache).where(AIScanCache.image_hash == image_hash)
    )).scalar_one_or_none()

    if not existing:
        cache_row = AIScanCache(
            image_hash=image_hash,
            food_name=result["food_name"],
            calories=result["calories"],
            carbs_g=result["carbs_g"],
            protein_g=result["protein_g"],
            fats_g=result["fats_g"],
            fiber_g=result.get("fiber_g"),
            ai_provider="gpt-4o",
            ai_response=json.dumps(result),
        )
        session.add(cache_row)
        await session.commit()

    # Redis
    scan_data = {
        "food_name": result["food_name"],
        "calories": result["calories"],
        "carbs_g": result["carbs_g"],
        "protein_g": result["protein_g"],
        "fats_g": result["fats_g"],
        "fiber_g": result.get("fiber_g"),
        "ai_provider": "gpt-4o",
    }
    await cache_set(ai_scan_key(image_hash), json.dumps(scan_data), ttl=30 * 24 * 3600)


# ─── Public API ───────────────────────────────────────────────────────────────

async def scan_and_log_food(
    *,
    user_id: int,
    image_bytes: bytes,
    meal_type: str,
    image_url: Optional[str] = None,
    session: AsyncSession,
) -> dict:
    """
    Main entry point: scan image → get nutrition → log for user.

    Returns dict with all nutrition fields + cache_hit flag.
    """
    image_hash = _hash_image(image_bytes)

    # 1. Try cache
    cached = await _get_cached_scan(image_hash, session)
    cache_hit = cached is not None

    if cached:
        result = cached
        ai_confidence = 0.95  # Cached results are considered high confidence
        raw_response = json.dumps(cached)
    else:
        # 2. Call GPT-4o Vision
        try:
            result = await _call_gpt4o_vision(image_bytes)
        except httpx.HTTPStatusError as e:
            logger.error("OpenAI API error: %s", e)
            raise ValueError(f"AI scan failed: {e.response.status_code}")
        except (json.JSONDecodeError, KeyError) as e:
            logger.error("Failed to parse AI response: %s", e)
            raise ValueError("AI returned unexpected response format")

        ai_confidence = float(result.get("confidence", 0.8))
        raw_response = result.get("_raw", "")

        # 3. Cache the result
        await _save_scan_cache(image_hash, result, session)

    # 4. Create food log entry
    log = AIFoodLog(
        user_id=user_id,
        meal_type=meal_type,
        image_hash=image_hash,
        image_url=image_url,
        food_name=result["food_name"],
        calories=float(result["calories"]),
        carbs_g=float(result["carbs_g"]),
        protein_g=float(result["protein_g"]),
        fats_g=float(result["fats_g"]),
        fiber_g=float(result["fiber_g"]) if result.get("fiber_g") is not None else None,
        sugar_g=float(result["sugar_g"]) if result.get("sugar_g") is not None else None,
        sodium_mg=float(result["sodium_mg"]) if result.get("sodium_mg") is not None else None,
        serving_size=result.get("serving_size"),
        ai_provider="gpt-4o",
        ai_confidence=ai_confidence,
        ai_raw_response=raw_response if not cache_hit else None,
        logged_at=datetime.utcnow(),
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
        "sugar_g": log.sugar_g,
        "sodium_mg": log.sodium_mg,
        "serving_size": log.serving_size,
        "meal_type": log.meal_type,
        "logged_at": log.logged_at.isoformat(),
        "image_url": log.image_url,
        "ai_confidence": ai_confidence,
        "cache_hit": cache_hit,
    }


async def get_food_logs(
    *,
    user_id: int,
    date: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    session: AsyncSession,
) -> list:
    """Get food logs for a user, optionally filtered by date (YYYY-MM-DD)."""
    from sqlalchemy import func

    stmt = (
        select(AIFoodLog)
        .where(AIFoodLog.user_id == user_id)
        .order_by(AIFoodLog.logged_at.desc())
    )

    if date:
        stmt = stmt.where(func.date(AIFoodLog.logged_at) == date)

    stmt = stmt.limit(limit).offset(offset)
    result = await session.execute(stmt)
    logs = result.scalars().all()

    return [
        {
            "id": log.id,
            "food_name": log.food_name,
            "calories": log.calories,
            "carbs_g": log.carbs_g,
            "protein_g": log.protein_g,
            "fats_g": log.fats_g,
            "fiber_g": log.fiber_g,
            "meal_type": log.meal_type,
            "logged_at": log.logged_at.isoformat(),
            "image_url": log.image_url,
            "ai_confidence": log.ai_confidence,
            "was_edited": log.was_edited,
        }
        for log in logs
    ]


async def get_daily_summary(
    *,
    user_id: int,
    date: str,
    session: AsyncSession,
) -> dict:
    """
    Compute daily nutrition summary for a user on a given date.
    Reads from ai_food_logs only (the AI-driven logs).
    """
    from sqlalchemy import func
    from ..models.onboarding_profile import OnboardingProfile

    stmt = (
        select(
            func.coalesce(func.sum(AIFoodLog.calories), 0).label("total_calories"),
            func.coalesce(func.sum(AIFoodLog.protein_g), 0).label("total_protein_g"),
            func.coalesce(func.sum(AIFoodLog.carbs_g), 0).label("total_carbs_g"),
            func.coalesce(func.sum(AIFoodLog.fats_g), 0).label("total_fats_g"),
            func.count(AIFoodLog.id).label("meals_logged"),
        )
        .where(
            AIFoodLog.user_id == user_id,
            func.date(AIFoodLog.logged_at) == date,
        )
    )
    result = await session.execute(stmt)
    row = result.one()

    # Get targets from onboarding profile
    profile_stmt = select(OnboardingProfile).where(OnboardingProfile.user_id == user_id)
    profile_result = await session.execute(profile_stmt)
    profile = profile_result.scalar_one_or_none()

    target_calories = profile.daily_calories if profile and profile.daily_calories else 2000
    target_protein_g = profile.daily_protein_g if profile and profile.daily_protein_g else 150
    target_carbs_g = profile.daily_carbs_g if profile and profile.daily_carbs_g else 200
    target_fats_g = profile.daily_fats_g if profile and profile.daily_fats_g else 65

    # Simple streak calculation: count consecutive days with ≥1 log
    streak = await _calculate_streak(user_id=user_id, today=date, session=session)

    # Water from daily summary record if it exists
    from ..models.daily_nutrition_summary import DailyNutritionSummary
    from datetime import date as date_type
    try:
        date_obj = date_type.fromisoformat(date)
    except ValueError:
        date_obj = date_type.today()
    water_stmt = select(DailyNutritionSummary).where(
        DailyNutritionSummary.user_id == user_id,
        DailyNutritionSummary.date == date_obj,
    )
    water_result = await session.execute(water_stmt)
    daily_summary = water_result.scalar_one_or_none()
    water_ml = float(daily_summary.water_ml or 0) if daily_summary else 0.0

    return {
        "date": date,
        "total_calories": float(row.total_calories),
        "total_protein_g": float(row.total_protein_g),
        "total_carbs_g": float(row.total_carbs_g),
        "total_fats_g": float(row.total_fats_g),
        "target_calories": target_calories,
        "target_protein_g": target_protein_g,
        "target_carbs_g": target_carbs_g,
        "target_fats_g": target_fats_g,
        "meals_logged": row.meals_logged,
        "streak_days": streak,
        "water_ml": water_ml,
    }


async def _calculate_streak(user_id: int, today: str, session: AsyncSession) -> int:
    """Count consecutive days with at least one food log up to and including today."""
    from sqlalchemy import func, text
    from datetime import date as date_type, timedelta

    # Get distinct dates with logs, ordered desc
    stmt = (
        select(func.date(AIFoodLog.logged_at).label("log_date"))
        .where(AIFoodLog.user_id == user_id)
        .group_by(func.date(AIFoodLog.logged_at))
        .order_by(func.date(AIFoodLog.logged_at).desc())
        .limit(365)
    )
    result = await session.execute(stmt)
    logged_dates = {row.log_date for row in result}

    if not logged_dates:
        return 0

    streak = 0
    check_date = date_type.fromisoformat(today)

    while check_date in logged_dates:
        streak += 1
        check_date -= timedelta(days=1)

    return streak
