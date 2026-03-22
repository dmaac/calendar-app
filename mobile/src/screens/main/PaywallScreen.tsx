/**
 * PaywallScreen — Pantalla de suscripcion Premium
 *
 * Integrates with RevenueCat for real in-app purchases.
 * Falls back to hardcoded prices when offerings are unavailable (web, dev).
 *
 * Product IDs: fitsiai_monthly ($9.99/mo), fitsiai_annual ($59.99/yr)
 * Entitlement: "premium"
 * Trial: 7-day free trial
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PurchasesPackage } from 'react-native-purchases';
import { colors, typography, spacing, radius, shadows, useLayout, useThemeColors } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import * as purchaseService from '../../services/purchase.service';

type Plan = 'monthly' | 'annual';

const FEATURES = [
  { icon: 'camera',            label: 'Escaneos ilimitados con IA' },
  { icon: 'analytics',         label: 'Analisis detallado de macros' },
  { icon: 'flame',             label: 'Seguimiento de racha diaria' },
  { icon: 'nutrition',         label: 'Base de datos de alimentos premium' },
  { icon: 'trending-down',     label: 'Prediccion de progreso semanal' },
  { icon: 'notifications',     label: 'Recordatorios inteligentes' },
  { icon: 'barbell',           label: 'Integracion con Apple/Google Health' },
  { icon: 'people',            label: 'Recetas personalizadas con IA' },
];

// Fallback prices when RevenueCat offerings are not available (web / dev)
const FALLBACK_PLANS = {
  monthly: {
    label: 'Mensual',
    price: '$9.99',
    period: '/mes',
    badge: null as string | null,
    perMonth: null as string | null,
    priceId: 'fitsiai_monthly',
  },
  annual: {
    label: 'Anual',
    price: '$59.99',
    period: '/ano',
    badge: '50% OFF',
    perMonth: '$5.00/mes',
    priceId: 'fitsiai_annual',
  },
};

export default function PaywallScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { sidePadding } = useLayout();
  const c = useThemeColors();
  const { setPremiumStatus } = useAuth();

  const [selectedPlan, setSelectedPlan] = useState<Plan>('annual');
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [loadingOfferings, setLoadingOfferings] = useState(true);

  // RevenueCat packages
  const [monthlyPackage, setMonthlyPackage] = useState<PurchasesPackage | null>(null);
  const [annualPackage, setAnnualPackage] = useState<PurchasesPackage | null>(null);

  // Display plan data (from RC offerings or fallback)
  const [plans, setPlans] = useState(FALLBACK_PLANS);

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

      // Update display prices from real offerings
      if (packages.monthly || packages.annual) {
        setPlans({
          monthly: {
            label: 'Mensual',
            price: packages.monthly?.product.priceString ?? FALLBACK_PLANS.monthly.price,
            period: '/mes',
            badge: null,
            perMonth: null,
            priceId: 'fitsiai_monthly',
          },
          annual: {
            label: 'Anual',
            price: packages.annual?.product.priceString ?? FALLBACK_PLANS.annual.price,
            period: '/ano',
            badge: '50% OFF',
            perMonth: packages.annual
              ? `${(packages.annual.product.price / 12).toFixed(2)}/mes`
              : FALLBACK_PLANS.annual.perMonth,
            priceId: 'fitsiai_annual',
          },
        });
      }
    } catch (err) {
      console.error('[PaywallScreen] Failed to load offerings:', err);
    } finally {
      setLoadingOfferings(false);
    }
  };

  // ── Purchase flow ─────────────────────────────────────────────────────────
  const handleSubscribe = useCallback(async () => {
    const pkg = selectedPlan === 'annual' ? annualPackage : monthlyPackage;

    if (!pkg) {
      // No package available — likely web or SDK not initialized
      Alert.alert(
        'No disponible',
        'Las compras in-app solo estan disponibles en la app nativa. Descarga la app desde la App Store o Google Play.',
        [{ text: 'OK' }]
      );
      return;
    }

    setLoading(true);

    try {
      const result = await purchaseService.purchasePackage(pkg);

      if (result.userCancelled) {
        // User cancelled — do nothing
        return;
      }

      if (result.success && result.isPremium) {
        // Purchase successful — update local premium status
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
    } catch (err) {
      console.error('[PaywallScreen] Unexpected purchase error:', err);
      Alert.alert(
        'Error',
        'Ocurrio un error inesperado. Intentalo de nuevo.',
        [{ text: 'OK' }]
      );
    } finally {
      setLoading(false);
    }
  }, [selectedPlan, annualPackage, monthlyPackage, setPremiumStatus, navigation]);

  // ── Restore purchases ─────────────────────────────────────────────────────
  const handleRestore = useCallback(async () => {
    setRestoring(true);

    try {
      const result = await purchaseService.restorePurchases();

      if (result.isPremium) {
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
    } catch (err) {
      console.error('[PaywallScreen] Restore error:', err);
      Alert.alert('Error', 'No se pudo restaurar la compra. Intentalo de nuevo.', [{ text: 'OK' }]);
    } finally {
      setRestoring(false);
    }
  }, [setPremiumStatus, navigation]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      {/* Close / back */}
      <TouchableOpacity
        style={[styles.closeBtn, { right: sidePadding, backgroundColor: c.surface }]}
        onPress={() => navigation.goBack?.() ?? navigation.navigate('Perfil')}
      >
        <Ionicons name="close" size={20} color={c.black} />
      </TouchableOpacity>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingHorizontal: sidePadding }]}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={[styles.crownBadge, { backgroundColor: c.badgeBg }]}>
            <Text style={styles.crownEmoji}>{'\u{1F451}'}</Text>
          </View>
          <Text style={[styles.heroTitle, { color: c.black }]}>Fitsi IA Premium</Text>
          <Text style={[styles.heroSubtitle, { color: c.gray }]}>
            Desbloquea el poder total de la IA{'\n'}para tu nutricion
          </Text>
        </View>

        {/* Features */}
        <View style={[styles.featuresCard, { backgroundColor: c.surface }]}>
          {FEATURES.map((f, i) => (
            <View key={i} style={styles.featureRow}>
              <View style={[styles.featureIconBg, { backgroundColor: c.bg }]}>
                <Ionicons name={f.icon as any} size={16} color={c.black} />
              </View>
              <Text style={[styles.featureLabel, { color: c.black }]}>{f.label}</Text>
              <Ionicons name="checkmark-circle" size={18} color={c.success} />
            </View>
          ))}
        </View>

        {/* Plans */}
        <Text style={[styles.sectionTitle, { color: c.black }]}>Elige tu plan</Text>

        {loadingOfferings ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={c.black} />
            <Text style={[styles.loadingText, { color: c.gray }]}>Cargando planes...</Text>
          </View>
        ) : (
          <View style={styles.plansRow}>
            {(Object.entries(plans) as [Plan, typeof plans[Plan]][]).map(([key, plan]) => {
              const isSelected = selectedPlan === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.planCard, { backgroundColor: c.surface }, isSelected && { backgroundColor: c.black, borderColor: c.black }]}
                  onPress={() => setSelectedPlan(key)}
                  activeOpacity={0.8}
                >
                  {plan.badge && (
                    <View style={[styles.planBadge, { backgroundColor: c.accent }]}>
                      <Text style={[styles.planBadgeText, { color: c.white }]}>{plan.badge}</Text>
                    </View>
                  )}
                  <Text style={[styles.planLabel, { color: c.gray }, isSelected && { color: 'rgba(255,255,255,0.7)' }]}>
                    {plan.label}
                  </Text>
                  <Text style={[styles.planPrice, { color: c.black }, isSelected && { color: c.white }]}>
                    {plan.price}
                  </Text>
                  <Text style={[styles.planPeriod, { color: c.gray }, isSelected && { color: c.white + 'CC' }]}>
                    {plan.period}
                  </Text>
                  {plan.perMonth && (
                    <Text style={[styles.planPerMonth, { color: c.gray }, isSelected && { color: c.white + 'BB' }]}>
                      {plan.perMonth}
                    </Text>
                  )}
                  {isSelected && (
                    <View style={styles.planCheck}>
                      <Ionicons name="checkmark-circle" size={18} color={c.white} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* CTA */}
        <TouchableOpacity
          style={[styles.ctaBtn, { backgroundColor: c.black }, (loading || loadingOfferings) && { opacity: 0.7 }]}
          onPress={handleSubscribe}
          disabled={loading || loadingOfferings}
          activeOpacity={0.85}
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
          Cancela cuando quieras {'\u00B7'} Sin compromiso
        </Text>

        {/* Restore */}
        <TouchableOpacity
          style={styles.restoreBtn}
          onPress={handleRestore}
          disabled={restoring}
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
  hero: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  crownBadge: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: colors.badgeBg,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  crownEmoji: { fontSize: 40 },
  heroTitle: { ...typography.title, color: colors.black, textAlign: 'center' },
  heroSubtitle: { ...typography.subtitle, color: colors.gray, textAlign: 'center', lineHeight: 22 },

  // Features
  featuresCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.xl,
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

  // Plans
  sectionTitle: {
    ...typography.label,
    color: colors.black,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  plansRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  planCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    gap: 3,
    position: 'relative',
    overflow: 'hidden',
    minHeight: 130,
    justifyContent: 'center',
  },
  planCardActive: {
    backgroundColor: colors.black,
    borderColor: colors.black,
  },
  planBadge: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    backgroundColor: colors.accent,
    paddingVertical: 3,
    alignItems: 'center',
  },
  planBadgeText: { fontSize: 11, fontWeight: '800', color: colors.white },
  planLabel: { ...typography.caption, color: colors.gray, marginTop: spacing.md },
  planLabelActive: { color: 'rgba(255,255,255,0.7)' },
  planPrice: { fontSize: 28, fontWeight: '800', color: colors.black },
  planPriceActive: { color: colors.white },
  planPeriod: { ...typography.caption, color: colors.gray },
  planPerMonth: { ...typography.caption, color: colors.gray },
  planCheck: { position: 'absolute', top: spacing.sm, right: spacing.sm },

  // CTA
  ctaBtn: {
    height: 58, borderRadius: radius.full,
    backgroundColor: colors.black,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  ctaBtnText: { ...typography.button, color: colors.white, fontSize: 17 },
  ctaNote: { ...typography.caption, color: colors.gray, textAlign: 'center', marginBottom: spacing.md },
  restoreBtn: { alignItems: 'center', paddingVertical: spacing.sm },
  restoreText: { ...typography.caption, color: colors.gray, textDecorationLine: 'underline' },
  legal: {
    ...typography.caption,
    color: colors.disabled,
    textAlign: 'center',
    lineHeight: 17,
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
  },
});
