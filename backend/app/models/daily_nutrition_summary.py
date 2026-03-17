from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, TYPE_CHECKING
from datetime import datetime, date

if TYPE_CHECKING:
    from .user import User


class DailyNutritionSummaryBase(SQLModel):
    date: date
    total_calories: float = 0.0
    total_protein: float = 0.0
    total_carbs: float = 0.0
    total_fat: float = 0.0
    target_calories: float = 2000.0
    water_ml: float = 0.0


class DailyNutritionSummary(DailyNutritionSummaryBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")

    user: "User" = Relationship(back_populates="daily_nutrition_summaries")


class DailyNutritionSummaryRead(DailyNutritionSummaryBase):
    id: int
    user_id: int


class DailyNutritionSummaryUpdate(SQLModel):
    water_ml: Optional[float] = Field(default=None, ge=0)
    target_calories: Optional[float] = Field(default=None, ge=0)
