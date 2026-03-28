"""
CoachCostLog — tracks cost per AI coach interaction for budget monitoring.

Each row records a single AI API call made by the coach service, including
the model used, token counts, estimated cost, and the endpoint that triggered it.

Indexes:
- (user_id, created_at) for per-user cost queries.
- created_at for aggregate cost reporting.
"""

from sqlmodel import SQLModel, Field
from sqlalchemy import Index
from typing import Optional
from datetime import datetime, timezone


class CoachCostLog(SQLModel, table=True):
    __tablename__ = "coach_cost_log"
    __table_args__ = (
        Index(
            "ix_coach_cost_log_user_date",
            "user_id", "created_at",
        ),
        Index(
            "ix_coach_cost_log_created_at",
            "created_at",
        ),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)

    # Which endpoint triggered this call
    endpoint: str = Field()  # "chat", "insight", "meal_suggestion"

    # AI provider and model used
    provider: str = Field(default="openai")  # "openai", "anthropic"
    model: str = Field(default="gpt-4o-mini")

    # Token usage
    prompt_tokens: int = Field(default=0)
    completion_tokens: int = Field(default=0)
    total_tokens: int = Field(default=0)

    # Estimated cost in USD (based on known pricing)
    estimated_cost_usd: float = Field(default=0.0)

    # Response latency in milliseconds
    latency_ms: int = Field(default=0)

    # Whether the call succeeded
    success: bool = Field(default=True)
    error_type: Optional[str] = Field(default=None)

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )

    def __repr__(self) -> str:
        return (
            f"<CoachCostLog id={self.id} user={self.user_id} "
            f"model={self.model} tokens={self.total_tokens} "
            f"cost=${self.estimated_cost_usd:.6f}>"
        )
