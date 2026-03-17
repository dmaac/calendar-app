from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, List, TYPE_CHECKING
from datetime import datetime

if TYPE_CHECKING:
    from .activity import Activity
    from .meal_log import MealLog
    from .daily_nutrition_summary import DailyNutritionSummary
    from .nutrition_profile import UserNutritionProfile
    from .user_food_favorite import UserFoodFavorite


class UserBase(SQLModel):
    email: str = Field(unique=True, index=True)
    first_name: str
    last_name: str
    is_active: bool = True


class User(UserBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    hashed_password: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    activities: List["Activity"] = Relationship(back_populates="user")
    meal_logs: List["MealLog"] = Relationship(back_populates="user")
    daily_nutrition_summaries: List["DailyNutritionSummary"] = Relationship(back_populates="user")
    nutrition_profile: Optional["UserNutritionProfile"] = Relationship(back_populates="user")
    food_favorites: List["UserFoodFavorite"] = Relationship(back_populates="user")


class UserCreate(UserBase):
    password: str


class UserRead(UserBase):
    id: int
    created_at: datetime
    updated_at: datetime


class UserUpdate(SQLModel):
    email: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    is_active: Optional[bool] = None