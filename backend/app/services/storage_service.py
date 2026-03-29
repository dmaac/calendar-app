"""
Supabase Storage Service
------------------------
Upload, delete, and retrieve public URLs for images stored in Supabase Storage.

When SUPABASE_URL is not configured, falls back to saving files locally
in /tmp/fitsi-storage/ for development.
"""

import logging
import os
import uuid
from typing import Optional

import httpx

from ..core.config import settings
from ..core.supabase_config import (
    get_supabase_headers,
    get_storage_url,
    get_public_url,
    is_supabase_configured,
)

logger = logging.getLogger(__name__)

_LOCAL_STORAGE_DIR = "/tmp/fitsi-storage"


def _ensure_local_dir(bucket: str) -> str:
    """Create local storage directory for dev mode."""
    path = os.path.join(_LOCAL_STORAGE_DIR, bucket)
    os.makedirs(path, exist_ok=True)
    return path


def _generate_filename(original_filename: str) -> str:
    """Generate a unique filename preserving the original extension."""
    ext = os.path.splitext(original_filename)[1] if "." in original_filename else ".jpg"
    return f"{uuid.uuid4().hex}{ext}"


async def upload_image(
    file_bytes: bytes,
    filename: str,
    bucket: str = "food-scans",
    content_type: str = "image/jpeg",
) -> str:
    """
    Upload an image to Supabase Storage.

    Returns the public URL of the uploaded file.
    Falls back to local /tmp/ storage if Supabase is not configured.
    """
    unique_name = _generate_filename(filename)

    if not is_supabase_configured():
        logger.info("Supabase not configured — saving image locally (dev mode)")
        local_dir = _ensure_local_dir(bucket)
        local_path = os.path.join(local_dir, unique_name)
        with open(local_path, "wb") as f:
            f.write(file_bytes)
        return f"file://{local_path}"

    url = get_storage_url(bucket, unique_name)
    headers = get_supabase_headers(use_service_key=True)
    headers["Content-Type"] = content_type

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(url, headers=headers, content=file_bytes)
        if response.status_code not in (200, 201):
            logger.error(
                "Supabase Storage upload failed: status=%d body=%.200s",
                response.status_code,
                response.text,
            )
            raise ValueError(f"Storage upload failed with status {response.status_code}")

    public_url = get_public_url(bucket, unique_name)
    logger.info("Image uploaded to Supabase Storage: %s", public_url)
    return public_url


async def delete_image(filename: str, bucket: str = "food-scans") -> bool:
    """
    Delete an image from Supabase Storage.

    Returns True if deleted successfully, False otherwise.
    """
    if not is_supabase_configured():
        local_path = os.path.join(_LOCAL_STORAGE_DIR, bucket, filename)
        if os.path.exists(local_path):
            os.remove(local_path)
            return True
        return False

    base = settings.supabase_url.rstrip("/")
    url = f"{base}/storage/v1/object/{bucket}/{filename}"
    headers = get_supabase_headers(use_service_key=True)

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.delete(url, headers=headers)
        if response.status_code in (200, 204):
            logger.info("Image deleted from Supabase Storage: %s/%s", bucket, filename)
            return True
        logger.warning(
            "Supabase Storage delete failed: status=%d body=%.200s",
            response.status_code,
            response.text,
        )
        return False


def get_image_url(filename: str, bucket: str = "food-scans") -> str:
    """
    Get the public URL for a stored image.

    Returns local file path if Supabase is not configured.
    """
    if not is_supabase_configured():
        return f"file://{os.path.join(_LOCAL_STORAGE_DIR, bucket, filename)}"

    return get_public_url(bucket, filename)
