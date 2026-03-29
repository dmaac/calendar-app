"""Apple and Google OAuth token verification."""
import logging
import httpx
import jwt as pyjwt
from typing import Optional
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select
from app.models.user import User
from app.core.security import get_password_hash
from app.core.config import settings

logger = logging.getLogger(__name__)

APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys"


async def verify_apple_token(identity_token: str) -> Optional[dict]:
    """Verify Apple identity token using Apple's public JWKS.

    Apple tokens are RS256 signed with keys published at appleid.apple.com/auth/keys.
    This function:
    1. Fetches Apple's public JWKS
    2. Extracts the kid (key ID) from the token header
    3. Finds the matching public key in JWKS
    4. Validates the signature and claims
    """
    if not settings.apple_client_id:
        logger.error("APPLE_CLIENT_ID not configured — Apple Sign In is disabled")
        return None

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(APPLE_KEYS_URL, timeout=10)
            if resp.status_code != 200:
                logger.warning("Failed to fetch Apple JWKS: HTTP %s", resp.status_code)
                return None
            jwks = resp.json()

        # Decode header to get kid (without verification, just to read the header)
        header = pyjwt.get_unverified_header(identity_token)
        kid = header.get("kid")

        if not kid:
            logger.warning("Apple token missing 'kid' in header")
            return None

        # Find the matching public key in Apple's JWKS
        key_data = next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)
        if not key_data:
            logger.warning("Apple JWKS does not contain key with kid=%s", kid)
            return None

        from jwt.algorithms import RSAAlgorithm
        public_key = RSAAlgorithm.from_jwk(key_data)

        # Verify signature and claims
        claims = pyjwt.decode(
            identity_token,
            public_key,
            algorithms=["RS256"],
            audience=settings.apple_client_id,
            issuer="https://appleid.apple.com",
            options={"verify_exp": True}
        )

        # Validate required claims
        if "sub" not in claims:
            logger.warning("Apple token missing 'sub' claim")
            return None

        return claims
    except pyjwt.ExpiredSignatureError:
        logger.warning("Apple token has expired")
        return None
    except pyjwt.InvalidAudienceError:
        logger.warning("Apple token audience does not match APPLE_CLIENT_ID=%s", settings.apple_client_id)
        return None
    except pyjwt.InvalidSignatureError:
        logger.warning("Apple token signature verification failed")
        return None
    except Exception as e:
        logger.warning("Apple token verification failed: %s", e)
        return None


async def verify_google_token(id_token: str, client_id: str) -> Optional[dict]:
    """Verify Google ID token locally using google-auth library.

    Performs local JWT signature verification against Google's cached JWKS,
    eliminating the token leak risk of the tokeninfo query-string approach.
    """
    # SEC: Reject early if client_id is not configured — prevents audience bypass
    if not client_id:
        logger.error("GOOGLE_CLIENT_ID not configured — Google Sign In is disabled")
        return None

    try:
        from google.oauth2 import id_token as google_id_token
        from google.auth.transport import requests as google_requests

        claims = google_id_token.verify_oauth2_token(
            id_token, google_requests.Request(), client_id
        )
        return claims
    except ValueError as e:
        logger.warning("Google token verification failed: %s", e)
        return None
    except Exception as e:
        logger.warning("Google token verification error: %s", e)
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
    # SEC: Use scalars().first() to get the User object, not a Row tuple
    result = await session.execute(
        select(User).where(User.provider == provider, User.provider_id == provider_id)
    )
    user = result.scalars().first()

    if not user:
        # Try by email (user may have registered via email first)
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalars().first()
        if user:
            # SEC: Do NOT overwrite the existing provider — this would allow an
            # attacker who controls a different OAuth provider to hijack an account.
            # Instead, log a warning and return the existing user as-is.
            logger.warning(
                "OAuth login: email=%s matched existing user (id=%s, provider=%s) "
                "but request came from provider=%s — returning existing user without "
                "changing provider/provider_id",
                email, user.id, user.provider, provider,
            )

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
