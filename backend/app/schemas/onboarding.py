from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import date, datetime


class OnboardingStepSave(BaseModel):
    """Schema for saving onboarding data step by step — all fields optional."""

    gender: Optional[str] = None
    workouts_per_week: Optional[int] = None
    heard_from: Optional[str] = None
    used_other_apps: Optional[bool] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    unit_system: Optional[str] = None
    birth_date: Optional[date] = None
    goal: Optional[str] = None
    target_weight_kg: Optional[float] = None
    weekly_speed_kg: Optional[float] = None
    pain_points: Optional[str] = None          # JSON string
    diet_type: Optional[str] = None
    accomplishments: Optional[str] = None      # JSON string
    health_connected: Optional[bool] = None
    notifications_enabled: Optional[bool] = None
    referral_code: Optional[str] = None


class OnboardingComplete(BaseModel):
    """Schema for completing onboarding — validates required fields."""

    gender: str
    workouts_per_week: int
    height_cm: float
    weight_kg: float
    unit_system: str = "metric"
    birth_date: date
    goal: str
    target_weight_kg: float
    weekly_speed_kg: float = 0.8
    pain_points: Optional[str] = None
    diet_type: str
    accomplishments: Optional[str] = None
    health_connected: bool = False
    notifications_enabled: bool = False
    heard_from: Optional[str] = None
    used_other_apps: Optional[bool] = None
    referral_code: Optional[str] = None

    @field_validator("height_cm", "weight_kg", "target_weight_kg")
    @classmethod
    def must_be_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("must be greater than 0")
        return v

    @field_validator("workouts_per_week")
    @classmethod
    def workouts_range(cls, v: int) -> int:
        if v < 0 or v > 14:
            raise ValueError("must be between 0 and 14")
        return v


class OnboardingProfileRead(BaseModel):
    """Schema returned when reading an onboarding profile."""

    id: int
    user_id: int
    gender: Optional[str] = None
    workouts_per_week: Optional[int] = None
    heard_from: Optional[str] = None
    used_other_apps: Optional[bool] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    unit_system: str
    birth_date: Optional[date] = None
    goal: Optional[str] = None
    target_weight_kg: Optional[float] = None
    weekly_speed_kg: float
    pain_points: Optional[str] = None
    diet_type: Optional[str] = None
    accomplishments: Optional[str] = None
    health_connected: bool
    notifications_enabled: bool
    referral_code: Optional[str] = None
    daily_calories: Optional[int] = None
    daily_carbs_g: Optional[int] = None
    daily_protein_g: Optional[int] = None
    daily_fats_g: Optional[int] = None
    health_score: Optional[float] = None
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class NutritionPlan(BaseModel):
    """Calculated nutrition plan returned after completing onboarding."""

    daily_calories: int
    carbs_g: int
    protein_g: int
    fats_g: int
    health_score: float
    target_date: Optional[date] = None  # estimated date to reach target weight
