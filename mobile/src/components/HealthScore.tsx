import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius } from '../theme';

interface HealthScoreProps {
  /** Score from 1 to 10 */
  score: number;
  size?: 'small' | 'large';
}

function getScoreColor(score: number): string {
  if (score <= 3) return '#EF4444';  // red
  if (score <= 6) return '#F59E0B';  // yellow
  return '#10B981';                   // green
}

export default function HealthScore({ score, size = 'large' }: HealthScoreProps) {
  const c = useThemeColors();
  const clamped = Math.max(1, Math.min(10, Math.round(score)));
  const color = getScoreColor(clamped);
  const progress = clamped / 10;

  const barWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(barWidth, {
      toValue: progress,
      duration: 800,
      delay: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const isSmall = size === 'small';

  return (
    <View
      style={[s.container, { backgroundColor: c.surface }, isSmall && s.containerSmall]}
      accessibilityLabel={`Puntuacion de salud: ${clamped} de 10`}
      accessibilityRole="progressbar"
    >
      <View style={s.header}>
        <View style={s.labelRow}>
          <Ionicons name="heart" size={isSmall ? 16 : 20} color="#FF6B8A" />
          <Text style={[s.label, { color: c.black }, isSmall && s.labelSmall]}>Health Score</Text>
        </View>
        <View style={s.valueRow}>
          <Text style={[s.value, isSmall && s.valueSmall, { color }]}>{clamped}</Text>
          <Text style={[s.max, { color: c.gray }, isSmall && s.maxSmall]}>/10</Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={[s.track, { backgroundColor: c.grayLight }, isSmall && s.trackSmall]}>
        <Animated.View
          style={[
            s.fill,
            isSmall && s.fillSmall,
            {
              backgroundColor: color,
              width: barWidth.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    borderRadius: 16,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  containerSmall: {
    padding: spacing.md,
    borderRadius: radius.md,
    gap: spacing.xs + 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  label: {
    ...typography.label,
    fontWeight: '700',
    fontSize: 15,
  },
  labelSmall: {
    fontSize: 13,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  value: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -1,
  },
  valueSmall: {
    fontSize: 20,
  },
  max: {
    ...typography.subtitle,
    fontSize: 14,
  },
  maxSmall: {
    fontSize: 12,
  },
  track: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
  },
  trackSmall: {
    height: 6,
    borderRadius: 3,
  },
  fill: {
    height: 10,
    borderRadius: 5,
  },
  fillSmall: {
    height: 6,
    borderRadius: 3,
  },
});
