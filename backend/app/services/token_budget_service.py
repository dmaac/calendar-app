"""
Token Budget Service — Per-user weekly AI token budget management.

AI TOKEN COST: This module REDUCES costs by enforcing per-user token budgets.
When a user exceeds their weekly budget, all requests are routed to the
"template" tier (zero AI cost).

No AI API calls are made in this file.

PERSISTENCE FIX (2026-03-23):
  Previously used an in-memory dict (_user_budgets) that reset on every deploy,
  losing all weekly budget tracking. Now persists to Redis with automatic TTL.
  Falls back to in-memory tracking if Redis is unavailable.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Budget tiers (tokens per week)
# ---------------------------------------------------------------------------

TOKEN_BUDGETS: dict[str, int] = {
    "free": 5_000,
    "premium": 50_000,
}

# Redis key prefix for token budget tracking
_REDIS_KEY_PREFIX = "token_budget"

# TTL for Redis keys: 8 days (covers one full week plus buffer for
# timezone edge cases). Keys auto-expire so we never leak memory.
_REDIS_TTL_SECONDS = 8 * 86400

# ---------------------------------------------------------------------------
# In-memory fallback (used only when Redis is unavailable)
# ---------------------------------------------------------------------------

# Key: user_id -> {"used": int, "week_start": str (ISO date)}
_user_budgets_fallback: dict[int, dict] = {}


def _current_week_key() -> str:
    """Return a string key for the current ISO week, e.g. '2026-W12'.

    Using ISO week ensures consistent weekly boundaries (Monday-based)
    and makes Redis keys human-readable for debugging.
    """
    now = datetime.now(timezone.utc)
    iso_year, iso_week, _ = now.isocalendar()
    return f"{iso_year}-W{iso_week:02d}"


def _seconds_until_next_monday() -> int:
    """Return the number of seconds until next Monday 00:00 UTC."""
    now = datetime.now(timezone.utc)
    days_until_monday = (7 - now.weekday()) % 7
    if days_until_monday == 0:
        days_until_monday = 7
    next_monday = now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=days_until_monday)
    return max(1, int((next_monday - now).total_seconds()))


def _redis_key(user_id: int) -> str:
    """Build the Redis key for a user's current-week token budget."""
    week = _current_week_key()
    return f"{_REDIS_KEY_PREFIX}:{user_id}:{week}"


def _get_redis():
    """Get a Redis client. Returns None if Redis is unavailable."""
    try:
        from ..core.token_store import get_redis
        return get_redis()
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Core async operations (Redis-backed)
# ---------------------------------------------------------------------------

async def _get_used_tokens_redis(user_id: int) -> int | None:
    """Read token usage from Redis. Returns None if Redis unavailable."""
    r = _get_redis()
    if r is None:
        return None
    try:
        key = _redis_key(user_id)
        val = await r.get(key)
        return int(val) if val is not None else 0
    except Exception as exc:
        logger.warning("Redis token budget read failed for user %d: %s", user_id, exc)
        return None


async def _incr_used_tokens_redis(user_id: int, tokens: int) -> int | None:
    """Atomically increment token usage in Redis. Returns new total or None."""
    r = _get_redis()
    if r is None:
        return None
    try:
        key = _redis_key(user_id)
        new_total = await r.incrby(key, tokens)
        # Set TTL only on first write (when new_total equals tokens, meaning
        # the key was just created). Use seconds_until_next_monday for precise
        # weekly reset, with a small buffer.
        if new_total == tokens:
            ttl = _seconds_until_next_monday() + 86400  # +1 day buffer
            await r.expire(key, ttl)
        return int(new_total)
    except Exception as exc:
        logger.warning("Redis token budget write failed for user %d: %s", user_id, exc)
        return None


# ---------------------------------------------------------------------------
# Fallback in-memory operations (synchronous, used when Redis is down)
# ---------------------------------------------------------------------------

def _get_or_create_fallback(user_id: int) -> dict:
    """Get or initialize the fallback in-memory budget entry."""
    week = _current_week_key()
    entry = _user_budgets_fallback.get(user_id)

    if entry is None or entry.get("week") != week:
        entry = {"used": 0, "week": week}
        _user_budgets_fallback[user_id] = entry

    return entry


# ---------------------------------------------------------------------------
# Public API — async functions that use Redis with in-memory fallback
# ---------------------------------------------------------------------------

async def get_remaining_budget(user_id: int, tier: str = "free") -> int:
    """Return the remaining token budget for a user this week.

    Args:
        user_id: The user's database ID.
        tier: "free" or "premium".

    Returns:
        Remaining tokens available this week (>= 0).
    """
    total_budget = TOKEN_BUDGETS.get(tier, TOKEN_BUDGETS["free"])

    # Try Redis first
    used = await _get_used_tokens_redis(user_id)
    if used is not None:
        return max(0, total_budget - used)

    # Fallback to in-memory
    entry = _get_or_create_fallback(user_id)
    return max(0, total_budget - entry["used"])


async def consume_tokens(user_id: int, tokens_used: int, tier: str = "free") -> dict:
    """Record token consumption for a user.

    Args:
        user_id: The user's database ID.
        tokens_used: Number of tokens consumed.
        tier: "free" or "premium".

    Returns:
        {"consumed": int, "total_used": int, "remaining": int, "budget_exceeded": bool}
    """
    total_budget = TOKEN_BUDGETS.get(tier, TOKEN_BUDGETS["free"])

    # Try Redis first (atomic increment)
    new_total = await _incr_used_tokens_redis(user_id, tokens_used)
    if new_total is not None:
        total_used = new_total
    else:
        # Fallback to in-memory
        entry = _get_or_create_fallback(user_id)
        entry["used"] += tokens_used
        total_used = entry["used"]

    remaining = max(0, total_budget - total_used)
    budget_exceeded = total_used >= total_budget

    if budget_exceeded:
        logger.info(
            "User %d exceeded weekly token budget (%d/%d). Routing to template tier.",
            user_id, total_used, total_budget,
        )

    return {
        "consumed": tokens_used,
        "total_used": total_used,
        "remaining": remaining,
        "budget_exceeded": budget_exceeded,
    }


async def get_usage_summary(user_id: int, tier: str = "free") -> dict:
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
    total_budget = TOKEN_BUDGETS.get(tier, TOKEN_BUDGETS["free"])

    # Get current usage
    used = await _get_used_tokens_redis(user_id)
    if used is None:
        entry = _get_or_create_fallback(user_id)
        used = entry["used"]

    remaining = max(0, total_budget - used)
    usage_pct = round((used / total_budget) * 100, 1) if total_budget > 0 else 0.0

    # Calculate next Monday 00:00 UTC
    now = datetime.now(timezone.utc)
    days_until_monday = (7 - now.weekday()) % 7
    if days_until_monday == 0:
        days_until_monday = 7
    next_monday = now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=days_until_monday)

    return {
        "tokens_used": used,
        "tokens_remaining": remaining,
        "budget_total": total_budget,
        "budget_exceeded": used >= total_budget,
        "usage_pct": usage_pct,
        "tier": tier,
        "resets_at": next_monday.isoformat(),
    }


async def is_budget_exceeded(user_id: int, tier: str = "free") -> bool:
    """Check if a user has exceeded their weekly token budget."""
    remaining = await get_remaining_budget(user_id, tier)
    return remaining <= 0


# ---------------------------------------------------------------------------
# Synchronous compatibility wrappers
# ---------------------------------------------------------------------------
# Some callers in the codebase may use the old synchronous API.
# These wrappers maintain backward compatibility while preferring Redis.

def get_remaining_budget_sync(user_id: int, tier: str = "free") -> int:
    """Synchronous fallback — uses in-memory tracking only."""
    total_budget = TOKEN_BUDGETS.get(tier, TOKEN_BUDGETS["free"])
    entry = _get_or_create_fallback(user_id)
    return max(0, total_budget - entry["used"])


def consume_tokens_sync(user_id: int, tokens_used: int, tier: str = "free") -> dict:
    """Synchronous fallback — uses in-memory tracking only."""
    total_budget = TOKEN_BUDGETS.get(tier, TOKEN_BUDGETS["free"])
    entry = _get_or_create_fallback(user_id)
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


def is_budget_exceeded_sync(user_id: int, tier: str = "free") -> bool:
    """Synchronous fallback — uses in-memory tracking only."""
    return get_remaining_budget_sync(user_id, tier) <= 0
