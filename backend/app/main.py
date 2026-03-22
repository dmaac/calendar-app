import asyncio
import json
import logging
import time
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
from .core.logging_config import setup_logging
from .core.response_cache import ResponseCacheMiddleware, response_cache_stats
from .core.validation import RequestValidationMiddleware
from .core.performance import PerformanceMiddleware, performance_stats
from .models.user import User
from .routers.admin import require_admin
from .routers import auth_router, activities_router, foods_router, meals_router, nutrition_profile_router, onboarding_router, ai_food_router, subscriptions_router, notifications_router, feedback_router, admin_router, export_router, workouts_router, insights_router, calories_router, health_alerts_router, smart_notifications_router, coach_router, foods_catalog_router, user_data_router, experiments_router, analytics_router, webhooks_router, corporate_router, family_router, favorites_router, alerts_router, risk_router, ai_usage_router, progress_router

logger = logging.getLogger(__name__)
request_logger = logging.getLogger("fitsi.requests")

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
        "name": "root",
        "description": "Root endpoint returning API status and version.",
    },
]


# ─── Correlation ID middleware ───────────────────────────────────────────────

class CorrelationIDMiddleware(BaseHTTPMiddleware):
    """
    Generates a unique X-Request-ID for each request (or reuses one from the client).
    Stores it in request.state and adds it to the response headers.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        request.state.request_id = request_id

        response: Response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


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

    _EXEMPT_PATHS = {"/health", "/api/health"}

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

    _EXEMPT_PATHS = {"/health", "/api/health", "/", "/docs", "/redoc", "/openapi.json"}

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
    Also feeds Prometheus-compatible metrics counters."""

    # Skip logging for noisy health/docs endpoints
    _SKIP_PATHS = {"/health", "/api/health", "/docs", "/redoc", "/openapi.json", "/metrics"}

    async def dispatch(self, request: Request, call_next):
        global _inflight_requests
        _inflight_requests += 1

        from .core.metrics import REQUEST_COUNT, REQUEST_DURATION, ACTIVE_CONNECTIONS
        ACTIVE_CONNECTIONS.inc()

        start = time.perf_counter()
        response: Response = await call_next(request)
        duration_s = time.perf_counter() - start
        duration_ms = round(duration_s * 1000, 2)

        _inflight_requests -= 1
        ACTIVE_CONNECTIONS.dec()

        path = request.url.path
        method = request.method

        # Track metrics for all paths (cheap operation)
        REQUEST_COUNT.inc(method=method, endpoint=path, status=str(response.status_code))
        REQUEST_DURATION.observe(duration_s, method=method, endpoint=path)

        if path in self._SKIP_PATHS:
            return response

        # Extract user_id from auth header if present (best-effort, no DB hit)
        user_id = None
        try:
            from .core.security import verify_token
            auth_header = request.headers.get("authorization", "")
            if auth_header.startswith("Bearer "):
                token = auth_header[7:]
                user_id = verify_token(token)
        except Exception:
            pass

        request_id = getattr(request.state, "request_id", None)

        log_data = {
            "endpoint": path,
            "method": method,
            "status_code": response.status_code,
            "duration_ms": duration_ms,
            "user_id": user_id,
            "request_id": request_id,
        }
        request_logger.info(json.dumps(log_data))

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
  FITSI IA API  v{APP_VERSION}
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

    # Startup
    await create_db_and_tables()
    db_ok = True

    # Warm Redis connection pool + cache
    from .core.token_store import get_redis
    from .core.cache import warm_cache
    redis_ok = False
    try:
        get_redis()
        await warm_cache()
        redis_ok = True
    except Exception:
        pass  # Redis unavailable at startup — will degrade gracefully per request

    # Print startup banner
    _print_startup_banner(db_ok=db_ok, redis_ok=redis_ok)

    # Initialize event bus and wire webhook dispatch handlers
    from .core.event_bus import event_bus  # noqa: F401 — ensure singleton is created
    import app.services.webhook_service  # noqa: F401 — auto-registers event_bus handlers
    logger.info("Event bus initialized with events: %s", event_bus.registered_events)

    # Start periodic background cleanup
    from .core.background_tasks import start_periodic_cleanup
    cleanup_task = asyncio.create_task(start_periodic_cleanup(interval_hours=24))

    yield

    # Shutdown — cancel periodic tasks, wait for in-flight requests
    cleanup_task.cancel()
    await _graceful_shutdown()


# SEC: Disable interactive API docs in production to reduce attack surface
_docs_url = None if settings.is_production else "/docs"
_redoc_url = None if settings.is_production else "/redoc"

app = FastAPI(
    title="Fitsi IA API",
    description=(
        "REST API for Fitsi IA — AI-powered nutrition tracking app.\n\n"
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


@app.get("/", tags=["root"])
async def read_root():
    return {"message": "Fitsi IA API is running!", "version": APP_VERSION}


async def _health_check_impl():
    """
    Production health check implementation.
    Returns dict with component statuses.
    SEC: Does not leak infrastructure details (connection strings, versions, error messages).
    """
    import os
    from sqlalchemy import text as sa_text
    from .core.database import async_engine
    from .core.token_store import get_redis

    uptime_seconds = round(time.time() - _start_time, 1) if _start_time else 0.0

    db_connected = False
    redis_connected = False

    # --- DB check ---
    try:
        async with async_engine.connect() as conn:
            await conn.execute(sa_text("SELECT 1"))
        db_connected = True
    except Exception as exc:
        logger.warning("Health check: DB unavailable — %s", exc)

    # --- Redis check ---
    try:
        r = get_redis()
        await r.ping()
        redis_connected = True
    except Exception as exc:
        logger.warning("Health check: Redis unavailable — %s", exc)

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

    health: dict = {
        "status": "healthy",
        "version": APP_VERSION,
        "uptime": uptime_seconds,
        "components": {
            "database": "connected" if db_connected else "unavailable",
            "redis": "connected" if redis_connected else "unavailable",
            "risk_engine": "operational" if risk_engine_ok else "unavailable",
            "recovery_plan": "operational" if recovery_plan_ok else "unavailable",
        },
        "db_connected": db_connected,
        "redis_connected": redis_connected,
        "active_workers": active_workers,
        "environment": settings.env,
        "inflight_requests": _inflight_requests,
    }

    if not db_connected or not redis_connected:
        health["status"] = "degraded"
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=503, content=health)

    return health


@app.get("/health", tags=["health"])
async def health_check():
    return await _health_check_impl()


@app.get("/api/health", tags=["health"])
async def api_health_check():
    return await _health_check_impl()


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
            )
        )
        active_today = active_result.scalar() or 0

        # Average meals per day (over the last 7 days)
        from datetime import timedelta
        week_ago = datetime.combine(today - timedelta(days=7), dt_time.min)
        avg_result = await session.execute(
            sa_text(
                "SELECT COALESCE(COUNT(*)::float / NULLIF(COUNT(DISTINCT DATE(logged_at)), 0), 0) "
                "FROM ai_food_log WHERE logged_at >= :since"
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
