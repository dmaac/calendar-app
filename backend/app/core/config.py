from pydantic_settings import BaseSettings
from pydantic import validator
from typing import Optional, List


class Settings(BaseSettings):
    database_url: str = "postgresql://user:password@localhost/calendar_db"
    secret_key: str = "your-secret-key-here"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30

    # Server configuration
    server_host: str = "localhost"
    server_port: int = 8000

    # Async database URL (derived from database_url if empty)
    database_url_async: str = ""

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Refresh token settings
    refresh_secret_key: str = "refresh-secret-change-in-production"
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
    cors_origins: List[str] = ["*"]

    @validator('database_url_async', always=True, pre=True)
    def derive_async_url(cls, v, values):
        if not v and 'database_url' in values:
            db_url = str(values['database_url'])
            return db_url.replace('postgresql://', 'postgresql+asyncpg://', 1).replace('postgres://', 'postgresql+asyncpg://', 1)
        return v

    class Config:
        env_file = ".env"


settings = Settings()
