/**
 * WeeklySummary -- Weekly nutrition summary card.
 *
 * Displays a polished summary of the past week's nutrition data:
 *   - Average daily calories
 *   - Best NutriScore day (day name + score)
 *   - Total meals logged
 *   - Current streak
 *
 * Visibility logic:
 *   Shows automatically on Sundays or Monday mornings.
 *   Can also be rendered unconditionally by setting `alwaysShow`.
 *
 * Animations:
 *   - Fade-in + scale entrance (spring-based)
 *   - Animated stat counters
 *   - Share button with haptic feedback
 */
import React, { useRef, useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Share,
  Platform,
  Animated,
  Easing,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius, shadows } from '../theme';
import { useAppTheme } from '../context/ThemeContext';
import { haptics } from '../hooks/useHaptics';

// ---- Types ------------------------------------------------------------------

export interface WeeklySummaryData {
  /** Average calories per day this week. */
  avgCalories: number;
  /** Best NutriScore achieved this week (0-100). */
  bestNutriScore: number;
  /** Name of the day with the best NutriScore (e.g., "Miercoles"). */
  bestNutriScoreDay: string;
  /** Total number of meals logged during the week. */
  totalMealsLogged: number;
  /** Current streak in days. */
  streak: number;
  /** Average protein in grams. */
  avgProtein?: number;
  /** Average carbs in grams. */
  avgCarbs?: number;
  /** Average fats in grams. */
  avgFats?: number;
}

export interface WeeklySummaryProps {
  /** Week data to display. */
  data: WeeklySummaryData;
  /** Force display regardless of day. Defaults to false. */
  alwaysShow?: boolean;
  /** Callback when the card is dismissed. */
  onDismiss?: () => void;
  /** Callback after sharing completes. */
  onShareComplete?: () => void;
}

// ---- Day-of-week check ------------------------------------------------------

/** Returns true if today is Sunday (0) or Monday (1). */
function isSummaryDay(): boolean {
  const day = new Date().getDay();
  return day === 0 || day === 1;
}

// ---- Animated counter -------------------------------------------------------

function useAnimatedCounter(target: number, duration = 800, delay = 300): number {
  const anim = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    anim.setValue(0);
    const listener = anim.addListener(({ value }) => setDisplay(Math.round(value)));
    Animated.timing(anim, {
      toValue: target,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => anim.removeListener(listener);
  }, [target]);

  return display;
}

// ---- NutriScore color -------------------------------------------------------

function getScoreColor(score: number): string {
  if (score < 40) return '#EF4444';
  if (score <= 70) return '#F59E0B';
  return '#10B981';
}

// ---- Component --------------------------------------------------------------

export default function WeeklySummary({
  data,
  alwaysShow = false,
  onDismiss,
  onShareComplete,
}: WeeklySummaryProps) {
  const c = useThemeColors();
  const { isDark } = useAppTheme();

  // Visibility: show on summary days or when forced
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (alwaysShow || isSummaryDay()) {
      setVisible(true);
    }
  }, [alwaysShow]);

  // Entrance animation
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 7,
          tension: 80,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 450,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  // Animated counters
  const displayCal = useAnimatedCounter(data.avgCalories, 900, 200);
  const displayMeals = useAnimatedCounter(data.totalMealsLogged, 700, 350);
  const displayStreak = useAnimatedCounter(data.streak, 600, 450);
  const displayScore = useAnimatedCounter(data.bestNutriScore, 800, 300);

  // Share handler
  const handleShare = async () => {
    haptics.medium();

    const lines = [
      '--- Mi Semana en Fitsi AI ---',
      '',
      `Calorias promedio: ${data.avgCalories} kcal`,
      `Mejor NutriScore: ${data.bestNutriScore}/100 (${data.bestNutriScoreDay})`,
      `Comidas registradas: ${data.totalMealsLogged}`,
      `Racha actual: ${data.streak} dia${data.streak !== 1 ? 's' : ''}`,
    ];

    if (data.avgProtein != null) {
      lines.push(`Proteina promedio: ${data.avgProtein}g`);
    }

    lines.push('', '#FitsiAI #MiSemana');
    const message = lines.join('\n');

    try {
      await Share.share(
        Platform.OS === 'ios'
          ? { message }
          : { message, title: 'Fitsi AI - Mi Semana' },
      );
      onShareComplete?.();
    } catch {
      // User cancelled -- no action needed.
    }
  };

  // Dismiss handler
  const handleDismiss = () => {
    haptics.light();
    Animated.parallel([
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.9,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setVisible(false);
      onDismiss?.();
    });
  };

  if (!visible) return null;

  const cardBg = isDark ? '#111827' : '#F0F4FF';
  const cardBorder = isDark ? '#1F2937' : '#C7D2FE';
  const bestScoreColor = getScoreColor(data.bestNutriScore);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: opacityAnim,
          transform: [{ scale: scaleAnim }],
        },
      ]}
      accessibilityLabel={`Resumen semanal: ${data.avgCalories} calorias promedio, racha ${data.streak} dias`}
      accessibilityRole="summary"
    >
      <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
        {/* Dismiss button */}
        <TouchableOpacity
          style={styles.dismissBtn}
          onPress={handleDismiss}
          hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
          accessibilityLabel="Cerrar resumen semanal"
          accessibilityRole="button"
        >
          <Ionicons name="close" size={18} color={c.gray} />
        </TouchableOpacity>

        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.headerIconCircle, { backgroundColor: isDark ? '#1E3A5F' : '#DBEAFE' }]}>
            <Ionicons name="bar-chart" size={22} color={c.accent} />
          </View>
          <Text style={[styles.headerTitle, { color: c.black }]}>Resumen Semanal</Text>
          <Text style={[styles.headerSubtitle, { color: c.gray }]}>
            Tu progreso de los ultimos 7 dias
          </Text>
        </View>

        {/* Stats grid (2x2) */}
        <View style={styles.statsGrid}>
          {/* Average Calories */}
          <View style={[styles.statCard, { backgroundColor: isDark ? c.surface : '#FFFFFF', borderColor: isDark ? c.grayLight : '#E5E7EB' }]}>
            <Ionicons name="flame-outline" size={18} color="#F59E0B" />
            <Text style={[styles.statValue, { color: c.black }]}>{displayCal}</Text>
            <Text style={[styles.statLabel, { color: c.gray }]}>kcal prom.</Text>
          </View>

          {/* Best NutriScore */}
          <View style={[styles.statCard, { backgroundColor: isDark ? c.surface : '#FFFFFF', borderColor: isDark ? c.grayLight : '#E5E7EB' }]}>
            <Ionicons name="leaf" size={18} color={bestScoreColor} />
            <Text style={[styles.statValue, { color: bestScoreColor }]}>{displayScore}</Text>
            <Text style={[styles.statLabel, { color: c.gray }]}>
              mejor score ({data.bestNutriScoreDay})
            </Text>
          </View>

          {/* Meals Logged */}
          <View style={[styles.statCard, { backgroundColor: isDark ? c.surface : '#FFFFFF', borderColor: isDark ? c.grayLight : '#E5E7EB' }]}>
            <Ionicons name="restaurant-outline" size={18} color="#10B981" />
            <Text style={[styles.statValue, { color: c.black }]}>{displayMeals}</Text>
            <Text style={[styles.statLabel, { color: c.gray }]}>comidas</Text>
          </View>

          {/* Streak */}
          <View style={[styles.statCard, { backgroundColor: isDark ? c.surface : '#FFFFFF', borderColor: isDark ? c.grayLight : '#E5E7EB' }]}>
            <Ionicons name="flame" size={18} color="#EF4444" />
            <Text style={[styles.statValue, { color: c.black }]}>{displayStreak}</Text>
            <Text style={[styles.statLabel, { color: c.gray }]}>
              dia{data.streak !== 1 ? 's' : ''} racha
            </Text>
          </View>
        </View>

        {/* Optional macro averages */}
        {data.avgProtein != null && data.avgCarbs != null && data.avgFats != null && (
          <View style={[styles.macroRow, { borderTopColor: isDark ? c.grayLight : '#E5E7EB' }]}>
            <MacroChip label="P" value={`${data.avgProtein}g`} color={c.protein} isDark={isDark} />
            <MacroChip label="C" value={`${data.avgCarbs}g`} color={c.carbs} isDark={isDark} />
            <MacroChip label="G" value={`${data.avgFats}g`} color={c.fats} isDark={isDark} />
          </View>
        )}

        {/* Branding */}
        <Text style={[styles.branding, { color: c.disabled }]}>Fitsi AI</Text>
      </View>

      {/* Share button */}
      <TouchableOpacity
        style={[styles.shareBtn, { backgroundColor: c.accent }]}
        onPress={handleShare}
        activeOpacity={0.8}
        accessibilityLabel="Compartir resumen semanal"
        accessibilityRole="button"
      >
        <Ionicons name="share-outline" size={18} color="#FFFFFF" />
        <Text style={styles.shareBtnText}>Compartir</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ---- MacroChip sub-component ------------------------------------------------

const MacroChip = React.memo(function MacroChip({
  label,
  value,
  color,
  isDark,
}: {
  label: string;
  value: string;
  color: string;
  isDark: boolean;
}) {
  const c = useThemeColors();
  return (
    <View style={[styles.macroChip, { backgroundColor: isDark ? c.surface : '#FFFFFF' }]}>
      <View style={[styles.macroChipDot, { backgroundColor: color }]} />
      <Text style={[styles.macroChipLabel, { color }]}>{label}</Text>
      <Text style={[styles.macroChipValue, { color }]}>{value}</Text>
    </View>
  );
});

// ---- Styles -----------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  card: {
    width: '100%',
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.lg,
    ...shadows.lg,
  },

  // Dismiss
  dismissBtn: {
    position: 'absolute',
    top: spacing.sm + 2,
    right: spacing.sm + 2,
    zIndex: 1,
    padding: 4,
  },

  // Header
  header: {
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  headerIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  headerTitle: {
    ...typography.titleMd,
  },
  headerSubtitle: {
    ...typography.caption,
  },

  // Stats grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statCard: {
    width: '48%',
    flexGrow: 1,
    flexBasis: '45%',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 3,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  statLabel: {
    ...typography.caption,
    textAlign: 'center',
  },

  // Macro row
  macroRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
  },
  macroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  macroChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  macroChipLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  macroChipValue: {
    fontSize: 11,
    fontWeight: '500',
  },

  // Branding
  branding: {
    ...typography.caption,
    textAlign: 'right',
    marginTop: spacing.md,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  // Share button
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    ...shadows.sm,
  },
  shareBtnText: {
    ...typography.button,
    color: '#FFFFFF',
  },
});
