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
import { colors, typography, spacing, radius, useLayout, mealColors } from '../../theme';
import * as foodService from '../../services/food.service';
import { AIFoodLog } from '../../types';
import { MealType } from '../../services/food.service';

const MEAL_OPTIONS = (Object.entries(mealColors) as [MealType, typeof mealColors[string]][]).map(
  ([key, v]) => ({ key, ...v })
);

function MacroInput({
  label, value, onChange, unit = 'g', color,
}: {
  label: string; value: string; onChange: (v: string) => void; unit?: string; color: string;
}) {
  return (
    <View style={macroStyles.wrapper}>
      <Text style={[macroStyles.label, { color }]}>{label}</Text>
      <View style={[macroStyles.inputRow, { borderColor: color + '40' }]}>
        <TextInput
          style={macroStyles.input}
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={colors.disabled}
        />
        <Text style={macroStyles.unit}>{unit}</Text>
      </View>
    </View>
  );
}

const macroStyles = StyleSheet.create({
  wrapper: { flex: 1, alignItems: 'center', gap: 4 },
  label: { ...typography.caption, fontWeight: '700' },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radius.sm,
    borderWidth: 1.5, paddingHorizontal: spacing.sm, paddingVertical: 6,
    width: '100%', justifyContent: 'center',
  },
  input: { ...typography.label, color: colors.black, minWidth: 30, textAlign: 'center' },
  unit: { ...typography.caption, color: colors.gray, marginLeft: 2 },
});

export default function EditFoodScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { sidePadding } = useLayout();
  const log: AIFoodLog = route.params.log;

  const [mealType, setMealType] = useState<MealType>(log.meal_type);
  const [foodName, setFoodName] = useState(log.food_name);
  const [calories, setCalories] = useState(String(Math.round(log.calories)));
  const [protein, setProtein] = useState(String(Math.round(log.protein_g)));
  const [carbs, setCarbs] = useState(String(Math.round(log.carbs_g)));
  const [fats, setFats] = useState(String(Math.round(log.fats_g)));
  const [loading, setLoading] = useState(false);

  const parse = (v: string) => parseFloat(v.replace(',', '.')) || 0;

  const handleSave = async () => {
    if (!foodName.trim()) {
      Alert.alert('Error', 'Ingresa el nombre del alimento');
      return;
    }
    if (!calories || parse(calories) <= 0) {
      Alert.alert('Error', 'Ingresa las calorías');
      return;
    }
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
      navigation.goBack();
    } catch {
      Alert.alert('Error', 'No se pudo guardar el cambio. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm, paddingHorizontal: sidePadding }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="close" size={20} color={colors.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Editar alimento</Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={loading}
          style={[styles.saveBtn, loading && { opacity: 0.5 }]}
        >
          <Text style={styles.saveBtnText}>{loading ? 'Guardando...' : 'Guardar'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingHorizontal: sidePadding }]}
      >
        {/* Tipo de comida */}
        <Text style={styles.sectionLabel}>Comida</Text>
        <View style={styles.mealRow}>
          {MEAL_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={[
                styles.mealChip,
                mealType === opt.key && { backgroundColor: opt.color, borderColor: opt.color },
              ]}
              onPress={() => setMealType(opt.key)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={opt.icon as any}
                size={14}
                color={mealType === opt.key ? colors.white : colors.gray}
              />
              <Text style={[
                styles.mealChipText,
                mealType === opt.key && { color: colors.white },
              ]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Nombre */}
        <Text style={styles.sectionLabel}>Nombre del alimento</Text>
        <View style={styles.inputWrapper}>
          <Ionicons name="restaurant-outline" size={18} color={colors.gray} />
          <TextInput
            style={styles.nameInput}
            value={foodName}
            onChangeText={setFoodName}
            placeholder="Ej: Pollo a la plancha"
            placeholderTextColor={colors.disabled}
            autoCapitalize="sentences"
          />
        </View>

        {/* Calorías */}
        <Text style={styles.sectionLabel}>Calorías</Text>
        <View style={styles.caloriesWrapper}>
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
        <Text style={styles.sectionLabel}>Macronutrientes</Text>
        <View style={styles.macroGrid}>
          <MacroInput label="Proteína" value={protein} onChange={setProtein} color={colors.protein} />
          <MacroInput label="Carbos"   value={carbs}   onChange={setCarbs}   color={colors.carbs} />
          <MacroInput label="Grasas"   value={fats}    onChange={setFats}    color={colors.fats} />
        </View>

        {/* Info: era scan de IA */}
        {log.ai_confidence != null && log.ai_confidence < 1 && (
          <View style={styles.aiNote}>
            <Ionicons name="sparkles-outline" size={14} color={colors.gray} />
            <Text style={styles.aiNoteText}>
              Detectado por IA con {Math.round(log.ai_confidence * 100)}% de confianza
            </Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingBottom: spacing.sm, backgroundColor: colors.bg,
    borderBottomWidth: 1, borderBottomColor: colors.grayLight,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { ...typography.titleSm, color: colors.black },
  saveBtn: {
    backgroundColor: colors.primary, paddingHorizontal: spacing.md,
    paddingVertical: 8, borderRadius: radius.full,
  },
  saveBtnText: { ...typography.label, color: colors.white },
  scroll: { paddingTop: spacing.md },
  sectionLabel: {
    ...typography.label, color: colors.gray, textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: spacing.sm, marginTop: spacing.md,
  },
  mealRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  mealChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: spacing.sm, paddingVertical: 7, borderRadius: radius.full,
    backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.grayLight,
  },
  mealChipText: { ...typography.caption, color: colors.gray, fontWeight: '600' },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderRadius: radius.md,
    paddingHorizontal: spacing.md, height: 52,
  },
  nameInput: { flex: 1, ...typography.option, color: colors.black },
  caloriesWrapper: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center',
    gap: spacing.sm, backgroundColor: colors.primary, borderRadius: radius.lg,
    paddingVertical: spacing.lg,
  },
  caloriesInput: {
    fontSize: 48, fontWeight: '900', color: colors.white,
    letterSpacing: -2, minWidth: 80, textAlign: 'center',
  },
  caloriesUnit: { fontSize: 20, fontWeight: '600', color: 'rgba(255,255,255,0.6)' },
  macroGrid: { flexDirection: 'row', gap: spacing.sm },
  aiNote: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    marginTop: spacing.lg, justifyContent: 'center',
  },
  aiNoteText: { ...typography.caption, color: colors.gray },
});
