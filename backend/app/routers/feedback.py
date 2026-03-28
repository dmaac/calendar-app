"""
In-app feedback system
──────────────────────
POST /api/feedback       — Submit feedback (authenticated user)
GET  /api/feedback       — List feedback (admin)
GET  /api/feedback/{id}  — Single feedback detail (admin)
PATCH /api/feedback/{id} — Update feedback status/notes (admin)
"""

import logging
from datetime import datetime, time, date as date_type, timezone
from typing import Optional
from enum import Enum

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import col
from sqlalchemy import select, func
from pydantic import BaseModel, Field

from ..core.database import get_session
from ..core.pagination import PaginatedResponse, build_paginated_response, paginate_params
from ..models.user import User
from ..models.feedback import Feedback, FeedbackType, FeedbackStatus
from .auth import get_current_user
from .admin import require_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/feedback", tags=["feedback"])


# ─── Request / Response schemas ──────────────────────────────────────────────

class FeedbackCreate(BaseModel):
    type: FeedbackType = Field(..., description="bug, feature, complaint, or praise")
    message: str = Field(..., min_length=1, max_length=5000, description="Feedback message")
    screen: Optional[str] = Field(None, max_length=200, description="Screen where feedback was submitted")
    app_version: Optional[str] = Field(None, max_length=50, description="Client app version")
    device_model: Optional[str] = Field(None, max_length=200, description="Device model (e.g. iPhone 15 Pro)")
    device_os: Optional[str] = Field(None, max_length=100, description="OS name (e.g. iOS, Android)")
    device_os_version: Optional[str] = Field(None, max_length=50, description="OS version (e.g. 18.1)")


class FeedbackResponse(BaseModel):
    id: int
    user_id: int
    type: FeedbackType
    message: str
    screen: Optional[str]
    app_version: Optional[str]
    device_model: Optional[str]
    device_os: Optional[str]
    device_os_version: Optional[str]
    status: FeedbackStatus
    admin_notes: Optional[str]
    created_at: str
    updated_at: str


class FeedbackStatusUpdate(BaseModel):
    status: Optional[FeedbackStatus] = None
    admin_notes: Optional[str] = Field(None, max_length=2000)


class SortOrder(str, Enum):
    asc = "asc"
    desc = "desc"


def _feedback_to_response(fb: Feedback) -> FeedbackResponse:
    return FeedbackResponse(
        id=fb.id,
        user_id=fb.user_id,
        type=fb.type,
        message=fb.message,
        screen=fb.screen,
        app_version=fb.app_version,
        device_model=fb.device_model,
        device_os=fb.device_os,
        device_os_version=fb.device_os_version,
        status=fb.status,
        admin_notes=fb.admin_notes,
        created_at=fb.created_at.isoformat(),
        updated_at=fb.updated_at.isoformat(),
    )


# ─── User endpoints ─────────────────────────────────────────────────────────

@router.post("", response_model=FeedbackResponse, status_code=201)
async def submit_feedback(
    body: FeedbackCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Submit in-app feedback. Requires authentication."""
    feedback = Feedback(
        user_id=current_user.id,
        type=body.type,
        message=body.message,
        screen=body.screen,
        app_version=body.app_version,
        device_model=body.device_model,
        device_os=body.device_os,
        device_os_version=body.device_os_version,
    )
    session.add(feedback)
    await session.commit()
    await session.refresh(feedback)

    logger.info(
        "Feedback submitted: id=%s user_id=%s type=%s screen=%s",
        feedback.id, current_user.id, feedback.type, feedback.screen,
    )

    return _feedback_to_response(feedback)


# ─── Admin endpoints ─────────────────────────────────────────────────────────

@router.get("", response_model=PaginatedResponse[FeedbackResponse])
async def list_feedback(
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    type: Optional[FeedbackType] = Query(None, description="Filter by feedback type"),
    status_filter: Optional[FeedbackStatus] = Query(None, alias="status", description="Filter by status"),
    user_id: Optional[int] = Query(None, description="Filter by user ID"),
    date_from: Optional[str] = Query(None, description="Filter: start date YYYY-MM-DD (inclusive)"),
    date_to: Optional[str] = Query(None, description="Filter: end date YYYY-MM-DD (inclusive)"),
    order: SortOrder = Query(SortOrder.desc, description="Sort order by created_at"),
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """
    List feedback entries with filters and pagination.

    Examples:
    - `GET /api/feedback?page=1&page_size=20` -- latest 20 feedback entries
    - `GET /api/feedback?type=bug&status=new` -- new bug reports
    - `GET /api/feedback?user_id=42` -- feedback from specific user
    - `GET /api/feedback?date_from=2026-03-01&date_to=2026-03-15`
    """
    query = select(Feedback)
    count_query = select(func.count()).select_from(Feedback)

    # Apply filters
    if type is not None:
        query = query.where(Feedback.type == type)
        count_query = count_query.where(Feedback.type == type)

    if status_filter is not None:
        query = query.where(Feedback.status == status_filter)
        count_query = count_query.where(Feedback.status == status_filter)

    if user_id is not None:
        query = query.where(Feedback.user_id == user_id)
        count_query = count_query.where(Feedback.user_id == user_id)

    if date_from is not None:
        try:
            parsed_from = date_type.fromisoformat(date_from)
        except ValueError:
            raise HTTPException(status_code=422, detail="date_from must be YYYY-MM-DD")
        query = query.where(Feedback.created_at >= datetime.combine(parsed_from, time.min))
        count_query = count_query.where(Feedback.created_at >= datetime.combine(parsed_from, time.min))

    if date_to is not None:
        try:
            parsed_to = date_type.fromisoformat(date_to)
        except ValueError:
            raise HTTPException(status_code=422, detail="date_to must be YYYY-MM-DD")
        query = query.where(Feedback.created_at <= datetime.combine(parsed_to, time.max))
        count_query = count_query.where(Feedback.created_at <= datetime.combine(parsed_to, time.max))

    # Sorting
    if order == SortOrder.desc:
        query = query.order_by(col(Feedback.created_at).desc())  # type: ignore
    else:
        query = query.order_by(col(Feedback.created_at).asc())  # type: ignore

    # Count
    total_result = await session.execute(count_query)
    total = total_result.scalar() or 0

    # Paginate
    offset, limit = paginate_params(page, page_size)
    query = query.offset(offset).limit(limit)

    result = await session.execute(query)
    feedbacks = result.scalars().all()

    items = [_feedback_to_response(fb) for fb in feedbacks]

    return build_paginated_response(items=items, total=total, page=page, page_size=page_size)


@router.get("/{feedback_id}", response_model=FeedbackResponse)
async def get_feedback(
    feedback_id: int,
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """Get a single feedback entry by ID."""
    result = await session.execute(
        select(Feedback).where(Feedback.id == feedback_id)
    )
    feedback = result.scalar_one_or_none()
    if not feedback:
        raise HTTPException(status_code=404, detail="Feedback not found")

    return _feedback_to_response(feedback)


@router.patch("/{feedback_id}", response_model=FeedbackResponse)
async def update_feedback(
    feedback_id: int,
    body: FeedbackStatusUpdate,
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """Update feedback status or admin notes."""
    result = await session.execute(
        select(Feedback).where(Feedback.id == feedback_id)
    )
    feedback = result.scalar_one_or_none()
    if not feedback:
        raise HTTPException(status_code=404, detail="Feedback not found")

    if body.status is not None:
        feedback.status = body.status
    if body.admin_notes is not None:
        feedback.admin_notes = body.admin_notes

    feedback.updated_at = datetime.now(timezone.utc)
    session.add(feedback)
    await session.commit()
    await session.refresh(feedback)

    return _feedback_to_response(feedback)
