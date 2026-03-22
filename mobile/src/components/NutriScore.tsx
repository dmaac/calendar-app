/**
 * NutriScore -- Score holistico 0-100 de calidad nutricional diaria
 *
 * Calcula un puntaje compuesto basado en:
 *   1. Adherencia a macros (40%): que tan cerca estan P/C/G del objetivo
 *   2. Fibra (20%): >= 25g/dia = 100%
 *   3. Hidratacion (20%): ml consumidos vs 2500ml meta
 *   4. Variedad de comidas (20%): >= 4 comidas distintas = 100%
 *
 * Colores:
 *   < 40  rojo   (#EF4444)
 *   40-70 amarillo (#F59E0B)
 *   > 70  verde  (#10B981)
 */
import React, { useRef, useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius, shadows } from '../theme';

// ---- Types ----------------------------------------------------------------

interface NutriScoreGoals {
  target_calories: number;
  target_protein_g: number;
  target_carbs_g: number;
  target_fats_g: number;
}

interface NutriScoreProps {
  /** Total calories consumed today */
  calories: number;
  /** Grams of protein consumed */
  protein: number;
  /** Grams of carbs consumed */
  carbs: number;
  /** Grams of fat consumed */
  fat: number;
  /** Grams of fiber consumed (null/undefined treated as 0) */
  fiber?: number | null;
  /** Milliliters of water consumed */
  water?: number;
  /** Number of distinct foods logged today */
  foodVariety?: number;
  /** User's daily macro targets */
  goals: NutriScoreGoals;
  /** Optional water goal in ml. Default 2500. */
  waterGoal?: number;
}

// ---- Score calculation (pure functions) ------------------------------------

/**
 * Macro adherence sub-score (0-100).
 * For each macro: score = 100 - abs(actual - target) / target * 100
 * Clamped to [0, 100]. Weighted average of protein (40%), carbs (30%), fat (30%).
 */
function macroScore(
  protein: number, carbs: number, fat: number,
  goals: NutriScoreGoals,
): number {
  const score = (actual: number, target: number) => {
    if (target <= 0) return 100;
    const deviation = Math.abs(actual - target) / target;
    return Math.max(0, Math.min(100, (1 - deviation) * 100));
  };
  const pScore = score(protein, goals.target_protein_g);
  const cScore = score(carbs, goals.target_carbs_g);
  const fScore = score(fat, goals.target_fats_g);
  return pScore * 0.4 + cScore * 0.3 + fScore * 0.3;
}

/** Fiber sub-score: 25g = 100%. Linear. */
function fiberScore(fiber: number): number {
  const FIBER_GOAL = 25;
  return Math.min(100, (fiber / FIBER_GOAL) * 100);
}

/** Hydration sub-score: linear up to goal. */
function hydrationScore(water: number, goal: number): number {
  if (goal <= 0) return 100;
  return Math.min(100, (water / goal) * 100);
}

/** Variety sub-score: 4+ distinct foods = 100%. */
function varietyScore(count: number): number {
  const VARIETY_GOAL = 4;
  return Math.min(100, (count / VARIETY_GOAL) * 100);
}

/** Composite NutriScore 0-100 */
function calculateNutriScore(props: NutriScoreProps): number {
  const macro = macroScore(props.protein, props.carbs, props.fat, props.goals);
  const fiber = fiberScore(props.fiber ?? 0);
  const hydration = hydrationScore(props.water ?? 0, props.waterGoal ?? 2500);
  const variety = varietyScore(props.foodVariety ?? 0);

  const composite = macro * 0.4 + fiber * 0.2 + hydration * 0.2 + variety * 0.2;
  return Math.round(Math.max(0, Math.min(100, composite)));
}

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

// ---- Animated SVG bridge ---------------------------------------------------

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ---- Component -------------------------------------------------------------

const RING_SIZE = 100;
const RING_STROKE = 8;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = RING_RADIUS * 2 * Math.PI;

export default function NutriScore(props: NutriScoreProps) {
  const c = useThemeColors();
  const score = useMemo(() => calculateNutriScore(props), [
    props.calories, props.protein, props.carbs, props.fat,
    props.fiber, props.water, props.foodVariety,
    props.goals.target_protein_g, props.goals.target_carbs_g, props.goals.target_fats_g,
    props.waterGoal,
  ]);

  const color = getScoreColor(score);
  const label = getScoreLabel(score);
  const progress = score / 100;

  // Animated ring fill
  const animProgress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    animProgress.setValue(0);
    Animated.timing(animProgress, {
      toValue: progress,
      duration: 900,
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

  // Animated score number
  const animScore = useRef(new Animated.Value(0)).current;
  const [displayScore, setDisplayScore] = useState(0);
  useEffect(() => {
    animScore.setValue(0);
    const listener = animScore.addListener(({ value }) => {
      setDisplayScore(Math.round(value));
    });
    Animated.timing(animScore, {
      toValue: score,
      duration: 900,
      delay: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => animScore.removeListener(listener);
  }, [score]);

  // Sub-score breakdown for the mini indicators
  const macroSc = Math.round(macroScore(props.protein, props.carbs, props.fat, props.goals));
  const fiberSc = Math.round(fiberScore(props.fiber ?? 0));
  const waterSc = Math.round(hydrationScore(props.water ?? 0, props.waterGoal ?? 2500));
  const varietySc = Math.round(varietyScore(props.foodVariety ?? 0));

  return (
    <View
      style={[s.card, { backgroundColor: c.surface, borderColor: c.grayLight }]}
      accessibilityLabel={`NutriScore: ${score} de 100, ${label}`}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(score) }}
    >
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
              stroke={color}
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
            <Text style={[s.scoreNumber, { color }]}>{displayScore}</Text>
            <Text style={[s.scoreMax, { color: c.gray }]}>/100</Text>
          </View>
        </View>

        {/* Right side: label + breakdown */}
        <View style={s.infoCol}>
          <View style={s.headerRow}>
            <Ionicons name="leaf" size={16} color={color} />
            <Text style={[s.title, { color: c.black }]}>NutriScore</Text>
          </View>
          <Text style={[s.label, { color }]}>{label}</Text>

          {/* Mini sub-score indicators */}
          <View style={s.subsCol}>
            <SubIndicator icon="barbell-outline" label="Macros" value={macroSc} colors={c} />
            <SubIndicator icon="leaf-outline" label="Fibra" value={fiberSc} colors={c} />
            <SubIndicator icon="water-outline" label="Agua" value={waterSc} colors={c} />
            <SubIndicator icon="nutrition-outline" label="Variedad" value={varietySc} colors={c} />
          </View>
        </View>
      </View>
    </View>
  );
}

// ---- Sub-indicator (tiny inline bars) --------------------------------------

const SubIndicator = React.memo(function SubIndicator({
  icon,
  label,
  value,
  colors: c,
}: {
  icon: string;
  label: string;
  value: number;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const barColor = getScoreColor(value);
  const fillWidth = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    fillWidth.setValue(0);
    Animated.timing(fillWidth, {
      toValue: Math.min(value / 100, 1),
      duration: 700,
      delay: 400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [value]);

  const width = fillWidth.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View
      style={s.subRow}
      accessibilityLabel={`${label}: ${value} por ciento`}
    >
      <Ionicons name={icon as any} size={11} color={c.gray} />
      <Text style={[s.subLabel, { color: c.gray }]}>{label}</Text>
      <View style={[s.subTrack, { backgroundColor: c.grayLight }]}>
        <Animated.View style={[s.subFill, { width: width as any, backgroundColor: barColor }]} />
      </View>
    </View>
  );
});

// ---- Styles ----------------------------------------------------------------

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
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -1,
  },
  scoreMax: {
    ...typography.caption,
    marginTop: -2,
  },
  infoCol: {
    flex: 1,
    gap: 2,
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
    marginBottom: spacing.xs,
  },
  subsCol: {
    gap: 3,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  subLabel: {
    fontSize: 10,
    fontWeight: '500',
    width: 44,
  },
  subTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  subFill: {
    height: 4,
    borderRadius: 2,
  },
});
