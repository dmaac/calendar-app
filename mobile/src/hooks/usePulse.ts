/**
 * usePulse — Creates a continuous scale pulse animation.
 *
 * Used on the scan button to draw attention to the primary action.
 * Respects AccessibilityInfo.isReduceMotionEnabled (future-ready).
 */
import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

interface PulseOptions {
  /** Minimum scale. Defaults to 1. */
  minScale?: number;
  /** Maximum scale. Defaults to 1.05. */
  maxScale?: number;
  /** Duration of one pulse cycle in ms. Defaults to 1500. */
  duration?: number;
  /** Whether the pulse is active. Defaults to true. */
  active?: boolean;
}

export default function usePulse(options: PulseOptions = {}): { transform: { scale: Animated.Value }[] } {
  const { minScale = 1, maxScale = 1.05, duration = 1500, active = true } = options;
  const scale = useRef(new Animated.Value(minScale)).current;

  useEffect(() => {
    if (!active) {
      scale.setValue(1);
      return;
    }

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: maxScale,
          duration: duration / 2,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: minScale,
          duration: duration / 2,
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();

    return () => pulse.stop();
  }, [active, minScale, maxScale, duration]);

  return { transform: [{ scale }] };
}
