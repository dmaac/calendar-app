"""Nutrition tip model for admin-managed content.

Tips are created by admins and served to users via the insights/coach endpoints.
"""
from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime


class NutritionTip(SQLModel, table=True):
    __tablename__ = "nutrition_tip"

    id: Optional[int] = Field(default=None, primary_key=True)
    title: str = Field(max_length=200)
    body: str = Field(max_length=2000)
    category: str = Field(default="general", max_length=50)  # general, hydration, protein, etc.
    is_active: bool = Field(default=True)

    created_by: Optional[int] = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
