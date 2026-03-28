"""Nutrition tip model for admin-managed content.

Tips are created by admins and served to users via the insights/coach endpoints.
"""
from sqlmodel import SQLModel, Field
from sqlalchemy import Column, ForeignKey, Index, Integer
from typing import Optional
from datetime import datetime, timezone


class NutritionTip(SQLModel, table=True):
    __tablename__ = "nutrition_tip"
    __table_args__ = (
        # Filter tips by category and active status
        Index("ix_nutrition_tip_category_active", "category", "is_active"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    title: str = Field(max_length=200)
    body: str = Field(max_length=2000)
    category: str = Field(default="general", max_length=50, index=True)
    is_active: bool = Field(default=True)

    created_by: Optional[int] = Field(
        default=None,
        sa_column=Column(
            Integer,
            ForeignKey("user.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    def __repr__(self) -> str:
        return f"<NutritionTip id={self.id} title={self.title!r} category={self.category!r}>"
