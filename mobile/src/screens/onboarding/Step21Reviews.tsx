import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, radius } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { StepProps } from './OnboardingNavigator';

const REVIEWS = [
  {
    name: 'Sarah M.',
    avatar: '👩',
    stars: 5,
    text: '¡Perdí 5.5 kg en 6 semanas! El escáner de comida con IA es increíblemente preciso. Solo apunta y registra.',
    date: 'Hace 2 días',
  },
  {
    name: 'James K.',
    avatar: '👨',
    stars: 5,
    text: '¡Por fin una app que no me hace obsesionar con cada caloría. Simplemente funciona. Bajé 8 kg!',
    date: 'Hace 1 semana',
  },
  {
    name: 'Priya R.',
    avatar: '👩🏽',
    stars: 5,
    text: 'El plan personalizado se adaptó perfectamente a mi estilo de vida. No cambié mucho, pero los resultados son increíbles.',
    date: 'Hace 2 semanas',
  },
];

function Stars({ count }: { count: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {Array.from({ length: count }).map((_, i) => (
        <Ionicons key={i} name="star" size={14} color="#FFB800" />
      ))}
    </View>
  );
}

export default function Step21Reviews({ onNext, onBack, step, totalSteps }: StepProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  }, []);

  return (
    <OnboardingLayout
      step={step}
      totalSteps={totalSteps}
      onBack={onBack}
      scrollable={false}
      footer={<PrimaryButton label="Continuar" onPress={onNext} />}
    >
      <Text style={styles.title}>Amado por{'\n'}miles de personas</Text>

      <Animated.View style={[{ opacity: fadeAnim }, styles.ratingRow]}>
        <Text style={styles.ratingNumber}>4.8</Text>
        <View style={{ gap: 4 }}>
          <Stars count={5} />
          <Text style={styles.ratingCount}>12,400+ valoraciones</Text>
        </View>
      </Animated.View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <Animated.View style={[{ opacity: fadeAnim }, styles.reviewsList]}>
          {REVIEWS.map((r, i) => (
            <View key={i} style={styles.reviewCard}>
              <View style={styles.reviewHeader}>
                <Text style={styles.avatar}>{r.avatar}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.reviewName}>{r.name}</Text>
                  <Stars count={r.stars} />
                </View>
                <Text style={styles.reviewDate}>{r.date}</Text>
              </View>
              <Text style={styles.reviewText}>{r.text}</Text>
            </View>
          ))}
          <View style={{ height: 80 }} />
        </Animated.View>
      </ScrollView>
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, color: colors.black, marginTop: spacing.md },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  ratingNumber: {
    fontSize: 52,
    fontWeight: '800',
    color: colors.black,
    letterSpacing: -2,
  },
  ratingCount: { ...typography.caption, color: colors.gray },
  reviewsList: { gap: spacing.md },
  reviewCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  avatar: { fontSize: 28, lineHeight: 32 },
  reviewName: { ...typography.label, color: colors.black },
  reviewDate: { ...typography.caption, color: colors.gray },
  reviewText: { ...typography.subtitle, color: colors.black, lineHeight: 22 },
});
