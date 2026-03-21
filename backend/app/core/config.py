from pydantic_settings import BaseSettings
from pydantic import validator
from typing import Optional, List


class Settings(BaseSettings):
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
    db_pool_recycle: int = 1800

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

    # CORS
    cors_origins: List[str] = [
        "http://localhost:8081",
        "http://localhost:8082",
        "http://localhost:8083",
        "http://localhost:19006",
        "http://localhost:3000",
    ]

    @validator('database_url_async', always=True, pre=True)
    def derive_async_url(cls, v, values):
        if not v and 'database_url' in values:
            db_url = str(values['database_url'])
            return (db_url
                    .replace('postgresql://', 'postgresql+asyncpg://', 1)
                    .replace('postgres://', 'postgresql+asyncpg://', 1)
                    .replace('sqlite://', 'sqlite+aiosqlite://', 1))
        return v

    class Config:
        env_file = ".env"


settings = Settings()
