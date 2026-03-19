import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Circle, Line, Text as SvgText } from 'react-native-svg';
import { colors, typography, spacing, useLayout } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { useOnboarding } from '../../context/OnboardingContext';
import { StepProps } from './OnboardingNavigator';

const CHART_HEIGHT = 200;
const MONTHS = ['Ahora', '1 Mes', '3 Meses', '5 Meses'];

// Generates a smooth bezier path through points
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx = (prev.x + curr.x) / 2;
    d += ` C ${cpx} ${prev.y}, ${cpx} ${curr.y}, ${curr.x} ${curr.y}`;
  }
  return d;
}

export default function Step18ProgressChart({ onNext, onBack, step, totalSteps }: StepProps) {
  const { data } = useOnboarding();
  const { innerWidth } = useLayout();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  const chartWidth = innerWidth - spacing.lg * 2;
  const isLose = data.goal === 'lose';
  const startWeight = data.weightKg;
  const endWeight = data.targetWeightKg;
  const isImperial = data.unitSystem === 'imperial';

  const toDisplay = (kg: number) => isImperial ? Math.round(kg * 2.20462) : Math.round(kg);
  const unit = isImperial ? 'lb' : 'kg';

  // Y positions: start high (heavy) for lose, start low for gain
  const xs = MONTHS.map((_, i) => (i / (MONTHS.length - 1)) * chartWidth);
  const yStart = isLose ? CHART_HEIGHT * 0.15 : CHART_HEIGHT * 0.85;
  const yEnd   = isLose ? CHART_HEIGHT * 0.85 : CHART_HEIGHT * 0.15;
  const ys = MONTHS.map((_, i) => yStart + (yEnd - yStart) * (i / (MONTHS.length - 1)));

  const points = xs.map((x, i) => ({ x, y: ys[i] }));
  const linePath = smoothPath(points);

  // Area path (under the curve)
  const areaPath = linePath + ` L ${xs[xs.length - 1]} ${CHART_HEIGHT} L ${xs[0]} ${CHART_HEIGHT} Z`;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(progressAnim, { toValue: 1, duration: 1000, delay: 300, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <OnboardingLayout
      step={step}
      totalSteps={totalSteps}
      onBack={onBack}
      footer={<PrimaryButton label="Continuar" onPress={onNext} />}
    >
      <Text style={styles.title}>Tu camino{'\n'}personalizado</Text>

      <Animated.View style={[styles.card, { opacity: fadeAnim }]}>
        {/* Weight labels */}
        <View style={styles.weightRow}>
          <View>
            <Text style={styles.weightLabel}>Actual</Text>
            <Text style={styles.weightValue}>{toDisplay(startWeight)} {unit}</Text>
          </View>
          <View style={styles.arrowContainer}>
            <Text style={styles.arrow}>{isLose ? '↓' : '↑'}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.weightLabel}>Meta</Text>
            <Text style={[styles.weightValue, { color: colors.accent }]}>{toDisplay(endWeight)} {unit}</Text>
          </View>
        </View>

        {/* Chart */}
        <Svg width={chartWidth} height={CHART_HEIGHT + 20}>
          <Defs>
            <LinearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={colors.accent} stopOpacity="0.3" />
              <Stop offset="100%" stopColor={colors.accent} stopOpacity="0.02" />
            </LinearGradient>
          </Defs>

          {/* Grid lines */}
          {[0.25, 0.5, 0.75].map((r, i) => (
            <Line
              key={i}
              x1={0} y1={CHART_HEIGHT * r}
              x2={chartWidth} y2={CHART_HEIGHT * r}
              stroke={colors.grayLight} strokeWidth={1} strokeDasharray="4,4"
            />
          ))}

          {/* Area fill */}
          <Path d={areaPath} fill="url(#areaGradient)" />

          {/* Line */}
          <Path d={linePath} stroke={colors.accent} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />

          {/* Data points */}
          {points.map((p, i) => (
            <Circle key={i} cx={p.x} cy={p.y} r={i === 0 || i === points.length - 1 ? 6 : 4}
              fill={i === points.length - 1 ? colors.accent : colors.white}
              stroke={colors.accent} strokeWidth={2}
            />
          ))}

          {/* Month labels */}
          {MONTHS.map((m, i) => (
            <SvgText key={i} x={xs[i]} y={CHART_HEIGHT + 16} textAnchor="middle"
              fontSize={11} fill={colors.gray}
            >
              {m}
            </SvgText>
          ))}
        </Svg>

        <Text style={styles.caption}>
          Según tu objetivo y ritmo, podrías alcanzar tu peso ideal en 3–5 meses.
        </Text>
      </Animated.View>
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, color: colors.black, marginTop: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  weightRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  weightLabel: { ...typography.caption, color: colors.gray },
  weightValue: { fontSize: 22, fontWeight: '800', color: colors.black, letterSpacing: -0.5 },
  arrowContainer: {
    width: 40, height: 40,
    borderRadius: 20,
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrow: { fontSize: 20, color: colors.accent },
  caption: { ...typography.caption, color: colors.gray, textAlign: 'center', lineHeight: 18 },
});
