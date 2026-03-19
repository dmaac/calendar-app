import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors, typography, spacing } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import OptionCard from '../../components/onboarding/OptionCard';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { useOnboarding } from '../../context/OnboardingContext';
import { StepProps } from './OnboardingNavigator';

const OPTIONS = [
  { label: 'Build healthy habits',    icon: 'fitness-outline' },
  { label: 'Improve my energy',       icon: 'flash-outline' },
  { label: 'Feel confident',          icon: 'star-outline' },
  { label: 'Eat more mindfully',      icon: 'restaurant-outline' },
  { label: 'Reduce stress',           icon: 'leaf-outline' },
  { label: 'Sleep better',            icon: 'moon-outline' },
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
    <OnboardingLayout step={step} totalSteps={totalSteps} onBack={onBack} scrollable={false}>
      <Text style={styles.title}>What do you want{'\n'}to accomplish?</Text>
      <Text style={styles.subtitle}>Select all that apply.</Text>

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
        <PrimaryButton label="Continue" onPress={onNext} disabled={selected.length === 0} />
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
