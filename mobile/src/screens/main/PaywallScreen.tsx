/**
 * PaywallScreen — Pantalla de suscripción Premium
 * UI completa lista para conectar RevenueCat (Rama 5 config)
 * Por ahora muestra los planes y avisa que la compra se habilitará próximamente.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, useLayout } from '../../theme';

type Plan = 'monthly' | 'annual';

const FEATURES = [
  { icon: 'camera',            label: 'Escaneos ilimitados con IA' },
  { icon: 'analytics',         label: 'Análisis detallado de macros' },
  { icon: 'flame',             label: 'Seguimiento de racha diaria' },
  { icon: 'nutrition',         label: 'Base de datos de alimentos premium' },
  { icon: 'trending-down',     label: 'Predicción de progreso semanal' },
  { icon: 'notifications',     label: 'Recordatorios inteligentes' },
  { icon: 'barbell',           label: 'Integración con Apple/Google Health' },
  { icon: 'people',            label: 'Recetas personalizadas con IA' },
];

const PLANS = {
  monthly: {
    label: 'Mensual',
    price: '$9.99',
    period: '/mes',
    badge: null,
    priceId: 'calai_monthly',
  },
  annual: {
    label: 'Anual',
    price: '$59.99',
    period: '/año',
    badge: '50% OFF',
    perMonth: '$5.00/mes',
    priceId: 'calai_annual',
  },
};

export default function PaywallScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { sidePadding, contentWidth } = useLayout();
  const [selectedPlan, setSelectedPlan] = useState<Plan>('annual');
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async () => {
    // TODO: Rama 5 — conectar RevenueCat
    // const pkg = selectedPlan === 'annual' ? annualPackage : monthlyPackage;
    // await Purchases.purchasePackage(pkg);
    Alert.alert(
      'Próximamente',
      'Las compras se habilitarán cuando configuremos RevenueCat. ¡Ya casi está listo!',
      [{ text: 'OK' }]
    );
  };

  const handleRestore = () => {
    Alert.alert('Restaurar compra', 'Esta función estará disponible pronto.');
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Close / back */}
      <TouchableOpacity
        style={[styles.closeBtn, { right: sidePadding }]}
        onPress={() => navigation.goBack?.() ?? navigation.navigate('Perfil')}
      >
        <Ionicons name="close" size={20} color={colors.black} />
      </TouchableOpacity>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingHorizontal: sidePadding }]}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.crownBadge}>
            <Text style={styles.crownEmoji}>👑</Text>
          </View>
          <Text style={styles.heroTitle}>Cal AI Premium</Text>
          <Text style={styles.heroSubtitle}>
            Desbloquea el poder total de la IA{'\n'}para tu nutrición
          </Text>
        </View>

        {/* Features */}
        <View style={styles.featuresCard}>
          {FEATURES.map((f, i) => (
            <View key={i} style={styles.featureRow}>
              <View style={styles.featureIconBg}>
                <Ionicons name={f.icon as any} size={16} color={colors.black} />
              </View>
              <Text style={styles.featureLabel}>{f.label}</Text>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            </View>
          ))}
        </View>

        {/* Plans */}
        <Text style={styles.sectionTitle}>Elige tu plan</Text>
        <View style={styles.plansRow}>
          {(Object.entries(PLANS) as [Plan, typeof PLANS[Plan]][]).map(([key, plan]) => {
            const isSelected = selectedPlan === key;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.planCard, isSelected && styles.planCardActive]}
                onPress={() => setSelectedPlan(key)}
                activeOpacity={0.8}
              >
                {'badge' in plan && plan.badge && (
                  <View style={styles.planBadge}>
                    <Text style={styles.planBadgeText}>{plan.badge}</Text>
                  </View>
                )}
                <Text style={[styles.planLabel, isSelected && styles.planLabelActive]}>
                  {plan.label}
                </Text>
                <Text style={[styles.planPrice, isSelected && styles.planPriceActive]}>
                  {plan.price}
                </Text>
                <Text style={[styles.planPeriod, isSelected && { color: colors.white + 'CC' }]}>
                  {plan.period}
                </Text>
                {'perMonth' in plan && plan.perMonth && (
                  <Text style={[styles.planPerMonth, isSelected && { color: colors.white + 'BB' }]}>
                    {plan.perMonth}
                  </Text>
                )}
                {isSelected && (
                  <View style={styles.planCheck}>
                    <Ionicons name="checkmark-circle" size={18} color={colors.white} />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* CTA */}
        <TouchableOpacity
          style={[styles.ctaBtn, loading && { opacity: 0.7 }]}
          onPress={handleSubscribe}
          disabled={loading}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaBtnText}>
            {loading ? 'Procesando...' : 'Iniciar prueba gratuita 7 días'}
          </Text>
        </TouchableOpacity>
        <Text style={styles.ctaNote}>
          Cancela cuando quieras · Sin compromiso
        </Text>

        {/* Restore */}
        <TouchableOpacity style={styles.restoreBtn} onPress={handleRestore}>
          <Text style={styles.restoreText}>Restaurar compra anterior</Text>
        </TouchableOpacity>

        {/* Legal */}
        <Text style={styles.legal}>
          Al suscribirte aceptas los Términos de servicio y la Política de privacidad.
          La suscripción se renueva automáticamente. Cancela en cualquier momento
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
    backgroundColor: colors.primary,
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
    backgroundColor: colors.primary,
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
