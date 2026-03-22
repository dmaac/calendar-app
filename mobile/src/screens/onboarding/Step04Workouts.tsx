import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import OptionCard from '../../components/onboarding/OptionCard';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { useOnboarding } from '../../context/OnboardingContext';
import { StepProps } from './OnboardingNavigator';

const OPTIONS = [
  { value: '0-2' as const, label: '0-2 por semana', subtitle: 'Entreno de vez en cuando', emoji: '\u{1F6B6}' },
  { value: '3-5' as const, label: '3-5 por semana', subtitle: 'Activo con rutina regular', emoji: '\u{1F3C3}' },
  { value: '6+' as const, label: '6+ por semana', subtitle: 'Atleta dedicado', emoji: '\u{1F4AA}' },
];

export default function Step04Workouts({ onNext, onBack, step, totalSteps, onSkip }: StepProps) {
  const { data, update } = useOnboarding();
  const selected = data.workoutsPerWeek;

  return (
    <OnboardingLayout
      step={step}
      totalSteps={totalSteps}
      onBack={onBack}
      onSkip={onSkip}
      footer={<PrimaryButton label="Continuar" onPress={onNext} disabled={!selected} />}
    >

      <Text style={styles.title}>Cuantos entrenos{'\n'}haces por semana?</Text>
      <Text style={styles.subtitle}>
        Tu nivel de actividad fisica ajusta tus calorias diarias.
      </Text>

      <View style={styles.options}>
        {OPTIONS.map(opt => (
          <OptionCard
            key={opt.value}
            label={opt.label}
            subtitle={opt.subtitle}
            emoji={opt.emoji}
            selected={selected === opt.value}
            onPress={() => update('workoutsPerWeek', opt.value)}
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
