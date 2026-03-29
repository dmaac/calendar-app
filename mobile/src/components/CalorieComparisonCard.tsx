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
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius } from '../theme';
import useHaptics from '../hooks/useHaptics';

interface HistoryDot {
  date: string;
  ratio: number;
}

interface CalorieComparisonCardProps {
  logged: number;
  target: number;
  status: string;
  weekAvg?: number;
  history?: HistoryDot[];
  trendDirection?: 'improving' | 'stable' | 'worsening';
  lastLoggedDate?: string;
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

function getDotColor(ratio: number): string {
  if (ratio < 0.5) return '#DC2626';
  if (ratio < 0.85) return '#F59E0B';
  if (ratio <= 1.15) return '#22C55E';
  if (ratio <= 1.3) return '#F59E0B';
  return '#DC2626';
}

// Zone bar colors per theme
const ZONE_LIGHT = { red: '#FEE2E2', orange: '#FEF3C7', green: '#D1FAE5' };
const ZONE_DARK  = { red: '#DC2626', orange: '#D97706', green: '#16A34A' };

function getTrendIcon(dir: 'improving' | 'stable' | 'worsening'): { name: 'trending-up' | 'trending-down' | 'remove-outline'; color: string } {
  if (dir === 'improving') return { name: 'trending-up', color: '#22C55E' };
  if (dir === 'worsening') return { name: 'trending-down', color: '#DC2626' };
  return { name: 'remove-outline', color: '#9CA3AF' };
}

function getRelativeDate(isoDate: string): string | null {
  const now = new Date();
  const d = new Date(isoDate);
  const todayStr = now.toISOString().split('T')[0];
  const dateStr = d.toISOString().split('T')[0];
  if (dateStr === todayStr) return null;
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 1) return 'Ayer';
  return `Hace ${diffDays} dias`;
}

function CalorieComparisonCard({ logged, target, status, weekAvg, history, trendDirection, lastLoggedDate }: CalorieComparisonCardProps) {
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

  // Animated marker position — slides smoothly when zone changes
  const markerAnim = useRef(new Animated.Value(markerPct)).current;
  const colorFadeAnim = useRef(new Animated.Value(1)).current;
  const prevStatusRef = useRef(status);

  useEffect(() => {
    Animated.timing(markerAnim, {
      toValue: markerPct,
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [markerPct, markerAnim]);

  // Color fade when status zone changes
  useEffect(() => {
    if (prevStatusRef.current !== status) {
      prevStatusRef.current = status;
      colorFadeAnim.setValue(0);
      Animated.timing(colorFadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: false,
      }).start();
    }
  }, [status, colorFadeAnim]);

  const animatedStatusOpacity = colorFadeAnim;

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
          {trendDirection != null && (
            <Ionicons
              name={getTrendIcon(trendDirection).name}
              size={16}
              color={getTrendIcon(trendDirection).color}
              accessibilityLabel={`Tendencia: ${trendDirection}`}
            />
          )}
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
        {ratio > 1.15 && (
          <Text style={[styles.zoneBadge, { color: '#DC2626', backgroundColor: '#DC262618' }]}>EXCESO</Text>
        )}
        {ratio < 0.85 && ratio > 0 && (
          <Text style={[styles.zoneBadge, { color: '#F59E0B', backgroundColor: '#F59E0B18' }]}>DEFICIT</Text>
        )}
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

      {/* Mini-history dots */}
      {history != null && history.length > 0 && (
        <View style={styles.historyRow} accessibilityLabel={`Historial de ${history.length} dias`}>
          {history.map((h) => (
            <View
              key={h.date}
              style={[styles.historyDot, { backgroundColor: getDotColor(h.ratio) }]}
              accessibilityLabel={`${h.date}: ${Math.round(h.ratio * 100)}%`}
            />
          ))}
        </View>
      )}

      {/* Animated Marker */}
      <View style={styles.markerRow}>
        <Animated.View
          style={[
            styles.marker,
            {
              left: markerAnim.interpolate({
                inputRange: [0, 100],
                outputRange: ['0%', '100%'],
              }) as any,
              backgroundColor: statusColor,
            },
          ]}
        >
          <View style={[styles.markerDot, { backgroundColor: statusColor }]} />
        </Animated.View>
      </View>

      {/* Status line with fade transition */}
      <Animated.Text style={[styles.statusText, { color: statusColor, opacity: animatedStatusOpacity }]}>
        {diffText}
      </Animated.Text>

      {/* Last logged date */}
      {lastLoggedDate != null && getRelativeDate(lastLoggedDate) != null && (
        <Text style={[styles.lastLoggedText, { color: c.gray }]}>
          Ultimo registro: {getRelativeDate(lastLoggedDate)}
        </Text>
      )}

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
  zoneBadge: {
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
    letterSpacing: 0.5,
  },
  lastLoggedText: {
    ...typography.caption,
    fontStyle: 'italic',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 2,
  },
  historyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
