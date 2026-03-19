import React, { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, radius } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { StepProps } from './OnboardingNavigator';

const COUNTDOWN_SECS = 15 * 60; // 15 minutes

function useCountdown(seconds: number) {
  const [remaining, setRemaining] = useState(seconds);
  useEffect(() => {
    const t = setInterval(() => setRemaining(r => Math.max(0, r - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  const m = String(Math.floor(remaining / 60)).padStart(2, '0');
  const s = String(remaining % 60).padStart(2, '0');
  return `${m}:${s}`;
}

export default function Step30PaywallDiscount({ onNext, onBack, step, totalSteps }: StepProps) {
  const countdown = useCountdown(COUNTDOWN_SECS);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    // Pulse the discount badge
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <OnboardingLayout
      step={step}
      totalSteps={totalSteps}
      onBack={onBack}
      footer={<><PrimaryButton label="Reclamar 80% OFF — Prueba gratis" onPress={onNext} /><TouchableOpacity onPress={onNext} style={styles.skipBtn}><Text style={styles.skipText}>No gracias, prefiero pagar precio completo</Text></TouchableOpacity></>}
    >
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        {/* Discount badge */}
        <Animated.View style={[styles.discountBadge, { transform: [{ scale: pulseAnim }] }]}>
          <Text style={styles.discountText}>80% OFF</Text>
          <Text style={styles.discountSub}>VITALICIO</Text>
        </Animated.View>

        <Text style={styles.title}>Oferta especial{'\n'}solo para ti</Text>

        {/* Price comparison */}
        <View style={styles.priceCard}>
          <View style={styles.priceRow}>
            <Text style={styles.priceOld}>$12.99</Text>
            <Text style={styles.priceLabel}>Mensual</Text>
          </View>
          <View style={styles.priceDivider} />
          <View style={styles.priceRowNew}>
            <Text style={styles.priceNew}>$2.49</Text>
            <Text style={styles.pricePerMonth}>/mes</Text>
          </View>
          <Text style={styles.priceNote}>Cobrado como $29.99/año · Primeros 3 días GRATIS</Text>
        </View>

        {/* Timer */}
        <View style={styles.timerRow}>
          <Ionicons name="timer-outline" size={18} color={colors.accent} />
          <Text style={styles.timerText}>La oferta expira en </Text>
          <Text style={styles.timerValue}>{countdown}</Text>
        </View>

        {/* Guarantee */}
        <View style={styles.guaranteeRow}>
          <Ionicons name="shield-checkmark-outline" size={16} color={colors.gray} />
          <Text style={styles.guaranteeText}>Garantía de devolución de 30 días · Cancela cuando quieras</Text>
        </View>
      </Animated.View>
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xl },
  discountBadge: {
    backgroundColor: colors.accent,
    borderRadius: 20,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  discountText: { fontSize: 36, fontWeight: '900', color: colors.white, letterSpacing: -1 },
  discountSub: { ...typography.label, color: 'rgba(255,255,255,0.8)', letterSpacing: 2 },
  title: { ...typography.title, color: colors.black, textAlign: 'center' },
  priceCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: spacing.lg,
    width: '100%',
    alignItems: 'center',
    gap: spacing.sm,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  priceOld: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.gray,
    textDecorationLine: 'line-through',
  },
  priceLabel: { ...typography.label, color: colors.gray },
  priceDivider: { width: '60%', height: 1, backgroundColor: colors.grayLight },
  priceRowNew: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  priceNew: { fontSize: 48, fontWeight: '900', color: colors.black, letterSpacing: -2 },
  pricePerMonth: { ...typography.subtitle, color: colors.gray },
  priceNote: { ...typography.caption, color: colors.gray, textAlign: 'center' },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: '#FFF0EC',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  timerText: { ...typography.label, color: colors.black },
  timerValue: { ...typography.label, color: colors.accent, fontWeight: '800', fontVariant: ['tabular-nums'] },
  guaranteeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  guaranteeText: { ...typography.caption, color: colors.gray },
  skipBtn: { alignItems: 'center', paddingVertical: spacing.xs },
  skipText: { ...typography.caption, color: colors.gray },
});
