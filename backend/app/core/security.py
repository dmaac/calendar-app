import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from .config import settings
import uuid as uuid_lib

logger = logging.getLogger(__name__)

# SEC: bcrypt with work factor 12 — GPU-resistant, OWASP recommended.
# Passlib auto-verifies old pbkdf2_sha256 hashes and re-hashes on next login.
pwd_context = CryptContext(
    schemes=["bcrypt", "pbkdf2_sha256"],
    default="bcrypt",
    deprecated=["pbkdf2_sha256"],
    bcrypt__rounds=12,  # SEC: OWASP 2023 recommends bcrypt cost >= 10; 12 balances security/latency
    pbkdf2_sha256__rounds=600_000,  # SEC: Legacy compat — still verifies old hashes
)

# ─── Password policy ────────────────────────────────────────────────────────

_PASSWORD_MIN_LENGTH = 8
_PASSWORD_MAX_LENGTH = 128  # SEC: Prevent bcrypt 72-byte silent truncation + DoS via huge payloads
_PASSWORD_PATTERN = re.compile(
    r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};\':"\\|,.<>\/?`~]).+$'
)


def validate_password_strength(password: str) -> None:
    """
    Enforce password policy. Raises ValueError with a user-facing message
    if the password does not meet requirements.

    Requirements:
    - Between 8 and 128 characters
    - At least one uppercase letter
    - At least one lowercase letter
    - At least one digit
    - At least one special character
    """
    min_len = getattr(settings, 'password_min_length', _PASSWORD_MIN_LENGTH)
    if len(password) < min_len:
        raise ValueError(f"Password must be at least {min_len} characters long.")
    if len(password) > _PASSWORD_MAX_LENGTH:
        raise ValueError(f"Password must not exceed {_PASSWORD_MAX_LENGTH} characters.")
    if not _PASSWORD_PATTERN.match(password):
        raise ValueError(
            "Password must contain at least one uppercase letter, "
            "one lowercase letter, one digit, and one special character."
        )


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def needs_rehash(hashed_password: str) -> bool:
    """Check if a password hash uses a deprecated scheme and should be re-hashed.

    When migrating from pbkdf2_sha256 to bcrypt, this returns True for any
    hash still using the old algorithm. The caller should re-hash and persist
    the new hash on successful login.
    """
    return pwd_context.needs_update(hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


# ─── Access tokens ──────────────────────────────────────────────────────────

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({
        "exp": expire,
        "type": "access",  # SEC: distinguish access from refresh tokens
        "jti": str(uuid_lib.uuid4()),  # SEC: unique ID for token blacklisting
    })
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    return encoded_jwt


def verify_token(token: str):
    """Verify an access token. Returns the 'sub' claim or None.

    This performs stateless JWT validation only (signature, expiry, type claim).
    The async blacklist check (Redis) is handled by get_current_user() in the
    auth router -- it cannot be done here because this is a sync function called
    inside an already-running event loop.
    """
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        # SEC: Reject refresh tokens presented as access tokens
        if payload.get("type") != "access":
            return None
        username: str = payload.get("sub")
        if username is None:
            return None
        return username
    except JWTError:
        return None


# ─── Refresh tokens ─────────────────────────────────────────────────────────

def create_refresh_token(data: dict) -> str:
    """Creates a long-lived refresh token with a unique jti claim."""
    to_encode = data.copy()
    jti = str(uuid_lib.uuid4())
    expire = datetime.utcnow() + timedelta(days=settings.refresh_token_expire_days)
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
