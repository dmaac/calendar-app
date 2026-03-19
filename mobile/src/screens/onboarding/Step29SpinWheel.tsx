import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity, Easing } from 'react-native';
import Svg, { G, Path, Text as SvgText } from 'react-native-svg';
import { colors, typography, spacing, radius, useLayout } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { StepProps } from './OnboardingNavigator';

const SEGMENTS = [
  { label: '40% OFF', color: '#FF7A5C' },
  { label: '1 Month', color: '#111111' },
  { label: '50% OFF', color: '#FF7A5C' },
  { label: 'Otra vez', color: '#E5E5EA' },
  { label: '60% OFF', color: '#FF7A5C' },
  { label: '30% OFF', color: '#8E8E93' },
  { label: '3 Days Free', color: '#111111' },
  { label: '80% OFF', color: '#FF7A5C' },
];

const SEGMENT_ANGLE = (2 * Math.PI) / SEGMENTS.length;

// Winning segment is always index 7 (80% OFF) — index calculation accounts for spin
const WINNING_IDX = 7;

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

export default function Step29SpinWheel({ onNext, onBack, step, totalSteps }: StepProps) {
  const { innerWidth } = useLayout();
  const WHEEL_SIZE = Math.min(Math.round(innerWidth * 0.85), 320);
  const WHEEL_CENTER = WHEEL_SIZE / 2;

  const spinAnim = useRef(new Animated.Value(0)).current;
  const [spun, setSpun] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState('');

  const handleSpin = () => {
    if (spinning || spun) return;
    setSpinning(true);

    // Land on winning segment: 80% OFF (index 7)
    // Full rotations + offset to land on segment 7
    const degreesPerSegment = 360 / SEGMENTS.length;
    const winningDeg = WINNING_IDX * degreesPerSegment;
    // We spin 5 full rotations + land on the winning segment
    // Pointer is at top (270°), segment starts at -startAngle from top
    const targetDeg = 5 * 360 + (360 - winningDeg + degreesPerSegment / 2);

    Animated.timing(spinAnim, {
      toValue: targetDeg,
      duration: 4000,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setSpinning(false);
      setSpun(true);
      setResult(SEGMENTS[WINNING_IDX].label);
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
          >
            <Text style={styles.spinBtnText}>{spinning ? 'Girando...' : '🎰 ¡GIRAR!'}</Text>
          </TouchableOpacity>
        ) : (
          <PrimaryButton label="Reclamar mi descuento" onPress={onNext} />
        )
      }
    >
      <Text style={styles.title}>¡Gira para desbloquear{'\n'}tu descuento!</Text>
      <Text style={styles.subtitle}>Un giro por usuario. ¡Buena suerte! 🍀</Text>

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
        <View style={styles.resultBanner}>
          <Text style={styles.resultEmoji}>🎉</Text>
          <Text style={styles.resultText}>Ganaste: <Text style={styles.resultHighlight}>{result}</Text></Text>
        </View>
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
