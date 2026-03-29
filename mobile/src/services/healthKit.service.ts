/**
 * healthKit.service.ts — Apple Health / HealthKit integration service
 *
 * MOCK IMPLEMENTATION: No HealthKit dependency is installed (no expo-health,
 * react-native-health, or similar in package.json). This mock service exports
 * the same interface so the rest of the app can function without the real SDK.
 *
 * When a real HealthKit library is added:
 *   1. Install the dependency (e.g. `npx expo install expo-health`)
 *   2. Replace the mock implementations below with real SDK calls
 *   3. Set `isAvailable` based on Platform.OS === 'ios' and SDK availability
 *
 * All functions are safe to call on any platform — they return sensible
 * defaults and never throw.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface HealthKitPermissions {
  read: readonly string[];
  write: readonly string[];
}

export interface HealthKitSteps {
  date: string;
  count: number;
}

export interface HealthKitActiveCalories {
  date: string;
  kcal: number;
}

export interface HealthKitWeight {
  date: string;
  kg: number;
}

export interface HealthKitMealEntry {
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
  date: string;
  meal_type: string;
}

export type HealthKitAuthStatus = 'notDetermined' | 'authorized' | 'denied' | 'unavailable';

// ─── Storage key ────────────────────────────────────────────────────────────

const HEALTH_CONNECTED_KEY = '@fitsi_health_connected';

// ─── Mock flag ──────────────────────────────────────────────────────────────

/**
 * `isAvailable` is false because no real HealthKit SDK is installed.
 * When a real dependency is added, set this based on:
 *   Platform.OS === 'ios' && HealthKit.isAvailable()
 */
export const isAvailable = false;

/**
 * Whether the mock service should return simulated data.
 * When true, mock functions return realistic sample data so the UI
 * can display something meaningful during development.
 */
const RETURN_MOCK_DATA = true;

// ─── Helpers ────────────────────────────────────────────────────────────────

function todayString(): string {
  return new Date().toISOString().split('T')[0];
}

/** Generate a deterministic but varied mock step count for a given date. */
function mockStepsForDate(dateStr: string): number {
  const hash = dateStr.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  // Returns a value between 4000 and 12000
  return 4000 + (hash * 137) % 8001;
}

/** Generate mock active calories for a given date. */
function mockCaloriesForDate(dateStr: string): number {
  const hash = dateStr.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  // Returns a value between 150 and 500
  return 150 + (hash * 43) % 351;
}

// ─── Connection persistence ─────────────────────────────────────────────────

/**
 * Save HealthKit connected state to AsyncStorage.
 * This persists the user's opt-in across app restarts.
 */
export async function saveConnectedState(connected: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(HEALTH_CONNECTED_KEY, JSON.stringify(connected));
  } catch {
    // Non-critical — swallow silently
  }
}

/**
 * Load HealthKit connected state from AsyncStorage.
 */
export async function loadConnectedState(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(HEALTH_CONNECTED_KEY);
    return raw ? JSON.parse(raw) === true : false;
  } catch {
    return false;
  }
}

// ─── Service functions ──────────────────────────────────────────────────────

/**
 * Request HealthKit permissions from the user.
 *
 * MOCK: Always resolves to 'authorized' after saving the connected state.
 * Real implementation should call HealthKit.requestAuthorization() with the
 * appropriate read/write permissions for steps, activeEnergy, weight, and
 * dietary data.
 */
export async function requestPermissions(): Promise<HealthKitAuthStatus> {
  if (!isAvailable && Platform.OS !== 'ios') {
    return 'unavailable';
  }

  // Mock: simulate a short delay like a real permission dialog
  await new Promise((resolve) => setTimeout(resolve, 500));
  await saveConnectedState(true);
  return 'authorized';
}

/**
 * Get the current authorization status.
 *
 * MOCK: Returns status based on persisted connected state.
 */
export async function getAuthStatus(): Promise<HealthKitAuthStatus> {
  if (!isAvailable && Platform.OS !== 'ios') {
    return 'unavailable';
  }

  const connected = await loadConnectedState();
  return connected ? 'authorized' : 'notDetermined';
}

/**
 * Get step count for a specific date.
 *
 * MOCK: Returns deterministic mock data based on the date string.
 * Real implementation: query HKQuantityType.stepCount for the given day.
 *
 * @param date ISO date string (YYYY-MM-DD). Defaults to today.
 */
export async function getSteps(date?: string): Promise<HealthKitSteps> {
  const dateStr = date ?? todayString();

  if (!RETURN_MOCK_DATA) {
    return { date: dateStr, count: 0 };
  }

  return {
    date: dateStr,
    count: mockStepsForDate(dateStr),
  };
}

/**
 * Get active calories burned for a specific date.
 *
 * MOCK: Returns deterministic mock data.
 * Real implementation: query HKQuantityType.activeEnergyBurned for the given day.
 *
 * @param date ISO date string (YYYY-MM-DD). Defaults to today.
 */
export async function getActiveCalories(date?: string): Promise<HealthKitActiveCalories> {
  const dateStr = date ?? todayString();

  if (!RETURN_MOCK_DATA) {
    return { date: dateStr, kcal: 0 };
  }

  return {
    date: dateStr,
    kcal: mockCaloriesForDate(dateStr),
  };
}

/**
 * Get the most recent weight measurement.
 *
 * MOCK: Returns a fixed weight.
 * Real implementation: query HKQuantityType.bodyMass, most recent sample.
 */
export async function getWeight(): Promise<HealthKitWeight | null> {
  if (!RETURN_MOCK_DATA) {
    return null;
  }

  return {
    date: todayString(),
    kg: 75.5,
  };
}

/**
 * Sync meals logged in the app to Apple Health as dietary energy entries.
 *
 * MOCK: No-op that resolves successfully.
 * Real implementation: write HKQuantityType.dietaryEnergyConsumed +
 * macronutrient samples for each meal.
 *
 * @param meals Array of meal entries to sync.
 */
export async function syncMealsToHealth(meals: HealthKitMealEntry[]): Promise<boolean> {
  if (meals.length === 0) return true;

  // Mock: simulate write delay
  await new Promise((resolve) => setTimeout(resolve, 300));
  return true;
}

/**
 * Disconnect from HealthKit — clears persisted state.
 * Does NOT revoke OS-level permissions (that requires the user to go to
 * Settings > Health > Data Access).
 */
export async function disconnect(): Promise<void> {
  await saveConnectedState(false);
}

// ─── Default export for convenience ─────────────────────────────────────────

const HealthKitService = {
  isAvailable,
  requestPermissions,
  getAuthStatus,
  getSteps,
  getActiveCalories,
  getWeight,
  syncMealsToHealth,
  disconnect,
  saveConnectedState,
  loadConnectedState,
};

export default HealthKitService;
