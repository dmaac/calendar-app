import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import OptionCard from '../../components/onboarding/OptionCard';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { useOnboarding } from '../../context/OnboardingContext';
import { StepProps } from './OnboardingNavigator';

const OPTIONS = [
  { value: 'Male' as const, label: 'Hombre', emoji: '👨' },
  { value: 'Female' as const, label: 'Mujer', emoji: '👩' },
  { value: 'Other' as const, label: 'Otro', emoji: '🧑' },
];

export default function Step03Gender({ onNext, onBack, step, totalSteps }: StepProps) {
  const { data, update } = useOnboarding();
  const selected = data.gender;

  const handleSelect = (value: typeof data.gender) => {
    update('gender', value);
  };

  return (
    <OnboardingLayout
      step={step}
      totalSteps={totalSteps}
      onBack={onBack}
      footer={<PrimaryButton label="Continuar" onPress={onNext} disabled={!selected} />}
    >

      {/* Título */}
      <Text style={styles.title}>¿Cuál es tu género?</Text>
      <Text style={styles.subtitle}>Esto nos ayudará a calibrar tu plan personalizado.</Text>

      {/* Opciones */}
      <View style={styles.options}>
        {OPTIONS.map(opt => (
          <OptionCard
            key={opt.value}
            label={opt.label}
            emoji={opt.emoji}
            selected={selected === opt.value}
            onPress={() => handleSelect(opt.value)}
          />
        ))}
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
  options: {
    marginTop: spacing.xxl,
    gap: spacing.sm + 4,
  },
});
