"""
Shared FastAPI dependencies
───────────────────────────
Reusable Depends() callables for route-level access control.

Usage in routers:
    from ..core.dependencies import require_premium

    @router.get("/premium-feature")
    async def my_endpoint(current_user: User = Depends(require_premium)):
        ...
"""

import logging

from fastapi import Depends, HTTPException, status
from sqlmodel.ext.asyncio.session import AsyncSession

from ..core.database import get_session
from ..models.user import User
from ..routers.auth import get_current_user
from ..services.subscription_verification_service import verify_premium

logger = logging.getLogger(__name__)


async def require_premium(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> User:
    """Dependency that enforces premium subscription access.

    Performs server-side verification of the user's premium status via
    RevenueCat (when configured) with Redis caching, falling back to the
    local database flag + active subscription check.

    Returns the authenticated User object if premium is confirmed.
    Raises HTTP 403 if the user does not have an active premium subscription.
    """
    is_premium = await verify_premium(current_user.id, session)

    if not is_premium:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Premium subscription required.",
        )

    return current_user
