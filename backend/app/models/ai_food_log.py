from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy import Index
from typing import Optional, TYPE_CHECKING
from datetime import datetime

if TYPE_CHECKING:
    from .user import User


class AIFoodLog(SQLModel, table=True):
    __tablename__ = "ai_food_log"
    __table_args__ = (
        # Used by dashboard + history: filter by user & date range
        Index("ix_ai_food_log_user_logged_at", "user_id", "logged_at"),
        # Used by streak calculation and meal-type grouping
        Index("ix_ai_food_log_user_meal_type", "user_id", "meal_type"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)

    logged_at: datetime = Field(default_factory=datetime.utcnow)
    meal_type: str = Field()  # breakfast / lunch / dinner / snack

    # Image
    image_url: Optional[str] = Field(default=None)
    image_hash: Optional[str] = Field(default=None, index=True)

    # Food info
    food_name: str = Field()
    calories: float = Field()
    carbs_g: float = Field()
    protein_g: float = Field()
    fats_g: float = Field()
    fiber_g: Optional[float] = Field(default=None)
    sugar_g: Optional[float] = Field(default=None)
    sodium_mg: Optional[float] = Field(default=None)
    serving_size: Optional[str] = Field(default=None)

    # AI metadata
    ai_provider: Optional[str] = Field(default=None)
    ai_confidence: Optional[float] = Field(default=None)
    ai_raw_response: Optional[str] = Field(default=None)  # JSON string

    was_edited: bool = Field(default=False)
    notes: Optional[str] = Field(default=None)

    created_at: datetime = Field(default_factory=datetime.utcnow)

    user: "User" = Relationship(back_populates="ai_food_logs")
