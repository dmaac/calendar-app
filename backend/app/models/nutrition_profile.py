from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy import Column, ForeignKey, Integer
from typing import Optional, TYPE_CHECKING
from datetime import datetime, timezone
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
    height_cm: Optional[float] = Field(default=None, ge=50, le=300, description="Height in cm (50-300)")
    weight_kg: Optional[float] = Field(default=None, ge=20, le=500, description="Weight in kg (20-500)")
    age: Optional[int] = Field(default=None, gt=0, le=150, description="Age in years (1-150)")
    gender: Optional[Gender] = None
    activity_level: ActivityLevel = ActivityLevel.MODERATELY_ACTIVE
    goal: NutritionGoal = NutritionGoal.MAINTAIN
    target_calories: float = Field(default=2000.0, ge=0, le=10000, description="Daily calorie target (0-10000)")
    target_protein_g: float = Field(default=150.0, ge=0, le=2000, description="Daily protein target in g (0-2000)")
    target_carbs_g: float = Field(default=250.0, ge=0, le=2000, description="Daily carbs target in g (0-2000)")
    target_fat_g: float = Field(default=65.0, ge=0, le=2000, description="Daily fat target in g (0-2000)")


class UserNutritionProfile(UserNutritionProfileBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
            index=True,
        ),
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    user: "User" = Relationship(back_populates="nutrition_profile")

    def __repr__(self) -> str:
        return (
            f"<UserNutritionProfile id={self.id} user={self.user_id} "
            f"goal={self.goal} cal={self.target_calories}>"
        )


class UserNutritionProfileCreate(SQLModel):
    height_cm: Optional[float] = Field(default=None, ge=50, le=300, description="Height in cm (50-300)")
    weight_kg: Optional[float] = Field(default=None, ge=20, le=500, description="Weight in kg (20-500)")
    age: Optional[int] = Field(default=None, gt=0, le=150, description="Age in years (1-150)")
    gender: Optional[Gender] = None
    activity_level: ActivityLevel = ActivityLevel.MODERATELY_ACTIVE
    goal: NutritionGoal = NutritionGoal.MAINTAIN


class UserNutritionProfileRead(UserNutritionProfileBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime


class UserNutritionProfileUpdate(SQLModel):
    height_cm: Optional[float] = Field(default=None, ge=50, le=300, description="Height in cm (50-300)")
    weight_kg: Optional[float] = Field(default=None, ge=20, le=500, description="Weight in kg (20-500)")
    age: Optional[int] = Field(default=None, gt=0, le=150, description="Age in years (1-150)")
    gender: Optional[Gender] = None
    activity_level: Optional[ActivityLevel] = None
    goal: Optional[NutritionGoal] = None
    target_calories: Optional[float] = Field(default=None, ge=0, le=10000, description="Daily calorie target (0-10000)")
    target_protein_g: Optional[float] = Field(default=None, ge=0, le=2000, description="Daily protein target in g (0-2000)")
    target_carbs_g: Optional[float] = Field(default=None, ge=0, le=2000, description="Daily carbs target in g (0-2000)")
    target_fat_g: Optional[float] = Field(default=None, ge=0, le=2000, description="Daily fat target in g (0-2000)")
