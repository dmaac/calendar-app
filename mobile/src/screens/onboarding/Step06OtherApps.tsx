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
    <OnboardingLayout step={step} totalSteps={totalSteps} onBack={onBack}>

      <Text style={styles.title}>Have you tried other{'\n'}calorie tracking apps?</Text>

      <View style={styles.options}>
        <OptionCard
          label="No"
          emoji="👎"
          selected={selected === false}
          onPress={() => update('usedOtherApps', false)}
        />
        <OptionCard
          label="Yes"
          emoji="👍"
          selected={selected === true}
          onPress={() => update('usedOtherApps', true)}
        />
      </View>

      <View style={styles.footer}>
        <PrimaryButton label="Continue" onPress={onNext} disabled={selected === null} />
      </View>

    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, color: colors.black, marginTop: spacing.md },
  options: { marginTop: spacing.xxl + spacing.lg, gap: spacing.sm + 4 },
  footer: { position: 'absolute', bottom: spacing.lg, left: spacing.lg, right: spacing.lg },
});
