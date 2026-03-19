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
    <OnboardingLayout
      step={step}
      totalSteps={totalSteps}
      onBack={onBack}
      footer={<><PrimaryButton label="Aplicar código" onPress={handleContinue} disabled={code.trim().length === 0} /><PrimaryButton label="Omitir" onPress={onNext} variant="ghost" /></>}
    >
      <Text style={styles.title}>¿Tienes un{'\n'}código de referido?</Text>
      <Text style={styles.subtitle}>Ingresa el código de un amigo para desbloquear un descuento especial.</Text>

      <View style={styles.content}>
        <View style={styles.giftIcon}>
          <Text style={{ fontSize: 48 }}>🎁</Text>
        </View>

        <View style={[styles.inputWrapper, error ? styles.inputError : null]}>
          <Ionicons name="pricetag-outline" size={20} color={colors.gray} />
          <TextInput
            style={styles.input}
            placeholder="Ingresa tu código (ej. AMIGO20)"
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
          Tú y tu amigo obtienen un descuento especial al suscribirse.
        </Text>
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
});
