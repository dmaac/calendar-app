/**
 * FoodSearchScreen — Search and select foods to log.
 * Modern design with search bar, frequent foods, and results list.
 */
import React, { useState, useEffect, useCallback } from 'react';
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface FoodItem {
  id: number;
  name: string;
  brand: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  serving: string;
  emoji: string;
}

// ─── Hardcoded frequent foods (fallback when API is unavailable) ────────────

const FREQUENT_FOODS: FoodItem[] = [
  { id: 1, name: 'Arroz blanco cocido', brand: 'Generico', calories: 130, protein_g: 2.7, carbs_g: 28, fat_g: 0.3, serving: '100g', emoji: '\u{1F35A}' },
  { id: 2, name: 'Pechuga de pollo', brand: 'Generico', calories: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6, serving: '100g', emoji: '\u{1F357}' },
  { id: 3, name: 'Huevo entero', brand: 'Generico', calories: 155, protein_g: 13, carbs_g: 1.1, fat_g: 11, serving: '100g', emoji: '\u{1F95A}' },
  { id: 4, name: 'Pan integral', brand: 'Generico', calories: 247, protein_g: 13, carbs_g: 41, fat_g: 3.4, serving: '100g', emoji: '\u{1F35E}' },
  { id: 5, name: 'Platano', brand: 'Generico', calories: 89, protein_g: 1.1, carbs_g: 23, fat_g: 0.3, serving: '1 unidad', emoji: '\u{1F34C}' },
  { id: 6, name: 'Leche descremada', brand: 'Generico', calories: 34, protein_g: 3.4, carbs_g: 5, fat_g: 0.1, serving: '100ml', emoji: '\u{1F95B}' },
  { id: 7, name: 'Avena', brand: 'Generico', calories: 389, protein_g: 16.9, carbs_g: 66, fat_g: 6.9, serving: '100g', emoji: '\u{1F35C}' },
  { id: 8, name: 'Palta / Aguacate', brand: 'Generico', calories: 160, protein_g: 2, carbs_g: 8.5, fat_g: 14.7, serving: '100g', emoji: '\u{1F951}' },
  { id: 9, name: 'Yogurt griego', brand: 'Generico', calories: 59, protein_g: 10, carbs_g: 3.6, fat_g: 0.7, serving: '100g', emoji: '\u{1F95B}' },
  { id: 10, name: 'Salmon', brand: 'Generico', calories: 208, protein_g: 20, carbs_g: 0, fat_g: 13, serving: '100g', emoji: '\u{1F41F}' },
  { id: 11, name: 'Pasta cocida', brand: 'Generico', calories: 131, protein_g: 5, carbs_g: 25, fat_g: 1.1, serving: '100g', emoji: '\u{1F35D}' },
  { id: 12, name: 'Manzana', brand: 'Generico', calories: 52, protein_g: 0.3, carbs_g: 14, fat_g: 0.2, serving: '1 unidad', emoji: '\u{1F34E}' },
];

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
  const [results, setResults] = useState<FoodItem[]>(FREQUENT_FOODS);
  const [loading, setLoading] = useState(false);
  const mealType = route?.params?.mealType ?? 'snack';

  // Debounced search filter
  useEffect(() => {
    if (!search.trim()) {
      setResults(FREQUENT_FOODS);
      return;
    }
    setLoading(true);
    const timeout = setTimeout(() => {
      const q = search.toLowerCase().trim();
      const filtered = FREQUENT_FOODS.filter(
        (f) => f.name.toLowerCase().includes(q) || f.brand.toLowerCase().includes(q),
      );
      setResults(filtered);
      setLoading(false);
    }, 200);
    return () => clearTimeout(timeout);
  }, [search]);

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
        {search.trim() ? `Resultados (${results.length})` : 'Alimentos frecuentes'}
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
