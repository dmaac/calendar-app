/**
 * offlineStore.ts — Offline-first data layer.
 *
 * - Caches API responses locally using AsyncStorage.
 * - Maintains an action queue for mutations made while offline.
 * - Auto-syncs the queue when connectivity is restored.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AxiosError } from 'axios';
import { getNetworkStatus } from '../hooks/useNetworkStatus';

// ─── Cache keys ──────────────────────────────────────────────────────────────

const CACHE_PREFIX = '@fitsi_cache:';
const QUEUE_KEY = '@fitsi_offline_queue';

export type CacheKey =
  | 'dashboard/today'
  | 'food/logs'
  | 'onboarding/profile'
  | 'nutrition/summary'
  | 'activities/today';

function cacheKey(key: CacheKey): string {
  return `${CACHE_PREFIX}${key}`;
}

// ─── Cache read/write ────────────────────────────────────────────────────────

export async function getCachedData<T>(key: CacheKey): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(key));
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw);
    // Cache expires after 24 hours
    const MAX_AGE_MS = 24 * 60 * 60 * 1000;
    if (Date.now() - timestamp > MAX_AGE_MS) {
      await AsyncStorage.removeItem(cacheKey(key));
      return null;
    }
    return data as T;
  } catch {
    return null;
  }
}

export async function setCachedData<T>(key: CacheKey, data: T): Promise<void> {
  try {
    await AsyncStorage.setItem(
      cacheKey(key),
      JSON.stringify({ data, timestamp: Date.now() }),
    );
  } catch {
    // Storage full or unavailable — silently fail
  }
}

export async function clearCache(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const cacheKeys = allKeys.filter((k) => k.startsWith(CACHE_PREFIX));
    if (cacheKeys.length > 0) {
      await AsyncStorage.multiRemove(cacheKeys);
    }
  } catch {
    // ignore
  }
}

// ─── Offline action queue ────────────────────────────────────────────────────

/** Payload shapes for each offline action type. */
export interface OfflinePayloadMap {
  log_food: {
    food_name: string;
    calories: number;
    carbs_g: number;
    protein_g: number;
    fats_g: number;
    fiber_g?: number;
    serving_size?: string;
    meal_type: string;
  };
  log_water: { ml: number };
  log_meal: {
    date: string;
    meal_type: string;
    food_id: number;
    servings: number;
  };
  delete_meal: { id: number };
  edit_food_log: { id: number; updates: Record<string, unknown> };
  delete_food_log: { id: number };
  quick_log_food: {
    food_name?: string;
    calories?: number;
    protein_g?: number;
    carbs_g?: number;
    fats_g?: number;
    fiber_g?: number;
    sugar_g?: number;
    sodium_mg?: number;
    serving_size?: string;
    meal_type: string;
    food_log_id?: number;
  };
  log_workout: {
    workout_type: string;
    duration_min: number;
    calories_burned?: number | null;
    notes?: string | null;
  };
  delete_workout: { id: number };
  apply_adaptive_target: Record<string, never>;
  dismiss_adaptive_target: Record<string, never>;
  log_weight: {
    weight_kg: number;
    date?: string;
    source?: string;
    notes?: string;
  };
  add_favorite: {
    food_name?: string;
    food_id?: number;
    calories?: number;
    protein_g?: number;
    carbs_g?: number;
    fat_g?: number;
  };
  remove_favorite: { server_id: number };
  log_favorite: { server_id: number; meal_type: string };
}

export type OfflineActionType = keyof OfflinePayloadMap;

export interface OfflineAction {
  id: string;
  type: OfflineActionType;
  payload: OfflinePayloadMap[OfflineActionType];
  createdAt: number;
}

export async function getOfflineQueue(): Promise<OfflineAction[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveQueue(queue: OfflineAction[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // ignore
  }
}

export async function enqueueAction<T extends OfflineActionType>(
  type: T,
  payload: OfflinePayloadMap[T],
): Promise<OfflineAction> {
  const action: OfflineAction = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    payload,
    createdAt: Date.now(),
  };
  const queue = await getOfflineQueue();
  queue.push(action);
  await saveQueue(queue);
  return action;
}

export async function removeFromQueue(actionId: string): Promise<void> {
  const queue = await getOfflineQueue();
  await saveQueue(queue.filter((a) => a.id !== actionId));
}

export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}

// ─── Sync engine ─────────────────────────────────────────────────────────────

type SyncHandler = (action: OfflineAction) => Promise<void>;

const syncHandlers: Record<string, SyncHandler> = {};

export function registerSyncHandler(type: OfflineAction['type'], handler: SyncHandler): void {
  syncHandlers[type] = handler;
}

let _isSyncing = false;
const _syncListeners = new Set<(pending: number) => void>();

export function onSyncProgress(cb: (pending: number) => void): () => void {
  _syncListeners.add(cb);
  return () => _syncListeners.delete(cb);
}

/**
 * Process the offline queue. Called when internet comes back.
 * Returns the number of successfully synced actions.
 */
export async function syncQueue(): Promise<number> {
  if (_isSyncing) return 0;

  const { isConnected } = await getNetworkStatus();
  if (!isConnected) return 0;

  _isSyncing = true;
  let synced = 0;

  try {
    const queue = await getOfflineQueue();
    if (queue.length === 0) return 0;

    _syncListeners.forEach((cb) => cb(queue.length));

    for (const action of queue) {
      const handler = syncHandlers[action.type];
      if (!handler) {
        // No handler registered — remove stale action
        await removeFromQueue(action.id);
        continue;
      }

      try {
        await handler(action);
        await removeFromQueue(action.id);
        synced++;
      } catch (err: unknown) {
        // If it's a 4xx (client error), the data is invalid — drop it
        const axiosErr = err as AxiosError;
        const status = axiosErr?.response?.status;
        if (status !== undefined && status >= 400 && status < 500) {
          await removeFromQueue(action.id);
        }
        // 5xx or network error — keep in queue for next attempt
        break;
      }
    }

    const remaining = await getOfflineQueue();
    _syncListeners.forEach((cb) => cb(remaining.length));
  } finally {
    _isSyncing = false;
  }

  return synced;
}

// ─── Helper: fetch with cache fallback ───────────────────────────────────────

/**
 * Tries to fetch data from the network. On success, caches it.
 * On failure (offline), returns cached data.
 */
export async function fetchWithCache<T>(
  key: CacheKey,
  fetcher: () => Promise<T>,
): Promise<{ data: T; fromCache: boolean }> {
  const { isConnected } = await getNetworkStatus();

  if (isConnected) {
    try {
      const data = await fetcher();
      await setCachedData(key, data);
      return { data, fromCache: false };
    } catch {
      // Network request failed despite being "connected" — try cache
      const cached = await getCachedData<T>(key);
      if (cached) return { data: cached, fromCache: true };
      throw new Error('No cached data available');
    }
  }

  // Offline — use cache
  const cached = await getCachedData<T>(key);
  if (cached) return { data: cached, fromCache: true };
  throw new Error('No cached data available and device is offline');
}
