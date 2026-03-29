"""
Standardized API response schemas for OpenAPI documentation.

Every endpoint should use explicit Pydantic response_model schemas
so the generated OpenAPI spec is accurate, typed, and self-documenting.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Generic / shared
# ---------------------------------------------------------------------------

class MessageResponse(BaseModel):
    """Generic message-only response."""
    message: str = Field(description="Human-readable status message")


class StatusMessageResponse(BaseModel):
    """Status + message response used for confirmations."""
    status: str = Field(description="Operation status (e.g. 'deleted', 'success')")
    message: str = Field(description="Human-readable explanation")


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class AuthTokenResponse(BaseModel):
    """Returned on successful login, refresh, or OAuth sign-in."""
    access_token: str = Field(description="JWT access token")
    refresh_token: str = Field(description="JWT refresh token for rotation")
    token_type: str = Field(default="bearer", description="Token type (always 'bearer')")
    user_id: Optional[int] = Field(default=None, description="Authenticated user ID")


class LogoutResponse(BaseModel):
    message: str = Field(default="Logged out successfully")


class AccountDeletedResponse(BaseModel):
    detail: str = Field(default="Account deleted successfully")


# ---------------------------------------------------------------------------
# AI Food Log
# ---------------------------------------------------------------------------

class FoodLogItemResponse(BaseModel):
    """Single food log entry as returned by list/detail endpoints."""
    id: int
    food_name: str
    calories: float
    carbs_g: float
    protein_g: float
    fats_g: float
    fiber_g: Optional[float] = None
    sugar_g: Optional[float] = None
    sodium_mg: Optional[float] = None
    serving_size: Optional[str] = None
    meal_type: str
    logged_at: str = Field(description="ISO-8601 datetime string")
    image_url: Optional[str] = None
    ai_confidence: Optional[float] = None
    was_edited: bool = False


class CelebrationItem(BaseModel):
    trigger: str
    message: str
    emoji: Optional[str] = None
    intensity: Optional[str] = None
    data: Optional[Dict[str, Any]] = None


class FoodScanResponse(BaseModel):
    """Returned after AI food scan or manual/quick log."""
    id: int
    food_name: str
    calories: float
    carbs_g: float
    protein_g: float
    fats_g: float
    fiber_g: Optional[float] = None
    sugar_g: Optional[float] = None
    sodium_mg: Optional[float] = None
    serving_size: Optional[str] = None
    meal_type: str
    logged_at: str = Field(description="ISO-8601 datetime string")
    was_edited: bool = False
    cache_hit: bool = False
    celebrations: List[CelebrationItem] = Field(
        default_factory=list,
        description="Post-meal celebrations and completed missions",
    )


class WaterLogResponse(BaseModel):
    water_ml: float = Field(description="Current total water intake in ml for the day")


class FrequentFoodItem(BaseModel):
    food_name: str
    calories: float
    protein_g: float
    carbs_g: float
    fats_g: float
    fiber_g: Optional[float] = None
    sugar_g: Optional[float] = None
    sodium_mg: Optional[float] = None
    serving_size: Optional[str] = None
    meal_type: str
    log_count: int = Field(description="Number of times this food has been logged")
    last_logged: Optional[str] = Field(
        default=None, description="ISO-8601 datetime of last log"
    )


class FoodSearchResult(BaseModel):
    food_name: str
    calories: float
    protein_g: float
    carbs_g: float
    fats_g: float
    count: int = Field(description="Number of times logged by this user")


class FoodLogUpdateResponse(BaseModel):
    message: str = Field(default="Updated")
    id: int


class FoodLogDeleteResponse(BaseModel):
    message: str = Field(default="Deleted")
    recoverable: bool = Field(
        default=True,
        description="Whether the record can be recovered within the retention period",
    )


# ---------------------------------------------------------------------------
# Meals
# ---------------------------------------------------------------------------

class WaterUpdateResponse(BaseModel):
    message: str = Field(default="Water intake updated")
    water_ml: float


# ---------------------------------------------------------------------------
# Subscriptions
# ---------------------------------------------------------------------------

class SubscriptionReadResponse(BaseModel):
    id: int
    user_id: int
    plan: str = Field(description="Subscription plan: monthly, annual, or lifetime")
    status: str = Field(description="Current status: pending_verification, active, trial, cancelled, expired")
    price_paid: Optional[float] = None
    discount_pct: Optional[int] = None
    store: Optional[str] = Field(default=None, description="Purchase store: apple, google, or stripe")
    trial_ends_at: Optional[datetime] = None
    current_period_ends_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Favorites
# ---------------------------------------------------------------------------

class FavoriteRemovedResponse(BaseModel):
    message: str = Field(default="Favorite removed successfully")


# ---------------------------------------------------------------------------
# User Data (GDPR)
# ---------------------------------------------------------------------------

class GDPRDeletionResponse(BaseModel):
    """Response after GDPR data erasure (Article 17)."""
    status: str = Field(default="deleted")
    message: str
    user_id: int
    deleted_at: str = Field(description="ISO-8601 datetime of deletion")
    deleted_counts: Dict[str, int] = Field(
        description="Number of records deleted per table"
    )
    total_records_deleted: int
