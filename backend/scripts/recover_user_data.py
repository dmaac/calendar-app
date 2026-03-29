#!/usr/bin/env python3
"""
Incident Recovery Script: Orphaned Food Scan Images
=====================================================

Purpose:
  Connect to Supabase Storage, identify orphaned images in the food-scans
  bucket that belong to user_id=1, and create stub food_log records so the
  user can see them in their history and re-scan if needed.

Context:
  During a deployment incident, 10 food scan images were uploaded to Supabase
  Storage but the corresponding database records were never created. This
  script recovers those images by creating placeholder food_log entries with
  zero macros and a marker ai_provider="recovered".

Usage:
  cd backend/
  python -m scripts.recover_user_data [--dry-run] [--user-id 1]

Flags:
  --dry-run     Print what would be done without writing to the database.
  --user-id N   Override the target user (default: 1).

Recovery records have:
  - food_name = "Recovered scan (pending re-analysis)"
  - calories/macros = 0 (needs re-scan by the AI pipeline)
  - ai_provider = "recovered"
  - meal_type = inferred from upload timestamp hour
  - logged_at = image upload timestamp from Supabase metadata
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from datetime import datetime, timezone
from typing import List, Optional

import httpx

# ---------------------------------------------------------------------------
# Bootstrap: ensure the backend app package is importable when running
# the script from the repo root (e.g., `python -m scripts.recover_user_data`).
# ---------------------------------------------------------------------------
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.core.config import settings
from app.core.supabase_config import (
    get_supabase_headers,
    is_supabase_configured,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

FOOD_SCANS_BUCKET = "food-scans"
TARGET_USER_ID = 1


# ---------------------------------------------------------------------------
# Meal type inference
# ---------------------------------------------------------------------------

def infer_meal_type(timestamp: datetime) -> str:
    """
    Infer the meal type from the hour of the timestamp.

    Rules:
      hour < 11  => breakfast
      hour < 15  => lunch
      hour < 20  => dinner
      else       => snack
    """
    hour = timestamp.hour
    if hour < 11:
        return "breakfast"
    elif hour < 15:
        return "lunch"
    elif hour < 20:
        return "dinner"
    else:
        return "snack"


# ---------------------------------------------------------------------------
# Supabase Storage: list objects
# ---------------------------------------------------------------------------

async def list_storage_objects(
    bucket: str,
    prefix: str = "",
    limit: int = 100,
) -> List[dict]:
    """
    List objects in a Supabase Storage bucket.

    Returns a list of dicts with keys: name, id, created_at, metadata, etc.
    """
    if not is_supabase_configured():
        logger.error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY.")
        return []

    base = settings.supabase_url.rstrip("/")
    url = f"{base}/storage/v1/object/list/{bucket}"
    headers = get_supabase_headers(use_service_key=True)
    headers["Content-Type"] = "application/json"

    body = {
        "prefix": prefix,
        "limit": limit,
        "offset": 0,
        "sortBy": {"column": "created_at", "order": "desc"},
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, headers=headers, json=body)
        if resp.status_code != 200:
            logger.error(
                "Failed to list storage objects: HTTP %d -- %s",
                resp.status_code, resp.text[:300],
            )
            return []

        return resp.json()


def get_public_url(bucket: str, filename: str) -> str:
    """Build the public URL for a stored object."""
    base = settings.supabase_url.rstrip("/")
    return f"{base}/storage/v1/object/public/{bucket}/{filename}"


# ---------------------------------------------------------------------------
# Database: check existing records and insert stubs
# ---------------------------------------------------------------------------

async def get_existing_image_urls(user_id: int) -> set:
    """Fetch all image_urls already recorded in ai_food_log for the user."""
    from app.core.database import AsyncSessionLocal
    from sqlalchemy import text as sa_text

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            sa_text(
                "SELECT image_url FROM ai_food_log WHERE user_id = :uid AND image_url IS NOT NULL"
            ),
            {"uid": user_id},
        )
        return {row[0] for row in result.fetchall()}


async def insert_recovery_stub(
    user_id: int,
    image_url: str,
    logged_at: datetime,
    meal_type: str,
    dry_run: bool = False,
) -> Optional[int]:
    """
    Insert a stub ai_food_log record for a recovered image.

    Returns the new record id, or None if dry_run.
    """
    if dry_run:
        logger.info(
            "[DRY RUN] Would insert: user=%d image=%s meal=%s logged_at=%s",
            user_id, image_url, meal_type, logged_at.isoformat(),
        )
        return None

    from app.core.database import AsyncSessionLocal
    from sqlalchemy import text as sa_text

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            sa_text("""
                INSERT INTO ai_food_log (
                    user_id, logged_at, meal_type, image_url,
                    food_name, calories, carbs_g, protein_g, fats_g,
                    ai_provider, ai_confidence, was_edited, notes, created_at
                ) VALUES (
                    :user_id, :logged_at, :meal_type, :image_url,
                    :food_name, :calories, :carbs_g, :protein_g, :fats_g,
                    :ai_provider, :ai_confidence, :was_edited, :notes, :created_at
                )
                RETURNING id
            """),
            {
                "user_id": user_id,
                "logged_at": logged_at.replace(tzinfo=None) if logged_at.tzinfo else logged_at,
                "meal_type": meal_type,
                "image_url": image_url,
                "food_name": "Recovered scan (pending re-analysis)",
                "calories": 0.0,
                "carbs_g": 0.0,
                "protein_g": 0.0,
                "fats_g": 0.0,
                "ai_provider": "recovered",
                "ai_confidence": 0.0,
                "was_edited": False,
                "notes": "Auto-recovered from orphaned storage image. Needs re-scan.",
                "created_at": datetime.now(timezone.utc),
            },
        )
        row = result.fetchone()
        await session.commit()
        return row[0] if row else None


# ---------------------------------------------------------------------------
# Main recovery logic
# ---------------------------------------------------------------------------

async def recover_orphaned_images(
    user_id: int = TARGET_USER_ID,
    dry_run: bool = False,
) -> None:
    """
    Main recovery flow:
      1. List all images in the food-scans bucket
      2. Get existing image_urls from ai_food_log for the user
      3. Find orphaned images (in storage but not in DB)
      4. For each orphan, infer meal_type from timestamp and create a stub record
    """
    logger.info("=" * 70)
    logger.info("INCIDENT RECOVERY: Orphaned Food Scan Images")
    logger.info("Target user: %d | Dry run: %s", user_id, dry_run)
    logger.info("=" * 70)

    # Step 1: List storage objects
    logger.info("Step 1: Listing objects in bucket '%s'...", FOOD_SCANS_BUCKET)
    objects = await list_storage_objects(FOOD_SCANS_BUCKET)

    if not objects:
        logger.warning("No objects found in bucket. Nothing to recover.")
        return

    logger.info("Found %d objects in storage.", len(objects))

    # Step 2: Get existing records
    logger.info("Step 2: Checking existing ai_food_log records...")
    existing_urls = await get_existing_image_urls(user_id)
    logger.info("Found %d existing image URLs in database.", len(existing_urls))

    # Step 3: Find orphans
    orphaned = []
    for obj in objects:
        name = obj.get("name", "")
        if not name:
            continue

        public_url = get_public_url(FOOD_SCANS_BUCKET, name)

        if public_url in existing_urls:
            continue

        # Parse creation timestamp
        created_str = obj.get("created_at") or obj.get("updated_at")
        if created_str:
            try:
                # Supabase returns ISO 8601 timestamps
                created_at = datetime.fromisoformat(
                    created_str.replace("Z", "+00:00")
                )
            except (ValueError, AttributeError):
                created_at = datetime.now(timezone.utc)
        else:
            created_at = datetime.now(timezone.utc)

        orphaned.append({
            "name": name,
            "public_url": public_url,
            "created_at": created_at,
            "meal_type": infer_meal_type(created_at),
            "size": obj.get("metadata", {}).get("size", "unknown"),
        })

    if not orphaned:
        logger.info("No orphaned images found. All storage objects have DB records.")
        return

    logger.info("Step 3: Found %d orphaned images.", len(orphaned))

    # Step 4: Create stub records
    logger.info("Step 4: Creating recovery stub records...")
    recovered_ids = []

    for idx, orphan in enumerate(orphaned, start=1):
        logger.info(
            "  [%d/%d] %s -> %s at %s",
            idx, len(orphaned),
            orphan["name"],
            orphan["meal_type"],
            orphan["created_at"].isoformat(),
        )

        record_id = await insert_recovery_stub(
            user_id=user_id,
            image_url=orphan["public_url"],
            logged_at=orphan["created_at"],
            meal_type=orphan["meal_type"],
            dry_run=dry_run,
        )

        if record_id:
            recovered_ids.append(record_id)

    # Summary
    logger.info("")
    logger.info("=" * 70)
    logger.info("RECOVERY SUMMARY")
    logger.info("=" * 70)
    logger.info("  Total images in storage:     %d", len(objects))
    logger.info("  Already had DB records:      %d", len(existing_urls))
    logger.info("  Orphaned images found:       %d", len(orphaned))

    if dry_run:
        logger.info("  Records that WOULD be created: %d", len(orphaned))
        logger.info("  (No changes made -- dry run)")
    else:
        logger.info("  Recovery records created:    %d", len(recovered_ids))
        if recovered_ids:
            logger.info("  New record IDs:              %s", recovered_ids)

    logger.info("")
    logger.info("  Orphaned image details:")
    for orphan in orphaned:
        logger.info(
            "    - %-40s  %s  (%s)",
            orphan["name"],
            orphan["meal_type"],
            orphan["created_at"].strftime("%Y-%m-%d %H:%M:%S UTC"),
        )

    if not dry_run and recovered_ids:
        logger.info("")
        logger.info(
            "Next steps: Run AI re-scan on recovered records "
            "(filter by ai_provider='recovered')."
        )

    logger.info("=" * 70)


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Recover orphaned food scan images from Supabase Storage.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=False,
        help="Print what would be done without modifying the database.",
    )
    parser.add_argument(
        "--user-id",
        type=int,
        default=TARGET_USER_ID,
        help=f"Target user ID (default: {TARGET_USER_ID}).",
    )

    args = parser.parse_args()

    asyncio.run(recover_orphaned_images(
        user_id=args.user_id,
        dry_run=args.dry_run,
    ))


if __name__ == "__main__":
    main()
