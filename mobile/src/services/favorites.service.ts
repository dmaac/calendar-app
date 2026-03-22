/**
 * favorites.service.ts
 * Offline-first favorites using AsyncStorage + API sync.
 * Key: @fitsi_favorites
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';

const STORAGE_KEY = '@fitsi_favorites';

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

// ── Local storage helpers ────────────────────────────────────────────────────

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

// ── Public API ───────────────────────────────────────────────────────────────

export async function getFavorites(): Promise<FavoriteFood[]> {
  // Try API first, fall back to local
  try {
    const res = await api.get('/api/favorites/');
    const serverFavs: FavoriteFood[] = (res.data as any[]).map((f) => ({
      id: String(f.id),
      food_id: f.food_id,
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
    return serverFavs;
  } catch {
    return loadLocal();
  }
}

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

  // Sync to backend if food_id available
  if (food.food_id) {
    try {
      const res = await api.post('/api/favorites/', { food_id: food.food_id });
      newFav.server_id = res.data.id;
      // Update local with server ID
      const updated = await loadLocal();
      const idx = updated.findIndex((f) => f.id === newFav.id);
      if (idx >= 0) {
        updated[idx].server_id = res.data.id;
        await saveLocal(updated);
      }
    } catch {
      // Offline — will sync later
    }
  }

  return newFav;
}

export async function removeFavorite(id: string): Promise<void> {
  const favorites = await loadLocal();
  const target = favorites.find((f) => f.id === id);
  const filtered = favorites.filter((f) => f.id !== id);
  await saveLocal(filtered);

  // Remove from backend
  if (target?.server_id) {
    try {
      await api.delete(`/api/favorites/${target.server_id}`);
    } catch {
      // Best effort
    }
  }
}

export async function logFavorite(id: string, mealType = 'lunch'): Promise<void> {
  const favorites = await loadLocal();
  const target = favorites.find((f) => f.id === id);
  if (!target) return;

  // Increment times_logged locally
  target.times_logged += 1;
  await saveLocal(favorites);

  // Log via API
  if (target.server_id) {
    try {
      await api.post(`/api/favorites/${target.server_id}/log?meal_type=${mealType}`);
    } catch {
      // Best effort — meal was counted locally
    }
  }
}

export async function isFavorite(name: string): Promise<boolean> {
  const favorites = await loadLocal();
  return favorites.some((f) => f.name.toLowerCase() === name.toLowerCase());
}

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
