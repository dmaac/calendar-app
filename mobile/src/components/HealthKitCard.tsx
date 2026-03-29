/**
 * HealthKitCard — Compact card showing Apple Health data on the Home screen.
 *
 * Displays today's steps and active calories from HealthKit.
 * Only renders when HealthKit is connected and data is available.
 * Respects dark mode via useThemeColors.
 */
import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius, shadows } from '../theme';

// ─── Types ──────────────────────────────────────────────────────────────────

interface HealthKitCardProps {
  steps: number;
  activeCalories: number;
  loading?: boolean;
  onPress?: () => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 10000) {
    return `${(n / 1000).toFixed(1)}k`;
  }
  return n.toLocaleString();
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function HealthKitCard({
  steps,
  activeCalories,
  loading = false,
  onPress,
}: HealthKitCardProps) {
  const c = useThemeColors();

  // Animated entrance
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        delay: 100,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        delay: 100,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Progress ring for steps (target: 10,000)
  const stepsTarget = 10000;
  const stepsProgress = Math.min(steps / stepsTarget, 1);

  return (
    <Animated.View
      style={[
        s.card,
        {
          backgroundColor: c.surface,
          borderColor: c.grayLight,
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <TouchableOpacity
        style={s.inner}
        onPress={onPress}
        activeOpacity={onPress ? 0.7 : 1}
        disabled={!onPress}
        accessibilityLabel={`Apple Health: ${formatNumber(steps)} pasos, ${Math.round(activeCalories)} calorias quemadas`}
        accessibilityRole="button"
        accessibilityHint={onPress ? 'Toca para ver mas detalles' : undefined}
      >
        {/* Header */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <View style={[s.appleHealthIcon, { backgroundColor: '#FF2D55' + '1A' }]}>
              <Ionicons name="heart" size={14} color="#FF2D55" />
            </View>
            <Text style={[s.headerTitle, { color: c.black }]}>Apple Health</Text>
          </View>
          {loading && (
            <View style={[s.syncBadge, { backgroundColor: c.accent + '1A' }]}>
              <Text style={[s.syncText, { color: c.accent }]}>Sync...</Text>
            </View>
          )}
        </View>

        {/* Metrics row */}
        <View style={s.metricsRow}>
          {/* Steps */}
          <View style={s.metricItem}>
            <View style={s.metricIconRow}>
              <Ionicons name="footsteps-outline" size={16} color="#10B981" />
              <Text style={[s.metricValue, { color: c.black }]}>
                {formatNumber(steps)}
              </Text>
            </View>
            <Text style={[s.metricLabel, { color: c.gray }]}>pasos</Text>
            {/* Mini progress bar */}
            <View style={[s.miniTrack, { backgroundColor: c.grayLight }]}>
              <View
                style={[
                  s.miniFill,
                  {
                    width: `${stepsProgress * 100}%`,
                    backgroundColor: '#10B981',
                  },
                ]}
              />
            </View>
          </View>

          {/* Divider */}
          <View style={[s.divider, { backgroundColor: c.grayLight }]} />

          {/* Active Calories */}
          <View style={s.metricItem}>
            <View style={s.metricIconRow}>
              <Ionicons name="flame-outline" size={16} color="#F59E0B" />
              <Text style={[s.metricValue, { color: c.black }]}>
                {Math.round(activeCalories)}
              </Text>
            </View>
            <Text style={[s.metricLabel, { color: c.gray }]}>kcal activas</Text>
            {/* Source indicator */}
            <View style={s.sourceRow}>
              <View style={[s.sourceDot, { backgroundColor: '#FF2D55' }]} />
              <Text style={[s.sourceText, { color: c.gray }]}>HealthKit</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  inner: {
    padding: spacing.md,
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
  appleHealthIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typography.label,
    fontWeight: '700',
  },
  syncBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  syncText: {
    fontSize: 10,
    fontWeight: '600',
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  metricItem: {
    flex: 1,
    gap: 2,
  },
  metricIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  metricLabel: {
    ...typography.caption,
    fontSize: 11,
    marginTop: 1,
  },
  miniTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 4,
    width: '80%',
  },
  miniFill: {
    height: 4,
    borderRadius: 2,
  },
  divider: {
    width: 1,
    height: 40,
    marginHorizontal: spacing.sm,
    alignSelf: 'center',
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 4,
  },
  sourceDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  sourceText: {
    fontSize: 9,
    fontWeight: '500',
  },
});
