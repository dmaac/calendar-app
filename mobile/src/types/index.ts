// ─── Auth ────────────────────────────────────────────────────────────────────

export interface User {
  id: number;
  email: string;
  first_name?: string;
  last_name?: string;
  is_active: boolean;
  is_premium: boolean;
  provider: 'email' | 'apple' | 'google';
  avatar_url?: string;
  created_at: string;
  updated_at?: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
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

export interface OnboardingProfileRead {
  user_id: number;
  gender?: string;
  workouts_per_week?: string;
  heard_from?: string;
  used_other_apps?: boolean;
  height_cm?: number;
  weight_kg?: number;
  unit_system?: string;
  birth_date?: string;
  goal?: string;
  target_weight_kg?: number;
  weekly_speed_kg?: number;
  pain_points?: string[];
  diet_type?: string;
  accomplishments?: string[];
  health_connected?: boolean;
  notifications_enabled?: boolean;
  referral_code?: string;
  daily_calories?: number;
  daily_carbs_g?: number;
  daily_protein_g?: number;
  daily_fats_g?: number;
  health_score?: number;
  completed_at?: string;
}

// ─── Food & AI Scan ──────────────────────────────────────────────────────────

export interface FoodScanResult {
  food_name: string;
  calories: number;
  carbs_g: number;
  protein_g: number;
  fats_g: number;
  fiber_g?: number;
  sugar_g?: number;
  sodium_mg?: number;
  serving_size?: string;
  ai_confidence: number;
  cache_hit: boolean;
  image_url?: string;
}

export interface AIFoodLog {
  id: number;
  user_id: number;
  logged_at: string;
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  food_name: string;
  calories: number;
  carbs_g: number;
  protein_g: number;
  fats_g: number;
  fiber_g?: number;
  image_url?: string;
  ai_confidence?: number;
  was_edited: boolean;
}

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
  meals_count?: number;   // legacy alias
  streak_days: number;
  // Legacy fields (original schema)
  total_protein?: number;
  total_carbs?: number;
  total_fat?: number;
  target_protein?: number;
  target_carbs?: number;
  target_fat?: number;
}

// ─── Subscription ─────────────────────────────────────────────────────────────

export type SubscriptionPlan = 'free' | 'monthly' | 'annual' | 'lifetime';
export type SubscriptionStatus = 'active' | 'expired' | 'cancelled' | 'trial';

export interface Subscription {
  id: number;
  user_id: number;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  trial_ends_at?: string;
  current_period_end?: string;
  store?: 'apple' | 'google';
  store_tx_id?: string;
  price_paid?: number;
  discount_pct?: number;
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
