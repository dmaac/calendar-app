/**
 * IntegratedHealthScore — Compact 0-100 health score with 4 sub-category bars.
 *
 * Fetches from GET /api/risk/health-score and displays:
 *   - Large central number (0-100)
 *   - 4 mini progress bars: Nutricion, Actividad, Constancia, Hidratacion
 *   - Each bar colored by its individual score
 *   - Compact layout (~150px height) for HomeScreen embedding
 */
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeColors, typography, spacing, radius } from '../theme';
import { apiClient } from '../services/apiClient';

interface HealthScoreData {
  overall: number;
  nutrition: number;
  activity: number;
  consistency: number;
  hydration: number;
}

interface IntegratedHealthScoreProps {
  compact?: boolean;
}

function getBarColor(score: number): string {
  if (score >= 70) return '#22C55E';
  if (score >= 40) return '#F59E0B';
  return '#EF4444';
}

const CATEGORIES: { key: keyof Omit<HealthScoreData, 'overall'>; label: string }[] = [
  { key: 'nutrition', label: 'Nutricion' },
  { key: 'activity', label: 'Actividad' },
  { key: 'consistency', label: 'Constancia' },
  { key: 'hydration', label: 'Hidratacion' },
];

function IntegratedHealthScore({ compact = true }: IntegratedHealthScoreProps) {
  const c = useThemeColors();
  const [data, setData] = useState<HealthScoreData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchScore = useCallback(async () => {
    try {
      const res = await apiClient.get<HealthScoreData>('/api/risk/health-score');
      setData(res.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScore();
  }, [fetchScore]);

  if (loading || data == null) return null;

  const overall = Math.max(0, Math.min(100, Math.round(data.overall)));
  const overallColor = getBarColor(overall);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: c.surface, borderColor: c.grayLight },
        compact && styles.compact,
      ]}
      accessibilityLabel={`Tu puntaje de salud: ${overall} de 100`}
      accessibilityValue={{ min: 0, max: 100, now: overall }}
    >
      <Text style={[styles.header, { color: c.black }]}>Tu puntaje de salud</Text>

      <View style={styles.scoreRow}>
        <Text style={[styles.scoreNumber, { color: overallColor }]}>{overall}</Text>
        <Text style={[styles.scoreMax, { color: c.gray }]}>/100</Text>
      </View>

      <View style={styles.barsContainer}>
        {CATEGORIES.map(({ key, label }) => {
          const value = Math.max(0, Math.min(100, Math.round(data[key])));
          const barColor = getBarColor(value);
          return (
            <View key={key} style={styles.barRow}>
              <Text style={[styles.barLabel, { color: c.gray }]} numberOfLines={1}>{label}</Text>
              <View style={[styles.barTrack, { backgroundColor: c.grayLight }]}>
                <View style={[styles.barFill, { width: `${value}%`, backgroundColor: barColor }]} />
              </View>
              <Text style={[styles.barValue, { color: barColor }]}>{value}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default React.memo(IntegratedHealthScore);

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  compact: {
    maxHeight: 150,
  },
  header: {
    ...typography.label,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  scoreNumber: {
    fontSize: 36,
    fontWeight: '800',
  },
  scoreMax: {
    ...typography.bodyMd,
  },
  barsContainer: {
    gap: 6,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  barLabel: {
    ...typography.caption,
    width: 72,
  },
  barTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: 6,
    borderRadius: 3,
  },
  barValue: {
    ...typography.caption,
    fontWeight: '700',
    width: 26,
    textAlign: 'right',
  },
});
