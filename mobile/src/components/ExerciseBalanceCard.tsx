/**
 * ExerciseBalanceCard — Shows the daily calorie balance including exercise.
 *
 * Displays:
 *   Consumido | Ejercicio | Neto | Restante
 *
 * Visual balance bar with color coding:
 *   Green:  net calories in healthy range
 *   Yellow: net calories below target but above 1200
 *   Red:    net calories below 1200 (dangerously low)
 */
import React, { useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius, shadows } from '../theme';

// ---- Types ----------------------------------------------------------------

interface ExerciseBalanceCardProps {
  /** Total calories consumed today. */
  consumed: number;
  /** Calories burned through exercise today. */
  exerciseBurned: number;
  /** Daily calorie target (goal). */
  target: number;
}

// ---- Constants ------------------------------------------------------------

/** Below this net calorie level, the user is in danger zone. */
const DANGER_THRESHOLD = 1200;

// ---- Helpers --------------------------------------------------------------

type BalanceStatus = 'good' | 'low' | 'danger';

function getBalanceStatus(net: number, target: number): BalanceStatus {
  if (net < DANGER_THRESHOLD) return 'danger';
  // "Low" if net is below 70% of target
  if (net < target * 0.7) return 'low';
  return 'good';
}

const STATUS_COLORS: Record<BalanceStatus, string> = {
  good: '#10B981',
  low: '#F59E0B',
  danger: '#EF4444',
};

const STATUS_LABELS: Record<BalanceStatus, string> = {
  good: 'Balance saludable',
  low: 'Consumo bajo',
  danger: 'Consumo muy bajo',
};

// ---- Component ------------------------------------------------------------

export default function ExerciseBalanceCard({
  consumed,
  exerciseBurned,
  target,
}: ExerciseBalanceCardProps) {
  const c = useThemeColors();

  const net = consumed - exerciseBurned;
  const remaining = Math.max(target - net, 0);
  const status = getBalanceStatus(net, target);
  const statusColor = STATUS_COLORS[status];
  const statusLabel = STATUS_LABELS[status];

  // Progress bar: net / target, clamped to [0, 1]
  const progress = useMemo(() => {
    if (target <= 0) return 0;
    return Math.max(0, Math.min(net / target, 1));
  }, [net, target]);

  // Animated bar fill
  const fillAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    fillAnim.setValue(0);
    Animated.timing(fillAnim, {
      toValue: progress,
      duration: 800,
      delay: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const fillWidth = fillAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View
      style={[s.card, { backgroundColor: c.surface, borderColor: c.grayLight }]}
      accessibilityLabel={`Balance calorico: ${Math.round(consumed)} consumidas, ${Math.round(exerciseBurned)} quemadas por ejercicio, neto ${Math.round(net)}, restante ${Math.round(remaining)}. ${statusLabel}.`}
      accessibilityRole="summary"
    >
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Ionicons name="fitness-outline" size={18} color={statusColor} />
          <Text style={[s.title, { color: c.black }]}>Balance Calorico</Text>
        </View>
        <View style={[s.statusBadge, { backgroundColor: statusColor + '1A' }]}>
          <View style={[s.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[s.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>

      {/* Metrics row */}
      <View style={s.metricsRow}>
        <MetricItem
          icon="restaurant-outline"
          label="Consumido"
          value={Math.round(consumed)}
          color={c.black}
          textColor={c.black}
          subtextColor={c.gray}
        />
        <View style={[s.separator, { backgroundColor: c.grayLight }]} />
        <MetricItem
          icon="flame-outline"
          label="Ejercicio"
          value={Math.round(exerciseBurned)}
          color="#F59E0B"
          textColor={c.black}
          subtextColor={c.gray}
        />
        <View style={[s.separator, { backgroundColor: c.grayLight }]} />
        <MetricItem
          icon="analytics-outline"
          label="Neto"
          value={Math.round(net)}
          color={statusColor}
          textColor={statusColor}
          subtextColor={c.gray}
        />
        <View style={[s.separator, { backgroundColor: c.grayLight }]} />
        <MetricItem
          icon="flag-outline"
          label="Restante"
          value={Math.round(remaining)}
          color={c.accent}
          textColor={c.black}
          subtextColor={c.gray}
        />
      </View>

      {/* Progress bar */}
      <View style={s.barSection}>
        <View style={[s.track, { backgroundColor: c.grayLight }]}>
          <Animated.View
            style={[
              s.fill,
              {
                width: fillWidth as any,
                backgroundColor: statusColor,
              },
            ]}
          />
          {/* Danger threshold marker */}
          {target > 0 && (
            <View
              style={[
                s.marker,
                {
                  left: `${Math.min((DANGER_THRESHOLD / target) * 100, 100)}%`,
                  backgroundColor: '#EF4444',
                },
              ]}
            />
          )}
        </View>
        <View style={s.barLabels}>
          <Text style={[s.barLabel, { color: c.gray }]}>0</Text>
          <Text style={[s.barLabel, { color: '#EF4444' }]}>{DANGER_THRESHOLD}</Text>
          <Text style={[s.barLabel, { color: c.gray }]}>{Math.round(target)}</Text>
        </View>
      </View>
    </View>
  );
}

// ---- MetricItem sub-component ---------------------------------------------

const MetricItem = React.memo(function MetricItem({
  icon,
  label,
  value,
  color,
  textColor,
  subtextColor,
}: {
  icon: string;
  label: string;
  value: number;
  color: string;
  textColor: string;
  subtextColor: string;
}) {
  return (
    <View style={s.metric} accessibilityLabel={`${label}: ${value} kilocalorías`}>
      <Ionicons name={icon as any} size={14} color={color} />
      <Text style={[s.metricValue, { color: textColor }]}>{value}</Text>
      <Text style={[s.metricLabel, { color: subtextColor }]}>{label}</Text>
    </View>
  );
});

// ---- Styles ---------------------------------------------------------------

const s = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  title: {
    ...typography.label,
    fontWeight: '700',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  metric: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  metricLabel: {
    ...typography.caption,
    fontSize: 10,
  },
  separator: {
    width: 1,
    height: 32,
    marginHorizontal: 2,
  },
  barSection: {
    gap: spacing.xs,
  },
  track: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  fill: {
    height: 8,
    borderRadius: 4,
  },
  marker: {
    position: 'absolute',
    top: -1,
    width: 2,
    height: 10,
    borderRadius: 1,
    opacity: 0.5,
  },
  barLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  barLabel: {
    fontSize: 9,
    fontWeight: '500',
  },
});
