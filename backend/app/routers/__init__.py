from .auth import router as auth_router
from .activities import router as activities_router
from .foods import router as foods_router
from .meals import router as meals_router
from .nutrition_profile import router as nutrition_profile_router
from .onboarding import router as onboarding_router
from .ai_food import router as ai_food_router
from .subscriptions import router as subscriptions_router

__all__ = [
    "auth_router",
    "activities_router",
    "foods_router",
    "meals_router",
    "nutrition_profile_router",
    "onboarding_router",
    "ai_food_router",
    "subscriptions_router",
]