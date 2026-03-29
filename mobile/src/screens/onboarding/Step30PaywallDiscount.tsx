/**
 * Step30PaywallDiscount — Discounted paywall after spin-the-wheel (50% OFF first year)
 *
 * Shows the one-time promotional offer the user "won" on the spin wheel:
 *   - Original price crossed out: ~~$59.99/year~~
 *   - Discounted price: $29.99/year (first year only)
 *   - Countdown timer creating urgency (15 min)
 *   - "Solo por hoy" badge
 *   - RevenueCat promotional offer / introductory price integration
 *   - Fine print about auto-renewal at full price
 *   - "No gracias" skip link
 *
 * Dark mode support via useThemeColors.
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
import { typography, spacing, radius, shadows, useThemeColors } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import { StepProps } from './OnboardingNavigator';
import { useAuth } from '../../context/AuthContext';
import { useAnalytics } from '../../hooks/useAnalytics';
import { haptics } from '../../hooks/useHaptics';
import * as purchaseService from '../../services/purchase.service';

// ── Constants ────────────────────────────────────────────────────────────────

const COUNTDOWN_SECS = 15 * 60; // 15 minutes
const ORIGINAL_PRICE = 59.99;
const DISCOUNTED_PRICE = 29.99;
const DISCOUNT_PERCENT = 50;

// ── Countdown hook ───────────────────────────────────────────────────────────

function useCountdown(seconds: number) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    const t = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  return { remaining, formatted };
}

// ── Component ────────────────────────────────────────────────────────────────

export default function Step30PaywallDiscount({ onNext, onBack, step, totalSteps }: StepProps) {
  const c = useThemeColors();
  const { setPremiumStatus } = useAuth();
  const { track } = useAnalytics('PaywallDiscount');
  const { remaining, formatted: countdown } = useCountdown(COUNTDOWN_SECS);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const badgePulse = useRef(new Animated.Value(1)).current;
  const ctaPulse = useRef(new Animated.Value(1)).current;
  const timerShake = useRef(new Animated.Value(0)).current;

  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [annualPackage, setAnnualPackage] = useState<any>(null);
  const [displayOriginalPrice, setDisplayOriginalPrice] = useState(`$${ORIGINAL_PRICE.toFixed(2)}`);
  const [displayDiscountedPrice, setDisplayDiscountedPrice] = useState(`$${DISCOUNTED_PRICE.toFixed(2)}`);
  const [displayPerMonth, setDisplayPerMonth] = useState(`$${(DISCOUNTED_PRICE / 12).toFixed(2)}`);
  const [displaySavings, setDisplaySavings] = useState(`$${(ORIGINAL_PRICE - DISCOUNTED_PRICE).toFixed(2)}`);

  // ── Animations ──────────────────────────────────────────────────────────────

  useEffect(() => {
    // Fade in
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();

    // Badge pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(badgePulse, { toValue: 1.06, duration: 900, useNativeDriver: true }),
        Animated.timing(badgePulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    ).start();

    // CTA button subtle pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(ctaPulse, { toValue: 1.03, duration: 1100, useNativeDriver: true }),
        Animated.timing(ctaPulse, { toValue: 1, duration: 1100, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // Timer urgency shake when under 5 minutes
  useEffect(() => {
    if (remaining <= 300 && remaining > 0 && remaining % 60 === 0) {
      Animated.sequence([
        Animated.timing(timerShake, { toValue: 4, duration: 50, useNativeDriver: true }),
        Animated.timing(timerShake, { toValue: -4, duration: 50, useNativeDriver: true }),
        Animated.timing(timerShake, { toValue: 3, duration: 50, useNativeDriver: true }),
        Animated.timing(timerShake, { toValue: -3, duration: 50, useNativeDriver: true }),
        Animated.timing(timerShake, { toValue: 0, duration: 50, useNativeDriver: true }),
      ]).start();
      haptics.light();
    }
  }, [remaining]);

  // ── Load offerings ──────────────────────────────────────────────────────────

  useEffect(() => {
    loadOfferings();
  }, []);

  const loadOfferings = async () => {
    try {
      const packages = await purchaseService.getCurrentPackages();

      if (packages.annual) {
        setAnnualPackage(packages.annual);

        // Use the actual product price as the "original" price
        const fullPrice = packages.annual.product.price;
        setDisplayOriginalPrice(packages.annual.product.priceString);

        // Check for introductory offer from RevenueCat
        const introPrice = packages.annual.product.introPrice;
        if (introPrice) {
          setDisplayDiscountedPrice(introPrice.priceString);
          setDisplayPerMonth(`$${(introPrice.price / 12).toFixed(2)}`);
          setDisplaySavings(`$${(fullPrice - introPrice.price).toFixed(2)}`);
        } else {
          // Fallback: calculate 50% off the full price
          const discounted = fullPrice * 0.5;
          setDisplayDiscountedPrice(`$${discounted.toFixed(2)}`);
          setDisplayPerMonth(`$${(discounted / 12).toFixed(2)}`);
          setDisplaySavings(`$${(fullPrice - discounted).toFixed(2)}`);
        }

        track('discount_paywall_loaded', {
          originalPrice: fullPrice,
          hasIntroOffer: !!introPrice,
        });
      }
    } catch {
      // Failed to load offerings — use fallback prices
    }
  };

  // ── Purchase with promotional offer ─────────────────────────────────────────

  const handlePurchase = useCallback(async () => {
    if (!annualPackage) {
      onNext();
      return;
    }

    setLoading(true);
    haptics.medium();
    track('discount_purchase_started', { discount: DISCOUNT_PERCENT });

    try {
      // Use the promotional offer purchase path
      const result = await purchaseService.purchaseWithPromotionalOffer(annualPackage);

      if (result.userCancelled) {
        track('discount_purchase_cancelled');
        return;
      }

      if (result.success && result.isPremium) {
        track('discount_purchase_success', { discount: DISCOUNT_PERCENT });
        haptics.success();
        setPremiumStatus(true);
        onNext();
        return;
      }

      if (result.error) {
        track('discount_purchase_error', { error: result.error });
        Alert.alert('Error', result.error, [{ text: 'OK' }]);
      }
    } catch {
      track('discount_purchase_error', { error: 'unknown' });
      Alert.alert('Error', 'No se pudo completar la compra. Intenta de nuevo.', [{ text: 'OK' }]);
    } finally {
      setLoading(false);
    }
  }, [annualPackage, setPremiumStatus, onNext, track]);

  // ── Restore ─────────────────────────────────────────────────────────────────

  const handleRestore = useCallback(async () => {
    setRestoring(true);
    track('discount_restore_started');

    try {
      const result = await purchaseService.restorePurchases();

      if (result.isPremium) {
        setPremiumStatus(true);
        track('discount_restore_success');
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
    } catch {
      Alert.alert('Error', 'No se pudo restaurar la compra.', [{ text: 'OK' }]);
    } finally {
      setRestoring(false);
    }
  }, [setPremiumStatus, onNext, track]);

  // ── Skip ────────────────────────────────────────────────────────────────────

  const handleSkip = useCallback(() => {
    track('discount_skipped');
    onNext();
  }, [onNext, track]);

  // ── Derived state ───────────────────────────────────────────────────────────

  const timerUrgent = remaining <= 300; // under 5 min
  const timerExpired = remaining <= 0;

  return (
    <OnboardingLayout
      step={step}
      totalSteps={totalSteps}
      onBack={onBack}
      footer={
        <>
          {/* CTA button */}
          <Animated.View style={{ transform: [{ scale: ctaPulse }] }}>
            <TouchableOpacity
              style={[styles.ctaBtn, { backgroundColor: c.accent }]}
              onPress={handlePurchase}
              disabled={loading || timerExpired}
              activeOpacity={0.85}
              accessibilityLabel={`Aplicar descuento del ${DISCOUNT_PERCENT} por ciento`}
              accessibilityRole="button"
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="pricetag" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.ctaBtnText}>
                    {timerExpired ? 'Oferta expirada' : 'Aplicar descuento'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </Animated.View>

          {/* No thanks skip link */}
          <TouchableOpacity onPress={handleSkip} style={styles.skipBtn}>
            <Text style={[styles.skipText, { color: c.gray }]}>No gracias</Text>
          </TouchableOpacity>
        </>
      }
    >
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>

        {/* "Solo por hoy" badge */}
        <Animated.View
          style={[
            styles.todayBadge,
            { backgroundColor: c.accent, transform: [{ scale: badgePulse }] },
          ]}
        >
          <Ionicons name="flash" size={14} color="#FFFFFF" />
          <Text style={styles.todayBadgeText}>Solo por hoy</Text>
        </Animated.View>

        {/* Title */}
        <Text style={[styles.title, { color: c.black }]}>
          {DISCOUNT_PERCENT}% de descuento{'\n'}en tu primer a{'\u00F1'}o
        </Text>
        <Text style={[styles.subtitle, { color: c.gray }]}>
          Tu premio de la ruleta ha sido aplicado
        </Text>

        {/* Price card */}
        <View style={[styles.priceCard, { backgroundColor: c.surface }]}>
          {/* Savings badge */}
          <View style={[styles.savingsBadge, { backgroundColor: '#34A853' }]}>
            <Text style={styles.savingsBadgeText}>Ahorras {displaySavings}</Text>
          </View>

          {/* Original price crossed out */}
          <View style={styles.priceOriginalRow}>
            <Text style={[styles.priceOriginal, { color: c.gray }]}>
              {displayOriginalPrice}/a{'\u00F1'}o
            </Text>
          </View>

          {/* Discounted price */}
          <View style={styles.priceNewRow}>
            <Text style={[styles.priceNew, { color: c.black }]}>
              {displayDiscountedPrice}
            </Text>
            <Text style={[styles.priceNewPeriod, { color: c.gray }]}>/a{'\u00F1'}o</Text>
          </View>

          {/* Per month breakdown */}
          <Text style={[styles.pricePerMonth, { color: c.accent }]}>
            Solo {displayPerMonth}/mes
          </Text>

          {/* Divider */}
          <View style={[styles.divider, { backgroundColor: c.grayLight }]} />

          {/* Feature list */}
          <View style={styles.featureList}>
            {[
              'Escaneo de comidas ilimitado con IA',
              'Plan nutricional personalizado',
              'Coach inteligente 24/7',
              'Recetas y recomendaciones',
              'Analisis de progreso avanzado',
            ].map((feature, i) => (
              <View key={i} style={styles.featureRow}>
                <Ionicons name="checkmark-circle" size={18} color="#34A853" />
                <Text style={[styles.featureText, { color: c.black }]}>{feature}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Countdown timer */}
        <Animated.View
          style={[
            styles.countdownCard,
            {
              backgroundColor: timerUrgent ? '#FFE5E5' : '#FFF0EC',
              transform: [{ translateX: timerShake }],
            },
          ]}
        >
          <Ionicons
            name="timer-outline"
            size={20}
            color={timerUrgent ? '#EA4335' : c.accent}
          />
          <Text style={[styles.countdownLabel, { color: c.black }]}>
            Oferta expira en
          </Text>
          <View style={styles.countdownDigits}>
            {countdown.split('').map((ch, i) => (
              <View key={i} style={ch === ':' ? styles.colonBox : [styles.digitBox, { backgroundColor: c.black }]}>
                <Text style={ch === ':' ? [styles.colonText, { color: timerUrgent ? '#EA4335' : c.accent }] : styles.digitText}>
                  {ch}
                </Text>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* Fine print about renewal */}
        <Text style={[styles.finePrint, { color: c.gray }]}>
          Primer a{'\u00F1'}o a {displayDiscountedPrice}. Despues se renueva automaticamente a{' '}
          {displayOriginalPrice}/a{'\u00F1'}o. Cancela cuando quieras desde los ajustes de tu tienda de apps.
        </Text>

        {/* Restore purchases */}
        <TouchableOpacity
          style={styles.restoreBtn}
          onPress={handleRestore}
          disabled={restoring}
        >
          {restoring ? (
            <ActivityIndicator size="small" color={c.gray} />
          ) : (
            <Text style={[styles.restoreText, { color: c.gray }]}>
              Restaurar compra anterior
            </Text>
          )}
        </TouchableOpacity>

        {/* Guarantee */}
        <View style={styles.guaranteeRow}>
          <Ionicons name="shield-checkmark-outline" size={14} color={c.gray} />
          <Text style={[styles.guaranteeText, { color: c.gray }]}>
            Garantia de devolucion de 30 dias
          </Text>
        </View>
      </Animated.View>
    </OnboardingLayout>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.sm,
  },

  // "Solo por hoy" badge
  todayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  todayBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },

  // Title
  title: {
    ...typography.title,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.subtitle,
    textAlign: 'center',
    marginTop: -spacing.xs,
  },

  // Price card
  priceCard: {
    borderRadius: 20,
    padding: spacing.lg,
    width: '100%',
    alignItems: 'center',
    gap: spacing.sm,
    ...shadows.md,
  },
  savingsBadge: {
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: 3,
    borderRadius: radius.full,
    position: 'absolute',
    top: -12,
  },
  savingsBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  priceOriginalRow: {
    marginTop: spacing.sm,
  },
  priceOriginal: {
    fontSize: 20,
    fontWeight: '600',
    textDecorationLine: 'line-through',
    textDecorationStyle: 'solid',
  },
  priceNewRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  priceNew: {
    fontSize: 48,
    fontWeight: '900',
    letterSpacing: -2,
  },
  priceNewPeriod: {
    fontSize: 18,
    fontWeight: '500',
  },
  pricePerMonth: {
    fontSize: 15,
    fontWeight: '700',
  },
  divider: {
    width: '80%',
    height: 1,
    marginVertical: spacing.xs,
  },
  featureList: {
    width: '100%',
    gap: spacing.sm,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  featureText: {
    ...typography.bodyMd,
    flex: 1,
  },

  // Countdown timer
  countdownCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    width: '100%',
    justifyContent: 'center',
  },
  countdownLabel: {
    ...typography.label,
  },
  countdownDigits: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  digitBox: {
    width: 28,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digitText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  colonBox: {
    width: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colonText: {
    fontSize: 18,
    fontWeight: '800',
  },

  // Fine print
  finePrint: {
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    paddingHorizontal: spacing.sm,
  },

  // CTA button
  ctaBtn: {
    height: 56,
    borderRadius: radius.full,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctaBtnText: {
    ...typography.button,
    color: '#FFFFFF',
    fontSize: 17,
  },

  // Skip
  skipBtn: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  skipText: {
    ...typography.caption,
    textDecorationLine: 'underline',
  },

  // Restore
  restoreBtn: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  restoreText: {
    ...typography.caption,
    textDecorationLine: 'underline',
  },

  // Guarantee
  guaranteeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  guaranteeText: {
    ...typography.caption,
  },
});
