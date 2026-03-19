from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, TYPE_CHECKING
from datetime import datetime

if TYPE_CHECKING:
    from .user import User


class Subscription(SQLModel, table=True):
    __tablename__ = "subscription"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)

    # Plan: free / monthly / yearly / lifetime
    plan: str = Field()
    # Status: active / canceled / expired / trial
    status: str = Field()

    price_paid: Optional[float] = Field(default=None)
    currency: str = Field(default="USD")
    discount_pct: Optional[int] = Field(default=None)

    trial_ends_at: Optional[datetime] = Field(default=None)
    current_period_ends_at: Optional[datetime] = Field(default=None)

    # Store: apple / google / stripe
    store: Optional[str] = Field(default=None)
    store_tx_id: Optional[str] = Field(default=None)

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    user: "User" = Relationship(back_populates="subscriptions")
