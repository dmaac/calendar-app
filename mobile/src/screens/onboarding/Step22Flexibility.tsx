import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, radius } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { StepProps } from './OnboardingNavigator';

const FEATURES = [
  {
    icon: 'camera-outline',
    emoji: '📸',
    title: 'Fotografía y registra',
    desc: 'Solo toma una foto. Nuestra IA identifica tu comida y registra cada macro al instante.',
  },
  {
    icon: 'person-outline',
    emoji: '🧠',
    title: '100% personalizado',
    desc: 'Tu plan se adapta a tus objetivos, dieta y estilo de vida — no es una plantilla genérica.',
  },
  {
    icon: 'trending-down-outline',
    emoji: '📉',
    title: 'Resultados reales',
    desc: 'Los usuarios pierden el doble de peso vs. el registro manual. La constancia nunca fue tan fácil.',
  },
  {
    icon: 'time-outline',
    emoji: '⚡',
    title: 'Ahorra tiempo',
    desc: 'Sin registros tediosos. Registra una comida completa en segundos.',
  },
];

export default function Step22Flexibility({ onNext, onBack, step, totalSteps }: StepProps) {
  const fadeAnims = FEATURES.map(() => useRef(new Animated.Value(0)).current);

  useEffect(() => {
    Animated.stagger(120,
      fadeAnims.map(a => Animated.timing(a, { toValue: 1, duration: 400, useNativeDriver: true }))
    ).start();
  }, []);

  return (
    <OnboardingLayout step={step} totalSteps={totalSteps} onBack={onBack}>
      <Text style={styles.title}>Todo lo que{'\n'}necesitas para lograrlo</Text>

      <View style={styles.grid}>
        {FEATURES.map((f, i) => (
          <Animated.View key={i} style={[styles.card, { opacity: fadeAnims[i] }]}>
            <Text style={styles.emoji}>{f.emoji}</Text>
            <Text style={styles.cardTitle}>{f.title}</Text>
            <Text style={styles.cardDesc}>{f.desc}</Text>
          </Animated.View>
        ))}
      </View>

      <View style={styles.footer}>
        <PrimaryButton label="Continuar" onPress={onNext} />
      </View>
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, color: colors.black, marginTop: spacing.md },
  grid: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    width: '48%',
    gap: spacing.xs,
  },
  emoji: { fontSize: 28, lineHeight: 36 },
  cardTitle: { ...typography.label, color: colors.black, fontWeight: '700' },
  cardDesc: { ...typography.caption, color: colors.gray, lineHeight: 18 },
  footer: { position: 'absolute', bottom: spacing.lg, left: spacing.lg, right: spacing.lg },
});
