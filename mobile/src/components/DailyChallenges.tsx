/**
 * DailyChallenges -- Daily challenge widget for HomeScreen.
 *
 * Shows 3 daily challenges that rotate based on the day of the year:
 *   1. "Registra todas tus comidas" (complete 3+ food logs)
 *   2. "Toma 2L de agua" (reach hydration goal)
 *   3. "Come 100g de proteina" (reach protein goal)
 *
 * Features:
 *   - Individual progress bars per challenge
 *   - ConfettiEffect animation when all 3 are completed
 *   - Cumulative XP points persisted in AsyncStorage
 *   - Full dark mode support via useThemeColors
 *   - Haptic feedback on completion
 *   - Analytics tracking
 *
 * Integration: Place after the Daily Tip section in HomeScreen.
 */
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useThemeColors, typography, spacing, radius, shadows } from '../theme';
import { haptics } from '../hooks/useHaptics';
import { useAnalytics } from '../hooks/useAnalytics';
import ConfettiEffect from './ConfettiEffect';

// ─── Storage keys ────────────────────────────────────────────────────────────

const STORAGE_XP = '@fitsi_daily_challenges_xp';
const STORAGE_LAST_COMPLETED_DATE = '@fitsi_daily_challenges_last_date';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DailyChallenge {
  id: string;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  target: number;
  unit: string;
  xpReward: number;
  color: string;
}

interface DailyChallengesProps {
  /** Number of meals/food logs completed today. */
  mealsLogged: number;
  /** Current water intake in ml. */
  waterMl: number;
  /** Current protein intake in grams. */
  proteinG: number;
}

// ─── Challenge pool (rotates by day of year) ─────────────────────────────────

const CHALLENGE_SETS: DailyChallenge[][] = [
  // Set 0
  [
    { id: 'log_meals', title: 'Registra todas tus comidas', description: 'Registra al menos 3 comidas hoy', icon: 'restaurant-outline', target: 3, unit: 'comidas', xpReward: 50, color: '#10B981' },
    { id: 'drink_water', title: 'Toma 2L de agua', description: 'Alcanza tu meta de hidratacion', icon: 'water-outline', target: 2000, unit: 'ml', xpReward: 30, color: '#3B82F6' },
    { id: 'protein_100', title: 'Come 100g de proteina', description: 'Alcanza 100g de proteina hoy', icon: 'barbell-outline', target: 100, unit: 'g', xpReward: 40, color: '#EF4444' },
  ],
  // Set 1
  [
    { id: 'log_meals', title: 'Registra todas tus comidas', description: 'Registra al menos 3 comidas hoy', icon: 'restaurant-outline', target: 3, unit: 'comidas', xpReward: 50, color: '#10B981' },
    { id: 'drink_water_2500', title: 'Toma 2.5L de agua', description: 'Supera tu meta de hidratacion', icon: 'water-outline', target: 2500, unit: 'ml', xpReward: 40, color: '#3B82F6' },
    { id: 'protein_120', title: 'Come 120g de proteina', description: 'Alcanza 120g de proteina hoy', icon: 'barbell-outline', target: 120, unit: 'g', xpReward: 50, color: '#EF4444' },
  ],
  // Set 2
  [
    { id: 'log_meals_4', title: 'Registra 4 comidas', description: 'Incluye un snack saludable', icon: 'restaurant-outline', target: 4, unit: 'comidas', xpReward: 60, color: '#10B981' },
    { id: 'drink_water', title: 'Toma 2L de agua', description: 'Alcanza tu meta de hidratacion', icon: 'water-outline', target: 2000, unit: 'ml', xpReward: 30, color: '#3B82F6' },
    { id: 'protein_100', title: 'Come 100g de proteina', description: 'Alcanza 100g de proteina hoy', icon: 'barbell-outline', target: 100, unit: 'g', xpReward: 40, color: '#EF4444' },
  ],
  // Set 3
  [
    { id: 'log_meals', title: 'Registra todas tus comidas', description: 'Registra al menos 3 comidas hoy', icon: 'restaurant-outline', target: 3, unit: 'comidas', xpReward: 50, color: '#10B981' },
    { id: 'drink_water_3000', title: 'Toma 3L de agua', description: 'Hidratacion maxima hoy', icon: 'water-outline', target: 3000, unit: 'ml', xpReward: 50, color: '#3B82F6' },
    { id: 'protein_100', title: 'Come 100g de proteina', description: 'Alcanza 100g de proteina hoy', icon: 'barbell-outline', target: 100, unit: 'g', xpReward: 40, color: '#EF4444' },
  ],
  // Set 4
  [
    { id: 'log_meals', title: 'Registra todas tus comidas', description: 'Registra al menos 3 comidas hoy', icon: 'restaurant-outline', target: 3, unit: 'comidas', xpReward: 50, color: '#10B981' },
    { id: 'drink_water', title: 'Toma 2L de agua', description: 'Alcanza tu meta de hidratacion', icon: 'water-outline', target: 2000, unit: 'ml', xpReward: 30, color: '#3B82F6' },
    { id: 'protein_150', title: 'Come 150g de proteina', description: 'Nivel avanzado de proteina', icon: 'barbell-outline', target: 150, unit: 'g', xpReward: 60, color: '#EF4444' },
  ],
  // Set 5
  [
    { id: 'log_meals_4', title: 'Registra 4 comidas', description: 'Incluye un snack saludable', icon: 'restaurant-outline', target: 4, unit: 'comidas', xpReward: 60, color: '#10B981' },
    { id: 'drink_water_2500', title: 'Toma 2.5L de agua', description: 'Supera tu meta de hidratacion', icon: 'water-outline', target: 2500, unit: 'ml', xpReward: 40, color: '#3B82F6' },
    { id: 'protein_120', title: 'Come 120g de proteina', description: 'Alcanza 120g de proteina hoy', icon: 'barbell-outline', target: 120, unit: 'g', xpReward: 50, color: '#EF4444' },
  ],
  // Set 6
  [
    { id: 'log_meals', title: 'Registra todas tus comidas', description: 'Registra al menos 3 comidas hoy', icon: 'restaurant-outline', target: 3, unit: 'comidas', xpReward: 50, color: '#10B981' },
    { id: 'drink_water', title: 'Toma 2L de agua', description: 'Alcanza tu meta de hidratacion', icon: 'water-outline', target: 2000, unit: 'ml', xpReward: 30, color: '#3B82F6' },
    { id: 'protein_100', title: 'Come 100g de proteina', description: 'Alcanza 100g de proteina hoy', icon: 'barbell-outline', target: 100, unit: 'g', xpReward: 40, color: '#EF4444' },
  ],
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function getTodayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function getProgressForChallenge(
  challenge: DailyChallenge,
  mealsLogged: number,
  waterMl: number,
  proteinG: number,
): number {
  if (challenge.id.startsWith('log_meals')) return mealsLogged;
  if (challenge.id.startsWith('drink_water')) return waterMl;
  if (challenge.id.startsWith('protein_')) return proteinG;
  return 0;
}

function formatProgress(current: number, target: number, unit: string): string {
  if (unit === 'ml') {
    const currentL = (current / 1000).toFixed(1);
    const targetL = (target / 1000).toFixed(1);
    return `${currentL}/${targetL}L`;
  }
  return `${Math.round(current)}/${target}${unit === 'g' ? 'g' : ` ${unit}`}`;
}

// ─── Challenge Row ───────────────────────────────────────────────────────────

function ChallengeRow({
  challenge,
  progress,
  colors: c,
  animDelay,
}: {
  challenge: DailyChallenge;
  progress: number;
  colors: ReturnType<typeof useThemeColors>;
  animDelay: number;
}) {
  const completed = progress >= challenge.target;
  const pct = Math.min(progress / challenge.target, 1);

  const progressBarAnim = useRef(new Animated.Value(0)).current;
  const rowFadeAnim = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(rowFadeAnim, {
        toValue: 1,
        duration: 400,
        delay: animDelay,
        useNativeDriver: true,
      }),
      Animated.timing(progressBarAnim, {
        toValue: pct,
        duration: 700,
        delay: animDelay + 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start();
  }, []);

  // Animate progress changes
  useEffect(() => {
    Animated.timing(progressBarAnim, {
      toValue: pct,
      duration: 500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [pct]);

  // Checkmark pop on completion
  useEffect(() => {
    if (completed) {
      Animated.spring(checkScale, {
        toValue: 1,
        friction: 4,
        tension: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [completed]);

  const barWidth = progressBarAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View style={[styles.challengeRow, { opacity: rowFadeAnim }]}>
      <View style={styles.challengeTop}>
        <View
          style={[
            styles.challengeIcon,
            { backgroundColor: (completed ? c.success : challenge.color) + '15' },
          ]}
        >
          {completed ? (
            <Animated.View style={{ transform: [{ scale: checkScale }] }}>
              <Ionicons name="checkmark-circle" size={20} color={c.success} />
            </Animated.View>
          ) : (
            <Ionicons name={challenge.icon as any} size={20} color={challenge.color} />
          )}
        </View>
        <View style={styles.challengeInfo}>
          <Text
            style={[
              styles.challengeTitle,
              { color: c.black },
              completed && { textDecorationLine: 'line-through', color: c.gray },
            ]}
            numberOfLines={1}
          >
            {challenge.title}
          </Text>
          <Text style={[styles.challengeDesc, { color: c.gray }]} numberOfLines={1}>
            {challenge.description}
          </Text>
        </View>
        <View
          style={[
            styles.xpBadge,
            { backgroundColor: (completed ? c.success : c.accent) + '15' },
          ]}
        >
          <Text style={[styles.xpText, { color: completed ? c.success : c.accent }]}>
            +{challenge.xpReward}
          </Text>
          <Text style={[styles.xpUnit, { color: completed ? c.success : c.gray }]}>
            XP
          </Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.progressRow}>
        <View style={[styles.progressBarBg, { backgroundColor: c.surfaceAlt }]}>
          <Animated.View
            style={[
              styles.progressBarFill,
              {
                width: barWidth,
                backgroundColor: completed ? c.success : challenge.color,
              },
            ]}
          />
        </View>
        <Text
          style={[
            styles.progressLabel,
            { color: completed ? c.success : c.gray },
          ]}
        >
          {formatProgress(progress, challenge.target, challenge.unit)}
        </Text>
      </View>
    </Animated.View>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

function DailyChallengesInner({
  mealsLogged,
  waterMl,
  proteinG,
}: DailyChallengesProps) {
  const c = useThemeColors();
  const { track } = useAnalytics();

  const [totalXp, setTotalXp] = useState(0);
  const [confettiTrigger, setConfettiTrigger] = useState(false);
  const [hasAwardedToday, setHasAwardedToday] = useState(false);

  // Entrance animation
  const containerFade = useRef(new Animated.Value(0)).current;
  const containerSlide = useRef(new Animated.Value(12)).current;

  // Select today's challenge set
  const dayIndex = getDayOfYear();
  const todayKey = getTodayKey();
  const challenges = useMemo(
    () => CHALLENGE_SETS[dayIndex % CHALLENGE_SETS.length],
    [dayIndex],
  );

  // Compute progress for each challenge
  const progressValues = useMemo(
    () =>
      challenges.map((ch) =>
        getProgressForChallenge(ch, mealsLogged, waterMl, proteinG),
      ),
    [challenges, mealsLogged, waterMl, proteinG],
  );

  const completedCount = useMemo(
    () =>
      challenges.filter((ch, i) => progressValues[i] >= ch.target).length,
    [challenges, progressValues],
  );

  const allCompleted = completedCount === challenges.length;

  // Load persisted XP
  useEffect(() => {
    (async () => {
      try {
        const savedXp = await AsyncStorage.getItem(STORAGE_XP);
        if (savedXp) setTotalXp(parseInt(savedXp, 10) || 0);

        const lastDate = await AsyncStorage.getItem(STORAGE_LAST_COMPLETED_DATE);
        if (lastDate === todayKey) setHasAwardedToday(true);
      } catch {
        // Non-critical
      }
    })();
  }, [todayKey]);

  // Entrance animation
  useEffect(() => {
    Animated.parallel([
      Animated.timing(containerFade, {
        toValue: 1,
        duration: 450,
        useNativeDriver: true,
      }),
      Animated.timing(containerSlide, {
        toValue: 0,
        duration: 450,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Award XP + confetti when all 3 completed
  const awardXp = useCallback(async () => {
    if (!allCompleted || hasAwardedToday) return;

    const earned = challenges.reduce((sum, ch) => sum + ch.xpReward, 0);
    const newTotal = totalXp + earned;

    setTotalXp(newTotal);
    setHasAwardedToday(true);
    setConfettiTrigger(true);
    haptics.success();

    track('daily_challenges_all_completed', {
      xp_earned: earned,
      total_xp: newTotal,
      date: todayKey,
    });

    try {
      await AsyncStorage.setItem(STORAGE_XP, String(newTotal));
      await AsyncStorage.setItem(STORAGE_LAST_COMPLETED_DATE, todayKey);
    } catch {
      // Non-critical
    }

    // Reset confetti trigger after animation
    setTimeout(() => setConfettiTrigger(false), 3500);
  }, [allCompleted, hasAwardedToday, challenges, totalXp, todayKey, track]);

  useEffect(() => {
    awardXp();
  }, [awardXp]);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: c.surface,
          borderColor: c.grayLight,
          opacity: containerFade,
          transform: [{ translateY: containerSlide }],
        },
      ]}
    >
      {/* Confetti overlay */}
      <ConfettiEffect trigger={confettiTrigger} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="flash" size={18} color={c.accent} />
          <Text style={[styles.headerTitle, { color: c.black }]}>
            Desafios del dia
          </Text>
        </View>
        <View style={[styles.xpTotal, { backgroundColor: c.surfaceAlt }]}>
          <Text style={[styles.xpTotalText, { color: c.accent }]}>
            {totalXp.toLocaleString()} XP
          </Text>
        </View>
      </View>

      {/* Completion indicator */}
      <View style={styles.completionRow}>
        {challenges.map((_, i) => (
          <View
            key={i}
            style={[
              styles.completionDot,
              {
                backgroundColor:
                  progressValues[i] >= challenges[i].target
                    ? c.success
                    : c.surfaceAlt,
              },
            ]}
          />
        ))}
        <Text style={[styles.completionText, { color: c.gray }]}>
          {completedCount}/{challenges.length} completados
        </Text>
      </View>

      {/* Challenge rows */}
      {challenges.map((challenge, index) => (
        <ChallengeRow
          key={`${todayKey}-${challenge.id}`}
          challenge={challenge}
          progress={progressValues[index]}
          colors={c}
          animDelay={index * 100}
        />
      ))}

      {/* All completed celebration message */}
      {allCompleted && (
        <View style={[styles.celebrationBanner, { backgroundColor: c.success + '10' }]}>
          <Ionicons name="trophy" size={18} color={c.success} />
          <Text style={[styles.celebrationText, { color: c.success }]}>
            Todos los desafios completados. +{challenges.reduce((s, ch) => s + ch.xpReward, 0)} XP
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

export default React.memo(DailyChallengesInner);

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  headerTitle: {
    ...typography.label,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  xpTotal: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  xpTotalText: {
    ...typography.caption,
    fontWeight: '700',
  },

  // Completion indicator
  completionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  completionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  completionText: {
    ...typography.caption,
    marginLeft: spacing.xs,
  },

  // Challenge row
  challengeRow: {
    marginBottom: spacing.sm + 2,
  },
  challengeTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  challengeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  challengeInfo: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  challengeTitle: {
    ...typography.bodyMd,
    fontSize: 14,
  },
  challengeDesc: {
    ...typography.caption,
    fontSize: 11,
    marginTop: 1,
  },
  xpBadge: {
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    minWidth: 44,
  },
  xpText: {
    fontSize: 12,
    fontWeight: '700',
  },
  xpUnit: {
    fontSize: 9,
    fontWeight: '600',
  },

  // Progress bar
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs + 2,
    marginLeft: 36 + spacing.sm,
    gap: spacing.sm,
  },
  progressBarBg: {
    flex: 1,
    height: 5,
    borderRadius: 2.5,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 5,
    borderRadius: 2.5,
  },
  progressLabel: {
    ...typography.caption,
    fontWeight: '600',
    minWidth: 60,
    textAlign: 'right',
    fontSize: 11,
  },

  // Celebration
  celebrationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    marginTop: spacing.xs,
  },
  celebrationText: {
    ...typography.caption,
    fontWeight: '700',
    flex: 1,
  },
});
