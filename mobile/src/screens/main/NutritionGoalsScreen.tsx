/**
 * NutritionGoalsScreen — Edit Nutrition Goals (Cal AI style)
 * Editable macro cards with sliders, numeric input, pie chart, and reset to recommended.
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { colors, typography, spacing, radius, shadows, useLayout, useThemeColors } from '../../theme';
import { getOnboardingProfile, updateProfile } from '../../services/onboarding.service';
import { OnboardingProfileRead } from '../../types';
import { haptics } from '../../hooks/useHaptics';

// ─── Mifflin-St Jeor recalculation ──────────────────────────────────────────
function recalcRecommended(profile: OnboardingProfileRead) {
  const weightKg = profile.weight_kg ?? 70;
  const heightCm = profile.height_cm ?? 170;
  const gender = profile.gender ?? 'male';
  const goal = profile.goal ?? 'maintain';
  const workouts = profile.workouts_per_week ?? 3;

  const ageYears = profile.birth_date
    ? Math.floor(
        (Date.now() - new Date(profile.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000),
      )
    : 30;

  const bmr =
    gender === 'male'
      ? 10 * weightKg + 6.25 * heightCm - 5 * ageYears + 5
      : 10 * weightKg + 6.25 * heightCm - 5 * ageYears - 161;

  const activityMultiplier =
    workouts <= 1 ? 1.2 : workouts <= 3 ? 1.375 : workouts <= 5 ? 1.55 : workouts <= 6 ? 1.725 : 1.9;

  const tdee = bmr * activityMultiplier;
  const delta = goal === 'lose' ? -500 : goal === 'gain' ? 250 : 0;
  const cal = Math.max(1200, Math.round(tdee + delta));
  const protein = Math.round((cal * 0.3) / 4);
  const carbs = Math.round((cal * 0.4) / 4);
  const fats = Math.round((cal * 0.3) / 9);

  return { calories: cal, protein, carbs, fats };
}

// ─── Slider component ────────────────────────────────────────────────────────
function MacroSlider({
  value,
  min,
  max,
  step,
  trackColor,
  onChange,
  c,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  trackColor: string;
  onChange: (v: number) => void;
  c: ReturnType<typeof useThemeColors>;
}) {
  const fraction = Math.max(0, Math.min(1, (value - min) / (max - min)));

  const handleLayout = (e: any) => {
    barWidth.current = e.nativeEvent.layout.width;
  };

  const barWidth = React.useRef(0);

  const handlePress = (e: any) => {
    const x = e.nativeEvent.locationX;
    const pct = Math.max(0, Math.min(1, x / barWidth.current));
    const raw = min + pct * (max - min);
    const snapped = Math.round(raw / step) * step;
    onChange(Math.max(min, Math.min(max, snapped)));
  };

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={handlePress}
      onLayout={handleLayout}
      style={[sliderStyles.track, { backgroundColor: c.grayLight }]}
    >
      <View style={[sliderStyles.fill, { width: `${fraction * 100}%`, backgroundColor: trackColor }]} />
      <View
        style={[
          sliderStyles.thumb,
          { left: `${fraction * 100}%`, borderColor: trackColor, backgroundColor: c.bg },
        ]}
      />
    </TouchableOpacity>
  );
}

const sliderStyles = StyleSheet.create({
  track: {
    height: 6,
    backgroundColor: colors.grayLight,
    borderRadius: 3,
    justifyContent: 'center',
    marginVertical: spacing.sm,
  },
  fill: {
    height: 6,
    borderRadius: 3,
    position: 'absolute',
    left: 0,
    top: 0,
  },
  thumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.white,
    borderWidth: 3,
    position: 'absolute',
    top: -8,
    marginLeft: -11,
    ...shadows.md,
  },
});

// ─── Pie Chart SVG ───────────────────────────────────────────────────────────
function MacroPieChart({
  protein,
  carbs,
  fats,
  size = 140,
  c,
}: {
  protein: number;
  carbs: number;
  fats: number;
  size?: number;
  c: ReturnType<typeof useThemeColors>;
}) {
  const total = protein * 4 + carbs * 4 + fats * 9;
  if (total === 0) return null;

  const proteinCal = protein * 4;
  const carbsCal = carbs * 4;
  const fatsCal = fats * 9;

  const slices = [
    { value: proteinCal, color: c.protein },
    { value: carbsCal, color: c.carbs },
    { value: fatsCal, color: c.fats },
  ];

  const r = size / 2 - 4;
  const cx = size / 2;
  const cy = size / 2;
  let startAngle = -90;

  const paths = slices.map((slice, i) => {
    const angle = (slice.value / total) * 360;
    if (angle === 0) return null;
    const endAngle = startAngle + angle;
    const largeArc = angle > 180 ? 1 : 0;

    const x1 = cx + r * Math.cos((Math.PI * startAngle) / 180);
    const y1 = cy + r * Math.sin((Math.PI * startAngle) / 180);
    const x2 = cx + r * Math.cos((Math.PI * endAngle) / 180);
    const y2 = cy + r * Math.sin((Math.PI * endAngle) / 180);

    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    startAngle = endAngle;

    return <Path key={i} d={d} fill={slice.color} />;
  });

  const proteinPct = Math.round((proteinCal / total) * 100);
  const carbsPct = Math.round((carbsCal / total) * 100);
  const fatsPct = 100 - proteinPct - carbsPct;

  return (
    <View style={pieStyles.container}>
      <Svg width={size} height={size}>
        <G>{paths}</G>
        <Circle cx={cx} cy={cy} r={r * 0.55} fill={c.bg} />
      </Svg>
      <View style={pieStyles.legend}>
        <LegendRow color={c.protein} label="Proteina" pct={proteinPct} c={c} />
        <LegendRow color={c.carbs} label="Carbos" pct={carbsPct} c={c} />
        <LegendRow color={c.fats} label="Grasas" pct={fatsPct} c={c} />
      </View>
    </View>
  );
}

function LegendRow({ color, label, pct, c }: { color: string; label: string; pct: number; c: ReturnType<typeof useThemeColors> }) {
  return (
    <View style={pieStyles.legendRow}>
      <View style={[pieStyles.legendDot, { backgroundColor: color }]} />
      <Text style={[pieStyles.legendLabel, { color: c.black }]}>{label}</Text>
      <Text style={[pieStyles.legendPct, { color: c.gray }]}>{pct}%</Text>
    </View>
  );
}

const pieStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.md,
  },
  legend: { gap: spacing.sm },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { ...typography.bodyMd, color: colors.black, width: 70 },
  legendPct: { ...typography.label, color: colors.gray, width: 36, textAlign: 'right' },
});

// ─── Calorie Ring Preview ────────────────────────────────────────────────────
function CalorieRing({ calories, size = 56, c }: { calories: number; size?: number; c: ReturnType<typeof useThemeColors> }) {
  const r = (size - 8) / 2;
  const circumference = 2 * Math.PI * r;
  const fraction = Math.min(1, calories / 4000);

  return (
    <Svg width={size} height={size}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={c.grayLight}
        strokeWidth={4}
        fill="none"
      />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={c.accent}
        strokeWidth={4}
        fill="none"
        strokeDasharray={`${fraction * circumference} ${circumference}`}
        strokeLinecap="round"
        rotation="-90"
        origin={`${size / 2}, ${size / 2}`}
      />
    </Svg>
  );
}

// ─── Macro Card ──────────────────────────────────────────────────────────────
function MacroCard({
  label,
  unit,
  value,
  min,
  max,
  step,
  color,
  icon,
  totalCalories,
  calPerUnit,
  onChange,
  ringPreview,
  c,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  color: string;
  icon: string;
  totalCalories: number;
  calPerUnit: number;
  onChange: (v: number) => void;
  ringPreview?: boolean;
  c: ReturnType<typeof useThemeColors>;
}) {
  const pct = totalCalories > 0 ? Math.round(((value * calPerUnit) / totalCalories) * 100) : 0;

  const handleTextChange = (text: string) => {
    const num = parseInt(text.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(num)) {
      onChange(Math.max(min, Math.min(max, num)));
    } else if (text === '') {
      onChange(min);
    }
  };

  return (
    <View style={[cardStyles.card, { backgroundColor: c.bg, borderColor: c.grayLight }]}>
      <View style={cardStyles.header}>
        <View style={cardStyles.headerLeft}>
          <View style={[cardStyles.iconCircle, { backgroundColor: color + '18' }]}>
            <Ionicons name={icon as any} size={18} color={color} />
          </View>
          <View>
            <Text style={[cardStyles.label, { color: c.black }]}>{label}</Text>
            <Text style={[cardStyles.pct, { color: c.gray }]}>{pct}% del total</Text>
          </View>
        </View>
        <View style={cardStyles.headerRight}>
          {ringPreview && <CalorieRing calories={value} size={44} c={c} />}
          <View style={[cardStyles.inputWrap, { backgroundColor: c.surface }]}>
            <TextInput
              style={[cardStyles.input, { color: c.black }]}
              value={String(value)}
              onChangeText={handleTextChange}
              keyboardType="number-pad"
              maxLength={5}
              selectTextOnFocus
            />
            <Text style={[cardStyles.unit, { color: c.gray }]}>{unit}</Text>
          </View>
        </View>
      </View>
      <MacroSlider value={value} min={min} max={max} step={step} trackColor={color} onChange={onChange} c={c} />
      <View style={cardStyles.rangeRow}>
        <Text style={[cardStyles.rangeText, { color: c.disabled }]}>{min}</Text>
        <Text style={[cardStyles.rangeText, { color: c.disabled }]}>{max}</Text>
      </View>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.grayLight,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { ...typography.bodyMd, color: colors.black },
  pct: { ...typography.caption, color: colors.gray, marginTop: 1 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  input: {
    ...typography.titleSm,
    color: colors.black,
    minWidth: 48,
    textAlign: 'right',
    padding: 0,
  },
  unit: { ...typography.caption, color: colors.gray, marginLeft: 2 },
  rangeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -2,
  },
  rangeText: { ...typography.caption, color: colors.disabled, fontSize: 10 },
});

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function NutritionGoalsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { sidePadding } = useLayout();
  const c = useThemeColors();

  const [profile, setProfile] = useState<OnboardingProfileRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [calories, setCalories] = useState(2100);
  const [protein, setProtein] = useState(150);
  const [carbs, setCarbs] = useState(210);
  const [fats, setFats] = useState(70);

  useEffect(() => {
    getOnboardingProfile()
      .then((p) => {
        setProfile(p);
        setCalories(Math.round(p.daily_calories ?? 2100));
        setProtein(Math.round(p.daily_protein_g ?? 150));
        setCarbs(Math.round(p.daily_carbs_g ?? 210));
        setFats(Math.round(p.daily_fats_g ?? 70));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalCalories = protein * 4 + carbs * 4 + fats * 9;

  const handleReset = () => {
    if (!profile) return;
    const rec = recalcRecommended(profile);
    setCalories(rec.calories);
    setProtein(rec.protein);
    setCarbs(rec.carbs);
    setFats(rec.fats);
  };

  const handleSave = async () => {
    haptics.light();
    setSaving(true);
    try {
      await updateProfile({
        daily_calories: calories,
        daily_protein_g: protein,
        daily_carbs_g: carbs,
        daily_fats_g: fats,
      });
      haptics.success();
      navigation.goBack();
    } catch {
      haptics.error();
      Alert.alert('Error', 'No se pudo guardar. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top, backgroundColor: c.bg }]}>
        <ActivityIndicator size="large" color={c.black} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: sidePadding }]}>
        <TouchableOpacity onPress={() => { haptics.light(); navigation.goBack(); }} style={[styles.backBtn, { backgroundColor: c.surface }]}>
          <Ionicons name="chevron-back" size={20} color={c.black} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.black }]}>Edit Nutrition Goals</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingHorizontal: sidePadding }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Info text */}
        <View style={[styles.infoBox, { backgroundColor: c.surface }]}>
          <Ionicons name="information-circle-outline" size={16} color={c.gray} />
          <Text style={[styles.infoText, { color: c.gray }]}>
            Estos valores fueron calculados basados en tu perfil. Puedes ajustarlos manualmente.
          </Text>
        </View>

        {/* Pie Chart */}
        <MacroPieChart protein={protein} carbs={carbs} fats={fats} c={c} />

        {/* Macro Cards */}
        <MacroCard
          label="Calorias"
          unit="kcal"
          value={calories}
          min={1000}
          max={4000}
          step={50}
          color={c.accent}
          icon="flame-outline"
          totalCalories={totalCalories}
          calPerUnit={1}
          onChange={setCalories}
          ringPreview
          c={c}
        />
        <MacroCard
          label="Proteina"
          unit="g"
          value={protein}
          min={30}
          max={300}
          step={5}
          color={c.protein}
          icon="barbell-outline"
          totalCalories={totalCalories}
          calPerUnit={4}
          onChange={setProtein}
          c={c}
        />
        <MacroCard
          label="Carbohidratos"
          unit="g"
          value={carbs}
          min={50}
          max={500}
          step={5}
          color={c.carbs}
          icon="leaf-outline"
          totalCalories={totalCalories}
          calPerUnit={4}
          onChange={setCarbs}
          c={c}
        />
        <MacroCard
          label="Grasas"
          unit="g"
          value={fats}
          min={20}
          max={200}
          step={5}
          color={c.fats}
          icon="water-outline"
          totalCalories={totalCalories}
          calPerUnit={9}
          onChange={setFats}
          c={c}
        />

        {/* Reset button */}
        <TouchableOpacity style={styles.resetBtn} onPress={() => { haptics.light(); handleReset(); }} activeOpacity={0.7}>
          <Ionicons name="refresh-outline" size={18} color={c.accent} />
          <Text style={[styles.resetText, { color: c.accent }]}>Reset to Recommended</Text>
        </TouchableOpacity>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Fixed save button */}
      <View style={[styles.saveBar, { paddingBottom: insets.bottom + spacing.sm, paddingHorizontal: sidePadding, backgroundColor: c.bg, borderTopColor: c.grayLight }]}>
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: c.accent }, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={styles.saveBtnText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { ...typography.titleSm, color: colors.black },
  scroll: { paddingTop: spacing.sm },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  infoText: { ...typography.caption, color: colors.gray, flex: 1, lineHeight: 18 },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  resetText: { ...typography.bodyMd, color: colors.accent },
  saveBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.grayLight,
    paddingTop: spacing.sm,
  },
  saveBtn: {
    backgroundColor: colors.black,
    height: 56,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { ...typography.button, color: colors.white },
});
