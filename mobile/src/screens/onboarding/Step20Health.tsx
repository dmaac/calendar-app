import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, radius } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { useOnboarding } from '../../context/OnboardingContext';
import { StepProps } from './OnboardingNavigator';

const PERMS = [
  { icon: 'scale-outline',   label: 'Peso' },
  { icon: 'walk-outline',    label: 'Pasos' },
  { icon: 'flame-outline',   label: 'Calorias quemadas' },
  { icon: 'heart-outline',   label: 'Frecuencia cardiaca' },
];

export default function Step20Health({ onNext, onBack, step, totalSteps, onSkip }: StepProps) {
  const { update } = useOnboarding();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, []);

  const handleConnect = async () => {
    // In production: request HealthKit (iOS) or Health Connect (Android) permissions
    update('healthConnected', true);
    onNext();
  };

  const handleSkip = () => {
    update('healthConnected', false);
    onNext();
  };

  const appName = Platform.OS === 'ios' ? 'Apple Health' : 'Google Health';
  const iconName = Platform.OS === 'ios' ? 'heart-circle' : 'fitness';

  const footer = (
    <>
      <PrimaryButton label={`Conectar ${appName}`} onPress={handleConnect} />
      <PrimaryButton label="Ahora no" onPress={handleSkip} variant="ghost" />
    </>
  );

  return (
    <OnboardingLayout
      step={step}
      totalSteps={totalSteps}
      onBack={onBack}
      onSkip={onSkip}
      footer={footer}
    >
      <Text
        style={styles.title}
        accessibilityRole="header"
      >
        Conectar con{'\n'}{appName}
      </Text>

      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        {/* App icons with connection indicator */}
        <View
          style={styles.iconRow}
          accessibilityLabel={`Conectar ${appName} con Fitsi IA`}
        >
          <View style={[styles.appIcon, { backgroundColor: '#FF2D55' }]}>
            <Ionicons name={iconName as any} size={40} color={colors.white} />
          </View>
          <View style={styles.connectLine}>
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={styles.dot} />
          </View>
          <View style={[styles.appIcon, { backgroundColor: colors.black }]}>
            <Ionicons name="nutrition" size={40} color={colors.white} />
          </View>
        </View>

        <Text style={styles.desc}>
          Sincroniza tus datos de salud para un registro mas preciso de calorias y actividad.
        </Text>

        {/* Permissions list */}
        <View
          style={styles.permsCard}
          accessibilityRole="list"
          accessibilityLabel="Datos que leeremos de tu app de salud"
        >
          <Text style={styles.permsTitle}>Leeremos:</Text>
          {PERMS.map((p, i) => (
            <View
              key={i}
              style={styles.permRow}
              accessibilityLabel={`${p.label}: permitido`}
            >
              <Ionicons name={p.icon as any} size={18} color={colors.gray} />
              <Text style={styles.permLabel}>{p.label}</Text>
              <Ionicons
                name="checkmark-circle"
                size={18}
                color={colors.accent}
                style={styles.permCheck}
              />
            </View>
          ))}
        </View>
      </Animated.View>
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  title: {
    ...typography.title,
    color: colors.black,
    marginTop: spacing.md,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.xl,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  appIcon: {
    width: 72,
    height: 72,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  connectLine: {
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.grayLight,
  },
  desc: {
    ...typography.subtitle,
    color: colors.gray,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: spacing.md,
  },
  permsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  permsTitle: {
    ...typography.label,
    color: colors.black,
    marginBottom: spacing.xs,
  },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  permLabel: {
    ...typography.option,
    color: colors.black,
    flex: 1,
  },
  permCheck: {
    marginLeft: 'auto',
  },
});
