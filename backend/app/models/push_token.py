from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy import Column, ForeignKey, Index, Integer
from typing import Optional, TYPE_CHECKING
from datetime import datetime, timezone

if TYPE_CHECKING:
    from .user import User


class PushToken(SQLModel, table=True):
    __tablename__ = "push_token"
    __table_args__ = (
        # Find active tokens for a user (notification dispatch)
        Index("ix_push_token_user_active", "user_id", "is_active"),
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
    token: str = Field(unique=True, index=True)
    platform: str = Field()  # "ios" or "android"
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())

    user: "User" = Relationship(back_populates="push_tokens")

    def __repr__(self) -> str:
        return f"<PushToken id={self.id} user={self.user_id} platform={self.platform} active={self.is_active}>"
