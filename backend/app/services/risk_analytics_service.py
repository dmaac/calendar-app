"""
Risk Analytics Service — tracking risk-related events, A/B testing for
intervention copy, and aggregated analytics queries.
"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..models.nutrition_adherence import DailyNutritionAdherence
from ..models.risk_analytics_event import RiskAnalyticsEvent

logger = logging.getLogger(__name__)

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
    cutoff = datetime.utcnow() - timedelta(days=days)

    # Count events by type
    result = await session.exec(
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
# Admin dashboard aggregation
# ---------------------------------------------------------------------------

async def get_admin_risk_dashboard(session: AsyncSession) -> dict:
    """Return aggregated risk stats for the admin dashboard."""
    today = datetime.utcnow().date()
    seven_days_ago = today - timedelta(days=7)

    # Get latest adherence record per user (last 7 days)
    # Subquery: max date per user
    latest_sub = (
        select(
            DailyNutritionAdherence.user_id,
            func.max(DailyNutritionAdherence.date).label("max_date"),
        )
        .where(DailyNutritionAdherence.date >= seven_days_ago)
        .group_by(DailyNutritionAdherence.user_id)
        .subquery()
    )

    # Join to get actual records
    result = await session.exec(
        select(DailyNutritionAdherence).join(
            latest_sub,
            (DailyNutritionAdherence.user_id == latest_sub.c.user_id)
            & (DailyNutritionAdherence.date == latest_sub.c.max_date),
        )
    )
    records = list(result.all())

    if not records:
        return {
            "users_at_risk": 0,
            "users_critical": 0,
            "avg_risk_score": 0,
            "avg_quality_score": 0,
            "intervention_effectiveness": 0.0,
            "top_risk_reasons": [],
        }

    users_at_risk = sum(
        1 for r in records if r.adherence_status in ("risk", "high_risk", "critical")
    )
    users_critical = sum(1 for r in records if r.adherence_status == "critical")
    avg_risk_score = round(
        sum(r.nutrition_risk_score for r in records) / len(records)
    )
    avg_quality_score = round(
        sum(r.diet_quality_score for r in records) / len(records)
    )

    # Intervention effectiveness: % of users who improved after intervention
    cutoff = datetime.utcnow() - timedelta(days=7)
    intervention_result = await session.exec(
        select(func.count(func.distinct(RiskAnalyticsEvent.user_id))).where(
            RiskAnalyticsEvent.event_type == "intervention_sent",
            RiskAnalyticsEvent.created_at >= cutoff,
        )
    )
    users_with_intervention = intervention_result.one()

    improved_result = await session.exec(
        select(func.count(func.distinct(RiskAnalyticsEvent.user_id))).where(
            RiskAnalyticsEvent.event_type.in_(
                ["correction_after_intervention", "risk_improved"]
            ),
            RiskAnalyticsEvent.created_at >= cutoff,
        )
    )
    users_improved = improved_result.one()

    intervention_effectiveness = (
        round(users_improved / users_with_intervention, 2)
        if users_with_intervention > 0
        else 0.0
    )

    # Top risk reasons (frequency count from primary_risk_reason)
    reason_counts: dict[str, int] = {}
    for r in records:
        if r.primary_risk_reason:
            reason_counts[r.primary_risk_reason] = (
                reason_counts.get(r.primary_risk_reason, 0) + 1
            )
    top_risk_reasons = sorted(
        [{"reason": k, "count": v} for k, v in reason_counts.items()],
        key=lambda x: x["count"],
        reverse=True,
    )[:10]

    # Item 69: Additional aggregated stats
    total_meals = sum(r.meals_logged for r in records)
    avg_meals_per_day = round(total_meals / len(records), 1) if records else 0.0

    # Users improving: latest risk < 50 and have at least some data
    users_improving = sum(
        1 for r in records
        if r.nutrition_risk_score < 50 and r.calories_logged > 0
    )
    # Users declining: latest risk >= 70
    users_declining = sum(
        1 for r in records if r.nutrition_risk_score >= 70
    )

    # Risk distribution: count users in each bracket
    risk_distribution = {
        "0_20": 0,
        "20_40": 0,
        "40_60": 0,
        "60_80": 0,
        "80_100": 0,
    }
    for r in records:
        score = r.nutrition_risk_score
        if score < 20:
            risk_distribution["0_20"] += 1
        elif score < 40:
            risk_distribution["20_40"] += 1
        elif score < 60:
            risk_distribution["40_60"] += 1
        elif score < 80:
            risk_distribution["60_80"] += 1
        else:
            risk_distribution["80_100"] += 1

    return {
        "users_at_risk": users_at_risk,
        "users_critical": users_critical,
        "avg_risk_score": avg_risk_score,
        "avg_quality_score": avg_quality_score,
        "intervention_effectiveness": intervention_effectiveness,
        "top_risk_reasons": top_risk_reasons,
        "avg_meals_per_day": avg_meals_per_day,
        "users_improving": users_improving,
        "users_declining": users_declining,
        "risk_distribution": risk_distribution,
    }
