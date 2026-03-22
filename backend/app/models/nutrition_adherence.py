from __future__ import annotations

from sqlmodel import SQLModel, Field
from sqlalchemy import Column, Date, Index, UniqueConstraint
from typing import Optional
from datetime import date as date_type, datetime


class DailyNutritionAdherence(SQLModel, table=True):
    __tablename__ = "daily_nutrition_adherence"
    __table_args__ = (
        UniqueConstraint("user_id", "date", name="uq_adherence_user_date"),
        Index("ix_adherence_user_date", "user_id", "date"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    date: date_type = Field(sa_column=Column(Date, nullable=False))

    # Calorie targets vs actual
    calories_target: int = Field(default=0)
    calories_logged: int = Field(default=0)
    calories_ratio: float = Field(default=0.0)  # logged / target

    # Meals
    meals_logged: int = Field(default=0)

    # Macro targets vs actual
    protein_target: int = Field(default=0)
    protein_logged: int = Field(default=0)
    carbs_target: int = Field(default=0)
    carbs_logged: int = Field(default=0)
    fats_target: int = Field(default=0)
    fats_logged: int = Field(default=0)

    # Composite scores
    diet_quality_score: int = Field(default=0)  # 0-100
    adherence_status: str = Field(default="critical")  # optimal, low_adherence, risk, high_risk, critical, moderate_excess, high_excess
    nutrition_risk_score: int = Field(default=0)  # 0-100

    # Flags
    no_log_flag: bool = Field(default=True)

    # Scoring metadata (v2)
    scoring_version: int = Field(default=2)
    data_confidence: int = Field(default=0)  # 0-100
    primary_risk_reason: Optional[str] = Field(default=None)
    plan_snapshot: Optional[str] = Field(default=None)  # JSON: {calories, protein_g, fat_g, carbs_g}

    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
