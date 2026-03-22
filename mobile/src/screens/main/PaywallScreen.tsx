/**
 * PaywallScreen — Smart Paywall with personalized copy & tier comparison
 *
 * Sprint 9 enhancements:
 * - Personalized headline/subtitle based on user activity (useSmartPaywall)
 * - Social proof: "X usuarios mejoraron su nutricion con Premium"
 * - 24h limited offer countdown timer
 * - 3-tier plan comparison (Free / Premium / Pro) with monthly/annual toggle
 * - Highlight of user's most-used feature
 * - "Continuar gratis" always visible (non-coercive)
 *
 * Integrates with RevenueCat for real in-app purchases.
 * Falls back to hardcoded prices when offerings are unavailable (web, dev).
 *
 * Product IDs: fitsiai_monthly ($4.99/mo), fitsiai_annual ($29.99/yr)
 *              fitsiai_pro_monthly ($9.99/mo), fitsiai_pro_annual ($59.99/yr)
 * Entitlement: "premium"
 * Trial: 7-day free trial
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PurchasesPackage } from 'react-native-purchases';
import { colors, typography, spacing, radius, shadows, useLayout, useThemeColors } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import * as purchaseService from '../../services/purchase.service';
import { haptics } from '../../hooks/useHaptics';
import { useSmartPaywall, formatCountdown } from '../../hooks/useSmartPaywall';

// ─── Plan types ────────────────────────────────────────────────────────────────

type BillingCycle = 'monthly' | 'annual';
type Tier = 'free' | 'premium' | 'pro';

// ─── 3-tier feature comparison ─────────────────────────────────────────────────

interface TierFeature {
  label: string;
  icon: string;
  free: boolean | string;
  premium: boolean | string;
  pro: boolean | string;
}

const TIER_FEATURES: TierFeature[] = [
  { label: 'Escaneos con IA',               icon: 'camera',        free: '3/dia',     premium: 'Ilimitado',  pro: 'Ilimitado' },
  { label: 'Tracking de calorias',           icon: 'analytics',     free: 'Basico',    premium: 'Avanzado',   pro: 'Avanzado' },
  { label: 'AI Coach personal',             icon: 'sparkles',      free: false,        premium: true,         pro: true },
  { label: 'Recetas personalizadas',        icon: 'restaurant',    free: false,        premium: true,         pro: true },
  { label: 'Exportar datos (PDF/CSV)',      icon: 'download',      free: false,        premium: true,         pro: true },
  { label: 'Planificacion de comidas',      icon: 'calendar',      free: false,        premium: false,        pro: true },
  { label: 'Alertas de salud avanzadas',    icon: 'heart',         free: false,        premium: false,        pro: true },
  { label: 'API access',                    icon: 'code-slash',    free: false,        premium: false,        pro: true },
];

const PREMIUM_FEATURES = [
  { icon: 'camera',     label: 'Escaneos ilimitados con IA' },
  { icon: 'sparkles',   label: 'AI Coach personal' },
  { icon: 'analytics',  label: 'Analisis detallado de macros' },
  { icon: 'restaurant', label: 'Recetas personalizadas con IA' },
  { icon: 'download',   label: 'Exportar datos PDF/CSV' },
  { icon: 'flame',      label: 'Seguimiento de racha diaria' },
  { icon: 'barbell',    label: 'Integracion Apple/Google Health' },
  { icon: 'notifications', label: 'Recordatorios inteligentes' },
];

// ─── Fallback prices (when RevenueCat is unavailable) ──────────────────────────

const FALLBACK_PRICES = {
  premium: {
    monthly: { price: '$4.99', priceNum: 4.99, priceId: 'fitsiai_monthly' },
    annual:  { price: '$29.99', priceNum: 29.99, priceId: 'fitsiai_annual', perMonth: '$2.50' },
  },
  pro: {
    monthly: { price: '$9.99', priceNum: 9.99, priceId: 'fitsiai_pro_monthly' },
    annual:  { price: '$59.99', priceNum: 59.99, priceId: 'fitsiai_pro_annual', perMonth: '$5.00' },
  },
};

// ─── Animated strikethrough ────────────────────────────────────────────────────

function StrikethroughPrice({
  price,
  active,
  textStyle,
}: {
  price: string;
  active: boolean;
  textStyle: any;
}) {
  const lineWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(lineWidth, {
      toValue: active ? 1 : 0,
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [active]);

  return (
    <View style={{ position: 'relative', alignSelf: 'center' }}>
      <Text style={textStyle}>{price}</Text>
      <Animated.View
        style={{
          position: 'absolute',
          top: '52%',
          left: 0,
          height: 2,
          backgroundColor: '#EF4444',
          borderRadius: 1,
          width: lineWidth.interpolate({
            inputRange: [0, 1],
            outputRange: ['0%', '100%'],
          }),
        }}
      />
    </View>
  );
}

// ─── Countdown timer component ─────────────────────────────────────────────────

function CountdownTimer({
  timeRemainingMs,
  colors: c,
}: {
  timeRemainingMs: number;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    ).start();
  }, []);

  const formatted = formatCountdown(timeRemainingMs);
  const parts = formatted.split(':');

  return (
    <Animated.View
      style={[
        styles.countdownContainer,
        { backgroundColor: '#FEF3C7', transform: [{ scale: pulseAnim }] },
      ]}
    >
      <Ionicons name="time-outline" size={16} color="#B45309" />
      <Text style={styles.countdownLabel}>Oferta termina en</Text>
      <View style={styles.countdownDigits}>
        {parts.map((part, i) => (
          <React.Fragment key={i}>
            {i > 0 && <Text style={styles.countdownColon}>:</Text>}
            <View style={styles.countdownBlock}>
              <Text style={styles.countdownNumber}>{part}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>
    </Animated.View>
  );
}

// ─── Billing cycle toggle ──────────────────────────────────────────────────────

function BillingToggle({
  cycle,
  onToggle,
  colors: c,
}: {
  cycle: BillingCycle;
  onToggle: (cycle: BillingCycle) => void;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const slideAnim = useRef(new Animated.Value(cycle === 'monthly' ? 0 : 1)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: cycle === 'monthly' ? 0 : 1,
      tension: 80,
      friction: 10,
      useNativeDriver: true,
    }).start();
  }, [cycle]);

  const translateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [2, 0], // Will be calculated based on layout
  });

  return (
    <View style={[styles.toggleContainer, { backgroundColor: c.surface }]}>
      {/* Background slider */}
      <Animated.View
        style={[
          styles.toggleSlider,
          {
            backgroundColor: c.black,
            transform: [
              {
                translateX: slideAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [2, 152], // half container width roughly
                }),
              },
            ],
          },
        ]}
      />
      <TouchableOpacity
        style={styles.toggleOption}
        onPress={() => { haptics.selection(); onToggle('monthly'); }}
        activeOpacity={0.8}
      >
        <Text style={[styles.toggleText, cycle === 'monthly' && { color: '#FFFFFF', fontWeight: '700' }]}>
          Mensual
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.toggleOption}
        onPress={() => { haptics.selection(); onToggle('annual'); }}
        activeOpacity={0.8}
      >
        <Text style={[styles.toggleText, cycle === 'annual' && { color: '#FFFFFF', fontWeight: '700' }]}>
          Anual
        </Text>
        <View style={styles.saveBadge}>
          <Text style={styles.saveBadgeText}>-50%</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

// ─── Tier comparison table ─────────────────────────────────────────────────────

function TierComparison({
  selectedTier,
  onSelectTier,
  billingCycle,
  colors: c,
}: {
  selectedTier: Tier;
  onSelectTier: (tier: Tier) => void;
  billingCycle: BillingCycle;
  colors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View style={[styles.tierTable, { backgroundColor: c.surface }]}>
      {/* Header row */}
      <View style={styles.tierHeaderRow}>
        <View style={styles.tierFeatureCol}>
          <Text style={[styles.tierHeaderLabel, { color: c.gray }]}>Funciones</Text>
        </View>
        {(['free', 'premium', 'pro'] as Tier[]).map((tier) => {
          const isSelected = selectedTier === tier;
          return (
            <TouchableOpacity
              key={tier}
              style={[
                styles.tierHeaderCol,
                isSelected && { backgroundColor: c.black, borderRadius: radius.sm },
              ]}
              onPress={() => {
                if (tier !== 'free') {
                  haptics.selection();
                  onSelectTier(tier);
                }
              }}
              activeOpacity={tier === 'free' ? 1 : 0.8}
            >
              <Text
                style={[
                  styles.tierName,
                  { color: c.black },
                  isSelected && { color: '#FFFFFF' },
                ]}
              >
                {tier === 'free' ? 'Free' : tier === 'premium' ? 'Premium' : 'Pro'}
              </Text>
              {tier !== 'free' && (
                <Text
                  style={[
                    styles.tierPrice,
                    { color: c.gray },
                    isSelected && { color: 'rgba(255,255,255,0.8)' },
                  ]}
                >
                  {tier === 'premium'
                    ? billingCycle === 'monthly' ? '$4.99' : '$2.50'
                    : billingCycle === 'monthly' ? '$9.99' : '$5.00'
                  }/mes
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Feature rows */}
      {TIER_FEATURES.map((feat, i) => (
        <View
          key={i}
          style={[styles.tierRow, i % 2 === 0 && { backgroundColor: c.bg + '80' }]}
        >
          <View style={styles.tierFeatureCol}>
            <View style={styles.tierFeatureLabelRow}>
              <Ionicons name={feat.icon as any} size={14} color={c.gray} />
              <Text style={[styles.tierFeatureText, { color: c.black }]} numberOfLines={1}>
                {feat.label}
              </Text>
            </View>
          </View>
          {(['free', 'premium', 'pro'] as Tier[]).map((tier) => {
            const val = feat[tier];
            return (
              <View key={tier} style={styles.tierValueCol}>
                {val === true ? (
                  <Ionicons name="checkmark-circle" size={18} color={c.success} />
                ) : val === false ? (
                  <Ionicons name="close-circle-outline" size={18} color={c.disabled} />
                ) : (
                  <Text
                    style={[styles.tierValueText, { color: c.black }]}
                    numberOfLines={1}
                  >
                    {val}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function PaywallScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { sidePadding } = useLayout();
  const c = useThemeColors();
  const { setPremiumStatus } = useAuth();

  // Smart paywall data
  const smart = useSmartPaywall();

  // Billing state
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('annual');
  const [selectedTier, setSelectedTier] = useState<Tier>('premium');
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [loadingOfferings, setLoadingOfferings] = useState(true);

  // RevenueCat packages
  const [monthlyPackage, setMonthlyPackage] = useState<PurchasesPackage | null>(null);
  const [annualPackage, setAnnualPackage] = useState<PurchasesPackage | null>(null);

  // Hero animation
  const fadeInAnim = useRef(new Animated.Value(0)).current;
  const slideUpAnim = useRef(new Animated.Value(30)).current;

  // ── Entry animations ─────────────────────────────────────────────────────────

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeInAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideUpAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();

    // Track impression
    smart.trackImpression();

    // Start 24h offer if not already active
    if (!smart.offerExpiresAt) {
      smart.startOffer();
    }
  }, []);

  // ── Load offerings on mount ───────────────────────────────────────────────

  useEffect(() => {
    loadOfferings();
  }, []);

  const loadOfferings = async () => {
    try {
      setLoadingOfferings(true);
      const packages = await purchaseService.getCurrentPackages();

      if (packages.monthly) {
        setMonthlyPackage(packages.monthly);
      }
      if (packages.annual) {
        setAnnualPackage(packages.annual);
      }
    } catch {
      // Failed to load offerings
    } finally {
      setLoadingOfferings(false);
    }
  };

  // ── Current selected package ─────────────────────────────────────────────────

  const currentPackage = useMemo(() => {
    // Map tier + billing to the correct package
    // For now, premium monthly/annual map to existing RC packages
    if (billingCycle === 'annual') return annualPackage;
    return monthlyPackage;
  }, [billingCycle, selectedTier, annualPackage, monthlyPackage]);

  // ── Purchase flow ─────────────────────────────────────────────────────────

  const handleSubscribe = useCallback(async () => {
    haptics.medium();

    if (!currentPackage) {
      haptics.error();
      Alert.alert(
        'No disponible',
        'Las compras in-app solo estan disponibles en la app nativa. Descarga la app desde la App Store o Google Play.',
        [{ text: 'OK' }]
      );
      return;
    }

    setLoading(true);

    try {
      const result = await purchaseService.purchasePackage(currentPackage);

      if (result.userCancelled) {
        return;
      }

      if (result.success && result.isPremium) {
        haptics.success();
        setPremiumStatus(true);
        Alert.alert(
          'Bienvenido a Premium',
          'Tu suscripcion ha sido activada exitosamente. Disfruta de todas las funciones de Fitsi IA.',
          [{ text: 'Continuar', onPress: () => navigation.goBack?.() }]
        );
        return;
      }

      if (result.error) {
        Alert.alert('Error', result.error, [{ text: 'OK' }]);
      }
    } catch {
      Alert.alert(
        'Error',
        'Ocurrio un error inesperado. Intentalo de nuevo.',
        [{ text: 'OK' }]
      );
    } finally {
      setLoading(false);
    }
  }, [currentPackage, setPremiumStatus, navigation]);

  // ── Restore purchases ─────────────────────────────────────────────────────

  const handleRestore = useCallback(async () => {
    haptics.light();
    setRestoring(true);

    try {
      const result = await purchaseService.restorePurchases();

      if (result.isPremium) {
        haptics.success();
        setPremiumStatus(true);
        Alert.alert(
          'Compra restaurada',
          'Tu suscripcion Premium ha sido restaurada exitosamente.',
          [{ text: 'Continuar', onPress: () => navigation.goBack?.() }]
        );
      } else if (result.success) {
        Alert.alert(
          'Sin compras previas',
          'No encontramos suscripciones anteriores asociadas a tu cuenta.',
          [{ text: 'OK' }]
        );
      } else if (result.error) {
        Alert.alert('Error', result.error, [{ text: 'OK' }]);
      }
    } catch {
      Alert.alert('Error', 'No se pudo restaurar la compra. Intentalo de nuevo.', [{ text: 'OK' }]);
    } finally {
      setRestoring(false);
    }
  }, [setPremiumStatus, navigation]);

  // ── Continue free ─────────────────────────────────────────────────────────

  const handleContinueFree = useCallback(() => {
    haptics.light();
    smart.dismissPaywall();
    navigation.goBack?.() ?? navigation.navigate('Perfil');
  }, [navigation, smart]);

  // ── Derived display values ────────────────────────────────────────────────

  const displayPrice = useMemo(() => {
    if (selectedTier === 'premium') {
      if (billingCycle === 'annual') {
        return annualPackage?.product.priceString ?? FALLBACK_PRICES.premium.annual.price;
      }
      return monthlyPackage?.product.priceString ?? FALLBACK_PRICES.premium.monthly.price;
    }
    // Pro tier
    if (billingCycle === 'annual') {
      return FALLBACK_PRICES.pro.annual.price;
    }
    return FALLBACK_PRICES.pro.monthly.price;
  }, [selectedTier, billingCycle, annualPackage, monthlyPackage]);

  const tierLabel = selectedTier === 'premium' ? 'Premium' : 'Pro';

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      {/* Close / back */}
      <TouchableOpacity
        style={[styles.closeBtn, { right: sidePadding, backgroundColor: c.surface }]}
        onPress={() => { haptics.light(); navigation.goBack?.() ?? navigation.navigate('Perfil'); }}
        accessibilityLabel="Cerrar"
        accessibilityRole="button"
      >
        <Ionicons name="close" size={20} color={c.black} />
      </TouchableOpacity>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingHorizontal: sidePadding }]}
      >
        {/* Hero — personalized */}
        <Animated.View
          style={[
            styles.hero,
            { opacity: fadeInAnim, transform: [{ translateY: slideUpAnim }] },
          ]}
        >
          <View style={[styles.crownBadge, { backgroundColor: c.badgeBg }]}>
            <Text style={styles.crownEmoji}>{'\u{1F451}'}</Text>
          </View>
          <Text style={[styles.heroTitle, { color: c.black }]}>
            {smart.personalizedHeadline}
          </Text>
          <Text style={[styles.heroSubtitle, { color: c.gray }]}>
            {smart.personalizedSubtitle}
          </Text>
        </Animated.View>

        {/* Social proof */}
        <View style={[styles.socialProof, { backgroundColor: c.surface }]}>
          <Ionicons name="people" size={16} color={c.accent} />
          <Text style={[styles.socialProofText, { color: c.gray }]}>
            {smart.socialProofText}
          </Text>
        </View>

        {/* Countdown timer */}
        {smart.timeRemainingMs != null && smart.timeRemainingMs > 0 && (
          <CountdownTimer timeRemainingMs={smart.timeRemainingMs} colors={c} />
        )}

        {/* Top feature highlight */}
        {smart.topFeature && (
          <View style={[styles.topFeatureBanner, { backgroundColor: c.accent + '15' }]}>
            <Ionicons name="star" size={16} color={c.accent} />
            <Text style={[styles.topFeatureText, { color: c.black }]}>
              Tu funcion favorita: <Text style={{ fontWeight: '700' }}>{smart.topFeature}</Text> — ilimitada con Premium
            </Text>
          </View>
        )}

        {/* Premium features list */}
        <View style={[styles.featuresCard, { backgroundColor: c.surface }]}>
          {PREMIUM_FEATURES.map((f, i) => (
            <View key={i} style={styles.featureRow}>
              <View style={[styles.featureIconBg, { backgroundColor: c.bg }]}>
                <Ionicons name={f.icon as any} size={16} color={c.black} />
              </View>
              <Text style={[styles.featureLabel, { color: c.black }]}>{f.label}</Text>
              <Ionicons name="checkmark-circle" size={18} color={c.success} />
            </View>
          ))}
        </View>

        {/* Billing toggle */}
        <Text style={[styles.sectionTitle, { color: c.black }]}>Elige tu plan</Text>
        <BillingToggle cycle={billingCycle} onToggle={setBillingCycle} colors={c} />

        {/* 3-tier comparison table */}
        <TierComparison
          selectedTier={selectedTier}
          onSelectTier={setSelectedTier}
          billingCycle={billingCycle}
          colors={c}
        />

        {/* CTA */}
        {loadingOfferings ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={c.black} />
            <Text style={[styles.loadingText, { color: c.gray }]}>Cargando planes...</Text>
          </View>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.ctaBtn, { backgroundColor: c.black }, loading && { opacity: 0.7 }]}
              onPress={handleSubscribe}
              disabled={loading || loadingOfferings}
              activeOpacity={0.85}
              accessibilityLabel={`Iniciar prueba gratuita de 7 dias del plan ${tierLabel}`}
              accessibilityRole="button"
            >
              {loading ? (
                <ActivityIndicator size="small" color={c.white} />
              ) : (
                <Text style={[styles.ctaBtnText, { color: c.white }]}>
                  Iniciar prueba gratuita 7 dias
                </Text>
              )}
            </TouchableOpacity>
            <Text style={[styles.ctaNote, { color: c.gray }]}>
              Luego {displayPrice}/{billingCycle === 'monthly' ? 'mes' : 'ano'} {'\u00B7'} Cancela cuando quieras
            </Text>
          </>
        )}

        {/* Continue free — always visible */}
        <TouchableOpacity
          style={styles.continueFreeBtn}
          onPress={handleContinueFree}
          activeOpacity={0.7}
          accessibilityLabel="Continuar con plan gratuito"
          accessibilityRole="button"
        >
          <Text style={[styles.continueFreeText, { color: c.gray }]}>
            Continuar gratis
          </Text>
        </TouchableOpacity>

        {/* Restore */}
        <TouchableOpacity
          style={styles.restoreBtn}
          onPress={handleRestore}
          disabled={restoring}
          accessibilityLabel="Restaurar compra anterior"
          accessibilityRole="button"
        >
          {restoring ? (
            <ActivityIndicator size="small" color={c.gray} />
          ) : (
            <Text style={[styles.restoreText, { color: c.gray }]}>Restaurar compra anterior</Text>
          )}
        </TouchableOpacity>

        {/* Legal */}
        <Text style={[styles.legal, { color: c.disabled }]}>
          Al suscribirte aceptas los Terminos de servicio y la Politica de privacidad.
          La suscripcion se renueva automaticamente. Cancela en cualquier momento
          desde los ajustes de tu {Platform.OS === 'ios' ? 'Apple ID' : 'Google Play'}.
        </Text>

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  closeBtn: {
    position: 'absolute',
    top: 0,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 54,
  },
  scroll: { paddingTop: spacing.xl },

  // Hero
  hero: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.sm },
  crownBadge: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: colors.badgeBg,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  crownEmoji: { fontSize: 36 },
  heroTitle: {
    ...typography.title,
    color: colors.black,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  heroSubtitle: {
    ...typography.subtitle,
    color: colors.gray,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: spacing.sm,
  },

  // Social proof
  socialProof: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  socialProofText: {
    ...typography.caption,
    flex: 1,
  },

  // Countdown
  countdownContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  countdownLabel: {
    ...typography.caption,
    color: '#B45309',
    fontWeight: '600',
    flex: 1,
  },
  countdownDigits: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  countdownBlock: {
    backgroundColor: '#92400E',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 28,
    alignItems: 'center',
  },
  countdownNumber: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  countdownColon: {
    color: '#92400E',
    fontSize: 14,
    fontWeight: '800',
    marginHorizontal: 1,
  },

  // Top feature highlight
  topFeatureBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  topFeatureText: {
    ...typography.caption,
    flex: 1,
    lineHeight: 17,
  },

  // Features
  featuresCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  featureIconBg: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
  },
  featureLabel: { ...typography.bodyMd, color: colors.black, flex: 1 },

  // Loading
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  loadingText: { ...typography.caption, color: colors.gray },

  // Section
  sectionTitle: {
    ...typography.label,
    color: colors.black,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Billing toggle
  toggleContainer: {
    flexDirection: 'row',
    borderRadius: radius.full,
    padding: 2,
    marginBottom: spacing.md,
    position: 'relative',
    overflow: 'hidden',
  },
  toggleSlider: {
    position: 'absolute',
    top: 2,
    left: 0,
    width: '50%',
    height: '100%',
    borderRadius: radius.full,
  },
  toggleOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.sm + 2,
    zIndex: 1,
  },
  toggleText: {
    ...typography.label,
    color: colors.gray,
    fontSize: 14,
  },
  saveBadge: {
    backgroundColor: '#34A853',
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  saveBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },

  // Tier comparison table
  tierTable: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  tierHeaderRow: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  tierFeatureCol: {
    flex: 2,
    justifyContent: 'center',
    paddingLeft: spacing.sm,
  },
  tierHeaderCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
  },
  tierHeaderLabel: {
    ...typography.caption,
    fontWeight: '600',
  },
  tierName: {
    ...typography.label,
    fontSize: 12,
    fontWeight: '700',
  },
  tierPrice: {
    ...typography.caption,
    fontSize: 10,
    marginTop: 1,
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm - 2,
    paddingHorizontal: spacing.xs,
    minHeight: 38,
  },
  tierFeatureLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: spacing.sm,
  },
  tierFeatureText: {
    ...typography.caption,
    fontSize: 12,
    flex: 1,
  },
  tierValueCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierValueText: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },

  // CTA
  ctaBtn: {
    height: 58, borderRadius: radius.full,
    backgroundColor: colors.black,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  ctaBtnText: { ...typography.button, color: colors.white, fontSize: 17 },
  ctaNote: {
    ...typography.caption,
    color: colors.gray,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },

  // Continue free
  continueFreeBtn: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  continueFreeText: {
    ...typography.bodyMd,
    fontSize: 14,
    textDecorationLine: 'underline',
  },

  // Restore
  restoreBtn: { alignItems: 'center', paddingVertical: spacing.sm },
  restoreText: { ...typography.caption, color: colors.gray, textDecorationLine: 'underline' },

  // Legal
  legal: {
    ...typography.caption,
    color: colors.disabled,
    textAlign: 'center',
    lineHeight: 17,
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
  },
});
