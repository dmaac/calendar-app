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
        logger.warning("Apple token verification failed: %s", e)
        return None


async def verify_google_token(id_token: str, client_id: str) -> Optional[dict]:
    """Verify Google ID token.

    TODO:SECURITY [Medium] Replace tokeninfo endpoint with google-auth library's
    id_token.verify_oauth2_token() for production-grade verification. The tokeninfo
    endpoint is intended for debugging, not production use. It also sends the token
    over query string which may be logged by intermediaries.

    RISKS of the current approach:
    1. The token is sent as a query parameter to googleapis.com. Intermediary proxies,
       CDNs, or access logs may capture the full URL, leaking the token.
    2. The tokeninfo endpoint does not perform full signature verification locally;
       it delegates to Google's server, adding a network round-trip and a dependency
       on Google's availability for every login.
    3. Google's documentation marks tokeninfo as a debugging tool, not a production
       verification mechanism.

    MIGRATION PATH:
    1. Install the google-auth library: `pip install google-auth`
    2. Replace this function body with:
       ```
       from google.oauth2 import id_token as google_id_token
       from google.auth.transport import requests as google_requests
       claims = google_id_token.verify_oauth2_token(
           id_token, google_requests.Request(), client_id
       )
       return claims
       ```
    3. This performs local JWT signature verification using Google's cached public
       keys (JWKS), eliminating the query-string token leak and the network
       dependency on the tokeninfo endpoint.
    4. Add google-auth to requirements.txt and test with both iOS and Android
       Google Sign-In flows before deploying.
    """
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
