/**
 * useHealthKit — React hook wrapping the HealthKit service
 *
 * Provides reactive state for HealthKit data (steps, active calories, weight)
 * and methods to connect/disconnect. Handles:
 *   - Auto-sync on app focus (when connected)
 *   - Retry with exponential backoff on failure
 *   - Persisted connection state across app restarts
 *   - Safe fallback when HealthKit is unavailable (mock service)
 *
 * Usage:
 *   const { connected, steps, activeCalories, weight, connect, disconnect, refresh } = useHealthKit();
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import HealthKitService, {
  isAvailable as healthKitIsAvailable,
  HealthKitSteps,
  HealthKitActiveCalories,
  HealthKitWeight,
  HealthKitAuthStatus,
} from '../services/healthKit.service';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface UseHealthKitState {
  /** Whether the user has connected/authorized HealthKit. */
  connected: boolean;
  /** Whether the HealthKit SDK is available on this device/platform. */
  isAvailable: boolean;
  /** Whether data is currently being fetched. */
  loading: boolean;
  /** Last error message, or null. */
  error: string | null;
  /** Today's step count data. */
  steps: HealthKitSteps | null;
  /** Today's active calories burned. */
  activeCalories: HealthKitActiveCalories | null;
  /** Most recent weight measurement. */
  weight: HealthKitWeight | null;
  /** Request permissions and connect to HealthKit. */
  connect: () => Promise<boolean>;
  /** Disconnect from HealthKit (clear local state, not OS permissions). */
  disconnect: () => Promise<void>;
  /** Manually refresh all HealthKit data. */
  refresh: () => Promise<void>;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Base delay for exponential backoff (ms). */
const BASE_RETRY_DELAY = 1000;
/** Maximum retry attempts before giving up. */
const MAX_RETRIES = 3;
/** Maximum backoff delay (ms). */
const MAX_DELAY = 16000;

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useHealthKit(): UseHealthKitState {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<HealthKitSteps | null>(null);
  const [activeCalories, setActiveCalories] = useState<HealthKitActiveCalories | null>(null);
  const [weight, setWeight] = useState<HealthKitWeight | null>(null);

  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  // ─── Fetch all HealthKit data ─────────────────────────────────────────

  const fetchData = useCallback(async (): Promise<void> => {
    if (!isMountedRef.current) return;

    setLoading(true);
    setError(null);

    try {
      const [stepsResult, caloriesResult, weightResult] = await Promise.allSettled([
        HealthKitService.getSteps(),
        HealthKitService.getActiveCalories(),
        HealthKitService.getWeight(),
      ]);

      if (!isMountedRef.current) return;

      if (stepsResult.status === 'fulfilled') {
        setSteps(stepsResult.value);
      }
      if (caloriesResult.status === 'fulfilled') {
        setActiveCalories(caloriesResult.value);
      }
      if (weightResult.status === 'fulfilled') {
        setWeight(weightResult.value);
      }

      // Check if any failed
      const anyFailed = [stepsResult, caloriesResult, weightResult].some(
        (r) => r.status === 'rejected',
      );

      if (anyFailed) {
        throw new Error('Partial HealthKit data fetch failure');
      }

      // Success — reset retry counter
      retryCountRef.current = 0;
    } catch (err) {
      if (!isMountedRef.current) return;

      const message = err instanceof Error ? err.message : 'HealthKit fetch failed';
      setError(message);

      // ── Exponential backoff retry ──
      if (retryCountRef.current < MAX_RETRIES) {
        const delay = Math.min(
          BASE_RETRY_DELAY * Math.pow(2, retryCountRef.current),
          MAX_DELAY,
        );
        retryCountRef.current += 1;

        retryTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            fetchData();
          }
        }, delay);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  // ─── Connect (request permissions + initial sync) ─────────────────────

  const connect = useCallback(async (): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);
      retryCountRef.current = 0;

      const status: HealthKitAuthStatus = await HealthKitService.requestPermissions();

      if (!isMountedRef.current) return false;

      if (status === 'authorized') {
        setConnected(true);
        await fetchData();
        return true;
      }

      if (status === 'denied') {
        setError('Permisos de salud denegados. Activalos en Configuracion > Salud.');
        setConnected(false);
        return false;
      }

      if (status === 'unavailable') {
        setError('Apple Health no esta disponible en este dispositivo.');
        setConnected(false);
        return false;
      }

      // notDetermined or other — treat as not connected
      setConnected(false);
      return false;
    } catch (err) {
      if (!isMountedRef.current) return false;
      const message = err instanceof Error ? err.message : 'Error al conectar con Apple Health';
      setError(message);
      setConnected(false);
      return false;
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [fetchData]);

  // ─── Disconnect ───────────────────────────────────────────────────────

  const disconnectHealthKit = useCallback(async (): Promise<void> => {
    try {
      await HealthKitService.disconnect();
      if (!isMountedRef.current) return;
      setConnected(false);
      setSteps(null);
      setActiveCalories(null);
      setWeight(null);
      setError(null);
      retryCountRef.current = 0;
    } catch {
      // Non-critical
    }
  }, []);

  // ─── Manual refresh ───────────────────────────────────────────────────

  const refresh = useCallback(async (): Promise<void> => {
    retryCountRef.current = 0;
    await fetchData();
  }, [fetchData]);

  // ─── Restore persisted connection state on mount ──────────────────────

  useEffect(() => {
    isMountedRef.current = true;

    const restore = async () => {
      const wasConnected = await HealthKitService.loadConnectedState();
      if (!isMountedRef.current) return;

      if (wasConnected) {
        setConnected(true);
        // Auto-sync on restore
        fetchData();
      }
    };

    restore();

    return () => {
      isMountedRef.current = false;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [fetchData]);

  // ─── Auto-sync when app comes to foreground ───────────────────────────

  useEffect(() => {
    if (!connected) return;

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active' && isMountedRef.current) {
        retryCountRef.current = 0;
        fetchData();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [connected, fetchData]);

  return {
    connected,
    isAvailable: healthKitIsAvailable || Platform.OS === 'ios',
    loading,
    error,
    steps,
    activeCalories,
    weight,
    connect,
    disconnect: disconnectHealthKit,
    refresh,
  };
}

export default useHealthKit;
