import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import Svg, { Path, Circle, Line, Defs, LinearGradient, Stop } from 'react-native-svg';
import { colors, typography, spacing, useLayout } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { StepProps } from './OnboardingNavigator';

export default function Step07SocialProof({ onNext, onBack, step, totalSteps }: StepProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  }, []);

  return (
    <OnboardingLayout step={step} totalSteps={totalSteps} onBack={onBack}>
      <Text style={styles.title}>Our app creates{'\n'}long-term results</Text>

      <Animated.View style={{ opacity: fadeAnim, marginTop: spacing.xl }}>
        <ChartCard />
      </Animated.View>

      <View style={styles.footer}>
        <PrimaryButton label="Continue" onPress={onNext} />
      </View>
    </OnboardingLayout>
  );
}

function ChartCard() {
  const { innerWidth } = useLayout();
  const cw = innerWidth;
  const ch = 160;
  const pad = { t: 12, b: 28, l: 8, r: 8 };
  const gw = cw - pad.l - pad.r;
  const gh = ch - pad.t - pad.b;

  const toX = (x: number) => pad.l + x * gw;
  const toY = (y: number) => pad.t + (1 - y) * gh;

  // App line: steady improvement (weight goes down = good)
  const appPts: [number, number][] = [[0, 0.82],[0.2, 0.68],[0.4, 0.52],[0.6, 0.38],[0.8, 0.22],[1.0, 0.10]];
  // Traditional: drops then rebounds
  const tradPts: [number, number][] = [[0, 0.82],[0.2, 0.60],[0.4, 0.42],[0.55, 0.45],[0.75, 0.60],[1.0, 0.72]];

  const appPath = appPts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${toX(x).toFixed(1)},${toY(y).toFixed(1)}`).join(' ');
  const tradPath = tradPts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${toX(x).toFixed(1)},${toY(y).toFixed(1)}`).join(' ');

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Your weight</Text>

      <Svg width={cw} height={ch}>
        {/* Baseline */}
        <Line x1={pad.l} y1={ch - pad.b} x2={cw - pad.r} y2={ch - pad.b} stroke={colors.grayLight} strokeWidth={1} />

        {/* Traditional diet line (accent/red) */}
        <Path d={tradPath} stroke={colors.accent} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4,3" />

        {/* App line (black) */}
        <Path d={appPath} stroke={colors.black} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />

        {/* Start dot */}
        <Circle cx={toX(0)} cy={toY(0.82)} r={5} fill={colors.white} stroke={colors.black} strokeWidth={2} />
        {/* End dot app */}
        <Circle cx={toX(1)} cy={toY(0.10)} r={5} fill={colors.white} stroke={colors.black} strokeWidth={2} />
      </Svg>

      {/* X axis labels */}
      <View style={styles.xLabels}>
        <Text style={styles.xLabel}>Month 1</Text>
        <Text style={styles.xLabel}>Month 6</Text>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, { backgroundColor: colors.black }]} />
          <Text style={styles.legendText}>Our app</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, { backgroundColor: colors.accent }]} />
          <Text style={styles.legendText}>Traditional diet</Text>
        </View>
      </View>

      {/* Stat box */}
      <View style={styles.statBox}>
        <Text style={styles.statText}>
          80% of users maintain their weight loss even 6 months later
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, color: colors.black, marginTop: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTitle: { ...typography.bodyMd, color: colors.black },
  xLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -8 },
  xLabel: { ...typography.caption, color: colors.gray },
  legend: { flexDirection: 'row', gap: spacing.lg, marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendLine: { width: 20, height: 2, borderRadius: 1 },
  legendText: { ...typography.caption, color: colors.gray },
  statBox: {
    backgroundColor: colors.bg,
    borderRadius: 10,
    padding: spacing.md,
    marginTop: 4,
  },
  statText: { ...typography.caption, color: colors.black, textAlign: 'center', lineHeight: 18 },
  footer: { position: 'absolute', bottom: spacing.lg, left: spacing.lg, right: spacing.lg },
});
