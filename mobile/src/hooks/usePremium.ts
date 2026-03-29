/**
 * usePremium — Central hook for premium feature gating across the app.
 *
 * Returns:
 *   - isPremium: boolean  — whether the current user has an active premium subscription
 *   - isLoading: boolean  — true while the subscription status is being resolved
 *   - showPaywall: () => void — navigates to the PaywallScreen (works from any stack)
 *
 * Sources of truth (in order of priority):
 *   1. AuthContext `isPremium` — set on login from backend user.is_premium
 *   2. RevenueCat `checkSubscriptionStatus()` — live entitlement check (native only)
 *
 * The hook merges both signals: if either reports premium, the user is premium.
 * This handles edge cases like receipt-validated but not yet synced to backend.
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { checkSubscriptionStatus } from '../services/purchase.service';
import { haptics } from './useHaptics';

export interface UsePremiumResult {
  /** Whether the user has an active premium subscription */
  isPremium: boolean;
  /** True while subscription status is being resolved */
  isLoading: boolean;
  /** Navigate to PaywallScreen — includes haptic feedback */
  showPaywall: () => void;
}

export function usePremium(): UsePremiumResult {
  const { isPremium: authIsPremium } = useAuth();
  const navigation = useNavigation<any>();
  const [rcIsPremium, setRcIsPremium] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(!authIsPremium);

  // Check RevenueCat entitlement on mount (only if not already premium from auth)
  useEffect(() => {
    if (authIsPremium) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const status = await checkSubscriptionStatus();
        if (!cancelled) {
          setRcIsPremium(status);
        }
      } catch {
        // RevenueCat unavailable (Expo Go, web, etc.) — fall back to auth status
        if (!cancelled) {
          setRcIsPremium(false);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authIsPremium]);

  // Merge both signals: premium if either source says so
  const isPremium = authIsPremium || (rcIsPremium === true);

  const showPaywall = useCallback(() => {
    haptics.light();
    navigation.navigate('Paywall');
  }, [navigation]);

  return { isPremium, isLoading, showPaywall };
}
