/**
 * HomeScreen — Dashboard diario Fitsi IA style
 * Muestra: anillo de calorías, macros, comidas del día.
 *
 * UX Polish:
 * - Skeleton shimmer loading instead of spinner
 * - Animated calorie number counting
 * - Fade-in content animation on data load
 * - Haptic feedback on scan button and refresh
 * - Full accessibility labels and roles
 * - User-friendly error state with retry
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Platform,
  Animated,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, useLayout, mealColors } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import * as foodService from '../../services/food.service';
import { AIFoodLog, DailySummary } from '../../types';
import { HomeSkeleton } from '../../components/SkeletonLoader';
import AnimatedNumber from '../../components/AnimatedNumber';
import useFadeIn from '../../hooks/useFadeIn';
import { haptics } from '../../hooks/useHaptics';

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
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      accessibilityLabel={`${Math.round(consumed)} de ${Math.round(target)} kilocalorías consumidas, ${Math.round(remaining)} restantes`}
      accessibilityRole="progressbar"
    >
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
      <AnimatedNumber value={consumed} style={styles.ringCalories} />
      <Text style={styles.ringUnit}>kcal</Text>
      <Text style={styles.ringRemaining}>
        {remaining > 0 ? `${Math.round(remaining)} restantes` : 'Objetivo cumplido'}
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

  // Animated fill width
  const fillAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fillAnim, {
      toValue: progress,
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const fillWidth = fillAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View
      style={styles.macroItem}
      accessibilityLabel={`${label}: ${Math.round(value)} de ${Math.round(target)} ${unit}`}
      accessibilityRole="progressbar"
    >
      <View style={styles.macroHeader}>
        <Text style={styles.macroLabel}>{label}</Text>
        <Text style={styles.macroValue}>
          {Math.round(value)}<Text style={styles.macroTarget}>/{Math.round(target)}{unit}</Text>
        </Text>
      </View>
      <View style={styles.macroTrack}>
        <Animated.View style={[styles.macroFill, { width: fillWidth as any, backgroundColor: color }]} />
      </View>
    </View>
  );
}

// ─── Meal section ─────────────────────────────────────────────────────────────

const MEAL_META = mealColors;

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
    <View
      style={styles.mealSection}
      accessibilityLabel={`${meta.label}: ${Math.round(total)} kilocalorías, ${logs.length} alimento${logs.length > 1 ? 's' : ''}`}
    >
      <View style={styles.mealHeader}>
        <Ionicons name={meta.icon as any} size={16} color={meta.color} />
        <Text style={styles.mealTitle}>{meta.label}</Text>
        <Text style={styles.mealCalories}>{Math.round(total)} kcal</Text>
      </View>
      {logs.map((log) => (
        <View
          key={log.id}
          style={styles.foodRow}
          accessibilityLabel={`${log.food_name}, ${Math.round(log.calories)} kilocalorías`}
        >
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Fade-in animation for content
  const fadeStyle = useFadeIn(!loading && !error);

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
    haptics.light();
    await load();
    haptics.success();
    setRefreshing(false);
  };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos dias';
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

  const streak = summary?.streak_days ?? 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: sidePadding }]}>
        <View accessibilityRole="header">
          <Text style={styles.greeting}>{greeting()},</Text>
          <Text style={styles.userName}>{user?.first_name || 'Usuario'}</Text>
        </View>
        <View style={styles.headerRight}>
          {streak > 0 && (
            <View
              style={styles.streakBadge}
              accessibilityLabel={`Racha de ${streak} dia${streak > 1 ? 's' : ''}`}
              accessibilityRole="text"
            >
              <Text style={styles.streakFire}>🔥</Text>
              <Text style={styles.streakCount}>{streak}</Text>
            </View>
          )}
          <TouchableOpacity
            style={styles.scanBtn}
            onPress={() => {
              haptics.light();
              navigation.navigate('Escanear');
            }}
            accessibilityLabel="Escanear comida con la camara"
            accessibilityRole="button"
            accessibilityHint="Abre la camara para escanear alimentos con IA"
          >
            <Ionicons name="camera" size={20} color={colors.white} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Loading skeleton */}
      {loading && !refreshing ? (
        <View style={{ paddingHorizontal: sidePadding }}>
          <HomeSkeleton />
        </View>
      ) : (
        <>
          {/* Error banner */}
          {error && (
            <TouchableOpacity
              style={[styles.errorBanner, { marginHorizontal: sidePadding }]}
              onPress={() => {
                haptics.light();
                setLoading(true);
                load();
              }}
              activeOpacity={0.8}
              accessibilityLabel="Error al cargar datos. Toca para reintentar"
              accessibilityRole="button"
            >
              <Ionicons name="wifi-outline" size={16} color={colors.white} />
              <Text style={styles.errorBannerText}>No se pudo cargar. Toca para reintentar</Text>
            </TouchableOpacity>
          )}

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.scroll, { paddingHorizontal: sidePadding }]}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.black}
              />
            }
          >
            <Animated.View style={fadeStyle}>
              {/* Calorie card */}
              <View style={styles.card} accessibilityLabel="Resumen de calorias del dia">
                <View style={styles.ringRow}>
                  <CalorieRing consumed={consumed} target={target} />
                  <View style={styles.macros}>
                    <MacroBar label="Proteina" value={protein} target={proteinTarget} color={colors.protein} />
                    <MacroBar label="Carbos" value={carbs} target={carbsTarget} color={colors.carbs} />
                    <MacroBar label="Grasas" value={fats} target={fatsTarget} color={colors.fats} />
                  </View>
                </View>
              </View>

              {/* Today's meals */}
              <Text style={styles.sectionTitle} accessibilityRole="header">Hoy</Text>
              {hasMeals ? (
                <View style={styles.card}>
                  {mealOrder.map((mt) => (
                    <MealSection key={mt} mealType={mt} logs={logsByMeal[mt]} />
                  ))}
                </View>
              ) : (
                <View style={[styles.card, styles.emptyCard]} accessibilityLabel="Sin comidas registradas hoy">
                  <Ionicons name="restaurant-outline" size={36} color={colors.grayLight} />
                  <Text style={styles.emptyText}>Sin comidas registradas</Text>
                  <Text style={styles.emptyHint}>Escanea tu comida con la camara</Text>
                  <TouchableOpacity
                    style={styles.scanCta}
                    onPress={() => {
                      haptics.light();
                      navigation.navigate('Escanear');
                    }}
                    accessibilityLabel="Escanear ahora"
                    accessibilityRole="button"
                    accessibilityHint="Abre la camara para escanear tu primer alimento del dia"
                  >
                    <Ionicons name="camera-outline" size={18} color={colors.white} />
                    <Text style={styles.scanCtaText}>Escanear ahora</Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={{ height: spacing.xl }} />
            </Animated.View>
          </ScrollView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  errorBannerText: { ...typography.caption, color: colors.white, flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.badgeBg,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.full,
    gap: 3,
  },
  streakFire: { fontSize: 14 },
  streakCount: { fontSize: 13, fontWeight: '800', color: colors.badgeText },
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
    width: 44,
    height: 44,
    borderRadius: 22,
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
    minHeight: 44,
  },
  scanCtaText: {
    ...typography.label,
    color: colors.white,
  },
});
