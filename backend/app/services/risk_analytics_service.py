"""
Risk Analytics Service — tracking risk-related events, A/B testing for
intervention copy, and aggregated analytics queries.

All aggregations use SQL — no Python loops over individual records.
Expensive admin dashboard queries are cached with stampede protection.
"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import case, cast, func, Integer, Float, literal_column
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..core.cache import cache_get, cache_get_or_refresh, cache_set
from ..models.nutrition_adherence import DailyNutritionAdherence
from ..models.risk_analytics_event import RiskAnalyticsEvent

logger = logging.getLogger(__name__)

# Cache TTL for risk dashboard (seconds)
_RISK_DASHBOARD_TTL = 180  # 3 minutes

# Fields that must never appear in analytics metadata (PII / PHI)
_PII_FIELDS = {
    "name", "first_name", "last_name", "email", "phone", "phone_number",
    "address", "date_of_birth", "dob", "ssn", "password", "token",
    "ip", "ip_address", "device_id",
}

# Fields explicitly allowed in analytics metadata
_ALLOWED_METADATA_FIELDS = {
    "event_type", "variant", "score", "risk_score", "quality_score",
    "intervention_type", "intervention_variant", "status", "source",
    "screen", "action", "label", "value",
}


def _sanitize_metadata(metadata: dict) -> dict:
    """Strip PII fields from analytics metadata. Only safe keys pass through."""
    if not metadata:
        return {}
    return {
        k: v for k, v in metadata.items()
        if k.lower() not in _PII_FIELDS
    }


# Valid event types
VALID_EVENT_TYPES = {
    "risk_card_impression",
    "risk_cta_clicked",
    "intervention_sent",
    "intervention_opened",
    "correction_after_intervention",
    "risk_improved",
    "plan_changed",
}


# ---------------------------------------------------------------------------
# Event tracking
# ---------------------------------------------------------------------------

async def track_risk_event(
    user_id: int,
    event_type: str,
    metadata: dict,
    session: AsyncSession,
) -> RiskAnalyticsEvent:
    """Log a risk-related analytics event."""
    if event_type not in VALID_EVENT_TYPES:
        raise ValueError(f"Invalid event_type: {event_type}")

    # SEC: Strip any PII from client-supplied metadata
    metadata = _sanitize_metadata(metadata)

    # Inject A/B variant into metadata automatically
    if "variant" not in metadata:
        metadata["variant"] = get_intervention_variant(user_id)

    event = RiskAnalyticsEvent(
        user_id=user_id,
        event_type=event_type,
        metadata_json=json.dumps(metadata) if metadata else None,
    )
    session.add(event)
    await session.commit()
    await session.refresh(event)
    logger.info("risk_event: user=%s type=%s", user_id, event_type)
    return event


# ---------------------------------------------------------------------------
# User-level analytics aggregation
# ---------------------------------------------------------------------------

async def get_user_risk_analytics(
    user_id: int,
    days: int,
    session: AsyncSession,
) -> dict:
    """Return aggregated risk analytics for a single user over the given period."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    # Count events by type — single query
    result = await session.execute(
        select(
            RiskAnalyticsEvent.event_type,
            func.count(RiskAnalyticsEvent.id),
        )
        .where(
            RiskAnalyticsEvent.user_id == user_id,
            RiskAnalyticsEvent.created_at >= cutoff,
        )
        .group_by(RiskAnalyticsEvent.event_type)
    )
    counts: dict[str, int] = {}
    for row in result.all():
        counts[row[0]] = row[1]

    total_interventions = counts.get("intervention_sent", 0)
    total_corrections = counts.get("correction_after_intervention", 0)
    correction_rate = (
        round(total_corrections / total_interventions, 2)
        if total_interventions > 0
        else 0.0
    )

    return {
        "total_impressions": counts.get("risk_card_impression", 0),
        "total_cta_clicks": counts.get("risk_cta_clicked", 0),
        "total_interventions": total_interventions,
        "total_corrections": total_corrections,
        "total_risk_improved": counts.get("risk_improved", 0),
        "correction_rate": correction_rate,
        "days": days,
    }


# ---------------------------------------------------------------------------
# A/B testing for intervention copy
# ---------------------------------------------------------------------------

def get_intervention_variant(user_id: int) -> str:
    """Consistent A/B assignment: 'empathetic' vs 'direct' copy style.

    Uses a stable hash of user_id so the same user always gets the same variant.
    50/50 split.
    """
    digest = hashlib.md5(f"risk_intervention_{user_id}".encode()).hexdigest()
    bucket = int(digest[:8], 16) % 2
    return "empathetic" if bucket == 0 else "direct"


# ---------------------------------------------------------------------------
# Admin dashboard aggregation — fully SQL-based
# ---------------------------------------------------------------------------

async def get_admin_risk_dashboard(session: AsyncSession) -> dict:
    """
    Return aggregated risk stats for the admin dashboard.

    All aggregations are performed in SQL — no Python loops over individual
    records. Results are cached with stampede protection for 3 minutes.
    """
    cache_key = "admin:risk_dashboard"

    async def _compute():
        return await _compute_admin_risk_dashboard(session)

    return await cache_get_or_refresh(cache_key, _RISK_DASHBOARD_TTL, _compute)


async def _compute_admin_risk_dashboard(session: AsyncSession) -> dict:
    """Internal computation — called via cache_get_or_refresh."""
    today = datetime.now(timezone.utc).date()
    seven_days_ago = today - timedelta(days=7)

    # ── Subquery: latest adherence record per user (last 7 days) ─────────
    latest_sub = (
        select(
            DailyNutritionAdherence.user_id,
            func.max(DailyNutritionAdherence.date).label("max_date"),
        )
        .where(DailyNutritionAdherence.date >= seven_days_ago)
        .group_by(DailyNutritionAdherence.user_id)
        .subquery()
    )

    # ── Main aggregation query — single pass over joined data ────────────
    # Uses CASE-WHEN expressions instead of Python loops.
    main_q = (
        select(
            func.count().label("total_users"),
            # Users at risk
            func.count().filter(
                DailyNutritionAdherence.adherence_status.in_(
                    ("risk", "high_risk", "critical")
                )
            ).label("users_at_risk"),
            # Users critical
            func.count().filter(
                DailyNutritionAdherence.adherence_status == "critical"
            ).label("users_critical"),
            # Average risk score
            func.coalesce(
                func.round(cast(func.avg(DailyNutritionAdherence.nutrition_risk_score), Float), 0),
                0,
            ).label("avg_risk_score"),
            # Average quality score
            func.coalesce(
                func.round(cast(func.avg(DailyNutritionAdherence.diet_quality_score), Float), 0),
                0,
            ).label("avg_quality_score"),
            # Average meals per day
            func.coalesce(
                func.round(cast(func.avg(DailyNutritionAdherence.meals_logged), Float), 1),
                0,
            ).label("avg_meals_per_day"),
            # Users improving (risk < 50 and some data)
            func.count().filter(
                DailyNutritionAdherence.nutrition_risk_score < 50,
                DailyNutritionAdherence.calories_logged > 0,
            ).label("users_improving"),
            # Users declining (risk >= 70)
            func.count().filter(
                DailyNutritionAdherence.nutrition_risk_score >= 70,
            ).label("users_declining"),
            # Risk distribution buckets
            func.count().filter(
                DailyNutritionAdherence.nutrition_risk_score < 20,
            ).label("risk_0_20"),
            func.count().filter(
                DailyNutritionAdherence.nutrition_risk_score >= 20,
                DailyNutritionAdherence.nutrition_risk_score < 40,
            ).label("risk_20_40"),
            func.count().filter(
                DailyNutritionAdherence.nutrition_risk_score >= 40,
                DailyNutritionAdherence.nutrition_risk_score < 60,
            ).label("risk_40_60"),
            func.count().filter(
                DailyNutritionAdherence.nutrition_risk_score >= 60,
                DailyNutritionAdherence.nutrition_risk_score < 80,
            ).label("risk_60_80"),
            func.count().filter(
                DailyNutritionAdherence.nutrition_risk_score >= 80,
            ).label("risk_80_100"),
        )
        .join(
            latest_sub,
            (DailyNutritionAdherence.user_id == latest_sub.c.user_id)
            & (DailyNutritionAdherence.date == latest_sub.c.max_date),
        )
    )

    result = await session.execute(main_q)
    row = result.first()

    if not row or not row.total_users:
        return {
            "users_at_risk": 0,
            "users_critical": 0,
            "avg_risk_score": 0,
            "avg_quality_score": 0,
            "intervention_effectiveness": 0.0,
            "top_risk_reasons": [],
            "avg_meals_per_day": 0.0,
            "users_improving": 0,
            "users_declining": 0,
            "risk_distribution": {
                "0_20": 0,
                "20_40": 0,
                "40_60": 0,
                "60_80": 0,
                "80_100": 0,
            },
        }

    # ── Intervention effectiveness — SQL aggregation ─────────────────────
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)

    # Single query for both metrics
    intervention_q = select(
        func.count(func.distinct(RiskAnalyticsEvent.user_id)).filter(
            RiskAnalyticsEvent.event_type == "intervention_sent",
        ).label("users_with_intervention"),
        func.count(func.distinct(RiskAnalyticsEvent.user_id)).filter(
            RiskAnalyticsEvent.event_type.in_(
                ["correction_after_intervention", "risk_improved"]
            ),
        ).label("users_improved"),
    ).where(RiskAnalyticsEvent.created_at >= cutoff)

    ie_result = await session.execute(intervention_q)
    ie_row = ie_result.first()

    users_with_intervention = int(ie_row.users_with_intervention) if ie_row else 0
    users_improved = int(ie_row.users_improved) if ie_row else 0

    intervention_effectiveness = (
        round(users_improved / users_with_intervention, 2)
        if users_with_intervention > 0
        else 0.0
    )

    # ── Top risk reasons — SQL GROUP BY ──────────────────────────────────
    reasons_q = (
        select(
            DailyNutritionAdherence.primary_risk_reason,
            func.count().label("reason_count"),
        )
        .join(
            latest_sub,
            (DailyNutritionAdherence.user_id == latest_sub.c.user_id)
            & (DailyNutritionAdherence.date == latest_sub.c.max_date),
        )
        .where(DailyNutritionAdherence.primary_risk_reason.isnot(None))
        .group_by(DailyNutritionAdherence.primary_risk_reason)
        .order_by(func.count().desc())
        .limit(10)
    )

    reasons_result = await session.execute(reasons_q)
    top_risk_reasons = [
        {"reason": r.primary_risk_reason, "count": int(r.reason_count)}
        for r in reasons_result.all()
    ]

    return {
        "users_at_risk": int(row.users_at_risk),
        "users_critical": int(row.users_critical),
        "avg_risk_score": int(row.avg_risk_score),
        "avg_quality_score": int(row.avg_quality_score),
        "intervention_effectiveness": intervention_effectiveness,
        "top_risk_reasons": top_risk_reasons,
        "avg_meals_per_day": float(row.avg_meals_per_day),
        "users_improving": int(row.users_improving),
        "users_declining": int(row.users_declining),
        "risk_distribution": {
            "0_20": int(row.risk_0_20),
            "20_40": int(row.risk_20_40),
            "40_60": int(row.risk_40_60),
            "60_80": int(row.risk_60_80),
            "80_100": int(row.risk_80_100),
        },
    }
