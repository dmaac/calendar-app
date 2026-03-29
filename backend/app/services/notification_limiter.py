"""
Notification Limiter Service (Items 40 + 46).

Controls notification frequency per user:
- Max 3 push notifications per day
- Max 14 push notifications per week
- Quiet hours: 22:00 - 07:00 in user's timezone (or UTC if unknown)

Uses in-memory counters with automatic daily/weekly reset.
"""

from __future__ import annotations

import logging
from datetime import datetime, date, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

# Valid notification types
NOTIFICATION_TYPES = {
    "risk_critical",
    "risk_warning",
    "risk_improvement",
    "streak_celebration",
}

# Limits
MAX_PER_DAY = 3
MAX_PER_WEEK = 14

# In-memory counters
# Key: "{user_id}" -> {"daily": {date_str: count}, "weekly": {week_str: count}}
_notification_counters: dict[int, dict[str, dict[str, int]]] = {}


def _get_user_counter(user_id: int) -> dict[str, dict[str, int]]:
    """Get or create the counter dict for a user."""
    if user_id not in _notification_counters:
        _notification_counters[user_id] = {"daily": {}, "weekly": {}}
    return _notification_counters[user_id]


def _today_key() -> str:
    """Return today's date string for daily counter key."""
    return date.today().isoformat()


def _week_key() -> str:
    """Return this week's ISO week string for weekly counter key."""
    today = date.today()
    return f"{today.isocalendar()[0]}-W{today.isocalendar()[1]:02d}"


def _cleanup_old_entries(counter: dict[str, dict[str, int]]) -> None:
    """Remove entries older than 8 days (daily) or 2 weeks (weekly)."""
    today = date.today()

    # Clean daily entries older than 8 days
    cutoff_daily = (today - timedelta(days=8)).isoformat()
    old_daily = [k for k in counter["daily"] if k < cutoff_daily]
    for k in old_daily:
        del counter["daily"][k]

    # Clean weekly entries older than 2 weeks
    current_week = today.isocalendar()
    old_weekly = []
    for k in counter["weekly"]:
        try:
            parts = k.split("-W")
            year = int(parts[0])
            week = int(parts[1])
            # Simple comparison: if more than 2 weeks old
            if year < current_week[0] or (year == current_week[0] and week < current_week[1] - 2):
                old_weekly.append(k)
        except (ValueError, IndexError):
            old_weekly.append(k)
    for k in old_weekly:
        del counter["weekly"][k]


def should_send_notification(user_id: int, notification_type: str) -> bool:
    """
    Check if a notification should be sent based on daily/weekly limits.

    Args:
        user_id: The user ID.
        notification_type: One of NOTIFICATION_TYPES.

    Returns:
        True if the notification can be sent, False if rate-limited.
    """
    if notification_type not in NOTIFICATION_TYPES:
        logger.warning("Unknown notification type: %s", notification_type)
        return False

    counter = _get_user_counter(user_id)
    _cleanup_old_entries(counter)

    today = _today_key()
    week = _week_key()

    daily_count = counter["daily"].get(today, 0)
    weekly_count = counter["weekly"].get(week, 0)

    if daily_count >= MAX_PER_DAY:
        logger.debug(
            "Notification blocked for user %d: daily limit (%d/%d)",
            user_id, daily_count, MAX_PER_DAY,
        )
        return False

    if weekly_count >= MAX_PER_WEEK:
        logger.debug(
            "Notification blocked for user %d: weekly limit (%d/%d)",
            user_id, weekly_count, MAX_PER_WEEK,
        )
        return False

    return True


def record_notification_sent(user_id: int, notification_type: str) -> None:
    """Record that a notification was sent, incrementing counters."""
    counter = _get_user_counter(user_id)
    today = _today_key()
    week = _week_key()

    counter["daily"][today] = counter["daily"].get(today, 0) + 1
    counter["weekly"][week] = counter["weekly"].get(week, 0) + 1


def get_notification_counts(user_id: int) -> dict:
    """Return current daily and weekly notification counts for a user."""
    counter = _get_user_counter(user_id)
    today = _today_key()
    week = _week_key()

    return {
        "daily_count": counter["daily"].get(today, 0),
        "daily_limit": MAX_PER_DAY,
        "weekly_count": counter["weekly"].get(week, 0),
        "weekly_limit": MAX_PER_WEEK,
    }


# ---------------------------------------------------------------------------
# Quiet hours (Item 46)
# ---------------------------------------------------------------------------

def is_quiet_hours(user_timezone: Optional[str] = None) -> bool:
    """
    Check if current time is within quiet hours (22:00 - 07:00) in user's timezone.

    Args:
        user_timezone: IANA timezone string (e.g., "America/Santiago").
                      Falls back to UTC if None or invalid.

    Returns:
        True if current time is within quiet hours.
    """
    try:
        if user_timezone:
            from zoneinfo import ZoneInfo
            tz = ZoneInfo(user_timezone)
        else:
            from datetime import timezone
            tz = timezone.utc
    except (KeyError, ValueError, ImportError):
        from datetime import timezone
        tz = timezone.utc

    now = datetime.now(tz)
    hour = now.hour

    # Quiet hours: 22:00 - 07:00
    return hour >= 22 or hour < 7


def should_notify(
    user_id: int,
    notification_type: str,
    user_timezone: Optional[str] = None,
) -> bool:
    """
    Combined check: rate limits + quiet hours.

    Returns True only if all conditions are met:
    - Not in quiet hours
    - Within daily limit
    - Within weekly limit
    """
    if is_quiet_hours(user_timezone):
        logger.debug("Notification blocked for user %d: quiet hours", user_id)
        return False

    return should_send_notification(user_id, notification_type)
