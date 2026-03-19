import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, radius } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { StepProps } from './OnboardingNavigator';

const FEATURES = [
  { icon: 'lock-closed-outline', text: 'Your data is encrypted and never sold' },
  { icon: 'eye-off-outline',     text: 'We never share your personal info' },
  { icon: 'shield-checkmark-outline', text: 'HIPAA-compliant data storage' },
  { icon: 'trash-outline',       text: 'Delete your data anytime, instantly' },
];

export default function Step19Trust({ onNext, onBack, step, totalSteps }: StepProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 10, bounciness: 4 }),
    ]).start();
  }, []);

  return (
    <OnboardingLayout step={step} totalSteps={totalSteps} onBack={onBack}>
      <Text style={styles.title}>Your privacy{'\n'}is our priority</Text>

      <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
        {/* Big lock icon */}
        <View style={styles.iconCircle}>
          <Ionicons name="shield-checkmark" size={56} color={colors.black} />
        </View>

        <Text style={styles.subtitle}>
          We take your privacy seriously. Here's our commitment to you:
        </Text>

        <View style={styles.features}>
          {FEATURES.map((f, i) => (
            <View key={i} style={styles.featureRow}>
              <View style={styles.featureIcon}>
                <Ionicons name={f.icon as any} size={20} color={colors.black} />
              </View>
              <Text style={styles.featureText}>{f.text}</Text>
            </View>
          ))}
        </View>

        <View style={styles.badge}>
          <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
          <Text style={styles.badgeText}>No ads. No spam. No nonsense.</Text>
        </View>
      </Animated.View>

      <View style={styles.footer}>
        <PrimaryButton label="I Understand" onPress={onNext} />
      </View>
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, color: colors.black, marginTop: spacing.md },
  content: { flex: 1, justifyContent: 'center', gap: spacing.xl },
  iconCircle: {
    width: 100, height: 100,
    borderRadius: 50,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
  },
  subtitle: {
    ...typography.subtitle,
    color: colors.gray,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: spacing.md,
  },
  features: { gap: spacing.md },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  featureIcon: {
    width: 36, height: 36,
    borderRadius: 18,
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureText: { ...typography.option, color: colors.black, flex: 1, lineHeight: 22 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  badgeText: { ...typography.caption, color: colors.gray },
  footer: { position: 'absolute', bottom: spacing.lg, left: spacing.lg, right: spacing.lg },
});
