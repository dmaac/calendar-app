/**
 * PaywallScreen -- Conversion-optimized paywall with 3 plan options
 *
 * Plans:
 *   - Monthly:  $9.99/month
 *   - Yearly:   $59.99/year  (save 50%, most popular, 7-day free trial)
 *   - Lifetime: $149.99 one-time
 *
 * Prices fetched from RevenueCat when available, fallback to hardcoded values.
 * Integrates with purchase.service.ts for real in-app purchases.
 *
 * Product IDs (RevenueCat / App Store Connect / Google Play):
 *   fitsi_premium_monthly, fitsi_premium_yearly, fitsi_premium_lifetime
 * Entitlement: "premium"
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
import { typography, spacing, radius, useLayout, useThemeColors } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import * as purchaseService from '../../services/purchase.service';
import { haptics } from '../../hooks/useHaptics';

// ---- Types ------------------------------------------------------------------

type PlanId = 'monthly' | 'yearly' | 'lifetime';

interface PlanOption {
  id: PlanId;
  label: string;
  price: string;
  priceNote: string;
  badge?: string;
  trialText?: string;
  recommended?: boolean;
}

// ---- Legal URLs -------------------------------------------------------------

const TERMS_URL = 'https://fitsiai.com/terms';
const PRIVACY_URL = 'https://fitsiai.com/privacy';

// ---- Fallback prices (when RevenueCat is unavailable) -----------------------

const FALLBACK = {
  monthly:  { price: '$9.99',   priceNote: '/mes' },
  yearly:   { price: '$59.99',  priceNote: '/ano', perMonth: '$4.99' },
  lifetime: { price: '$149.99', priceNote: 'pago unico' },
};

// ---- Feature comparison (Free vs Premium) -----------------------------------

interface FeatureRow {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  free: boolean | string;
  premium: boolean | string;
}

const FEATURES: FeatureRow[] = [
  { label: 'Escaneos con IA',           icon: 'camera-outline',       free: '3/dia',     premium: 'Ilimitado' },
  { label: 'Tracking de calorias',      icon: 'analytics-outline',    free: 'Basico',    premium: 'Avanzado' },
  { label: 'AI Coach personal',         icon: 'sparkles-outline',     free: false,       premium: true },
  { label: 'Recetas personalizadas',    icon: 'restaurant-outline',   free: false,       premium: true },
  { label: 'Exportar datos (PDF/CSV)',  icon: 'download-outline',     free: false,       premium: true },
  { label: 'Planificacion de comidas',  icon: 'calendar-outline',     free: false,       premium: true },
  { label: 'Alertas de salud',          icon: 'heart-outline',        free: false,       premium: true },
  { label: 'Recordatorios inteligentes', icon: 'notifications-outline', free: false,     premium: true },
];

// ---- Sub-components ---------------------------------------------------------

/** Loading overlay shown during purchase processing */
function PurchaseOverlay({
  visible,
  c,
}: {
  visible: boolean;
  c: ReturnType<typeof useThemeColors>;
}) {
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
    <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
      <Animated.View
        style={[
          styles.overlayCard,
          { backgroundColor: c.bg, transform: [{ scale: scaleAnim }] },
        ]}
      >
        <ActivityIndicator size="large" color={c.accent} />
        <Text style={[styles.overlayTitle, { color: c.black }]}>
          Procesando compra...
        </Text>
        <Text style={[styles.overlaySubtitle, { color: c.gray }]}>
          No cierres la app. Esto puede tomar unos segundos.
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function PaywallScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { sidePadding } = useLayout();
  const c = useThemeColors();
  const { setPremiumStatus } = useAuth();

  // ---- State ----------------------------------------------------------------

  const [selectedPlan, setSelectedPlan] = useState<PlanId>('yearly');
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [loadingOfferings, setLoadingOfferings] = useState(true);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  // RevenueCat packages
  const [monthlyPkg, setMonthlyPkg] = useState<any>(null);
  const [yearlyPkg, setYearlyPkg] = useState<any>(null);
  const [lifetimePkg, setLifetimePkg] = useState<any>(null);

  // Entry animation
  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(30)).current;

  // ---- Entry animation ------------------------------------------------------

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideUp, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, []);

  // ---- Load RevenueCat offerings --------------------------------------------

  useEffect(() => {
    (async () => {
      try {
        setLoadingOfferings(true);
        const packages = await purchaseService.getCurrentPackages();
        if (packages.monthly) setMonthlyPkg(packages.monthly);
        if (packages.annual) setYearlyPkg(packages.annual);
        if (packages.lifetime) setLifetimePkg(packages.lifetime);
      } catch {
        // Offerings unavailable -- fallback prices will be used
      } finally {
        setLoadingOfferings(false);
      }
    })();
  }, []);

  // ---- Derived plan data (RevenueCat prices or fallback) --------------------

  const plans: PlanOption[] = useMemo(() => {
    const monthlyPrice = monthlyPkg?.product?.priceString ?? FALLBACK.monthly.price;

    const yearlyPrice = yearlyPkg?.product?.priceString ?? FALLBACK.yearly.price;
    const yearlyPerMonth = yearlyPkg?.product?.price
      ? `$${(yearlyPkg.product.price / 12).toFixed(2)}`
      : FALLBACK.yearly.perMonth;

    const lifetimePrice = lifetimePkg?.product?.priceString ?? FALLBACK.lifetime.price;

    return [
      {
        id: 'monthly' as PlanId,
        label: 'Mensual',
        price: monthlyPrice,
        priceNote: '/mes',
      },
      {
        id: 'yearly' as PlanId,
        label: 'Anual',
        price: yearlyPrice,
        priceNote: `/ano (${yearlyPerMonth}/mes)`,
        badge: 'Ahorra 50%',
        trialText: '7 dias gratis',
        recommended: true,
      },
      {
        id: 'lifetime' as PlanId,
        label: 'De por vida',
        price: lifetimePrice,
        priceNote: 'pago unico',
      },
    ];
  }, [monthlyPkg, yearlyPkg, lifetimePkg]);

  // ---- Get the RevenueCat package for the selected plan ---------------------

  const selectedPackage = useMemo(() => {
    if (selectedPlan === 'monthly') return monthlyPkg;
    if (selectedPlan === 'yearly') return yearlyPkg;
    return lifetimePkg;
  }, [selectedPlan, monthlyPkg, yearlyPkg, lifetimePkg]);

  // ---- Purchase flow --------------------------------------------------------

  const handleSubscribe = useCallback(async () => {
    haptics.medium();
    setPurchaseError(null);

    if (!selectedPackage) {
      haptics.error();
      Alert.alert(
        'No disponible',
        'Las compras in-app solo estan disponibles en la app nativa. Descarga la app desde la App Store o Google Play.',
        [{ text: 'OK' }],
      );
      return;
    }

    setLoading(true);

    try {
      const result = await purchaseService.purchasePackage(selectedPackage);

      if (result.userCancelled) {
        setLoading(false);
        return;
      }

      if (result.success && result.isPremium) {
        haptics.success();
        setPremiumStatus(true);
        setLoading(false);

        // Navigate to main app
        if (navigation.reset) {
          navigation.reset({ index: 0, routes: [{ name: 'HomeTab' }] });
        } else {
          navigation.goBack?.();
        }
        return;
      }

      if (result.error) {
        setPurchaseError(result.error);
        haptics.error();
        Alert.alert('No se pudo completar la compra', result.error, [
          { text: 'Reintentar', onPress: handleSubscribe },
          { text: 'Cancelar', style: 'cancel' },
        ]);
      }
    } catch {
      setPurchaseError('Error inesperado');
      haptics.error();
      Alert.alert(
        'Error',
        'Ocurrio un error inesperado. Verifica tu conexion e intentalo de nuevo.',
        [
          { text: 'Reintentar', onPress: handleSubscribe },
          { text: 'Cancelar', style: 'cancel' },
        ],
      );
    } finally {
      setLoading(false);
    }
  }, [selectedPackage, setPremiumStatus, navigation]);

  // ---- Restore purchases ----------------------------------------------------

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
          'Tu suscripcion Premium ha sido restaurada exitosamente.',
          [{
            text: 'Continuar',
            onPress: () => {
              if (navigation.reset) {
                navigation.reset({ index: 0, routes: [{ name: 'HomeTab' }] });
              } else {
                navigation.goBack?.();
              }
            },
          }],
        );
      } else if (result.success) {
        Alert.alert(
          'Sin compras previas',
          'No encontramos suscripciones anteriores asociadas a tu cuenta.',
          [{ text: 'OK' }],
        );
      } else if (result.error) {
        Alert.alert('Error al restaurar', result.error, [{ text: 'OK' }]);
      }
    } catch {
      Alert.alert(
        'Error',
        'No se pudo restaurar la compra. Verifica tu conexion e intentalo de nuevo.',
        [{ text: 'OK' }],
      );
    } finally {
      setRestoring(false);
    }
  }, [setPremiumStatus, navigation]);

  // ---- Close paywall --------------------------------------------------------

  const handleClose = useCallback(() => {
    haptics.light();
    navigation.goBack?.();
  }, [navigation]);

  // ---- Legal links ----------------------------------------------------------

  const openTerms = useCallback(() => {
    Linking.openURL(TERMS_URL).catch(() => {});
  }, []);

  const openPrivacy = useCallback(() => {
    Linking.openURL(PRIVACY_URL).catch(() => {});
  }, []);

  // ---- CTA label ------------------------------------------------------------

  const ctaLabel = useMemo(() => {
    if (selectedPlan === 'yearly') return 'Iniciar prueba gratuita de 7 dias';
    if (selectedPlan === 'lifetime') return 'Comprar acceso de por vida';
    return 'Suscribirse ahora';
  }, [selectedPlan]);

  // ---- Render ---------------------------------------------------------------

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      {/* Purchase processing overlay */}
      <PurchaseOverlay visible={loading} c={c} />

      {/* Close button (top-right) */}
      <TouchableOpacity
        style={[styles.closeBtn, { right: sidePadding, top: insets.top + 12, backgroundColor: c.surface }]}
        onPress={handleClose}
        accessibilityLabel="Cerrar"
        accessibilityRole="button"
      >
        <Ionicons name="close" size={20} color={c.black} />
      </TouchableOpacity>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingHorizontal: sidePadding }]}
      >
        {/* ---- Hero ---- */}
        <Animated.View
          style={[
            styles.hero,
            { opacity: fadeIn, transform: [{ translateY: slideUp }] },
          ]}
        >
          <View style={[styles.crownBadge, { backgroundColor: c.badgeBg }]}>
            <Ionicons name="diamond" size={32} color={c.accent} />
          </View>

          <Text style={[styles.heroTitle, { color: c.black }]}>
            Desbloquea todo el poder de Fitsi AI
          </Text>
          <Text style={[styles.heroSubtitle, { color: c.gray }]}>
            Escaneos ilimitados, AI Coach, recetas y mucho mas.
          </Text>
        </Animated.View>

        {/* ---- Social proof ---- */}
        <View style={[styles.socialProof, { backgroundColor: c.surface }]}>
          <Ionicons name="people" size={16} color={c.accent} />
          <Text style={[styles.socialProofText, { color: c.gray }]}>
            50,000+ usuarios premium confian en Fitsi AI
          </Text>
        </View>

        {/* ---- Plan selector ---- */}
        <Text style={[styles.sectionLabel, { color: c.black }]}>
          Elige tu plan
        </Text>

        {loadingOfferings ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={c.accent} />
            <Text style={[styles.loadingText, { color: c.gray }]}>
              Cargando planes...
            </Text>
          </View>
        ) : (
          <View style={styles.plansContainer}>
            {plans.map((plan) => {
              const isSelected = selectedPlan === plan.id;
              const isRecommended = plan.recommended === true;

              return (
                <TouchableOpacity
                  key={plan.id}
                  style={[
                    styles.planCard,
                    { backgroundColor: c.surface, borderColor: c.grayLight },
                    isSelected && { borderColor: c.accent, borderWidth: 2.5 },
                    isRecommended && !isSelected && { borderColor: c.accent + '60', borderWidth: 1.5 },
                  ]}
                  onPress={() => {
                    haptics.selection();
                    setSelectedPlan(plan.id);
                  }}
                  activeOpacity={0.85}
                  accessibilityLabel={`Plan ${plan.label} ${plan.price}`}
                  accessibilityRole="button"
                >
                  {/* "Most Popular" badge */}
                  {isRecommended && (
                    <View style={[styles.recommendedBadge, { backgroundColor: c.accent }]}>
                      <Ionicons name="star" size={10} color="#FFFFFF" />
                      <Text style={styles.recommendedBadgeText}>Mas Popular</Text>
                    </View>
                  )}

                  {/* 7-day trial badge */}
                  {plan.trialText && (
                    <View style={[styles.trialBadge, { backgroundColor: '#34A853' }]}>
                      <Text style={styles.trialBadgeText}>{plan.trialText}</Text>
                    </View>
                  )}

                  <View style={styles.planCardBody}>
                    {/* Radio */}
                    <View
                      style={[
                        styles.planRadio,
                        { borderColor: isSelected ? c.accent : c.grayLight },
                      ]}
                    >
                      {isSelected && (
                        <View style={[styles.planRadioInner, { backgroundColor: c.accent }]} />
                      )}
                    </View>

                    {/* Plan info */}
                    <View style={styles.planInfo}>
                      <View style={styles.planNameRow}>
                        <Text style={[styles.planName, { color: c.black }]}>
                          {plan.label}
                        </Text>
                        {plan.badge && (
                          <View style={[styles.saveBadge, { backgroundColor: '#34A853' }]}>
                            <Text style={styles.saveBadgeText}>{plan.badge}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.planPriceNote, { color: c.gray }]}>
                        {plan.priceNote}
                      </Text>
                    </View>

                    {/* Price */}
                    <Text style={[styles.planPrice, { color: c.black }]}>
                      {plan.price}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ---- Feature comparison: Free vs Premium ---- */}
        <Text style={[styles.sectionLabel, { color: c.black, marginTop: spacing.lg }]}>
          Free vs Premium
        </Text>

        <View style={[styles.featureTable, { backgroundColor: c.surface }]}>
          {/* Header */}
          <View style={styles.featureHeaderRow}>
            <View style={styles.featureLabelCol}>
              <Text style={[styles.featureHeaderText, { color: c.gray }]}>
                Funcion
              </Text>
            </View>
            <View style={styles.featureValueCol}>
              <Text style={[styles.featureHeaderText, { color: c.gray }]}>
                Free
              </Text>
            </View>
            <View style={styles.featureValueCol}>
              <Text
                style={[
                  styles.featureHeaderText,
                  { color: c.accent, fontWeight: '700' },
                ]}
              >
                Premium
              </Text>
            </View>
          </View>

          {/* Rows */}
          {FEATURES.map((feat, i) => (
            <View
              key={i}
              style={[
                styles.featureRow,
                i % 2 === 0 && { backgroundColor: c.bg + '80' },
              ]}
            >
              <View style={styles.featureLabelCol}>
                <View style={styles.featureLabelInner}>
                  <Ionicons name={feat.icon as any} size={14} color={c.gray} />
                  <Text
                    style={[styles.featureLabelText, { color: c.black }]}
                    numberOfLines={1}
                  >
                    {feat.label}
                  </Text>
                </View>
              </View>
              <View style={styles.featureValueCol}>
                {feat.free === true ? (
                  <Ionicons name="checkmark-circle" size={18} color={c.success} />
                ) : feat.free === false ? (
                  <Ionicons name="close-circle-outline" size={18} color={c.disabled} />
                ) : (
                  <Text style={[styles.featureValueText, { color: c.gray }]}>
                    {feat.free}
                  </Text>
                )}
              </View>
              <View style={styles.featureValueCol}>
                {feat.premium === true ? (
                  <Ionicons name="checkmark-circle" size={18} color={c.success} />
                ) : (
                  <Text style={[styles.featureValueText, { color: c.accent, fontWeight: '600' }]}>
                    {feat.premium}
                  </Text>
                )}
              </View>
            </View>
          ))}
        </View>

        {/* ---- Guarantee ---- */}
        <View style={[styles.guaranteeBadge, { backgroundColor: c.success + '12' }]}>
          <Ionicons name="shield-checkmark" size={18} color={c.success} />
          <View style={styles.guaranteeContent}>
            <Text style={[styles.guaranteeTitle, { color: c.black }]}>
              Garantia de satisfaccion
            </Text>
            <Text style={[styles.guaranteeSub, { color: c.gray }]}>
              Cancela en cualquier momento. Sin preguntas, sin complicaciones.
            </Text>
          </View>
        </View>

        {/* ---- Error banner ---- */}
        {purchaseError && (
          <View style={[styles.errorBanner, { backgroundColor: '#FEE2E2' }]}>
            <Ionicons name="alert-circle" size={16} color="#DC2626" />
            <Text style={styles.errorBannerText}>{purchaseError}</Text>
          </View>
        )}

        {/* ---- CTA Button ---- */}
        <TouchableOpacity
          style={[
            styles.ctaBtn,
            { backgroundColor: c.black },
            (loading || loadingOfferings) && { opacity: 0.7 },
          ]}
          onPress={handleSubscribe}
          disabled={loading || loadingOfferings}
          activeOpacity={0.85}
          accessibilityLabel={ctaLabel}
          accessibilityRole="button"
        >
          {loading ? (
            <View style={styles.ctaLoadingRow}>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text style={[styles.ctaBtnText, { color: '#FFFFFF', marginLeft: spacing.sm }]}>
                Procesando...
              </Text>
            </View>
          ) : (
            <Text style={[styles.ctaBtnText, { color: '#FFFFFF' }]}>
              {ctaLabel}
            </Text>
          )}
        </TouchableOpacity>

        {/* Price subtext under CTA */}
        {selectedPlan === 'yearly' && (
          <Text style={[styles.ctaSubNote, { color: c.gray }]}>
            Sin cargos durante los 7 dias de prueba. Cancela cuando quieras.
          </Text>
        )}
        {selectedPlan === 'monthly' && (
          <Text style={[styles.ctaSubNote, { color: c.gray }]}>
            Se renueva automaticamente cada mes. Cancela cuando quieras.
          </Text>
        )}
        {selectedPlan === 'lifetime' && (
          <Text style={[styles.ctaSubNote, { color: c.gray }]}>
            Un solo pago. Acceso Premium para siempre.
          </Text>
        )}

        {/* ---- Restore purchases ---- */}
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
            <Text style={[styles.restoreText, { color: c.gray }]}>
              Restaurar compra anterior
            </Text>
          )}
        </TouchableOpacity>

        {/* ---- Legal ---- */}
        <View style={styles.legalContainer}>
          <Text style={[styles.legalText, { color: c.disabled }]}>
            Al suscribirte aceptas los{' '}
          </Text>
          <TouchableOpacity onPress={openTerms} accessibilityRole="link">
            <Text style={[styles.legalLink, { color: c.accent }]}>
              Terminos de Servicio
            </Text>
          </TouchableOpacity>
          <Text style={[styles.legalText, { color: c.disabled }]}> y la </Text>
          <TouchableOpacity onPress={openPrivacy} accessibilityRole="link">
            <Text style={[styles.legalLink, { color: c.accent }]}>
              Politica de Privacidad
            </Text>
          </TouchableOpacity>
          <Text style={[styles.legalText, { color: c.disabled }]}>.</Text>
        </View>

        <Text style={[styles.legalFull, { color: c.disabled }]}>
          La suscripcion se renueva automaticamente al final de cada periodo.
          Puedes cancelar en cualquier momento desde los ajustes de tu{' '}
          {Platform.OS === 'ios' ? 'Apple ID' : 'Google Play'}.
          El pago se carga a tu cuenta de{' '}
          {Platform.OS === 'ios' ? 'iTunes' : 'Google Play'} al confirmar la compra.
          No se cobra durante el periodo de prueba gratuita.
        </Text>

        <View style={{ height: spacing.xl + insets.bottom }} />
      </ScrollView>
    </View>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },

  // Close button
  closeBtn: {
    position: 'absolute',
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  scroll: {
    paddingTop: spacing.xl + 20,
  },

  // Hero
  hero: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  crownBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  heroTitle: {
    ...typography.title,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    fontSize: 26,
    lineHeight: 32,
  },
  heroSubtitle: {
    ...typography.subtitle,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: spacing.md,
  },

  // Social proof
  socialProof: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  socialProofText: {
    ...typography.caption,
    flex: 1,
  },

  // Section label
  sectionLabel: {
    ...typography.label,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },

  // Loading
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  loadingText: {
    ...typography.caption,
  },

  // Plan cards
  plansContainer: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  planCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    position: 'relative',
    overflow: 'hidden',
  },
  recommendedBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    borderBottomLeftRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  recommendedBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  trialBadge: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderBottomRightRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  trialBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  planCardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
  planInfo: {
    flex: 1,
  },
  planNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  planName: {
    ...typography.label,
    fontSize: 16,
    fontWeight: '700',
  },
  saveBadge: {
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  saveBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  planPriceNote: {
    ...typography.caption,
    fontSize: 12,
    marginTop: 2,
  },
  planPrice: {
    ...typography.label,
    fontSize: 20,
    fontWeight: '800',
  },

  // Feature comparison table
  featureTable: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  featureHeaderRow: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  featureHeaderText: {
    ...typography.caption,
    fontWeight: '600',
    textAlign: 'center',
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm - 2,
    paddingHorizontal: spacing.sm,
    minHeight: 38,
  },
  featureLabelCol: {
    flex: 2,
    justifyContent: 'center',
  },
  featureLabelInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  featureLabelText: {
    ...typography.caption,
    fontSize: 12,
    flex: 1,
  },
  featureValueCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureValueText: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },

  // Guarantee badge
  guaranteeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  guaranteeContent: {
    flex: 1,
  },
  guaranteeTitle: {
    ...typography.label,
    fontSize: 13,
    fontWeight: '700',
  },
  guaranteeSub: {
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
    height: 58,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  ctaBtnText: {
    ...typography.button,
    fontSize: 17,
  },
  ctaLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaSubNote: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: spacing.xs,
    fontSize: 12,
    lineHeight: 17,
  },

  // Restore
  restoreBtn: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  restoreText: {
    ...typography.caption,
    textDecorationLine: 'underline',
  },
  restoreLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // Legal
  legalContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  legalText: {
    ...typography.caption,
    textAlign: 'center',
    lineHeight: 17,
    fontSize: 11,
  },
  legalLink: {
    ...typography.caption,
    textDecorationLine: 'underline',
    lineHeight: 17,
    fontSize: 11,
  },
  legalFull: {
    ...typography.caption,
    textAlign: 'center',
    lineHeight: 17,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    fontSize: 10,
  },

  // Purchase overlay
  overlay: {
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
  overlayCard: {
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.xl,
    width: 280,
  },
  overlayTitle: {
    ...typography.label,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  overlaySubtitle: {
    ...typography.caption,
    textAlign: 'center',
    lineHeight: 18,
  },
});
