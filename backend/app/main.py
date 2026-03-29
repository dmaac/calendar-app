import asyncio
import json
import logging
import sys
import time
import traceback
import uuid
from contextlib import asynccontextmanager
from packaging.version import Version, InvalidVersion
from fastapi import Depends, FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import RedirectResponse
from .core.database import create_db_and_tables
from .core.config import settings
from .core.versioning import APIVersionMiddleware
from .core.api_version import APIVersionHeaderMiddleware
from .core.etag import ETagMiddleware
from .core.idempotency import IdempotencyMiddleware
from .core.logging_config import setup_logging, request_id_var
from .core.response_cache import ResponseCacheMiddleware, response_cache_stats
from .core.validation import RequestValidationMiddleware
from .core.performance import PerformanceMiddleware, performance_stats
from .models.user import User
from .routers.admin import require_admin
from .routers import auth_router, activities_router, foods_router, meals_router, nutrition_profile_router, onboarding_router, ai_food_router, subscriptions_router, notifications_router, feedback_router, admin_router, export_router, workouts_router, insights_router, calories_router, health_alerts_router, smart_notifications_router, coach_router, foods_catalog_router, user_data_router, experiments_router, analytics_router, webhooks_router, corporate_router, family_router, favorites_router, alerts_router, risk_router, ai_usage_router, progress_router, recommendations_router, adaptive_calories_router, audit_router, recovery_router, backup_router
from .services.audit_service import AuditContextMiddleware

logger = logging.getLogger(__name__)
request_logger = logging.getLogger("fitsi.requests")
data_ops_logger = logging.getLogger("fitsi.data_operations")

APP_VERSION = "1.3.0"

# SEC: Minimum supported client version — reject clients older than this.
# Bump this when a critical security fix ships in the mobile app.
MIN_APP_VERSION = "1.0.0"

# Track server start time for uptime calculation
_start_time: float = 0.0

# Graceful shutdown — track in-flight requests
_inflight_requests: int = 0
_shutting_down: bool = False

try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.util import get_remote_address
    from slowapi.errors import RateLimitExceeded
    _slowapi_available = True
except ImportError:
    _slowapi_available = False


# ─── OpenAPI tags metadata ───────────────────────────────────────────────────

openapi_tags = [
    {
        "name": "authentication",
        "description": "User registration, login (email/Apple/Google), token refresh, and password management.",
    },
    {
        "name": "ai-food",
        "description": "AI-powered food scanning, manual food logging, water tracking, food search, and daily dashboard.",
    },
    {
        "name": "meals",
        "description": "Meal logging from the food database, daily/weekly summaries, history, and water intake.",
    },
    {
        "name": "foods",
        "description": "Food database CRUD: search, create, update, delete foods and manage favorites.",
    },
    {
        "name": "nutrition-profile",
        "description": "User nutrition profiles: calorie/macro targets, calculation from body metrics.",
    },
    {
        "name": "onboarding",
        "description": "30-step onboarding flow: save progress step-by-step, complete profile, and generate nutrition plan.",
    },
    {
        "name": "subscriptions",
        "description": "In-app purchase subscription management: create, verify, and query current plan.",
    },
    {
        "name": "notifications",
        "description": "Push notification token registration and notification delivery.",
    },
    {
        "name": "activities",
        "description": "Activity/exercise tracking: log workouts, view history.",
    },
    {
        "name": "workouts",
        "description": "Workout tracking: log exercises, view history, weekly summaries, and calorie estimation.",
    },
    {
        "name": "insights",
        "description": "Personalized daily insights: nutrition tips, hydration reminders, streak celebrations.",
    },
    {
        "name": "health",
        "description": "Server health checks with component status (DB, Redis, workers).",
    },
    {
        "name": "admin",
        "description": "Administrative endpoints: user stats and system metrics.",
    },
    {
        "name": "feedback",
        "description": "In-app feedback system: submit bugs, feature requests, complaints, and praise.",
    },
    {
        "name": "export",
        "description": "Data export: PDF nutrition reports, CSV food logs with date filtering, and full JSON data export.",
    },
    {
        "name": "calories",
        "description": "Calorie balance: consumed vs burned, net calories, deficit/surplus detection.",
    },
    {
        "name": "health-alerts",
        "description": "Nutritional health alerts: chronic deficit, low protein, missing fruits/vegetables.",
    },
    {
        "name": "smart-notifications",
        "description": "Smart notification scheduler: predicted meal times, inactivity nudges, streak celebrations.",
    },
    {
        "name": "coach",
        "description": "AI-powered nutrition coach: conversational chat, daily insights, and personalized meal suggestions.",
    },
    {
        "name": "foods-catalog",
        "description": "Public food catalog: browse all foods with pagination, category filters, and calorie ranges.",
    },
    {
        "name": "user-data",
        "description": "GDPR data rights: full data export (Article 20 portability) and data erasure (Article 17 right to be forgotten).",
    },
    {
        "name": "experiments",
        "description": "A/B testing: manage experiments, assign variants via consistent hashing, track conversions, and compute statistical significance.",
    },
    {
        "name": "analytics",
        "description": "Product analytics summary: DAU/WAU/MAU, retention (D1/D7/D30), feature usage breakdown, and revenue metrics.",
    },
    {
        "name": "webhooks",
        "description": "Webhook management: register endpoints, view delivery history, send test payloads. Events: meal_logged, goal_reached, streak_milestone, workout_logged.",
    },
    {
        "name": "corporate",
        "description": "Corporate Wellness: company registration, aggregated employee KPIs, team leaderboards, and employee invitations.",
    },
    {
        "name": "family",
        "description": "Family Plan: create family groups, invite members, view shared nutrition stats and daily summaries.",
    },
    {
        "name": "favorites",
        "description": "Smart Favorites: save, remove, and quick-log favorite foods with one tap.",
    },
    {
        "name": "nutrition-alerts",
        "description": "Daily nutrition alerts: inactivity detection, macro overshoots, hydration reminders, streak risk.",
    },
    {
        "name": "nutrition-risk",
        "description": "Nutrition risk engine: daily adherence scoring, 7-day risk summaries, trend detection, and automatic interventions.",
    },
    {
        "name": "ai-usage",
        "description": "AI token usage tracking: weekly budget, consumption, and tier information.",
    },
    {
        "name": "progress",
        "description": "Progress system: XP, levels, streaks, coins, achievements, daily missions, weekly challenges, reward shop, and celebrations.",
    },
    {
        "name": "recommendations",
        "description": "Personalized meal recommendations: get suggestions based on remaining daily macros, browse meal catalog, and log chosen meals.",
    },
    {
        "name": "adaptive-calories",
        "description": "Adaptive calorie target: weight logging, metabolic adjustment recommendations, and adjustment history.",
    },
    {
        "name": "audit",
        "description": "Immutable audit trail: query all INSERT/UPDATE/DELETE events on critical tables, investigate record history, track deletions, and manage retention.",
    },
    {
        "name": "backup",
        "description": "User data backup and point-in-time recovery: create snapshots, list backups, preview and restore data, clean up expired backups.",
    },
    {
        "name": "recovery",
        "description": "Admin data recovery: list soft-deleted records, restore individual records, and purge expired deletions.",
    },
    {
        "name": "root",
        "description": "Root endpoint returning API status and version.",
    },
]


# ─── Correlation ID middleware ───────────────────────────────────────────────

class CorrelationIDMiddleware(BaseHTTPMiddleware):
    """
    Generates a unique X-Request-ID for each request (or reuses one from the client).
    Stores it in request.state, sets the logging contextvar, and adds it to the
    response headers.  Every log line emitted during this request will automatically
    include the request_id thanks to ``request_id_var``.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        rid = request.headers.get("x-request-id") or str(uuid.uuid4())
        request.state.request_id = rid

        # Propagate to structured logging via contextvar
        token = request_id_var.set(rid)
        try:
            response: Response = await call_next(request)
            response.headers["X-Request-ID"] = rid
            return response
        finally:
            request_id_var.reset(token)


# ─── Security headers middleware ─────────────────────────────────────────────

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Adds standard security headers to every response.
    Mitigates XSS, clickjacking, MIME-sniffing, and information disclosure.
    """
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        if settings.is_production:
            response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
            response.headers["Content-Security-Policy"] = "default-src 'self'; frame-ancestors 'none'"
        # SEC: Strip server version headers
        if "server" in response.headers:
            del response.headers["server"]
        return response


# ─── HTTPS redirect middleware ───────────────────────────────────────────────

class HTTPSRedirectMiddleware(BaseHTTPMiddleware):
    """
    SEC: In production, redirect HTTP requests to HTTPS.
    Respects X-Forwarded-Proto from reverse proxies (AWS ALB, Cloudflare, etc.).
    Health check endpoints are exempt so load balancers work over plain HTTP.
    """

    _EXEMPT_PATHS = {"/health", "/api/health", "/health/live", "/health/ready"}

    async def dispatch(self, request: Request, call_next):
        if not settings.is_production:
            return await call_next(request)

        # Skip health checks — load balancers probe these over HTTP
        if request.url.path in self._EXEMPT_PATHS:
            return await call_next(request)

        proto = request.headers.get("x-forwarded-proto", request.url.scheme)
        if proto == "http":
            url = request.url.replace(scheme="https")
            return RedirectResponse(url=str(url), status_code=301)

        return await call_next(request)


# ─── App version validation middleware ───────────────────────────────────────

class AppVersionMiddleware(BaseHTTPMiddleware):
    """
    SEC: Reject requests from outdated mobile app versions.
    Clients must send X-App-Version header. Versions below MIN_APP_VERSION
    receive a 426 Upgrade Required response.
    Health/docs endpoints are exempt.
    """

    _EXEMPT_PATHS = {"/health", "/api/health", "/health/live", "/health/ready", "/", "/docs", "/redoc", "/openapi.json"}

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if path in self._EXEMPT_PATHS:
            return await call_next(request)

        app_version = request.headers.get("x-app-version")
        if app_version:
            try:
                if Version(app_version) < Version(MIN_APP_VERSION):
                    return JSONResponse(
                        status_code=426,
                        content={
                            "detail": "App version too old. Please update to the latest version.",
                            "min_version": MIN_APP_VERSION,
                        },
                    )
            except InvalidVersion:
                pass  # Non-semver value — allow through, don't block

        return await call_next(request)


# ─── Request logging middleware ──────────────────────────────────────────────

class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Logs each request in structured JSON: endpoint, method, status, duration, user_id, request_id.
    Also feeds Prometheus-compatible metrics counters.

    Data operation awareness:
      - DELETE requests: logged at WARNING level with inferred table name and user context.
      - Bulk mutations (POST/PUT/PATCH on batch endpoints): logged with record-count hints.
      - All data-mutating operations are emitted to 'fitsi.data_operations' for easy querying.
    """

    # Skip logging for noisy health/docs endpoints
    _SKIP_PATHS = {"/health", "/api/health", "/health/live", "/health/ready", "/docs", "/redoc", "/openapi.json", "/metrics"}

    # Threshold for logging slow requests (seconds)
    _SLOW_THRESHOLD_S = 1.0

    # Map URL path prefixes to the database table they affect.
    _PATH_TO_TABLE = {
        "/api/food/logs": "ai_food_log",
        "/api/food/scan": "ai_food_log",
        "/api/meals": "meal_log",
        "/api/activities": "activity",
        "/api/workouts": "workoutlog",
        "/api/favorites": "userfoodfavorite",
        "/api/subscriptions": "subscription",
        "/api/feedback": "feedback",
        "/api/onboarding": "onboarding_profile",
        "/api/nutrition-profile": "usernutritionprofile",
        "/api/admin/users": "user",
        "/api/webhooks": "webhook",
        "/api/experiments": "experiment",
        "/api/notifications": "push_token",
        "/api/daily-summary": "daily_nutrition_summary",
        "/api/weight": "weightlog",
        "/api/adaptive-calories": "calorie_adjustment",
    }

    def _infer_table(self, path: str) -> str:
        """Best-effort table inference from the request path."""
        for prefix, table in self._PATH_TO_TABLE.items():
            if path.startswith(prefix):
                return table
        parts = [p for p in path.split("/") if p and p != "api"]
        return parts[0] if parts else "unknown"

    async def dispatch(self, request: Request, call_next):
        global _inflight_requests
        _inflight_requests += 1

        from .core.metrics import (
            REQUEST_COUNT, REQUEST_DURATION, ACTIVE_CONNECTIONS,
            ERROR_COUNT, SLOW_REQUEST_COUNT, UNHANDLED_EXCEPTION_COUNT,
            record_active_user,
        )
        ACTIVE_CONNECTIONS.inc()

        start = time.perf_counter()

        # Best-effort user_id extraction (no DB hit) — done early so it
        # is available for both the exception path and the normal log path.
        user_id = None
        try:
            from .core.security import verify_token
            auth_header = request.headers.get("authorization", "")
            if auth_header.startswith("Bearer "):
                token = auth_header[7:]
                user_id = verify_token(token)
        except Exception:
            pass

        # Catch unhandled exceptions so we can track them in metrics
        try:
            response: Response = await call_next(request)
        except Exception as exc:
            duration_s = time.perf_counter() - start
            _inflight_requests -= 1
            ACTIVE_CONNECTIONS.dec()
            path = request.url.path
            UNHANDLED_EXCEPTION_COUNT.inc(
                exception_type=type(exc).__name__, endpoint=path,
            )
            request_id = getattr(request.state, "request_id", None)
            tb_str = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
            error_log_data = {
                "event": "unhandled_exception",
                "endpoint": path,
                "method": request.method,
                "user_id": user_id,
                "request_id": request_id,
                "duration_ms": round(duration_s * 1000, 2),
                "exception_type": type(exc).__name__,
                "exception_message": str(exc),
                "traceback": tb_str,
            }
            request_logger.error(json.dumps(error_log_data))
            raise

        duration_s = time.perf_counter() - start
        duration_ms = round(duration_s * 1000, 2)

        _inflight_requests -= 1
        ACTIVE_CONNECTIONS.dec()

        path = request.url.path
        method = request.method
        status_str = str(response.status_code)

        # Track metrics for all paths (cheap operation)
        REQUEST_COUNT.inc(method=method, endpoint=path, status=status_str)
        REQUEST_DURATION.observe(duration_s, method=method, endpoint=path)

        # Track error rates (4xx and 5xx)
        if response.status_code >= 400:
            ERROR_COUNT.inc(method=method, endpoint=path, status=status_str)

        # Track slow requests (> 1s)
        if duration_s > self._SLOW_THRESHOLD_S:
            SLOW_REQUEST_COUNT.inc(method=method, endpoint=path)

        if path in self._SKIP_PATHS:
            return response

        # Track active users for the 24h rolling window metric
        if user_id:
            record_active_user(str(user_id))

        request_id = getattr(request.state, "request_id", None)

        log_data = {
            "event": "http_request",
            "endpoint": path,
            "method": method,
            "status_code": response.status_code,
            "duration_ms": duration_ms,
            "user_id": user_id,
            "request_id": request_id,
        }

        # Use WARNING level for slow requests, ERROR for 5xx responses
        if response.status_code >= 500:
            log_data["slow"] = duration_s > self._SLOW_THRESHOLD_S
            # Include traceback if an exception handler stored it on request.state
            stored_tb = getattr(request.state, "_exc_traceback", None)
            stored_exc_type = getattr(request.state, "_exc_type", None)
            stored_exc_msg = getattr(request.state, "_exc_message", None)
            if stored_tb:
                log_data["traceback"] = stored_tb
                log_data["exception_type"] = stored_exc_type
                log_data["exception_message"] = stored_exc_msg
            # Also capture current sys.exc_info() if we are inside an exception context
            elif sys.exc_info()[2] is not None:
                log_data["traceback"] = "".join(traceback.format_exception(*sys.exc_info()))
            request_logger.error(json.dumps(log_data))
        elif duration_s > self._SLOW_THRESHOLD_S:
            log_data["slow"] = True
            request_logger.warning(json.dumps(log_data))
        else:
            request_logger.info(json.dumps(log_data))

        # ── Data operation logging ──────────────────────────────────────
        # Emit structured JSON to 'fitsi.data_operations' for all DELETE
        # requests and bulk mutations so they can be queried independently
        # during incident investigation.

        if method == "DELETE" and response.status_code < 500:
            from .core.metrics import DATA_DELETE_COUNT
            table = self._infer_table(path)
            DATA_DELETE_COUNT.inc(table=table)
            data_op = {
                "event": "data_delete",
                "endpoint": path,
                "method": method,
                "table": table,
                "status_code": response.status_code,
                "user_id": user_id,
                "request_id": request_id,
                "duration_ms": duration_ms,
                "ip": request.client.host if request.client else None,
                "user_agent": request.headers.get("user-agent", ""),
            }
            # Extract resource ID from path (e.g., /api/food/logs/42)
            path_parts = path.rstrip("/").split("/")
            if path_parts and path_parts[-1].isdigit():
                data_op["record_id"] = int(path_parts[-1])

            data_ops_logger.warning(json.dumps(data_op))

        elif method in ("POST", "PUT", "PATCH") and response.status_code < 500:
            is_bulk = (
                "bulk" in path.lower()
                or "batch" in path.lower()
                or "import" in path.lower()
            )
            if is_bulk or method == "POST":
                from .core.metrics import DATA_MUTATION_COUNT
                table = self._infer_table(path)
                op_type = "bulk_write" if is_bulk else "write"
                DATA_MUTATION_COUNT.inc(table=table, operation=op_type)
                data_op = {
                    "event": "data_mutation",
                    "operation": op_type,
                    "endpoint": path,
                    "method": method,
                    "table": table,
                    "status_code": response.status_code,
                    "user_id": user_id,
                    "request_id": request_id,
                    "duration_ms": duration_ms,
                    "is_bulk": is_bulk,
                }
                if is_bulk:
                    data_ops_logger.warning(json.dumps(data_op))
                else:
                    data_ops_logger.info(json.dumps(data_op))

        return response


# ─── Graceful shutdown ───────────────────────────────────────────────────────

async def _graceful_shutdown() -> None:
    """Wait for in-flight requests to complete before shutting down."""
    global _shutting_down
    _shutting_down = True
    logger.info("Graceful shutdown initiated — waiting for in-flight requests...")

    # Wait up to 30 seconds for in-flight requests to drain
    for _ in range(300):
        if _inflight_requests <= 0:
            break
        await asyncio.sleep(0.1)

    if _inflight_requests > 0:
        logger.warning(
            "Shutdown timeout: %d requests still in-flight, proceeding anyway.",
            _inflight_requests,
        )
    else:
        logger.info("All in-flight requests completed. Shutting down cleanly.")


def _print_startup_banner(db_ok: bool, redis_ok: bool) -> None:
    """Print a startup banner with server info to the console."""
    import multiprocessing
    import os

    workers = os.environ.get("WEB_CONCURRENCY", "1")
    uptime_str = "just started"

    banner = f"""
================================================================================
  FITSI AI API  v{APP_VERSION}
================================================================================
  Environment : {settings.env}
  Host        : {settings.server_host}:{settings.server_port}
  Workers     : {workers}
  DB Status   : {"CONNECTED" if db_ok else "UNAVAILABLE"}
  Redis Status: {"CONNECTED" if redis_ok else "UNAVAILABLE"}
  Docs        : {"disabled (production)" if settings.is_production else f"http://{settings.server_host}:{settings.server_port}/docs"}
  Uptime      : {uptime_str}
================================================================================
"""
    logger.info(banner)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _start_time
    _start_time = time.time()

    # Configure structured logging before anything else
    setup_logging(production=settings.is_production)

    logger.info(
        json.dumps({
            "event": "server_startup_begin",
            "version": APP_VERSION,
            "environment": settings.env,
            "host": settings.server_host,
            "port": settings.server_port,
            "pid": __import__("os").getpid(),
        })
    )

    # Startup
    db_ok = False
    try:
        await create_db_and_tables()
        db_ok = True
    except Exception as exc:
        logger.error("Database initialization failed: %s", exc, exc_info=True)

    # Warm Redis connection pool + cache
    from .core.token_store import get_redis
    from .core.cache import warm_cache
    redis_ok = False
    try:
        get_redis()
        await warm_cache()
        redis_ok = True
    except Exception as exc:
        logger.warning(
            "Redis unavailable at startup — degraded mode: %s", exc,
        )

    # Check AI API availability
    ai_available = False
    ai_provider = settings.ai_provider
    if settings.openai_api_key or settings.anthropic_api_key:
        ai_available = True
    logger.info(
        json.dumps({
            "event": "ai_provider_check",
            "ai_provider": ai_provider,
            "ai_available": ai_available,
            "openai_configured": bool(settings.openai_api_key),
            "anthropic_configured": bool(settings.anthropic_api_key),
        })
    )

    # Print startup banner
    _print_startup_banner(db_ok=db_ok, redis_ok=redis_ok)

    # Initialize event bus and wire webhook dispatch handlers
    from .core.event_bus import event_bus  # noqa: F401 — ensure singleton is created
    import app.services.webhook_service  # noqa: F401 — auto-registers event_bus handlers
    logger.info("Event bus initialized with events: %s", event_bus.registered_events)

    # Start periodic background cleanup
    from .core.background_tasks import start_periodic_cleanup
    cleanup_task = asyncio.create_task(start_periodic_cleanup(interval_hours=24))

    # Start data integrity checker (runs every hour)
    from .services.integrity_checker import start_integrity_checker
    integrity_task = asyncio.create_task(start_integrity_checker(interval_hours=1.0))

    # Start subscription expiry checker (runs every hour)
    # Expires subscriptions past current_period_ends_at and cleans up
    # stale pending_verification subscriptions older than 24 hours.
    async def _subscription_expiry_loop(interval_hours: float = 1.0):
        from .services.subscription_verification_service import (
            check_expired_subscriptions,
            expire_stale_pending_subscriptions,
        )
        while True:
            try:
                await asyncio.sleep(interval_hours * 3600)
                expired = await check_expired_subscriptions()
                stale = await expire_stale_pending_subscriptions(max_age_hours=24)
                if expired or stale:
                    logger.info(
                        "Subscription expiry check: expired=%d stale_pending=%d",
                        expired, stale,
                    )
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("Subscription expiry check failed")

    subscription_expiry_task = asyncio.create_task(_subscription_expiry_loop(interval_hours=1.0))

    startup_duration_ms = round((time.time() - _start_time) * 1000, 1)
    logger.info(
        json.dumps({
            "event": "server_startup_complete",
            "version": APP_VERSION,
            "environment": settings.env,
            "db_connected": db_ok,
            "redis_connected": redis_ok,
            "ai_available": ai_available,
            "startup_duration_ms": startup_duration_ms,
        })
    )

    yield

    # Shutdown — log event, cancel periodic tasks, close shared clients, drain requests
    shutdown_start = time.time()
    logger.info(
        json.dumps({
            "event": "server_shutdown_begin",
            "version": APP_VERSION,
            "uptime_seconds": round(time.time() - _start_time, 1),
            "inflight_requests": _inflight_requests,
        })
    )

    integrity_task.cancel()
    cleanup_task.cancel()
    subscription_expiry_task.cancel()
    from .services.ai_scan_service import close_http_client as close_scan_client
    from .services.claude_vision_service import close_http_client as close_claude_client
    await close_scan_client()
    await close_claude_client()
    await _graceful_shutdown()

    logger.info(
        json.dumps({
            "event": "server_shutdown_complete",
            "shutdown_duration_ms": round((time.time() - shutdown_start) * 1000, 1),
            "total_uptime_seconds": round(time.time() - _start_time, 1),
        })
    )


# SEC: Disable interactive API docs in production to reduce attack surface
_docs_url = None if settings.is_production else "/docs"
_redoc_url = None if settings.is_production else "/redoc"

app = FastAPI(
    title="Fitsi AI API",
    description=(
        "REST API for Fitsi AI — AI-powered nutrition tracking app.\n\n"
        "## Features\n"
        "- AI food scanning from photos (GPT-4o Vision)\n"
        "- Manual food logging and water tracking\n"
        "- Personalized nutrition plans from 30-step onboarding\n"
        "- Daily/weekly/monthly nutrition summaries\n"
        "- Freemium subscription model with in-app purchases\n\n"
        "## Versioning\n"
        "API version can be specified via `Accept-Version` header (e.g. `v1`, `v2`) "
        "or URL prefix (e.g. `/api/v1/food/logs`). Default: `v1`."
    ),
    version=APP_VERSION,
    lifespan=lifespan,
    redirect_slashes=False,
    docs_url=_docs_url,
    redoc_url=_redoc_url,
    openapi_url=None if settings.is_production else "/openapi.json",
    openapi_tags=openapi_tags,
)

# Register slowapi rate limiter if available
if _slowapi_available:
    limiter = Limiter(key_func=get_remote_address)
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# ─── Generic exception handler — stores traceback for the logging middleware ─
async def _generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch exceptions that route handlers raise but don't handle.

    Stores the full traceback on ``request.state`` so that
    ``RequestLoggingMiddleware`` can include it in the structured error log,
    then returns a standard 500 JSON response.
    """
    tb_str = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
    request.state._exc_traceback = tb_str
    request.state._exc_type = type(exc).__name__
    request.state._exc_message = str(exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


app.add_exception_handler(Exception, _generic_exception_handler)


# Correlation ID (outermost — so all other middleware can use request_id)
app.add_middleware(CorrelationIDMiddleware)

# SEC: HTTPS redirect (runs first in production)
app.add_middleware(HTTPSRedirectMiddleware)

# Security headers (must be added before CORS so headers are present on all responses)
app.add_middleware(SecurityHeadersMiddleware)

# SEC: Reject outdated app versions
app.add_middleware(AppVersionMiddleware)

# Request logging (tracks in-flight requests, includes request_id)
app.add_middleware(RequestLoggingMiddleware)

# Audit context — injects IP, user-agent, endpoint, request_id into request.state
# so the audit_trigger_fn in PostgreSQL can tag every row-level change
app.add_middleware(AuditContextMiddleware)

# Performance monitoring — X-Response-Time header + slow request logging
app.add_middleware(PerformanceMiddleware)

# Request body size validation — reject oversized payloads early
app.add_middleware(RequestValidationMiddleware)

# API versioning (detects version from Accept-Version header or URL prefix)
app.add_middleware(APIVersionMiddleware)

# API versioning via X-API-Version header or api_version query param.
# Added after (= inner = runs after) APIVersionMiddleware, so X-API-Version
# and ?api_version override Accept-Version when both are present.
app.add_middleware(APIVersionHeaderMiddleware)

# Response cache auto-invalidation on mutating requests (POST/PUT/PATCH/DELETE)
app.add_middleware(ResponseCacheMiddleware)

# ETag / conditional requests — returns 304 Not Modified when content unchanged
app.add_middleware(ETagMiddleware)

# Idempotency — deduplicates POST requests with X-Idempotency-Key header
app.add_middleware(IdempotencyMiddleware)

# GZip compression for API responses (min 500 bytes)
app.add_middleware(GZipMiddleware, minimum_size=500)

# Configure CORS — SEC: Use explicit methods/headers instead of wildcards
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=settings.cors_methods,
    allow_headers=settings.cors_headers,
    expose_headers=["ETag", "X-Request-ID", "X-Idempotent-Replayed", "X-Response-Time"],
)

# SEC: CSRF double-submit cookie protection for session/cookie-based endpoints.
# Bearer-token requests (mobile app) are automatically exempt.
from .core.csrf import CSRFMiddleware
app.add_middleware(CSRFMiddleware)

# Include routers
app.include_router(auth_router)
app.include_router(activities_router)
app.include_router(foods_router)
app.include_router(meals_router)
app.include_router(nutrition_profile_router)
app.include_router(onboarding_router, prefix="/api")
app.include_router(ai_food_router)
app.include_router(subscriptions_router)
app.include_router(notifications_router)
app.include_router(feedback_router)
app.include_router(admin_router)
app.include_router(export_router)
app.include_router(workouts_router)
app.include_router(insights_router)
app.include_router(calories_router)
app.include_router(health_alerts_router)
app.include_router(smart_notifications_router)
app.include_router(coach_router)
app.include_router(foods_catalog_router)
app.include_router(user_data_router)
app.include_router(experiments_router)
app.include_router(analytics_router)
app.include_router(webhooks_router)
app.include_router(corporate_router)
app.include_router(family_router)
app.include_router(favorites_router)
app.include_router(alerts_router)
app.include_router(risk_router)
app.include_router(ai_usage_router)
app.include_router(progress_router)
app.include_router(recommendations_router)
app.include_router(adaptive_calories_router)
app.include_router(audit_router)
app.include_router(recovery_router)
app.include_router(backup_router)


@app.get("/", tags=["root"])
async def read_root():
    return {"message": "Fitsi AI API is running!", "version": APP_VERSION}


async def _health_check_impl():
    """
    Comprehensive health check implementation.
    Checks: DB connection, Redis, AI API availability, internal services.
    Returns dict with component statuses and metrics snapshot.
    SEC: Does not leak infrastructure details (connection strings, versions, error messages).
    """
    import os
    from sqlalchemy import text as sa_text
    from .core.database import async_engine
    from .core.token_store import get_redis
    from .core.metrics import HEALTH_CHECK_COUNT, metrics_snapshot

    uptime_seconds = round(time.time() - _start_time, 1) if _start_time else 0.0

    db_connected = False
    db_latency_ms = 0.0
    redis_connected = False
    redis_latency_ms = 0.0
    ai_api_available = False

    # --- DB check (with latency measurement) ---
    try:
        db_start = time.perf_counter()
        async with async_engine.connect() as conn:
            await conn.execute(sa_text("SELECT 1"))
        db_latency_ms = round((time.perf_counter() - db_start) * 1000, 2)
        db_connected = True
    except Exception as exc:
        logger.warning("Health check: DB unavailable — %s", exc)

    # --- Redis check (with latency measurement) ---
    try:
        redis_start = time.perf_counter()
        r = get_redis()
        await r.ping()
        redis_latency_ms = round((time.perf_counter() - redis_start) * 1000, 2)
        redis_connected = True
    except Exception as exc:
        logger.warning("Health check: Redis unavailable — %s", exc)

    # --- AI API availability check ---
    # Verify that at least one AI provider has credentials configured.
    # Does NOT make an outbound call — just checks config readiness.
    if settings.ai_provider == "openai":
        ai_api_available = bool(settings.openai_api_key)
    elif settings.ai_provider == "claude":
        ai_api_available = bool(settings.anthropic_api_key)
    elif settings.ai_provider == "auto":
        ai_api_available = bool(settings.anthropic_api_key) or bool(settings.openai_api_key)
    else:
        ai_api_available = False

    # --- Active workers (Gunicorn/Uvicorn) ---
    active_workers = 1
    try:
        import multiprocessing
        active_workers = len(multiprocessing.active_children()) or 1
    except Exception:
        pass

    # --- Risk engine check ---
    risk_engine_ok = False
    try:
        from .services.nutrition_risk_service import calculate_daily_adherence
        risk_engine_ok = callable(calculate_daily_adherence)
    except Exception as exc:
        logger.warning("Health check: Risk engine unavailable — %s", exc)

    # --- Recovery plan service check ---
    recovery_plan_ok = False
    try:
        from .services.recovery_plan_service import generate_24h_recovery_plan
        recovery_plan_ok = callable(generate_24h_recovery_plan)
    except Exception as exc:
        logger.warning("Health check: Recovery plan service unavailable — %s", exc)

    # --- Data integrity monitor check ---
    data_monitor_ok = False
    try:
        from .services.data_monitor_service import DataMonitor
        data_monitor_ok = callable(DataMonitor.check_data_integrity)
    except Exception as exc:
        logger.warning("Health check: Data monitor unavailable — %s", exc)

    # Determine overall status
    if not db_connected:
        status = "unhealthy"
    elif not redis_connected:
        status = "degraded"
    else:
        status = "healthy"

    # Track health check result in metrics
    HEALTH_CHECK_COUNT.inc(result=status)

    health: dict = {
        "status": status,
        "version": APP_VERSION,
        "uptime_seconds": uptime_seconds,
        "components": {
            "database": {
                "status": "connected" if db_connected else "unavailable",
                "latency_ms": db_latency_ms,
            },
            "redis": {
                "status": "connected" if redis_connected else "unavailable",
                "latency_ms": redis_latency_ms,
            },
            "ai_api": {
                "status": "available" if ai_api_available else "unavailable",
                "provider": settings.ai_provider,
            },
            "risk_engine": "operational" if risk_engine_ok else "unavailable",
            "recovery_plan": "operational" if recovery_plan_ok else "unavailable",
            "data_monitor": "operational" if data_monitor_ok else "unavailable",
        },
        "db_connected": db_connected,
        "redis_connected": redis_connected,
        "ai_api_available": ai_api_available,
        "active_workers": active_workers,
        "environment": settings.env,
        "inflight_requests": _inflight_requests,
        "metrics": metrics_snapshot(),
    }

    if status != "healthy":
        return JSONResponse(status_code=503, content=health)

    return health


@app.get("/health", tags=["health"])
async def health_check():
    """Comprehensive health check: DB, Redis, AI API, internal services, and metrics."""
    return await _health_check_impl()


@app.get("/api/health", tags=["health"])
async def api_health_check():
    """Comprehensive health check (alias at /api/health)."""
    return await _health_check_impl()


@app.get("/health/live", tags=["health"])
async def liveness_probe():
    """Kubernetes-style liveness probe.

    Returns 200 as long as the process is alive and not in shutdown mode.
    Does NOT check external dependencies (DB, Redis) -- that is the job of
    the readiness probe.  A failing liveness probe tells the orchestrator to
    restart the container.
    """
    if _shutting_down:
        return JSONResponse(
            status_code=503,
            content={"status": "shutting_down"},
        )
    return {
        "status": "alive",
        "version": APP_VERSION,
        "uptime_seconds": round(time.time() - _start_time, 1) if _start_time else 0.0,
    }


@app.get("/health/ready", tags=["health"])
async def readiness_probe():
    """Kubernetes-style readiness probe.

    Returns 200 only when the service can handle traffic: DB must be connected.
    Redis degradation is tolerated (returns 200 with a warning) because the app
    can operate without it.  A failing readiness probe tells the load balancer
    to stop routing traffic to this instance.
    """
    from sqlalchemy import text as sa_text
    from .core.database import async_engine
    from .core.token_store import get_redis

    db_ok = False
    redis_ok = False

    try:
        async with async_engine.connect() as conn:
            await conn.execute(sa_text("SELECT 1"))
        db_ok = True
    except Exception:
        pass

    try:
        r = get_redis()
        await r.ping()
        redis_ok = True
    except Exception:
        pass

    if not db_ok:
        return JSONResponse(
            status_code=503,
            content={
                "status": "not_ready",
                "reason": "database_unavailable",
                "db_connected": False,
                "redis_connected": redis_ok,
            },
        )

    return {
        "status": "ready",
        "db_connected": True,
        "redis_connected": redis_ok,
    }


@app.get("/api/cache/stats", tags=["admin"])
async def get_cache_stats(
    current_user: User = Depends(require_admin),
):
    """Cache performance stats: hits, misses, hit ratio, total keys. Admin only."""
    from .core.cache import cache_stats
    try:
        return await cache_stats()
    except Exception as exc:
        return {"error": "Redis unavailable", "detail": str(exc)}


@app.get("/metrics", tags=["admin"], include_in_schema=False)
async def prometheus_metrics(
    current_user: User = Depends(require_admin),
):
    """Prometheus-compatible metrics endpoint. Admin only."""
    from .core.metrics import collect_metrics
    return Response(content=collect_metrics(), media_type="text/plain; charset=utf-8")


@app.get("/api/metrics/performance", tags=["admin"])
async def get_performance_metrics(
    current_user: User = Depends(require_admin),
):
    """Performance metrics: avg/p50/p95/p99 response times, slow requests, top slow endpoints. Admin only."""
    return performance_stats()


@app.get("/api/cache/response/stats", tags=["admin"])
async def get_response_cache_stats(
    current_user: User = Depends(require_admin),
):
    """In-memory response cache stats: hits, misses, hit ratio, entry count. Admin only."""
    return response_cache_stats()


@app.get("/api/circuit-breakers", tags=["admin"])
async def get_circuit_breaker_status(
    current_user: User = Depends(require_admin),
):
    """Status of all registered circuit breakers. Admin only."""
    from .core.circuit_breaker import all_breaker_statuses
    return {"breakers": all_breaker_statuses()}


@app.get("/api/stats/users", tags=["admin"])
async def get_user_stats(
    request: Request,
    current_user: User = Depends(require_admin),
):
    """
    Admin stats: total_users, active_today, premium_count, avg_meals_per_day.
    """
    from sqlalchemy import text as sa_text, func
    from sqlmodel import select
    from .core.database import AsyncSessionLocal
    from .models.user import User
    from .models.ai_food_log import AIFoodLog
    from datetime import date, datetime, time as dt_time

    async with AsyncSessionLocal() as session:
        # Total users
        total_result = await session.execute(
            select(func.count(User.id))
        )
        total_users = total_result.scalar() or 0

        # Premium count
        premium_result = await session.execute(
            select(func.count(User.id)).where(User.is_premium == True)
        )
        premium_count = premium_result.scalar() or 0

        # Active today (users who logged food today)
        today = date.today()
        today_start = datetime.combine(today, dt_time.min)
        today_end = datetime.combine(today, dt_time.max)
        active_result = await session.execute(
            select(func.count(func.distinct(AIFoodLog.user_id))).where(
                AIFoodLog.logged_at >= today_start,
                AIFoodLog.logged_at <= today_end,
                AIFoodLog.deleted_at.is_(None),
            )
        )
        active_today = active_result.scalar() or 0

        # Average meals per day (over the last 7 days)
        from datetime import timedelta
        week_ago = datetime.combine(today - timedelta(days=7), dt_time.min)
        avg_result = await session.execute(
            sa_text(
                "SELECT COALESCE(COUNT(*)::float / NULLIF(COUNT(DISTINCT DATE(logged_at)), 0), 0) "
                "FROM ai_food_log WHERE logged_at >= :since AND deleted_at IS NULL"
            ),
            {"since": week_ago},
        )
        avg_meals_per_day = round(float(avg_result.scalar() or 0), 1)

    return {
        "total_users": total_users,
        "active_today": active_today,
        "premium_count": premium_count,
        "avg_meals_per_day": avg_meals_per_day,
    }
