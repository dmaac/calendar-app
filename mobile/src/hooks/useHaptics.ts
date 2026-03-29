/**
 * useHaptics — Centralized haptic feedback for Fitsi AI
 *
 * Wraps expo-haptics with a Platform guard (no-op on web) and provides
 * semantic methods so callers don't need to import expo-haptics directly.
 */
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/** Fire-and-forget — never throws, never blocks. */
function safe(fn: () => Promise<void>) {
  if (Platform.OS === 'web') return;
  fn().catch(() => {});
}

const haptics = {
  /** Light tap — button presses, option selection, toggle */
  light: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),

  /** Medium impact — successful action (scan complete, food logged, water added) */
  medium: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),

  /** Heavy impact — destructive confirmation (delete) */
  heavy: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),

  /** Selection tick — scrolling through picker values */
  selection: () => safe(() => Haptics.selectionAsync()),

  /** Success notification */
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),

  /** Error notification */
  error: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};

interface HapticsApi {
  light: () => void;
  medium: () => void;
  heavy: () => void;
  selection: () => void;
  success: () => void;
  error: () => void;
}

export default function useHaptics(): HapticsApi {
  return haptics;
}

/**
 * Non-hook version for use outside of components (e.g. in callbacks
 * that are already captured). Same API, just not wrapped in a hook.
 */
export { haptics };
