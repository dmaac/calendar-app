"""
Recovery Plan Service — rule-based 24h and 3-day recovery plans.

AI TOKEN COST: ZERO. This entire module is 100% rule-based.
No LLM / AI API calls are made anywhere in this file.

Generates meal suggestions to help users close their macro gaps.
All suggestions are in Spanish (target audience: LATAM).
Uses pre-defined meal templates and deterministic selection logic.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, time as dt_time, timedelta
from typing import Optional

from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..models.ai_food_log import AIFoodLog
from ..models.daily_nutrition_summary import DailyNutritionSummary
from .nutrition_risk_service import _get_goals, _get_day_totals, _get_water_ml

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Pre-defined meal templates (Spanish, LATAM audience)
# ---------------------------------------------------------------------------

HIGH_PROTEIN_MEALS: list[dict] = [
    {"meal_type": "snack", "description": "Yogurt griego con nueces y miel", "est_calories": 250, "est_protein_g": 20, "est_carbs_g": 18, "est_fats_g": 12},
    {"meal_type": "dinner", "description": "Salmon a la plancha con verduras salteadas", "est_calories": 450, "est_protein_g": 38, "est_carbs_g": 15, "est_fats_g": 22},
    {"meal_type": "snack", "description": "Batido de proteina con platano", "est_calories": 200, "est_protein_g": 30, "est_carbs_g": 25, "est_fats_g": 3},
    {"meal_type": "lunch", "description": "Pechuga de pollo con arroz integral y ensalada", "est_calories": 500, "est_protein_g": 42, "est_carbs_g": 45, "est_fats_g": 12},
    {"meal_type": "snack", "description": "Huevos duros con tostada integral", "est_calories": 220, "est_protein_g": 18, "est_carbs_g": 15, "est_fats_g": 10},
    {"meal_type": "dinner", "description": "Atun sellado con quinoa y brocoli", "est_calories": 420, "est_protein_g": 40, "est_carbs_g": 35, "est_fats_g": 10},
    {"meal_type": "snack", "description": "Cottage cheese con frutas y granola", "est_calories": 230, "est_protein_g": 22, "est_carbs_g": 25, "est_fats_g": 6},
    {"meal_type": "breakfast", "description": "Omelette de claras con espinaca y queso", "est_calories": 280, "est_protein_g": 28, "est_carbs_g": 5, "est_fats_g": 14},
]

BALANCED_MEALS: list[dict] = [
    {"meal_type": "lunch", "description": "Bowl de pollo, arroz, frijoles y aguacate", "est_calories": 550, "est_protein_g": 35, "est_carbs_g": 55, "est_fats_g": 18},
    {"meal_type": "dinner", "description": "Pasta integral con carne molida y salsa de tomate", "est_calories": 480, "est_protein_g": 28, "est_carbs_g": 52, "est_fats_g": 14},
    {"meal_type": "breakfast", "description": "Avena con platano, mantequilla de mani y miel", "est_calories": 400, "est_protein_g": 15, "est_carbs_g": 55, "est_fats_g": 14},
    {"meal_type": "snack", "description": "Sandwich integral de pavo con aguacate", "est_calories": 350, "est_protein_g": 22, "est_carbs_g": 30, "est_fats_g": 14},
    {"meal_type": "lunch", "description": "Tacos de pescado con ensalada de col", "est_calories": 420, "est_protein_g": 30, "est_carbs_g": 35, "est_fats_g": 16},
    {"meal_type": "dinner", "description": "Pollo al horno con papa asada y ensalada", "est_calories": 500, "est_protein_g": 38, "est_carbs_g": 42, "est_fats_g": 14},
    {"meal_type": "snack", "description": "Wrap de hummus con verduras frescas", "est_calories": 280, "est_protein_g": 10, "est_carbs_g": 35, "est_fats_g": 12},
    {"meal_type": "breakfast", "description": "Tostada con huevo, aguacate y tomate", "est_calories": 320, "est_protein_g": 16, "est_carbs_g": 28, "est_fats_g": 16},
]

LIGHT_MEALS: list[dict] = [
    {"meal_type": "snack", "description": "Ensalada verde con limon y semillas", "est_calories": 120, "est_protein_g": 4, "est_carbs_g": 10, "est_fats_g": 7},
    {"meal_type": "dinner", "description": "Sopa de verduras con pollo desmenuzado", "est_calories": 200, "est_protein_g": 18, "est_carbs_g": 15, "est_fats_g": 6},
    {"meal_type": "snack", "description": "Manzana con mantequilla de almendra", "est_calories": 180, "est_protein_g": 5, "est_carbs_g": 22, "est_fats_g": 9},
    {"meal_type": "dinner", "description": "Filete de pescado al vapor con limon y espinacas", "est_calories": 220, "est_protein_g": 30, "est_carbs_g": 5, "est_fats_g": 8},
    {"meal_type": "snack", "description": "Pepino con hummus", "est_calories": 100, "est_protein_g": 4, "est_carbs_g": 10, "est_fats_g": 5},
    {"meal_type": "dinner", "description": "Ensalada de atun con verduras mixtas", "est_calories": 250, "est_protein_g": 25, "est_carbs_g": 12, "est_fats_g": 10},
    {"meal_type": "snack", "description": "Te verde con un punado de almendras", "est_calories": 90, "est_protein_g": 3, "est_carbs_g": 4, "est_fats_g": 7},
    {"meal_type": "breakfast", "description": "Yogurt natural con fresas", "est_calories": 150, "est_protein_g": 10, "est_carbs_g": 18, "est_fats_g": 4},
]

CALORIE_DENSE_MEALS: list[dict] = [
    {"meal_type": "lunch", "description": "Burrito de carne con arroz, frijoles y queso", "est_calories": 650, "est_protein_g": 35, "est_carbs_g": 60, "est_fats_g": 25},
    {"meal_type": "dinner", "description": "Pasta con salmon, crema y brocoli", "est_calories": 580, "est_protein_g": 32, "est_carbs_g": 50, "est_fats_g": 24},
    {"meal_type": "breakfast", "description": "Pancakes de avena con platano y mantequilla de mani", "est_calories": 500, "est_protein_g": 18, "est_carbs_g": 60, "est_fats_g": 20},
    {"meal_type": "snack", "description": "Smoothie de platano, avena, leche y mantequilla de mani", "est_calories": 400, "est_protein_g": 16, "est_carbs_g": 50, "est_fats_g": 14},
    {"meal_type": "lunch", "description": "Arroz con pollo, platano maduro y ensalada", "est_calories": 600, "est_protein_g": 38, "est_carbs_g": 65, "est_fats_g": 16},
    {"meal_type": "dinner", "description": "Carne asada con papas fritas y guacamole", "est_calories": 700, "est_protein_g": 40, "est_carbs_g": 50, "est_fats_g": 32},
]

HIGH_FIBER_MEALS: list[dict] = [
    {"meal_type": "lunch", "description": "Ensalada de lentejas con espinaca y tomate", "est_calories": 320, "est_protein_g": 18, "est_carbs_g": 40, "est_fats_g": 8, "est_fiber_g": 12},
    {"meal_type": "snack", "description": "Manzana con mantequilla de almendra y semillas de chia", "est_calories": 220, "est_protein_g": 6, "est_carbs_g": 28, "est_fats_g": 10, "est_fiber_g": 8},
    {"meal_type": "dinner", "description": "Bowl de quinoa con brocoli, garbanzos y aguacate", "est_calories": 450, "est_protein_g": 18, "est_carbs_g": 50, "est_fats_g": 16, "est_fiber_g": 14},
    {"meal_type": "breakfast", "description": "Avena con frutas del bosque y semillas de linaza", "est_calories": 300, "est_protein_g": 10, "est_carbs_g": 48, "est_fats_g": 8, "est_fiber_g": 10},
    {"meal_type": "snack", "description": "Hummus con palitos de zanahoria y apio", "est_calories": 180, "est_protein_g": 6, "est_carbs_g": 20, "est_fats_g": 8, "est_fiber_g": 7},
    {"meal_type": "lunch", "description": "Sopa de frijoles negros con arroz integral", "est_calories": 380, "est_protein_g": 16, "est_carbs_g": 55, "est_fats_g": 6, "est_fiber_g": 15},
    {"meal_type": "dinner", "description": "Vegetales asados con camote y tahini", "est_calories": 350, "est_protein_g": 10, "est_carbs_g": 45, "est_fats_g": 14, "est_fiber_g": 11},
]


# ---------------------------------------------------------------------------
# Motivation messages (Spanish)
# ---------------------------------------------------------------------------

MOTIVATION_DEFICIT = [
    "Con estas comidas llegas al {pct}% de tu meta. Tu puedes!",
    "Solo te faltan {cal} kcal. Estas mas cerca de lo que crees!",
    "Cada comida cuenta. Con este plan llegas a tu objetivo!",
]

MOTIVATION_EXCESS = [
    "Modera las proximas comidas y manana sera un nuevo dia.",
    "No te preocupes, un dia no define tu progreso. Sigue adelante!",
    "Elige opciones mas ligeras el resto del dia. Tu puedes ajustar!",
]

MOTIVATION_ON_TRACK = [
    "Vas excelente! Sigue asi para cerrar el dia perfecto.",
    "Tu constancia esta dando resultados. Mantente firme!",
    "Estas en el camino correcto. Un snack saludable cierra tu dia!",
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _select_meals(
    pool: list[dict],
    remaining_calories: int,
    remaining_protein: int,
    count: int = 3,
) -> list[dict]:
    """Select up to `count` meals from the pool that best fill the calorie gap."""
    if not pool:
        return []

    selected: list[dict] = []
    cal_left = remaining_calories
    used_indices: set[int] = set()

    for _ in range(count):
        if cal_left <= 0:
            break

        best_idx = -1
        best_diff = float("inf")

        for i, meal in enumerate(pool):
            if i in used_indices:
                continue
            target_per_meal = cal_left / (count - len(selected))
            diff = abs(meal["est_calories"] - target_per_meal)
            # Prefer meals that don't overshoot remaining
            if meal["est_calories"] <= cal_left + 100:
                diff -= 50  # bonus for fitting
            if diff < best_diff:
                best_diff = diff
                best_idx = i

        if best_idx == -1:
            # Just pick first unused
            for i in range(len(pool)):
                if i not in used_indices:
                    best_idx = i
                    break

        if best_idx == -1:
            break

        used_indices.add(best_idx)
        selected.append({
            "meal_type": pool[best_idx]["meal_type"],
            "description": pool[best_idx]["description"],
            "est_calories": pool[best_idx]["est_calories"],
            "est_protein_g": pool[best_idx]["est_protein_g"],
        })
        cal_left -= pool[best_idx]["est_calories"]

    return selected


def _get_motivation(status: str, remaining_cal: int, target_cal: int) -> str:
    """Return a motivation message based on status."""
    import hashlib
    from datetime import date as _date

    # Use date as seed for daily variation
    day_hash = int(hashlib.md5(str(_date.today()).encode()).hexdigest()[:8], 16)

    if status == "deficit":
        msgs = MOTIVATION_DEFICIT
        idx = day_hash % len(msgs)
        pct = max(0, min(100, round((1 - remaining_cal / target_cal) * 100))) if target_cal > 0 else 0
        return msgs[idx].format(pct=pct, cal=abs(remaining_cal))
    elif status == "excess":
        msgs = MOTIVATION_EXCESS
        idx = day_hash % len(msgs)
        return msgs[idx]
    else:
        msgs = MOTIVATION_ON_TRACK
        idx = day_hash % len(msgs)
        return msgs[idx]


def _build_water_recommendation(water_ml: float) -> Optional[dict]:
    """Build water recommendation if below 2000ml."""
    if water_ml >= 2000:
        return None

    remaining_ml = round(2000 - water_ml)
    glasses = max(1, round(remaining_ml / 250))

    return {
        "current_water_ml": round(water_ml),
        "target_water_ml": 2000,
        "remaining_water_ml": remaining_ml,
        "message": f"Te faltan {remaining_ml} ml de agua. Intenta tomar un vaso cada hora.",
        "glasses_remaining": glasses,
    }


# ---------------------------------------------------------------------------
# 24-hour recovery plan (Item 148)
# ---------------------------------------------------------------------------

async def generate_24h_recovery_plan(user_id: int, session: AsyncSession) -> dict:
    """Generate a simple 24-hour recovery plan based on current risk status."""
    goals = await _get_goals(user_id, session)
    today = date.today()
    totals = await _get_day_totals(user_id, today, session)
    water_ml = await _get_water_ml(user_id, today, session)

    target_cal = goals["calories"]
    target_protein = goals["protein_g"]
    target_carbs = goals["carbs_g"]
    target_fats = goals["fat_g"]

    logged_cal = int(totals["calories"])
    logged_protein = int(totals["protein_g"])
    logged_carbs = int(totals["carbs_g"])
    logged_fats = int(totals["fat_g"])

    remaining_cal = target_cal - logged_cal
    remaining_protein = target_protein - logged_protein
    remaining_carbs = target_carbs - logged_carbs
    remaining_fats = target_fats - logged_fats

    # Determine status
    ratio = logged_cal / target_cal if target_cal > 0 else 0
    if ratio > 1.10:
        status = "excess"
    elif ratio >= 0.85:
        status = "on_track"
    else:
        status = "deficit"

    # Select appropriate meal pool based on needs
    if status == "excess":
        meal_pool = LIGHT_MEALS
    elif remaining_protein > 30 and remaining_cal > 300:
        # Prioritize protein-rich meals
        meal_pool = HIGH_PROTEIN_MEALS
    elif remaining_cal > 500:
        # Need significant calories — use calorie-dense meals
        meal_pool = CALORIE_DENSE_MEALS
    elif remaining_cal > 200:
        meal_pool = BALANCED_MEALS
    else:
        meal_pool = LIGHT_MEALS

    suggested_meals = _select_meals(
        pool=meal_pool,
        remaining_calories=max(0, remaining_cal),
        remaining_protein=max(0, remaining_protein),
        count=3,
    )

    motivation = _get_motivation(status, remaining_cal, target_cal)

    # Water recommendation (Item 143)
    water_rec = _build_water_recommendation(water_ml)

    result: dict = {
        "horizon": "24h",
        "status": status,
        "targets": {
            "calories": target_cal,
            "protein_g": target_protein,
            "carbs_g": target_carbs,
            "fats_g": target_fats,
        },
        "logged": {
            "calories": logged_cal,
            "protein_g": logged_protein,
            "carbs_g": logged_carbs,
            "fats_g": logged_fats,
        },
        "remaining_calories": max(0, remaining_cal),
        "remaining_protein_g": max(0, remaining_protein),
        "remaining_carbs_g": max(0, remaining_carbs),
        "remaining_fats_g": max(0, remaining_fats),
        "suggested_meals": suggested_meals,
        "motivation": motivation,
    }

    if water_rec is not None:
        result["water_recommendation"] = water_rec

    return result


# ---------------------------------------------------------------------------
# 3-day recovery plan (Item 149)
# ---------------------------------------------------------------------------

async def _get_multi_day_totals(
    user_id: int,
    start_date: date,
    end_date: date,
    session: AsyncSession,
) -> dict:
    """Aggregate food log totals across a date range."""
    day_start = datetime.combine(start_date, dt_time.min)
    day_end = datetime.combine(end_date, dt_time.max)

    result = await session.execute(
        select(
            func.coalesce(func.sum(AIFoodLog.calories), 0.0).label("calories"),
            func.coalesce(func.sum(AIFoodLog.protein_g), 0.0).label("protein_g"),
            func.coalesce(func.sum(AIFoodLog.fats_g), 0.0).label("fat_g"),
            func.coalesce(func.sum(AIFoodLog.carbs_g), 0.0).label("carbs_g"),
            func.count(AIFoodLog.id).label("meal_count"),
        ).where(
            AIFoodLog.user_id == user_id,
            AIFoodLog.logged_at >= day_start,
            AIFoodLog.logged_at <= day_end,
            AIFoodLog.deleted_at.is_(None),
        )
    )
    row = result.one()
    return {
        "calories": float(row.calories),
        "protein_g": float(row.protein_g),
        "fat_g": float(row.fat_g),
        "carbs_g": float(row.carbs_g),
        "meal_count": int(row.meal_count),
    }


async def generate_3day_recovery_plan(user_id: int, session: AsyncSession) -> dict:
    """Generate a 3-day recovery plan based on accumulated deficit."""
    goals = await _get_goals(user_id, session)
    today = date.today()
    three_days_ago = today - timedelta(days=2)  # today + 2 previous days = 3 days

    # Get totals for the last 3 days
    multi_day_totals = await _get_multi_day_totals(user_id, three_days_ago, today, session)

    # 3-day targets
    target_cal_3d = goals["calories"] * 3
    target_protein_3d = goals["protein_g"] * 3
    target_carbs_3d = goals["carbs_g"] * 3
    target_fats_3d = goals["fat_g"] * 3

    logged_cal_3d = int(multi_day_totals["calories"])
    logged_protein_3d = int(multi_day_totals["protein_g"])

    deficit_cal = target_cal_3d - logged_cal_3d
    deficit_protein = target_protein_3d - logged_protein_3d

    # Determine overall status
    ratio_3d = logged_cal_3d / target_cal_3d if target_cal_3d > 0 else 0
    if ratio_3d > 1.10:
        status = "excess"
    elif ratio_3d >= 0.85:
        status = "on_track"
    else:
        status = "deficit"

    # Distribute recovery across 3 days (today + next 2 days)
    # Day 1 (today): fill 40% of deficit
    # Day 2: fill 35% of deficit
    # Day 3: fill 25% of deficit
    recovery_distribution = [0.40, 0.35, 0.25]
    daily_plans: list[dict] = []

    # Get today's current totals for day 1 adjustment
    today_totals = await _get_day_totals(user_id, today, session)
    today_logged_cal = int(today_totals["calories"])
    today_remaining = goals["calories"] - today_logged_cal

    for day_idx in range(3):
        target_date = today + timedelta(days=day_idx)
        fraction = recovery_distribution[day_idx]
        extra_recovery_cal = max(0, int(deficit_cal * fraction / 3)) if status == "deficit" else 0

        if day_idx == 0:
            # Today: remaining from daily goal + recovery portion
            day_cal_target = max(0, today_remaining) + extra_recovery_cal
            day_protein_target = max(0, goals["protein_g"] - int(today_totals["protein_g"])) + int(max(0, deficit_protein) * fraction / 3)
        else:
            # Future days: full daily goal + recovery portion
            day_cal_target = goals["calories"] + extra_recovery_cal
            day_protein_target = goals["protein_g"] + int(max(0, deficit_protein) * fraction / 3)

        # Cap recovery so we don't suggest unreasonable amounts
        day_cal_target = min(day_cal_target, int(goals["calories"] * 1.3))

        # Select meals for this day
        if status == "excess":
            pool = LIGHT_MEALS
            day_cal_target = min(day_cal_target, int(goals["calories"] * 0.85))
        elif day_protein_target > goals["protein_g"] * 0.5:
            pool = HIGH_PROTEIN_MEALS
        elif day_cal_target > goals["calories"]:
            pool = CALORIE_DENSE_MEALS
        else:
            pool = BALANCED_MEALS

        meals = _select_meals(
            pool=pool,
            remaining_calories=max(0, day_cal_target),
            remaining_protein=max(0, day_protein_target),
            count=3,
        )

        daily_plans.append({
            "date": str(target_date),
            "day_label": f"Dia {day_idx + 1}",
            "calorie_target": day_cal_target,
            "protein_target_g": day_protein_target,
            "suggested_meals": meals,
        })

    motivation = _get_motivation(status, max(0, deficit_cal), target_cal_3d)

    # Water recommendation (Item 143)
    water_ml = await _get_water_ml(user_id, today, session)
    water_rec = _build_water_recommendation(water_ml)

    result: dict = {
        "horizon": "3d",
        "status": status,
        "period": {
            "start": str(three_days_ago),
            "end": str(today),
        },
        "targets_3d": {
            "calories": target_cal_3d,
            "protein_g": target_protein_3d,
            "carbs_g": target_carbs_3d,
            "fats_g": target_fats_3d,
        },
        "logged_3d": {
            "calories": logged_cal_3d,
            "protein_g": logged_protein_3d,
        },
        "deficit_calories": max(0, deficit_cal),
        "deficit_protein_g": max(0, deficit_protein),
        "daily_plans": daily_plans,
        "motivation": motivation,
    }

    if water_rec is not None:
        result["water_recommendation"] = water_rec

    return result


# ---------------------------------------------------------------------------
# All meal pools export (for shopping list service)
# ---------------------------------------------------------------------------

ALL_MEAL_POOLS: list[list[dict]] = [
    HIGH_PROTEIN_MEALS, BALANCED_MEALS, LIGHT_MEALS, CALORIE_DENSE_MEALS, HIGH_FIBER_MEALS,
]


# ---------------------------------------------------------------------------
# Smart meal suggestion (Item 136)
# ---------------------------------------------------------------------------

async def get_smart_meal_suggestion(user_id: int, session: AsyncSession) -> dict:
    """Analyze today's logged meals and remaining macros, return a single best-fit meal."""
    goals = await _get_goals(user_id, session)
    today = date.today()
    totals = await _get_day_totals(user_id, today, session)

    target_cal = goals["calories"]
    target_protein = goals["protein_g"]
    target_fiber = 25  # general daily recommendation

    logged_cal = int(totals["calories"])
    logged_protein = int(totals["protein_g"])

    remaining_cal = max(0, target_cal - logged_cal)
    remaining_protein = max(0, target_protein - logged_protein)

    # Estimate logged fiber from today's food logs
    day_start = datetime.combine(today, dt_time.min)
    day_end = datetime.combine(today, dt_time.max)
    fiber_result = await session.execute(
        select(
            func.coalesce(func.sum(AIFoodLog.fiber_g), 0.0).label("fiber_g"),
        ).where(
            AIFoodLog.user_id == user_id,
            AIFoodLog.logged_at >= day_start,
            AIFoodLog.logged_at <= day_end,
            AIFoodLog.deleted_at.is_(None),
        )
    )
    logged_fiber = float(fiber_result.one().fiber_g)
    remaining_fiber = max(0, target_fiber - logged_fiber)

    # Determine which gap is largest proportionally
    protein_gap_pct = remaining_protein / target_protein if target_protein > 0 else 0
    cal_gap_pct = remaining_cal / target_cal if target_cal > 0 else 0
    fiber_gap_pct = remaining_fiber / target_fiber if target_fiber > 0 else 0

    if protein_gap_pct >= cal_gap_pct and protein_gap_pct >= fiber_gap_pct:
        pool = HIGH_PROTEIN_MEALS
        reason = "Te falta proteina. Esta comida te ayuda a llegar a tu meta."
    elif cal_gap_pct >= fiber_gap_pct:
        pool = CALORIE_DENSE_MEALS
        reason = "Necesitas mas calorias hoy. Esta opcion te acerca a tu objetivo."
    else:
        pool = HIGH_FIBER_MEALS
        reason = "Te falta fibra. Esta opcion es rica en vegetales y fibra."

    # Pick the single meal that best fits remaining calories
    best_meal = pool[0]
    best_diff = float("inf")
    for meal in pool:
        diff = abs(meal["est_calories"] - remaining_cal) if remaining_cal > 0 else meal["est_calories"]
        if diff < best_diff:
            best_diff = diff
            best_meal = meal

    return {
        "suggestion": {
            "meal_type": best_meal["meal_type"],
            "description": best_meal["description"],
            "est_calories": best_meal["est_calories"],
            "est_protein_g": best_meal["est_protein_g"],
        },
        "reason": reason,
        "remaining": {
            "calories": remaining_cal,
            "protein_g": remaining_protein,
            "fiber_g": round(remaining_fiber, 1),
        },
        "logged_today": {
            "calories": logged_cal,
            "protein_g": logged_protein,
            "fiber_g": round(logged_fiber, 1),
        },
    }
