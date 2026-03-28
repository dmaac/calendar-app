/**
 * CalorieRing -- Circular progress ring for daily calorie tracking.
 *
 * Shows consumed calories as a filled arc, with optional burned-calories
 * overlay and centered numeric display. Extracts the inline CalorieRing
 * from HomeScreen into a standalone, reusable component.
 *
 * Uses react-native-svg for the ring and React Native's built-in Animated
 * API for smooth fill transitions (no Reanimated dependency).
 *
 * Usage:
 *   <CalorieRing consumed={1200} target={2100} />
 *   <CalorieRing consumed={1800} burned={350} target={2100} size={180} />
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useThemeColors, typography, spacing } from '../theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Color for the burned-calories arc */
const EXERCISE_ORANGE = '#FF9500';

interface CalorieRingProps {
  /** Calories consumed from food. */
  consumed: number;
  /** Daily calorie target/goal. */
  target: number;
  /** Calories burned through exercise. Defaults to 0. */
  burned?: number;
  /** Diameter of the ring in points. Defaults to 160. */
  size?: number;
  /** Stroke width of the ring arcs. Defaults to 12. */
  strokeWidth?: number;
  /** Label shown below the number when calories remain (e.g. "800 restantes"). */
  remainingLabel?: string;
  /** Label shown when the goal is reached. */
  goalReachedLabel?: string;
  /** Whether to show the center numeric display. Defaults to true. */
  showCenter?: boolean;
  /** Accessibility label override. */
  accessibilityLabel?: string;
}

const CalorieRing = React.memo(function CalorieRing({
  consumed,
  target,
  burned = 0,
  size = 160,
  strokeWidth = 12,
  remainingLabel,
  goalReachedLabel,
  showCenter = true,
  accessibilityLabel: a11yLabel,
}: CalorieRingProps) {
  const c = useThemeColors();
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;

  const safeConsumed = Math.round(consumed);
  const safeBurned = Math.round(burned);
  const safeTarget = Math.round(target);

  // Net calories: consumed - burned
  const netCalories = Math.max(safeConsumed - safeBurned, 0);
  // Remaining: target - consumed + burned (exercise "earns back" calories)
  const caloriesRemaining = Math.max(safeTarget - safeConsumed + safeBurned, 0);

  // Consumed arc: fraction of target consumed
  const consumedFraction = safeTarget > 0 ? Math.min(safeConsumed / safeTarget, 1) : 0;
  // Burned arc: fraction of target from exercise
  const burnedFraction = safeTarget > 0 ? Math.min(safeBurned / safeTarget, 0.5) : 0;

  // Animate consumed arc
  const consumedAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    consumedAnim.setValue(0);
    Animated.timing(consumedAnim, {
      toValue: consumedFraction,
      duration: 900,
      delay: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [consumedFraction]);

  const consumedDashOffset = consumedAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [circ, 0],
    extrapolate: 'clamp',
  });

  // Animate burned arc
  const burnedAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    burnedAnim.setValue(0);
    Animated.timing(burnedAnim, {
      toValue: burnedFraction,
      duration: 700,
      delay: 500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [burnedFraction]);

  const burnedDashArray = burnedAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, circ],
    extrapolate: 'clamp',
  });

  // Build default labels
  const defaultRemainingLabel = `${caloriesRemaining} restantes`;
  const defaultGoalLabel = 'Meta alcanzada';
  const shownRemainingLabel = remainingLabel ?? defaultRemainingLabel;
  const shownGoalLabel = goalReachedLabel ?? defaultGoalLabel;

  return (
    <View
      style={[styles.container, { width: size, height: size }]}
      accessibilityLabel={
        a11yLabel ??
        `${safeConsumed} consumidas, ${safeBurned} quemadas, ${caloriesRemaining} restantes de ${safeTarget} kilocalorias`
      }
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: safeTarget, now: netCalories }}
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        {/* Background track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={c.surface}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Burned arc (orange) -- rendered first so consumed overlaps */}
        {safeBurned > 0 && (
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={EXERCISE_ORANGE}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circ}
            strokeDashoffset={burnedDashArray}
            strokeLinecap="round"
            rotation="-90"
            origin={`${size / 2}, ${size / 2}`}
            opacity={0.85}
          />
        )}
        {/* Consumed arc -- green when under target, red when over */}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={consumed > target ? c.protein : c.success}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circ}
          strokeDashoffset={consumedDashOffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>

      {showCenter && (
        <View style={styles.center}>
          <Text style={[styles.calories, { color: c.black }]}>{netCalories}</Text>
          <Text style={[styles.unit, { color: c.gray }]}>kcal</Text>
          <Text style={[styles.remaining, { color: c.accent }]}>
            {caloriesRemaining > 0 ? shownRemainingLabel : shownGoalLabel}
          </Text>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  calories: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -1,
  },
  unit: {
    ...typography.caption,
    marginTop: -2,
  },
  remaining: {
    ...typography.caption,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
});

export default CalorieRing;
