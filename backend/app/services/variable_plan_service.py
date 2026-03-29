"""
Variable Calorie Plan Service — Adjusts daily nutrition goals by day type.

Supports rest, training, and refeed day types with specific multipliers
for calories and carbs.
"""

from __future__ import annotations

import logging
from typing import Optional

from sqlmodel.ext.asyncio.session import AsyncSession

from .nutrition_risk_service import _get_goals

logger = logging.getLogger(__name__)


DAY_TYPES: dict[str, dict] = {
    "rest": {
        "calorie_multiplier": 0.85,
        "carb_multiplier": 0.7,
        "protein_multiplier": 1.0,
        "fat_multiplier": 1.0,
        "label": "Dia de descanso",
    },
    "training": {
        "calorie_multiplier": 1.15,
        "carb_multiplier": 1.3,
        "protein_multiplier": 1.0,
        "fat_multiplier": 1.0,
        "label": "Dia de entrenamiento",
    },
    "refeed": {
        "calorie_multiplier": 1.25,
        "carb_multiplier": 1.5,
        "protein_multiplier": 1.0,
        "fat_multiplier": 1.0,
        "label": "Dia de recarga",
    },
}


async def get_adjusted_goals(user_id: int, day_type: str, session: AsyncSession) -> dict:
    """
    Read base goals from nutrition_risk_service._get_goals() and apply
    multipliers based on day_type.

    Returns:
        {
            "calories": int,
            "protein_g": int,
            "carbs_g": int,
            "fat_g": int,
            "day_type": str,
            "label": str,
        }
    """
    base_goals = await _get_goals(user_id, session)

    if day_type not in DAY_TYPES:
        logger.warning("Unknown day_type '%s' for user %d, using base goals", day_type, user_id)
        return {
            "calories": base_goals["calories"],
            "protein_g": base_goals["protein_g"],
            "carbs_g": base_goals["carbs_g"],
            "fat_g": base_goals["fat_g"],
            "day_type": "normal",
            "label": "Dia normal",
        }

    dt = DAY_TYPES[day_type]

    adjusted_calories = int(round(base_goals["calories"] * dt["calorie_multiplier"]))
    adjusted_protein = int(round(base_goals["protein_g"] * dt["protein_multiplier"]))
    adjusted_carbs = int(round(base_goals["carbs_g"] * dt["carb_multiplier"]))
    adjusted_fat = int(round(base_goals["fat_g"] * dt["fat_multiplier"]))

    return {
        "calories": adjusted_calories,
        "protein_g": adjusted_protein,
        "carbs_g": adjusted_carbs,
        "fat_g": adjusted_fat,
        "day_type": day_type,
        "label": dt["label"],
    }
