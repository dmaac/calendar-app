/**
 * types/index.ts — Application type definitions
 *
 * This file contains:
 * 1. Re-exports from api.ts (canonical API contract types)
 * 2. App-local types (User, AuthState, etc.) that match backend schemas
 * 3. Legacy types for older endpoints (activities, meals, foods, nutrition-profile)
 *
 * IMPORTANT: All types here use snake_case to match the backend exactly.
 */

// ─── Re-export all API contract types ────────────────────────────────────────
export type {
  ApiErrorResponse,
  ValidationError,
  AuthRegisterRequest,
  AuthLoginRequest,
  AuthTokenResponse,
  AuthRefreshResponse,
  AuthRefreshRequest,
  AuthAppleRequest,
  AuthGoogleRequest,
  AuthUserResponse,
  AuthLogoutResponse,
  OnboardingStepRequest,
  OnboardingCompleteRequest,
  OnboardingProfileResponse,
  FoodScanRequest,
  FoodScanResponse,
  ManualFoodLogRequest,
  ManualFoodLogResponse,
  UpdateFoodLogRequest,
  UpdateFoodLogResponse,
  DeleteFoodLogResponse,
  FoodLogItem,
  FoodLogListResponse,
  FoodLogDetailResponse,
  FoodSearchItem,
  FoodSearchResponse,
  WaterLogRequest,
  WaterLogResponse,
  DashboardResponse,
  SubscriptionCreateRequest,
  SubscriptionResponse,
} from './api';

export type {
  MealType as ApiMealType,
  SubscriptionPlan as ApiSubscriptionPlan,
  SubscriptionStatus as ApiSubscriptionStatus,
  SubscriptionStore,
} from './api';

// ─── Auth ────────────────────────────────────────────────────────────────────

/**
 * User model — matches backend UserRead schema.
 *
 * Fixed vs previous version:
 *   - first_name/last_name: string | null (not optional string) — backend always returns the field
 *   - removed avatar_url (not in backend UserRead)
 *   - updated_at: string (not optional) — backend always returns it
 *   - provider: string (backend doesn't constrain to a union in the response)
 */
export interface User {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  is_active: boolean;
  is_premium: boolean;
  provider: string;            // 'email' | 'apple' | 'google'
  created_at: string;
  updated_at: string;
}

/**
 * AuthTokens — matches backend Token schema.
 * NOTE: user_id is only present on login/oauth responses, not refresh.
 */
export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  user_id?: number;
}

export interface AuthState {
  user: User | null;
  isLoading: boolean;
  isPremium: boolean;
  isAuthenticated: boolean;
  isOnboardingComplete: boolean;
}

export interface LoginRequest {
  username: string;  // email (OAuth2 form spec)
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
}

export interface AppleAuthRequest {
  identity_token: string;
  authorization_code: string;
  first_name?: string;
  last_name?: string;
}

export interface GoogleAuthRequest {
  id_token: string;
}

// ─── Onboarding ──────────────────────────────────────────────────────────────

/**
 * OnboardingProfileRead — matches backend OnboardingProfileRead schema exactly.
 *
 * Fixed vs previous version:
 *   - Added id, created_at, updated_at (backend returns these)
 *   - workouts_per_week: number | null (not string — backend is Optional[int])
 *   - pain_points: string | null (JSON string, NOT string[] — backend stores as text)
 *   - accomplishments: string | null (JSON string, NOT string[])
 *   - unit_system: string (not optional — backend has default "metric")
 *   - weekly_speed_kg: number (not optional — backend has default 0.8)
 *   - health_connected: boolean (not optional — backend has default false)
 *   - notifications_enabled: boolean (not optional — backend has default false)
 */
export interface OnboardingProfileRead {
  id: number;
  user_id: number;
  gender: string | null;
  workouts_per_week: number | null;
  heard_from: string | null;
  used_other_apps: boolean | null;
  height_cm: number | null;
  weight_kg: number | null;
  unit_system: string;
  birth_date: string | null;
  goal: string | null;
  target_weight_kg: number | null;
  weekly_speed_kg: number;
  pain_points: string | null;         // JSON string — parse with JSON.parse() to get string[]
  diet_type: string | null;
  accomplishments: string | null;     // JSON string — parse with JSON.parse() to get string[]
  health_connected: boolean;
  notifications_enabled: boolean;
  referral_code: string | null;
  daily_calories: number | null;
  daily_carbs_g: number | null;
  daily_protein_g: number | null;
  daily_fats_g: number | null;
  health_score: number | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Food & AI Scan ──────────────────────────────────────────────────────────

/**
 * FoodScanResult — matches backend scan_and_log_food() return dict.
 *
 * Fixed vs previous version:
 *   - Added id (backend returns the created log id)
 *   - Added logged_at, meal_type (backend returns these)
 *   - Nullable fields use `| null` instead of `?` to match JSON null
 */
export interface FoodScanResult {
  id: number;
  food_name: string;
  calories: number;
  carbs_g: number;
  protein_g: number;
  fats_g: number;
  fiber_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
  serving_size: string | null;
  meal_type: string;
  logged_at: string;
  image_url: string | null;
  ai_confidence: number;
  cache_hit: boolean;
}

/**
 * AIFoodLog — matches backend get_food_logs() list item dict.
 *
 * Fixed vs previous version:
 *   - Removed user_id (not returned by backend list endpoint)
 *   - fiber_g, image_url, ai_confidence use `| null` not `?`
 */
export interface AIFoodLog {
  id: number;
  logged_at: string;
  meal_type: string;
  food_name: string;
  calories: number;
  carbs_g: number;
  protein_g: number;
  fats_g: number;
  fiber_g: number | null;
  image_url: string | null;
  ai_confidence: number | null;
  was_edited: boolean;
}

/**
 * DailySummary — matches backend get_daily_summary() return dict exactly.
 *
 * Fixed vs previous version:
 *   - All macro fields use _g suffix (total_protein_g, target_fats_g, etc.)
 *   - Removed legacy fields (total_protein, total_carbs, total_fat, etc.)
 *   - Removed meals_count alias — backend returns meals_logged only
 */
export interface DailySummary {
  date: string;
  total_calories: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fats_g: number;
  target_calories: number;
  target_protein_g: number;
  target_carbs_g: number;
  target_fats_g: number;
  water_ml: number;
  meals_logged: number;
  streak_days: number;
}

// ─── Subscription ─────────────────────────────────────────────────────────────

/**
 * Fixed vs previous version:
 *   - 'free' removed from SubscriptionPlan (backend only accepts monthly/annual/lifetime)
 *   - Added 'stripe' to store options
 */
export type SubscriptionPlan = 'monthly' | 'annual' | 'lifetime';
export type SubscriptionStatus = 'active' | 'expired' | 'cancelled' | 'trial';

/**
 * Subscription — matches backend SubscriptionRead Pydantic model exactly.
 *
 * Fixed vs previous version:
 *   - current_period_end renamed to current_period_ends_at (match backend field name)
 *   - store: includes 'stripe' option
 *   - Added created_at, updated_at (backend returns these)
 */
export interface Subscription {
  id: number;
  user_id: number;
  plan: string;
  status: string;
  price_paid: number | null;
  discount_pct: number | null;
  store: string | null;
  store_tx_id?: string;
  trial_ends_at: string | null;
  current_period_ends_at: string | null;   // WAS: current_period_end
  created_at: string;
  updated_at: string;
}

// ─── Legacy (existing endpoints, preserved) ──────────────────────────────────

export interface Activity {
  id: number;
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  user_id: number;
  created_at: string;
  updated_at: string;
}

export interface ActivityCreate {
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  status?: 'scheduled' | 'completed' | 'cancelled';
}

export interface Food {
  id: number;
  name: string;
  brand?: string;
  serving_size: number;
  serving_unit: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  is_verified: boolean;
  created_at: string;
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface MealLog {
  id: number;
  user_id: number;
  date: string;
  meal_type: MealType;
  food_id: number;
  servings: number;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  created_at: string;
  food_name?: string;
  food_brand?: string;
}

export interface MealLogCreate {
  date: string;
  meal_type: MealType;
  food_id: number;
  servings: number;
}

export type Gender = 'male' | 'female' | 'other';
export type ActivityLevelType = 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active' | 'extra_active';
export type NutritionGoalType = 'lose_weight' | 'maintain' | 'gain_muscle';

export interface NutritionProfile {
  id: number;
  user_id: number;
  height_cm?: number;
  weight_kg?: number;
  age?: number;
  gender?: Gender;
  activity_level: ActivityLevelType;
  goal: NutritionGoalType;
  target_calories: number;
  target_protein_g: number;
  target_carbs_g: number;
  target_fat_g: number;
  created_at: string;
  updated_at: string;
}

export interface NutritionProfileCreate {
  height_cm?: number;
  weight_kg?: number;
  age?: number;
  gender?: Gender;
  activity_level: ActivityLevelType;
  goal: NutritionGoalType;
}

export interface MacroTargets {
  target_calories: number;
  target_protein_g: number;
  target_carbs_g: number;
  target_fat_g: number;
}
