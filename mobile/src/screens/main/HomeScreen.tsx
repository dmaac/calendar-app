/**
 * HomeScreen — Dashboard diario
 * Dark premium redesign — norte.digital aesthetic
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, useLayout, mealColors } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import * as foodService from '../../services/food.service';
import { AIFoodLog, DailySummary } from '../../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function formatDate(): string {
  const d = new Date();
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

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
  const strokeWidth = 10;
  const glowWidth = 18;
  const r = (size - glowWidth) / 2;
  const circ = 2 * Math.PI * r;
  const progress = target > 0 ? Math.min(consumed / target, 1) : 0;
  const dash = progress * circ;
  const over = consumed > target;
  const strokeColor = over ? colors.accent : colors.primary;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        {/* Track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.surfaceHigh}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Glow layer (wider, low opacity) */}
        {progress > 0 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={strokeColor}
            strokeWidth={glowWidth}
            strokeOpacity={0.15}
            fill="none"
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeDashoffset={circ / 4}
            strokeLinecap="round"
          />
        )}
        {/* Progress */}
        {progress > 0 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeDashoffset={circ / 4}
            strokeLinecap="round"
          />
        )}
      </Svg>
      <Text style={styles.ringCalories}>{Math.round(consumed)}</Text>
      <Text style={styles.ringUnit}>kcal</Text>
    </View>
  );
}

// ─── Macro chip ───────────────────────────────────────────────────────────────

function MacroChip({
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
    <View style={styles.macroChip}>
      <View style={styles.macroChipDot}>
        <View style={[styles.macroChipDotFill, { backgroundColor: color }]} />
      </View>
      <Text style={styles.macroChipLabel}>{label}</Text>
      <Text style={styles.macroChipValue}>
        <Text style={{ color: colors.white, fontWeight: '700' }}>{Math.round(value)}</Text>
        <Text style={{ color: colors.textMuted }}>/{Math.round(target)}{unit}</Text>
      </Text>
      <View style={styles.macroChipTrack}>
        <View style={[styles.macroChipFill, { width: `${progress * 100}%` as any, backgroundColor: color }]} />
      </View>
    </View>
  );
}

// ─── Meal section ─────────────────────────────────────────────────────────────

function MealSection({
  mealType,
  logs,
}: {
  mealType: string;
  logs: AIFoodLog[];
}) {
  const meta = mealColors[mealType] ?? { label: mealType, icon: 'restaurant-outline', color: colors.textSecondary };
  const total = logs.reduce((s, l) => s + l.calories, 0);

  if (logs.length === 0) return null;

  return (
    <View style={styles.mealSection}>
      <View style={styles.mealHeader}>
        <View style={[styles.mealIconDot, { backgroundColor: meta.color + '22' }]}>
          <Ionicons name={meta.icon as any} size={13} color={meta.color} />
        </View>
        <Text style={styles.mealTitle}>{meta.label}</Text>
        <Text style={[styles.mealCalories, { color: meta.color }]}>{Math.round(total)} kcal</Text>
      </View>
      {logs.map((log) => (
        <View key={log.id} style={styles.foodRow}>
          <View style={styles.foodDash} />
          <Text style={styles.foodName} numberOfLines={1}>{log.food_name}</Text>
          <Text style={styles.foodKcal}>{Math.round(log.calories)}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function HomeScreen({ navigation }: any) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { sidePadding } = useLayout();
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [logs, setLogs] = useState<AIFoodLog[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = async () => {
    setError(false);
    try {
      const [s, l] = await Promise.allSettled([
        foodService.getDailySummary(),
        foodService.getFoodLogs(),
      ]);
      if (s.status === 'fulfilled') setSummary(s.value);
      else setError(true);
      if (l.status === 'fulfilled') setLogs(l.value);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const consumed      = summary?.total_calories     ?? 0;
  const target        = summary?.target_calories     ?? 2000;
  const protein       = summary?.total_protein_g     ?? 0;
  const proteinTarget = summary?.target_protein_g    ?? 150;
  const carbs         = summary?.total_carbs_g       ?? 0;
  const carbsTarget   = summary?.target_carbs_g      ?? 200;
  const fats          = summary?.total_fats_g        ?? 0;
  const fatsTarget    = summary?.target_fats_g       ?? 65;
  const streak        = summary?.streak_days         ?? 0;
  const remaining     = Math.max(target - consumed, 0);

  const mealOrder = ['breakfast', 'lunch', 'dinner', 'snack'];
  const logsByMeal: Record<string, AIFoodLog[]> = {};
  for (const mt of mealOrder) {
    logsByMeal[mt] = logs.filter((l) => l.meal_type === mt);
  }
  const hasMeals = logs.length > 0;

  // Extra bottom padding so content clears the floating tab bar
  const tabBarOffset = 64 + insets.bottom + 12 + spacing.xl;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: sidePadding }]}>
        <View>
          <Text style={styles.headerDate}>{formatDate()}</Text>
          <Text style={styles.headerName}>{user?.first_name || 'Hola'}</Text>
        </View>
        <View style={styles.headerRight}>
          {streak > 0 && (
            <View style={styles.streakBadge}>
              <Ionicons name="flame" size={13} color={colors.accent} />
              <Text style={styles.streakCount}>{streak}</Text>
            </View>
          )}
          <TouchableOpacity
            style={styles.scanBtn}
            onPress={() => navigation.navigate('Escanear')}
            activeOpacity={0.8}
          >
            <Ionicons name="camera" size={18} color={colors.white} />
          </TouchableOpacity>
        </View>
      </View>

      {loading && !refreshing ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <>
          {error && (
            <TouchableOpacity
              style={[styles.errorBanner, { marginHorizontal: sidePadding }]}
              onPress={() => { setLoading(true); load(); }}
              activeOpacity={0.8}
            >
              <Ionicons name="wifi-outline" size={14} color={colors.white} />
              <Text style={styles.errorBannerText}>Sin conexión — toca para reintentar</Text>
            </TouchableOpacity>
          )}

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.scroll, { paddingHorizontal: sidePadding, paddingBottom: tabBarOffset }]}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.primary}
              />
            }
          >
            {/* ── Calorie card ── */}
            <View style={styles.calorieCard}>
              <View style={styles.ringRow}>
                <CalorieRing consumed={consumed} target={target} />
                <View style={styles.ringInfo}>
                  <Text style={styles.ringBigNumber}>{Math.round(remaining)}</Text>
                  <Text style={styles.ringLabel}>kcal restantes</Text>
                  <View style={styles.ringDivider} />
                  <Text style={styles.ringSubLabel}>
                    <Text style={{ color: colors.white, fontWeight: '700' }}>{Math.round(consumed)}</Text>
                    <Text style={{ color: colors.textMuted }}> / {Math.round(target)}</Text>
                  </Text>
                  <Text style={styles.ringSubUnit}>consumidas</Text>
                </View>
              </View>

              {/* Macros row */}
              <View style={styles.macrosRow}>
                <MacroChip label="Prot." value={protein} target={proteinTarget} color={colors.protein} />
                <View style={styles.macroDivider} />
                <MacroChip label="Carbos" value={carbs} target={carbsTarget} color={colors.carbs} />
                <View style={styles.macroDivider} />
                <MacroChip label="Grasas" value={fats} target={fatsTarget} color={colors.fats} />
              </View>
            </View>

            {/* ── Meals ── */}
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>HOY</Text>
              {hasMeals && (
                <Text style={styles.sectionMeta}>{logs.length} registros</Text>
              )}
            </View>

            {hasMeals ? (
              <View style={styles.mealsCard}>
                {mealOrder.map((mt, i) =>
                  logsByMeal[mt].length > 0 ? (
                    <View key={mt}>
                      {i > 0 && <View style={styles.mealDivider} />}
                      <MealSection mealType={mt} logs={logsByMeal[mt]} />
                    </View>
                  ) : null
                )}
              </View>
            ) : (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIconWrap}>
                  <Ionicons name="restaurant-outline" size={28} color={colors.textMuted} />
                </View>
                <Text style={styles.emptyText}>Sin registros</Text>
                <Text style={styles.emptyHint}>Escanea tu comida con la cámara</Text>
                <TouchableOpacity
                  style={styles.scanCta}
                  onPress={() => navigation.navigate('Escanear')}
                  activeOpacity={0.85}
                >
                  <Ionicons name="camera-outline" size={16} color={colors.white} />
                  <Text style={styles.scanCtaText}>Escanear ahora</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  loadingOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accentDim,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent + '40',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  errorBannerText: {
    ...typography.caption,
    color: colors.accent,
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerDate: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
  },
  headerName: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accentDim,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.accent + '30',
  },
  streakCount: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.accent,
  },
  scanBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 10,
      },
      android: { elevation: 6 },
    }),
  },

  scroll: {
    paddingTop: spacing.sm,
  },

  // Calorie card
  calorieCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.primary + '30',  // blue border subtle
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  ringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  ringInfo: {
    flex: 1,
  },
  ringBigNumber: {
    fontSize: 44,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: -1.5,
    lineHeight: 48,
  },
  ringLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    marginTop: 2,
    letterSpacing: 0.2,
  },
  ringDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  ringSubLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  ringSubUnit: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 1,
  },
  ringCalories: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.white,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  ringUnit: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  // Macros row
  macrosRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
  },
  macroChip: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  macroChipDot: {
    marginBottom: 2,
  },
  macroChipDotFill: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  macroChipLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  macroChipValue: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  macroChipTrack: {
    width: '80%',
    height: 3,
    backgroundColor: colors.surfaceHigh,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 3,
  },
  macroChipFill: {
    height: 3,
    borderRadius: 2,
  },
  macroDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginHorizontal: 4,
  },

  // Section header
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1.2,
  },
  sectionMeta: {
    fontSize: 11,
    color: colors.textMuted,
  },

  // Meals card
  mealsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.xs,
    overflow: 'hidden',
  },
  mealDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
  mealSection: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  mealHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 6,
  },
  mealIconDot: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealTitle: {
    ...typography.label,
    color: colors.white,
    flex: 1,
  },
  mealCalories: {
    fontSize: 12,
    fontWeight: '700',
  },
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 3,
    paddingLeft: 4,
  },
  foodDash: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.textMuted,
    marginLeft: spacing.sm,
  },
  foodName: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  foodKcal: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },

  // Empty state
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  emptyText: {
    ...typography.bodyMd,
    color: colors.white,
    fontWeight: '700',
  },
  emptyHint: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  scanCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
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
