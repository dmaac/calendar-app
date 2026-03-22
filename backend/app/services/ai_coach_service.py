"""
AI Coach Service
-----------------
Provides personalized nutrition coaching powered by GPT-4o.

The coach builds a rich system prompt from the user's real data:
- Nutrition profile (goals, targets, weight, height, age)
- Today's food log (calories, macros consumed vs targets)
- Health alerts (chronic deficit, low protein, etc.)
- Streak and consistency data
- Onboarding preferences (diet type, pain points)

Three public methods:
  1. get_coach_response  — conversational chat with user context
  2. get_daily_insight   — proactive daily insight from real data
  3. get_meal_suggestion — suggests a meal based on remaining macros

SEC: System prompt is isolated from user content to mitigate prompt injection.
SEC: OpenAI errors are sanitized before reaching the client.
SEC: All outputs are length-capped before returning.
"""

import asyncio
import json
import logging
from datetime import date, datetime, time as dt_time, timedelta
from typing import Optional

import httpx
from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..core.config import settings
from ..models.ai_food_log import AIFoodLog
from ..models.daily_nutrition_summary import DailyNutritionSummary
from ..models.nutrition_profile import UserNutritionProfile
from ..models.onboarding_profile import OnboardingProfile
from ..models.user import User

logger = logging.getLogger(__name__)

# ─── Constants ────────────────────────────────────────────────────────────────

MAX_RETRIES = 2
RETRY_BASE_DELAY = 1.0
MAX_RESPONSE_LENGTH = 2000
MAX_USER_MESSAGE_LENGTH = 1000

# Map goal codes to human-readable Spanish labels
_GOAL_LABELS = {
    "lose_weight": "perder peso",
    "maintain": "mantener peso",
    "gain_muscle": "ganar musculo",
    "lose": "perder peso",
    "gain": "ganar peso",
}

_DIET_LABELS = {
    "omnivore": "omnivora",
    "vegetarian": "vegetariana",
    "vegan": "vegana",
    "keto": "cetogenica",
    "paleo": "paleo",
    "mediterranean": "mediterranea",
}

# ─── Disclaimer ───────────────────────────────────────────────────────────────

MEDICAL_DISCLAIMER = (
    "\n\n---\n*Soy un asistente de nutricion basado en IA. "
    "No soy medico ni nutricionista. Para diagnosticos o condiciones de salud, "
    "consulta siempre a un profesional.*"
)


# ─── User Context Builder ────────────────────────────────────────────────────

async def _build_user_context(user_id: int, session: AsyncSession) -> dict:
    """
    Gather all relevant user data for the coach's system prompt.
    Returns a dict with structured context fields.
    """
    today = date.today()
    today_start = datetime.combine(today, dt_time.min)
    today_end = datetime.combine(today, dt_time.max)

    # --- Query 1: User basic info ---
    user_stmt = select(User).where(User.id == user_id)
    user_result = await session.execute(user_stmt)
    user = user_result.scalar_one_or_none()

    # --- Query 2: Nutrition profile (targets + physical data) ---
    profile_stmt = select(UserNutritionProfile).where(
        UserNutritionProfile.user_id == user_id
    )
    profile_result = await session.execute(profile_stmt)
    profile = profile_result.scalar_one_or_none()

    # --- Query 3: Onboarding profile (goals, diet, pain points) ---
    onboarding_stmt = select(OnboardingProfile).where(
        OnboardingProfile.user_id == user_id
    )
    onboarding_result = await session.execute(onboarding_stmt)
    onboarding = onboarding_result.scalar_one_or_none()

    # --- Query 4: Today's food totals ---
    food_stmt = select(
        func.coalesce(func.sum(AIFoodLog.calories), 0.0).label("total_calories"),
        func.coalesce(func.sum(AIFoodLog.protein_g), 0.0).label("total_protein_g"),
        func.coalesce(func.sum(AIFoodLog.carbs_g), 0.0).label("total_carbs_g"),
        func.coalesce(func.sum(AIFoodLog.fats_g), 0.0).label("total_fats_g"),
        func.coalesce(func.sum(AIFoodLog.fiber_g), 0.0).label("total_fiber_g"),
        func.count(AIFoodLog.id).label("meals_logged"),
    ).where(
        AIFoodLog.user_id == user_id,
        AIFoodLog.logged_at >= today_start,
        AIFoodLog.logged_at <= today_end,
    )
    food_result = await session.execute(food_stmt)
    food_row = food_result.one()

    # --- Query 5: Today's recent meals (last 5) for context ---
    recent_meals_stmt = (
        select(AIFoodLog.food_name, AIFoodLog.calories, AIFoodLog.meal_type)
        .where(
            AIFoodLog.user_id == user_id,
            AIFoodLog.logged_at >= today_start,
            AIFoodLog.logged_at <= today_end,
        )
        .order_by(AIFoodLog.logged_at.desc())
        .limit(5)
    )
    recent_result = await session.execute(recent_meals_stmt)
    recent_meals = [
        {"name": r.food_name, "kcal": round(r.calories), "type": r.meal_type}
        for r in recent_result.all()
    ]

    # --- Query 6: Water intake today ---
    water_stmt = select(DailyNutritionSummary.water_ml).where(
        DailyNutritionSummary.user_id == user_id,
        DailyNutritionSummary.date == today,
    )
    water_result = await session.execute(water_stmt)
    water_row = water_result.first()
    water_ml = float(water_row.water_ml or 0) if water_row else 0.0

    # --- Query 7: Streak ---
    streak = await _calculate_streak_simple(user_id, today, session)

    # --- Build targets ---
    target_calories = 2000
    target_protein_g = 150
    target_carbs_g = 200
    target_fats_g = 65
    goal_raw = "maintain"
    weight_kg = None
    height_cm = None
    age = None
    gender = None
    diet_type = None
    pain_points = None

    if profile:
        target_calories = int(profile.target_calories or 2000)
        target_protein_g = int(profile.target_protein_g or 150)
        target_carbs_g = int(profile.target_carbs_g or 200)
        target_fats_g = int(getattr(profile, "target_fat_g", 65) or 65)
        goal_raw = str(profile.goal.value if profile.goal else "maintain")
        weight_kg = profile.weight_kg
        height_cm = profile.height_cm
        age = profile.age
        gender = str(profile.gender.value) if profile.gender else None

    if onboarding:
        if not profile:
            target_calories = int(onboarding.daily_calories or 2000)
            target_protein_g = int(onboarding.daily_protein_g or 150)
            target_carbs_g = int(onboarding.daily_carbs_g or 200)
            target_fats_g = int(onboarding.daily_fats_g or 65)
            goal_raw = onboarding.goal or "maintain"
            weight_kg = weight_kg or onboarding.weight_kg
            height_cm = height_cm or onboarding.height_cm
            gender = gender or onboarding.gender
        diet_type = onboarding.diet_type
        pain_points = onboarding.pain_points

    # --- Compute NutriScore (simple heuristic 0-100) ---
    consumed_cal = float(food_row.total_calories)
    nutri_score = _compute_nutri_score(
        consumed_calories=consumed_cal,
        target_calories=target_calories,
        consumed_protein=float(food_row.total_protein_g),
        target_protein=target_protein_g,
        consumed_fiber=float(food_row.total_fiber_g),
        meals_logged=int(food_row.meals_logged),
        water_ml=water_ml,
    )

    # --- Active health alerts (quick in-memory check) ---
    alerts = _generate_quick_alerts(
        consumed_cal=consumed_cal,
        target_cal=target_calories,
        consumed_protein=float(food_row.total_protein_g),
        target_protein=target_protein_g,
        water_ml=water_ml,
        meals_logged=int(food_row.meals_logged),
    )

    user_name = ""
    if user:
        user_name = user.first_name or user.email.split("@")[0]

    return {
        "user_name": user_name,
        "goal": _GOAL_LABELS.get(goal_raw, goal_raw),
        "weight_kg": weight_kg,
        "height_cm": height_cm,
        "age": age,
        "gender": gender,
        "diet_type": _DIET_LABELS.get(diet_type, diet_type) if diet_type else None,
        "pain_points": pain_points,
        "target_calories": target_calories,
        "target_protein_g": target_protein_g,
        "target_carbs_g": target_carbs_g,
        "target_fats_g": target_fats_g,
        "consumed_calories": round(consumed_cal),
        "consumed_protein_g": round(float(food_row.total_protein_g), 1),
        "consumed_carbs_g": round(float(food_row.total_carbs_g), 1),
        "consumed_fats_g": round(float(food_row.total_fats_g), 1),
        "consumed_fiber_g": round(float(food_row.total_fiber_g), 1),
        "remaining_calories": max(0, target_calories - round(consumed_cal)),
        "remaining_protein_g": max(0, target_protein_g - round(float(food_row.total_protein_g))),
        "remaining_carbs_g": max(0, target_carbs_g - round(float(food_row.total_carbs_g))),
        "remaining_fats_g": max(0, target_fats_g - round(float(food_row.total_fats_g))),
        "meals_logged": int(food_row.meals_logged),
        "recent_meals": recent_meals,
        "water_ml": water_ml,
        "nutri_score": nutri_score,
        "streak_days": streak,
        "alerts": alerts,
    }


def _compute_nutri_score(
    consumed_calories: float,
    target_calories: float,
    consumed_protein: float,
    target_protein: float,
    consumed_fiber: float,
    meals_logged: int,
    water_ml: float,
) -> int:
    """
    Simple NutriScore heuristic (0-100) based on how well the user
    is tracking toward daily goals.
    """
    score = 0

    # Calories adherence (0-30 points)
    if target_calories > 0 and consumed_calories > 0:
        cal_ratio = consumed_calories / target_calories
        if 0.8 <= cal_ratio <= 1.1:
            score += 30
        elif 0.6 <= cal_ratio <= 1.3:
            score += 20
        elif consumed_calories > 0:
            score += 10

    # Protein adherence (0-25 points)
    if target_protein > 0 and consumed_protein > 0:
        prot_ratio = consumed_protein / target_protein
        if prot_ratio >= 0.8:
            score += 25
        elif prot_ratio >= 0.5:
            score += 15
        else:
            score += 5

    # Fiber bonus (0-15 points)
    if consumed_fiber >= 20:
        score += 15
    elif consumed_fiber >= 10:
        score += 10
    elif consumed_fiber >= 5:
        score += 5

    # Meals logged (0-15 points) — 3+ meals = full points
    if meals_logged >= 3:
        score += 15
    elif meals_logged == 2:
        score += 10
    elif meals_logged == 1:
        score += 5

    # Hydration (0-15 points)
    if water_ml >= 2000:
        score += 15
    elif water_ml >= 1500:
        score += 10
    elif water_ml >= 500:
        score += 5

    return min(score, 100)


def _generate_quick_alerts(
    consumed_cal: float,
    target_cal: int,
    consumed_protein: float,
    target_protein: int,
    water_ml: float,
    meals_logged: int,
) -> list[str]:
    """Generate quick in-memory alerts for the coach context."""
    alerts = []

    if meals_logged == 0:
        alerts.append("No has registrado comidas hoy.")
        return alerts

    if target_cal > 0:
        cal_ratio = consumed_cal / target_cal
        if cal_ratio > 1.2:
            alerts.append(
                f"Estas {round(consumed_cal - target_cal)} kcal por encima de tu meta."
            )
        elif cal_ratio < 0.5 and meals_logged >= 2:
            alerts.append("Tu ingesta calorica esta muy baja hoy.")

    if target_protein > 0 and consumed_protein < target_protein * 0.5 and meals_logged >= 2:
        alerts.append(
            f"Proteina baja: {round(consumed_protein)}g de {target_protein}g objetivo."
        )

    if water_ml < 1000:
        alerts.append(f"Hidratacion baja: solo {round(water_ml)}ml de agua hoy.")

    return alerts


async def _calculate_streak_simple(
    user_id: int, today: date, session: AsyncSession
) -> int:
    """
    Simplified streak calculation. Counts consecutive days with at least 1
    food log ending on today (or yesterday).
    """
    from sqlalchemy import text

    sql = text("""
        WITH dated AS (
            SELECT DISTINCT DATE(logged_at) AS log_date
            FROM ai_food_log
            WHERE user_id = :user_id
              AND DATE(logged_at) <= :today
        ),
        grouped AS (
            SELECT log_date,
                   log_date - (ROW_NUMBER() OVER (ORDER BY log_date))::int * INTERVAL '1 day' AS grp
            FROM dated
        ),
        current_group AS (
            SELECT grp FROM grouped WHERE log_date = :today
        )
        SELECT COUNT(*) AS streak
        FROM grouped
        WHERE grp = (SELECT grp FROM current_group LIMIT 1)
    """)

    try:
        result = await session.execute(sql, {"user_id": user_id, "today": today})
        row = result.first()
        return int(row.streak) if row else 0
    except Exception:
        return 0


# ─── System Prompt Builders ──────────────────────────────────────────────────

def _build_coach_system_prompt(ctx: dict) -> str:
    """
    Build the system prompt for the conversational coach.
    SEC: This prompt is entirely server-controlled. User message is separate.
    """
    name = ctx["user_name"] or "usuario"
    goal = ctx["goal"]

    # Physical profile section
    physical_parts = []
    if ctx["weight_kg"]:
        physical_parts.append(f"Peso: {ctx['weight_kg']}kg")
    if ctx["height_cm"]:
        physical_parts.append(f"Altura: {ctx['height_cm']}cm")
    if ctx["age"]:
        physical_parts.append(f"Edad: {ctx['age']} anos")
    if ctx["gender"]:
        physical_parts.append(f"Genero: {ctx['gender']}")
    physical_info = ", ".join(physical_parts) if physical_parts else "No disponible"

    # Diet preferences
    diet_info = ctx["diet_type"] if ctx["diet_type"] else "Sin restricciones especificas"

    # Recent meals
    meals_text = "Ninguna registrada hoy."
    if ctx["recent_meals"]:
        meals_list = [
            f"- {m['name']} ({m['kcal']} kcal, {m['type']})"
            for m in ctx["recent_meals"]
        ]
        meals_text = "\n".join(meals_list)

    # Alerts
    alerts_text = "Ninguna alerta activa."
    if ctx["alerts"]:
        alerts_text = "\n".join(f"- {a}" for a in ctx["alerts"])

    return f"""Eres el coach de nutricion personal de {name} en la app Fitsi.
Tu rol es ser motivador, empatico y dar consejos practicos basados en los datos reales del usuario.

PERFIL DEL USUARIO:
- Nombre: {name}
- Objetivo: {goal}
- Datos fisicos: {physical_info}
- Dieta: {diet_info}

DATOS DE HOY:
- Calorias: {ctx['consumed_calories']} / {ctx['target_calories']} kcal (restan {ctx['remaining_calories']} kcal)
- Proteina: {ctx['consumed_protein_g']}g / {ctx['target_protein_g']}g (restan {ctx['remaining_protein_g']}g)
- Carbohidratos: {ctx['consumed_carbs_g']}g / {ctx['target_carbs_g']}g (restan {ctx['remaining_carbs_g']}g)
- Grasas: {ctx['consumed_fats_g']}g / {ctx['target_fats_g']}g (restan {ctx['remaining_fats_g']}g)
- Fibra: {ctx['consumed_fiber_g']}g
- Agua: {ctx['water_ml']}ml
- Comidas registradas: {ctx['meals_logged']}

COMIDAS RECIENTES:
{meals_text}

METRICAS:
- NutriScore: {ctx['nutri_score']}/100
- Racha: {ctx['streak_days']} dias consecutivos

ALERTAS ACTIVAS:
{alerts_text}

REGLAS:
1. Responde SIEMPRE en espanol
2. Se breve y directo (maximo 3-4 parrafos)
3. Usa los datos reales del usuario para personalizar tus respuestas
4. NUNCA des diagnosticos medicos ni recetes medicamentos
5. Si el usuario pregunta algo medico, recomienda consultar a un profesional
6. Se motivador pero honesto
7. Cuando sugieras comidas, ten en cuenta las preferencias de dieta del usuario
8. Usa emojis con moderacion (1-2 por respuesta maximo)
9. Si el usuario ha superado su meta de calorias, no lo reganes, motivalo a mejorar manana
10. Siempre incluye un actionable tip concreto"""


def _build_insight_system_prompt(ctx: dict) -> str:
    """Build system prompt for daily insight generation."""
    name = ctx["user_name"] or "usuario"

    return f"""Eres el coach de nutricion de {name} en Fitsi.
Genera UN insight diario personalizado basado en estos datos reales:

DATOS DE HOY:
- Calorias: {ctx['consumed_calories']} / {ctx['target_calories']} kcal
- Proteina: {ctx['consumed_protein_g']}g / {ctx['target_protein_g']}g
- Carbohidratos: {ctx['consumed_carbs_g']}g / {ctx['target_carbs_g']}g
- Grasas: {ctx['consumed_fats_g']}g / {ctx['target_fats_g']}g
- Fibra: {ctx['consumed_fiber_g']}g
- Agua: {ctx['water_ml']}ml
- Comidas registradas: {ctx['meals_logged']}
- NutriScore: {ctx['nutri_score']}/100
- Racha: {ctx['streak_days']} dias

Objetivo del usuario: {ctx['goal']}

REGLAS:
1. Responde en espanol
2. Maximo 2-3 oraciones
3. Basate en datos reales, no generes datos ficticios
4. Da un tip concreto y actionable
5. Se motivador
6. Si no hay comidas registradas, motiva a empezar
7. NO des diagnosticos medicos
8. Usa maximo 1 emoji"""


def _build_meal_suggestion_prompt(ctx: dict, meal_type: str) -> str:
    """Build system prompt for meal suggestion."""
    name = ctx["user_name"] or "usuario"

    meal_labels = {
        "breakfast": "desayuno",
        "lunch": "almuerzo",
        "dinner": "cena",
        "snack": "snack/colacion",
    }
    meal_label = meal_labels.get(meal_type, meal_type)
    diet_info = ctx["diet_type"] if ctx["diet_type"] else "Sin restricciones"

    return f"""Eres el coach de nutricion de {name} en Fitsi.
Sugiere una opcion de {meal_label} basada en lo que le falta hoy en macros.

MACROS RESTANTES HOY:
- Calorias restantes: {ctx['remaining_calories']} kcal
- Proteina restante: {ctx['remaining_protein_g']}g
- Carbohidratos restantes: {ctx['remaining_carbs_g']}g
- Grasas restantes: {ctx['remaining_fats_g']}g

PREFERENCIAS:
- Dieta: {diet_info}
- Objetivo: {ctx['goal']}

COMIDAS YA REGISTRADAS HOY:
{chr(10).join(f"- {m['name']} ({m['kcal']} kcal)" for m in ctx['recent_meals']) if ctx['recent_meals'] else "Ninguna"}

REGLAS:
1. Responde en espanol
2. Sugiere 1 comida concreta con ingredientes y porciones aproximadas
3. Incluye estimacion de calorias y macros de la sugerencia
4. Que sea realista y facil de preparar
5. Respeta las preferencias de dieta del usuario
6. Maximo 4-5 oraciones
7. NO des diagnosticos medicos
8. Si no quedan calorias/macros, sugiere algo ligero y saludable
9. Usa maximo 1 emoji

Responde SOLO con la sugerencia en formato JSON:
{{"meal_name": "nombre de la comida", "description": "descripcion breve con ingredientes y porciones", "estimated_calories": <number>, "estimated_protein_g": <number>, "estimated_carbs_g": <number>, "estimated_fats_g": <number>, "tip": "un consejo breve"}}"""


# ─── OpenAI API Call ──────────────────────────────────────────────────────────

async def _call_openai_chat(
    system_prompt: str,
    user_message: str,
    max_tokens: int = 500,
    temperature: float = 0.7,
) -> str:
    """
    Call OpenAI GPT-4o chat completion with retry logic.

    SEC: API key is only read from server-side settings.
    SEC: Errors are sanitized — no API key or internal details leak to client.
    """
    if not settings.openai_api_key:
        raise ValueError("El coach AI no esta disponible en este momento.")

    payload = {
        "model": "gpt-4o-mini",
        "max_tokens": max_tokens,
        "temperature": temperature,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
    }

    last_error: Optional[Exception] = None

    for attempt in range(1, MAX_RETRIES + 1):
        try:
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
            content = data["choices"][0]["message"]["content"].strip()

            # SEC: Cap response length
            return content[:MAX_RESPONSE_LENGTH]

        except httpx.HTTPStatusError as e:
            status_code = e.response.status_code
            last_error = e
            logger.error(
                "OpenAI API HTTP error in coach: status=%d (attempt %d/%d)",
                status_code, attempt, MAX_RETRIES,
            )
            if status_code in (401, 403):
                raise ValueError(
                    "Error de configuracion del servicio AI. Contacta soporte."
                )
            if attempt < MAX_RETRIES:
                await asyncio.sleep(RETRY_BASE_DELAY * (2 ** (attempt - 1)))
                continue

        except (httpx.TimeoutException, httpx.RequestError) as e:
            last_error = e
            logger.error(
                "OpenAI API connection error in coach: %s (attempt %d/%d)",
                type(e).__name__, attempt, MAX_RETRIES,
            )
            if attempt < MAX_RETRIES:
                await asyncio.sleep(RETRY_BASE_DELAY * (2 ** (attempt - 1)))
                continue

    logger.warning(
        "All %d AI coach attempts failed (last error: %s).",
        MAX_RETRIES,
        type(last_error).__name__ if last_error else "unknown",
    )
    raise ValueError(
        "El coach AI no pudo responder en este momento. Intenta de nuevo."
    )


# ─── Public API ───────────────────────────────────────────────────────────────

class AICoachService:
    """
    AI-powered nutrition coach that generates personalized responses
    using the user's real nutrition data.
    """

    @staticmethod
    async def get_coach_response(
        user_id: int,
        user_message: str,
        session: AsyncSession,
    ) -> dict:
        """
        Generate a contextual coach response to the user's message.

        Args:
            user_id: The authenticated user's ID.
            user_message: The user's chat message (max 1000 chars).
            session: Active async database session.

        Returns:
            Dict with 'response', 'nutri_score', 'streak_days', and 'disclaimer'.
        """
        # SEC: Truncate user message to prevent abuse
        safe_message = user_message[:MAX_USER_MESSAGE_LENGTH].strip()
        if not safe_message:
            return {
                "response": "No recibi tu mensaje. Intenta de nuevo.",
                "nutri_score": 0,
                "streak_days": 0,
                "disclaimer": MEDICAL_DISCLAIMER.strip(),
            }

        ctx = await _build_user_context(user_id, session)
        system_prompt = _build_coach_system_prompt(ctx)

        response_text = await _call_openai_chat(
            system_prompt=system_prompt,
            user_message=safe_message,
            max_tokens=600,
            temperature=0.7,
        )

        # Append disclaimer
        response_with_disclaimer = response_text + MEDICAL_DISCLAIMER

        return {
            "response": response_with_disclaimer,
            "nutri_score": ctx["nutri_score"],
            "streak_days": ctx["streak_days"],
            "consumed_calories": ctx["consumed_calories"],
            "target_calories": ctx["target_calories"],
            "disclaimer": MEDICAL_DISCLAIMER.strip(),
        }

    @staticmethod
    async def get_daily_insight(
        user_id: int,
        session: AsyncSession,
    ) -> dict:
        """
        Generate a proactive daily insight based on the user's real data.

        Returns:
            Dict with 'insight', 'nutri_score', 'streak_days', and 'disclaimer'.
        """
        ctx = await _build_user_context(user_id, session)
        system_prompt = _build_insight_system_prompt(ctx)

        # The "user message" for insight is a trigger, not user content
        insight_text = await _call_openai_chat(
            system_prompt=system_prompt,
            user_message="Dame mi insight del dia basado en mis datos.",
            max_tokens=300,
            temperature=0.8,
        )

        return {
            "insight": insight_text,
            "nutri_score": ctx["nutri_score"],
            "streak_days": ctx["streak_days"],
            "consumed_calories": ctx["consumed_calories"],
            "target_calories": ctx["target_calories"],
            "meals_logged": ctx["meals_logged"],
            "alerts": ctx["alerts"],
            "disclaimer": MEDICAL_DISCLAIMER.strip(),
        }

    @staticmethod
    async def get_meal_suggestion(
        user_id: int,
        meal_type: str,
        session: AsyncSession,
    ) -> dict:
        """
        Suggest a meal based on remaining macros for the day.

        Args:
            user_id: The authenticated user's ID.
            meal_type: One of 'breakfast', 'lunch', 'dinner', 'snack'.
            session: Active async database session.

        Returns:
            Dict with structured meal suggestion and nutritional estimates.
        """
        valid_types = {"breakfast", "lunch", "dinner", "snack"}
        if meal_type not in valid_types:
            raise ValueError(
                f"Tipo de comida invalido: '{meal_type}'. "
                f"Usa: {', '.join(sorted(valid_types))}"
            )

        ctx = await _build_user_context(user_id, session)
        system_prompt = _build_meal_suggestion_prompt(ctx, meal_type)

        raw_response = await _call_openai_chat(
            system_prompt=system_prompt,
            user_message=f"Sugiéreme un {meal_type} para hoy.",
            max_tokens=400,
            temperature=0.8,
        )

        # Try to parse structured JSON response
        suggestion = _parse_meal_suggestion(raw_response)

        return {
            "meal_type": meal_type,
            "suggestion": suggestion,
            "remaining_calories": ctx["remaining_calories"],
            "remaining_protein_g": ctx["remaining_protein_g"],
            "remaining_carbs_g": ctx["remaining_carbs_g"],
            "remaining_fats_g": ctx["remaining_fats_g"],
            "disclaimer": MEDICAL_DISCLAIMER.strip(),
        }


def _parse_meal_suggestion(raw: str) -> dict:
    """
    Try to parse the AI response as JSON for structured meal suggestion.
    Falls back to a text-based response if JSON parsing fails.
    """
    # Strip markdown fences if present
    text = raw.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1]) if len(lines) > 2 else text
    if text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    text = text.strip()

    # Remove json language marker
    if text.startswith("json"):
        text = text[4:].strip()

    try:
        parsed = json.loads(text)
        return {
            "meal_name": str(parsed.get("meal_name", "Sugerencia")),
            "description": str(parsed.get("description", text)),
            "estimated_calories": _safe_float(parsed.get("estimated_calories")),
            "estimated_protein_g": _safe_float(parsed.get("estimated_protein_g")),
            "estimated_carbs_g": _safe_float(parsed.get("estimated_carbs_g")),
            "estimated_fats_g": _safe_float(parsed.get("estimated_fats_g")),
            "tip": str(parsed.get("tip", "")),
        }
    except (json.JSONDecodeError, AttributeError):
        logger.warning("Could not parse meal suggestion as JSON, returning raw text.")
        return {
            "meal_name": "Sugerencia del coach",
            "description": text[:500],
            "estimated_calories": 0,
            "estimated_protein_g": 0,
            "estimated_carbs_g": 0,
            "estimated_fats_g": 0,
            "tip": "",
        }


def _safe_float(value, default: float = 0.0) -> float:
    """Safely convert a value to float."""
    if value is None:
        return default
    try:
        result = float(value)
        return max(0.0, min(result, 99999.0))
    except (TypeError, ValueError):
        return default
