import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors, typography, spacing } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import OptionCard from '../../components/onboarding/OptionCard';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { useOnboarding } from '../../context/OnboardingContext';
import { StepProps } from './OnboardingNavigator';

const SOURCES = [
  { label: 'App Store',       icon: 'logo-apple-appstore' },
  { label: 'TikTok',          icon: 'musical-notes-outline' },
  { label: 'YouTube',         icon: 'logo-youtube' },
  { label: 'TV',              icon: 'tv-outline' },
  { label: 'X / Twitter',     icon: 'logo-twitter' },
  { label: 'Instagram',       icon: 'logo-instagram' },
  { label: 'Google',          icon: 'logo-google' },
  { label: 'Facebook',        icon: 'logo-facebook' },
  { label: 'Friend / Family', icon: 'people-outline' },
  { label: 'Other',           icon: 'ellipsis-horizontal-circle-outline' },
];

export default function Step05Source({ onNext, onBack, step, totalSteps }: StepProps) {
  const { data, update } = useOnboarding();
  const selected = data.heardFrom;

  return (
    <OnboardingLayout step={step} totalSteps={totalSteps} onBack={onBack} scrollable={false}>

      <Text style={styles.title}>Where did you hear{'\n'}about us?</Text>

      {/* Lista scrollable */}
      <ScrollView
        style={styles.list}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      >
        {SOURCES.map(src => (
          <OptionCard
            key={src.label}
            label={src.label}
            icon={src.icon}
            selected={selected === src.label}
            onPress={() => update('heardFrom', src.label)}
          />
        ))}
        {/* Padding extra para el botón flotante */}
        <View style={{ height: 80 }} />
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton label="Continue" onPress={onNext} disabled={!selected} />
      </View>

    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, color: colors.black, marginTop: spacing.md, marginBottom: spacing.md },
  list: { flex: 1 },
  listContent: { gap: spacing.sm + 2, paddingBottom: spacing.sm },
  footer: { position: 'absolute', bottom: spacing.lg, left: spacing.lg, right: spacing.lg },
});
