import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import OptionCard from '../../components/onboarding/OptionCard';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { useOnboarding } from '../../context/OnboardingContext';
import { StepProps } from './OnboardingNavigator';

const OPTIONS = [
  { value: 'lose' as const,     label: 'Perder peso',   emoji: '📉' },
  { value: 'maintain' as const, label: 'Mantener',      emoji: '⚖️' },
  { value: 'gain' as const,     label: 'Ganar peso',    emoji: '📈' },
];

export default function Step10Goal({ onNext, onBack, step, totalSteps }: StepProps) {
  const { data, update } = useOnboarding();

  return (
    <OnboardingLayout
      step={step}
      totalSteps={totalSteps}
      onBack={onBack}
      footer={<PrimaryButton label="Continuar" onPress={onNext} disabled={!data.goal} />}
    >
      <Text style={styles.title}>¿Cuál es tu objetivo?</Text>
      <Text style={styles.subtitle}>Esto nos ayuda a generar un plan para tu ingesta calórica.</Text>

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
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, color: colors.black, marginTop: spacing.md },
  subtitle: { ...typography.subtitle, color: colors.gray, marginTop: spacing.sm },
  options: { marginTop: spacing.xxl, gap: spacing.sm + 4 },
});
