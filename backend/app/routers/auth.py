import logging
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlmodel.ext.asyncio.session import AsyncSession
from ..core.database import get_session
from ..core.config import settings
from ..core.security import create_access_token, verify_token, validate_password_strength
from ..models.user import User, UserCreate, UserRead
from ..services.user_service import UserService
from ..schemas.auth import Token, RefreshRequest, AppleAuthRequest, GoogleAuthRequest
from ..schemas.api_responses import AuthTokenResponse, LogoutResponse, AccountDeletedResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["authentication"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

# ─── Rate limiting (applied per-endpoint below) ─────────────────────────────
import os as _os
_is_testing = _os.getenv("ENV", "").lower() in ("test", "testing")
try:
    from slowapi import Limiter
    from slowapi.util import get_remote_address
    # SEC: Use in-memory storage as default so rate limiting works even when
    # Redis is unavailable. slowapi defaults to in-memory when no storage
    # backend is configured, which is the correct fail-closed behavior.
    _limiter = Limiter(
        key_func=get_remote_address,
        storage_uri="memory://",
    )
    _rate_limit_enabled = not _is_testing
except ImportError:
    _rate_limit_enabled = False

# Helper decorator: no-op when slowapi is not installed or in test/dev mode
_rl = lambda limit_str: (_limiter.limit(limit_str) if _rate_limit_enabled else lambda f: f)


async def get_current_user(
    token: str = Depends(oauth2_scheme), session: AsyncSession = Depends(get_session)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    username = verify_token(token)
    if username is None:
        raise credentials_exception

    # SEC: Async blacklist check — verify access token JTI is not revoked
    # FAIL-CLOSED: if blacklist check fails (e.g. Redis down), deny access.
    # The token_store.is_access_token_blacklisted already returns True on
    # Redis errors, but we also guard against JWT decode or import failures.
    try:
        from jose import jwt
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        jti = payload.get("jti")
        if jti:
            from ..core.token_store import is_access_token_blacklisted
            if await is_access_token_blacklisted(jti):
                raise credentials_exception
    except HTTPException:
        raise
    except Exception:
        logger.warning("Blacklist check failed — denying access (fail-closed)")
        raise credentials_exception

    user_service = UserService(session)
    # sub is always the numeric user.id (since unified login)
    user = None
    try:
        user_id = int(username)
        user = await user_service.get_user_by_id(user_id)
    except (ValueError, TypeError):
        # Fallback: old tokens may use email as sub
        user = await user_service.get_user_by_email(username)
    if user is None:
        raise credentials_exception

    # SEC: Reject deactivated users even if token is still valid
    if not user.is_active:
        raise credentials_exception

    return user


@router.post(
    "/register",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user account",
    description=(
        "Create a new user account with email and password. "
        "Password must meet strength requirements (min 8 chars, mixed case, digit). "
        "Rate limited to 5 requests per minute per IP."
    ),
    responses={
        201: {"description": "User created successfully"},
        409: {"description": "Email already in use"},
        422: {"description": "Validation error (weak password or invalid input)"},
    },
)
@_rl("5/minute")  # SEC: Rate limit registration to prevent enumeration/spam
async def register_user(
    request: Request,
    user_create: UserCreate,
    session: AsyncSession = Depends(get_session),
):
    # SEC: Validate password strength before hashing
    try:
        validate_password_strength(user_create.password)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        )

    user_service = UserService(session)

    # Check if user already exists
    if await user_service.get_user_by_email(user_create.email):
        # SEC: Generic message prevents user enumeration — do not reveal
        # whether the email is already registered.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Unable to create account. Please try again or use a different email.",
        )

    try:
        user = await user_service.create_user(user_create)
    except HTTPException:
        raise
    except Exception:
        logger.exception("User registration failed for email=%s", user_create.email)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Registration failed. Please try again later.",
        )
    return user


def _get_client_ip(request: Request) -> str:
    """Extract real client IP, only trusting X-Forwarded-For from known proxies."""
    from ..core.ip_utils import get_client_ip
    return get_client_ip(request)


@router.post(
    "/login",
    response_model=AuthTokenResponse,
    summary="Authenticate with email and password",
    description=(
        "Authenticate using OAuth2 password flow. Returns access and refresh tokens. "
        "After 5 failed attempts the account is locked for 15 minutes. "
        "Rate limited to 5 requests per minute per IP."
    ),
    responses={
        200: {"description": "Login successful, tokens returned"},
        401: {"description": "Invalid credentials"},
        429: {"description": "Account locked due to too many failed attempts"},
    },
)
@_rl("5/minute")  # SEC: Rate limit login to mitigate brute force (matches register)
async def login_user(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: AsyncSession = Depends(get_session),
):
    from ..core.security import create_refresh_token, verify_refresh_token
    from ..core.token_store import save_refresh_token, is_login_locked, record_failed_login, clear_failed_logins

    client_ip = _get_client_ip(request)
    email = form_data.username

    # SEC: Check login lockout BEFORE attempting authentication
    try:
        if await is_login_locked(email):
            logger.warning(
                "Login attempt on locked account email=%s ip=%s",
                email, client_ip,
            )
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many failed login attempts. Please try again in 15 minutes.",
            )
    except HTTPException:
        raise
    except Exception:
        pass  # SEC: Redis unavailable — allow login attempt, degrade gracefully

    user_service = UserService(session)
    user = await user_service.authenticate_user(email, form_data.password)

    if not user:
        # SEC: Log failed attempt with IP for security monitoring
        logger.warning("Failed login attempt email=%s ip=%s", email, client_ip)
        try:
            fail_count = await record_failed_login(email)
            if fail_count >= 5:
                logger.warning(
                    "Account locked after %d failed attempts email=%s ip=%s",
                    fail_count, email, client_ip,
                )
        except Exception:
            pass  # Redis unavailable

        # SEC: Generic error message prevents user enumeration
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user_service.is_active(user):
        # SEC: Same generic message -- do not reveal that the account exists but is disabled
        logger.warning("Login attempt on deactivated account user_id=%s ip=%s", user.id, client_ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # SEC: Clear failed login counter on successful authentication
    try:
        await clear_failed_logins(email)
    except Exception:
        pass  # Redis unavailable

    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    # Use user.id as sub (consistent with OAuth flow + refresh token)
    access_token = create_access_token(
        data={"sub": str(user.id)}, expires_delta=access_token_expires
    )

    refresh_token_str = create_refresh_token({"sub": str(user.id)})
    payload = verify_refresh_token(refresh_token_str)
    try:
        await save_refresh_token(user.id, payload["jti"], settings.refresh_token_expire_days)
    except Exception:
        logger.warning("Redis unavailable during login for user_id=%s", user.id)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token_str,
        "token_type": "bearer",
        "user_id": user.id,
    }


@router.post(
    "/refresh",
    response_model=AuthTokenResponse,
    summary="Refresh access token",
    description=(
        "Exchange a valid refresh token for a new access/refresh token pair. "
        "Implements rolling refresh: the old refresh token is revoked. "
        "Reuse of a revoked refresh token triggers revocation of ALL user tokens "
        "(token theft detection). Rate limited to 20 requests per minute per IP."
    ),
    responses={
        200: {"description": "New token pair issued"},
        401: {"description": "Invalid or revoked refresh token"},
    },
)
@_rl("20/minute")  # SEC: Rate limit refresh to prevent token stuffing
async def refresh_token(
    request: Request,
    body: RefreshRequest,
    session: AsyncSession = Depends(get_session),
):
    from ..core.security import verify_refresh_token, create_access_token, create_refresh_token
    from ..core.token_store import is_refresh_token_valid, save_refresh_token, revoke_refresh_token

    payload = verify_refresh_token(body.refresh_token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user_id = int(payload["sub"])
    jti = payload["jti"]

    if not await is_refresh_token_valid(user_id, jti):
        # SEC: If a revoked refresh token is reused, revoke ALL tokens for this user
        # (potential token theft detection)
        from ..core.token_store import revoke_all_user_tokens
        await revoke_all_user_tokens(user_id)
        logger.warning(
            "Revoked refresh token reuse detected for user_id=%s jti=%s — all tokens revoked",
            user_id, jti,
        )
        raise HTTPException(status_code=401, detail="Refresh token revoked")

    # Rolling refresh: revoke old, issue new pair
    await revoke_refresh_token(user_id, jti)

    access_token = create_access_token({"sub": str(user_id)})
    new_refresh = create_refresh_token({"sub": str(user_id)})
    new_payload = verify_refresh_token(new_refresh)
    await save_refresh_token(user_id, new_payload["jti"], settings.refresh_token_expire_days)

    return {"access_token": access_token, "refresh_token": new_refresh, "token_type": "bearer"}


@router.post(
    "/logout",
    response_model=LogoutResponse,
    summary="Log out and revoke tokens",
    description=(
        "Invalidate both the current access token and the provided refresh token. "
        "The access token is blacklisted so it cannot be reused. "
        "Best-effort: returns success even if Redis is temporarily unavailable."
    ),
    responses={
        200: {"description": "Logout successful"},
    },
)
async def logout(
    body: RefreshRequest,
    token: str = Depends(oauth2_scheme),
):
    from ..core.security import verify_refresh_token
    from ..core.token_store import revoke_refresh_token, blacklist_access_token

    # SEC: Blacklist the access token so it cannot be reused after logout
    try:
        from jose import jwt as jose_jwt
        access_payload = jose_jwt.decode(
            token, settings.secret_key, algorithms=[settings.algorithm]
        )
        access_jti = access_payload.get("jti")
        if access_jti:
            ttl = settings.access_token_expire_minutes * 60
            await blacklist_access_token(access_jti, ttl_seconds=ttl)
    except Exception:
        pass  # SEC: Best-effort — token may already be expired or Redis unavailable

    payload = verify_refresh_token(body.refresh_token)
    if payload:
        try:
            await revoke_refresh_token(int(payload["sub"]), payload["jti"])
        except Exception:
            pass  # Redis unavailable — still return success
    return {"message": "Logged out successfully"}


@router.post(
    "/apple",
    response_model=AuthTokenResponse,
    summary="Sign in with Apple",
    description=(
        "Authenticate or register using an Apple identity token (Sign in with Apple). "
        "Creates the user account on first login. Rate limited to 10 requests per minute per IP."
    ),
    responses={
        200: {"description": "Authentication successful, tokens returned"},
        401: {"description": "Invalid Apple identity token"},
    },
)
@_rl("10/minute")
async def apple_login(
    request: Request,
    body: AppleAuthRequest,
    session: AsyncSession = Depends(get_session),
):
    from ..services.oauth_service import verify_apple_token, upsert_oauth_user
    from ..core.security import create_access_token, create_refresh_token, verify_refresh_token
    from ..core.token_store import save_refresh_token

    try:
        claims = await verify_apple_token(body.identity_token)
    except Exception:
        logger.exception("Apple token verification error")
        raise HTTPException(status_code=401, detail="Apple authentication failed")
    if not claims:
        raise HTTPException(status_code=401, detail="Invalid Apple token")

    try:
        user = await upsert_oauth_user(
            session=session,
            provider="apple",
            provider_id=claims["sub"],
            email=claims.get("email", ""),
            first_name=body.first_name,
            last_name=body.last_name,
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Apple OAuth user upsert failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication failed. Please try again later.",
        )

    access_token = create_access_token({"sub": str(user.id)})
    refresh_token_str = create_refresh_token({"sub": str(user.id)})
    payload = verify_refresh_token(refresh_token_str)
    try:
        await save_refresh_token(user.id, payload["jti"], settings.refresh_token_expire_days)
    except Exception:
        logger.warning("Redis unavailable during Apple login for user_id=%s", user.id)

    return {"access_token": access_token, "refresh_token": refresh_token_str, "token_type": "bearer", "user_id": user.id}


@router.post(
    "/google",
    response_model=AuthTokenResponse,
    summary="Sign in with Google",
    description=(
        "Authenticate or register using a Google ID token (Google Sign-In). "
        "Creates the user account on first login. Rate limited to 10 requests per minute per IP."
    ),
    responses={
        200: {"description": "Authentication successful, tokens returned"},
        401: {"description": "Invalid Google ID token"},
    },
)
@_rl("10/minute")
async def google_login(
    request: Request,
    body: GoogleAuthRequest,
    session: AsyncSession = Depends(get_session),
):
    from ..services.oauth_service import verify_google_token, upsert_oauth_user
    from ..core.security import create_access_token, create_refresh_token, verify_refresh_token
    from ..core.token_store import save_refresh_token

    try:
        claims = await verify_google_token(body.id_token, settings.google_client_id)
    except Exception:
        logger.exception("Google token verification error")
        raise HTTPException(status_code=401, detail="Google authentication failed")
    if not claims:
        raise HTTPException(status_code=401, detail="Invalid Google token")

    try:
        user = await upsert_oauth_user(
            session=session,
            provider="google",
            provider_id=claims.get("sub", claims.get("user_id", "")),
            email=claims.get("email", ""),
            first_name=claims.get("given_name"),
            last_name=claims.get("family_name"),
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Google OAuth user upsert failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication failed. Please try again later.",
        )

    access_token = create_access_token({"sub": str(user.id)})
    refresh_token_str = create_refresh_token({"sub": str(user.id)})
    payload = verify_refresh_token(refresh_token_str)
    try:
        await save_refresh_token(user.id, payload["jti"], settings.refresh_token_expire_days)
    except Exception:
        logger.warning("Redis unavailable during Google login for user_id=%s", user.id)

    return {"access_token": access_token, "refresh_token": refresh_token_str, "token_type": "bearer", "user_id": user.id}


@router.get(
    "/me",
    response_model=UserRead,
    summary="Get current user profile",
    description="Return the profile of the currently authenticated user.",
    responses={
        200: {"description": "User profile"},
        401: {"description": "Not authenticated or token expired"},
    },
)
async def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.delete(
    "/me",
    response_model=AccountDeletedResponse,
    status_code=status.HTTP_200_OK,
    summary="Delete own account (GDPR Art. 17)",
    description=(
        "Soft-delete the authenticated user's account. Deactivates the account, "
        "scrubs PII (email, name, password, provider ID), and marks the record as deleted. "
        "Actual data purge happens via a background job within 30 days."
    ),
    responses={
        200: {"description": "Account deactivated and PII scrubbed"},
        500: {"description": "Deletion failed"},
    },
)
async def delete_account(
    current_user: User = Depends(get_current_user),
    token: str = Depends(oauth2_scheme),
    session: AsyncSession = Depends(get_session),
):
    """
    GDPR Article 17 -- Right to erasure.
    Deactivates account, scrubs PII, and revokes all tokens.
    Actual data purge can be done via a background job within 30 days
    (legal retention period).
    """
    try:
        current_user.is_active = False
        current_user.email = f"deleted_{current_user.id}@removed.fitsiai.com"
        current_user.first_name = None
        current_user.last_name = None
        current_user.hashed_password = None
        current_user.provider_id = None
        session.add(current_user)
        await session.commit()
    except Exception:
        await session.rollback()
        logger.exception("Account deletion failed for user_id=%s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Account deletion failed. Please try again later.",
        )

    # SEC: Revoke all tokens so no existing JWT can access the deleted account
    try:
        from ..core.token_store import revoke_all_user_tokens, blacklist_access_token
        await revoke_all_user_tokens(current_user.id)
        # Also blacklist the current access token for its remaining lifetime
        from jose import jwt as jose_jwt
        try:
            access_payload = jose_jwt.decode(
                token, settings.secret_key, algorithms=[settings.algorithm]
            )
            access_jti = access_payload.get("jti")
            if access_jti:
                ttl = settings.access_token_expire_minutes * 60
                await blacklist_access_token(access_jti, ttl_seconds=ttl)
        except Exception:
            pass  # Token may already be expired
    except Exception:
        logger.warning("Could not revoke tokens for deleted user_id=%s (Redis unavailable)", current_user.id)

    logger.info("Account %s deleted (soft) per user request", current_user.id)
    return {"detail": "Account deleted successfully"}
