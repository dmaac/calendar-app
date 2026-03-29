import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import RulerSlider from '../../components/onboarding/RulerSlider';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { useOnboarding } from '../../context/OnboardingContext';
import { StepProps } from './OnboardingNavigator';

const GOAL_LABELS: Record<string, string> = {
  lose: 'Perder peso',
  maintain: 'Mantener peso',
  gain: 'Ganar peso',
};

export default function Step11TargetWeight({ onNext, onBack, step, totalSteps, onSkip }: StepProps) {
  const { data, update } = useOnboarding();
  const isImperial = data.unitSystem === 'imperial';

  const displayValue = isImperial
    ? Math.round(data.targetWeightKg * 2.20462)
    : data.targetWeightKg;

  const handleChange = (v: number) => {
    const kg = isImperial ? Math.round(v / 2.20462 * 10) / 10 : v;
    update('targetWeightKg', kg);
  };

  const unit = isImperial ? 'lb' : 'kg';

  return (
    <OnboardingLayout
      step={step}
      totalSteps={totalSteps}
      onBack={onBack}
      onSkip={onSkip}
      footer={<PrimaryButton label="Continuar" onPress={onNext} />}
    >
      <Text
        style={styles.title}
        accessibilityRole="header"
      >
        ¿Cual es tu{'\n'}peso deseado?
      </Text>
      <Text style={styles.subtitle}>
        {GOAL_LABELS[data.goal] || 'Tu objetivo'}
      </Text>

      <View
        style={styles.rulerWrapper}
        accessibilityLabel={`Peso objetivo: ${displayValue} ${unit}`}
        accessibilityHint="Desliza horizontalmente para ajustar tu peso deseado"
      >
        <RulerSlider
          value={isImperial ? displayValue : data.targetWeightKg}
          min={isImperial ? 88 : 30}
          max={isImperial ? 330 : 150}
          step={isImperial ? 1 : 0.5}
          unit={unit}
          onChange={handleChange}
        />
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
  subtitle: {
    ...typography.subtitle,
    color: colors.gray,
    marginTop: spacing.sm,
  },
  rulerWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
