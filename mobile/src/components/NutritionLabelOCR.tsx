/**
 * NutritionLabelOCR -- Manual nutrition label entry (OCR placeholder).
 *
 * Sprint 12 Features:
 * - Placeholder UI for future OCR-based label scanning
 * - Manual input of nutrition facts: calories, protein, carbs, fat, fiber, sodium, sugar
 * - Configurable serving size and unit
 * - Real-time per-serving and per-100g display
 * - "Add to Log" button that calls manualLogFood
 * - Input validation: no negative values, reasonable ranges
 * - Meal type selector
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius, shadows } from '../theme';
import { haptics } from '../hooks/useHaptics';
import * as foodService from '../services/food.service';
import { useAnalytics } from '../hooks/useAnalytics';

// -- Types --

interface NutritionValues {
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  fiber: string;
  sodium: string;
  sugar: string;
}

interface FieldConfig {
  key: keyof NutritionValues;
  label: string;
  unit: string;
  icon: string;
  color: string;
  maxValue: number;
}

// -- Constants --

const FIELDS: FieldConfig[] = [
  { key: 'calories', label: 'Calorias',  unit: 'kcal', icon: 'flame-outline',     color: '#4285F4', maxValue: 5000 },
  { key: 'protein',  label: 'Proteina',  unit: 'g',    icon: 'fitness-outline',    color: '#EA4335', maxValue: 500 },
  { key: 'carbs',    label: 'Carbohidratos', unit: 'g', icon: 'grid-outline',      color: '#FBBC04', maxValue: 500 },
  { key: 'fat',      label: 'Grasas',    unit: 'g',    icon: 'water-outline',      color: '#4285F4', maxValue: 500 },
  { key: 'fiber',    label: 'Fibra',     unit: 'g',    icon: 'leaf-outline',       color: '#34A853', maxValue: 100 },
  { key: 'sodium',   label: 'Sodio',     unit: 'mg',   icon: 'flash-outline',      color: '#FF6D00', maxValue: 10000 },
  { key: 'sugar',    label: 'Azucar',    unit: 'g',    icon: 'cube-outline',       color: '#E040FB', maxValue: 300 },
];

const MEAL_TYPES: { value: foodService.MealType; label: string; icon: string; color: string }[] = [
  { value: 'breakfast', label: 'Desayuno', icon: 'sunny-outline',      color: '#F59E0B' },
  { value: 'lunch',     label: 'Almuerzo', icon: 'restaurant-outline', color: '#10B981' },
  { value: 'dinner',    label: 'Cena',     icon: 'moon-outline',       color: '#6366F1' },
  { value: 'snack',     label: 'Snack',    icon: 'cafe-outline',       color: '#EC4899' },
];

const EMPTY_VALUES: NutritionValues = {
  calories: '',
  protein: '',
  carbs: '',
  fat: '',
  fiber: '',
  sodium: '',
  sugar: '',
};

// -- Props --

export interface NutritionLabelOCRProps {
  /** Called after food is successfully logged. */
  onLogged?: () => void;
  /** Called when user wants to close / go back. */
  onClose?: () => void;
}

// -- Component --

function NutritionLabelOCRInner({ onLogged, onClose }: NutritionLabelOCRProps) {
  const c = useThemeColors();
  const { track } = useAnalytics('NutritionLabel');
  const [values, setValues] = useState<NutritionValues>(EMPTY_VALUES);
  const [foodName, setFoodName] = useState('');
  const [servingSize, setServingSize] = useState('100');
  const [servingUnit, setServingUnit] = useState('g');
  const [servings, setServings] = useState('1');
  const [mealType, setMealType] = useState<foodService.MealType>('lunch');
  const [logging, setLogging] = useState(false);

  // -- Parse numeric values --
  const parsed = useMemo(() => {
    const p: Record<keyof NutritionValues, number> = {} as any;
    for (const f of FIELDS) {
      const v = parseFloat(values[f.key]);
      p[f.key] = isNaN(v) || v < 0 ? 0 : Math.min(v, f.maxValue);
    }
    return p;
  }, [values]);

  const numServings = useMemo(() => {
    const n = parseFloat(servings);
    return isNaN(n) || n <= 0 ? 1 : n;
  }, [servings]);

  // -- Total values (per-serving * servings) --
  const totals = useMemo(() => ({
    calories: Math.round(parsed.calories * numServings),
    protein: Math.round(parsed.protein * numServings * 10) / 10,
    carbs: Math.round(parsed.carbs * numServings * 10) / 10,
    fat: Math.round(parsed.fat * numServings * 10) / 10,
    fiber: Math.round(parsed.fiber * numServings * 10) / 10,
    sodium: Math.round(parsed.sodium * numServings),
    sugar: Math.round(parsed.sugar * numServings * 10) / 10,
  }), [parsed, numServings]);

  // -- Update field value --
  const updateField = useCallback((key: keyof NutritionValues, text: string) => {
    // Only allow digits, one decimal point
    const cleaned = text.replace(/[^0-9.]/g, '');
    // Prevent multiple decimal points
    const parts = cleaned.split('.');
    const value = parts.length > 2
      ? parts[0] + '.' + parts.slice(1).join('')
      : cleaned;
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  // -- Validate --
  const isValid = useMemo(() => {
    return (
      foodName.trim().length > 0 &&
      parsed.calories > 0
    );
  }, [foodName, parsed.calories]);

  // -- Log food --
  const handleLog = useCallback(async () => {
    if (!isValid) {
      Alert.alert('Datos incompletos', 'Ingresa al menos el nombre del alimento y las calorias.');
      return;
    }

    setLogging(true);
    haptics.medium();
    try {
      const sizePart = servingSize ? `${servingSize}${servingUnit}` : '';
      const portionPart = numServings !== 1 ? ` x${numServings}` : '';
      const displayName = `${foodName.trim()}${sizePart ? ` (${sizePart}${portionPart})` : ''}`;

      await foodService.manualLogFood({
        food_name: displayName,
        calories: totals.calories,
        protein_g: totals.protein,
        carbs_g: totals.carbs,
        fats_g: totals.fat,
        fiber_g: totals.fiber,
        serving_size: sizePart || undefined,
        meal_type: mealType,
      });

      haptics.success();
      track('nutrition_label_logged', {
        food_name: foodName.trim(),
        calories: totals.calories,
        meal_type: mealType,
      });

      Alert.alert(
        'Registrado',
        `"${foodName.trim()}" se agrego a tu registro del dia.`,
        [
          {
            text: 'OK',
            onPress: () => {
              setValues(EMPTY_VALUES);
              setFoodName('');
              setServingSize('100');
              setServings('1');
              onLogged?.();
            },
          },
        ],
      );
    } catch {
      haptics.error();
      Alert.alert('Error', 'No se pudo registrar el alimento. Intenta de nuevo.');
    } finally {
      setLogging(false);
    }
  }, [isValid, foodName, servingSize, servingUnit, numServings, totals, mealType, track, onLogged]);

  // -- Clear all --
  const handleClear = useCallback(() => {
    haptics.light();
    setValues(EMPTY_VALUES);
    setFoodName('');
    setServingSize('100');
    setServings('1');
  }, []);

  return (
    <KeyboardAvoidingView
      style={[s.container, { backgroundColor: c.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          {onClose && (
            <TouchableOpacity
              onPress={onClose}
              style={[s.backBtn, { backgroundColor: c.surface }]}
              accessibilityLabel="Cerrar"
              accessibilityRole="button"
            >
              <Ionicons name="chevron-back" size={20} color={c.black} />
            </TouchableOpacity>
          )}
          <View>
            <Text style={[s.title, { color: c.black }]}>Etiqueta Nutricional</Text>
            <Text style={[s.subtitle, { color: c.gray }]}>Ingreso manual de valores</Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={handleClear}
          style={[s.clearBtn, { backgroundColor: c.surface }]}
          accessibilityLabel="Limpiar formulario"
          accessibilityRole="button"
        >
          <Ionicons name="trash-outline" size={16} color={c.gray} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* OCR Placeholder banner */}
        <View style={[s.ocrBanner, { backgroundColor: c.surfaceAlt, borderColor: c.grayLight }]}>
          <Ionicons name="camera-outline" size={24} color={c.accent} />
          <View style={s.ocrBannerText}>
            <Text style={[s.ocrTitle, { color: c.black }]}>Escaneo OCR - Proximamente</Text>
            <Text style={[s.ocrHint, { color: c.gray }]}>
              Pronto podras escanear etiquetas nutricionales con la camara. Por ahora, ingresa los valores manualmente.
            </Text>
          </View>
        </View>

        {/* Food name */}
        <Text style={[s.sectionLabel, { color: c.gray }]}>Nombre del alimento</Text>
        <TextInput
          style={[s.nameInput, { color: c.black, backgroundColor: c.surface, borderColor: c.grayLight }]}
          placeholder="Ej: Yogurt griego, Barra de cereal..."
          placeholderTextColor={c.gray}
          value={foodName}
          onChangeText={setFoodName}
          accessibilityLabel="Nombre del alimento"
        />

        {/* Serving info */}
        <Text style={[s.sectionLabel, { color: c.gray }]}>Porcion</Text>
        <View style={s.servingRow}>
          <View style={s.servingField}>
            <TextInput
              style={[s.servingInput, { color: c.black, backgroundColor: c.surface, borderColor: c.grayLight }]}
              placeholder="100"
              placeholderTextColor={c.gray}
              keyboardType="numeric"
              value={servingSize}
              onChangeText={setServingSize}
              accessibilityLabel="Tamaño de porcion"
            />
            <Text style={[s.servingFieldLabel, { color: c.gray }]}>tamaño</Text>
          </View>
          <View style={s.unitPicker}>
            {['g', 'ml', 'oz', 'cup'].map((u) => {
              const isSelected = servingUnit === u;
              return (
                <TouchableOpacity
                  key={u}
                  style={[
                    s.unitChip,
                    { borderColor: isSelected ? c.accent : c.grayLight },
                    isSelected && { backgroundColor: c.accent + '15' },
                  ]}
                  onPress={() => {
                    haptics.selection();
                    setServingUnit(u);
                  }}
                  accessibilityLabel={`Unidad ${u}`}
                  accessibilityState={{ selected: isSelected }}
                >
                  <Text style={[s.unitText, { color: isSelected ? c.accent : c.gray }]}>{u}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={s.servingField}>
            <TextInput
              style={[s.servingInput, { color: c.black, backgroundColor: c.surface, borderColor: c.grayLight }]}
              placeholder="1"
              placeholderTextColor={c.gray}
              keyboardType="numeric"
              value={servings}
              onChangeText={setServings}
              accessibilityLabel="Numero de porciones"
            />
            <Text style={[s.servingFieldLabel, { color: c.gray }]}>porciones</Text>
          </View>
        </View>

        {/* Nutrition fields */}
        <Text style={[s.sectionLabel, { color: c.gray }]}>Informacion nutricional (por porcion)</Text>
        <View style={[s.fieldsCard, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
          {FIELDS.map((field, idx) => (
            <View
              key={field.key}
              style={[
                s.fieldRow,
                idx < FIELDS.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.grayLight },
              ]}
            >
              <View style={s.fieldLeft}>
                <View style={[s.fieldIcon, { backgroundColor: field.color + '15' }]}>
                  <Ionicons name={field.icon as any} size={14} color={field.color} />
                </View>
                <Text style={[s.fieldLabel, { color: c.black }]}>{field.label}</Text>
              </View>
              <View style={s.fieldRight}>
                <TextInput
                  style={[s.fieldInput, { color: c.black, borderColor: c.grayLight }]}
                  placeholder="0"
                  placeholderTextColor={c.gray}
                  keyboardType="decimal-pad"
                  value={values[field.key]}
                  onChangeText={(t) => updateField(field.key, t)}
                  accessibilityLabel={`${field.label} en ${field.unit}`}
                />
                <Text style={[s.fieldUnit, { color: c.gray }]}>{field.unit}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Totals summary */}
        {parsed.calories > 0 && (
          <View style={[s.totalsCard, { backgroundColor: c.surfaceAlt, borderColor: c.grayLight }]}>
            <Text style={[s.totalsTitle, { color: c.black }]}>
              Total ({numServings > 1 ? `${numServings} porciones` : '1 porcion'})
            </Text>
            <View style={s.totalsRow}>
              <View style={s.totalItem}>
                <Text style={[s.totalValue, { color: c.accent }]}>{totals.calories}</Text>
                <Text style={[s.totalLabel, { color: c.gray }]}>kcal</Text>
              </View>
              <View style={[s.totalDivider, { backgroundColor: c.grayLight }]} />
              <View style={s.totalItem}>
                <Text style={[s.totalValue, { color: '#EA4335' }]}>{totals.protein}g</Text>
                <Text style={[s.totalLabel, { color: c.gray }]}>Prot</Text>
              </View>
              <View style={[s.totalDivider, { backgroundColor: c.grayLight }]} />
              <View style={s.totalItem}>
                <Text style={[s.totalValue, { color: '#FBBC04' }]}>{totals.carbs}g</Text>
                <Text style={[s.totalLabel, { color: c.gray }]}>Carb</Text>
              </View>
              <View style={[s.totalDivider, { backgroundColor: c.grayLight }]} />
              <View style={s.totalItem}>
                <Text style={[s.totalValue, { color: '#4285F4' }]}>{totals.fat}g</Text>
                <Text style={[s.totalLabel, { color: c.gray }]}>Gras</Text>
              </View>
            </View>
          </View>
        )}

        {/* Meal type selector */}
        <Text style={[s.sectionLabel, { color: c.gray }]}>Tipo de comida</Text>
        <View style={s.mealTypeRow}>
          {MEAL_TYPES.map((mt) => {
            const isSelected = mealType === mt.value;
            return (
              <TouchableOpacity
                key={mt.value}
                style={[
                  s.mealChip,
                  {
                    backgroundColor: isSelected ? mt.color : c.surface,
                    borderColor: isSelected ? mt.color : c.grayLight,
                  },
                ]}
                onPress={() => {
                  haptics.selection();
                  setMealType(mt.value);
                }}
                accessibilityLabel={mt.label}
                accessibilityState={{ selected: isSelected }}
              >
                <Ionicons
                  name={mt.icon as any}
                  size={14}
                  color={isSelected ? '#FFF' : mt.color}
                />
                <Text
                  style={[
                    s.mealChipText,
                    { color: isSelected ? '#FFF' : c.black },
                  ]}
                >
                  {mt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom log button */}
      <View style={[s.bottomBar, { backgroundColor: c.bg, borderTopColor: c.border }]}>
        <TouchableOpacity
          style={[
            s.logBtn,
            { backgroundColor: c.accent },
            (!isValid || logging) && { opacity: 0.5 },
          ]}
          onPress={handleLog}
          disabled={!isValid || logging}
          activeOpacity={0.85}
          accessibilityLabel={`Registrar ${foodName || 'alimento'} con ${totals.calories} calorias`}
          accessibilityRole="button"
        >
          {logging ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <>
              <Ionicons name="add-circle-outline" size={20} color="#FFF" />
              <Text style={s.logBtnText}>
                Agregar al Log{totals.calories > 0 ? ` -- ${totals.calories} kcal` : ''}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

export default React.memo(NutritionLabelOCRInner);

// -- Styles --

const s = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.titleSm,
  },
  subtitle: {
    ...typography.caption,
    marginTop: 1,
  },
  clearBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
  },

  // OCR banner
  ocrBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  ocrBannerText: {
    flex: 1,
  },
  ocrTitle: {
    ...typography.label,
    marginBottom: 2,
  },
  ocrHint: {
    ...typography.caption,
    lineHeight: 18,
  },

  // Section labels
  sectionLabel: {
    ...typography.label,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },

  // Food name
  nameInput: {
    ...typography.body,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.lg,
  },

  // Serving
  servingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  servingField: {
    alignItems: 'center',
    gap: 4,
  },
  servingInput: {
    ...typography.body,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    width: 70,
    textAlign: 'center',
  },
  servingFieldLabel: {
    ...typography.caption,
    fontSize: 10,
  },
  unitPicker: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'center',
    paddingTop: 2,
  },
  unitChip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  unitText: {
    ...typography.caption,
    fontWeight: '700',
  },

  // Fields card
  fieldsCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  fieldLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  fieldIcon: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldLabel: {
    ...typography.bodyMd,
  },
  fieldRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  fieldInput: {
    ...typography.body,
    fontWeight: '700',
    borderBottomWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    width: 80,
    textAlign: 'right',
  },
  fieldUnit: {
    ...typography.caption,
    width: 30,
  },

  // Totals
  totalsCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  totalsTitle: {
    ...typography.label,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  totalItem: {
    alignItems: 'center',
    gap: 2,
  },
  totalValue: {
    ...typography.label,
    fontSize: 16,
    fontWeight: '800',
  },
  totalLabel: {
    ...typography.caption,
    fontSize: 10,
  },
  totalDivider: {
    width: 1,
    height: 28,
  },

  // Meal type
  mealTypeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  mealChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  mealChipText: {
    ...typography.caption,
    fontWeight: '700',
    fontSize: 11,
  },

  // Bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  logBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.full,
    height: 56,
  },
  logBtnText: {
    ...typography.button,
    color: '#FFF',
  },
});
