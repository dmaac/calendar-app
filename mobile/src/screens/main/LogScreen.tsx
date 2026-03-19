/**
 * LogScreen — Diario de alimentos del día
 * Muestra las comidas agrupadas por tipo, permite eliminar registros.
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, useLayout } from '../../theme';
import * as foodService from '../../services/food.service';
import { AIFoodLog, DailySummary } from '../../types';

const MEAL_META: Record<string, { label: string; icon: string; color: string }> = {
  breakfast: { label: 'Desayuno', icon: 'sunny-outline',     color: '#F59E0B' },
  lunch:     { label: 'Almuerzo', icon: 'restaurant-outline', color: '#10B981' },
  dinner:    { label: 'Cena',     icon: 'moon-outline',       color: '#6366F1' },
  snack:     { label: 'Snack',    icon: 'cafe-outline',       color: '#EC4899' },
};
const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];

export default function LogScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { sidePadding } = useLayout();
  const [logs, setLogs] = useState<AIFoodLog[]>([]);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const [l, s] = await Promise.allSettled([
        foodService.getFoodLogs(),
        foodService.getDailySummary(),
      ]);
      if (l.status === 'fulfilled') setLogs(l.value);
      if (s.status === 'fulfilled') setSummary(s.value);
    } catch {}
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleDelete = (log: AIFoodLog) => {
    Alert.alert(
      'Eliminar registro',
      `¿Eliminar "${log.food_name}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await foodService.deleteFoodLog(log.id);
              setLogs((prev) => prev.filter((l) => l.id !== log.id));
            } catch {
              Alert.alert('Error', 'No se pudo eliminar el registro.');
            }
          },
        },
      ]
    );
  };

  const consumed = summary?.total_calories ?? 0;
  const target = summary?.target_calories ?? 2000;

  const logsByMeal: Record<string, AIFoodLog[]> = {};
  for (const mt of MEAL_ORDER) {
    logsByMeal[mt] = logs.filter((l) => l.meal_type === mt);
  }

  const today = new Date().toLocaleDateString('es', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: sidePadding }]}>
        <View>
          <Text style={styles.headerTitle}>Registro</Text>
          <Text style={styles.headerDate}>{today}</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => navigation.navigate('Escanear')}>
          <Ionicons name="add" size={22} color={colors.white} />
        </TouchableOpacity>
      </View>

      {/* Calorie summary strip */}
      <View style={[styles.summaryStrip, { marginHorizontal: sidePadding }]}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{Math.round(consumed)}</Text>
          <Text style={styles.summaryLabel}>consumidas</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{Math.round(target)}</Text>
          <Text style={styles.summaryLabel}>objetivo</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: colors.success }]}>
            {Math.max(0, Math.round(target - consumed))}
          </Text>
          <Text style={styles.summaryLabel}>restantes</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingHorizontal: sidePadding }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {MEAL_ORDER.map((mt) => {
          const meta = MEAL_META[mt];
          const mealLogs = logsByMeal[mt];
          const mealTotal = mealLogs.reduce((s, l) => s + l.calories, 0);

          return (
            <View key={mt} style={styles.mealCard}>
              {/* Meal header */}
              <View style={styles.mealHeader}>
                <View style={[styles.mealIconBg, { backgroundColor: meta.color + '20' }]}>
                  <Ionicons name={meta.icon as any} size={18} color={meta.color} />
                </View>
                <Text style={styles.mealTitle}>{meta.label}</Text>
                {mealLogs.length > 0 && (
                  <Text style={styles.mealKcal}>{Math.round(mealTotal)} kcal</Text>
                )}
              </View>

              {/* Food items */}
              {mealLogs.length > 0 ? (
                mealLogs.map((log) => (
                  <View key={log.id} style={styles.foodRow}>
                    <View style={styles.foodInfo}>
                      <Text style={styles.foodName} numberOfLines={1}>{log.food_name}</Text>
                      <View style={styles.macroPills}>
                        <Text style={styles.macroPill}>P {Math.round(log.protein_g)}g</Text>
                        <Text style={styles.macroPill}>C {Math.round(log.carbs_g)}g</Text>
                        <Text style={styles.macroPill}>G {Math.round(log.fats_g)}g</Text>
                      </View>
                    </View>
                    <View style={styles.foodRight}>
                      <Text style={styles.foodKcal}>{Math.round(log.calories)}</Text>
                      <Text style={styles.foodKcalUnit}>kcal</Text>
                      <TouchableOpacity onPress={() => handleDelete(log)} style={styles.deleteBtn}>
                        <Ionicons name="trash-outline" size={14} color={colors.gray} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              ) : (
                <TouchableOpacity
                  style={styles.emptyMeal}
                  onPress={() => navigation.navigate('Escanear')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="add-circle-outline" size={16} color={colors.gray} />
                  <Text style={styles.emptyMealText}>Añadir {meta.label.toLowerCase()}</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  headerTitle: { ...typography.titleSm, color: colors.black },
  headerDate: { ...typography.caption, color: colors.gray, marginTop: 2, textTransform: 'capitalize' },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryStrip: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { ...typography.titleSm, color: colors.black },
  summaryLabel: { ...typography.caption, color: colors.gray, marginTop: 2 },
  summaryDivider: { width: 1, height: 28, backgroundColor: colors.grayLight },
  scroll: { paddingTop: spacing.xs },
  mealCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.grayLight,
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
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealTitle: { ...typography.label, color: colors.black, flex: 1 },
  mealKcal: { ...typography.caption, fontWeight: '700', color: colors.black },
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.surface,
  },
  foodInfo: { flex: 1 },
  foodName: { ...typography.bodyMd, color: colors.black, marginBottom: 2 },
  macroPills: { flexDirection: 'row', gap: spacing.xs },
  macroPill: { ...typography.caption, color: colors.gray },
  foodRight: { alignItems: 'flex-end', gap: 2 },
  foodKcal: { ...typography.label, color: colors.black },
  foodKcalUnit: { ...typography.caption, color: colors.gray },
  deleteBtn: { padding: 4, marginTop: 2 },
  emptyMeal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  emptyMealText: { ...typography.caption, color: colors.gray },
});
