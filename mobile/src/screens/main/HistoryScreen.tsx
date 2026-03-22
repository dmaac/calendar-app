/**
 * HistoryScreen — Historial de días anteriores
 * Navega día a día · Muestra totales + comidas agrupadas por tipo
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useThemeColors, typography, spacing, radius, shadows, useLayout, mealColors,
} from '../../theme';
import * as foodService from '../../services/food.service';
import { AIFoodLog, DailySummary } from '../../types';
import FitsiMascot from '../../components/FitsiMascot';
import { haptics } from '../../hooks/useHaptics';

const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

// ─── Mock data for offline / backend unavailable ─────────────────────────────
const MOCK_HISTORY_SUMMARY: DailySummary = {
  date: '', total_calories: 1850, total_protein_g: 110, total_carbs_g: 185, total_fats_g: 55,
  target_calories: 2100, target_protein_g: 150, target_carbs_g: 210, target_fats_g: 70,
  water_ml: 2000, meals_logged: 4, streak_days: 3,
};

const MOCK_HISTORY_LOGS: AIFoodLog[] = [
  { id: -10, logged_at: '', meal_type: 'breakfast', food_name: 'Tostadas con palta', calories: 350, carbs_g: 38, protein_g: 10, fats_g: 18, fiber_g: 7, image_url: null, ai_confidence: 0.93, was_edited: false },
  { id: -11, logged_at: '', meal_type: 'lunch', food_name: 'Pasta con bolognesa', calories: 620, carbs_g: 72, protein_g: 32, fats_g: 18, fiber_g: 4, image_url: null, ai_confidence: 0.90, was_edited: false },
  { id: -12, logged_at: '', meal_type: 'dinner', food_name: 'Sopa de lentejas', calories: 380, carbs_g: 45, protein_g: 22, fats_g: 8, fiber_g: 12, image_url: null, ai_confidence: 0.87, was_edited: false },
  { id: -13, logged_at: '', meal_type: 'snack', food_name: 'Manzana con mantequilla de mani', calories: 250, carbs_g: 30, protein_g: 6, fats_g: 14, fiber_g: 5, image_url: null, ai_confidence: 0.94, was_edited: false },
];

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function displayDate(d: Date): string {
  const today = new Date();
  const yesterday = addDays(today, -1);
  if (formatDate(d) === formatDate(today))     return 'Hoy';
  if (formatDate(d) === formatDate(yesterday)) return 'Ayer';
  return d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function HistoryScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { sidePadding } = useLayout();
  const c = useThemeColors();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [logs, setLogs]       = useState<AIFoodLog[]>([]);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  const isToday = formatDate(currentDate) === formatDate(new Date());

  const load = useCallback(async (date: Date) => {
    setLoading(true);
    setError(false);
    try {
      const dateStr = formatDate(date);
      const [l, s] = await Promise.allSettled([
        foodService.getFoodLogs(dateStr),
        foodService.getDailySummary(dateStr),
      ]);

      const logsOk = l.status === 'fulfilled';
      const summaryOk = s.status === 'fulfilled';

      if (logsOk) setLogs(l.value);
      if (summaryOk) setSummary(s.value);

      // Fall back to mock data when API is unavailable
      if (!logsOk && !summaryOk) {
        setError(true);
        setLogs(MOCK_HISTORY_LOGS);
        setSummary({ ...MOCK_HISTORY_SUMMARY, date: dateStr });
      } else if (!logsOk) {
        setError(true);
        setLogs(MOCK_HISTORY_LOGS);
      } else if (!summaryOk) {
        setSummary(null);
      }
    } catch {
      setError(true);
      const dateStr = formatDate(date);
      setLogs(MOCK_HISTORY_LOGS);
      setSummary({ ...MOCK_HISTORY_SUMMARY, date: dateStr });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(currentDate); }, [currentDate]);

  const goToDay = (n: number) => {
    const next = addDays(currentDate, n);
    if (next > new Date()) return; // sin futuro
    haptics.light();
    setCurrentDate(next);
  };

  const logsByMeal: Record<string, AIFoodLog[]> = {};
  for (const mt of MEAL_ORDER) {
    logsByMeal[mt] = logs.filter((l) => l.meal_type === mt);
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: sidePadding }]}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: c.surface }]} onPress={() => { haptics.light(); navigation.goBack(); }}>
          <Ionicons name="arrow-back" size={20} color={c.black} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.black }]}>Historial</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Navegador de fechas */}
      <View style={[styles.dateNav, { marginHorizontal: sidePadding, backgroundColor: c.surface }]}>
        <TouchableOpacity onPress={() => goToDay(-1)} style={styles.navBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={c.black} />
        </TouchableOpacity>
        <Text style={[styles.dateLabel, { color: c.black }]}>{displayDate(currentDate)}</Text>
        <TouchableOpacity
          onPress={() => goToDay(1)}
          style={[styles.navBtn, isToday && { opacity: 0.25 }]}
          disabled={isToday}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-forward" size={22} color={c.black} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={c.black} />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { paddingHorizontal: sidePadding }]}
        >
          {/* Error banner with mock data indicator */}
          {error && (
            <TouchableOpacity
              style={[styles.errorBanner, { backgroundColor: c.accent }]}
              onPress={() => load(currentDate)}
              activeOpacity={0.8}
            >
              <Ionicons name="wifi-outline" size={14} color={c.white} />
              <Text style={[styles.errorText, { color: c.white }]}>Sin conexion -- datos de ejemplo. Toca para reintentar</Text>
            </TouchableOpacity>
          )}

          {/* Resumen del día */}
          {summary && (
            <View style={[styles.summaryCard, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: c.black }]}>{Math.round(summary.total_calories)}</Text>
                <Text style={[styles.summaryLabel, { color: c.gray }]}>kcal</Text>
              </View>
              <View style={[styles.summaryDivider, { backgroundColor: c.grayLight }]} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: c.protein }]}>
                  {Math.round(summary.total_protein_g)}g
                </Text>
                <Text style={[styles.summaryLabel, { color: c.gray }]}>proteína</Text>
              </View>
              <View style={[styles.summaryDivider, { backgroundColor: c.grayLight }]} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: c.carbs }]}>
                  {Math.round(summary.total_carbs_g)}g
                </Text>
                <Text style={[styles.summaryLabel, { color: c.gray }]}>carbos</Text>
              </View>
              <View style={[styles.summaryDivider, { backgroundColor: c.grayLight }]} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: c.fats }]}>
                  {Math.round(summary.total_fats_g)}g
                </Text>
                <Text style={[styles.summaryLabel, { color: c.gray }]}>grasas</Text>
              </View>
            </View>
          )}

          {/* Comidas / empty state */}
          {logs.length === 0 ? (
            <View style={styles.empty}>
              <FitsiMascot expression="question" size="medium" animation="thinking" />
              <Text style={[styles.emptyTitle, { color: c.black }]}>No hay datos para este dia</Text>
              <Text style={[styles.emptyText, { color: c.gray }]}>Parece que no registraste nada. Vuelve al dia de hoy para empezar.</Text>
            </View>
          ) : (
            MEAL_ORDER.map((mt) => {
              const meta     = mealColors[mt];
              const mealLogs = logsByMeal[mt];
              if (mealLogs.length === 0) return null;
              const total = mealLogs.reduce((s, l) => s + l.calories, 0);
              return (
                <View key={mt} style={[styles.mealCard, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
                  <View style={styles.mealHeader}>
                    <View style={[styles.mealIconBg, { backgroundColor: meta.color + '20' }]}>
                      <Ionicons name={meta.icon as any} size={16} color={meta.color} />
                    </View>
                    <Text style={[styles.mealTitle, { color: c.black }]}>{meta.label}</Text>
                    <Text style={[styles.mealTotal, { color: c.black }]}>{Math.round(total)} kcal</Text>
                  </View>
                  {mealLogs.map((log) => (
                    <View key={log.id} style={[styles.foodRow, { borderTopColor: c.grayLight }]}>
                      <View style={styles.foodInfo}>
                        <Text style={[styles.foodName, { color: c.black }]} numberOfLines={1}>{log.food_name}</Text>
                        <Text style={[styles.foodMacros, { color: c.gray }]}>
                          P {Math.round(log.protein_g)}g · C {Math.round(log.carbs_g)}g · G {Math.round(log.fats_g)}g
                        </Text>
                      </View>
                      <Text style={[styles.foodKcal, { color: c.black }]}>{Math.round(log.calories)} kcal</Text>
                    </View>
                  ))}
                </View>
              );
            })
          )}

          <View style={{ height: spacing.xl }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { ...typography.titleSm },
  dateNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: radius.md,
    paddingVertical: spacing.xs, paddingHorizontal: spacing.xs,
    marginBottom: spacing.md,
  },
  navBtn: { padding: spacing.sm },
  dateLabel: { ...typography.label, textTransform: 'capitalize' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginTop: spacing.md,
  },
  errorText: { ...typography.caption, flex: 1 },
  scroll: { paddingTop: spacing.xs },
  summaryCard: {
    flexDirection: 'row',
    borderRadius: radius.lg, borderWidth: 1,
    padding: spacing.md, marginBottom: spacing.md,
    alignItems: 'center', ...shadows.sm,
  },
  summaryItem: { flex: 1, alignItems: 'center', gap: 2 },
  summaryValue: { ...typography.titleSm },
  summaryLabel: { ...typography.caption },
  summaryDivider: { width: 1, height: 28 },
  empty: {
    alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.sm,
  },
  emptyTitle: { ...typography.bodyMd, marginTop: spacing.sm },
  emptyText: { ...typography.caption, textAlign: 'center', paddingHorizontal: spacing.md },
  mealCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md, marginBottom: spacing.sm, ...shadows.sm,
  },
  mealHeader: {
    flexDirection: 'row', alignItems: 'center',
    gap: spacing.sm, marginBottom: spacing.sm,
  },
  mealIconBg: {
    width: 30, height: 30, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  mealTitle: { ...typography.label, flex: 1 },
  mealTotal: { ...typography.caption, fontWeight: '700' },
  foodRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.xs, borderTopWidth: 1,
  },
  foodInfo: { flex: 1 },
  foodName: { ...typography.bodyMd, marginBottom: 2 },
  foodMacros: { ...typography.caption },
  foodKcal: { ...typography.label },
});
