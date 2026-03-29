/**
 * offlineSync.ts -- Registers sync handlers and starts the auto-sync watcher.
 * Import this once at app startup (e.g., in App.tsx or AppNavigator).
 *
 * Handles all offline action types:
 *   - Food: log, edit, delete, quick-log, water
 *   - Meals: log, delete
 *   - Workouts: log, delete
 *   - Adaptive calories: apply, dismiss
 *   - Weight: log
 *   - Favorites: add, remove, log
 */
import { registerSyncHandler, syncQueue, OfflineAction, OfflinePayloadMap } from './offlineStore';
import { getNetworkStatus } from '../hooks/useNetworkStatus';
import * as foodService from './food.service';
import type { ManualFoodEntry, QuickLogRequest } from './food.service';
import * as workoutService from './workout.service';
import type { WorkoutLogCreate } from './workout.service';
import * as adaptiveService from './adaptiveCalorie.service';
import type { WeightLogCreate } from './adaptiveCalorie.service';
import type { AIFoodLog } from '../types';
import type { MealLogCreate } from '../types';
import ApiService, { api } from './api';

// ---- Food handlers ----------------------------------------------------------

registerSyncHandler('log_food', async (action: OfflineAction) => {
  const payload = action.payload as OfflinePayloadMap['log_food'];
  await foodService.manualLogFood(payload as ManualFoodEntry);
});

registerSyncHandler('log_water', async (action: OfflineAction) => {
  const payload = action.payload as OfflinePayloadMap['log_water'];
  await foodService.logWater(payload.ml);
});

registerSyncHandler('edit_food_log', async (action: OfflineAction) => {
  const payload = action.payload as OfflinePayloadMap['edit_food_log'];
  await foodService.editFoodLog(payload.id, payload.updates as Partial<AIFoodLog>);
});

registerSyncHandler('delete_food_log', async (action: OfflineAction) => {
  const payload = action.payload as OfflinePayloadMap['delete_food_log'];
  await foodService.deleteFoodLog(payload.id);
});

registerSyncHandler('quick_log_food', async (action: OfflineAction) => {
  const payload = action.payload as OfflinePayloadMap['quick_log_food'];
  await foodService.quickLogFood(payload as QuickLogRequest);
});

// ---- Meal handlers ----------------------------------------------------------

registerSyncHandler('log_meal', async (action: OfflineAction) => {
  const payload = action.payload as OfflinePayloadMap['log_meal'];
  await ApiService.logMeal(payload as MealLogCreate);
});

registerSyncHandler('delete_meal', async (action: OfflineAction) => {
  const payload = action.payload as { id: number };
  await ApiService.deleteMeal(payload.id);
});

// ---- Workout handlers -------------------------------------------------------

registerSyncHandler('log_workout', async (action: OfflineAction) => {
  const payload = action.payload as OfflinePayloadMap['log_workout'];
  await workoutService.logWorkout(payload as WorkoutLogCreate);
});

registerSyncHandler('delete_workout', async (action: OfflineAction) => {
  const payload = action.payload as OfflinePayloadMap['delete_workout'];
  await workoutService.deleteWorkout(payload.id);
});

// ---- Adaptive calorie handlers ----------------------------------------------

registerSyncHandler('apply_adaptive_target', async () => {
  await adaptiveService.applyAdaptiveTarget();
});

registerSyncHandler('dismiss_adaptive_target', async () => {
  await adaptiveService.dismissAdaptiveTarget();
});

// ---- Weight handler ---------------------------------------------------------

registerSyncHandler('log_weight', async (action: OfflineAction) => {
  const payload = action.payload as OfflinePayloadMap['log_weight'];
  await adaptiveService.logWeight(payload as WeightLogCreate);
});

// ---- Favorites handlers -----------------------------------------------------

registerSyncHandler('add_favorite', async (action: OfflineAction) => {
  await api.post('/api/favorites/', action.payload);
});

registerSyncHandler('remove_favorite', async (action: OfflineAction) => {
  const payload = action.payload as { server_id: number };
  await api.delete(`/api/favorites/${payload.server_id}`);
});

registerSyncHandler('log_favorite', async (action: OfflineAction) => {
  const payload = action.payload as { server_id: number; meal_type: string };
  await api.post(`/api/favorites/${payload.server_id}/log?meal_type=${payload.meal_type}`);
});

// ---- Auto-sync watcher ------------------------------------------------------

let _watcherInterval: ReturnType<typeof setInterval> | null = null;
let _wasOffline = false;

/**
 * Start watching for connectivity changes and auto-sync when back online.
 * Call once at app startup.
 */
export function startOfflineSyncWatcher(): void {
  if (_watcherInterval) return;

  _watcherInterval = setInterval(async () => {
    const { isConnected } = await getNetworkStatus();

    if (isConnected && _wasOffline) {
      // Just came back online -- trigger sync
      await syncQueue();
    }

    _wasOffline = !isConnected;
  }, 5000);
}

export function stopOfflineSyncWatcher(): void {
  if (_watcherInterval) {
    clearInterval(_watcherInterval);
    _watcherInterval = null;
  }
}
