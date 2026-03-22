/**
 * RecipeDetailScreen — Full recipe view with macros, ingredients, instructions,
 * and a "Log This Meal" button that adds the macros to the day's food log.
 *
 * Sprint 5:
 * - Portion adjustment (0.5x, 1x, 2x) with real-time macro recalculation
 * - Integrated cooking timer with countdown and notification
 * - Log button registers the adjusted portion
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Animated,
  Vibration,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, useLayout, useThemeColors } from '../../theme';
import { Recipe } from '../../data/recipes';
import * as foodService from '../../services/food.service';
import { haptics } from '../../hooks/useHaptics';
import { useAnalytics } from '../../hooks/useAnalytics';

// ─── Portion multipliers ──────────────────────────────────────────────────────

const PORTION_OPTIONS: { label: string; value: number }[] = [
  { label: '0.5x', value: 0.5 },
  { label: '1x', value: 1 },
  { label: '1.5x', value: 1.5 },
  { label: '2x', value: 2 },
];

// ─── Cooking Timer Hook ───────────────────────────────────────────────────────

function useCookingTimer(totalMinutes: number) {
  const [isRunning, setIsRunning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(totalMinutes * 60);
  const [isComplete, setIsComplete] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback(() => {
    if (isComplete) {
      // Reset if timer already completed
      setSecondsLeft(totalMinutes * 60);
      setIsComplete(false);
    }
    setIsRunning(true);
  }, [isComplete, totalMinutes]);

  const pause = useCallback(() => {
    setIsRunning(false);
  }, []);

  const reset = useCallback(() => {
    setIsRunning(false);
    setSecondsLeft(totalMinutes * 60);
    setIsComplete(false);
  }, [totalMinutes]);

  useEffect(() => {
    if (isRunning && secondsLeft > 0) {
      intervalRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            setIsRunning(false);
            setIsComplete(true);
            Vibration.vibrate([0, 500, 200, 500, 200, 500]);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, secondsLeft]);

  const formatTime = (secs: number): string => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const progress = 1 - secondsLeft / (totalMinutes * 60);

  return { isRunning, secondsLeft, isComplete, start, pause, reset, formatTime, progress };
}

// ─── Macro Card ───────────────────────────────────────────────────────────────

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

// ─── Cooking Timer Widget ─────────────────────────────────────────────────────

function CookingTimer({
  prepTime,
  c,
}: {
  prepTime: number;
  c: ReturnType<typeof useThemeColors>;
}) {
  const timer = useCookingTimer(prepTime);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation when timer is running
  useEffect(() => {
    if (timer.isRunning) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.05, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [timer.isRunning, pulseAnim]);

  return (
    <View style={[timerStyles.container, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={timerStyles.header}>
        <Ionicons name="timer-outline" size={18} color={c.accent} />
        <Text style={[timerStyles.title, { color: c.black }]}>Timer de Coccion</Text>
      </View>

      {/* Progress bar */}
      <View style={[timerStyles.progressBg, { backgroundColor: c.grayLight }]}>
        <View
          style={[
            timerStyles.progressFill,
            {
              backgroundColor: timer.isComplete ? c.success : c.accent,
              width: `${Math.min(timer.progress * 100, 100)}%`,
            },
          ]}
        />
      </View>

      <View style={timerStyles.timerRow}>
        <Animated.Text
          style={[
            timerStyles.time,
            { color: timer.isComplete ? c.success : c.black, transform: [{ scale: pulseAnim }] },
          ]}
        >
          {timer.isComplete ? 'Listo!' : timer.formatTime(timer.secondsLeft)}
        </Animated.Text>

        <View style={timerStyles.buttons}>
          {timer.isRunning ? (
            <TouchableOpacity
              style={[timerStyles.btn, { backgroundColor: c.grayLight }]}
              onPress={() => { haptics.light(); timer.pause(); }}
              accessibilityLabel="Pausar timer"
            >
              <Ionicons name="pause" size={16} color={c.black} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[timerStyles.btn, { backgroundColor: c.accent }]}
              onPress={() => { haptics.light(); timer.start(); }}
              accessibilityLabel={timer.isComplete ? 'Reiniciar timer' : 'Iniciar timer'}
            >
              <Ionicons name="play" size={16} color={colors.white} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[timerStyles.btn, { backgroundColor: c.grayLight }]}
            onPress={() => { haptics.light(); timer.reset(); }}
            accessibilityLabel="Reiniciar timer"
          >
            <Ionicons name="refresh" size={16} color={c.gray} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const timerStyles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.label,
  },
  progressBg: {
    height: 4,
    borderRadius: 2,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  timerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  time: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 1,
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  btn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function RecipeDetailScreen({ route, navigation }: any) {
  const recipe: Recipe = route.params.recipe;
  const insets = useSafeAreaInsets();
  const { sidePadding } = useLayout();
  const c = useThemeColors();
  const { track } = useAnalytics('RecipeDetail');
  const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(new Set());
  const [logging, setLogging] = useState(false);
  const [portion, setPortion] = useState(1);

  // Compute adjusted macros based on selected portion multiplier
  const adjusted = {
    calories: Math.round(recipe.calories * portion),
    protein: Math.round(recipe.protein * portion),
    carbs: Math.round(recipe.carbs * portion),
    fat: Math.round(recipe.fat * portion),
  };

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
        food_name: portion !== 1 ? `${recipe.name} (${portion}x)` : recipe.name,
        calories: adjusted.calories,
        protein_g: adjusted.protein,
        carbs_g: adjusted.carbs,
        fats_g: adjusted.fat,
        meal_type: getMealType(),
      });
      haptics.success();
      track('recipe_logged', {
        recipe_name: recipe.name,
        portion,
        calories: adjusted.calories,
      });
      Alert.alert(
        'Registrado',
        `"${recipe.name}" (${portion}x) se agrego a tu registro del dia.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
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
               recipe.dietType === 'vegan' ? 'Vegana' :
               recipe.dietType === 'keto' ? 'Keto' :
               recipe.dietType === 'latin' ? 'Latina' :
               'Pescatariana'}
            </Text>
          </View>
        </View>

        {/* Portion Selector */}
        <View style={styles.portionSection}>
          <Text style={[styles.portionLabel, { color: c.gray }]}>Porciones</Text>
          <View style={styles.portionRow}>
            {PORTION_OPTIONS.map((opt) => {
              const isActive = portion === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.portionChip,
                    {
                      backgroundColor: isActive ? c.primary : c.surface,
                      borderColor: isActive ? c.primary : c.grayLight,
                    },
                  ]}
                  onPress={() => {
                    haptics.light();
                    setPortion(opt.value);
                    track('portion_changed', { portion: opt.value });
                  }}
                  accessibilityLabel={`${opt.label} porcion`}
                  accessibilityState={{ selected: isActive }}
                >
                  <Text style={[styles.portionText, { color: isActive ? c.white : c.black }]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Macro cards — adjusted by portion */}
        <View style={styles.macroRow}>
          <MacroCard label="Calorias" value={adjusted.calories} unit="kcal" color={c.accent} c={c} />
          <MacroCard label="Proteina" value={adjusted.protein} unit="g" color={c.protein} c={c} />
          <MacroCard label="Carbos" value={adjusted.carbs} unit="g" color={c.carbs} c={c} />
          <MacroCard label="Grasas" value={adjusted.fat} unit="g" color={c.fats} c={c} />
        </View>

        {/* Cooking Timer */}
        <CookingTimer prepTime={recipe.prepTime} c={c} />

        {/* Ingredients */}
        <Text style={[styles.sectionTitle, { color: c.black }]}>Ingredientes</Text>
        {portion !== 1 && (
          <Text style={[styles.portionNote, { color: c.accent }]}>
            Cantidades ajustadas para {portion}x porciones
          </Text>
        )}
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
          accessibilityLabel={`Registrar ${portion}x porcion de ${recipe.name}`}
          accessibilityRole="button"
        >
          {logging ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <>
              <Ionicons name="add-circle-outline" size={20} color={colors.white} />
              <Text style={styles.logBtnText}>
                Registrar {portion !== 1 ? `(${portion}x) ` : ''}— {adjusted.calories} kcal
              </Text>
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
  // Portion selector
  portionSection: {
    marginBottom: spacing.md,
  },
  portionLabel: {
    ...typography.label,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  portionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  portionChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  portionText: {
    ...typography.label,
    fontWeight: '700',
  },
  portionNote: {
    ...typography.caption,
    fontStyle: 'italic',
    marginBottom: spacing.sm,
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
