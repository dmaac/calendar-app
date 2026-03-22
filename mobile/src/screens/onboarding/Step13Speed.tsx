import React, { useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  PanResponder,
  GestureResponderEvent,
  Platform,
} from 'react-native';
import { colors, typography, spacing, radius, useLayout } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { useOnboarding } from '../../context/OnboardingContext';
import { StepProps } from './OnboardingNavigator';

const MIN = 0.1;
const MAX = 1.0; // Capped at 1.0 kg/week per ACSM/NIH clinical guidelines
const STEP = 0.1;
const PRESETS = [
  { value: 0.3, label: 'Gradual' },
  { value: 0.5, label: 'Recomendado' },
  { value: 1.0, label: 'Intenso' },
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

  const getSpeedLabel = () => {
    if (speed <= 0.4) return 'Gradual';
    if (speed <= 1.0) return 'Moderado';
    return 'Intenso';
  };

  const computeFromX = useCallback((x: number) => {
    const ratio = Math.max(0, Math.min(1, x / trackWidth));
    update('weeklySpeedKg', clamp(MIN + ratio * (MAX - MIN)));
  }, [trackWidth, update]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        if (Platform.OS === 'web') {
          computeFromX(e.nativeEvent.locationX);
        } else {
          trackRef.current?.measure((_fx, _fy, _w, _h, px) => {
            trackX.current = px;
          });
        }
      },
      onPanResponderMove: (e) => {
        if (Platform.OS === 'web') {
          computeFromX(e.nativeEvent.locationX);
        } else {
          computeFromX(e.nativeEvent.pageX - trackX.current);
        }
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
      <Text
        style={styles.title}
        accessibilityRole="header"
      >
        ¿Que tan rapido quieres{'\n'}alcanzar tu objetivo?
      </Text>

      <View style={styles.center}>
        {/* Value display */}
        <Text style={styles.speedLabel}>Velocidad semanal</Text>
        <Text
          style={styles.speedValue}
          accessibilityLabel={`${speed.toFixed(1)} kilogramos por semana, ritmo ${getSpeedLabel()}`}
        >
          {speed.toFixed(1)} kg
        </Text>

        {/* Speed indicator */}
        <View
          style={styles.indicatorRow}
          accessibilityLabel={`Ritmo: ${getSpeedLabel()}`}
        >
          <Text style={[
            styles.indicatorText,
            speed <= 0.4 && styles.indicatorActive,
          ]}>
            Gradual
          </Text>
          <Text style={[
            styles.indicatorText,
            speed > 0.4 && speed <= 1.0 && styles.indicatorActive,
          ]}>
            Moderado
          </Text>
          <Text style={[
            styles.indicatorText,
            speed > 1.0 && styles.indicatorActive,
          ]}>
            Intenso
          </Text>
        </View>

        {/* Custom slider track */}
        <View
          style={[styles.trackWrapper, { width: trackWidth }]}
          accessibilityRole="adjustable"
          accessibilityLabel={`Velocidad de perdida de peso: ${speed.toFixed(1)} kilogramos por semana`}
          accessibilityHint="Desliza para ajustar la velocidad"
        >
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
              accessibilityRole="button"
              accessibilityLabel={`${p.label}${p.value === 0.8 ? ', opcion recomendada' : ''}`}
              accessibilityState={{ selected: speed === p.value }}
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
  title: {
    ...typography.title,
    color: colors.black,
    marginTop: spacing.md,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.lg,
  },
  speedLabel: {
    ...typography.label,
    color: colors.gray,
  },
  speedValue: {
    fontSize: 48,
    fontWeight: '800',
    color: colors.black,
    letterSpacing: -1,
    marginTop: -8,
  },
  indicatorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: spacing.sm,
  },
  indicatorText: {
    ...typography.caption,
    color: colors.gray,
    opacity: 0.4,
  },
  indicatorActive: {
    opacity: 1,
    fontWeight: '700',
    color: colors.black,
  },
  trackWrapper: {
    gap: spacing.sm,
  },
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
  rangeLabel: {
    ...typography.caption,
    color: colors.gray,
  },
  presets: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
  },
  chipActive: {
    backgroundColor: colors.black,
  },
  chipText: {
    ...typography.label,
    color: colors.black,
  },
  chipTextActive: {
    color: colors.white,
  },
});
