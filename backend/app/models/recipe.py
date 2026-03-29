"""Recipe model for admin-managed content.

Recipes are curated by admins and can be surfaced via the coach/insights endpoints.
"""
from sqlmodel import SQLModel, Field
from sqlalchemy import Column, ForeignKey, Index, Integer
from typing import Optional
from datetime import datetime, timezone


class Recipe(SQLModel, table=True):
    __tablename__ = "recipe"
    __table_args__ = (
        # Filter recipes by category + active status
        Index("ix_recipe_category_active", "category", "is_active"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    title: str = Field(max_length=200)
    description: Optional[str] = Field(default=None, max_length=1000)
    ingredients: str = Field(max_length=5000)  # JSON string or newline-separated
    instructions: str = Field(max_length=10000)
    category: str = Field(default="general", max_length=50, index=True)
    cuisine: Optional[str] = Field(default=None, max_length=50)

    # Nutrition per serving
    calories: Optional[float] = Field(default=None, ge=0)
    protein_g: Optional[float] = Field(default=None, ge=0)
    carbs_g: Optional[float] = Field(default=None, ge=0)
    fat_g: Optional[float] = Field(default=None, ge=0)
    fiber_g: Optional[float] = Field(default=None, ge=0)

    servings: int = Field(default=1, ge=1)
    prep_time_min: Optional[int] = Field(default=None, ge=0)
    cook_time_min: Optional[int] = Field(default=None, ge=0)
    image_url: Optional[str] = Field(default=None)

    is_active: bool = Field(default=True)
    is_premium: bool = Field(default=False)  # Premium-only recipes

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
        return f"<Recipe id={self.id} title={self.title!r} category={self.category!r}>"
