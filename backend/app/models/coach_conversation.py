"""
CoachConversation — stores conversation messages for AI coach context continuity.

Each row is a single message (either user or assistant) in a coach conversation.
The service queries the last N messages per user to include as context in the
AI prompt, providing conversational continuity without requiring a full chat history.

Indexes:
- (user_id, created_at DESC) for efficient retrieval of recent messages.
- created_at for TTL cleanup of old messages.
"""

from sqlmodel import SQLModel, Field
from sqlalchemy import Index
from typing import Optional
from datetime import datetime, timezone


class CoachConversation(SQLModel, table=True):
    __tablename__ = "coach_conversation"
    __table_args__ = (
        Index(
            "ix_coach_conversation_user_recent",
            "user_id", "created_at",
        ),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)

    # "user" or "assistant"
    role: str = Field()
    content: str = Field()

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )

    def __repr__(self) -> str:
        preview = self.content[:40] + "..." if len(self.content) > 40 else self.content
        return (
            f"<CoachConversation id={self.id} user={self.user_id} "
            f"role={self.role} content={preview!r}>"
        )
