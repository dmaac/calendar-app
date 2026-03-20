from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from .config import settings
import uuid as uuid_lib

# Use pbkdf2_sha256 instead of bcrypt for better compatibility
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    return encoded_jwt


def verify_token(token: str):
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        username: str = payload.get("sub")
        if username is None:
            return None
        return username
    except JWTError:
        return None


def create_refresh_token(data: dict) -> str:
    """Creates a long-lived refresh token with a unique jti claim."""
    to_encode = data.copy()
    jti = str(uuid_lib.uuid4())
    expire = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    to_encode.update({"exp": expire, "jti": jti, "type": "refresh"})
    return jwt.encode(to_encode, settings.refresh_secret_key, algorithm=settings.algorithm)


def verify_refresh_token(token: str) -> Optional[dict]:
    """Verifies and decodes a refresh token. Returns claims dict or None."""
    try:
        payload = jwt.decode(token, settings.refresh_secret_key, algorithms=[settings.algorithm])
        if payload.get("type") != "refresh":
            return None
        return payload
    except JWTError:
        return None
