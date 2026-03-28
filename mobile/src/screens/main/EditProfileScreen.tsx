/**
 * EditProfileScreen — Multi-step wizard to update profile & goals.
 * 7 steps mirroring the onboarding experience with Fitsi guiding.
 * Recalculates the nutrition plan with Mifflin-St Jeor on save.
 */
import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, radius, useLayout, useThemeColors } from '../../theme';
import { updateProfile } from '../../services/onboarding.service';
import { showNotification } from '../../components/InAppNotification';
import { OnboardingProfileRead } from '../../types';
import { useAnalytics } from '../../hooks/useAnalytics';
import { haptics } from '../../hooks/useHaptics';

// Onboarding components — reuse exact same look & feel
import ProgressBar from '../../components/onboarding/ProgressBar';
import BackButton from '../../components/onboarding/BackButton';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import ScrollPicker from '../../components/onboarding/ScrollPicker';
import RulerSlider from '../../components/onboarding/RulerSlider';
import OptionCard from '../../components/onboarding/OptionCard';

const TOTAL_STEPS = 7;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Goal options ────────────────────────────────────────────────────────────
const GOAL_OPTIONS = [
  { value: 'lose',     label: 'Perder peso',        subtitle: 'Deficit calorico controlado', icon: 'trending-down-outline' },
  { value: 'maintain', label: 'Mantener mi peso',    subtitle: 'Equilibrio calorico diario',  icon: 'reorder-two-outline' },
  { value: 'gain',     label: 'Ganar peso',          subtitle: 'Superavit para ganar masa',   icon: 'trending-up-outline' },
];

// ─── Diet options ────────────────────────────────────────────────────────────
const DIET_OPTIONS = [
  { value: 'Classic',      label: 'Clasico',      emoji: '\u{1F356}', subtitle: 'Come de todo sin restricciones' },
  { value: 'Pescatarian',  label: 'Pescetariano', emoji: '\u{1F41F}', subtitle: 'Pescados y mariscos, sin carne' },
  { value: 'Vegetarian',   label: 'Vegetariano',  emoji: '\u{1F96C}', subtitle: 'Sin carne ni pescado' },
  { value: 'Vegan',        label: 'Vegano',        emoji: '\u{1F331}', subtitle: 'Solo alimentos de origen vegetal' },
];

// ─── Speed presets ───────────────────────────────────────────────────────────
const SPEED_MIN = 0.1;
const SPEED_MAX = 1.0;
const SPEED_STEP = 0.1;
const SPEED_PRESETS = [
  { value: 0.3, label: 'Gradual' },
  { value: 0.5, label: 'Recomendado' },
  { value: 1.0, label: 'Intenso' },
];

// ─── ScrollPicker data ───────────────────────────────────────────────────────
const CM_OPTIONS = Array.from({ length: 121 }, (_, i) => `${i + 120} cm`);
const KG_OPTIONS = Array.from({ length: 151 }, (_, i) => `${i + 30} kg`);
const FT_OPTIONS = ['3 ft', '4 ft', '5 ft', '6 ft', '7 ft'];
const IN_OPTIONS = Array.from({ length: 12 }, (_, i) => `${i} in`);
const LB_OPTIONS = Array.from({ length: 221 }, (_, i) => `${i + 80} lb`);

// ─── Conversions ─────────────────────────────────────────────────────────────
const cmToFtIn = (cm: number) => {
  const totalIn = cm / 2.54;
  const ft = Math.floor(totalIn / 12);
  const inch = Math.round(totalIn % 12);
  return { ft: Math.max(3, Math.min(7, ft)), inch: Math.max(0, Math.min(11, inch)) };
};
const ftInToCm = (ft: number, inch: number) => Math.round((ft * 12 + inch) * 2.54);
const kgToLb = (kg: number) => Math.round(kg * 2.20462);
const lbToKg = (lb: number) => Math.round(lb / 2.20462);

// ─── Mifflin-St Jeor recalculation ──────────────────────────────────────────
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

// Default profile for safety if route params are missing
const DEFAULT_PROFILE: OnboardingProfileRead = {
  id: 0, user_id: 0, gender: 'male', workouts_per_week: 3, heard_from: null,
  used_other_apps: false, height_cm: 170, weight_kg: 70, unit_system: 'metric',
  birth_date: '1995-01-01', goal: 'maintain', target_weight_kg: null,
  weekly_speed_kg: 0.5, pain_points: null, diet_type: null, accomplishments: null,
  health_connected: false, notifications_enabled: false, referral_code: null,
  daily_calories: 2000, daily_carbs_g: 200, daily_protein_g: 120, daily_fats_g: 67,
  health_score: null, completed_at: null,
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};

// ─── Speed helper ────────────────────────────────────────────────────────────
function clampSpeed(v: number) {
  return Math.max(SPEED_MIN, Math.min(SPEED_MAX, Math.round(v / SPEED_STEP) * SPEED_STEP));
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================
export default function EditProfileScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { contentWidth, innerWidth, sidePadding } = useLayout();
  const c = useThemeColors();
  const { track } = useAnalytics('EditProfile');
  const profile: OnboardingProfileRead = route.params?.profile ?? DEFAULT_PROFILE;

  // ─── Wizard state ──────────────────────────────────────────────────────────
  const [currentStep, setCurrentStep] = useState(0); // 0-indexed
  const scrollRef = useRef<ScrollView>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // ─── Form state ────────────────────────────────────────────────────────────
  const [firstName, setFirstName] = useState(route.params?.firstName ?? '');
  const [lastName, setLastName]   = useState(route.params?.lastName ?? '');
  const [heightCm, setHeightCm]   = useState(profile.height_cm ?? 170);
  const [weightKg, setWeightKg]   = useState(profile.weight_kg ?? 70);
  const [unitSystem, setUnitSystem] = useState<'metric' | 'imperial'>(
    (profile.unit_system as 'metric' | 'imperial') ?? 'metric'
  );
  const [goal, setGoal]                     = useState(profile.goal ?? 'maintain');
  const [targetWeightKg, setTargetWeightKg] = useState(profile.target_weight_kg ?? profile.weight_kg ?? 70);
  const [weeklySpeedKg, setWeeklySpeedKg]   = useState(profile.weekly_speed_kg ?? 0.5);
  const [dietType, setDietType]             = useState(profile.diet_type ?? 'Classic');
  const [loading, setLoading]               = useState(false);

  // ─── Derived values ────────────────────────────────────────────────────────
  const ageYears = profile.birth_date
    ? new Date().getFullYear() - new Date(profile.birth_date).getFullYear()
    : 30;

  const preview = useMemo(() => recalcPlan(
    weightKg,
    heightCm,
    ageYears,
    profile.gender ?? 'male',
    goal,
    profile.workouts_per_week ?? 3,
  ), [weightKg, heightCm, ageYears, profile.gender, goal, profile.workouts_per_week]);

  const weightDiff = useMemo(() => {
    const diff = targetWeightKg - weightKg;
    if (Math.abs(diff) < 0.5) return 'Estas en tu peso ideal';
    return diff < 0
      ? `Meta: bajar ${Math.abs(Math.round(diff))} kg`
      : `Meta: subir ${Math.round(diff)} kg`;
  }, [targetWeightKg, weightKg]);

  const isImperial = unitSystem === 'imperial';
  const { ft, inch } = cmToFtIn(heightCm);

  // ─── Navigation ────────────────────────────────────────────────────────────
  const animateTransition = useCallback((toStep: number) => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 120,
      useNativeDriver: true,
    }).start(() => {
      setCurrentStep(toStep);
      scrollRef.current?.scrollTo({ x: toStep * SCREEN_WIDTH, animated: false });
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    });
  }, [fadeAnim]);

  const goNext = useCallback(() => {
    if (currentStep < TOTAL_STEPS - 1) {
      haptics.light();
      track('edit_profile_step_next', { from: currentStep + 1, to: currentStep + 2 });
      animateTransition(currentStep + 1);
    }
  }, [currentStep, animateTransition, track]);

  const goBack = useCallback(() => {
    if (currentStep > 0) {
      haptics.light();
      animateTransition(currentStep - 1);
    } else {
      navigation.goBack();
    }
  }, [currentStep, animateTransition, navigation]);

  // ─── Save handler ──────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setLoading(true);
    haptics.medium();
    track('edit_profile_save', {
      goal,
      weight_kg: weightKg,
      target_weight_kg: targetWeightKg,
      weekly_speed_kg: weeklySpeedKg,
      diet_type: dietType,
      calories: preview.calories,
    });

    try {
      await updateProfile({
        weight_kg:        weightKg,
        height_cm:        heightCm,
        target_weight_kg: targetWeightKg,
        goal,
        weekly_speed_kg:  weeklySpeedKg,
        diet_type:        dietType,
        unit_system:      unitSystem,
        daily_calories:   preview.calories,
        daily_protein_g:  preview.protein,
        daily_carbs_g:    preview.carbs,
        daily_fats_g:     preview.fats,
      });

      haptics.success();
      showNotification({ message: 'Perfil actualizado!', type: 'success' });
      navigation.goBack();
    } catch {
      showNotification({ message: 'Error al guardar. Intentalo de nuevo.', type: 'warning' });
    } finally {
      setLoading(false);
    }
  }, [
    goal, weightKg, heightCm, targetWeightKg, weeklySpeedKg, dietType,
    unitSystem, preview, navigation, track,
  ]);

  // ─── Height/Weight handlers ────────────────────────────────────────────────
  const handleMetricHeight = useCallback((idx: number) => {
    haptics.selection();
    setHeightCm(idx + 120);
    setUnitSystem('metric');
  }, []);

  const handleMetricWeight = useCallback((idx: number) => {
    haptics.selection();
    setWeightKg(idx + 30);
    setUnitSystem('metric');
  }, []);

  const handleImperialFt = useCallback((ftIdx: number) => {
    haptics.selection();
    setHeightCm(ftInToCm(ftIdx + 3, inch));
    setUnitSystem('imperial');
  }, [inch]);

  const handleImperialIn = useCallback((inIdx: number) => {
    haptics.selection();
    setHeightCm(ftInToCm(ft, inIdx));
    setUnitSystem('imperial');
  }, [ft]);

  const handleImperialLb = useCallback((lbIdx: number) => {
    haptics.selection();
    setWeightKg(lbToKg(lbIdx + 80));
    setUnitSystem('imperial');
  }, []);

  // ─── Speed handlers ────────────────────────────────────────────────────────
  const speedProgress = (weeklySpeedKg - SPEED_MIN) / (SPEED_MAX - SPEED_MIN);

  const getSpeedLabel = () => {
    if (weeklySpeedKg <= 0.4) return 'Gradual';
    if (weeklySpeedKg <= 0.7) return 'Moderado';
    return 'Intenso';
  };

  // ─── Summary helpers ───────────────────────────────────────────────────────
  const oldCalories = profile.daily_calories ?? 2000;
  const caloriesDiff = preview.calories - oldCalories;

  // ─── Step progress bar mapping (fake 1-7 to 3-30 range for the bar) ────────
  const progressStep = currentStep + 3; // ProgressBar starts counting from step 3

  // =========================================================================
  // RENDER STEPS
  // =========================================================================

  const renderStep1BasicData = () => (
    <View style={styles.stepContainer}>
      <Text style={[styles.title, { color: c.black }]}>Tus datos basicos</Text>
      <Text style={[styles.subtitle, { color: c.gray }]}>
        Confirma tu nombre para personalizar tu experiencia.
      </Text>

      <View style={styles.inputsContainer}>
        <View style={styles.inputGroup}>
          <Text style={[styles.inputLabel, { color: c.gray }]}>Nombre</Text>
          <View style={[styles.inputWrapper, { backgroundColor: c.surface }]}>
            <TextInput
              style={[styles.textInput, { color: c.black }]}
              value={firstName}
              onChangeText={setFirstName}
              placeholder="Tu nombre"
              placeholderTextColor={c.disabled}
              autoCapitalize="words"
            />
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.inputLabel, { color: c.gray }]}>Apellido</Text>
          <View style={[styles.inputWrapper, { backgroundColor: c.surface }]}>
            <TextInput
              style={[styles.textInput, { color: c.black }]}
              value={lastName}
              onChangeText={setLastName}
              placeholder="Tu apellido"
              placeholderTextColor={c.disabled}
              autoCapitalize="words"
            />
          </View>
        </View>
      </View>
    </View>
  );

  const renderStep2Measurements = () => (
    <View style={styles.stepContainer}>
      <Text style={[styles.title, { color: c.black }]}>Tu altura y peso</Text>
      <Text style={[styles.subtitle, { color: c.gray }]}>
        Con estos datos calculamos tu metabolismo basal.
      </Text>

      {/* Unit toggle */}
      <View style={[styles.toggleRow, { backgroundColor: c.surface }]}>
        {(['imperial', 'metric'] as const).map(u => (
          <TouchableOpacity
            key={u}
            onPress={() => { haptics.light(); setUnitSystem(u); }}
            style={[styles.toggleBtn, unitSystem === u && { backgroundColor: c.bg }]}
            activeOpacity={0.8}
          >
            <Text style={[styles.toggleText, { color: c.black }]}>
              {u === 'imperial' ? 'Imperial' : 'Metrico'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Pickers */}
      <View style={styles.pickersRow}>
        {isImperial ? (
          <>
            <View style={styles.pickerCol}>
              <Text style={[styles.pickerLabel, { color: c.black }]}>Altura</Text>
              <View style={styles.pickerPair}>
                <ScrollPicker
                  items={FT_OPTIONS}
                  selectedIndex={ft - 3}
                  onSelect={handleImperialFt}
                  width={90}
                />
                <ScrollPicker
                  items={IN_OPTIONS}
                  selectedIndex={inch}
                  onSelect={handleImperialIn}
                  width={80}
                />
              </View>
            </View>
            <View style={[styles.divider, { backgroundColor: c.grayLight }]} />
            <View style={styles.pickerCol}>
              <Text style={[styles.pickerLabel, { color: c.black }]}>Peso</Text>
              <ScrollPicker
                items={LB_OPTIONS}
                selectedIndex={Math.max(0, Math.min(LB_OPTIONS.length - 1, kgToLb(weightKg) - 80))}
                onSelect={handleImperialLb}
                width={100}
              />
            </View>
          </>
        ) : (
          <>
            <View style={styles.pickerCol}>
              <Text style={[styles.pickerLabel, { color: c.black }]}>Altura</Text>
              <ScrollPicker
                items={CM_OPTIONS}
                selectedIndex={Math.max(0, Math.min(CM_OPTIONS.length - 1, heightCm - 120))}
                onSelect={handleMetricHeight}
                width={110}
              />
            </View>
            <View style={[styles.divider, { backgroundColor: c.grayLight }]} />
            <View style={styles.pickerCol}>
              <Text style={[styles.pickerLabel, { color: c.black }]}>Peso</Text>
              <ScrollPicker
                items={KG_OPTIONS}
                selectedIndex={Math.max(0, Math.min(KG_OPTIONS.length - 1, weightKg - 30))}
                onSelect={handleMetricWeight}
                width={110}
              />
            </View>
          </>
        )}
      </View>
    </View>
  );

  const renderStep3Goal = () => (
    <View style={styles.stepContainer}>
      <Text style={[styles.title, { color: c.black }]}>Cual es tu objetivo?</Text>
      <Text style={[styles.subtitle, { color: c.gray }]}>
        Esto define tu plan de calorias diarias.
      </Text>

      <View style={styles.optionsList}>
        {GOAL_OPTIONS.map(opt => (
          <OptionCard
            key={opt.value}
            label={opt.label}
            subtitle={opt.subtitle}
            icon={opt.icon}
            selected={goal === opt.value}
            onPress={() => { haptics.light(); setGoal(opt.value); }}
          />
        ))}
      </View>
    </View>
  );

  const renderStep4TargetWeight = () => {
    const displayValue = isImperial ? kgToLb(targetWeightKg) : targetWeightKg;
    const unit = isImperial ? 'lb' : 'kg';

    const handleChange = (v: number) => {
      haptics.selection();
      const kg = isImperial ? Math.round(v / 2.20462 * 10) / 10 : v;
      setTargetWeightKg(kg);
    };

    return (
      <View style={styles.stepContainer}>
        <Text style={[styles.title, { color: c.black }]}>
          Cual es tu{'\n'}peso deseado?
        </Text>

        <View style={styles.rulerWrapper}>
          <RulerSlider
            value={isImperial ? displayValue : targetWeightKg}
            min={isImperial ? 88 : 30}
            max={isImperial ? 330 : 150}
            step={isImperial ? 1 : 0.5}
            unit={unit}
            onChange={handleChange}
          />
        </View>
      </View>
    );
  };

  const renderStep5Speed = () => (
    <View style={styles.stepContainer}>
      <Text style={[styles.title, { color: c.black }]}>
        Que tan rapido quieres{'\n'}alcanzar tu objetivo?
      </Text>

      <View style={styles.speedCenter}>
        <Text style={[styles.speedLabel, { color: c.gray }]}>Velocidad semanal</Text>
        <Text style={[styles.speedValue, { color: c.black }]}>
          {weeklySpeedKg.toFixed(1)} kg
        </Text>

        <View style={styles.indicatorRow}>
          <Text style={[styles.indicatorText, { color: c.gray },
            weeklySpeedKg <= 0.4 && styles.indicatorActive]}>Gradual</Text>
          <Text style={[styles.indicatorText, { color: c.gray },
            weeklySpeedKg > 0.4 && weeklySpeedKg <= 0.7 && styles.indicatorActive]}>Moderado</Text>
          <Text style={[styles.indicatorText, { color: c.gray },
            weeklySpeedKg > 0.7 && styles.indicatorActive]}>Intenso</Text>
        </View>

        {/* Preset chips */}
        <View style={styles.presets}>
          {SPEED_PRESETS.map(p => (
            <TouchableOpacity
              key={p.value}
              onPress={() => { haptics.light(); setWeeklySpeedKg(p.value); }}
              style={[styles.chip, { backgroundColor: c.surface },
                weeklySpeedKg === p.value && { backgroundColor: c.black }]}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipText, { color: c.black },
                weeklySpeedKg === p.value && { color: colors.white }]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );

  const renderStep6Diet = () => (
    <View style={styles.stepContainer}>
      <Text style={[styles.title, { color: c.black }]}>
        Sigues alguna{'\n'}dieta especifica?
      </Text>
      <Text style={[styles.subtitle, { color: c.gray }]}>
        Esto nos ayuda a personalizar tus recomendaciones.
      </Text>

      <View style={styles.optionsList}>
        {DIET_OPTIONS.map(opt => (
          <OptionCard
            key={opt.value}
            label={opt.label}
            subtitle={opt.subtitle}
            emoji={opt.emoji}
            selected={dietType === opt.value}
            onPress={() => { haptics.light(); setDietType(opt.value); }}
          />
        ))}
      </View>
    </View>
  );

  const renderStep7Summary = () => {
    const GOAL_LABELS: Record<string, string> = {
      lose: 'Perder peso', maintain: 'Mantener peso', gain: 'Ganar peso',
    };
    const oldGoal = profile.goal ?? 'maintain';
    const oldWeight = profile.weight_kg ?? 70;
    const oldTargetWeight = profile.target_weight_kg ?? oldWeight;
    const oldSpeed = profile.weekly_speed_kg ?? 0.5;
    const oldDiet = profile.diet_type ?? 'Classic';

    const changes: { label: string; before: string; after: string }[] = [];

    if (weightKg !== oldWeight)
      changes.push({ label: 'Peso actual', before: `${oldWeight} kg`, after: `${weightKg} kg` });
    if (heightCm !== (profile.height_cm ?? 170))
      changes.push({ label: 'Altura', before: `${profile.height_cm ?? 170} cm`, after: `${heightCm} cm` });
    if (goal !== oldGoal)
      changes.push({ label: 'Objetivo', before: GOAL_LABELS[oldGoal] ?? oldGoal, after: GOAL_LABELS[goal] ?? goal });
    if (Math.abs(targetWeightKg - oldTargetWeight) > 0.3)
      changes.push({ label: 'Peso meta', before: `${oldTargetWeight} kg`, after: `${targetWeightKg} kg` });
    if (Math.abs(weeklySpeedKg - oldSpeed) > 0.05)
      changes.push({ label: 'Velocidad', before: `${oldSpeed} kg/sem`, after: `${weeklySpeedKg.toFixed(1)} kg/sem` });
    if (dietType !== oldDiet)
      changes.push({ label: 'Dieta', before: oldDiet, after: dietType });

    return (
      <View style={styles.stepContainer}>
        <Text style={[styles.title, { color: c.black }]}>Resumen de cambios</Text>

        {changes.length > 0 ? (
          <View style={styles.changesContainer}>
            {changes.map((ch, idx) => (
              <View key={idx} style={[styles.changeRow, { backgroundColor: c.surface }]}>
                <Text style={[styles.changeLabel, { color: c.gray }]}>{ch.label}</Text>
                <View style={styles.changeValues}>
                  <Text style={[styles.changeBefore, { color: c.disabled }]}>{ch.before}</Text>
                  <Ionicons name="arrow-forward" size={14} color={c.gray} />
                  <Text style={[styles.changeAfter, { color: c.black }]}>{ch.after}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Text style={[styles.noChanges, { color: c.gray }]}>
            No realizaste cambios en tu perfil.
          </Text>
        )}

        {/* New nutrition plan */}
        <View style={[styles.planCard, { backgroundColor: c.surface }]}>
          <Text style={[styles.planTitle, { color: c.black }]}>Nuevo plan nutricional</Text>
          <View style={styles.planRow}>
            <Text style={[styles.planLabel, { color: c.black }]}>Calorias diarias</Text>
            <View style={styles.planValueRow}>
              <Text style={[styles.planValue, { color: c.black }]}>{preview.calories} kcal</Text>
              {caloriesDiff !== 0 && (
                <Text style={[styles.planDiff, { color: caloriesDiff > 0 ? c.success ?? '#34A853' : '#E53935' }]}>
                  {caloriesDiff > 0 ? '+' : ''}{caloriesDiff}
                </Text>
              )}
            </View>
          </View>
          <View style={styles.planRow}>
            <Text style={[styles.planLabel, { color: c.black }]}>Proteina</Text>
            <Text style={[styles.planValue, { color: c.protein ?? c.black }]}>{preview.protein}g</Text>
          </View>
          <View style={styles.planRow}>
            <Text style={[styles.planLabel, { color: c.black }]}>Carbohidratos</Text>
            <Text style={[styles.planValue, { color: c.carbs ?? c.black }]}>{preview.carbs}g</Text>
          </View>
          <View style={styles.planRow}>
            <Text style={[styles.planLabel, { color: c.black }]}>Grasas</Text>
            <Text style={[styles.planValue, { color: c.fats ?? c.black }]}>{preview.fats}g</Text>
          </View>
        </View>
      </View>
    );
  };

  // ─── Steps array ───────────────────────────────────────────────────────────
  const steps = [
    renderStep1BasicData,
    renderStep2Measurements,
    renderStep3Goal,
    renderStep4TargetWeight,
    renderStep5Speed,
    renderStep6Diet,
    renderStep7Summary,
  ];

  // =========================================================================
  // RENDER
  // =========================================================================
  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      {/* Header with progress bar and back button */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.headerInner}>
          {currentStep > 0 ? (
            <BackButton onPress={goBack} />
          ) : (
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={[styles.closeBtn, { backgroundColor: c.surface }]}
            >
              <Ionicons name="close" size={20} color={c.black} />
            </TouchableOpacity>
          )}
          <View style={styles.progressWrapper}>
            <ProgressBar step={progressStep} totalSteps={TOTAL_STEPS + 2} />
          </View>
          <Text style={[styles.stepCounter, { color: c.gray }]}>
            {currentStep + 1}/{TOTAL_STEPS}
          </Text>
        </View>
      </View>

      {/* Step content */}
      <Animated.View style={[styles.contentContainer, { opacity: fadeAnim }]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { paddingHorizontal: sidePadding }]}
          keyboardShouldPersistTaps="handled"
        >
          {steps[currentStep]()}
        </ScrollView>
      </Animated.View>

      {/* Footer button */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md, paddingHorizontal: sidePadding }]}>
        {currentStep < TOTAL_STEPS - 1 ? (
          <PrimaryButton label="Continuar" onPress={goNext} />
        ) : (
          <PrimaryButton
            label="Guardar cambios"
            onPress={handleSave}
            loading={loading}
          />
        )}
      </View>
    </View>
  );
}

// =============================================================================
// STYLES
// =============================================================================
const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },

  // Header
  header: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressWrapper: {
    flex: 1,
  },
  stepCounter: {
    ...typography.caption,
    minWidth: 36,
    textAlign: 'right',
  },

  // Content
  contentContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },

  // Footer
  footer: {
    paddingTop: spacing.md,
  },

  // Steps shared
  stepContainer: {
    gap: spacing.sm,
  },
  fitsi: {
    alignSelf: 'center',
    marginBottom: spacing.xs,
  },
  title: {
    ...typography.title,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.subtitle,
    textAlign: 'center',
    marginBottom: spacing.md,
  },

  // Step 1 — Basic data
  inputsContainer: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
  inputGroup: {
    gap: 4,
  },
  inputLabel: {
    ...typography.caption,
    marginLeft: spacing.xs,
  },
  inputWrapper: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 56,
    justifyContent: 'center',
  },
  textInput: {
    ...typography.option,
    fontSize: 18,
  },

  // Step 2 — Measurements
  toggleRow: {
    flexDirection: 'row',
    borderRadius: radius.full,
    padding: 4,
    alignSelf: 'center',
    marginTop: spacing.md,
  },
  toggleBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  toggleText: {
    ...typography.label,
  },
  pickersRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  pickerCol: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  pickerPair: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  pickerLabel: {
    ...typography.label,
  },
  divider: {
    width: 1,
    height: 200,
    marginTop: 28,
  },

  // Step 3 — Goal
  optionsList: {
    gap: spacing.sm + 4,
    marginTop: spacing.md,
  },

  // Step 4 — Target weight
  rulerWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xl,
  },

  // Step 5 — Speed
  speedCenter: {
    alignItems: 'center',
    gap: spacing.lg,
    marginTop: spacing.xl,
  },
  speedLabel: {
    ...typography.label,
  },
  speedValue: {
    fontSize: 48,
    fontWeight: '800',
    letterSpacing: -1,
    marginTop: -8,
  },
  indicatorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: spacing.sm,
  },
  indicatorText: {
    ...typography.caption,
    opacity: 0.4,
  },
  indicatorActive: {
    opacity: 1,
    fontWeight: '700',
    color: colors.black,
  },
  presets: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  chipText: {
    ...typography.label,
  },

  // Step 7 — Summary
  changesContainer: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  changeRow: {
    borderRadius: radius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  changeLabel: {
    ...typography.label,
  },
  changeValues: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  changeBefore: {
    ...typography.caption,
    textDecorationLine: 'line-through',
  },
  changeAfter: {
    ...typography.label,
    fontWeight: '700',
  },
  noChanges: {
    ...typography.bodyMd,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  planCard: {
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  planTitle: {
    ...typography.label,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  planRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  planLabel: {
    ...typography.bodyMd,
  },
  planValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  planValue: {
    ...typography.label,
  },
  planDiff: {
    ...typography.caption,
    fontWeight: '700',
  },
});
