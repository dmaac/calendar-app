from .auth import router as auth_router
from .activities import router as activities_router
from .foods import router as foods_router
from .meals import router as meals_router
from .nutrition_profile import router as nutrition_profile_router
from .onboarding import router as onboarding_router
from .ai_food import router as ai_food_router
from .subscriptions import router as subscriptions_router
from .notifications import router as notifications_router
from .feedback import router as feedback_router
from .admin import router as admin_router
from .export import router as export_router
from .workouts import router as workouts_router
from .insights import router as insights_router
from .calories import router as calories_router
from .health_alerts import router as health_alerts_router
from .smart_notifications import router as smart_notifications_router
from .coach import router as coach_router
from .foods_catalog import router as foods_catalog_router
from .user_data import router as user_data_router
from .experiments import router as experiments_router
from .analytics import router as analytics_router
from .webhooks import router as webhooks_router
from .corporate import router as corporate_router
from .family import router as family_router
from .favorites import router as favorites_router

__all__ = [
    "auth_router",
    "activities_router",
    "foods_router",
    "meals_router",
    "nutrition_profile_router",
    "onboarding_router",
    "ai_food_router",
    "subscriptions_router",
    "notifications_router",
    "feedback_router",
    "admin_router",
    "export_router",
    "workouts_router",
    "insights_router",
    "calories_router",
    "health_alerts_router",
    "smart_notifications_router",
    "coach_router",
    "foods_catalog_router",
    "user_data_router",
    "experiments_router",
    "analytics_router",
    "webhooks_router",
    "corporate_router",
    "family_router",
    "favorites_router",
]