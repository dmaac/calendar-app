"""Family Plan API endpoints.

Endpoints:
  POST   /api/family/create       -- Create a new family group (owner)
  POST   /api/family/invite       -- Invite a member by email
  GET    /api/family/members      -- List members with basic stats
  GET    /api/family/summary      -- Family nutritional summary for today
  DELETE /api/family/members/{id} -- Remove a member from the group
"""

import logging
from datetime import date, datetime, time as dt_time
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Path, status
from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..core.database import get_session
from ..models.user import User
from ..models.ai_food_log import AIFoodLog
from ..models.corporate import FamilyGroup, FamilyMembership
from ..routers.auth import get_current_user
from ..schemas.corporate import (
    FamilyCreateRequest,
    FamilyCreateResponse,
    FamilyInviteRequest,
    FamilyInviteResponse,
    FamilyMemberStats,
    FamilyMembersResponse,
    FamilySummaryResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/family", tags=["family"])

# Maximum members per family group (owner included)
_MAX_FAMILY_MEMBERS = 10


# ─── Helpers ────────────────────────────────────────────────────────────────


async def _get_user_family(
    user: User, session: AsyncSession
) -> tuple[FamilyMembership, FamilyGroup]:
    """Return the membership and family group for an authenticated user.
    Raises 404 if the user is not in any family.
    """
    result = await session.execute(
        select(FamilyMembership).where(FamilyMembership.user_id == user.id)
    )
    membership = result.scalars().first()
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="You are not a member of any family group.",
        )
    family = await session.get(FamilyGroup, membership.family_group_id)
    if not family:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Family group not found.",
        )
    return membership, family


async def _require_family_owner(
    user: User, session: AsyncSession
) -> tuple[FamilyMembership, FamilyGroup]:
    """Same as _get_user_family but also verifies owner role."""
    membership, family = await _get_user_family(user, session)
    if membership.role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the family group owner can perform this action.",
        )
    return membership, family


async def _get_today_stats(user_id: int, session: AsyncSession) -> dict:
    """Get today's nutrition stats for a single user."""
    today = date.today()
    today_start = datetime.combine(today, dt_time.min)
    today_end = datetime.combine(today, dt_time.max)

    result = await session.execute(
        select(
            func.coalesce(func.sum(AIFoodLog.calories), 0).label("calories"),
            func.coalesce(func.sum(AIFoodLog.protein_g), 0).label("protein"),
            func.coalesce(func.sum(AIFoodLog.carbs_g), 0).label("carbs"),
            func.coalesce(func.sum(AIFoodLog.fats_g), 0).label("fats"),
            func.count(AIFoodLog.id).label("meals"),
        ).where(
            AIFoodLog.user_id == user_id,
            AIFoodLog.logged_at >= today_start,
            AIFoodLog.logged_at <= today_end,
            AIFoodLog.deleted_at.is_(None),
        )
    )
    row = result.one()
    return {
        "calories": round(float(row[0]), 1),
        "protein": round(float(row[1]), 1),
        "carbs": round(float(row[2]), 1),
        "fats": round(float(row[3]), 1),
        "meals": int(row[4]),
    }


# ─── POST /api/family/create ────────────────────────────────────────────────


@router.post("/create", response_model=FamilyCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_family(
    body: FamilyCreateRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Create a new family group. The authenticated user becomes the owner."""
    # Check: user must not already belong to a family
    existing = await session.execute(
        select(FamilyMembership).where(FamilyMembership.user_id == current_user.id)
    )
    if existing.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already belong to a family group. Leave it before creating a new one.",
        )

    family = FamilyGroup(
        name=body.name.strip(),
        owner_user_id=current_user.id,
    )
    session.add(family)
    await session.flush()

    # Add owner as first member
    owner_membership = FamilyMembership(
        family_group_id=family.id,
        user_id=current_user.id,
        role="owner",
    )
    session.add(owner_membership)
    await session.commit()
    await session.refresh(family)

    logger.info(
        "Family group created: id=%s name=%s by user_id=%s",
        family.id, family.name, current_user.id,
    )

    return FamilyCreateResponse(
        id=family.id,
        name=family.name,
        owner_user_id=family.owner_user_id,
        created_at=family.created_at,
    )


# ─── POST /api/family/invite ────────────────────────────────────────────────


@router.post("/invite", response_model=FamilyInviteResponse)
async def invite_member(
    body: FamilyInviteRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Invite a member to the family group by email.

    Only the group owner can invite. The invited user must already have
    a Fitsi account.
    """
    _, family = await _require_family_owner(current_user, session)

    # Check member count limit
    count_result = await session.execute(
        select(func.count(FamilyMembership.id)).where(
            FamilyMembership.family_group_id == family.id
        )
    )
    current_count = count_result.scalar_one() or 0
    if current_count >= _MAX_FAMILY_MEMBERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Family group is full (max {_MAX_FAMILY_MEMBERS} members).",
        )

    email_str = str(body.email).strip().lower()

    # Find the user
    user_result = await session.execute(
        select(User).where(User.email == email_str)
    )
    invitee = user_result.scalars().first()
    if not invitee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No Fitsi user found with that email.",
        )

    # Check if already in any family
    existing = await session.execute(
        select(FamilyMembership).where(FamilyMembership.user_id == invitee.id)
    )
    if existing.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This user already belongs to a family group.",
        )

    new_membership = FamilyMembership(
        family_group_id=family.id,
        user_id=invitee.id,
        role="member",
    )
    session.add(new_membership)
    await session.commit()

    logger.info(
        "Family invite: user_id=%s added to family_id=%s by owner_id=%s",
        invitee.id, family.id, current_user.id,
    )

    return FamilyInviteResponse(
        message=f"User {email_str} added to the family group.",
        member_user_id=invitee.id,
    )


# ─── GET /api/family/members ────────────────────────────────────────────────


@router.get("/members", response_model=FamilyMembersResponse)
async def list_members(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """List all family members with their basic nutrition stats for today."""
    _, family = await _get_user_family(current_user, session)

    # Get all memberships
    members_result = await session.execute(
        select(FamilyMembership).where(
            FamilyMembership.family_group_id == family.id
        )
    )
    memberships = list(members_result.scalars().all())

    if not memberships:
        return FamilyMembersResponse(
            family_id=family.id,
            family_name=family.name,
            members=[],
        )

    # Batch-load all users in a single query instead of N+1 individual gets
    member_user_ids = [m.user_id for m in memberships]
    users_result = await session.execute(
        select(User).where(User.id.in_(member_user_ids))  # type: ignore[attr-defined]
    )
    users_map = {u.id: u for u in users_result.scalars().all()}

    # Batch-load today's nutrition stats for all members in a single query
    today = date.today()
    today_start = datetime.combine(today, dt_time.min)
    today_end = datetime.combine(today, dt_time.max)

    batch_stats_result = await session.execute(
        select(
            AIFoodLog.user_id,
            func.coalesce(func.sum(AIFoodLog.calories), 0).label("calories"),
            func.coalesce(func.sum(AIFoodLog.protein_g), 0).label("protein"),
            func.coalesce(func.sum(AIFoodLog.carbs_g), 0).label("carbs"),
            func.coalesce(func.sum(AIFoodLog.fats_g), 0).label("fats"),
            func.count(AIFoodLog.id).label("meals"),
        ).where(
            AIFoodLog.user_id.in_(member_user_ids),  # type: ignore[attr-defined]
            AIFoodLog.logged_at >= today_start,
            AIFoodLog.logged_at <= today_end,
            AIFoodLog.deleted_at.is_(None),
        ).group_by(AIFoodLog.user_id)
    )
    stats_map = {}
    for row in batch_stats_result.all():
        stats_map[row[0]] = {
            "calories": round(float(row[1]), 1),
            "protein": round(float(row[2]), 1),
            "carbs": round(float(row[3]), 1),
            "fats": round(float(row[4]), 1),
            "meals": int(row[5]),
        }

    member_stats: List[FamilyMemberStats] = []
    for m in memberships:
        user = users_map.get(m.user_id)
        if not user:
            continue

        stats = stats_map.get(m.user_id, {
            "calories": 0.0, "protein": 0.0, "carbs": 0.0, "fats": 0.0, "meals": 0,
        })
        member_stats.append(
            FamilyMemberStats(
                user_id=m.user_id,
                first_name=user.first_name,
                role=m.role,
                calories_today=stats["calories"],
                protein_today=stats["protein"],
                carbs_today=stats["carbs"],
                fats_today=stats["fats"],
                meals_logged_today=stats["meals"],
            )
        )

    return FamilyMembersResponse(
        family_id=family.id,
        family_name=family.name,
        members=member_stats,
    )


# ─── GET /api/family/summary ────────────────────────────────────────────────


@router.get("/summary", response_model=FamilySummaryResponse)
async def family_summary(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Aggregated nutritional summary for the family for today."""
    _, family = await _get_user_family(current_user, session)

    # Get all member user_ids
    members_result = await session.execute(
        select(FamilyMembership.user_id).where(
            FamilyMembership.family_group_id == family.id
        )
    )
    member_user_ids: List[int] = list(members_result.scalars().all())
    total_members = len(member_user_ids)

    today = date.today()
    today_start = datetime.combine(today, dt_time.min)
    today_end = datetime.combine(today, dt_time.max)

    if total_members == 0:
        return FamilySummaryResponse(
            family_id=family.id,
            family_name=family.name,
            date=today.isoformat(),
            total_members=0,
            members_who_logged=0,
            avg_calories=0.0,
            avg_protein=0.0,
            avg_carbs=0.0,
            avg_fats=0.0,
            top_foods=[],
        )

    # Members who logged today
    logged_result = await session.execute(
        select(func.count(func.distinct(AIFoodLog.user_id))).where(
            AIFoodLog.user_id.in_(member_user_ids),  # type: ignore[attr-defined]
            AIFoodLog.logged_at >= today_start,
            AIFoodLog.logged_at <= today_end,
            AIFoodLog.deleted_at.is_(None),
        )
    )
    members_who_logged = logged_result.scalar_one() or 0

    # Averages
    avg_result = await session.execute(
        select(
            func.avg(AIFoodLog.calories),
            func.avg(AIFoodLog.protein_g),
            func.avg(AIFoodLog.carbs_g),
            func.avg(AIFoodLog.fats_g),
        ).where(
            AIFoodLog.user_id.in_(member_user_ids),  # type: ignore[attr-defined]
            AIFoodLog.logged_at >= today_start,
            AIFoodLog.logged_at <= today_end,
            AIFoodLog.deleted_at.is_(None),
        )
    )
    avg_row = avg_result.one()
    avg_calories = round(float(avg_row[0] or 0), 1)
    avg_protein = round(float(avg_row[1] or 0), 1)
    avg_carbs = round(float(avg_row[2] or 0), 1)
    avg_fats = round(float(avg_row[3] or 0), 1)

    # Top foods today
    top_result = await session.execute(
        select(AIFoodLog.food_name, func.count(AIFoodLog.id).label("cnt"))
        .where(
            AIFoodLog.user_id.in_(member_user_ids),  # type: ignore[attr-defined]
            AIFoodLog.logged_at >= today_start,
            AIFoodLog.logged_at <= today_end,
            AIFoodLog.deleted_at.is_(None),
        )
        .group_by(AIFoodLog.food_name)
        .order_by(func.count(AIFoodLog.id).desc())
        .limit(5)
    )
    top_foods = [row[0] for row in top_result.all()]

    return FamilySummaryResponse(
        family_id=family.id,
        family_name=family.name,
        date=today.isoformat(),
        total_members=total_members,
        members_who_logged=members_who_logged,
        avg_calories=avg_calories,
        avg_protein=avg_protein,
        avg_carbs=avg_carbs,
        avg_fats=avg_fats,
        top_foods=top_foods,
    )


# ─── DELETE /api/family/members/{id} ────────────────────────────────────────


@router.delete("/members/{member_user_id}", status_code=status.HTTP_200_OK)
async def remove_member(
    member_user_id: int = Path(..., description="User ID of the member to remove"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Remove a member from the family group.

    The owner can remove any member. A member can remove themselves.
    The owner cannot be removed (must delete the group instead).
    """
    my_membership, family = await _get_user_family(current_user, session)

    # Find the target membership
    target_result = await session.execute(
        select(FamilyMembership).where(
            FamilyMembership.family_group_id == family.id,
            FamilyMembership.user_id == member_user_id,
        )
    )
    target_membership = target_result.scalars().first()
    if not target_membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found in this family group.",
        )

    # Owner cannot remove themselves
    if target_membership.role == "owner":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The owner cannot be removed. Delete the family group instead.",
        )

    # Permission check: only owner or the member themselves
    if my_membership.role != "owner" and current_user.id != member_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the owner or the member themselves can remove a member.",
        )

    await session.delete(target_membership)
    await session.commit()

    logger.info(
        "Family member removed: user_id=%s from family_id=%s by user_id=%s",
        member_user_id, family.id, current_user.id,
    )

    return {"detail": f"Member {member_user_id} removed from the family group."}
