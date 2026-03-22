/**
 * useFadeIn — Simple fade + slight slide-up animation for screen content.
 *
 * Returns an Animated.Value for opacity and a style object you can spread
 * on an Animated.View to get a smooth content entrance when data loads.
 */
import { useEffect, useRef } from 'react';
import { Animated, ViewStyle } from 'react-native';

interface FadeInOptions {
  /** Duration in ms. Defaults to 350. */
  duration?: number;
  /** Delay before starting in ms. Defaults to 0. */
  delay?: number;
  /** Vertical slide distance in px. Defaults to 12. */
  translateY?: number;
}

export default function useFadeIn(
  /** Set to true to trigger the animation. */
  trigger: boolean,
  options: FadeInOptions = {},
) {
  const { duration = 350, delay = 0, translateY = 12 } = options;
  const opacity = useRef(new Animated.Value(0)).current;
  const translate = useRef(new Animated.Value(translateY)).current;

  useEffect(() => {
    if (trigger) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration,
          delay,
          useNativeDriver: true,
        }),
        Animated.timing(translate, {
          toValue: 0,
          duration,
          delay,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      opacity.setValue(0);
      translate.setValue(translateY);
    }
  }, [trigger]);

  const animatedStyle: Animated.WithAnimatedObject<ViewStyle> = {
    opacity,
    transform: [{ translateY: translate }],
  };

  return animatedStyle;
}
