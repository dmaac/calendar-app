/**
 * RecipesScreen — Browse recipes with filters by meal type and diet
 * Horizontal filter chips, search bar, recipe cards with macros.
 */
import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { typography, spacing, radius, shadows, useLayout, useThemeColors } from '../../theme';
import { recipes, Recipe, MealType, DietType } from '../../data/recipes';
import { haptics } from '../../hooks/useHaptics';
import { useAnalytics } from '../../hooks/useAnalytics';
import FitsiMascot from '../../components/FitsiMascot';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';

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
];

// Memoized to prevent re-render when sibling cards or filter state changes
const RecipeCard = React.memo(function RecipeCard({ recipe, onPress, c }: { recipe: Recipe; onPress: () => void; c: ReturnType<typeof useThemeColors> }) {
  return (
    <TouchableOpacity
      style={[cardStyles.card, { backgroundColor: c.surface, borderColor: c.border }]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityLabel={`${recipe.name}, ${recipe.calories} calorias, ${recipe.prepTime} minutos`}
      accessibilityRole="button"
    >
      <View style={[cardStyles.emojiContainer, { backgroundColor: c.grayLight }]}>
        <Text style={cardStyles.emoji}>{recipe.image}</Text>
      </View>
      <View style={cardStyles.info}>
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
    </TouchableOpacity>
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
});

// Stable keyExtractor avoids anonymous function re-creation per render
const recipeKeyExtractor = (item: Recipe) => item.id;

export default function RecipesScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { sidePadding } = useLayout();
  const c = useThemeColors();
  const { track } = useAnalytics('Recipes');
  const [mealFilter, setMealFilter] = useState<MealFilter>('all');
  const [dietFilter, setDietFilter] = useState<DietType | 'all'>('all');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 200);

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

      {/* Recipe list */}
      <FlatList
        data={filtered}
        keyExtractor={recipeKeyExtractor}
        renderItem={renderRecipeItem}
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
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyText: { ...typography.bodyMd },
  emptyHint: { ...typography.caption },
});
