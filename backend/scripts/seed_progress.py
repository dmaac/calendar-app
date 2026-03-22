"""
Seed script for Fitsia Progress System.

Seeds:
- 100 achievement definitions (10 categories x 10 each)
- 15 daily mission templates
- 10 weekly challenge templates
- 10 reward catalog items

Usage:
    cd backend && python -m scripts.seed_progress
"""

import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlmodel import select
from app.core.database import AsyncSessionLocal
from app.models.progress import (
    AchievementDefinition,
    DailyMission,
    RewardCatalog,
    WeeklyChallenge,
)

# ─── Achievement Definitions (100 total, 10 categories x ~10 each) ──────────

ACHIEVEMENTS = [
    # ── Constancia (consistency) ──
    {"code": "first_meal", "name": "Primera comida", "description": "Registra tu primera comida", "category": "constancia", "rarity": "common", "icon": "utensils", "xp_reward": 10, "coins_reward": 5, "condition_type": "count", "condition_value": 1, "sort_order": 1},
    {"code": "meals_10", "name": "10 comidas", "description": "Registra 10 comidas", "category": "constancia", "rarity": "common", "icon": "utensils", "xp_reward": 20, "coins_reward": 10, "condition_type": "count", "condition_value": 10, "sort_order": 2},
    {"code": "meals_50", "name": "50 comidas", "description": "Registra 50 comidas", "category": "constancia", "rarity": "common", "icon": "fire", "xp_reward": 50, "coins_reward": 25, "condition_type": "count", "condition_value": 50, "sort_order": 3},
    {"code": "meals_100", "name": "Centenar", "description": "Registra 100 comidas", "category": "constancia", "rarity": "rare", "icon": "star", "xp_reward": 100, "coins_reward": 50, "condition_type": "count", "condition_value": 100, "sort_order": 4},
    {"code": "meals_250", "name": "Cuarto de mil", "description": "Registra 250 comidas", "category": "constancia", "rarity": "rare", "icon": "crown", "xp_reward": 150, "coins_reward": 75, "condition_type": "count", "condition_value": 250, "sort_order": 5},
    {"code": "meals_500", "name": "Medio millar", "description": "Registra 500 comidas", "category": "constancia", "rarity": "epic", "icon": "gem", "xp_reward": 250, "coins_reward": 125, "condition_type": "count", "condition_value": 500, "sort_order": 6},
    {"code": "meals_1000", "name": "Mil comidas", "description": "Registra 1000 comidas", "category": "constancia", "rarity": "epic", "icon": "diamond", "xp_reward": 500, "coins_reward": 250, "condition_type": "count", "condition_value": 1000, "sort_order": 7},
    {"code": "days_active_7", "name": "Primera semana", "description": "Activo 7 dias", "category": "constancia", "rarity": "common", "icon": "calendar", "xp_reward": 30, "coins_reward": 15, "condition_type": "count", "condition_value": 7, "sort_order": 8},
    {"code": "days_active_30", "name": "Un mes activo", "description": "Activo 30 dias", "category": "constancia", "rarity": "rare", "icon": "calendar-check", "xp_reward": 100, "coins_reward": 50, "condition_type": "count", "condition_value": 30, "sort_order": 9},
    {"code": "days_active_90", "name": "Trimestre completo", "description": "Activo 90 dias", "category": "constancia", "rarity": "epic", "icon": "award", "xp_reward": 300, "coins_reward": 150, "condition_type": "count", "condition_value": 90, "sort_order": 10},

    # ── Adherencia (adherence) ──
    {"code": "calorie_hit_1", "name": "En el blanco", "description": "Alcanza tu meta calorica por primera vez", "category": "adherencia", "rarity": "common", "icon": "target", "xp_reward": 15, "coins_reward": 10, "condition_type": "count", "condition_value": 1, "sort_order": 11},
    {"code": "calorie_hit_7", "name": "Semana precisa", "description": "Alcanza tu meta calorica 7 veces", "category": "adherencia", "rarity": "common", "icon": "target", "xp_reward": 40, "coins_reward": 20, "condition_type": "count", "condition_value": 7, "sort_order": 12},
    {"code": "calorie_hit_30", "name": "Precision mensual", "description": "Alcanza tu meta calorica 30 veces", "category": "adherencia", "rarity": "rare", "icon": "bullseye", "xp_reward": 120, "coins_reward": 60, "condition_type": "count", "condition_value": 30, "sort_order": 13},
    {"code": "calorie_hit_100", "name": "Francotirador calorico", "description": "Alcanza tu meta calorica 100 veces", "category": "adherencia", "rarity": "epic", "icon": "crosshair", "xp_reward": 300, "coins_reward": 150, "condition_type": "count", "condition_value": 100, "sort_order": 14},
    {"code": "perfect_day_1", "name": "Dia perfecto", "description": "Todas las macros dentro del rango en un dia", "category": "adherencia", "rarity": "common", "icon": "check-circle", "xp_reward": 25, "coins_reward": 15, "condition_type": "count", "condition_value": 1, "sort_order": 15},
    {"code": "perfect_day_7", "name": "Semana perfecta", "description": "7 dias perfectos", "category": "adherencia", "rarity": "rare", "icon": "shield-check", "xp_reward": 80, "coins_reward": 40, "condition_type": "count", "condition_value": 7, "sort_order": 16},
    {"code": "perfect_day_30", "name": "Mes impecable", "description": "30 dias perfectos", "category": "adherencia", "rarity": "epic", "icon": "medal", "xp_reward": 250, "coins_reward": 125, "condition_type": "count", "condition_value": 30, "sort_order": 17},
    {"code": "under_budget_3", "name": "Moderacion", "description": "3 dias bajo tu meta calorica", "category": "adherencia", "rarity": "common", "icon": "trending-down", "xp_reward": 20, "coins_reward": 10, "condition_type": "count", "condition_value": 3, "sort_order": 18},
    {"code": "balanced_week", "name": "Equilibrio semanal", "description": "Todas las macros balanceadas por 7 dias", "category": "adherencia", "rarity": "rare", "icon": "scale", "xp_reward": 80, "coins_reward": 40, "condition_type": "count", "condition_value": 7, "sort_order": 19},
    {"code": "adherence_master", "name": "Maestro de adherencia", "description": "Adherencia >90% por 30 dias consecutivos", "category": "adherencia", "rarity": "epic", "icon": "trophy", "xp_reward": 400, "coins_reward": 200, "condition_type": "threshold", "condition_value": 30, "sort_order": 20},

    # ── Proteina ──
    {"code": "protein_hit_1", "name": "Proteina OK", "description": "Alcanza tu meta de proteina", "category": "proteina", "rarity": "common", "icon": "dumbbell", "xp_reward": 10, "coins_reward": 5, "condition_type": "count", "condition_value": 1, "sort_order": 21},
    {"code": "protein_hit_7", "name": "Semana proteica", "description": "Meta de proteina 7 dias", "category": "proteina", "rarity": "common", "icon": "dumbbell", "xp_reward": 40, "coins_reward": 20, "condition_type": "count", "condition_value": 7, "sort_order": 22},
    {"code": "protein_hit_30", "name": "Mes proteico", "description": "Meta de proteina 30 dias", "category": "proteina", "rarity": "rare", "icon": "arm-flex", "xp_reward": 120, "coins_reward": 60, "condition_type": "count", "condition_value": 30, "sort_order": 23},
    {"code": "protein_king", "name": "Rey de la proteina", "description": "Meta de proteina 100 dias", "category": "proteina", "rarity": "epic", "icon": "crown", "xp_reward": 300, "coins_reward": 150, "condition_type": "count", "condition_value": 100, "sort_order": 24},
    {"code": "high_protein_meal", "name": "Comida poderosa", "description": "Registra una comida con >40g proteina", "category": "proteina", "rarity": "common", "icon": "zap", "xp_reward": 15, "coins_reward": 5, "condition_type": "count", "condition_value": 1, "sort_order": 25},
    {"code": "protein_streak_3", "name": "Triple proteina", "description": "3 dias seguidos cumpliendo proteina", "category": "proteina", "rarity": "common", "icon": "flame", "xp_reward": 30, "coins_reward": 15, "condition_type": "streak", "condition_value": 3, "sort_order": 26},
    {"code": "protein_streak_14", "name": "Fortaleza proteica", "description": "14 dias seguidos cumpliendo proteina", "category": "proteina", "rarity": "rare", "icon": "shield", "xp_reward": 80, "coins_reward": 40, "condition_type": "streak", "condition_value": 14, "sort_order": 27},
    {"code": "protein_variety", "name": "Variedad proteica", "description": "10 fuentes de proteina distintas", "category": "proteina", "rarity": "common", "icon": "grid", "xp_reward": 25, "coins_reward": 15, "condition_type": "count", "condition_value": 10, "sort_order": 28},
    {"code": "protein_breakfast", "name": "Desayuno proteico", "description": "Desayuno con >20g proteina 7 veces", "category": "proteina", "rarity": "rare", "icon": "sun", "xp_reward": 50, "coins_reward": 25, "condition_type": "count", "condition_value": 7, "sort_order": 29},
    {"code": "protein_legend", "name": "Leyenda proteica", "description": "200 dias cumpliendo proteina", "category": "proteina", "rarity": "epic", "icon": "diamond", "xp_reward": 500, "coins_reward": 250, "condition_type": "count", "condition_value": 200, "sort_order": 30},

    # ── Equilibrio (balance) ──
    {"code": "macro_balance_1", "name": "Dia equilibrado", "description": "Todas las macros dentro del 10% del objetivo", "category": "equilibrio", "rarity": "common", "icon": "scale", "xp_reward": 20, "coins_reward": 10, "condition_type": "count", "condition_value": 1, "sort_order": 31},
    {"code": "macro_balance_7", "name": "Semana equilibrada", "description": "7 dias con macros equilibradas", "category": "equilibrio", "rarity": "rare", "icon": "scale", "xp_reward": 60, "coins_reward": 30, "condition_type": "count", "condition_value": 7, "sort_order": 32},
    {"code": "fiber_champion", "name": "Campeon de fibra", "description": "Meta de fibra 7 dias", "category": "equilibrio", "rarity": "common", "icon": "leaf", "xp_reward": 30, "coins_reward": 15, "condition_type": "count", "condition_value": 7, "sort_order": 33},
    {"code": "hydration_week", "name": "Semana hidratada", "description": "Meta de agua 7 dias seguidos", "category": "equilibrio", "rarity": "common", "icon": "droplet", "xp_reward": 35, "coins_reward": 20, "condition_type": "streak", "condition_value": 7, "sort_order": 34},
    {"code": "low_sodium_7", "name": "Bajo en sodio", "description": "Bajo en sodio 7 dias", "category": "equilibrio", "rarity": "common", "icon": "heart", "xp_reward": 25, "coins_reward": 15, "condition_type": "count", "condition_value": 7, "sort_order": 35},
    {"code": "veggie_lover", "name": "Amante de vegetales", "description": "Registra vegetales 14 dias", "category": "equilibrio", "rarity": "rare", "icon": "carrot", "xp_reward": 50, "coins_reward": 25, "condition_type": "count", "condition_value": 14, "sort_order": 36},
    {"code": "fruit_fan", "name": "Fan de frutas", "description": "Registra frutas 14 dias", "category": "equilibrio", "rarity": "common", "icon": "apple", "xp_reward": 40, "coins_reward": 20, "condition_type": "count", "condition_value": 14, "sort_order": 37},
    {"code": "no_sugar_3", "name": "Sin azucar", "description": "3 dias bajo en azucar", "category": "equilibrio", "rarity": "common", "icon": "shield-off", "xp_reward": 20, "coins_reward": 10, "condition_type": "count", "condition_value": 3, "sort_order": 38},
    {"code": "balance_master", "name": "Maestro del equilibrio", "description": "30 dias con macros equilibradas", "category": "equilibrio", "rarity": "epic", "icon": "award", "xp_reward": 200, "coins_reward": 100, "condition_type": "count", "condition_value": 30, "sort_order": 39},
    {"code": "nutrition_guru", "name": "Guru nutricional", "description": "60 dias con macros equilibradas", "category": "equilibrio", "rarity": "epic", "icon": "trophy", "xp_reward": 400, "coins_reward": 200, "condition_type": "count", "condition_value": 60, "sort_order": 40},

    # ── Reinicio (comeback) ──
    {"code": "comeback_1", "name": "Regrese", "description": "Vuelve despues de 3+ dias de inactividad", "category": "reinicio", "rarity": "common", "icon": "refresh", "xp_reward": 20, "coins_reward": 10, "condition_type": "comeback", "condition_value": 1, "sort_order": 41},
    {"code": "comeback_3", "name": "Resiliente", "description": "3 regresos despues de inactividad", "category": "reinicio", "rarity": "rare", "icon": "rotate-ccw", "xp_reward": 60, "coins_reward": 30, "condition_type": "comeback", "condition_value": 3, "sort_order": 42},
    {"code": "comeback_5", "name": "Imparable", "description": "5 regresos despues de inactividad", "category": "reinicio", "rarity": "rare", "icon": "anchor", "xp_reward": 100, "coins_reward": 50, "condition_type": "comeback", "condition_value": 5, "sort_order": 43},
    {"code": "comeback_10", "name": "Fenix", "description": "10 regresos — renaces cada vez", "category": "reinicio", "rarity": "epic", "icon": "phoenix", "xp_reward": 200, "coins_reward": 100, "condition_type": "comeback", "condition_value": 10, "sort_order": 44},
    {"code": "monday_restart", "name": "Lunes fresco", "description": "Registra comida un lunes despues de no hacerlo el fin de semana", "category": "reinicio", "rarity": "common", "icon": "calendar", "xp_reward": 15, "coins_reward": 10, "condition_type": "comeback", "condition_value": 1, "sort_order": 45},
    {"code": "new_year_start", "name": "Nuevo comienzo", "description": "Registra comida el 1 de enero", "category": "reinicio", "rarity": "rare", "icon": "sparkles", "xp_reward": 50, "coins_reward": 30, "condition_type": "count", "condition_value": 1, "sort_order": 46, "is_hidden": True},
    {"code": "post_holiday", "name": "Vuelta de feriado", "description": "Registra comida despues de un feriado largo", "category": "reinicio", "rarity": "common", "icon": "sun", "xp_reward": 20, "coins_reward": 10, "condition_type": "comeback", "condition_value": 1, "sort_order": 47},
    {"code": "second_chance", "name": "Segunda oportunidad", "description": "Mejora tu adherencia 2 dias despues de perder racha", "category": "reinicio", "rarity": "common", "icon": "heart", "xp_reward": 25, "coins_reward": 15, "condition_type": "improvement", "condition_value": 1, "sort_order": 48},
    {"code": "recovery_week", "name": "Semana de recuperacion", "description": "7 dias activo despues de perder racha", "category": "reinicio", "rarity": "rare", "icon": "trending-up", "xp_reward": 80, "coins_reward": 40, "condition_type": "streak", "condition_value": 7, "sort_order": 49},
    {"code": "never_give_up", "name": "Nunca me rindo", "description": "20 regresos — la perseverancia es tu superpoder", "category": "reinicio", "rarity": "epic", "icon": "infinity", "xp_reward": 400, "coins_reward": 200, "condition_type": "comeback", "condition_value": 20, "sort_order": 50},

    # ── Rachas (streaks) ──
    {"code": "streak_3", "name": "Triple", "description": "Racha de 3 dias", "category": "rachas", "rarity": "common", "icon": "flame", "xp_reward": 15, "coins_reward": 10, "condition_type": "streak", "condition_value": 3, "sort_order": 51},
    {"code": "streak_7", "name": "Semana completa", "description": "Racha de 7 dias", "category": "rachas", "rarity": "common", "icon": "fire", "xp_reward": 40, "coins_reward": 25, "condition_type": "streak", "condition_value": 7, "sort_order": 52},
    {"code": "streak_14", "name": "Quincena", "description": "Racha de 14 dias", "category": "rachas", "rarity": "rare", "icon": "fire", "xp_reward": 80, "coins_reward": 50, "condition_type": "streak", "condition_value": 14, "sort_order": 53},
    {"code": "streak_30", "name": "Mes completo", "description": "Racha de 30 dias", "category": "rachas", "rarity": "rare", "icon": "flame", "xp_reward": 150, "coins_reward": 100, "condition_type": "streak", "condition_value": 30, "sort_order": 54},
    {"code": "streak_60", "name": "Dos meses", "description": "Racha de 60 dias", "category": "rachas", "rarity": "epic", "icon": "zap", "xp_reward": 300, "coins_reward": 200, "condition_type": "streak", "condition_value": 60, "sort_order": 55},
    {"code": "streak_90", "name": "Trimestre legendario", "description": "Racha de 90 dias", "category": "rachas", "rarity": "epic", "icon": "lightning", "xp_reward": 500, "coins_reward": 300, "condition_type": "streak", "condition_value": 90, "sort_order": 56},
    {"code": "streak_180", "name": "Medio ano", "description": "Racha de 180 dias", "category": "rachas", "rarity": "epic", "icon": "crown", "xp_reward": 800, "coins_reward": 500, "condition_type": "streak", "condition_value": 180, "sort_order": 57},
    {"code": "streak_365", "name": "Un ano completo", "description": "Racha de 365 dias", "category": "rachas", "rarity": "epic", "icon": "diamond", "xp_reward": 2000, "coins_reward": 1000, "condition_type": "streak", "condition_value": 365, "sort_order": 58, "is_hidden": True},
    {"code": "weekend_streak_4", "name": "Fines de semana activo", "description": "4 fines de semana consecutivos con registro", "category": "rachas", "rarity": "rare", "icon": "calendar", "xp_reward": 60, "coins_reward": 30, "condition_type": "streak", "condition_value": 4, "sort_order": 59},
    {"code": "freeze_saver", "name": "Salvado por el freeze", "description": "Usa tu primer streak freeze", "category": "rachas", "rarity": "common", "icon": "snowflake", "xp_reward": 10, "coins_reward": 5, "condition_type": "count", "condition_value": 1, "sort_order": 60},

    # ── Mejora (improvement) ──
    {"code": "improve_3d", "name": "Mejorando", "description": "3 dias consecutivos de mejora", "category": "mejora", "rarity": "common", "icon": "trending-up", "xp_reward": 25, "coins_reward": 15, "condition_type": "improvement", "condition_value": 1, "sort_order": 61},
    {"code": "improve_7d", "name": "Tendencia positiva", "description": "7 dias de mejora general", "category": "mejora", "rarity": "rare", "icon": "trending-up", "xp_reward": 60, "coins_reward": 30, "condition_type": "improvement", "condition_value": 3, "sort_order": 62},
    {"code": "score_jump_10", "name": "Salto de 10 puntos", "description": "Mejora tu score en 10 puntos en una semana", "category": "mejora", "rarity": "common", "icon": "arrow-up", "xp_reward": 30, "coins_reward": 15, "condition_type": "improvement", "condition_value": 1, "sort_order": 63},
    {"code": "score_jump_25", "name": "Transformacion", "description": "Mejora tu score en 25 puntos en un mes", "category": "mejora", "rarity": "rare", "icon": "rocket", "xp_reward": 80, "coins_reward": 40, "condition_type": "improvement", "condition_value": 1, "sort_order": 64},
    {"code": "green_zone_first", "name": "Zona verde", "description": "Alcanza la zona verde por primera vez", "category": "mejora", "rarity": "common", "icon": "check-circle", "xp_reward": 20, "coins_reward": 10, "condition_type": "threshold", "condition_value": 80, "sort_order": 65},
    {"code": "green_zone_7", "name": "Semana verde", "description": "7 dias en zona verde", "category": "mejora", "rarity": "rare", "icon": "shield-check", "xp_reward": 80, "coins_reward": 40, "condition_type": "threshold", "condition_value": 7, "sort_order": 66},
    {"code": "red_to_green", "name": "De rojo a verde", "description": "Pasa de zona roja a verde en 7 dias", "category": "mejora", "rarity": "epic", "icon": "sunrise", "xp_reward": 150, "coins_reward": 75, "condition_type": "improvement", "condition_value": 1, "sort_order": 67},
    {"code": "consistent_improve", "name": "Mejora constante", "description": "10 semanas de mejora continua", "category": "mejora", "rarity": "epic", "icon": "award", "xp_reward": 300, "coins_reward": 150, "condition_type": "improvement", "condition_value": 10, "sort_order": 68},
    {"code": "beat_yesterday", "name": "Mejor que ayer", "description": "Supera tu score del dia anterior 5 veces", "category": "mejora", "rarity": "common", "icon": "chevron-up", "xp_reward": 25, "coins_reward": 10, "condition_type": "improvement", "condition_value": 5, "sort_order": 69},
    {"code": "improvement_legend", "name": "Leyenda de mejora", "description": "50 eventos de mejora", "category": "mejora", "rarity": "epic", "icon": "trophy", "xp_reward": 500, "coins_reward": 250, "condition_type": "improvement", "condition_value": 50, "sort_order": 70},

    # ── Misiones (missions) ──
    {"code": "mission_first", "name": "Primera mision", "description": "Completa tu primera mision diaria", "category": "misiones", "rarity": "common", "icon": "flag", "xp_reward": 10, "coins_reward": 5, "condition_type": "missions", "condition_value": 1, "sort_order": 71},
    {"code": "missions_10", "name": "10 misiones", "description": "Completa 10 misiones diarias", "category": "misiones", "rarity": "common", "icon": "flag", "xp_reward": 30, "coins_reward": 15, "condition_type": "missions", "condition_value": 10, "sort_order": 72},
    {"code": "missions_50", "name": "50 misiones", "description": "Completa 50 misiones diarias", "category": "misiones", "rarity": "rare", "icon": "target", "xp_reward": 80, "coins_reward": 40, "condition_type": "missions", "condition_value": 50, "sort_order": 73},
    {"code": "missions_100", "name": "Centurion de misiones", "description": "Completa 100 misiones diarias", "category": "misiones", "rarity": "rare", "icon": "award", "xp_reward": 150, "coins_reward": 75, "condition_type": "missions", "condition_value": 100, "sort_order": 74},
    {"code": "missions_500", "name": "Comandante de misiones", "description": "Completa 500 misiones diarias", "category": "misiones", "rarity": "epic", "icon": "crown", "xp_reward": 400, "coins_reward": 200, "condition_type": "missions", "condition_value": 500, "sort_order": 75},
    {"code": "triple_mission_1", "name": "Triple completo", "description": "Completa las 3 misiones diarias en un dia", "category": "misiones", "rarity": "common", "icon": "check-double", "xp_reward": 20, "coins_reward": 10, "condition_type": "count", "condition_value": 1, "sort_order": 76},
    {"code": "triple_mission_7", "name": "Semana de triples", "description": "Completa las 3 misiones diarias 7 dias", "category": "misiones", "rarity": "rare", "icon": "star", "xp_reward": 80, "coins_reward": 40, "condition_type": "count", "condition_value": 7, "sort_order": 77},
    {"code": "hard_mission_1", "name": "Mision dificil", "description": "Completa tu primera mision dificil", "category": "misiones", "rarity": "common", "icon": "shield", "xp_reward": 25, "coins_reward": 15, "condition_type": "count", "condition_value": 1, "sort_order": 78},
    {"code": "hard_mission_10", "name": "Veterano", "description": "Completa 10 misiones dificiles", "category": "misiones", "rarity": "rare", "icon": "sword", "xp_reward": 80, "coins_reward": 40, "condition_type": "count", "condition_value": 10, "sort_order": 79},
    {"code": "mission_legend", "name": "Leyenda de misiones", "description": "1000 misiones completadas", "category": "misiones", "rarity": "epic", "icon": "diamond", "xp_reward": 800, "coins_reward": 400, "condition_type": "missions", "condition_value": 1000, "sort_order": 80},

    # ── Desafios (challenges) ──
    {"code": "challenge_first", "name": "Primer desafio", "description": "Completa tu primer desafio semanal", "category": "desafios", "rarity": "common", "icon": "shield", "xp_reward": 20, "coins_reward": 10, "condition_type": "count", "condition_value": 1, "sort_order": 81},
    {"code": "challenges_5", "name": "5 desafios", "description": "Completa 5 desafios semanales", "category": "desafios", "rarity": "common", "icon": "shield", "xp_reward": 50, "coins_reward": 25, "condition_type": "count", "condition_value": 5, "sort_order": 82},
    {"code": "challenges_10", "name": "Retador", "description": "Completa 10 desafios semanales", "category": "desafios", "rarity": "rare", "icon": "trophy", "xp_reward": 100, "coins_reward": 50, "condition_type": "count", "condition_value": 10, "sort_order": 83},
    {"code": "challenges_25", "name": "Campeon de desafios", "description": "Completa 25 desafios semanales", "category": "desafios", "rarity": "rare", "icon": "crown", "xp_reward": 200, "coins_reward": 100, "condition_type": "count", "condition_value": 25, "sort_order": 84},
    {"code": "challenges_50", "name": "Leyenda de desafios", "description": "Completa 50 desafios semanales", "category": "desafios", "rarity": "epic", "icon": "gem", "xp_reward": 400, "coins_reward": 200, "condition_type": "count", "condition_value": 50, "sort_order": 85},
    {"code": "hard_challenge_1", "name": "Desafio extremo", "description": "Completa tu primer desafio dificil", "category": "desafios", "rarity": "rare", "icon": "flame", "xp_reward": 50, "coins_reward": 30, "condition_type": "count", "condition_value": 1, "sort_order": 86},
    {"code": "challenge_streak_4", "name": "4 semanas seguidas", "description": "Completa desafios 4 semanas consecutivas", "category": "desafios", "rarity": "rare", "icon": "calendar-check", "xp_reward": 120, "coins_reward": 60, "condition_type": "streak", "condition_value": 4, "sort_order": 87},
    {"code": "challenge_streak_12", "name": "Trimestre de desafios", "description": "Completa desafios 12 semanas consecutivas", "category": "desafios", "rarity": "epic", "icon": "award", "xp_reward": 350, "coins_reward": 175, "condition_type": "streak", "condition_value": 12, "sort_order": 88},
    {"code": "overachiever", "name": "Sobrehumano", "description": "Completa un desafio antes del miercoles", "category": "desafios", "rarity": "common", "icon": "zap", "xp_reward": 30, "coins_reward": 15, "condition_type": "count", "condition_value": 1, "sort_order": 89},
    {"code": "challenge_master", "name": "Maestro de desafios", "description": "100 desafios completados", "category": "desafios", "rarity": "epic", "icon": "diamond", "xp_reward": 600, "coins_reward": 300, "condition_type": "count", "condition_value": 100, "sort_order": 90},

    # ── Temporadas (seasons) ──
    {"code": "season_join", "name": "Participante", "description": "Participa en tu primera temporada", "category": "temporadas", "rarity": "common", "icon": "flag", "xp_reward": 15, "coins_reward": 10, "condition_type": "count", "condition_value": 1, "sort_order": 91},
    {"code": "season_complete", "name": "Temporada completa", "description": "Completa una temporada entera", "category": "temporadas", "rarity": "rare", "icon": "trophy", "xp_reward": 100, "coins_reward": 50, "condition_type": "count", "condition_value": 1, "sort_order": 92},
    {"code": "season_top10", "name": "Top 10", "description": "Termina en el top 10% de una temporada", "category": "temporadas", "rarity": "rare", "icon": "medal", "xp_reward": 150, "coins_reward": 75, "condition_type": "threshold", "condition_value": 10, "sort_order": 93},
    {"code": "season_winner", "name": "Ganador de temporada", "description": "Gana una temporada (top 1%)", "category": "temporadas", "rarity": "epic", "icon": "crown", "xp_reward": 500, "coins_reward": 250, "condition_type": "threshold", "condition_value": 1, "sort_order": 94},
    {"code": "seasons_3", "name": "Veterano de temporadas", "description": "Participa en 3 temporadas", "category": "temporadas", "rarity": "rare", "icon": "star", "xp_reward": 80, "coins_reward": 40, "condition_type": "count", "condition_value": 3, "sort_order": 95},
    {"code": "seasons_6", "name": "Leyenda de temporadas", "description": "Participa en 6 temporadas", "category": "temporadas", "rarity": "epic", "icon": "award", "xp_reward": 200, "coins_reward": 100, "condition_type": "count", "condition_value": 6, "sort_order": 96},
    {"code": "season_perfect", "name": "Temporada perfecta", "description": "No pierdas ningun dia durante una temporada", "category": "temporadas", "rarity": "epic", "icon": "diamond", "xp_reward": 400, "coins_reward": 200, "condition_type": "streak", "condition_value": 28, "sort_order": 97, "is_hidden": True},
    {"code": "season_improved", "name": "Mejor temporada", "description": "Mejora tu ranking respecto a la temporada anterior", "category": "temporadas", "rarity": "rare", "icon": "trending-up", "xp_reward": 80, "coins_reward": 40, "condition_type": "improvement", "condition_value": 1, "sort_order": 98},
    {"code": "multi_season_win", "name": "Dinastia", "description": "Gana 2 temporadas seguidas", "category": "temporadas", "rarity": "epic", "icon": "crown", "xp_reward": 800, "coins_reward": 400, "condition_type": "count", "condition_value": 2, "sort_order": 99, "is_hidden": True},
    {"code": "level_20", "name": "Fitsia Supremo", "description": "Alcanza el nivel 20", "category": "temporadas", "rarity": "epic", "icon": "gem", "xp_reward": 1000, "coins_reward": 500, "condition_type": "level", "condition_value": 20, "sort_order": 100, "is_hidden": True},
]

# ─── Daily Mission Templates (15) ───────────────────────────────────────────

DAILY_MISSIONS = [
    {"code": "register_breakfast", "name": "Registra desayuno", "description": "Registra al menos una comida de desayuno hoy", "xp_reward": 10, "coins_reward": 5, "condition_type": "register_meal", "condition_value": 1, "difficulty": "easy", "target_audience": "all"},
    {"code": "register_lunch", "name": "Registra almuerzo", "description": "Registra al menos una comida de almuerzo hoy", "xp_reward": 10, "coins_reward": 5, "condition_type": "register_meal", "condition_value": 1, "difficulty": "easy", "target_audience": "all"},
    {"code": "register_dinner", "name": "Registra cena", "description": "Registra al menos una comida de cena hoy", "xp_reward": 10, "coins_reward": 5, "condition_type": "register_meal", "condition_value": 1, "difficulty": "easy", "target_audience": "all"},
    {"code": "register_3_meals", "name": "Dia completo", "description": "Registra al menos 3 comidas hoy", "xp_reward": 20, "coins_reward": 10, "condition_type": "register_3_meals", "condition_value": 3, "difficulty": "medium", "target_audience": "all"},
    {"code": "hit_calories", "name": "Meta calorica", "description": "Queda dentro del 10% de tu meta calorica", "xp_reward": 25, "coins_reward": 15, "condition_type": "hit_calories", "condition_value": 1, "difficulty": "medium", "target_audience": "active"},
    {"code": "hit_protein", "name": "Meta de proteina", "description": "Alcanza al menos 90% de tu meta de proteina", "xp_reward": 20, "coins_reward": 10, "condition_type": "hit_protein", "condition_value": 1, "difficulty": "medium", "target_audience": "active"},
    {"code": "early_log", "name": "Madrugador", "description": "Registra una comida antes de medioda", "xp_reward": 15, "coins_reward": 5, "condition_type": "register_before_noon", "condition_value": 1, "difficulty": "easy", "target_audience": "all"},
    {"code": "complete_day_full", "name": "Dia completo 100%", "description": "Registra desayuno, almuerzo y cena", "xp_reward": 30, "coins_reward": 15, "condition_type": "complete_day", "condition_value": 1, "difficulty": "hard", "target_audience": "active"},
    {"code": "drink_water", "name": "Hidratacion", "description": "Registra al menos 6 vasos de agua", "xp_reward": 10, "coins_reward": 5, "condition_type": "register_meal", "condition_value": 6, "difficulty": "easy", "target_audience": "all"},
    {"code": "log_snack", "name": "Registra snack", "description": "Registra al menos un snack saludable", "xp_reward": 10, "coins_reward": 5, "condition_type": "register_meal", "condition_value": 1, "difficulty": "easy", "target_audience": "new"},
    {"code": "scan_food", "name": "Escanea comida", "description": "Usa el escaner AI para registrar una comida", "xp_reward": 15, "coins_reward": 10, "condition_type": "register_meal", "condition_value": 1, "difficulty": "easy", "target_audience": "new"},
    {"code": "balanced_macros", "name": "Macros equilibradas", "description": "Todas las macros dentro del 15% del objetivo", "xp_reward": 30, "coins_reward": 15, "condition_type": "hit_calories", "condition_value": 1, "difficulty": "hard", "target_audience": "active"},
    {"code": "no_skip", "name": "Sin saltarse comidas", "description": "No te saltes ninguna comida principal hoy", "xp_reward": 20, "coins_reward": 10, "condition_type": "complete_day", "condition_value": 1, "difficulty": "medium", "target_audience": "at_risk"},
    {"code": "log_before_8pm", "name": "Todo registrado a tiempo", "description": "Registra todas tus comidas antes de las 8pm", "xp_reward": 15, "coins_reward": 10, "condition_type": "register_meal", "condition_value": 1, "difficulty": "medium", "target_audience": "active"},
    {"code": "first_meal_today", "name": "Empieza el dia", "description": "Registra tu primera comida del dia", "xp_reward": 10, "coins_reward": 5, "condition_type": "register_meal", "condition_value": 1, "difficulty": "easy", "target_audience": "at_risk"},
]

# ─── Weekly Challenge Templates (10) ────────────────────────────────────────

WEEKLY_CHALLENGES = [
    {"code": "week_5_days", "name": "5 de 7", "description": "Registra comidas al menos 5 de los 7 dias", "xp_reward": 100, "coins_reward": 50, "condition_type": "register_meal", "condition_value": 5, "difficulty": "easy"},
    {"code": "week_all_days", "name": "Semana completa", "description": "Registra comidas los 7 dias de la semana", "xp_reward": 150, "coins_reward": 75, "condition_type": "register_meal", "condition_value": 7, "difficulty": "medium"},
    {"code": "week_calorie_5", "name": "Semana calorica", "description": "Alcanza tu meta calorica 5 de 7 dias", "xp_reward": 120, "coins_reward": 60, "condition_type": "hit_calories", "condition_value": 5, "difficulty": "medium"},
    {"code": "week_protein_5", "name": "Semana proteica", "description": "Alcanza tu meta de proteina 5 de 7 dias", "xp_reward": 120, "coins_reward": 60, "condition_type": "hit_protein", "condition_value": 5, "difficulty": "medium"},
    {"code": "week_3_meals_5", "name": "Semana de 3 comidas", "description": "Registra 3+ comidas al dia por 5 dias", "xp_reward": 130, "coins_reward": 65, "condition_type": "register_3_meals", "condition_value": 5, "difficulty": "hard"},
    {"code": "week_15_meals", "name": "15 comidas", "description": "Registra al menos 15 comidas esta semana", "xp_reward": 100, "coins_reward": 50, "condition_type": "register_meal", "condition_value": 15, "difficulty": "medium"},
    {"code": "week_missions_10", "name": "10 misiones", "description": "Completa 10 misiones diarias esta semana", "xp_reward": 140, "coins_reward": 70, "condition_type": "complete_day", "condition_value": 10, "difficulty": "hard"},
    {"code": "week_improve", "name": "Semana de mejora", "description": "Mejora tu score de adherencia cada dia por 3 dias", "xp_reward": 110, "coins_reward": 55, "condition_type": "hit_calories", "condition_value": 3, "difficulty": "medium"},
    {"code": "week_balanced", "name": "Equilibrio semanal", "description": "Todas las macros balanceadas 4 de 7 dias", "xp_reward": 130, "coins_reward": 65, "condition_type": "hit_calories", "condition_value": 4, "difficulty": "hard"},
    {"code": "week_early_log", "name": "Semana madrugadora", "description": "Registra antes de medioda 5 de 7 dias", "xp_reward": 100, "coins_reward": 50, "condition_type": "register_before_noon", "condition_value": 5, "difficulty": "medium"},
]

# ─── Reward Catalog (10 items) ──────────────────────────────────────────────

REWARDS = [
    {"code": "streak_freeze_1", "name": "Streak Freeze", "description": "Protege tu racha por 1 dia de inactividad", "cost_coins": 50, "reward_type": "streak_freeze", "stock": -1},
    {"code": "streak_freeze_3", "name": "Triple Freeze", "description": "Pack de 3 streak freezes", "cost_coins": 120, "reward_type": "streak_freeze", "stock": -1},
    {"code": "xp_boost_2x_24h", "name": "XP Boost 2x (24h)", "description": "Duplica tu XP por 24 horas", "cost_coins": 100, "reward_type": "xp_multiplier", "stock": -1},
    {"code": "badge_golden_fork", "name": "Badge: Tenedor Dorado", "description": "Badge exclusivo para tu perfil", "cost_coins": 200, "reward_type": "badge", "stock": -1},
    {"code": "badge_diamond_plate", "name": "Badge: Plato Diamante", "description": "Badge premium para tu perfil", "cost_coins": 500, "reward_type": "badge", "stock": 100},
    {"code": "theme_dark_gold", "name": "Tema: Oro Oscuro", "description": "Tema visual exclusivo para la app", "cost_coins": 300, "reward_type": "theme", "stock": -1},
    {"code": "theme_neon_green", "name": "Tema: Neon Verde", "description": "Tema visual neon para la app", "cost_coins": 300, "reward_type": "theme", "stock": -1},
    {"code": "coach_motivation", "name": "Mensaje del Coach", "description": "Recibe un mensaje motivacional personalizado del AI Coach", "cost_coins": 75, "reward_type": "coach_message", "stock": -1},
    {"code": "special_challenge", "name": "Desafio Especial", "description": "Desbloquea un desafio semanal exclusivo con recompensas extra", "cost_coins": 150, "reward_type": "special_challenge", "stock": -1},
    {"code": "profile_frame_fire", "name": "Marco: Fuego", "description": "Marco animado de fuego para tu foto de perfil", "cost_coins": 400, "reward_type": "badge", "stock": 50},
]


async def seed_achievements(session):
    """Seed achievement definitions (upsert by code)."""
    count = 0
    for ach_data in ACHIEVEMENTS:
        result = await session.execute(
            select(AchievementDefinition).where(AchievementDefinition.code == ach_data["code"])
        )
        existing = result.scalar_one_or_none()
        if existing:
            for k, v in ach_data.items():
                setattr(existing, k, v)
        else:
            session.add(AchievementDefinition(**ach_data))
            count += 1
    await session.flush()
    return count


async def seed_daily_missions(session):
    """Seed daily mission templates (upsert by code)."""
    count = 0
    for m_data in DAILY_MISSIONS:
        result = await session.execute(
            select(DailyMission).where(DailyMission.code == m_data["code"])
        )
        existing = result.scalar_one_or_none()
        if existing:
            for k, v in m_data.items():
                setattr(existing, k, v)
        else:
            session.add(DailyMission(**m_data))
            count += 1
    await session.flush()
    return count


async def seed_weekly_challenges(session):
    """Seed weekly challenge templates (upsert by code)."""
    count = 0
    for c_data in WEEKLY_CHALLENGES:
        result = await session.execute(
            select(WeeklyChallenge).where(WeeklyChallenge.code == c_data["code"])
        )
        existing = result.scalar_one_or_none()
        if existing:
            for k, v in c_data.items():
                setattr(existing, k, v)
        else:
            session.add(WeeklyChallenge(**c_data))
            count += 1
    await session.flush()
    return count


async def seed_rewards(session):
    """Seed reward catalog (upsert by code)."""
    count = 0
    for r_data in REWARDS:
        result = await session.execute(
            select(RewardCatalog).where(RewardCatalog.code == r_data["code"])
        )
        existing = result.scalar_one_or_none()
        if existing:
            for k, v in r_data.items():
                setattr(existing, k, v)
        else:
            session.add(RewardCatalog(**r_data))
            count += 1
    await session.flush()
    return count


async def seed_all():
    """Run all seed functions."""
    async with AsyncSessionLocal() as session:
        ach_count = await seed_achievements(session)
        mission_count = await seed_daily_missions(session)
        challenge_count = await seed_weekly_challenges(session)
        reward_count = await seed_rewards(session)
        await session.commit()

        print(f"Seeded {ach_count} new achievements (100 total definitions)")
        print(f"Seeded {mission_count} new daily missions (15 total templates)")
        print(f"Seeded {challenge_count} new weekly challenges (10 total templates)")
        print(f"Seeded {reward_count} new rewards (10 total catalog items)")
        print("Done!")


if __name__ == "__main__":
    asyncio.run(seed_all())
