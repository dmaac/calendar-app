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
  lose: 'es un objetivo realista.\n¡No es tan difícil!',
  gain: 'es un objetivo alcanzable.\n¡Tú puedes!',
  maintain: 'tu peso actual\n¡es una gran meta!',
};

export default function Step12Affirmation({ onNext, onBack, step, totalSteps }: StepProps) {
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
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 8, bounciness: 6 }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  const verb = GOAL_VERB[data.goal] || 'Reaching';
  const suffix = GOAL_SUFFIX[data.goal] || 'is a great goal!';

  return (
    <OnboardingLayout
      step={step}
      totalSteps={totalSteps}
      onBack={onBack}
      showHeader
      footer={<PrimaryButton label="Continuar" onPress={onNext} />}
    >
      <View style={styles.center}>
        <Animated.View style={{ opacity: fadeAnim, transform: [{ scale: scaleAnim }] }}>
          <Text style={styles.text}>
            <Text style={styles.regular}>{verb} </Text>
            <Text style={styles.accent}>{data.goal !== 'maintain' ? displayDiff : ''}</Text>
            {data.goal !== 'maintain' ? <Text style={styles.regular}>{' '}</Text> : null}
            <Text style={styles.regular}>{suffix}</Text>
          </Text>
        </Animated.View>

        <Animated.View style={{ opacity: fadeAnim, marginTop: spacing.xl }}>
          <Text style={styles.sub}>
            El 90% de los usuarios dice que el cambio es evidente al usar nuestra app y que no es fácil recuperar el peso.
          </Text>
        </Animated.View>
      </View>
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  text: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.black,
    textAlign: 'center',
    lineHeight: 42,
    letterSpacing: -0.5,
  },
  regular: { color: colors.black },
  accent: { color: colors.accent },
  sub: {
    ...typography.subtitle,
    color: colors.gray,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    lineHeight: 22,
  },
});
