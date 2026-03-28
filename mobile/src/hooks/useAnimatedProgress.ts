/**
 * useAnimatedProgress — Animates a progress value from 0 to target with spring physics.
 *
 * Used by CalorieRing and MacroBar for smooth fill animations when the
 * dashboard loads or data refreshes.
 */
import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

interface AnimatedProgressOptions {
  /** Target progress value (0-1). */
  toValue: number;
  /** Delay before animation starts, in ms. Defaults to 0. */
  delay?: number;
  /** Duration in ms. Defaults to 800. */
  duration?: number;
  /** Use spring physics instead of timing. Defaults to false. */
  spring?: boolean;
}

export default function useAnimatedProgress({
  toValue,
  delay = 0,
  duration = 800,
  spring = false,
}: AnimatedProgressOptions): Animated.Value {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    anim.setValue(0);

    const animation = spring
      ? Animated.spring(anim, {
          toValue,
          friction: 8,
          tension: 40,
          delay,
          useNativeDriver: false,
        })
      : Animated.timing(anim, {
          toValue,
          duration,
          delay,
          useNativeDriver: false,
        });

    animation.start();
  }, [toValue]);

  return anim;
}
