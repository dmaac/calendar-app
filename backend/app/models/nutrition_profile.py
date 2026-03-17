from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, TYPE_CHECKING
from datetime import datetime
from enum import Enum

if TYPE_CHECKING:
    from .user import User


class Gender(str, Enum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"


class ActivityLevel(str, Enum):
    SEDENTARY = "sedentary"
    LIGHTLY_ACTIVE = "lightly_active"
    MODERATELY_ACTIVE = "moderately_active"
    VERY_ACTIVE = "very_active"
    EXTRA_ACTIVE = "extra_active"


class NutritionGoal(str, Enum):
    LOSE_WEIGHT = "lose_weight"
    MAINTAIN = "maintain"
    GAIN_MUSCLE = "gain_muscle"


class UserNutritionProfileBase(SQLModel):
    height_cm: Optional[float] = Field(default=None, gt=0)
    weight_kg: Optional[float] = Field(default=None, gt=0)
    age: Optional[int] = Field(default=None, gt=0, le=150)
    gender: Optional[Gender] = None
    activity_level: ActivityLevel = ActivityLevel.MODERATELY_ACTIVE
    goal: NutritionGoal = NutritionGoal.MAINTAIN
    target_calories: float = Field(default=2000.0, ge=0)
    target_protein_g: float = Field(default=150.0, ge=0)
    target_carbs_g: float = Field(default=250.0, ge=0)
    target_fat_g: float = Field(default=65.0, ge=0)


class UserNutritionProfile(UserNutritionProfileBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", unique=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    user: "User" = Relationship(back_populates="nutrition_profile")


class UserNutritionProfileCreate(SQLModel):
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    age: Optional[int] = None
    gender: Optional[Gender] = None
    activity_level: ActivityLevel = ActivityLevel.MODERATELY_ACTIVE
    goal: NutritionGoal = NutritionGoal.MAINTAIN


class UserNutritionProfileRead(UserNutritionProfileBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime


class UserNutritionProfileUpdate(SQLModel):
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    age: Optional[int] = None
    gender: Optional[Gender] = None
    activity_level: Optional[ActivityLevel] = None
    goal: Optional[NutritionGoal] = None
    target_calories: Optional[float] = None
    target_protein_g: Optional[float] = None
    target_carbs_g: Optional[float] = None
    target_fat_g: Optional[float] = None
