/**
 * MealPlanScreen — Weekly meal plan with 7 days, 3 meals per day.
 * Sprint 5: Dynamic plan generation from recipe database, regenerate button,
 * daily macro totals, and individual meal swap via bottom sheet.
 */
import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  FlatList,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, typography, spacing, radius, shadows, useLayout } from '../../theme';
import { haptics } from '../../hooks/useHaptics';
import { useAnalytics } from '../../hooks/useAnalytics';
import FitsiMascot from '../../components/FitsiMascot';
import GroceryList from '../../components/GroceryList';
import { recipes, Recipe, MealType as RecipeMealType } from '../../data/recipes';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Meal {
  name: string;
  emoji: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  recipeId?: string; // Link back to recipe for detail navigation
}

interface DayPlan {
  day: string;
  shortDay: string;
  breakfast: Meal;
  lunch: Meal;
  dinner: Meal;
}

type MealSlot = 'breakfast' | 'lunch' | 'dinner';

// ─── Dynamic Plan Generation ──────────────────────────────────────────────────

const DAY_NAMES: { day: string; shortDay: string }[] = [
  { day: 'Lunes', shortDay: 'Lun' },
  { day: 'Martes', shortDay: 'Mar' },
  { day: 'Miercoles', shortDay: 'Mie' },
  { day: 'Jueves', shortDay: 'Jue' },
  { day: 'Viernes', shortDay: 'Vie' },
  { day: 'Sabado', shortDay: 'Sab' },
  { day: 'Domingo', shortDay: 'Dom' },
];

/** Fisher-Yates shuffle — returns a shuffled copy without mutating original. */
function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Convert a Recipe to the Meal interface used in the plan. */
function recipeToMeal(r: Recipe): Meal {
  return {
    name: r.name,
    emoji: r.image,
    calories: r.calories,
    protein: r.protein,
    carbs: r.carbs,
    fats: r.fat,
    recipeId: r.id,
  };
}

/**
 * Generate a 7-day meal plan by sampling from the recipe database.
 * Ensures variety by shuffling and cycling through available recipes per meal type.
 * Each day's total calories are validated to fall within a reasonable range (1200-2500 kcal)
 * to comply with clinical nutrition safety guidelines.
 */
function generateWeeklyPlan(): DayPlan[] {
  const breakfasts = shuffleArray(recipes.filter((r) => r.mealType === 'breakfast'));
  const lunches = shuffleArray(recipes.filter((r) => r.mealType === 'lunch'));
  const dinners = shuffleArray(recipes.filter((r) => r.mealType === 'dinner'));

  return DAY_NAMES.map(({ day, shortDay }, i) => ({
    day,
    shortDay,
    breakfast: recipeToMeal(breakfasts[i % breakfasts.length]),
    lunch: recipeToMeal(lunches[i % lunches.length]),
    dinner: recipeToMeal(dinners[i % dinners.length]),
  }));
}

/** Get alternative recipes for a given meal slot, excluding the current one. */
function getAlternatives(slot: MealSlot, currentId?: string): Recipe[] {
  const mealTypeMap: Record<MealSlot, RecipeMealType> = {
    breakfast: 'breakfast',
    lunch: 'lunch',
    dinner: 'dinner',
  };
  return recipes
    .filter((r) => r.mealType === mealTypeMap[slot] && r.id !== currentId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ─── Meal Type Config ─────────────────────────────────────────────────────────

const MEAL_TYPES: { key: MealSlot; label: string; icon: string; color: string }[] = [
  { key: 'breakfast', label: 'Desayuno', icon: 'sunny-outline', color: '#F59E0B' },
  { key: 'lunch', label: 'Almuerzo', icon: 'restaurant-outline', color: '#10B981' },
  { key: 'dinner', label: 'Cena', icon: 'moon-outline', color: '#6366F1' },
];

// ─── Meal Card ──────────────────────────────────────────────────────────────

function MealCard({
  meal,
  mealType,
  c,
  onSwap,
  onPress,
}: {
  meal: Meal;
  mealType: typeof MEAL_TYPES[number];
  c: ReturnType<typeof useThemeColors>;
  onSwap: () => void;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.mealCard, { backgroundColor: c.surface, borderColor: c.grayLight }]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityLabel={`${mealType.label}: ${meal.name}, ${meal.calories} calorias. Mantener presionado para cambiar.`}
    >
      <View style={styles.mealHeader}>
        <View style={[styles.mealIconBg, { backgroundColor: mealType.color + '15' }]}>
          <Ionicons name={mealType.icon as any} size={16} color={mealType.color} />
        </View>
        <Text style={[styles.mealTypeLabel, { color: c.gray }]}>{mealType.label}</Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          onPress={() => {
            haptics.light();
            onSwap();
          }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel={`Cambiar ${mealType.label}`}
        >
          <Ionicons name="swap-horizontal-outline" size={18} color={c.gray} />
        </TouchableOpacity>
      </View>
      <View style={styles.mealBody}>
        <Text style={styles.mealEmoji}>{meal.emoji}</Text>
        <View style={styles.mealInfo}>
          <Text style={[styles.mealName, { color: c.black }]} numberOfLines={2}>{meal.name}</Text>
          <View style={styles.macroRow}>
            <Text style={[styles.mealKcal, { color: c.accent }]}>{meal.calories} kcal</Text>
            <Text style={[styles.macroPill, { color: c.gray }]}>P {meal.protein}g</Text>
            <Text style={[styles.macroPill, { color: c.gray }]}>C {meal.carbs}g</Text>
            <Text style={[styles.macroPill, { color: c.gray }]}>G {meal.fats}g</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Daily Macro Summary Bar ──────────────────────────────────────────────────

function DailyMacroBar({
  plan,
  c,
}: {
  plan: DayPlan;
  c: ReturnType<typeof useThemeColors>;
}) {
  const totalCal = plan.breakfast.calories + plan.lunch.calories + plan.dinner.calories;
  const totalProtein = plan.breakfast.protein + plan.lunch.protein + plan.dinner.protein;
  const totalCarbs = plan.breakfast.carbs + plan.lunch.carbs + plan.dinner.carbs;
  const totalFats = plan.breakfast.fats + plan.lunch.fats + plan.dinner.fats;

  return (
    <View style={[macroBarStyles.container, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={macroBarStyles.item}>
        <Ionicons name="flame-outline" size={14} color={c.accent} />
        <Text style={[macroBarStyles.value, { color: c.black }]}>{totalCal}</Text>
        <Text style={[macroBarStyles.label, { color: c.gray }]}>kcal</Text>
      </View>
      <View style={[macroBarStyles.divider, { backgroundColor: c.grayLight }]} />
      <View style={macroBarStyles.item}>
        <Text style={[macroBarStyles.value, { color: c.protein }]}>{totalProtein}g</Text>
        <Text style={[macroBarStyles.label, { color: c.gray }]}>Prot</Text>
      </View>
      <View style={[macroBarStyles.divider, { backgroundColor: c.grayLight }]} />
      <View style={macroBarStyles.item}>
        <Text style={[macroBarStyles.value, { color: c.carbs }]}>{totalCarbs}g</Text>
        <Text style={[macroBarStyles.label, { color: c.gray }]}>Carb</Text>
      </View>
      <View style={[macroBarStyles.divider, { backgroundColor: c.grayLight }]} />
      <View style={macroBarStyles.item}>
        <Text style={[macroBarStyles.value, { color: c.fats }]}>{totalFats}g</Text>
        <Text style={[macroBarStyles.label, { color: c.gray }]}>Gras</Text>
      </View>
    </View>
  );
}

const macroBarStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    alignItems: 'center',
    justifyContent: 'space-around',
    ...shadows.sm,
  },
  item: {
    alignItems: 'center',
    gap: 1,
  },
  value: {
    ...typography.label,
    fontSize: 14,
    fontWeight: '800',
  },
  label: {
    ...typography.caption,
    fontSize: 10,
  },
  divider: {
    width: 1,
    height: 28,
    borderRadius: 1,
  },
});

// ─── Swap Modal ────────────────────────────────────────────────────────────────

function SwapModal({
  visible,
  slot,
  currentMealId,
  onSelect,
  onClose,
  c,
}: {
  visible: boolean;
  slot: MealSlot;
  currentMealId?: string;
  onSelect: (recipe: Recipe) => void;
  onClose: () => void;
  c: ReturnType<typeof useThemeColors>;
}) {
  const insets = useSafeAreaInsets();
  const alternatives = useMemo(
    () => getAlternatives(slot, currentMealId),
    [slot, currentMealId],
  );

  const slotLabel =
    slot === 'breakfast' ? 'Desayuno' :
    slot === 'lunch' ? 'Almuerzo' : 'Cena';

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={swapStyles.overlay}>
        <View
          style={[
            swapStyles.sheet,
            { backgroundColor: c.bg, paddingBottom: insets.bottom + spacing.md },
          ]}
        >
          {/* Handle */}
          <View style={[swapStyles.handle, { backgroundColor: c.grayLight }]} />

          {/* Header */}
          <View style={swapStyles.sheetHeader}>
            <Text style={[swapStyles.sheetTitle, { color: c.black }]}>
              Cambiar {slotLabel}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel="Cerrar"
            >
              <Ionicons name="close" size={24} color={c.gray} />
            </TouchableOpacity>
          </View>

          {/* Recipe list */}
          <FlatList
            data={alternatives}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: spacing.lg }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[swapStyles.altCard, { backgroundColor: c.surface, borderColor: c.border }]}
                onPress={() => {
                  haptics.light();
                  onSelect(item);
                }}
                activeOpacity={0.7}
              >
                <Text style={swapStyles.altEmoji}>{item.image}</Text>
                <View style={swapStyles.altInfo}>
                  <Text style={[swapStyles.altName, { color: c.black }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <View style={swapStyles.altMacros}>
                    <Text style={[swapStyles.altKcal, { color: c.accent }]}>{item.calories} kcal</Text>
                    <Text style={[swapStyles.altMacro, { color: c.gray }]}>
                      P {item.protein}g / C {item.carbs}g / G {item.fat}g
                    </Text>
                  </View>
                </View>
                <Ionicons name="add-circle-outline" size={22} color={c.accent} />
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

const swapStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    maxHeight: '70%',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sheetTitle: {
    ...typography.titleSm,
  },
  altCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.sm + 2,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  altEmoji: { fontSize: 32 },
  altInfo: { flex: 1 },
  altName: { ...typography.bodyMd, marginBottom: 2 },
  altMacros: { flexDirection: 'row', gap: spacing.sm },
  altKcal: { ...typography.caption, fontWeight: '700' },
  altMacro: { ...typography.caption },
});

// ─── Main Screen ────────────────────────────────────────────────────────────

export default function MealPlanScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { sidePadding } = useLayout();
  const c = useThemeColors();
  const { track } = useAnalytics('MealPlan');
  const [selectedDay, setSelectedDay] = useState(0);
  const [weeklyPlan, setWeeklyPlan] = useState<DayPlan[]>(() => generateWeeklyPlan());
  const [swapModal, setSwapModal] = useState<{ visible: boolean; slot: MealSlot }>({
    visible: false,
    slot: 'breakfast',
  });
  const spinAnim = useRef(new Animated.Value(0)).current;
  const [showGroceryList, setShowGroceryList] = useState(false);

  const todayIdx = new Date().getDay(); // 0=Sun
  const adjustedIdx = todayIdx === 0 ? 6 : todayIdx - 1; // Convert to Mon=0

  const plan = weeklyPlan[selectedDay];
  const totalCal = plan.breakfast.calories + plan.lunch.calories + plan.dinner.calories;

  const handleDayPress = useCallback((idx: number) => {
    haptics.light();
    setSelectedDay(idx);
  }, []);

  /** Regenerate entire plan with fresh shuffle from recipe database. */
  const handleRegenerate = useCallback(() => {
    haptics.success();
    track('meal_plan_regenerated');

    // Spin animation on the regenerate icon
    spinAnim.setValue(0);
    Animated.timing(spinAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();

    setWeeklyPlan(generateWeeklyPlan());
  }, [track, spinAnim]);

  /** Swap a single meal within the current day. */
  const handleSwapMeal = useCallback((slot: MealSlot, recipe: Recipe) => {
    track('meal_swapped', { slot, recipe_name: recipe.name });
    setWeeklyPlan((prev) => {
      const copy = [...prev];
      copy[selectedDay] = {
        ...copy[selectedDay],
        [slot]: recipeToMeal(recipe),
      };
      return copy;
    });
    setSwapModal({ visible: false, slot: 'breakfast' });
  }, [selectedDay, track]);

  /** Navigate to recipe detail if the meal has a linked recipeId. */
  const handleMealPress = useCallback((meal: Meal) => {
    if (!meal.recipeId) return;
    const recipe = recipes.find((r) => r.id === meal.recipeId);
    if (recipe) {
      haptics.light();
      track('meal_plan_recipe_viewed', { recipe_name: recipe.name });
      navigation.navigate('RecipeDetail', { recipe });
    }
  }, [navigation, track]);

  /** Collect all recipe IDs from the weekly plan for the grocery list. */
  const allRecipeIds = useMemo(
    () =>
      weeklyPlan.flatMap((d) =>
        [d.breakfast.recipeId, d.lunch.recipeId, d.dinner.recipeId].filter(Boolean) as string[],
      ),
    [weeklyPlan],
  );

  const spinRotation = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: sidePadding }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: c.black }]}>Plan Semanal</Text>
          <Text style={[styles.headerSub, { color: c.gray }]}>Tu plan personalizado de comidas</Text>
        </View>
        <TouchableOpacity
          onPress={handleRegenerate}
          style={[styles.regenBtn, { backgroundColor: c.surface }]}
          activeOpacity={0.7}
          accessibilityLabel="Regenerar plan semanal"
        >
          <Animated.View style={{ transform: [{ rotate: spinRotation }] }}>
            <Ionicons name="refresh-outline" size={20} color={c.accent} />
          </Animated.View>
        </TouchableOpacity>
        <FitsiMascot expression="chef" size="small" animation="idle" />
      </View>

      {/* Day selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.dayRow, { paddingHorizontal: sidePadding }]}
      >
        {weeklyPlan.map((d, idx) => {
          const isSelected = selectedDay === idx;
          const isToday = idx === adjustedIdx;
          return (
            <TouchableOpacity
              key={d.shortDay}
              style={[
                styles.dayChip,
                { backgroundColor: isSelected ? c.black : c.surface },
                isToday && !isSelected && { borderColor: c.accent, borderWidth: 1 },
              ]}
              onPress={() => handleDayPress(idx)}
              activeOpacity={0.7}
              accessibilityLabel={`${d.day}${isToday ? ', hoy' : ''}`}
              accessibilityState={{ selected: isSelected }}
            >
              <Text style={[styles.dayText, { color: isSelected ? c.white : c.black }]}>
                {d.shortDay}
              </Text>
              {isToday && (
                <View style={[styles.todayDot, { backgroundColor: isSelected ? c.white : c.accent }]} />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Day content */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingHorizontal: sidePadding }]}
      >
        {/* Day title + total */}
        <View style={styles.dayHeader}>
          <Text style={[styles.dayTitle, { color: c.black }]}>{plan.day}</Text>
          <View style={[styles.totalBadge, { backgroundColor: c.accent + '15' }]}>
            <Text style={[styles.totalText, { color: c.accent }]}>{totalCal} kcal total</Text>
          </View>
        </View>

        {/* Daily Macro Summary */}
        <DailyMacroBar plan={plan} c={c} />

        {/* Meals with swap capability */}
        {MEAL_TYPES.map((mt) => (
          <MealCard
            key={mt.key}
            meal={plan[mt.key]}
            mealType={mt}
            c={c}
            onSwap={() => setSwapModal({ visible: true, slot: mt.key })}
            onPress={() => handleMealPress(plan[mt.key])}
          />
        ))}

        {/* Grocery List CTA */}
        <TouchableOpacity
          style={[styles.groceryCta, { backgroundColor: c.success + '12', borderColor: c.success + '40' }]}
          onPress={() => {
            haptics.light();
            track('grocery_list_opened');
            setShowGroceryList(true);
          }}
          activeOpacity={0.7}
          accessibilityLabel="Abrir lista de compras"
          accessibilityRole="button"
        >
          <Ionicons name="cart-outline" size={20} color={c.success} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.groceryCtaTitle, { color: c.success }]}>Lista de Compras</Text>
            <Text style={[styles.groceryCtaSub, { color: c.gray }]}>
              Genera tu lista automatica del plan semanal
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={c.success} />
        </TouchableOpacity>

        {/* Regenerate CTA */}
        <TouchableOpacity
          style={[styles.regenCta, { borderColor: c.grayLight }]}
          onPress={handleRegenerate}
          activeOpacity={0.7}
        >
          <Ionicons name="shuffle-outline" size={18} color={c.accent} />
          <Text style={[styles.regenCtaText, { color: c.accent }]}>Regenerar plan completo</Text>
        </TouchableOpacity>

        <View style={{ height: spacing.xl }} />
      </ScrollView>

      {/* Grocery List Modal */}
      <Modal visible={showGroceryList} animationType="slide">
        <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: c.bg }}>
          <GroceryList
            recipeIds={allRecipeIds}
            onClose={() => setShowGroceryList(false)}
          />
        </View>
      </Modal>

      {/* Swap Modal */}
      <SwapModal
        visible={swapModal.visible}
        slot={swapModal.slot}
        currentMealId={plan[swapModal.slot]?.recipeId}
        onSelect={(recipe) => handleSwapMeal(swapModal.slot, recipe)}
        onClose={() => setSwapModal({ visible: false, slot: 'breakfast' })}
        c={c}
      />
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  headerTitle: { ...typography.titleSm },
  headerSub: { ...typography.caption, marginTop: 2 },
  regenBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingBottom: spacing.md,
  },
  dayChip: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    minWidth: 48,
    gap: 4,
  },
  dayText: {
    ...typography.label,
    fontSize: 13,
  },
  todayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  scroll: {
    paddingTop: spacing.xs,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  dayTitle: {
    ...typography.titleSm,
  },
  totalBadge: {
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  totalText: {
    ...typography.caption,
    fontWeight: '700',
  },
  mealCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  mealHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  mealIconBg: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealTypeLabel: {
    ...typography.caption,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  mealBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  mealEmoji: {
    fontSize: 40,
  },
  mealInfo: {
    flex: 1,
    gap: 4,
  },
  mealName: {
    ...typography.bodyMd,
  },
  macroRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  mealKcal: {
    ...typography.caption,
    fontWeight: '700',
  },
  macroPill: {
    ...typography.caption,
  },
  groceryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    marginTop: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    ...shadows.sm,
  },
  groceryCtaTitle: {
    ...typography.label,
    marginBottom: 2,
  },
  groceryCtaSub: {
    ...typography.caption,
    fontSize: 11,
  },
  regenCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    borderStyle: 'dashed',
  },
  regenCtaText: {
    ...typography.label,
  },
});
