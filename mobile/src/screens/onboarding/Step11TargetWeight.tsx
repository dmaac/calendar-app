import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import RulerSlider from '../../components/onboarding/RulerSlider';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { useOnboarding } from '../../context/OnboardingContext';
import { StepProps } from './OnboardingNavigator';

const GOAL_LABELS: Record<string, string> = {
  lose: 'Lose weight',
  maintain: 'Maintain weight',
  gain: 'Gain weight',
};

export default function Step11TargetWeight({ onNext, onBack, step, totalSteps }: StepProps) {
  const { data, update } = useOnboarding();
  const isImperial = data.unitSystem === 'imperial';

  // Convert for display
  const displayValue = isImperial
    ? Math.round(data.targetWeightKg * 2.20462)
    : data.targetWeightKg;

  const handleChange = (v: number) => {
    const kg = isImperial ? Math.round(v / 2.20462 * 10) / 10 : v;
    update('targetWeightKg', kg);
  };

  return (
    <OnboardingLayout step={step} totalSteps={totalSteps} onBack={onBack}>
      <Text style={styles.title}>What is your{'\n'}desired weight?</Text>
      <Text style={styles.subtitle}>{GOAL_LABELS[data.goal] || 'Your goal'}</Text>

      <View style={styles.rulerWrapper}>
        <RulerSlider
          value={isImperial ? displayValue : data.targetWeightKg}
          min={isImperial ? 88 : 30}
          max={isImperial ? 330 : 150}
          step={isImperial ? 1 : 0.5}
          unit={isImperial ? 'lb' : 'kg'}
          onChange={handleChange}
        />
      </View>

      <View style={styles.footer}>
        <PrimaryButton label="Continue" onPress={onNext} />
      </View>
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, color: colors.black, marginTop: spacing.md },
  subtitle: { ...typography.subtitle, color: colors.gray, marginTop: spacing.sm },
  rulerWrapper: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  footer: { position: 'absolute', bottom: spacing.lg, left: spacing.lg, right: spacing.lg },
});
