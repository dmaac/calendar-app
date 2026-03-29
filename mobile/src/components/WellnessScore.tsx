/**
 * WellnessScore -- Holistic wellness score 0-100 combining multiple health pillars
 *
 * Composite score breakdown:
 *   1. NutriScore (30%): macro adherence, fiber, hydration, food variety
 *   2. Exercise (25%): activity minutes or active calories vs daily target
 *   3. Hydration (20%): water ml consumed vs personalized goal
 *   4. Sleep (15%): duration quality from SleepTracker data
 *   5. Streak (10%): consecutive logging days (consistency)
 *
 * Visual:
 *   - Large circular ring with the total score centered
 *   - Breakdown pillars shown as labeled segments below
 *   - Trend arrow comparing today vs yesterday (improving/worsening)
 *
 * This component reads sleep data from AsyncStorage (shared with SleepTracker)
 * and computes everything client-side for instant feedback.
 */
import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useThemeColors, typography, spacing, radius, shadows } from '../theme';

// ─── Constants ──────────────────────────────────────────────────────────────

const SLEEP_HISTORY_KEY = '@fitsi_sleep_history';
const WELLNESS_YESTERDAY_KEY = '@fitsi_wellness_yesterday';

const RING_SIZE = 120;
const RING_STROKE = 10;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = RING_RADIUS * 2 * Math.PI;

// ─── Types ──────────────────────────────────────────────────────────────────

interface WellnessScoreProps {
  /** NutriScore value 0-100 (from NutriScore component calculation) */
  nutriScore: number;
  /** Exercise score 0-100. Can be derived from active calories vs target,
   *  or workout minutes vs recommended 30 min/day */
  exerciseScore: number;
  /** Water ml consumed today */
  waterMl: number;
  /** Water goal in ml */
  waterGoal: number;
  /** Current streak in consecutive days */
  streakDays: number;
  /** Maximum streak to normalize against (default: 30 days) */
  maxStreak?: number;
}

interface SleepRecord {
  date: string;
  bedtime: string;
  wakeTime: string;
  durationHours: number;
  quality: number;
}

// ─── Pillar definitions ─────────────────────────────────────────────────────

interface PillarData {
  key: string;
  label: string;
  icon: string;
  weight: number;
  score: number;
  color: string;
}

// ─── Score calculations (pure) ──────────────────────────────────────────────

function hydrationScore(waterMl: number, goal: number): number {
  if (goal <= 0) return 100;
  return Math.round(Math.min(100, (waterMl / goal) * 100));
}

function streakScore(days: number, maxDays: number): number {
  if (maxDays <= 0) return 0;
  return Math.round(Math.min(100, (days / maxDays) * 100));
}

function getScoreColor(score: number): string {
  if (score >= 70) return '#10B981';
  if (score >= 40) return '#F59E0B';
  return '#EF4444';
}

function getScoreLabel(score: number): string {
  if (score >= 80) return 'Excelente';
  if (score >= 60) return 'Muy bien';
  if (score >= 40) return 'En progreso';
  return 'Necesita atencion';
}

function getTrendIcon(
  today: number,
  yesterday: number | null,
): { icon: string; color: string; label: string } {
  if (yesterday === null) {
    return { icon: 'remove-outline', color: '#9CA3AF', label: 'Sin datos de ayer' };
  }
  const diff = today - yesterday;
  if (diff > 3) {
    return { icon: 'trending-up', color: '#10B981', label: `Mejorando (+${diff})` };
  }
  if (diff < -3) {
    return { icon: 'trending-down', color: '#EF4444', label: `Bajando (${diff})` };
  }
  return { icon: 'remove-outline', color: '#F59E0B', label: 'Estable' };
}

// ─── Animated SVG ───────────────────────────────────────────────────────────

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ─── Pillar Bar ─────────────────────────────────────────────────────────────

const PillarBar = React.memo(function PillarBar({
  pillar,
  index,
  themeColors: c,
}: {
  pillar: PillarData;
  index: number;
  themeColors: ReturnType<typeof useThemeColors>;
}) {
  const fillAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fillAnim.setValue(0);
    Animated.timing(fillAnim, {
      toValue: Math.min(pillar.score / 100, 1),
      duration: 700,
      delay: 300 + index * 80,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [pillar.score]);

  const width = fillAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View
      style={pillarStyles.row}
      accessibilityLabel={`${pillar.label}: ${pillar.score} por ciento, peso ${Math.round(pillar.weight * 100)} por ciento`}
    >
      <View style={pillarStyles.labelCol}>
        <Ionicons name={pillar.icon as any} size={13} color={pillar.color} />
        <Text style={[pillarStyles.label, { color: c.gray }]}>
          {pillar.label}
        </Text>
      </View>
      <View style={pillarStyles.barCol}>
        <View style={[pillarStyles.track, { backgroundColor: c.grayLight }]}>
          <Animated.View
            style={[
              pillarStyles.fill,
              {
                width: width as any,
                backgroundColor: pillar.color,
              },
            ]}
          />
        </View>
      </View>
      <Text style={[pillarStyles.value, { color: c.black }]}>
        {pillar.score}
      </Text>
    </View>
  );
});

// ─── Main Component ─────────────────────────────────────────────────────────

export default function WellnessScore({
  nutriScore,
  exerciseScore,
  waterMl,
  waterGoal,
  streakDays,
  maxStreak = 30,
}: WellnessScoreProps) {
  const c = useThemeColors();
  const [sleepQuality, setSleepQuality] = useState(0);
  const [yesterdayScore, setYesterdayScore] = useState<number | null>(null);

  // ─── Load sleep data from shared AsyncStorage ──────────────────────

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(SLEEP_HISTORY_KEY),
      AsyncStorage.getItem(WELLNESS_YESTERDAY_KEY),
    ]).then(([sleepRaw, yesterdayRaw]) => {
      if (sleepRaw) {
        try {
          const records = JSON.parse(sleepRaw) as SleepRecord[];
          const today = new Date().toISOString().split('T')[0];
          const todayRecord = records.find((r) => r.date === today);
          if (todayRecord) {
            setSleepQuality(todayRecord.quality);
          }
        } catch {
          // Corrupted -- sleep quality stays at 0
        }
      }
      if (yesterdayRaw) {
        try {
          const parsed = JSON.parse(yesterdayRaw) as {
            date: string;
            score: number;
          };
          // Only use if it's actually yesterday
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayISO = yesterday.toISOString().split('T')[0];
          if (parsed.date === yesterdayISO) {
            setYesterdayScore(parsed.score);
          }
        } catch {
          // No yesterday data
        }
      }
    });
  }, []);

  // ─── Calculate pillar scores ──────────────────────────────────────

  const hydration = useMemo(
    () => hydrationScore(waterMl, waterGoal),
    [waterMl, waterGoal],
  );

  const streak = useMemo(
    () => streakScore(streakDays, maxStreak),
    [streakDays, maxStreak],
  );

  const pillars: PillarData[] = useMemo(
    () => [
      {
        key: 'nutri',
        label: 'Nutricion',
        icon: 'leaf-outline',
        weight: 0.3,
        score: nutriScore,
        color: '#10B981',
      },
      {
        key: 'exercise',
        label: 'Ejercicio',
        icon: 'barbell-outline',
        weight: 0.25,
        score: exerciseScore,
        color: '#F59E0B',
      },
      {
        key: 'water',
        label: 'Hidratacion',
        icon: 'water-outline',
        weight: 0.2,
        score: hydration,
        color: '#4FC3F7',
      },
      {
        key: 'sleep',
        label: 'Sueno',
        icon: 'moon-outline',
        weight: 0.15,
        score: sleepQuality,
        color: '#7C3AED',
      },
      {
        key: 'streak',
        label: 'Constancia',
        icon: 'flame-outline',
        weight: 0.1,
        score: streak,
        color: '#EC4899',
      },
    ],
    [nutriScore, exerciseScore, hydration, sleepQuality, streak],
  );

  // ─── Composite score ──────────────────────────────────────────────

  const totalScore = useMemo(() => {
    const raw = pillars.reduce((sum, p) => sum + p.score * p.weight, 0);
    return Math.round(Math.max(0, Math.min(100, raw)));
  }, [pillars]);

  // ─── Persist today's score for tomorrow's comparison ──────────────

  useEffect(() => {
    if (totalScore > 0) {
      const today = new Date().toISOString().split('T')[0];
      AsyncStorage.setItem(
        WELLNESS_YESTERDAY_KEY,
        JSON.stringify({ date: today, score: totalScore }),
      ).catch(() => {});
    }
  }, [totalScore]);

  // ─── Trend ────────────────────────────────────────────────────────

  const trend = useMemo(
    () => getTrendIcon(totalScore, yesterdayScore),
    [totalScore, yesterdayScore],
  );

  // ─── Score color + label ──────────────────────────────────────────

  const scoreColor = getScoreColor(totalScore);
  const scoreLabel = getScoreLabel(totalScore);
  const progress = totalScore / 100;

  // ─── Animated ring fill ───────────────────────────────────────────

  const animProgress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    animProgress.setValue(0);
    Animated.timing(animProgress, {
      toValue: progress,
      duration: 1000,
      delay: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const strokeDashoffset = animProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [RING_CIRCUMFERENCE, 0],
    extrapolate: 'clamp',
  });

  // ─── Animated score number ────────────────────────────────────────

  const animScore = useRef(new Animated.Value(0)).current;
  const [displayScore, setDisplayScore] = useState(0);

  useEffect(() => {
    animScore.setValue(0);
    const listener = animScore.addListener(({ value }) => {
      setDisplayScore(Math.round(value));
    });
    Animated.timing(animScore, {
      toValue: totalScore,
      duration: 1000,
      delay: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => animScore.removeListener(listener);
  }, [totalScore]);

  return (
    <View
      style={[s.card, { backgroundColor: c.surface, borderColor: c.grayLight }]}
      accessibilityLabel={`Wellness Score: ${totalScore} de 100. ${scoreLabel}. ${trend.label}`}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(totalScore) }}
    >
      {/* Top row: ring + info */}
      <View style={s.topRow}>
        {/* Ring */}
        <View style={s.ringWrap}>
          <Svg width={RING_SIZE} height={RING_SIZE}>
            {/* Track */}
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              stroke={c.grayLight}
              strokeWidth={RING_STROKE}
              fill="none"
            />
            {/* Animated fill */}
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
          {/* Center number */}
          <View style={s.ringCenter}>
            <Text style={[s.scoreNumber, { color: scoreColor }]}>
              {displayScore}
            </Text>
            <Text style={[s.scoreMax, { color: c.gray }]}>/100</Text>
          </View>
        </View>

        {/* Right: title + label + trend */}
        <View style={s.infoCol}>
          <View style={s.headerRow}>
            <Ionicons name="heart-circle" size={18} color={scoreColor} />
            <Text style={[s.title, { color: c.black }]}>Wellness Score</Text>
          </View>
          <Text style={[s.label, { color: scoreColor }]}>{scoreLabel}</Text>

          {/* Trend arrow */}
          <View style={s.trendRow}>
            <Ionicons
              name={trend.icon as any}
              size={16}
              color={trend.color}
            />
            <Text style={[s.trendText, { color: trend.color }]}>
              {trend.label}
            </Text>
          </View>
        </View>
      </View>

      {/* Pillar breakdown */}
      <View style={[s.pillarsSection, { borderTopColor: c.grayLight }]}>
        {pillars.map((pillar, index) => (
          <PillarBar
            key={pillar.key}
            pillar={pillar}
            index={index}
            themeColors={c}
          />
        ))}
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
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
  scoreNumber: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -1,
  },
  scoreMax: {
    ...typography.caption,
    marginTop: -2,
  },
  infoCol: {
    flex: 1,
    gap: 3,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  title: {
    ...typography.label,
    fontWeight: '700',
  },
  label: {
    ...typography.caption,
    fontWeight: '600',
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
  },
  trendText: {
    ...typography.caption,
    fontWeight: '600',
    fontSize: 11,
  },
  pillarsSection: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    gap: 6,
  },
});

const pillarStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  labelCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    width: 100,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
  },
  barCol: {
    flex: 1,
  },
  track: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: 5,
    borderRadius: 3,
  },
  value: {
    fontSize: 11,
    fontWeight: '700',
    width: 24,
    textAlign: 'right',
  },
});
