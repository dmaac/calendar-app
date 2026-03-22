/**
 * FastTrackPlanBuilding — streamlined plan computation for the fast track.
 * Computes the nutrition plan from the 8 essential data points collected,
 * shows a brief loading animation, then auto-completes the onboarding.
 */
import React, { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import { useOnboarding } from '../../context/OnboardingContext';
import { StepProps } from './OnboardingNavigator';
import { haptics } from '../../hooks/useHaptics';
import FitsiMascot from '../../components/FitsiMascot';

const BUILD_STEPS = [
  { icon: 'person-outline',     text: 'Analizando tu perfil...' },
  { icon: 'calculator-outline', text: 'Calculando calorias...' },
  { icon: 'checkmark-circle-outline', text: 'Generando tu plan...' },
];

export default function FastTrackPlanBuilding({ onNext, onBack, step, totalSteps }: StepProps) {
  const { computePlan } = useOnboarding();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [done, setDone] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const checkScaleAnim = useRef(new Animated.Value(0)).current;
  const iconScale = useRef(new Animated.Value(0.8)).current;

  const onNextRef = useRef(onNext);
  onNextRef.current = onNext;

  useEffect(() => {
    computePlan();

    Animated.spring(iconScale, {
      toValue: 1,
      friction: 5,
      tension: 80,
      useNativeDriver: true,
    }).start();

    let idx = 0;
    const interval = setInterval(() => {
      idx++;
      haptics.light();
      if (idx < BUILD_STEPS.length) {
        setCurrentIdx(idx);
        Animated.timing(progressAnim, {
          toValue: idx / (BUILD_STEPS.length - 1),
          duration: 400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }).start();
      } else {
        clearInterval(interval);
        haptics.success();
        setDone(true);

        Animated.spring(checkScaleAnim, {
          toValue: 1,
          friction: 4,
          tension: 100,
          useNativeDriver: true,
        }).start();

        Animated.timing(progressAnim, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }).start(() => {
          setTimeout(() => onNextRef.current(), 500);
        });
      }
    }, 700);

    return () => clearInterval(interval);
  }, []);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['5%', '100%'],
  });

  return (
    <OnboardingLayout
      step={step}
      totalSteps={totalSteps}
      onBack={onBack}
      showHeader={false}
    >
      <View
        style={styles.container}
        accessibilityLabel="Creando tu plan personalizado. Por favor espera."
        accessibilityRole="progressbar"
      >
        <Text style={styles.title} accessibilityRole="header">
          Configuracion{'\n'}rapida lista
        </Text>
        <Text style={styles.subtitle}>Calculando tu plan en segundos...</Text>

        <Animated.View style={[{ transform: [{ scale: iconScale }] }]}>
          <FitsiMascot
            expression={done ? 'party' : 'thinking'}
            size="medium"
            animation={done ? 'celebrate' : 'thinking'}
          />
        </Animated.View>

        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
        </View>

        <View style={styles.stepsList}>
          {BUILD_STEPS.map((s, i) => {
            const isActive = i === currentIdx;
            const isDone = i < currentIdx || done;
            return (
              <View key={i} style={styles.stepRow}>
                <View
                  style={[
                    styles.stepDot,
                    isDone && styles.stepDotDone,
                    isActive && !isDone && styles.stepDotActive,
                  ]}
                >
                  {isDone
                    ? <Ionicons name="checkmark" size={12} color={colors.white} />
                    : <Ionicons name={s.icon as any} size={12} color={isActive ? colors.white : colors.gray} />
                  }
                </View>
                <Text style={[styles.stepText, (isActive || isDone) && styles.stepTextActive]}>
                  {s.text}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xl,
  },
  title: { ...typography.title, color: colors.black, textAlign: 'center' },
  subtitle: { ...typography.subtitle, color: colors.gray, textAlign: 'center' },
  progressTrack: {
    width: '100%',
    height: 6,
    backgroundColor: colors.grayLight,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.black,
    borderRadius: 3,
  },
  stepsList: { width: '100%', gap: spacing.sm },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stepDot: {
    width: 24, height: 24,
    borderRadius: 12,
    backgroundColor: colors.grayLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepDotActive: { backgroundColor: colors.black },
  stepDotDone: { backgroundColor: colors.black },
  stepText: { ...typography.label, color: colors.gray },
  stepTextActive: { color: colors.black },
});
