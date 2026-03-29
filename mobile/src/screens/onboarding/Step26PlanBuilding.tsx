/**
 * Step26PlanBuilding -- Multi-step loading with staggered progress indicators.
 *
 * UX Polish:
 * - Each step row fades/slides in when it becomes active (staggered entrance)
 * - Completed step dots spring-scale with a checkmark
 * - Progress bar animates smoothly with eased timing
 * - Spinner has fluid continuous rotation
 * - Final checkmark bounces in with spring physics
 * - Haptic ticks on each step transition; success haptic on completion
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

const STEPS = [
  { icon: 'person-outline',         text: 'Analizando tu perfil...' },
  { icon: 'calculator-outline',     text: 'Calculando tu metabolismo...' },
  { icon: 'nutrition-outline',      text: 'Creando tu plan de comidas...' },
  { icon: 'barbell-outline',        text: 'Optimizando para tus objetivos...' },
  { icon: 'checkmark-circle-outline', text: 'Finalizando tu plan...' },
];

/** Animated row for each plan-building step */
function StepRow({
  icon,
  text,
  isActive,
  isDone,
  index,
}: {
  icon: string;
  text: string;
  isActive: boolean;
  isDone: boolean;
  index: number;
}) {
  const opacity = useRef(new Animated.Value(index === 0 ? 1 : 0.3)).current;
  const translateX = useRef(new Animated.Value(index === 0 ? 0 : 12)).current;
  const dotScale = useRef(new Animated.Value(index === 0 ? 1 : 0.8)).current;

  useEffect(() => {
    if (isActive || isDone) {
      // Fade and slide in when becoming active
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(translateX, {
          toValue: 0,
          friction: 7,
          tension: 80,
          useNativeDriver: true,
        }),
        Animated.spring(dotScale, {
          toValue: 1,
          friction: 5,
          tension: 120,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isActive, isDone]);

  // When a step completes, do a quick pop on the dot
  useEffect(() => {
    if (isDone) {
      dotScale.setValue(1.3);
      Animated.spring(dotScale, {
        toValue: 1,
        friction: 5,
        tension: 160,
        useNativeDriver: true,
      }).start();
    }
  }, [isDone]);

  return (
    <Animated.View
      style={[
        styles.stepRow,
        {
          opacity,
          transform: [{ translateX }],
        },
      ]}
      accessibilityLabel={`${isDone ? 'Completado' : isActive ? 'En progreso' : 'Pendiente'}: ${text}`}
    >
      <Animated.View
        style={[
          styles.stepDot,
          isDone && styles.stepDotDone,
          isActive && !isDone && styles.stepDotActive,
          { transform: [{ scale: dotScale }] },
        ]}
      >
        {isDone
          ? <Ionicons name="checkmark" size={12} color={colors.white} />
          : <Ionicons name={icon as any} size={12} color={isActive ? colors.white : colors.gray} />
        }
      </Animated.View>
      <Text style={[styles.stepText, (isActive || isDone) && styles.stepTextActive]}>
        {text}
      </Text>
    </Animated.View>
  );
}

export default function Step26PlanBuilding({ onNext, onBack, step, totalSteps }: StepProps) {
  const { computePlan } = useOnboarding();
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [done, setDone] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;
  const checkScaleAnim = useRef(new Animated.Value(0)).current;
  const iconCircleScale = useRef(new Animated.Value(0.8)).current;

  // Ref to avoid stale closure for onNext inside setTimeout
  const onNextRef = useRef(onNext);
  onNextRef.current = onNext;

  useEffect(() => {
    // Calculate plan immediately
    computePlan();

    // Icon circle entrance bounce
    Animated.spring(iconCircleScale, {
      toValue: 1,
      friction: 5,
      tension: 80,
      useNativeDriver: true,
    }).start();

    // Continuous spinner rotation
    const spin = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    spin.start();

    // Animate through steps
    let idx = 0;
    const interval = setInterval(() => {
      idx++;
      haptics.light();
      if (idx < STEPS.length) {
        setCurrentStepIdx(idx);
        Animated.timing(progressAnim, {
          toValue: idx / (STEPS.length - 1),
          duration: 500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }).start();
      } else {
        clearInterval(interval);
        spin.stop();
        haptics.success();
        setDone(true);

        // Bounce in the checkmark
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
          // Auto-advance after a short pause
          setTimeout(() => onNextRef.current(), 600);
        });
      }
    }, 900);

    return () => {
      clearInterval(interval);
      spin.stop();
    };
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
          Creando tu{'\n'}plan personalizado
        </Text>
        <Text style={styles.subtitle}>Un momento mientras procesamos los datos...</Text>

        {/* Fitsi thinking/celebrating */}
        <Animated.View style={[{ transform: [{ scale: iconCircleScale }] }]}>
          <FitsiMascot
            expression={done ? 'party' : 'thinking'}
            size="medium"
            animation={done ? 'celebrate' : 'thinking'}
          />
        </Animated.View>

        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
        </View>

        {/* Steps list — each row animates in when activated */}
        <View style={styles.stepsList}>
          {STEPS.map((s, i) => (
            <StepRow
              key={i}
              icon={s.icon}
              text={s.text}
              isActive={i === currentStepIdx}
              isDone={i < currentStepIdx || done}
              index={i}
            />
          ))}
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
