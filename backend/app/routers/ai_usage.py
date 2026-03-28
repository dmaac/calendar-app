"""
AI Usage router — Token usage tracking endpoint (Item 159).

GET /api/ai/usage — Returns the authenticated user's AI token usage this week,
                    budget remaining, and subscription tier.
"""

import logging

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

try:
    from slowapi import Limiter
    from slowapi.util import get_remote_address
    _limiter = Limiter(key_func=get_remote_address)
    _rate_limit_enabled = True
except ImportError:
    _rate_limit_enabled = False

_rl = lambda limit_str: (_limiter.limit(limit_str) if _rate_limit_enabled else lambda f: f)

from ..models.user import User
from ..services.token_budget_service import get_usage_summary
from .auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai", tags=["ai-usage"])


class AIUsageResponse(BaseModel):
    tokens_used: int
    tokens_remaining: int
    budget_total: int
    budget_exceeded: bool
    usage_pct: float
    tier: str
    resets_at: str


@router.get("/usage", response_model=AIUsageResponse)
@_rl("30/minute")
async def get_ai_usage(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """Return the authenticated user's AI token usage this week."""
    tier = "premium" if current_user.is_premium else "free"
    data = await get_usage_summary(current_user.id, tier=tier)
    return AIUsageResponse(**data)
