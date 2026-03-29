"""
Shopping List Service -- generates a simple ingredient list from recovery plan meals.

AI TOKEN COST: ZERO. 100% rule-based.
Groups ingredients by category: proteinas, carbohidratos, vegetales, otros.
All items in Spanish (target audience: LATAM).
"""

from __future__ import annotations

import logging
from datetime import date, timedelta

from sqlmodel.ext.asyncio.session import AsyncSession

from .nutrition_risk_service import _get_goals
from .recovery_plan_service import (
    HIGH_PROTEIN_MEALS,
    BALANCED_MEALS,
    LIGHT_MEALS,
    CALORIE_DENSE_MEALS,
    HIGH_FIBER_MEALS,
    _select_meals,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Ingredient extraction rules (keyword -> category + item)
# ---------------------------------------------------------------------------

INGREDIENT_MAP: dict[str, dict] = {
    # Proteinas
    "yogurt": {"name": "Yogurt griego", "category": "proteinas", "unit": "unidad"},
    "salmon": {"name": "Salmon fresco", "category": "proteinas", "unit": "filete"},
    "proteina": {"name": "Proteina en polvo", "category": "proteinas", "unit": "scoop"},
    "pollo": {"name": "Pechuga de pollo", "category": "proteinas", "unit": "unidad"},
    "pechuga": {"name": "Pechuga de pollo", "category": "proteinas", "unit": "unidad"},
    "huevo": {"name": "Huevos", "category": "proteinas", "unit": "unidad"},
    "atun": {"name": "Atun fresco", "category": "proteinas", "unit": "filete"},
    "cottage": {"name": "Cottage cheese", "category": "proteinas", "unit": "pote"},
    "claras": {"name": "Huevos", "category": "proteinas", "unit": "unidad"},
    "carne": {"name": "Carne de res", "category": "proteinas", "unit": "porcion"},
    "pescado": {"name": "Filete de pescado", "category": "proteinas", "unit": "filete"},
    "pavo": {"name": "Pechuga de pavo", "category": "proteinas", "unit": "porcion"},
    "lentejas": {"name": "Lentejas", "category": "proteinas", "unit": "taza"},
    "garbanzos": {"name": "Garbanzos", "category": "proteinas", "unit": "taza"},
    "frijoles": {"name": "Frijoles negros", "category": "proteinas", "unit": "taza"},

    # Carbohidratos
    "arroz": {"name": "Arroz integral", "category": "carbohidratos", "unit": "taza"},
    "pasta": {"name": "Pasta integral", "category": "carbohidratos", "unit": "porcion"},
    "avena": {"name": "Avena", "category": "carbohidratos", "unit": "taza"},
    "tostada": {"name": "Pan integral", "category": "carbohidratos", "unit": "rebanada"},
    "pan ": {"name": "Pan integral", "category": "carbohidratos", "unit": "rebanada"},
    "quinoa": {"name": "Quinoa", "category": "carbohidratos", "unit": "taza"},
    "papa": {"name": "Papa", "category": "carbohidratos", "unit": "unidad"},
    "platano": {"name": "Platano", "category": "carbohidratos", "unit": "unidad"},
    "camote": {"name": "Camote", "category": "carbohidratos", "unit": "unidad"},
    "granola": {"name": "Granola", "category": "carbohidratos", "unit": "taza"},
    "tortilla": {"name": "Tortillas", "category": "carbohidratos", "unit": "unidad"},
    "wrap": {"name": "Tortillas wrap", "category": "carbohidratos", "unit": "unidad"},
    "pancake": {"name": "Mezcla para pancakes", "category": "carbohidratos", "unit": "paquete"},

    # Vegetales
    "espinaca": {"name": "Espinaca", "category": "vegetales", "unit": "manojo"},
    "brocoli": {"name": "Brocoli", "category": "vegetales", "unit": "unidad"},
    "tomate": {"name": "Tomate", "category": "vegetales", "unit": "unidad"},
    "ensalada": {"name": "Lechuga mixta", "category": "vegetales", "unit": "bolsa"},
    "verdura": {"name": "Verduras mixtas", "category": "vegetales", "unit": "bolsa"},
    "zanahoria": {"name": "Zanahoria", "category": "vegetales", "unit": "unidad"},
    "apio": {"name": "Apio", "category": "vegetales", "unit": "manojo"},
    "col": {"name": "Col", "category": "vegetales", "unit": "unidad"},
    "pepino": {"name": "Pepino", "category": "vegetales", "unit": "unidad"},
    "manzana": {"name": "Manzana", "category": "vegetales", "unit": "unidad"},
    "fresa": {"name": "Fresas", "category": "vegetales", "unit": "caja"},
    "fruta": {"name": "Frutas mixtas", "category": "vegetales", "unit": "porcion"},
    "limon": {"name": "Limon", "category": "vegetales", "unit": "unidad"},
    "aguacate": {"name": "Aguacate", "category": "vegetales", "unit": "unidad"},

    # Otros
    "nueces": {"name": "Nueces", "category": "otros", "unit": "bolsa"},
    "almendra": {"name": "Almendras", "category": "otros", "unit": "bolsa"},
    "miel": {"name": "Miel", "category": "otros", "unit": "frasco"},
    "hummus": {"name": "Hummus", "category": "otros", "unit": "pote"},
    "semillas": {"name": "Semillas mixtas", "category": "otros", "unit": "bolsa"},
    "chia": {"name": "Semillas de chia", "category": "otros", "unit": "bolsa"},
    "linaza": {"name": "Semillas de linaza", "category": "otros", "unit": "bolsa"},
    "mantequilla de mani": {"name": "Mantequilla de mani", "category": "otros", "unit": "frasco"},
    "mantequilla de almendra": {"name": "Mantequilla de almendra", "category": "otros", "unit": "frasco"},
    "tahini": {"name": "Tahini", "category": "otros", "unit": "frasco"},
    "queso": {"name": "Queso", "category": "otros", "unit": "porcion"},
    "leche": {"name": "Leche", "category": "otros", "unit": "litro"},
    "aceite": {"name": "Aceite de oliva", "category": "otros", "unit": "botella"},
    "salsa": {"name": "Salsa de tomate", "category": "otros", "unit": "frasco"},
    "guacamole": {"name": "Aguacate", "category": "vegetales", "unit": "unidad"},
}

# Estimated cost per ingredient (USD, rough LATAM average)
COST_PER_ITEM: dict[str, float] = {
    "proteinas": 2.5,
    "carbohidratos": 1.0,
    "vegetales": 1.2,
    "otros": 1.5,
}


def _extract_ingredients(meal_description: str) -> list[dict]:
    """Extract ingredients from a meal description using keyword matching."""
    desc_lower = meal_description.lower()
    found: dict[str, dict] = {}

    for keyword, ingredient in INGREDIENT_MAP.items():
        if keyword in desc_lower:
            name = ingredient["name"]
            if name not in found:
                found[name] = {
                    "name": name,
                    "category": ingredient["category"],
                    "unit": ingredient["unit"],
                    "count": 1,
                }
            else:
                found[name]["count"] += 1

    return list(found.values())


async def generate_simple_shopping_list(
    user_id: int, days: int, session: AsyncSession
) -> dict:
    """Generate a shopping list based on recovery plan meals for N days.

    Groups by: proteinas, carbohidratos, vegetales, otros.
    """
    days = max(1, min(days, 7))

    goals = await _get_goals(user_id, session)
    target_cal = goals["calories"]
    target_protein = goals["protein_g"]

    # Build meal plan for N days using balanced pool
    all_ingredients: dict[str, dict] = {}

    for day_idx in range(days):
        # Alternate pools for variety
        pools = [BALANCED_MEALS, HIGH_PROTEIN_MEALS, CALORIE_DENSE_MEALS, HIGH_FIBER_MEALS]
        pool = pools[day_idx % len(pools)]

        meals = _select_meals(
            pool=pool,
            remaining_calories=target_cal,
            remaining_protein=target_protein,
            count=3,
        )

        for meal in meals:
            ingredients = _extract_ingredients(meal["description"])
            for ing in ingredients:
                key = ing["name"]
                if key in all_ingredients:
                    all_ingredients[key]["count"] += ing["count"]
                else:
                    all_ingredients[key] = dict(ing)

    # Format output
    items: list[dict] = []
    total_cost = 0.0

    for ing in all_ingredients.values():
        count = ing["count"]
        quantity = f"{count} {ing['unit']}" if count > 1 else f"1 {ing['unit']}"
        item_cost = COST_PER_ITEM.get(ing["category"], 1.5) * count
        total_cost += item_cost

        items.append({
            "name": ing["name"],
            "category": ing["category"],
            "quantity": quantity,
        })

    # Sort by category
    category_order = {"proteinas": 0, "carbohidratos": 1, "vegetales": 2, "otros": 3}
    items.sort(key=lambda x: (category_order.get(x["category"], 4), x["name"]))

    return {
        "days": days,
        "items": items,
        "estimated_cost_usd": round(total_cost, 2),
        "item_count": len(items),
    }
