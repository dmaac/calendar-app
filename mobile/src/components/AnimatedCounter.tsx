/**
 * AnimatedCounter — Animate a number from 0 to a target value.
 *
 * Props:
 *   value    — target number to count to
 *   duration — animation duration in ms (default 500)
 *   prefix   — text before the number (e.g. "$")
 *   suffix   — text after the number (e.g. " kcal")
 *   style    — text style
 *
 * Uses native Animated API with easing for smooth 0 -> target counting effect.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, TextStyle } from 'react-native';

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  style?: TextStyle | TextStyle[];
  /** Round to integer? Defaults to true. */
  round?: boolean;
}

export default function AnimatedCounter({
  value,
  duration = 500,
  prefix = '',
  suffix = '',
  style,
  round = true,
}: AnimatedCounterProps) {
  const animValue = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    animValue.setValue(0);
    const listener = animValue.addListener(({ value: v }) => {
      setDisplay(v);
    });

    Animated.timing(animValue, {
      toValue: value,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    return () => {
      animValue.removeListener(listener);
    };
  }, [value, duration]);

  const formatted = round ? Math.round(display) : display.toFixed(1);

  return (
    <Animated.Text
      style={style}
      accessibilityLabel={`${prefix}${round ? Math.round(value) : value.toFixed(1)}${suffix}`}
      accessibilityRole="text"
    >
      {`${prefix}${formatted}${suffix}`}
    </Animated.Text>
  );
}
