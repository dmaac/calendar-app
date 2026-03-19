"""Redis-backed refresh token store for revocation."""
import redis.asyncio as redis
from redis.asyncio import ConnectionPool
from app.core.config import settings

_pool: ConnectionPool | None = None


def get_redis() -> redis.Redis:
    """Return a Redis client backed by a shared connection pool."""
    global _pool
    if _pool is None:
        _pool = ConnectionPool.from_url(
            settings.redis_url,
            decode_responses=True,
            max_connections=settings.redis_max_connections,
        )
    return redis.Redis(connection_pool=_pool)


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
    """Revoke all refresh tokens for a user using SCAN (safe for large Redis)."""
    r = get_redis()
    pattern = f"refresh:{user_id}:*"
    cursor = 0
    keys_to_delete: list[str] = []
    while True:
        cursor, keys = await r.scan(cursor=cursor, match=pattern, count=100)
        keys_to_delete.extend(keys)
        if cursor == 0:
            break
    if keys_to_delete:
        await r.delete(*keys_to_delete)
