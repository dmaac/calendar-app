/**
 * RiskSkeleton — Shimmer skeleton placeholders for risk UI cards.
 *
 * Renders skeleton loaders that match the shape of:
 *   - NutritionSemaphore (circle + label)
 *   - CalorieComparisonCard (bar + labels)
 *
 * Uses the existing SkeletonLoader component for consistent shimmer style.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import SkeletonLoader from './SkeletonLoader';
import { useThemeColors, spacing, radius } from '../theme';

export default function RiskSkeleton() {
  const c = useThemeColors();

  return (
    <View
      style={styles.container}
      accessibilityLabel="Cargando datos de riesgo nutricional"
      accessibilityRole="progressbar"
    >
      {/* NutritionSemaphore skeleton — circle + label */}
      <View style={styles.semaphoreWrapper}>
        <SkeletonLoader width={100} height={100} borderRadius={50} />
        <SkeletonLoader width={60} height={12} style={{ marginTop: spacing.xs }} />
      </View>

      {/* CalorieComparisonCard skeleton — header + bar + status */}
      <View style={[styles.cardWrapper, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
        <View style={styles.cardHeader}>
          <SkeletonLoader width={70} height={12} />
          <SkeletonLoader width={40} height={18} borderRadius={8} />
        </View>
        <View style={styles.cardValues}>
          <SkeletonLoader width={100} height={20} />
          <SkeletonLoader width={80} height={14} />
        </View>
        <SkeletonLoader width="100%" height={8} borderRadius={4} />
        <SkeletonLoader width={120} height={12} style={{ marginTop: spacing.xs }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  semaphoreWrapper: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  cardWrapper: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardValues: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
});
