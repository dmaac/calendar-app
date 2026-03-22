import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { colors, typography, spacing } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { useOnboarding } from '../../context/OnboardingContext';
import { StepProps } from './OnboardingNavigator';

const GOAL_VERB: Record<string, string> = {
  lose: 'Perdiendo',
  gain: 'Ganando',
  maintain: 'Manteniendo',
};
const GOAL_SUFFIX: Record<string, string> = {
  lose: 'es un objetivo realista.\nEstas en buenas manos.',
  gain: 'es un objetivo alcanzable.\nVamos a lograrlo juntos.',
  maintain: 'tu peso actual\nes una gran meta.',
};

export default function Step12Affirmation({ onNext, onBack, step, totalSteps, onSkip }: StepProps) {
  const { data } = useOnboarding();
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const diff = Math.abs(data.weightKg - data.targetWeightKg).toFixed(1);
  const isImperial = data.unitSystem === 'imperial';
  const displayDiff = isImperial
    ? `${Math.round(parseFloat(diff) * 2.20462)} lb`
    : `${diff} kg`;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        speed: 8,
        bounciness: 6,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const verb = GOAL_VERB[data.goal] || 'Alcanzando';
  const suffix = GOAL_SUFFIX[data.goal] || 'es una gran meta.';

  const accessibilityMessage = data.goal !== 'maintain'
    ? `${verb} ${displayDiff} ${suffix.replace('\n', ' ')}`
    : `${verb} ${suffix.replace('\n', ' ')}`;

  return (
    <OnboardingLayout
      step={step}
      totalSteps={totalSteps}
      onBack={onBack}
      onSkip={onSkip}
      showHeader
      footer={<PrimaryButton label="Continuar" onPress={onNext} />}
    >
      <View style={styles.center}>
        <Animated.View
          style={{ opacity: fadeAnim, transform: [{ scale: scaleAnim }] }}
          accessibilityLabel={accessibilityMessage}
          accessibilityRole="text"
        >
          <Text style={styles.text}>
            <Text style={styles.regular}>{verb} </Text>
            <Text style={styles.accent}>
              {data.goal !== 'maintain' ? displayDiff : ''}
            </Text>
            {data.goal !== 'maintain' && (
              <Text style={styles.regular}>{' '}</Text>
            )}
            <Text style={styles.regular}>{suffix}</Text>
          </Text>
        </Animated.View>

        <Animated.View style={{ opacity: fadeAnim, marginTop: spacing.xl }}>
          <Text style={styles.sub}>
            El 90% de nuestros usuarios reporta resultados visibles
            en las primeras semanas usando la app.
          </Text>
        </Animated.View>
      </View>
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.black,
    textAlign: 'center',
    lineHeight: 42,
    letterSpacing: -0.5,
  },
  regular: {
    color: colors.black,
  },
  accent: {
    color: colors.accent,
  },
  sub: {
    ...typography.subtitle,
    color: colors.gray,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    lineHeight: 22,
  },
});
