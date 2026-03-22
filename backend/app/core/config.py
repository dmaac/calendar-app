from pydantic_settings import BaseSettings
from pydantic import validator
from typing import Optional, List
import os


class Settings(BaseSettings):
    # TODO:SECURITY [Medium] Default DB URL contains dummy credentials. In production,
    # this is always overridden by .env, but consider removing the default entirely
    # and requiring DATABASE_URL to be set explicitly (like secret_key).
    database_url: str = "postgresql://user:password@localhost/calendar_db"
    secret_key: str = ""
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30

    # Server configuration
    server_host: str = "localhost"
    server_port: int = 8000

    # Async database URL (derived from database_url if empty)
    database_url_async: str = ""

    # Redis
    redis_url: str = "redis://localhost:6379/0"
    redis_max_connections: int = 50

    # Database pool tuning
    db_pool_size: int = 20
    db_max_overflow: int = 40
    db_pool_timeout: int = 30
    db_pool_recycle: int = 3600

    # Refresh token settings
    refresh_secret_key: str = ""
    refresh_token_expire_days: int = 30

    # Apple OAuth
    apple_client_id: str = ""
    apple_team_id: str = ""
    apple_key_id: str = ""
    apple_private_key: str = ""

    # Google OAuth
    google_client_id: str = ""

    # OpenAI (AI Food Scan)
    openai_api_key: str = ""

    # CORS — default to wildcard for local dev only.
    # In production set CORS_ORIGINS to a comma-separated list of allowed origins.
    cors_origins: List[str] = ["*"]

    # Allowed CORS methods and headers (restrict in production).
    cors_methods: List[str] = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    cors_headers: List[str] = [
        "Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With",
        "X-App-Version", "X-Platform",
    ]

    # Deployment environment — set ENV=production in prod to enforce stricter checks.
    env: str = "development"

    # Password policy
    password_min_length: int = 8

    @validator('secret_key', always=True)
    def secret_key_must_not_be_empty(cls, v, values):
        if not v or not v.strip():
            raise ValueError(
                "SECRET_KEY must be set. "
                "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
            )
        if len(v.strip()) < 32:
            raise ValueError(
                "SECRET_KEY must be at least 32 characters. "
                "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
            )
        return v

    @validator('refresh_secret_key', always=True)
    def refresh_secret_key_must_not_be_empty(cls, v, values):
        if not v or not v.strip():
            raise ValueError(
                "REFRESH_SECRET_KEY must be set. "
                "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
            )
        if len(v.strip()) < 32:
            raise ValueError(
                "REFRESH_SECRET_KEY must be at least 32 characters."
            )
        return v

    @validator('cors_origins', always=True)
    def cors_no_wildcard_in_production(cls, v, values):
        env = values.get('env', 'development')
        if env == 'production' and '*' in v:
            raise ValueError(
                "CORS_ORIGINS must not contain '*' in production. "
                "Set CORS_ORIGINS to a comma-separated list of allowed origins."
            )
        return v

    @validator('openai_api_key', always=True)
    def warn_openai_key_in_production(cls, v, values):
        env = values.get('env', 'development')
        if env == 'production' and not v:
            import warnings
            warnings.warn("OPENAI_API_KEY is not set — AI food scanning will be unavailable.")
        return v

    @validator('database_url_async', always=True, pre=True)
    def derive_async_url(cls, v, values):
        if not v and 'database_url' in values:
            db_url = str(values['database_url'])
            return (db_url
                    .replace('postgresql://', 'postgresql+asyncpg://', 1)
                    .replace('postgres://', 'postgresql+asyncpg://', 1)
                    .replace('sqlite://', 'sqlite+aiosqlite://', 1))
        return v

    @property
    def is_production(self) -> bool:
        return self.env == "production"

    class Config:
        env_file = ".env"


settings = Settings()
