/**
 * RecipeDetailScreen — Full recipe view with macros, ingredients, instructions,
 * and a "Log This Meal" button that adds the macros to the day's food log.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, useLayout, useThemeColors } from '../../theme';
import { Recipe } from '../../data/recipes';
import * as foodService from '../../services/food.service';
import { haptics } from '../../hooks/useHaptics';

function MacroCard({
  label,
  value,
  unit,
  color,
  c,
}: {
  label: string;
  value: number;
  unit: string;
  color: string;
  c: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View style={[macroStyles.card, { borderColor: color + '30', backgroundColor: c.surface }]}>
      <Text style={[macroStyles.value, { color }]}>{value}</Text>
      <Text style={[macroStyles.unit, { color: c.gray }]}>{unit}</Text>
      <Text style={[macroStyles.label, { color: c.gray }]}>{label}</Text>
    </View>
  );
}

const macroStyles = StyleSheet.create({
  card: {
    flex: 1,
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingVertical: spacing.sm + 2,
    gap: 1,
  },
  value: { fontSize: 20, fontWeight: '800' },
  unit: { ...typography.caption },
  label: { ...typography.caption, marginTop: 2 },
});

export default function RecipeDetailScreen({ route, navigation }: any) {
  const recipe: Recipe = route.params.recipe;
  const insets = useSafeAreaInsets();
  const { sidePadding } = useLayout();
  const c = useThemeColors();
  const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(new Set());
  const [logging, setLogging] = useState(false);

  const toggleIngredient = (index: number) => {
    haptics.light();
    setCheckedIngredients((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const getMealType = (): foodService.MealType => {
    const mapping: Record<string, foodService.MealType> = {
      breakfast: 'breakfast',
      lunch: 'lunch',
      dinner: 'dinner',
      snack: 'snack',
    };
    return mapping[recipe.mealType] ?? 'lunch';
  };

  const handleLogMeal = async () => {
    setLogging(true);
    try {
      await foodService.manualLogFood({
        food_name: recipe.name,
        calories: recipe.calories,
        protein_g: recipe.protein,
        carbs_g: recipe.carbs,
        fats_g: recipe.fat,
        meal_type: getMealType(),
      });
      haptics.success();
      Alert.alert('Registrado', `"${recipe.name}" se agrego a tu registro del dia.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch {
      haptics.error();
      Alert.alert('Error', 'No se pudo registrar la receta. Intenta de nuevo.');
    } finally {
      setLogging(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: sidePadding }]}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: c.surface }]}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Volver"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={20} color={c.black} />
        </TouchableOpacity>
        <View style={styles.headerMeta}>
          <View style={[styles.headerBadge, { backgroundColor: c.surface }]}>
            <Ionicons name="time-outline" size={13} color={c.gray} />
            <Text style={[styles.headerBadgeText, { color: c.gray }]}>{recipe.prepTime} min</Text>
          </View>
          <View style={[styles.headerBadge, { backgroundColor: c.surface }]}>
            <Ionicons name="people-outline" size={13} color={c.gray} />
            <Text style={[styles.headerBadgeText, { color: c.gray }]}>{recipe.servings} porc.</Text>
          </View>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingHorizontal: sidePadding }]}
      >
        {/* Emoji + Name */}
        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>{recipe.image}</Text>
          <Text style={[styles.heroName, { color: c.black }]}>{recipe.name}</Text>
          <View style={[styles.dietBadge, { backgroundColor: c.accent + '15' }]}>
            <Text style={[styles.dietBadgeText, { color: c.accent }]}>
              {recipe.dietType === 'classic' ? 'Clasica' :
               recipe.dietType === 'vegetarian' ? 'Vegetariana' :
               recipe.dietType === 'vegan' ? 'Vegana' : 'Pescatariana'}
            </Text>
          </View>
        </View>

        {/* Macro cards */}
        <View style={styles.macroRow}>
          <MacroCard label="Calorias" value={recipe.calories} unit="kcal" color={c.accent} c={c} />
          <MacroCard label="Proteina" value={recipe.protein} unit="g" color={c.protein} c={c} />
          <MacroCard label="Carbos" value={recipe.carbs} unit="g" color={c.carbs} c={c} />
          <MacroCard label="Grasas" value={recipe.fat} unit="g" color={c.fats} c={c} />
        </View>

        {/* Ingredients */}
        <Text style={[styles.sectionTitle, { color: c.black }]}>Ingredientes</Text>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          {recipe.ingredients.map((ingredient, i) => {
            const checked = checkedIngredients.has(i);
            return (
              <TouchableOpacity
                key={i}
                style={[styles.ingredientRow, { borderBottomColor: c.grayLight }]}
                onPress={() => toggleIngredient(i)}
                activeOpacity={0.7}
                accessibilityLabel={`${ingredient}${checked ? ', marcado' : ''}`}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
              >
                <View style={[styles.checkbox, { borderColor: c.grayLight }, checked && styles.checkboxChecked]}>
                  {checked && <Ionicons name="checkmark" size={14} color={colors.white} />}
                </View>
                <Text style={[styles.ingredientText, { color: c.black }, checked && { textDecorationLine: 'line-through', color: c.gray }]}>
                  {ingredient}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Instructions */}
        <Text style={[styles.sectionTitle, { color: c.black }]}>Instrucciones</Text>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          {recipe.instructions.map((step, i) => (
            <View key={i} style={[styles.stepRow, { borderBottomColor: c.grayLight }]}>
              <View style={[styles.stepNumber, { backgroundColor: c.primary }]}>
                <Text style={[styles.stepNumberText, { color: c.white }]}>{i + 1}</Text>
              </View>
              <Text style={[styles.stepText, { color: c.black }]}>{step}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Log button - fixed at bottom */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.sm, paddingHorizontal: sidePadding, backgroundColor: c.bg, borderTopColor: c.border }]}>
        <TouchableOpacity
          style={[styles.logBtn, { backgroundColor: c.primary }, logging && styles.logBtnDisabled]}
          onPress={handleLogMeal}
          disabled={logging}
          activeOpacity={0.85}
          accessibilityLabel="Registrar esta receta en tu diario"
          accessibilityRole="button"
        >
          {logging ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <>
              <Ionicons name="add-circle-outline" size={20} color={colors.white} />
              <Text style={styles.logBtnText}>Registrar Comida</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerMeta: { flexDirection: 'row', gap: spacing.sm },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.full,
  },
  headerBadgeText: { ...typography.caption },
  scroll: { paddingTop: spacing.sm },
  hero: { alignItems: 'center', marginBottom: spacing.lg },
  heroEmoji: { fontSize: 64, marginBottom: spacing.sm },
  heroName: {
    ...typography.title,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  dietBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  dietBadgeText: {
    ...typography.caption,
    fontWeight: '700',
  },
  macroRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.label,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  ingredientText: {
    ...typography.body,
    flex: 1,
  },
  stepRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    ...typography.caption,
    fontWeight: '800',
  },
  stepText: {
    ...typography.body,
    flex: 1,
    lineHeight: 22,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    paddingTop: spacing.sm,
  },
  logBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.full,
    height: 56,
  },
  logBtnDisabled: {
    opacity: 0.6,
  },
  logBtnText: {
    ...typography.button,
    color: colors.white,
  },
});
