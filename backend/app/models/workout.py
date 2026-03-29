from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy import Column, ForeignKey, Index, Integer
from typing import Optional, List, TYPE_CHECKING
from datetime import datetime, timezone
from enum import Enum

if TYPE_CHECKING:
    from .user import User


class WorkoutType(str, Enum):
    CARDIO = "cardio"
    STRENGTH = "strength"
    FLEXIBILITY = "flexibility"
    SPORTS = "sports"
    OTHER = "other"


class WorkoutLogBase(SQLModel):
    workout_type: WorkoutType
    duration_min: int = Field(ge=1, le=1440, description="Duration in minutes, 1-1440 (max 24h)")
    calories_burned: Optional[int] = Field(default=None, ge=0, le=20000, description="Calories burned, 0-20000")
    notes: Optional[str] = Field(default=None, max_length=1000, description="Optional notes, max 1000 chars")


class WorkoutLog(WorkoutLogBase, table=True):
    __tablename__ = "workoutlog"
    __table_args__ = (
        Index("ix_workoutlog_user_created", "user_id", "created_at"),
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
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())

    user: "User" = Relationship(back_populates="workout_logs")

    def __repr__(self) -> str:
        return (
            f"<WorkoutLog id={self.id} user={self.user_id} "
            f"type={self.workout_type} dur={self.duration_min}m>"
        )


class WorkoutLogCreate(WorkoutLogBase):
    pass


class WorkoutLogRead(WorkoutLogBase):
    id: int
    user_id: int
    created_at: datetime


class WorkoutSummary(SQLModel):
    total_workouts: int = 0
    total_duration_min: int = 0
    total_calories: int = 0
    avg_duration_min: float = 0.0
