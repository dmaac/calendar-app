export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

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

export interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  first_name: string;
  last_name: string;
  password: string;
}

// Nutrition types
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

export interface DailySummary {
  date: string;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  target_calories: number;
  target_protein: number;
  target_carbs: number;
  target_fat: number;
  water_ml: number;
  meals_count: number;
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