"""
Achievement Engine — evaluates and unlocks 100 achievements.

AI TOKEN COST: ZERO. 100% rule-based evaluation.

Reads user data (food logs, streaks, adherence, missions) and checks against
achievement definitions. All text in Spanish (target audience: LATAM).
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy import func, and_, distinct, case
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..models.ai_food_log import AIFoodLog
from ..models.nutrition_adherence import DailyNutritionAdherence
from ..models.progress import (
    Achievement,
    UserAchievement,
    UserMission,
    UserStreak,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# 100 Achievement Definitions
# ---------------------------------------------------------------------------
# Each entry: key -> {name, description, icon, category, rarity, condition_type,
#   condition_key, condition_value, xp_reward, coins_reward, hidden}
#
# Rarities: common (easy), rare (moderate), epic (hard), legendary (very hard)
# Condition types: first_action, streak, count, threshold, comeback, improvement,
#   mission_count, challenge_count, season
# ---------------------------------------------------------------------------

ACHIEVEMENT_DEFINITIONS: dict[str, dict] = {
    # =========================================================================
    # CONSTANCIA (20) — Consistency achievements
    # =========================================================================
    "first_meal": {
        "name": "Primera comida",
        "description": "Registra tu primera comida",
        "icon": "restaurant-outline",
        "category": "constancia",
        "rarity": "common",
        "condition_type": "first_action",
        "condition_key": "meals_logged",
        "condition_value": 1,
        "xp_reward": 50,
        "coins_reward": 10,
        "hidden": False,
    },
    "first_complete_day": {
        "name": "Primer dia completo",
        "description": "Completa tu primer dia con todas las comidas registradas",
        "icon": "sunny-outline",
        "category": "constancia",
        "rarity": "common",
        "condition_type": "first_action",
        "condition_key": "complete_days",
        "condition_value": 1,
        "xp_reward": 75,
        "coins_reward": 15,
        "hidden": False,
    },
    "first_week": {
        "name": "Primera semana",
        "description": "Registra comidas durante una semana",
        "icon": "calendar-outline",
        "category": "constancia",
        "rarity": "common",
        "condition_type": "count",
        "condition_key": "active_days",
        "condition_value": 7,
        "xp_reward": 100,
        "coins_reward": 20,
        "hidden": False,
    },
    "streak_3": {
        "name": "3 dias seguidos",
        "description": "Mantiene una racha de 3 dias consecutivos",
        "icon": "flame-outline",
        "category": "constancia",
        "rarity": "common",
        "condition_type": "streak",
        "condition_key": "current_streak_days",
        "condition_value": 3,
        "xp_reward": 75,
        "coins_reward": 15,
        "hidden": False,
    },
    "streak_7": {
        "name": "Una semana completa",
        "description": "7 dias seguidos registrando",
        "icon": "flame",
        "category": "constancia",
        "rarity": "common",
        "condition_type": "streak",
        "condition_key": "current_streak_days",
        "condition_value": 7,
        "xp_reward": 150,
        "coins_reward": 30,
        "hidden": False,
    },
    "streak_14": {
        "name": "Dos semanas seguidas",
        "description": "14 dias consecutivos de constancia",
        "icon": "bonfire-outline",
        "category": "constancia",
        "rarity": "rare",
        "condition_type": "streak",
        "condition_key": "current_streak_days",
        "condition_value": 14,
        "xp_reward": 250,
        "coins_reward": 50,
        "hidden": False,
    },
    "streak_30": {
        "name": "Un mes de constancia",
        "description": "30 dias seguidos sin fallar",
        "icon": "medal-outline",
        "category": "constancia",
        "rarity": "epic",
        "condition_type": "streak",
        "condition_key": "current_streak_days",
        "condition_value": 30,
        "xp_reward": 500,
        "coins_reward": 100,
        "hidden": False,
    },
    "streak_60": {
        "name": "Dos meses imparables",
        "description": "60 dias consecutivos de registro",
        "icon": "trophy-outline",
        "category": "constancia",
        "rarity": "epic",
        "condition_type": "streak",
        "condition_key": "current_streak_days",
        "condition_value": 60,
        "xp_reward": 750,
        "coins_reward": 150,
        "hidden": False,
    },
    "streak_90": {
        "name": "Tres meses de disciplina",
        "description": "90 dias seguidos, eres imparable",
        "icon": "trophy",
        "category": "constancia",
        "rarity": "epic",
        "condition_type": "streak",
        "condition_key": "current_streak_days",
        "condition_value": 90,
        "xp_reward": 1000,
        "coins_reward": 200,
        "hidden": False,
    },
    "streak_180": {
        "name": "Medio año de compromiso",
        "description": "180 dias consecutivos, legendario",
        "icon": "diamond-outline",
        "category": "constancia",
        "rarity": "epic",
        "condition_type": "streak",
        "condition_key": "current_streak_days",
        "condition_value": 180,
        "xp_reward": 2000,
        "coins_reward": 500,
        "hidden": True,
    },
    "register_10_breakfasts": {
        "name": "Desayuno campeon",
        "description": "Registra 10 desayunos",
        "icon": "cafe-outline",
        "category": "constancia",
        "rarity": "common",
        "condition_type": "count",
        "condition_key": "breakfast_count",
        "condition_value": 10,
        "xp_reward": 100,
        "coins_reward": 20,
        "hidden": False,
    },
    "register_25_lunches": {
        "name": "Rey del almuerzo",
        "description": "Registra 25 almuerzos",
        "icon": "pizza-outline",
        "category": "constancia",
        "rarity": "rare",
        "condition_type": "count",
        "condition_key": "lunch_count",
        "condition_value": 25,
        "xp_reward": 150,
        "coins_reward": 30,
        "hidden": False,
    },
    "register_50_dinners": {
        "name": "Maestro de la cena",
        "description": "Registra 50 cenas",
        "icon": "moon-outline",
        "category": "constancia",
        "rarity": "rare",
        "condition_type": "count",
        "condition_key": "dinner_count",
        "condition_value": 50,
        "xp_reward": 200,
        "coins_reward": 40,
        "hidden": False,
    },
    "register_100_meals": {
        "name": "100 comidas registradas",
        "description": "Has registrado 100 comidas en total",
        "icon": "nutrition-outline",
        "category": "constancia",
        "rarity": "rare",
        "condition_type": "count",
        "condition_key": "total_meals",
        "condition_value": 100,
        "xp_reward": 300,
        "coins_reward": 60,
        "hidden": False,
    },
    "register_500_meals": {
        "name": "500 comidas registradas",
        "description": "Medio millar de registros, increible",
        "icon": "star",
        "category": "constancia",
        "rarity": "epic",
        "condition_type": "count",
        "condition_key": "total_meals",
        "condition_value": 500,
        "xp_reward": 1000,
        "coins_reward": 200,
        "hidden": False,
    },
    "complete_5_days": {
        "name": "5 dias completos",
        "description": "Completa 5 dias con todas las comidas",
        "icon": "checkmark-circle-outline",
        "category": "constancia",
        "rarity": "common",
        "condition_type": "count",
        "condition_key": "complete_days",
        "condition_value": 5,
        "xp_reward": 100,
        "coins_reward": 20,
        "hidden": False,
    },
    "complete_15_days": {
        "name": "15 dias completos",
        "description": "15 dias con registro completo",
        "icon": "checkmark-done-outline",
        "category": "constancia",
        "rarity": "rare",
        "condition_type": "count",
        "condition_key": "complete_days",
        "condition_value": 15,
        "xp_reward": 200,
        "coins_reward": 40,
        "hidden": False,
    },
    "complete_30_days": {
        "name": "30 dias completos",
        "description": "Un mes entero de dias completos",
        "icon": "ribbon-outline",
        "category": "constancia",
        "rarity": "epic",
        "condition_type": "count",
        "condition_key": "complete_days",
        "condition_value": 30,
        "xp_reward": 400,
        "coins_reward": 80,
        "hidden": False,
    },
    "complete_60_days": {
        "name": "60 dias completos",
        "description": "Dos meses de dias perfectos",
        "icon": "shield-checkmark-outline",
        "category": "constancia",
        "rarity": "epic",
        "condition_type": "count",
        "condition_key": "complete_days",
        "condition_value": 60,
        "xp_reward": 750,
        "coins_reward": 150,
        "hidden": False,
    },
    "complete_100_days": {
        "name": "100 dias completos",
        "description": "Centenar de dias perfectos",
        "icon": "shield-checkmark",
        "category": "constancia",
        "rarity": "epic",
        "condition_type": "count",
        "condition_key": "complete_days",
        "condition_value": 100,
        "xp_reward": 1500,
        "coins_reward": 300,
        "hidden": False,
    },

    # =========================================================================
    # ADHERENCIA (20) — Calorie & protein target adherence
    # =========================================================================
    "hit_calorie_range_1": {
        "name": "En el rango",
        "description": "Cumple tu rango calorico por primera vez",
        "icon": "fitness-outline",
        "category": "adherencia",
        "rarity": "common",
        "condition_type": "threshold",
        "condition_key": "calorie_adherence_days",
        "condition_value": 1,
        "xp_reward": 50,
        "coins_reward": 10,
        "hidden": False,
    },
    "hit_calorie_range_3": {
        "name": "3 dias en rango",
        "description": "3 dias cumpliendo tu rango calorico",
        "icon": "fitness-outline",
        "category": "adherencia",
        "rarity": "common",
        "condition_type": "threshold",
        "condition_key": "calorie_adherence_days",
        "condition_value": 3,
        "xp_reward": 75,
        "coins_reward": 15,
        "hidden": False,
    },
    "hit_calorie_range_5": {
        "name": "5 dias en rango",
        "description": "5 dias cumpliendo calorias",
        "icon": "fitness",
        "category": "adherencia",
        "rarity": "common",
        "condition_type": "threshold",
        "condition_key": "calorie_adherence_days",
        "condition_value": 5,
        "xp_reward": 100,
        "coins_reward": 20,
        "hidden": False,
    },
    "hit_calorie_range_10": {
        "name": "10 dias en rango",
        "description": "10 dias dentro de tu meta calorica",
        "icon": "bar-chart-outline",
        "category": "adherencia",
        "rarity": "rare",
        "condition_type": "threshold",
        "condition_key": "calorie_adherence_days",
        "condition_value": 10,
        "xp_reward": 150,
        "coins_reward": 30,
        "hidden": False,
    },
    "hit_calorie_range_20": {
        "name": "20 dias en rango",
        "description": "20 dias de adherencia calorica",
        "icon": "bar-chart",
        "category": "adherencia",
        "rarity": "rare",
        "condition_type": "threshold",
        "condition_key": "calorie_adherence_days",
        "condition_value": 20,
        "xp_reward": 250,
        "coins_reward": 50,
        "hidden": False,
    },
    "hit_calorie_range_30": {
        "name": "30 dias en rango",
        "description": "Un mes cumpliendo calorias",
        "icon": "analytics-outline",
        "category": "adherencia",
        "rarity": "epic",
        "condition_type": "threshold",
        "condition_key": "calorie_adherence_days",
        "condition_value": 30,
        "xp_reward": 400,
        "coins_reward": 80,
        "hidden": False,
    },
    "hit_calorie_range_50": {
        "name": "50 dias en rango",
        "description": "50 dias de disciplina calorica",
        "icon": "analytics",
        "category": "adherencia",
        "rarity": "epic",
        "condition_type": "threshold",
        "condition_key": "calorie_adherence_days",
        "condition_value": 50,
        "xp_reward": 600,
        "coins_reward": 120,
        "hidden": False,
    },
    "hit_calorie_range_75": {
        "name": "75 dias en rango",
        "description": "75 dias cumpliendo tu meta",
        "icon": "podium-outline",
        "category": "adherencia",
        "rarity": "epic",
        "condition_type": "threshold",
        "condition_key": "calorie_adherence_days",
        "condition_value": 75,
        "xp_reward": 800,
        "coins_reward": 160,
        "hidden": False,
    },
    "hit_calorie_range_100": {
        "name": "100 dias en rango",
        "description": "Centenar de dias en tu meta calorica",
        "icon": "podium",
        "category": "adherencia",
        "rarity": "epic",
        "condition_type": "threshold",
        "condition_key": "calorie_adherence_days",
        "condition_value": 100,
        "xp_reward": 1200,
        "coins_reward": 250,
        "hidden": False,
    },
    "hit_calorie_range_200": {
        "name": "200 dias en rango",
        "description": "200 dias de adherencia calorica perfecta",
        "icon": "diamond",
        "category": "adherencia",
        "rarity": "epic",
        "condition_type": "threshold",
        "condition_key": "calorie_adherence_days",
        "condition_value": 200,
        "xp_reward": 2000,
        "coins_reward": 500,
        "hidden": True,
    },
    "hit_protein_1": {
        "name": "Proteina cumplida",
        "description": "Cumple tu meta de proteina por primera vez",
        "icon": "barbell-outline",
        "category": "adherencia",
        "rarity": "common",
        "condition_type": "threshold",
        "condition_key": "protein_adherence_days",
        "condition_value": 1,
        "xp_reward": 50,
        "coins_reward": 10,
        "hidden": False,
    },
    "hit_protein_3": {
        "name": "3 dias de proteina",
        "description": "3 dias cumpliendo proteina",
        "icon": "barbell-outline",
        "category": "adherencia",
        "rarity": "common",
        "condition_type": "threshold",
        "condition_key": "protein_adherence_days",
        "condition_value": 3,
        "xp_reward": 75,
        "coins_reward": 15,
        "hidden": False,
    },
    "hit_protein_5": {
        "name": "5 dias de proteina",
        "description": "5 dias de proteina cumplida",
        "icon": "barbell",
        "category": "adherencia",
        "rarity": "common",
        "condition_type": "threshold",
        "condition_key": "protein_adherence_days",
        "condition_value": 5,
        "xp_reward": 100,
        "coins_reward": 20,
        "hidden": False,
    },
    "hit_protein_10": {
        "name": "10 dias de proteina",
        "description": "10 dias cumpliendo tu meta de proteina",
        "icon": "body-outline",
        "category": "adherencia",
        "rarity": "rare",
        "condition_type": "threshold",
        "condition_key": "protein_adherence_days",
        "condition_value": 10,
        "xp_reward": 150,
        "coins_reward": 30,
        "hidden": False,
    },
    "hit_protein_20": {
        "name": "20 dias de proteina",
        "description": "20 dias con proteina en meta",
        "icon": "body",
        "category": "adherencia",
        "rarity": "rare",
        "condition_type": "threshold",
        "condition_key": "protein_adherence_days",
        "condition_value": 20,
        "xp_reward": 250,
        "coins_reward": 50,
        "hidden": False,
    },
    "hit_protein_30": {
        "name": "30 dias de proteina",
        "description": "Un mes de proteina cumplida",
        "icon": "shield-outline",
        "category": "adherencia",
        "rarity": "epic",
        "condition_type": "threshold",
        "condition_key": "protein_adherence_days",
        "condition_value": 30,
        "xp_reward": 400,
        "coins_reward": 80,
        "hidden": False,
    },
    "hit_protein_50": {
        "name": "50 dias de proteina",
        "description": "50 dias de disciplina proteica",
        "icon": "shield-half-outline",
        "category": "adherencia",
        "rarity": "epic",
        "condition_type": "threshold",
        "condition_key": "protein_adherence_days",
        "condition_value": 50,
        "xp_reward": 600,
        "coins_reward": 120,
        "hidden": False,
    },
    "hit_protein_75": {
        "name": "75 dias de proteina",
        "description": "75 dias cumpliendo proteina",
        "icon": "shield-half",
        "category": "adherencia",
        "rarity": "epic",
        "condition_type": "threshold",
        "condition_key": "protein_adherence_days",
        "condition_value": 75,
        "xp_reward": 800,
        "coins_reward": 160,
        "hidden": False,
    },
    "hit_protein_100": {
        "name": "100 dias de proteina",
        "description": "Centenar de dias con proteina en meta",
        "icon": "shield",
        "category": "adherencia",
        "rarity": "epic",
        "condition_type": "threshold",
        "condition_key": "protein_adherence_days",
        "condition_value": 100,
        "xp_reward": 1200,
        "coins_reward": 250,
        "hidden": False,
    },
    "hit_protein_150": {
        "name": "150 dias de proteina",
        "description": "150 dias de adherencia proteica",
        "icon": "diamond-outline",
        "category": "adherencia",
        "rarity": "epic",
        "condition_type": "threshold",
        "condition_key": "protein_adherence_days",
        "condition_value": 150,
        "xp_reward": 1800,
        "coins_reward": 400,
        "hidden": True,
    },

    # =========================================================================
    # REINICIO (10) — Comeback & recovery achievements
    # =========================================================================
    "comeback_3d": {
        "name": "El regreso",
        "description": "Vuelve a registrar despues de 3 dias de ausencia",
        "icon": "arrow-undo-outline",
        "category": "reinicio",
        "rarity": "common",
        "condition_type": "comeback",
        "condition_key": "absence_days",
        "condition_value": 3,
        "xp_reward": 100,
        "coins_reward": 25,
        "hidden": False,
    },
    "comeback_7d": {
        "name": "Nunca es tarde",
        "description": "Regresa despues de 7 dias sin registrar",
        "icon": "refresh-outline",
        "category": "reinicio",
        "rarity": "rare",
        "condition_type": "comeback",
        "condition_key": "absence_days",
        "condition_value": 7,
        "xp_reward": 200,
        "coins_reward": 50,
        "hidden": False,
    },
    "comeback_14d": {
        "name": "Segunda oportunidad",
        "description": "Vuelve despues de 14 dias de ausencia",
        "icon": "refresh",
        "category": "reinicio",
        "rarity": "rare",
        "condition_type": "comeback",
        "condition_key": "absence_days",
        "condition_value": 14,
        "xp_reward": 300,
        "coins_reward": 75,
        "hidden": False,
    },
    "rescue_from_critical": {
        "name": "Saliste de la zona roja",
        "description": "Mejora tu estado de critical a un nivel mejor",
        "icon": "heart-half-outline",
        "category": "reinicio",
        "rarity": "rare",
        "condition_type": "improvement",
        "condition_key": "left_critical",
        "condition_value": 1,
        "xp_reward": 250,
        "coins_reward": 50,
        "hidden": False,
    },
    "improved_3_consecutive": {
        "name": "3 dias mejorando",
        "description": "Tu puntuacion mejoro 3 dias seguidos",
        "icon": "trending-up-outline",
        "category": "reinicio",
        "rarity": "rare",
        "condition_type": "improvement",
        "condition_key": "consecutive_improvement_days",
        "condition_value": 3,
        "xp_reward": 150,
        "coins_reward": 30,
        "hidden": False,
    },
    "improved_7_consecutive": {
        "name": "Una semana de mejora",
        "description": "7 dias consecutivos mejorando tu puntuacion",
        "icon": "trending-up",
        "category": "reinicio",
        "rarity": "epic",
        "condition_type": "improvement",
        "condition_key": "consecutive_improvement_days",
        "condition_value": 7,
        "xp_reward": 350,
        "coins_reward": 70,
        "hidden": False,
    },
    "recovered_streak": {
        "name": "Racha recuperada",
        "description": "Recupera una racha despues de perderla",
        "icon": "sync-outline",
        "category": "reinicio",
        "rarity": "rare",
        "condition_type": "improvement",
        "condition_key": "streak_recovered",
        "condition_value": 1,
        "xp_reward": 150,
        "coins_reward": 30,
        "hidden": False,
    },
    "used_streak_freeze": {
        "name": "Proteccion activada",
        "description": "Usa un freeze para proteger tu racha",
        "icon": "snow-outline",
        "category": "reinicio",
        "rarity": "common",
        "condition_type": "first_action",
        "condition_key": "streak_freezes_used",
        "condition_value": 1,
        "xp_reward": 50,
        "coins_reward": 10,
        "hidden": False,
    },
    "corrected_bad_day": {
        "name": "Dia corregido",
        "description": "Empezaste mal pero corregiste antes de terminar el dia",
        "icon": "construct-outline",
        "category": "reinicio",
        "rarity": "rare",
        "condition_type": "improvement",
        "condition_key": "day_corrected",
        "condition_value": 1,
        "xp_reward": 200,
        "coins_reward": 40,
        "hidden": False,
    },
    "zero_to_hero_week": {
        "name": "De cero a heroe",
        "description": "Semana que empezo mal pero termino bien",
        "icon": "rocket-outline",
        "category": "reinicio",
        "rarity": "epic",
        "condition_type": "improvement",
        "condition_key": "week_turnaround",
        "condition_value": 1,
        "xp_reward": 400,
        "coins_reward": 80,
        "hidden": False,
    },

    # =========================================================================
    # PROTEINA (10) — Protein-specific achievements
    # =========================================================================
    "protein_first_target": {
        "name": "Primer golpe de proteina",
        "description": "Alcanza tu meta de proteina en una comida",
        "icon": "flash-outline",
        "category": "proteina",
        "rarity": "common",
        "condition_type": "first_action",
        "condition_key": "protein_target_hit",
        "condition_value": 1,
        "xp_reward": 50,
        "coins_reward": 10,
        "hidden": False,
    },
    "protein_30g_meal": {
        "name": "Comida con 30g+ de proteina",
        "description": "Registra una comida con al menos 30g de proteina",
        "icon": "flash",
        "category": "proteina",
        "rarity": "common",
        "condition_type": "first_action",
        "condition_key": "meal_30g_protein",
        "condition_value": 1,
        "xp_reward": 75,
        "coins_reward": 15,
        "hidden": False,
    },
    "protein_week_streak": {
        "name": "Semana proteica",
        "description": "Cumple proteina 7 dias seguidos",
        "icon": "barbell-outline",
        "category": "proteina",
        "rarity": "rare",
        "condition_type": "streak",
        "condition_key": "protein_streak_days",
        "condition_value": 7,
        "xp_reward": 200,
        "coins_reward": 40,
        "hidden": False,
    },
    "protein_month_streak": {
        "name": "Mes proteico",
        "description": "Cumple proteina 30 dias seguidos",
        "icon": "barbell",
        "category": "proteina",
        "rarity": "epic",
        "condition_type": "streak",
        "condition_key": "protein_streak_days",
        "condition_value": 30,
        "xp_reward": 500,
        "coins_reward": 100,
        "hidden": False,
    },
    "protein_50_meals_high": {
        "name": "50 comidas altas en proteina",
        "description": "50 comidas con mas de 25g de proteina",
        "icon": "medal-outline",
        "category": "proteina",
        "rarity": "rare",
        "condition_type": "count",
        "condition_key": "high_protein_meals",
        "condition_value": 50,
        "xp_reward": 300,
        "coins_reward": 60,
        "hidden": False,
    },
    "protein_100_meals_high": {
        "name": "100 comidas altas en proteina",
        "description": "Centenar de comidas proteicas",
        "icon": "medal",
        "category": "proteina",
        "rarity": "epic",
        "condition_type": "count",
        "condition_key": "high_protein_meals",
        "condition_value": 100,
        "xp_reward": 600,
        "coins_reward": 120,
        "hidden": False,
    },
    "protein_daily_avg_up": {
        "name": "Promedio proteico subiendo",
        "description": "Tu promedio semanal de proteina subio vs la semana anterior",
        "icon": "trending-up-outline",
        "category": "proteina",
        "rarity": "common",
        "condition_type": "improvement",
        "condition_key": "protein_avg_improved",
        "condition_value": 1,
        "xp_reward": 75,
        "coins_reward": 15,
        "hidden": False,
    },
    "protein_all_meals_day": {
        "name": "Proteina en cada comida",
        "description": "Todas las comidas del dia tienen proteina significativa",
        "icon": "checkmark-done-outline",
        "category": "proteina",
        "rarity": "rare",
        "condition_type": "first_action",
        "condition_key": "all_meals_protein",
        "condition_value": 1,
        "xp_reward": 150,
        "coins_reward": 30,
        "hidden": False,
    },
    "protein_exceed_10pct": {
        "name": "Superaste tu proteina en 10%",
        "description": "Dia con mas del 110% de tu meta de proteina",
        "icon": "arrow-up-circle-outline",
        "category": "proteina",
        "rarity": "common",
        "condition_type": "first_action",
        "condition_key": "protein_exceed_10pct",
        "condition_value": 1,
        "xp_reward": 75,
        "coins_reward": 15,
        "hidden": False,
    },
    "protein_king": {
        "name": "Rey de la proteina",
        "description": "Cumple proteina 60 dias en total",
        "icon": "ribbon",
        "category": "proteina",
        "rarity": "epic",
        "condition_type": "threshold",
        "condition_key": "protein_adherence_days",
        "condition_value": 60,
        "xp_reward": 700,
        "coins_reward": 140,
        "hidden": False,
    },

    # =========================================================================
    # EQUILIBRIO (10) — Balance, diet quality, variety
    # =========================================================================
    "balanced_first_day": {
        "name": "Primer dia equilibrado",
        "description": "Tu primer dia con macros en equilibrio",
        "icon": "color-palette-outline",
        "category": "equilibrio",
        "rarity": "common",
        "condition_type": "first_action",
        "condition_key": "balanced_day",
        "condition_value": 1,
        "xp_reward": 75,
        "coins_reward": 15,
        "hidden": False,
    },
    "balanced_5_days": {
        "name": "5 dias equilibrados",
        "description": "5 dias con macros balanceados",
        "icon": "color-palette",
        "category": "equilibrio",
        "rarity": "rare",
        "condition_type": "count",
        "condition_key": "balanced_days",
        "condition_value": 5,
        "xp_reward": 150,
        "coins_reward": 30,
        "hidden": False,
    },
    "balanced_15_days": {
        "name": "15 dias equilibrados",
        "description": "15 dias con buena distribucion de macros",
        "icon": "pie-chart-outline",
        "category": "equilibrio",
        "rarity": "rare",
        "condition_type": "count",
        "condition_key": "balanced_days",
        "condition_value": 15,
        "xp_reward": 300,
        "coins_reward": 60,
        "hidden": False,
    },
    "balanced_30_days": {
        "name": "Un mes equilibrado",
        "description": "30 dias con macros balanceados",
        "icon": "pie-chart",
        "category": "equilibrio",
        "rarity": "epic",
        "condition_type": "count",
        "condition_key": "balanced_days",
        "condition_value": 30,
        "xp_reward": 500,
        "coins_reward": 100,
        "hidden": False,
    },
    "diet_quality_80": {
        "name": "Calidad premium",
        "description": "Alcanza un puntaje de calidad alimentaria de 80+",
        "icon": "star-outline",
        "category": "equilibrio",
        "rarity": "rare",
        "condition_type": "first_action",
        "condition_key": "diet_quality_80",
        "condition_value": 1,
        "xp_reward": 200,
        "coins_reward": 40,
        "hidden": False,
    },
    "diet_quality_90": {
        "name": "Calidad elite",
        "description": "Puntaje de calidad alimentaria 90+",
        "icon": "star-half-outline",
        "category": "equilibrio",
        "rarity": "epic",
        "condition_type": "first_action",
        "condition_key": "diet_quality_90",
        "condition_value": 1,
        "xp_reward": 400,
        "coins_reward": 80,
        "hidden": False,
    },
    "varied_5_foods": {
        "name": "Variedad basica",
        "description": "Registra 5 alimentos diferentes en un dia",
        "icon": "grid-outline",
        "category": "equilibrio",
        "rarity": "common",
        "condition_type": "first_action",
        "condition_key": "varied_5_foods_day",
        "condition_value": 1,
        "xp_reward": 75,
        "coins_reward": 15,
        "hidden": False,
    },
    "varied_10_foods": {
        "name": "Dieta variada",
        "description": "Registra 10 alimentos diferentes en un dia",
        "icon": "grid",
        "category": "equilibrio",
        "rarity": "rare",
        "condition_type": "first_action",
        "condition_key": "varied_10_foods_day",
        "condition_value": 1,
        "xp_reward": 150,
        "coins_reward": 30,
        "hidden": False,
    },
    "macro_split_perfect": {
        "name": "Split perfecto",
        "description": "Dia con distribucion de macros dentro del 5% de tu plan",
        "icon": "speedometer-outline",
        "category": "equilibrio",
        "rarity": "rare",
        "condition_type": "first_action",
        "condition_key": "perfect_macro_split",
        "condition_value": 1,
        "xp_reward": 200,
        "coins_reward": 40,
        "hidden": False,
    },
    "equilibrio_maestro": {
        "name": "Maestro del equilibrio",
        "description": "10 dias con split de macros perfecto",
        "icon": "speedometer",
        "category": "equilibrio",
        "rarity": "epic",
        "condition_type": "count",
        "condition_key": "perfect_macro_days",
        "condition_value": 10,
        "xp_reward": 500,
        "coins_reward": 100,
        "hidden": False,
    },

    # =========================================================================
    # MISIONES (15) — Mission completion milestones
    # =========================================================================
    "mission_first": {
        "name": "Primera mision completada",
        "description": "Completa tu primera mision diaria",
        "icon": "flag-outline",
        "category": "misiones",
        "rarity": "common",
        "condition_type": "mission_count",
        "condition_key": "missions_completed",
        "condition_value": 1,
        "xp_reward": 50,
        "coins_reward": 10,
        "hidden": False,
    },
    "mission_5": {
        "name": "5 misiones completadas",
        "description": "Completa 5 misiones",
        "icon": "flag",
        "category": "misiones",
        "rarity": "common",
        "condition_type": "mission_count",
        "condition_key": "missions_completed",
        "condition_value": 5,
        "xp_reward": 100,
        "coins_reward": 20,
        "hidden": False,
    },
    "mission_10": {
        "name": "10 misiones completadas",
        "description": "10 misiones en tu historial",
        "icon": "bookmarks-outline",
        "category": "misiones",
        "rarity": "rare",
        "condition_type": "mission_count",
        "condition_key": "missions_completed",
        "condition_value": 10,
        "xp_reward": 200,
        "coins_reward": 40,
        "hidden": False,
    },
    "mission_25": {
        "name": "25 misiones completadas",
        "description": "Un cuarto de centenar de misiones",
        "icon": "bookmarks",
        "category": "misiones",
        "rarity": "rare",
        "condition_type": "mission_count",
        "condition_key": "missions_completed",
        "condition_value": 25,
        "xp_reward": 350,
        "coins_reward": 70,
        "hidden": False,
    },
    "mission_50": {
        "name": "50 misiones completadas",
        "description": "Medio centenar de misiones",
        "icon": "ribbon-outline",
        "category": "misiones",
        "rarity": "epic",
        "condition_type": "mission_count",
        "condition_key": "missions_completed",
        "condition_value": 50,
        "xp_reward": 600,
        "coins_reward": 120,
        "hidden": False,
    },
    "mission_100": {
        "name": "100 misiones completadas",
        "description": "Centenar de misiones cumplidas",
        "icon": "ribbon",
        "category": "misiones",
        "rarity": "epic",
        "condition_type": "mission_count",
        "condition_key": "missions_completed",
        "condition_value": 100,
        "xp_reward": 1000,
        "coins_reward": 200,
        "hidden": False,
    },
    "mission_3_in_day": {
        "name": "3 de 3 en un dia",
        "description": "Completa las 3 misiones del dia",
        "icon": "checkmark-done-circle-outline",
        "category": "misiones",
        "rarity": "common",
        "condition_type": "first_action",
        "condition_key": "full_day_missions",
        "condition_value": 1,
        "xp_reward": 100,
        "coins_reward": 20,
        "hidden": False,
    },
    "mission_3_in_day_5x": {
        "name": "5 dias con 3/3 misiones",
        "description": "Completa todas las misiones 5 dias",
        "icon": "checkmark-done-circle",
        "category": "misiones",
        "rarity": "rare",
        "condition_type": "count",
        "condition_key": "full_day_missions",
        "condition_value": 5,
        "xp_reward": 250,
        "coins_reward": 50,
        "hidden": False,
    },
    "mission_3_in_day_15x": {
        "name": "15 dias con 3/3 misiones",
        "description": "15 dias completando todas las misiones",
        "icon": "star-outline",
        "category": "misiones",
        "rarity": "epic",
        "condition_type": "count",
        "condition_key": "full_day_missions",
        "condition_value": 15,
        "xp_reward": 500,
        "coins_reward": 100,
        "hidden": False,
    },
    "mission_3_in_day_30x": {
        "name": "30 dias con 3/3 misiones",
        "description": "Un mes de misiones perfectas",
        "icon": "star",
        "category": "misiones",
        "rarity": "epic",
        "condition_type": "count",
        "condition_key": "full_day_missions",
        "condition_value": 30,
        "xp_reward": 800,
        "coins_reward": 160,
        "hidden": False,
    },
    "mission_streak_7": {
        "name": "7 dias con mision completada",
        "description": "Completa al menos una mision 7 dias seguidos",
        "icon": "flame-outline",
        "category": "misiones",
        "rarity": "rare",
        "condition_type": "streak",
        "condition_key": "mission_streak_days",
        "condition_value": 7,
        "xp_reward": 200,
        "coins_reward": 40,
        "hidden": False,
    },
    "mission_streak_14": {
        "name": "14 dias con mision completada",
        "description": "Dos semanas seguidas completando misiones",
        "icon": "flame",
        "category": "misiones",
        "rarity": "epic",
        "condition_type": "streak",
        "condition_key": "mission_streak_days",
        "condition_value": 14,
        "xp_reward": 400,
        "coins_reward": 80,
        "hidden": False,
    },
    "mission_streak_30": {
        "name": "30 dias con mision completada",
        "description": "Un mes seguido completando misiones diarias",
        "icon": "trophy-outline",
        "category": "misiones",
        "rarity": "epic",
        "condition_type": "streak",
        "condition_key": "mission_streak_days",
        "condition_value": 30,
        "xp_reward": 750,
        "coins_reward": 150,
        "hidden": False,
    },
    "mission_variety_all": {
        "name": "Misionero completo",
        "description": "Completa cada tipo de mision al menos una vez",
        "icon": "apps-outline",
        "category": "misiones",
        "rarity": "rare",
        "condition_type": "count",
        "condition_key": "unique_mission_types",
        "condition_value": 15,
        "xp_reward": 300,
        "coins_reward": 60,
        "hidden": False,
    },
    "mission_speed_before_noon": {
        "name": "Mision matutina",
        "description": "Completa una mision antes del mediodia",
        "icon": "sunny-outline",
        "category": "misiones",
        "rarity": "common",
        "condition_type": "first_action",
        "condition_key": "mission_before_noon",
        "condition_value": 1,
        "xp_reward": 50,
        "coins_reward": 10,
        "hidden": False,
    },

    # =========================================================================
    # DESAFIOS (10) — Weekly challenge completions
    # =========================================================================
    "challenge_first": {
        "name": "Primer desafio",
        "description": "Completa tu primer desafio semanal",
        "icon": "trophy-outline",
        "category": "desafios",
        "rarity": "common",
        "condition_type": "challenge_count",
        "condition_key": "challenges_completed",
        "condition_value": 1,
        "xp_reward": 100,
        "coins_reward": 20,
        "hidden": False,
    },
    "challenge_3": {
        "name": "3 desafios completados",
        "description": "Tres desafios semanales cumplidos",
        "icon": "trophy",
        "category": "desafios",
        "rarity": "common",
        "condition_type": "challenge_count",
        "condition_key": "challenges_completed",
        "condition_value": 3,
        "xp_reward": 200,
        "coins_reward": 40,
        "hidden": False,
    },
    "challenge_5": {
        "name": "5 desafios completados",
        "description": "Cinco desafios semanales",
        "icon": "medal-outline",
        "category": "desafios",
        "rarity": "rare",
        "condition_type": "challenge_count",
        "condition_key": "challenges_completed",
        "condition_value": 5,
        "xp_reward": 350,
        "coins_reward": 70,
        "hidden": False,
    },
    "challenge_10": {
        "name": "10 desafios completados",
        "description": "Diez desafios semanales cumplidos",
        "icon": "medal",
        "category": "desafios",
        "rarity": "rare",
        "condition_type": "challenge_count",
        "condition_key": "challenges_completed",
        "condition_value": 10,
        "xp_reward": 500,
        "coins_reward": 100,
        "hidden": False,
    },
    "challenge_25": {
        "name": "25 desafios completados",
        "description": "Cuarto de centenar de desafios",
        "icon": "diamond-outline",
        "category": "desafios",
        "rarity": "epic",
        "condition_type": "challenge_count",
        "condition_key": "challenges_completed",
        "condition_value": 25,
        "xp_reward": 1000,
        "coins_reward": 200,
        "hidden": False,
    },
    "challenge_perfect_week": {
        "name": "Semana perfecta",
        "description": "Completa un desafio semanal con puntaje perfecto",
        "icon": "sparkles-outline",
        "category": "desafios",
        "rarity": "rare",
        "condition_type": "first_action",
        "condition_key": "perfect_challenge_week",
        "condition_value": 1,
        "xp_reward": 300,
        "coins_reward": 60,
        "hidden": False,
    },
    "challenge_streak_3": {
        "name": "3 desafios seguidos",
        "description": "Completa 3 desafios semanales consecutivos",
        "icon": "git-merge-outline",
        "category": "desafios",
        "rarity": "rare",
        "condition_type": "streak",
        "condition_key": "challenge_streak_weeks",
        "condition_value": 3,
        "xp_reward": 250,
        "coins_reward": 50,
        "hidden": False,
    },
    "challenge_streak_8": {
        "name": "8 semanas de desafios",
        "description": "Dos meses de desafios semanales consecutivos",
        "icon": "git-merge",
        "category": "desafios",
        "rarity": "epic",
        "condition_type": "streak",
        "condition_key": "challenge_streak_weeks",
        "condition_value": 8,
        "xp_reward": 600,
        "coins_reward": 120,
        "hidden": False,
    },
    "challenge_comeback_after_miss": {
        "name": "Volviste al desafio",
        "description": "Completa un desafio despues de fallar el anterior",
        "icon": "return-up-forward-outline",
        "category": "desafios",
        "rarity": "common",
        "condition_type": "first_action",
        "condition_key": "challenge_comeback",
        "condition_value": 1,
        "xp_reward": 100,
        "coins_reward": 20,
        "hidden": False,
    },
    "challenge_variety_all": {
        "name": "Desafio completo",
        "description": "Completa cada tipo de desafio al menos una vez",
        "icon": "apps",
        "category": "desafios",
        "rarity": "epic",
        "condition_type": "count",
        "condition_key": "unique_challenge_types",
        "condition_value": 10,
        "xp_reward": 500,
        "coins_reward": 100,
        "hidden": False,
    },

    # =========================================================================
    # TEMPORADAS (5) — Seasonal achievements
    # =========================================================================
    "season_first": {
        "name": "Primera temporada",
        "description": "Participa en tu primera temporada",
        "icon": "leaf-outline",
        "category": "temporadas",
        "rarity": "common",
        "condition_type": "season",
        "condition_key": "seasons_participated",
        "condition_value": 1,
        "xp_reward": 100,
        "coins_reward": 25,
        "hidden": False,
    },
    "season_champion": {
        "name": "Campeon de temporada",
        "description": "Termina en el top 10% de una temporada",
        "icon": "podium-outline",
        "category": "temporadas",
        "rarity": "epic",
        "condition_type": "season",
        "condition_key": "season_top_10",
        "condition_value": 1,
        "xp_reward": 1000,
        "coins_reward": 250,
        "hidden": False,
    },
    "season_3_completed": {
        "name": "Veterano de temporadas",
        "description": "Completa 3 temporadas",
        "icon": "leaf",
        "category": "temporadas",
        "rarity": "rare",
        "condition_type": "season",
        "condition_key": "seasons_completed",
        "condition_value": 3,
        "xp_reward": 500,
        "coins_reward": 100,
        "hidden": False,
    },
    "season_all_missions": {
        "name": "Misionero de temporada",
        "description": "Completa todas las misiones de una temporada",
        "icon": "checkmark-done-outline",
        "category": "temporadas",
        "rarity": "epic",
        "condition_type": "season",
        "condition_key": "season_all_missions",
        "condition_value": 1,
        "xp_reward": 750,
        "coins_reward": 150,
        "hidden": False,
    },
    "season_back_to_back": {
        "name": "Bicampeon",
        "description": "Campeon de temporada dos veces seguidas",
        "icon": "podium",
        "category": "temporadas",
        "rarity": "epic",
        "condition_type": "season",
        "condition_key": "consecutive_season_champion",
        "condition_value": 2,
        "xp_reward": 2000,
        "coins_reward": 500,
        "hidden": True,
    },
}


# ---------------------------------------------------------------------------
# User data gathering helpers
# ---------------------------------------------------------------------------

async def _get_user_stats(user_id: int, session: AsyncSession) -> dict:
    """Gather all user metrics needed for achievement evaluation."""
    today = date.today()

    # Total meals by type
    meal_counts = await session.execute(
        select(
            func.count().label("total"),
            func.count(case((AIFoodLog.meal_type == "breakfast", 1))).label("breakfast"),
            func.count(case((AIFoodLog.meal_type == "lunch", 1))).label("lunch"),
            func.count(case((AIFoodLog.meal_type == "dinner", 1))).label("dinner"),
            func.count(case((AIFoodLog.meal_type == "snack", 1))).label("snack"),
        ).where(AIFoodLog.user_id == user_id)
    )
    mc = meal_counts.one()

    # Active days (days with at least 1 log)
    active_days_q = await session.execute(
        select(func.count(distinct(func.date(AIFoodLog.logged_at)))).where(
            AIFoodLog.user_id == user_id
        )
    )
    active_days = active_days_q.scalar() or 0

    # Complete days (3+ meals logged in a day)
    complete_days_q = await session.execute(
        select(func.count()).select_from(
            select(func.date(AIFoodLog.logged_at).label("d"))
            .where(AIFoodLog.user_id == user_id)
            .group_by(func.date(AIFoodLog.logged_at))
            .having(func.count() >= 3)
            .subquery()
        )
    )
    complete_days = complete_days_q.scalar() or 0

    # Calorie adherence days (ratio between 0.85 and 1.15)
    cal_adherence_q = await session.execute(
        select(func.count()).where(
            and_(
                DailyNutritionAdherence.user_id == user_id,
                DailyNutritionAdherence.calories_ratio >= 0.85,
                DailyNutritionAdherence.calories_ratio <= 1.15,
                DailyNutritionAdherence.no_log_flag == False,  # noqa: E712
            )
        )
    )
    calorie_adherence_days = cal_adherence_q.scalar() or 0

    # Protein adherence days (logged >= 90% of target)
    prot_adherence_q = await session.execute(
        select(func.count()).where(
            and_(
                DailyNutritionAdherence.user_id == user_id,
                DailyNutritionAdherence.protein_target > 0,
                DailyNutritionAdherence.protein_logged
                >= DailyNutritionAdherence.protein_target * 0.9,
                DailyNutritionAdherence.no_log_flag == False,  # noqa: E712
            )
        )
    )
    protein_adherence_days = prot_adherence_q.scalar() or 0

    # High protein meals (>= 25g)
    high_prot_q = await session.execute(
        select(func.count()).where(
            and_(
                AIFoodLog.user_id == user_id,
                AIFoodLog.protein_g >= 25,
            )
        )
    )
    high_protein_meals = high_prot_q.scalar() or 0

    # Balanced days (all macros within 15% of target)
    balanced_q = await session.execute(
        select(func.count()).where(
            and_(
                DailyNutritionAdherence.user_id == user_id,
                DailyNutritionAdherence.calories_ratio >= 0.85,
                DailyNutritionAdherence.calories_ratio <= 1.15,
                DailyNutritionAdherence.protein_target > 0,
                DailyNutritionAdherence.protein_logged
                >= DailyNutritionAdherence.protein_target * 0.85,
                DailyNutritionAdherence.protein_logged
                <= DailyNutritionAdherence.protein_target * 1.15,
                DailyNutritionAdherence.no_log_flag == False,  # noqa: E712
            )
        )
    )
    balanced_days = balanced_q.scalar() or 0

    # Diet quality >= 80 days
    dq80_q = await session.execute(
        select(func.count()).where(
            and_(
                DailyNutritionAdherence.user_id == user_id,
                DailyNutritionAdherence.diet_quality_score >= 80,
            )
        )
    )
    diet_quality_80_days = dq80_q.scalar() or 0

    # Diet quality >= 90 days
    dq90_q = await session.execute(
        select(func.count()).where(
            and_(
                DailyNutritionAdherence.user_id == user_id,
                DailyNutritionAdherence.diet_quality_score >= 90,
            )
        )
    )
    diet_quality_90_days = dq90_q.scalar() or 0

    # Streak data
    streak_row = await session.execute(
        select(UserStreak).where(UserStreak.user_id == user_id)
    )
    streak = streak_row.scalar_one_or_none()

    current_streak = streak.current_streak_days if streak else 0
    best_streak = streak.best_streak_days if streak else 0
    freezes_used = streak.total_freezes_used if streak else 0

    # Missions completed
    missions_q = await session.execute(
        select(func.count()).where(
            and_(
                UserMission.user_id == user_id,
                UserMission.status == "completed",
            )
        )
    )
    missions_completed = missions_q.scalar() or 0

    # Full day missions (days with 3/3 completed)
    full_day_missions_q = await session.execute(
        select(func.count()).select_from(
            select(UserMission.assigned_date)
            .where(
                and_(
                    UserMission.user_id == user_id,
                    UserMission.status == "completed",
                )
            )
            .group_by(UserMission.assigned_date)
            .having(func.count() >= 3)
            .subquery()
        )
    )
    full_day_missions = full_day_missions_q.scalar() or 0

    # Comeback detection: last log before today's most recent log
    last_two_dates_q = await session.execute(
        select(distinct(func.date(AIFoodLog.logged_at)))
        .where(AIFoodLog.user_id == user_id)
        .order_by(func.date(AIFoodLog.logged_at).desc())
        .limit(2)
    )
    last_dates = [r[0] for r in last_two_dates_q.all()]
    absence_days = 0
    if len(last_dates) == 2:
        absence_days = (last_dates[0] - last_dates[1]).days - 1

    # Consecutive improvement days (risk score going down)
    recent_adherence_q = await session.execute(
        select(
            DailyNutritionAdherence.date,
            DailyNutritionAdherence.nutrition_risk_score,
            DailyNutritionAdherence.adherence_status,
        )
        .where(DailyNutritionAdherence.user_id == user_id)
        .order_by(DailyNutritionAdherence.date.desc())
        .limit(10)
    )
    recent_scores = recent_adherence_q.all()
    consecutive_improvement = 0
    left_critical = False
    if len(recent_scores) >= 2:
        for i in range(len(recent_scores) - 1):
            if recent_scores[i].nutrition_risk_score < recent_scores[i + 1].nutrition_risk_score:
                consecutive_improvement += 1
            else:
                break
        # Check if user left critical status
        if recent_scores[0].adherence_status != "critical" and any(
            s.adherence_status == "critical" for s in recent_scores[1:]
        ):
            left_critical = True

    return {
        "total_meals": mc.total or 0,
        "breakfast_count": mc.breakfast or 0,
        "lunch_count": mc.lunch or 0,
        "dinner_count": mc.dinner or 0,
        "snack_count": mc.snack or 0,
        "active_days": active_days,
        "complete_days": complete_days,
        "calorie_adherence_days": calorie_adherence_days,
        "protein_adherence_days": protein_adherence_days,
        "high_protein_meals": high_protein_meals,
        "balanced_days": balanced_days,
        "diet_quality_80_days": diet_quality_80_days,
        "diet_quality_90_days": diet_quality_90_days,
        "current_streak_days": current_streak,
        "best_streak_days": best_streak,
        "streak_freezes_used": freezes_used,
        "missions_completed": missions_completed,
        "full_day_missions": full_day_missions,
        "absence_days": absence_days,
        "consecutive_improvement_days": consecutive_improvement,
        "left_critical": left_critical,
    }


def _check_condition(definition: dict, stats: dict) -> bool:
    """Check if an achievement condition is met given user stats."""
    ctype = definition["condition_type"]
    ckey = definition["condition_key"]
    cval = definition["condition_value"]

    if ctype == "first_action":
        return stats.get(ckey, 0) >= cval

    if ctype == "streak":
        return stats.get(ckey, 0) >= cval

    if ctype == "count":
        return stats.get(ckey, 0) >= cval

    if ctype == "threshold":
        return stats.get(ckey, 0) >= cval

    if ctype == "comeback":
        # Check if user has a recent comeback of at least N days
        return stats.get("absence_days", 0) >= cval

    if ctype == "improvement":
        if ckey == "left_critical":
            return stats.get("left_critical", False)
        if ckey == "consecutive_improvement_days":
            return stats.get("consecutive_improvement_days", 0) >= cval
        if ckey in ("streak_recovered", "day_corrected", "week_turnaround",
                     "protein_avg_improved"):
            return stats.get(ckey, 0) >= cval
        return False

    if ctype == "mission_count":
        return stats.get("missions_completed", 0) >= cval

    if ctype == "challenge_count":
        return stats.get("challenges_completed", 0) >= cval

    if ctype == "season":
        return stats.get(ckey, 0) >= cval

    return False


# ---------------------------------------------------------------------------
# Main evaluation function
# ---------------------------------------------------------------------------

async def evaluate_achievements(
    user_id: int,
    session: AsyncSession,
) -> list[dict]:
    """Check all achievement conditions and unlock any newly earned ones.

    Returns list of newly unlocked achievements with their rewards.
    """
    # 1. Get already-unlocked achievement keys for this user
    already_q = await session.execute(
        select(UserAchievement.achievement_key).where(
            UserAchievement.user_id == user_id
        )
    )
    already_unlocked: set[str] = {r[0] for r in already_q.all()}

    # 2. Gather user stats
    stats = await _get_user_stats(user_id, session)

    # 3. Evaluate each achievement definition
    newly_unlocked: list[dict] = []

    for key, defn in ACHIEVEMENT_DEFINITIONS.items():
        if key in already_unlocked:
            continue

        if _check_condition(defn, stats):
            # Unlock the achievement
            unlock = UserAchievement(
                user_id=user_id,
                achievement_key=key,
            )
            session.add(unlock)
            newly_unlocked.append({
                "key": key,
                "name": defn["name"],
                "description": defn["description"],
                "icon": defn["icon"],
                "category": defn["category"],
                "rarity": defn["rarity"],
                "xp_reward": defn["xp_reward"],
                "coins_reward": defn["coins_reward"],
                "hidden": defn["hidden"],
            })
            logger.info(
                "Achievement unlocked: user_id=%d key=%s name=%s",
                user_id, key, defn["name"],
            )

    if newly_unlocked:
        await session.commit()
        logger.info(
            "User %d unlocked %d new achievements", user_id, len(newly_unlocked)
        )

    return newly_unlocked


async def get_all_achievements(
    user_id: int,
    session: AsyncSession,
) -> list[dict]:
    """Return all achievements with unlock status for a user."""
    unlocked_q = await session.execute(
        select(UserAchievement.achievement_key, UserAchievement.unlocked_at).where(
            UserAchievement.user_id == user_id
        )
    )
    unlocked_map = {r[0]: r[1] for r in unlocked_q.all()}

    result = []
    for key, defn in ACHIEVEMENT_DEFINITIONS.items():
        is_unlocked = key in unlocked_map
        # Hide hidden achievements that are not yet unlocked
        if defn["hidden"] and not is_unlocked:
            result.append({
                "key": key,
                "name": "???",
                "description": "Logro oculto — desbloquea para descubrir",
                "icon": "help-circle-outline",
                "category": defn["category"],
                "rarity": defn["rarity"],
                "unlocked": False,
                "unlocked_at": None,
                "hidden": True,
                "xp_reward": defn["xp_reward"],
                "coins_reward": defn["coins_reward"],
            })
        else:
            result.append({
                "key": key,
                "name": defn["name"],
                "description": defn["description"],
                "icon": defn["icon"],
                "category": defn["category"],
                "rarity": defn["rarity"],
                "unlocked": is_unlocked,
                "unlocked_at": str(unlocked_map[key]) if is_unlocked else None,
                "hidden": defn["hidden"],
                "xp_reward": defn["xp_reward"],
                "coins_reward": defn["coins_reward"],
            })

    return result


def get_achievement_count() -> int:
    """Return total number of achievement definitions."""
    return len(ACHIEVEMENT_DEFINITIONS)
