/**
 * FoodSearchScreen — Search and select foods to log.
 * Modern design with search bar, frequent foods, and results list.
 */
import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, typography, spacing, radius, shadows, useLayout } from '../../theme';
import { haptics } from '../../hooks/useHaptics';
import FitsiMascot from '../../components/FitsiMascot';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { foodDatabase } from '../../data/foodDatabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FoodItem {
  id: string;
  name: string;
  brand: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  serving: string;
  emoji: string;
}

// ─── Map food database to display format ────────────────────────────────────

const ALL_FOODS: FoodItem[] = foodDatabase.map((f) => ({
  id: f.id,
  name: f.name,
  brand: `${f.servingSize}${f.servingUnit.startsWith('1') ? '' : ''}${f.servingUnit.includes('g') || f.servingUnit.includes('ml') ? '' : ' '}(${f.calories_per_100g} kcal/100g)`,
  calories: Math.round((f.calories_per_100g * f.servingSize) / 100),
  protein_g: Math.round((f.protein * f.servingSize) / 100 * 10) / 10,
  carbs_g: Math.round((f.carbs * f.servingSize) / 100 * 10) / 10,
  fat_g: Math.round((f.fat * f.servingSize) / 100 * 10) / 10,
  serving: `${f.servingSize}g - ${f.servingUnit}`,
  emoji: f.emoji,
}));

// ─── Food Card ──────────────────────────────────────────────────────────────

function FoodCard({
  food,
  onPress,
  c,
}: {
  food: FoodItem;
  onPress: () => void;
  c: ReturnType<typeof useThemeColors>;
}) {
  return (
    <TouchableOpacity
      style={[styles.foodCard, { backgroundColor: c.surface, borderColor: c.grayLight }]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityLabel={`${food.name}, ${food.calories} calorias por ${food.serving}`}
      accessibilityRole="button"
    >
      <Text style={styles.foodEmoji}>{food.emoji}</Text>
      <View style={styles.foodInfo}>
        <Text style={[styles.foodName, { color: c.black }]} numberOfLines={1}>{food.name}</Text>
        <Text style={[styles.foodBrand, { color: c.gray }]}>{food.brand} - {food.serving}</Text>
        <View style={styles.macroRow}>
          <Text style={[styles.macroPill, { color: c.protein }]}>P {food.protein_g}g</Text>
          <Text style={[styles.macroPill, { color: c.carbs }]}>C {food.carbs_g}g</Text>
          <Text style={[styles.macroPill, { color: c.fats }]}>G {food.fat_g}g</Text>
        </View>
      </View>
      <View style={styles.foodCalCol}>
        <Text style={[styles.foodCalNum, { color: c.black }]}>{food.calories}</Text>
        <Text style={[styles.foodCalUnit, { color: c.gray }]}>kcal</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main Screen ────────────────────────────────────────────────────────────

export default function FoodSearchScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { sidePadding } = useLayout();
  const c = useThemeColors();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 200);
  const mealType = route?.params?.mealType ?? 'snack';

  const results = useMemo(() => {
    if (!debouncedSearch.trim()) return ALL_FOODS;
    const q = debouncedSearch.toLowerCase().trim();
    return ALL_FOODS.filter(
      (f) => f.name.toLowerCase().includes(q) || f.brand.toLowerCase().includes(q),
    );
  }, [debouncedSearch]);

  const loading = search !== debouncedSearch && search.trim().length > 0;

  const handleSelect = useCallback((food: FoodItem) => {
    haptics.light();
    navigation.navigate('AddFood', {
      mealType,
      prefill: {
        food_name: food.name,
        calories: food.calories,
        protein_g: food.protein_g,
        carbs_g: food.carbs_g,
        fats_g: food.fat_g,
      },
    });
  }, [mealType, navigation]);

  const renderItem = useCallback(({ item }: { item: FoodItem }) => (
    <FoodCard food={item} onPress={() => handleSelect(item)} c={c} />
  ), [handleSelect, c]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: sidePadding }]}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: c.surface }]}
          onPress={() => { haptics.light(); navigation.goBack(); }}
          accessibilityLabel="Volver"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={20} color={c.black} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.black }]}>Buscar Alimento</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Search bar */}
      <View style={[styles.searchContainer, { paddingHorizontal: sidePadding }]}>
        <View style={[styles.searchBar, { backgroundColor: c.surface }]}>
          <Ionicons name="search-outline" size={18} color={c.gray} />
          <TextInput
            style={[styles.searchInput, { color: c.black }]}
            placeholder="Buscar alimentos..."
            placeholderTextColor={c.disabled}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            autoFocus
            accessibilityLabel="Buscar alimentos"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} accessibilityLabel="Limpiar busqueda">
              <Ionicons name="close-circle" size={18} color={c.gray} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Section label */}
      <Text style={[styles.sectionLabel, { color: c.gray, paddingHorizontal: sidePadding }]}>
        {search.trim() ? `Resultados (${results.length})` : `Todos los alimentos (${ALL_FOODS.length})`}
      </Text>

      {/* Results */}
      {loading ? (
        <ActivityIndicator size="small" color={c.black} style={{ marginTop: spacing.lg }} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: sidePadding, paddingBottom: spacing.xl }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <FitsiMascot expression="thinking" size="medium" animation="thinking" />
              <Text style={[styles.emptyText, { color: c.black }]}>No encontre ese alimento</Text>
              <Text style={[styles.emptyHint, { color: c.gray }]}>Intenta con otro nombre o anade manualmente</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { ...typography.titleSm },
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
  sectionLabel: {
    ...typography.caption,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  foodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
    ...shadows.sm,
  },
  foodEmoji: {
    fontSize: 32,
  },
  foodInfo: {
    flex: 1,
    gap: 2,
  },
  foodName: {
    ...typography.bodyMd,
  },
  foodBrand: {
    ...typography.caption,
  },
  macroRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: 2,
  },
  macroPill: {
    ...typography.caption,
    fontWeight: '600',
  },
  foodCalCol: {
    alignItems: 'center',
    minWidth: 50,
  },
  foodCalNum: {
    fontSize: 20,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  foodCalUnit: {
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
