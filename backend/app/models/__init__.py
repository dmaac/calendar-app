from .user import User
from .activity import Activity
from .food import Food
from .meal_log import MealLog
from .daily_nutrition_summary import DailyNutritionSummary
from .nutrition_profile import UserNutritionProfile
from .user_food_favorite import UserFoodFavorite
from .onboarding_profile import OnboardingProfile
from .ai_food_log import AIFoodLog
from .ai_scan_cache import AIScanCache
from .subscription import Subscription, WebhookEventLog
from .push_token import PushToken
from .feedback import Feedback
from .workout import WorkoutLog
from .experiment import Experiment, ExperimentAssignment, ExperimentConversion
from .nutrition_tip import NutritionTip
from .recipe import Recipe
from .webhook import Webhook, WebhookDelivery
from .corporate import (
    CorporateCompany,
    CorporateMembership,
    CorporateTeam,
    FamilyGroup,
    FamilyMembership,
)
from .nutrition_adherence import DailyNutritionAdherence
from .risk_analytics_event import RiskAnalyticsEvent
from .progress import (
    UserProgressProfile,
    AchievementDefinition,
    UserAchievement,
    DailyMission,
    UserDailyMissionStatus,
    WeeklyChallenge,
    UserWeeklyChallengeStatus,
    ProgressEvent,
    RewardCatalog,
    UserRewardRedemption,
)
from .food_recommendation import MealTemplate, MealIngredient, UserMealRecommendation
from .notification_schedule import NotificationSchedule
from .notification_log import NotificationLog
from .calorie_adjustment import CalorieAdjustment, WeightLog
from .audit_log import AuditLog
from .mixins import SoftDeleteMixin
from .data_integrity_snapshot import DataIntegritySnapshot
from .backup_registry import BackupRegistry
from .coach_conversation import CoachConversation
from .coach_cost_log import CoachCostLog
from .admin_error_log import AdminErrorLog
from .admin_action_log import AdminActionLog

# Register soft-delete protected models so the recovery API can find them.
from ..services.data_protection_service import register_protected_model as _reg
_reg(AIFoodLog)
_reg(DailyNutritionSummary)
_reg(OnboardingProfile)
_reg(UserFoodFavorite)
_reg(WeightLog)
del _reg

__all__ = [
    "User",
    "Activity",
    "Food",
    "MealLog",
    "DailyNutritionSummary",
    "UserNutritionProfile",
    "UserFoodFavorite",
    "OnboardingProfile",
    "AIFoodLog",
    "AIScanCache",
    "Subscription",
    "PushToken",
    "Feedback",
    "WorkoutLog",
    "Experiment",
    "ExperimentAssignment",
    "ExperimentConversion",
    "NutritionTip",
    "Recipe",
    "Webhook",
    "WebhookDelivery",
    "CorporateCompany",
    "CorporateMembership",
    "CorporateTeam",
    "FamilyGroup",
    "FamilyMembership",
    "DailyNutritionAdherence",
    "RiskAnalyticsEvent",
    "UserProgressProfile",
    "AchievementDefinition",
    "UserAchievement",
    "DailyMission",
    "UserDailyMissionStatus",
    "WeeklyChallenge",
    "UserWeeklyChallengeStatus",
    "ProgressEvent",
    "RewardCatalog",
    "UserRewardRedemption",
    "MealTemplate",
    "MealIngredient",
    "UserMealRecommendation",
    "NotificationSchedule",
    "NotificationLog",
    "CalorieAdjustment",
    "WeightLog",
    "AuditLog",
    "DataIntegritySnapshot",
    "BackupRegistry",
    "CoachConversation",
    "CoachCostLog",
    "AdminErrorLog",
    "AdminActionLog",
    "WebhookEventLog",
]