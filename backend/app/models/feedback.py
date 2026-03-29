from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy import Column, ForeignKey, Index, Integer
from typing import Optional, TYPE_CHECKING
from datetime import datetime, timezone
from enum import Enum

if TYPE_CHECKING:
    from .user import User


class FeedbackType(str, Enum):
    BUG = "bug"
    FEATURE = "feature"
    COMPLAINT = "complaint"
    PRAISE = "praise"


class FeedbackStatus(str, Enum):
    NEW = "new"
    REVIEWED = "reviewed"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    DISMISSED = "dismissed"


class Feedback(SQLModel, table=True):
    __tablename__ = "feedback"
    __table_args__ = (
        Index("ix_feedback_user_id", "user_id"),
        Index("ix_feedback_type", "type"),
        Index("ix_feedback_status", "status"),
        Index("ix_feedback_created_at", "created_at"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )

    type: FeedbackType = Field()
    message: str = Field(max_length=5000)
    screen: Optional[str] = Field(default=None, max_length=200)
    app_version: Optional[str] = Field(default=None, max_length=50)

    # Device metadata
    device_model: Optional[str] = Field(default=None, max_length=200)
    device_os: Optional[str] = Field(default=None, max_length=100)
    device_os_version: Optional[str] = Field(default=None, max_length=50)

    status: FeedbackStatus = Field(default=FeedbackStatus.NEW)
    admin_notes: Optional[str] = Field(default=None, max_length=2000)

    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    updated_at: datetime = Field(default_factory=lambda: datetime.utcnow())

    user: "User" = Relationship()

    def __repr__(self) -> str:
        return f"<Feedback id={self.id} user={self.user_id} type={self.type} status={self.status}>"
