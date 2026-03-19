import React, { useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, PanResponder, GestureResponderEvent } from 'react-native';
import { colors, typography, spacing, radius, useLayout } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { useOnboarding } from '../../context/OnboardingContext';
import { StepProps } from './OnboardingNavigator';

const MIN = 0.1;
const MAX = 1.5;
const STEP = 0.1;
const PRESETS = [
  { value: 0.3, label: '0.3 kg/wk' },
  { value: 0.8, label: '⭐ Recommended' },
  { value: 1.5, label: '1.5 kg/wk' },
];

function clamp(v: number) {
  return Math.max(MIN, Math.min(MAX, Math.round(v / STEP) * STEP));
}

export default function Step13Speed({ onNext, onBack, step, totalSteps }: StepProps) {
  const { data, update } = useOnboarding();
  const { innerWidth } = useLayout();
  const speed = data.weeklySpeedKg;
  const progress = (speed - MIN) / (MAX - MIN);

  const trackWidth = innerWidth;
  const trackRef = useRef<View>(null);
  const trackX = useRef(0);

  const getAnimal = () => speed <= 0.4 ? '🦥' : speed <= 1.0 ? '🐕' : '🐆';

  const handleTrackPress = useCallback((e: GestureResponderEvent) => {
    const x = e.nativeEvent.locationX;
    const ratio = Math.max(0, Math.min(1, x / trackWidth));
    update('weeklySpeedKg', clamp(MIN + ratio * (MAX - MIN)));
  }, [trackWidth]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        trackRef.current?.measure((_fx, _fy, _w, _h, px) => {
          trackX.current = px;
        });
      },
      onPanResponderMove: (e) => {
        const x = e.nativeEvent.pageX - trackX.current;
        const ratio = Math.max(0, Math.min(1, x / trackWidth));
        update('weeklySpeedKg', clamp(MIN + ratio * (MAX - MIN)));
      },
    })
  ).current;

  return (
    <OnboardingLayout
      step={step}
      totalSteps={totalSteps}
      onBack={onBack}
      footer={<PrimaryButton label="Continuar" onPress={onNext} />}
    >
      <Text style={styles.title}>¿Qué tan rápido quieres{'\n'}alcanzar tu objetivo?</Text>

      <View style={styles.center}>
        {/* Value display */}
        <Text style={styles.speedLabel}>Velocidad de pérdida de peso por semana</Text>
        <Text style={styles.speedValue}>{speed.toFixed(1)} kg</Text>

        {/* Animal indicator */}
        <View style={styles.animalsRow}>
          {['🦥','🐕','🐆'].map((a, i) => {
            const isActive = (i === 0 && speed <= 0.4) || (i === 1 && speed > 0.4 && speed <= 1.0) || (i === 2 && speed > 1.0);
            return (
              <Text key={i} style={[styles.animal, { opacity: isActive ? 1 : 0.25, fontSize: isActive ? 32 : 24 }]}>
                {a}
              </Text>
            );
          })}
        </View>

        {/* Custom slider track */}
        <View style={[styles.trackWrapper, { width: trackWidth }]}>
          <View
            ref={trackRef}
            style={[styles.track, { width: trackWidth }]}
            onStartShouldSetResponder={() => true}
            {...panResponder.panHandlers}
          >
            {/* Fill */}
            <View style={[styles.trackFill, { width: `${progress * 100}%` }]} />
            {/* Thumb */}
            <View style={[styles.thumb, { left: `${progress * 100}%`, marginLeft: -14 }]} />
          </View>

          {/* Range labels */}
          <View style={styles.rangeLabels}>
            <Text style={styles.rangeLabel}>0.1 kg</Text>
            <Text style={styles.rangeLabel}>0.8 kg</Text>
            <Text style={styles.rangeLabel}>1.5 kg</Text>
          </View>
        </View>

        {/* Preset chips */}
        <View style={styles.presets}>
          {PRESETS.map(p => (
            <TouchableOpacity
              key={p.value}
              onPress={() => update('weeklySpeedKg', p.value)}
              style={[styles.chip, speed === p.value && styles.chipActive]}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipText, speed === p.value && styles.chipTextActive]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, color: colors.black, marginTop: spacing.md },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.lg },
  speedLabel: { ...typography.label, color: colors.gray },
  speedValue: { fontSize: 48, fontWeight: '800', color: colors.black, letterSpacing: -1, marginTop: -8 },
  animalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: spacing.sm,
  },
  animal: { textAlign: 'center' },
  trackWrapper: { gap: spacing.sm },
  track: {
    height: 6,
    backgroundColor: colors.grayLight,
    borderRadius: 3,
    position: 'relative',
    justifyContent: 'center',
  },
  trackFill: {
    position: 'absolute',
    left: 0,
    height: 6,
    backgroundColor: colors.black,
    borderRadius: 3,
  },
  thumb: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: 2.5,
    borderColor: colors.black,
    top: -11,
  },
  rangeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  rangeLabel: { ...typography.caption, color: colors.gray },
  presets: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.black },
  chipText: { ...typography.label, color: colors.black },
  chipTextActive: { color: colors.white },
});
