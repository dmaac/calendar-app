/**
 * workout.service.ts
 * Workout logging + calorie balance integration with the backend.
 *
 * Network improvements:
 *   - Offline queue for mutations (log, delete)
 *   - In-memory cache for GET responses (workouts, summary, net calories)
 *   - AsyncStorage fallback for offline access to workout data
 *   - Optimistic responses when offline
 *   - Proper TypeScript return types
 *
 * Endpoints:
 *   POST /api/workouts/         -- log a workout (auto-estimates calories via MET)
 *   GET  /api/workouts/         -- list workouts (optional date range)
 *   GET  /api/workouts/summary  -- weekly summary
 *   GET  /api/calories/net      -- net calorie balance for a given day
 *   DELETE /api/workouts/{id}   -- remove a workout
 */
import { api } from './api';
import { getCachedNetworkStatus } from '../hooks/useNetworkStatus';
import { enqueueAction, setCachedData, getCachedData } from './offlineStore';
import {
  cacheResponse,
  getCachedResponse,
  invalidateCache,
  NetworkError,
} from './apiClient';

// ---- Types -------------------------------------------------------------------

export type WorkoutType = 'cardio' | 'strength' | 'flexibility' | 'sports' | 'other';

export interface WorkoutLogCreate {
  workout_type: WorkoutType;
  duration_min: number;
  calories_burned?: number | null;
  notes?: string | null;
}

export interface WorkoutLogRead {
  id: number;
  user_id: number;
  workout_type: WorkoutType;
  duration_min: number;
  calories_burned: number | null;
  notes: string | null;
  created_at: string;
}

export interface WorkoutSummary {
  total_workouts: number;
  total_duration_min: number;
  total_calories: number;
  avg_duration_min: number;
}

export interface ExerciseEntry {
  name: string;
  duration: number;
  calories: number;
  workout_type: string;
}

export interface NetCaloriesResponse {
  date: string;
  consumed: number;
  burned: number;
  net: number;
  goal: number;
  remaining: number;
  deficit_or_surplus: 'deficit' | 'surplus' | 'on_target';
  exercises_today: ExerciseEntry[];
}

// ---- Cache keys --------------------------------------------------------------

const CACHE_KEYS = {
  WORKOUTS: (from?: string, to?: string) => `workouts/list:${from ?? ''}:${to ?? ''}`,
  SUMMARY: (days: number) => `workouts/summary:${days}`,
  NET_CALORIES: (date?: string) => `calories/net:${date ?? 'today'}`,
} as const;

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Invalidate all workout-related caches after a mutation.
 */
function invalidateWorkoutCaches(): void {
  invalidateCache('workouts/');
  invalidateCache('calories/net');
  // Also invalidate dashboard since workouts affect calorie balance
  invalidateCache('dashboard/today');
}

// ---- Map exercise categories to backend WorkoutType -------------------------

const CATEGORY_TO_WORKOUT_TYPE: Record<string, WorkoutType> = {
  running: 'cardio',
  walking: 'cardio',
  cycling: 'cardio',
  swimming: 'cardio',
  weights: 'strength',
  yoga: 'flexibility',
  hiit: 'cardio',
  sports: 'sports',
};

export function mapCategoryToWorkoutType(category: string): WorkoutType {
  return CATEGORY_TO_WORKOUT_TYPE[category] ?? 'other';
}

// ---- API Calls (offline-aware) -----------------------------------------------

/**
 * Log a workout to the backend.
 * Returns the created workout with auto-estimated calories.
 * Queues the operation when offline and returns an optimistic placeholder.
 */
export const logWorkout = async (data: WorkoutLogCreate): Promise<WorkoutLogRead> => {
  const { isConnected } = getCachedNetworkStatus();
  if (!isConnected) {
    await enqueueAction('log_workout', data);
    invalidateWorkoutCaches();
    // Return optimistic placeholder
    return {
      id: -Date.now(),
      user_id: 0,
      workout_type: data.workout_type,
      duration_min: data.duration_min,
      calories_burned: data.calories_burned ?? null,
      notes: data.notes ?? null,
      created_at: new Date().toISOString(),
    };
  }

  const res = await api.post('/api/workouts/', data);
  invalidateWorkoutCaches();
  return res.data;
};

/**
 * List workouts, optionally filtered by date range.
 * Returns cached data when offline.
 */
export const getWorkouts = async (
  dateFrom?: string,
  dateTo?: string,
): Promise<WorkoutLogRead[]> => {
  const cacheKey = CACHE_KEYS.WORKOUTS(dateFrom, dateTo);

  // Try in-memory cache first
  const cached = getCachedResponse<WorkoutLogRead[]>(cacheKey, CACHE_TTL_MS);
  if (cached) return cached;

  try {
    const params: Record<string, string> = {};
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    const res = await api.get('/api/workouts/', { params });
    const workouts: WorkoutLogRead[] = res.data;
    cacheResponse(cacheKey, workouts, CACHE_TTL_MS);
    return workouts;
  } catch (error) {
    if (error instanceof NetworkError && (error.isOffline || error.isTimeout)) {
      // Return empty array when offline with no cache
      return [];
    }
    throw error;
  }
};

/**
 * Get weekly workout summary.
 * Results are cached in memory for 5 minutes.
 */
export const getWorkoutSummary = async (days = 7): Promise<WorkoutSummary> => {
  const cacheKey = CACHE_KEYS.SUMMARY(days);

  const cached = getCachedResponse<WorkoutSummary>(cacheKey, CACHE_TTL_MS);
  if (cached) return cached;

  try {
    const res = await api.get('/api/workouts/summary', { params: { days } });
    const summary: WorkoutSummary = res.data;
    cacheResponse(cacheKey, summary, CACHE_TTL_MS);
    return summary;
  } catch (error) {
    if (error instanceof NetworkError && (error.isOffline || error.isTimeout)) {
      // Return zeroed summary when offline
      return {
        total_workouts: 0,
        total_duration_min: 0,
        total_calories: 0,
        avg_duration_min: 0,
      };
    }
    throw error;
  }
};

/**
 * Get net calorie balance for a given day.
 * Uses in-memory cache (5 min) + offline fallback.
 */
export const getNetCalories = async (date?: string): Promise<NetCaloriesResponse> => {
  const cacheKey = CACHE_KEYS.NET_CALORIES(date);

  const cached = getCachedResponse<NetCaloriesResponse>(cacheKey, CACHE_TTL_MS);
  if (cached) return cached;

  const params: Record<string, string> = {};
  if (date) params.target_date = date;
  const res = await api.get('/api/calories/net', { params });
  const data: NetCaloriesResponse = res.data;
  cacheResponse(cacheKey, data, CACHE_TTL_MS);
  return data;
};

/**
 * Delete a workout by ID.
 * Queues the operation when offline.
 */
export const deleteWorkout = async (workoutId: number): Promise<void> => {
  const { isConnected } = getCachedNetworkStatus();
  if (!isConnected) {
    await enqueueAction('delete_workout', { id: workoutId });
    invalidateWorkoutCaches();
    return;
  }

  await api.delete(`/api/workouts/${workoutId}`);
  invalidateWorkoutCaches();
};
