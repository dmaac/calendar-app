from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime, timezone


class AIScanCache(SQLModel, table=True):
    """
    Cache table for AI food scan results.

    Keyed by SHA-256 image hash. Stores full nutrition data so cache hits
    can return complete results without re-calling the AI API.

    Fields sugar_g, sodium_mg, serving_size, confidence were added to avoid
    data loss on cache hits (previously these were only in the AIFoodLog).
    """
    __tablename__ = "ai_scan_cache"

    id: Optional[int] = Field(default=None, primary_key=True)
    image_hash: str = Field(unique=True, index=True)

    food_name: str = Field()
    calories: float = Field()
    carbs_g: float = Field()
    protein_g: float = Field()
    fats_g: float = Field()
    fiber_g: Optional[float] = Field(default=None)
    sugar_g: Optional[float] = Field(default=None)
    sodium_mg: Optional[float] = Field(default=None)
    serving_size: Optional[str] = Field(default=None, max_length=200)
    confidence: Optional[float] = Field(default=None)

    ai_provider: str = Field()
    ai_response: Optional[str] = Field(default=None)  # JSON string

    hit_count: int = Field(default=1)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    def __repr__(self) -> str:
        return f"<AIScanCache id={self.id} food={self.food_name!r} hits={self.hit_count}>"
