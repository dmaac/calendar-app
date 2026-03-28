/**
 * Step28Paywall — Fitsi AI-style paywall with 3-day trial timeline
 *
 * Features:
 *   - Vertical timeline showing trial progression (Today -> Day 2 -> Day 3)
 *   - Monthly / Annual plan selector with "3 DIAS GRATIS" badge
 *   - "Sin pago ahora" reassurance
 *   - RevenueCat integration via purchaseService
 *   - Restore purchases (required by Apple)
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
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
import { colors, typography, spacing, radius } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { StepProps } from './OnboardingNavigator';
import { useAuth } from '../../context/AuthContext';
import * as purchaseService from '../../services/purchase.service';
import { useAnalytics } from '../../hooks/useAnalytics';

// ── Constants ───────────────────────────────────────────────────────────────

const ACCENT = '#4285F4';
const TIMELINE_CONNECTOR_COLOR = '#E5E5EA';

// ── Timeline ────────────────────────────────────────────────────────────────

interface TimelineItem {
  day: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
}

function getTrialEndDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  const months = [
    'ene', 'feb', 'mar', 'abr', 'may', 'jun',
    'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
  ];
  return `${d.getDate()} de ${months[d.getMonth()]}`;
}

const TIMELINE: TimelineItem[] = [
  {
    day: 'HOY',
    icon: 'lock-open-outline',
    iconBg: '#FEF3C7',
    iconColor: '#D97706',
    title: 'Desbloquea todas las funciones',
    description: 'Escaneo con IA, tracking de macros, plan personalizado y mas.',
  },
  {
    day: 'EN 2 DIAS',
    icon: 'notifications-outline',
    iconBg: '#FFF3F0',
    iconColor: ACCENT,
    title: 'Te enviaremos un recordatorio',
    description: 'Te avisaremos que tu prueba esta por terminar.',
  },
  {
    day: 'EN 3 DIAS',
    icon: 'diamond-outline',
    iconBg: '#FFF3F0',
    iconColor: ACCENT,
    title: `Se cobra el ${getTrialEndDate()}`,
    description: 'A menos que canceles antes. Puedes cancelar en cualquier momento.',
  },
];

// ── Plan types ──────────────────────────────────────────────────────────────

interface PlanDisplay {
  id: string;
  label: string;
  price: string;
  perMonth: string;
  badge: string | null;
}

const FALLBACK_PLANS: PlanDisplay[] = [
  {
    id: 'monthly',
    label: 'Mensual',
    price: '$9.99/mes',
    perMonth: '$9.99/mes',
    badge: null,
  },
  {
    id: 'annual',
    label: 'Anual',
    price: '$34.99/ano',
    perMonth: '$2.92/mes',
    badge: '3 DIAS GRATIS',
  },
];

// ── Component ───────────────────────────────────────────────────────────────

export default function Step28Paywall({ onNext, onBack, step, totalSteps }: StepProps) {
  const { setPremiumStatus } = useAuth();
  const { track } = useAnalytics('Paywall');
  const [selectedPlan, setSelectedPlan] = useState('annual');
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [loadingOfferings, setLoadingOfferings] = useState(true);

  const [monthlyPackage, setMonthlyPackage] = useState<any>(null);
  const [annualPackage, setAnnualPackage] = useState<any>(null);
  const [plans, setPlans] = useState<PlanDisplay[]>(FALLBACK_PLANS);

  // ── Track paywall impression — critical for conversion funnel analytics ─
  useEffect(() => {
    track('paywall_viewed', { source: 'onboarding', step: step });
  }, []);

  // ── Load offerings ──────────────────────────────────────────────────────
  useEffect(() => {
    loadOfferings();
  }, []);

  const loadOfferings = async () => {
    try {
      setLoadingOfferings(true);
      const packages = await purchaseService.getCurrentPackages();

      if (packages.monthly) setMonthlyPackage(packages.monthly);
      if (packages.annual) setAnnualPackage(packages.annual);

      if (packages.monthly || packages.annual) {
        const annualPrice = packages.annual?.product.price ?? 34.99;
        const monthlyPrice = packages.monthly?.product.price ?? 9.99;

        setPlans([
          {
            id: 'monthly',
            label: 'Mensual',
            price: `${packages.monthly?.product.priceString ?? '$9.99'}/mes`,
            perMonth: `${packages.monthly?.product.priceString ?? '$9.99'}/mes`,
            badge: null,
          },
          {
            id: 'annual',
            label: 'Anual',
            price: `${packages.annual?.product.priceString ?? '$34.99'}/ano`,
            perMonth: `$${(annualPrice / 12).toFixed(2)}/mes`,
            badge: '3 DIAS GRATIS',
          },
        ]);
      }
    } catch {
      // Failed to load offerings
    } finally {
      setLoadingOfferings(false);
    }
  };

  // ── Purchase ────────────────────────────────────────────────────────────
  const handleSubscribe = useCallback(async () => {
    const pkg = selectedPlan === 'annual' ? annualPackage : monthlyPackage;

    if (!pkg) {
      onNext();
      return;
    }

    setLoading(true);
    track('purchase_started', { plan: selectedPlan });
    try {
      const result = await purchaseService.purchasePackage(pkg);

      if (result.userCancelled) return;

      if (result.success && result.isPremium) {
        track('purchase_completed', { plan: selectedPlan });
        setPremiumStatus(true);
        onNext();
        return;
      }

      if (result.error) {
        Alert.alert('Error', result.error, [{ text: 'OK' }]);
      }
    } catch {
      Alert.alert('Error', 'No se pudo completar la compra. Intenta de nuevo.', [{ text: 'OK' }]);
    } finally {
      setLoading(false);
    }
  }, [selectedPlan, annualPackage, monthlyPackage, setPremiumStatus, onNext]);

  // ── Restore ─────────────────────────────────────────────────────────────
  const handleRestore = useCallback(async () => {
    setRestoring(true);
    try {
      const result = await purchaseService.restorePurchases();

      if (result.isPremium) {
        setPremiumStatus(true);
        Alert.alert(
          'Compra restaurada',
          'Tu suscripcion Premium ha sido restaurada.',
          [{ text: 'Continuar', onPress: onNext }],
        );
      } else if (result.success) {
        Alert.alert(
          'Sin compras previas',
          'No encontramos suscripciones anteriores.',
          [{ text: 'OK' }],
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

  // ── Button label ────────────────────────────────────────────────────────
  const buttonLabel = useMemo(() => {
    if (loading) return 'Procesando...';
    if (selectedPlan === 'annual') return 'Comenzar prueba gratis de 3 dias';
    const plan = plans.find(p => p.id === selectedPlan);
    return `Suscribirme por ${plan?.price ?? '$9.99/mes'}`;
  }, [loading, selectedPlan, plans]);

  const selectedPlanData = plans.find(p => p.id === selectedPlan);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <OnboardingLayout
      step={step}
      totalSteps={totalSteps}
      onBack={onBack}
      scrollable={false}
      footer={
        <>
          {/* No payment reassurance */}
          <View style={styles.noPaymentRow} accessibilityLabel="Sin pago ahora. No se te cobrara hoy.">
            <Ionicons name="checkmark-circle" size={18} color="#10B981" />
            <Text style={styles.noPaymentText}>Sin pago ahora</Text>
          </View>

          <PrimaryButton
            label={buttonLabel}
            onPress={handleSubscribe}
            loading={loading}
            disabled={loading || loadingOfferings}
            accessibilityLabel={buttonLabel}
            accessibilityRole="button"
          />

          {/* Pricing clarification */}
          <View style={styles.footerLinks}>
            <TouchableOpacity
              onPress={handleRestore}
              disabled={restoring}
              accessibilityLabel="Restaurar compras anteriores"
              accessibilityRole="button"
            >
              {restoring ? (
                <ActivityIndicator size="small" color={colors.gray} />
              ) : (
                <Text style={styles.footerLink}>Ya compraste?</Text>
              )}
            </TouchableOpacity>
            <Text style={styles.footerDot}>{'\u00B7'}</Text>
            <Text style={styles.footerMuted}>
              3 dias gratis, luego {selectedPlanData?.price}
            </Text>
          </View>

          {/* Legal links */}
          <View style={styles.footerLinks}>
            <Text style={styles.footerLink}>Terminos</Text>
            <Text style={styles.footerDot}>{'\u00B7'}</Text>
            <Text style={styles.footerLink}>Privacidad</Text>
            <Text style={styles.footerDot}>{'\u00B7'}</Text>
            <TouchableOpacity onPress={handleRestore} disabled={restoring}>
              <Text style={styles.footerLink}>Restaurar</Text>
            </TouchableOpacity>
          </View>

          {/* Skip option */}
          <TouchableOpacity
            onPress={() => {
              track('paywall_skipped', { plan: selectedPlan });
              onNext();
            }}
            activeOpacity={0.6}
            accessibilityLabel="Saltar y continuar sin suscripcion"
            accessibilityRole="button"
          >
            <Text style={styles.footerLink}>Saltar por ahora</Text>
          </TouchableOpacity>
        </>
      }
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ── Title ──────────────────────────────────────────────────────── */}
        <Text style={styles.title} accessibilityRole="header" accessibilityLabel="Comienza tu prueba gratis de 3 dias para continuar">
          Comienza tu prueba{'\n'}
          <Text style={styles.titleAccent}>GRATIS de 3 dias</Text>
          {' '}para{'\n'}continuar.
        </Text>

        {/* ── Timeline ───────────────────────────────────────────────────── */}
        <View style={styles.timeline}>
          {TIMELINE.map((item, index) => (
            <View
              key={index}
              style={styles.timelineRow}
              accessibilityLabel={`${item.day}: ${item.title}. ${item.description}`}
            >
              {/* Left: icon + connector line */}
              <View style={styles.timelineLeft}>
                <View style={[styles.timelineIcon, { backgroundColor: item.iconBg }]}>
                  <Ionicons name={item.icon} size={20} color={item.iconColor} />
                </View>
                {index < TIMELINE.length - 1 && (
                  <View style={styles.timelineConnector} />
                )}
              </View>

              {/* Right: text content */}
              <View style={styles.timelineContent}>
                <Text style={styles.timelineDay}>{item.day}</Text>
                <Text style={styles.timelineTitle}>{item.title}</Text>
                <Text style={styles.timelineDesc}>{item.description}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ── Plan selector ──────────────────────────────────────────────── */}
        {loadingOfferings ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.black} />
          </View>
        ) : (
          <View style={styles.plans} accessibilityRole="radiogroup" accessibilityLabel="Seleccionar plan de suscripcion">
            {plans.map(p => {
              const isSelected = selectedPlan === p.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.planCard, isSelected && styles.planCardActive]}
                  onPress={() => {
                    track('plan_selected', { plan: p.id });
                    setSelectedPlan(p.id);
                  }}
                  activeOpacity={0.8}
                  accessibilityLabel={`Plan ${p.label}, ${p.price}${p.badge ? `, ${p.badge}` : ''}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                >
                  {/* Radio button */}
                  <View style={[styles.planRadio, isSelected && styles.planRadioActive]}>
                    {isSelected && <View style={styles.planRadioInner} />}
                  </View>

                  {/* Plan info */}
                  <View style={styles.planInfo}>
                    <View style={styles.planLabelRow}>
                      <Text style={[styles.planLabel, isSelected && styles.planLabelBold]}>
                        {p.label}
                      </Text>
                      {p.badge && (
                        <View style={styles.planBadge}>
                          <Text style={styles.planBadgeText}>{p.badge}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.planPrice}>{p.price}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </OnboardingLayout>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: spacing.md,
  },

  // Title
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.black,
    letterSpacing: -0.5,
    lineHeight: 34,
    marginTop: spacing.md,
  },
  titleAccent: {
    color: ACCENT,
  },

  // Timeline
  timeline: {
    marginTop: spacing.xl,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  timelineLeft: {
    alignItems: 'center',
    width: 44,
    marginRight: spacing.md,
  },
  timelineIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timelineConnector: {
    width: 2,
    height: 32,
    backgroundColor: TIMELINE_CONNECTOR_COLOR,
    marginVertical: 4,
  },
  timelineContent: {
    flex: 1,
    paddingBottom: spacing.md,
  },
  timelineDay: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.gray,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  timelineTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.black,
    marginBottom: 2,
  },
  timelineDesc: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.gray,
    lineHeight: 18,
  },

  // Plans
  loadingContainer: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plans: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 2,
    borderColor: 'transparent',
    gap: spacing.sm,
  },
  planCardActive: {
    borderColor: colors.black,
    backgroundColor: colors.white,
  },
  planRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.grayLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  planRadioActive: {
    borderColor: colors.black,
  },
  planRadioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.black,
  },
  planInfo: {
    flex: 1,
  },
  planLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  planLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.black,
  },
  planLabelBold: {
    fontWeight: '700',
  },
  planBadge: {
    backgroundColor: ACCENT,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  planBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: 0.5,
  },
  planPrice: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.gray,
    marginTop: 2,
  },

  // No payment row
  noPaymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 4,
  },
  noPaymentText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.black,
  },

  // Footer links
  footerLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  footerLink: {
    fontSize: 12,
    fontWeight: '400',
    color: colors.gray,
    textDecorationLine: 'underline',
  },
  footerDot: {
    fontSize: 12,
    color: colors.grayLight,
  },
  footerMuted: {
    fontSize: 12,
    fontWeight: '400',
    color: colors.gray,
  },
});
