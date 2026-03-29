"""
CalorieAdjustment + WeightLog models for the Adaptive Calorie Target system.

The adaptive calorie system compares predicted weight (based on calorie intake vs TDEE)
against actual weight recorded by the user. When the two diverge significantly, the
system recommends a calorie target adjustment.

Scientific basis: Helms et al., 2014 — rate-of-loss guidelines to retain lean mass
during energy restriction; 1 lb fat ~ 3500 kcal deficit/surplus.
"""
from __future__ import annotations

from datetime import date as date_type, datetime, timezone
from enum import Enum
from typing import Optional

from sqlalchemy import Column, Date, ForeignKey, Index, Integer, UniqueConstraint
from sqlmodel import SQLModel, Field

# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class AdjustmentReason(str, Enum):
    LOSING_TOO_FAST = "losing_too_fast"
    NOT_LOSING = "not_losing"
    GAINING_TOO_FAST = "gaining_too_fast"
    NOT_GAINING = "not_gaining"
    ON_TRACK = "on_track"
    INSUFFICIENT_DATA = "insufficient_data"


class WeightTrend(str, Enum):
    LOSING_TOO_FAST = "losing_too_fast"
    LOSING_ON_TRACK = "losing_on_track"
    STABLE = "stable"
    GAINING_ON_TRACK = "gaining_on_track"
    GAINING_TOO_FAST = "gaining_too_fast"
    INSUFFICIENT_DATA = "insufficient_data"


# ---------------------------------------------------------------------------
# WeightLog — daily weight entries recorded by the user
# ---------------------------------------------------------------------------

class WeightLog(SQLModel, table=True):
    """One weight measurement per user per day."""
    __tablename__ = "weight_log"
    __table_args__ = (
        UniqueConstraint("user_id", "date", name="uq_weight_log_user_date"),
        Index("ix_weight_log_user_date", "user_id", "date"),
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
    date: date_type = Field(sa_column=Column(Date, nullable=False))
    weight_kg: float = Field(ge=20.0, le=500.0)
    source: str = Field(default="manual")  # manual | healthkit | scale_api (validated by WeightSource enum in Create schema)
    notes: Optional[str] = Field(default=None, max_length=500)
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())

    def __repr__(self) -> str:
        return f"<WeightLog id={self.id} user={self.user_id} date={self.date} kg={self.weight_kg}>"


# ---------------------------------------------------------------------------
# CalorieAdjustment — weekly metabolic adjustment records
# ---------------------------------------------------------------------------

class CalorieAdjustment(SQLModel, table=True):
    """
    Tracks each weekly calorie target adjustment recommendation.
    One record per user per week_start.
    """
    __tablename__ = "calorie_adjustment"
    __table_args__ = (
        UniqueConstraint("user_id", "week_start", name="uq_calorie_adj_user_week"),
        Index("ix_calorie_adj_user_week", "user_id", "week_start"),
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
    week_start: date_type = Field(sa_column=Column(Date, nullable=False))
    week_end: date_type = Field(sa_column=Column(Date, nullable=False))

    # Weight analysis
    predicted_weight: float  # kg — predicted from calorie intake vs TDEE
    actual_weight: Optional[float] = Field(default=None)  # kg — real weight recorded
    weight_delta: Optional[float] = Field(default=None)  # actual - predicted (kg)

    # Calorie targets
    previous_target: int  # kcal — calorie target before adjustment
    new_target: int  # kcal — recommended adjusted target
    adjustment_kcal: int = Field(default=0)  # new_target - previous_target

    # Classification
    adjustment_reason: str = Field(default=AdjustmentReason.ON_TRACK.value)
    trend: str = Field(default=WeightTrend.STABLE.value)

    # User action
    applied: bool = Field(default=False)
    applied_at: Optional[datetime] = Field(default=None)
    dismissed: bool = Field(default=False)

    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())

    def __repr__(self) -> str:
        return (
            f"<CalorieAdjustment id={self.id} user={self.user_id} "
            f"week={self.week_start} adj={self.adjustment_kcal}kcal "
            f"reason={self.adjustment_reason!r} applied={self.applied}>"
        )


# ---------------------------------------------------------------------------
# Pydantic schemas for API request/response
# ---------------------------------------------------------------------------

class WeightSource(str, Enum):
    MANUAL = "manual"
    HEALTHKIT = "healthkit"
    SCALE_API = "scale_api"


class WeightLogCreate(SQLModel):
    """Request body for POST /api/nutrition/weight."""
    weight_kg: float = Field(ge=20.0, le=500.0, description="Weight in kg (20-500)")
    date: Optional[date_type] = Field(default=None, description="Date of measurement (defaults to today)")
    source: WeightSource = Field(default=WeightSource.MANUAL, description="Source: manual, healthkit, scale_api")
    notes: Optional[str] = Field(default=None, max_length=500, description="Optional notes, max 500 chars")


class WeightLogRead(SQLModel):
    """Response for a single weight entry."""
    id: int
    date: date_type
    weight_kg: float
    source: str
    notes: Optional[str]
    created_at: datetime


class AdaptiveTargetResponse(SQLModel):
    """Response for GET /api/nutrition/adaptive-target."""
    current_target: int
    recommended_target: int
    adjustment: int
    reason: str  # human-readable explanation
    reason_code: str  # machine-readable AdjustmentReason value
    predicted_weight_this_week: Optional[float]
    actual_weight: Optional[float]
    trend: str  # WeightTrend value
    has_pending_adjustment: bool
    bmr: Optional[float]  # so the user sees the floor
    apply_url: str = "/api/nutrition/adaptive-target/apply"


class ApplyAdjustmentResponse(SQLModel):
    """Response for POST /api/nutrition/adaptive-target/apply."""
    success: bool
    new_target: int
    previous_target: int
    adjustment: int
    message: str


class CalorieAdjustmentRead(SQLModel):
    """Response for a single adjustment history record."""
    id: int
    week_start: date_type
    week_end: date_type
    predicted_weight: float
    actual_weight: Optional[float]
    weight_delta: Optional[float]
    previous_target: int
    new_target: int
    adjustment_kcal: int
    adjustment_reason: str
    trend: str
    applied: bool
    applied_at: Optional[datetime]
    dismissed: bool
    created_at: datetime


class WeightHistoryResponse(SQLModel):
    """Response for weight history (chart data)."""
    entries: list[WeightLogRead]
    predicted_entries: list[dict]  # [{date, weight_kg}] — predicted trajectory
    current_weight: Optional[float]
    target_weight: Optional[float]
    weight_change_4w: Optional[float]  # kg change over last 4 weeks
