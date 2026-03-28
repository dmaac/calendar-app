/**
 * AddFoodScreen -- Registro manual de alimentos
 * El usuario escribe nombre + macros sin necesitar foto.
 *
 * Features:
 * - Manual entry form (food name, calories, protein, carbs, fat, fiber)
 * - Portion size selector (small, medium, large, custom grams)
 * - Meal type selector (breakfast, lunch, dinner, snack)
 * - "Save as favorite" toggle
 * - Input validation with friendly error messages per field
 * - Numeric keyboard for number fields
 * - Autocomplete from food history
 * - Offline queueing
 */
import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, typography, spacing, radius, useLayout, mealColors, shadows } from '../../theme';
import * as foodService from '../../services/food.service';
import { MealType, FoodSuggestion, searchFoodHistory } from '../../services/food.service';
import * as favoritesService from '../../services/favorites.service';
import { haptics } from '../../hooks/useHaptics';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { enqueueAction } from '../../services/offlineStore';
import { showNotification } from '../../components/InAppNotification';

// ── Constants ────────────────────────────────────────────────────────────────

const MEAL_OPTIONS = (Object.entries(mealColors) as [MealType, typeof mealColors[string]][]).map(
  ([key, v]) => ({ key, ...v })
);

type PortionSize = 'small' | 'medium' | 'large' | 'custom';

interface PortionOption {
  key: PortionSize;
  label: string;
  icon: string;
  multiplier: number;
  description: string;
}

const PORTION_OPTIONS: PortionOption[] = [
  { key: 'small', label: 'Chica', icon: 'remove-circle-outline', multiplier: 0.7, description: '~70%' },
  { key: 'medium', label: 'Normal', icon: 'ellipse-outline', multiplier: 1.0, description: '100%' },
  { key: 'large', label: 'Grande', icon: 'add-circle-outline', multiplier: 1.3, description: '~130%' },
  { key: 'custom', label: 'Gramos', icon: 'scale-outline', multiplier: 1.0, description: 'Custom' },
];

// ── Macro input component ────────────────────────────────────────────────────

function MacroInput({
  label,
  value,
  onChange,
  unit = 'g',
  color,
  colors,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  unit?: string;
  color: string;
  colors: ReturnType<typeof useThemeColors>;
  error?: string;
}) {
  return (
    <View style={macroStyles.wrapper}>
      <Text style={[macroStyles.label, { color }]}>{label}</Text>
      <View style={[
        macroStyles.inputRow,
        { borderColor: error ? '#E53935' : color + '40', backgroundColor: colors.surface },
      ]}>
        <TextInput
          style={[macroStyles.input, { color: colors.black }]}
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={colors.disabled}
        />
        <Text style={[macroStyles.unit, { color: colors.gray }]}>{unit}</Text>
      </View>
      {!!error && <Text style={macroStyles.error}>{error}</Text>}
    </View>
  );
}

const macroStyles = StyleSheet.create({
  wrapper: { flex: 1, alignItems: 'center', gap: 4 },
  label: { ...typography.caption, fontWeight: '700' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.sm,
    borderWidth: 1.5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    width: '100%',
    justifyContent: 'center',
  },
  input: { ...typography.label, minWidth: 30, textAlign: 'center' },
  unit: { ...typography.caption, marginLeft: 2 },
  error: { color: '#E53935', fontSize: 10, marginTop: 2, textAlign: 'center' },
});

// ── Main screen ──────────────────────────────────────────────────────────────

export default function AddFoodScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { sidePadding } = useLayout();
  const c = useThemeColors();
  const { isConnected } = useNetworkStatus();

  const defaultMeal: MealType = route?.params?.mealType ?? 'snack';
  const [mealType, setMealType] = useState<MealType>(defaultMeal);
  const [foodName, setFoodName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fats, setFats] = useState('');
  const [fiber, setFiber] = useState('');
  const [portionSize, setPortionSize] = useState<PortionSize>('medium');
  const [customGrams, setCustomGrams] = useState('');
  const [saveAsFavorite, setSaveAsFavorite] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<FoodSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  // Track which fields have been touched for validation display
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markTouched = useCallback((field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }, []);

  const handleFoodNameChange = (value: string) => {
    setFoodName(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await searchFoodHistory(value.trim());
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
      } catch {
        // silently ignore search errors
      }
    }, 400);
  };

  const handleSelectSuggestion = (item: FoodSuggestion) => {
    setFoodName(item.food_name);
    setCalories(String(item.calories));
    setProtein(String(item.protein_g));
    setCarbs(String(item.carbs_g));
    setFats(String(item.fats_g));
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleFoodNameBlur = () => {
    markTouched('foodName');
    // Delay hide so tap on suggestion registers first
    setTimeout(() => setShowSuggestions(false), 150);
  };

  const parse = (v: string) => parseFloat(v.replace(',', '.')) || 0;

  // ── Validation ─────────────────────────────────────────────────────────────

  const foodNameTrimmed = foodName.trim();
  const foodNameError = !foodNameTrimmed
    ? 'El nombre es obligatorio'
    : foodNameTrimmed.length < 2
      ? 'Minimo 2 caracteres'
      : foodNameTrimmed.length > 100
        ? 'Maximo 100 caracteres'
        : '';

  const calParsed = parse(calories);
  const caloriesError = !calories
    ? 'Las calorias son obligatorias'
    : calParsed <= 0
      ? 'Debe ser mayor a 0'
      : calParsed >= 10000
        ? 'Maximo 9999 kcal'
        : '';

  const validateMacro = (v: string, label: string): string => {
    if (!v) return ''; // macros are optional
    const n = parse(v);
    if (n < 0) return `${label} no puede ser negativo`;
    if (n >= 1000) return `${label} maximo 999g`;
    return '';
  };

  const proteinError = validateMacro(protein, 'Proteina');
  const carbsError = validateMacro(carbs, 'Carbos');
  const fatsError = validateMacro(fats, 'Grasas');
  const fiberError = validateMacro(fiber, 'Fibra');

  const customGramsError = portionSize === 'custom' && customGrams
    ? (parse(customGrams) <= 0 ? 'Debe ser mayor a 0' : parse(customGrams) > 5000 ? 'Maximo 5000g' : '')
    : portionSize === 'custom' && !customGrams
      ? 'Ingresa los gramos'
      : '';

  const hasErrors = !!foodNameError || !!caloriesError
    || !!proteinError || !!carbsError || !!fatsError || !!fiberError
    || !!customGramsError;

  // ── Portion multiplier ─────────────────────────────────────────────────────

  const getEffectiveMultiplier = (): number => {
    if (portionSize === 'custom') {
      const g = parse(customGrams);
      // Assume base portion is 100g when custom grams are entered
      return g > 0 ? g / 100 : 1;
    }
    return PORTION_OPTIONS.find((o) => o.key === portionSize)?.multiplier ?? 1;
  };

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    // Mark all fields as touched to show errors
    setTouched({
      foodName: true,
      calories: true,
      protein: true,
      carbs: true,
      fats: true,
      fiber: true,
      customGrams: true,
    });

    if (hasErrors) {
      haptics.error();
      showNotification({
        message: 'Revisa los campos marcados en rojo',
        type: 'warning',
        icon: 'alert-circle-outline',
      });
      return;
    }

    haptics.light();
    setLoading(true);

    const multiplier = getEffectiveMultiplier();
    const servingLabel = portionSize === 'custom'
      ? `${customGrams}g`
      : PORTION_OPTIONS.find((o) => o.key === portionSize)?.label ?? '';

    const payload = {
      food_name: foodName.trim(),
      calories: Math.round(parse(calories) * multiplier),
      protein_g: Math.round(parse(protein) * multiplier * 10) / 10,
      carbs_g: Math.round(parse(carbs) * multiplier * 10) / 10,
      fats_g: Math.round(parse(fats) * multiplier * 10) / 10,
      fiber_g: fiber ? Math.round(parse(fiber) * multiplier * 10) / 10 : undefined,
      serving_size: servingLabel || undefined,
      meal_type: mealType,
    };

    try {
      if (isConnected) {
        await foodService.manualLogFood(payload);
      } else {
        // Offline -- queue for later sync
        await enqueueAction('log_food', payload);
      }

      // Save as favorite if toggled on
      if (saveAsFavorite) {
        try {
          await favoritesService.addFavorite({
            name: payload.food_name,
            calories: payload.calories,
            protein_g: payload.protein_g,
            carbs_g: payload.carbs_g,
            fats_g: payload.fats_g,
          });
        } catch {
          // Non-critical, don't block the main flow
        }
      }

      haptics.success();
      showNotification({
        message: saveAsFavorite
          ? 'Comida registrada y guardada en favoritos!'
          : 'Comida registrada!',
        type: 'success',
        icon: 'checkmark-circle',
      });
      navigation.goBack();
    } catch {
      // Network failed despite thinking we were online -- queue it
      try {
        await enqueueAction('log_food', payload);
        haptics.success();
        showNotification({
          message: 'Comida guardada localmente!',
          type: 'info',
          icon: 'cloud-upload-outline',
        });
        navigation.goBack();
      } catch {
        haptics.error();
        Alert.alert('Error', 'No se pudo guardar el registro. Intentalo de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Computed display ───────────────────────────────────────────────────────

  const multiplier = getEffectiveMultiplier();
  const showAdjusted = multiplier !== 1 && calParsed > 0;
  const adjustedCals = showAdjusted ? Math.round(calParsed * multiplier) : 0;

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: c.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm, paddingHorizontal: sidePadding, backgroundColor: c.bg, borderBottomColor: c.grayLight }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: c.surface }]}>
          <Ionicons name="close" size={20} color={c.black} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.black }]}>Anadir alimento</Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={loading || hasErrors}
          style={[styles.saveBtn, { backgroundColor: c.black }, (loading || hasErrors) && { opacity: 0.5 }]}
        >
          <Text style={[styles.saveBtnText, { color: c.white }]}>{loading ? 'Guardando...' : 'Guardar'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingHorizontal: sidePadding }]}
      >
        {/* ── Meal type selector ─────────────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: c.gray }]}>Comida</Text>
        <View style={styles.mealRow}>
          {MEAL_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={[
                styles.mealChip,
                { backgroundColor: c.surface, borderColor: c.grayLight },
                mealType === opt.key && { backgroundColor: opt.color, borderColor: opt.color },
              ]}
              onPress={() => { haptics.selection(); setMealType(opt.key); }}
              activeOpacity={0.7}
              accessibilityLabel={opt.label}
              accessibilityRole="radio"
              accessibilityState={{ selected: mealType === opt.key }}
            >
              <Ionicons
                name={opt.icon as any}
                size={14}
                color={mealType === opt.key ? c.white : c.gray}
              />
              <Text style={[
                styles.mealChipText,
                { color: c.gray },
                mealType === opt.key && { color: c.white },
              ]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Food name ──────────────────────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: c.gray }]}>Nombre del alimento</Text>
        <View>
          <View style={[
            styles.inputWrapper,
            { backgroundColor: c.surface },
            touched.foodName && !!foodNameError && styles.inputError,
          ]}>
            <Ionicons name="restaurant-outline" size={18} color={c.gray} />
            <TextInput
              style={[styles.nameInput, { color: c.black }]}
              value={foodName}
              onChangeText={handleFoodNameChange}
              onBlur={handleFoodNameBlur}
              placeholder="Ej: Pollo a la plancha, Manzana..."
              placeholderTextColor={c.disabled}
              autoCapitalize="sentences"
              returnKeyType="next"
              maxLength={100}
            />
          </View>
          {touched.foodName && !!foodNameError && (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={14} color="#E53935" />
              <Text style={styles.fieldError}>{foodNameError}</Text>
            </View>
          )}
          {showSuggestions && (
            <View style={[styles.suggestionsContainer, { backgroundColor: c.bg, borderColor: c.grayLight }]}>
              <FlatList
                data={suggestions.slice(0, 4)}
                keyExtractor={(item, index) => `${item.food_name}-${index}`}
                scrollEnabled={false}
                keyboardShouldPersistTaps="always"
                renderItem={({ item, index }) => (
                  <TouchableOpacity
                    style={[
                      styles.suggestionRow,
                      index < Math.min(suggestions.length, 4) - 1 && [styles.suggestionRowBorder, { borderBottomColor: c.grayLight }],
                    ]}
                    onPress={() => handleSelectSuggestion(item)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.suggestionLeft}>
                      <Text style={[styles.suggestionName, { color: c.black }]} numberOfLines={1}>{item.food_name}</Text>
                      <Text style={[styles.suggestionMacros, { color: c.gray }]}>
                        P {item.protein_g}g  C {item.carbs_g}g  G {item.fats_g}g
                      </Text>
                    </View>
                    <Text style={[styles.suggestionCalories, { color: c.black }]}>{Math.round(item.calories)} kcal</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}
        </View>

        {/* ── Calories (big & prominent) ─────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: c.gray }]}>Calorias</Text>
        <View style={[styles.caloriesWrapper, { backgroundColor: c.primary }]}>
          <TextInput
            style={styles.caloriesInput}
            value={calories}
            onChangeText={(v) => { setCalories(v); markTouched('calories'); }}
            onBlur={() => markTouched('calories')}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor="rgba(255,255,255,0.3)"
          />
          <Text style={styles.caloriesUnit}>kcal</Text>
        </View>
        {showAdjusted && (
          <View style={styles.adjustedRow}>
            <Ionicons name="resize-outline" size={14} color={c.accent} />
            <Text style={[styles.adjustedText, { color: c.accent }]}>
              Con porcion {PORTION_OPTIONS.find((o) => o.key === portionSize)?.label.toLowerCase()}: ~{adjustedCals} kcal
            </Text>
          </View>
        )}
        {touched.calories && !!caloriesError && (
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle" size={14} color="#E53935" />
            <Text style={styles.fieldError}>{caloriesError}</Text>
          </View>
        )}

        {/* ── Macros grid ────────────────────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: c.gray }]}>Macronutrientes</Text>
        <View style={styles.macroGrid}>
          <MacroInput
            label="Proteina"
            value={protein}
            onChange={(v) => { setProtein(v); markTouched('protein'); }}
            color={c.protein}
            colors={c}
            error={touched.protein ? proteinError : undefined}
          />
          <MacroInput
            label="Carbos"
            value={carbs}
            onChange={(v) => { setCarbs(v); markTouched('carbs'); }}
            color={c.carbs}
            colors={c}
            error={touched.carbs ? carbsError : undefined}
          />
          <MacroInput
            label="Grasas"
            value={fats}
            onChange={(v) => { setFats(v); markTouched('fats'); }}
            color={c.fats}
            colors={c}
            error={touched.fats ? fatsError : undefined}
          />
          <MacroInput
            label="Fibra"
            value={fiber}
            onChange={(v) => { setFiber(v); markTouched('fiber'); }}
            color={c.success}
            colors={c}
            error={touched.fiber ? fiberError : undefined}
          />
        </View>

        {/* ── Portion size selector ──────────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: c.gray }]}>Tamano de porcion</Text>
        <View style={styles.portionRow}>
          {PORTION_OPTIONS.map((opt) => {
            const isActive = portionSize === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.portionChip,
                  { backgroundColor: c.surface, borderColor: c.grayLight },
                  isActive && { backgroundColor: c.accent, borderColor: c.accent },
                ]}
                onPress={() => {
                  haptics.selection();
                  setPortionSize(opt.key);
                  if (opt.key !== 'custom') setCustomGrams('');
                }}
                activeOpacity={0.7}
                accessibilityLabel={`Porcion ${opt.label}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: isActive }}
              >
                <Ionicons
                  name={opt.icon as any}
                  size={16}
                  color={isActive ? c.white : c.gray}
                />
                <Text style={[
                  styles.portionChipLabel,
                  { color: c.gray },
                  isActive && { color: c.white },
                ]}>
                  {opt.label}
                </Text>
                <Text style={[
                  styles.portionChipDesc,
                  { color: c.gray + '80' },
                  isActive && { color: 'rgba(255,255,255,0.7)' },
                ]}>
                  {opt.description}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Custom grams input */}
        {portionSize === 'custom' && (
          <View style={styles.customGramsRow}>
            <View style={[
              styles.customGramsInput,
              { backgroundColor: c.surface, borderColor: c.grayLight },
              touched.customGrams && !!customGramsError && styles.inputError,
            ]}>
              <Ionicons name="scale-outline" size={18} color={c.gray} />
              <TextInput
                style={[styles.nameInput, { color: c.black }]}
                value={customGrams}
                onChangeText={(v) => { setCustomGrams(v); markTouched('customGrams'); }}
                onBlur={() => markTouched('customGrams')}
                placeholder="Ej: 150"
                placeholderTextColor={c.disabled}
                keyboardType="number-pad"
                maxLength={5}
              />
              <Text style={[styles.gramsUnit, { color: c.gray }]}>gramos</Text>
            </View>
            {touched.customGrams && !!customGramsError && (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle" size={14} color="#E53935" />
                <Text style={styles.fieldError}>{customGramsError}</Text>
              </View>
            )}
          </View>
        )}

        {/* ── Save as favorite toggle ────────────────────────────────────────── */}
        <View style={[styles.favoriteRow, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
          <View style={styles.favoriteLeft}>
            <Ionicons
              name={saveAsFavorite ? 'heart' : 'heart-outline'}
              size={20}
              color={saveAsFavorite ? '#EF4444' : c.gray}
            />
            <View>
              <Text style={[styles.favoriteLabel, { color: c.black }]}>Guardar como favorito</Text>
              <Text style={[styles.favoriteHint, { color: c.gray }]}>
                Registralo rapidamente la proxima vez
              </Text>
            </View>
          </View>
          <Switch
            value={saveAsFavorite}
            onValueChange={(v) => {
              haptics.selection();
              setSaveAsFavorite(v);
            }}
            trackColor={{ false: c.grayLight, true: c.accent + '60' }}
            thumbColor={saveAsFavorite ? c.accent : c.disabled}
          />
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { ...typography.titleSm },
  saveBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.full,
  },
  saveBtnText: { ...typography.label },
  scroll: { paddingTop: spacing.md },
  sectionLabel: {
    ...typography.label,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  mealRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  mealChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    borderRadius: radius.full,
    borderWidth: 1.5,
  },
  mealChipText: { ...typography.caption, fontWeight: '600' },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 52,
  },
  inputError: {
    borderWidth: 1.5,
    borderColor: '#E53935',
  },
  nameInput: { flex: 1, ...typography.option },
  caloriesWrapper: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
  },
  caloriesInput: {
    fontSize: 48,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -2,
    minWidth: 80,
    textAlign: 'center',
  },
  caloriesUnit: { fontSize: 20, fontWeight: '600', color: 'rgba(255,255,255,0.6)' },
  adjustedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
    paddingLeft: spacing.xs,
  },
  adjustedText: {
    ...typography.caption,
    fontWeight: '600',
  },
  macroGrid: { flexDirection: 'row', gap: spacing.sm },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
    paddingLeft: spacing.xs,
  },
  fieldError: { color: '#E53935', fontSize: 12 },
  portionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  portionChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1.5,
    gap: 2,
  },
  portionChipLabel: {
    ...typography.caption,
    fontWeight: '700',
    marginTop: 2,
  },
  portionChipDesc: {
    fontSize: 10,
    fontWeight: '500',
  },
  customGramsRow: {
    marginTop: spacing.sm,
  },
  customGramsInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    height: 48,
  },
  gramsUnit: {
    ...typography.caption,
    fontWeight: '600',
  },
  favoriteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  favoriteLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  favoriteLabel: {
    ...typography.bodyMd,
    fontWeight: '600',
  },
  favoriteHint: {
    ...typography.caption,
    marginTop: 1,
  },
  suggestionsContainer: {
    borderWidth: 1,
    borderRadius: radius.md,
    marginTop: spacing.xs,
    overflow: 'hidden',
    ...shadows.md,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  suggestionRowBorder: {
    borderBottomWidth: 1,
  },
  suggestionLeft: {
    flex: 1,
    marginRight: spacing.sm,
  },
  suggestionName: {
    ...typography.bodyMd,
    fontWeight: '600',
  },
  suggestionMacros: {
    ...typography.caption,
    marginTop: 2,
  },
  suggestionCalories: {
    ...typography.label,
    flexShrink: 0,
  },
});
