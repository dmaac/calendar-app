from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    database_url: str = "postgresql://user:password@localhost/calendar_db"
    secret_key: str = "your-secret-key-here"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30

    # Server configuration
    server_host: str = "localhost"
    server_port: int = 8000

    class Config:
        env_file = ".env"


settings = Settings()