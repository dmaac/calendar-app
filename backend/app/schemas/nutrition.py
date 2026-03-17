from pydantic import BaseModel, Field
from typing import Optional, List, Generic, TypeVar
from datetime import date


T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    items: List[T]
    total: int
    offset: int
    limit: int


class DailySummaryResponse(BaseModel):
    date: date
    total_calories: float
    total_protein: float
    total_carbs: float
    total_fat: float
    total_fiber: float = 0.0
    total_sugar: float = 0.0
    target_calories: float
    target_protein: float
    target_carbs: float
    target_fat: float
    water_ml: float
    meals_count: int


class MacroTargets(BaseModel):
    target_calories: float
    target_protein_g: float
    target_carbs_g: float
    target_fat_g: float


class CalculateTargetsRequest(BaseModel):
    height_cm: float = Field(gt=0)
    weight_kg: float = Field(gt=0)
    age: int = Field(gt=0, le=150)
    gender: str
    activity_level: str
    goal: str
