import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors, typography, spacing } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import OptionCard from '../../components/onboarding/OptionCard';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { useOnboarding } from '../../context/OnboardingContext';
import { StepProps } from './OnboardingNavigator';

const OPTIONS = [
  { label: 'Crear hábitos saludables',     icon: 'fitness-outline' },
  { label: 'Mejorar mi energía',           icon: 'flash-outline' },
  { label: 'Sentirme con más confianza',   icon: 'star-outline' },
  { label: 'Comer con más consciencia',    icon: 'restaurant-outline' },
  { label: 'Reducir el estrés',            icon: 'leaf-outline' },
  { label: 'Dormir mejor',                 icon: 'moon-outline' },
];

export default function Step17Accomplish({ onNext, onBack, step, totalSteps }: StepProps) {
  const { data, update } = useOnboarding();
  const selected = data.accomplishments;

  const toggle = (label: string) => {
    update('accomplishments', selected.includes(label)
      ? selected.filter(p => p !== label)
      : [...selected, label]
    );
  };

  return (
    <OnboardingLayout
      step={step}
      totalSteps={totalSteps}
      onBack={onBack}
      scrollable={false}
      footer={<PrimaryButton label="Continuar" onPress={onNext} disabled={selected.length === 0} />}
    >
      <Text style={styles.title}>¿Qué quieres{'\n'}lograr?</Text>
      <Text style={styles.subtitle}>Selecciona todas las que apliquen.</Text>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={styles.options}>
          {OPTIONS.map(opt => (
            <OptionCard
              key={opt.label}
              label={opt.label}
              icon={opt.icon}
              selected={selected.includes(opt.label)}
              onPress={() => toggle(opt.label)}
            />
          ))}
          <View style={{ height: 80 }} />
        </View>
      </ScrollView>
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, color: colors.black, marginTop: spacing.md },
  subtitle: { ...typography.subtitle, color: colors.gray, marginTop: spacing.sm, marginBottom: spacing.md },
  options: { gap: spacing.sm + 2 },
});
