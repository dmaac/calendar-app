"""
Risk Analytics Event model — lightweight table for tracking risk-related
user interactions (impressions, CTA clicks, interventions, corrections).
"""

from sqlmodel import SQLModel, Field
from sqlalchemy import Column, Index, Text
from typing import Optional
from datetime import datetime


class RiskAnalyticsEvent(SQLModel, table=True):
    __tablename__ = "risk_analytics_event"
    __table_args__ = (
        Index("ix_risk_event_user_id", "user_id"),
        Index("ix_risk_event_type", "event_type"),
        Index("ix_risk_event_created_at", "created_at"),
        Index("ix_risk_event_user_type", "user_id", "event_type"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")

    # One of: risk_card_impression, risk_cta_clicked, intervention_sent,
    #         intervention_opened, correction_after_intervention, risk_improved
    event_type: str = Field(max_length=50)

    # JSON metadata (variant, risk_score, reason, etc.)
    metadata_json: Optional[str] = Field(default=None, sa_column=Column(Text))

    created_at: datetime = Field(default_factory=datetime.utcnow)
