import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import OptionCard from '../../components/onboarding/OptionCard';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { useOnboarding } from '../../context/OnboardingContext';
import { StepProps } from './OnboardingNavigator';

const OPTIONS = [
  { label: 'Falta de constancia',          emoji: '\u{1F4C9}', icon: 'bar-chart-outline' },
  { label: 'Malos habitos alimenticios',   emoji: '\u{1F354}', icon: 'fast-food-outline' },
  { label: 'Falta de apoyo',               emoji: '\u{1F91D}', icon: 'hand-left-outline' },
  { label: 'Agenda muy ocupada',           emoji: '\u{23F0}', icon: 'calendar-outline' },
  { label: 'Sin inspiracion para comer',   emoji: '\u{1F914}', icon: 'nutrition-outline' },
];

export default function Step15PainPoints({ onNext, onBack, step, totalSteps, onSkip }: StepProps) {
  const { data, update } = useOnboarding();
  const selected = data.painPoints;

  const toggle = (label: string) => {
    update(
      'painPoints',
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
      onSkip={onSkip}
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
        ¿Que te impide{'\n'}alcanzar{'\n'}tus objetivos?
      </Text>
      <Text style={styles.subtitle}>
        Selecciona todas las que apliquen.
      </Text>

      <View
        style={styles.options}
        accessibilityRole="radiogroup"
        accessibilityLabel="Obstaculos para alcanzar tus objetivos"
      >
        {OPTIONS.map(opt => (
          <OptionCard
            key={opt.label}
            label={opt.label}
            emoji={opt.emoji}
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
