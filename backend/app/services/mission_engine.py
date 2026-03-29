"""
Mission Engine — Daily mission assignment and risk-aware personalization.

AI TOKEN COST: ZERO. This entire module is 100% rule-based.
Missions are assigned daily based on user state and risk level.
No LLM / AI API calls are made anywhere in this file.

Mission templates cover:
- Meal registration (easy)
- Calorie/protein targets (medium)
- Quality and timing challenges (hard)
- Comeback missions for at-risk users
"""

from __future__ import annotations

import logging
import random
from copy import deepcopy
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..models.ai_food_log import AIFoodLog
from ..models.progress import (
    DailyMission,
    UserDailyMissionStatus,
    UserProgressProfile,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Mission template pool (Spanish, all rule-based)
# ---------------------------------------------------------------------------

MISSION_TEMPLATES: list[dict] = [
    # --- EASY ---
    {
        "code": "register_1_meal",
        "name": "Primer registro",
        "description": "Registra al menos 1 comida hoy",
        "difficulty": "easy",
        "condition_type": "register_meal",
        "condition_value": 1,
        "xp_reward": 10,
        "coins_reward": 5,
        "target_audience": "all",
    },
    {
        "code": "register_breakfast",
        "name": "Desayuno registrado",
        "description": "Registra tu desayuno",
        "difficulty": "easy",
        "condition_type": "register_meal",
        "condition_value": 1,
        "xp_reward": 10,
        "coins_reward": 5,
        "target_audience": "all",
    },
    {
        "code": "register_any_food",
        "name": "Registra algo",
        "description": "Registra cualquier alimento, sin importar que sea",
        "difficulty": "easy",
        "condition_type": "register_meal",
        "condition_value": 1,
        "xp_reward": 10,
        "coins_reward": 5,
        "target_audience": "at_risk",
    },
    {
        "code": "log_water",
        "name": "Hidratacion",
        "description": "Registra al menos 1 vaso de agua",
        "difficulty": "easy",
        "condition_type": "register_meal",
        "condition_value": 1,
        "xp_reward": 5,
        "coins_reward": 3,
        "target_audience": "all",
    },
    # --- MEDIUM ---
    {
        "code": "register_3_meals",
        "name": "Dia completo",
        "description": "Registra 3 comidas hoy",
        "difficulty": "medium",
        "condition_type": "register_3_meals",
        "condition_value": 3,
        "xp_reward": 25,
        "coins_reward": 10,
        "target_audience": "active",
    },
    {
        "code": "hit_calories_80",
        "name": "Meta calorica",
        "description": "Llega al 80% de tu meta calorica",
        "difficulty": "medium",
        "condition_type": "hit_calories",
        "condition_value": 80,
        "xp_reward": 20,
        "coins_reward": 10,
        "target_audience": "active",
    },
    {
        "code": "hit_protein_90",
        "name": "Proteina al dia",
        "description": "Cumple el 90% de tu meta de proteina",
        "difficulty": "medium",
        "condition_type": "hit_protein",
        "condition_value": 90,
        "xp_reward": 20,
        "coins_reward": 10,
        "target_audience": "active",
    },
    {
        "code": "register_before_noon",
        "name": "Madrugador",
        "description": "Registra una comida antes del mediodia",
        "difficulty": "medium",
        "condition_type": "register_before_noon",
        "condition_value": 1,
        "xp_reward": 15,
        "coins_reward": 8,
        "target_audience": "all",
    },
    {
        "code": "keep_improving",
        "name": "Sigue mejorando",
        "description": "Mantente en tu camino de mejora hoy",
        "difficulty": "medium",
        "condition_type": "register_meal",
        "condition_value": 2,
        "xp_reward": 20,
        "coins_reward": 10,
        "target_audience": "improving",
    },
    # --- HARD ---
    {
        "code": "complete_day_balanced",
        "name": "Dia equilibrado",
        "description": "Registra 3 comidas y cumple el 80% de calorias y proteina",
        "difficulty": "hard",
        "condition_type": "complete_day",
        "condition_value": 1,
        "xp_reward": 40,
        "coins_reward": 20,
        "target_audience": "active",
    },
    {
        "code": "hit_all_macros",
        "name": "Macro maestro",
        "description": "Cumple el 80% de calorias, proteina, carbos y grasas",
        "difficulty": "hard",
        "condition_type": "hit_calories",
        "condition_value": 80,
        "xp_reward": 50,
        "coins_reward": 25,
        "target_audience": "active",
    },
    {
        "code": "quality_day",
        "name": "Dia de calidad",
        "description": "Logra un puntaje de calidad alimentaria mayor a 70",
        "difficulty": "hard",
        "condition_type": "hit_calories",
        "condition_value": 70,
        "xp_reward": 40,
        "coins_reward": 20,
        "target_audience": "active",
    },
    # --- COMEBACK ---
    {
        "code": "comeback_1_meal",
        "name": "Volver al juego",
        "description": "Solo registra 1 comida. Eso es suficiente para empezar.",
        "difficulty": "easy",
        "condition_type": "register_meal",
        "condition_value": 1,
        "xp_reward": 15,
        "coins_reward": 10,
        "target_audience": "at_risk",
    },
    {
        "code": "comeback_simple",
        "name": "Un paso a la vez",
        "description": "Registra lo que sea. Tu plan te espera.",
        "difficulty": "easy",
        "condition_type": "register_meal",
        "condition_value": 1,
        "xp_reward": 15,
        "coins_reward": 10,
        "target_audience": "at_risk",
    },
    {
        "code": "comeback_photo",
        "name": "Foto rapida",
        "description": "Saca una foto de tu comida. Solo eso.",
        "difficulty": "easy",
        "condition_type": "register_meal",
        "condition_value": 1,
        "xp_reward": 15,
        "coins_reward": 10,
        "target_audience": "at_risk",
    },
]


# ---------------------------------------------------------------------------
# Risk-aware mission personalization
# ---------------------------------------------------------------------------

def personalize_missions_for_risk(
    base_missions: list[dict], risk_status: str
) -> list[dict]:
    """
    Adjust missions based on user's current risk status.

    Rules:
    - critical: All missions become easy ("just register something")
    - high_risk: Replace hard mission with comeback mission
    - risk: Keep 1 easy + 1 medium + 1 easy
    - optimal: Allow hard missions, include quality challenges
    - at_risk_but_improving: Include "keep improving" mission as bonus
    """
    if not base_missions:
        base_missions = _get_default_missions()

    if risk_status == "critical":
        # All missions become easy comeback missions
        comeback = [
            m for m in MISSION_TEMPLATES
            if m["target_audience"] == "at_risk" and m["difficulty"] == "easy"
        ]
        if len(comeback) >= 3:
            return [deepcopy(m) for m in random.sample(comeback, 3)]
        return [deepcopy(m) for m in comeback] + [
            deepcopy(m)
            for m in MISSION_TEMPLATES
            if m["difficulty"] == "easy" and m["target_audience"] == "all"
        ][:3 - len(comeback)]

    if risk_status == "high_risk":
        # Replace hard with comeback, keep easy + medium
        easy = [m for m in base_missions if m["difficulty"] == "easy"]
        medium = [m for m in base_missions if m["difficulty"] == "medium"]
        comeback = [
            m for m in MISSION_TEMPLATES if m["target_audience"] == "at_risk"
        ]

        result = []
        if easy:
            result.append(deepcopy(easy[0]))
        if medium:
            result.append(deepcopy(medium[0]))
        if comeback:
            result.append(deepcopy(random.choice(comeback)))
        elif easy:
            result.append(deepcopy(easy[-1] if len(easy) > 1 else easy[0]))

        return result[:3]

    if risk_status == "risk":
        # 1 easy + 1 medium + 1 easy
        easy_pool = [
            m for m in MISSION_TEMPLATES
            if m["difficulty"] == "easy" and m["target_audience"] in ("all", "active")
        ]
        medium_pool = [
            m for m in MISSION_TEMPLATES
            if m["difficulty"] == "medium" and m["target_audience"] in ("all", "active")
        ]

        result = []
        if easy_pool:
            chosen = random.sample(easy_pool, min(2, len(easy_pool)))
            result.append(deepcopy(chosen[0]))
        if medium_pool:
            result.append(deepcopy(random.choice(medium_pool)))
        if len(result) < 3 and easy_pool:
            remaining = [m for m in easy_pool if m not in result]
            if remaining:
                result.append(deepcopy(remaining[0]))
            elif len(easy_pool) > 1:
                result.append(deepcopy(easy_pool[1]))

        return result[:3]

    if risk_status in ("optimal", "low_adherence"):
        # Allow hard missions + quality challenges
        easy_pool = [
            m for m in MISSION_TEMPLATES
            if m["difficulty"] == "easy" and m["target_audience"] in ("all", "active")
        ]
        medium_pool = [
            m for m in MISSION_TEMPLATES
            if m["difficulty"] == "medium" and m["target_audience"] in ("all", "active")
        ]
        hard_pool = [
            m for m in MISSION_TEMPLATES
            if m["difficulty"] == "hard" and m["target_audience"] == "active"
        ]

        result = []
        if easy_pool:
            result.append(deepcopy(random.choice(easy_pool)))
        if medium_pool:
            result.append(deepcopy(random.choice(medium_pool)))
        if hard_pool:
            result.append(deepcopy(random.choice(hard_pool)))
        elif medium_pool and len(medium_pool) > 1:
            result.append(deepcopy(medium_pool[-1]))

        return result[:3]

    if risk_status == "at_risk_but_improving":
        # Normal missions + "keep improving" bonus
        personalized = personalize_missions_for_risk(base_missions, "risk")
        improving_mission = next(
            (m for m in MISSION_TEMPLATES if m["code"] == "keep_improving"),
            None,
        )
        if improving_mission and len(personalized) < 4:
            personalized.append(deepcopy(improving_mission))
        return personalized

    # Default: return base missions unchanged
    return [deepcopy(m) for m in base_missions[:3]]


def _get_default_missions() -> list[dict]:
    """Return a default set of 3 missions (1 easy, 1 medium, 1 hard)."""
    easy = [m for m in MISSION_TEMPLATES if m["difficulty"] == "easy" and m["target_audience"] == "all"]
    medium = [m for m in MISSION_TEMPLATES if m["difficulty"] == "medium" and m["target_audience"] in ("all", "active")]
    hard = [m for m in MISSION_TEMPLATES if m["difficulty"] == "hard"]

    result = []
    if easy:
        result.append(easy[0])
    if medium:
        result.append(medium[0])
    if hard:
        result.append(hard[0])
    return result


# ---------------------------------------------------------------------------
# Assign daily missions for a user
# ---------------------------------------------------------------------------

async def assign_daily_missions(
    user_id: int, risk_status: str, session: AsyncSession
) -> list[dict]:
    """
    Assign 3 daily missions to a user based on their risk status.
    Returns the assigned missions.
    """
    today = date.today()

    # Check if missions already assigned today
    result = await session.execute(
        select(func.count(UserDailyMissionStatus.id)).where(
            UserDailyMissionStatus.user_id == user_id,
            UserDailyMissionStatus.date == today,
        )
    )
    existing = result.scalar() or 0
    if existing > 0:
        # Already assigned, return current missions
        return await get_today_missions(user_id, session)

    # Get personalized missions
    base = _get_default_missions()
    personalized = personalize_missions_for_risk(base, risk_status)

    assigned = []
    for mission_data in personalized[:3]:
        # Find or create the mission definition in DB
        result = await session.execute(
            select(DailyMission).where(DailyMission.code == mission_data["code"])
        )
        mission = result.scalars().first()

        if not mission:
            mission = DailyMission(
                code=mission_data["code"],
                name=mission_data["name"],
                description=mission_data["description"],
                xp_reward=mission_data["xp_reward"],
                coins_reward=mission_data["coins_reward"],
                condition_type=mission_data["condition_type"],
                condition_value=mission_data["condition_value"],
                difficulty=mission_data["difficulty"],
                target_audience=mission_data.get("target_audience", "all"),
            )
            session.add(mission)
            await session.flush()

        # Create user mission status
        status = UserDailyMissionStatus(
            user_id=user_id,
            mission_id=mission.id,
            date=today,
            completed=False,
            progress_value=0,
        )
        session.add(status)

        assigned.append({
            "code": mission.code,
            "name": mission.name,
            "description": mission.description,
            "difficulty": mission.difficulty,
            "xp_reward": mission.xp_reward,
            "coins_reward": mission.coins_reward,
            "completed": False,
            "progress_value": 0,
        })

    await session.flush()
    return assigned


# ---------------------------------------------------------------------------
# Get today's missions for a user
# ---------------------------------------------------------------------------

async def get_today_missions(
    user_id: int, session: AsyncSession
) -> list[dict]:
    """Return today's missions with completion status."""
    today = date.today()
    result = await session.execute(
        select(UserDailyMissionStatus, DailyMission)
        .join(DailyMission, DailyMission.id == UserDailyMissionStatus.mission_id)
        .where(
            UserDailyMissionStatus.user_id == user_id,
            UserDailyMissionStatus.date == today,
        )
    )
    rows = list(result.all())

    missions = []
    for status, mission in rows:
        missions.append({
            "code": mission.code,
            "name": mission.name,
            "description": mission.description,
            "difficulty": mission.difficulty,
            "xp_reward": mission.xp_reward,
            "coins_reward": mission.coins_reward,
            "completed": status.completed,
            "progress_value": status.progress_value,
        })

    return missions


# ---------------------------------------------------------------------------
# Check and update mission progress after a meal is logged
# ---------------------------------------------------------------------------

async def update_mission_progress(
    user_id: int, session: AsyncSession
) -> list[dict]:
    """
    Check if any of today's missions were completed by the latest food log.
    Returns list of newly completed missions.
    """
    today = date.today()
    today_start = datetime.combine(today, datetime.min.time())
    today_end = datetime.combine(today, datetime.max.time())

    # Count today's meals
    meal_count_result = await session.execute(
        select(func.count(AIFoodLog.id)).where(
            AIFoodLog.user_id == user_id,
            AIFoodLog.logged_at >= today_start,
            AIFoodLog.logged_at <= today_end,
            AIFoodLog.deleted_at.is_(None),
        )
    )
    today_meal_count = meal_count_result.scalar() or 0

    # Get today's uncompleted missions
    result = await session.execute(
        select(UserDailyMissionStatus, DailyMission)
        .join(DailyMission, DailyMission.id == UserDailyMissionStatus.mission_id)
        .where(
            UserDailyMissionStatus.user_id == user_id,
            UserDailyMissionStatus.date == today,
            UserDailyMissionStatus.completed == False,
        )
    )
    uncompleted = list(result.all())

    newly_completed = []
    for status, mission in uncompleted:
        completed = False

        if mission.condition_type == "register_meal":
            status.progress_value = min(today_meal_count, mission.condition_value)
            if today_meal_count >= mission.condition_value:
                completed = True

        elif mission.condition_type == "register_3_meals":
            status.progress_value = min(today_meal_count, 3)
            if today_meal_count >= 3:
                completed = True

        elif mission.condition_type == "register_before_noon":
            before_noon_result = await session.execute(
                select(func.count(AIFoodLog.id)).where(
                    AIFoodLog.user_id == user_id,
                    AIFoodLog.logged_at >= today_start,
                    AIFoodLog.logged_at <= datetime.combine(
                        today, datetime.min.time().replace(hour=12)
                    ),
                    AIFoodLog.deleted_at.is_(None),
                )
            )
            before_noon = before_noon_result.scalar() or 0
            if before_noon > 0:
                status.progress_value = 1
                completed = True

        if completed:
            status.completed = True
            status.completed_at = datetime.now(timezone.utc)
            session.add(status)
            newly_completed.append({
                "code": mission.code,
                "name": mission.name,
                "description": mission.description,
                "xp_reward": mission.xp_reward,
                "coins_reward": mission.coins_reward,
            })
        else:
            session.add(status)

    await session.flush()
    return newly_completed
