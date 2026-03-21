/**
 * Step28Paywall — Onboarding paywall with RevenueCat integration
 *
 * Shows subscription plans with real pricing from RevenueCat offerings.
 * Handles purchase, cancel, and skip flows.
 * Falls back to hardcoded prices when offerings are unavailable.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PurchasesPackage } from 'react-native-purchases';
import { colors, typography, spacing, radius } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { StepProps } from './OnboardingNavigator';
import { useAuth } from '../../context/AuthContext';
import * as purchaseService from '../../services/purchase.service';

const BENEFITS = [
  { icon: 'camera-outline',          text: 'Escaneo de comida con IA ilimitado' },
  { icon: 'trending-down-outline',   text: 'Plan de peso personalizado' },
  { icon: 'nutrition-outline',       text: 'Seguimiento de macros y calorias' },
  { icon: 'bar-chart-outline',       text: 'Analisis de progreso e insights' },
  { icon: 'notifications-outline',   text: 'Recordatorios inteligentes de comidas' },
  { icon: 'people-outline',          text: 'Comunidad y responsabilidad' },
];

interface PlanDisplay {
  id: string;
  label: string;
  price: string;
  perMonth: string;
  badge: string | null;
  savings: string | null;
}

const FALLBACK_PLANS: PlanDisplay[] = [
  {
    id: 'annual',
    label: 'Anual',
    price: '$59.99',
    perMonth: '$5.00/mes',
    badge: 'MEJOR VALOR',
    savings: 'Ahorra 50%',
  },
  {
    id: 'monthly',
    label: 'Mensual',
    price: '$9.99',
    perMonth: '$9.99/mes',
    badge: null,
    savings: null,
  },
];

export default function Step28Paywall({ onNext, onBack, step, totalSteps }: StepProps) {
  const { setPremiumStatus } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState('annual');
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [loadingOfferings, setLoadingOfferings] = useState(true);

  // RevenueCat packages
  const [monthlyPackage, setMonthlyPackage] = useState<PurchasesPackage | null>(null);
  const [annualPackage, setAnnualPackage] = useState<PurchasesPackage | null>(null);

  // Display plans (from RC or fallback)
  const [plans, setPlans] = useState<PlanDisplay[]>(FALLBACK_PLANS);

  // ── Load offerings ────────────────────────────────────────────────────────
  useEffect(() => {
    loadOfferings();
  }, []);

  const loadOfferings = async () => {
    try {
      setLoadingOfferings(true);
      const packages = await purchaseService.getCurrentPackages();

      if (packages.monthly) setMonthlyPackage(packages.monthly);
      if (packages.annual) setAnnualPackage(packages.annual);

      // Update display prices from real offerings
      if (packages.monthly || packages.annual) {
        const annualPrice = packages.annual?.product.price ?? 59.99;
        const monthlyPrice = packages.monthly?.product.price ?? 9.99;
        const savingsPct = Math.round((1 - annualPrice / 12 / monthlyPrice) * 100);

        setPlans([
          {
            id: 'annual',
            label: 'Anual',
            price: packages.annual?.product.priceString ?? '$59.99',
            perMonth: `${(annualPrice / 12).toFixed(2)}/mes`,
            badge: 'MEJOR VALOR',
            savings: savingsPct > 0 ? `Ahorra ${savingsPct}%` : null,
          },
          {
            id: 'monthly',
            label: 'Mensual',
            price: packages.monthly?.product.priceString ?? '$9.99',
            perMonth: `${packages.monthly?.product.priceString ?? '$9.99'}/mes`,
            badge: null,
            savings: null,
          },
        ]);
      }
    } catch (err) {
      console.error('[Step28Paywall] Failed to load offerings:', err);
    } finally {
      setLoadingOfferings(false);
    }
  };

  // ── Purchase ──────────────────────────────────────────────────────────────
  const handleSubscribe = useCallback(async () => {
    const pkg = selectedPlan === 'annual' ? annualPackage : monthlyPackage;

    if (!pkg) {
      // No package — skip to next step (web or dev mode)
      onNext();
      return;
    }

    setLoading(true);

    try {
      const result = await purchaseService.purchasePackage(pkg);

      if (result.userCancelled) {
        // User cancelled — stay on paywall
        return;
      }

      if (result.success && result.isPremium) {
        setPremiumStatus(true);
        // Purchase successful — continue onboarding
        onNext();
        return;
      }

      if (result.error) {
        Alert.alert('Error', result.error, [{ text: 'OK' }]);
      }
    } catch (err) {
      console.error('[Step28Paywall] Purchase error:', err);
      Alert.alert('Error', 'No se pudo completar la compra. Intentalo de nuevo.', [{ text: 'OK' }]);
    } finally {
      setLoading(false);
    }
  }, [selectedPlan, annualPackage, monthlyPackage, setPremiumStatus, onNext]);

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
      scrollable={false}
      footer={
        <>
          <PrimaryButton
            label={loading ? 'Procesando...' : 'Comenzar prueba gratis'}
            onPress={handleSubscribe}
            disabled={loading || loadingOfferings}
          />
          <TouchableOpacity onPress={onNext} style={styles.skipBtn}>
            <Text style={styles.skipText}>No gracias, lo dejo pasar</Text>
          </TouchableOpacity>
        </>
      }
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Comienza tu{'\n'}prueba gratis hoy</Text>
        <Text style={styles.subtitle}>Unete a mas de 500,000 personas alcanzando sus metas</Text>

        {/* Benefits */}
        <View style={styles.benefits}>
          {BENEFITS.map((b, i) => (
            <View key={i} style={styles.benefitRow}>
              <View style={styles.benefitIcon}>
                <Ionicons name={b.icon as any} size={18} color={colors.black} />
              </View>
              <Text style={styles.benefitText}>{b.text}</Text>
            </View>
          ))}
        </View>

        {/* Plan selector */}
        {loadingOfferings ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.black} />
          </View>
        ) : (
          <View style={styles.plans}>
            {plans.map(p => (
              <TouchableOpacity
                key={p.id}
                style={[styles.planCard, selectedPlan === p.id && styles.planCardActive]}
                onPress={() => setSelectedPlan(p.id)}
                activeOpacity={0.8}
              >
                {p.badge && (
                  <View style={styles.planBadge}>
                    <Text style={styles.planBadgeText}>{p.badge}</Text>
                  </View>
                )}
                <View style={styles.planRadio}>
                  <View style={[styles.planRadioInner, selectedPlan === p.id && styles.planRadioSelected]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.planLabel}>{p.label}</Text>
                  {p.savings && <Text style={styles.planSavings}>{p.savings}</Text>}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.planPrice}>{p.price}</Text>
                  <Text style={styles.planPer}>{p.perMonth}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* No payment note */}
        <View style={styles.noCCRow}>
          <Ionicons name="shield-checkmark-outline" size={16} color={colors.gray} />
          <Text style={styles.noCCText}>7 dias de prueba gratis {'\u00B7'} Sin pago ahora {'\u00B7'} Cancela cuando quieras</Text>
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

      </ScrollView>
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, color: colors.black, marginTop: spacing.md },
  subtitle: { ...typography.subtitle, color: colors.gray, marginTop: spacing.sm },
  benefits: { marginTop: spacing.lg, gap: spacing.sm },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  benefitIcon: {
    width: 32, height: 32,
    borderRadius: 8,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  benefitText: { ...typography.option, color: colors.black, flex: 1 },
  loadingContainer: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plans: { marginTop: spacing.xl, gap: spacing.sm },
  planCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
    overflow: 'hidden',
  },
  planCardActive: { borderColor: colors.black, backgroundColor: colors.white },
  planBadge: {
    position: 'absolute',
    top: 0, right: 0,
    backgroundColor: colors.black,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderBottomLeftRadius: 8,
  },
  planBadgeText: { ...typography.caption, color: colors.white, fontWeight: '700', fontSize: 10 },
  planRadio: {
    width: 20, height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.grayLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  planRadioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: 'transparent' },
  planRadioSelected: { backgroundColor: colors.black },
  planLabel: { ...typography.label, color: colors.black },
  planSavings: { ...typography.caption, color: colors.accent, fontWeight: '600' },
  planPrice: { ...typography.label, color: colors.black, fontWeight: '800' },
  planPer: { ...typography.caption, color: colors.black },
  noCCRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  noCCText: { ...typography.caption, color: colors.gray, textAlign: 'center' },
  restoreBtn: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.sm },
  restoreText: { ...typography.caption, color: colors.gray, textDecorationLine: 'underline' },
  skipBtn: { alignItems: 'center', paddingVertical: spacing.xs },
  skipText: { ...typography.caption, color: colors.gray },
});
