import React, { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, radius } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { StepProps } from './OnboardingNavigator';

const BENEFITS = [
  { icon: 'camera-outline',          text: 'Escaneo de comida con IA ilimitado' },
  { icon: 'trending-down-outline',   text: 'Plan de peso personalizado' },
  { icon: 'nutrition-outline',       text: 'Seguimiento de macros y calorías' },
  { icon: 'bar-chart-outline',       text: 'Análisis de progreso e insights' },
  { icon: 'notifications-outline',   text: 'Recordatorios inteligentes de comidas' },
  { icon: 'people-outline',          text: 'Comunidad y responsabilidad' },
];

const PLANS = [
  {
    id: 'annual',
    label: 'Anual',
    price: '$39.99',
    perMonth: '$3.33/mes',
    badge: 'MEJOR VALOR',
    savings: 'Ahorra 72%',
  },
  {
    id: 'monthly',
    label: 'Mensual',
    price: '$12.99',
    perMonth: '$12.99/mes',
    badge: null,
    savings: null,
  },
];

export default function Step28Paywall({ onNext, onBack, step, totalSteps }: StepProps) {
  const [selectedPlan, setSelectedPlan] = useState('annual');

  return (
    <OnboardingLayout step={step} totalSteps={totalSteps} onBack={onBack} scrollable={false}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Comienza tu{'\n'}prueba gratis hoy</Text>
        <Text style={styles.subtitle}>Únete a más de 500,000 personas alcanzando sus metas</Text>

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
        <View style={styles.plans}>
          {PLANS.map(p => (
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

        {/* No payment note */}
        <View style={styles.noCCRow}>
          <Ionicons name="shield-checkmark-outline" size={16} color={colors.gray} />
          <Text style={styles.noCCText}>3 días de prueba gratis · Sin pago ahora · Cancela cuando quieras</Text>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton label="Comenzar prueba gratis" onPress={onNext} />
        <TouchableOpacity onPress={onNext} style={styles.skipBtn}>
          <Text style={styles.skipText}>No gracias, lo dejo pasar</Text>
        </TouchableOpacity>
      </View>
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
  planPer: { ...typography.caption, color: colors.gray },
  noCCRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  noCCText: { ...typography.caption, color: colors.gray, textAlign: 'center' },
  footer: {
    position: 'absolute',
    bottom: spacing.lg,
    left: spacing.lg,
    right: spacing.lg,
    gap: spacing.sm,
    backgroundColor: colors.white,
    paddingTop: spacing.sm,
  },
  skipBtn: { alignItems: 'center', paddingVertical: spacing.xs },
  skipText: { ...typography.caption, color: colors.gray },
});
