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
  colors, typography, spacing, radius, shadows, useLayout, mealColors,
} from '../../theme';
import * as foodService from '../../services/food.service';
import { AIFoodLog, DailySummary } from '../../types';

const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
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
      if (l.status === 'fulfilled') setLogs(l.value);   else setError(true);
      if (s.status === 'fulfilled') setSummary(s.value); else setSummary(null);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(currentDate); }, [currentDate]);

  const goToDay = (n: number) => {
    const next = addDays(currentDate, n);
    if (next > new Date()) return; // sin futuro
    setCurrentDate(next);
  };

  const logsByMeal: Record<string, AIFoodLog[]> = {};
  for (const mt of MEAL_ORDER) {
    logsByMeal[mt] = logs.filter((l) => l.meal_type === mt);
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: sidePadding }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={colors.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Historial</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Navegador de fechas */}
      <View style={[styles.dateNav, { marginHorizontal: sidePadding }]}>
        <TouchableOpacity onPress={() => goToDay(-1)} style={styles.navBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={colors.black} />
        </TouchableOpacity>
        <Text style={styles.dateLabel}>{displayDate(currentDate)}</Text>
        <TouchableOpacity
          onPress={() => goToDay(1)}
          style={[styles.navBtn, isToday && { opacity: 0.25 }]}
          disabled={isToday}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-forward" size={22} color={colors.black} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.black} />
        </View>
      ) : error ? (
        <TouchableOpacity
          style={[styles.errorBanner, { marginHorizontal: sidePadding }]}
          onPress={() => load(currentDate)}
          activeOpacity={0.8}
        >
          <Ionicons name="wifi-outline" size={14} color={colors.white} />
          <Text style={styles.errorText}>No se pudo cargar. Toca para reintentar</Text>
        </TouchableOpacity>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { paddingHorizontal: sidePadding }]}
        >
          {/* Resumen del día */}
          {summary && (
            <View style={styles.summaryCard}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{Math.round(summary.total_calories)}</Text>
                <Text style={styles.summaryLabel}>kcal</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: colors.protein }]}>
                  {Math.round(summary.total_protein_g)}g
                </Text>
                <Text style={styles.summaryLabel}>proteína</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: colors.carbs }]}>
                  {Math.round(summary.total_carbs_g)}g
                </Text>
                <Text style={styles.summaryLabel}>carbos</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: colors.fats }]}>
                  {Math.round(summary.total_fats_g)}g
                </Text>
                <Text style={styles.summaryLabel}>grasas</Text>
              </View>
            </View>
          )}

          {/* Comidas / empty state */}
          {logs.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="restaurant-outline" size={44} color={colors.grayLight} />
              <Text style={styles.emptyText}>Sin registros para este día</Text>
            </View>
          ) : (
            MEAL_ORDER.map((mt) => {
              const meta     = mealColors[mt];
              const mealLogs = logsByMeal[mt];
              if (mealLogs.length === 0) return null;
              const total = mealLogs.reduce((s, l) => s + l.calories, 0);
              return (
                <View key={mt} style={styles.mealCard}>
                  <View style={styles.mealHeader}>
                    <View style={[styles.mealIconBg, { backgroundColor: meta.color + '20' }]}>
                      <Ionicons name={meta.icon as any} size={16} color={meta.color} />
                    </View>
                    <Text style={styles.mealTitle}>{meta.label}</Text>
                    <Text style={styles.mealTotal}>{Math.round(total)} kcal</Text>
                  </View>
                  {mealLogs.map((log) => (
                    <View key={log.id} style={styles.foodRow}>
                      <View style={styles.foodInfo}>
                        <Text style={styles.foodName} numberOfLines={1}>{log.food_name}</Text>
                        <Text style={styles.foodMacros}>
                          P {Math.round(log.protein_g)}g · C {Math.round(log.carbs_g)}g · G {Math.round(log.fats_g)}g
                        </Text>
                      </View>
                      <Text style={styles.foodKcal}>{Math.round(log.calories)} kcal</Text>
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
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { ...typography.titleSm, color: colors.black },
  dateNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surface, borderRadius: radius.md,
    paddingVertical: spacing.xs, paddingHorizontal: spacing.xs,
    marginBottom: spacing.md,
  },
  navBtn: { padding: spacing.sm },
  dateLabel: { ...typography.label, color: colors.black, textTransform: 'capitalize' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.accent, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginTop: spacing.md,
  },
  errorText: { ...typography.caption, color: colors.white, flex: 1 },
  scroll: { paddingTop: spacing.xs },
  summaryCard: {
    flexDirection: 'row', backgroundColor: colors.white,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.grayLight,
    padding: spacing.md, marginBottom: spacing.md,
    alignItems: 'center', ...shadows.sm,
  },
  summaryItem: { flex: 1, alignItems: 'center', gap: 2 },
  summaryValue: { ...typography.titleSm, color: colors.black },
  summaryLabel: { ...typography.caption, color: colors.gray },
  summaryDivider: { width: 1, height: 28, backgroundColor: colors.grayLight },
  empty: {
    alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.sm,
  },
  emptyText: { ...typography.bodyMd, color: colors.gray },
  mealCard: {
    backgroundColor: colors.white, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.grayLight,
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
  mealTitle: { ...typography.label, color: colors.black, flex: 1 },
  mealTotal: { ...typography.caption, fontWeight: '700', color: colors.black },
  foodRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.xs, borderTopWidth: 1, borderTopColor: colors.surface,
  },
  foodInfo: { flex: 1 },
  foodName: { ...typography.bodyMd, color: colors.black, marginBottom: 2 },
  foodMacros: { ...typography.caption, color: colors.gray },
  foodKcal: { ...typography.label, color: colors.black },
});
