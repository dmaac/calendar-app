import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, radius } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { useOnboarding } from '../../context/OnboardingContext';
import { StepProps } from './OnboardingNavigator';

export default function Step24Referral({ onNext, onBack, step, totalSteps }: StepProps) {
  const { data, update } = useOnboarding();
  const [code, setCode] = useState(data.referralCode || '');
  const [error, setError] = useState('');

  const handleChange = (text: string) => {
    setCode(text.toUpperCase());
    setError('');
  };

  const handleContinue = () => {
    update('referralCode', code.trim());
    onNext();
  };

  return (
    <OnboardingLayout step={step} totalSteps={totalSteps} onBack={onBack}>
      <Text style={styles.title}>Have a{'\n'}referral code?</Text>
      <Text style={styles.subtitle}>Enter a friend's code to unlock a bonus discount.</Text>

      <View style={styles.content}>
        <View style={styles.giftIcon}>
          <Text style={{ fontSize: 48 }}>🎁</Text>
        </View>

        <View style={[styles.inputWrapper, error ? styles.inputError : null]}>
          <Ionicons name="pricetag-outline" size={20} color={colors.gray} />
          <TextInput
            style={styles.input}
            placeholder="Enter code (e.g. FRIEND20)"
            placeholderTextColor={colors.gray}
            value={code}
            onChangeText={handleChange}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={20}
          />
          {code.length > 0 && (
            <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
          )}
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Text style={styles.hint}>
          Both you and your friend get a special discount when you subscribe.
        </Text>
      </View>

      <View style={styles.footer}>
        <PrimaryButton label="Apply Code" onPress={handleContinue} disabled={code.trim().length === 0} />
        <PrimaryButton label="Skip" onPress={onNext} variant="ghost" />
      </View>
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, color: colors.black, marginTop: spacing.md },
  subtitle: { ...typography.subtitle, color: colors.gray, marginTop: spacing.sm },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.lg,
    alignItems: 'center',
  },
  giftIcon: {
    width: 100, height: 100,
    borderRadius: 50,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 56,
    gap: spacing.sm,
    width: '100%',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  inputError: { borderColor: '#FF3B30' },
  input: {
    flex: 1,
    ...typography.option,
    color: colors.black,
    letterSpacing: 1,
  },
  errorText: { ...typography.caption, color: '#FF3B30' },
  hint: {
    ...typography.caption,
    color: colors.gray,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    lineHeight: 18,
  },
  footer: {
    position: 'absolute',
    bottom: spacing.lg,
    left: spacing.lg,
    right: spacing.lg,
    gap: spacing.sm,
  },
});
