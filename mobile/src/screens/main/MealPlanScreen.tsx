/**
 * MealPlanScreen — Weekly meal plan with 7 days, 3 meals per day.
 * Hardcoded suggestions based on user goals. Scrollable by day.
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, typography, spacing, radius, shadows, useLayout } from '../../theme';
import { haptics } from '../../hooks/useHaptics';
import FitsiMascot from '../../components/FitsiMascot';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Meal {
  name: string;
  emoji: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

interface DayPlan {
  day: string;
  shortDay: string;
  breakfast: Meal;
  lunch: Meal;
  dinner: Meal;
}

// ─── Hardcoded weekly plan ──────────────────────────────────────────────────

const WEEKLY_PLAN: DayPlan[] = [
  {
    day: 'Lunes', shortDay: 'Lun',
    breakfast: { name: 'Avena con frutas y miel', emoji: '\u{1F35C}', calories: 320, protein: 12, carbs: 52, fats: 8 },
    lunch:     { name: 'Pollo a la plancha con arroz integral', emoji: '\u{1F357}', calories: 520, protein: 42, carbs: 48, fats: 14 },
    dinner:    { name: 'Salmon con verduras al vapor', emoji: '\u{1F41F}', calories: 420, protein: 35, carbs: 12, fats: 22 },
  },
  {
    day: 'Martes', shortDay: 'Mar',
    breakfast: { name: 'Tostadas con palta y huevo', emoji: '\u{1F95D}', calories: 380, protein: 18, carbs: 32, fats: 20 },
    lunch:     { name: 'Bowl de quinoa con garbanzos', emoji: '\u{1F957}', calories: 480, protein: 22, carbs: 58, fats: 16 },
    dinner:    { name: 'Wrap de pollo con ensalada', emoji: '\u{1F32F}', calories: 390, protein: 30, carbs: 35, fats: 14 },
  },
  {
    day: 'Miercoles', shortDay: 'Mie',
    breakfast: { name: 'Smoothie de proteina con banana', emoji: '\u{1F34C}', calories: 290, protein: 28, carbs: 35, fats: 6 },
    lunch:     { name: 'Pasta integral con salsa de tomate', emoji: '\u{1F35D}', calories: 520, protein: 18, carbs: 72, fats: 12 },
    dinner:    { name: 'Merluza con pure de zapallo', emoji: '\u{1F3A3}', calories: 350, protein: 28, carbs: 30, fats: 12 },
  },
  {
    day: 'Jueves', shortDay: 'Jue',
    breakfast: { name: 'Yogurt griego con granola', emoji: '\u{1F95B}', calories: 340, protein: 20, carbs: 42, fats: 10 },
    lunch:     { name: 'Bife con ensalada cesar', emoji: '\u{1F969}', calories: 550, protein: 45, carbs: 15, fats: 32 },
    dinner:    { name: 'Sopa de lentejas con pan integral', emoji: '\u{1F372}', calories: 380, protein: 22, carbs: 48, fats: 8 },
  },
  {
    day: 'Viernes', shortDay: 'Vie',
    breakfast: { name: 'Pancakes de avena con miel', emoji: '\u{1F95E}', calories: 360, protein: 14, carbs: 55, fats: 10 },
    lunch:     { name: 'Poke bowl de atun', emoji: '\u{1F363}', calories: 480, protein: 32, carbs: 52, fats: 14 },
    dinner:    { name: 'Pizza casera de vegetales', emoji: '\u{1F355}', calories: 440, protein: 20, carbs: 48, fats: 18 },
  },
  {
    day: 'Sabado', shortDay: 'Sab',
    breakfast: { name: 'Huevos revueltos con tostadas', emoji: '\u{1F373}', calories: 350, protein: 22, carbs: 28, fats: 18 },
    lunch:     { name: 'Hamburguesa casera con ensalada', emoji: '\u{1F354}', calories: 580, protein: 38, carbs: 40, fats: 28 },
    dinner:    { name: 'Tacos de pollo con guacamole', emoji: '\u{1F32E}', calories: 420, protein: 28, carbs: 35, fats: 20 },
  },
  {
    day: 'Domingo', shortDay: 'Dom',
    breakfast: { name: 'Acai bowl con frutas', emoji: '\u{1F347}', calories: 310, protein: 8, carbs: 52, fats: 10 },
    lunch:     { name: 'Asado con ensalada mixta', emoji: '\u{1F356}', calories: 600, protein: 48, carbs: 10, fats: 38 },
    dinner:    { name: 'Crema de verduras con crutones', emoji: '\u{1F966}', calories: 280, protein: 10, carbs: 35, fats: 12 },
  },
];

const MEAL_TYPES = [
  { key: 'breakfast' as const, label: 'Desayuno', icon: 'sunny-outline', color: '#F59E0B' },
  { key: 'lunch' as const, label: 'Almuerzo', icon: 'restaurant-outline', color: '#10B981' },
  { key: 'dinner' as const, label: 'Cena', icon: 'moon-outline', color: '#6366F1' },
];

// ─── Meal Card ──────────────────────────────────────────────────────────────

function MealCard({
  meal,
  mealType,
  c,
}: {
  meal: Meal;
  mealType: typeof MEAL_TYPES[number];
  c: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View
      style={[styles.mealCard, { backgroundColor: c.surface, borderColor: c.grayLight }]}
      accessibilityLabel={`${mealType.label}: ${meal.name}, ${meal.calories} calorias`}
    >
      <View style={styles.mealHeader}>
        <View style={[styles.mealIconBg, { backgroundColor: mealType.color + '15' }]}>
          <Ionicons name={mealType.icon as any} size={16} color={mealType.color} />
        </View>
        <Text style={[styles.mealTypeLabel, { color: c.gray }]}>{mealType.label}</Text>
      </View>
      <View style={styles.mealBody}>
        <Text style={styles.mealEmoji}>{meal.emoji}</Text>
        <View style={styles.mealInfo}>
          <Text style={[styles.mealName, { color: c.black }]} numberOfLines={2}>{meal.name}</Text>
          <View style={styles.macroRow}>
            <Text style={[styles.mealKcal, { color: c.accent }]}>{meal.calories} kcal</Text>
            <Text style={[styles.macroPill, { color: c.gray }]}>P {meal.protein}g</Text>
            <Text style={[styles.macroPill, { color: c.gray }]}>C {meal.carbs}g</Text>
            <Text style={[styles.macroPill, { color: c.gray }]}>G {meal.fats}g</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

// ─── Main Screen ────────────────────────────────────────────────────────────

export default function MealPlanScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { sidePadding } = useLayout();
  const c = useThemeColors();
  const [selectedDay, setSelectedDay] = useState(0);

  const todayIdx = new Date().getDay(); // 0=Sun
  const adjustedIdx = todayIdx === 0 ? 6 : todayIdx - 1; // Convert to Mon=0

  const plan = WEEKLY_PLAN[selectedDay];
  const totalCal = plan.breakfast.calories + plan.lunch.calories + plan.dinner.calories;

  const handleDayPress = useCallback((idx: number) => {
    haptics.light();
    setSelectedDay(idx);
  }, []);

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: sidePadding }]}>
        <View>
          <Text style={[styles.headerTitle, { color: c.black }]}>Plan Semanal</Text>
          <Text style={[styles.headerSub, { color: c.gray }]}>Tu plan personalizado de comidas</Text>
        </View>
        <FitsiMascot expression="chef" size="small" animation="idle" />
      </View>

      {/* Day selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.dayRow, { paddingHorizontal: sidePadding }]}
      >
        {WEEKLY_PLAN.map((d, idx) => {
          const isSelected = selectedDay === idx;
          const isToday = idx === adjustedIdx;
          return (
            <TouchableOpacity
              key={d.shortDay}
              style={[
                styles.dayChip,
                { backgroundColor: isSelected ? c.black : c.surface },
                isToday && !isSelected && { borderColor: c.accent, borderWidth: 1 },
              ]}
              onPress={() => handleDayPress(idx)}
              activeOpacity={0.7}
              accessibilityLabel={`${d.day}${isToday ? ', hoy' : ''}`}
              accessibilityState={{ selected: isSelected }}
            >
              <Text style={[styles.dayText, { color: isSelected ? c.white : c.black }]}>
                {d.shortDay}
              </Text>
              {isToday && (
                <View style={[styles.todayDot, { backgroundColor: isSelected ? c.white : c.accent }]} />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Day content */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingHorizontal: sidePadding }]}
      >
        {/* Day title + total */}
        <View style={styles.dayHeader}>
          <Text style={[styles.dayTitle, { color: c.black }]}>{plan.day}</Text>
          <View style={[styles.totalBadge, { backgroundColor: c.accent + '15' }]}>
            <Text style={[styles.totalText, { color: c.accent }]}>{totalCal} kcal total</Text>
          </View>
        </View>

        {/* Meals */}
        {MEAL_TYPES.map((mt) => (
          <MealCard
            key={mt.key}
            meal={plan[mt.key]}
            mealType={mt}
            c={c}
          />
        ))}

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  headerTitle: { ...typography.titleSm },
  headerSub: { ...typography.caption, marginTop: 2 },
  dayRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingBottom: spacing.md,
  },
  dayChip: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    minWidth: 48,
    gap: 4,
  },
  dayText: {
    ...typography.label,
    fontSize: 13,
  },
  todayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  scroll: {
    paddingTop: spacing.xs,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  dayTitle: {
    ...typography.titleSm,
  },
  totalBadge: {
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  totalText: {
    ...typography.caption,
    fontWeight: '700',
  },
  mealCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  mealHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  mealIconBg: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealTypeLabel: {
    ...typography.caption,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  mealBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  mealEmoji: {
    fontSize: 40,
  },
  mealInfo: {
    flex: 1,
    gap: 4,
  },
  mealName: {
    ...typography.bodyMd,
  },
  macroRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  mealKcal: {
    ...typography.caption,
    fontWeight: '700',
  },
  macroPill: {
    ...typography.caption,
  },
});
