"""Corporate Wellness API endpoints.

Endpoints:
  POST /api/corporate/register   -- Register a new company
  GET  /api/corporate/dashboard  -- Aggregated KPIs for the company (no individual data)
  POST /api/corporate/invite     -- Invite employees by email (must match company domain)
  GET  /api/corporate/leaderboard -- Anonymous NutriScore leaderboard by teams
"""

import logging
from datetime import date, datetime, time as dt_time, timedelta
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..core.database import get_session
from ..models.user import User
from ..models.ai_food_log import AIFoodLog
from ..models.corporate import (
    CorporateCompany,
    CorporateMembership,
    CorporateTeam,
)
from ..routers.auth import get_current_user
from ..schemas.corporate import (
    CorporateRegisterRequest,
    CorporateRegisterResponse,
    CorporateInviteRequest,
    CorporateInviteResponse,
    CorporateDashboardResponse,
    CorporateLeaderboardResponse,
    TeamLeaderboardEntry,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/corporate", tags=["corporate"])


# ─── Helpers ────────────────────────────────────────────────────────────────


async def _get_user_company(
    user: User, session: AsyncSession
) -> tuple[CorporateMembership, CorporateCompany]:
    """Return the membership and company for an authenticated user.
    Raises 403 if the user is not a member of any company.
    """
    result = await session.execute(
        select(CorporateMembership).where(CorporateMembership.user_id == user.id)
    )
    membership = result.scalars().first()
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of any corporate company.",
        )
    company = await session.get(CorporateCompany, membership.company_id)
    if not company or not company.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found or inactive.",
        )
    return membership, company


async def _require_company_admin(
    user: User, session: AsyncSession
) -> tuple[CorporateMembership, CorporateCompany]:
    """Same as _get_user_company but also verifies admin role."""
    membership, company = await _get_user_company(user, session)
    if membership.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only company admins can perform this action.",
        )
    return membership, company


# ─── POST /api/corporate/register ───────────────────────────────────────────


@router.post("/register", response_model=CorporateRegisterResponse, status_code=status.HTTP_201_CREATED)
async def register_company(
    body: CorporateRegisterRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Register a new company for the Corporate Wellness program.

    The authenticated user becomes the company admin.
    """
    # Validate: domain must not already be registered
    result = await session.execute(
        select(CorporateCompany).where(CorporateCompany.domain == body.domain.lower())
    )
    if result.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Domain '{body.domain}' is already registered.",
        )

    # Validate: user must not already belong to a company
    existing_membership = await session.execute(
        select(CorporateMembership).where(CorporateMembership.user_id == current_user.id)
    )
    if existing_membership.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already belong to a company. Leave it before registering a new one.",
        )

    company = CorporateCompany(
        name=body.name.strip(),
        domain=body.domain.strip().lower(),
        admin_email=body.admin_email.strip().lower(),
        admin_user_id=current_user.id,
    )
    session.add(company)
    await session.flush()  # get the ID

    # Auto-add the registering user as admin member
    membership = CorporateMembership(
        company_id=company.id,
        user_id=current_user.id,
        role="admin",
    )
    session.add(membership)
    await session.commit()
    await session.refresh(company)

    logger.info(
        "Corporate company registered: id=%s name=%s domain=%s by user_id=%s",
        company.id, company.name, company.domain, current_user.id,
    )

    return CorporateRegisterResponse(
        id=company.id,
        name=company.name,
        domain=company.domain,
        admin_email=company.admin_email,
        created_at=company.created_at,
    )


# ─── GET /api/corporate/dashboard ───────────────────────────────────────────


@router.get("/dashboard", response_model=CorporateDashboardResponse)
async def corporate_dashboard(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Aggregated KPIs for the company. No individual employee data is exposed."""
    membership, company = await _get_user_company(current_user, session)

    # Get all employee user_ids in this company
    members_result = await session.execute(
        select(CorporateMembership.user_id).where(
            CorporateMembership.company_id == company.id
        )
    )
    member_user_ids: List[int] = list(members_result.scalars().all())
    total_employees = len(member_user_ids)

    if total_employees == 0:
        return CorporateDashboardResponse(
            company_name=company.name,
            total_employees=0,
            active_today=0,
            participation_rate=0.0,
            avg_nutriscore=0.0,
            popular_foods=[],
        )

    today = date.today()
    today_start = datetime.combine(today, dt_time.min)
    today_end = datetime.combine(today, dt_time.max)

    # Active today: distinct users who logged food today
    active_result = await session.execute(
        select(func.count(func.distinct(AIFoodLog.user_id))).where(
            AIFoodLog.user_id.in_(member_user_ids),  # type: ignore[attr-defined]
            AIFoodLog.logged_at >= today_start,
            AIFoodLog.logged_at <= today_end,
            AIFoodLog.deleted_at.is_(None),
        )
    )
    active_today = active_result.scalar_one() or 0

    participation_rate = round((active_today / total_employees) * 100, 1) if total_employees > 0 else 0.0

    # Avg NutriScore: average total calories logged today across all employees
    # (serves as a proxy metric -- higher participation = better score)
    avg_cal_result = await session.execute(
        select(func.avg(AIFoodLog.calories)).where(
            AIFoodLog.user_id.in_(member_user_ids),  # type: ignore[attr-defined]
            AIFoodLog.logged_at >= today_start,
            AIFoodLog.logged_at <= today_end,
            AIFoodLog.deleted_at.is_(None),
        )
    )
    avg_nutriscore = round(float(avg_cal_result.scalar_one() or 0), 1)

    # Popular foods: top 5 most logged food names in the last 7 days
    week_ago = datetime.combine(today - timedelta(days=7), dt_time.min)
    popular_result = await session.execute(
        select(AIFoodLog.food_name, func.count(AIFoodLog.id).label("cnt"))
        .where(
            AIFoodLog.user_id.in_(member_user_ids),  # type: ignore[attr-defined]
            AIFoodLog.logged_at >= week_ago,
            AIFoodLog.deleted_at.is_(None),
        )
        .group_by(AIFoodLog.food_name)
        .order_by(func.count(AIFoodLog.id).desc())
        .limit(5)
    )
    popular_foods = [row[0] for row in popular_result.all()]

    return CorporateDashboardResponse(
        company_name=company.name,
        total_employees=total_employees,
        active_today=active_today,
        participation_rate=participation_rate,
        avg_nutriscore=avg_nutriscore,
        popular_foods=popular_foods,
    )


# ─── POST /api/corporate/invite ─────────────────────────────────────────────


@router.post("/invite", response_model=CorporateInviteResponse)
async def invite_employees(
    body: CorporateInviteRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Invite employees by email. Emails must match the company domain.

    Only company admins can invite.
    """
    _, company = await _require_company_admin(current_user, session)

    # Verify body.company_id matches admin's company
    if body.company_id != company.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only invite to your own company.",
        )

    invited = 0
    already_members = 0
    invalid_domain = 0
    not_found = 0
    details: List[str] = []

    for email_addr in body.emails:
        email_str = str(email_addr).strip().lower()

        # Validate domain
        email_domain = email_str.split("@")[-1] if "@" in email_str else ""
        if email_domain != company.domain:
            invalid_domain += 1
            details.append(f"{email_str}: domain mismatch (expected @{company.domain})")
            continue

        # Find user by email
        user_result = await session.execute(
            select(User).where(User.email == email_str)
        )
        user = user_result.scalars().first()
        if not user:
            not_found += 1
            details.append(f"{email_str}: user not registered in Fitsi")
            continue

        # Check if already a member
        existing = await session.execute(
            select(CorporateMembership).where(
                CorporateMembership.company_id == company.id,
                CorporateMembership.user_id == user.id,
            )
        )
        if existing.scalars().first():
            already_members += 1
            details.append(f"{email_str}: already a member")
            continue

        # Check if user belongs to another company
        other_membership = await session.execute(
            select(CorporateMembership).where(CorporateMembership.user_id == user.id)
        )
        if other_membership.scalars().first():
            details.append(f"{email_str}: already belongs to another company")
            continue

        # Add membership
        new_membership = CorporateMembership(
            company_id=company.id,
            user_id=user.id,
            role="member",
        )
        session.add(new_membership)
        invited += 1
        details.append(f"{email_str}: invited successfully")

    await session.commit()

    logger.info(
        "Corporate invite: company_id=%s invited=%d already=%d invalid=%d not_found=%d by user_id=%s",
        company.id, invited, already_members, invalid_domain, not_found, current_user.id,
    )

    return CorporateInviteResponse(
        invited=invited,
        already_members=already_members,
        invalid_domain=invalid_domain,
        not_found=not_found,
        details=details,
    )


# ─── GET /api/corporate/leaderboard ─────────────────────────────────────────


@router.get("/leaderboard", response_model=CorporateLeaderboardResponse)
async def corporate_leaderboard(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Anonymous NutriScore leaderboard grouped by teams.

    Rankings are based on average calorie tracking consistency
    over the last 7 days. No individual user data is exposed.
    """
    membership, company = await _get_user_company(current_user, session)

    # Get all teams for this company
    teams_result = await session.execute(
        select(CorporateTeam).where(CorporateTeam.company_id == company.id)
    )
    teams = list(teams_result.scalars().all())

    if not teams:
        return CorporateLeaderboardResponse(
            company_name=company.name,
            teams=[],
            period="last_7_days",
        )

    today = date.today()
    week_ago = datetime.combine(today - timedelta(days=7), dt_time.min)
    today_start = datetime.combine(today, dt_time.min)
    today_end = datetime.combine(today, dt_time.max)

    team_ids = [t.id for t in teams]

    # Batch-load all team memberships in a single query instead of N+1
    all_memberships_result = await session.execute(
        select(CorporateMembership.team_id, CorporateMembership.user_id).where(
            CorporateMembership.team_id.in_(team_ids)  # type: ignore[attr-defined]
        )
    )
    team_members_map: dict[int, list[int]] = {t.id: [] for t in teams}
    all_member_user_ids: list[int] = []
    for row in all_memberships_result.all():
        team_members_map[row[0]].append(row[1])
        all_member_user_ids.append(row[1])

    # Batch-load avg calories (last 7 days) grouped by team via user mapping
    avg_stats_map: dict[int, float] = {}
    active_stats_map: dict[int, int] = {}

    if all_member_user_ids:
        # Average calories per user over last 7 days
        avg_result = await session.execute(
            select(
                AIFoodLog.user_id,
                func.avg(AIFoodLog.calories).label("avg_cal"),
            ).where(
                AIFoodLog.user_id.in_(all_member_user_ids),  # type: ignore[attr-defined]
                AIFoodLog.logged_at >= week_ago,
                AIFoodLog.deleted_at.is_(None),
            ).group_by(AIFoodLog.user_id)
        )
        user_avg_map = {row[0]: float(row[1] or 0) for row in avg_result.all()}

        # Active users today
        active_result = await session.execute(
            select(AIFoodLog.user_id).where(
                AIFoodLog.user_id.in_(all_member_user_ids),  # type: ignore[attr-defined]
                AIFoodLog.logged_at >= today_start,
                AIFoodLog.logged_at <= today_end,
                AIFoodLog.deleted_at.is_(None),
            ).distinct()
        )
        active_user_ids = set(active_result.scalars().all())

        # Aggregate per team
        for team in teams:
            t_user_ids = team_members_map[team.id]
            if t_user_ids:
                team_avgs = [user_avg_map[uid] for uid in t_user_ids if uid in user_avg_map]
                avg_stats_map[team.id] = round(sum(team_avgs) / len(team_avgs), 1) if team_avgs else 0.0
                active_stats_map[team.id] = sum(1 for uid in t_user_ids if uid in active_user_ids)

    leaderboard_entries: List[TeamLeaderboardEntry] = []
    for team in teams:
        member_count = len(team_members_map[team.id])
        leaderboard_entries.append(
            TeamLeaderboardEntry(
                team_name=team.name,
                member_count=member_count,
                avg_nutriscore=avg_stats_map.get(team.id, 0.0),
                active_members=active_stats_map.get(team.id, 0),
            )
        )

    # Sort by avg_nutriscore descending (higher = better tracking)
    leaderboard_entries.sort(key=lambda e: e.avg_nutriscore, reverse=True)

    return CorporateLeaderboardResponse(
        company_name=company.name,
        teams=leaderboard_entries,
        period="last_7_days",
    )
