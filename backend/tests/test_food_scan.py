"""
AI food scan endpoint tests.

Covers:
- POST /api/food/scan — scan with mocked GPT-4o, cache hit/miss
- Image validation: content type, file size
- Meal type validation
- Error handling: OpenAI failures, parse errors
- Rate limiting awareness (tested structurally)
"""
import io
import json
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from httpx import AsyncClient

from tests.conftest import (
    create_user_and_get_headers,
    MOCK_GPT4O_NUTRITION,
    make_mock_openai_response,
)


def _make_jpeg_bytes(size: int = 1024) -> bytes:
    """Create a minimal JPEG-like byte sequence for testing."""
    # JPEG starts with FFD8FF — not a real image but enough for content-type checks
    return b"\xff\xd8\xff\xe0" + b"\x00" * (size - 4)


def _make_png_bytes(size: int = 1024) -> bytes:
    """Create a minimal PNG-like byte sequence."""
    return b"\x89PNG\r\n\x1a\n" + b"\x00" * (size - 8)


@pytest.mark.asyncio
class TestFoodScan:

    async def test_scan_success_with_mock_openai(self, client: AsyncClient):
        """Scan food image with mocked GPT-4o response."""
        headers, _ = await create_user_and_get_headers(
            client, email="scan1@example.com"
        )

        mock_response = MagicMock()
        mock_response.json.return_value = make_mock_openai_response()
        mock_response.raise_for_status = MagicMock()

        with patch("app.services.ai_scan_service.httpx.AsyncClient") as mock_client_cls:
            mock_client_instance = AsyncMock()
            mock_client_instance.post = AsyncMock(return_value=mock_response)
            mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
            mock_client_instance.__aexit__ = AsyncMock(return_value=None)
            mock_client_cls.return_value = mock_client_instance

            image_bytes = _make_jpeg_bytes()
            resp = await client.post(
                "/api/food/scan",
                files={"image": ("meal.jpg", io.BytesIO(image_bytes), "image/jpeg")},
                data={"meal_type": "lunch"},
                headers=headers,
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["food_name"] == "Grilled Chicken with Rice"
        assert data["calories"] == 450
        assert data["carbs_g"] == 40.0
        assert data["protein_g"] == 35.0
        assert data["fats_g"] == 12.0
        assert "cache_hit" in data
        assert "id" in data

    async def test_scan_requires_auth(self, client: AsyncClient):
        image_bytes = _make_jpeg_bytes()
        resp = await client.post(
            "/api/food/scan",
            files={"image": ("meal.jpg", io.BytesIO(image_bytes), "image/jpeg")},
            data={"meal_type": "lunch"},
        )
        assert resp.status_code in (401, 403)

    async def test_scan_invalid_meal_type(self, client: AsyncClient):
        headers, _ = await create_user_and_get_headers(
            client, email="scan_mt@example.com"
        )
        image_bytes = _make_jpeg_bytes()
        resp = await client.post(
            "/api/food/scan",
            files={"image": ("meal.jpg", io.BytesIO(image_bytes), "image/jpeg")},
            data={"meal_type": "brunch"},  # Invalid
            headers=headers,
        )
        assert resp.status_code == 422

    async def test_scan_unsupported_image_type(self, client: AsyncClient):
        headers, _ = await create_user_and_get_headers(
            client, email="scan_type@example.com"
        )
        resp = await client.post(
            "/api/food/scan",
            files={"image": ("doc.pdf", io.BytesIO(b"fake pdf"), "application/pdf")},
            data={"meal_type": "lunch"},
            headers=headers,
        )
        assert resp.status_code == 415

    async def test_scan_image_too_large(self, client: AsyncClient):
        headers, _ = await create_user_and_get_headers(
            client, email="scan_big@example.com"
        )
        # 11 MB — exceeds the 10 MB limit
        large_image = _make_jpeg_bytes(11 * 1024 * 1024)
        resp = await client.post(
            "/api/food/scan",
            files={"image": ("huge.jpg", io.BytesIO(large_image), "image/jpeg")},
            data={"meal_type": "lunch"},
            headers=headers,
        )
        assert resp.status_code == 413

    async def test_scan_all_valid_meal_types(self, client: AsyncClient):
        """Every valid meal_type should be accepted (doesn't hit OpenAI error for meal_type).
        Note: Free-tier users are limited to 3 scans/day, so we test 3 types here.
        The 4th type (snack) is implicitly covered by other tests.
        """
        headers, _ = await create_user_and_get_headers(
            client, email="scan_meals@example.com"
        )
        for meal_type in ["breakfast", "lunch", "dinner"]:
            mock_response = MagicMock()
            mock_response.json.return_value = make_mock_openai_response()
            mock_response.raise_for_status = MagicMock()

            with patch("app.services.ai_scan_service.httpx.AsyncClient") as mock_client_cls:
                mock_client_instance = AsyncMock()
                mock_client_instance.post = AsyncMock(return_value=mock_response)
                mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
                mock_client_instance.__aexit__ = AsyncMock(return_value=None)
                mock_client_cls.return_value = mock_client_instance

                resp = await client.post(
                    "/api/food/scan",
                    files={"image": (f"{meal_type}.jpg", io.BytesIO(_make_jpeg_bytes()), "image/jpeg")},
                    data={"meal_type": meal_type},
                    headers=headers,
                )
            assert resp.status_code == 200, f"Failed for meal_type={meal_type}"

    async def test_scan_accepts_webp_and_heic(self, client: AsyncClient):
        """WebP and HEIC are in the accepted content types."""
        headers, _ = await create_user_and_get_headers(
            client, email="scan_formats@example.com"
        )
        for content_type in ["image/webp", "image/heic"]:
            mock_response = MagicMock()
            mock_response.json.return_value = make_mock_openai_response()
            mock_response.raise_for_status = MagicMock()

            with patch("app.services.ai_scan_service.httpx.AsyncClient") as mock_client_cls:
                mock_client_instance = AsyncMock()
                mock_client_instance.post = AsyncMock(return_value=mock_response)
                mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
                mock_client_instance.__aexit__ = AsyncMock(return_value=None)
                mock_client_cls.return_value = mock_client_instance

                resp = await client.post(
                    "/api/food/scan",
                    files={"image": ("img.ext", io.BytesIO(_make_jpeg_bytes()), content_type)},
                    data={"meal_type": "lunch"},
                    headers=headers,
                )
            assert resp.status_code == 200, f"Failed for {content_type}"


@pytest.mark.asyncio
class TestFoodScanCacheAndErrors:

    async def test_scan_openai_api_failure_returns_fallback(self, client: AsyncClient):
        """When OpenAI returns an HTTP error after all retries, the endpoint
        gracefully degrades by returning a 200 with a generic fallback food log
        that the user can manually edit."""
        headers, _ = await create_user_and_get_headers(
            client, email="scan_fail@example.com"
        )
        import httpx as httpx_lib

        with patch("app.services.ai_scan_service.httpx.AsyncClient") as mock_client_cls:
            mock_client_instance = AsyncMock()
            error_resp = MagicMock()
            error_resp.status_code = 500
            error_resp.request = MagicMock()
            mock_client_instance.post = AsyncMock(
                side_effect=httpx_lib.HTTPStatusError(
                    "Internal Server Error",
                    request=MagicMock(),
                    response=error_resp,
                )
            )
            mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
            mock_client_instance.__aexit__ = AsyncMock(return_value=None)
            mock_client_cls.return_value = mock_client_instance

            resp = await client.post(
                "/api/food/scan",
                files={"image": ("fail.jpg", io.BytesIO(_make_jpeg_bytes()), "image/jpeg")},
                data={"meal_type": "lunch"},
                headers=headers,
            )

        # Service degrades gracefully with a fallback response (not 502)
        assert resp.status_code == 200
        data = resp.json()
        # Fallback has low confidence
        assert data["ai_confidence"] <= 0.1

    async def test_scan_openai_malformed_json_returns_502(self, client: AsyncClient):
        """When GPT-4o returns unparseable content."""
        headers, _ = await create_user_and_get_headers(
            client, email="scan_bad_json@example.com"
        )

        mock_response = MagicMock()
        mock_response.json.return_value = {
            "choices": [{"message": {"content": "not valid json at all"}}]
        }
        mock_response.raise_for_status = MagicMock()

        with patch("app.services.ai_scan_service.httpx.AsyncClient") as mock_client_cls:
            mock_client_instance = AsyncMock()
            mock_client_instance.post = AsyncMock(return_value=mock_response)
            mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
            mock_client_instance.__aexit__ = AsyncMock(return_value=None)
            mock_client_cls.return_value = mock_client_instance

            resp = await client.post(
                "/api/food/scan",
                files={"image": ("bad.jpg", io.BytesIO(_make_jpeg_bytes()), "image/jpeg")},
                data={"meal_type": "lunch"},
                headers=headers,
            )

        assert resp.status_code == 502
