from .auth import router as auth_router
from .activities import router as activities_router
from .foods import router as foods_router
from .meals import router as meals_router
from .nutrition_profile import router as nutrition_profile_router

__all__ = [
    "auth_router",
    "activities_router",
    "foods_router",
    "meals_router",
    "nutrition_profile_router",
]