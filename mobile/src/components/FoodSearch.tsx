/**
 * FoodSearch -- Fuzzy food search with debounce, local + API search,
 * recent search history, skeleton loading, and portion selector for logging.
 *
 * Features:
 * - 300ms debounced search input
 * - Searches local foodDatabase + backend API (searchFoodHistory)
 * - Recent search history (last 10, persisted in AsyncStorage)
 * - Skeleton loading rows while searching
 * - Tap result -> portion selector bottom sheet -> log via manualLogFood
 * - Full dark mode, haptics, accessibility
 */
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  Animated,
  Easing,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius, shadows } from '../theme';
import { haptics } from '../hooks/useHaptics';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { showNotification } from './InAppNotification';
import { foodDatabase, FoodItem as LocalFoodItem } from '../data/foodDatabase';
import * as foodService from '../services/food.service';
import { MealType, FoodSuggestion } from '../services/food.service';
import SkeletonLoader from './SkeletonLoader';

// ---- Constants ---------------------------------------------------------------

const RECENT_SEARCHES_KEY = '@fitsi_recent_food_searches';
const MAX_RECENT = 10;

// ---- Types -------------------------------------------------------------------

/** Unified search result combining local DB + API results */
export interface SearchResult {
  id: string;
  name: string;
  emoji: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  serving_size: number;
  serving_unit: string;
  calories_per_100g: number;
  source: 'local' | 'api';
}

interface FoodSearchProps {
  /** Callback after a food is successfully logged */
  onLogged?: () => void;
  /** Pre-selected meal type for logging */
  mealType?: MealType;
  /** Whether to show inline (card mode) vs full-screen */
  inline?: boolean;
}

// ---- Helpers -----------------------------------------------------------------

/** Normalize a string for fuzzy matching: lowercase, strip accents */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/** Simple fuzzy match: all query tokens must appear in the target */
function fuzzyMatch(target: string, query: string): boolean {
  const normTarget = normalize(target);
  const tokens = normalize(query).split(/\s+/);
  return tokens.every((t) => normTarget.includes(t));
}

/** Convert local FoodItem to SearchResult */
function localToResult(f: LocalFoodItem): SearchResult {
  return {
    id: f.id,
    name: f.name,
    emoji: f.emoji,
    calories: Math.round((f.calories_per_100g * f.servingSize) / 100),
    protein_g: Math.round((f.protein * f.servingSize) / 100 * 10) / 10,
    carbs_g: Math.round((f.carbs * f.servingSize) / 100 * 10) / 10,
    fat_g: Math.round((f.fat * f.servingSize) / 100 * 10) / 10,
    fiber_g: Math.round((f.fiber * f.servingSize) / 100 * 10) / 10,
    serving_size: f.servingSize,
    serving_unit: f.servingUnit,
    calories_per_100g: f.calories_per_100g,
    source: 'local',
  };
}

/** Convert API FoodSuggestion to SearchResult */
function apiToResult(f: FoodSuggestion, idx: number): SearchResult {
  return {
    id: `api_${idx}_${f.food_name}`,
    name: f.food_name,
    emoji: '',
    calories: Math.round(f.calories),
    protein_g: Math.round(f.protein_g * 10) / 10,
    carbs_g: Math.round(f.carbs_g * 10) / 10,
    fat_g: Math.round(f.fats_g * 10) / 10,
    fiber_g: 0,
    serving_size: 100,
    serving_unit: '100g',
    calories_per_100g: Math.round(f.calories),
    source: 'api',
  };
}

// ---- Recent searches ---------------------------------------------------------

async function getRecentSearches(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function addRecentSearch(query: string): Promise<void> {
  try {
    const current = await getRecentSearches();
    const cleaned = query.trim();
    if (!cleaned) return;
    const filtered = current.filter((s) => s.toLowerCase() !== cleaned.toLowerCase());
    const updated = [cleaned, ...filtered].slice(0, MAX_RECENT);
    await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  } catch {
    // Silent fail
  }
}

async function clearRecentSearches(): Promise<void> {
  try {
    await AsyncStorage.removeItem(RECENT_SEARCHES_KEY);
  } catch {
    // Silent fail
  }
}

// ---- Skeleton row ------------------------------------------------------------

function SearchSkeleton() {
  return (
    <View style={s.skeletonRow}>
      <SkeletonLoader width={40} height={40} borderRadius={radius.sm} />
      <View style={s.skeletonContent}>
        <SkeletonLoader width="70%" height={14} />
        <SkeletonLoader width="50%" height={10} style={{ marginTop: 6 }} />
        <View style={s.skeletonMacros}>
          <SkeletonLoader width={40} height={10} />
          <SkeletonLoader width={40} height={10} />
          <SkeletonLoader width={40} height={10} />
        </View>
      </View>
      <SkeletonLoader width={44} height={30} borderRadius={radius.sm} />
    </View>
  );
}

// ---- Portion selector --------------------------------------------------------

const PORTION_PRESETS = [0.5, 1, 1.5, 2];

interface PortionSelectorProps {
  visible: boolean;
  food: SearchResult | null;
  mealType: MealType;
  onClose: () => void;
  onConfirm: (food: SearchResult, portions: number, mealType: MealType) => void;
}

function PortionSelector({ visible, food, mealType, onClose, onConfirm }: PortionSelectorProps) {
  const c = useThemeColors();
  const [portions, setPortions] = useState(1);
  const [selectedMeal, setSelectedMeal] = useState<MealType>(mealType);
  const scaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setPortions(1);
      setSelectedMeal(mealType);
      scaleAnim.setValue(0);
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 100,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, mealType]);

  if (!food) return null;

  const cals = Math.round(food.calories * portions);
  const prot = Math.round(food.protein_g * portions * 10) / 10;
  const carb = Math.round(food.carbs_g * portions * 10) / 10;
  const fat = Math.round(food.fat_g * portions * 10) / 10;

  const mealOptions: { key: MealType; label: string; icon: string }[] = [
    { key: 'breakfast', label: 'Desayuno', icon: 'sunny-outline' },
    { key: 'lunch', label: 'Almuerzo', icon: 'restaurant-outline' },
    { key: 'dinner', label: 'Cena', icon: 'moon-outline' },
    { key: 'snack', label: 'Snack', icon: 'cafe-outline' },
  ];

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={s.modalOverlay}
      >
        <TouchableOpacity
          style={s.modalBackdrop}
          activeOpacity={1}
          onPress={onClose}
          accessibilityLabel="Cerrar selector de porcion"
        />
        <Animated.View
          style={[
            s.portionSheet,
            {
              backgroundColor: c.bg,
              borderColor: c.grayLight,
              transform: [{ scale: scaleAnim }],
              opacity: scaleAnim,
            },
          ]}
        >
          {/* Food name */}
          <View style={s.portionHeader}>
            {food.emoji ? (
              <Text style={s.portionEmoji}>{food.emoji}</Text>
            ) : (
              <View style={[s.portionIconBg, { backgroundColor: c.accent + '15' }]}>
                <Ionicons name="nutrition-outline" size={20} color={c.accent} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[s.portionFoodName, { color: c.black }]} numberOfLines={2}>
                {food.name}
              </Text>
              <Text style={[s.portionServing, { color: c.gray }]}>
                {food.serving_size}g - {food.serving_unit}
              </Text>
            </View>
          </View>

          {/* Portion presets */}
          <Text style={[s.portionLabel, { color: c.gray }]}>Porciones</Text>
          <View style={s.portionPresetsRow}>
            {PORTION_PRESETS.map((p) => {
              const active = portions === p;
              return (
                <TouchableOpacity
                  key={p}
                  style={[
                    s.portionChip,
                    { borderColor: active ? c.accent : c.grayLight, backgroundColor: active ? c.accent + '15' : c.surface },
                  ]}
                  onPress={() => { haptics.selection(); setPortions(p); }}
                  accessibilityLabel={`${p} ${p === 1 ? 'porcion' : 'porciones'}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[s.portionChipText, { color: active ? c.accent : c.black }]}>
                    {p}x
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Custom portion adjuster */}
          <View style={s.portionAdjuster}>
            <TouchableOpacity
              style={[s.adjusterBtn, { backgroundColor: c.surface }]}
              onPress={() => { haptics.selection(); setPortions(Math.max(0.25, portions - 0.25)); }}
              accessibilityLabel="Reducir porcion"
              accessibilityRole="button"
            >
              <Ionicons name="remove" size={18} color={c.black} />
            </TouchableOpacity>
            <Text style={[s.portionValue, { color: c.black }]}>{portions}x</Text>
            <TouchableOpacity
              style={[s.adjusterBtn, { backgroundColor: c.surface }]}
              onPress={() => { haptics.selection(); setPortions(portions + 0.25); }}
              accessibilityLabel="Aumentar porcion"
              accessibilityRole="button"
            >
              <Ionicons name="add" size={18} color={c.black} />
            </TouchableOpacity>
          </View>

          {/* Macros preview */}
          <View style={[s.macroPreview, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
            <View style={s.macroPreviewItem}>
              <Text style={[s.macroPreviewValue, { color: c.black }]}>{cals}</Text>
              <Text style={[s.macroPreviewLabel, { color: c.gray }]}>kcal</Text>
            </View>
            <View style={[s.macroPreviewDivider, { backgroundColor: c.grayLight }]} />
            <View style={s.macroPreviewItem}>
              <Text style={[s.macroPreviewValue, { color: c.protein }]}>{prot}g</Text>
              <Text style={[s.macroPreviewLabel, { color: c.gray }]}>Proteina</Text>
            </View>
            <View style={[s.macroPreviewDivider, { backgroundColor: c.grayLight }]} />
            <View style={s.macroPreviewItem}>
              <Text style={[s.macroPreviewValue, { color: c.carbs }]}>{carb}g</Text>
              <Text style={[s.macroPreviewLabel, { color: c.gray }]}>Carbos</Text>
            </View>
            <View style={[s.macroPreviewDivider, { backgroundColor: c.grayLight }]} />
            <View style={s.macroPreviewItem}>
              <Text style={[s.macroPreviewValue, { color: c.fats }]}>{fat}g</Text>
              <Text style={[s.macroPreviewLabel, { color: c.gray }]}>Grasas</Text>
            </View>
          </View>

          {/* Meal type selector */}
          <Text style={[s.portionLabel, { color: c.gray, marginTop: spacing.md }]}>Tipo de comida</Text>
          <View style={s.mealTypeRow}>
            {mealOptions.map((m) => {
              const active = selectedMeal === m.key;
              return (
                <TouchableOpacity
                  key={m.key}
                  style={[
                    s.mealTypeChip,
                    { borderColor: active ? c.accent : c.grayLight, backgroundColor: active ? c.accent + '15' : c.surface },
                  ]}
                  onPress={() => { haptics.selection(); setSelectedMeal(m.key); }}
                  accessibilityLabel={m.label}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Ionicons name={m.icon as any} size={14} color={active ? c.accent : c.gray} />
                  <Text style={[s.mealTypeLabel, { color: active ? c.accent : c.black }]}>{m.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Confirm button */}
          <TouchableOpacity
            style={[s.confirmBtn, { backgroundColor: c.black }]}
            onPress={() => onConfirm(food, portions, selectedMeal)}
            activeOpacity={0.8}
            accessibilityLabel={`Registrar ${food.name}, ${cals} calorias`}
            accessibilityRole="button"
          >
            <Ionicons name="checkmark-circle" size={20} color={c.white} />
            <Text style={[s.confirmBtnText, { color: c.white }]}>
              Registrar {cals} kcal
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---- Result row --------------------------------------------------------------

function ResultRow({
  item,
  onSelect,
  c,
}: {
  item: SearchResult;
  onSelect: (item: SearchResult) => void;
  c: ReturnType<typeof useThemeColors>;
}) {
  return (
    <TouchableOpacity
      style={[s.resultRow, { backgroundColor: c.surface, borderColor: c.grayLight }]}
      onPress={() => onSelect(item)}
      activeOpacity={0.7}
      accessibilityLabel={`${item.name}, ${item.calories} calorias por porcion`}
      accessibilityRole="button"
      accessibilityHint="Toca para seleccionar porcion y registrar"
    >
      {item.emoji ? (
        <Text style={s.resultEmoji}>{item.emoji}</Text>
      ) : (
        <View style={[s.resultIconBg, { backgroundColor: c.accent + '15' }]}>
          <Ionicons name="nutrition-outline" size={18} color={c.accent} />
        </View>
      )}
      <View style={s.resultInfo}>
        <Text style={[s.resultName, { color: c.black }]} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={[s.resultServing, { color: c.gray }]} numberOfLines={1}>
          {item.serving_size}g - {item.serving_unit}
          {item.source === 'api' ? ' (historial)' : ''}
        </Text>
        <View style={s.resultMacros}>
          <Text style={[s.macroPill, { color: c.protein }]}>P {item.protein_g}g</Text>
          <Text style={[s.macroPill, { color: c.carbs }]}>C {item.carbs_g}g</Text>
          <Text style={[s.macroPill, { color: c.fats }]}>G {item.fat_g}g</Text>
        </View>
      </View>
      <View style={s.resultCalCol}>
        <Text style={[s.resultCalNum, { color: c.black }]}>{item.calories}</Text>
        <Text style={[s.resultCalUnit, { color: c.gray }]}>kcal</Text>
      </View>
    </TouchableOpacity>
  );
}

// ---- Main component ----------------------------------------------------------

export default function FoodSearch({ onLogged, mealType = 'snack', inline = false }: FoodSearchProps) {
  const c = useThemeColors();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 300);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [apiResults, setApiResults] = useState<SearchResult[]>([]);
  const [apiLoading, setApiLoading] = useState(false);
  const [selectedFood, setSelectedFood] = useState<SearchResult | null>(null);
  const [portionVisible, setPortionVisible] = useState(false);
  const [logging, setLogging] = useState(false);
  const inputRef = useRef<TextInput>(null);

  // Load recent searches on mount
  useEffect(() => {
    getRecentSearches().then(setRecentSearches);
  }, []);

  // Search local database
  const localResults = useMemo<SearchResult[]>(() => {
    if (!debouncedQuery.trim()) return [];
    return foodDatabase
      .filter((f) => fuzzyMatch(f.name, debouncedQuery))
      .slice(0, 20)
      .map(localToResult);
  }, [debouncedQuery]);

  // Search API with debounced query
  useEffect(() => {
    if (!debouncedQuery.trim() || debouncedQuery.trim().length < 2) {
      setApiResults([]);
      return;
    }

    let cancelled = false;
    setApiLoading(true);

    foodService
      .searchFoodHistory(debouncedQuery.trim(), 10)
      .then((results) => {
        if (!cancelled) {
          setApiResults(results.map(apiToResult));
        }
      })
      .catch(() => {
        if (!cancelled) setApiResults([]);
      })
      .finally(() => {
        if (!cancelled) setApiLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  // Merge and deduplicate results (local first, then API)
  const mergedResults = useMemo<SearchResult[]>(() => {
    const localNames = new Set(localResults.map((r) => normalize(r.name)));
    const uniqueApi = apiResults.filter((r) => !localNames.has(normalize(r.name)));
    return [...localResults, ...uniqueApi];
  }, [localResults, apiResults]);

  const isSearching = query.trim() !== '' && (query !== debouncedQuery || apiLoading);
  const showRecent = !query.trim() && recentSearches.length > 0;

  // Handle selecting a food from results
  const handleSelect = useCallback((food: SearchResult) => {
    haptics.light();
    setSelectedFood(food);
    setPortionVisible(true);
    // Save search query to recent
    if (query.trim()) {
      addRecentSearch(query.trim()).then(() => {
        getRecentSearches().then(setRecentSearches);
      });
    }
  }, [query]);

  // Handle tapping a recent search
  const handleRecentTap = useCallback((recent: string) => {
    haptics.light();
    setQuery(recent);
  }, []);

  // Handle clearing recent searches
  const handleClearRecent = useCallback(() => {
    haptics.light();
    clearRecentSearches().then(() => setRecentSearches([]));
  }, []);

  // Handle confirming the portion and logging the food
  const handleConfirm = useCallback(
    async (food: SearchResult, portions: number, meal: MealType) => {
      haptics.medium();
      setLogging(true);

      try {
        await foodService.manualLogFood({
          food_name: food.name,
          calories: Math.round(food.calories * portions),
          carbs_g: Math.round(food.carbs_g * portions * 10) / 10,
          protein_g: Math.round(food.protein_g * portions * 10) / 10,
          fats_g: Math.round(food.fat_g * portions * 10) / 10,
          fiber_g: Math.round(food.fiber_g * portions * 10) / 10 || undefined,
          serving_size: `${Math.round(food.serving_size * portions)}g`,
          meal_type: meal,
        });

        haptics.success();
        showNotification({
          message: `${food.name} registrado!`,
          type: 'success',
          icon: 'checkmark-circle',
        });
        setPortionVisible(false);
        setSelectedFood(null);
        setQuery('');
        onLogged?.();
      } catch {
        haptics.error();
        showNotification({
          message: 'Error al registrar. Intenta de nuevo.',
          type: 'warning',
          icon: 'alert-circle',
        });
      } finally {
        setLogging(false);
      }
    },
    [onLogged],
  );

  // Render a single result row
  const renderItem = useCallback(
    ({ item }: { item: SearchResult }) => (
      <ResultRow item={item} onSelect={handleSelect} c={c} />
    ),
    [handleSelect, c],
  );

  const keyExtractor = useCallback((item: SearchResult) => item.id, []);

  // Skeleton loading list
  const skeletons = isSearching ? (
    <View style={s.skeletonContainer}>
      <SearchSkeleton />
      <SearchSkeleton />
      <SearchSkeleton />
      <SearchSkeleton />
    </View>
  ) : null;

  return (
    <View style={[s.container, inline && s.containerInline]}>
      {/* Search input */}
      <View style={[s.searchBar, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
        <Ionicons name="search-outline" size={18} color={c.gray} />
        <TextInput
          ref={inputRef}
          style={[s.searchInput, { color: c.black }]}
          placeholder="Buscar alimentos..."
          placeholderTextColor={c.disabled}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Buscar alimentos"
          accessibilityHint="Escribe el nombre de un alimento para buscarlo"
        />
        {query.length > 0 && (
          <TouchableOpacity
            onPress={() => { setQuery(''); inputRef.current?.focus(); }}
            accessibilityLabel="Limpiar busqueda"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close-circle" size={18} color={c.gray} />
          </TouchableOpacity>
        )}
      </View>

      {/* Recent searches */}
      {showRecent && (
        <View style={s.recentSection}>
          <View style={s.recentHeader}>
            <Ionicons name="time-outline" size={14} color={c.gray} />
            <Text style={[s.recentTitle, { color: c.gray }]}>Busquedas recientes</Text>
            <TouchableOpacity
              onPress={handleClearRecent}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Borrar busquedas recientes"
              accessibilityRole="button"
            >
              <Text style={[s.recentClear, { color: c.accent }]}>Limpiar</Text>
            </TouchableOpacity>
          </View>
          <View style={s.recentChips}>
            {recentSearches.map((term, idx) => (
              <TouchableOpacity
                key={`${term}_${idx}`}
                style={[s.recentChip, { backgroundColor: c.surface, borderColor: c.grayLight }]}
                onPress={() => handleRecentTap(term)}
                accessibilityLabel={`Buscar ${term}`}
                accessibilityRole="button"
              >
                <Text style={[s.recentChipText, { color: c.black }]}>{term}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Results count */}
      {query.trim() && !isSearching && (
        <Text style={[s.resultCount, { color: c.gray }]}>
          {mergedResults.length > 0
            ? `${mergedResults.length} resultado${mergedResults.length !== 1 ? 's' : ''}`
            : 'Sin resultados'}
        </Text>
      )}

      {/* Skeleton loading */}
      {isSearching && skeletons}

      {/* Results list */}
      {!isSearching && query.trim() && (
        <FlatList
          data={mergedResults}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={s.resultsList}
          contentContainerStyle={s.resultsContent}
          ListEmptyComponent={
            <View style={s.emptyContainer}>
              <Ionicons name="search-outline" size={40} color={c.grayLight} />
              <Text style={[s.emptyText, { color: c.black }]}>No se encontraron resultados</Text>
              <Text style={[s.emptyHint, { color: c.gray }]}>
                Intenta con otro nombre
              </Text>
            </View>
          }
        />
      )}

      {/* Portion selector modal */}
      <PortionSelector
        visible={portionVisible}
        food={selectedFood}
        mealType={mealType}
        onClose={() => setPortionVisible(false)}
        onConfirm={handleConfirm}
      />
    </View>
  );
}

// ---- Styles ------------------------------------------------------------------

const s = StyleSheet.create({
  container: {
    flex: 1,
  },
  containerInline: {
    flex: 0,
  },
  // Search bar
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    height: 48,
    gap: spacing.sm,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    padding: 0,
  },
  // Recent searches
  recentSection: {
    marginBottom: spacing.md,
  },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  recentTitle: {
    ...typography.caption,
    fontWeight: '600',
    flex: 1,
  },
  recentClear: {
    ...typography.caption,
    fontWeight: '600',
  },
  recentChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  recentChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  recentChipText: {
    ...typography.caption,
    fontWeight: '500',
  },
  // Result count
  resultCount: {
    ...typography.caption,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  // Result row
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
    ...shadows.sm,
  },
  resultEmoji: {
    fontSize: 32,
  },
  resultIconBg: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultInfo: {
    flex: 1,
    gap: 2,
  },
  resultName: {
    ...typography.bodyMd,
  },
  resultServing: {
    ...typography.caption,
  },
  resultMacros: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: 2,
  },
  macroPill: {
    ...typography.caption,
    fontWeight: '600',
  },
  resultCalCol: {
    alignItems: 'center',
    minWidth: 50,
  },
  resultCalNum: {
    fontSize: 20,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  resultCalUnit: {
    ...typography.caption,
  },
  resultsList: {
    flex: 1,
  },
  resultsContent: {
    paddingBottom: spacing.xl,
  },
  // Skeleton
  skeletonContainer: {
    gap: spacing.sm,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  skeletonContent: {
    flex: 1,
  },
  skeletonMacros: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: 6,
  },
  // Empty state
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyText: {
    ...typography.bodyMd,
  },
  emptyHint: {
    ...typography.caption,
  },
  // Portion selector modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  portionSheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    padding: spacing.lg,
    paddingBottom: spacing.xl + 20,
    ...shadows.lg,
  },
  portionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  portionEmoji: {
    fontSize: 36,
  },
  portionIconBg: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  portionFoodName: {
    ...typography.titleSm,
  },
  portionServing: {
    ...typography.caption,
    marginTop: 2,
  },
  portionLabel: {
    ...typography.caption,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  portionPresetsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  portionChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  portionChipText: {
    ...typography.label,
    fontWeight: '700',
  },
  portionAdjuster: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    marginBottom: spacing.lg,
  },
  adjusterBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  portionValue: {
    ...typography.titleMd,
    minWidth: 50,
    textAlign: 'center',
  },
  // Macro preview
  macroPreview: {
    flexDirection: 'row',
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  macroPreviewItem: {
    flex: 1,
    alignItems: 'center',
  },
  macroPreviewValue: {
    ...typography.label,
    fontWeight: '700',
    fontSize: 15,
  },
  macroPreviewLabel: {
    ...typography.caption,
    marginTop: 2,
  },
  macroPreviewDivider: {
    width: 1,
    height: 28,
  },
  // Meal type selector
  mealTypeRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  mealTypeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  mealTypeLabel: {
    ...typography.caption,
    fontWeight: '600',
    fontSize: 11,
  },
  // Confirm button
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 52,
    borderRadius: radius.full,
  },
  confirmBtnText: {
    ...typography.button,
  },
});
