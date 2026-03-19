from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime


class AIScanCache(SQLModel, table=True):
    __tablename__ = "ai_scan_cache"

    id: Optional[int] = Field(default=None, primary_key=True)
    image_hash: str = Field(unique=True, index=True)

    food_name: str = Field()
    calories: float = Field()
    carbs_g: float = Field()
    protein_g: float = Field()
    fats_g: float = Field()
    fiber_g: Optional[float] = Field(default=None)

    ai_provider: str = Field()
    ai_response: Optional[str] = Field(default=None)  # JSON string

    hit_count: int = Field(default=1)
    created_at: datetime = Field(default_factory=datetime.utcnow)
