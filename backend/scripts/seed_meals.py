"""
Seed 500 real meals into meal_template + meal_ingredient tables.

Distribution: 100 breakfasts, 150 lunches, 150 dinners, 100 snacks.
All names in Spanish. Macros are realistic: P*4 + C*4 + F*9 ~ calories.
"""
from __future__ import annotations

import asyncio
import sys
import os

# Ensure project root is on path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import AsyncSessionLocal
from app.models.food_recommendation import MealIngredient, MealTemplate


# ---------------------------------------------------------------------------
# Ingredient building blocks
# ---------------------------------------------------------------------------

PROTEINS = {
    "Pechuga de pollo": {"per_100g": {"cal": 165, "p": 31, "c": 0, "f": 3.6}},
    "Salmon": {"per_100g": {"cal": 208, "p": 20, "c": 0, "f": 13}},
    "Atun en agua": {"per_100g": {"cal": 116, "p": 26, "c": 0, "f": 1}},
    "Huevo entero": {"per_100g": {"cal": 155, "p": 13, "c": 1.1, "f": 11}},
    "Clara de huevo": {"per_100g": {"cal": 52, "p": 11, "c": 0.7, "f": 0.2}},
    "Carne molida magra": {"per_100g": {"cal": 176, "p": 20, "c": 0, "f": 10}},
    "Lomo de cerdo": {"per_100g": {"cal": 143, "p": 26, "c": 0, "f": 3.5}},
    "Tofu firme": {"per_100g": {"cal": 144, "p": 15, "c": 3, "f": 8}},
    "Lentejas cocidas": {"per_100g": {"cal": 116, "p": 9, "c": 20, "f": 0.4}},
    "Porotos negros cocidos": {"per_100g": {"cal": 132, "p": 9, "c": 24, "f": 0.5}},
    "Yogurt griego": {"per_100g": {"cal": 100, "p": 10, "c": 6, "f": 5}},
    "Queso cottage": {"per_100g": {"cal": 98, "p": 11, "c": 3, "f": 4}},
    "Proteina whey": {"per_100g": {"cal": 370, "p": 75, "c": 10, "f": 3}},
    "Camarones": {"per_100g": {"cal": 99, "p": 24, "c": 0.2, "f": 0.3}},
    "Merluza": {"per_100g": {"cal": 82, "p": 18, "c": 0, "f": 0.7}},
}

CARBS = {
    "Arroz blanco cocido": {"per_100g": {"cal": 130, "p": 2.7, "c": 28, "f": 0.3}},
    "Arroz integral cocido": {"per_100g": {"cal": 123, "p": 2.7, "c": 26, "f": 1}},
    "Avena": {"per_100g": {"cal": 389, "p": 17, "c": 66, "f": 7}},
    "Pan integral": {"per_100g": {"cal": 247, "p": 13, "c": 41, "f": 3.4}},
    "Papa cocida": {"per_100g": {"cal": 87, "p": 2, "c": 20, "f": 0.1}},
    "Camote cocido": {"per_100g": {"cal": 90, "p": 2, "c": 21, "f": 0.1}},
    "Pasta cocida": {"per_100g": {"cal": 131, "p": 5, "c": 25, "f": 1.1}},
    "Quinoa cocida": {"per_100g": {"cal": 120, "p": 4.4, "c": 21, "f": 1.9}},
    "Tortilla de maiz": {"per_100g": {"cal": 218, "p": 6, "c": 44, "f": 3}},
    "Platano": {"per_100g": {"cal": 89, "p": 1.1, "c": 23, "f": 0.3}},
    "Granola": {"per_100g": {"cal": 471, "p": 10, "c": 64, "f": 20}},
    "Choclo cocido": {"per_100g": {"cal": 96, "p": 3.4, "c": 21, "f": 1.5}},
}

FATS = {
    "Palta (aguacate)": {"per_100g": {"cal": 160, "p": 2, "c": 9, "f": 15}},
    "Aceite de oliva": {"per_100g": {"cal": 884, "p": 0, "c": 0, "f": 100}},
    "Almendras": {"per_100g": {"cal": 579, "p": 21, "c": 22, "f": 49}},
    "Mani": {"per_100g": {"cal": 567, "p": 26, "c": 16, "f": 49}},
    "Nueces": {"per_100g": {"cal": 654, "p": 15, "c": 14, "f": 65}},
    "Mantequilla de mani": {"per_100g": {"cal": 588, "p": 25, "c": 20, "f": 50}},
    "Queso": {"per_100g": {"cal": 402, "p": 25, "c": 1.3, "f": 33}},
    "Semillas de chia": {"per_100g": {"cal": 486, "p": 17, "c": 42, "f": 31}},
}

VEGGIES = {
    "Lechuga": {"per_100g": {"cal": 15, "p": 1.4, "c": 2.9, "f": 0.2}},
    "Tomate": {"per_100g": {"cal": 18, "p": 0.9, "c": 3.9, "f": 0.2}},
    "Pepino": {"per_100g": {"cal": 15, "p": 0.7, "c": 3.6, "f": 0.1}},
    "Espinaca": {"per_100g": {"cal": 23, "p": 2.9, "c": 3.6, "f": 0.4}},
    "Brocoli": {"per_100g": {"cal": 34, "p": 2.8, "c": 7, "f": 0.4}},
    "Zanahoria": {"per_100g": {"cal": 41, "p": 0.9, "c": 10, "f": 0.2}},
    "Zapallo italiano": {"per_100g": {"cal": 17, "p": 1.2, "c": 3.1, "f": 0.3}},
    "Cebolla": {"per_100g": {"cal": 40, "p": 1.1, "c": 9, "f": 0.1}},
    "Pimenton rojo": {"per_100g": {"cal": 31, "p": 1, "c": 6, "f": 0.3}},
    "Champiñones": {"per_100g": {"cal": 22, "p": 3.1, "c": 3.3, "f": 0.3}},
}

FRUITS = {
    "Manzana": {"per_100g": {"cal": 52, "p": 0.3, "c": 14, "f": 0.2}},
    "Frutillas": {"per_100g": {"cal": 32, "p": 0.7, "c": 8, "f": 0.3}},
    "Arandanos": {"per_100g": {"cal": 57, "p": 0.7, "c": 14, "f": 0.3}},
    "Naranja": {"per_100g": {"cal": 47, "p": 0.9, "c": 12, "f": 0.1}},
    "Kiwi": {"per_100g": {"cal": 61, "p": 1.1, "c": 15, "f": 0.5}},
}

SAUCES_EXTRAS = {
    "Salsa de tomate": {"per_100g": {"cal": 29, "p": 1.3, "c": 5.8, "f": 0.2}},
    "Miel": {"per_100g": {"cal": 304, "p": 0.3, "c": 82, "f": 0}},
    "Leche descremada": {"per_100g": {"cal": 35, "p": 3.4, "c": 5, "f": 0.1}},
    "Leche de almendras": {"per_100g": {"cal": 17, "p": 0.6, "c": 0.6, "f": 1.1}},
}


def _calc_ingredient(food_db: dict, name: str, grams: float) -> dict:
    """Calculate macros for a given amount of an ingredient."""
    info = food_db[name]["per_100g"]
    factor = grams / 100.0
    return {
        "food_name": name,
        "quantity_grams": grams,
        "calories": round(info["cal"] * factor, 1),
        "protein_g": round(info["p"] * factor, 1),
        "carbs_g": round(info["c"] * factor, 1),
        "fat_g": round(info["f"] * factor, 1),
    }


def _sum_ingredients(ingredients: list[dict]) -> dict:
    """Sum macros across a list of ingredients."""
    total = {"calories": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0}
    for ing in ingredients:
        total["calories"] += ing["calories"]
        total["protein_g"] += ing["protein_g"]
        total["carbs_g"] += ing["carbs_g"]
        total["fat_g"] += ing["fat_g"]
    return {k: round(v, 1) for k, v in total.items()}


ALL_FOODS = {**PROTEINS, **CARBS, **FATS, **VEGGIES, **FRUITS, **SAUCES_EXTRAS}


# ---------------------------------------------------------------------------
# Meal definitions
# ---------------------------------------------------------------------------

def _build_meals() -> list[dict]:
    """Build all 500 meals with ingredients."""
    meals = []

    # ===== BREAKFASTS (100) =====
    breakfast_defs = [
        # (name, ingredients_list[(food, grams)], difficulty, prep_time, category, tags)
        ("Avena con platano y miel", [("Avena", 60), ("Platano", 120), ("Miel", 15), ("Leche descremada", 150)], 1, 10, "general", "rapido,economico"),
        ("Huevos revueltos con tostada integral", [("Huevo entero", 120), ("Pan integral", 60), ("Aceite de oliva", 5)], 1, 10, "high_protein", "rapido,proteico"),
        ("Yogurt griego con granola y berries", [("Yogurt griego", 200), ("Granola", 40), ("Frutillas", 80), ("Arandanos", 40)], 1, 5, "general", "rapido,sin_coccion"),
        ("Tostada de palta con huevo", [("Pan integral", 60), ("Palta (aguacate)", 70), ("Huevo entero", 60)], 1, 10, "general", "rapido"),
        ("Smoothie de proteina con berries", [("Proteina whey", 30), ("Frutillas", 100), ("Platano", 100), ("Leche de almendras", 200)], 1, 5, "high_protein", "rapido,proteico"),
        ("Panqueques de avena", [("Avena", 50), ("Huevo entero", 60), ("Platano", 80), ("Miel", 10)], 2, 15, "general", "dulce"),
        ("Omelette de espinaca y queso", [("Huevo entero", 150), ("Espinaca", 60), ("Queso", 20)], 1, 10, "high_protein", "proteico,low_carb"),
        ("Overnight oats con chia", [("Avena", 50), ("Semillas de chia", 15), ("Leche descremada", 200), ("Frutillas", 80)], 1, 5, "general", "sin_coccion,rapido"),
        ("Tostada integral con queso cottage", [("Pan integral", 60), ("Queso cottage", 120), ("Tomate", 80)], 1, 5, "high_protein", "rapido,proteico"),
        ("Batido verde de espinaca", [("Espinaca", 60), ("Platano", 100), ("Leche de almendras", 200), ("Miel", 10)], 1, 5, "general", "rapido,saludable"),
        ("Huevos benedictinos light", [("Huevo entero", 120), ("Pan integral", 50), ("Espinaca", 40), ("Aceite de oliva", 5)], 2, 15, "high_protein", "proteico"),
        ("Granola casera con yogurt", [("Granola", 60), ("Yogurt griego", 150), ("Miel", 10), ("Almendras", 15)], 1, 5, "general", "rapido"),
        ("Avena con mantequilla de mani", [("Avena", 60), ("Mantequilla de mani", 20), ("Platano", 80), ("Leche descremada", 150)], 1, 10, "high_protein", "proteico,energetico"),
        ("Wrap de huevo y palta", [("Tortilla de maiz", 50), ("Huevo entero", 120), ("Palta (aguacate)", 50)], 1, 10, "general", "rapido"),
        ("Claras revueltas con tostada", [("Clara de huevo", 200), ("Pan integral", 60), ("Tomate", 60)], 1, 10, "high_protein", "proteico,bajo_grasa"),
        ("Porridge de quinoa", [("Quinoa cocida", 150), ("Leche descremada", 100), ("Miel", 10), ("Almendras", 15)], 2, 20, "general", "saludable"),
        ("Tostada francesa light", [("Pan integral", 80), ("Huevo entero", 60), ("Leche descremada", 50), ("Miel", 10)], 1, 10, "general", "dulce"),
        ("Bowl de yogurt tropical", [("Yogurt griego", 200), ("Platano", 80), ("Miel", 10), ("Semillas de chia", 10)], 1, 5, "general", "rapido,sin_coccion"),
        ("Omelette mediterraneo", [("Huevo entero", 150), ("Tomate", 60), ("Espinaca", 40), ("Aceite de oliva", 5)], 1, 10, "general", "saludable"),
        ("Avena proteica", [("Avena", 50), ("Proteina whey", 25), ("Platano", 80), ("Leche descremada", 150)], 1, 10, "high_protein", "proteico,rapido"),
        # Generate more using variations
        ("Huevos con champiñones", [("Huevo entero", 120), ("Champiñones", 100), ("Aceite de oliva", 5)], 1, 10, "high_protein", "proteico,low_carb"),
        ("Smoothie de mango y proteina", [("Proteina whey", 30), ("Platano", 100), ("Leche de almendras", 200), ("Miel", 10)], 1, 5, "high_protein", "rapido,proteico"),
        ("Tostada con mantequilla de mani y platano", [("Pan integral", 60), ("Mantequilla de mani", 20), ("Platano", 80)], 1, 5, "general", "rapido,energetico"),
        ("Bowl de avena con nueces", [("Avena", 60), ("Nueces", 20), ("Miel", 10), ("Leche descremada", 150)], 1, 10, "general", "saludable"),
        ("Huevos pochados con espinaca", [("Huevo entero", 120), ("Espinaca", 80), ("Pan integral", 40)], 2, 15, "high_protein", "proteico"),
        ("Yogurt con frutas y almendras", [("Yogurt griego", 200), ("Manzana", 100), ("Almendras", 20)], 1, 5, "general", "rapido,sin_coccion"),
        ("Pan con palta y tomate", [("Pan integral", 80), ("Palta (aguacate)", 70), ("Tomate", 60)], 1, 5, "general", "rapido,vegano"),
        ("Smoothie bowl de arandanos", [("Yogurt griego", 150), ("Arandanos", 100), ("Granola", 30), ("Platano", 60)], 1, 5, "general", "rapido"),
        ("Tortilla de claras con verduras", [("Clara de huevo", 200), ("Pimenton rojo", 60), ("Cebolla", 40), ("Espinaca", 40)], 1, 10, "high_protein", "proteico,bajo_grasa"),
        ("Avena con frutillas y chia", [("Avena", 50), ("Frutillas", 100), ("Semillas de chia", 10), ("Leche descremada", 150)], 1, 10, "general", "saludable"),
        ("Crepe de avena con platano", [("Avena", 40), ("Huevo entero", 60), ("Platano", 100), ("Miel", 10)], 2, 15, "general", "dulce"),
        ("Tostada integral con huevo y tomate", [("Pan integral", 60), ("Huevo entero", 60), ("Tomate", 80)], 1, 10, "general", "rapido"),
        ("Batido de proteina clasico", [("Proteina whey", 35), ("Leche descremada", 250), ("Platano", 80)], 1, 5, "high_protein", "rapido,proteico"),
        ("Muesli con leche y frutas", [("Granola", 50), ("Leche descremada", 200), ("Frutillas", 60), ("Platano", 50)], 1, 5, "general", "rapido"),
        ("Huevos a la mexicana", [("Huevo entero", 120), ("Tomate", 60), ("Cebolla", 30), ("Pimenton rojo", 30), ("Tortilla de maiz", 40)], 1, 10, "general", "chileno"),
        ("Pan integral con queso y miel", [("Pan integral", 60), ("Queso", 25), ("Miel", 10)], 1, 5, "general", "rapido,dulce"),
        ("Smoothie verde proteico", [("Espinaca", 60), ("Proteina whey", 25), ("Platano", 100), ("Leche de almendras", 200)], 1, 5, "high_protein", "rapido,proteico"),
        ("Cottage cheese con frutas", [("Queso cottage", 150), ("Frutillas", 80), ("Arandanos", 60), ("Miel", 10)], 1, 5, "high_protein", "rapido,proteico"),
        ("Pancake proteico", [("Avena", 40), ("Proteina whey", 25), ("Huevo entero", 60), ("Platano", 60)], 2, 15, "high_protein", "proteico,dulce"),
        ("Wrap matinal de pavo", [("Tortilla de maiz", 50), ("Clara de huevo", 120), ("Tomate", 50), ("Espinaca", 30)], 1, 10, "high_protein", "rapido,proteico"),
        # More variations
        ("Avena con kiwi y nueces", [("Avena", 60), ("Kiwi", 100), ("Nueces", 15), ("Leche descremada", 150)], 1, 10, "general", "saludable"),
        ("Huevos con brocoli", [("Huevo entero", 120), ("Brocoli", 100), ("Aceite de oliva", 5)], 1, 10, "high_protein", "proteico,low_carb"),
        ("Tostada con queso cottage y frutillas", [("Pan integral", 50), ("Queso cottage", 100), ("Frutillas", 80)], 1, 5, "high_protein", "rapido"),
        ("Bowl de avena tropical", [("Avena", 50), ("Platano", 80), ("Miel", 10), ("Almendras", 10), ("Leche de almendras", 150)], 1, 10, "general", "rapido"),
        ("Omelette de champiñones y queso", [("Huevo entero", 150), ("Champiñones", 80), ("Queso", 15)], 1, 10, "high_protein", "proteico"),
        ("Yogurt natural con granola y miel", [("Yogurt griego", 200), ("Granola", 40), ("Miel", 15)], 1, 5, "general", "rapido"),
        ("Batido de avena y platano", [("Avena", 40), ("Platano", 120), ("Leche descremada", 200), ("Miel", 10)], 1, 5, "general", "rapido"),
        ("Tostada de huevo y pimenton", [("Pan integral", 60), ("Huevo entero", 60), ("Pimenton rojo", 60)], 1, 10, "general", "rapido"),
        ("Pan con palta y huevo duro", [("Pan integral", 60), ("Palta (aguacate)", 50), ("Huevo entero", 60)], 1, 10, "general", "rapido"),
        ("Smoothie de platano y mani", [("Platano", 120), ("Mantequilla de mani", 20), ("Leche descremada", 200)], 1, 5, "high_protein", "rapido,energetico"),
        ("Avena horneada con manzana", [("Avena", 60), ("Manzana", 100), ("Miel", 10), ("Leche descremada", 100)], 2, 25, "general", "dulce"),
        ("Huevos con espinaca y queso", [("Huevo entero", 120), ("Espinaca", 60), ("Queso", 20), ("Aceite de oliva", 5)], 1, 10, "high_protein", "proteico"),
        ("Parfait de yogurt", [("Yogurt griego", 150), ("Granola", 30), ("Frutillas", 60), ("Arandanos", 40), ("Miel", 10)], 1, 5, "general", "rapido"),
        ("Tostada integral doble con huevo", [("Pan integral", 80), ("Huevo entero", 120), ("Aceite de oliva", 5)], 1, 10, "high_protein", "proteico"),
        ("Porridge de avena con proteina", [("Avena", 50), ("Proteina whey", 20), ("Leche descremada", 150), ("Frutillas", 60)], 1, 10, "high_protein", "proteico"),
        ("Bowl de cottage y frutas", [("Queso cottage", 150), ("Platano", 80), ("Almendras", 15), ("Miel", 10)], 1, 5, "high_protein", "rapido"),
        ("Omelette simple de queso", [("Huevo entero", 150), ("Queso", 20)], 1, 8, "high_protein", "rapido,proteico,low_carb"),
        ("Smoothie de frutillas y yogurt", [("Yogurt griego", 150), ("Frutillas", 120), ("Miel", 10), ("Leche de almendras", 100)], 1, 5, "general", "rapido"),
        ("Pan con huevo y espinaca", [("Pan integral", 60), ("Huevo entero", 60), ("Espinaca", 50)], 1, 10, "general", "rapido"),
        ("Granola con leche de almendras", [("Granola", 60), ("Leche de almendras", 200), ("Platano", 60)], 1, 5, "general", "rapido,sin_coccion"),
        ("Tortilla española light", [("Huevo entero", 150), ("Papa cocida", 100), ("Cebolla", 30), ("Aceite de oliva", 5)], 2, 20, "general", "chileno"),
        ("Avena con naranja y nueces", [("Avena", 50), ("Naranja", 120), ("Nueces", 15), ("Leche descremada", 150)], 1, 10, "general", "saludable"),
        ("Huevos duros con pan integral", [("Huevo entero", 120), ("Pan integral", 60)], 1, 15, "high_protein", "proteico,rapido"),
        ("Yogurt con semillas y platano", [("Yogurt griego", 200), ("Semillas de chia", 15), ("Platano", 80)], 1, 5, "general", "rapido"),
        ("Wrap de huevo con verduras", [("Tortilla de maiz", 50), ("Huevo entero", 120), ("Pimenton rojo", 40), ("Espinaca", 30)], 1, 10, "general", "rapido"),
        ("Batido de arandanos y proteina", [("Proteina whey", 30), ("Arandanos", 100), ("Platano", 80), ("Leche de almendras", 200)], 1, 5, "high_protein", "rapido,proteico"),
        ("Tostada con mani y platano", [("Pan integral", 50), ("Mantequilla de mani", 15), ("Platano", 60)], 1, 5, "general", "rapido,energetico"),
        ("Claras con avena", [("Clara de huevo", 150), ("Avena", 30), ("Platano", 60)], 1, 10, "high_protein", "proteico"),
        ("Bowl de acai casero", [("Platano", 100), ("Arandanos", 80), ("Granola", 30), ("Miel", 10)], 1, 5, "general", "rapido"),
        ("Huevos con zapallo italiano", [("Huevo entero", 120), ("Zapallo italiano", 100), ("Aceite de oliva", 5)], 1, 10, "general", "low_carb"),
        ("Tostada mediterranea", [("Pan integral", 60), ("Tomate", 80), ("Palta (aguacate)", 50), ("Aceite de oliva", 5)], 1, 5, "general", "rapido,saludable"),
        ("Avena con mani y arandanos", [("Avena", 50), ("Mani", 15), ("Arandanos", 60), ("Leche descremada", 150)], 1, 10, "general", "saludable"),
        ("Smoothie tropical", [("Platano", 100), ("Naranja", 100), ("Yogurt griego", 100), ("Miel", 10)], 1, 5, "general", "rapido"),
        ("Pan con queso y tomate", [("Pan integral", 80), ("Queso", 20), ("Tomate", 60)], 1, 5, "general", "rapido"),
        ("Huevos con cebolla y tomate", [("Huevo entero", 120), ("Cebolla", 40), ("Tomate", 60), ("Aceite de oliva", 5)], 1, 10, "general", "rapido"),
        ("Avena con manzana y canela", [("Avena", 60), ("Manzana", 100), ("Miel", 10), ("Leche descremada", 150)], 1, 10, "general", "dulce"),
        ("Yogurt con kiwi y almendras", [("Yogurt griego", 200), ("Kiwi", 100), ("Almendras", 15)], 1, 5, "general", "rapido"),
        ("Pancake de platano", [("Platano", 100), ("Huevo entero", 60), ("Avena", 30), ("Miel", 10)], 1, 10, "general", "rapido,dulce"),
        ("Tostada con queso cottage y miel", [("Pan integral", 50), ("Queso cottage", 100), ("Miel", 10)], 1, 5, "high_protein", "rapido"),
        ("Revuelto de claras y pimenton", [("Clara de huevo", 180), ("Pimenton rojo", 60), ("Cebolla", 30), ("Aceite de oliva", 5)], 1, 10, "high_protein", "proteico,bajo_grasa"),
        ("Omelette clasico con jamon", [("Huevo entero", 150), ("Queso", 15), ("Tomate", 40)], 1, 10, "high_protein", "proteico"),
        ("Avena cremosa con almendras", [("Avena", 60), ("Almendras", 20), ("Leche descremada", 200), ("Miel", 10)], 1, 10, "general", "saludable"),
        ("Tostada doble con palta", [("Pan integral", 80), ("Palta (aguacate)", 80)], 1, 5, "general", "rapido,vegano"),
        ("Smoothie de kiwi y espinaca", [("Kiwi", 100), ("Espinaca", 50), ("Platano", 80), ("Leche de almendras", 200)], 1, 5, "general", "rapido,saludable"),
        ("Bowl de quinoa dulce", [("Quinoa cocida", 120), ("Platano", 60), ("Miel", 10), ("Almendras", 10), ("Leche descremada", 100)], 2, 15, "general", "saludable"),
        ("Huevos con camote", [("Huevo entero", 120), ("Camote cocido", 100), ("Aceite de oliva", 5)], 1, 15, "general", "saludable"),
        ("Yogurt con avena y miel", [("Yogurt griego", 200), ("Avena", 30), ("Miel", 15)], 1, 5, "general", "rapido"),
        ("Tostada con huevo y palta", [("Pan integral", 50), ("Huevo entero", 60), ("Palta (aguacate)", 40)], 1, 10, "general", "rapido"),
        ("Batido de cottage y frutas", [("Queso cottage", 120), ("Frutillas", 80), ("Platano", 80), ("Leche descremada", 100)], 1, 5, "high_protein", "rapido,proteico"),
        ("Pan con huevo y queso", [("Pan integral", 60), ("Huevo entero", 60), ("Queso", 15)], 1, 10, "general", "rapido"),
        ("Avena con semillas mixtas", [("Avena", 50), ("Semillas de chia", 10), ("Almendras", 10), ("Leche descremada", 150), ("Miel", 10)], 1, 10, "general", "saludable"),
        ("Huevo en pan con espinaca", [("Pan integral", 60), ("Huevo entero", 60), ("Espinaca", 40), ("Aceite de oliva", 5)], 1, 10, "general", "rapido"),
        ("Smoothie de manzana y avena", [("Manzana", 120), ("Avena", 30), ("Leche descremada", 200), ("Miel", 10)], 1, 5, "general", "rapido"),
        ("Yogurt griego con nueces", [("Yogurt griego", 200), ("Nueces", 20), ("Miel", 10)], 1, 5, "general", "rapido,low_carb"),
        # Additional breakfasts to reach 100+
        ("Avena con pera y canela", [("Avena", 60), ("Platano", 80), ("Almendras", 10), ("Leche descremada", 150)], 1, 10, "general", "saludable"),
        ("Huevos con palta y semillas", [("Huevo entero", 120), ("Palta (aguacate)", 40), ("Semillas de chia", 8)], 1, 10, "high_protein", "proteico"),
        ("Smoothie de proteina con espinaca", [("Proteina whey", 30), ("Espinaca", 40), ("Platano", 80), ("Leche descremada", 200)], 1, 5, "high_protein", "rapido,proteico"),
        ("Bowl energetico matinal", [("Avena", 50), ("Platano", 60), ("Mantequilla de mani", 15), ("Almendras", 10), ("Leche descremada", 100)], 1, 10, "general", "energetico"),
        ("Pan integral con huevo y champiñones", [("Pan integral", 60), ("Huevo entero", 60), ("Champiñones", 60)], 1, 10, "general", "rapido"),
        ("Cottage cheese con kiwi", [("Queso cottage", 150), ("Kiwi", 100)], 1, 2, "high_protein", "rapido,proteico"),
    ]

    # ===== LUNCHES (150) =====
    lunch_defs = [
        ("Pollo a la plancha con arroz y ensalada", [("Pechuga de pollo", 150), ("Arroz blanco cocido", 150), ("Lechuga", 50), ("Tomate", 50), ("Aceite de oliva", 5)], 2, 25, "general", "clasico,proteico"),
        ("Cazuela de pollo", [("Pechuga de pollo", 150), ("Papa cocida", 150), ("Zanahoria", 50), ("Choclo cocido", 60), ("Zapallo italiano", 50)], 2, 40, "general", "chileno,casero"),
        ("Pasta con salsa de tomate y pollo", [("Pasta cocida", 180), ("Pechuga de pollo", 120), ("Salsa de tomate", 100), ("Aceite de oliva", 5)], 2, 20, "general", "clasico"),
        ("Ensalada cesar con pollo", [("Pechuga de pollo", 150), ("Lechuga", 100), ("Queso", 15), ("Pan integral", 30), ("Aceite de oliva", 10)], 1, 15, "high_protein", "proteico,saludable"),
        ("Salmon con quinoa y brocoli", [("Salmon", 150), ("Quinoa cocida", 150), ("Brocoli", 100), ("Aceite de oliva", 5)], 2, 25, "high_protein", "proteico,saludable"),
        ("Arroz con carne molida y verduras", [("Carne molida magra", 130), ("Arroz blanco cocido", 150), ("Zanahoria", 50), ("Cebolla", 30), ("Aceite de oliva", 5)], 2, 25, "general", "casero"),
        ("Wrap de pollo y palta", [("Tortilla de maiz", 60), ("Pechuga de pollo", 120), ("Palta (aguacate)", 50), ("Lechuga", 30), ("Tomate", 40)], 1, 15, "general", "rapido"),
        ("Bowl de lentejas con arroz", [("Lentejas cocidas", 200), ("Arroz integral cocido", 120), ("Zanahoria", 40), ("Cebolla", 30)], 2, 25, "vegetarian", "vegetariano,economico"),
        ("Pollo al horno con camote", [("Pechuga de pollo", 150), ("Camote cocido", 200), ("Brocoli", 80), ("Aceite de oliva", 5)], 2, 35, "high_protein", "proteico"),
        ("Merluza con pure de papa", [("Merluza", 180), ("Papa cocida", 200), ("Espinaca", 50), ("Aceite de oliva", 5)], 2, 25, "general", "chileno"),
        ("Arroz integral con salmon", [("Arroz integral cocido", 150), ("Salmon", 130), ("Brocoli", 80), ("Aceite de oliva", 5)], 2, 25, "high_protein", "proteico,saludable"),
        ("Pasta con verduras salteadas", [("Pasta cocida", 200), ("Zapallo italiano", 80), ("Pimenton rojo", 60), ("Champiñones", 60), ("Aceite de oliva", 10)], 1, 20, "vegetarian", "vegetariano"),
        ("Pollo con papas doradas", [("Pechuga de pollo", 150), ("Papa cocida", 200), ("Aceite de oliva", 10), ("Tomate", 60)], 2, 30, "general", "clasico"),
        ("Ensalada de atun con quinoa", [("Atun en agua", 120), ("Quinoa cocida", 120), ("Tomate", 60), ("Pepino", 50), ("Aceite de oliva", 10)], 1, 15, "high_protein", "proteico,saludable"),
        ("Tacos de carne molida", [("Carne molida magra", 120), ("Tortilla de maiz", 80), ("Tomate", 40), ("Lechuga", 30), ("Cebolla", 20)], 1, 15, "general", "mexicano"),
        ("Bowl de pollo teriyaki", [("Pechuga de pollo", 150), ("Arroz blanco cocido", 150), ("Brocoli", 60), ("Zanahoria", 40), ("Miel", 10)], 2, 25, "general", "asiatico"),
        ("Carne con arroz y ensalada", [("Carne molida magra", 130), ("Arroz blanco cocido", 150), ("Lechuga", 40), ("Tomate", 40), ("Aceite de oliva", 5)], 2, 25, "general", "clasico"),
        ("Porotos con arroz", [("Porotos negros cocidos", 200), ("Arroz blanco cocido", 150), ("Cebolla", 30), ("Aceite de oliva", 5)], 2, 30, "vegetarian", "chileno,economico"),
        ("Salmon a la plancha con ensalada", [("Salmon", 150), ("Lechuga", 60), ("Tomate", 60), ("Pepino", 50), ("Aceite de oliva", 10)], 2, 20, "high_protein", "proteico,low_carb"),
        ("Pastel de choclo", [("Carne molida magra", 100), ("Choclo cocido", 200), ("Cebolla", 30), ("Huevo entero", 30), ("Aceite de oliva", 5)], 3, 45, "general", "chileno,casero"),
        ("Stir fry de pollo y verduras", [("Pechuga de pollo", 150), ("Pimenton rojo", 60), ("Zapallo italiano", 60), ("Cebolla", 30), ("Arroz blanco cocido", 100), ("Aceite de oliva", 5)], 2, 20, "general", "asiatico,rapido"),
        ("Ensalada de pollo y palta", [("Pechuga de pollo", 150), ("Palta (aguacate)", 70), ("Lechuga", 60), ("Tomate", 50), ("Aceite de oliva", 5)], 1, 15, "high_protein", "proteico,low_carb"),
        ("Pasta con carne molida", [("Pasta cocida", 180), ("Carne molida magra", 100), ("Salsa de tomate", 100), ("Cebolla", 20)], 2, 25, "general", "clasico"),
        ("Arroz con camarones", [("Arroz blanco cocido", 150), ("Camarones", 150), ("Pimenton rojo", 40), ("Cebolla", 30), ("Aceite de oliva", 5)], 2, 20, "high_protein", "proteico"),
        ("Pollo con quinoa y verduras", [("Pechuga de pollo", 150), ("Quinoa cocida", 130), ("Espinaca", 50), ("Tomate", 40)], 2, 25, "high_protein", "proteico,saludable"),
        ("Lentejas con verduras", [("Lentejas cocidas", 200), ("Zanahoria", 50), ("Espinaca", 40), ("Cebolla", 30), ("Aceite de oliva", 5)], 2, 25, "vegetarian", "vegetariano,economico"),
        ("Ceviche de camarones", [("Camarones", 150), ("Tomate", 60), ("Cebolla", 30), ("Pepino", 40), ("Camote cocido", 80)], 2, 20, "high_protein", "peruano,fresco"),
        ("Bowl mediterrano", [("Pechuga de pollo", 120), ("Quinoa cocida", 100), ("Pepino", 50), ("Tomate", 50), ("Palta (aguacate)", 40), ("Aceite de oliva", 5)], 1, 15, "general", "saludable"),
        ("Arroz chaufa de pollo", [("Arroz blanco cocido", 150), ("Pechuga de pollo", 120), ("Huevo entero", 50), ("Cebolla", 20), ("Zanahoria", 30), ("Aceite de oliva", 5)], 2, 20, "general", "asiatico,peruano"),
        ("Empanada de pino al horno", [("Carne molida magra", 80), ("Cebolla", 40), ("Huevo entero", 30), ("Pan integral", 80), ("Aceite de oliva", 5)], 3, 40, "general", "chileno"),
        ("Ensalada de salmon ahumado", [("Salmon", 100), ("Lechuga", 60), ("Palta (aguacate)", 50), ("Pepino", 40), ("Aceite de oliva", 10)], 1, 10, "high_protein", "proteico,low_carb"),
        ("Pollo al curry con arroz", [("Pechuga de pollo", 150), ("Arroz blanco cocido", 150), ("Cebolla", 30), ("Aceite de oliva", 10)], 2, 25, "general", "asiatico"),
        ("Tortilla de verduras", [("Huevo entero", 150), ("Papa cocida", 100), ("Espinaca", 40), ("Cebolla", 30), ("Aceite de oliva", 5)], 2, 20, "vegetarian", "vegetariano"),
        ("Cerdo con arroz y ensalada", [("Lomo de cerdo", 150), ("Arroz blanco cocido", 150), ("Lechuga", 40), ("Tomate", 40), ("Aceite de oliva", 5)], 2, 25, "general", "proteico"),
        ("Bowl de tofu y quinoa", [("Tofu firme", 150), ("Quinoa cocida", 130), ("Brocoli", 80), ("Zanahoria", 40), ("Aceite de oliva", 5)], 2, 20, "vegetarian", "vegano,proteico"),
        ("Atun con pasta y verduras", [("Atun en agua", 120), ("Pasta cocida", 150), ("Tomate", 60), ("Espinaca", 40), ("Aceite de oliva", 5)], 2, 20, "high_protein", "proteico"),
        ("Ensalada campesina", [("Lechuga", 60), ("Tomate", 80), ("Pepino", 60), ("Palta (aguacate)", 50), ("Huevo entero", 60), ("Aceite de oliva", 10)], 1, 10, "general", "saludable,low_carb"),
        ("Pollo con pasta integral", [("Pechuga de pollo", 130), ("Pasta cocida", 150), ("Salsa de tomate", 80), ("Aceite de oliva", 5)], 2, 20, "general", "clasico"),
        ("Salmon con espinaca y papa", [("Salmon", 140), ("Espinaca", 80), ("Papa cocida", 150), ("Aceite de oliva", 5)], 2, 25, "high_protein", "proteico"),
        ("Burrito de porotos", [("Porotos negros cocidos", 150), ("Arroz blanco cocido", 80), ("Tortilla de maiz", 60), ("Palta (aguacate)", 40), ("Tomate", 30)], 1, 15, "vegetarian", "mexicano,vegetariano"),
        ("Pollo BBQ con camote", [("Pechuga de pollo", 150), ("Camote cocido", 180), ("Salsa de tomate", 40)], 2, 30, "high_protein", "proteico"),
        ("Arroz con verduras salteadas", [("Arroz blanco cocido", 180), ("Brocoli", 60), ("Zanahoria", 40), ("Pimenton rojo", 40), ("Aceite de oliva", 10)], 1, 15, "vegetarian", "vegetariano,rapido"),
        ("Cazuela de cerdo", [("Lomo de cerdo", 130), ("Papa cocida", 150), ("Zanahoria", 40), ("Choclo cocido", 50), ("Zapallo italiano", 50)], 2, 40, "general", "chileno,casero"),
        ("Poke bowl de salmon", [("Salmon", 120), ("Arroz blanco cocido", 120), ("Palta (aguacate)", 40), ("Pepino", 40), ("Zanahoria", 30), ("Aceite de oliva", 5)], 2, 15, "high_protein", "asiatico,fresco"),
        ("Camarones al ajillo con arroz", [("Camarones", 150), ("Arroz blanco cocido", 150), ("Aceite de oliva", 10), ("Espinaca", 40)], 2, 20, "high_protein", "proteico"),
        ("Wrap de atun y verduras", [("Tortilla de maiz", 60), ("Atun en agua", 100), ("Lechuga", 30), ("Tomate", 40), ("Palta (aguacate)", 30)], 1, 10, "high_protein", "rapido,proteico"),
        ("Quinoa con verduras grilladas", [("Quinoa cocida", 180), ("Zapallo italiano", 60), ("Pimenton rojo", 60), ("Cebolla", 30), ("Aceite de oliva", 10)], 2, 25, "vegetarian", "vegetariano,saludable"),
        ("Charquican", [("Carne molida magra", 100), ("Papa cocida", 150), ("Zapallo italiano", 60), ("Choclo cocido", 50), ("Cebolla", 20)], 2, 35, "general", "chileno,casero"),
        ("Ensalada de lentejas", [("Lentejas cocidas", 180), ("Tomate", 60), ("Pepino", 50), ("Pimenton rojo", 40), ("Aceite de oliva", 10)], 1, 10, "vegetarian", "vegetariano,fresco"),
        ("Pollo con arroz integral y brocoli", [("Pechuga de pollo", 150), ("Arroz integral cocido", 150), ("Brocoli", 100), ("Aceite de oliva", 5)], 2, 25, "high_protein", "proteico,saludable"),
        ("Bowl de porotos con palta", [("Porotos negros cocidos", 180), ("Arroz blanco cocido", 100), ("Palta (aguacate)", 50), ("Tomate", 40), ("Cebolla", 20)], 1, 15, "vegetarian", "vegetariano"),
        ("Merluza al horno con verduras", [("Merluza", 180), ("Brocoli", 80), ("Zanahoria", 60), ("Aceite de oliva", 10)], 2, 25, "general", "saludable"),
        ("Pollo con champiñones", [("Pechuga de pollo", 150), ("Champiñones", 100), ("Arroz blanco cocido", 120), ("Aceite de oliva", 5)], 2, 25, "general", "clasico"),
        ("Pasta primavera", [("Pasta cocida", 180), ("Zapallo italiano", 60), ("Tomate", 60), ("Pimenton rojo", 40), ("Aceite de oliva", 10)], 1, 15, "vegetarian", "vegetariano"),
        ("Bowl de camarones con quinoa", [("Camarones", 130), ("Quinoa cocida", 130), ("Palta (aguacate)", 40), ("Pepino", 40)], 2, 20, "high_protein", "proteico,saludable"),
        ("Carne al horno con ensalada", [("Carne molida magra", 150), ("Lechuga", 50), ("Tomate", 50), ("Aceite de oliva", 10)], 2, 30, "high_protein", "proteico,low_carb"),
        ("Arroz con tofu y verduras", [("Arroz blanco cocido", 150), ("Tofu firme", 120), ("Brocoli", 60), ("Zanahoria", 40), ("Aceite de oliva", 5)], 2, 20, "vegetarian", "vegano"),
        ("Pollo grillado con quinoa", [("Pechuga de pollo", 150), ("Quinoa cocida", 150), ("Espinaca", 40), ("Aceite de oliva", 5)], 2, 25, "high_protein", "proteico"),
        ("Sopaipillas con pebre", [("Papa cocida", 200), ("Pan integral", 80), ("Tomate", 60), ("Cebolla", 20), ("Aceite de oliva", 15)], 2, 30, "general", "chileno"),
        ("Wrap de salmon y verduras", [("Tortilla de maiz", 60), ("Salmon", 100), ("Lechuga", 30), ("Pepino", 30), ("Palta (aguacate)", 30)], 1, 10, "high_protein", "rapido,proteico"),
        ("Ensalada griega con pollo", [("Pechuga de pollo", 130), ("Lechuga", 60), ("Tomate", 60), ("Pepino", 50), ("Queso", 20), ("Aceite de oliva", 10)], 1, 15, "high_protein", "proteico,saludable"),
        ("Arroz con cerdo y verduras", [("Lomo de cerdo", 130), ("Arroz blanco cocido", 150), ("Pimenton rojo", 40), ("Cebolla", 30), ("Aceite de oliva", 5)], 2, 25, "general", "clasico"),
        ("Quiche de espinaca light", [("Huevo entero", 120), ("Espinaca", 80), ("Queso", 20), ("Leche descremada", 50)], 2, 30, "general", "saludable"),
        ("Bowl de atun con arroz integral", [("Atun en agua", 120), ("Arroz integral cocido", 130), ("Palta (aguacate)", 40), ("Pepino", 40), ("Zanahoria", 30)], 1, 15, "high_protein", "proteico"),
        ("Pasta con camarones", [("Pasta cocida", 160), ("Camarones", 120), ("Salsa de tomate", 80), ("Aceite de oliva", 5)], 2, 20, "high_protein", "proteico"),
        ("Pollo al limon con arroz", [("Pechuga de pollo", 150), ("Arroz blanco cocido", 150), ("Brocoli", 60), ("Aceite de oliva", 5)], 2, 25, "general", "clasico"),
        ("Salmon con pasta y espinaca", [("Salmon", 120), ("Pasta cocida", 130), ("Espinaca", 50), ("Aceite de oliva", 5)], 2, 20, "high_protein", "proteico"),
        ("Ensalada de quinoa y garbanzos", [("Quinoa cocida", 120), ("Porotos negros cocidos", 100), ("Tomate", 50), ("Pepino", 40), ("Aceite de oliva", 10)], 1, 10, "vegetarian", "vegetariano,saludable"),
        ("Pollo con papas y zanahoria", [("Pechuga de pollo", 150), ("Papa cocida", 150), ("Zanahoria", 60), ("Aceite de oliva", 5)], 2, 30, "general", "casero"),
        ("Bowl mexicano de pollo", [("Pechuga de pollo", 130), ("Arroz blanco cocido", 100), ("Porotos negros cocidos", 80), ("Palta (aguacate)", 40), ("Tomate", 30)], 1, 15, "general", "mexicano"),
        ("Tallarines con salsa bolognesa", [("Pasta cocida", 180), ("Carne molida magra", 100), ("Salsa de tomate", 100), ("Cebolla", 20), ("Zanahoria", 20)], 2, 30, "general", "clasico"),
        ("Cerdo al horno con camote", [("Lomo de cerdo", 150), ("Camote cocido", 180), ("Brocoli", 60), ("Aceite de oliva", 5)], 2, 35, "high_protein", "proteico"),
        ("Ensalada de pollo con nueces", [("Pechuga de pollo", 130), ("Lechuga", 60), ("Nueces", 20), ("Manzana", 60), ("Aceite de oliva", 10)], 1, 15, "high_protein", "proteico,saludable"),
        ("Arroz frito con verduras y huevo", [("Arroz blanco cocido", 180), ("Huevo entero", 60), ("Zanahoria", 40), ("Cebolla", 20), ("Brocoli", 40), ("Aceite de oliva", 5)], 2, 15, "general", "asiatico,rapido"),
        ("Camarones con pasta y espinaca", [("Camarones", 130), ("Pasta cocida", 130), ("Espinaca", 50), ("Aceite de oliva", 10)], 2, 20, "high_protein", "proteico"),
        ("Pollo desmechado con arroz", [("Pechuga de pollo", 150), ("Arroz blanco cocido", 160), ("Salsa de tomate", 60), ("Cebolla", 20)], 2, 25, "general", "clasico"),
        ("Bowl vegano de tofu", [("Tofu firme", 150), ("Arroz integral cocido", 120), ("Palta (aguacate)", 40), ("Brocoli", 60), ("Zanahoria", 30)], 2, 20, "vegetarian", "vegano"),
        ("Pollo con ensalada rusa light", [("Pechuga de pollo", 130), ("Papa cocida", 100), ("Zanahoria", 50), ("Huevo entero", 30), ("Aceite de oliva", 5)], 2, 25, "general", "clasico"),
        ("Merluza a la plancha con arroz", [("Merluza", 180), ("Arroz blanco cocido", 150), ("Lechuga", 40), ("Tomate", 40), ("Aceite de oliva", 5)], 2, 20, "general", "saludable"),
        ("Ensalada thai de pollo", [("Pechuga de pollo", 130), ("Zanahoria", 40), ("Pepino", 40), ("Mani", 15), ("Lechuga", 40)], 1, 15, "high_protein", "asiatico,proteico"),
        ("Bowl power de salmon", [("Salmon", 130), ("Arroz integral cocido", 100), ("Palta (aguacate)", 40), ("Espinaca", 30), ("Brocoli", 40)], 2, 20, "high_protein", "proteico,saludable"),
        ("Pasta con pollo y brocoli", [("Pasta cocida", 150), ("Pechuga de pollo", 120), ("Brocoli", 80), ("Aceite de oliva", 5)], 2, 20, "general", "clasico"),
        ("Pollo a la naranja con arroz", [("Pechuga de pollo", 150), ("Arroz blanco cocido", 150), ("Naranja", 60), ("Cebolla", 20)], 2, 25, "general", "asiatico"),
        ("Cazuela de cerdo con verduras", [("Lomo de cerdo", 120), ("Papa cocida", 130), ("Zapallo italiano", 50), ("Zanahoria", 40), ("Choclo cocido", 40)], 2, 40, "general", "chileno,casero"),
        ("Taco bowl de pollo", [("Pechuga de pollo", 130), ("Arroz blanco cocido", 100), ("Porotos negros cocidos", 60), ("Lechuga", 30), ("Tomate", 30), ("Palta (aguacate)", 30)], 1, 15, "general", "mexicano"),
        ("Salmon teriyaki con arroz", [("Salmon", 130), ("Arroz blanco cocido", 140), ("Brocoli", 50), ("Miel", 10)], 2, 25, "high_protein", "asiatico,proteico"),
        ("Arroz con huevo y verduras", [("Arroz blanco cocido", 180), ("Huevo entero", 120), ("Zanahoria", 40), ("Espinaca", 30), ("Aceite de oliva", 5)], 1, 15, "general", "rapido,economico"),
        ("Ensalada tibia de salmon", [("Salmon", 120), ("Espinaca", 60), ("Tomate", 50), ("Quinoa cocida", 80), ("Aceite de oliva", 10)], 2, 20, "high_protein", "proteico,saludable"),
        ("Bowl de lentejas y camote", [("Lentejas cocidas", 180), ("Camote cocido", 120), ("Espinaca", 40), ("Cebolla", 20)], 2, 25, "vegetarian", "vegetariano,saludable"),
        ("Pollo con pure de camote", [("Pechuga de pollo", 150), ("Camote cocido", 200), ("Espinaca", 40)], 2, 25, "high_protein", "proteico"),
        ("Arroz con atun y verduras", [("Arroz blanco cocido", 150), ("Atun en agua", 100), ("Pimenton rojo", 40), ("Cebolla", 20), ("Aceite de oliva", 5)], 1, 15, "high_protein", "proteico,rapido"),
        ("Pasta con tofu y verduras", [("Pasta cocida", 150), ("Tofu firme", 100), ("Pimenton rojo", 40), ("Champiñones", 50), ("Aceite de oliva", 5)], 2, 20, "vegetarian", "vegano"),
        ("Ensalada de pollo y quinoa", [("Pechuga de pollo", 130), ("Quinoa cocida", 100), ("Tomate", 50), ("Pepino", 40), ("Aceite de oliva", 10)], 1, 15, "high_protein", "proteico,saludable"),
        ("Cerdo con arroz y brocoli", [("Lomo de cerdo", 140), ("Arroz blanco cocido", 140), ("Brocoli", 80), ("Aceite de oliva", 5)], 2, 25, "general", "clasico"),
        ("Salmon con ensalada verde", [("Salmon", 140), ("Lechuga", 50), ("Pepino", 40), ("Espinaca", 30), ("Palta (aguacate)", 40), ("Aceite de oliva", 5)], 2, 20, "high_protein", "proteico,low_carb"),
        ("Arroz con porotos y ensalada", [("Porotos negros cocidos", 150), ("Arroz blanco cocido", 150), ("Lechuga", 30), ("Tomate", 30)], 1, 15, "vegetarian", "vegetariano,economico"),
        ("Bowl de camarones thai", [("Camarones", 130), ("Arroz blanco cocido", 120), ("Zanahoria", 30), ("Pepino", 30), ("Mani", 10)], 2, 20, "high_protein", "asiatico,proteico"),
        ("Pollo al horno con arroz integral", [("Pechuga de pollo", 150), ("Arroz integral cocido", 160), ("Espinaca", 40), ("Aceite de oliva", 5)], 2, 30, "high_protein", "proteico,saludable"),
        ("Carne con pure y ensalada", [("Carne molida magra", 130), ("Papa cocida", 150), ("Lechuga", 40), ("Tomate", 40)], 2, 30, "general", "clasico"),
        ("Quinoa con salmon y palta", [("Quinoa cocida", 130), ("Salmon", 100), ("Palta (aguacate)", 40), ("Pepino", 30)], 2, 20, "high_protein", "saludable,proteico"),
        ("Tofu salteado con arroz", [("Tofu firme", 130), ("Arroz blanco cocido", 150), ("Brocoli", 50), ("Pimenton rojo", 40), ("Aceite de oliva", 5)], 2, 20, "vegetarian", "vegano"),
        ("Ensalada waldorf con pollo", [("Pechuga de pollo", 120), ("Manzana", 60), ("Nueces", 15), ("Lechuga", 60), ("Yogurt griego", 30)], 1, 15, "general", "saludable"),
        ("Arroz con merluza y verduras", [("Arroz blanco cocido", 150), ("Merluza", 150), ("Zanahoria", 40), ("Brocoli", 50), ("Aceite de oliva", 5)], 2, 25, "general", "saludable"),
        ("Wrap de camarones", [("Tortilla de maiz", 60), ("Camarones", 120), ("Palta (aguacate)", 30), ("Lechuga", 20), ("Tomate", 30)], 1, 10, "high_protein", "rapido,proteico"),
        ("Pollo con lentejas", [("Pechuga de pollo", 120), ("Lentejas cocidas", 150), ("Zanahoria", 40), ("Cebolla", 20)], 2, 30, "high_protein", "proteico,casero"),
        ("Bowl hawaiano de atun", [("Atun en agua", 120), ("Arroz blanco cocido", 120), ("Palta (aguacate)", 40), ("Pepino", 40), ("Zanahoria", 30)], 1, 10, "high_protein", "asiatico,fresco"),
        ("Pasta con salmon y espinaca", [("Pasta cocida", 150), ("Salmon", 100), ("Espinaca", 50), ("Aceite de oliva", 10)], 2, 20, "high_protein", "proteico"),
        ("Pollo con arroz y champiñones", [("Pechuga de pollo", 140), ("Arroz blanco cocido", 140), ("Champiñones", 80), ("Aceite de oliva", 5)], 2, 25, "general", "clasico"),
        ("Ensalada de garbanzos y atun", [("Porotos negros cocidos", 120), ("Atun en agua", 100), ("Tomate", 50), ("Cebolla", 20), ("Aceite de oliva", 10)], 1, 10, "high_protein", "proteico,fresco"),
        ("Arroz con cerdo y champiñones", [("Lomo de cerdo", 120), ("Arroz blanco cocido", 150), ("Champiñones", 80), ("Aceite de oliva", 5)], 2, 25, "general", "clasico"),
        ("Tortilla de quinoa y verduras", [("Quinoa cocida", 120), ("Huevo entero", 120), ("Espinaca", 40), ("Pimenton rojo", 30)], 2, 20, "vegetarian", "vegetariano"),
        ("Pollo con pasta y pesto", [("Pechuga de pollo", 120), ("Pasta cocida", 140), ("Espinaca", 30), ("Almendras", 10), ("Aceite de oliva", 10)], 2, 20, "general", "clasico"),
        ("Salmon con pure de papa", [("Salmon", 130), ("Papa cocida", 180), ("Espinaca", 40), ("Aceite de oliva", 5)], 2, 25, "high_protein", "proteico"),
        ("Bowl de cerdo con verduras", [("Lomo de cerdo", 130), ("Arroz blanco cocido", 120), ("Brocoli", 50), ("Zanahoria", 30), ("Aceite de oliva", 5)], 2, 25, "general", "clasico"),
        ("Ensalada nicoise light", [("Atun en agua", 100), ("Huevo entero", 60), ("Papa cocida", 80), ("Lechuga", 40), ("Tomate", 40), ("Aceite de oliva", 5)], 1, 15, "high_protein", "proteico,fresco"),
        ("Pollo con camote y espinaca", [("Pechuga de pollo", 140), ("Camote cocido", 150), ("Espinaca", 50)], 2, 25, "high_protein", "proteico,saludable"),
        ("Arroz con lentejas y cebolla", [("Arroz blanco cocido", 150), ("Lentejas cocidas", 150), ("Cebolla", 30), ("Aceite de oliva", 5)], 2, 25, "vegetarian", "vegetariano,economico"),
        ("Merluza con quinoa", [("Merluza", 170), ("Quinoa cocida", 130), ("Brocoli", 60), ("Aceite de oliva", 5)], 2, 25, "high_protein", "saludable"),
        ("Wrap vegano de tofu", [("Tortilla de maiz", 60), ("Tofu firme", 100), ("Palta (aguacate)", 40), ("Lechuga", 20), ("Zanahoria", 20)], 1, 10, "vegetarian", "vegano,rapido"),
        ("Pollo con papa y zanahoria al horno", [("Pechuga de pollo", 150), ("Papa cocida", 130), ("Zanahoria", 60), ("Aceite de oliva", 10)], 2, 35, "general", "casero"),
        ("Bowl de carne y quinoa", [("Carne molida magra", 120), ("Quinoa cocida", 120), ("Palta (aguacate)", 40), ("Tomate", 40)], 2, 20, "high_protein", "proteico"),
        ("Ensalada de pasta con pollo", [("Pasta cocida", 120), ("Pechuga de pollo", 100), ("Tomate", 50), ("Aceite de oliva", 10), ("Lechuga", 30)], 1, 15, "general", "fresco"),
        ("Camarones con quinoa y verduras", [("Camarones", 120), ("Quinoa cocida", 130), ("Pimenton rojo", 40), ("Espinaca", 30), ("Aceite de oliva", 5)], 2, 20, "high_protein", "proteico,saludable"),
        ("Cerdo con quinoa y brocoli", [("Lomo de cerdo", 140), ("Quinoa cocida", 130), ("Brocoli", 80), ("Aceite de oliva", 5)], 2, 25, "high_protein", "proteico"),
        ("Pollo con arroz y pimenton", [("Pechuga de pollo", 140), ("Arroz blanco cocido", 150), ("Pimenton rojo", 60), ("Cebolla", 20), ("Aceite de oliva", 5)], 2, 25, "general", "clasico"),
        ("Bowl de salmon con edamame", [("Salmon", 110), ("Arroz blanco cocido", 100), ("Palta (aguacate)", 30), ("Pepino", 30), ("Porotos negros cocidos", 50)], 2, 15, "high_protein", "asiatico"),
        ("Lentejas con arroz integral", [("Lentejas cocidas", 180), ("Arroz integral cocido", 140), ("Cebolla", 20), ("Aceite de oliva", 5)], 2, 25, "vegetarian", "vegetariano,economico"),
        # Additional lunches to reach 150+
        ("Arroz con pollo y palta", [("Arroz blanco cocido", 140), ("Pechuga de pollo", 120), ("Palta (aguacate)", 40), ("Lechuga", 20)], 2, 20, "general", "rapido"),
        ("Merluza con arroz integral y brocoli", [("Merluza", 160), ("Arroz integral cocido", 130), ("Brocoli", 70), ("Aceite de oliva", 5)], 2, 25, "general", "saludable"),
        ("Pollo al cilantro con arroz", [("Pechuga de pollo", 150), ("Arroz blanco cocido", 150), ("Cebolla", 20), ("Aceite de oliva", 5)], 2, 25, "general", "clasico"),
        ("Ceviche de merluza", [("Merluza", 150), ("Tomate", 60), ("Cebolla", 30), ("Pepino", 40), ("Camote cocido", 80)], 2, 20, "high_protein", "peruano,fresco"),
        ("Pollo al oregano con camote", [("Pechuga de pollo", 150), ("Camote cocido", 160), ("Espinaca", 30), ("Aceite de oliva", 5)], 2, 30, "high_protein", "proteico"),
        ("Salmon con arroz y ensalada verde", [("Salmon", 120), ("Arroz blanco cocido", 120), ("Lechuga", 30), ("Pepino", 30), ("Aceite de oliva", 5)], 2, 25, "high_protein", "proteico"),
        ("Ensalada de pollo con camote", [("Pechuga de pollo", 130), ("Camote cocido", 100), ("Lechuga", 40), ("Tomate", 40), ("Aceite de oliva", 5)], 1, 20, "high_protein", "proteico,saludable"),
        ("Cerdo con quinoa y espinaca", [("Lomo de cerdo", 130), ("Quinoa cocida", 130), ("Espinaca", 40), ("Aceite de oliva", 5)], 2, 25, "high_protein", "proteico"),
        ("Bowl de atun con camote", [("Atun en agua", 120), ("Camote cocido", 120), ("Palta (aguacate)", 30), ("Lechuga", 20)], 1, 15, "high_protein", "proteico"),
        ("Pollo con arroz y zanahoria", [("Pechuga de pollo", 140), ("Arroz blanco cocido", 140), ("Zanahoria", 50), ("Aceite de oliva", 5)], 2, 25, "general", "casero"),
        ("Pasta con merluza y espinaca", [("Pasta cocida", 140), ("Merluza", 130), ("Espinaca", 40), ("Aceite de oliva", 5)], 2, 20, "general", "saludable"),
        ("Wrap de carne con verduras", [("Tortilla de maiz", 60), ("Carne molida magra", 100), ("Lechuga", 20), ("Tomate", 30), ("Palta (aguacate)", 20)], 1, 15, "general", "rapido"),
        ("Camarones con arroz integral", [("Camarones", 130), ("Arroz integral cocido", 150), ("Brocoli", 50), ("Aceite de oliva", 5)], 2, 20, "high_protein", "proteico"),
        ("Bowl de pollo con camote y palta", [("Pechuga de pollo", 120), ("Camote cocido", 100), ("Palta (aguacate)", 40), ("Espinaca", 20)], 2, 20, "high_protein", "proteico"),
        ("Arroz con merluza y zanahoria", [("Arroz blanco cocido", 140), ("Merluza", 130), ("Zanahoria", 40), ("Cebolla", 20), ("Aceite de oliva", 5)], 2, 25, "general", "casero"),
        ("Pollo con ensalada de repollo", [("Pechuga de pollo", 140), ("Lechuga", 60), ("Zanahoria", 40), ("Aceite de oliva", 5)], 1, 15, "high_protein", "proteico"),
        ("Salmon con camote y brocoli", [("Salmon", 130), ("Camote cocido", 130), ("Brocoli", 60), ("Aceite de oliva", 5)], 2, 25, "high_protein", "proteico,saludable"),
        ("Bowl de quinoa y verduras grilladas", [("Quinoa cocida", 150), ("Zapallo italiano", 50), ("Pimenton rojo", 50), ("Cebolla", 20), ("Aceite de oliva", 10)], 2, 20, "vegetarian", "vegetariano"),
        ("Pollo con pasta y champiñones", [("Pechuga de pollo", 120), ("Pasta cocida", 130), ("Champiñones", 60), ("Aceite de oliva", 5)], 2, 20, "general", "clasico"),
        ("Tofu con arroz y brocoli", [("Tofu firme", 130), ("Arroz blanco cocido", 140), ("Brocoli", 60), ("Aceite de oliva", 5)], 2, 20, "vegetarian", "vegano"),
        ("Ensalada de camarones con palta", [("Camarones", 120), ("Palta (aguacate)", 50), ("Lechuga", 40), ("Tomate", 40), ("Aceite de oliva", 5)], 1, 15, "high_protein", "proteico,fresco"),
        ("Cerdo con papa y ensalada", [("Lomo de cerdo", 130), ("Papa cocida", 130), ("Lechuga", 30), ("Tomate", 30)], 2, 25, "general", "casero"),
        ("Arroz con salmon y espinaca", [("Arroz blanco cocido", 130), ("Salmon", 100), ("Espinaca", 40), ("Aceite de oliva", 5)], 2, 20, "high_protein", "proteico"),
    ]

    # ===== DINNERS (150) =====
    dinner_defs = [
        ("Salmon al horno con verduras", [("Salmon", 150), ("Brocoli", 80), ("Zanahoria", 50), ("Aceite de oliva", 10)], 2, 25, "high_protein", "proteico,saludable"),
        ("Pechuga grillada con ensalada", [("Pechuga de pollo", 150), ("Lechuga", 60), ("Tomate", 50), ("Pepino", 40), ("Aceite de oliva", 10)], 1, 15, "high_protein", "proteico,low_carb"),
        ("Sopa de lentejas", [("Lentejas cocidas", 200), ("Zanahoria", 50), ("Espinaca", 40), ("Cebolla", 30), ("Papa cocida", 50)], 2, 30, "vegetarian", "vegetariano,economico"),
        ("Merluza al vapor con verduras", [("Merluza", 180), ("Brocoli", 80), ("Zanahoria", 50), ("Espinaca", 30)], 2, 20, "general", "saludable,ligero"),
        ("Omelette de cena con ensalada", [("Huevo entero", 150), ("Champiñones", 60), ("Espinaca", 40), ("Queso", 15), ("Lechuga", 40), ("Tomate", 30)], 1, 15, "general", "rapido,ligero"),
        ("Pollo al horno con verduras", [("Pechuga de pollo", 150), ("Zapallo italiano", 80), ("Pimenton rojo", 50), ("Cebolla", 30), ("Aceite de oliva", 5)], 2, 30, "high_protein", "proteico"),
        ("Sopa de pollo con verduras", [("Pechuga de pollo", 120), ("Papa cocida", 80), ("Zanahoria", 40), ("Espinaca", 30), ("Cebolla", 20)], 2, 30, "general", "casero,ligero"),
        ("Salmon a la plancha con brocoli", [("Salmon", 150), ("Brocoli", 120), ("Aceite de oliva", 5)], 2, 20, "high_protein", "proteico,low_carb"),
        ("Ensalada de pollo tibia", [("Pechuga de pollo", 140), ("Espinaca", 60), ("Tomate", 50), ("Almendras", 15), ("Aceite de oliva", 10)], 1, 15, "high_protein", "proteico,saludable"),
        ("Cerdo al horno con verduras", [("Lomo de cerdo", 140), ("Brocoli", 80), ("Zanahoria", 50), ("Aceite de oliva", 5)], 2, 30, "high_protein", "proteico"),
        ("Crema de zapallo", [("Zapallo italiano", 200), ("Papa cocida", 80), ("Cebolla", 30), ("Leche descremada", 100), ("Aceite de oliva", 5)], 2, 25, "general", "ligero,casero"),
        ("Pollo con ensalada de quinoa", [("Pechuga de pollo", 130), ("Quinoa cocida", 100), ("Tomate", 40), ("Pepino", 30), ("Aceite de oliva", 5)], 2, 25, "high_protein", "proteico,saludable"),
        ("Camarones salteados con verduras", [("Camarones", 150), ("Pimenton rojo", 60), ("Zapallo italiano", 60), ("Cebolla", 20), ("Aceite de oliva", 5)], 2, 15, "high_protein", "proteico,low_carb"),
        ("Sopa crema de brocoli", [("Brocoli", 200), ("Papa cocida", 80), ("Leche descremada", 100), ("Cebolla", 20), ("Aceite de oliva", 5)], 2, 25, "vegetarian", "vegetariano,ligero"),
        ("Atun a la plancha con ensalada", [("Atun en agua", 150), ("Lechuga", 60), ("Tomate", 50), ("Palta (aguacate)", 40), ("Aceite de oliva", 5)], 2, 15, "high_protein", "proteico"),
        ("Pollo con verduras al wok", [("Pechuga de pollo", 140), ("Brocoli", 60), ("Pimenton rojo", 40), ("Zanahoria", 30), ("Aceite de oliva", 5)], 2, 15, "high_protein", "asiatico,proteico"),
        ("Tortilla de espinaca y queso", [("Huevo entero", 150), ("Espinaca", 80), ("Queso", 20), ("Cebolla", 20)], 1, 15, "general", "vegetariano"),
        ("Merluza con ensalada verde", [("Merluza", 170), ("Lechuga", 50), ("Pepino", 40), ("Espinaca", 30), ("Aceite de oliva", 10)], 2, 20, "general", "saludable,ligero"),
        ("Salmon con espinaca y papa", [("Salmon", 130), ("Espinaca", 60), ("Papa cocida", 100), ("Aceite de oliva", 5)], 2, 25, "high_protein", "proteico"),
        ("Ensalada mediterranea", [("Tomate", 60), ("Pepino", 50), ("Queso", 20), ("Aceite de oliva", 10), ("Lechuga", 50), ("Palta (aguacate)", 40)], 1, 10, "vegetarian", "vegetariano,fresco"),
        ("Pollo a la plancha con zapallo", [("Pechuga de pollo", 150), ("Zapallo italiano", 100), ("Tomate", 40), ("Aceite de oliva", 5)], 2, 20, "high_protein", "proteico,low_carb"),
        ("Bowl de cena proteico", [("Pechuga de pollo", 130), ("Quinoa cocida", 80), ("Palta (aguacate)", 30), ("Espinaca", 30), ("Huevo entero", 30)], 2, 20, "high_protein", "proteico"),
        ("Sopa de verduras", [("Papa cocida", 80), ("Zanahoria", 50), ("Zapallo italiano", 60), ("Espinaca", 30), ("Cebolla", 20)], 1, 25, "vegetarian", "vegetariano,ligero"),
        ("Carne con brocoli al wok", [("Carne molida magra", 130), ("Brocoli", 100), ("Pimenton rojo", 40), ("Cebolla", 20), ("Aceite de oliva", 5)], 2, 15, "high_protein", "proteico"),
        ("Camarones al horno con verduras", [("Camarones", 150), ("Brocoli", 80), ("Zanahoria", 40), ("Aceite de oliva", 10)], 2, 20, "high_protein", "proteico,saludable"),
        ("Ensalada de atun y palta", [("Atun en agua", 130), ("Palta (aguacate)", 60), ("Lechuga", 50), ("Tomate", 40), ("Aceite de oliva", 5)], 1, 10, "high_protein", "proteico,low_carb"),
        ("Pollo al horno con champiñones", [("Pechuga de pollo", 150), ("Champiñones", 100), ("Espinaca", 40), ("Aceite de oliva", 5)], 2, 25, "high_protein", "proteico"),
        ("Crema de zanahoria", [("Zanahoria", 200), ("Papa cocida", 80), ("Leche descremada", 100), ("Cebolla", 20), ("Aceite de oliva", 5)], 2, 25, "vegetarian", "vegetariano,ligero"),
        ("Salmon con verduras grilladas", [("Salmon", 140), ("Zapallo italiano", 60), ("Pimenton rojo", 50), ("Cebolla", 20), ("Aceite de oliva", 5)], 2, 20, "high_protein", "proteico"),
        ("Cerdo con brocoli y zanahoria", [("Lomo de cerdo", 140), ("Brocoli", 80), ("Zanahoria", 50), ("Aceite de oliva", 5)], 2, 25, "high_protein", "proteico"),
        ("Ensalada tibia de pollo y espinaca", [("Pechuga de pollo", 130), ("Espinaca", 80), ("Tomate", 40), ("Almendras", 10), ("Aceite de oliva", 10)], 1, 15, "high_protein", "proteico,saludable"),
        ("Sopa de champiñones", [("Champiñones", 150), ("Papa cocida", 60), ("Leche descremada", 100), ("Cebolla", 20), ("Aceite de oliva", 5)], 2, 25, "vegetarian", "vegetariano,ligero"),
        ("Merluza al horno con espinaca", [("Merluza", 180), ("Espinaca", 80), ("Aceite de oliva", 10)], 2, 20, "general", "saludable,bajo_grasa"),
        ("Pollo con calabacin y tomate", [("Pechuga de pollo", 140), ("Zapallo italiano", 80), ("Tomate", 60), ("Aceite de oliva", 5)], 2, 20, "high_protein", "proteico,low_carb"),
        ("Tofu con verduras al curry", [("Tofu firme", 150), ("Brocoli", 60), ("Zanahoria", 40), ("Cebolla", 20), ("Aceite de oliva", 5)], 2, 20, "vegetarian", "vegano,asiatico"),
        ("Ensalada de camarones", [("Camarones", 130), ("Lechuga", 50), ("Palta (aguacate)", 40), ("Pepino", 30), ("Tomate", 30), ("Aceite de oliva", 5)], 1, 15, "high_protein", "proteico,fresco"),
        ("Pollo al papillote", [("Pechuga de pollo", 150), ("Espinaca", 50), ("Zanahoria", 40), ("Aceite de oliva", 5)], 2, 25, "high_protein", "proteico,saludable"),
        ("Crema de espinaca", [("Espinaca", 200), ("Papa cocida", 60), ("Leche descremada", 100), ("Cebolla", 20), ("Aceite de oliva", 5)], 2, 25, "vegetarian", "vegetariano,ligero"),
        ("Salmon al vapor con brocoli", [("Salmon", 140), ("Brocoli", 100), ("Zanahoria", 40)], 2, 20, "high_protein", "proteico,saludable"),
        ("Cerdo con champiñones", [("Lomo de cerdo", 140), ("Champiñones", 100), ("Cebolla", 20), ("Aceite de oliva", 5)], 2, 25, "high_protein", "proteico"),
        ("Ensalada caprese", [("Tomate", 100), ("Queso", 30), ("Aceite de oliva", 10), ("Lechuga", 40)], 1, 5, "vegetarian", "vegetariano,fresco"),
        ("Pollo grillado con espinaca", [("Pechuga de pollo", 150), ("Espinaca", 80), ("Aceite de oliva", 5)], 1, 15, "high_protein", "proteico,low_carb"),
        ("Merluza con brocoli y papa", [("Merluza", 160), ("Brocoli", 80), ("Papa cocida", 80), ("Aceite de oliva", 5)], 2, 25, "general", "saludable"),
        ("Ensalada de tofu y verduras", [("Tofu firme", 130), ("Lechuga", 50), ("Tomate", 50), ("Pepino", 40), ("Aceite de oliva", 10)], 1, 10, "vegetarian", "vegano,fresco"),
        ("Pollo al limon con espinaca", [("Pechuga de pollo", 150), ("Espinaca", 60), ("Aceite de oliva", 5)], 1, 15, "high_protein", "proteico,low_carb"),
        ("Sopa minestrone", [("Porotos negros cocidos", 80), ("Zanahoria", 40), ("Zapallo italiano", 50), ("Espinaca", 30), ("Papa cocida", 60), ("Cebolla", 20)], 2, 30, "vegetarian", "vegetariano,casero"),
        ("Atun con verduras salteadas", [("Atun en agua", 130), ("Pimenton rojo", 50), ("Zapallo italiano", 60), ("Cebolla", 20), ("Aceite de oliva", 5)], 2, 15, "high_protein", "proteico"),
        ("Cerdo al horno con espinaca", [("Lomo de cerdo", 140), ("Espinaca", 80), ("Tomate", 40), ("Aceite de oliva", 5)], 2, 30, "high_protein", "proteico"),
        ("Ensalada de pollo y nueces", [("Pechuga de pollo", 120), ("Lechuga", 50), ("Nueces", 15), ("Tomate", 40), ("Aceite de oliva", 10)], 1, 10, "high_protein", "proteico"),
        ("Salmon con pepino y palta", [("Salmon", 130), ("Pepino", 50), ("Palta (aguacate)", 50), ("Lechuga", 30)], 1, 10, "high_protein", "proteico,low_carb"),
        ("Pollo con pimenton y cebolla", [("Pechuga de pollo", 150), ("Pimenton rojo", 60), ("Cebolla", 30), ("Aceite de oliva", 5)], 1, 15, "high_protein", "proteico"),
        ("Crema de champiñones light", [("Champiñones", 180), ("Leche descremada", 120), ("Cebolla", 20), ("Aceite de oliva", 5)], 2, 20, "vegetarian", "vegetariano,ligero"),
        ("Camarones con brocoli", [("Camarones", 150), ("Brocoli", 100), ("Aceite de oliva", 5)], 1, 15, "high_protein", "proteico,low_carb"),
        ("Ensalada templada de salmon", [("Salmon", 120), ("Espinaca", 60), ("Tomate", 40), ("Nueces", 10), ("Aceite de oliva", 5)], 1, 15, "high_protein", "proteico"),
        ("Pollo con tomate al horno", [("Pechuga de pollo", 150), ("Tomate", 80), ("Cebolla", 20), ("Aceite de oliva", 5)], 2, 25, "high_protein", "proteico"),
        ("Tortilla de papa light", [("Huevo entero", 150), ("Papa cocida", 100), ("Cebolla", 20), ("Aceite de oliva", 5)], 2, 20, "general", "casero"),
        ("Merluza a la plancha con ensalada", [("Merluza", 170), ("Lechuga", 50), ("Tomate", 40), ("Pepino", 30), ("Aceite de oliva", 10)], 2, 15, "general", "saludable"),
        ("Pollo con zanahoria y cebolla", [("Pechuga de pollo", 140), ("Zanahoria", 60), ("Cebolla", 30), ("Aceite de oliva", 5)], 2, 20, "high_protein", "proteico"),
        ("Bowl de atun y verduras", [("Atun en agua", 120), ("Lechuga", 40), ("Tomate", 40), ("Palta (aguacate)", 30), ("Pepino", 30)], 1, 10, "high_protein", "proteico,fresco"),
        ("Sopa de pollo y espinaca", [("Pechuga de pollo", 100), ("Espinaca", 60), ("Papa cocida", 60), ("Zanahoria", 30), ("Cebolla", 20)], 2, 25, "general", "ligero,casero"),
        ("Cerdo con verduras al horno", [("Lomo de cerdo", 130), ("Zapallo italiano", 60), ("Pimenton rojo", 40), ("Zanahoria", 40), ("Aceite de oliva", 5)], 2, 30, "high_protein", "proteico"),
        ("Ensalada tropical de camarones", [("Camarones", 120), ("Palta (aguacate)", 40), ("Manzana", 50), ("Lechuga", 40), ("Aceite de oliva", 5)], 1, 10, "high_protein", "proteico,fresco"),
        ("Pollo con espinaca y queso", [("Pechuga de pollo", 140), ("Espinaca", 60), ("Queso", 15), ("Aceite de oliva", 5)], 2, 20, "high_protein", "proteico"),
        ("Crema de pimenton", [("Pimenton rojo", 200), ("Papa cocida", 60), ("Leche descremada", 100), ("Cebolla", 20), ("Aceite de oliva", 5)], 2, 25, "vegetarian", "vegetariano,ligero"),
        ("Merluza con champiñones", [("Merluza", 170), ("Champiñones", 80), ("Espinaca", 30), ("Aceite de oliva", 5)], 2, 20, "general", "saludable"),
        ("Pollo a la mostaza con verduras", [("Pechuga de pollo", 150), ("Brocoli", 80), ("Zanahoria", 40), ("Aceite de oliva", 5)], 2, 25, "high_protein", "proteico"),
        ("Ensalada de lentejas tibia", [("Lentejas cocidas", 170), ("Espinaca", 50), ("Tomate", 40), ("Cebolla", 20), ("Aceite de oliva", 10)], 1, 15, "vegetarian", "vegetariano,saludable"),
        ("Salmon con almendras y brocoli", [("Salmon", 130), ("Almendras", 15), ("Brocoli", 80), ("Aceite de oliva", 5)], 2, 20, "high_protein", "proteico"),
        ("Cerdo con ensalada fresca", [("Lomo de cerdo", 140), ("Lechuga", 50), ("Tomate", 40), ("Pepino", 30), ("Aceite de oliva", 10)], 2, 20, "high_protein", "proteico"),
        ("Sopa de lentejas con espinaca", [("Lentejas cocidas", 180), ("Espinaca", 60), ("Zanahoria", 30), ("Cebolla", 20)], 2, 30, "vegetarian", "vegetariano"),
        ("Pollo grillado con pepino y palta", [("Pechuga de pollo", 140), ("Pepino", 50), ("Palta (aguacate)", 50), ("Tomate", 30)], 1, 15, "high_protein", "proteico,low_carb"),
        ("Camarones al curry con verduras", [("Camarones", 140), ("Brocoli", 60), ("Pimenton rojo", 40), ("Leche descremada", 50), ("Aceite de oliva", 5)], 2, 20, "high_protein", "asiatico,proteico"),
        ("Ensalada de salmon y espinaca", [("Salmon", 120), ("Espinaca", 60), ("Tomate", 40), ("Palta (aguacate)", 30), ("Aceite de oliva", 5)], 1, 10, "high_protein", "proteico,saludable"),
        ("Pollo con calabacin grillado", [("Pechuga de pollo", 140), ("Zapallo italiano", 100), ("Aceite de oliva", 5)], 1, 20, "high_protein", "proteico,low_carb"),
        ("Merluza con zanahoria al vapor", [("Merluza", 170), ("Zanahoria", 60), ("Brocoli", 60), ("Aceite de oliva", 5)], 2, 20, "general", "saludable"),
        ("Tofu salteado con espinaca", [("Tofu firme", 150), ("Espinaca", 80), ("Champiñones", 60), ("Aceite de oliva", 5)], 2, 15, "vegetarian", "vegano"),
        ("Cerdo al horno con zanahoria", [("Lomo de cerdo", 140), ("Zanahoria", 60), ("Cebolla", 20), ("Aceite de oliva", 5)], 2, 30, "high_protein", "proteico"),
        ("Ensalada de huevo y espinaca", [("Huevo entero", 120), ("Espinaca", 80), ("Tomate", 40), ("Palta (aguacate)", 30), ("Aceite de oliva", 5)], 1, 15, "general", "vegetariano"),
        ("Salmon al horno con espinaca", [("Salmon", 140), ("Espinaca", 80), ("Aceite de oliva", 5)], 2, 20, "high_protein", "proteico,low_carb"),
        ("Sopa crema de papa y puerro", [("Papa cocida", 120), ("Cebolla", 30), ("Leche descremada", 120), ("Aceite de oliva", 5)], 2, 25, "vegetarian", "vegetariano,ligero"),
        ("Pollo con verduras al vapor", [("Pechuga de pollo", 140), ("Brocoli", 60), ("Zanahoria", 40), ("Espinaca", 30)], 2, 20, "high_protein", "proteico,saludable"),
        ("Atun con ensalada de espinaca", [("Atun en agua", 130), ("Espinaca", 60), ("Tomate", 40), ("Pepino", 30), ("Aceite de oliva", 10)], 1, 10, "high_protein", "proteico"),
        ("Cerdo con calabacin", [("Lomo de cerdo", 140), ("Zapallo italiano", 100), ("Tomate", 40), ("Aceite de oliva", 5)], 2, 20, "high_protein", "proteico"),
        ("Ensalada césar ligera", [("Pechuga de pollo", 120), ("Lechuga", 80), ("Queso", 10), ("Pan integral", 20), ("Aceite de oliva", 5)], 1, 15, "high_protein", "proteico"),
        ("Camarones con espinaca", [("Camarones", 140), ("Espinaca", 80), ("Tomate", 30), ("Aceite de oliva", 5)], 1, 15, "high_protein", "proteico"),
        ("Pollo al horno con brocoli y papa", [("Pechuga de pollo", 130), ("Brocoli", 60), ("Papa cocida", 80), ("Aceite de oliva", 5)], 2, 30, "general", "casero"),
        ("Sopa de verduras con pollo", [("Pechuga de pollo", 80), ("Zapallo italiano", 50), ("Zanahoria", 40), ("Espinaca", 30), ("Cebolla", 20), ("Papa cocida", 50)], 2, 30, "general", "ligero"),
        ("Merluza con pimenton", [("Merluza", 170), ("Pimenton rojo", 60), ("Cebolla", 20), ("Aceite de oliva", 10)], 2, 20, "general", "saludable"),
        ("Ensalada detox", [("Espinaca", 60), ("Pepino", 50), ("Palta (aguacate)", 40), ("Manzana", 50), ("Almendras", 10), ("Aceite de oliva", 5)], 1, 10, "vegetarian", "vegetariano,saludable"),
        ("Pollo con tomate y albahaca", [("Pechuga de pollo", 140), ("Tomate", 80), ("Aceite de oliva", 5)], 1, 15, "high_protein", "proteico"),
        ("Salmon con champiñones", [("Salmon", 130), ("Champiñones", 80), ("Espinaca", 30), ("Aceite de oliva", 5)], 2, 20, "high_protein", "proteico"),
        ("Cerdo con espinaca y tomate", [("Lomo de cerdo", 130), ("Espinaca", 60), ("Tomate", 50), ("Aceite de oliva", 5)], 2, 20, "high_protein", "proteico"),
        ("Camarones con champiñones", [("Camarones", 130), ("Champiñones", 80), ("Espinaca", 30), ("Aceite de oliva", 10)], 2, 15, "high_protein", "proteico"),
        ("Bowl nocturno de quinoa y pollo", [("Quinoa cocida", 80), ("Pechuga de pollo", 120), ("Espinaca", 30), ("Tomate", 30), ("Aceite de oliva", 5)], 2, 20, "high_protein", "proteico"),
        ("Ensalada de merluza y palta", [("Merluza", 150), ("Palta (aguacate)", 50), ("Lechuga", 40), ("Tomate", 30), ("Aceite de oliva", 5)], 2, 15, "general", "saludable"),
        ("Pollo con ensalada de espinaca", [("Pechuga de pollo", 140), ("Espinaca", 70), ("Tomate", 40), ("Almendras", 10), ("Aceite de oliva", 5)], 1, 15, "high_protein", "proteico"),
        ("Lentejas con espinaca y zanahoria", [("Lentejas cocidas", 200), ("Espinaca", 50), ("Zanahoria", 40), ("Cebolla", 20)], 2, 25, "vegetarian", "vegetariano"),
        ("Salmon con quinoa y espinaca", [("Salmon", 120), ("Quinoa cocida", 80), ("Espinaca", 40), ("Aceite de oliva", 5)], 2, 20, "high_protein", "proteico,saludable"),
        ("Merluza al horno con tomate", [("Merluza", 180), ("Tomate", 80), ("Cebolla", 20), ("Aceite de oliva", 10)], 2, 25, "general", "saludable"),
        ("Cerdo con verduras al vapor", [("Lomo de cerdo", 130), ("Brocoli", 60), ("Zanahoria", 40), ("Espinaca", 30)], 2, 20, "high_protein", "proteico,saludable"),
        ("Ensalada proteica completa", [("Pechuga de pollo", 100), ("Huevo entero", 60), ("Lechuga", 40), ("Tomate", 30), ("Palta (aguacate)", 30), ("Aceite de oliva", 5)], 1, 15, "high_protein", "proteico"),
        ("Pollo al ajillo con verduras", [("Pechuga de pollo", 150), ("Champiñones", 60), ("Pimenton rojo", 30), ("Aceite de oliva", 10)], 2, 20, "high_protein", "proteico"),
        ("Sopa de tomate", [("Tomate", 200), ("Cebolla", 30), ("Aceite de oliva", 10), ("Pan integral", 30)], 1, 20, "vegetarian", "vegetariano,ligero"),
        ("Camarones a la plancha con ensalada", [("Camarones", 150), ("Lechuga", 50), ("Tomate", 40), ("Pepino", 30), ("Aceite de oliva", 5)], 1, 15, "high_protein", "proteico"),
        ("Cerdo con ensalada de espinaca", [("Lomo de cerdo", 130), ("Espinaca", 60), ("Tomate", 40), ("Nueces", 10), ("Aceite de oliva", 5)], 2, 20, "high_protein", "proteico"),
        # Additional dinners to reach 150+
        ("Pollo al romero con verduras", [("Pechuga de pollo", 150), ("Zapallo italiano", 60), ("Zanahoria", 40), ("Aceite de oliva", 10)], 2, 30, "high_protein", "proteico"),
        ("Merluza al limon con brocoli", [("Merluza", 170), ("Brocoli", 100), ("Aceite de oliva", 5)], 2, 20, "general", "saludable"),
        ("Salmon al eneldo con espinaca", [("Salmon", 140), ("Espinaca", 70), ("Aceite de oliva", 5)], 2, 20, "high_protein", "proteico"),
        ("Cerdo con brocoli y quinoa", [("Lomo de cerdo", 130), ("Brocoli", 80), ("Quinoa cocida", 80), ("Aceite de oliva", 5)], 2, 25, "high_protein", "proteico"),
        ("Ensalada de merluza y espinaca", [("Merluza", 150), ("Espinaca", 60), ("Tomate", 40), ("Aceite de oliva", 10)], 1, 15, "general", "saludable"),
        ("Pollo con espinaca y almendras", [("Pechuga de pollo", 140), ("Espinaca", 60), ("Almendras", 10), ("Aceite de oliva", 5)], 2, 20, "high_protein", "proteico"),
        ("Sopa de pollo con espinaca y papa", [("Pechuga de pollo", 100), ("Espinaca", 50), ("Papa cocida", 80), ("Cebolla", 15)], 2, 30, "general", "casero"),
        ("Atun con ensalada de pepino", [("Atun en agua", 140), ("Pepino", 60), ("Lechuga", 40), ("Aceite de oliva", 10)], 1, 10, "high_protein", "proteico"),
        ("Camarones al limon con espinaca", [("Camarones", 140), ("Espinaca", 60), ("Aceite de oliva", 5)], 1, 15, "high_protein", "proteico"),
        ("Cerdo al horno con pimenton", [("Lomo de cerdo", 140), ("Pimenton rojo", 60), ("Cebolla", 20), ("Aceite de oliva", 5)], 2, 30, "high_protein", "proteico"),
        ("Ensalada de pollo y champiñones", [("Pechuga de pollo", 130), ("Champiñones", 80), ("Lechuga", 40), ("Aceite de oliva", 10)], 1, 15, "high_protein", "proteico"),
        ("Merluza con espinaca y champiñones", [("Merluza", 160), ("Espinaca", 50), ("Champiñones", 60), ("Aceite de oliva", 5)], 2, 20, "general", "saludable"),
        ("Pollo asado con zanahoria y papa", [("Pechuga de pollo", 130), ("Zanahoria", 50), ("Papa cocida", 80), ("Aceite de oliva", 5)], 2, 35, "general", "casero"),
        ("Sopa cremosa de zapallo y pollo", [("Pechuga de pollo", 80), ("Zapallo italiano", 150), ("Leche descremada", 80), ("Cebolla", 20)], 2, 25, "general", "ligero"),
        ("Salmon al horno con pimenton", [("Salmon", 130), ("Pimenton rojo", 60), ("Cebolla", 20), ("Aceite de oliva", 5)], 2, 25, "high_protein", "proteico"),
        ("Tofu grillado con ensalada", [("Tofu firme", 140), ("Lechuga", 40), ("Tomate", 40), ("Pepino", 30), ("Aceite de oliva", 10)], 1, 15, "vegetarian", "vegano"),
        ("Pollo con quinoa y pimenton", [("Pechuga de pollo", 130), ("Quinoa cocida", 100), ("Pimenton rojo", 40), ("Aceite de oliva", 5)], 2, 20, "high_protein", "proteico"),
        ("Crema de brocoli y espinaca", [("Brocoli", 120), ("Espinaca", 80), ("Papa cocida", 50), ("Leche descremada", 80), ("Aceite de oliva", 5)], 2, 25, "vegetarian", "vegetariano,ligero"),
        ("Merluza a la provenzal", [("Merluza", 170), ("Tomate", 60), ("Cebolla", 20), ("Aceite de oliva", 10)], 2, 25, "general", "saludable"),
        ("Cerdo con ensalada mediterránea", [("Lomo de cerdo", 130), ("Tomate", 40), ("Pepino", 30), ("Lechuga", 30), ("Aceite de oliva", 10)], 2, 20, "high_protein", "proteico"),
        ("Camarones a la mantequilla con brocoli", [("Camarones", 140), ("Brocoli", 80), ("Aceite de oliva", 10)], 2, 15, "high_protein", "proteico"),
        ("Pollo al horno con espinaca y tomate", [("Pechuga de pollo", 140), ("Espinaca", 50), ("Tomate", 50), ("Aceite de oliva", 5)], 2, 25, "high_protein", "proteico"),
        ("Salmon con ensalada tibia", [("Salmon", 120), ("Espinaca", 50), ("Champiñones", 40), ("Aceite de oliva", 10)], 2, 20, "high_protein", "proteico"),
        ("Ensalada de tofu con pimenton", [("Tofu firme", 130), ("Pimenton rojo", 50), ("Lechuga", 40), ("Aceite de oliva", 10)], 1, 10, "vegetarian", "vegano"),
        ("Sopa de merluza con verduras", [("Merluza", 120), ("Papa cocida", 60), ("Zanahoria", 30), ("Espinaca", 20), ("Cebolla", 15)], 2, 25, "general", "ligero"),
        ("Pollo relleno de espinaca", [("Pechuga de pollo", 150), ("Espinaca", 50), ("Queso", 10), ("Aceite de oliva", 5)], 2, 30, "high_protein", "proteico"),
        ("Cerdo con verduras al curry", [("Lomo de cerdo", 130), ("Brocoli", 50), ("Zanahoria", 30), ("Cebolla", 20), ("Aceite de oliva", 5)], 2, 25, "general", "asiatico"),
        ("Ensalada de atun con huevo", [("Atun en agua", 100), ("Huevo entero", 60), ("Lechuga", 40), ("Tomate", 30), ("Aceite de oliva", 5)], 1, 15, "high_protein", "proteico"),
        ("Pollo al vapor con brocoli y zanahoria", [("Pechuga de pollo", 140), ("Brocoli", 60), ("Zanahoria", 40)], 2, 20, "high_protein", "proteico,saludable"),
        ("Camarones con verduras mixtas", [("Camarones", 130), ("Pimenton rojo", 40), ("Zapallo italiano", 40), ("Cebolla", 15), ("Aceite de oliva", 5)], 2, 15, "high_protein", "proteico"),
        ("Merluza gratinada light", [("Merluza", 170), ("Queso", 10), ("Espinaca", 40), ("Aceite de oliva", 5)], 2, 25, "general", "saludable"),
        ("Salmon al horno con zanahoria", [("Salmon", 130), ("Zanahoria", 60), ("Brocoli", 50), ("Aceite de oliva", 5)], 2, 25, "high_protein", "proteico"),
        ("Tofu con champiñones y espinaca", [("Tofu firme", 140), ("Champiñones", 70), ("Espinaca", 50), ("Aceite de oliva", 5)], 2, 15, "vegetarian", "vegano"),
        ("Pollo con calabaza y espinaca", [("Pechuga de pollo", 140), ("Zapallo italiano", 80), ("Espinaca", 40), ("Aceite de oliva", 5)], 2, 25, "high_protein", "proteico"),
        ("Ensalada energetica nocturna", [("Pechuga de pollo", 100), ("Quinoa cocida", 60), ("Palta (aguacate)", 30), ("Tomate", 30), ("Espinaca", 20)], 1, 15, "high_protein", "proteico"),
        ("Sopa cremosa de champiñones y pollo", [("Pechuga de pollo", 80), ("Champiñones", 120), ("Leche descremada", 80), ("Cebolla", 15)], 2, 25, "general", "ligero"),
        ("Merluza con pure de camote", [("Merluza", 160), ("Camote cocido", 130), ("Espinaca", 30)], 2, 25, "general", "saludable"),
        ("Cerdo al horno con quinoa", [("Lomo de cerdo", 130), ("Quinoa cocida", 100), ("Brocoli", 50), ("Aceite de oliva", 5)], 2, 30, "high_protein", "proteico"),
        ("Ensalada de salmon con almendras", [("Salmon", 110), ("Lechuga", 40), ("Almendras", 10), ("Tomate", 30), ("Aceite de oliva", 5)], 1, 10, "high_protein", "proteico"),
        ("Pollo con pure de papa y espinaca", [("Pechuga de pollo", 130), ("Papa cocida", 100), ("Espinaca", 40), ("Aceite de oliva", 5)], 2, 25, "general", "casero"),
        ("Camarones al horno con espinaca", [("Camarones", 140), ("Espinaca", 60), ("Tomate", 30), ("Aceite de oliva", 5)], 2, 20, "high_protein", "proteico"),
        ("Salmon con verduras al vapor", [("Salmon", 130), ("Brocoli", 60), ("Zanahoria", 30), ("Espinaca", 20)], 2, 20, "high_protein", "proteico,saludable"),
        ("Pollo al horno con palta", [("Pechuga de pollo", 140), ("Palta (aguacate)", 40), ("Lechuga", 30), ("Tomate", 20)], 2, 25, "high_protein", "proteico"),
        ("Ensalada verde con atun y huevo", [("Atun en agua", 100), ("Huevo entero", 30), ("Lechuga", 50), ("Pepino", 30), ("Aceite de oliva", 5)], 1, 10, "high_protein", "proteico"),
        ("Sopa de tomate con pollo", [("Pechuga de pollo", 80), ("Tomate", 150), ("Cebolla", 20), ("Aceite de oliva", 5)], 2, 25, "general", "ligero"),
    ]

    # ===== SNACKS (100) =====
    snack_defs = [
        ("Batido de proteina con platano", [("Proteina whey", 30), ("Platano", 100), ("Leche descremada", 200)], 1, 5, "high_protein", "rapido,proteico"),
        ("Manzana con mantequilla de mani", [("Manzana", 150), ("Mantequilla de mani", 20)], 1, 2, "general", "rapido"),
        ("Yogurt griego con miel", [("Yogurt griego", 200), ("Miel", 15)], 1, 2, "high_protein", "rapido,proteico"),
        ("Mix de frutos secos", [("Almendras", 20), ("Nueces", 15), ("Mani", 15)], 1, 1, "general", "rapido,sin_coccion"),
        ("Platano con mani", [("Platano", 120), ("Mani", 20)], 1, 1, "general", "rapido,energetico"),
        ("Tostada de palta", [("Pan integral", 40), ("Palta (aguacate)", 50)], 1, 5, "general", "rapido"),
        ("Huevo duro con sal", [("Huevo entero", 120)], 1, 12, "high_protein", "proteico,simple"),
        ("Cottage cheese con frutillas", [("Queso cottage", 150), ("Frutillas", 80)], 1, 2, "high_protein", "rapido,proteico"),
        ("Batido de frutillas", [("Frutillas", 120), ("Yogurt griego", 100), ("Leche de almendras", 100)], 1, 5, "general", "rapido"),
        ("Almendras y arandanos", [("Almendras", 25), ("Arandanos", 40)], 1, 1, "general", "rapido,sin_coccion"),
        ("Yogurt con arandanos", [("Yogurt griego", 200), ("Arandanos", 80)], 1, 2, "high_protein", "rapido"),
        ("Smoothie verde simple", [("Espinaca", 40), ("Platano", 80), ("Leche de almendras", 150)], 1, 5, "general", "rapido,saludable"),
        ("Pan con queso cottage", [("Pan integral", 40), ("Queso cottage", 80)], 1, 3, "high_protein", "rapido"),
        ("Rollitos de jamon y queso", [("Queso", 20), ("Clara de huevo", 60)], 1, 2, "high_protein", "rapido,proteico,low_carb"),
        ("Platano con yogurt", [("Platano", 100), ("Yogurt griego", 100)], 1, 2, "general", "rapido"),
        ("Tostada con miel", [("Pan integral", 40), ("Miel", 15)], 1, 3, "general", "rapido,dulce"),
        ("Batido proteico simple", [("Proteina whey", 30), ("Leche descremada", 250)], 1, 3, "high_protein", "rapido,proteico"),
        ("Nueces y platano", [("Nueces", 20), ("Platano", 80)], 1, 1, "general", "rapido"),
        ("Queso con tomate", [("Queso", 25), ("Tomate", 80)], 1, 2, "general", "rapido,low_carb"),
        ("Frutillas con yogurt", [("Frutillas", 100), ("Yogurt griego", 100)], 1, 2, "general", "rapido"),
        ("Palta con limon", [("Palta (aguacate)", 80)], 1, 2, "general", "rapido,low_carb"),
        ("Huevo revuelto rapido", [("Huevo entero", 60), ("Aceite de oliva", 3)], 1, 5, "high_protein", "rapido"),
        ("Smoothie de platano y avena", [("Platano", 100), ("Avena", 20), ("Leche descremada", 150)], 1, 5, "general", "rapido"),
        ("Yogurt con granola", [("Yogurt griego", 150), ("Granola", 30)], 1, 2, "general", "rapido"),
        ("Almendras", [("Almendras", 30)], 1, 1, "general", "rapido,sin_coccion"),
        ("Manzana", [("Manzana", 200)], 1, 1, "general", "rapido,sin_coccion"),
        ("Platano", [("Platano", 120)], 1, 1, "general", "rapido,sin_coccion"),
        ("Pan con palta y tomate", [("Pan integral", 30), ("Palta (aguacate)", 30), ("Tomate", 30)], 1, 3, "general", "rapido"),
        ("Cottage cheese con platano", [("Queso cottage", 120), ("Platano", 60)], 1, 2, "high_protein", "rapido,proteico"),
        ("Tostada integral con mani", [("Pan integral", 30), ("Mantequilla de mani", 15)], 1, 3, "general", "rapido,energetico"),
        ("Smoothie de arandanos", [("Arandanos", 80), ("Yogurt griego", 80), ("Leche de almendras", 100)], 1, 5, "general", "rapido"),
        ("Kiwi con yogurt", [("Kiwi", 100), ("Yogurt griego", 100)], 1, 2, "general", "rapido"),
        ("Naranja entera", [("Naranja", 200)], 1, 1, "general", "rapido,sin_coccion"),
        ("Huevos duros (x2)", [("Huevo entero", 100)], 1, 12, "high_protein", "proteico"),
        ("Yogurt con semillas de chia", [("Yogurt griego", 150), ("Semillas de chia", 15)], 1, 2, "general", "rapido,saludable"),
        ("Pan con queso", [("Pan integral", 40), ("Queso", 20)], 1, 3, "general", "rapido"),
        ("Batido de kiwi y espinaca", [("Kiwi", 80), ("Espinaca", 30), ("Platano", 60), ("Leche de almendras", 150)], 1, 5, "general", "rapido,saludable"),
        ("Arandanos con almendras", [("Arandanos", 60), ("Almendras", 20)], 1, 1, "general", "rapido,sin_coccion"),
        ("Tostada con palta y huevo", [("Pan integral", 30), ("Palta (aguacate)", 30), ("Huevo entero", 30)], 1, 8, "general", "rapido"),
        ("Smoothie de naranja y platano", [("Naranja", 120), ("Platano", 80), ("Yogurt griego", 80)], 1, 5, "general", "rapido"),
        ("Mani con arandanos", [("Mani", 20), ("Arandanos", 40)], 1, 1, "general", "rapido,sin_coccion"),
        ("Yogurt griego natural", [("Yogurt griego", 200)], 1, 1, "high_protein", "rapido,proteico"),
        ("Cottage cheese natural", [("Queso cottage", 150)], 1, 1, "high_protein", "rapido,proteico"),
        ("Platano con miel", [("Platano", 100), ("Miel", 10)], 1, 1, "general", "rapido,dulce"),
        ("Smoothie proteico de chocolate", [("Proteina whey", 30), ("Platano", 80), ("Leche de almendras", 200), ("Mani", 10)], 1, 5, "high_protein", "rapido,proteico"),
        ("Manzana con almendras", [("Manzana", 130), ("Almendras", 20)], 1, 1, "general", "rapido"),
        ("Tomate cherry con queso", [("Tomate", 100), ("Queso", 20)], 1, 2, "general", "rapido,low_carb"),
        ("Pan con miel y platano", [("Pan integral", 30), ("Miel", 10), ("Platano", 50)], 1, 3, "general", "rapido,dulce"),
        ("Yogurt con platano y miel", [("Yogurt griego", 150), ("Platano", 60), ("Miel", 10)], 1, 2, "general", "rapido"),
        ("Huevo duro con palta", [("Huevo entero", 60), ("Palta (aguacate)", 40)], 1, 12, "high_protein", "proteico"),
        ("Smoothie de manzana y avena", [("Manzana", 120), ("Avena", 20), ("Leche descremada", 150)], 1, 5, "general", "rapido"),
        ("Nueces y queso", [("Nueces", 15), ("Queso", 15)], 1, 1, "general", "rapido,low_carb"),
        ("Frutillas con queso cottage", [("Frutillas", 100), ("Queso cottage", 80)], 1, 2, "high_protein", "rapido"),
        ("Batido de platano y mani", [("Platano", 100), ("Mantequilla de mani", 15), ("Leche descremada", 200)], 1, 5, "general", "rapido,energetico"),
        ("Pepino con hummus casero", [("Pepino", 100), ("Porotos negros cocidos", 50), ("Aceite de oliva", 5)], 1, 5, "vegetarian", "rapido,saludable"),
        ("Yogurt con frutillas y chia", [("Yogurt griego", 150), ("Frutillas", 60), ("Semillas de chia", 10)], 1, 2, "general", "rapido,saludable"),
        ("Camote cocido con canela", [("Camote cocido", 120)], 1, 15, "general", "saludable"),
        ("Pan integral con queso cottage", [("Pan integral", 30), ("Queso cottage", 60)], 1, 3, "high_protein", "rapido"),
        ("Smoothie verde con proteina", [("Espinaca", 40), ("Proteina whey", 20), ("Platano", 60), ("Leche de almendras", 150)], 1, 5, "high_protein", "rapido,proteico"),
        ("Kiwi", [("Kiwi", 150)], 1, 1, "general", "rapido,sin_coccion"),
        ("Manzana con queso", [("Manzana", 120), ("Queso", 15)], 1, 2, "general", "rapido"),
        ("Yogurt con nueces", [("Yogurt griego", 150), ("Nueces", 15)], 1, 2, "general", "rapido"),
        ("Pan con palta", [("Pan integral", 30), ("Palta (aguacate)", 50)], 1, 3, "general", "rapido"),
        ("Brocoli con hummus", [("Brocoli", 100), ("Porotos negros cocidos", 50), ("Aceite de oliva", 5)], 1, 5, "vegetarian", "rapido,saludable"),
        ("Smoothie de cottage y frutas", [("Queso cottage", 100), ("Frutillas", 60), ("Platano", 50), ("Leche descremada", 100)], 1, 5, "high_protein", "rapido,proteico"),
        ("Almendras con chocolate oscuro", [("Almendras", 25), ("Miel", 5)], 1, 1, "general", "rapido,dulce"),
        ("Yogurt con manzana", [("Yogurt griego", 150), ("Manzana", 80)], 1, 2, "general", "rapido"),
        ("Tostada con queso y tomate", [("Pan integral", 30), ("Queso", 15), ("Tomate", 40)], 1, 3, "general", "rapido"),
        ("Platano con yogurt griego", [("Platano", 100), ("Yogurt griego", 120)], 1, 2, "general", "rapido"),
        ("Mix energetico", [("Mani", 15), ("Almendras", 15), ("Arandanos", 20)], 1, 1, "general", "rapido,sin_coccion"),
        ("Smoothie de platano proteico", [("Platano", 80), ("Proteina whey", 25), ("Leche descremada", 200)], 1, 5, "high_protein", "rapido,proteico"),
        ("Naranja con almendras", [("Naranja", 150), ("Almendras", 15)], 1, 1, "general", "rapido"),
        ("Zanahoria con hummus", [("Zanahoria", 100), ("Porotos negros cocidos", 50), ("Aceite de oliva", 5)], 1, 3, "vegetarian", "rapido,saludable"),
        ("Yogurt con kiwi y granola", [("Yogurt griego", 120), ("Kiwi", 60), ("Granola", 20)], 1, 2, "general", "rapido"),
        ("Pan con huevo", [("Pan integral", 30), ("Huevo entero", 60)], 1, 8, "general", "rapido"),
        ("Batido de frutillas proteico", [("Frutillas", 100), ("Proteina whey", 25), ("Leche de almendras", 200)], 1, 5, "high_protein", "rapido,proteico"),
        ("Apio con mantequilla de mani", [("Pepino", 80), ("Mantequilla de mani", 15)], 1, 2, "general", "rapido"),
        ("Yogurt con naranja", [("Yogurt griego", 150), ("Naranja", 80)], 1, 2, "general", "rapido"),
        ("Granola con leche", [("Granola", 40), ("Leche descremada", 150)], 1, 2, "general", "rapido"),
        ("Ensalada de frutas", [("Manzana", 60), ("Platano", 50), ("Frutillas", 50), ("Kiwi", 40)], 1, 5, "general", "rapido,saludable"),
        ("Queso cottage con nueces", [("Queso cottage", 120), ("Nueces", 15)], 1, 2, "high_protein", "rapido,proteico"),
        ("Smoothie tropical", [("Platano", 80), ("Naranja", 80), ("Yogurt griego", 80)], 1, 5, "general", "rapido"),
        ("Huevo con palta y tomate", [("Huevo entero", 60), ("Palta (aguacate)", 30), ("Tomate", 40)], 1, 8, "general", "rapido"),
        ("Manzana con yogurt", [("Manzana", 120), ("Yogurt griego", 80)], 1, 2, "general", "rapido"),
        ("Pan con queso cottage y miel", [("Pan integral", 30), ("Queso cottage", 60), ("Miel", 10)], 1, 3, "general", "rapido"),
        ("Batido verde energetico", [("Espinaca", 30), ("Platano", 80), ("Manzana", 60), ("Leche de almendras", 150)], 1, 5, "general", "rapido,saludable"),
        ("Almendras con platano", [("Almendras", 20), ("Platano", 80)], 1, 1, "general", "rapido"),
        ("Tofu a la plancha snack", [("Tofu firme", 80)], 1, 10, "vegetarian", "vegano,proteico"),
        ("Yogurt con semillas mixtas", [("Yogurt griego", 150), ("Semillas de chia", 8), ("Almendras", 10)], 1, 2, "general", "rapido,saludable"),
        ("Naranja con nueces", [("Naranja", 120), ("Nueces", 15)], 1, 1, "general", "rapido"),
        ("Smoothie de mani y platano", [("Platano", 100), ("Mantequilla de mani", 15), ("Leche de almendras", 200)], 1, 5, "general", "rapido,energetico"),
        ("Pan con huevo y palta", [("Pan integral", 30), ("Huevo entero", 30), ("Palta (aguacate)", 25)], 1, 8, "general", "rapido"),
        ("Frutillas naturales", [("Frutillas", 200)], 1, 1, "general", "rapido,sin_coccion"),
        ("Queso cottage con miel", [("Queso cottage", 120), ("Miel", 10)], 1, 2, "high_protein", "rapido,proteico"),
        ("Yogurt griego con almendras", [("Yogurt griego", 150), ("Almendras", 20)], 1, 2, "high_protein", "rapido,proteico"),
        # Additional snacks to reach 100+
        ("Pepino con queso cottage", [("Pepino", 80), ("Queso cottage", 80)], 1, 2, "high_protein", "rapido"),
        ("Manzana con queso cottage", [("Manzana", 120), ("Queso cottage", 60)], 1, 2, "general", "rapido"),
        ("Batido de arandanos y yogurt", [("Arandanos", 80), ("Yogurt griego", 100), ("Leche descremada", 100)], 1, 5, "general", "rapido"),
        ("Platano con almendras", [("Platano", 80), ("Almendras", 15)], 1, 1, "general", "rapido"),
        ("Smoothie de manzana y yogurt", [("Manzana", 100), ("Yogurt griego", 100), ("Miel", 5)], 1, 5, "general", "rapido"),
    ]

    # Process all meal definitions
    all_defs = [
        (breakfast_defs, "breakfast"),
        (lunch_defs, "lunch"),
        (dinner_defs, "dinner"),
        (snack_defs, "snack"),
    ]

    for defs, meal_type in all_defs:
        for name, raw_ingredients, difficulty, prep_time, category, tags in defs:
            ingredients = [_calc_ingredient(ALL_FOODS, food, grams) for food, grams in raw_ingredients]
            totals = _sum_ingredients(ingredients)

            meals.append({
                "name": name,
                "meal_type": meal_type,
                "calories": int(round(totals["calories"])),
                "protein_g": round(totals["protein_g"], 1),
                "carbs_g": round(totals["carbs_g"], 1),
                "fat_g": round(totals["fat_g"], 1),
                "fiber_g": 0,
                "difficulty": difficulty,
                "prep_time_min": prep_time,
                "category": category,
                "tags": tags,
                "ingredients": ingredients,
            })

    return meals


# ---------------------------------------------------------------------------
# Async seed
# ---------------------------------------------------------------------------

async def seed():
    meals_data = _build_meals()
    print(f"Generated {len(meals_data)} meals")
    print(f"  Breakfasts: {sum(1 for m in meals_data if m['meal_type'] == 'breakfast')}")
    print(f"  Lunches:    {sum(1 for m in meals_data if m['meal_type'] == 'lunch')}")
    print(f"  Dinners:    {sum(1 for m in meals_data if m['meal_type'] == 'dinner')}")
    print(f"  Snacks:     {sum(1 for m in meals_data if m['meal_type'] == 'snack')}")

    from sqlalchemy import func, text
    from sqlmodel import select

    async with AsyncSessionLocal() as session:
        # Check existing count
        result = await session.exec(select(func.count(MealTemplate.id)))
        existing = result.first() or 0
        if existing > 0:
            print(f"\nAlready {existing} meals in DB. Clearing...")
            await session.exec(text("DELETE FROM meal_ingredient"))
            await session.exec(text("DELETE FROM meal_template"))
            await session.commit()
            print("  Cleared.")

        # Insert in batches of 50 meals to reduce round trips
        BATCH_SIZE = 50
        inserted = 0
        for batch_start in range(0, len(meals_data), BATCH_SIZE):
            batch = meals_data[batch_start:batch_start + BATCH_SIZE]
            # Add all meals in this batch
            meal_objects = []
            for meal_data in batch:
                meal = MealTemplate(
                    name=meal_data["name"],
                    meal_type=meal_data["meal_type"],
                    calories=meal_data["calories"],
                    protein_g=meal_data["protein_g"],
                    carbs_g=meal_data["carbs_g"],
                    fat_g=meal_data["fat_g"],
                    fiber_g=meal_data["fiber_g"],
                    difficulty=meal_data["difficulty"],
                    prep_time_min=meal_data["prep_time_min"],
                    category=meal_data["category"],
                    tags=meal_data["tags"],
                    is_active=True,
                )
                session.add(meal)
                meal_objects.append((meal, meal_data))

            # Single flush to get all IDs
            await session.flush()

            # Now add all ingredients
            for meal, meal_data in meal_objects:
                for ing_data in meal_data["ingredients"]:
                    ingredient = MealIngredient(
                        meal_id=meal.id,
                        food_name=ing_data["food_name"],
                        quantity_grams=ing_data["quantity_grams"],
                        calories=ing_data["calories"],
                        protein_g=ing_data["protein_g"],
                        carbs_g=ing_data["carbs_g"],
                        fat_g=ing_data["fat_g"],
                    )
                    session.add(ingredient)

            await session.flush()
            inserted += len(batch)
            print(f"  Inserted {inserted}/{len(meals_data)} meals...")

        await session.commit()

    print(f"\nDone! Inserted {inserted} meals with ingredients.")

    # Verify
    async with AsyncSessionLocal() as session:
        result = await session.exec(select(func.count(MealTemplate.id)))
        count = result.first()
        result2 = await session.exec(select(func.count(MealIngredient.id)))
        ing_count = result2.first()
        print(f"Verification: {count} meals, {ing_count} ingredients in DB")


if __name__ == "__main__":
    asyncio.run(seed())
