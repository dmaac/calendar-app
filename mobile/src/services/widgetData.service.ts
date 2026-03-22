/**
 * widgetData.service.ts -- Prepares and persists data for native home screen widgets.
 *
 * Purpose:
 *   Exposes today's key metrics (calories, macros, NutriScore, streak) in a
 *   format consumable by iOS WidgetKit / Android app widgets via shared storage.
 *
 * Storage strategy:
 *   - Uses AsyncStorage as the persistence layer.
 *   - On iOS, a future native module can bridge this to UserDefaults via an
 *     App Group (e.g., expo-shared-preferences or react-native-shared-group-preferences).
 *   - For now, data is stored under @fitsi_widget_data and can be read by any
 *     native extension that shares the same AsyncStorage container.
 *
 * Usage:
 *   Call `syncWidgetData()` after every food log, water log, or daily refresh.
 *   The function is idempotent and safe to call frequently.
 *
 * NutriScore calculation is inlined here (same algorithm as NutriScore.tsx)
 * to avoid importing React component dependencies from a pure service file.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WidgetData {
  /** ISO date string (YYYY-MM-DD) this data corresponds to */
  date: string;
  /** Calories consumed today */
  calories_consumed: number;
  /** Daily calorie target */
  calories_target: number;
  /** Protein consumed (grams) */
  protein_g: number;
  /** Protein target (grams) */
  protein_target_g: number;
  /** Carbs consumed (grams) */
  carbs_g: number;
  /** Carbs target (grams) */
  carbs_target_g: number;
  /** Fats consumed (grams) */
  fats_g: number;
  /** Fats target (grams) */
  fats_target_g: number;
  /** Water consumed (ml) */
  water_ml: number;
  /** NutriScore 0-100 */
  nutri_score: number;
  /** Consecutive logging streak in days */
  streak_days: number;
  /** Number of meals logged today */
  meals_logged: number;
  /** ISO 8601 timestamp of last sync */
  last_synced_at: string;
}

export interface WidgetDataInput {
  total_calories: number;
  target_calories: number;
  total_protein_g: number;
  target_protein_g: number;
  total_carbs_g: number;
  target_carbs_g: number;
  total_fats_g: number;
  target_fats_g: number;
  water_ml: number;
  streak_days: number;
  meals_logged: number;
  /** Total fiber consumed (grams), for NutriScore calculation */
  total_fiber_g?: number;
  /** Number of distinct food items logged, for NutriScore variety */
  food_variety?: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const WIDGET_STORAGE_KEY = '@fitsi_widget_data';

/**
 * Shared UserDefaults key. On iOS, this would be written to an App Group
 * container so WidgetKit can read it. Placeholder for native bridging.
 */
const SHARED_DEFAULTS_KEY = 'com.fitsi.widget.dailyData';

// ─── NutriScore (inlined, pure function) ────────────────────────────────────

function macroAdherenceScore(
  actual: number,
  target: number,
): number {
  if (target <= 0) return 100;
  const deviation = Math.abs(actual - target) / target;
  return Math.max(0, Math.min(100, (1 - deviation) * 100));
}

function calculateNutriScore(input: WidgetDataInput): number {
  const proteinScore = macroAdherenceScore(input.total_protein_g, input.target_protein_g);
  const carbsScore = macroAdherenceScore(input.total_carbs_g, input.target_carbs_g);
  const fatsScore = macroAdherenceScore(input.total_fats_g, input.target_fats_g);
  const macroComposite = proteinScore * 0.4 + carbsScore * 0.3 + fatsScore * 0.3;

  const fiberGoal = 25;
  const fiberScore = Math.min(100, ((input.total_fiber_g ?? 0) / fiberGoal) * 100);

  const waterGoal = 2500;
  const hydrationScore = Math.min(100, (input.water_ml / waterGoal) * 100);

  const varietyGoal = 4;
  const varietyScore = Math.min(100, ((input.food_variety ?? 0) / varietyGoal) * 100);

  const composite =
    macroComposite * 0.4 +
    fiberScore * 0.2 +
    hydrationScore * 0.2 +
    varietyScore * 0.2;

  return Math.round(Math.max(0, Math.min(100, composite)));
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Sync widget data to shared storage.
 *
 * Call this after:
 *   - Food scan / manual log
 *   - Water log
 *   - Dashboard refresh
 *   - Daily summary load
 *
 * Safe to call frequently -- writes are debounced internally via
 * the caller's natural invocation pattern (post-action only).
 */
export async function syncWidgetData(input: WidgetDataInput): Promise<WidgetData> {
  const widgetData: WidgetData = {
    date: todayISO(),
    calories_consumed: Math.round(input.total_calories),
    calories_target: Math.round(input.target_calories),
    protein_g: Math.round(input.total_protein_g),
    protein_target_g: Math.round(input.target_protein_g),
    carbs_g: Math.round(input.total_carbs_g),
    carbs_target_g: Math.round(input.target_carbs_g),
    fats_g: Math.round(input.total_fats_g),
    fats_target_g: Math.round(input.target_fats_g),
    water_ml: Math.round(input.water_ml),
    nutri_score: calculateNutriScore(input),
    streak_days: input.streak_days,
    meals_logged: input.meals_logged,
    last_synced_at: new Date().toISOString(),
  };

  // Write to AsyncStorage (accessible by React Native)
  await AsyncStorage.setItem(WIDGET_STORAGE_KEY, JSON.stringify(widgetData));

  // Write to shared UserDefaults if native module is available.
  // This is a best-effort call -- no-op if the module is not installed.
  await writeToSharedDefaults(widgetData);

  return widgetData;
}

/**
 * Read the most recent widget data from storage.
 * Returns null if no data has been synced or data is stale (different day).
 */
export async function getWidgetData(): Promise<WidgetData | null> {
  try {
    const raw = await AsyncStorage.getItem(WIDGET_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as WidgetData;

    // Return null if data is from a different day (stale)
    if (data.date !== todayISO()) return null;

    return data;
  } catch {
    return null;
  }
}

/**
 * Clear widget data from all storage layers.
 * Useful on logout or account deletion.
 */
export async function clearWidgetData(): Promise<void> {
  await AsyncStorage.removeItem(WIDGET_STORAGE_KEY);
  await clearSharedDefaults();
}

// ─── Shared UserDefaults bridge (mock / future native module) ───────────────

/**
 * Attempts to write widget data to iOS App Group UserDefaults
 * or Android SharedPreferences via a native bridge.
 *
 * Currently a no-op stub. When expo-shared-preferences or a custom
 * native module is added, replace this with the actual call:
 *
 *   import * as SharedPreferences from 'expo-shared-preferences';
 *   await SharedPreferences.setItem(SHARED_DEFAULTS_KEY, JSON.stringify(data));
 */
async function writeToSharedDefaults(data: WidgetData): Promise<void> {
  try {
    // Attempt dynamic import -- will silently fail if not installed
    const SharedPreferences = await import('expo-shared-preferences' as string).catch(
      () => null,
    );

    if (SharedPreferences && typeof SharedPreferences.setItemAsync === 'function') {
      await SharedPreferences.setItemAsync(
        SHARED_DEFAULTS_KEY,
        JSON.stringify(data),
      );
    }
    // If module not available, this is expected -- widget bridge not yet set up
  } catch {
    // Silently ignore -- shared preferences bridge is optional
  }
}

async function clearSharedDefaults(): Promise<void> {
  try {
    const SharedPreferences = await import('expo-shared-preferences' as string).catch(
      () => null,
    );
    if (SharedPreferences && typeof SharedPreferences.deleteItemAsync === 'function') {
      await SharedPreferences.deleteItemAsync(SHARED_DEFAULTS_KEY);
    }
  } catch {
    // Silently ignore
  }
}
