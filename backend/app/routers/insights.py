from typing import List
from fastapi import APIRouter, Depends
from sqlmodel.ext.asyncio.session import AsyncSession
from ..core.database import get_session
from ..models.user import User
from ..services.insights_service import get_daily_insights
from .auth import get_current_user

router = APIRouter(prefix="/api/insights", tags=["insights"])


@router.get("/daily", response_model=List[dict])
async def daily_insights(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Personalized daily insights based on nutrition, hydration, and streak data."""
    return await get_daily_insights(current_user.id, session)
