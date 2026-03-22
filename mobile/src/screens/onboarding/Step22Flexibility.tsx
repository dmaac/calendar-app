import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
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
  // Pre-create a fixed number of refs to satisfy Rules of Hooks (no hooks inside loops)
  const fade0 = useRef(new Animated.Value(0)).current;
  const fade1 = useRef(new Animated.Value(0)).current;
  const fade2 = useRef(new Animated.Value(0)).current;
  const fade3 = useRef(new Animated.Value(0)).current;
  const fadeAnims = [fade0, fade1, fade2, fade3];

  useEffect(() => {
    Animated.stagger(120,
      fadeAnims.map(a => Animated.timing(a, { toValue: 1, duration: 400, useNativeDriver: true }))
    ).start();
  }, []);

  return (
    <OnboardingLayout
      step={step}
      totalSteps={totalSteps}
      onBack={onBack}
      footer={<PrimaryButton label="Continuar" onPress={onNext} />}
    >
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
    borderRadius: radius.lg,
    padding: spacing.md,
    width: '48%',
    gap: spacing.xs,
  },
  emoji: { fontSize: 28, lineHeight: 36 },
  cardTitle: { ...typography.label, color: colors.black, fontWeight: '700' },
  cardDesc: { ...typography.caption, color: colors.black, lineHeight: 18 },
});
