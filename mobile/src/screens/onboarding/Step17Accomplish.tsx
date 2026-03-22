import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import OptionCard from '../../components/onboarding/OptionCard';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { useOnboarding } from '../../context/OnboardingContext';
import { StepProps } from './OnboardingNavigator';

const OPTIONS = [
  { label: 'Crear habitos saludables',     icon: 'fitness-outline' },
  { label: 'Mejorar mi energia',           icon: 'flash-outline' },
  { label: 'Sentirme con mas confianza',   icon: 'star-outline' },
  { label: 'Comer con mas consciencia',    icon: 'restaurant-outline' },
  { label: 'Reducir el estres',            icon: 'leaf-outline' },
  { label: 'Dormir mejor',                 icon: 'moon-outline' },
];

export default function Step17Accomplish({ onNext, onBack, step, totalSteps }: StepProps) {
  const { data, update } = useOnboarding();
  const selected = data.accomplishments;

  const toggle = (label: string) => {
    update(
      'accomplishments',
      selected.includes(label)
        ? selected.filter(p => p !== label)
        : [...selected, label],
    );
  };

  return (
    <OnboardingLayout
      step={step}
      totalSteps={totalSteps}
      onBack={onBack}
      scrollable
      footer={
        <PrimaryButton
          label="Continuar"
          onPress={onNext}
          disabled={selected.length === 0}
        />
      }
    >
      <Text
        style={styles.title}
        accessibilityRole="header"
      >
        ¿Que quieres{'\n'}lograr?
      </Text>
      <Text style={styles.subtitle}>
        Selecciona todas las que apliquen.
      </Text>

      <View
        style={styles.options}
        accessibilityRole="radiogroup"
        accessibilityLabel="Objetivos personales"
      >
        {OPTIONS.map(opt => (
          <OptionCard
            key={opt.label}
            label={opt.label}
            icon={opt.icon}
            selected={selected.includes(opt.label)}
            onPress={() => toggle(opt.label)}
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
    marginBottom: spacing.md,
  },
  options: {
    gap: spacing.sm + 2,
    paddingBottom: spacing.md,
  },
});
