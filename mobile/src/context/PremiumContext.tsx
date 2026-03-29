/**
 * PremiumContext — global subscription state for the entire Fitsi AI app.
 *
 * Single source of truth for whether the user has an active premium subscription,
 * is in a trial period, and which plan they are on.
 *
 * Data flow:
 *   1. On mount: read cached status from AsyncStorage (instant, no flicker)
 *   2. Then fetch fresh status from RevenueCat (source of truth)
 *   3. Listen for real-time subscription changes via RevenueCat listener
 *   4. Sync changes to backend (user.is_premium) so server stays in sync
 *
 * Usage:
 *   const { isPremium, showPaywall } = usePremium();
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainerRef } from '@react-navigation/native';
import { useAuth } from './AuthContext';
import * as purchaseService from '../services/purchase.service';

// ─── Types ───────────────────────────────────────────────────────────────────

type PlanType = 'free' | 'monthly' | 'yearly' | 'lifetime' | null;

interface PremiumState {
  isPremium: boolean;
  isTrialing: boolean;
  plan: PlanType;
  trialDaysRemaining: number;
  expiresAt: string | null;
  isLoading: boolean;
}

interface PremiumContextType extends PremiumState {
  /** Re-fetch subscription status from RevenueCat. Call after a purchase completes. */
  refreshStatus: () => Promise<void>;
  /** Navigate to the Paywall screen from anywhere in the app. */
  showPaywall: () => void;
}

// ─── Cache keys ──────────────────────────────────────────────────────────────

const CACHE_KEY = '@fitsi_premium_status';

interface CachedPremiumStatus {
  isPremium: boolean;
  isTrialing: boolean;
  plan: PlanType;
  trialDaysRemaining: number;
  expiresAt: string | null;
  cachedAt: string;
}

// ─── Default state ───────────────────────────────────────────────────────────

const DEFAULT_STATE: PremiumState = {
  isPremium: false,
  isTrialing: false,
  plan: null,
  trialDaysRemaining: 0,
  expiresAt: null,
  isLoading: true,
};

// ─── Context ─────────────────────────────────────────────────────────────────

const PremiumContext = createContext<PremiumContextType | undefined>(undefined);

export const usePremium = (): PremiumContextType => {
  const ctx = useContext(PremiumContext);
  if (!ctx) throw new Error('usePremium must be used inside PremiumProvider');
  return ctx;
};

// ─── Navigation ref (set from AppNavigator so showPaywall works everywhere) ──

let _navRef: NavigationContainerRef<any> | null = null;

/**
 * Wire up the root navigation ref so PremiumContext can navigate to Paywall
 * from anywhere, even outside React component trees.
 */
export function setPremiumNavigationRef(
  ref: NavigationContainerRef<any>,
): void {
  _navRef = ref;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Map RevenueCat product identifier to our plan type. */
function identifierToPlan(identifier: string | undefined): PlanType {
  if (!identifier) return null;
  const lower = identifier.toLowerCase();
  if (lower.includes('lifetime')) return 'lifetime';
  if (lower.includes('annual') || lower.includes('yearly')) return 'yearly';
  if (lower.includes('monthly')) return 'monthly';
  return null;
}

/** Persist premium status to AsyncStorage for instant restore on next launch. */
async function cacheStatus(status: Omit<CachedPremiumStatus, 'cachedAt'>): Promise<void> {
  try {
    const payload: CachedPremiumStatus = {
      ...status,
      cachedAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Non-critical — cache write failure is acceptable
  }
}

/** Read cached premium status. Returns null if missing or corrupt. */
async function readCachedStatus(): Promise<CachedPremiumStatus | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CachedPremiumStatus;
  } catch {
    return null;
  }
}

/** Clear cached premium status (e.g., on logout). */
async function clearCachedStatus(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_KEY);
  } catch {
    // Non-critical
  }
}

// ─── Provider ────────────────────────────────────────────────────────────────

export const PremiumProvider = ({ children }: { children: ReactNode }) => {
  const { user, isAuthenticated, setPremiumStatus, refreshUser } = useAuth();

  const [state, setState] = useState<PremiumState>(DEFAULT_STATE);

  // Track the previous isPremium value to detect changes for backend sync
  const prevIsPremiumRef = useRef<boolean | null>(null);

  // ── Load cached status immediately on mount ────────────────────────────────
  useEffect(() => {
    (async () => {
      const cached = await readCachedStatus();
      if (cached) {
        setState({
          isPremium: cached.isPremium,
          isTrialing: cached.isTrialing,
          plan: cached.plan,
          trialDaysRemaining: cached.trialDaysRemaining,
          expiresAt: cached.expiresAt,
          isLoading: true, // Still loading — will be set to false after fresh fetch
        });
      }
    })();
  }, []);

  // ── Fetch fresh status from RevenueCat when user is authenticated ──────────
  useEffect(() => {
    if (!isAuthenticated) {
      // Reset to defaults when logged out
      setState(DEFAULT_STATE);
      clearCachedStatus();
      prevIsPremiumRef.current = null;
      return;
    }

    fetchFreshStatus();
  }, [isAuthenticated, user?.id]);

  // ── Listen for real-time subscription changes ──────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;

    const unsubscribe = purchaseService.onCustomerInfoUpdated((customerInfo) => {
      const updated = extractPremiumState(customerInfo);
      applyUpdate(updated);
    });

    return unsubscribe;
  }, [isAuthenticated]);

  // ── Extract premium state from RevenueCat CustomerInfo ─────────────────────
  const extractPremiumState = useCallback(
    (customerInfo: any): Omit<PremiumState, 'isLoading'> => {
      const entitlement = customerInfo?.entitlements?.active?.premium;

      if (!entitlement) {
        return {
          isPremium: false,
          isTrialing: false,
          plan: 'free',
          trialDaysRemaining: 0,
          expiresAt: null,
        };
      }

      const isTrialing = entitlement.periodType === 'TRIAL';
      const expiresAt = entitlement.expirationDate ?? null;

      let trialDaysRemaining = 0;
      if (isTrialing && expiresAt) {
        const diffMs = new Date(expiresAt).getTime() - Date.now();
        trialDaysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
      }

      // Determine plan from the product identifier
      const plan = identifierToPlan(entitlement.productIdentifier) ?? 'monthly';

      return {
        isPremium: true,
        isTrialing,
        plan,
        trialDaysRemaining,
        expiresAt,
      };
    },
    [],
  );

  // ── Apply an update to state, cache, and sync with backend ─────────────────
  const applyUpdate = useCallback(
    (update: Omit<PremiumState, 'isLoading'>) => {
      setState((prev) => ({ ...prev, ...update, isLoading: false }));

      // Cache for next launch
      cacheStatus({
        isPremium: update.isPremium,
        isTrialing: update.isTrialing,
        plan: update.plan,
        trialDaysRemaining: update.trialDaysRemaining,
        expiresAt: update.expiresAt,
      });

      // Sync with AuthContext so user.is_premium stays consistent
      setPremiumStatus(update.isPremium);

      // Sync with backend if premium status actually changed
      if (
        prevIsPremiumRef.current !== null &&
        prevIsPremiumRef.current !== update.isPremium
      ) {
        syncWithBackend(update.isPremium);
      }
      prevIsPremiumRef.current = update.isPremium;
    },
    [setPremiumStatus],
  );

  // ── Fetch fresh status from RevenueCat ─────────────────────────────────────
  const fetchFreshStatus = useCallback(async () => {
    try {
      const customerInfo = await purchaseService.getCustomerInfo();

      if (customerInfo) {
        const freshState = extractPremiumState(customerInfo);
        applyUpdate(freshState);
      } else {
        // RevenueCat unavailable (web, Expo Go, etc.) — fall back to user.is_premium
        const fallback: Omit<PremiumState, 'isLoading'> = {
          isPremium: user?.is_premium ?? false,
          isTrialing: false,
          plan: user?.is_premium ? null : 'free',
          trialDaysRemaining: 0,
          expiresAt: null,
        };
        applyUpdate(fallback);
      }
    } catch (err) {
      console.warn('[PremiumContext] Failed to fetch subscription status:', err);
      // On error, trust the cached / user state
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }, [user?.is_premium, extractPremiumState, applyUpdate]);

  // ── Public: manual refresh (call after a purchase completes) ───────────────
  const refreshStatus = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true }));
    await fetchFreshStatus();
  }, [fetchFreshStatus]);

  // ── Public: navigate to Paywall ────────────────────────────────────────────
  const showPaywall = useCallback(() => {
    if (_navRef) {
      // Navigate into the Home tab's Paywall screen
      // This works from any tab because the Paywall is registered in both
      // HomeStack and ProfileStack.
      _navRef.navigate('Inicio', { screen: 'Paywall' });
    } else {
      console.warn(
        '[PremiumContext] showPaywall called but navigation ref is not set.',
      );
    }
  }, []);

  // ── Sync premium status change to backend ──────────────────────────────────
  const syncWithBackend = useCallback(async (_isPremium: boolean) => {
    try {
      // Re-fetch the user from the backend to pick up any is_premium changes
      // that RevenueCat webhooks have already applied server-side. This keeps
      // AuthContext.user in sync without needing a dedicated PATCH endpoint.
      // RevenueCat webhooks are the primary mechanism for updating the backend;
      // this just ensures the mobile state catches up.
      await refreshUser();
    } catch (err) {
      console.warn('[PremiumContext] Failed to sync premium status with backend:', err);
      // Non-fatal — webhook will eventually sync
    }
  }, [refreshUser]);

  // ─────────────────────────────────────────────────────────────────────────
  const value: PremiumContextType = {
    ...state,
    refreshStatus,
    showPaywall,
  };

  return (
    <PremiumContext.Provider value={value}>{children}</PremiumContext.Provider>
  );
};
