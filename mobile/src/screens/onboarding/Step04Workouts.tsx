import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import OptionCard from '../../components/onboarding/OptionCard';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { useOnboarding } from '../../context/OnboardingContext';
import { StepProps } from './OnboardingNavigator';

const OPTIONS = [
  { value: '0-2' as const, subtitle: 'Workouts now and then', icon: 'ellipse' },
  { value: '3-5' as const, subtitle: 'A few workouts per week', icon: 'ellipse' },
  { value: '6+' as const, subtitle: 'Dedicated athlete', icon: 'ellipse' },
];

export default function Step04Workouts({ onNext, onBack, step, totalSteps }: StepProps) {
  const { data, update } = useOnboarding();
  const selected = data.workoutsPerWeek;

  return (
    <OnboardingLayout step={step} totalSteps={totalSteps} onBack={onBack}>

      <Text style={styles.title}>How many workouts{'\n'}do you do per week?</Text>
      <Text style={styles.subtitle}>This will be used to calibrate your custom plan.</Text>

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

      <View style={styles.footer}>
        <PrimaryButton label="Continue" onPress={onNext} disabled={!selected} />
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
