import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from .core.database import create_db_and_tables
from .core.config import settings
from .routers import auth_router, activities_router, foods_router, meals_router, nutrition_profile_router, onboarding_router, ai_food_router, subscriptions_router

logger = logging.getLogger(__name__)

try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.util import get_remote_address
    from slowapi.errors import RateLimitExceeded
    _slowapi_available = True
except ImportError:
    _slowapi_available = False


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
        response.headers.pop("server", None)
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await create_db_and_tables()

    # Warm Redis connection pool
    from .core.token_store import get_redis
    try:
        get_redis()
    except Exception:
        pass  # Redis unavailable at startup — will degrade gracefully per request

    yield
    # Shutdown (if needed)


# SEC: Disable interactive API docs in production to reduce attack surface
_docs_url = None if settings.is_production else "/docs"
_redoc_url = None if settings.is_production else "/redoc"

app = FastAPI(
    title="Calendar API",
    description="A REST API for managing calendar activities with user authentication",
    version="1.0.0",
    lifespan=lifespan,
    redirect_slashes=False,
    docs_url=_docs_url,
    redoc_url=_redoc_url,
    openapi_url=None if settings.is_production else "/openapi.json",
)

# Register slowapi rate limiter if available
if _slowapi_available:
    limiter = Limiter(key_func=get_remote_address)
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Security headers (must be added before CORS so headers are present on all responses)
app.add_middleware(SecurityHeadersMiddleware)

# GZip compression for API responses
app.add_middleware(GZipMiddleware, minimum_size=500)

# Configure CORS — SEC: Use explicit methods/headers instead of wildcards
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=settings.cors_methods,
    allow_headers=settings.cors_headers,
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


@app.get("/", tags=["root"])
async def read_root():
    return {"message": "Calendar API is running!"}


@app.get("/health", tags=["health"])
async def health_check():
    """
    Production health check.
    Returns 200 with component statuses, or 503 if any critical dependency is down.
    SEC: Does not leak infrastructure details (connection strings, versions, error messages).
    """
    from sqlalchemy import text as sa_text
    from .core.database import async_engine
    from .core.token_store import get_redis

    health: dict = {"status": "healthy"}
    degraded = False

    # --- DB check ---
    try:
        async with async_engine.connect() as conn:
            await conn.execute(sa_text("SELECT 1"))
    except Exception as exc:
        logger.warning("Health check: DB unavailable — %s", exc)
        health["db"] = "unavailable"
        degraded = True

    # --- Redis check ---
    try:
        r = get_redis()
        await r.ping()
    except Exception as exc:
        logger.warning("Health check: Redis unavailable — %s", exc)
        health["redis"] = "unavailable"
        degraded = True

    if degraded:
        health["status"] = "degraded"
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=503, content=health)

    return health
