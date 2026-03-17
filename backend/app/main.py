from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .core.database import create_db_and_tables
from .routers import auth_router, activities_router, foods_router, meals_router, nutrition_profile_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    create_db_and_tables()
    yield
    # Shutdown (if needed)


app = FastAPI(
    title="Calendar API",
    description="A REST API for managing calendar activities with user authentication",
    version="1.0.0",
    lifespan=lifespan,
    redirect_slashes=False,
)

# Configure CORS for React Native
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router)
app.include_router(activities_router)
app.include_router(foods_router)
app.include_router(meals_router)
app.include_router(nutrition_profile_router)


@app.get("/", tags=["root"])
async def read_root():
    return {"message": "Calendar API is running!"}