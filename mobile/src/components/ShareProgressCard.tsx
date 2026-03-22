/**
 * ShareProgressCard -- Shareable daily progress card.
 *
 * Renders a visually polished card displaying:
 *   - NutriScore of the day (circular ring)
 *   - Current streak (fire icon)
 *   - Macro breakdown (protein / carbs / fats) with mini bars
 *   - Calorie summary (consumed vs target)
 *
 * A "Compartir" button triggers the native Share sheet with a text summary
 * of the day's progress. Uses expo-sharing when available, falls back to
 * React Native's built-in Share API.
 *
 * Designed for integration inside ProgressScreen.
 */
import React, { useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Share,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { useThemeColors, typography, spacing, radius, shadows } from '../theme';
import { useAppTheme } from '../context/ThemeContext';
import { haptics } from '../hooks/useHaptics';

// ---- Types ------------------------------------------------------------------

interface MacroData {
  /** Grams consumed */
  current: number;
  /** Grams target */
  target: number;
}

export interface ShareProgressCardProps {
  /** NutriScore value 0-100. */
  nutriScore: number;
  /** Streak in consecutive days. */
  streak: number;
  /** Whether a streak freeze is active (shows ice icon). */
  hasFreezeAvailable?: boolean;
  /** Calories consumed today. */
  caloriesCurrent: number;
  /** Calorie target for the day. */
  caloriesTarget: number;
  /** Protein macro data. */
  protein: MacroData;
  /** Carbs macro data. */
  carbs: MacroData;
  /** Fats macro data. */
  fats: MacroData;
  /** Optional callback after share completes. */
  onShareComplete?: () => void;
}

// ---- Score helpers ----------------------------------------------------------

function getScoreColor(score: number): string {
  if (score < 40) return '#EF4444';
  if (score <= 70) return '#F59E0B';
  return '#10B981';
}

function getScoreLabel(score: number): string {
  if (score < 40) return 'Necesita mejorar';
  if (score <= 70) return 'Buen progreso';
  return 'Excelente';
}

// ---- Animated SVG bridge ----------------------------------------------------

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ---- Ring constants ---------------------------------------------------------

const RING_SIZE = 80;
const RING_STROKE = 7;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = RING_RADIUS * 2 * Math.PI;

// ---- Component --------------------------------------------------------------

export default function ShareProgressCard({
  nutriScore,
  streak,
  hasFreezeAvailable = false,
  caloriesCurrent,
  caloriesTarget,
  protein,
  carbs,
  fats,
  onShareComplete,
}: ShareProgressCardProps) {
  const c = useThemeColors();
  const { isDark } = useAppTheme();

  const scoreColor = getScoreColor(nutriScore);
  const scoreLabel = getScoreLabel(nutriScore);
  const progress = Math.min(nutriScore / 100, 1);

  // Animated ring
  const animProgress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    animProgress.setValue(0);
    Animated.timing(animProgress, {
      toValue: progress,
      duration: 800,
      delay: 150,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const strokeDashoffset = animProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [RING_CIRCUMFERENCE, 0],
    extrapolate: 'clamp',
  });

  // Entrance scale animation
  const scaleAnim = useRef(new Animated.Value(0.92)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 100,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Calorie percentage
  const calPct = caloriesTarget > 0 ? Math.round((caloriesCurrent / caloriesTarget) * 100) : 0;

  // Share handler
  const handleShare = async () => {
    haptics.medium();

    const lines = [
      '--- Mi Progreso Hoy en Fitsi IA ---',
      '',
      `NutriScore: ${nutriScore}/100 (${scoreLabel})`,
      `Racha: ${streak} dia${streak !== 1 ? 's' : ''} seguidos`,
      '',
      `Calorias: ${caloriesCurrent} / ${caloriesTarget} kcal (${calPct}%)`,
      `Proteina: ${protein.current}g / ${protein.target}g`,
      `Carbohidratos: ${carbs.current}g / ${carbs.target}g`,
      `Grasas: ${fats.current}g / ${fats.target}g`,
      '',
      '#FitsiIA #MiProgreso',
    ];

    const message = lines.join('\n');

    try {
      await Share.share(
        Platform.OS === 'ios'
          ? { message }
          : { message, title: 'Fitsi IA - Mi Progreso' },
      );
      onShareComplete?.();
    } catch {
      // User cancelled or share failed -- no action needed.
    }
  };

  // Gradient-style card background
  const cardBg = isDark ? '#1A1F3A' : '#EEF2FF';
  const cardBorder = isDark ? '#2A3058' : '#D4DCFA';

  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          opacity: opacityAnim,
          transform: [{ scale: scaleAnim }],
        },
      ]}
    >
      {/* Main card */}
      <View
        style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}
        accessibilityLabel={`Progreso del dia: NutriScore ${nutriScore}, racha ${streak} dias`}
        accessibilityRole="summary"
      >
        {/* Header row: Title + Streak */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Ionicons name="today-outline" size={16} color={c.accent} />
            <Text style={[styles.headerTitle, { color: c.black }]}>Progreso del Dia</Text>
          </View>

          <View style={[styles.streakPill, { backgroundColor: isDark ? '#2E1A0A' : '#FFF7ED' }]}>
            <Ionicons name="flame" size={14} color="#F59E0B" />
            <Text style={[styles.streakText, { color: '#F59E0B' }]}>{streak}</Text>
            {hasFreezeAvailable && (
              <Ionicons
                name="snow"
                size={12}
                color={isDark ? '#93C5FD' : '#3B82F6'}
                style={styles.freezeIcon}
              />
            )}
          </View>
        </View>

        {/* Body: Ring + Macros */}
        <View style={styles.bodyRow}>
          {/* NutriScore Ring */}
          <View style={styles.ringSection}>
            <View style={styles.ringWrap}>
              <Svg width={RING_SIZE} height={RING_SIZE}>
                <Circle
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={RING_RADIUS}
                  stroke={isDark ? '#2A2A45' : '#E5E7EB'}
                  strokeWidth={RING_STROKE}
                  fill="none"
                />
                <AnimatedCircle
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={RING_RADIUS}
                  stroke={scoreColor}
                  strokeWidth={RING_STROKE}
                  fill="none"
                  strokeDasharray={RING_CIRCUMFERENCE}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  rotation="-90"
                  origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
                />
              </Svg>
              <View style={styles.ringCenter}>
                <Text style={[styles.ringScore, { color: scoreColor }]}>{nutriScore}</Text>
                <Text style={[styles.ringMax, { color: c.gray }]}>/100</Text>
              </View>
            </View>
            <Text style={[styles.ringLabel, { color: scoreColor }]}>{scoreLabel}</Text>
          </View>

          {/* Macros Column */}
          <View style={styles.macrosCol}>
            {/* Calories row */}
            <View style={styles.calRow}>
              <Text style={[styles.calValue, { color: c.black }]}>
                {caloriesCurrent}
              </Text>
              <Text style={[styles.calTarget, { color: c.gray }]}>
                {' '}/ {caloriesTarget} kcal
              </Text>
            </View>

            <MacroBar
              label="Proteina"
              current={protein.current}
              target={protein.target}
              color={c.protein}
              trackColor={isDark ? '#3A2020' : '#FEE2E2'}
              textColor={c.gray}
            />
            <MacroBar
              label="Carbos"
              current={carbs.current}
              target={carbs.target}
              color={c.carbs}
              trackColor={isDark ? '#3A3520' : '#FEF3C7'}
              textColor={c.gray}
            />
            <MacroBar
              label="Grasas"
              current={fats.current}
              target={fats.target}
              color={c.fats}
              trackColor={isDark ? '#1A2540' : '#DBEAFE'}
              textColor={c.gray}
            />
          </View>
        </View>

        {/* Branding */}
        <Text style={[styles.branding, { color: c.disabled }]}>Fitsi IA</Text>
      </View>

      {/* Share button */}
      <TouchableOpacity
        style={[styles.shareBtn, { backgroundColor: c.accent }]}
        onPress={handleShare}
        activeOpacity={0.8}
        accessibilityLabel="Compartir progreso del dia"
        accessibilityRole="button"
      >
        <Ionicons name="share-outline" size={18} color="#FFFFFF" />
        <Text style={styles.shareBtnText}>Compartir</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ---- MacroBar sub-component -------------------------------------------------

const MacroBar = React.memo(function MacroBar({
  label,
  current,
  target,
  color,
  trackColor,
  textColor,
}: {
  label: string;
  current: number;
  target: number;
  color: string;
  trackColor: string;
  textColor: string;
}) {
  const pct = target > 0 ? Math.min(current / target, 1) : 0;

  const fillWidth = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    fillWidth.setValue(0);
    Animated.timing(fillWidth, {
      toValue: pct,
      duration: 600,
      delay: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [pct]);

  const width = fillWidth.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View
      style={styles.macroRow}
      accessibilityLabel={`${label}: ${current} de ${target} gramos`}
    >
      <View style={styles.macroLabelRow}>
        <Text style={[styles.macroLabel, { color: textColor }]}>{label}</Text>
        <Text style={[styles.macroValue, { color: textColor }]}>
          {current}g / {target}g
        </Text>
      </View>
      <View style={[styles.macroTrack, { backgroundColor: trackColor }]}>
        <Animated.View
          style={[styles.macroFill, { width: width as any, backgroundColor: color }]}
        />
      </View>
    </View>
  );
});

// ---- Styles -----------------------------------------------------------------

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  card: {
    width: '100%',
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.md,
    ...shadows.md,
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerTitle: {
    ...typography.label,
    fontWeight: '700',
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.full,
    gap: 3,
  },
  streakText: {
    fontSize: 13,
    fontWeight: '800',
  },
  freezeIcon: {
    marginLeft: 2,
  },

  // Body
  bodyRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },

  // Ring
  ringSection: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  ringWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringScore: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -1,
  },
  ringMax: {
    ...typography.caption,
    marginTop: -2,
  },
  ringLabel: {
    ...typography.caption,
    fontWeight: '600',
  },

  // Macros
  macrosCol: {
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'center',
  },
  calRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 2,
  },
  calValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  calTarget: {
    ...typography.caption,
  },
  macroRow: {
    gap: 3,
  },
  macroLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  macroLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  macroValue: {
    fontSize: 10,
    fontWeight: '500',
  },
  macroTrack: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
  },
  macroFill: {
    height: 5,
    borderRadius: 3,
  },

  // Branding
  branding: {
    ...typography.caption,
    textAlign: 'right',
    marginTop: spacing.sm,
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
