/**
 * useNutritionRisk — Fetches the nutrition risk summary from the backend.
 *
 * Polls GET /api/risk/summary every 10 minutes while mounted.
 * Returns riskScore (0-100), status, trend, consecutive no-log days,
 * and intervention data for the UI.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { apiClient } from '../services/apiClient';

// --- Types ---

interface Intervention {
  color: string;
  push_title?: string;
  push_body?: string;
  home_banner?: boolean;
  coach_message?: string;
  simplify_ui?: boolean;
  suggestions?: string[];
}

interface RiskSummaryResponse {
  avg_risk_score: number;
  avg_quality_score: number;
  avg_calories_logged: number;
  consecutive_no_log_days: number;
  days_with_data: number;
  trend: 'improving' | 'worsening' | 'stable';
  current_status: string;
  intervention: Intervention;
}

export type RiskStatus = 'optimal' | 'low_adherence' | 'risk' | 'moderate_excess' | 'high_risk' | 'high_excess' | 'critical';

interface UseNutritionRiskResult {
  riskScore: number;
  qualityScore: number;
  weeklyAvgCalories: number;
  status: RiskStatus;
  trend: 'improving' | 'worsening' | 'stable';
  daysSinceLastLog: number;
  daysWithData: number;
  intervention: Intervention | null;
  loading: boolean;
  error: boolean;
  refetch: () => Promise<void>;
}

// --- Constants ---

const POLL_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

// --- Hook ---

export default function useNutritionRisk(): UseNutritionRiskResult {
  const [riskScore, setRiskScore] = useState(0);
  const [qualityScore, setQualityScore] = useState(0);
  const [weeklyAvgCalories, setWeeklyAvgCalories] = useState(0);
  const [status, setStatus] = useState<RiskStatus>('optimal');
  const [trend, setTrend] = useState<'improving' | 'worsening' | 'stable'>('stable');
  const [daysSinceLastLog, setDaysSinceLastLog] = useState(0);
  const [daysWithData, setDaysWithData] = useState(0);
  const [intervention, setIntervention] = useState<Intervention | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRisk = useCallback(async () => {
    try {
      const res = await apiClient.get<RiskSummaryResponse>('/api/risk/summary');
      const data = res.data;
      setRiskScore(data.avg_risk_score);
      setQualityScore(data.avg_quality_score);
      setWeeklyAvgCalories(data.avg_calories_logged ?? 0);
      setStatus(data.current_status as RiskStatus);
      setTrend(data.trend);
      setDaysSinceLastLog(data.consecutive_no_log_days);
      setDaysWithData(data.days_with_data);
      setIntervention(data.intervention);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + polling
  useEffect(() => {
    fetchRisk();

    intervalRef.current = setInterval(fetchRisk, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchRisk]);

  // Re-fetch when app comes back to foreground
  useEffect(() => {
    const handleAppState = (state: AppStateStatus) => {
      if (state === 'active') {
        fetchRisk();
      }
    };

    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, [fetchRisk]);

  return {
    riskScore,
    qualityScore,
    weeklyAvgCalories,
    status,
    trend,
    daysSinceLastLog,
    daysWithData,
    intervention,
    loading,
    error,
    refetch: fetchRisk,
  };
}
