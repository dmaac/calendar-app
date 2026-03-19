"""Redis cache wrapper for application data."""
import json
from typing import Any, Optional
from app.core.token_store import get_redis

CACHE_TTL = {
    "user_profile": 300,       # 5 min
    "onboarding": 600,         # 10 min
    "daily_summary": 120,      # 2 min
    "subscription": 900,       # 15 min
    "ai_scan": 86400 * 30,     # 30 days (immutable)
    "food_search": 3600,       # 1 hour
}


async def cache_get(key: str) -> Optional[Any]:
    r = get_redis()
    val = await r.get(key)
    if val:
        try:
            return json.loads(val)
        except Exception:
            return val
    return None


async def cache_set(key: str, value: Any, ttl: int = 300):
    r = get_redis()
    if isinstance(value, (dict, list)):
        value = json.dumps(value)
    await r.setex(key, ttl, value)


async def cache_delete(key: str):
    r = get_redis()
    await r.delete(key)


async def cache_delete_pattern(pattern: str):
    r = get_redis()
    keys = await r.keys(pattern)
    if keys:
        await r.delete(*keys)


def user_profile_key(user_id: int) -> str:
    return f"user:{user_id}:profile"


def onboarding_key(user_id: int) -> str:
    return f"user:{user_id}:onboarding"


def daily_summary_key(user_id: int, date: str) -> str:
    return f"user:{user_id}:daily:{date}"


def ai_scan_key(image_hash: str) -> str:
    return f"ai_scan:{image_hash}"


def subscription_key(user_id: int) -> str:
    return f"user:{user_id}:subscription"
