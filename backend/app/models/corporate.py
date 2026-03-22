"""Corporate Wellness and Family Plan database models.

Tables:
  - corporate_company: Registered companies for the Corporate Wellness program.
  - corporate_membership: Links users to their company (email domain matching).
  - corporate_team: Named teams within a company for leaderboard grouping.
  - family_group: Family groups for shared nutrition tracking.
  - family_membership: Links users to a family group.
"""

from datetime import datetime
from typing import Optional, List, TYPE_CHECKING

from sqlalchemy import Index, UniqueConstraint
from sqlmodel import SQLModel, Field, Relationship

if TYPE_CHECKING:
    from .user import User


# ─── Corporate Wellness ─────────────────────────────────────────────────────


class CorporateCompany(SQLModel, table=True):
    __tablename__ = "corporate_company"
    __table_args__ = (
        UniqueConstraint("domain", name="uq_corporate_company_domain"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    domain: str = Field(index=True)  # e.g. "ironside.cl"
    admin_email: str = Field()
    admin_user_id: Optional[int] = Field(default=None, foreign_key="user.id")
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    memberships: List["CorporateMembership"] = Relationship(back_populates="company")
    teams: List["CorporateTeam"] = Relationship(back_populates="company")


class CorporateMembership(SQLModel, table=True):
    __tablename__ = "corporate_membership"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_corporate_membership_user"),
        Index("ix_corporate_membership_company", "company_id"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    company_id: int = Field(foreign_key="corporate_company.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    team_id: Optional[int] = Field(default=None, foreign_key="corporate_team.id")
    role: str = Field(default="member")  # admin | member
    joined_at: datetime = Field(default_factory=datetime.utcnow)

    company: CorporateCompany = Relationship(back_populates="memberships")
    team: Optional["CorporateTeam"] = Relationship(back_populates="members")


class CorporateTeam(SQLModel, table=True):
    __tablename__ = "corporate_team"
    __table_args__ = (
        UniqueConstraint("company_id", "name", name="uq_corporate_team_company_name"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    company_id: int = Field(foreign_key="corporate_company.id", index=True)
    name: str = Field()
    created_at: datetime = Field(default_factory=datetime.utcnow)

    company: CorporateCompany = Relationship(back_populates="teams")
    members: List[CorporateMembership] = Relationship(back_populates="team")


# ─── Family Plan ─────────────────────────────────────────────────────────────


class FamilyGroup(SQLModel, table=True):
    __tablename__ = "family_group"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(default="Mi Familia")
    owner_user_id: int = Field(foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    memberships: List["FamilyMembership"] = Relationship(back_populates="family_group")


class FamilyMembership(SQLModel, table=True):
    __tablename__ = "family_membership"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_family_membership_user"),
        Index("ix_family_membership_group", "family_group_id"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    family_group_id: int = Field(foreign_key="family_group.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    role: str = Field(default="member")  # owner | member
    joined_at: datetime = Field(default_factory=datetime.utcnow)

    family_group: FamilyGroup = Relationship(back_populates="memberships")
