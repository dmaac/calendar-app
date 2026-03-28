/**
 * LogScreen -- Diario de alimentos del dia
 * Comidas agrupadas por tipo . Swipe-to-edit/delete . Swipe between days . Tracking de agua
 *
 * v2 Improvements:
 * - SectionList for proper meal-type sections with headers
 * - Daily macro total bar at the bottom (sticky)
 * - Floating action button (FAB) for quick "Add Food"
 * - Pull-to-refresh with improved UX
 * - keyExtractor + getItemLayout for FlatList performance
 * - Smooth swipe-to-delete via FoodLogItem + SwipeableRow
 */
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  Alert,
  StatusBar,
  RefreshControl,
  Animated,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, typography, spacing, radius, shadows, useLayout, mealColors } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';
import * as foodService from '../../services/food.service';
import { AIFoodLog, DailySummary } from '../../types';
import { MealType } from '../../services/food.service';
import { haptics } from '../../hooks/useHaptics';
import { useAnalytics } from '../../hooks/useAnalytics';
import useDaySwipe, { toDateStr } from '../../hooks/useDaySwipe';
import { HomeSkeleton } from '../../components/SkeletonLoader';
import DateNavigator from '../../components/DateNavigator';
import WaterTracker from '../../components/WaterTracker';
import FitsiMascot from '../../components/FitsiMascot';
import ConfettiEffect from '../../components/ConfettiEffect';
import BottomSheet from '../../components/BottomSheet';
import QuickLog from '../../components/QuickLog';
import QuickLogSection from '../../components/QuickLogSection';
import { showNotification } from '../../components/InAppNotification';
import { SwipeableRowProvider } from '../../components/SwipeableRow';
import FoodLogItem from '../../components/FoodLogItem';
import FoodComparison from '../../components/FoodComparison';
import FoodDiary from '../../components/FoodDiary';
import { getOnboardingProfile } from '../../services/onboarding.service';
import * as favoritesService from '../../services/favorites.service';
import NutritionAlerts from '../../components/NutritionAlert';
import type { NutritionAlertData } from '../../hooks/useNutritionAlerts';

const MEAL_META = mealColors;
const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

// Item height for getItemLayout optimization (approximate)
const ITEM_HEIGHT = 60;
const SECTION_HEADER_HEIGHT = 48;

// ─── Mock data for offline / backend unavailable ─────────────────────────────
const MOCK_SUMMARY: DailySummary = {
  date: new Date().toISOString().split('T')[0],
  total_calories: 1240, total_protein_g: 82, total_carbs_g: 130, total_fats_g: 38,
  target_calories: 2100, target_protein_g: 150, target_carbs_g: 210, target_fats_g: 70,
  water_ml: 1500, meals_logged: 3, streak_days: 4,
  calories_burned_exercise: 0, calories_remaining: 860, net_calories: 1240, exercises_today: [],
};

const MOCK_LOGS: AIFoodLog[] = [
  { id: -1, logged_at: new Date().toISOString(), meal_type: 'breakfast', food_name: 'Avena con frutas', calories: 320, carbs_g: 52, protein_g: 12, fats_g: 8, fiber_g: 5, sugar_g: null, sodium_mg: null, serving_size: null, image_url: null, ai_confidence: 0.95, was_edited: false },
  { id: -2, logged_at: new Date().toISOString(), meal_type: 'lunch', food_name: 'Pollo a la plancha con arroz', calories: 520, carbs_g: 48, protein_g: 42, fats_g: 14, fiber_g: 3, sugar_g: null, sodium_mg: null, serving_size: null, image_url: null, ai_confidence: 0.92, was_edited: false },
  { id: -3, logged_at: new Date().toISOString(), meal_type: 'snack', food_name: 'Yogurt griego con miel', calories: 180, carbs_g: 18, protein_g: 16, fats_g: 6, fiber_g: 0, sugar_g: null, sodium_mg: null, serving_size: null, image_url: null, ai_confidence: 0.88, was_edited: false },
  { id: -4, logged_at: new Date().toISOString(), meal_type: 'dinner', food_name: 'Salmon con verduras', calories: 420, carbs_g: 12, protein_g: 35, fats_g: 22, fiber_g: 6, sugar_g: null, sodium_mg: null, serving_size: null, image_url: null, ai_confidence: 0.91, was_edited: false },
];

// ─── Add options bottom sheet (memoized to skip re-render when log list changes)
const AddSheet = React.memo(function AddSheet({
  visible,
  mealType,
  onClose,
  onScan,
  onManual,
  onSearch,
}: {
  visible: boolean;
  mealType: MealType | null;
  onClose: () => void;
  onScan: () => void;
  onManual: () => void;
  onSearch: () => void;
}) {
  const c = useThemeColors();
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={[sheetStyles.title, { color: c.gray }]}>
        Anadir a {mealType ? MEAL_META[mealType]?.label : 'comida'}
      </Text>
      <TouchableOpacity
        style={sheetStyles.option}
        onPress={onScan}
        activeOpacity={0.7}
        accessibilityLabel="Escanear con IA. Saca una foto a tu comida"
        accessibilityRole="button"
        accessibilityHint="Abre la camara para escanear tu comida con inteligencia artificial"
      >
        <View style={[sheetStyles.optIcon, { backgroundColor: c.black }]}>
          <Ionicons name="camera" size={20} color={c.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[sheetStyles.optLabel, { color: c.black }]}>Escanear con IA</Text>
          <Text style={[sheetStyles.optSub, { color: c.gray }]}>Saca una foto a tu comida</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={c.grayLight} />
      </TouchableOpacity>
      <TouchableOpacity
        style={sheetStyles.option}
        onPress={onSearch}
        activeOpacity={0.7}
        accessibilityLabel="Buscar alimento en la base de datos"
        accessibilityRole="button"
        accessibilityHint="Abre la busqueda de alimentos en la base de datos"
      >
        <View style={[sheetStyles.optIcon, { backgroundColor: c.accent + '15' }]}>
          <Ionicons name="search" size={20} color={c.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[sheetStyles.optLabel, { color: c.black }]}>Buscar alimento</Text>
          <Text style={[sheetStyles.optSub, { color: c.gray }]}>Busca en nuestra base de datos</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={c.grayLight} />
      </TouchableOpacity>
      <TouchableOpacity
        style={sheetStyles.option}
        onPress={onManual}
        activeOpacity={0.7}
        accessibilityLabel="Anadir manualmente. Escribe el nombre y macros"
        accessibilityRole="button"
        accessibilityHint="Abre el formulario para agregar un alimento con sus macronutrientes"
      >
        <View style={[sheetStyles.optIcon, { backgroundColor: c.surface }]}>
          <Ionicons name="create-outline" size={20} color={c.black} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[sheetStyles.optLabel, { color: c.black }]}>Anadir manualmente</Text>
          <Text style={[sheetStyles.optSub, { color: c.gray }]}>Escribe el nombre y macros</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={c.grayLight} />
      </TouchableOpacity>
    </BottomSheet>
  );
});

const sheetStyles = StyleSheet.create({
  title: { ...typography.label, textAlign: 'center', marginBottom: spacing.xs },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  optIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optLabel: { ...typography.bodyMd },
  optSub: { ...typography.caption, marginTop: 2 },
});

// ─── Daily Total Bar (sticky footer) ─────────────────────────────────────────
const DailyTotalBar = React.memo(function DailyTotalBar({
  summary,
  visible,
}: {
  summary: DailySummary | null;
  visible: boolean;
}) {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(visible ? 0 : 80)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 0 : 80,
      damping: 18,
      stiffness: 200,
      useNativeDriver: true,
    }).start();
  }, [visible, slideAnim]);

  if (!summary) return null;

  const totalCals = Math.round(summary.total_calories);
  const totalProtein = Math.round(summary.total_protein_g);
  const totalCarbs = Math.round(summary.total_carbs_g);
  const totalFats = Math.round(summary.total_fats_g);

  // Progress percentages
  const calPct = summary.target_calories > 0
    ? Math.min(100, (summary.total_calories / summary.target_calories) * 100)
    : 0;

  return (
    <Animated.View
      style={[
        styles.dailyTotalBar,
        {
          backgroundColor: c.surface,
          borderTopColor: c.grayLight,
          paddingBottom: Math.max(insets.bottom, spacing.sm),
          transform: [{ translateY: slideAnim }],
        },
      ]}
      accessibilityLabel={`Total del dia: ${totalCals} kilocalorias, ${totalProtein} gramos de proteina, ${totalCarbs} gramos de carbohidratos, ${totalFats} gramos de grasas`}
    >
      {/* Calorie progress bar */}
      <View style={[styles.dailyProgressTrack, { backgroundColor: c.grayLight }]}>
        <View
          style={[
            styles.dailyProgressFill,
            {
              backgroundColor: calPct >= 100 ? c.protein : c.accent,
              width: `${Math.min(100, calPct)}%`,
            },
          ]}
        />
      </View>

      <View style={styles.dailyTotalRow}>
        <View style={styles.dailyTotalItem}>
          <Text style={[styles.dailyTotalValue, { color: c.black }]}>{totalCals}</Text>
          <Text style={[styles.dailyTotalLabel, { color: c.gray }]}>kcal</Text>
        </View>
        <View style={[styles.dailyTotalDivider, { backgroundColor: c.grayLight }]} />
        <View style={styles.dailyTotalItem}>
          <Text style={[styles.dailyTotalValue, { color: c.protein }]}>{totalProtein}g</Text>
          <Text style={[styles.dailyTotalLabel, { color: c.gray }]}>proteina</Text>
        </View>
        <View style={[styles.dailyTotalDivider, { backgroundColor: c.grayLight }]} />
        <View style={styles.dailyTotalItem}>
          <Text style={[styles.dailyTotalValue, { color: c.carbs }]}>{totalCarbs}g</Text>
          <Text style={[styles.dailyTotalLabel, { color: c.gray }]}>carbos</Text>
        </View>
        <View style={[styles.dailyTotalDivider, { backgroundColor: c.grayLight }]} />
        <View style={styles.dailyTotalItem}>
          <Text style={[styles.dailyTotalValue, { color: c.fats }]}>{totalFats}g</Text>
          <Text style={[styles.dailyTotalLabel, { color: c.gray }]}>grasas</Text>
        </View>
      </View>
    </Animated.View>
  );
});

// ─── Floating Action Button ──────────────────────────────────────────────────
const FAB = React.memo(function FAB({
  onPress,
}: {
  onPress: () => void;
}) {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.9,
      damping: 15,
      stiffness: 300,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      damping: 15,
      stiffness: 300,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  return (
    <Animated.View
      style={[
        styles.fab,
        {
          bottom: Math.max(insets.bottom, spacing.sm) + 72,
          transform: [{ scale: scaleAnim }],
        },
      ]}
    >
      <TouchableOpacity
        style={[styles.fabBtn, { backgroundColor: c.accent, ...shadows.lg }]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.9}
        accessibilityLabel="Agregar comida"
        accessibilityRole="button"
        accessibilityHint="Abre el menu para registrar un alimento"
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>
    </Animated.View>
  );
});

// ─── Section types for SectionList ───────────────────────────────────────────
interface MealSection {
  mealType: MealType;
  meta: { label: string; icon: string; color: string };
  mealTotal: number;
  data: AIFoodLog[];
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function LogScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { sidePadding } = useLayout();
  const c = useThemeColors();
  const { isDark } = useAppTheme();
  const { track } = useAnalytics('Log');
  const [logs, setLogs] = useState<AIFoodLog[]>([]);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [waterMl, setWaterMl] = useState(0);
  const [modalMeal, setModalMeal] = useState<MealType | null>(null);
  const [error, setError] = useState(false);
  const [confettiTrigger, setConfettiTrigger] = useState(false);
  const [userWeightKg, setUserWeightKg] = useState<number | undefined>(undefined);
  const [userFatTargetG, setUserFatTargetG] = useState<number>(70);
  const [comparisonVisible, setComparisonVisible] = useState(false);
  const prevLogCount = useRef(0);
  const lastFetchRef = useRef<number>(0);

  // Load user weight + fat target for personalized water goal and fat alerts.
  // The /api/onboarding/profile endpoint may return 500 for users that skipped
  // onboarding or whose profile was never persisted.  We must never crash the
  // screen because of this -- keep default values and move on.
  useEffect(() => {
    (async () => {
      try {
        const p = await getOnboardingProfile();
        if (p?.weight_kg) setUserWeightKg(p.weight_kg);
        if (p?.daily_fats_g) setUserFatTargetG(p.daily_fats_g);
      } catch {
        // Silently ignore -- defaults (undefined weight, 70g fat) remain.
      }
    })();
  }, []);

  // ─── Day navigation (hook handles state, swipe gestures, and animations) ─
  const {
    selectedDate,
    dateStr,
    dateLabel,
    dateSubtitle,
    canGoForward,
    canGoBack,
    isSelectedToday,
    goToPreviousDay,
    goToNextDay,
    goToToday,
    setDate: setSelectedDate,
    contentTranslateX,
    contentOpacity,
    gestureHandlers,
  } = useDaySwipe({
    onDateChange: (_date, direction) => {
      haptics.light();
      track('day_navigate', { direction });
    },
  });

  // ─── Data loading ────────────────────────────────────────────────────────

  const load = useCallback(async (date?: string) => {
    const d = date ?? dateStr;
    setError(false);
    try {
      const [l, s] = await Promise.allSettled([
        foodService.getFoodLogs(d),
        foodService.getDailySummary(d),
      ]);

      const logsOk = l.status === 'fulfilled';
      const summaryOk = s.status === 'fulfilled';

      if (logsOk) setLogs(l.value);
      if (summaryOk) {
        setSummary(s.value);
        setWaterMl(s.value.water_ml ?? 0);
      }

      // Fall back to mock data when API is unavailable
      if (!logsOk && !summaryOk) {
        setError(true);
        setLogs(MOCK_LOGS);
        setSummary(MOCK_SUMMARY);
        setWaterMl(MOCK_SUMMARY.water_ml);
      } else if (!logsOk) {
        setError(true);
        setLogs(MOCK_LOGS);
      } else if (!summaryOk) {
        setError(true);
        setSummary(MOCK_SUMMARY);
        setWaterMl(MOCK_SUMMARY.water_ml);
      }
    } catch {
      setError(true);
      setLogs(MOCK_LOGS);
      setSummary(MOCK_SUMMARY);
      setWaterMl(MOCK_SUMMARY.water_ml);
    } finally {
      setLoading(false);
    }
  }, [dateStr]);

  // Reload when date changes
  useEffect(() => {
    setLoading(true);
    load(toDateStr(selectedDate)).then(() => { lastFetchRef.current = Date.now(); }).catch(() => {});
  }, [selectedDate]);

  useFocusEffect(useCallback(() => {
    const now = Date.now();
    if (now - lastFetchRef.current < 30_000 && logs.length > 0) {
      return;
    }
    setLoading(true);
    load().then(() => { lastFetchRef.current = Date.now(); }).catch(() => {});
  }, [load, logs.length]));

  // Detect when a new food log is added (logs count increased) and fire confetti
  useEffect(() => {
    if (logs.length > prevLogCount.current && prevLogCount.current > 0) {
      setConfettiTrigger(true);
      showNotification({ message: 'Comida registrada!', type: 'success', icon: 'checkmark-circle' });
      haptics.success();
      const timer = setTimeout(() => setConfettiTrigger(false), 100);
      return () => clearTimeout(timer);
    }
    prevLogCount.current = logs.length;
  }, [logs.length]);

  // Smart suggestion: if a food appears 3+ times, suggest adding to favorites
  useEffect(() => {
    if (logs.length < 3) return;
    try {
      const counts: Record<string, { count: number; log: AIFoodLog }> = {};
      for (const log of logs) {
        if (!log.food_name) continue;
        const key = log.food_name.toLowerCase();
        if (!counts[key]) counts[key] = { count: 0, log };
        counts[key].count += 1;
      }
      for (const { count, log } of Object.values(counts)) {
        if (count >= 3) {
          favoritesService.shouldSuggestFavorite(log.food_name, count).then((should) => {
            if (should) {
              showNotification({
                message: `Te gusta "${log.food_name}"? Agregalo a favoritos!`,
                type: 'info',
                icon: 'heart',
                duration: 5000,
              });
            }
          }).catch(() => {
            // Non-critical -- ignore silently
          });
          break; // Only suggest one at a time
        }
      }
    } catch {
      // Guard against malformed log entries
    }
  }, [logs]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    haptics.light();
    try {
      await load();
      lastFetchRef.current = Date.now();
    } catch {
      // load() already handles errors internally, but guard the refresh spinner
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  // Stable callback refs to prevent child re-renders
  const handleEdit = useCallback((log: AIFoodLog) => {
    navigation.navigate('EditFood', { log });
  }, [navigation]);

  const handleDelete = useCallback((log: AIFoodLog) => {
    haptics.heavy();
    Alert.alert('Eliminar registro', `Eliminar "${log.food_name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            // Demo/offline data (negative IDs) -- just remove locally
            if (log.id < 0) {
              setLogs((prev) => prev.filter((l) => l.id !== log.id));
              haptics.success();
              return;
            }
            await foodService.deleteFoodLog(log.id);
            haptics.success();
            setLogs((prev) => prev.filter((l) => l.id !== log.id));
          } catch {
            // Fallback: remove locally even if API fails
            setLogs((prev) => prev.filter((l) => l.id !== log.id));
            haptics.success();
          }
        },
      },
    ]);
  }, []);

  // Called by FoodLogItem AFTER the user has confirmed deletion in the Alert
  // and the exit animation has completed. No need to show another dialog.
  const handleDeleteConfirmed = useCallback(async (log: AIFoodLog) => {
    try {
      if (log.id < 0) {
        setLogs((prev) => prev.filter((l) => l.id !== log.id));
        return;
      }
      await foodService.deleteFoodLog(log.id);
      setLogs((prev) => prev.filter((l) => l.id !== log.id));
    } catch {
      setLogs((prev) => prev.filter((l) => l.id !== log.id));
    }
  }, []);

  const handleToggleFavorite = useCallback(async (log: AIFoodLog) => {
    try {
      const added = await favoritesService.toggleFavorite({
        name: log.food_name,
        calories: log.calories,
        protein_g: log.protein_g,
        carbs_g: log.carbs_g,
        fats_g: log.fats_g,
      });
      showNotification({
        message: added ? `${log.food_name} agregado a favoritos!` : `${log.food_name} eliminado de favoritos`,
        type: added ? 'success' : 'info',
        icon: added ? 'heart' : 'heart-dislike',
      });
    } catch {
      showNotification({
        message: 'No se pudo actualizar favoritos',
        type: 'warning',
        icon: 'alert-circle',
      });
    }
  }, []);

  const handleAddWater = useCallback(async (ml: number) => {
    const prev = waterMl;
    track('water_added', { amount_ml: ml });
    setWaterMl((w) => w + ml); // optimistic
    try {
      const res = await foodService.logWater(ml);
      setWaterMl(res.water_ml);
    } catch {
      setWaterMl(prev);
    }
  }, [waterMl, track]);

  const openAddModal = useCallback((mt: MealType) => {
    haptics.light();
    setModalMeal(mt);
  }, []);
  const closeModal = useCallback(() => setModalMeal(null), []);

  const handleScan = useCallback(() => {
    haptics.light();
    closeModal();
    navigation.navigate('Inicio', { screen: 'Scan' });
  }, [navigation]);

  const handleManual = useCallback(() => {
    haptics.light();
    const mt = modalMeal;
    track('meal_logged_manual', { meal_type: mt });
    closeModal();
    navigation.navigate('AddFood', { mealType: mt });
  }, [modalMeal, closeModal, navigation, track]);

  const handleSearch = useCallback(() => {
    haptics.light();
    const mt = modalMeal;
    closeModal();
    navigation.navigate('FoodSearch', { mealType: mt });
  }, [modalMeal, closeModal, navigation]);

  const handleDeleteAllToday = useCallback(() => {
    if (logs.length === 0) return;
    haptics.heavy();
    Alert.alert(
      'Borrar todas las comidas',
      `Eliminar las ${logs.length} comidas registradas hoy? Esta accion no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar todo',
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete each log (negative IDs are local-only mock data)
              const realLogs = logs.filter((l) => l.id >= 0);
              await Promise.allSettled(
                realLogs.map((l) => foodService.deleteFoodLog(l.id))
              );
              setLogs([]);
              haptics.success();
              track('delete_all_meals', { count: logs.length });
              showNotification({ message: 'Todas las comidas eliminadas', type: 'success', icon: 'trash' });
              // Reload to refresh summary (fire-and-forget with safety catch)
              load().catch(() => {});
            } catch {
              showNotification({ message: 'Error al eliminar comidas', type: 'warning', icon: 'alert-circle' });
            }
          },
        },
      ],
    );
  }, [logs, track, load]);

  const handleFabPress = useCallback(() => {
    haptics.medium();
    // Determine the most likely meal type based on current time
    const hour = new Date().getHours();
    let suggestedMeal: MealType = 'snack';
    if (hour >= 5 && hour < 11) suggestedMeal = 'breakfast';
    else if (hour >= 11 && hour < 15) suggestedMeal = 'lunch';
    else if (hour >= 18 && hour < 22) suggestedMeal = 'dinner';
    openAddModal(suggestedMeal);
  }, [openAddModal]);

  const consumed = summary?.total_calories ?? 0;
  const target = summary?.target_calories ?? 2000;

  // ─── SectionList data ──────────────────────────────────────────────────────
  const sections: MealSection[] = useMemo(() => {
    return MEAL_ORDER.map((mt) => {
      const meta = MEAL_META[mt];
      const mealLogs = logs.filter((l) => l.meal_type === mt);
      const mealTotal = mealLogs.reduce((s, l) => s + l.calories, 0);
      return {
        mealType: mt,
        meta,
        mealTotal,
        data: mealLogs,
      };
    });
  }, [logs]);

  const keyExtractor = useCallback((item: AIFoodLog) => `log-${item.id}`, []);

  // ─── Render helpers ────────────────────────────────────────────────────────

  const renderSectionHeader = useCallback(({ section }: { section: MealSection }) => {
    const { mealType: mt, meta, mealTotal, data: sectionData } = section;
    return (
      <View
        style={[styles.sectionHeader, { backgroundColor: c.bg }]}
        accessibilityLabel={`${meta.label}: ${sectionData.length > 0 ? `${Math.round(mealTotal)} kilocalorias, ${sectionData.length} alimento${sectionData.length > 1 ? 's' : ''}` : 'sin registros'}`}
      >
        <View style={styles.mealHeader}>
          <View style={[styles.mealIconBg, { backgroundColor: meta.color + '20' }]}>
            <Ionicons name={meta.icon as any} size={18} color={meta.color} />
          </View>
          <Text style={[styles.mealTitle, { color: c.black }]} allowFontScaling>{meta.label}</Text>
          {sectionData.length > 0 && (
            <Text style={[styles.mealKcal, { color: c.black }]} allowFontScaling>{Math.round(mealTotal)} kcal</Text>
          )}
          <TouchableOpacity
            onPress={() => openAddModal(mt)}
            style={styles.mealAddBtn}
            accessibilityLabel={`Anadir alimento a ${meta.label.toLowerCase()}`}
            accessibilityRole="button"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="add-circle-outline" size={20} color={meta.color} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [c, openAddModal]);

  const renderItem = useCallback(({ item: log }: { item: AIFoodLog }) => {
    const fats = log.fats_g ?? 0;
    const fatPercent = userFatTargetG > 0 ? (fats / userFatTargetG) * 100 : 0;
    const isExtremeFat = fatPercent > 200;

    return (
      <View style={[styles.itemContainer, { backgroundColor: c.surface, marginHorizontal: sidePadding }]}>
        <FoodLogItem
          log={log}
          onEdit={handleEdit}
          onDelete={handleDeleteConfirmed}
          onToggleFavorite={handleToggleFavorite}
          surfaceColor={c.surface}
          borderColor={c.grayLight}
        />
        {isExtremeFat && (
          <NutritionAlerts
            alerts={[{
              level: 'danger',
              title: 'Grasa extrema detectada',
              message: `"${log.food_name ?? 'Alimento'}" tiene ${Math.round(fats)}g de grasa (${Math.round(fatPercent)}% de tu meta diaria de ${Math.round(userFatTargetG)}g). Considera una porcion mas pequena.`,
              icon: 'alert-circle',
              color: c.protein,
              action_label: '',
              action_route: '',
            }]}
          />
        )}
      </View>
    );
  }, [c, sidePadding, handleEdit, handleDeleteConfirmed, handleToggleFavorite, userFatTargetG]);

  const renderSectionFooter = useCallback(({ section }: { section: MealSection }) => {
    if (section.data.length > 0) return null;
    const { mealType: mt, meta } = section;
    return (
      <View style={[styles.emptyMealContainer, { marginHorizontal: sidePadding }]}>
        <TouchableOpacity
          style={[styles.emptyMeal, { backgroundColor: c.surface, borderColor: c.grayLight }]}
          onPress={() => openAddModal(mt)}
          activeOpacity={0.7}
          accessibilityLabel={`Anadir ${meta.label.toLowerCase()}`}
          accessibilityRole="button"
          accessibilityHint={`Abre el menu para anadir un alimento a ${meta.label.toLowerCase()}`}
        >
          <View style={styles.emptyMealContent}>
            <View style={[styles.emptyMealIconBg, { backgroundColor: meta.color + '10' }]}>
              <Ionicons name="add" size={18} color={meta.color} />
            </View>
            <View>
              <Text style={[styles.emptyMealText, { color: c.gray }]} allowFontScaling>Anadir {meta.label.toLowerCase()}</Text>
              <Text style={[styles.emptyMealHint, { color: c.disabled }]} allowFontScaling>
                {mt === 'breakfast' ? 'Empieza bien el dia' :
                 mt === 'lunch' ? 'Registra tu almuerzo' :
                 mt === 'dinner' ? 'No olvides la cena' :
                 'Un snack saludable'}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={14} color={c.disabled} />
        </TouchableOpacity>
      </View>
    );
  }, [c, sidePadding, openAddModal]);

  // ListHeaderComponent: everything above the meal sections
  const ListHeader = useMemo(() => (
    <View style={{ paddingHorizontal: sidePadding }}>
      {/* Error banner */}
      {error && !loading && (
        <TouchableOpacity
          style={[styles.errorBanner, { backgroundColor: c.accent }]}
          onPress={() => { setLoading(true); load().catch(() => {}); }}
          activeOpacity={0.8}
          accessibilityLabel="Sin conexion, mostrando datos de ejemplo. Toca para reintentar"
          accessibilityRole="button"
        >
          <Ionicons name="wifi-outline" size={14} color={c.white} />
          <Text style={[styles.errorBannerText, { color: c.white }]}>Sin conexion -- datos de ejemplo. Toca para reintentar</Text>
        </TouchableOpacity>
      )}

      {/* Empty state */}
      {logs.length === 0 && (
        <View style={styles.globalEmptyState}>
          <Text style={[{ color: c.gray, fontSize: 14, textAlign: 'center' }]} allowFontScaling>
            {isSelectedToday ? 'Aun no has registrado nada hoy' : 'Sin registros este dia'}
          </Text>
          {isSelectedToday && (
            <TouchableOpacity
              style={[styles.globalEmptyCta, { backgroundColor: c.accent }]}
              onPress={() => openAddModal('breakfast')}
              activeOpacity={0.8}
              accessibilityLabel="Registrar tu primera comida"
              accessibilityRole="button"
            >
              <Ionicons name="camera" size={18} color={c.white} />
              <Text style={[styles.globalEmptyCtaText, { color: c.white }]}>Registrar comida</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Water tracking */}
      <WaterTracker waterMl={waterMl} onAdd={handleAddWater} weightKg={userWeightKg} />

      {/* Quick Log Section -- frecuentes y favoritos con tabs */}
      <QuickLogSection onLogged={load} />

      {/* Quick Log -- re-log recent meals in one tap (chips horizontales) */}
      <QuickLog recentLogs={logs} onLogged={load} />
    </View>
  ), [c, sidePadding, error, loading, logs.length, isSelectedToday, waterMl, handleAddWater, userWeightKg, load, openAddModal]);

  // ListFooterComponent: diary + delete all
  const ListFooter = useMemo(() => (
    <View style={{ paddingHorizontal: sidePadding }}>
      {/* Food Diary -- emotional journal for meals */}
      {logs.length > 0 && (
        <FoodDiary
          mealType={logs[0]?.meal_type}
          foodName={logs[0]?.food_name}
          date={dateStr}
        />
      )}

      {/* Delete all meals today -- discrete button at the bottom */}
      {isSelectedToday && logs.length > 0 && (
        <TouchableOpacity
          style={styles.deleteAllBtn}
          onPress={handleDeleteAllToday}
          activeOpacity={0.7}
          accessibilityLabel={`Borrar todas las ${logs.length} comidas de hoy`}
          accessibilityRole="button"
          accessibilityHint="Elimina todas las comidas registradas hoy"
        >
          <Ionicons name="trash-outline" size={14} color={c.protein} />
          <Text style={[styles.deleteAllBtnText, { color: c.protein }]}>Borrar todas las comidas de hoy</Text>
        </TouchableOpacity>
      )}

      {/* Bottom spacer for FAB clearance */}
      <View style={{ height: 120 }} />
    </View>
  ), [sidePadding, logs, dateStr, isSelectedToday, handleDeleteAllToday]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={c.bg} />
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: sidePadding }]}>
        <View accessibilityRole="header" style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: c.black }]} allowFontScaling>Registro</Text>
        </View>
        <View style={styles.headerBtns}>
          <TouchableOpacity
            style={[styles.historyBtn, { backgroundColor: c.surface }]}
            onPress={() => { haptics.light(); setComparisonVisible(true); }}
            accessibilityLabel="Comparar alimentos"
            accessibilityRole="button"
            accessibilityHint="Abre la pantalla para comparar dos alimentos"
          >
            <Ionicons name="git-compare-outline" size={18} color={c.black} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.historyBtn, { backgroundColor: c.surface }]}
            onPress={() => navigation.navigate('History')}
            accessibilityLabel="Ver historial de registros"
            accessibilityRole="button"
            accessibilityHint="Navega al historial de comidas registradas"
          >
            <Ionicons name="calendar-outline" size={18} color={c.black} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Day navigator -- swipe or tap arrows to change day */}
      <DateNavigator
        dateLabel={dateLabel}
        dateSubtitle={dateSubtitle}
        selectedDate={selectedDate}
        canGoForward={canGoForward}
        canGoBack={canGoBack}
        isToday={isSelectedToday}
        translateX={contentTranslateX}
        opacity={contentOpacity}
        onPreviousDay={goToPreviousDay}
        onNextDay={goToNextDay}
        onGoToToday={goToToday}
        onDatePicked={setSelectedDate}
        sidePadding={sidePadding}
      />

      {/* Calorie summary strip */}
      <View
        style={[styles.summaryStrip, { marginHorizontal: sidePadding, backgroundColor: c.surface }]}
        accessible={true}
        accessibilityRole="summary"
        accessibilityLabel={`Resumen: ${Math.round(consumed)} calorias consumidas de ${Math.round(target)} objetivo, ${Math.max(0, Math.round(target - consumed))} restantes`}
      >
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: c.black }]} allowFontScaling>{Math.round(consumed)}</Text>
          <Text style={[styles.summaryLabel, { color: c.gray }]} allowFontScaling>consumidas</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: c.grayLight }]} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: c.black }]} allowFontScaling>{Math.round(target)}</Text>
          <Text style={[styles.summaryLabel, { color: c.gray }]} allowFontScaling>objetivo</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: c.grayLight }]} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: c.success }]} allowFontScaling>
            {Math.max(0, Math.round(target - consumed))}
          </Text>
          <Text style={[styles.summaryLabel, { color: c.gray }]} allowFontScaling>restantes</Text>
        </View>
      </View>

      {loading && !refreshing ? (
        <View style={[styles.loadingOverlay, { paddingHorizontal: sidePadding }]}>
          <HomeSkeleton />
        </View>
      ) : (
        <View style={{ flex: 1 }} {...gestureHandlers}>
          <SwipeableRowProvider>
            <SectionList
              sections={sections}
              keyExtractor={keyExtractor}
              renderItem={renderItem}
              renderSectionHeader={renderSectionHeader}
              renderSectionFooter={renderSectionFooter}
              ListHeaderComponent={ListHeader}
              ListFooterComponent={ListFooter}
              stickySectionHeadersEnabled={false}
              showsVerticalScrollIndicator={false}
              bounces={true}
              overScrollMode="never"
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={c.accent}
                  colors={[c.accent]}
                />
              }
              // Performance optimizations
              initialNumToRender={10}
              maxToRenderPerBatch={8}
              windowSize={7}
              removeClippedSubviews={Platform.OS !== 'web'}
              getItemLayout={(data, index) => ({
                length: ITEM_HEIGHT,
                offset: ITEM_HEIGHT * index,
                index,
              })}
              contentContainerStyle={styles.sectionListContent}
            />
          </SwipeableRowProvider>
        </View>
      )}

      {/* Sticky daily total bar at bottom */}
      <DailyTotalBar summary={summary} visible={logs.length > 0 && !loading} />

      {/* Floating Action Button */}
      {isSelectedToday && !loading && (
        <FAB onPress={handleFabPress} />
      )}

      <AddSheet
        visible={modalMeal !== null}
        mealType={modalMeal}
        onClose={closeModal}
        onScan={handleScan}
        onManual={handleManual}
        onSearch={handleSearch}
      />

      <ConfettiEffect trigger={confettiTrigger} />

      <FoodComparison
        visible={comparisonVisible}
        onClose={() => setComparisonVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loadingOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  headerTitle: { ...typography.titleSm },
  headerBtns: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  historyBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ── Day navigator ──
  dayNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  dayNavBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNavBtnDisabled: {
    opacity: 0.3,
  },
  dayNavCenter: {
    flex: 1,
    alignItems: 'center',
  },
  dayNavLabel: {
    ...typography.label,
    fontSize: 15,
    textTransform: 'capitalize',
  },
  dayNavSub: {
    ...typography.caption,
    marginTop: 1,
    textTransform: 'capitalize',
  },
  // ── Rest ──
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  errorBannerText: { ...typography.caption, flex: 1 },
  summaryStrip: {
    flexDirection: 'row',
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { ...typography.titleSm },
  summaryLabel: { ...typography.caption, marginTop: 2 },
  summaryDivider: { width: 1, height: 28 },
  sectionListContent: { paddingTop: spacing.xs },
  // ── Section Headers ──
  sectionHeader: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  mealHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  mealIconBg: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealTitle: { ...typography.label, flex: 1 },
  mealKcal: { ...typography.caption, fontWeight: '700' },
  mealAddBtn: { padding: 4 },
  // ── Item container ──
  itemContainer: {
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: 2,
  },
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
  },
  foodInfo: { flex: 1 },
  foodName: { ...typography.bodyMd, marginBottom: 2 },
  macroPills: { flexDirection: 'row', gap: spacing.xs },
  macroPill: { ...typography.caption },
  favHeart: { padding: 4, marginRight: 4 },
  foodRight: { alignItems: 'flex-end', gap: 2 },
  foodKcal: { ...typography.label },
  foodKcalUnit: { ...typography.caption },
  // ── Empty meal state ──
  emptyMealContainer: {
    marginBottom: spacing.xs,
  },
  emptyMeal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  emptyMealContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyMealIconBg: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyMealText: { ...typography.caption, fontWeight: '600' },
  emptyMealHint: { ...typography.caption, fontSize: 11, marginTop: 1 },
  globalEmptyState: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  globalEmptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
  },
  globalEmptyCtaText: {
    ...typography.label,
    fontWeight: '700',
  },
  deleteAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
  },
  deleteAllBtnText: {
    ...typography.caption,
    color: undefined,
    fontWeight: '600',
  },
  // ── Daily Total Bar (sticky footer) ──
  dailyTotalBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  dailyProgressTrack: {
    height: 3,
    borderRadius: 2,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  dailyProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
  dailyTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dailyTotalItem: {
    flex: 1,
    alignItems: 'center',
    gap: 1,
  },
  dailyTotalValue: {
    ...typography.label,
    fontSize: 14,
    fontWeight: '700',
  },
  dailyTotalLabel: {
    ...typography.caption,
    fontSize: 10,
  },
  dailyTotalDivider: {
    width: 1,
    height: 24,
  },
  // ── FAB ──
  fab: {
    position: 'absolute',
    right: spacing.lg,
    zIndex: 100,
  },
  fabBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
