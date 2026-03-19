import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import OptionCard from '../../components/onboarding/OptionCard';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { useOnboarding } from '../../context/OnboardingContext';
import { StepProps } from './OnboardingNavigator';

const OPTIONS = [
  { value: 'Classic' as const,      label: 'Clásico',       emoji: '🍗', icon: 'restaurant-outline' },
  { value: 'Pescatarian' as const,  label: 'Pescetariano',  emoji: '🐟', icon: 'fish-outline' },
  { value: 'Vegetarian' as const,   label: 'Vegetariano',   emoji: '🥦', icon: 'leaf-outline' },
  { value: 'Vegan' as const,        label: 'Vegano',        emoji: '🌱', icon: 'flower-outline' },
];

export default function Step16Diet({ onNext, onBack, step, totalSteps }: StepProps) {
  const { data, update } = useOnboarding();

  return (
    <OnboardingLayout step={step} totalSteps={totalSteps} onBack={onBack}>
      <Text style={styles.title}>¿Sigues alguna{'\n'}dieta específica?</Text>

      <View style={styles.options}>
        {OPTIONS.map(opt => (
          <OptionCard
            key={opt.value}
            label={opt.label}
            emoji={opt.emoji}
            selected={data.dietType === opt.value}
            onPress={() => update('dietType', opt.value)}
          />
        ))}
      </View>

      <View style={styles.footer}>
        <PrimaryButton label="Continuar" onPress={onNext} disabled={!data.dietType} />
      </View>
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, color: colors.black, marginTop: spacing.md },
  options: { marginTop: spacing.xxl, gap: spacing.sm + 4 },
  footer: { position: 'absolute', bottom: spacing.lg, left: spacing.lg, right: spacing.lg },
});
