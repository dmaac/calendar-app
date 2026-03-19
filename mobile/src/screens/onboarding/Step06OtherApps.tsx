import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import OptionCard from '../../components/onboarding/OptionCard';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { useOnboarding } from '../../context/OnboardingContext';
import { StepProps } from './OnboardingNavigator';

export default function Step06OtherApps({ onNext, onBack, step, totalSteps }: StepProps) {
  const { data, update } = useOnboarding();
  const selected = data.usedOtherApps;

  return (
    <OnboardingLayout
      step={step}
      totalSteps={totalSteps}
      onBack={onBack}
      footer={<PrimaryButton label="Continuar" onPress={onNext} disabled={selected === null} />}
    >

      <Text style={styles.title}>¿Has probado otras{'\n'}apps de calorías?</Text>

      <View style={styles.options}>
        <OptionCard
          label="No"
          emoji="👎"
          selected={selected === false}
          onPress={() => update('usedOtherApps', false)}
        />
        <OptionCard
          label="Sí"
          emoji="👍"
          selected={selected === true}
          onPress={() => update('usedOtherApps', true)}
        />
      </View>

    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, color: colors.black, marginTop: spacing.md },
  options: { marginTop: spacing.xxl + spacing.lg, gap: spacing.sm + 4 },
});
