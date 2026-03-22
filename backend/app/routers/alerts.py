"""
Nutrition Alerts router.

GET /api/alerts/daily — returns today's nutrition alerts for the authenticated user.
"""

from __future__ import annotations

import logging
from typing import List

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel.ext.asyncio.session import AsyncSession

from ..core.database import get_session
from ..models.user import User
from ..services.nutrition_alerts_service import NutritionAlert, evaluate_daily_alerts
from .auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/alerts", tags=["nutrition-alerts"])


class DailyAlertsResponse(BaseModel):
    alerts: List[NutritionAlert]
    count: int
    has_critical: bool
    has_danger: bool
    max_level: str  # highest severity found: critical | danger | warning | info | none


@router.get("/daily", response_model=DailyAlertsResponse)
async def get_daily_alerts(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Evaluate the authenticated user's nutrition data for today and return
    a prioritized list of alerts (critical > danger > warning > info).

    Response includes convenience flags for the frontend:
    - has_critical: true if any CRITICAL alert exists (show full-screen overlay)
    - has_danger: true if any DANGER alert exists (show red banner)
    - max_level: the highest severity level found ("none" if no alerts)
    """
    user_id: int = current_user.id  # type: ignore[assignment]

    alerts = await evaluate_daily_alerts(user_id, session)

    levels = {a.level for a in alerts}
    if "critical" in levels:
        max_level = "critical"
    elif "danger" in levels:
        max_level = "danger"
    elif "warning" in levels:
        max_level = "warning"
    elif "info" in levels:
        max_level = "info"
    else:
        max_level = "none"

    return DailyAlertsResponse(
        alerts=alerts,
        count=len(alerts),
        has_critical="critical" in levels,
        has_danger="danger" in levels,
        max_level=max_level,
    )
