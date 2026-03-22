from sqlmodel import SQLModel, Field, Relationship, Index
from typing import Optional, List, TYPE_CHECKING
from datetime import datetime
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
    duration_min: int = Field(ge=1)
    calories_burned: Optional[int] = Field(default=None, ge=0)
    notes: Optional[str] = None


class WorkoutLog(WorkoutLogBase, table=True):
    __tablename__ = "workoutlog"
    __table_args__ = (
        Index("ix_workoutlog_user_created", "user_id", "created_at"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)

    user: "User" = Relationship(back_populates="workout_logs")


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
