/**
 * FoodComparison -- Side-by-side food comparison with visual macro bars.
 *
 * Features:
 * - Compare 2 foods from the local database or search results
 * - Horizontal macro bars for visual comparison
 * - "VS" badge centered between the two foods
 * - Green highlight on the food that wins each macro category
 * - Dark mode support, haptics, full accessibility
 * - Can be opened from LogScreen via a "Comparar" button
 */
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  FlatList,
  Modal,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius, shadows } from '../theme';
import { haptics } from '../hooks/useHaptics';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { foodDatabase, FoodItem as LocalFoodItem } from '../data/foodDatabase';

// ---- Types -------------------------------------------------------------------

export interface ComparisonFood {
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
}

interface FoodComparisonProps {
  /** Controls modal visibility */
  visible: boolean;
  /** Called when the user closes the comparison */
  onClose: () => void;
  /** Optional pre-selected food A */
  initialFoodA?: ComparisonFood;
}

type MacroKey = 'calories' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fiber_g';

interface MacroConfig {
  key: MacroKey;
  label: string;
  unit: string;
  colorKey: 'calories' | 'protein' | 'carbs' | 'fats' | 'success';
  /** 'higher' means higher is better (protein, fiber), 'lower' means lower is better (calories for cutting, fat) */
  betterDirection: 'higher' | 'lower';
}

// ---- Constants ---------------------------------------------------------------

const MACROS: MacroConfig[] = [
  { key: 'calories', label: 'Calorias', unit: 'kcal', colorKey: 'calories', betterDirection: 'lower' },
  { key: 'protein_g', label: 'Proteina', unit: 'g', colorKey: 'protein', betterDirection: 'higher' },
  { key: 'carbs_g', label: 'Carbos', unit: 'g', colorKey: 'carbs', betterDirection: 'lower' },
  { key: 'fat_g', label: 'Grasas', unit: 'g', colorKey: 'fats', betterDirection: 'lower' },
  { key: 'fiber_g', label: 'Fibra', unit: 'g', colorKey: 'success', betterDirection: 'higher' },
];

const SCREEN_WIDTH = Dimensions.get('window').width;

// ---- Helpers -----------------------------------------------------------------

/** Normalize for search matching */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/** Convert local food item to comparison format (per serving) */
function localToComparison(f: LocalFoodItem): ComparisonFood {
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
  };
}

// ---- Macro bar component -----------------------------------------------------

function MacroBar({
  config,
  valueA,
  valueB,
  c,
}: {
  config: MacroConfig;
  valueA: number;
  valueB: number;
  c: ReturnType<typeof useThemeColors>;
}) {
  const maxVal = Math.max(valueA, valueB, 1); // avoid divide by zero
  const barWidthA = (valueA / maxVal) * 100;
  const barWidthB = (valueB / maxVal) * 100;

  // Determine which is "better"
  let aWins = false;
  let bWins = false;
  if (valueA !== valueB) {
    if (config.betterDirection === 'higher') {
      aWins = valueA > valueB;
      bWins = valueB > valueA;
    } else {
      aWins = valueA < valueB;
      bWins = valueB < valueA;
    }
  }

  const macroColor = c[config.colorKey];
  const winColor = c.success;

  // Animated bar widths
  const animA = useRef(new Animated.Value(0)).current;
  const animB = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(animA, {
        toValue: barWidthA,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(animB, {
        toValue: barWidthB,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start();
  }, [barWidthA, barWidthB]);

  return (
    <View
      style={st.macroRow}
      accessibilityLabel={`${config.label}: alimento A ${valueA}${config.unit}, alimento B ${valueB}${config.unit}${aWins ? ', A es mejor' : bWins ? ', B es mejor' : ', iguales'}`}
    >
      {/* Label */}
      <Text style={[st.macroLabel, { color: c.gray }]}>{config.label}</Text>

      {/* Bars container */}
      <View style={st.barsContainer}>
        {/* Food A bar (right-aligned, grows to the left) */}
        <View style={st.barSide}>
          <Text style={[st.barValue, { color: aWins ? winColor : c.black }]}>
            {valueA}{config.unit}
          </Text>
          <View style={st.barTrack}>
            <Animated.View
              style={[
                st.barFill,
                st.barFillLeft,
                {
                  backgroundColor: aWins ? winColor : macroColor,
                  width: animA.interpolate({
                    inputRange: [0, 100],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
          {aWins && (
            <Ionicons name="checkmark-circle" size={14} color={winColor} style={st.winIcon} />
          )}
        </View>

        {/* VS badge */}
        <View style={[st.vsBadge, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
          <Text style={[st.vsText, { color: c.gray }]}>vs</Text>
        </View>

        {/* Food B bar (left-aligned, grows to the right) */}
        <View style={st.barSide}>
          <View style={st.barTrack}>
            <Animated.View
              style={[
                st.barFill,
                st.barFillRight,
                {
                  backgroundColor: bWins ? winColor : macroColor,
                  width: animB.interpolate({
                    inputRange: [0, 100],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
          <Text style={[st.barValue, { color: bWins ? winColor : c.black }]}>
            {valueB}{config.unit}
          </Text>
          {bWins && (
            <Ionicons name="checkmark-circle" size={14} color={winColor} style={st.winIcon} />
          )}
        </View>
      </View>
    </View>
  );
}

// ---- Food picker (search + select) -------------------------------------------

function FoodPicker({
  visible,
  onSelect,
  onClose,
  label,
}: {
  visible: boolean;
  onSelect: (food: ComparisonFood) => void;
  onClose: () => void;
  label: string;
}) {
  const c = useThemeColors();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 200);

  const results = useMemo(() => {
    if (!debouncedSearch.trim()) {
      return foodDatabase.slice(0, 30).map(localToComparison);
    }
    return foodDatabase
      .filter((f) => normalize(f.name).includes(normalize(debouncedSearch)))
      .slice(0, 30)
      .map(localToComparison);
  }, [debouncedSearch]);

  const handleSelect = useCallback(
    (food: ComparisonFood) => {
      haptics.light();
      setSearch('');
      onSelect(food);
    },
    [onSelect],
  );

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={st.pickerOverlay}>
        <View style={[st.pickerSheet, { backgroundColor: c.bg }]}>
          {/* Header */}
          <View style={st.pickerHeader}>
            <Text style={[st.pickerTitle, { color: c.black }]}>{label}</Text>
            <TouchableOpacity
              onPress={onClose}
              accessibilityLabel="Cerrar"
              accessibilityRole="button"
            >
              <Ionicons name="close" size={24} color={c.black} />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={[st.pickerSearch, { backgroundColor: c.surface }]}>
            <Ionicons name="search-outline" size={16} color={c.gray} />
            <TextInput
              style={[st.pickerInput, { color: c.black }]}
              placeholder="Buscar alimento..."
              placeholderTextColor={c.disabled}
              value={search}
              onChangeText={setSearch}
              autoFocus
              accessibilityLabel="Buscar alimento para comparar"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} accessibilityLabel="Limpiar">
                <Ionicons name="close-circle" size={16} color={c.gray} />
              </TouchableOpacity>
            )}
          </View>

          {/* Results */}
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[st.pickerItem, { borderColor: c.grayLight }]}
                onPress={() => handleSelect(item)}
                activeOpacity={0.7}
                accessibilityLabel={`${item.name}, ${item.calories} calorias`}
                accessibilityRole="button"
              >
                <Text style={st.pickerEmoji}>{item.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[st.pickerName, { color: c.black }]}>{item.name}</Text>
                  <Text style={[st.pickerMeta, { color: c.gray }]}>
                    {item.serving_size}g - {item.serving_unit}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[st.pickerCal, { color: c.black }]}>{item.calories}</Text>
                  <Text style={[st.pickerCalUnit, { color: c.gray }]}>kcal</Text>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={st.pickerEmpty}>
                <Text style={[st.pickerEmptyText, { color: c.gray }]}>Sin resultados</Text>
              </View>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

// ---- Food card (selected food display) ---------------------------------------

function FoodCard({
  food,
  label,
  side,
  onSelect,
  c,
}: {
  food: ComparisonFood | null;
  label: string;
  side: 'A' | 'B';
  onSelect: () => void;
  c: ReturnType<typeof useThemeColors>;
}) {
  if (!food) {
    return (
      <TouchableOpacity
        style={[st.foodCard, st.foodCardEmpty, { backgroundColor: c.surface, borderColor: c.grayLight }]}
        onPress={onSelect}
        activeOpacity={0.7}
        accessibilityLabel={`Seleccionar alimento ${label}`}
        accessibilityRole="button"
      >
        <View style={[st.selectIconBg, { backgroundColor: c.accent + '15' }]}>
          <Ionicons name="add-circle-outline" size={24} color={c.accent} />
        </View>
        <Text style={[st.selectText, { color: c.accent }]}>Seleccionar</Text>
        <Text style={[st.selectHint, { color: c.gray }]}>{label}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[st.foodCard, { backgroundColor: c.surface, borderColor: c.grayLight }]}
      onPress={onSelect}
      activeOpacity={0.7}
      accessibilityLabel={`${food.name}, ${food.calories} calorias. Toca para cambiar`}
      accessibilityRole="button"
    >
      <Text style={st.foodEmoji}>{food.emoji}</Text>
      <Text style={[st.foodName, { color: c.black }]} numberOfLines={2}>{food.name}</Text>
      <Text style={[st.foodServing, { color: c.gray }]}>
        {food.serving_size}g
      </Text>
      <Text style={[st.foodCals, { color: c.black }]}>
        {food.calories} <Text style={[st.foodCalsUnit, { color: c.gray }]}>kcal</Text>
      </Text>
    </TouchableOpacity>
  );
}

// ---- Main component ----------------------------------------------------------

export default function FoodComparison({ visible, onClose, initialFoodA }: FoodComparisonProps) {
  const c = useThemeColors();
  const [foodA, setFoodA] = useState<ComparisonFood | null>(initialFoodA ?? null);
  const [foodB, setFoodB] = useState<ComparisonFood | null>(null);
  const [pickerTarget, setPickerTarget] = useState<'A' | 'B' | null>(null);
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Animate in when visible
  useEffect(() => {
    if (visible) {
      slideAnim.setValue(0);
      Animated.spring(slideAnim, {
        toValue: 1,
        friction: 10,
        tension: 80,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  // Reset when initialFoodA changes
  useEffect(() => {
    if (initialFoodA) setFoodA(initialFoodA);
  }, [initialFoodA]);

  const handlePickerSelect = useCallback(
    (food: ComparisonFood) => {
      haptics.medium();
      if (pickerTarget === 'A') {
        setFoodA(food);
      } else {
        setFoodB(food);
      }
      setPickerTarget(null);
    },
    [pickerTarget],
  );

  const handleSwap = useCallback(() => {
    haptics.light();
    setFoodA((prev) => {
      setFoodB((prevB) => {
        setFoodA(prevB);
        return prev;
      });
      return prev;
    });
    // Correct swap using temp
    const tempA = foodA;
    const tempB = foodB;
    setFoodA(tempB);
    setFoodB(tempA);
  }, [foodA, foodB]);

  const handleReset = useCallback(() => {
    haptics.light();
    setFoodA(null);
    setFoodB(null);
  }, []);

  const bothSelected = foodA !== null && foodB !== null;

  // Summary: count wins for each side
  const summary = useMemo(() => {
    if (!foodA || !foodB) return { aWins: 0, bWins: 0, ties: 0 };
    let aWins = 0;
    let bWins = 0;
    let ties = 0;
    for (const m of MACROS) {
      const a = foodA[m.key];
      const b = foodB[m.key];
      if (a === b) {
        ties++;
      } else if (m.betterDirection === 'higher') {
        a > b ? aWins++ : bWins++;
      } else {
        a < b ? aWins++ : bWins++;
      }
    }
    return { aWins, bWins, ties };
  }, [foodA, foodB]);

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <Animated.View
        style={[
          st.screen,
          {
            backgroundColor: c.bg,
            opacity: slideAnim,
            transform: [
              {
                translateY: slideAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [30, 0],
                }),
              },
            ],
          },
        ]}
      >
        {/* Header */}
        <View style={[st.header, { borderBottomColor: c.grayLight }]}>
          <TouchableOpacity
            onPress={() => { haptics.light(); onClose(); }}
            style={[st.headerBtn, { backgroundColor: c.surface }]}
            accessibilityLabel="Cerrar comparacion"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={20} color={c.black} />
          </TouchableOpacity>
          <Text style={[st.headerTitle, { color: c.black }]}>Comparar Alimentos</Text>
          <TouchableOpacity
            onPress={handleReset}
            style={[st.headerBtn, { backgroundColor: c.surface }]}
            accessibilityLabel="Reiniciar comparacion"
            accessibilityRole="button"
          >
            <Ionicons name="refresh-outline" size={18} color={c.black} />
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={st.scrollContent}
          bounces={false}
        >
          {/* Food cards */}
          <View style={st.cardsRow}>
            <FoodCard
              food={foodA}
              label="Alimento A"
              side="A"
              onSelect={() => setPickerTarget('A')}
              c={c}
            />

            {/* VS badge / swap button */}
            <View style={st.vsContainer}>
              <TouchableOpacity
                onPress={handleSwap}
                style={[st.vsCenterBadge, { backgroundColor: c.black }]}
                disabled={!bothSelected}
                activeOpacity={0.7}
                accessibilityLabel="Intercambiar alimentos"
                accessibilityRole="button"
              >
                {bothSelected ? (
                  <Ionicons name="swap-horizontal" size={18} color={c.white} />
                ) : (
                  <Text style={[st.vsCenterText, { color: c.white }]}>VS</Text>
                )}
              </TouchableOpacity>
            </View>

            <FoodCard
              food={foodB}
              label="Alimento B"
              side="B"
              onSelect={() => setPickerTarget('B')}
              c={c}
            />
          </View>

          {/* Comparison bars */}
          {bothSelected && foodA && foodB && (
            <View style={[st.comparisonCard, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
              {/* Summary */}
              <View style={st.summaryRow}>
                <View style={st.summaryItem}>
                  <Text
                    style={[
                      st.summaryValue,
                      { color: summary.aWins >= summary.bWins ? c.success : c.black },
                    ]}
                  >
                    {summary.aWins}
                  </Text>
                  <Text style={[st.summaryLabel, { color: c.gray }]}>
                    {foodA.name.length > 10 ? foodA.name.slice(0, 10) + '...' : foodA.name}
                  </Text>
                </View>
                <View style={st.summaryItem}>
                  <Text style={[st.summaryValue, { color: c.gray }]}>{summary.ties}</Text>
                  <Text style={[st.summaryLabel, { color: c.gray }]}>Empate</Text>
                </View>
                <View style={st.summaryItem}>
                  <Text
                    style={[
                      st.summaryValue,
                      { color: summary.bWins >= summary.aWins ? c.success : c.black },
                    ]}
                  >
                    {summary.bWins}
                  </Text>
                  <Text style={[st.summaryLabel, { color: c.gray }]}>
                    {foodB.name.length > 10 ? foodB.name.slice(0, 10) + '...' : foodB.name}
                  </Text>
                </View>
              </View>

              {/* Column headers */}
              <View style={st.colHeaders}>
                <Text style={[st.colHeader, st.colHeaderLeft, { color: c.gray }]}>
                  {foodA.name.length > 12 ? foodA.name.slice(0, 12) + '...' : foodA.name}
                </Text>
                <View style={{ width: 36 }} />
                <Text style={[st.colHeader, st.colHeaderRight, { color: c.gray }]}>
                  {foodB.name.length > 12 ? foodB.name.slice(0, 12) + '...' : foodB.name}
                </Text>
              </View>

              {/* Macro bars */}
              {MACROS.map((m) => (
                <MacroBar
                  key={m.key}
                  config={m}
                  valueA={foodA[m.key]}
                  valueB={foodB[m.key]}
                  c={c}
                />
              ))}

              {/* Per 100g note */}
              <Text style={[st.perServingNote, { color: c.gray }]}>
                Valores por porcion ({foodA.serving_size}g vs {foodB.serving_size}g)
              </Text>
            </View>
          )}

          {/* Help text when no foods selected */}
          {!bothSelected && (
            <View style={st.helpSection}>
              <Ionicons name="information-circle-outline" size={20} color={c.gray} />
              <Text style={[st.helpText, { color: c.gray }]}>
                Selecciona dos alimentos para compararlos lado a lado. Las barras verdes indican
                cual es mejor en cada categoria nutricional.
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Food picker modal */}
        <FoodPicker
          visible={pickerTarget !== null}
          onSelect={handlePickerSelect}
          onClose={() => setPickerTarget(null)}
          label={pickerTarget === 'A' ? 'Alimento A' : 'Alimento B'}
        />
      </Animated.View>
    </Modal>
  );
}

// ---- Styles ------------------------------------------------------------------

const st = StyleSheet.create({
  screen: {
    flex: 1,
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl + 16,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typography.titleSm,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl + 40,
  },
  // Food cards row
  cardsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 0,
    marginBottom: spacing.lg,
  },
  foodCard: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.xs,
    ...shadows.sm,
  },
  foodCardEmpty: {
    justifyContent: 'center',
    minHeight: 160,
  },
  selectIconBg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  selectText: {
    ...typography.label,
    fontWeight: '700',
  },
  selectHint: {
    ...typography.caption,
  },
  foodEmoji: {
    fontSize: 40,
    marginBottom: spacing.xs,
  },
  foodName: {
    ...typography.label,
    textAlign: 'center',
    fontSize: 14,
  },
  foodServing: {
    ...typography.caption,
    textAlign: 'center',
  },
  foodCals: {
    ...typography.titleSm,
    marginTop: spacing.xs,
  },
  foodCalsUnit: {
    ...typography.caption,
    fontWeight: '400',
  },
  // VS
  vsContainer: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  vsCenterBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vsCenterText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  // Comparison card
  comparisonCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    ...shadows.sm,
  },
  // Summary
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: spacing.md,
    paddingBottom: spacing.md,
  },
  summaryItem: {
    alignItems: 'center',
    gap: 2,
  },
  summaryValue: {
    ...typography.titleMd,
  },
  summaryLabel: {
    ...typography.caption,
  },
  // Column headers
  colHeaders: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  colHeader: {
    ...typography.caption,
    fontWeight: '600',
    flex: 1,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  colHeaderLeft: {
    textAlign: 'right',
    paddingRight: spacing.xs,
  },
  colHeaderRight: {
    textAlign: 'left',
    paddingLeft: spacing.xs,
  },
  // Macro row
  macroRow: {
    marginBottom: spacing.md,
  },
  macroLabel: {
    ...typography.caption,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  barsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  barSide: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(128,128,128,0.1)',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  barFillLeft: {
    alignSelf: 'flex-end',
  },
  barFillRight: {
    alignSelf: 'flex-start',
  },
  barValue: {
    ...typography.caption,
    fontWeight: '700',
    minWidth: 40,
    fontVariant: ['tabular-nums'],
  },
  vsBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: spacing.xs,
  },
  vsText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  winIcon: {
    marginLeft: 2,
  },
  perServingNote: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  // Help
  helpSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  helpText: {
    ...typography.body,
    flex: 1,
    lineHeight: 22,
  },
  // Picker modal
  pickerOverlay: {
    flex: 1,
  },
  pickerSheet: {
    flex: 1,
    paddingTop: spacing.xl + 16,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  pickerTitle: {
    ...typography.titleSm,
  },
  pickerSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 40,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  pickerInput: {
    flex: 1,
    ...typography.body,
    fontSize: 15,
    padding: 0,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    gap: spacing.md,
  },
  pickerEmoji: {
    fontSize: 28,
  },
  pickerName: {
    ...typography.bodyMd,
  },
  pickerMeta: {
    ...typography.caption,
    marginTop: 1,
  },
  pickerCal: {
    ...typography.label,
    fontWeight: '700',
    fontSize: 16,
  },
  pickerCalUnit: {
    ...typography.caption,
  },
  pickerEmpty: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  pickerEmptyText: {
    ...typography.body,
  },
});
