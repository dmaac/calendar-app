from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy import Column, ForeignKey, Index, Integer, UniqueConstraint
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
    __table_args__ = (
        # Water lookup: one record per user per day — enforced unique + fast lookup
        UniqueConstraint("user_id", "date", name="uq_daily_summary_user_date"),
        Index("ix_daily_summary_user_date", "user_id", "date"),
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

    user: "User" = Relationship(back_populates="daily_nutrition_summaries")

    def __repr__(self) -> str:
        return (
            f"<DailyNutritionSummary id={self.id} user={self.user_id} "
            f"date={self.date} cal={self.total_calories}/{self.target_calories}>"
        )


class DailyNutritionSummaryRead(DailyNutritionSummaryBase):
    id: int
    user_id: int


class DailyNutritionSummaryUpdate(SQLModel):
    water_ml: Optional[float] = Field(default=None, ge=0)
    target_calories: Optional[float] = Field(default=None, ge=0)
