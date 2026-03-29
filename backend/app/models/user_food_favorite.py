from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy import Column, ForeignKey, Index, Integer, UniqueConstraint
from typing import Optional, TYPE_CHECKING
from datetime import datetime, timezone

if TYPE_CHECKING:
    from .user import User
    from .food import Food


class UserFoodFavorite(SQLModel, table=True):
    __table_args__ = (
        # A user can only favorite a given food once
        UniqueConstraint("user_id", "food_id", name="uq_user_food_favorite"),
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
    food_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("food.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
    )
    times_logged: int = Field(default=0)
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())

    user: "User" = Relationship(back_populates="food_favorites")
    food: "Food" = Relationship()

    def __repr__(self) -> str:
        return f"<UserFoodFavorite id={self.id} user={self.user_id} food={self.food_id} logged={self.times_logged}>"


class UserFoodFavoriteRead(SQLModel):
    id: int
    user_id: int
    food_id: int
    times_logged: int = 0
    created_at: datetime
    food_name: Optional[str] = None
    food_brand: Optional[str] = None
    calories: Optional[float] = None
    protein_g: Optional[float] = None
    carbs_g: Optional[float] = None
    fat_g: Optional[float] = None


class FavoriteCreate(SQLModel):
    """Create a favorite by food_id OR by name + macros (for AI-scanned foods).

    When the user favorites an AI-scanned food that does not yet exist in the
    food catalog, the frontend sends name + macros instead of food_id.
    The backend will auto-create a food catalog entry and link the favorite.
    """
    food_id: Optional[int] = Field(default=None, gt=0, description="Existing food catalog ID")
    # Inline food data -- used when food_id is not available (AI-scanned foods)
    food_name: Optional[str] = Field(default=None, min_length=1, max_length=500, description="Food name, max 500 chars")
    calories: Optional[float] = Field(default=None, ge=0, le=10000, description="Calories (kcal), 0-10000")
    protein_g: Optional[float] = Field(default=None, ge=0, le=2000, description="Protein (g), 0-2000")
    carbs_g: Optional[float] = Field(default=None, ge=0, le=2000, description="Carbohydrates (g), 0-2000")
    fat_g: Optional[float] = Field(default=None, ge=0, le=2000, description="Fat (g), 0-2000")
