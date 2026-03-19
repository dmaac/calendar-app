import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import OptionCard from '../../components/onboarding/OptionCard';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { useOnboarding } from '../../context/OnboardingContext';
import { StepProps } from './OnboardingNavigator';

const OPTIONS = [
  { value: 'Male' as const, emoji: '👨' },
  { value: 'Female' as const, emoji: '👩' },
  { value: 'Other' as const, emoji: '🧑' },
];

export default function Step03Gender({ onNext, onBack, step, totalSteps }: StepProps) {
  const { data, update } = useOnboarding();
  const selected = data.gender;

  const handleSelect = (value: typeof data.gender) => {
    update('gender', value);
  };

  return (
    <OnboardingLayout step={step} totalSteps={totalSteps} onBack={onBack}>

      {/* Título */}
      <Text style={styles.title}>Choose your Gender</Text>
      <Text style={styles.subtitle}>This will be used to calibrate your custom plan.</Text>

      {/* Opciones */}
      <View style={styles.options}>
        {OPTIONS.map(opt => (
          <OptionCard
            key={opt.value}
            label={opt.value}
            emoji={opt.emoji}
            selected={selected === opt.value}
            onPress={() => handleSelect(opt.value)}
          />
        ))}
      </View>

      {/* Botón flotante */}
      <View style={styles.footer}>
        <PrimaryButton
          label="Continue"
          onPress={onNext}
          disabled={!selected}
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
  options: {
    marginTop: spacing.xxl,
    gap: spacing.sm + 4,
  },
  footer: {
    position: 'absolute',
    bottom: spacing.lg,
    left: spacing.lg,
    right: spacing.lg,
  },
});
