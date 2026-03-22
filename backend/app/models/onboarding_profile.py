from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, TYPE_CHECKING
from datetime import date, datetime

if TYPE_CHECKING:
    from .user import User


class OnboardingProfile(SQLModel, table=True):
    __tablename__ = "onboarding_profile"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", unique=True, index=True)

    # Step 3 - Gender
    gender: Optional[str] = Field(default=None)

    # Step 4 - Workouts per week
    workouts_per_week: Optional[int] = Field(default=None)

    # Step 5 - Heard from
    heard_from: Optional[str] = Field(default=None)

    # Step 6 - Used other apps
    used_other_apps: Optional[bool] = Field(default=None)

    # Step 8 - Height & Weight
    height_cm: Optional[float] = Field(default=None)
    weight_kg: Optional[float] = Field(default=None)
    unit_system: str = Field(default="metric")

    # Step 9 - Birthday
    birth_date: Optional[date] = Field(default=None)

    # Step 10 - Goal
    goal: Optional[str] = Field(default=None)

    # Step 11 - Target weight
    target_weight_kg: Optional[float] = Field(default=None)

    # Step 13 - Weekly speed
    weekly_speed_kg: float = Field(default=0.8)

    # Step 15 - Pain points (JSON string: '["lack_of_time", "cravings"]')
    pain_points: Optional[str] = Field(default=None)

    # Step 16 - Diet type
    diet_type: Optional[str] = Field(default=None)

    # Step 17 - Accomplishments (JSON string)
    accomplishments: Optional[str] = Field(default=None)

    # Step 20 - Health connect
    health_connected: bool = Field(default=False)

    # Step 23 - Notifications
    notifications_enabled: bool = Field(default=False)

    # Step 24 - Referral code
    referral_code: Optional[str] = Field(default=None)

    # User timezone (IANA, e.g. "America/Santiago")
    timezone: Optional[str] = Field(default=None)

    # Calculated nutrition plan (Step 26-27)
    daily_calories: Optional[int] = Field(default=None)
    daily_carbs_g: Optional[int] = Field(default=None)
    daily_protein_g: Optional[int] = Field(default=None)
    daily_fats_g: Optional[int] = Field(default=None)
    health_score: Optional[float] = Field(default=None)

    completed_at: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    user: "User" = Relationship(back_populates="onboarding_profile")
