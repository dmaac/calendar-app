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

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["authentication"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

# ─── Rate limiting (applied per-endpoint below) ─────────────────────────────
try:
    from slowapi import Limiter
    from slowapi.util import get_remote_address
    _limiter = Limiter(key_func=get_remote_address)
    _rate_limit_enabled = True
except ImportError:
    _rate_limit_enabled = False

# Helper decorator: no-op when slowapi is not installed
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


@router.post("/register", response_model=UserRead)
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
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    user = await user_service.create_user(user_create)
    return user


@router.post("/login", response_model=Token)
@_rl("10/minute")  # SEC: Rate limit login to mitigate brute force
async def login_user(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: AsyncSession = Depends(get_session),
):
    from ..core.security import create_refresh_token, verify_refresh_token
    from ..core.token_store import save_refresh_token

    user_service = UserService(session)
    user = await user_service.authenticate_user(form_data.username, form_data.password)

    if not user:
        # SEC: Generic error message prevents user enumeration
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user_service.is_active(user):
        # SEC: Same generic message -- do not reveal that the account exists but is disabled
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

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


@router.post("/refresh")
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


@router.post("/logout")
async def logout(
    body: RefreshRequest,
):
    from ..core.security import verify_refresh_token
    from ..core.token_store import revoke_refresh_token

    payload = verify_refresh_token(body.refresh_token)
    if payload:
        try:
            await revoke_refresh_token(int(payload["sub"]), payload["jti"])
        except Exception:
            pass  # Redis unavailable — still return success
    return {"message": "Logged out successfully"}


@router.post("/apple")
@_rl("10/minute")
async def apple_login(
    request: Request,
    body: AppleAuthRequest,
    session: AsyncSession = Depends(get_session),
):
    from ..services.oauth_service import verify_apple_token, upsert_oauth_user
    from ..core.security import create_access_token, create_refresh_token, verify_refresh_token
    from ..core.token_store import save_refresh_token

    claims = await verify_apple_token(body.identity_token)
    if not claims:
        raise HTTPException(status_code=401, detail="Invalid Apple token")

    user = await upsert_oauth_user(
        session=session,
        provider="apple",
        provider_id=claims["sub"],
        email=claims.get("email", ""),
        first_name=body.first_name,
        last_name=body.last_name,
    )

    access_token = create_access_token({"sub": str(user.id)})
    refresh_token_str = create_refresh_token({"sub": str(user.id)})
    payload = verify_refresh_token(refresh_token_str)
    try:
        await save_refresh_token(user.id, payload["jti"], settings.refresh_token_expire_days)
    except Exception:
        logger.warning("Redis unavailable during Apple login for user_id=%s", user.id)

    return {"access_token": access_token, "refresh_token": refresh_token_str, "token_type": "bearer", "user_id": user.id}


@router.post("/google")
@_rl("10/minute")
async def google_login(
    request: Request,
    body: GoogleAuthRequest,
    session: AsyncSession = Depends(get_session),
):
    from ..services.oauth_service import verify_google_token, upsert_oauth_user
    from ..core.security import create_access_token, create_refresh_token, verify_refresh_token
    from ..core.token_store import save_refresh_token

    claims = await verify_google_token(body.id_token, settings.google_client_id)
    if not claims:
        raise HTTPException(status_code=401, detail="Invalid Google token")

    user = await upsert_oauth_user(
        session=session,
        provider="google",
        provider_id=claims.get("sub", claims.get("user_id", "")),
        email=claims.get("email", ""),
        first_name=claims.get("given_name"),
        last_name=claims.get("family_name"),
    )

    access_token = create_access_token({"sub": str(user.id)})
    refresh_token_str = create_refresh_token({"sub": str(user.id)})
    payload = verify_refresh_token(refresh_token_str)
    try:
        await save_refresh_token(user.id, payload["jti"], settings.refresh_token_expire_days)
    except Exception:
        logger.warning("Redis unavailable during Google login for user_id=%s", user.id)

    return {"access_token": access_token, "refresh_token": refresh_token_str, "token_type": "bearer", "user_id": user.id}


@router.get("/me", response_model=UserRead)
async def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user
