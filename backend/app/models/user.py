from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, List, TYPE_CHECKING
from datetime import datetime

if TYPE_CHECKING:
    from .activity import Activity
    from .meal_log import MealLog
    from .daily_nutrition_summary import DailyNutritionSummary
    from .nutrition_profile import UserNutritionProfile
    from .user_food_favorite import UserFoodFavorite
    from .onboarding_profile import OnboardingProfile
    from .ai_food_log import AIFoodLog
    from .subscription import Subscription
    from .push_token import PushToken


class UserBase(SQLModel):
    email: str = Field(unique=True, index=True)
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    is_active: bool = True


class User(UserBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    hashed_password: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    # OAuth fields
    provider: str = Field(default="email")
    provider_id: Optional[str] = Field(default=None, index=True)

    # Premium flag
    is_premium: bool = Field(default=False)

    # Admin flag — grants access to /api/admin/* endpoints
    is_admin: bool = Field(default=False)

    activities: List["Activity"] = Relationship(back_populates="user")
    meal_logs: List["MealLog"] = Relationship(back_populates="user")
    daily_nutrition_summaries: List["DailyNutritionSummary"] = Relationship(back_populates="user")
    nutrition_profile: Optional["UserNutritionProfile"] = Relationship(back_populates="user")
    food_favorites: List["UserFoodFavorite"] = Relationship(back_populates="user")
    onboarding_profile: Optional["OnboardingProfile"] = Relationship(back_populates="user")
    ai_food_logs: List["AIFoodLog"] = Relationship(back_populates="user")
    subscriptions: List["Subscription"] = Relationship(back_populates="user")
    push_tokens: List["PushToken"] = Relationship(back_populates="user")


class UserCreate(UserBase):
    password: str


class UserRead(UserBase):
    id: int
    provider: str = "email"
    is_premium: bool = False
    is_admin: bool = False
    created_at: datetime
    updated_at: datetime


class UserUpdate(SQLModel):
    email: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    is_active: Optional[bool] = None
