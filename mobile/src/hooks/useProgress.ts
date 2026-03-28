/**
 * useProgress — Fetches progress system data from the API.
 * Returns: level, xp, streak, coins, missions, challenge, achievements.
 * Polls every 5 min. Refetch on screen focus.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { apiClient } from '../services/apiClient';
import { Mission } from '../components/DailyMissionsCard';
import { WeeklyChallenge } from '../components/WeeklyChallengeCard';
import { AchievementData } from '../components/AchievementBadge';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ProgressProfile {
  level_number: number;
  level_name: string;
  current_xp: number;
  xp_to_next_level: number;
  total_xp: number;
  coins: number;
  current_streak: number;
  best_streak: number;
  freezes_available: number;
  streak_at_risk: boolean;
}

interface MissionResponse {
  id?: string;
  mission_id?: number;
  code?: string;
  name: string;
  description: string;
  xp_reward: number;
  coins_reward: number;
  current_progress?: number;
  target_progress?: number;
  progress_value?: number;
  difficulty?: string;
  completed: boolean;
  completed_at?: string | null;
  icon?: string;
}

/** Backend wraps missions in { date, missions } */
interface MissionsApiResponse {
  date: string;
  missions: MissionResponse[];
}

interface ChallengeResponse {
  id: string;
  name: string;
  description: string;
  icon: string;
  current_progress: number;
  target_progress: number;
  unit: string;
  xp_reward: number;
  coins_reward: number;
  days_remaining: number;
  completed: boolean;
}

// ─── Mock data for offline / backend not ready ─────────────────────────────

const MOCK_PROFILE: ProgressProfile = {
  level_number: 5,
  level_name: 'Comprometido',
  current_xp: 2340,
  xp_to_next_level: 3000,
  total_xp: 12340,
  coins: 340,
  current_streak: 12,
  best_streak: 18,
  freezes_available: 1,
  streak_at_risk: false,
};

const MOCK_MISSIONS: MissionResponse[] = [
  { id: 'm1', name: 'Registra 3 comidas', description: 'Escanea o registra 3 comidas hoy', xp_reward: 50, coins_reward: 10, current_progress: 2, target_progress: 3, completed: false, icon: 'camera' },
  { id: 'm2', name: 'Cumple tu meta de proteina', description: 'Alcanza tu objetivo de proteina del dia', xp_reward: 75, coins_reward: 15, current_progress: 82, target_progress: 150, completed: false, icon: 'fitness' },
  { id: 'm3', name: 'Bebe 2L de agua', description: 'Registra al menos 2 litros de agua hoy', xp_reward: 40, coins_reward: 5, current_progress: 2000, target_progress: 2000, completed: true, icon: 'water' },
];

const MOCK_CHALLENGE: ChallengeResponse = {
  id: 'wc1',
  name: 'Semana proteica',
  description: 'Cumple tu meta de proteina 5 dias esta semana',
  icon: 'fitness',
  current_progress: 3,
  target_progress: 5,
  unit: 'dias',
  xp_reward: 500,
  coins_reward: 50,
  days_remaining: 3,
  completed: false,
};

// ─── Helper: map API response to component types ────────────────────────────

function mapMission(m: MissionResponse): Mission {
  // Backend uses mission_id + progress_value; mock uses id + current_progress/target_progress
  const missionId = m.id ?? String(m.mission_id ?? '');
  // Map difficulty to target: easy=1, medium=target, hard=target
  const target = m.target_progress ?? (m.difficulty === 'easy' ? 1 : 3);
  const current = m.current_progress ?? m.progress_value ?? 0;

  return {
    id: missionId,
    name: m.name,
    description: m.description ?? '',
    xpReward: m.xp_reward,
    coinsReward: m.coins_reward,
    currentProgress: current,
    targetProgress: target,
    completed: m.completed,
    icon: m.icon ?? (m.code?.includes('meal') ? 'camera' : m.code?.includes('protein') ? 'fitness' : 'flag'),
  };
}

function mapChallenge(ch: ChallengeResponse): WeeklyChallenge {
  return {
    id: ch.id,
    name: ch.name,
    description: ch.description,
    icon: ch.icon,
    currentProgress: ch.current_progress,
    targetProgress: ch.target_progress,
    unit: ch.unit,
    xpReward: ch.xp_reward,
    coinsReward: ch.coins_reward,
    daysRemaining: ch.days_remaining,
    completed: ch.completed,
  };
}

// ─── Hook ───────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export interface UseProgressReturn {
  level: number;
  levelName: string;
  currentXp: number;
  xpToNextLevel: number;
  totalXp: number;
  coins: number;
  currentStreak: number;
  bestStreak: number;
  freezesAvailable: number;
  streakAtRisk: boolean;
  missions: Mission[];
  challenge: WeeklyChallenge | null;
  achievements: AchievementData[];
  loading: boolean;
  error: boolean;
  refetch: () => Promise<void>;
}

export default function useProgress(): UseProgressReturn {
  const [profile, setProfile] = useState<ProgressProfile>(MOCK_PROFILE);
  const [missions, setMissions] = useState<Mission[]>(MOCK_MISSIONS.map(mapMission));
  const [challenge, setChallenge] = useState<WeeklyChallenge | null>(mapChallenge(MOCK_CHALLENGE));
  const [achievements, setAchievements] = useState<AchievementData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = useCallback(async () => {
    setError(false);
    try {
      const [profileRes, missionsRes, challengeRes] = await Promise.allSettled([
        apiClient.get<ProgressProfile>('/api/progress/profile'),
        apiClient.get<MissionsApiResponse>('/api/progress/missions/today'),
        apiClient.get<any>('/api/progress/challenge/week'),
      ]);

      if (profileRes.status === 'fulfilled') {
        setProfile(profileRes.value.data);
      }
      if (missionsRes.status === 'fulfilled') {
        // Backend wraps missions in { date, missions: [...] }
        const raw = missionsRes.value.data;
        const missionList = Array.isArray(raw) ? raw : (raw.missions ?? []);
        setMissions(missionList.map(mapMission));
      }
      if (challengeRes.status === 'fulfilled') {
        // Backend wraps challenge in { week_start, challenge: {...}, progress, ... }
        const raw = challengeRes.value.data;
        const ch = raw.challenge ?? raw;
        if (ch && ch.name) {
          setChallenge(mapChallenge({
            id: ch.id ?? 'wc',
            name: ch.name,
            description: ch.description ?? '',
            icon: ch.icon ?? 'trophy',
            current_progress: raw.progress ?? ch.current_progress ?? 0,
            target_progress: ch.condition_value ?? ch.target_progress ?? 5,
            unit: ch.unit ?? 'dias',
            xp_reward: ch.xp_reward ?? 0,
            coins_reward: ch.coins_reward ?? 0,
            days_remaining: raw.days_remaining ?? 7,
            completed: raw.completed ?? false,
          }));
        }
      }

      // If all failed, fall back to mock data
      if (
        profileRes.status === 'rejected' &&
        missionsRes.status === 'rejected' &&
        challengeRes.status === 'rejected'
      ) {
        setError(true);
        setProfile(MOCK_PROFILE);
        setMissions(MOCK_MISSIONS.map(mapMission));
        setChallenge(mapChallenge(MOCK_CHALLENGE));
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on focus
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchAll();
    }, [fetchAll]),
  );

  // Poll every 5 minutes
  useEffect(() => {
    pollRef.current = setInterval(fetchAll, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchAll]);

  // Refetch when app comes to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        fetchAll();
      }
    });
    return () => subscription.remove();
  }, [fetchAll]);

  return {
    level: profile.level_number,
    levelName: profile.level_name,
    currentXp: profile.current_xp,
    xpToNextLevel: profile.xp_to_next_level,
    totalXp: profile.total_xp,
    coins: profile.coins,
    currentStreak: profile.current_streak,
    bestStreak: profile.best_streak,
    freezesAvailable: profile.freezes_available,
    streakAtRisk: profile.streak_at_risk,
    missions,
    challenge,
    achievements,
    loading,
    error,
    refetch: fetchAll,
  };
}
