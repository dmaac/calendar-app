from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from .core.database import create_db_and_tables
from .core.config import settings
from .routers import auth_router, activities_router, foods_router, meals_router, nutrition_profile_router, onboarding_router, ai_food_router, subscriptions_router

try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.util import get_remote_address
    from slowapi.errors import RateLimitExceeded
    _slowapi_available = True
except ImportError:
    _slowapi_available = False


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


app = FastAPI(
    title="Calendar API",
    description="A REST API for managing calendar activities with user authentication",
    version="1.0.0",
    lifespan=lifespan,
    redirect_slashes=False,
)

# Register slowapi rate limiter if available
if _slowapi_available:
    limiter = Limiter(key_func=get_remote_address)
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# GZip compression for API responses
app.add_middleware(GZipMiddleware, minimum_size=500)

# Configure CORS for React Native + Web
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
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
