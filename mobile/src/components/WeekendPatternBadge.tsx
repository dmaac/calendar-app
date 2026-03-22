/**
 * WeekendPatternBadge — Small pill badge indicating a weekend eating pattern.
 *
 * Shows "Comes mas los fines de semana" with a trending-up icon.
 * Tappable: expands to show a brief explanation with averages.
 *
 * Props:
 *   weekendAvg: number  — average weekend calories
 *   weekdayAvg: number  — average weekday calories
 *   patternDetected: boolean — whether to show the badge at all
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius } from '../theme';
import { haptics } from '../hooks/useHaptics';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface WeekendPatternBadgeProps {
  weekendAvg: number;
  weekdayAvg: number;
  patternDetected: boolean;
}

const WeekendPatternBadge = React.memo(function WeekendPatternBadge({
  weekendAvg,
  weekdayAvg,
  patternDetected,
}: WeekendPatternBadgeProps) {
  const c = useThemeColors();
  const [expanded, setExpanded] = useState(false);

  const toggle = useCallback(() => {
    haptics.light();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  }, []);

  if (!patternDetected) return null;

  const diff = Math.round(weekendAvg - weekdayAvg);

  return (
    <TouchableOpacity
      style={[styles.container, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}
      onPress={toggle}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`Patron detectado: Comes mas los fines de semana. ${expanded ? 'Colapsar' : 'Expandir'} para mas detalles`}
      accessibilityState={{ expanded }}
    >
      <View style={styles.row}>
        <Ionicons name="trending-up" size={14} color="#F59E0B" />
        <Text style={[styles.label, { color: '#92400E' }]}>
          Comes mas los fines de semana
        </Text>
      </View>
      {expanded && (
        <Text style={[styles.detail, { color: '#92400E' }]}>
          Promedio fin de semana: {Math.round(weekendAvg)} kcal vs. semana: {Math.round(weekdayAvg)} kcal ({diff > 0 ? '+' : ''}{diff} kcal)
        </Text>
      )}
    </TouchableOpacity>
  );
});

export default WeekendPatternBadge;

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    alignSelf: 'flex-start',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  label: {
    ...typography.caption,
    fontWeight: '600',
  },
  detail: {
    ...typography.caption,
    marginTop: spacing.xs,
    lineHeight: 18,
  },
});
