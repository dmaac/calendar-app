import React, { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import { useOnboarding } from '../../context/OnboardingContext';
import { StepProps } from './OnboardingNavigator';

const STEPS = [
  { icon: 'person-outline',         text: 'Analizando tu perfil...' },
  { icon: 'calculator-outline',     text: 'Calculando tu metabolismo...' },
  { icon: 'nutrition-outline',      text: 'Creando tu plan de comidas...' },
  { icon: 'barbell-outline',        text: 'Optimizando para tus objetivos...' },
  { icon: 'checkmark-circle-outline', text: 'Finalizando tu plan...' },
];

export default function Step26PlanBuilding({ onNext, onBack, step, totalSteps }: StepProps) {
  const { computePlan } = useOnboarding();
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [done, setDone] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Calculate plan immediately
    computePlan();

    // Animate through steps
    let idx = 0;
    const interval = setInterval(() => {
      idx++;
      if (idx < STEPS.length) {
        setCurrentStepIdx(idx);
        Animated.timing(progressAnim, {
          toValue: idx / (STEPS.length - 1),
          duration: 400,
          useNativeDriver: false,
        }).start();
      } else {
        clearInterval(interval);
        setDone(true);
        Animated.timing(progressAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: false,
        }).start(() => {
          // Auto-advance after a short pause
          setTimeout(onNext, 600);
        });
      }
    }, 900);

    return () => clearInterval(interval);
  }, []);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['5%', '100%'],
  });

  return (
    <OnboardingLayout step={step} totalSteps={totalSteps} onBack={onBack} showHeader={false}>
      <View style={styles.container}>
        <Text style={styles.title}>Creando tu{'\n'}plan personalizado</Text>
        <Text style={styles.subtitle}>Un momento mientras procesamos los datos...</Text>

        {/* Spinner / checkmark */}
        <View style={styles.iconCircle}>
          {done
            ? <Ionicons name="checkmark" size={48} color={colors.white} />
            : <Animated.View style={styles.spinner} />
          }
        </View>

        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
        </View>

        {/* Steps list */}
        <View style={styles.stepsList}>
          {STEPS.map((s, i) => {
            const isActive = i === currentStepIdx;
            const isDone   = i < currentStepIdx || done;
            return (
              <View key={i} style={styles.stepRow}>
                <View style={[styles.stepDot, isDone && styles.stepDotDone, isActive && styles.stepDotActive]}>
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
  iconCircle: {
    width: 100, height: 100,
    borderRadius: 50,
    backgroundColor: colors.black,
    justifyContent: 'center',
    alignItems: 'center',
  },
  spinner: {
    width: 40, height: 40,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: colors.white,
    borderTopColor: 'transparent',
  },
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
