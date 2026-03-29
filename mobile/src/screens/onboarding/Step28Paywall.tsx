/**
 * Step28Paywall — 7-day free trial paywall for Fitsi AI Premium
 *
 * Features:
 *   - Headline: "Prueba Fitsi AI Premium gratis por 7 dias"
 *   - Feature cards showing what premium unlocks
 *   - Timeline showing trial progression (Today -> Day 5 -> Day 7)
 *   - Big CTA: "Iniciar prueba gratuita"
 *   - Fine print with pricing and cancel policy
 *   - "Quizas despues" skip link
 *   - Restore purchases (required by Apple)
 *   - RevenueCat integration — trial is managed by Apple/Google
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
import { colors, typography, spacing, radius, shadows } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { StepProps } from './OnboardingNavigator';
import { useAuth } from '../../context/AuthContext';
import * as purchaseService from '../../services/purchase.service';
import { useAnalytics } from '../../hooks/useAnalytics';

// ── Constants ───────────────────────────────────────────────────────────────

const ACCENT = '#4285F4';
const TRIAL_DAYS = 7;
const ANNUAL_PRICE = '$59.99/ano';
const TIMELINE_CONNECTOR_COLOR = '#E5E5EA';

// ── Premium feature list ────────────────────────────────────────────────────

interface PremiumFeature {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
}

const PREMIUM_FEATURES: PremiumFeature[] = [
  {
    icon: 'camera-outline',
    iconBg: '#E8F0FE',
    iconColor: ACCENT,
    title: 'Escaneo con IA ilimitado',
    description: 'Fotografía tu comida y obtén nutrientes al instante.',
  },
  {
    icon: 'analytics-outline',
    iconBg: '#FEF3C7',
    iconColor: '#D97706',
    title: 'Tracking de macros avanzado',
    description: 'Seguimiento detallado de proteinas, carbos y grasas.',
  },
  {
    icon: 'fitness-outline',
    iconBg: '#DCFCE7',
    iconColor: '#16A34A',
    title: 'Plan personalizado con IA',
    description: 'Metas ajustadas a tu cuerpo, actividad y objetivo.',
  },
  {
    icon: 'trending-up-outline',
    iconBg: '#FFF3F0',
    iconColor: '#EA4335',
    title: 'Reportes y progreso',
    description: 'Graficos semanales, tendencias y alertas inteligentes.',
  },
  {
    icon: 'chatbubble-ellipses-outline',
    iconBg: '#F3E8FF',
    iconColor: '#7C3AED',
    title: 'Coach IA personal',
    description: 'Consejos y ajustes en tiempo real basados en tus datos.',
  },
];

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
  d.setDate(d.getDate() + TRIAL_DAYS);
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
    title: 'Acceso completo inmediato',
    description: 'Todas las funciones Premium desbloqueadas. Sin cobros hoy.',
  },
  {
    day: 'DIA 5',
    icon: 'notifications-outline',
    iconBg: '#E8F0FE',
    iconColor: ACCENT,
    title: 'Te enviaremos un recordatorio',
    description: 'Te avisaremos que tu prueba esta por terminar.',
  },
  {
    day: `DIA ${TRIAL_DAYS}`,
    icon: 'diamond-outline',
    iconBg: '#F3E8FF',
    iconColor: '#7C3AED',
    title: `Se cobra el ${getTrialEndDate()}`,
    description: 'A menos que canceles antes. Puedes cancelar en cualquier momento.',
  },
];

// ── Component ───────────────────────────────────────────────────────────────

export default function Step28Paywall({ onNext, onBack, step, totalSteps }: StepProps) {
  const { setPremiumStatus } = useAuth();
  const { track } = useAnalytics('Paywall');
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [loadingOfferings, setLoadingOfferings] = useState(true);
  const [annualPackage, setAnnualPackage] = useState<any>(null);
  const [annualPriceString, setAnnualPriceString] = useState(ANNUAL_PRICE);

  // ── Track paywall impression ────────────────────────────────────────────
  useEffect(() => {
    track('paywall_viewed', { source: 'onboarding', step, trial_days: TRIAL_DAYS });
  }, []);

  // ── Load offerings ──────────────────────────────────────────────────────
  useEffect(() => {
    loadOfferings();
  }, []);

  const loadOfferings = async () => {
    try {
      setLoadingOfferings(true);
      const packages = await purchaseService.getCurrentPackages();

      if (packages.annual) {
        setAnnualPackage(packages.annual);
        setAnnualPriceString(
          `${packages.annual.product.priceString ?? '$59.99'}/ano`
        );
      }
    } catch {
      // Failed to load offerings — use fallback price
    } finally {
      setLoadingOfferings(false);
    }
  };

  // ── Purchase (starts 7-day trial via Apple/Google) ──────────────────────
  const handleStartTrial = useCallback(async () => {
    if (!annualPackage) {
      // No package available — skip to next step
      onNext();
      return;
    }

    setLoading(true);
    track('trial_started', { plan: 'annual', trial_days: TRIAL_DAYS });
    try {
      const result = await purchaseService.purchasePackage(annualPackage);

      if (result.userCancelled) return;

      if (result.success && result.isPremium) {
        track('trial_activated', { plan: 'annual' });
        setPremiumStatus(true);
        onNext();
        return;
      }

      if (result.error) {
        Alert.alert('Error', result.error, [{ text: 'OK' }]);
      }
    } catch {
      Alert.alert(
        'Error',
        'No se pudo iniciar la prueba gratuita. Intenta de nuevo.',
        [{ text: 'OK' }],
      );
    } finally {
      setLoading(false);
    }
  }, [annualPackage, setPremiumStatus, onNext]);

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
    } catch {
      Alert.alert('Error', 'No se pudo restaurar la compra.', [{ text: 'OK' }]);
    } finally {
      setRestoring(false);
    }
  }, [setPremiumStatus, onNext]);

  // ── Button label ──────────────────────────────────────────────────────
  const buttonLabel = useMemo(() => {
    if (loading) return 'Procesando...';
    return 'Iniciar prueba gratuita';
  }, [loading]);

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <OnboardingLayout
      step={step}
      totalSteps={totalSteps}
      onBack={onBack}
      scrollable={false}
      footer={
        <>
          {/* No payment reassurance */}
          <View
            style={styles.noPaymentRow}
            accessibilityLabel="Sin cobro hoy. Se cobra despues de 7 dias."
          >
            <Ionicons name="shield-checkmark" size={18} color="#10B981" />
            <Text style={styles.noPaymentText}>Sin cobro hoy</Text>
          </View>

          <PrimaryButton
            label={buttonLabel}
            onPress={handleStartTrial}
            loading={loading}
            disabled={loading || loadingOfferings}
            accessibilityLabel={buttonLabel}
            accessibilityRole="button"
          />

          {/* Fine print */}
          <Text style={styles.finePrint}>
            Se cobra {annualPriceString} despues de la prueba.{' '}
            Cancela cuando quieras.
          </Text>

          {/* Legal + restore links */}
          <View style={styles.footerLinks}>
            <Text style={styles.footerLink}>Terminos</Text>
            <Text style={styles.footerDot}>{'\u00B7'}</Text>
            <Text style={styles.footerLink}>Privacidad</Text>
            <Text style={styles.footerDot}>{'\u00B7'}</Text>
            <TouchableOpacity onPress={handleRestore} disabled={restoring}>
              {restoring ? (
                <ActivityIndicator size="small" color={colors.gray} />
              ) : (
                <Text style={styles.footerLink}>Restaurar compras</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Skip option */}
          <TouchableOpacity
            onPress={() => {
              track('paywall_skipped', { source: 'onboarding', trial: true });
              onNext();
            }}
            activeOpacity={0.6}
            style={styles.skipButton}
            accessibilityLabel="Quizas despues"
            accessibilityRole="button"
          >
            <Text style={styles.skipText}>Quizas despues</Text>
          </TouchableOpacity>
        </>
      }
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ── Title ──────────────────────────────────────────────────────── */}
        <Text
          style={styles.title}
          accessibilityRole="header"
          accessibilityLabel={`Prueba Fitsi AI Premium gratis por ${TRIAL_DAYS} dias`}
        >
          Prueba Fitsi AI{'\n'}Premium{' '}
          <Text style={styles.titleAccent}>gratis por{'\n'}{TRIAL_DAYS} dias</Text>
        </Text>

        <Text style={styles.subtitle}>
          Desbloquea todas las funciones. Cancela en cualquier momento.
        </Text>

        {/* ── Feature cards ──────────────────────────────────────────────── */}
        <View style={styles.featuresContainer}>
          {PREMIUM_FEATURES.map((feature, index) => (
            <View
              key={index}
              style={styles.featureCard}
              accessibilityLabel={`${feature.title}. ${feature.description}`}
            >
              <View style={[styles.featureIconWrap, { backgroundColor: feature.iconBg }]}>
                <Ionicons name={feature.icon} size={22} color={feature.iconColor} />
              </View>
              <View style={styles.featureText}>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureDesc}>{feature.description}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ── Timeline ───────────────────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Como funciona tu prueba</Text>

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

        {/* ── Loading state for offerings ────────────────────────────────── */}
        {loadingOfferings && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.black} />
          </View>
        )}
      </ScrollView>
    </OnboardingLayout>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: spacing.lg,
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
  subtitle: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.gray,
    marginTop: spacing.sm,
    lineHeight: 20,
  },

  // Section title
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.black,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },

  // Feature cards
  featuresContainer: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  featureIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.black,
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.gray,
    lineHeight: 18,
  },

  // Timeline
  timeline: {
    marginTop: spacing.xs,
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

  // Loading
  loadingContainer: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
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

  // Fine print
  finePrint: {
    fontSize: 12,
    fontWeight: '400',
    color: colors.gray,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 16,
  },

  // Footer links
  footerLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
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

  // Skip button
  skipButton: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  skipText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.gray,
    textDecorationLine: 'underline',
  },
});
