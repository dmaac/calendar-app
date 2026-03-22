"""Food recommendation models — meals, ingredients, recommendations."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class MealTemplate(SQLModel, table=True):
    __tablename__ = "meal_template"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    description: Optional[str] = Field(default=None)
    meal_type: str = Field(index=True)  # breakfast, lunch, dinner, snack
    calories: int = Field()
    protein_g: float = Field()
    carbs_g: float = Field()
    fat_g: float = Field()
    fiber_g: float = Field(default=0)
    difficulty: int = Field(default=1)  # 1=easy, 2=medium, 3=hard
    prep_time_min: int = Field(default=15)
    category: str = Field(default="general")  # general, high_protein, low_carb, vegetarian, vegan, keto, quick
    is_active: bool = Field(default=True)
    tags: Optional[str] = Field(default=None)  # comma-separated: "chileno,rapido,economico"
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)


class MealIngredient(SQLModel, table=True):
    __tablename__ = "meal_ingredient"

    id: Optional[int] = Field(default=None, primary_key=True)
    meal_id: int = Field(foreign_key="meal_template.id", index=True)
    food_name: str = Field()
    quantity_grams: float = Field()
    calories: float = Field(default=0)
    protein_g: float = Field(default=0)
    carbs_g: float = Field(default=0)
    fat_g: float = Field(default=0)


class UserMealRecommendation(SQLModel, table=True):
    __tablename__ = "user_meal_recommendation"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    meal_id: int = Field(foreign_key="meal_template.id")
    reason: str = Field()
    score: float = Field()
    meal_type_context: str = Field()  # what meal type was recommended for
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
