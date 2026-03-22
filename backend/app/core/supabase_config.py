"""
Supabase configuration for Fitsia IA.
Replace local PostgreSQL with Supabase hosted PostgreSQL.

To configure:
1. Create project at https://supabase.com
2. Go to Settings > Database > Connection string
3. Copy the URI and set in .env:
   DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
   SUPABASE_URL=https://[ref].supabase.co
   SUPABASE_ANON_KEY=eyJ...
   SUPABASE_SERVICE_KEY=eyJ...
"""

from .config import settings


def get_supabase_headers(use_service_key: bool = False) -> dict:
    """Return authorization headers for Supabase REST/Storage API calls."""
    key = settings.supabase_service_key if use_service_key else settings.supabase_anon_key
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
    }


def get_storage_url(bucket: str, filename: str) -> str:
    """Build the Supabase Storage object URL."""
    base = settings.supabase_url.rstrip("/")
    return f"{base}/storage/v1/object/{bucket}/{filename}"


def get_public_url(bucket: str, filename: str) -> str:
    """Build the public URL for a stored object."""
    base = settings.supabase_url.rstrip("/")
    return f"{base}/storage/v1/object/public/{bucket}/{filename}"


def is_supabase_configured() -> bool:
    """Check whether Supabase credentials are present."""
    return bool(settings.supabase_url and settings.supabase_service_key)
