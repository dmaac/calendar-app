/**
 * MealBrowserScreen — Browse all 500+ meals with filters, search, and detail modal.
 *
 * Filter tabs: Todos, Desayuno, Almuerzo, Cena, Snack
 * Category chips: Rapido, Alto en proteina, Vegetariano, Chileno, Low carb
 * Search by name. Tap opens detail modal with ingredients + "Registrar" button.
 */
import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, typography, spacing, radius, shadows, useLayout } from '../../theme';
import { haptics } from '../../hooks/useHaptics';
import { apiClient } from '../../services/apiClient';
import { useFocusEffect } from '@react-navigation/native';

// ─── Types ──────────────────────────────────────────────────────────────────

interface BrowseMeal {
  id: number;
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
  prep_time_min: number;
  difficulty: 1 | 2 | 3;
  category: string;
  meal_type: string;
  ingredients: string[];
  image_url?: string | null;
}

// ─── Constants ──────────────────────────────────────────────────────────────

type MealFilter = 'all' | 'breakfast' | 'lunch' | 'dinner' | 'snack';

const MEAL_FILTERS: { key: MealFilter; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'breakfast', label: 'Desayuno' },
  { key: 'lunch', label: 'Almuerzo' },
  { key: 'dinner', label: 'Cena' },
  { key: 'snack', label: 'Snack' },
];

const CATEGORY_CHIPS: { key: string; label: string }[] = [
  { key: 'rapido', label: 'Rapido' },
  { key: 'alto_en_proteina', label: 'Alto en proteina' },
  { key: 'vegetariano', label: 'Vegetariano' },
  { key: 'chileno', label: 'Chileno' },
  { key: 'low_carb', label: 'Low carb' },
];

// ─── Difficulty dots (shared) ───────────────────────────────────────────────

function DifficultyDots({ level, color }: { level: number; color: string }) {
  const c = useThemeColors();
  return (
    <View style={dotStyles.row}>
      {[1, 2, 3].map((i) => (
        <View
          key={i}
          style={[dotStyles.dot, { backgroundColor: i <= level ? color : c.grayLight }]}
        />
      ))}
    </View>
  );
}

const dotStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 3, alignItems: 'center' },
  dot: { width: 5, height: 5, borderRadius: 3 },
});

// ─── Meal row item ──────────────────────────────────────────────────────────

const MealRow = React.memo(function MealRow({
  meal,
  onPress,
}: {
  meal: BrowseMeal;
  onPress: (meal: BrowseMeal) => void;
}) {
  const c = useThemeColors();
  const handlePress = useCallback(() => {
    haptics.light();
    onPress(meal);
  }, [meal, onPress]);

  return (
    <TouchableOpacity
      style={[rowStyles.container, { backgroundColor: c.surface, borderColor: c.grayLight }]}
      onPress={handlePress}
      activeOpacity={0.8}
      accessibilityLabel={`${meal.name}, ${Math.round(meal.calories)} calorias, ${Math.round(meal.protein_g)} gramos proteina, ${meal.prep_time_min} minutos`}
      accessibilityRole="button"
    >
      <View style={rowStyles.content}>
        <Text style={[rowStyles.name, { color: c.black }]} numberOfLines={1}>
          {meal.name}
        </Text>
        <View style={rowStyles.stats}>
          <Text style={[rowStyles.stat, { color: c.gray }]}>
            {Math.round(meal.calories)} kcal
          </Text>
          <Text style={[rowStyles.stat, { color: c.protein }]}>
            {Math.round(meal.protein_g)}g prot
          </Text>
          <Text style={[rowStyles.stat, { color: c.gray }]}>
            {meal.prep_time_min} min
          </Text>
          <DifficultyDots level={meal.difficulty} color={c.accent} />
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={c.grayLight} />
    </TouchableOpacity>
  );
});

const rowStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  content: {
    flex: 1,
    gap: 4,
  },
  name: {
    ...typography.bodyMd,
    fontWeight: '600',
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  stat: {
    ...typography.caption,
    fontSize: 11,
  },
});

// ─── Detail modal ───────────────────────────────────────────────────────────

function MealDetailModal({
  meal,
  visible,
  onClose,
  onRegister,
}: {
  meal: BrowseMeal | null;
  visible: boolean;
  onClose: () => void;
  onRegister: (meal: BrowseMeal) => void;
}) {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();

  if (!meal) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[modalStyles.container, { backgroundColor: c.bg, paddingBottom: insets.bottom + spacing.md }]}>
        {/* Header */}
        <View style={modalStyles.header}>
          <TouchableOpacity
            onPress={onClose}
            accessibilityLabel="Cerrar detalle"
            accessibilityRole="button"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={24} color={c.black} />
          </TouchableOpacity>
          <Text style={[modalStyles.headerTitle, { color: c.black }]} numberOfLines={1}>
            {meal.name}
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={modalStyles.scroll}
        >
          {/* Macro summary */}
          <View style={[modalStyles.macroCard, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
            <View style={modalStyles.macroRow}>
              <View style={modalStyles.macroItem}>
                <Text style={[modalStyles.macroValue, { color: c.black }]}>{Math.round(meal.calories)}</Text>
                <Text style={[modalStyles.macroLabel, { color: c.gray }]}>kcal</Text>
              </View>
              <View style={modalStyles.macroItem}>
                <Text style={[modalStyles.macroValue, { color: c.protein }]}>{Math.round(meal.protein_g)}g</Text>
                <Text style={[modalStyles.macroLabel, { color: c.gray }]}>Proteina</Text>
              </View>
              <View style={modalStyles.macroItem}>
                <Text style={[modalStyles.macroValue, { color: c.carbs }]}>{Math.round(meal.carbs_g)}g</Text>
                <Text style={[modalStyles.macroLabel, { color: c.gray }]}>Carbos</Text>
              </View>
              <View style={modalStyles.macroItem}>
                <Text style={[modalStyles.macroValue, { color: c.fats }]}>{Math.round(meal.fats_g)}g</Text>
                <Text style={[modalStyles.macroLabel, { color: c.gray }]}>Grasas</Text>
              </View>
            </View>
          </View>

          {/* Info row */}
          <View style={modalStyles.infoRow}>
            <View style={modalStyles.infoItem}>
              <Ionicons name="time-outline" size={16} color={c.gray} />
              <Text style={[modalStyles.infoText, { color: c.gray }]}>{meal.prep_time_min} min</Text>
            </View>
            <View style={modalStyles.infoItem}>
              <Ionicons name="speedometer-outline" size={16} color={c.gray} />
              <Text style={[modalStyles.infoText, { color: c.gray }]}>
                Dificultad {meal.difficulty}/3
              </Text>
            </View>
          </View>

          {/* Ingredients */}
          <Text style={[modalStyles.sectionTitle, { color: c.black }]}>Ingredientes</Text>
          <View style={[modalStyles.ingredientsList, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
            {(meal.ingredients ?? []).map((ingredient, idx) => (
              <View
                key={idx}
                style={[
                  modalStyles.ingredientRow,
                  idx < (meal.ingredients?.length ?? 0) - 1 && { borderBottomWidth: 1, borderBottomColor: c.grayLight },
                ]}
              >
                <View style={[modalStyles.bulletDot, { backgroundColor: c.accent }]} />
                <Text style={[modalStyles.ingredientText, { color: c.black }]}>{ingredient}</Text>
              </View>
            ))}
            {(!meal.ingredients || meal.ingredients.length === 0) && (
              <Text style={[modalStyles.ingredientText, { color: c.gray, padding: spacing.md }]}>
                Sin ingredientes disponibles
              </Text>
            )}
          </View>
        </ScrollView>

        {/* Register CTA */}
        <TouchableOpacity
          style={[modalStyles.registerBtn, { backgroundColor: c.black }]}
          onPress={() => {
            haptics.medium();
            onRegister(meal);
            onClose();
          }}
          activeOpacity={0.85}
          accessibilityLabel={`Registrar ${meal.name}`}
          accessibilityRole="button"
        >
          <Ionicons name="add-circle" size={20} color="#FFFFFF" />
          <Text style={modalStyles.registerBtnText}>Registrar</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  headerTitle: {
    ...typography.titleSm,
    flex: 1,
    textAlign: 'center',
    marginHorizontal: spacing.sm,
  },
  scroll: {
    paddingBottom: spacing.lg,
  },
  macroCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  macroRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  macroItem: {
    alignItems: 'center',
    gap: 2,
  },
  macroValue: {
    ...typography.titleSm,
    fontSize: 20,
  },
  macroLabel: {
    ...typography.caption,
    fontSize: 11,
  },
  infoRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginBottom: spacing.md,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  infoText: {
    ...typography.caption,
  },
  sectionTitle: {
    ...typography.label,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  ingredientsList: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  ingredientText: {
    ...typography.body,
    fontSize: 14,
    flex: 1,
  },
  registerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 56,
    borderRadius: radius.full,
  },
  registerBtnText: {
    color: '#FFFFFF',
    ...typography.button,
  },
});

// ─── Main screen ────────────────────────────────────────────────────────────

export default function MealBrowserScreen({ navigation }: any) {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const { sidePadding } = useLayout();

  const [meals, setMeals] = useState<BrowseMeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [mealFilter, setMealFilter] = useState<MealFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [selectedMeal, setSelectedMeal] = useState<BrowseMeal | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const searchRef = useRef<TextInput>(null);

  // Fetch all meals on mount
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      apiClient
        .get<{ meals: BrowseMeal[] }>('/api/recommendations/browse')
        .then((res) => {
          if (active) setMeals(res.data.meals ?? []);
        })
        .catch(() => {})
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => { active = false; };
    }, [])
  );

  // Filter meals
  const filtered = useMemo(() => {
    let result = meals;
    if (mealFilter !== 'all') {
      result = result.filter((m) => m.meal_type === mealFilter);
    }
    if (categoryFilter) {
      result = result.filter((m) => m.category === categoryFilter);
    }
    if (search.trim().length > 0) {
      const q = search.trim().toLowerCase();
      result = result.filter((m) => m.name.toLowerCase().includes(q));
    }
    return result;
  }, [meals, mealFilter, categoryFilter, search]);

  const onMealPress = useCallback((meal: BrowseMeal) => {
    setSelectedMeal(meal);
    setModalVisible(true);
  }, []);

  const onCloseModal = useCallback(() => {
    setModalVisible(false);
  }, []);

  const onRegister = useCallback((meal: BrowseMeal) => {
    haptics.medium();
    // Navigate to AddFood or Scan with pre-filled data
    navigation.navigate('Inicio', {
      screen: 'Scan',
      params: { prefill: { food_name: meal.name, calories: meal.calories, protein_g: meal.protein_g, carbs_g: meal.carbs_g, fats_g: meal.fats_g } },
    });
  }, [navigation]);

  const onBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const renderItem = useCallback(
    ({ item }: { item: BrowseMeal }) => (
      <MealRow meal={item} onPress={onMealPress} />
    ),
    [onMealPress],
  );

  const keyExtractor = useCallback((item: BrowseMeal) => String(item.id), []);

  const onMealFilterPress = useCallback((key: MealFilter) => {
    haptics.light();
    setMealFilter(key);
  }, []);

  const onCategoryPress = useCallback((key: string) => {
    haptics.light();
    setCategoryFilter((prev) => (prev === key ? null : key));
  }, []);

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: sidePadding }]}>
        <TouchableOpacity
          onPress={onBack}
          style={[styles.backBtn, { backgroundColor: c.surface }]}
          accessibilityLabel="Volver"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={20} color={c.black} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.black }]}>Comidas</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Search */}
      <View style={[styles.searchContainer, { paddingHorizontal: sidePadding }]}>
        <View style={[styles.searchBox, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
          <Ionicons name="search" size={18} color={c.gray} />
          <TextInput
            ref={searchRef}
            style={[styles.searchInput, { color: c.black }]}
            placeholder="Buscar comida..."
            placeholderTextColor={c.disabled}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearch('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={18} color={c.gray} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Meal type tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.filterRow, { paddingHorizontal: sidePadding }]}
        style={styles.filterScroll}
      >
        {MEAL_FILTERS.map((f) => {
          const active = mealFilter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[
                styles.filterTab,
                { borderColor: active ? c.accent : c.grayLight },
                active && { backgroundColor: c.accent },
              ]}
              onPress={() => onMealFilterPress(f.key)}
              accessibilityLabel={f.label}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text
                style={[
                  styles.filterTabText,
                  { color: active ? c.white : c.gray },
                ]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Category chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.chipRow, { paddingHorizontal: sidePadding }]}
      >
        {CATEGORY_CHIPS.map((ch) => {
          const active = categoryFilter === ch.key;
          return (
            <TouchableOpacity
              key={ch.key}
              style={[
                styles.chip,
                { borderColor: active ? c.accent : c.grayLight, backgroundColor: active ? c.accent + '15' : c.surface },
              ]}
              onPress={() => onCategoryPress(ch.key)}
              accessibilityLabel={ch.label}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: active ? c.accent : c.gray },
                ]}
              >
                {ch.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Results count */}
      <View style={[styles.resultsRow, { paddingHorizontal: sidePadding }]}>
        <Text style={[styles.resultsText, { color: c.gray }]}>
          {loading ? 'Cargando...' : `${filtered.length} comida${filtered.length !== 1 ? 's' : ''}`}
        </Text>
      </View>

      {/* Meal list */}
      <FlatList
        data={filtered}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={[styles.list, { paddingHorizontal: sidePadding }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={15}
        maxToRenderPerBatch={20}
        windowSize={7}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="search-outline" size={40} color={c.grayLight} />
              <Text style={[styles.emptyText, { color: c.gray }]}>
                No se encontraron comidas con esos filtros
              </Text>
            </View>
          ) : null
        }
      />

      {/* Detail modal */}
      <MealDetailModal
        meal={selectedMeal}
        visible={modalVisible}
        onClose={onCloseModal}
        onRegister={onRegister}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typography.titleSm,
  },
  searchContainer: {
    marginBottom: spacing.sm,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    height: 44,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    fontSize: 15,
    padding: 0,
  },
  filterScroll: {
    flexGrow: 0,
    marginBottom: spacing.sm,
  },
  filterRow: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  filterTab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  filterTabText: {
    ...typography.caption,
    fontWeight: '600',
  },
  chipRow: {
    gap: spacing.xs,
    paddingBottom: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  chipText: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '600',
  },
  resultsRow: {
    marginBottom: spacing.xs,
  },
  resultsText: {
    ...typography.caption,
  },
  list: {
    paddingBottom: spacing.xxl,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyText: {
    ...typography.body,
    textAlign: 'center',
  },
});
