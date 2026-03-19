"""Redis-backed refresh token store for revocation."""
import redis.asyncio as redis
from app.core.config import settings

_redis_pool: redis.Redis | None = None


def get_redis() -> redis.Redis:
    global _redis_pool
    if _redis_pool is None:
        _redis_pool = redis.from_url(settings.redis_url, decode_responses=True)
    return _redis_pool


async def save_refresh_token(user_id: int, jti: str, ttl_days: int = 30):
    r = get_redis()
    key = f"refresh:{user_id}:{jti}"
    await r.setex(key, ttl_days * 86400, "1")


async def is_refresh_token_valid(user_id: int, jti: str) -> bool:
    r = get_redis()
    key = f"refresh:{user_id}:{jti}"
    return bool(await r.exists(key))


async def revoke_refresh_token(user_id: int, jti: str):
    r = get_redis()
    key = f"refresh:{user_id}:{jti}"
    await r.delete(key)


async def revoke_all_user_tokens(user_id: int):
    r = get_redis()
    pattern = f"refresh:{user_id}:*"
    keys = await r.keys(pattern)
    if keys:
        await r.delete(*keys)
