/**
 * MacroBar -- Horizontal progress bar showing a single macro (protein/carbs/fat)
 * with animated fill, label, and current/target values.
 *
 * Extracts the repeated inline MacroBar pattern from HomeScreen, Step27PlanReady,
 * ShareProgressCard, and FoodComparison into a single reusable component.
 *
 * Usage:
 *   <MacroBar label="Proteina" value={85} target={120} color={c.protein} />
 *   <MacroBar label="Carbos" value={180} target={250} color={c.carbs} delay={100} />
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { useThemeColors, typography, spacing } from '../theme';

interface MacroBarProps {
  /** Display label (e.g. "Proteina", "Carbos", "Grasas"). */
  label: string;
  /** Current consumed value. */
  value: number;
  /** Daily target value. When 0, the bar shows empty. */
  target: number;
  /** Bar fill color (e.g. theme protein/carbs/fats color). */
  color: string;
  /** Unit suffix displayed after values. Defaults to 'g'. */
  unit?: string;
  /** Animation delay in ms. Useful for staggering multiple bars. Defaults to 0. */
  delay?: number;
  /** Animation duration in ms. Defaults to 700. */
  duration?: number;
  /** Bar track height in points. Defaults to 5. */
  trackHeight?: number;
  /** Hide the label/value header row. Defaults to false. */
  hideHeader?: boolean;
  /** Accessibility label override. */
  accessibilityLabel?: string;
}

const MacroBar = React.memo(function MacroBar({
  label,
  value,
  target,
  color,
  unit = 'g',
  delay = 0,
  duration = 700,
  trackHeight = 5,
  hideHeader = false,
  accessibilityLabel: a11yLabel,
}: MacroBarProps) {
  const c = useThemeColors();
  const roundedValue = Math.round(value);
  const roundedTarget = Math.round(target);
  const progress = roundedTarget > 0 ? Math.min(roundedValue / roundedTarget, 1) : 0;

  const fillAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fillAnim.setValue(0);
    Animated.timing(fillAnim, {
      toValue: progress,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress, delay, duration]);

  const fillWidth = fillAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  return (
    <View
      style={styles.container}
      accessibilityLabel={a11yLabel ?? `${label}: ${roundedValue} de ${roundedTarget} ${unit}`}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: roundedTarget, now: roundedValue }}
    >
      {!hideHeader && (
        <View style={styles.header}>
          <Text style={[styles.label, { color: c.gray }]}>{label}</Text>
          <Text style={[styles.value, { color: c.black }]}>
            {roundedValue}
            <Text style={[styles.target, { color: c.gray }]}>/{roundedTarget}{unit}</Text>
          </Text>
        </View>
      )}
      <View style={[styles.track, { height: trackHeight, borderRadius: trackHeight / 2, backgroundColor: c.surface }]}>
        <Animated.View
          style={[
            styles.fill,
            {
              width: fillWidth as any,
              height: trackHeight,
              borderRadius: trackHeight / 2,
              backgroundColor: color,
            },
          ]}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    ...typography.caption,
  },
  value: {
    ...typography.caption,
    fontWeight: '700',
  },
  target: {
    fontWeight: '400',
  },
  track: {
    overflow: 'hidden',
  },
  fill: {
    // height and borderRadius are set inline based on trackHeight
  },
});

export default MacroBar;
