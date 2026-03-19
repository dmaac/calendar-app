/**
 * HomeScreen — Dashboard diario Cal AI style
 * Muestra: anillo de calorías, macros, comidas del día.
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, useLayout } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import * as foodService from '../../services/food.service';
import { AIFoodLog, DailySummary } from '../../types';

// ─── Calorie ring ─────────────────────────────────────────────────────────────

function CalorieRing({
  consumed,
  target,
  size = 160,
}: {
  consumed: number;
  target: number;
  size?: number;
}) {
  const strokeWidth = 12;
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const progress = target > 0 ? Math.min(consumed / target, 1) : 0;
  const dash = progress * circ;
  const remaining = Math.max(target - consumed, 0);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        {/* Track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.surface}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={consumed > target ? colors.protein : colors.black}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeDashoffset={circ / 4}
          strokeLinecap="round"
        />
      </Svg>
      <Text style={styles.ringCalories}>{Math.round(consumed)}</Text>
      <Text style={styles.ringUnit}>kcal</Text>
      <Text style={styles.ringRemaining}>
        {remaining > 0 ? `${Math.round(remaining)} restantes` : '¡Objetivo cumplido!'}
      </Text>
    </View>
  );
}

// ─── Macro bar ────────────────────────────────────────────────────────────────

function MacroBar({
  label,
  value,
  target,
  color,
  unit = 'g',
}: {
  label: string;
  value: number;
  target: number;
  color: string;
  unit?: string;
}) {
  const progress = target > 0 ? Math.min(value / target, 1) : 0;
  return (
    <View style={styles.macroItem}>
      <View style={styles.macroHeader}>
        <Text style={styles.macroLabel}>{label}</Text>
        <Text style={styles.macroValue}>
          {Math.round(value)}<Text style={styles.macroTarget}>/{Math.round(target)}{unit}</Text>
        </Text>
      </View>
      <View style={styles.macroTrack}>
        <View style={[styles.macroFill, { width: `${progress * 100}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

// ─── Meal section ─────────────────────────────────────────────────────────────

const MEAL_META: Record<string, { label: string; icon: string; color: string }> = {
  breakfast: { label: 'Desayuno', icon: 'sunny-outline', color: '#F59E0B' },
  lunch:     { label: 'Almuerzo', icon: 'restaurant-outline', color: '#10B981' },
  dinner:    { label: 'Cena',     icon: 'moon-outline', color: '#6366F1' },
  snack:     { label: 'Snack',    icon: 'cafe-outline', color: '#EC4899' },
};

function MealSection({
  mealType,
  logs,
}: {
  mealType: string;
  logs: AIFoodLog[];
}) {
  const meta = MEAL_META[mealType] ?? { label: mealType, icon: 'restaurant-outline', color: colors.gray };
  const total = logs.reduce((s, l) => s + l.calories, 0);

  if (logs.length === 0) return null;

  return (
    <View style={styles.mealSection}>
      <View style={styles.mealHeader}>
        <Ionicons name={meta.icon as any} size={16} color={meta.color} />
        <Text style={styles.mealTitle}>{meta.label}</Text>
        <Text style={styles.mealCalories}>{Math.round(total)} kcal</Text>
      </View>
      {logs.map((log) => (
        <View key={log.id} style={styles.foodRow}>
          <Text style={styles.foodName} numberOfLines={1}>{log.food_name}</Text>
          <Text style={styles.foodKcal}>{Math.round(log.calories)} kcal</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function HomeScreen({ navigation }: any) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { contentWidth, sidePadding } = useLayout();
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [logs, setLogs] = useState<AIFoodLog[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const [s, l] = await Promise.allSettled([
        foodService.getDailySummary(),
        foodService.getFoodLogs(),
      ]);
      if (s.status === 'fulfilled') setSummary(s.value);
      if (l.status === 'fulfilled') setLogs(l.value);
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

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 18) return 'Buenas tardes';
    return 'Buenas noches';
  };

  const consumed = summary?.total_calories ?? 0;
  const target = summary?.target_calories ?? 2000;
  const protein = summary?.total_protein_g ?? 0;
  const proteinTarget = summary?.target_protein_g ?? 150;
  const carbs = summary?.total_carbs_g ?? 0;
  const carbsTarget = summary?.target_carbs_g ?? 200;
  const fats = summary?.total_fats_g ?? 0;
  const fatsTarget = summary?.target_fats_g ?? 65;

  const mealOrder = ['breakfast', 'lunch', 'dinner', 'snack'];
  const logsByMeal: Record<string, AIFoodLog[]> = {};
  for (const mt of mealOrder) {
    logsByMeal[mt] = logs.filter((l) => l.meal_type === mt);
  }
  const hasMeals = logs.length > 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: sidePadding }]}>
        <View>
          <Text style={styles.greeting}>{greeting()},</Text>
          <Text style={styles.userName}>{user?.first_name || 'Usuario'} 👋</Text>
        </View>
        <TouchableOpacity
          style={styles.scanBtn}
          onPress={() => navigation.navigate('Escanear')}
        >
          <Ionicons name="camera" size={20} color={colors.white} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingHorizontal: sidePadding }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Calorie card */}
        <View style={styles.card}>
          <View style={styles.ringRow}>
            <CalorieRing consumed={consumed} target={target} />
            <View style={styles.macros}>
              <MacroBar label="Proteína" value={protein} target={proteinTarget} color={colors.protein} />
              <MacroBar label="Carbos" value={carbs} target={carbsTarget} color={colors.carbs} />
              <MacroBar label="Grasas" value={fats} target={fatsTarget} color={colors.fats} />
            </View>
          </View>
        </View>

        {/* Today's meals */}
        <Text style={styles.sectionTitle}>Hoy</Text>
        {hasMeals ? (
          <View style={styles.card}>
            {mealOrder.map((mt) => (
              <MealSection key={mt} mealType={mt} logs={logsByMeal[mt]} />
            ))}
          </View>
        ) : (
          <View style={[styles.card, styles.emptyCard]}>
            <Ionicons name="restaurant-outline" size={36} color={colors.grayLight} />
            <Text style={styles.emptyText}>Sin comidas registradas</Text>
            <Text style={styles.emptyHint}>Escanea tu comida con la cámara</Text>
            <TouchableOpacity
              style={styles.scanCta}
              onPress={() => navigation.navigate('Escanear')}
            >
              <Ionicons name="camera-outline" size={18} color={colors.white} />
              <Text style={styles.scanCtaText}>Escanear ahora</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  greeting: {
    ...typography.caption,
    color: colors.gray,
  },
  userName: {
    ...typography.titleSm,
    color: colors.black,
    marginTop: 2,
  },
  scanBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    paddingTop: spacing.sm,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.grayLight,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  ringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  ringCalories: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.black,
    textAlign: 'center',
  },
  ringUnit: {
    ...typography.caption,
    color: colors.gray,
    textAlign: 'center',
  },
  ringRemaining: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.accent,
    textAlign: 'center',
    marginTop: 2,
  },
  macros: {
    flex: 1,
    gap: spacing.sm,
  },
  macroItem: {
    gap: 4,
  },
  macroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  macroLabel: {
    ...typography.caption,
    color: colors.gray,
  },
  macroValue: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.black,
  },
  macroTarget: {
    fontWeight: '400',
    color: colors.gray,
  },
  macroTrack: {
    height: 5,
    backgroundColor: colors.surface,
    borderRadius: 3,
    overflow: 'hidden',
  },
  macroFill: {
    height: 5,
    borderRadius: 3,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.black,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  mealSection: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface,
  },
  mealHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 6,
  },
  mealTitle: {
    ...typography.label,
    color: colors.black,
    flex: 1,
  },
  mealCalories: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.black,
  },
  foodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
    paddingLeft: spacing.md,
  },
  foodName: {
    ...typography.caption,
    color: colors.gray,
    flex: 1,
  },
  foodKcal: {
    ...typography.caption,
    color: colors.gray,
    fontWeight: '600',
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  emptyText: {
    ...typography.bodyMd,
    color: colors.black,
  },
  emptyHint: {
    ...typography.caption,
    color: colors.gray,
  },
  scanCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.black,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
    marginTop: spacing.sm,
  },
  scanCtaText: {
    ...typography.label,
    color: colors.white,
  },
});
