/**
 * EditFoodScreen — Editar un registro de comida existente
 * Permite corregir macros detectados por IA o cambiar el tipo de comida.
 */
import React, { useState } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, typography, spacing, radius, useLayout, mealColors } from '../../theme';
import * as foodService from '../../services/food.service';
import { AIFoodLog } from '../../types';
import { MealType } from '../../services/food.service';
import { haptics } from '../../hooks/useHaptics';

const MEAL_OPTIONS = (Object.entries(mealColors) as [MealType, typeof mealColors[string]][]).map(
  ([key, v]) => ({ key, ...v })
);

function MacroInput({
  label, value, onChange, unit = 'g', color, colors,
}: {
  label: string; value: string; onChange: (v: string) => void; unit?: string; color: string;
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
    flexDirection: 'row', alignItems: 'center',
    borderRadius: radius.sm,
    borderWidth: 1.5, paddingHorizontal: spacing.sm, paddingVertical: 6,
    width: '100%', justifyContent: 'center',
  },
  input: { ...typography.label, minWidth: 30, textAlign: 'center' },
  unit: { ...typography.caption, marginLeft: 2 },
});

// Default food log for safety if route params are missing
const DEFAULT_LOG: AIFoodLog = {
  id: 0, logged_at: new Date().toISOString(), meal_type: 'lunch',
  food_name: '', calories: 0, carbs_g: 0, protein_g: 0, fats_g: 0,
  fiber_g: null, sugar_g: null, sodium_mg: null, serving_size: null,
  image_url: null, ai_confidence: null, was_edited: false,
};

export default function EditFoodScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { sidePadding } = useLayout();
  const c = useThemeColors();
  const log: AIFoodLog = route.params?.log ?? DEFAULT_LOG;

  const [mealType, setMealType] = useState<MealType>(log.meal_type as MealType);
  const [foodName, setFoodName] = useState(log.food_name);
  const [calories, setCalories] = useState(String(Math.round(log.calories)));
  const [protein, setProtein] = useState(String(Math.round(log.protein_g)));
  const [carbs, setCarbs] = useState(String(Math.round(log.carbs_g)));
  const [fats, setFats] = useState(String(Math.round(log.fats_g)));
  const [loading, setLoading] = useState(false);

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
    try {
      await foodService.editFoodLog(log.id, {
        food_name: foodName.trim(),
        calories: parse(calories),
        protein_g: parse(protein),
        carbs_g: parse(carbs),
        fats_g: parse(fats),
        meal_type: mealType,
      });
      haptics.success();
      navigation.goBack();
    } catch {
      haptics.error();
      Alert.alert('Error', 'No se pudo guardar el cambio. Inténtalo de nuevo.');
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
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm, paddingHorizontal: sidePadding, backgroundColor: c.bg, borderBottomColor: c.grayLight }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: c.surface }]}>
          <Ionicons name="close" size={20} color={c.black} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.black }]}>Editar alimento</Text>
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
        {/* Tipo de comida */}
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

        {/* Nombre */}
        <Text style={[styles.sectionLabel, { color: c.gray }]}>Nombre del alimento</Text>
        <View style={[styles.inputWrapper, { backgroundColor: c.surface }]}>
          <Ionicons name="restaurant-outline" size={18} color={c.gray} />
          <TextInput
            style={[styles.nameInput, { color: c.black }]}
            value={foodName}
            onChangeText={setFoodName}
            placeholder="Ej: Pollo a la plancha"
            placeholderTextColor={c.disabled}
            autoCapitalize="sentences"
          />
        </View>

        {/* Calorías */}
        <Text style={[styles.sectionLabel, { color: c.gray }]}>Calorías</Text>
        <View style={[styles.caloriesWrapper, { backgroundColor: c.primary }]}>
          <TextInput
            style={styles.caloriesInput}
            value={calories}
            onChangeText={setCalories}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor="rgba(255,255,255,0.4)"
          />
          <Text style={styles.caloriesUnit}>kcal</Text>
        </View>

        {/* Macros */}
        <Text style={[styles.sectionLabel, { color: c.gray }]}>Macronutrientes</Text>
        <View style={styles.macroGrid}>
          <MacroInput label="Proteína" value={protein} onChange={setProtein} color={c.protein} colors={c} />
          <MacroInput label="Carbos"   value={carbs}   onChange={setCarbs}   color={c.carbs} colors={c} />
          <MacroInput label="Grasas"   value={fats}    onChange={setFats}    color={c.fats} colors={c} />
        </View>

        {/* Info: era scan de IA */}
        {log.ai_confidence != null && log.ai_confidence < 1 && (
          <View style={styles.aiNote}>
            <Ionicons name="sparkles-outline" size={14} color={c.gray} />
            <Text style={[styles.aiNoteText, { color: c.gray }]}>
              Detectado por IA con {Math.round(log.ai_confidence * 100)}% de confianza
            </Text>
          </View>
        )}

        {/* Delete button with confirmation */}
        {log.id > 0 && (
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => {
              haptics.heavy();
              Alert.alert(
                'Eliminar registro',
                `¿Eliminar "${log.food_name}"? Esta accion no se puede deshacer.`,
                [
                  { text: 'Cancelar', style: 'cancel' },
                  {
                    text: 'Eliminar',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        await foodService.deleteFoodLog(log.id);
                        haptics.success();
                        navigation.goBack();
                      } catch {
                        haptics.error();
                        Alert.alert('Error', 'No se pudo eliminar el registro.');
                      }
                    },
                  },
                ],
              );
            }}
            activeOpacity={0.7}
            accessibilityLabel="Eliminar este registro de comida"
            accessibilityRole="button"
          >
            <Ionicons name="trash-outline" size={16} color={c.protein} />
            <Text style={[styles.deleteBtnText, { color: c.protein }]}>Eliminar registro</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { ...typography.titleSm },
  saveBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8, borderRadius: radius.full,
  },
  saveBtnText: { ...typography.label },
  scroll: { paddingTop: spacing.md },
  sectionLabel: {
    ...typography.label, textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: spacing.sm, marginTop: spacing.md,
  },
  mealRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  mealChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: spacing.sm, paddingVertical: 7, borderRadius: radius.full,
    borderWidth: 1.5,
  },
  mealChipText: { ...typography.caption, fontWeight: '600' },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md, height: 52,
  },
  nameInput: { flex: 1, ...typography.option },
  caloriesWrapper: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center',
    gap: spacing.sm, borderRadius: radius.lg,
    paddingVertical: spacing.lg,
  },
  caloriesInput: {
    fontSize: 48, fontWeight: '900', color: '#FFFFFF',
    letterSpacing: -2, minWidth: 80, textAlign: 'center',
  },
  caloriesUnit: { fontSize: 20, fontWeight: '600', color: 'rgba(255,255,255,0.6)' },
  macroGrid: { flexDirection: 'row', gap: spacing.sm },
  aiNote: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    marginTop: spacing.lg, justifyContent: 'center',
  },
  aiNoteText: { ...typography.caption },
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, marginTop: spacing.xl,
    paddingVertical: spacing.md, borderRadius: radius.full,
    backgroundColor: '#FEE2E2', minHeight: 48,
  },
  deleteBtnText: { ...typography.label },
});
