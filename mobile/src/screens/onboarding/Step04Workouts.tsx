import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import OptionCard from '../../components/onboarding/OptionCard';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { useOnboarding } from '../../context/OnboardingContext';
import { StepProps } from './OnboardingNavigator';

const OPTIONS = [
  { value: '0-2' as const, subtitle: 'Entreno de vez en cuando', icon: 'ellipse' },
  { value: '3-5' as const, subtitle: 'Algunos entrenos por semana', icon: 'ellipse' },
  { value: '6+' as const, subtitle: 'Atleta dedicado', icon: 'ellipse' },
];

export default function Step04Workouts({ onNext, onBack, step, totalSteps }: StepProps) {
  const { data, update } = useOnboarding();
  const selected = data.workoutsPerWeek;

  return (
    <OnboardingLayout
      step={step}
      totalSteps={totalSteps}
      onBack={onBack}
      footer={<PrimaryButton label="Continuar" onPress={onNext} disabled={!selected} />}
    >

      <Text style={styles.title}>¿Cuántos entrenos{'\n'}haces por semana?</Text>
      <Text style={styles.subtitle}>Esto nos ayudará a calibrar tu plan personalizado.</Text>

      <View style={styles.options}>
        {OPTIONS.map((opt, i) => (
          <OptionCard
            key={opt.value}
            label={opt.value}
            subtitle={opt.subtitle}
            emoji={i === 0 ? '•' : i === 1 ? '••' : '•••'}
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
