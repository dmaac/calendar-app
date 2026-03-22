import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import OptionCard from '../../components/onboarding/OptionCard';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { useOnboarding } from '../../context/OnboardingContext';
import { StepProps } from './OnboardingNavigator';

export default function Step06OtherApps({ onNext, onBack, step, totalSteps, onSkip }: StepProps) {
  const { data, update } = useOnboarding();
  const selected = data.usedOtherApps;

  return (
    <OnboardingLayout
      step={step}
      totalSteps={totalSteps}
      onBack={onBack}
      onSkip={onSkip}
      footer={<PrimaryButton label="Continuar" onPress={onNext} disabled={selected === null} />}
    >

      <Text style={styles.title}>Has probado otras{'\n'}apps de calorias?</Text>
      <Text style={styles.subtitle}>
        No importa tu respuesta, Fitsi IA se adapta a ti.
      </Text>

      <View style={styles.options}>
        <OptionCard
          label="Si, he usado otras apps"
          emoji={'\u{1F44D}'}
          selected={selected === true}
          onPress={() => update('usedOtherApps', true)}
        />
        <OptionCard
          label="No, es mi primera vez"
          emoji={'\u{1F44E}'}
          selected={selected === false}
          onPress={() => update('usedOtherApps', false)}
        />
      </View>

    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, color: colors.black, marginTop: spacing.md },
  subtitle: { ...typography.subtitle, color: colors.gray, marginTop: spacing.sm },
  options: { marginTop: spacing.xxl, gap: spacing.sm + 4 },
});
