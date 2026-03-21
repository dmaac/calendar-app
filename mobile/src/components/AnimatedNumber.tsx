/**
 * AnimatedNumber — Smooth counting transition between numeric values.
 *
 * Uses React Native's built-in Animated API to interpolate from the
 * previous value to the new value, creating a "counting up/down" effect
 * on the calorie ring and other numeric displays.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, TextStyle } from 'react-native';

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
  const displayRef = useRef(value);
  const textRef = useRef<any>(null);

  useEffect(() => {
    const listenerId = animatedValue.addListener(({ value: v }) => {
      displayRef.current = v;
      if (textRef.current) {
        const display = round ? Math.round(v) : v.toFixed(1);
        textRef.current.setNativeProps({ text: `${display}${suffix}` });
      }
    });

    Animated.timing(animatedValue, {
      toValue: value,
      duration,
      useNativeDriver: false, // text content cannot use native driver
    }).start();

    return () => {
      animatedValue.removeListener(listenerId);
    };
  }, [value, duration, suffix, round]);

  const display = round ? Math.round(value) : value.toFixed(1);

  return (
    <Animated.Text
      ref={textRef}
      style={style}
      accessibilityLabel={`${display}${suffix}`}
    >
      {`${round ? Math.round(displayRef.current) : displayRef.current.toFixed(1)}${suffix}`}
    </Animated.Text>
  );
}
