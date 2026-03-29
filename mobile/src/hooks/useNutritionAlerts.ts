/**
 * useNutritionAlerts — Fetches daily nutrition alerts from the backend.
 *
 * Polls GET /api/alerts/daily every 5 minutes while the hook is mounted.
 * Provides convenience flags (hasCritical, hasDanger) for the UI to decide
 * rendering mode (full-screen overlay vs banner vs subtle card).
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { apiClient } from '../services/apiClient';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface NutritionAlertData {
  level: 'info' | 'warning' | 'danger' | 'critical';
  title: string;
  message: string;
  icon: string;
  color: string;
  action_label: string;
  action_route: string;
}

interface AlertsResponse {
  alerts: NutritionAlertData[];
  count: number;
  has_critical: boolean;
  has_danger: boolean;
  max_level: string;
}

interface UseNutritionAlertsResult {
  alerts: NutritionAlertData[];
  loading: boolean;
  error: boolean;
  hasCritical: boolean;
  hasDanger: boolean;
  maxLevel: string;
  refetch: () => Promise<void>;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Hook ───────────────────────────────────────────────────────────────────

export default function useNutritionAlerts(): UseNutritionAlertsResult {
  const [alerts, setAlerts] = useState<NutritionAlertData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [hasCritical, setHasCritical] = useState(false);
  const [hasDanger, setHasDanger] = useState(false);
  const [maxLevel, setMaxLevel] = useState('none');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Timestamp of last successful fetch — used to skip redundant foreground re-fetches. */
  const lastFetchRef = useRef<number>(0);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await apiClient.get<AlertsResponse>('/api/alerts/daily');
      const data = res.data;
      setAlerts(data.alerts);
      setHasCritical(data.has_critical);
      setHasDanger(data.has_danger);
      setMaxLevel(data.max_level);
      setError(false);
      lastFetchRef.current = Date.now();
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + polling
  useEffect(() => {
    fetchAlerts();

    intervalRef.current = setInterval(fetchAlerts, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchAlerts]);

  // Re-fetch when app comes back to foreground — skip if data is still fresh (< 60s)
  useEffect(() => {
    const handleAppState = (state: AppStateStatus) => {
      if (state === 'active' && Date.now() - lastFetchRef.current > 60_000) {
        fetchAlerts();
      }
    };

    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, [fetchAlerts]);

  return {
    alerts,
    loading,
    error,
    hasCritical,
    hasDanger,
    maxLevel,
    refetch: fetchAlerts,
  };
}
