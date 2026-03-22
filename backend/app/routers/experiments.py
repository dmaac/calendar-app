"""
Experiments router — A/B Testing endpoints
───────────────────────────────────────────
GET  /api/experiments/active                    — list active experiments
GET  /api/experiments/variant/{experiment_id}   — get user's variant assignment
POST /api/experiments/convert/{experiment_id}   — record a conversion event
GET  /api/experiments/results/{experiment_id}   — view experiment results (admin)
POST /api/experiments                           — create a new experiment (admin)
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel.ext.asyncio.session import AsyncSession

from ..core.database import get_session
from ..models.user import User
from ..services.ab_testing_service import (
    assign_variant,
    get_active_experiments,
    get_experiment_results,
    record_conversion,
)
from .auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/experiments", tags=["experiments"])


# ─── Request / Response schemas ──────────────────────────────────────────────


class ExperimentOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    variants: str
    is_active: bool


class VariantOut(BaseModel):
    experiment_id: int
    variant: str


class ConversionIn(BaseModel):
    conversion_event: Optional[str] = None


class ConversionOut(BaseModel):
    experiment_id: int
    variant: str
    conversion_event: Optional[str] = None
    recorded: bool = True


class ExperimentCreate(BaseModel):
    name: str
    description: Optional[str] = None
    variants: str = "control,variant_a,variant_b"


class ExperimentResultsOut(BaseModel):
    experiment_id: int
    experiment_name: str
    is_active: bool
    variants: dict
    chi_squared_p_value: float
    is_significant: bool


# ─── Endpoints ───────────────────────────────────────────────────────────────


@router.get("/active", response_model=List[ExperimentOut])
async def list_active_experiments(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Return all currently active experiments."""
    experiments = await get_active_experiments(session)
    return [
        ExperimentOut(
            id=exp.id,
            name=exp.name,
            description=exp.description,
            variants=exp.variants,
            is_active=exp.is_active,
        )
        for exp in experiments
    ]


@router.get("/variant/{experiment_id}", response_model=VariantOut)
async def get_user_variant(
    experiment_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Get the variant assigned to the current user for the given experiment.
    If the user has no assignment yet, one is created via consistent hashing.
    """
    try:
        variant = await assign_variant(current_user.id, experiment_id, session)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        )
    return VariantOut(experiment_id=experiment_id, variant=variant)


@router.post("/convert/{experiment_id}", response_model=ConversionOut)
async def convert(
    experiment_id: int,
    body: Optional[ConversionIn] = None,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Record a conversion event for the current user in the given experiment."""
    event = body.conversion_event if body else None
    try:
        conversion = await record_conversion(
            current_user.id, experiment_id, event, session
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        )
    return ConversionOut(
        experiment_id=experiment_id,
        variant=conversion.variant,
        conversion_event=conversion.conversion_event,
        recorded=True,
    )


@router.get("/results/{experiment_id}", response_model=ExperimentResultsOut)
async def experiment_results(
    experiment_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    View experiment results with per-variant conversion rates and significance.
    Requires admin privileges.
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    try:
        results = await get_experiment_results(experiment_id, session)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        )
    return ExperimentResultsOut(**results)


@router.post("", response_model=ExperimentOut, status_code=status.HTTP_201_CREATED)
async def create_experiment(
    body: ExperimentCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Create a new A/B experiment. Requires admin privileges."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    from ..models.experiment import Experiment

    # Validate variants format
    variant_list = [v.strip() for v in body.variants.split(",")]
    if len(variant_list) < 2:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least 2 variants are required (comma-separated)",
        )

    experiment = Experiment(
        name=body.name,
        description=body.description,
        variants=",".join(variant_list),
        is_active=True,
    )
    session.add(experiment)
    await session.commit()
    await session.refresh(experiment)

    logger.info("Experiment created: id=%d name=%s variants=%s", experiment.id, experiment.name, experiment.variants)

    return ExperimentOut(
        id=experiment.id,
        name=experiment.name,
        description=experiment.description,
        variants=experiment.variants,
        is_active=experiment.is_active,
    )
