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
    title: 'Snap & Track',
    desc: 'Just take a photo. Our AI identifies your food and logs every macro instantly.',
  },
  {
    icon: 'person-outline',
    emoji: '🧠',
    title: 'Truly Personal',
    desc: 'Your plan adapts to your goals, diet, and lifestyle — not a generic template.',
  },
  {
    icon: 'trending-down-outline',
    emoji: '📉',
    title: 'Real Results',
    desc: 'Users lose 2x more weight vs tracking manually. Consistency made easy.',
  },
  {
    icon: 'time-outline',
    emoji: '⚡',
    title: '30 Seconds/Day',
    desc: 'No more tedious logging. Track a full meal in seconds, not minutes.',
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
      <Text style={styles.title}>Everything you{'\n'}need to succeed</Text>

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
        <PrimaryButton label="Continue" onPress={onNext} />
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
