"""
Token Budget Service — Per-user weekly AI token budget management.

AI TOKEN COST: This module REDUCES costs by enforcing per-user token budgets.
When a user exceeds their weekly budget, all requests are routed to the
"template" tier (zero AI cost).

No AI API calls are made in this file.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Budget tiers (tokens per week)
# ---------------------------------------------------------------------------

TOKEN_BUDGETS: dict[str, int] = {
    "free": 5_000,
    "premium": 50_000,
}

# ---------------------------------------------------------------------------
# In-memory token tracking
# ---------------------------------------------------------------------------

# Key: user_id -> {"used": int, "week_start": float (epoch)}
_user_budgets: dict[int, dict] = {}


def _current_week_start() -> float:
    """Return epoch timestamp of the most recent Monday 00:00 UTC."""
    now = datetime.now(timezone.utc)
    # weekday(): Monday=0
    days_since_monday = now.weekday()
    monday = now.replace(hour=0, minute=0, second=0, microsecond=0)
    monday = monday.replace(day=now.day - days_since_monday)
    return monday.timestamp()


def _get_or_create_entry(user_id: int) -> dict:
    """Get or initialize the budget entry for a user, resetting if week changed."""
    week_start = _current_week_start()
    entry = _user_budgets.get(user_id)

    if entry is None or entry["week_start"] < week_start:
        # New week or new user — reset
        entry = {"used": 0, "week_start": week_start}
        _user_budgets[user_id] = entry

    return entry


def get_remaining_budget(user_id: int, tier: str = "free") -> int:
    """Return the remaining token budget for a user this week.

    Args:
        user_id: The user's database ID.
        tier: "free" or "premium".

    Returns:
        Remaining tokens available this week (>= 0).
    """
    entry = _get_or_create_entry(user_id)
    total_budget = TOKEN_BUDGETS.get(tier, TOKEN_BUDGETS["free"])
    remaining = total_budget - entry["used"]
    return max(0, remaining)


def consume_tokens(user_id: int, tokens_used: int, tier: str = "free") -> dict:
    """Record token consumption for a user.

    Args:
        user_id: The user's database ID.
        tokens_used: Number of tokens consumed.
        tier: "free" or "premium".

    Returns:
        {"consumed": int, "total_used": int, "remaining": int, "budget_exceeded": bool}
    """
    entry = _get_or_create_entry(user_id)
    total_budget = TOKEN_BUDGETS.get(tier, TOKEN_BUDGETS["free"])

    entry["used"] += tokens_used
    remaining = max(0, total_budget - entry["used"])
    budget_exceeded = entry["used"] >= total_budget

    if budget_exceeded:
        logger.info(
            "User %d exceeded weekly token budget (%d/%d). Routing to template tier.",
            user_id, entry["used"], total_budget,
        )

    return {
        "consumed": tokens_used,
        "total_used": entry["used"],
        "remaining": remaining,
        "budget_exceeded": budget_exceeded,
    }


def get_usage_summary(user_id: int, tier: str = "free") -> dict:
    """Return a complete usage summary for the user this week.

    Args:
        user_id: The user's database ID.
        tier: "free" or "premium".

    Returns:
        {
            "tokens_used": int,
            "tokens_remaining": int,
            "budget_total": int,
            "budget_exceeded": bool,
            "usage_pct": float,
            "tier": str,
            "resets_at": str (ISO 8601 of next Monday 00:00 UTC),
        }
    """
    entry = _get_or_create_entry(user_id)
    total_budget = TOKEN_BUDGETS.get(tier, TOKEN_BUDGETS["free"])
    remaining = max(0, total_budget - entry["used"])
    usage_pct = round((entry["used"] / total_budget) * 100, 1) if total_budget > 0 else 0.0

    # Calculate next Monday 00:00 UTC
    now = datetime.now(timezone.utc)
    days_until_monday = (7 - now.weekday()) % 7
    if days_until_monday == 0:
        days_until_monday = 7
    next_monday = now.replace(hour=0, minute=0, second=0, microsecond=0)
    from datetime import timedelta
    next_monday = next_monday + timedelta(days=days_until_monday)

    return {
        "tokens_used": entry["used"],
        "tokens_remaining": remaining,
        "budget_total": total_budget,
        "budget_exceeded": entry["used"] >= total_budget,
        "usage_pct": usage_pct,
        "tier": tier,
        "resets_at": next_monday.isoformat(),
    }


def is_budget_exceeded(user_id: int, tier: str = "free") -> bool:
    """Check if a user has exceeded their weekly token budget."""
    return get_remaining_budget(user_id, tier) <= 0
