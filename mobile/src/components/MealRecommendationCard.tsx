/**
 * MealRecommendationCard — Card showing a single recommended meal.
 *
 * Displays: name, calories, protein, prep time, macro pills (P/C/G),
 * explanation text, difficulty dots, category badge, and a "Registrar" CTA.
 * Optimized with React.memo. Haptic feedback on tap.
 */
import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius, shadows } from '../theme';
import { haptics } from '../hooks/useHaptics';
import type { RecommendedMeal } from '../hooks/useRecommendations';

interface MealRecommendationCardProps {
  meal: RecommendedMeal;
  missingProtein?: number;
  onRegister: (meal: RecommendedMeal) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  rapido: 'Rapido',
  alto_en_proteina: 'Alto en proteina',
  vegetariano: 'Vegetariano',
  chileno: 'Chileno',
  low_carb: 'Low carb',
  desayuno: 'Desayuno',
  almuerzo: 'Almuerzo',
  cena: 'Cena',
  snack: 'Snack',
};

const CATEGORY_COLORS: Record<string, string> = {
  rapido: '#10B981',
  alto_en_proteina: '#EF4444',
  vegetariano: '#22C55E',
  chileno: '#F59E0B',
  low_carb: '#8B5CF6',
};

function DifficultyDots({ level }: { level: number }) {
  const c = useThemeColors();
  return (
    <View style={diffStyles.row} accessibilityLabel={`Dificultad ${level} de 3`}>
      {[1, 2, 3].map((i) => (
        <View
          key={i}
          style={[
            diffStyles.dot,
            { backgroundColor: i <= level ? c.accent : c.grayLight },
          ]}
        />
      ))}
    </View>
  );
}

const diffStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 3, alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3 },
});

const MealRecommendationCard = React.memo(function MealRecommendationCard({
  meal,
  missingProtein,
  onRegister,
}: MealRecommendationCardProps) {
  const c = useThemeColors();

  const handleRegister = useCallback(() => {
    haptics.light();
    onRegister(meal);
  }, [meal, onRegister]);

  const categoryLabel = CATEGORY_LABELS[meal.category] ?? meal.category;
  const categoryColor = CATEGORY_COLORS[meal.category] ?? c.accent;

  return (
    <View
      style={[styles.card, { backgroundColor: c.surface, borderColor: c.grayLight }]}
      accessibilityLabel={`${meal.name}, ${Math.round(meal.calories)} calorias, ${Math.round(meal.protein_g)} gramos de proteina, ${meal.prep_time_min} minutos de preparacion`}
    >
      {/* Category badge */}
      <View style={[styles.badge, { backgroundColor: categoryColor + '18' }]}>
        <Text style={[styles.badgeText, { color: categoryColor }]}>{categoryLabel}</Text>
      </View>

      {/* Name */}
      <Text style={[styles.name, { color: c.black }]} numberOfLines={2}>
        {meal.name}
      </Text>

      {/* Stats row: calories, protein, prep time */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Ionicons name="flame-outline" size={14} color={c.gray} />
          <Text style={[styles.statText, { color: c.gray }]}>{Math.round(meal.calories)} kcal</Text>
        </View>
        <View style={styles.stat}>
          <Ionicons name="barbell-outline" size={14} color={c.protein} />
          <Text style={[styles.statText, { color: c.gray }]}>{Math.round(meal.protein_g)}g prot</Text>
        </View>
        <View style={styles.stat}>
          <Ionicons name="time-outline" size={14} color={c.gray} />
          <Text style={[styles.statText, { color: c.gray }]}>{meal.prep_time_min} min</Text>
        </View>
      </View>

      {/* Macro pills */}
      <View style={styles.macroRow}>
        <View style={[styles.pill, { backgroundColor: c.protein + '20' }]}>
          <Text style={[styles.pillText, { color: c.protein }]}>P {Math.round(meal.protein_g)}g</Text>
        </View>
        <View style={[styles.pill, { backgroundColor: c.carbs + '20' }]}>
          <Text style={[styles.pillText, { color: c.carbs }]}>C {Math.round(meal.carbs_g)}g</Text>
        </View>
        <View style={[styles.pill, { backgroundColor: c.fats + '20' }]}>
          <Text style={[styles.pillText, { color: c.fats }]}>G {Math.round(meal.fats_g)}g</Text>
        </View>
      </View>

      {/* Explanation text */}
      {missingProtein != null && missingProtein > 0 && (
        <Text style={[styles.explanation, { color: c.protein }]}>
          Te faltan {Math.round(missingProtein)}g de proteina
        </Text>
      )}

      {/* Footer: difficulty + CTA */}
      <View style={styles.footer}>
        <DifficultyDots level={meal.difficulty} />
        <TouchableOpacity
          style={[styles.cta, { backgroundColor: c.black }]}
          onPress={handleRegister}
          activeOpacity={0.85}
          accessibilityLabel={`Registrar ${meal.name}`}
          accessibilityRole="button"
        >
          <Text style={[styles.ctaText, { color: c.white }]}>Registrar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

export default MealRecommendationCard;

const CARD_WIDTH = 220;

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginRight: spacing.sm,
    gap: spacing.xs + 2,
    ...shadows.sm,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  badgeText: {
    ...typography.caption,
    fontWeight: '600',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  name: {
    ...typography.bodyMd,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  statText: {
    ...typography.caption,
    fontSize: 11,
  },
  macroRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  pillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  explanation: {
    ...typography.caption,
    fontWeight: '600',
    fontStyle: 'italic',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  cta: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    minHeight: 32,
    justifyContent: 'center',
  },
  ctaText: {
    ...typography.caption,
    fontWeight: '700',
  },
});
