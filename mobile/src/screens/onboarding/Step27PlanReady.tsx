import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, radius } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { useOnboarding } from '../../context/OnboardingContext';
import { StepProps } from './OnboardingNavigator';

function MacroBar({ label, grams, color, maxGrams }: { label: string; grams: number; color: string; maxGrams: number }) {
  const widthAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(widthAnim, { toValue: grams / maxGrams, duration: 800, delay: 400, useNativeDriver: false }).start();
  }, []);

  return (
    <View style={macroStyles.row}>
      <Text style={macroStyles.label}>{label}</Text>
      <View style={macroStyles.track}>
        <Animated.View style={[macroStyles.fill, { backgroundColor: color, width: widthAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
      </View>
      <Text style={macroStyles.value}>{grams}g</Text>
    </View>
  );
}

const macroStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { ...typography.caption, color: colors.gray, width: 60 },
  track: { flex: 1, height: 8, backgroundColor: colors.grayLight, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  value: { ...typography.caption, color: colors.black, width: 36, textAlign: 'right' },
});

export default function Step27PlanReady({ onNext, onBack, step, totalSteps }: StepProps) {
  const { data } = useOnboarding();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  const plan = data.plan;
  const calories = plan?.dailyCalories ?? 1800;
  const carbs = plan?.dailyCarbsG ?? 200;
  const protein = plan?.dailyProteinG ?? 130;
  const fats = plan?.dailyFatsG ?? 60;
  const healthScore = Math.round((plan?.healthScore ?? 7.0) * 10);

  const maxMacro = Math.max(carbs, protein, fats);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 8, bounciness: 6 }),
    ]).start();
  }, []);

  return (
    <OnboardingLayout
      step={step}
      totalSteps={totalSteps}
      onBack={onBack}
      scrollable={false}
      footer={<PrimaryButton label="Ver mi plan" onPress={onNext} />}
    >
      <Text style={styles.title}>¡Tu plan{'\n'}está listo! 🎉</Text>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: fadeAnim, transform: [{ scale: scaleAnim }], gap: spacing.md, paddingTop: spacing.lg }}>
          {/* Calories card */}
          <View style={styles.caloriesCard}>
            <Text style={styles.caloriesLabel}>Meta calórica diaria</Text>
            <Text style={styles.caloriesValue}>{calories}</Text>
            <Text style={styles.caloriesUnit}>kcal / día</Text>
          </View>

          {/* Macros card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Tus Macros</Text>
            <View style={styles.macroGrid}>
              <View style={styles.macroPill}>
                <Text style={styles.macroNum}>{carbs}g</Text>
                <Text style={styles.macroLbl}>Carbos</Text>
              </View>
              <View style={[styles.macroPill, { backgroundColor: '#FEE2E2' }]}>
                <Text style={[styles.macroNum, { color: colors.protein }]}>{protein}g</Text>
                <Text style={styles.macroLbl}>Proteína</Text>
              </View>
              <View style={[styles.macroPill, { backgroundColor: '#EFF6FF' }]}>
                <Text style={[styles.macroNum, { color: colors.fats }]}>{fats}g</Text>
                <Text style={styles.macroLbl}>Grasas</Text>
              </View>
            </View>

            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              <MacroBar label="Carbos" grams={carbs} color={colors.carbs} maxGrams={maxMacro} />
              <MacroBar label="Proteína" grams={protein} color={colors.protein} maxGrams={maxMacro} />
              <MacroBar label="Grasas" grams={fats} color={colors.fats} maxGrams={maxMacro} />
            </View>
          </View>

          {/* Health score */}
          <View style={[styles.card, styles.scoreCard]}>
            <View>
              <Text style={styles.cardTitle}>Puntuación de salud</Text>
              <Text style={styles.scoreDesc}>Basado en tu perfil y objetivos</Text>
            </View>
            <View style={styles.scoreBadge}>
              <Text style={styles.scoreNum}>{healthScore}</Text>
              <Text style={styles.scoreMax}>/100</Text>
            </View>
          </View>

          <View style={{ height: 80 }} />
        </Animated.View>
      </ScrollView>
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, color: colors.black, marginTop: spacing.md },
  caloriesCard: {
    backgroundColor: colors.black,
    borderRadius: 20,
    padding: spacing.xl,
    alignItems: 'center',
    gap: 4,
  },
  caloriesLabel: { ...typography.label, color: 'rgba(255,255,255,0.7)' },
  caloriesValue: { fontSize: 56, fontWeight: '900', color: colors.white, letterSpacing: -2 },
  caloriesUnit: { ...typography.caption, color: 'rgba(255,255,255,0.85)' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardTitle: { ...typography.label, color: colors.black, fontWeight: '700' },
  macroGrid: { flexDirection: 'row', gap: spacing.sm },
  macroPill: {
    flex: 1,
    backgroundColor: '#FEF3C7',
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    gap: 2,
  },
  macroNum: { fontSize: 18, fontWeight: '800', color: colors.carbs },
  macroLbl: { ...typography.caption, color: colors.gray },
  scoreCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scoreDesc: { ...typography.caption, color: colors.gray },
  scoreBadge: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  scoreNum: { fontSize: 40, fontWeight: '900', color: colors.black, letterSpacing: -1 },
  scoreMax: { ...typography.subtitle, color: colors.gray },
});
