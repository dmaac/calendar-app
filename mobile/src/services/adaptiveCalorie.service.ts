/**
 * adaptiveCalorie.service.ts -- API client for the Adaptive Calorie Target system.
 *
 * Network improvements:
 *   - In-memory cache for GET endpoints (target, history, weight data)
 *   - Offline queue for mutations (apply, dismiss, log weight)
 *   - AsyncStorage fallback for weight history offline access
 *   - Proper error handling with NetworkError
 *   - All functions have proper TypeScript return types
 *
 * Endpoints:
 *   GET  /api/nutrition/adaptive-target          -- Get recommendation
 *   POST /api/nutrition/adaptive-target/apply     -- Apply adjustment
 *   POST /api/nutrition/adaptive-target/dismiss   -- Dismiss adjustment
 *   GET  /api/nutrition/adaptive-target/history   -- Adjustment history
 *   POST /api/nutrition/weight                    -- Log weight
 *   GET  /api/nutrition/weight                    -- Weight history
 *   GET  /api/nutrition/weight/chart              -- Weight + predictions
 */
import { apiClient } from './apiClient';
import {
  cacheResponse,
  getCachedResponse,
  invalidateCache,
  NetworkError,
} from './apiClient';
import { getCachedNetworkStatus } from '../hooks/useNetworkStatus';
import { enqueueAction, setCachedData, getCachedData } from './offlineStore';

// ---- Types -------------------------------------------------------------------

export interface AdaptiveTargetResponse {
  current_target: number;
  recommended_target: number;
  adjustment: number;
  reason: string;
  reason_code: string;
  predicted_weight_this_week: number | null;
  actual_weight: number | null;
  trend: string;
  has_pending_adjustment: boolean;
  bmr: number | null;
  apply_url: string;
}

export interface ApplyAdjustmentResponse {
  success: boolean;
  new_target: number;
  previous_target: number;
  adjustment: number;
  message: string;
}

export interface WeightLogEntry {
  id: number;
  date: string;
  weight_kg: number;
  source: string;
  notes: string | null;
  created_at: string;
}

export interface WeightLogCreate {
  weight_kg: number;
  date?: string;
  source?: string;
  notes?: string;
}

export interface CalorieAdjustmentRecord {
  id: number;
  week_start: string;
  week_end: string;
  predicted_weight: number;
  actual_weight: number | null;
  weight_delta: number | null;
  previous_target: number;
  new_target: number;
  adjustment_kcal: number;
  adjustment_reason: string;
  trend: string;
  applied: boolean;
  applied_at: string | null;
  dismissed: boolean;
  created_at: string;
}

export interface PredictedEntry {
  date: string;
  weight_kg: number;
}

export interface WeightChartData {
  entries: WeightLogEntry[];
  predicted_entries: PredictedEntry[];
  current_weight: number | null;
  target_weight: number | null;
  weight_change_4w: number | null;
}

// ---- Cache keys --------------------------------------------------------------

const CACHE_KEYS = {
  ADAPTIVE_TARGET: 'adaptive/target',
  ADJUSTMENT_HISTORY: (limit: number) => `adaptive/history:${limit}`,
  WEIGHT_HISTORY: (days: number) => `adaptive/weight:${days}`,
  WEIGHT_CHART: (weeks: number) => `adaptive/weight-chart:${weeks}`,
} as const;

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const WEIGHT_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes (weight changes less frequently)

/**
 * Invalidate all adaptive calorie caches after a mutation.
 */
function invalidateAdaptiveCaches(): void {
  invalidateCache('adaptive/');
  // Also invalidate dashboard since calorie targets may have changed
  invalidateCache('dashboard/today');
}

// ---- API methods (with caching + offline) ------------------------------------

/**
 * Get the current adaptive calorie target recommendation.
 * Cached in memory for 5 minutes.
 */
export async function getAdaptiveTarget(): Promise<AdaptiveTargetResponse> {
  const cached = getCachedResponse<AdaptiveTargetResponse>(CACHE_KEYS.ADAPTIVE_TARGET, CACHE_TTL_MS);
  if (cached) return cached;

  const res = await apiClient.get<AdaptiveTargetResponse>('/api/nutrition/adaptive-target');
  cacheResponse(CACHE_KEYS.ADAPTIVE_TARGET, res.data, CACHE_TTL_MS);
  return res.data;
}

/**
 * Apply the recommended calorie adjustment.
 * Queues the operation when offline.
 */
export async function applyAdaptiveTarget(): Promise<ApplyAdjustmentResponse> {
  const { isConnected } = getCachedNetworkStatus();
  if (!isConnected) {
    await enqueueAction('apply_adaptive_target', {} as Record<string, never>);
    return {
      success: true,
      new_target: 0,
      previous_target: 0,
      adjustment: 0,
      message: 'Queued for sync when online',
    };
  }

  const res = await apiClient.post<ApplyAdjustmentResponse>('/api/nutrition/adaptive-target/apply');
  invalidateAdaptiveCaches();
  return res.data;
}

/**
 * Dismiss the current adjustment recommendation.
 * Queues the operation when offline.
 */
export async function dismissAdaptiveTarget(): Promise<{ success: boolean; message: string }> {
  const { isConnected } = getCachedNetworkStatus();
  if (!isConnected) {
    await enqueueAction('dismiss_adaptive_target', {} as Record<string, never>);
    return { success: true, message: 'Queued for sync when online' };
  }

  const res = await apiClient.post<{ success: boolean; message: string }>(
    '/api/nutrition/adaptive-target/dismiss',
  );
  invalidateAdaptiveCaches();
  return res.data;
}

/**
 * Get adjustment history.
 * Cached in memory for 5 minutes.
 */
export async function getAdjustmentHistory(limit = 12): Promise<CalorieAdjustmentRecord[]> {
  const cacheKey = CACHE_KEYS.ADJUSTMENT_HISTORY(limit);
  const cached = getCachedResponse<CalorieAdjustmentRecord[]>(cacheKey, CACHE_TTL_MS);
  if (cached) return cached;

  try {
    const res = await apiClient.get<CalorieAdjustmentRecord[]>(
      '/api/nutrition/adaptive-target/history',
      { params: { limit } },
    );
    cacheResponse(cacheKey, res.data, CACHE_TTL_MS);
    return res.data;
  } catch (error) {
    if (error instanceof NetworkError && (error.isOffline || error.isTimeout)) {
      return [];
    }
    throw error;
  }
}

/**
 * Log a weight entry.
 * Queues the operation when offline with an optimistic placeholder.
 */
export async function logWeight(data: WeightLogCreate): Promise<WeightLogEntry> {
  const { isConnected } = getCachedNetworkStatus();
  if (!isConnected) {
    await enqueueAction('log_weight', data);
    invalidateAdaptiveCaches();
    // Return optimistic placeholder
    return {
      id: -Date.now(),
      date: data.date ?? new Date().toISOString().split('T')[0],
      weight_kg: data.weight_kg,
      source: data.source ?? 'manual',
      notes: data.notes ?? null,
      created_at: new Date().toISOString(),
    };
  }

  const res = await apiClient.post<WeightLogEntry>('/api/nutrition/weight', data);
  invalidateAdaptiveCaches();
  return res.data;
}

/**
 * Get weight history.
 * Cached in memory for 10 minutes + AsyncStorage fallback for offline.
 */
export async function getWeightHistory(days = 90): Promise<WeightLogEntry[]> {
  const cacheKey = CACHE_KEYS.WEIGHT_HISTORY(days);
  const cached = getCachedResponse<WeightLogEntry[]>(cacheKey, WEIGHT_CACHE_TTL_MS);
  if (cached) return cached;

  try {
    const res = await apiClient.get<WeightLogEntry[]>('/api/nutrition/weight', {
      params: { days },
    });
    cacheResponse(cacheKey, res.data, WEIGHT_CACHE_TTL_MS);
    // Persist to AsyncStorage for offline access
    await setCachedData('nutrition/summary', res.data);
    return res.data;
  } catch (error) {
    if (error instanceof NetworkError && (error.isOffline || error.isTimeout)) {
      const offlineCached = await getCachedData<WeightLogEntry[]>('nutrition/summary');
      if (offlineCached) return offlineCached;
      return [];
    }
    throw error;
  }
}

/**
 * Get weight chart data with predicted trajectory.
 * Cached in memory for 10 minutes.
 */
export async function getWeightChartData(weeks = 4): Promise<WeightChartData> {
  const cacheKey = CACHE_KEYS.WEIGHT_CHART(weeks);
  const cached = getCachedResponse<WeightChartData>(cacheKey, WEIGHT_CACHE_TTL_MS);
  if (cached) return cached;

  try {
    const res = await apiClient.get<WeightChartData>('/api/nutrition/weight/chart', {
      params: { weeks },
    });
    cacheResponse(cacheKey, res.data, WEIGHT_CACHE_TTL_MS);
    return res.data;
  } catch (error) {
    if (error instanceof NetworkError && (error.isOffline || error.isTimeout)) {
      // Return empty chart data when offline
      return {
        entries: [],
        predicted_entries: [],
        current_weight: null,
        target_weight: null,
        weight_change_4w: null,
      };
    }
    throw error;
  }
}
