/**
 * favorites.service.ts
 * Offline-first favorites using AsyncStorage + API sync.
 *
 * Network improvements:
 *   - Uses offline action queue for add/remove/log operations
 *   - In-memory cache for getFavorites (avoids redundant API calls)
 *   - Proper error handling with NetworkError for user-friendly messages
 *   - All functions have proper TypeScript return types
 *
 * Key: @fitsi_favorites
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';
import { getCachedNetworkStatus } from '../hooks/useNetworkStatus';
import { enqueueAction } from './offlineStore';
import {
  cacheResponse,
  getCachedResponse,
  invalidateCache,
} from './apiClient';

// ---- Types -------------------------------------------------------------------

/** Shape of a single favorite as returned by GET /api/favorites/ */
interface ServerFavorite {
  id: number;
  food_id: number | null;
  food_name: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  times_logged: number | null;
  created_at: string;
}

/** Shape of the response from POST /api/favorites/ */
interface ServerFavoriteCreateResponse {
  id: number;
  food_id: number | null;
}

export interface FavoriteFood {
  id: string;
  food_id?: number;
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
  emoji?: string;
  times_logged: number;
  created_at: string;
  /** Backend favorite ID (set after sync) */
  server_id?: number;
}

// ---- Constants ---------------------------------------------------------------

const STORAGE_KEY = '@fitsi_favorites';
const CACHE_KEY = 'favorites/list';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ---- Local storage helpers ---------------------------------------------------

async function loadLocal(): Promise<FavoriteFood[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveLocal(favorites: FavoriteFood[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
}

// ---- Public API --------------------------------------------------------------

/**
 * Get all favorites. Tries the API first (with in-memory cache),
 * falls back to local AsyncStorage when offline.
 */
export async function getFavorites(): Promise<FavoriteFood[]> {
  // Try in-memory cache first
  const cached = getCachedResponse<FavoriteFood[]>(CACHE_KEY, CACHE_TTL_MS);
  if (cached) return cached;

  const { isConnected } = getCachedNetworkStatus();

  if (isConnected) {
    try {
      const res = await api.get('/api/favorites/');
      const serverFavs: FavoriteFood[] = (res.data as ServerFavorite[]).map((f) => ({
        id: String(f.id),
        food_id: f.food_id ?? undefined,
        name: f.food_name ?? 'Unknown',
        calories: f.calories ?? 0,
        protein_g: f.protein_g ?? 0,
        carbs_g: f.carbs_g ?? 0,
        fats_g: f.fat_g ?? 0,
        times_logged: f.times_logged ?? 0,
        created_at: f.created_at,
        server_id: f.id,
      }));
      await saveLocal(serverFavs);
      cacheResponse(CACHE_KEY, serverFavs, CACHE_TTL_MS);
      return serverFavs;
    } catch {
      // Network failed despite being "connected" -- use local
      return loadLocal();
    }
  }

  // Offline -- use local storage
  return loadLocal();
}

/**
 * Add a food to favorites. Saves locally first (offline-first),
 * then syncs to the backend. Queues the sync when offline.
 */
export async function addFavorite(food: {
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
  emoji?: string;
  food_id?: number;
}): Promise<FavoriteFood> {
  const newFav: FavoriteFood = {
    id: `fav_${Date.now()}`,
    food_id: food.food_id,
    name: food.name,
    calories: food.calories,
    protein_g: food.protein_g,
    carbs_g: food.carbs_g,
    fats_g: food.fats_g,
    emoji: food.emoji,
    times_logged: 0,
    created_at: new Date().toISOString(),
  };

  // Save locally first (offline-first)
  const existing = await loadLocal();
  // Avoid duplicates by name
  if (!existing.find((f) => f.name.toLowerCase() === food.name.toLowerCase())) {
    existing.unshift(newFav);
    await saveLocal(existing);
  }

  // Invalidate in-memory cache
  invalidateCache(CACHE_KEY);

  // Build backend payload using the typed OfflinePayloadMap shape
  const offlinePayload: {
    food_name?: string;
    food_id?: number;
    calories?: number;
    protein_g?: number;
    carbs_g?: number;
    fat_g?: number;
  } = {};

  if (food.food_id) {
    offlinePayload.food_id = food.food_id;
  } else {
    // AI-scanned food: send name + macros so backend can auto-create a food entry
    offlinePayload.food_name = food.name;
    offlinePayload.calories = food.calories;
    offlinePayload.protein_g = food.protein_g;
    offlinePayload.carbs_g = food.carbs_g;
    offlinePayload.fat_g = food.fats_g; // backend uses fat_g (singular)
  }

  // Sync to backend
  const { isConnected } = getCachedNetworkStatus();
  if (!isConnected) {
    // Queue for later sync
    await enqueueAction('add_favorite', offlinePayload);
    return newFav;
  }

  try {
    const res = await api.post<ServerFavoriteCreateResponse>('/api/favorites/', offlinePayload);
    newFav.server_id = res.data.id;
    newFav.food_id = res.data.food_id ?? undefined;
    // Update local with server ID
    const updated = await loadLocal();
    const idx = updated.findIndex((f) => f.id === newFav.id);
    if (idx >= 0) {
      updated[idx].server_id = res.data.id;
      updated[idx].food_id = res.data.food_id ?? undefined;
      await saveLocal(updated);
    }
  } catch {
    // Failed despite being connected -- queue for retry
    await enqueueAction('add_favorite', offlinePayload);
  }

  return newFav;
}

/**
 * Remove a food from favorites. Updates local storage immediately,
 * then syncs the deletion to the backend.
 */
export async function removeFavorite(id: string): Promise<void> {
  const favorites = await loadLocal();
  const target = favorites.find((f) => f.id === id);
  const filtered = favorites.filter((f) => f.id !== id);
  await saveLocal(filtered);
  invalidateCache(CACHE_KEY);

  // Remove from backend
  if (target?.server_id) {
    const { isConnected } = getCachedNetworkStatus();
    if (!isConnected) {
      await enqueueAction('remove_favorite', { server_id: target.server_id });
      return;
    }

    try {
      await api.delete(`/api/favorites/${target.server_id}`);
    } catch {
      // Queue for later if it failed
      await enqueueAction('remove_favorite', { server_id: target.server_id });
    }
  }
}

/**
 * Log a favorite food as a meal. Increments the local counter
 * and syncs to the backend.
 */
export async function logFavorite(id: string, mealType = 'lunch'): Promise<void> {
  const favorites = await loadLocal();
  const target = favorites.find((f) => f.id === id);
  if (!target) return;

  // Increment times_logged locally
  target.times_logged += 1;
  await saveLocal(favorites);
  invalidateCache(CACHE_KEY);

  // Log via API
  if (target.server_id) {
    const { isConnected } = getCachedNetworkStatus();
    if (!isConnected) {
      await enqueueAction('log_favorite', {
        server_id: target.server_id,
        meal_type: mealType,
      });
      return;
    }

    try {
      await api.post(`/api/favorites/${target.server_id}/log?meal_type=${mealType}`);
    } catch {
      // Queue for later
      await enqueueAction('log_favorite', {
        server_id: target.server_id,
        meal_type: mealType,
      });
    }
  }
}

/**
 * Check if a food is already in favorites by name (case-insensitive).
 */
export async function isFavorite(name: string): Promise<boolean> {
  const favorites = await loadLocal();
  return favorites.some((f) => f.name.toLowerCase() === name.toLowerCase());
}

/**
 * Toggle a food's favorite status. Returns true if added, false if removed.
 */
export async function toggleFavorite(food: {
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
  emoji?: string;
  food_id?: number;
}): Promise<boolean> {
  const favorites = await loadLocal();
  const existing = favorites.find(
    (f) => f.name.toLowerCase() === food.name.toLowerCase(),
  );

  if (existing) {
    await removeFavorite(existing.id);
    return false; // removed
  } else {
    await addFavorite(food);
    return true; // added
  }
}

/**
 * Check if a food has been logged 3+ times and is not yet a favorite.
 * Used for the smart suggestion feature.
 */
export async function shouldSuggestFavorite(foodName: string, logCount: number): Promise<boolean> {
  if (logCount < 3) return false;
  return !(await isFavorite(foodName));
}
