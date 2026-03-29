/**
 * CorrelationInsightCard — Shows exercise/nutrition correlation patterns.
 *
 * Fetches GET /api/risk/correlations
 * If a pattern is detected, shows insight text and a bar comparison.
 * Collapsible card design.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  UIManager,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius } from '../theme';
import { apiClient } from '../services/apiClient';
import { haptics } from '../hooks/useHaptics';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface CorrelationData {
  pattern_detected: boolean;
  message?: string;
  workout_day_avg?: number;
  rest_day_avg?: number;
  difference_pct?: number;
}

const CorrelationInsightCard = React.memo(function CorrelationInsightCard() {
  const c = useThemeColors();

  const [data, setData] = useState<CorrelationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const fetchCorrelations = useCallback(async () => {
    try {
      const res = await apiClient.get<CorrelationData>('/api/risk/correlations');
      setData(res.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCorrelations();
  }, [fetchCorrelations]);

  const toggleExpand = useCallback(() => {
    haptics.light();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  }, []);

  if (loading) {
    return (
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
        <ActivityIndicator size="small" color={c.primary} />
      </View>
    );
  }

  if (!data || !data.pattern_detected) {
    return null;
  }

  const workoutAvg = Math.round(data.workout_day_avg ?? 0);
  const restAvg = Math.round(data.rest_day_avg ?? 0);
  const maxAvg = Math.max(workoutAvg, restAvg, 1);

  return (
    <View
      style={[styles.card, { backgroundColor: c.surface, borderColor: c.grayLight }]}
      accessibilityLabel={data.message ?? 'Patron de correlacion detectado'}
    >
      <TouchableOpacity
        onPress={toggleExpand}
        style={styles.headerRow}
        accessibilityRole="button"
        accessibilityLabel={`Insight de correlacion. ${expanded ? 'Colapsar' : 'Expandir'}`}
      >
        <View style={styles.headerLeft}>
          <Ionicons name="analytics-outline" size={18} color={c.primary} />
          <Text style={[styles.title, { color: c.black }]}>Patron detectado</Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={c.gray}
        />
      </TouchableOpacity>

      {data.message != null && (
        <Text style={[styles.message, { color: c.gray }]}>{data.message}</Text>
      )}

      {expanded && (
        <View style={styles.barsContainer}>
          {/* Workout day bar */}
          <View style={styles.barRow}>
            <Text style={[styles.barLabel, { color: c.black }]}>Dia de ejercicio</Text>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  {
                    backgroundColor: c.primary,
                    width: `${Math.round((workoutAvg / maxAvg) * 100)}%`,
                  },
                ]}
              />
            </View>
            <Text style={[styles.barValue, { color: c.black }]}>{workoutAvg} kcal</Text>
          </View>

          {/* Rest day bar */}
          <View style={styles.barRow}>
            <Text style={[styles.barLabel, { color: c.black }]}>Dia de descanso</Text>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  {
                    backgroundColor: '#F59E0B',
                    width: `${Math.round((restAvg / maxAvg) * 100)}%`,
                  },
                ]}
              />
            </View>
            <Text style={[styles.barValue, { color: c.black }]}>{restAvg} kcal</Text>
          </View>

          {data.difference_pct != null && (
            <Text style={[styles.diffText, { color: c.gray }]}>
              Diferencia: {Math.round(data.difference_pct)}%
            </Text>
          )}
        </View>
      )}
    </View>
  );
});

export default CorrelationInsightCard;

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    ...typography.label,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  message: {
    ...typography.caption,
    lineHeight: 16,
  },
  barsContainer: {
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  barLabel: {
    ...typography.caption,
    fontWeight: '500',
    width: 100,
  },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E0E0E020',
    overflow: 'hidden',
  },
  barFill: {
    height: 8,
    borderRadius: 4,
  },
  barValue: {
    ...typography.caption,
    fontWeight: '700',
    width: 60,
    textAlign: 'right',
  },
  diffText: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
