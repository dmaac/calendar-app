import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import ScrollPicker from '../../components/onboarding/ScrollPicker';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { useOnboarding } from '../../context/OnboardingContext';
import { StepProps } from './OnboardingNavigator';

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1));
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 100 }, (_, i) => String(CURRENT_YEAR - 10 - i));

export default function Step09Birthday({ onNext, onBack, step, totalSteps, onSkip }: StepProps) {
  const { data, update } = useOnboarding();
  const { monthIndex, day, year } = data.birthDate;

  // Find year index in YEARS array
  const yearIndex = YEARS.indexOf(String(year));

  return (
    <OnboardingLayout
      step={step}
      totalSteps={totalSteps}
      onBack={onBack}
      onSkip={onSkip}
      footer={<PrimaryButton label="Continuar" onPress={onNext} />}
    >
      <Text style={styles.title}>Cuando naciste?</Text>
      <Text style={styles.subtitle}>
        Tu edad es clave para calcular tu metabolismo y calorias diarias.
      </Text>

      <View
        style={styles.pickersRow}
        accessibilityLabel={`Fecha de nacimiento seleccionada: ${MONTHS[monthIndex]} ${day}, ${year}`}
      >
        <ScrollPicker
          items={MONTHS}
          selectedIndex={monthIndex}
          onSelect={i => update('birthDate', { ...data.birthDate, monthIndex: i })}
          width={140}
        />
        <ScrollPicker
          items={DAYS}
          selectedIndex={day - 1}
          onSelect={i => update('birthDate', { ...data.birthDate, day: i + 1 })}
          width={60}
        />
        <ScrollPicker
          items={YEARS}
          selectedIndex={Math.max(0, yearIndex)}
          onSelect={i => update('birthDate', { ...data.birthDate, year: parseInt(YEARS[i]) })}
          width={80}
        />
      </View>
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, color: colors.black, marginTop: spacing.md },
  subtitle: { ...typography.subtitle, color: colors.gray, marginTop: spacing.sm },
  pickersRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xxl + spacing.md,
    gap: spacing.xs,
  },
});
