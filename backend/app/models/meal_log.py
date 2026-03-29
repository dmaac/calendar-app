from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy import Column, ForeignKey, Index, Integer
from typing import Optional, TYPE_CHECKING
from datetime import datetime, date, timezone
from enum import Enum

if TYPE_CHECKING:
    from .user import User
    from .food import Food


class MealType(str, Enum):
    BREAKFAST = "breakfast"
    LUNCH = "lunch"
    DINNER = "dinner"
    SNACK = "snack"


class MealLogBase(SQLModel):
    date: date
    meal_type: MealType
    food_id: int = Field(sa_column=Column(
        Integer,
        ForeignKey("food.id", ondelete="CASCADE"),
        nullable=False,
    ))
    servings: float = 1.0
    total_calories: float = 0.0
    total_protein: float = 0.0
    total_carbs: float = 0.0
    total_fat: float = 0.0
    total_fiber: float = 0.0
    total_sugar: float = 0.0


class MealLog(MealLogBase, table=True):
    __table_args__ = (
        # Composite index for the most common query: meals by user + date
        Index("ix_meallog_user_date", "user_id", "date"),
        # Meal-type filtering within a user's logs
        Index("ix_meallog_user_meal_type", "user_id", "meal_type"),
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
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())

    user: "User" = Relationship(back_populates="meal_logs")
    food: "Food" = Relationship()

    def __repr__(self) -> str:
        return f"<MealLog id={self.id} user={self.user_id} date={self.date} type={self.meal_type}>"


class MealLogCreate(SQLModel):
    date: date
    meal_type: MealType
    food_id: int = Field(gt=0, description="Food catalog ID")
    servings: float = Field(default=1.0, gt=0, le=100, description="Number of servings (0-100)")


class MealLogRead(MealLogBase):
    id: int
    user_id: int
    created_at: datetime
    food_name: Optional[str] = None
    food_brand: Optional[str] = None


class MealLogUpdate(SQLModel):
    meal_type: Optional[MealType] = None
    food_id: Optional[int] = Field(default=None, gt=0, description="Food catalog ID")
    servings: Optional[float] = Field(default=None, gt=0, le=100, description="Number of servings (0-100)")
