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
 * - "Most Popular" badge on recommended plan
 * - Savings percentage display on annual plans
 * - Restore purchases button (required by Apple)
 * - Terms of Service and Privacy Policy links
 * - Loading state during purchase with proper UX
 * - Success/failure handling with clear user messaging
 * - Money-back guarantee badge
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
  Linking,
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

// ─── Legal URLs ─────────────────────────────────────────────────────────────────

const TERMS_URL = 'https://fitsiai.com/terms';
const PRIVACY_URL = 'https://fitsiai.com/privacy';
const MANAGE_SUBSCRIPTION_URL = Platform.select({
  ios: 'https://apps.apple.com/account/subscriptions',
  android: 'https://play.google.com/store/account/subscriptions',
  default: 'https://fitsiai.com/account',
});

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
                  outputRange: [2, 152],
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

// ─── Plan card component ──────────────────────────────────────────────────────

function PlanCard({
  tier,
  isSelected,
  isPopular,
  price,
  perMonthPrice,
  originalMonthlyPrice,
  billingCycle,
  savingsPercent,
  onSelect,
  colors: c,
}: {
  tier: Tier;
  isSelected: boolean;
  isPopular: boolean;
  price: string;
  perMonthPrice?: string;
  originalMonthlyPrice?: string;
  billingCycle: BillingCycle;
  savingsPercent?: number;
  onSelect: () => void;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const tierLabels: Record<Tier, string> = {
    free: 'Gratis',
    premium: 'Premium',
    pro: 'Pro',
  };

  const tierDescriptions: Record<Tier, string> = {
    free: 'Funciones basicas',
    premium: 'Lo esencial para tu nutricion',
    pro: 'Todo ilimitado + funciones avanzadas',
  };

  return (
    <TouchableOpacity
      style={[
        styles.planCard,
        { backgroundColor: c.surface, borderColor: c.grayLight },
        isSelected && { borderColor: c.accent, borderWidth: 2 },
        isPopular && { borderColor: c.accent, borderWidth: 2 },
      ]}
      onPress={() => {
        if (tier !== 'free') {
          haptics.selection();
          onSelect();
        }
      }}
      activeOpacity={tier === 'free' ? 1 : 0.85}
      accessibilityLabel={`Plan ${tierLabels[tier]} ${price}`}
      accessibilityRole="button"
    >
      {/* Most Popular badge */}
      {isPopular && (
        <View style={styles.popularBadge}>
          <Ionicons name="star" size={10} color="#FFFFFF" />
          <Text style={styles.popularBadgeText}>Mas Popular</Text>
        </View>
      )}

      <View style={styles.planCardContent}>
        <View style={styles.planCardLeft}>
          {/* Selection radio */}
          <View style={[
            styles.planRadio,
            { borderColor: c.grayLight },
            isSelected && { borderColor: c.accent },
          ]}>
            {isSelected && <View style={[styles.planRadioInner, { backgroundColor: c.accent }]} />}
          </View>

          <View style={styles.planCardInfo}>
            <Text style={[styles.planCardTitle, { color: c.black }]}>
              {tierLabels[tier]}
            </Text>
            <Text style={[styles.planCardDesc, { color: c.gray }]}>
              {tierDescriptions[tier]}
            </Text>
          </View>
        </View>

        <View style={styles.planCardRight}>
          {tier === 'free' ? (
            <Text style={[styles.planCardPrice, { color: c.gray }]}>$0</Text>
          ) : (
            <View style={styles.planPriceContainer}>
              {billingCycle === 'annual' && originalMonthlyPrice && (
                <StrikethroughPrice
                  price={originalMonthlyPrice}
                  active={true}
                  textStyle={[styles.planCardOriginalPrice, { color: c.disabled }]}
                />
              )}
              <Text style={[styles.planCardPrice, { color: c.black }]}>
                {perMonthPrice || price}
              </Text>
              <Text style={[styles.planCardPeriod, { color: c.gray }]}>
                /mes
              </Text>
              {savingsPercent != null && savingsPercent > 0 && (
                <View style={styles.savingsTag}>
                  <Text style={styles.savingsTagText}>
                    Ahorra {savingsPercent}%
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
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
              {tier === 'premium' && (
                <View style={styles.tierPopularDot}>
                  <Ionicons name="star" size={8} color="#F59E0B" />
                </View>
              )}
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

// ─── Money-back guarantee badge ────────────────────────────────────────────────

function MoneyBackGuarantee({ colors: c }: { colors: ReturnType<typeof useThemeColors> }) {
  return (
    <View style={[styles.guaranteeBadge, { backgroundColor: c.success + '12' }]}>
      <Ionicons name="shield-checkmark" size={18} color={c.success} />
      <View style={styles.guaranteeTextContainer}>
        <Text style={[styles.guaranteeTitle, { color: c.black }]}>
          Garantia de satisfaccion
        </Text>
        <Text style={[styles.guaranteeSubtitle, { color: c.gray }]}>
          Cancela en cualquier momento. Sin preguntas, sin complicaciones.
        </Text>
      </View>
    </View>
  );
}

// ─── Purchase overlay ─────────────────────────────────────────────────────────

function PurchaseOverlay({ visible, colors: c }: { visible: boolean; colors: ReturnType<typeof useThemeColors> }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, tension: 100, friction: 10, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.purchaseOverlay, { opacity: fadeAnim }]}>
      <Animated.View style={[
        styles.purchaseOverlayContent,
        { backgroundColor: c.bg, transform: [{ scale: scaleAnim }] },
      ]}>
        <ActivityIndicator size="large" color={c.accent} />
        <Text style={[styles.purchaseOverlayTitle, { color: c.black }]}>
          Procesando compra...
        </Text>
        <Text style={[styles.purchaseOverlaySubtitle, { color: c.gray }]}>
          No cierres la app. Esto puede tomar unos segundos.
        </Text>
      </Animated.View>
    </Animated.View>
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
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

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
    if (billingCycle === 'annual') return annualPackage;
    return monthlyPackage;
  }, [billingCycle, selectedTier, annualPackage, monthlyPackage]);

  // ── Purchase flow ─────────────────────────────────────────────────────────

  const handleSubscribe = useCallback(async () => {
    haptics.medium();
    setPurchaseError(null);

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
        setLoading(false);
        return;
      }

      if (result.success && result.isPremium) {
        haptics.success();
        setPremiumStatus(true);
        setLoading(false);
        Alert.alert(
          'Bienvenido a Premium',
          'Tu suscripcion ha sido activada exitosamente. Disfruta de todas las funciones de Fitsi AI sin limites.',
          [{ text: 'Comenzar', onPress: () => navigation.goBack?.() }]
        );
        return;
      }

      if (result.error) {
        setPurchaseError(result.error);
        haptics.error();
        Alert.alert(
          'No se pudo completar la compra',
          result.error,
          [
            { text: 'Reintentar', onPress: handleSubscribe },
            { text: 'Cancelar', style: 'cancel' },
          ]
        );
      }
    } catch {
      setPurchaseError('Error inesperado');
      haptics.error();
      Alert.alert(
        'Error',
        'Ocurrio un error inesperado al procesar tu compra. Por favor verifica tu conexion e intentalo de nuevo.',
        [
          { text: 'Reintentar', onPress: handleSubscribe },
          { text: 'Cancelar', style: 'cancel' },
        ]
      );
    } finally {
      setLoading(false);
    }
  }, [currentPackage, setPremiumStatus, navigation]);

  // ── Restore purchases ─────────────────────────────────────────────────────

  const handleRestore = useCallback(async () => {
    haptics.light();
    setRestoring(true);
    setPurchaseError(null);

    try {
      const result = await purchaseService.restorePurchases();

      if (result.isPremium) {
        haptics.success();
        setPremiumStatus(true);
        Alert.alert(
          'Compra restaurada',
          'Tu suscripcion Premium ha sido restaurada exitosamente. Todas las funciones premium estan disponibles.',
          [{ text: 'Continuar', onPress: () => navigation.goBack?.() }]
        );
      } else if (result.success) {
        Alert.alert(
          'Sin compras previas',
          'No encontramos suscripciones anteriores asociadas a tu cuenta. Si crees que esto es un error, contacta a soporte.',
          [{ text: 'OK' }]
        );
      } else if (result.error) {
        Alert.alert('Error al restaurar', result.error, [{ text: 'OK' }]);
      }
    } catch {
      Alert.alert(
        'Error',
        'No se pudo restaurar la compra. Verifica tu conexion e intentalo de nuevo.',
        [{ text: 'OK' }]
      );
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

  // ── Open legal links ──────────────────────────────────────────────────────

  const openTerms = useCallback(() => {
    Linking.openURL(TERMS_URL).catch(() => {
      Alert.alert('Error', 'No se pudo abrir el enlace.');
    });
  }, []);

  const openPrivacy = useCallback(() => {
    Linking.openURL(PRIVACY_URL).catch(() => {
      Alert.alert('Error', 'No se pudo abrir el enlace.');
    });
  }, []);

  const openManageSubscription = useCallback(() => {
    if (MANAGE_SUBSCRIPTION_URL) {
      Linking.openURL(MANAGE_SUBSCRIPTION_URL).catch(() => {});
    }
  }, []);

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

  const perMonthDisplay = useMemo(() => {
    if (billingCycle === 'annual') {
      if (selectedTier === 'premium') {
        return annualPackage
          ? `$${(annualPackage.product.price / 12).toFixed(2)}`
          : FALLBACK_PRICES.premium.annual.perMonth;
      }
      return FALLBACK_PRICES.pro.annual.perMonth;
    }
    return undefined;
  }, [selectedTier, billingCycle, annualPackage]);

  const savingsPercent = useMemo(() => {
    if (billingCycle !== 'annual') return 0;
    if (selectedTier === 'premium') {
      const monthlyTotal = (monthlyPackage?.product.price ?? FALLBACK_PRICES.premium.monthly.priceNum) * 12;
      const annualPrice = annualPackage?.product.price ?? FALLBACK_PRICES.premium.annual.priceNum;
      return Math.round(((monthlyTotal - annualPrice) / monthlyTotal) * 100);
    }
    const monthlyTotal = FALLBACK_PRICES.pro.monthly.priceNum * 12;
    const annualPrice = FALLBACK_PRICES.pro.annual.priceNum;
    return Math.round(((monthlyTotal - annualPrice) / monthlyTotal) * 100);
  }, [selectedTier, billingCycle, monthlyPackage, annualPackage]);

  const tierLabel = selectedTier === 'premium' ? 'Premium' : 'Pro';

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      {/* Purchase processing overlay */}
      <PurchaseOverlay visible={loading} colors={c} />

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

        {/* Plan cards */}
        <View style={styles.planCardsContainer}>
          <PlanCard
            tier="premium"
            isSelected={selectedTier === 'premium'}
            isPopular={true}
            price={
              billingCycle === 'monthly'
                ? (monthlyPackage?.product.priceString ?? FALLBACK_PRICES.premium.monthly.price)
                : (annualPackage?.product.priceString ?? FALLBACK_PRICES.premium.annual.price)
            }
            perMonthPrice={billingCycle === 'annual' ? (perMonthDisplay ?? FALLBACK_PRICES.premium.annual.perMonth) : undefined}
            originalMonthlyPrice={
              billingCycle === 'annual'
                ? (monthlyPackage?.product.priceString ?? FALLBACK_PRICES.premium.monthly.price)
                : undefined
            }
            billingCycle={billingCycle}
            savingsPercent={billingCycle === 'annual' ? savingsPercent : undefined}
            onSelect={() => setSelectedTier('premium')}
            colors={c}
          />
          <PlanCard
            tier="pro"
            isSelected={selectedTier === 'pro'}
            isPopular={false}
            price={
              billingCycle === 'monthly'
                ? FALLBACK_PRICES.pro.monthly.price
                : FALLBACK_PRICES.pro.annual.price
            }
            perMonthPrice={billingCycle === 'annual' ? FALLBACK_PRICES.pro.annual.perMonth : undefined}
            originalMonthlyPrice={
              billingCycle === 'annual' ? FALLBACK_PRICES.pro.monthly.price : undefined
            }
            billingCycle={billingCycle}
            savingsPercent={billingCycle === 'annual' ? savingsPercent : undefined}
            onSelect={() => setSelectedTier('pro')}
            colors={c}
          />
        </View>

        {/* 3-tier comparison table */}
        <TierComparison
          selectedTier={selectedTier}
          onSelectTier={setSelectedTier}
          billingCycle={billingCycle}
          colors={c}
        />

        {/* Money-back guarantee */}
        <MoneyBackGuarantee colors={c} />

        {/* CTA */}
        {loadingOfferings ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={c.black} />
            <Text style={[styles.loadingText, { color: c.gray }]}>Cargando planes...</Text>
          </View>
        ) : (
          <>
            {/* Error message */}
            {purchaseError && (
              <View style={[styles.errorBanner, { backgroundColor: '#FEE2E2' }]}>
                <Ionicons name="alert-circle" size={16} color="#DC2626" />
                <Text style={styles.errorBannerText}>{purchaseError}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.ctaBtn, { backgroundColor: c.black }, loading && { opacity: 0.7 }]}
              onPress={handleSubscribe}
              disabled={loading || loadingOfferings}
              activeOpacity={0.85}
              accessibilityLabel={`Iniciar prueba gratuita de 7 dias del plan ${tierLabel}`}
              accessibilityRole="button"
            >
              {loading ? (
                <View style={styles.ctaLoadingRow}>
                  <ActivityIndicator size="small" color={c.white} />
                  <Text style={[styles.ctaBtnText, { color: c.white, marginLeft: spacing.sm }]}>
                    Procesando...
                  </Text>
                </View>
              ) : (
                <Text style={[styles.ctaBtnText, { color: c.white }]}>
                  Iniciar prueba gratuita 7 dias
                </Text>
              )}
            </TouchableOpacity>

            {/* Price note with savings */}
            <View style={styles.ctaNoteContainer}>
              <Text style={[styles.ctaNote, { color: c.gray }]}>
                Luego {displayPrice}/{billingCycle === 'monthly' ? 'mes' : 'ano'}
              </Text>
              {billingCycle === 'annual' && savingsPercent > 0 && (
                <Text style={[styles.ctaSavingsNote, { color: c.success }]}>
                  {' '}(ahorras {savingsPercent}%)
                </Text>
              )}
            </View>
            <Text style={[styles.ctaSubNote, { color: c.gray }]}>
              Cancela cuando quieras {'\u00B7'} Sin cargos durante la prueba
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
            <View style={styles.restoreLoadingRow}>
              <ActivityIndicator size="small" color={c.gray} />
              <Text style={[styles.restoreText, { color: c.gray, marginLeft: spacing.xs }]}>
                Restaurando...
              </Text>
            </View>
          ) : (
            <Text style={[styles.restoreText, { color: c.gray }]}>Restaurar compra anterior</Text>
          )}
        </TouchableOpacity>

        {/* Legal — Terms, Privacy, Subscription management */}
        <View style={styles.legalContainer}>
          <Text style={[styles.legal, { color: c.disabled }]}>
            Al suscribirte aceptas los{' '}
          </Text>
          <TouchableOpacity onPress={openTerms} accessibilityRole="link">
            <Text style={[styles.legalLink, { color: c.accent }]}>
              Terminos de Servicio
            </Text>
          </TouchableOpacity>
          <Text style={[styles.legal, { color: c.disabled }]}> y la </Text>
          <TouchableOpacity onPress={openPrivacy} accessibilityRole="link">
            <Text style={[styles.legalLink, { color: c.accent }]}>
              Politica de Privacidad
            </Text>
          </TouchableOpacity>
          <Text style={[styles.legal, { color: c.disabled }]}>.</Text>
        </View>

        <Text style={[styles.legalFull, { color: c.disabled }]}>
          La suscripcion se renueva automaticamente al final de cada periodo.
          Puedes cancelar en cualquier momento desde los ajustes de tu{' '}
          {Platform.OS === 'ios' ? 'Apple ID' : 'Google Play'}.
          El pago se carga a tu cuenta de {Platform.OS === 'ios' ? 'iTunes' : 'Google Play'}{' '}
          al confirmar la compra. No se cobra durante el periodo de prueba gratuita.
        </Text>

        {/* Manage subscription link */}
        <TouchableOpacity
          style={styles.manageSubBtn}
          onPress={openManageSubscription}
          accessibilityLabel="Administrar suscripcion"
          accessibilityRole="link"
        >
          <Text style={[styles.manageSubText, { color: c.accent }]}>
            Administrar suscripcion
          </Text>
        </TouchableOpacity>

        <View style={{ height: spacing.xl + insets.bottom }} />
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

  // Plan cards
  planCardsContainer: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  planCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    position: 'relative',
    overflow: 'hidden',
  },
  planCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  planCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  planRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planRadioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  planCardInfo: {
    flex: 1,
  },
  planCardTitle: {
    ...typography.label,
    fontSize: 16,
    fontWeight: '700',
  },
  planCardDesc: {
    ...typography.caption,
    fontSize: 12,
    marginTop: 2,
  },
  planCardRight: {
    alignItems: 'flex-end',
  },
  planPriceContainer: {
    alignItems: 'flex-end',
  },
  planCardOriginalPrice: {
    ...typography.caption,
    fontSize: 12,
    textDecorationLine: 'line-through',
  },
  planCardPrice: {
    ...typography.label,
    fontSize: 20,
    fontWeight: '800',
  },
  planCardPeriod: {
    ...typography.caption,
    fontSize: 11,
  },
  savingsTag: {
    backgroundColor: '#34A853',
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginTop: 2,
  },
  savingsTagText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  popularBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#F59E0B',
    borderBottomLeftRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  popularBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Tier comparison table
  tierTable: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.md,
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
    position: 'relative',
  },
  tierPopularDot: {
    position: 'absolute',
    top: -2,
    right: 2,
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

  // Money-back guarantee
  guaranteeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  guaranteeTextContainer: {
    flex: 1,
  },
  guaranteeTitle: {
    ...typography.label,
    fontSize: 13,
    fontWeight: '700',
  },
  guaranteeSubtitle: {
    ...typography.caption,
    fontSize: 11,
    marginTop: 1,
  },

  // Error banner
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  errorBannerText: {
    ...typography.caption,
    color: '#DC2626',
    flex: 1,
    fontWeight: '500',
  },

  // CTA
  ctaBtn: {
    height: 58, borderRadius: radius.full,
    backgroundColor: colors.black,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.xs,
    marginTop: spacing.xs,
  },
  ctaBtnText: { ...typography.button, color: colors.white, fontSize: 17 },
  ctaLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaNoteContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  ctaNote: {
    ...typography.caption,
    color: colors.gray,
    textAlign: 'center',
  },
  ctaSavingsNote: {
    ...typography.caption,
    fontWeight: '700',
  },
  ctaSubNote: {
    ...typography.caption,
    color: colors.gray,
    textAlign: 'center',
    marginBottom: spacing.sm,
    fontSize: 11,
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
  restoreLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // Legal
  legalContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  legal: {
    ...typography.caption,
    color: colors.disabled,
    textAlign: 'center',
    lineHeight: 17,
  },
  legalLink: {
    ...typography.caption,
    textDecorationLine: 'underline',
    lineHeight: 17,
  },
  legalFull: {
    ...typography.caption,
    color: colors.disabled,
    textAlign: 'center',
    lineHeight: 17,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    fontSize: 10,
  },
  manageSubBtn: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  manageSubText: {
    ...typography.caption,
    textDecorationLine: 'underline',
    fontSize: 11,
  },

  // Purchase overlay
  purchaseOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  purchaseOverlayContent: {
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.xl,
    width: 280,
  },
  purchaseOverlayTitle: {
    ...typography.label,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  purchaseOverlaySubtitle: {
    ...typography.caption,
    textAlign: 'center',
    lineHeight: 18,
  },
});
