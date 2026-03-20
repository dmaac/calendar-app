"""Apple and Google OAuth token verification."""
import httpx
import jwt as pyjwt
from typing import Optional
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select
from app.models.user import User
from app.core.security import get_password_hash
from app.core.config import settings

APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys"


async def verify_apple_token(identity_token: str) -> Optional[dict]:
    """Verify Apple identity token using Apple's public JWKS."""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(APPLE_KEYS_URL)
            jwks = resp.json()

        # Decode header to get kid
        header = pyjwt.get_unverified_header(identity_token)
        key_data = next((k for k in jwks["keys"] if k["kid"] == header["kid"]), None)
        if not key_data:
            return None

        from jwt.algorithms import RSAAlgorithm
        public_key = RSAAlgorithm.from_jwk(key_data)

        claims = pyjwt.decode(
            identity_token,
            public_key,
            algorithms=["RS256"],
            audience=settings.apple_client_id,
            options={"verify_exp": True}
        )
        return claims
    except Exception as e:
        print(f"Apple token verification failed: {e}")
        return None


async def verify_google_token(id_token: str, client_id: str) -> Optional[dict]:
    """Verify Google ID token."""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"https://oauth2.googleapis.com/tokeninfo?id_token={id_token}"
            )
            if resp.status_code != 200:
                return None
            claims = resp.json()
            if claims.get("aud") != client_id and client_id:
                return None
            return claims
    except Exception:
        return None


async def upsert_oauth_user(
    session: AsyncSession,
    provider: str,
    provider_id: str,
    email: str,
    first_name: Optional[str] = None,
    last_name: Optional[str] = None,
) -> User:
    """Find existing user by provider+provider_id, or create new one."""
    # Try by provider identity first
    result = await session.exec(
        select(User).where(User.provider == provider, User.provider_id == provider_id)
    )
    user = result.first()

    if not user:
        # Try by email (user may have registered via email first)
        result = await session.exec(select(User).where(User.email == email))
        user = result.first()
        if user:
            user.provider = provider
            user.provider_id = provider_id

    if not user:
        # Create new user
        name = f"{first_name or ''} {last_name or ''}".strip() or email.split("@")[0]
        user = User(
            email=email,
            first_name=first_name or '',
            last_name=last_name or '',
            hashed_password=None,
            provider=provider,
            provider_id=provider_id,
            is_active=True,
            is_premium=False,
        )
        session.add(user)

    await session.commit()
    await session.refresh(user)
    return user
