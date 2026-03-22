/**
 * CalorieComparisonCard — Horizontal bar comparing logged vs target calories.
 *
 * Displays a colored zone bar:
 *   - Red zone (0-50%):     Critical deficit
 *   - Orange zone (50-85%): Under target
 *   - Green zone (85-115%): Optimal
 *   - Orange zone (115-130%): Moderate excess
 *   - Red zone (130%+):     High excess
 *
 * A marker shows where the user currently sits.
 */
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius } from '../theme';
import useHaptics from '../hooks/useHaptics';

interface CalorieComparisonCardProps {
  logged: number;
  target: number;
  status: string;
  weekAvg?: number;
}

const STATUS_COLORS: Record<string, string> = {
  critical: '#DC2626',
  high_risk: '#EF4444',
  risk: '#F59E0B',
  low_adherence: '#FB923C',
  optimal: '#22C55E',
  moderate_excess: '#F59E0B',
  high_excess: '#EF4444',
};

const ZONE_EXPLANATIONS: Record<string, string> = {
  critical: 'Tu consumo esta muy por debajo de tu plan. Registra lo que has comido para actualizar.',
  high_risk: 'Llevas menos de la mitad de tu meta calorica. Intenta agregar una comida mas.',
  risk: 'Vas por buen camino pero te falta un poco. Un snack te acercaria a tu meta.',
  low_adherence: 'Casi llegas! Un poco mas y alcanzas tu rango optimo.',
  optimal: 'Excelente! Estas dentro de tu rango ideal.',
  moderate_excess: 'Te pasaste un poco. Modera la proxima comida.',
  high_excess: 'Exceso significativo. Considera una comida ligera para equilibrar.',
};

// Zone bar colors per theme — dark uses semi-transparent for subtlety
const ZONE_LIGHT = { red: '#FEE2E2', orange: '#FEF3C7', green: '#D1FAE5' };
const ZONE_DARK  = { red: 'rgba(239,68,68,0.25)', orange: 'rgba(245,158,11,0.25)', green: 'rgba(34,197,94,0.25)' };

function CalorieComparisonCard({ logged, target, status, weekAvg }: CalorieComparisonCardProps) {
  const c = useThemeColors();
  const haptics = useHaptics();
  const [tooltipOpen, setTooltipOpen] = useState(false);

  // Detect dark mode for zone bar colors
  let isDark = false;
  try {
    const { useAppTheme } = require('../context/ThemeContext');
    isDark = useAppTheme().isDark;
  } catch {
    isDark = useColorScheme() === 'dark';
  }
  const z = isDark ? ZONE_DARK : ZONE_LIGHT;

  const toggleTooltip = useCallback(() => {
    haptics.light();
    setTooltipOpen((prev) => !prev);
  }, [haptics]);

  const ratio = target > 0 ? logged / target : 0;
  const pct = Math.round(ratio * 100);
  const statusColor = STATUS_COLORS[status] || '#22C55E';
  const zoneExplanation = ZONE_EXPLANATIONS[status] || ZONE_EXPLANATIONS.optimal;

  // Position marker on the bar (0-100% of bar width)
  // Bar represents 0% to 160% of target
  const markerPct = Math.min(Math.max((ratio / 1.6) * 100, 0), 100);

  const deficit = target - logged;
  const isDeficit = deficit > 0;
  const diffText = isDeficit
    ? `${Math.round(deficit)} kcal restantes`
    : `${Math.round(Math.abs(deficit))} kcal de exceso`;

  return (
    <View
      style={[styles.container, { backgroundColor: c.surface, borderColor: c.grayLight }]}
      accessibilityLabel={`Calorias: ${Math.round(logged)} de ${Math.round(target)}. ${pct}% del objetivo. ${diffText}`}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: c.black }]}>Calorias</Text>
        <View style={styles.badgeRow}>
          <Text style={[styles.pctBadge, { color: statusColor, backgroundColor: statusColor + '18' }]}>
            {pct}%
          </Text>
          <TouchableOpacity
            onPress={toggleTooltip}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Explicacion de la zona actual"
            accessibilityRole="button"
          >
            <Ionicons name="help-circle-outline" size={18} color={c.gray} />
          </TouchableOpacity>
        </View>
      </View>

      {tooltipOpen && (
        <Text style={[styles.tooltipText, { color: statusColor }]}>
          {zoneExplanation}
        </Text>
      )}

      <View style={styles.valuesRow}>
        <Text style={[styles.loggedValue, { color: c.black }]}>
          {Math.round(logged)} <Text style={[styles.unit, { color: c.gray }]}>kcal</Text>
        </Text>
        <Text style={[styles.targetValue, { color: c.gray }]}>
          / {Math.round(target)} kcal
        </Text>
      </View>

      {/* Zone bar */}
      <View style={styles.barContainer}>
        {/* Red deficit zone: 0-31.25% of bar (0-50% of target) */}
        <View style={[styles.zone, { flex: 31.25, backgroundColor: z.red }]} />
        {/* Orange zone: 31.25-53.125% (50-85% of target) */}
        <View style={[styles.zone, { flex: 21.875, backgroundColor: z.orange }]} />
        {/* Green zone: 53.125-71.875% (85-115% of target) */}
        <View style={[styles.zone, { flex: 18.75, backgroundColor: z.green }]} />
        {/* Orange excess: 71.875-81.25% (115-130% of target) */}
        <View style={[styles.zone, { flex: 9.375, backgroundColor: z.orange }]} />
        {/* Red excess: 81.25-100% (130-160% of target) */}
        <View style={[styles.zone, { flex: 18.75, backgroundColor: z.red }]} />
      </View>

      {/* Marker */}
      <View style={styles.markerRow}>
        <View style={[styles.marker, { left: `${markerPct}%` as any, backgroundColor: statusColor }]}>
          <View style={[styles.markerDot, { backgroundColor: statusColor }]} />
        </View>
      </View>

      {/* Status line */}
      <Text style={[styles.statusText, { color: statusColor }]}>
        {diffText}
      </Text>

      {/* Weekly average */}
      {weekAvg != null && (
        <Text style={[styles.weekAvgText, { color: c.gray }]}>
          Promedio semanal: {Math.round(weekAvg)} kcal
        </Text>
      )}
    </View>
  );
}

export default React.memo(CalorieComparisonCard);

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  tooltipText: {
    ...typography.caption,
    lineHeight: 16,
  },
  title: {
    ...typography.label,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pctBadge: {
    fontSize: 13,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  valuesRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  loggedValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  unit: {
    fontSize: 14,
    fontWeight: '400',
  },
  targetValue: {
    ...typography.bodyMd,
  },
  barContainer: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  zone: {
    height: 8,
  },
  markerRow: {
    height: 12,
    position: 'relative',
  },
  marker: {
    position: 'absolute',
    top: 0,
    width: 3,
    height: 12,
    borderRadius: 2,
    marginLeft: -1,
  },
  markerDot: {
    position: 'absolute',
    top: -3,
    left: -4,
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusText: {
    ...typography.caption,
    fontWeight: '600',
  },
  weekAvgText: {
    ...typography.caption,
  },
});
