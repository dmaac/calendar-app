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
    created_at: datetime = Field(default_factory=datetime.utcnow)

    user: "User" = Relationship(back_populates="food_favorites")
    food: "Food" = Relationship()


class UserFoodFavoriteRead(SQLModel):
    id: int
    user_id: int
    food_id: int
    created_at: datetime
    food_name: Optional[str] = None
    food_brand: Optional[str] = None
