from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlmodel.ext.asyncio.session import AsyncSession
from ..core.database import get_session
from ..core.config import settings
from ..core.security import create_access_token, verify_token
from ..models.user import User, UserCreate, UserRead
from ..services.user_service import UserService
from ..schemas.auth import Token, RefreshRequest, AppleAuthRequest, GoogleAuthRequest

router = APIRouter(prefix="/auth", tags=["authentication"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")


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

    return user


@router.post("/register", response_model=UserRead)
async def register_user(
    user_create: UserCreate, session: AsyncSession = Depends(get_session)
):
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
async def login_user(
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: AsyncSession = Depends(get_session)
):
    from ..core.security import create_refresh_token, verify_refresh_token
    from ..core.token_store import save_refresh_token

    user_service = UserService(session)
    user = await user_service.authenticate_user(form_data.username, form_data.password)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user_service.is_active(user):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
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
        pass  # Redis unavailable — degrade gracefully

    return {
        "access_token": access_token,
        "refresh_token": refresh_token_str,
        "token_type": "bearer",
        "user_id": user.id,
    }


@router.post("/refresh")
async def refresh_token(
    request: RefreshRequest,
    session: AsyncSession = Depends(get_session),
):
    from ..core.security import verify_refresh_token, create_access_token, create_refresh_token
    from ..core.token_store import is_refresh_token_valid, save_refresh_token, revoke_refresh_token

    payload = verify_refresh_token(request.refresh_token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user_id = int(payload["sub"])
    jti = payload["jti"]

    if not await is_refresh_token_valid(user_id, jti):
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
    request: RefreshRequest,
):
    from ..core.security import verify_refresh_token
    from ..core.token_store import revoke_refresh_token

    payload = verify_refresh_token(request.refresh_token)
    if payload:
        try:
            await revoke_refresh_token(int(payload["sub"]), payload["jti"])
        except Exception:
            pass  # Redis unavailable — still return success
    return {"message": "Logged out successfully"}


@router.post("/apple")
async def apple_login(
    request: AppleAuthRequest,
    session: AsyncSession = Depends(get_session),
):
    from ..services.oauth_service import verify_apple_token, upsert_oauth_user
    from ..core.security import create_access_token, create_refresh_token, verify_refresh_token
    from ..core.token_store import save_refresh_token

    claims = await verify_apple_token(request.identity_token)
    if not claims:
        raise HTTPException(status_code=401, detail="Invalid Apple token")

    user = await upsert_oauth_user(
        session=session,
        provider="apple",
        provider_id=claims["sub"],
        email=claims.get("email", ""),
        first_name=request.first_name,
        last_name=request.last_name,
    )

    access_token = create_access_token({"sub": str(user.id)})
    refresh_token_str = create_refresh_token({"sub": str(user.id)})
    payload = verify_refresh_token(refresh_token_str)
    try:
        await save_refresh_token(user.id, payload["jti"], settings.refresh_token_expire_days)
    except Exception:
        pass

    return {"access_token": access_token, "refresh_token": refresh_token_str, "token_type": "bearer", "user_id": user.id}


@router.post("/google")
async def google_login(
    request: GoogleAuthRequest,
    session: AsyncSession = Depends(get_session),
):
    from ..services.oauth_service import verify_google_token, upsert_oauth_user
    from ..core.security import create_access_token, create_refresh_token, verify_refresh_token
    from ..core.token_store import save_refresh_token

    claims = await verify_google_token(request.id_token, settings.google_client_id)
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
        pass

    return {"access_token": access_token, "refresh_token": refresh_token_str, "token_type": "bearer", "user_id": user.id}


@router.get("/me", response_model=UserRead)
async def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user
