/**
 * api.ts — Canonical TypeScript types for all backend API contracts.
 *
 * Generated from backend router/schema analysis (2026-03-20).
 * Every type here corresponds 1:1 to a FastAPI request body, response model,
 * or inline dict returned by an endpoint.
 *
 * Naming convention:
 *   {Domain}{Action}Request  — request body sent TO backend
 *   {Domain}{Action}Response — response body received FROM backend
 *
 * IMPORTANT: The backend uses snake_case field names everywhere.
 * No camelCase conversion is applied — frontend must use snake_case too.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Common / Shared
// ═══════════════════════════════════════════════════════════════════════════════

/** Standard FastAPI error detail response (422, 400, 401, 404, etc.) */
export interface ApiErrorResponse {
  detail: string | ValidationError[];
}

/** FastAPI 422 validation error item */
export interface ValidationError {
  loc: (string | number)[];
  msg: string;
  type: string;
}

/** Meal type enum shared across food endpoints */
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

// ═══════════════════════════════════════════════════════════════════════════════
// Auth — /auth/*
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /auth/register
 * Content-Type: application/json
 * Body: UserCreate (Pydantic)
 * Response: UserRead (201)
 */
export interface AuthRegisterRequest {
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
}

/**
 * POST /auth/login
 * Content-Type: application/x-www-form-urlencoded (OAuth2PasswordRequestForm)
 * Response: Token schema
 *
 * NOTE: Login uses form-encoded, not JSON. The frontend must send URLSearchParams.
 */
export interface AuthLoginRequest {
  username: string;  // email — required by OAuth2 spec field name
  password: string;
}

/**
 * Response from POST /auth/login, POST /auth/apple, POST /auth/google
 * Matches backend schemas/auth.py Token + inline dict additions.
 */
export interface AuthTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  user_id: number;
}

/**
 * Response from POST /auth/refresh
 * Does NOT include user_id (only login/oauth endpoints return it).
 */
export interface AuthRefreshResponse {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
}

/** POST /auth/refresh, POST /auth/logout — request body */
export interface AuthRefreshRequest {
  refresh_token: string;
}

/** POST /auth/apple — request body (Pydantic: AppleAuthRequest) */
export interface AuthAppleRequest {
  identity_token: string;
  authorization_code: string;
  first_name?: string;
  last_name?: string;
}

/** POST /auth/google — request body (Pydantic: GoogleAuthRequest) */
export interface AuthGoogleRequest {
  id_token: string;
}

/**
 * GET /auth/me — response (UserRead model)
 * POST /auth/register — response (UserRead model)
 *
 * Matches backend models/user.py UserRead exactly.
 * NOTE: avatar_url is NOT part of the backend UserRead schema.
 */
export interface AuthUserResponse {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  is_active: boolean;
  provider: string;          // 'email' | 'apple' | 'google'
  is_premium: boolean;
  created_at: string;        // ISO 8601 datetime
  updated_at: string;        // ISO 8601 datetime
}

/** POST /auth/logout — response */
export interface AuthLogoutResponse {
  message: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Onboarding — /api/onboarding/*
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/onboarding/save-step
 * All fields optional — partial update for a single step.
 *
 * Matches backend schemas/onboarding.py OnboardingStepSave.
 *
 * IMPORTANT: pain_points and accomplishments are JSON *strings*, not arrays.
 * The frontend must JSON.stringify() arrays before sending.
 */
export interface OnboardingStepRequest {
  gender?: string;
  workouts_per_week?: number;
  heard_from?: string;
  used_other_apps?: boolean;
  height_cm?: number;
  weight_kg?: number;
  unit_system?: string;
  birth_date?: string;           // ISO date YYYY-MM-DD
  goal?: string;
  target_weight_kg?: number;
  weekly_speed_kg?: number;
  pain_points?: string;          // JSON string, e.g. '["cravings","lack_of_time"]'
  diet_type?: string;
  accomplishments?: string;      // JSON string
  health_connected?: boolean;
  notifications_enabled?: boolean;
  referral_code?: string;
  daily_calories?: number;
  daily_protein_g?: number;
  daily_carbs_g?: number;
  daily_fats_g?: number;
}

/**
 * POST /api/onboarding/complete
 * Required fields for completing the onboarding.
 *
 * Matches backend schemas/onboarding.py OnboardingComplete.
 */
export interface OnboardingCompleteRequest {
  gender: string;
  workouts_per_week: number;
  height_cm: number;
  weight_kg: number;
  unit_system?: string;          // default: "metric"
  birth_date: string;            // ISO date YYYY-MM-DD
  goal: string;
  target_weight_kg: number;
  weekly_speed_kg?: number;      // default: 0.8
  pain_points?: string;          // JSON string
  diet_type: string;
  accomplishments?: string;      // JSON string
  health_connected?: boolean;    // default: false
  notifications_enabled?: boolean; // default: false
  heard_from?: string;
  used_other_apps?: boolean;
  referral_code?: string;
}

/**
 * Response from:
 *   POST /api/onboarding/save-step
 *   POST /api/onboarding/complete
 *   GET  /api/onboarding/profile
 *
 * Matches backend schemas/onboarding.py OnboardingProfileRead exactly.
 */
export interface OnboardingProfileResponse {
  id: number;
  user_id: number;
  gender: string | null;
  workouts_per_week: number | null;
  heard_from: string | null;
  used_other_apps: boolean | null;
  height_cm: number | null;
  weight_kg: number | null;
  unit_system: string;
  birth_date: string | null;         // ISO date YYYY-MM-DD
  goal: string | null;
  target_weight_kg: number | null;
  weekly_speed_kg: number;
  pain_points: string | null;        // JSON string (NOT an array)
  diet_type: string | null;
  accomplishments: string | null;    // JSON string (NOT an array)
  health_connected: boolean;
  notifications_enabled: boolean;
  referral_code: string | null;
  daily_calories: number | null;
  daily_carbs_g: number | null;
  daily_protein_g: number | null;
  daily_fats_g: number | null;
  health_score: number | null;
  completed_at: string | null;       // ISO 8601 datetime
  created_at: string;                // ISO 8601 datetime
  updated_at: string;                // ISO 8601 datetime
}

// ═══════════════════════════════════════════════════════════════════════════════
// AI Food Scan — /api/food/*
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/food/scan
 * Content-Type: multipart/form-data
 *
 * NOTE: This is NOT JSON. Send as FormData with:
 *   - image: File (required)
 *   - meal_type: string (optional, default "snack")
 */
export interface FoodScanRequest {
  image: File | Blob;                // binary upload
  meal_type?: MealType;              // default: 'snack'
}

/**
 * Response from POST /api/food/scan
 * Matches the dict returned by ai_scan_service.scan_and_log_food()
 */
export interface FoodScanResponse {
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
  logged_at: string;                 // ISO 8601 datetime
  image_url: string | null;
  ai_confidence: number;
  ai_provider: string | null;
  cache_hit: boolean;
}

/**
 * POST /api/food/manual (status 201)
 * Matches backend ai_food.py ManualFoodLog Pydantic model.
 */
export interface ManualFoodLogRequest {
  food_name: string;
  calories: number;
  carbs_g: number;
  protein_g: number;
  fats_g: number;
  fiber_g?: number;
  serving_size?: string;
  meal_type?: MealType;              // default: 'snack'
}

/**
 * Response from POST /api/food/manual
 * Matches the inline dict in the manual_food_log endpoint.
 */
export interface ManualFoodLogResponse {
  id: number;
  food_name: string;
  calories: number;
  carbs_g: number;
  protein_g: number;
  fats_g: number;
  fiber_g: number | null;
  meal_type: string;
  logged_at: string;                 // ISO 8601 datetime
  was_edited: boolean;
  cache_hit: boolean;                // always false for manual
}

/**
 * PUT /api/food/logs/{log_id}
 * Matches backend ai_food.py UpdateFoodLog Pydantic model.
 */
export interface UpdateFoodLogRequest {
  food_name?: string;
  calories?: number;
  carbs_g?: number;
  protein_g?: number;
  fats_g?: number;
  meal_type?: MealType;
}

/** Response from PUT /api/food/logs/{log_id} */
export interface UpdateFoodLogResponse {
  message: string;
  id: number;
}

/** Response from DELETE /api/food/logs/{log_id} */
export interface DeleteFoodLogResponse {
  message: string;
}

/**
 * GET /api/food/logs — list endpoint
 * Query params: date?, date_from?, date_to?, meal_type?, sort_by?, order?,
 *               page? (1-indexed), page_size? (1-200, default 50)
 *
 * Returns PaginatedResponse when using page-based params (default),
 * or a flat array when using legacy offset/limit params.
 * The frontend service handles both formats.
 */
export interface FoodLogItem {
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
  logged_at: string;                 // ISO 8601 datetime
  image_url: string | null;
  ai_confidence: number | null;
  was_edited: boolean;
}

/** Response type for GET /api/food/logs — plain array (legacy) or paginated */
export type FoodLogListResponse = FoodLogItem[];

/**
 * GET /api/food/logs/{log_id} — detail endpoint
 * Returns more fields than the list endpoint (sugar_g, sodium_mg, serving_size).
 */
export interface FoodLogDetailResponse {
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
  logged_at: string;                 // ISO 8601 datetime
  image_url: string | null;
  ai_confidence: number | null;
  was_edited: boolean;
}

/**
 * GET /api/food/search
 * Query params: q (required, min 2 chars), limit? (1-20, default 10)
 *
 * Returns a flat array of distinct foods ordered by frequency.
 */
export interface FoodSearchItem {
  food_name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
  count: number;
}

export type FoodSearchResponse = FoodSearchItem[];

// ═══════════════════════════════════════════════════════════════════════════════
// Water Tracking — /api/food/water
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/food/water
 * Matches backend ai_food.py WaterLog Pydantic model.
 */
export interface WaterLogRequest {
  ml: number;                        // millilitres to add (integer)
}

/** Response from POST /api/food/water */
export interface WaterLogResponse {
  water_ml: number;                  // total water_ml for the day after adding
}

// ═══════════════════════════════════════════════════════════════════════════════
// Dashboard — /api/dashboard/today
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/dashboard/today
 * Query params: date? (YYYY-MM-DD, defaults to today)
 *
 * Matches the dict returned by ai_scan_service.get_daily_summary() exactly.
 *
 * IMPORTANT: Field names use _g suffix for macros (e.g. total_protein_g, target_fats_g).
 * This differs from legacy DailySummaryResponse which uses total_protein, target_fat etc.
 */
export interface DashboardExerciseEntry {
  name: string;
  duration: number;
  calories: number;
  workout_type: string;
}

export interface DashboardResponse {
  date: string;                      // YYYY-MM-DD
  total_calories: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fats_g: number;
  target_calories: number;
  target_protein_g: number;
  target_carbs_g: number;
  target_fats_g: number;
  meals_logged: number;
  streak_days: number;
  water_ml: number;
  /** Calories burned through exercise today. */
  calories_burned_exercise: number;
  /** target - consumed + burned. */
  calories_remaining: number;
  /** consumed - burned. */
  net_calories: number;
  /** List of exercises performed today. */
  exercises_today: DashboardExerciseEntry[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Subscriptions — /api/subscriptions/*
// ═══════════════════════════════════════════════════════════════════════════════

export type SubscriptionPlan = 'monthly' | 'annual' | 'lifetime';
export type SubscriptionStatus = 'active' | 'expired' | 'cancelled' | 'trial';
export type SubscriptionStore = 'apple' | 'google' | 'stripe';

/**
 * POST /api/subscriptions
 * Matches backend subscriptions.py SubscriptionCreate Pydantic model.
 */
export interface SubscriptionCreateRequest {
  plan: SubscriptionPlan;
  store?: SubscriptionStore;
  store_tx_id?: string;
  price_paid?: number;
  discount_pct?: number;
  trial_days?: number;
}

/**
 * Response from:
 *   POST /api/subscriptions (201)
 *   GET  /api/subscriptions/current (200, or null)
 *
 * Matches backend subscriptions.py SubscriptionRead Pydantic model exactly.
 */
export interface SubscriptionResponse {
  id: number;
  user_id: number;
  plan: string;
  status: string;
  price_paid: number | null;
  discount_pct: number | null;
  store: string | null;
  trial_ends_at: string | null;              // ISO 8601 datetime
  current_period_ends_at: string | null;     // ISO 8601 datetime — NOT "current_period_end"
  created_at: string;                        // ISO 8601 datetime
  updated_at: string;                        // ISO 8601 datetime
}
