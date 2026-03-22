import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { colors, typography, spacing, radius } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { useOnboarding } from '../../context/OnboardingContext';
import { StepProps } from './OnboardingNavigator';
import { Ionicons } from '@expo/vector-icons';
import { haptics } from '../../hooks/useHaptics';

const OPTIONS = [
  { value: 'Male' as const, label: 'Hombre', icon: 'male' as const, color: '#4285F4' },
  { value: 'Female' as const, label: 'Mujer', icon: 'female' as const, color: '#EC4899' },
  { value: 'Other' as const, label: 'Otro', icon: 'male-female' as const, color: '#8B5CF6' },
];

function GenderCard({ label, icon, color, selected, onPress }: {
  label: string; icon: string; color: string; selected: boolean; onPress: () => void;
}) {
  const scale = React.useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    haptics.selection();
    Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale }], flex: 1 }}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
        style={[
          styles.genderCard,
          selected && { backgroundColor: colors.black, borderColor: colors.black },
        ]}
        accessibilityLabel={label}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
      >
        <View style={[styles.iconCircle, { backgroundColor: selected ? 'rgba(255,255,255,0.15)' : color + '15' }]}>
          <Ionicons name={icon as any} size={36} color={selected ? '#FFFFFF' : color} />
        </View>
        <Text style={[styles.genderLabel, selected && { color: colors.white }]}>{label}</Text>
        {selected && <Ionicons name="checkmark-circle" size={20} color={colors.white} style={{ position: 'absolute', top: 10, right: 10 }} />}
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function Step03Gender({ onNext, onBack, step, totalSteps }: StepProps) {
  const { data, update } = useOnboarding();
  const selected = data.gender;

  const handleSelect = (value: typeof data.gender) => {
    update('gender', value);
  };

  return (
    <OnboardingLayout
      step={step}
      totalSteps={totalSteps}
      onBack={onBack}
      footer={<PrimaryButton label="Continuar" onPress={onNext} disabled={!selected} />}
    >

      {/* Titulo */}
      <Text style={styles.title}>Cual es tu genero?</Text>
      <Text style={styles.subtitle}>
        Tu metabolismo varia segun tu genero. Lo usamos para calcular tus calorias.
      </Text>

      {/* Opciones — visual cards with large icons */}
      <View style={styles.options}>
        {OPTIONS.map(opt => (
          <GenderCard
            key={opt.value}
            label={opt.label}
            icon={opt.icon}
            color={opt.color}
            selected={selected === opt.value}
            onPress={() => handleSelect(opt.value)}
          />
        ))}
      </View>

    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  title: {
    ...typography.title,
    color: colors.black,
    marginTop: spacing.md,
  },
  subtitle: {
    ...typography.subtitle,
    color: colors.gray,
    marginTop: spacing.sm,
  },
  options: {
    marginTop: spacing.xxl,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  genderCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    borderWidth: 2,
    borderColor: 'transparent',
    gap: spacing.sm,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  genderLabel: {
    ...typography.option,
    color: colors.black,
    fontWeight: '600',
  },
});
