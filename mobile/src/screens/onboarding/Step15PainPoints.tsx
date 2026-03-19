import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors, typography, spacing } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import OptionCard from '../../components/onboarding/OptionCard';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { useOnboarding } from '../../context/OnboardingContext';
import { StepProps } from './OnboardingNavigator';

const OPTIONS = [
  { label: 'Falta de constancia',          icon: 'bar-chart-outline' },
  { label: 'Malos hábitos alimenticios',   icon: 'fast-food-outline' },
  { label: 'Falta de apoyo',               icon: 'hand-left-outline' },
  { label: 'Agenda muy ocupada',           icon: 'calendar-outline' },
  { label: 'Sin inspiración para comer',   icon: 'nutrition-outline' },
];

export default function Step15PainPoints({ onNext, onBack, step, totalSteps }: StepProps) {
  const { data, update } = useOnboarding();
  const selected = data.painPoints;

  const toggle = (label: string) => {
    update('painPoints', selected.includes(label)
      ? selected.filter(p => p !== label)
      : [...selected, label]
    );
  };

  return (
    <OnboardingLayout step={step} totalSteps={totalSteps} onBack={onBack} scrollable={false}>
      <Text style={styles.title}>¿Qué te impide{'\n'}alcanzar{'\n'}tus objetivos?</Text>
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

      <View style={styles.footer}>
        <PrimaryButton label="Continuar" onPress={onNext} disabled={selected.length === 0} />
      </View>
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, color: colors.black, marginTop: spacing.md },
  subtitle: { ...typography.subtitle, color: colors.gray, marginTop: spacing.sm, marginBottom: spacing.md },
  options: { gap: spacing.sm + 2 },
  footer: { position: 'absolute', bottom: spacing.lg, left: spacing.lg, right: spacing.lg },
});
