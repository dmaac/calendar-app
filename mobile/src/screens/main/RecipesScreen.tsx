/**
 * RecipesScreen — Browse recipes with filters by meal type and diet
 * Horizontal filter chips, search bar, recipe cards with macros.
 * Sprint 5: "Recomendadas para ti" section based on remaining daily macros.
 */
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Animated,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { typography, spacing, radius, shadows, useLayout, useThemeColors } from '../../theme';
import { recipes, Recipe, MealType, DietType } from '../../data/recipes';
import { haptics } from '../../hooks/useHaptics';
import { useAnalytics } from '../../hooks/useAnalytics';
import FitsiMascot from '../../components/FitsiMascot';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import * as foodService from '../../services/food.service';
import { useOnboarding } from '../../context/OnboardingContext';
import { DailySummary } from '../../types';

type MealFilter = 'all' | MealType;

const MEAL_FILTERS: { key: MealFilter; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'breakfast', label: 'Desayuno' },
  { key: 'lunch', label: 'Almuerzo' },
  { key: 'dinner', label: 'Cena' },
  { key: 'snack', label: 'Snack' },
];

const DIET_FILTERS: { key: DietType | 'all'; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'classic', label: 'Clasica' },
  { key: 'vegetarian', label: 'Vegetariana' },
  { key: 'vegan', label: 'Vegana' },
  { key: 'pescatarian', label: 'Pescatariana' },
  { key: 'keto', label: 'Keto' },
  { key: 'latin', label: 'Latina' },
];

// ─── Smart Recommendation Logic ────────────────────────────────────────────

interface MacroGap {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface RecommendedRecipe {
  recipe: Recipe;
  badge: string;
  reason: 'protein' | 'carbs' | 'fat' | 'calories' | 'balanced';
}

/** Map onboarding dietType to recipe dietType for preference filtering. */
function mapDietPreference(onboardingDiet: string): DietType | null {
  const map: Record<string, DietType> = {
    Classic: 'classic',
    Vegetarian: 'vegetarian',
    Vegan: 'vegan',
    Pescatarian: 'pescatarian',
  };
  return map[onboardingDiet] ?? null;
}

/** Determine which meal slot is next based on current hour. */
function getNextMealType(): MealType {
  const hour = new Date().getHours();
  if (hour < 10) return 'breakfast';
  if (hour < 14) return 'lunch';
  if (hour < 17) return 'snack';
  return 'dinner';
}

/** Positive-framed badge text for macro gaps. "Fuel your body" framing. */
function getBadgeText(reason: string, nextMeal: MealType): string {
  const mealLabel =
    nextMeal === 'breakfast' ? 'desayuno' :
    nextMeal === 'lunch' ? 'almuerzo' :
    nextMeal === 'dinner' ? 'cena' : 'snack';

  switch (reason) {
    case 'protein': return 'Completa tu proteina';
    case 'carbs': return 'Energia para tu dia';
    case 'fat': return 'Grasas saludables';
    case 'calories': return `Ideal para tu ${mealLabel}`;
    default: return `Perfecto para tu ${mealLabel}`;
  }
}

/**
 * Score and rank recipes based on remaining macro gaps.
 * Higher score = better fit for what the user still needs today.
 * Uses positive framing: "complete your nutrition" not "you're missing X".
 */
function getSmartRecommendations(
  gap: MacroGap,
  dietPreference: DietType | null,
  maxResults = 5,
): RecommendedRecipe[] {
  const nextMeal = getNextMealType();

  // Filter to relevant meal type and optionally diet preference
  let candidates = recipes.filter((r) => r.mealType === nextMeal);
  if (dietPreference) {
    const preferred = candidates.filter((r) => r.dietType === dietPreference);
    if (preferred.length >= 3) candidates = preferred;
  }

  if (candidates.length === 0) return [];

  // Determine dominant macro need (which macro has the largest remaining gap)
  const proteinRatio = gap.protein > 0 ? gap.protein / 50 : 0; // normalize to ~50g typical daily need
  const carbsRatio = gap.carbs > 0 ? gap.carbs / 200 : 0;      // normalize to ~200g
  const fatRatio = gap.fat > 0 ? gap.fat / 60 : 0;              // normalize to ~60g
  const calRatio = gap.calories > 0 ? gap.calories / 2000 : 0;

  const dominantNeed: RecommendedRecipe['reason'] =
    proteinRatio >= carbsRatio && proteinRatio >= fatRatio ? 'protein' :
    carbsRatio >= proteinRatio && carbsRatio >= fatRatio ? 'carbs' :
    fatRatio > 0 ? 'fat' : 'calories';

  // Score each recipe: how well it fills the gap without overshooting
  const scored = candidates.map((recipe) => {
    let score = 0;

    // Protein score (weighted most heavily per sports nutrition guidelines)
    if (gap.protein > 0) {
      const fill = Math.min(recipe.protein / gap.protein, 1.0);
      score += fill * 40; // 40% weight
    }

    // Calorie score: prefer recipes that don't overshoot remaining calories
    if (gap.calories > 0) {
      const calFit = recipe.calories <= gap.calories ? 1.0 : Math.max(0, 1 - (recipe.calories - gap.calories) / gap.calories);
      score += calFit * 30; // 30% weight
    }

    // Carbs score
    if (gap.carbs > 0) {
      const fill = Math.min(recipe.carbs / gap.carbs, 1.0);
      score += fill * 15;
    }

    // Fat score
    if (gap.fat > 0) {
      const fill = Math.min(recipe.fat / gap.fat, 1.0);
      score += fill * 15;
    }

    return { recipe, score, dominantNeed };
  });

  // Sort by score descending, take top results
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, maxResults).map(({ recipe }) => ({
    recipe,
    badge: getBadgeText(dominantNeed, nextMeal),
    reason: dominantNeed,
  }));
}

// ─── Recipe Card ──────────────────────────────────────────────────────────────

// Memoized to prevent re-render when sibling cards or filter state changes
const RecipeCard = React.memo(function RecipeCard({
  recipe,
  onPress,
  c,
  badge,
}: {
  recipe: Recipe;
  onPress: () => void;
  c: ReturnType<typeof useThemeColors>;
  badge?: string;
}) {
  const pressAnim = useRef(new Animated.Value(0)).current;

  const onPressIn = () => {
    Animated.spring(pressAnim, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  };
  const onPressOut = () => {
    Animated.spring(pressAnim, { toValue: 0, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  };

  const cardScale = pressAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.015] });

  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View
        style={[
          cardStyles.card,
          { backgroundColor: c.surface, borderColor: c.border, transform: [{ scale: cardScale }] },
        ]}
        accessibilityLabel={`${recipe.name}, ${recipe.calories} calorias, ${recipe.prepTime} minutos`}
        accessibilityRole="button"
      >
        <View style={[cardStyles.emojiContainer, { backgroundColor: c.grayLight }]}>
          <Text style={cardStyles.emoji}>{recipe.image}</Text>
        </View>
        <View style={cardStyles.info}>
          {badge && (
            <View style={[cardStyles.badge, { backgroundColor: c.accent + '15' }]}>
              <Ionicons name="sparkles" size={10} color={c.accent} />
              <Text style={[cardStyles.badgeText, { color: c.accent }]}>{badge}</Text>
            </View>
          )}
          <Text style={[cardStyles.name, { color: c.black }]} numberOfLines={2}>{recipe.name}</Text>
          <View style={cardStyles.meta}>
            <View style={cardStyles.metaItem}>
              <Ionicons name="flame-outline" size={13} color={c.accent} />
              <Text style={[cardStyles.metaText, { color: c.gray }]}>{recipe.calories} kcal</Text>
            </View>
            <View style={cardStyles.metaItem}>
              <Ionicons name="time-outline" size={13} color={c.gray} />
              <Text style={[cardStyles.metaText, { color: c.gray }]}>{recipe.prepTime} min</Text>
            </View>
          </View>
          <View style={cardStyles.macros}>
            <Text style={[cardStyles.macro, { color: c.protein }]}>
              P {recipe.protein}g
            </Text>
            <Text style={[cardStyles.macro, { color: c.carbs }]}>
              C {recipe.carbs}g
            </Text>
            <Text style={[cardStyles.macro, { color: c.fats }]}>
              G {recipe.fat}g
            </Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
});

const cardStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  emojiContainer: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  emoji: { fontSize: 28 },
  info: { flex: 1, justifyContent: 'center' },
  name: { ...typography.bodyMd, marginBottom: 4 },
  meta: { flexDirection: 'row', gap: spacing.md, marginBottom: 4 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { ...typography.caption },
  macros: { flexDirection: 'row', gap: spacing.sm },
  macro: { ...typography.caption, fontWeight: '600' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    marginBottom: 4,
  },
  badgeText: {
    ...typography.caption,
    fontWeight: '700',
    fontSize: 10,
  },
});

// Stable keyExtractor avoids anonymous function re-creation per render
const recipeKeyExtractor = (item: Recipe) => item.id;

// ─── Recommended Section (horizontal scroll) ───────────────────────────────

function RecommendedSection({
  recommendations,
  onPress,
  c,
}: {
  recommendations: RecommendedRecipe[];
  onPress: (recipe: Recipe) => void;
  c: ReturnType<typeof useThemeColors>;
}) {
  if (recommendations.length === 0) return null;

  return (
    <View style={recStyles.container}>
      <View style={recStyles.header}>
        <View style={recStyles.headerLeft}>
          <Ionicons name="sparkles" size={16} color={c.accent} />
          <Text style={[recStyles.title, { color: c.black }]}>Recomendadas para ti</Text>
        </View>
        <Text style={[recStyles.subtitle, { color: c.gray }]}>Basado en tu dia</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={recStyles.scroll}
      >
        {recommendations.map((rec) => (
          <TouchableOpacity
            key={rec.recipe.id}
            style={[recStyles.card, { backgroundColor: c.surface, borderColor: c.border }]}
            onPress={() => {
              haptics.light();
              onPress(rec.recipe);
            }}
            activeOpacity={0.7}
            accessibilityLabel={`Recomendada: ${rec.recipe.name}`}
          >
            <View style={[recStyles.badgeRow, { backgroundColor: c.accent + '15' }]}>
              <Ionicons name="sparkles" size={10} color={c.accent} />
              <Text style={[recStyles.badgeText, { color: c.accent }]}>{rec.badge}</Text>
            </View>
            <Text style={recStyles.emoji}>{rec.recipe.image}</Text>
            <Text style={[recStyles.name, { color: c.black }]} numberOfLines={2}>
              {rec.recipe.name}
            </Text>
            <View style={recStyles.macroRow}>
              <Text style={[recStyles.kcal, { color: c.accent }]}>{rec.recipe.calories} kcal</Text>
            </View>
            <View style={recStyles.macroRow}>
              <Text style={[recStyles.macro, { color: c.protein }]}>P {rec.recipe.protein}g</Text>
              <Text style={[recStyles.macro, { color: c.carbs }]}>C {rec.recipe.carbs}g</Text>
              <Text style={[recStyles.macro, { color: c.fats }]}>G {rec.recipe.fat}g</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const recStyles = StyleSheet.create({
  container: { marginBottom: spacing.md },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  title: { ...typography.label, fontSize: 14 },
  subtitle: { ...typography.caption },
  scroll: { gap: spacing.sm },
  card: {
    width: 160,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.sm + 4,
    ...shadows.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    marginBottom: spacing.xs,
  },
  badgeText: { ...typography.caption, fontWeight: '700', fontSize: 9 },
  emoji: { fontSize: 36, alignSelf: 'center', marginBottom: spacing.xs },
  name: { ...typography.caption, fontWeight: '600', textAlign: 'center', marginBottom: 4 },
  macroRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xs },
  kcal: { ...typography.caption, fontWeight: '700', marginBottom: 2 },
  macro: { ...typography.caption, fontSize: 10 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function RecipesScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { sidePadding } = useLayout();
  const c = useThemeColors();
  const { track } = useAnalytics('Recipes');
  const [mealFilter, setMealFilter] = useState<MealFilter>('all');
  const [dietFilter, setDietFilter] = useState<DietType | 'all'>('all');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 200);

  // Smart recommendations state
  const [dailySummary, setDailySummary] = useState<DailySummary | null>(null);
  const [loadingRecs, setLoadingRecs] = useState(true);

  // Get user diet preference from onboarding
  let dietPreference: DietType | null = null;
  try {
    const { data: onboardingData } = useOnboarding();
    dietPreference = mapDietPreference(onboardingData.dietType);
  } catch {
    // OnboardingProvider may not be available — skip preference-based filtering
  }

  // Fetch daily summary for macro gap calculation
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const summary = await foodService.getDailySummary();
        if (!cancelled) setDailySummary(summary);
      } catch {
        // Silently fail — recommendations just won't show
      } finally {
        if (!cancelled) setLoadingRecs(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Compute macro gap and smart recommendations
  const recommendations = useMemo(() => {
    if (!dailySummary) return [];

    const gap: MacroGap = {
      calories: Math.max(0, dailySummary.target_calories - dailySummary.total_calories),
      protein: Math.max(0, dailySummary.target_protein_g - dailySummary.total_protein_g),
      carbs: Math.max(0, dailySummary.target_carbs_g - dailySummary.total_carbs_g),
      fat: Math.max(0, dailySummary.target_fats_g - dailySummary.total_fats_g),
    };

    // Only show recommendations if there's meaningful remaining intake
    if (gap.calories < 100) return [];

    return getSmartRecommendations(gap, dietPreference);
  }, [dailySummary, dietPreference]);

  const filtered = useMemo(() => {
    let result = recipes;
    if (mealFilter !== 'all') {
      result = result.filter((r) => r.mealType === mealFilter);
    }
    if (dietFilter !== 'all') {
      result = result.filter((r) => r.dietType === dietFilter);
    }
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase().trim();
      result = result.filter((r) => r.name.toLowerCase().includes(q));
    }
    return result;
  }, [mealFilter, dietFilter, debouncedSearch]);

  // Stable callback to avoid re-creating renderItem closures
  const handleRecipePress = useCallback((recipe: Recipe) => {
    haptics.light();
    track('recipe_viewed', { recipe_name: recipe.name, meal_type: recipe.mealType });
    navigation.navigate('RecipeDetail', { recipe });
  }, [navigation, track]);

  // Memoized renderItem avoids anonymous closure per render cycle
  const renderRecipeItem = useCallback(({ item }: { item: Recipe }) => (
    <RecipeCard recipe={item} onPress={() => handleRecipePress(item)} c={c} />
  ), [handleRecipePress, c]);

  const ListHeader = useMemo(() => (
    <>
      {/* Smart Recommendations */}
      {loadingRecs ? (
        <View style={styles.recsLoading}>
          <ActivityIndicator size="small" color={c.accent} />
        </View>
      ) : (
        <RecommendedSection
          recommendations={recommendations}
          onPress={handleRecipePress}
          c={c}
        />
      )}
    </>
  ), [loadingRecs, recommendations, handleRecipePress, c]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: sidePadding }]}>
        <Text style={[styles.headerTitle, { color: c.black }]}>Recetas</Text>
        <Text style={[styles.headerSub, { color: c.gray }]}>{filtered.length} recetas disponibles</Text>
      </View>

      {/* Search */}
      <View style={[styles.searchContainer, { paddingHorizontal: sidePadding }]}>
        <View style={[styles.searchBar, { backgroundColor: c.surface }]}>
          <Ionicons name="search-outline" size={18} color={c.gray} />
          <TextInput
            style={[styles.searchInput, { color: c.black }]}
            placeholder="Buscar recetas..."
            placeholderTextColor={c.disabled}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            accessibilityLabel="Buscar recetas"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} accessibilityLabel="Limpiar busqueda">
              <Ionicons name="close-circle" size={18} color={c.gray} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Meal type filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.filterRow, { paddingHorizontal: sidePadding }]}
      >
        {MEAL_FILTERS.map((f) => {
          const active = mealFilter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[
                styles.filterChip,
                { backgroundColor: active ? c.primary : c.surface },
              ]}
              onPress={() => { haptics.light(); setMealFilter(f.key); }}
              accessibilityLabel={`Filtrar por ${f.label}`}
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.filterText, { color: active ? c.white : c.gray }]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Diet type filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.filterRow, { paddingHorizontal: sidePadding }]}
      >
        {DIET_FILTERS.map((f) => {
          const active = dietFilter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[
                styles.filterChipSmall,
                {
                  backgroundColor: active ? c.accent + '15' : c.bg,
                  borderColor: active ? c.accent : c.grayLight,
                },
              ]}
              onPress={() => { haptics.light(); setDietFilter(f.key); }}
              accessibilityLabel={`Filtrar dieta ${f.label}`}
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.filterSmallText, { color: active ? c.accent : c.gray, fontWeight: active ? '700' : '400' }]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Recipe list with recommendations header */}
      <FlatList
        data={filtered}
        keyExtractor={recipeKeyExtractor}
        renderItem={renderRecipeItem}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={{ paddingHorizontal: sidePadding, paddingBottom: spacing.xl }}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        scrollEventThrottle={16}
        bounces={true}
        overScrollMode="never"
        ListEmptyComponent={
          <View style={styles.empty}>
            <FitsiMascot expression="thinking" size="medium" animation="thinking" />
            <Text style={[styles.emptyText, { color: c.black }]}>No encontre recetas con ese nombre</Text>
            <Text style={[styles.emptyHint, { color: c.gray }]}>Intenta cambiar los filtros o buscar otro plato</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    paddingVertical: spacing.md,
  },
  headerTitle: { ...typography.titleSm },
  headerSub: { ...typography.caption, marginTop: 2 },
  searchContainer: { marginBottom: spacing.sm },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 44,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    padding: 0,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  filterText: {
    ...typography.label,
  },
  filterChipSmall: {
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  filterSmallText: {
    ...typography.caption,
  },
  recsLoading: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyText: { ...typography.bodyMd },
  emptyHint: { ...typography.caption },
});
