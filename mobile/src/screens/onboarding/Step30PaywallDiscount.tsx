/**
 * Step30PaywallDiscount — Discounted paywall after spin-the-wheel
 *
 * Shows a time-limited discount offer with RevenueCat integration.
 * Uses the same RevenueCat offerings but displays a discounted presentation.
 * The actual discount is configured in the App Store / Play Store
 * via introductory offers or promotional offers in RevenueCat.
 */
import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, radius } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { StepProps } from './OnboardingNavigator';
import { useAuth } from '../../context/AuthContext';
import * as purchaseService from '../../services/purchase.service';

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
  const { setPremiumStatus } = useAuth();
  const countdown = useCountdown(COUNTDOWN_SECS);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [annualPackage, setAnnualPackage] = useState<any>(null);
  const [displayPrice, setDisplayPrice] = useState('$29.99');
  const [displayPerMonth, setDisplayPerMonth] = useState('$2.49');

  // ── Animations ────────────────────────────────────────────────────────────
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // ── Load offerings ────────────────────────────────────────────────────────
  useEffect(() => {
    loadOfferings();
  }, []);

  const loadOfferings = async () => {
    try {
      const packages = await purchaseService.getCurrentPackages();

      if (packages.annual) {
        setAnnualPackage(packages.annual);
        // Use the annual offering price — the discount should be configured
        // in RevenueCat/App Store as an introductory offer
        setDisplayPrice(packages.annual.product.priceString);
        setDisplayPerMonth(
          `$${(packages.annual.product.price / 12).toFixed(2)}`
        );
      }
    } catch (err) {
      console.error('[Step30PaywallDiscount] Failed to load offerings:', err);
    }
  };

  // ── Purchase ──────────────────────────────────────────────────────────────
  const handlePurchase = useCallback(async () => {
    if (!annualPackage) {
      // No package available — skip
      onNext();
      return;
    }

    setLoading(true);

    try {
      const result = await purchaseService.purchasePackage(annualPackage);

      if (result.userCancelled) {
        return;
      }

      if (result.success && result.isPremium) {
        setPremiumStatus(true);
        onNext();
        return;
      }

      if (result.error) {
        Alert.alert('Error', result.error, [{ text: 'OK' }]);
      }
    } catch (err) {
      console.error('[Step30PaywallDiscount] Purchase error:', err);
      Alert.alert('Error', 'No se pudo completar la compra. Intenta de nuevo.', [{ text: 'OK' }]);
    } finally {
      setLoading(false);
    }
  }, [annualPackage, setPremiumStatus, onNext]);

  // ── Restore ───────────────────────────────────────────────────────────────
  const handleRestore = useCallback(async () => {
    setRestoring(true);

    try {
      const result = await purchaseService.restorePurchases();

      if (result.isPremium) {
        setPremiumStatus(true);
        Alert.alert(
          'Compra restaurada',
          'Tu suscripcion Premium ha sido restaurada.',
          [{ text: 'Continuar', onPress: onNext }]
        );
      } else if (result.success) {
        Alert.alert(
          'Sin compras previas',
          'No encontramos suscripciones anteriores.',
          [{ text: 'OK' }]
        );
      } else if (result.error) {
        Alert.alert('Error', result.error, [{ text: 'OK' }]);
      }
    } catch (err) {
      Alert.alert('Error', 'No se pudo restaurar la compra.', [{ text: 'OK' }]);
    } finally {
      setRestoring(false);
    }
  }, [setPremiumStatus, onNext]);

  return (
    <OnboardingLayout
      step={step}
      totalSteps={totalSteps}
      onBack={onBack}
      footer={
        <>
          <PrimaryButton
            label={loading ? 'Procesando...' : 'Reclamar 80% OFF \u2014 Prueba gratis'}
            onPress={handlePurchase}
            disabled={loading}
          />
          <TouchableOpacity onPress={onNext} style={styles.skipBtn}>
            <Text style={styles.skipText}>No gracias, prefiero pagar precio completo</Text>
          </TouchableOpacity>
        </>
      }
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
            <Text style={styles.priceNew}>{displayPerMonth}</Text>
            <Text style={styles.pricePerMonth}>/mes</Text>
          </View>
          <Text style={styles.priceNote}>Cobrado como {displayPrice}/a{'\u00F1'}o {'\u00B7'} Primeros 7 dias GRATIS</Text>
        </View>

        {/* Timer */}
        <View style={styles.timerRow}>
          <Ionicons name="timer-outline" size={18} color={colors.accent} />
          <Text style={styles.timerText}>La oferta expira en </Text>
          <Text style={styles.timerValue}>{countdown}</Text>
        </View>

        {/* Restore purchases */}
        <TouchableOpacity
          style={styles.restoreBtn}
          onPress={handleRestore}
          disabled={restoring}
        >
          {restoring ? (
            <ActivityIndicator size="small" color={colors.gray} />
          ) : (
            <Text style={styles.restoreText}>Restaurar compra anterior</Text>
          )}
        </TouchableOpacity>

        {/* Guarantee */}
        <View style={styles.guaranteeRow}>
          <Ionicons name="shield-checkmark-outline" size={16} color={colors.gray} />
          <Text style={styles.guaranteeText}>Garantia de devolucion de 30 dias {'\u00B7'} Cancela cuando quieras</Text>
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
  restoreBtn: { alignItems: 'center', paddingVertical: spacing.xs },
  restoreText: { ...typography.caption, color: colors.gray, textDecorationLine: 'underline' },
  guaranteeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  guaranteeText: { ...typography.caption, color: colors.gray },
  skipBtn: { alignItems: 'center', paddingVertical: spacing.xs },
  skipText: { ...typography.caption, color: colors.gray },
});
