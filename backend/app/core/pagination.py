"""
Generic pagination utilities for Fitsi API.
Provides a page-based PaginatedResponse[T] and a helper to paginate SQLAlchemy queries.
"""

import math
from typing import Generic, List, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    """Page-based paginated response wrapper."""

    items: List[T]
    total: int = Field(description="Total number of items matching the query")
    page: int = Field(ge=1, description="Current page number (1-indexed)")
    page_size: int = Field(ge=1, description="Number of items per page")
    total_pages: int = Field(description="Total number of pages")
    has_next: bool = Field(description="Whether there is a next page")
    has_previous: bool = Field(description="Whether there is a previous page")


def build_paginated_response(
    items: List[T],
    total: int,
    page: int,
    page_size: int,
) -> PaginatedResponse[T]:
    """Build a PaginatedResponse from a list of items and metadata."""
    total_pages = max(1, math.ceil(total / page_size))
    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        has_next=page < total_pages,
        has_previous=page > 1,
    )


def paginate_params(page: int, page_size: int) -> tuple[int, int]:
    """Convert page/page_size to offset/limit for SQL queries."""
    offset = (page - 1) * page_size
    return offset, page_size
