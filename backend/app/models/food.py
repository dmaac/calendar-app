from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime, timezone


class FoodBase(SQLModel):
    name: str = Field(index=True, min_length=1)
    brand: Optional[str] = None
    category: Optional[str] = Field(default=None, index=True)
    serving_size: float = Field(default=100.0, gt=0)
    serving_unit: str = "g"
    calories: float = Field(ge=0)
    protein_g: float = Field(ge=0)
    carbs_g: float = Field(ge=0)
    fat_g: float = Field(ge=0)
    fiber_g: float = Field(default=0.0, ge=0)
    sugar_g: float = Field(default=0.0, ge=0)
    is_verified: bool = False


class Food(FoodBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    # Owner of this food entry — used for authorization (IDOR prevention).
    # NULL means system/admin-created (e.g., seed data) and is immutable by regular users.
    created_by: Optional[int] = Field(
        default=None,
        foreign_key="user.id",
        index=True,
        sa_column_kwargs={"comment": "NULL = system/admin created"},
    )
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())

    def __repr__(self) -> str:
        return f"<Food id={self.id} name={self.name!r} cal={self.calories}>"


class FoodCreate(FoodBase):
    pass


class FoodRead(FoodBase):
    id: int
    created_by: Optional[int] = None
    created_at: datetime


class FoodUpdate(SQLModel):
    name: Optional[str] = Field(default=None, min_length=1)
    brand: Optional[str] = None
    category: Optional[str] = None
    serving_size: Optional[float] = Field(default=None, gt=0)
    serving_unit: Optional[str] = None
    calories: Optional[float] = Field(default=None, ge=0)
    protein_g: Optional[float] = Field(default=None, ge=0)
    carbs_g: Optional[float] = Field(default=None, ge=0)
    fat_g: Optional[float] = Field(default=None, ge=0)
    fiber_g: Optional[float] = Field(default=None, ge=0)
    sugar_g: Optional[float] = Field(default=None, ge=0)
    is_verified: Optional[bool] = None
