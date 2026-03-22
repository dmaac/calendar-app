/**
 * AddFoodScreen — Registro manual de alimentos
 * El usuario escribe nombre + macros sin necesitar foto.
 */
import React, { useState, useRef } from 'react';
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
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, typography, spacing, radius, useLayout, mealColors, shadows } from '../../theme';
import * as foodService from '../../services/food.service';
import { MealType, FoodSuggestion, searchFoodHistory } from '../../services/food.service';
import { haptics } from '../../hooks/useHaptics';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { enqueueAction } from '../../services/offlineStore';
import { showNotification } from '../../components/InAppNotification';

const MEAL_OPTIONS = (Object.entries(mealColors) as [MealType, typeof mealColors[string]][]).map(
  ([key, v]) => ({ key, ...v })
);

function MacroInput({
  label,
  value,
  onChange,
  unit = 'g',
  color,
  colors,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  unit?: string;
  color: string;
  colors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View style={macroStyles.wrapper}>
      <Text style={[macroStyles.label, { color }]}>{label}</Text>
      <View style={[macroStyles.inputRow, { borderColor: color + '40', backgroundColor: colors.surface }]}>
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
});

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
  const [serving, setServing] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<FoodSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    // Delay hide so tap on suggestion registers first
    setTimeout(() => setShowSuggestions(false), 150);
  };

  const parse = (v: string) => parseFloat(v.replace(',', '.')) || 0;

  const handleSave = async () => {
    if (!foodName.trim()) {
      haptics.error();
      Alert.alert('Error', 'Ingresa el nombre del alimento');
      return;
    }
    if (!calories || parse(calories) <= 0) {
      haptics.error();
      Alert.alert('Error', 'Ingresa las calorías');
      return;
    }

    haptics.light();
    setLoading(true);

    const payload = {
      food_name: foodName.trim(),
      calories: parse(calories),
      protein_g: parse(protein),
      carbs_g: parse(carbs),
      fats_g: parse(fats),
      fiber_g: fiber ? parse(fiber) : undefined,
      serving_size: serving.trim() || undefined,
      meal_type: mealType,
    };

    try {
      if (isConnected) {
        await foodService.manualLogFood(payload);
      } else {
        // Offline — queue for later sync
        await enqueueAction('log_food', payload);
      }
      haptics.success();
      showNotification({
        message: 'Comida registrada!',
        type: 'success',
        icon: 'checkmark-circle',
      });
      navigation.goBack();
    } catch {
      // Network failed despite thinking we were online — queue it
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
        Alert.alert('Error', 'No se pudo guardar el registro. Inténtalo de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  };

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
        <Text style={[styles.headerTitle, { color: c.black }]}>Añadir alimento</Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={loading}
          style={[styles.saveBtn, { backgroundColor: c.black }, loading && { opacity: 0.5 }]}
        >
          <Text style={[styles.saveBtnText, { color: c.white }]}>{loading ? 'Guardando...' : 'Guardar'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingHorizontal: sidePadding }]}
      >
        {/* Meal type selector */}
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

        {/* Food name */}
        <Text style={[styles.sectionLabel, { color: c.gray }]}>Nombre del alimento</Text>
        <View>
          <View style={[styles.inputWrapper, { backgroundColor: c.surface }]}>
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
            />
          </View>
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
                        P {item.protein_g}g · C {item.carbs_g}g · G {item.fats_g}g
                      </Text>
                    </View>
                    <Text style={[styles.suggestionCalories, { color: c.black }]}>{Math.round(item.calories)} kcal</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}
        </View>

        {/* Calories — big & prominent */}
        <Text style={[styles.sectionLabel, { color: c.gray }]}>Calorías</Text>
        <View style={[styles.caloriesWrapper, { backgroundColor: c.primary }]}>
          <TextInput
            style={styles.caloriesInput}
            value={calories}
            onChangeText={setCalories}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={c.disabled}
          />
          <Text style={styles.caloriesUnit}>kcal</Text>
        </View>

        {/* Macros grid */}
        <Text style={[styles.sectionLabel, { color: c.gray }]}>Macronutrientes</Text>
        <View style={styles.macroGrid}>
          <MacroInput label="Proteína" value={protein} onChange={setProtein} color={c.protein} colors={c} />
          <MacroInput label="Carbos"   value={carbs}   onChange={setCarbs}   color={c.carbs} colors={c} />
          <MacroInput label="Grasas"   value={fats}    onChange={setFats}    color={c.fats} colors={c} />
          <MacroInput label="Fibra"    value={fiber}   onChange={setFiber}   color={c.success} colors={c} />
        </View>

        {/* Optional serving size */}
        <Text style={[styles.sectionLabel, { color: c.gray }]}>Porción (opcional)</Text>
        <View style={[styles.inputWrapper, { backgroundColor: c.surface }]}>
          <Ionicons name="scale-outline" size={18} color={c.gray} />
          <TextInput
            style={[styles.nameInput, { color: c.black }]}
            value={serving}
            onChangeText={setServing}
            placeholder="Ej: 100g, 1 taza, 1 pieza"
            placeholderTextColor={c.disabled}
          />
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

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
  macroGrid: { flexDirection: 'row', gap: spacing.sm },
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
