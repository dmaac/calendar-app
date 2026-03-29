import React, { useRef, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import OptionCard from '../../components/onboarding/OptionCard';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { useOnboarding } from '../../context/OnboardingContext';
import { StepProps } from './OnboardingNavigator';
import { haptics } from '../../hooks/useHaptics';

const OPTIONS = [
  { value: 'lose' as const,     label: 'Perder peso',      subtitle: 'Deficit calorico controlado', icon: 'trending-down-outline' },
  { value: 'maintain' as const, label: 'Mantener mi peso',  subtitle: 'Equilibrio calorico diario',  icon: 'reorder-two-outline' },
  { value: 'gain' as const,     label: 'Ganar peso',        subtitle: 'Superavit para ganar masa',   icon: 'trending-up-outline' },
];

const GOAL_MOTIVATION: Record<string, string> = {
  lose:     'Te ayudaremos a crear un deficit saludable y sostenible.',
  maintain: 'Mantendras tu peso actual con un plan equilibrado.',
  gain:     'Ganaras masa con un superavit controlado y nutritivo.',
};

export default function Step10Goal({ onNext, onBack, step, totalSteps, onSkip }: StepProps) {
  const { data, update } = useOnboarding();
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSelect = useCallback((value: typeof data.goal) => {
    haptics.selection();
    update('goal', value);

    // Auto-advance after a brief delay so the user sees their selection
    if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
    autoAdvanceTimer.current = setTimeout(() => {
      onNext();
    }, 500);
  }, [update, onNext]);

  // Clear timer on unmount
  React.useEffect(() => {
    return () => {
      if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
    };
  }, []);

  const motivationText = data.goal
    ? GOAL_MOTIVATION[data.goal]
    : 'Esto define tu plan de calorias diarias y progreso esperado.';

  return (
    <OnboardingLayout
      step={step}
      totalSteps={totalSteps}
      onBack={onBack}
      onSkip={onSkip}
      footer={<PrimaryButton label="Continuar" onPress={onNext} disabled={!data.goal} />}
    >
      <Text style={styles.title}>Cual es tu objetivo?</Text>
      <Text style={styles.subtitle}>
        {motivationText}
      </Text>

      <View style={styles.options}>
        {OPTIONS.map(opt => (
          <OptionCard
            key={opt.value}
            label={opt.label}
            subtitle={opt.subtitle}
            icon={opt.icon}
            selected={data.goal === opt.value}
            onPress={() => handleSelect(opt.value)}
          />
        ))}
      </View>
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, color: colors.black, marginTop: spacing.md },
  subtitle: { ...typography.subtitle, color: colors.gray, marginTop: spacing.sm, minHeight: 40 },
  options: { marginTop: spacing.xxl, gap: spacing.sm + 4 },
});
