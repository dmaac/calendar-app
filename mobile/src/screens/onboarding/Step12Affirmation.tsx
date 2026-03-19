import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { colors, typography, spacing } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { useOnboarding } from '../../context/OnboardingContext';
import { StepProps } from './OnboardingNavigator';

const GOAL_VERB: Record<string, string> = {
  lose: 'Losing',
  gain: 'Gaining',
  maintain: 'Maintaining',
};
const GOAL_SUFFIX: Record<string, string> = {
  lose: 'is a realistic\ntarget. It\'s not hard at all!',
  gain: 'is an achievable\ntarget. You\'ve got this!',
  maintain: 'your current weight\nis a great goal!',
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
    <OnboardingLayout step={step} totalSteps={totalSteps} onBack={onBack} showHeader>
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
            90% of users say that the change is obvious after using our app and it is not easy to rebound.
          </Text>
        </Animated.View>
      </View>

      <View style={styles.footer}>
        <PrimaryButton label="Continue" onPress={onNext} />
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
  footer: { position: 'absolute', bottom: spacing.lg, left: spacing.lg, right: spacing.lg },
});
