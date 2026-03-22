/**
 * offlineSync.ts — Registers sync handlers and starts the auto-sync watcher.
 * Import this once at app startup (e.g., in App.tsx or AppNavigator).
 */
import { registerSyncHandler, syncQueue, OfflineAction } from './offlineStore';
import { getNetworkStatus } from '../hooks/useNetworkStatus';
import * as foodService from './food.service';
import ApiService from './api';

// ─── Register handlers for each offline action type ──────────────────────────

registerSyncHandler('log_food', async (action: OfflineAction) => {
  await foodService.manualLogFood(action.payload);
});

registerSyncHandler('log_water', async (action: OfflineAction) => {
  await foodService.logWater(action.payload.ml);
});

registerSyncHandler('log_meal', async (action: OfflineAction) => {
  await ApiService.logMeal(action.payload);
});

registerSyncHandler('delete_meal', async (action: OfflineAction) => {
  await ApiService.deleteMeal(action.payload.id);
});

// ─── Auto-sync watcher ──────────────────────────────────────────────────────

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
      // Just came back online — trigger sync
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
