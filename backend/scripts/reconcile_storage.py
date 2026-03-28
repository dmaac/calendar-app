#!/usr/bin/env python3
"""
Storage Reconciliation Script
-------------------------------
Compares Supabase storage objects in the 'food-scans' bucket against
ai_food_log.image_url records in the database.

Reports:
  - Orphaned images (in storage but not referenced in any food log)
  - Broken references (food logs pointing to non-existent storage objects)
  - Unlinked records (food logs with no image_url at all)

Recovery mode (--recover):
  - Attempts to re-link orphaned images to users based on timestamp correlation
  - Creates food_log stub records for orphaned images

Usage:
    # Dry run (report only)
    python -m scripts.reconcile_storage

    # Recovery mode (create stubs for orphaned images)
    python -m scripts.reconcile_storage --recover

    # Limit to specific user
    python -m scripts.reconcile_storage --user-id 42

    # With explicit .env path
    ENV_FILE=/path/to/.env python -m scripts.reconcile_storage
"""

import argparse
import asyncio
import json
import logging
import os
import sys
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

# Add the backend directory to Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("reconcile_storage")


async def list_storage_objects(bucket: str = "food-scans") -> Dict[str, Dict[str, Any]]:
    """
    List all objects in the Supabase storage bucket.
    Returns a dict mapping filename -> metadata (size, created_at, etc.).
    """
    from app.core.config import settings
    from app.core.supabase_config import is_supabase_configured, get_supabase_headers

    if not is_supabase_configured():
        logger.warning("Supabase not configured -- checking local /tmp/fitsi-storage/%s", bucket)
        local_dir = f"/tmp/fitsi-storage/{bucket}"
        if not os.path.isdir(local_dir):
            logger.info("Local storage dir does not exist: %s", local_dir)
            return {}
        result = {}
        for f in os.listdir(local_dir):
            path = os.path.join(local_dir, f)
            stat = os.stat(path)
            result[f] = {
                "name": f,
                "size": stat.st_size,
                "created_at": datetime.fromtimestamp(stat.st_ctime, tz=timezone.utc).isoformat(),
                "updated_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
            }
        return result

    import httpx

    base = settings.supabase_url.rstrip("/")
    url = f"{base}/storage/v1/object/list/{bucket}"
    headers = get_supabase_headers(use_service_key=True)
    headers["Content-Type"] = "application/json"

    objects: Dict[str, Dict[str, Any]] = {}
    offset = 0
    limit = 1000

    async with httpx.AsyncClient(timeout=30.0) as client:
        while True:
            payload = {
                "prefix": "",
                "limit": limit,
                "offset": offset,
                "sortBy": {"column": "name", "order": "asc"},
            }
            response = await client.post(url, headers=headers, json=payload)
            if response.status_code != 200:
                logger.error(
                    "Storage list failed: status=%d body=%.300s",
                    response.status_code, response.text,
                )
                break

            items = response.json()
            if not items:
                break

            for item in items:
                name = item.get("name", "")
                if name and not name.endswith("/"):
                    objects[name] = {
                        "name": name,
                        "size": item.get("metadata", {}).get("size", 0),
                        "created_at": item.get("created_at", ""),
                        "updated_at": item.get("updated_at", ""),
                        "mime_type": item.get("metadata", {}).get("mimetype", ""),
                    }

            if len(items) < limit:
                break
            offset += limit

    return objects


async def get_db_image_refs(user_id: Optional[int] = None) -> Dict[str, Dict[str, Any]]:
    """
    Get all image_url references from ai_food_log.
    Returns dict mapping extracted filename -> food log metadata.
    """
    from sqlalchemy import text as sa_text
    from app.core.database import AsyncSessionLocal

    query = """
        SELECT id, user_id, image_url, food_name, calories, protein_g, carbs_g, fats_g,
               meal_type, logged_at, ai_provider
        FROM ai_food_log
        WHERE image_url IS NOT NULL AND image_url != ''
    """
    params: Dict[str, Any] = {}

    if user_id is not None:
        query += " AND user_id = :uid"
        params["uid"] = user_id

    query += " ORDER BY logged_at DESC"

    refs: Dict[str, Dict[str, Any]] = {}
    async with AsyncSessionLocal() as session:
        result = await session.execute(sa_text(query), params)
        rows = result.mappings().all()

        for row in rows:
            url = row["image_url"]
            filename = url.rstrip("/").rsplit("/", 1)[-1] if "/" in url else url
            refs[filename] = {
                "food_log_id": row["id"],
                "user_id": row["user_id"],
                "image_url": url,
                "food_name": row["food_name"],
                "calories": float(row["calories"]) if row["calories"] else 0,
                "protein_g": float(row["protein_g"]) if row["protein_g"] else 0,
                "carbs_g": float(row["carbs_g"]) if row["carbs_g"] else 0,
                "fats_g": float(row["fats_g"]) if row["fats_g"] else 0,
                "meal_type": row["meal_type"],
                "logged_at": str(row["logged_at"]),
                "ai_provider": row["ai_provider"],
            }

    return refs


async def get_all_users() -> Dict[int, Dict[str, Any]]:
    """Get all users with their most recent food log timestamp for correlation."""
    from sqlalchemy import text as sa_text
    from app.core.database import AsyncSessionLocal

    users: Dict[int, Dict[str, Any]] = {}
    async with AsyncSessionLocal() as session:
        result = await session.execute(sa_text("""
            SELECT u.id, u.email,
                   MAX(fl.logged_at) AS last_log,
                   COUNT(fl.id) AS log_count
            FROM "user" u
            LEFT JOIN ai_food_log fl ON u.id = fl.user_id
            GROUP BY u.id, u.email
            ORDER BY u.id
        """))
        for row in result.mappings():
            users[row["id"]] = {
                "email": row["email"],
                "last_log": str(row["last_log"]) if row["last_log"] else None,
                "log_count": int(row["log_count"]),
            }

    return users


def correlate_orphan_to_user(
    orphan_meta: Dict[str, Any],
    users: Dict[int, Dict[str, Any]],
    db_refs: Dict[str, Dict[str, Any]],
) -> Optional[int]:
    """
    Attempt to correlate an orphaned image to a user based on timestamp proximity.

    Heuristic: find the user whose most recent food log is closest in time to
    the orphan's creation timestamp. Only match if within a 24-hour window.
    """
    orphan_created = orphan_meta.get("created_at", "")
    if not orphan_created:
        return None

    try:
        orphan_dt = datetime.fromisoformat(orphan_created.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None

    best_user: Optional[int] = None
    best_delta = float("inf")

    for uid, user_info in users.items():
        last_log_str = user_info.get("last_log")
        if not last_log_str or last_log_str == "None":
            continue
        try:
            last_log_dt = datetime.fromisoformat(last_log_str.replace("Z", "+00:00"))
            # Make both timezone-aware for comparison
            if orphan_dt.tzinfo is None:
                orphan_dt = orphan_dt.replace(tzinfo=timezone.utc)
            if last_log_dt.tzinfo is None:
                last_log_dt = last_log_dt.replace(tzinfo=timezone.utc)
            delta = abs((orphan_dt - last_log_dt).total_seconds())
            if delta < best_delta and delta < 86400:  # Within 24 hours
                best_delta = delta
                best_user = uid
        except (ValueError, AttributeError):
            continue

    return best_user


async def create_food_log_stub(
    user_id: int,
    image_url: str,
    filename: str,
    orphan_meta: Dict[str, Any],
) -> Optional[int]:
    """
    Create a minimal food_log record for an orphaned image.
    The record is flagged so it can be identified as a recovery stub.
    """
    from sqlalchemy import text as sa_text
    from app.core.database import AsyncSessionLocal

    created_at_str = orphan_meta.get("created_at", "")
    try:
        logged_at = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        logged_at = datetime.now(timezone.utc)

    async with AsyncSessionLocal() as session:
        try:
            result = await session.execute(
                sa_text("""
                    INSERT INTO ai_food_log
                        (user_id, logged_at, meal_type, image_url, food_name,
                         calories, carbs_g, protein_g, fats_g,
                         ai_provider, was_edited, notes, created_at)
                    VALUES
                        (:uid, :logged_at, 'snack', :image_url,
                         'Recovered item (pending re-scan)',
                         0, 0, 0, 0,
                         'recovery', false,
                         :notes, :created_at)
                    RETURNING id
                """),
                {
                    "uid": user_id,
                    "logged_at": logged_at,
                    "image_url": image_url,
                    "notes": f"RECOVERY STUB: orphaned image {filename} re-linked by reconcile_storage.py",
                    "created_at": datetime.now(timezone.utc),
                },
            )
            new_id = result.scalar()
            await session.commit()
            return new_id
        except Exception as exc:
            logger.error("Failed to create food log stub for %s: %s", filename, exc)
            await session.rollback()
            return None


async def reconcile(
    user_id: Optional[int] = None,
    recover: bool = False,
    max_recover: int = 50,
) -> Dict[str, Any]:
    """
    Main reconciliation logic.

    Args:
        user_id: If set, only check food logs for this user.
        recover: If True, create food_log stubs for orphaned images.
        max_recover: Maximum number of orphaned images to recover in one run.

    Returns:
        A summary dict with the reconciliation results.
    """
    logger.info("=" * 72)
    logger.info("STORAGE RECONCILIATION STARTED")
    logger.info("  Mode: %s", "RECOVERY" if recover else "DRY RUN (report only)")
    if user_id:
        logger.info("  User filter: %d", user_id)
    logger.info("=" * 72)

    # Step 1: List storage objects
    logger.info("Listing storage objects in 'food-scans' bucket...")
    storage_objects = await list_storage_objects("food-scans")
    logger.info("  Found %d objects in storage", len(storage_objects))

    # Step 2: Get DB image references
    logger.info("Querying ai_food_log image references...")
    db_refs = await get_db_image_refs(user_id)
    logger.info("  Found %d image references in DB", len(db_refs))

    # Step 3: Compute differences
    storage_filenames: Set[str] = set(storage_objects.keys())
    db_filenames: Set[str] = set(db_refs.keys())

    orphaned_images = storage_filenames - db_filenames
    broken_references = db_filenames - storage_filenames

    # Filter broken references to only HTTP URLs (not local file:// paths)
    broken_refs_http = [
        fname for fname in broken_references
        if db_refs[fname]["image_url"].startswith("http")
    ]

    # Step 4: Count unlinked records
    from sqlalchemy import text as sa_text
    from app.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        q = "SELECT COUNT(*) FROM ai_food_log WHERE image_url IS NULL OR image_url = ''"
        params: Dict[str, Any] = {}
        if user_id:
            q += " AND user_id = :uid"
            params["uid"] = user_id
        result = await session.execute(sa_text(q), params)
        unlinked_count = result.scalar() or 0

    # Step 5: Report
    logger.info("")
    logger.info("=" * 72)
    logger.info("RECONCILIATION REPORT")
    logger.info("=" * 72)
    logger.info("  Storage objects:     %d", len(storage_objects))
    logger.info("  DB image references: %d", len(db_refs))
    logger.info("  Orphaned images:     %d  (in storage, no DB record)", len(orphaned_images))
    logger.info("  Broken references:   %d  (in DB, not in storage)", len(broken_refs_http))
    logger.info("  Unlinked records:    %d  (food logs with no image)", unlinked_count)
    logger.info("")

    if orphaned_images:
        logger.info("ORPHANED IMAGES (first 20):")
        for i, fname in enumerate(sorted(orphaned_images)[:20]):
            meta = storage_objects.get(fname, {})
            logger.info(
                "  [%02d] %s  (size=%s, created=%s)",
                i + 1, fname,
                meta.get("size", "?"),
                meta.get("created_at", "?"),
            )

    if broken_refs_http:
        logger.info("")
        logger.info("BROKEN REFERENCES (first 20):")
        for i, fname in enumerate(sorted(broken_refs_http)[:20]):
            ref = db_refs[fname]
            logger.info(
                "  [%02d] food_log_id=%s  user=%s  food=%s  logged=%s",
                i + 1,
                ref["food_log_id"],
                ref["user_id"],
                ref["food_name"],
                ref["logged_at"],
            )

    summary = {
        "storage_objects": len(storage_objects),
        "db_references": len(db_refs),
        "orphaned_images": len(orphaned_images),
        "orphaned_filenames": sorted(orphaned_images),
        "broken_references": len(broken_refs_http),
        "broken_filenames": sorted(broken_refs_http),
        "unlinked_records": unlinked_count,
        "recovered": 0,
        "recovery_details": [],
    }

    # Step 6: Recovery (if requested)
    if recover and orphaned_images:
        logger.info("")
        logger.info("=" * 72)
        logger.info("RECOVERY MODE: Attempting to re-link orphaned images")
        logger.info("=" * 72)

        users = await get_all_users()
        recovered = 0

        from app.core.supabase_config import get_public_url

        for fname in sorted(orphaned_images)[:max_recover]:
            orphan_meta = storage_objects.get(fname, {})
            matched_user = correlate_orphan_to_user(orphan_meta, users, db_refs)

            if matched_user is None:
                logger.warning(
                    "  SKIP %s -- could not correlate to any user", fname
                )
                continue

            # Build the public URL for this image
            image_url = get_public_url("food-scans", fname)

            logger.info(
                "  RECOVERING %s -> user_id=%d (url=%s)",
                fname, matched_user, image_url,
            )

            new_id = await create_food_log_stub(
                user_id=matched_user,
                image_url=image_url,
                filename=fname,
                orphan_meta=orphan_meta,
            )

            if new_id:
                recovered += 1
                summary["recovery_details"].append({
                    "filename": fname,
                    "user_id": matched_user,
                    "food_log_id": new_id,
                    "image_url": image_url,
                })
                logger.info("    Created food_log stub id=%d", new_id)
            else:
                logger.error("    FAILED to create stub for %s", fname)

        summary["recovered"] = recovered
        logger.info("")
        logger.info("Recovery complete: %d/%d orphaned images re-linked", recovered, len(orphaned_images))

    # Write JSON report to file
    report_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        f"reconciliation_report_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.json",
    )
    with open(report_path, "w") as f:
        json.dump(summary, f, indent=2, default=str)
    logger.info("")
    logger.info("Full report written to: %s", report_path)

    return summary


def main():
    parser = argparse.ArgumentParser(
        description="Reconcile Supabase storage objects with ai_food_log records"
    )
    parser.add_argument(
        "--recover",
        action="store_true",
        help="Create food_log stubs for orphaned images (default: dry run only)",
    )
    parser.add_argument(
        "--user-id",
        type=int,
        default=None,
        help="Only check food logs for this user ID",
    )
    parser.add_argument(
        "--max-recover",
        type=int,
        default=50,
        help="Maximum orphaned images to recover in one run (default: 50)",
    )
    args = parser.parse_args()

    asyncio.run(reconcile(
        user_id=args.user_id,
        recover=args.recover,
        max_recover=args.max_recover,
    ))


if __name__ == "__main__":
    main()
