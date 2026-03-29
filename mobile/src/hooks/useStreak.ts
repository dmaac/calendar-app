/**
 * useStreak -- Manages streak state with Streak Freeze support.
 *
 * Streak logic:
 * - A "streak" counts consecutive days where the user logged at least one meal.
 * - If a day is missed but the user has a Streak Freeze available, the freeze
 *   is consumed and the streak survives.
 * - One free freeze is granted every Monday (reset weekly).
 *
 * Persistence: AsyncStorage under @fitsi_streak_state.
 * This hook is the single source of truth for streak + freeze state.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@fitsi_streak_state';

// ---- Types ------------------------------------------------------------------

interface StreakState {
  /** Current consecutive-day streak count. */
  currentStreak: number;
  /** ISO date string (YYYY-MM-DD) of the last day a meal was logged. */
  lastLoggedDate: string | null;
  /** Number of streak freezes available (max 1 per week). */
  freezesAvailable: number;
  /** ISO date string of the Monday when the last weekly freeze was granted. */
  lastFreezeGrantWeek: string | null;
  /** Whether a freeze was consumed today (for UI display). */
  freezeUsedToday: boolean;
}

interface UseStreakReturn {
  /** Current streak count in days. */
  streak: number;
  /** Whether at least one streak freeze is available. */
  hasFreezeAvailable: boolean;
  /** Number of freezes remaining (0 or 1). */
  freezesAvailable: number;
  /** Whether a freeze was used today to preserve the streak. */
  freezeUsedToday: boolean;
  /** Call when a meal is logged to update the streak. */
  recordLog: () => Promise<void>;
  /** Whether state is still loading from storage. */
  loading: boolean;
}

// ---- Helpers ----------------------------------------------------------------

/** Returns today's date as YYYY-MM-DD in local timezone. */
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Returns the ISO date of the Monday of the week that contains `dateStr`. */
function getMondayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay(); // 0=Sun .. 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Returns the number of calendar days between two YYYY-MM-DD strings. */
function daysBetween(a: string, b: string): number {
  const msA = new Date(a + 'T12:00:00').getTime();
  const msB = new Date(b + 'T12:00:00').getTime();
  return Math.round(Math.abs(msB - msA) / (1000 * 60 * 60 * 24));
}

/** Returns yesterday's date as YYYY-MM-DD. */
function yesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---- Default state ----------------------------------------------------------

const DEFAULT_STATE: StreakState = {
  currentStreak: 0,
  lastLoggedDate: null,
  freezesAvailable: 1,
  lastFreezeGrantWeek: null,
  freezeUsedToday: false,
};

// ---- Hook -------------------------------------------------------------------

export default function useStreak(): UseStreakReturn {
  const [state, setState] = useState<StreakState>(DEFAULT_STATE);
  const [loading, setLoading] = useState(true);

  // Load persisted state on mount and reconcile with current date.
  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;

        let saved: StreakState = DEFAULT_STATE;
        if (raw) {
          try {
            saved = { ...DEFAULT_STATE, ...JSON.parse(raw) };
          } catch {
            // Corrupted data -- start fresh.
          }
        }

        // Reconcile: grant weekly freeze if a new week started.
        const today = todayISO();
        const currentMonday = getMondayOfWeek(today);
        if (saved.lastFreezeGrantWeek !== currentMonday) {
          saved = {
            ...saved,
            freezesAvailable: Math.min(saved.freezesAvailable + 1, 1),
            lastFreezeGrantWeek: currentMonday,
          };
        }

        // Check if the streak should be broken or a freeze consumed.
        if (saved.lastLoggedDate && saved.lastLoggedDate !== today) {
          const gap = daysBetween(saved.lastLoggedDate, today);

          if (gap === 1) {
            // Yesterday was logged -- streak is still alive, no action needed.
            saved = { ...saved, freezeUsedToday: false };
          } else if (gap === 2 && saved.freezesAvailable > 0) {
            // Missed exactly 1 day -- consume a freeze to keep the streak.
            saved = {
              ...saved,
              freezesAvailable: saved.freezesAvailable - 1,
              freezeUsedToday: true,
            };
          } else if (gap >= 2) {
            // Missed 2+ days or no freeze available -- streak breaks.
            saved = {
              ...saved,
              currentStreak: 0,
              freezeUsedToday: false,
            };
          }
        }

        setState(saved);
        persist(saved);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Persist helper.
  const persist = useCallback(async (s: StreakState) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  }, []);

  // Record a meal log -- extends the streak if today hasn't been logged yet.
  const recordLog = useCallback(async () => {
    const today = todayISO();

    setState((prev) => {
      if (prev.lastLoggedDate === today) {
        // Already logged today -- no change.
        return prev;
      }

      const yesterday = yesterdayISO();
      let newStreak = prev.currentStreak;

      if (prev.lastLoggedDate === yesterday || prev.lastLoggedDate === null) {
        // Consecutive day or first ever log.
        newStreak = prev.currentStreak + 1;
      } else {
        const gap = daysBetween(prev.lastLoggedDate ?? today, today);
        if (gap <= 2 && prev.freezeUsedToday) {
          // Freeze was used today -- extend the streak.
          newStreak = prev.currentStreak + 1;
        } else {
          // Streak was already broken during reconciliation.
          newStreak = 1;
        }
      }

      const next: StreakState = {
        ...prev,
        currentStreak: newStreak,
        lastLoggedDate: today,
      };

      persist(next);
      return next;
    });
  }, [persist]);

  return useMemo(
    () => ({
      streak: state.currentStreak,
      hasFreezeAvailable: state.freezesAvailable > 0,
      freezesAvailable: state.freezesAvailable,
      freezeUsedToday: state.freezeUsedToday,
      recordLog,
      loading,
    }),
    [state, recordLog, loading],
  );
}
