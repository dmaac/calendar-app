/**
 * EditProfileScreen — Actualizar datos personales y objetivos
 * Recalcula el plan nutricional con la fórmula Mifflin-St Jeor al guardar.
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
import { colors, typography, spacing, radius, useLayout } from '../../theme';
import { saveOnboardingStep } from '../../services/onboarding.service';
import { OnboardingProfileRead } from '../../types';

const GOAL_OPTIONS = [
  { value: 'lose',     label: 'Perder peso',         icon: 'trending-down-outline' },
  { value: 'maintain', label: 'Mantener peso',        icon: 'remove-outline' },
  { value: 'gain',     label: 'Ganar masa muscular',  icon: 'trending-up-outline' },
];

// ─── Recalcula plan nutricional (Mifflin-St Jeor) ─────────────────────────────
function recalcPlan(
  weightKg: number,
  heightCm: number,
  ageYears: number,
  gender: string,
  goal: string,
  workoutsPerWeek: number,
) {
  const bmr = gender === 'male'
    ? 10 * weightKg + 6.25 * heightCm - 5 * ageYears + 5
    : 10 * weightKg + 6.25 * heightCm - 5 * ageYears - 161;

  const activityMultiplier =
    workoutsPerWeek <= 1 ? 1.2 :
    workoutsPerWeek <= 3 ? 1.375 :
    workoutsPerWeek <= 5 ? 1.55  :
    workoutsPerWeek <= 6 ? 1.725 : 1.9;

  const tdee     = bmr * activityMultiplier;
  const delta    = goal === 'lose' ? -500 : goal === 'gain' ? 250 : 0;
  const calories = Math.max(1200, Math.round(tdee + delta));
  const protein  = Math.round((calories * 0.30) / 4);
  const carbs    = Math.round((calories * 0.40) / 4);
  const fats     = Math.round((calories * 0.30) / 9);

  return { calories, protein, carbs, fats };
}

export default function EditProfileScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { sidePadding } = useLayout();
  const profile: OnboardingProfileRead = route.params.profile;

  const [weightKg, setWeightKg]         = useState(String(profile.weight_kg ?? ''));
  const [heightCm, setHeightCm]         = useState(String(profile.height_cm ?? ''));
  const [targetWeightKg, setTargetWeightKg] = useState(String(profile.target_weight_kg ?? ''));
  const [goal, setGoal]                 = useState(profile.goal ?? 'maintain');
  const [loading, setLoading]           = useState(false);

  const parse = (v: string) => parseFloat(v.replace(',', '.')) || 0;

  // Calcular vista previa del nuevo plan
  const ageYears = profile.birth_date
    ? new Date().getFullYear() - new Date(profile.birth_date).getFullYear()
    : 30;
  const preview = recalcPlan(
    parse(weightKg) || (profile.weight_kg ?? 70),
    parse(heightCm) || (profile.height_cm ?? 170),
    ageYears,
    profile.gender ?? 'male',
    goal,
    profile.workouts_per_week ?? 3,
  );

  const handleSave = async () => {
    const w = parse(weightKg);
    const h = parse(heightCm);
    const tw = parse(targetWeightKg);

    if (w <= 0) { Alert.alert('Error', 'Ingresa un peso válido'); return; }
    if (h <= 0) { Alert.alert('Error', 'Ingresa una altura válida'); return; }

    setLoading(true);
    try {
      await saveOnboardingStep({
        weight_kg:        w,
        height_cm:        h,
        target_weight_kg: tw || undefined,
        goal:             goal as any,
        daily_calories:   preview.calories,
        daily_protein_g:  preview.protein,
        daily_carbs_g:    preview.carbs,
        daily_fats_g:     preview.fats,
      } as any);
      navigation.goBack();
    } catch {
      Alert.alert('Error', 'No se pudo guardar el perfil. Inténtalo de nuevo.');
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
        <Text style={styles.headerTitle}>Editar perfil</Text>
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
        {/* Medidas */}
        <Text style={styles.sectionLabel}>Medidas</Text>
        <View style={styles.row2}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Peso actual (kg)</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                value={weightKg}
                onChangeText={setWeightKg}
                keyboardType="decimal-pad"
                placeholder="70"
                placeholderTextColor={colors.disabled}
              />
            </View>
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Altura (cm)</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                value={heightCm}
                onChangeText={setHeightCm}
                keyboardType="decimal-pad"
                placeholder="170"
                placeholderTextColor={colors.disabled}
              />
            </View>
          </View>
        </View>

        {/* Peso objetivo */}
        <Text style={styles.sectionLabel}>Peso objetivo (kg)</Text>
        <View style={styles.inputWrapper}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={targetWeightKg}
            onChangeText={setTargetWeightKg}
            keyboardType="decimal-pad"
            placeholder="Opcional"
            placeholderTextColor={colors.disabled}
          />
        </View>

        {/* Objetivo */}
        <Text style={styles.sectionLabel}>Tu objetivo</Text>
        <View style={styles.goalList}>
          {GOAL_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.goalCard, goal === opt.value && styles.goalCardActive]}
              onPress={() => setGoal(opt.value)}
              activeOpacity={0.8}
            >
              <Ionicons
                name={opt.icon as any}
                size={20}
                color={goal === opt.value ? colors.white : colors.black}
              />
              <Text style={[styles.goalLabel, goal === opt.value && { color: colors.white }]}>
                {opt.label}
              </Text>
              {goal === opt.value && (
                <Ionicons name="checkmark-circle" size={18} color={colors.white} style={{ marginLeft: 'auto' }} />
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Vista previa del plan recalculado */}
        <Text style={styles.sectionLabel}>Plan nutricional estimado</Text>
        <View style={styles.previewCard}>
          <View style={styles.previewRow}>
            <Text style={styles.previewLabel}>Calorías diarias</Text>
            <Text style={styles.previewValue}>{preview.calories} kcal</Text>
          </View>
          <View style={styles.previewRow}>
            <Text style={styles.previewLabel}>Proteína</Text>
            <Text style={[styles.previewValue, { color: colors.protein }]}>{preview.protein}g</Text>
          </View>
          <View style={styles.previewRow}>
            <Text style={styles.previewLabel}>Carbohidratos</Text>
            <Text style={[styles.previewValue, { color: colors.carbs }]}>{preview.carbs}g</Text>
          </View>
          <View style={styles.previewRow}>
            <Text style={styles.previewLabel}>Grasas</Text>
            <Text style={[styles.previewValue, { color: colors.fats }]}>{preview.fats}g</Text>
          </View>
        </View>

        <Text style={styles.note}>
          El plan se recalcula usando la fórmula Mifflin-St Jeor con los nuevos valores.
        </Text>

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
    backgroundColor: colors.black, paddingHorizontal: spacing.md,
    paddingVertical: 8, borderRadius: radius.full,
  },
  saveBtnText: { ...typography.label, color: colors.white },
  scroll: { paddingTop: spacing.md },
  sectionLabel: {
    ...typography.label, color: colors.gray, textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: spacing.sm, marginTop: spacing.md,
  },
  row2: { flexDirection: 'row', gap: spacing.sm },
  inputGroup: { flex: 1 },
  inputLabel: { ...typography.caption, color: colors.gray, marginBottom: 4 },
  inputWrapper: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    paddingHorizontal: spacing.md, height: 52,
    flexDirection: 'row', alignItems: 'center',
  },
  input: { flex: 1, ...typography.option, color: colors.black },
  goalList: { gap: spacing.sm },
  goalCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 2, borderColor: 'transparent',
  },
  goalCardActive: { backgroundColor: colors.black, borderColor: colors.black },
  goalLabel: { ...typography.bodyMd, color: colors.black },
  previewCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, gap: spacing.sm,
  },
  previewRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  previewLabel: { ...typography.bodyMd, color: colors.black },
  previewValue: { ...typography.label, color: colors.black },
  note: {
    ...typography.caption, color: colors.disabled,
    textAlign: 'center', marginTop: spacing.sm, lineHeight: 17,
  },
});
