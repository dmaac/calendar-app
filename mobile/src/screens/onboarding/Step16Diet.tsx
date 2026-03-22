import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import OptionCard from '../../components/onboarding/OptionCard';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { useOnboarding } from '../../context/OnboardingContext';
import { StepProps } from './OnboardingNavigator';

const OPTIONS = [
  { value: 'Classic' as const,      label: 'Clasico',        emoji: '\u{1F356}', subtitle: 'Come de todo sin restricciones' },
  { value: 'Pescatarian' as const,  label: 'Pescetariano',   emoji: '\u{1F41F}', subtitle: 'Pescados y mariscos, sin carne' },
  { value: 'Vegetarian' as const,   label: 'Vegetariano',    emoji: '\u{1F96C}', subtitle: 'Sin carne ni pescado' },
  { value: 'Vegan' as const,        label: 'Vegano',         emoji: '\u{1F331}', subtitle: 'Solo alimentos de origen vegetal' },
];

export default function Step16Diet({ onNext, onBack, step, totalSteps, onSkip }: StepProps) {
  const { data, update } = useOnboarding();

  return (
    <OnboardingLayout
      step={step}
      totalSteps={totalSteps}
      onBack={onBack}
      onSkip={onSkip}
      footer={
        <PrimaryButton
          label="Continuar"
          onPress={onNext}
          disabled={!data.dietType}
        />
      }
    >
      <Text
        style={styles.title}
        accessibilityRole="header"
      >
        ¿Sigues alguna{'\n'}dieta especifica?
      </Text>
      <Text style={styles.subtitle}>
        Esto nos ayuda a personalizar tus recomendaciones.
      </Text>

      <View
        style={styles.options}
        accessibilityRole="radiogroup"
        accessibilityLabel="Tipo de dieta"
      >
        {OPTIONS.map(opt => (
          <OptionCard
            key={opt.value}
            label={opt.label}
            subtitle={opt.subtitle}
            emoji={opt.emoji}
            selected={data.dietType === opt.value}
            onPress={() => update('dietType', opt.value)}
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
