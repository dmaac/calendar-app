/**
 * useSmartPaywall — Smart paywall timing & personalization hook
 *
 * Tracks user engagement to determine the optimal paywall moment:
 * - Days of active use (app opens with food logging)
 * - Total scans/meals logged
 * - Most-used feature
 * - Generates personalized paywall copy based on usage
 *
 * Trigger: Show paywall after 3+ days of active use, NOT on first launch.
 * Stores engagement data in AsyncStorage for persistence across sessions.
 */
import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Storage keys ──────────────────────────────────────────────────────────────
const STORAGE_KEY = '@fitsi_smart_paywall';
const OFFER_EXPIRES_KEY = '@fitsi_offer_expires';

// ─── Types ─────────────────────────────────────────────────────────────────────
export interface UsageStats {
  /** Distinct dates (YYYY-MM-DD) the user opened the app and logged food */
  activeDays: string[];
  /** Total food scans performed */
  totalScans: number;
  /** Total meals manually logged */
  totalManualLogs: number;
  /** Feature usage counts for personalization */
  featureUsage: Record<string, number>;
  /** Timestamp of first app use */
  firstUsedAt: string | null;
  /** Whether user has dismissed the paywall before */
  dismissed: boolean;
  /** Number of times paywall was shown */
  impressions: number;
}

export interface SmartPaywallData {
  /** Whether enough engagement has been reached to show the paywall */
  shouldShowPaywall: boolean;
  /** Personalized headline based on usage */
  personalizedHeadline: string;
  /** Personalized subtitle */
  personalizedSubtitle: string;
  /** The feature the user uses most */
  topFeature: string | null;
  /** Social proof text */
  socialProofText: string;
  /** 24h countdown offer expiry timestamp (ms) */
  offerExpiresAt: number | null;
  /** Time remaining in ms (null if no active offer) */
  timeRemainingMs: number | null;
  /** Raw usage stats */
  stats: UsageStats;
  /** Track a feature usage event */
  trackFeatureUse: (feature: string) => Promise<void>;
  /** Track a food scan */
  trackScan: () => Promise<void>;
  /** Track a manual food log */
  trackManualLog: () => Promise<void>;
  /** Mark today as an active day */
  trackActiveDay: () => Promise<void>;
  /** Dismiss the paywall (user chose "continue free") */
  dismissPaywall: () => Promise<void>;
  /** Record a paywall impression */
  trackImpression: () => Promise<void>;
  /** Start the 24h limited offer countdown */
  startOffer: () => Promise<void>;
  /** Loading state */
  loading: boolean;
}

const DEFAULT_STATS: UsageStats = {
  activeDays: [],
  totalScans: 0,
  totalManualLogs: 0,
  featureUsage: {},
  firstUsedAt: null,
  dismissed: false,
  impressions: 0,
};

// ─── Feature label map (for personalized copy) ─────────────────────────────────
const FEATURE_LABELS: Record<string, string> = {
  scan: 'escaneo con IA',
  recipes: 'recetas personalizadas',
  coach: 'AI Coach',
  tracking: 'seguimiento de macros',
  reports: 'reportes de progreso',
  barcode: 'escaneo de codigo de barras',
  meal_plan: 'planificacion de comidas',
  water: 'seguimiento de agua',
  weight: 'seguimiento de peso',
  fasting: 'ayuno intermitente',
};

// ─── Social proof numbers (rotate based on day of month) ────────────────────────
const SOCIAL_PROOF_TEMPLATES = [
  '{count} usuarios mejoraron su nutricion con Premium esta semana',
  '{count} personas alcanzaron sus metas con Fitsi Premium',
  '{count} usuarios desbloqueron analisis avanzado este mes',
  'Unete a {count}+ usuarios que ya usan Premium',
  '{count} usuarios lograron sus objetivos con AI Coach Premium',
];

function getSocialProofText(): string {
  const dayOfMonth = new Date().getDate();
  const template = SOCIAL_PROOF_TEMPLATES[dayOfMonth % SOCIAL_PROOF_TEMPLATES.length];
  // Generate a believable number that changes daily (seeded by date)
  const baseCount = 2400 + (dayOfMonth * 73) % 800;
  return template.replace('{count}', baseCount.toLocaleString());
}

// ─── Hook ──────────────────────────────────────────────────────────────────────
export function useSmartPaywall(): SmartPaywallData {
  const [stats, setStats] = useState<UsageStats>(DEFAULT_STATS);
  const [offerExpiresAt, setOfferExpiresAt] = useState<number | null>(null);
  const [timeRemainingMs, setTimeRemainingMs] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Load persisted stats on mount
  useEffect(() => {
    loadStats();
    loadOfferExpiry();
  }, []);

  // Countdown timer — update every second when offer is active
  useEffect(() => {
    if (!offerExpiresAt) {
      setTimeRemainingMs(null);
      return;
    }

    const tick = () => {
      const remaining = offerExpiresAt - Date.now();
      setTimeRemainingMs(remaining > 0 ? remaining : 0);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [offerExpiresAt]);

  const loadStats = async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as UsageStats;
        setStats(parsed);
      }
    } catch (err) {
      console.error('[useSmartPaywall] Failed to load stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadOfferExpiry = async () => {
    try {
      const raw = await AsyncStorage.getItem(OFFER_EXPIRES_KEY);
      if (raw) {
        const ts = parseInt(raw, 10);
        if (ts > Date.now()) {
          setOfferExpiresAt(ts);
        } else {
          // Offer expired — clean up
          await AsyncStorage.removeItem(OFFER_EXPIRES_KEY);
        }
      }
    } catch (err) {
      console.error('[useSmartPaywall] Failed to load offer expiry:', err);
    }
  };

  const persistStats = async (updated: UsageStats) => {
    setStats(updated);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  // ── Tracking methods ─────────────────────────────────────────────────────────

  const trackActiveDay = useCallback(async () => {
    const today = new Date().toISOString().split('T')[0];
    setStats((prev) => {
      if (prev.activeDays.includes(today)) return prev;
      const updated: UsageStats = {
        ...prev,
        activeDays: [...prev.activeDays, today],
        firstUsedAt: prev.firstUsedAt || new Date().toISOString(),
      };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  const trackScan = useCallback(async () => {
    setStats((prev) => {
      const updated: UsageStats = {
        ...prev,
        totalScans: prev.totalScans + 1,
        featureUsage: {
          ...prev.featureUsage,
          scan: (prev.featureUsage.scan ?? 0) + 1,
        },
      };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  const trackManualLog = useCallback(async () => {
    setStats((prev) => {
      const updated: UsageStats = {
        ...prev,
        totalManualLogs: prev.totalManualLogs + 1,
      };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  const trackFeatureUse = useCallback(async (feature: string) => {
    setStats((prev) => {
      const updated: UsageStats = {
        ...prev,
        featureUsage: {
          ...prev.featureUsage,
          [feature]: (prev.featureUsage[feature] ?? 0) + 1,
        },
      };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  const dismissPaywall = useCallback(async () => {
    setStats((prev) => {
      const updated: UsageStats = { ...prev, dismissed: true };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  const trackImpression = useCallback(async () => {
    setStats((prev) => {
      const updated: UsageStats = { ...prev, impressions: prev.impressions + 1 };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  const startOffer = useCallback(async () => {
    const expires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours from now
    setOfferExpiresAt(expires);
    await AsyncStorage.setItem(OFFER_EXPIRES_KEY, String(expires));
  }, []);

  // ── Derived state ────────────────────────────────────────────────────────────

  const activeDayCount = stats.activeDays.length;
  const totalActivity = stats.totalScans + stats.totalManualLogs;

  // Show paywall after 3+ active days AND at least 5 total food entries
  const shouldShowPaywall = activeDayCount >= 3 && totalActivity >= 5;

  // Find top feature
  const topFeatureKey = Object.entries(stats.featureUsage)
    .sort(([, a], [, b]) => b - a)[0]?.[0] ?? null;
  const topFeature = topFeatureKey ? (FEATURE_LABELS[topFeatureKey] ?? topFeatureKey) : null;

  // Personalized copy
  const personalizedHeadline = getPersonalizedHeadline(stats, topFeature);
  const personalizedSubtitle = getPersonalizedSubtitle(stats, topFeature);
  const socialProofText = getSocialProofText();

  return {
    shouldShowPaywall,
    personalizedHeadline,
    personalizedSubtitle,
    topFeature,
    socialProofText,
    offerExpiresAt,
    timeRemainingMs,
    stats,
    trackFeatureUse,
    trackScan,
    trackManualLog,
    trackActiveDay,
    dismissPaywall,
    trackImpression,
    startOffer,
    loading,
  };
}

// ─── Copy generators ───────────────────────────────────────────────────────────

function getPersonalizedHeadline(stats: UsageStats, topFeature: string | null): string {
  const total = stats.totalScans + stats.totalManualLogs;

  if (total >= 50) {
    return `Ya registraste ${total} comidas`;
  }
  if (total >= 20) {
    return `${total} comidas registradas y contando`;
  }
  if (stats.totalScans >= 10) {
    return `${stats.totalScans} escaneos con IA realizados`;
  }
  if (topFeature) {
    return `Te encanta ${topFeature}`;
  }
  return 'Desbloquea el poder total de la IA';
}

function getPersonalizedSubtitle(stats: UsageStats, topFeature: string | null): string {
  const total = stats.totalScans + stats.totalManualLogs;

  if (total >= 50) {
    return 'Desbloquea analisis avanzado y lleva tu nutricion al siguiente nivel';
  }
  if (total >= 20) {
    return 'Premium te da insights detallados sobre tus habitos alimenticios';
  }
  if (topFeature) {
    return `Con Premium, lleva tu ${topFeature} al maximo`;
  }
  return 'Escaneos ilimitados, AI Coach y analisis avanzado de nutricion';
}

// ─── Utility: format countdown ─────────────────────────────────────────────────

export function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
