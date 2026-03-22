"""Pydantic schemas for Corporate Wellness and Family Plan endpoints."""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


# ─── Corporate Wellness ─────────────────────────────────────────────────────


class CorporateRegisterRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=200, description="Company name")
    domain: str = Field(..., min_length=3, max_length=100, description="Email domain (e.g. ironside.cl)")
    admin_email: str = Field(..., description="Admin contact email")


class CorporateRegisterResponse(BaseModel):
    id: int
    name: str
    domain: str
    admin_email: str
    created_at: datetime
    message: str = "Company registered successfully"


class CorporateInviteRequest(BaseModel):
    company_id: int
    emails: List[str] = Field(..., min_length=1, max_length=50, description="Emails to invite (must match company domain)")


class CorporateInviteResponse(BaseModel):
    invited: int
    already_members: int
    invalid_domain: int
    not_found: int
    details: List[str]


class CorporateDashboardResponse(BaseModel):
    company_name: str
    total_employees: int
    active_today: int
    participation_rate: float = Field(description="Percentage of employees who logged food today")
    avg_nutriscore: float = Field(description="Average daily calorie achievement across all employees")
    popular_foods: List[str] = Field(description="Top 5 most logged foods by employees")


class TeamLeaderboardEntry(BaseModel):
    team_name: str
    member_count: int
    avg_nutriscore: float
    active_members: int


class CorporateLeaderboardResponse(BaseModel):
    company_name: str
    teams: List[TeamLeaderboardEntry]
    period: str = "last_7_days"


# ─── Family Plan ─────────────────────────────────────────────────────────────


class FamilyCreateRequest(BaseModel):
    name: str = Field(default="Mi Familia", min_length=1, max_length=100)


class FamilyCreateResponse(BaseModel):
    id: int
    name: str
    owner_user_id: int
    created_at: datetime
    message: str = "Family group created successfully"


class FamilyInviteRequest(BaseModel):
    email: str = Field(..., description="Email of the user to invite")


class FamilyInviteResponse(BaseModel):
    message: str
    member_user_id: Optional[int] = None


class FamilyMemberStats(BaseModel):
    user_id: int
    first_name: Optional[str]
    role: str
    calories_today: float
    protein_today: float
    carbs_today: float
    fats_today: float
    meals_logged_today: int


class FamilyMembersResponse(BaseModel):
    family_id: int
    family_name: str
    members: List[FamilyMemberStats]


class FamilySummaryResponse(BaseModel):
    family_id: int
    family_name: str
    date: str
    total_members: int
    members_who_logged: int
    avg_calories: float
    avg_protein: float
    avg_carbs: float
    avg_fats: float
    top_foods: List[str]
