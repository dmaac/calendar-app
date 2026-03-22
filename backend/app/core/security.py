import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from .config import settings
import uuid as uuid_lib

logger = logging.getLogger(__name__)

# Use pbkdf2_sha256 instead of bcrypt for better compatibility
# TODO:SECURITY [Medium] Consider migrating to argon2 or bcrypt for stronger resistance
# against GPU-based attacks. Current pbkdf2 with 600k rounds is acceptable for now.
pwd_context = CryptContext(
    schemes=["pbkdf2_sha256"],
    deprecated="auto",
    pbkdf2_sha256__rounds=600_000,  # SEC: OWASP 2023 recommends >= 600k for PBKDF2-SHA256
)

# ─── Password policy ────────────────────────────────────────────────────────

_PASSWORD_MIN_LENGTH = 8
_PASSWORD_PATTERN = re.compile(
    r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$'
)


def validate_password_strength(password: str) -> None:
    """
    Enforce password policy. Raises ValueError with a user-facing message
    if the password does not meet requirements.

    Requirements:
    - At least 8 characters
    - At least one uppercase letter
    - At least one lowercase letter
    - At least one digit
    # TODO:SECURITY [Low] Consider adding special character requirement or
    # checking against breached password lists (e.g., HaveIBeenPwned API)
    """
    min_len = getattr(settings, 'password_min_length', _PASSWORD_MIN_LENGTH)
    if len(password) < min_len:
        raise ValueError(f"Password must be at least {min_len} characters long.")
    if not _PASSWORD_PATTERN.match(password):
        raise ValueError(
            "Password must contain at least one uppercase letter, "
            "one lowercase letter, and one digit."
        )


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


# ─── Access tokens ──────────────────────────────────────────────────────────

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode.update({
        "exp": expire,
        "type": "access",  # SEC: distinguish access from refresh tokens
        "jti": str(uuid_lib.uuid4()),  # SEC: unique ID for token blacklisting
    })
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    return encoded_jwt


def verify_token(token: str):
    """Verify an access token. Returns the 'sub' claim or None.

    SEC: Also checks the token blacklist in Redis (best-effort).
    If Redis is unavailable, the token is allowed through to avoid
    a hard dependency on Redis for every authenticated request.
    """
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        # SEC: Reject refresh tokens presented as access tokens
        if payload.get("type") != "access":
            return None
        username: str = payload.get("sub")
        if username is None:
            return None

        # SEC: Check if this access token has been blacklisted (e.g., after logout/password change)
        jti = payload.get("jti")
        if jti:
            try:
                from .token_store import is_access_token_blacklisted
                import asyncio
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    # We're inside an async context — cannot use run_until_complete.
                    # The async check will be handled by the caller (get_current_user).
                    pass
                else:
                    if loop.run_until_complete(is_access_token_blacklisted(jti)):
                        return None
            except Exception:
                # SEC: Redis unavailable — degrade gracefully, allow the request
                logger.debug("Token blacklist check skipped — Redis unavailable")

        return username
    except JWTError:
        return None


# ─── Refresh tokens ─────────────────────────────────────────────────────────

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
