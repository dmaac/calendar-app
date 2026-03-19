import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import OptionCard from '../../components/onboarding/OptionCard';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { useOnboarding } from '../../context/OnboardingContext';
import { StepProps } from './OnboardingNavigator';

const OPTIONS = [
  { value: 'lose' as const,     label: 'Lose weight',   emoji: '📉' },
  { value: 'maintain' as const, label: 'Maintain',      emoji: '⚖️' },
  { value: 'gain' as const,     label: 'Gain weight',   emoji: '📈' },
];

export default function Step10Goal({ onNext, onBack, step, totalSteps }: StepProps) {
  const { data, update } = useOnboarding();

  return (
    <OnboardingLayout step={step} totalSteps={totalSteps} onBack={onBack}>
      <Text style={styles.title}>What is your goal?</Text>
      <Text style={styles.subtitle}>This helps us generate a plan for your calorie intake.</Text>

      <View style={styles.options}>
        {OPTIONS.map(opt => (
          <OptionCard
            key={opt.value}
            label={opt.label}
            emoji={opt.emoji}
            selected={data.goal === opt.value}
            onPress={() => update('goal', opt.value)}
          />
        ))}
      </View>

      <View style={styles.footer}>
        <PrimaryButton label="Continue" onPress={onNext} disabled={!data.goal} />
      </View>
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, color: colors.black, marginTop: spacing.md },
  subtitle: { ...typography.subtitle, color: colors.gray, marginTop: spacing.sm },
  options: { marginTop: spacing.xxl, gap: spacing.sm + 4 },
  footer: { position: 'absolute', bottom: spacing.lg, left: spacing.lg, right: spacing.lg },
});
