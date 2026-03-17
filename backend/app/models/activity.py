from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, TYPE_CHECKING
from datetime import datetime
from enum import Enum

if TYPE_CHECKING:
    from .user import User


class ActivityStatus(str, Enum):
    SCHEDULED = "scheduled"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class ActivityBase(SQLModel):
    title: str
    description: Optional[str] = None
    start_time: datetime
    end_time: datetime
    status: ActivityStatus = ActivityStatus.SCHEDULED


class Activity(ActivityBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    user: "User" = Relationship(back_populates="activities")


class ActivityCreate(ActivityBase):
    pass


class ActivityRead(ActivityBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime


class ActivityUpdate(SQLModel):
    title: Optional[str] = None
    description: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    status: Optional[ActivityStatus] = None