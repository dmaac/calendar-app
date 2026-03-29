"""Corporate Wellness and Family Plan database models.

Tables:
  - corporate_company: Registered companies for the Corporate Wellness program.
  - corporate_membership: Links users to their company (email domain matching).
  - corporate_team: Named teams within a company for leaderboard grouping.
  - family_group: Family groups for shared nutrition tracking.
  - family_membership: Links users to a family group.
"""

from datetime import datetime, timezone
from typing import Optional, List, TYPE_CHECKING

from sqlalchemy import Column, ForeignKey, Index, Integer, UniqueConstraint
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
    admin_user_id: Optional[int] = Field(
        default=None,
        sa_column=Column(
            Integer,
            ForeignKey("user.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    updated_at: datetime = Field(default_factory=lambda: datetime.utcnow())

    memberships: List["CorporateMembership"] = Relationship(back_populates="company")
    teams: List["CorporateTeam"] = Relationship(back_populates="company")

    def __repr__(self) -> str:
        return f"<CorporateCompany id={self.id} name={self.name!r} domain={self.domain!r}>"


class CorporateMembership(SQLModel, table=True):
    __tablename__ = "corporate_membership"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_corporate_membership_user"),
        Index("ix_corporate_membership_company", "company_id"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    company_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("corporate_company.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
    )
    user_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
    )
    team_id: Optional[int] = Field(
        default=None,
        sa_column=Column(
            Integer,
            ForeignKey("corporate_team.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    role: str = Field(default="member")  # admin | member
    joined_at: datetime = Field(default_factory=lambda: datetime.utcnow())

    company: CorporateCompany = Relationship(back_populates="memberships")
    team: Optional["CorporateTeam"] = Relationship(back_populates="members")

    def __repr__(self) -> str:
        return f"<CorporateMembership id={self.id} company={self.company_id} user={self.user_id} role={self.role!r}>"


class CorporateTeam(SQLModel, table=True):
    __tablename__ = "corporate_team"
    __table_args__ = (
        UniqueConstraint("company_id", "name", name="uq_corporate_team_company_name"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    company_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("corporate_company.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
    )
    name: str = Field()
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())

    company: CorporateCompany = Relationship(back_populates="teams")
    members: List[CorporateMembership] = Relationship(back_populates="team")

    def __repr__(self) -> str:
        return f"<CorporateTeam id={self.id} company={self.company_id} name={self.name!r}>"


# ─── Family Plan ─────────────────────────────────────────────────────────────


class FamilyGroup(SQLModel, table=True):
    __tablename__ = "family_group"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(default="Mi Familia")
    owner_user_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
    )
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    updated_at: datetime = Field(default_factory=lambda: datetime.utcnow())

    memberships: List["FamilyMembership"] = Relationship(back_populates="family_group")

    def __repr__(self) -> str:
        return f"<FamilyGroup id={self.id} name={self.name!r} owner={self.owner_user_id}>"


class FamilyMembership(SQLModel, table=True):
    __tablename__ = "family_membership"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_family_membership_user"),
        Index("ix_family_membership_group", "family_group_id"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    family_group_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("family_group.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
    )
    user_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
    )
    role: str = Field(default="member")  # owner | member
    joined_at: datetime = Field(default_factory=lambda: datetime.utcnow())

    family_group: FamilyGroup = Relationship(back_populates="memberships")

    def __repr__(self) -> str:
        return f"<FamilyMembership id={self.id} group={self.family_group_id} user={self.user_id} role={self.role!r}>"
