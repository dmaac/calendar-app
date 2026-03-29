import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity, Easing } from 'react-native';
import Svg, { G, Path, Text as SvgText } from 'react-native-svg';
import { colors, typography, spacing, radius, useLayout, useThemeColors } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { StepProps } from './OnboardingNavigator';
import { haptics } from '../../hooks/useHaptics';
import { useAnalytics } from '../../hooks/useAnalytics';

const SEGMENTS = [
  { label: '20% OFF', color: '#8E8E93' },
  { label: '1 mes gratis', color: '#111111' },
  { label: '50% OFF', color: '#4285F4' },
  { label: 'Otra vez', color: '#E5E5EA' },
  { label: '30% OFF', color: '#4285F4' },
  { label: '10% OFF', color: '#8E8E93' },
  { label: '3 dias gratis', color: '#111111' },
  { label: '40% OFF', color: '#4285F4' },
];

const SEGMENT_ANGLE = (2 * Math.PI) / SEGMENTS.length;
const DEGREES_PER_SEGMENT = 360 / SEGMENTS.length;

// Winning segment is always index 2 (50% OFF first year)
const WINNING_IDX = 2;

function polarToCart(cx: number, cy: number, r: number, angle: number) {
  return {
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  };
}

function buildSegmentPath(idx: number, cx: number, cy: number, r: number): string {
  const startAngle = idx * SEGMENT_ANGLE - Math.PI / 2;
  const endAngle   = startAngle + SEGMENT_ANGLE;
  const start = polarToCart(cx, cy, r, startAngle);
  const end   = polarToCart(cx, cy, r, endAngle);
  const largeArcFlag = SEGMENT_ANGLE > Math.PI ? 1 : 0;
  return [
    `M ${cx} ${cy}`,
    `L ${start.x} ${start.y}`,
    `A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`,
    `Z`,
  ].join(' ');
}

/**
 * Custom easing: strong deceleration that simulates wheel friction.
 * Starts fast, slows dramatically in the last 30% for suspense.
 */
function wheelDeceleration(t: number): number {
  // Combine two curves: fast start + dramatic slow end
  if (t < 0.7) {
    // First 70%: cover 92% of the distance (fast)
    return 0.92 * Easing.out(Easing.quad)(t / 0.7);
  }
  // Last 30%: cover remaining 8% (dramatic slow-down for suspense)
  const tail = (t - 0.7) / 0.3;
  return 0.92 + 0.08 * Easing.out(Easing.cubic)(tail);
}

export default function Step29SpinWheel({ onNext, onBack, step, totalSteps }: StepProps) {
  const { innerWidth } = useLayout();
  const themeColors = useThemeColors();
  const { track } = useAnalytics('SpinWheel');
  const WHEEL_SIZE = Math.min(Math.round(innerWidth * 0.85), 320);
  const WHEEL_CENTER = WHEEL_SIZE / 2;

  const spinAnim = useRef(new Animated.Value(0)).current;
  const resultBannerScale = useRef(new Animated.Value(0)).current;
  const resultBannerOpacity = useRef(new Animated.Value(0)).current;
  const [spun, setSpun] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState('');
  const lastTickSegment = useRef(-1);

  // Haptic ticks: fire a selection haptic each time the wheel crosses a segment boundary
  useEffect(() => {
    if (!spinning) return;
    const listenerId = spinAnim.addListener(({ value }) => {
      const currentSegment = Math.floor(value / DEGREES_PER_SEGMENT);
      if (currentSegment !== lastTickSegment.current) {
        lastTickSegment.current = currentSegment;
        haptics.selection();
      }
    });
    return () => {
      spinAnim.removeListener(listenerId);
    };
  }, [spinning]);

  const handleSpin = () => {
    if (spinning || spun) return;
    setSpinning(true);
    haptics.medium();
    track('spin_wheel_started');
    lastTickSegment.current = -1;

    // Land on winning segment: 50% OFF (index 2)
    const targetOffset = WINNING_IDX * DEGREES_PER_SEGMENT + DEGREES_PER_SEGMENT / 2;
    // 6 full rotations + offset to center on the winning segment
    const targetDeg = 6 * 360 + targetOffset;

    Animated.timing(spinAnim, {
      toValue: targetDeg,
      duration: 4500,
      easing: wheelDeceleration,
      useNativeDriver: true,
    }).start(() => {
      setSpinning(false);
      setSpun(true);
      setResult(SEGMENTS[WINNING_IDX].label);
      haptics.success();
      track('spin_wheel_result', { result: SEGMENTS[WINNING_IDX].label });

      // Animate result banner entrance with a bouncy spring
      resultBannerScale.setValue(0.6);
      resultBannerOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(resultBannerScale, {
          toValue: 1,
          friction: 5,
          tension: 100,
          useNativeDriver: true,
        }),
        Animated.timing(resultBannerOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    });
  };

  const rotate = spinAnim.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <OnboardingLayout
      step={step}
      totalSteps={totalSteps}
      onBack={onBack}
      footer={
        !spun ? (
          <TouchableOpacity
            style={[styles.spinBtn, spinning && styles.spinBtnDisabled]}
            onPress={handleSpin}
            activeOpacity={0.8}
            accessibilityLabel={spinning ? 'Girando la ruleta' : 'Girar la ruleta para obtener un descuento'}
            accessibilityRole="button"
            accessibilityState={{ disabled: spinning }}
          >
            <Text style={styles.spinBtnText}>{spinning ? 'Girando...' : 'GIRAR'}</Text>
          </TouchableOpacity>
        ) : (
          <PrimaryButton label="Reclamar 50% de descuento" onPress={() => { track('spin_wheel_claim'); onNext(); }} />
        )
      }
    >
      <Text style={[styles.title, { color: themeColors.black }]} accessibilityRole="header">
        Gira para desbloquear{'\n'}tu descuento!
      </Text>
      <Text style={[styles.subtitle, { color: themeColors.gray }]}>Un giro por usuario. Buena suerte!</Text>

      <View style={styles.wheelContainer}>
        {/* Pointer */}
        <View style={styles.pointer}>
          <View style={styles.pointerTriangle} />
        </View>

        {/* Wheel */}
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Svg width={WHEEL_SIZE} height={WHEEL_SIZE}>
            {SEGMENTS.map((seg, i) => {
              const midAngle = i * SEGMENT_ANGLE + SEGMENT_ANGLE / 2 - Math.PI / 2;
              const textPos = polarToCart(WHEEL_CENTER, WHEEL_CENTER, WHEEL_CENTER * 0.65, midAngle);
              return (
                <G key={i}>
                  <Path
                    d={buildSegmentPath(i, WHEEL_CENTER, WHEEL_CENTER, WHEEL_CENTER - 4)}
                    fill={seg.color}
                    stroke={colors.white}
                    strokeWidth={2}
                  />
                  <SvgText
                    x={textPos.x}
                    y={textPos.y}
                    textAnchor="middle"
                    alignmentBaseline="middle"
                    fontSize={11}
                    fontWeight="700"
                    fill={seg.color === '#E5E5EA' ? colors.black : colors.white}
                    transform={`rotate(${(i * 360 / SEGMENTS.length) + 180 / SEGMENTS.length}, ${textPos.x}, ${textPos.y})`}
                  >
                    {seg.label}
                  </SvgText>
                </G>
              );
            })}
          </Svg>
        </Animated.View>

        {/* Center cap */}
        <View style={styles.centerCap} />
      </View>

      {spun && result ? (
        <Animated.View
          style={[
            styles.resultBanner,
            { backgroundColor: themeColors.surface },
            {
              transform: [{ scale: resultBannerScale }],
              opacity: resultBannerOpacity,
            },
          ]}
          accessibilityLabel={`Ganaste: ${result} en tu primer a\u00F1o`}
          accessibilityLiveRegion="polite"
        >
          <Text style={styles.resultEmoji}>🎉</Text>
          <Text style={[styles.resultText, { color: themeColors.black }]}>
            Ganaste: <Text style={[styles.resultHighlight, { color: themeColors.accent }]}>{result}</Text> en tu primer a{'\u00F1'}o
          </Text>
        </Animated.View>
      ) : null}
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, color: colors.black, marginTop: spacing.md },
  subtitle: { ...typography.subtitle, color: colors.gray, marginTop: spacing.sm },
  wheelContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
    position: 'relative',
  },
  pointer: {
    position: 'absolute',
    top: -16,
    zIndex: 10,
    alignItems: 'center',
  },
  pointerTriangle: {
    width: 0, height: 0,
    borderLeftWidth: 12,
    borderRightWidth: 12,
    borderTopWidth: 24,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.black,
  },
  centerCap: {
    position: 'absolute',
    width: 32, height: 32,
    borderRadius: 16,
    backgroundColor: colors.white,
    borderWidth: 3,
    borderColor: colors.black,
  },
  resultBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
    justifyContent: 'center',
  },
  resultEmoji: { fontSize: 24 },
  resultText: { ...typography.label, color: colors.black },
  resultHighlight: { color: colors.accent, fontWeight: '800' },
  spinBtn: {
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  spinBtnDisabled: { opacity: 0.6 },
  spinBtnText: { ...typography.button, color: colors.white, fontSize: 18 },
});
