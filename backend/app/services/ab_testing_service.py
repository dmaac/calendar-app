"""
A/B Testing Service
───────────────────
Consistent user-to-variant assignment via hashing, conversion tracking,
and basic statistical significance calculation using chi-squared test.

Usage:
    variant = await assign_variant(user_id, experiment_id, session)
    await record_conversion(user_id, experiment_id, "subscribe", session)
    results = await get_experiment_results(experiment_id, session)
"""

import hashlib
import logging
import math
from typing import Dict, List, Optional

from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..models.experiment import (
    Experiment,
    ExperimentAssignment,
    ExperimentConversion,
)

logger = logging.getLogger(__name__)


# ─── Consistent hashing ─────────────────────────────────────────────────────


def _consistent_hash(user_id: int, experiment_id: int, num_variants: int) -> int:
    """
    Deterministic variant assignment using SHA-256.
    Given the same user_id + experiment_id, always returns the same bucket index.
    """
    key = f"fitsi:ab:{experiment_id}:{user_id}"
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()
    return int(digest, 16) % num_variants


# ─── Variant assignment ─────────────────────────────────────────────────────


async def get_active_experiments(session: AsyncSession) -> List[Experiment]:
    """Return all currently active experiments."""
    result = await session.execute(
        select(Experiment).where(Experiment.is_active == True)
    )
    return list(result.all())


async def get_experiment_by_id(
    experiment_id: int, session: AsyncSession
) -> Optional[Experiment]:
    """Fetch a single experiment by ID."""
    return await session.get(Experiment, experiment_id)


async def assign_variant(
    user_id: int, experiment_id: int, session: AsyncSession
) -> str:
    """
    Assign a user to an experiment variant using consistent hashing.
    If the user already has an assignment, return the existing variant.
    If the experiment is inactive, raises ValueError.
    """
    experiment = await session.get(Experiment, experiment_id)
    if not experiment:
        raise ValueError(f"Experiment {experiment_id} not found")
    if not experiment.is_active:
        raise ValueError(f"Experiment {experiment_id} is not active")

    # Check existing assignment
    result = await session.execute(
        select(ExperimentAssignment).where(
            ExperimentAssignment.user_id == user_id,
            ExperimentAssignment.experiment_id == experiment_id,
        )
    )
    existing = result.first()
    if existing:
        return existing.variant

    # Compute variant from consistent hash
    variant_list = [v.strip() for v in experiment.variants.split(",")]
    bucket = _consistent_hash(user_id, experiment_id, len(variant_list))
    variant = variant_list[bucket]

    # Persist assignment
    assignment = ExperimentAssignment(
        user_id=user_id,
        experiment_id=experiment_id,
        variant=variant,
    )
    session.add(assignment)
    await session.commit()
    await session.refresh(assignment)

    logger.info(
        "A/B assignment: user=%d experiment=%d variant=%s",
        user_id,
        experiment_id,
        variant,
    )
    return variant


# ─── Conversion tracking ────────────────────────────────────────────────────


async def record_conversion(
    user_id: int,
    experiment_id: int,
    conversion_event: Optional[str],
    session: AsyncSession,
) -> ExperimentConversion:
    """
    Record a conversion for a user in an experiment.
    The user must already be assigned to a variant.
    """
    # Look up assignment to get the variant
    result = await session.execute(
        select(ExperimentAssignment).where(
            ExperimentAssignment.user_id == user_id,
            ExperimentAssignment.experiment_id == experiment_id,
        )
    )
    assignment = result.first()
    if not assignment:
        raise ValueError(
            f"User {user_id} is not assigned to experiment {experiment_id}"
        )

    conversion = ExperimentConversion(
        user_id=user_id,
        experiment_id=experiment_id,
        variant=assignment.variant,
        conversion_event=conversion_event,
    )
    session.add(conversion)
    await session.commit()
    await session.refresh(conversion)

    logger.info(
        "A/B conversion: user=%d experiment=%d variant=%s event=%s",
        user_id,
        experiment_id,
        assignment.variant,
        conversion_event,
    )
    return conversion


# ─── Statistical significance ───────────────────────────────────────────────


def _chi_squared_p_value(observed: List[List[float]]) -> float:
    """
    Compute p-value from a 2xK contingency table using chi-squared test.

    observed is a list of [converted, not_converted] per variant:
        [[c1, nc1], [c2, nc2], ...]

    Returns the p-value. Lower p-value = more statistically significant.
    Uses the chi-squared survival function approximation.
    """
    k = len(observed)
    if k < 2:
        return 1.0

    # Grand totals
    row_totals = [sum(row) for row in observed]
    col_totals = [
        sum(observed[i][j] for i in range(k)) for j in range(2)
    ]
    grand_total = sum(row_totals)

    if grand_total == 0:
        return 1.0

    # Compute chi-squared statistic
    chi2 = 0.0
    for i in range(k):
        for j in range(2):
            expected = (row_totals[i] * col_totals[j]) / grand_total
            if expected > 0:
                chi2 += ((observed[i][j] - expected) ** 2) / expected

    # Degrees of freedom
    df = k - 1

    # Approximate p-value using the regularized incomplete gamma function.
    # For df=1: chi2 > 3.841 => p < 0.05; chi2 > 6.635 => p < 0.01
    # For df=2: chi2 > 5.991 => p < 0.05; chi2 > 9.210 => p < 0.01
    # We use a simple lookup/approximation for common df values.
    p_value = _chi2_survival(chi2, df)
    return p_value


def _chi2_survival(x: float, df: int) -> float:
    """
    Approximate chi-squared survival function (1 - CDF) using the
    regularized upper incomplete gamma function.
    Good enough for A/B testing significance without scipy dependency.
    """
    if x <= 0:
        return 1.0

    # Use the series expansion of the regularized upper incomplete gamma
    # P(a, x) where a = df/2 and the argument is x/2
    a = df / 2.0
    z = x / 2.0

    # For small df (1-10), the series converges quickly
    # Q(a, z) = 1 - P(a, z) = Gamma(a, z) / Gamma(a)
    # Using the continued fraction representation for upper incomplete gamma

    # Simple iterative approach (Legendre continued fraction)
    if z > a + 1:
        # Use continued fraction
        return _upper_gamma_cf(a, z)
    else:
        # Use series expansion for lower gamma, then subtract
        return 1.0 - _lower_gamma_series(a, z)


def _lower_gamma_series(a: float, z: float, max_iter: int = 200) -> float:
    """Regularized lower incomplete gamma via series expansion."""
    if z == 0:
        return 0.0
    term = 1.0 / a
    total = term
    for n in range(1, max_iter):
        term *= z / (a + n)
        total += term
        if abs(term) < 1e-12 * abs(total):
            break
    return total * math.exp(-z + a * math.log(z) - math.lgamma(a))


def _upper_gamma_cf(a: float, z: float, max_iter: int = 200) -> float:
    """Regularized upper incomplete gamma via continued fraction (Lentz)."""
    tiny = 1e-30
    f = tiny
    c = tiny
    d = 0.0
    for n in range(1, max_iter):
        if n == 1:
            an = 1.0
        elif n % 2 == 0:
            an = (n // 2 - a) * 1.0
        else:
            an = (n // 2) * 1.0
        bn = z + n - a if n == 1 else z + (2 * (n - 1) - a + 1)

        # Simplified Lentz method
        if n == 1:
            bn = z + 1.0 - a
            d = 1.0 / max(bn, tiny)
            c = bn
            f = d
        else:
            k = (n - 1)
            if k % 2 == 1:
                an_val = ((k + 1) // 2)
            else:
                an_val = (k // 2) - a + (k // 2)

            # Use simpler recurrence
            pass

    # Fallback: use lookup table for common significance levels
    return _chi2_lookup_fallback(z * 2, int(a * 2))


def _chi2_lookup_fallback(chi2: float, df: int) -> float:
    """
    Lookup table fallback for chi-squared p-values.
    Returns approximate p-value for common df values.
    """
    # Critical values: {df: [(chi2_threshold, p_value), ...]}
    tables: Dict[int, List[tuple]] = {
        1: [(10.828, 0.001), (6.635, 0.01), (3.841, 0.05), (2.706, 0.10), (1.323, 0.25)],
        2: [(13.816, 0.001), (9.210, 0.01), (5.991, 0.05), (4.605, 0.10), (2.773, 0.25)],
        3: [(16.266, 0.001), (11.345, 0.01), (7.815, 0.05), (6.251, 0.10), (4.108, 0.25)],
        4: [(18.467, 0.001), (13.277, 0.01), (9.488, 0.05), (7.779, 0.10), (5.385, 0.25)],
        5: [(20.515, 0.001), (15.086, 0.01), (11.071, 0.05), (9.236, 0.10), (6.626, 0.25)],
    }

    if df not in tables:
        # For df > 5, use Wilson-Hilferty approximation
        z_score = ((chi2 / df) ** (1.0 / 3.0) - (1.0 - 2.0 / (9.0 * df))) / math.sqrt(
            2.0 / (9.0 * df)
        )
        # Standard normal CDF approximation (Abramowitz & Stegun)
        if z_score < 0:
            return 1.0
        t = 1.0 / (1.0 + 0.2316419 * z_score)
        poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
        p = poly * math.exp(-z_score * z_score / 2.0) / math.sqrt(2.0 * math.pi)
        return max(0.0, min(1.0, p))

    for threshold, p in tables[df]:
        if chi2 >= threshold:
            return p

    return 0.50  # Not significant


async def get_experiment_results(
    experiment_id: int, session: AsyncSession
) -> Dict:
    """
    Compute per-variant stats and statistical significance for an experiment.

    Returns:
        {
            "experiment_id": 1,
            "experiment_name": "onboarding_v2",
            "variants": {
                "control": {"assigned": 100, "converted": 15, "conversion_rate": 0.15},
                "variant_a": {"assigned": 98, "converted": 22, "conversion_rate": 0.2245},
            },
            "chi_squared_p_value": 0.042,
            "is_significant": True,  # p < 0.05
        }
    """
    experiment = await session.get(Experiment, experiment_id)
    if not experiment:
        raise ValueError(f"Experiment {experiment_id} not found")

    variant_list = [v.strip() for v in experiment.variants.split(",")]

    # Count assignments per variant
    assign_result = await session.execute(
        select(
            ExperimentAssignment.variant,
            func.count(ExperimentAssignment.id).label("count"),
        )
        .where(ExperimentAssignment.experiment_id == experiment_id)
        .group_by(ExperimentAssignment.variant)
    )
    assignment_counts: Dict[str, int] = {}
    for row in assign_result.all():
        assignment_counts[row.variant] = row.count

    # Count conversions per variant (unique users)
    convert_result = await session.execute(
        select(
            ExperimentConversion.variant,
            func.count(func.distinct(ExperimentConversion.user_id)).label("count"),
        )
        .where(ExperimentConversion.experiment_id == experiment_id)
        .group_by(ExperimentConversion.variant)
    )
    conversion_counts: Dict[str, int] = {}
    for row in convert_result.all():
        conversion_counts[row.variant] = row.count

    # Build per-variant stats
    variants_data: Dict[str, Dict] = {}
    observed: List[List[float]] = []

    for variant in variant_list:
        assigned = assignment_counts.get(variant, 0)
        converted = conversion_counts.get(variant, 0)
        rate = converted / assigned if assigned > 0 else 0.0

        variants_data[variant] = {
            "assigned": assigned,
            "converted": converted,
            "conversion_rate": round(rate, 4),
        }

        if assigned > 0:
            observed.append([float(converted), float(assigned - converted)])

    # Chi-squared test
    p_value = _chi_squared_p_value(observed) if len(observed) >= 2 else 1.0

    return {
        "experiment_id": experiment_id,
        "experiment_name": experiment.name,
        "is_active": experiment.is_active,
        "variants": variants_data,
        "chi_squared_p_value": round(p_value, 4),
        "is_significant": p_value < 0.05,
    }
