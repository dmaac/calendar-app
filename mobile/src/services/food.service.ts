/**
 * food.service.ts
 * AI food scan + meal logs + daily summary.
 *
 * Network improvements:
 *   - AbortController support for cancellable scan requests
 *   - Offline queue for mutations (manual log, edit, delete, water, quick-log)
 *   - In-memory cache for GET responses (dashboard, food logs, frequent foods)
 *   - Proper timeout: 45s for AI scan, 15s for other requests
 *   - User-friendly error messages via NetworkError
 *   - All functions have proper TypeScript return types
 */
import { api } from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FoodScanResult, AIFoodLog, DailySummary } from '../types';
import {
  TIMEOUTS,
  createAbortController,
  cacheResponse,
  getCachedResponse,
  invalidateCache,
  NetworkError,
} from './apiClient';
import { getCachedNetworkStatus } from '../hooks/useNetworkStatus';
import { enqueueAction, setCachedData, getCachedData } from './offlineStore';

const AI_PROVIDER_KEY = '@fitsi_ai_provider';

// ---- Cache keys (in-memory) --------------------------------------------------
const CACHE_KEYS = {
  DAILY_SUMMARY: (date: string) => `dashboard/today:${date}`,
  FOOD_LOGS: (date: string) => `food/logs:${date}`,
  FREQUENT_FOODS: (limit: number) => `food/frequent:${limit}`,
  FOOD_SEARCH: (q: string, limit: number) => `food/search:${q}:${limit}`,
} as const;

// ---- Types -------------------------------------------------------------------

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

/**
 * React Native FormData file part. The standard File/Blob types do not apply
 * in RN -- instead, FormData.append() accepts an object with uri/name/type.
 * This interface documents that convention to avoid `as any` casts.
 */
interface ReactNativeFile {
  uri: string;
  name: string;
  type: string;
}

export interface ManualFoodEntry {
  food_name: string;
  calories: number;
  carbs_g: number;
  protein_g: number;
  fats_g: number;
  fiber_g?: number;
  serving_size?: string;
  meal_type: MealType;
}

export interface FoodSuggestion {
  food_name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
  count: number;
}

export interface FrequentFood {
  food_name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
  fiber_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
  serving_size: string | null;
  meal_type: string;
  log_count: number;
  last_logged: string | null;
}

export interface QuickLogRequest {
  food_log_id?: number;
  food_name?: string;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fats_g?: number;
  fiber_g?: number;
  sugar_g?: number;
  sodium_mg?: number;
  serving_size?: string;
  meal_type: MealType;
}

// ---- Helpers -----------------------------------------------------------------

function localDateStr(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Invalidate all food-related caches after a mutation.
 * Called after logging, editing, or deleting food entries.
 */
function invalidateFoodCaches(): void {
  invalidateCache('dashboard/today');
  invalidateCache('food/logs');
  invalidateCache('food/frequent');
  invalidateCache('food/search');
}

// ---- AI Food Scan (cancellable) ---------------------------------------------

/**
 * Sends an image to the backend for AI analysis. Returns detected macros.
 *
 * This function supports cancellation via the returned cancel function.
 * Usage:
 *   const { promise, cancel } = scanFoodCancellable(imageUri, 'lunch');
 *   // To cancel: cancel();
 *   const result = await promise;
 */
export function scanFoodCancellable(
  imageUri: string,
  mealType: MealType = 'lunch',
): { promise: Promise<FoodScanResult>; cancel: () => void } {
  const { signal, cancel } = createAbortController(TIMEOUTS.SCAN);

  const promise = (async (): Promise<FoodScanResult> => {
    const form = new FormData();
    form.append('meal_type', mealType);

    const file: ReactNativeFile = {
      uri: imageUri,
      name: 'meal.jpg',
      type: 'image/jpeg',
    };
    form.append('image', file as unknown as Blob);

    const headers: Record<string, string> = { 'Content-Type': 'multipart/form-data' };

    try {
      const provider = await AsyncStorage.getItem(AI_PROVIDER_KEY);
      if (provider && provider !== 'auto') {
        headers['X-AI-Provider'] = provider;
      }
    } catch (err) {
      console.error('[FoodService] Failed to read AI provider preference:', err);
    }

    const res = await api.post('/api/food/scan', form, {
      headers,
      timeout: TIMEOUTS.SCAN,
      signal,
    });

    // Invalidate caches since a new food log was created
    invalidateFoodCaches();

    return res.data;
  })();

  return { promise, cancel };
}

/**
 * Sends an image to the backend for AI analysis. Returns detected macros.
 * Non-cancellable version for backward compatibility.
 */
export const scanFood = async (
  imageUri: string,
  mealType: MealType = 'lunch',
): Promise<FoodScanResult> => {
  const { promise } = scanFoodCancellable(imageUri, mealType);
  return promise;
};

// Note: scanFood auto-logs on the backend -- no separate confirm step needed.

// ---- Food Logs (cached + offline) -------------------------------------------

/**
 * Lists the food logs for a given day.
 * Returns cached data when offline.
 */
export const getFoodLogs = async (date?: string): Promise<AIFoodLog[]> => {
  const d = date ?? localDateStr();
  const cacheKey = CACHE_KEYS.FOOD_LOGS(d);

  // Try in-memory cache first (5 min TTL)
  const cached = getCachedResponse<AIFoodLog[]>(cacheKey);
  if (cached) return cached;

  try {
    const res = await api.get(`/api/food/logs?date=${d}`);
    const logs: AIFoodLog[] = Array.isArray(res.data) ? res.data : (res.data.items ?? []);
    cacheResponse(cacheKey, logs);
    // Also persist to AsyncStorage for offline access
    await setCachedData('food/logs', logs);
    return logs;
  } catch (error) {
    // If offline or network error, try AsyncStorage cache
    if (error instanceof NetworkError && (error.isOffline || error.isTimeout)) {
      const offlineCached = await getCachedData<AIFoodLog[]>('food/logs');
      if (offlineCached) return offlineCached;
    }
    throw error;
  }
};

/**
 * Deletes a food log. Queues the operation when offline.
 */
export const deleteFoodLog = async (id: number): Promise<void> => {
  const { isConnected } = getCachedNetworkStatus();
  if (!isConnected) {
    await enqueueAction('delete_food_log', { id });
    invalidateFoodCaches();
    return;
  }

  await api.delete(`/api/food/logs/${id}`);
  invalidateFoodCaches();
};

/**
 * Edits the macros of a food log (user corrects the AI).
 * Queues the operation when offline.
 */
export const editFoodLog = async (id: number, updates: Partial<AIFoodLog>): Promise<void> => {
  const { isConnected } = getCachedNetworkStatus();
  if (!isConnected) {
    await enqueueAction('edit_food_log', { id, updates: updates as Record<string, unknown> });
    invalidateFoodCaches();
    return;
  }

  await api.put(`/api/food/logs/${id}`, updates);
  invalidateFoodCaches();
};

// ---- Daily Summary (cached + offline) ---------------------------------------

/**
 * Fetches the daily summary (calories, macros, progress vs goal).
 * Uses in-memory cache (5 min) + AsyncStorage fallback for offline.
 */
export const getDailySummary = async (date?: string): Promise<DailySummary> => {
  const d = date ?? localDateStr();
  const cacheKey = CACHE_KEYS.DAILY_SUMMARY(d);

  // Try in-memory cache first
  const cached = getCachedResponse<DailySummary>(cacheKey);
  if (cached) return cached;

  try {
    const res = await api.get(`/api/dashboard/today?date=${d}`);
    const summary: DailySummary = res.data;
    cacheResponse(cacheKey, summary);
    await setCachedData('dashboard/today', summary);
    return summary;
  } catch (error) {
    if (error instanceof NetworkError && (error.isOffline || error.isTimeout)) {
      const offlineCached = await getCachedData<DailySummary>('dashboard/today');
      if (offlineCached) return offlineCached;
    }
    throw error;
  }
};

// ---- Manual Food Log (offline-aware) ----------------------------------------

/**
 * Registers a food entry manually (no photo).
 * Queues the operation when offline and returns an optimistic placeholder.
 */
export const manualLogFood = async (entry: ManualFoodEntry): Promise<AIFoodLog> => {
  const { isConnected } = getCachedNetworkStatus();
  if (!isConnected) {
    await enqueueAction('log_food', entry);
    invalidateFoodCaches();
    // Return a placeholder so the UI can update optimistically
    return {
      id: -Date.now(),
      food_name: entry.food_name,
      calories: entry.calories,
      carbs_g: entry.carbs_g,
      protein_g: entry.protein_g,
      fats_g: entry.fats_g,
      fiber_g: entry.fiber_g ?? null,
      sugar_g: null,
      sodium_mg: null,
      serving_size: entry.serving_size ?? null,
      meal_type: entry.meal_type,
      logged_at: new Date().toISOString(),
      image_url: null,
      ai_confidence: null,
      was_edited: false,
    };
  }

  const res = await api.post('/api/food/manual', entry);
  invalidateFoodCaches();
  return res.data;
};

// ---- Water Log (offline-aware) ----------------------------------------------

/**
 * Adds ml of water to the daily record.
 * Queues the operation when offline.
 */
export const logWater = async (ml: number): Promise<{ water_ml: number }> => {
  const { isConnected } = getCachedNetworkStatus();
  if (!isConnected) {
    await enqueueAction('log_water', { ml });
    invalidateFoodCaches();
    return { water_ml: ml }; // Optimistic response
  }

  const res = await api.post('/api/food/water', { ml });
  invalidateFoodCaches();
  return res.data;
};

// ---- Food Search (cached) ---------------------------------------------------

/**
 * Searches foods in the user's history (autocomplete).
 * Results are cached in memory for 5 minutes.
 */
export const searchFoodHistory = async (q: string, limit = 10): Promise<FoodSuggestion[]> => {
  const cacheKey = CACHE_KEYS.FOOD_SEARCH(q, limit);
  const cached = getCachedResponse<FoodSuggestion[]>(cacheKey, 5 * 60 * 1000);
  if (cached) return cached;

  const res = await api.get(`/api/food/search?q=${encodeURIComponent(q)}&limit=${limit}`);
  const results: FoodSuggestion[] = res.data;
  cacheResponse(cacheKey, results, 5 * 60 * 1000);
  return results;
};

// ---- Quick Log (offline-aware) ----------------------------------------------

/**
 * Gets the user's most frequently logged foods (top N).
 * Cached in memory for 10 minutes.
 */
export const getFrequentFoods = async (limit = 10): Promise<FrequentFood[]> => {
  const cacheKey = CACHE_KEYS.FREQUENT_FOODS(limit);
  const cached = getCachedResponse<FrequentFood[]>(cacheKey, 10 * 60 * 1000);
  if (cached) return cached;

  const res = await api.get(`/api/food/frequent?limit=${limit}`);
  const foods: FrequentFood[] = res.data;
  cacheResponse(cacheKey, foods, 10 * 60 * 1000);
  return foods;
};

/**
 * Re-logs a previous food with a single request.
 * Supports two modes:
 * 1. By food_log_id: copies macros from an existing log.
 * 2. By direct data: provides food_name + macros (from frequent foods list).
 * Queues the operation when offline.
 */
export const quickLogFood = async (req: QuickLogRequest): Promise<AIFoodLog> => {
  const { isConnected } = getCachedNetworkStatus();
  if (!isConnected) {
    await enqueueAction('quick_log_food', req);
    invalidateFoodCaches();
    // Return optimistic placeholder
    return {
      id: -Date.now(),
      food_name: req.food_name ?? 'Pending sync',
      calories: req.calories ?? 0,
      carbs_g: req.carbs_g ?? 0,
      protein_g: req.protein_g ?? 0,
      fats_g: req.fats_g ?? 0,
      fiber_g: req.fiber_g ?? null,
      sugar_g: req.sugar_g ?? null,
      sodium_mg: req.sodium_mg ?? null,
      serving_size: req.serving_size ?? null,
      meal_type: req.meal_type,
      logged_at: new Date().toISOString(),
      image_url: null,
      ai_confidence: null,
      was_edited: false,
    };
  }

  const res = await api.post('/api/food/quick-log', req);
  invalidateFoodCaches();
  return res.data;
};
