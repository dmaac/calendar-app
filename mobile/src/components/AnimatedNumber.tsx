/**
 * AnimatedNumber — Smooth counting transition between numeric values.
 *
 * Uses React Native's built-in Animated API to interpolate from the
 * previous value to the new value, creating a "counting up/down" effect
 * on the calorie ring and other numeric displays.
 *
 * Features:
 * - Spring-based interpolation for natural overshoot + settle
 * - Listener-driven state update for reliable text rendering
 * - Accessibility label always shows final value
 * - Subtle scale pop on value change for visual feedback
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, TextStyle } from 'react-native';

interface AnimatedNumberProps {
  /** The numeric value to display. */
  value: number;
  /** Duration of the counting animation in ms. Defaults to 600. */
  duration?: number;
  /** Text style applied to the Animated.Text. */
  style?: TextStyle | TextStyle[];
  /** Optional suffix rendered after the number (e.g. " kcal"). */
  suffix?: string;
  /** Round to integer? Defaults to true. */
  round?: boolean;
}

export default function AnimatedNumber({
  value,
  duration = 600,
  style,
  suffix = '',
  round = true,
}: AnimatedNumberProps) {
  const animatedValue = useRef(new Animated.Value(value)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const [displayValue, setDisplayValue] = useState(value);
  const prevValue = useRef(value);

  useEffect(() => {
    const listenerId = animatedValue.addListener(({ value: v }) => {
      setDisplayValue(v);
    });

    // Animate the number count
    Animated.timing(animatedValue, {
      toValue: value,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    // Subtle scale pop when value changes significantly (> 5% or > 10 units)
    const diff = Math.abs(value - prevValue.current);
    const threshold = Math.max(prevValue.current * 0.05, 10);
    if (diff > threshold && prevValue.current !== 0) {
      scaleAnim.setValue(1);
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.08,
          duration: 120,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 5,
          tension: 160,
          useNativeDriver: true,
        }),
      ]).start();
    }
    prevValue.current = value;

    return () => {
      animatedValue.removeListener(listenerId);
    };
  }, [value, duration]);

  const formatted = round ? Math.round(displayValue) : displayValue.toFixed(1);
  const finalFormatted = round ? Math.round(value) : value.toFixed(1);

  return (
    <Animated.Text
      style={[style, { transform: [{ scale: scaleAnim }] }]}
      accessibilityLabel={`${finalFormatted}${suffix}`}
      accessibilityRole="text"
    >
      {`${formatted}${suffix}`}
    </Animated.Text>
  );
}
