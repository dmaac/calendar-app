import React, { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import Svg, { Path, Circle, Line } from 'react-native-svg';
import { colors, typography, spacing, useLayout } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { StepProps } from './OnboardingNavigator';

/** Animated counter that counts from 0 to target */
function AnimatedCounter({ target, suffix = '', style }: { target: number; suffix?: string; style: any }) {
  const anim = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: target,
      duration: 1200,
      delay: 600,
      useNativeDriver: false,
    }).start();
    const id = anim.addListener(({ value }) => setDisplay(Math.round(value)));
    return () => anim.removeListener(id);
  }, [target]);

  return <Text style={style}>{display}{suffix}</Text>;
}

export default function Step07SocialProof({ onNext, onBack, step, totalSteps, onSkip }: StepProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  }, []);

  return (
    <OnboardingLayout
      step={step}
      totalSteps={totalSteps}
      onBack={onBack}
      onSkip={onSkip}
      footer={<PrimaryButton label="Continuar" onPress={onNext} />}
    >
      <Text style={styles.title}>Resultados que{'\n'}duran en el tiempo</Text>
      <Text style={styles.subtitle}>
        Nuestro enfoque basado en IA supera a las dietas tradicionales.
      </Text>

      <Animated.View style={{ opacity: fadeAnim, marginTop: spacing.xl }}>
        <ChartCard />
      </Animated.View>
    </OnboardingLayout>
  );
}

function ChartCard() {
  const { innerWidth } = useLayout();
  const cw = innerWidth - spacing.md * 2;
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

  // Estimate path lengths for stroke animation
  const pathLength = (pts: [number, number][]) => {
    let len = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = toX(pts[i][0]) - toX(pts[i - 1][0]);
      const dy = toY(pts[i][1]) - toY(pts[i - 1][1]);
      len += Math.sqrt(dx * dx + dy * dy);
    }
    return Math.ceil(len);
  };

  const appLen = pathLength(appPts);
  const tradLen = pathLength(tradPts);

  // Animated progressive drawing
  const appDraw = useRef(new Animated.Value(0)).current;
  const tradDraw = useRef(new Animated.Value(0)).current;
  const dotOpacity = useRef(new Animated.Value(0)).current;

  const [appOffset, setAppOffset] = useState(appLen);
  const [tradOffset, setTradOffset] = useState(tradLen);

  useEffect(() => {
    // Draw traditional line first, then app line
    Animated.sequence([
      Animated.timing(tradDraw, {
        toValue: 1,
        duration: 800,
        delay: 400,
        useNativeDriver: false,
      }),
      Animated.timing(appDraw, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: false,
      }),
      Animated.timing(dotOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: false,
      }),
    ]).start();

    const tradId = tradDraw.addListener(({ value }) => setTradOffset(tradLen * (1 - value)));
    const appId = appDraw.addListener(({ value }) => setAppOffset(appLen * (1 - value)));
    return () => {
      tradDraw.removeListener(tradId);
      appDraw.removeListener(appId);
    };
  }, []);

  return (
    <View
      style={styles.card}
      accessibilityLabel="Grafico comparativo: nuestra app versus dieta tradicional. El 80% de los usuarios mantiene su perdida de peso 6 meses despues."
      accessibilityRole="image"
    >
      <Text style={styles.cardTitle}>Tu peso</Text>

      <Svg width={cw} height={ch}>
        {/* Baseline */}
        <Line x1={pad.l} y1={ch - pad.b} x2={cw - pad.r} y2={ch - pad.b} stroke={colors.grayLight} strokeWidth={1} />

        {/* Traditional diet line (accent/dashed) — drawn progressively */}
        <Path
          d={tradPath}
          stroke={colors.accent}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={`${tradLen}`}
          strokeDashoffset={tradOffset}
        />

        {/* App line (black) — drawn progressively */}
        <Path
          d={appPath}
          stroke={colors.black}
          strokeWidth={2.5}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={`${appLen}`}
          strokeDashoffset={appOffset}
        />

        {/* Start dot */}
        <Circle cx={toX(0)} cy={toY(0.82)} r={5} fill={colors.white} stroke={colors.black} strokeWidth={2} />
        {/* End dot app — appears after lines draw */}
        <Circle
          cx={toX(1)} cy={toY(0.10)} r={5}
          fill={colors.white} stroke={colors.black} strokeWidth={2}
          opacity={appOffset < 5 ? 1 : 0}
        />
      </Svg>

      {/* X axis labels */}
      <View style={styles.xLabels}>
        <Text style={styles.xLabel}>Mes 1</Text>
        <Text style={styles.xLabel}>Mes 6</Text>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, { backgroundColor: colors.black }]} />
          <Text style={styles.legendText}>Nuestra app</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, { backgroundColor: colors.accent }]} />
          <Text style={styles.legendText}>Dieta tradicional</Text>
        </View>
      </View>

      {/* Stat box with animated counter */}
      <View style={styles.statBox}>
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'baseline' }}>
          <AnimatedCounter target={80} suffix="%" style={styles.statNumber} />
          <Text style={styles.statText}> de nuestros usuarios mantiene su perdida de peso 6 meses despues</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, color: colors.black, marginTop: spacing.md },
  subtitle: { ...typography.subtitle, color: colors.gray, marginTop: spacing.sm },
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
  statNumber: { fontSize: 20, fontWeight: '800', color: colors.black },
  statText: { ...typography.caption, color: colors.black, lineHeight: 18, flex: 1 },
});
