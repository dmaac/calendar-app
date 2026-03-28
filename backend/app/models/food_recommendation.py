"""Food recommendation models — meals, ingredients, recommendations."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Column, ForeignKey, Index, Integer
from sqlmodel import Field, SQLModel


class MealTemplate(SQLModel, table=True):
    __tablename__ = "meal_template"
    __table_args__ = (
        # Filter meals by type + active + category
        Index("ix_meal_template_type_active", "meal_type", "is_active"),
        # Calorie-range queries for recommendation engine
        Index("ix_meal_template_calories", "calories"),
    )

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
    category: str = Field(default="general", index=True)
    is_active: bool = Field(default=True)
    tags: Optional[str] = Field(default=None)  # comma-separated: "chileno,rapido,economico"
    created_at: Optional[datetime] = Field(default_factory=lambda: datetime.now(timezone.utc))

    def __repr__(self) -> str:
        return f"<MealTemplate id={self.id} name={self.name!r} type={self.meal_type} cal={self.calories}>"


class MealIngredient(SQLModel, table=True):
    __tablename__ = "meal_ingredient"

    id: Optional[int] = Field(default=None, primary_key=True)
    meal_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("meal_template.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
    )
    food_name: str = Field()
    quantity_grams: float = Field()
    calories: float = Field(default=0)
    protein_g: float = Field(default=0)
    carbs_g: float = Field(default=0)
    fat_g: float = Field(default=0)

    def __repr__(self) -> str:
        return f"<MealIngredient id={self.id} meal={self.meal_id} food={self.food_name!r}>"


class UserMealRecommendation(SQLModel, table=True):
    __tablename__ = "user_meal_recommendation"
    __table_args__ = (
        # Timeline of recommendations for a user
        Index("ix_user_meal_rec_user_created", "user_id", "created_at"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
    )
    meal_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("meal_template.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )
    reason: str = Field()
    score: float = Field()
    meal_type_context: str = Field()  # what meal type was recommended for
    created_at: Optional[datetime] = Field(default_factory=lambda: datetime.now(timezone.utc))

    def __repr__(self) -> str:
        return (
            f"<UserMealRecommendation id={self.id} user={self.user_id} "
            f"meal={self.meal_id} score={self.score:.2f}>"
        )
