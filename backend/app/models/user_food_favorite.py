from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, TYPE_CHECKING
from datetime import datetime

if TYPE_CHECKING:
    from .user import User
    from .food import Food


class UserFoodFavorite(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    food_id: int = Field(foreign_key="food.id", index=True)
    times_logged: int = Field(default=0)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    user: "User" = Relationship(back_populates="food_favorites")
    food: "Food" = Relationship()


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
    food_id: int = Field(gt=0)
