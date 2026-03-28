"""
A/B Testing models
------------------
Experiment      -- defines an experiment (name, variants, start/end dates, active flag)
ExperimentAssignment -- maps user_id + experiment_id to a variant (consistent)
ExperimentConversion -- records a conversion event for a user+experiment
"""

from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy import Column, ForeignKey, Index, Integer, UniqueConstraint
from typing import Optional, TYPE_CHECKING
from datetime import datetime, timezone

if TYPE_CHECKING:
    from .user import User


class Experiment(SQLModel, table=True):
    __tablename__ = "experiment"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)
    description: Optional[str] = Field(default=None)

    # Comma-separated variant names, e.g. "control,variant_a,variant_b"
    variants: str = Field(default="control,variant_a,variant_b")

    is_active: bool = Field(default=True, index=True)
    start_date: Optional[datetime] = Field(default=None)
    end_date: Optional[datetime] = Field(default=None)

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    def __repr__(self) -> str:
        return f"<Experiment id={self.id} name={self.name!r} active={self.is_active}>"


class ExperimentAssignment(SQLModel, table=True):
    __tablename__ = "experiment_assignment"
    __table_args__ = (
        UniqueConstraint("user_id", "experiment_id", name="uq_user_experiment"),
        Index("ix_assignment_experiment_variant", "experiment_id", "variant"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
    )
    experiment_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("experiment.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
    )
    variant: str = Field()

    assigned_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    def __repr__(self) -> str:
        return (
            f"<ExperimentAssignment id={self.id} user={self.user_id} "
            f"exp={self.experiment_id} variant={self.variant!r}>"
        )


class ExperimentConversion(SQLModel, table=True):
    __tablename__ = "experiment_conversion"
    __table_args__ = (
        Index("ix_conversion_experiment_variant", "experiment_id", "variant"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
    )
    experiment_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("experiment.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
    )
    variant: str = Field()

    # Optional metadata about what converted (e.g. "subscribe", "onboarding_complete")
    conversion_event: Optional[str] = Field(default=None)

    converted_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    def __repr__(self) -> str:
        return (
            f"<ExperimentConversion id={self.id} user={self.user_id} "
            f"exp={self.experiment_id} event={self.conversion_event!r}>"
        )
