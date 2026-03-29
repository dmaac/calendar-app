/**
 * usePressAnimation — Provides scale animation + haptic feedback for button presses.
 *
 * Returns pressIn/pressOut handlers and an animated style to spread on Animated.View.
 * Creates the premium "micro-bounce" feel on all interactive elements.
 */
import { useRef, useCallback } from 'react';
import { Animated } from 'react-native';
import { haptics } from './useHaptics';

interface PressAnimationOptions {
  /** Scale when pressed. Defaults to 0.97. */
  pressedScale?: number;
  /** Whether to trigger haptic on press. Defaults to true. */
  haptic?: boolean;
  /** Haptic type. Defaults to 'light'. */
  hapticType?: 'light' | 'medium' | 'selection';
}

interface PressAnimationReturn {
  onPressIn: () => void;
  onPressOut: () => void;
  animatedStyle: { transform: { scale: Animated.Value }[] };
  scale: Animated.Value;
}

export default function usePressAnimation(options: PressAnimationOptions = {}): PressAnimationReturn {
  const { pressedScale = 0.97, haptic = true, hapticType = 'light' } = options;
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = useCallback(() => {
    if (haptic) haptics[hapticType]();
    Animated.spring(scale, {
      toValue: pressedScale,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  }, [pressedScale, haptic, hapticType]);

  const onPressOut = useCallback(() => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  }, []);

  const animatedStyle = { transform: [{ scale }] };

  return { onPressIn, onPressOut, animatedStyle, scale };
}
