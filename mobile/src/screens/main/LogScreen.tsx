/**
 * LogScreen -- Diario de alimentos del dia
 * Comidas agrupadas por tipo . Swipe-to-edit/delete . Swipe between days . Tracking de agua
 */
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, typography, spacing, radius, shadows, useLayout, mealColors } from '../../theme';
import * as foodService from '../../services/food.service';
import { AIFoodLog, DailySummary } from '../../types';
import { MealType } from '../../services/food.service';
import { haptics } from '../../hooks/useHaptics';
import { useAnalytics } from '../../hooks/useAnalytics';
import { HomeSkeleton } from '../../components/SkeletonLoader';
import WaterTracker from '../../components/WaterTracker';
import FitsiMascot from '../../components/FitsiMascot';
import ConfettiEffect from '../../components/ConfettiEffect';
import BottomSheet from '../../components/BottomSheet';
import QuickLog from '../../components/QuickLog';
import { showNotification } from '../../components/InAppNotification';
import SwipeableMealItem from '../../components/SwipeableMealItem';
import FoodComparison from '../../components/FoodComparison';
import FoodDiary from '../../components/FoodDiary';
import { getOnboardingProfile } from '../../services/onboarding.service';
import { OnboardingProfileRead } from '../../types';
import * as favoritesService from '../../services/favorites.service';
import NutritionAlerts from '../../components/NutritionAlert';
import type { NutritionAlertData } from '../../hooks/useNutritionAlerts';

const MEAL_META = mealColors;
const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = 60;

// ─── Date helpers ────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

function isToday(d: Date): boolean {
  const now = new Date();
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
}

function isYesterday(d: Date): boolean {
  return isToday(addDays(d, 1));
}

function isTomorrow(d: Date): boolean {
  return isToday(addDays(d, -1));
}

function formatDateLabel(d: Date): string {
  if (isToday(d)) return 'Hoy';
  if (isYesterday(d)) return 'Ayer';
  if (isTomorrow(d)) return 'Manana';
  return d.toLocaleDateString('es', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

function formatDateSubtitle(d: Date): string {
  if (isToday(d) || isYesterday(d) || isTomorrow(d)) {
    return d.toLocaleDateString('es', {
      weekday: 'long', day: 'numeric', month: 'long',
    });
  }
  return '';
}

// ─── Mock data for offline / backend unavailable ─────────────────────────────
const MOCK_SUMMARY: DailySummary = {
  date: new Date().toISOString().split('T')[0],
  total_calories: 1240, total_protein_g: 82, total_carbs_g: 130, total_fats_g: 38,
  target_calories: 2100, target_protein_g: 150, target_carbs_g: 210, target_fats_g: 70,
  water_ml: 1500, meals_logged: 3, streak_days: 4,
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

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function LogScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { sidePadding } = useLayout();
  const c = useThemeColors();
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

  // Load user weight + fat target for personalized water goal and fat alerts
  useEffect(() => {
    getOnboardingProfile()
      .then((p) => {
        if (p?.weight_kg) setUserWeightKg(p.weight_kg);
        if (p?.daily_fats_g) setUserFatTargetG(p.daily_fats_g);
      })
      .catch(() => {});
  }, []);

  // ─── Day navigation state ────────────────────────────────────────────────
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const dateTranslateX = useRef(new Animated.Value(0)).current;
  const dateOpacity = useRef(new Animated.Value(1)).current;

  // Prevent navigating into the future
  const canGoForward = !isToday(selectedDate);

  const animateDateTransition = useCallback((direction: 'left' | 'right', newDate: Date) => {
    const exitX = direction === 'left' ? -SCREEN_WIDTH * 0.3 : SCREEN_WIDTH * 0.3;
    const enterX = direction === 'left' ? SCREEN_WIDTH * 0.3 : -SCREEN_WIDTH * 0.3;

    Animated.parallel([
      Animated.timing(dateTranslateX, {
        toValue: exitX,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(dateOpacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setSelectedDate(newDate);
      dateTranslateX.setValue(enterX);
      Animated.parallel([
        Animated.spring(dateTranslateX, {
          toValue: 0,
          useNativeDriver: true,
          damping: 20,
          stiffness: 200,
        }),
        Animated.timing(dateOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, [dateTranslateX, dateOpacity]);

  const goToPrevDay = useCallback(() => {
    haptics.light();
    track('day_navigate', { direction: 'prev' });
    animateDateTransition('right', addDays(selectedDate, -1));
  }, [selectedDate, animateDateTransition, track]);

  const goToNextDay = useCallback(() => {
    if (!canGoForward) return;
    haptics.light();
    track('day_navigate', { direction: 'next' });
    animateDateTransition('left', addDays(selectedDate, 1));
  }, [selectedDate, canGoForward, animateDateTransition, track]);

  const goToToday = useCallback(() => {
    if (isToday(selectedDate)) return;
    haptics.light();
    track('day_navigate', { direction: 'today' });
    animateDateTransition('left', new Date());
  }, [selectedDate, animateDateTransition, track]);

  // ─── PanResponder for horizontal day swipe on content area ──────────────
  // Use refs so the PanResponder always sees the latest values
  const selectedDateRef = useRef(selectedDate);
  const canGoForwardRef = useRef(canGoForward);
  const goToPrevDayRef = useRef(goToPrevDay);
  const goToNextDayRef = useRef(goToNextDay);

  useEffect(() => { selectedDateRef.current = selectedDate; }, [selectedDate]);
  useEffect(() => { canGoForwardRef.current = canGoForward; }, [canGoForward]);
  useEffect(() => { goToPrevDayRef.current = goToPrevDay; }, [goToPrevDay]);
  useEffect(() => { goToNextDayRef.current = goToNextDay; }, [goToNextDay]);

  const panHandlers = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gs) => {
        // Only claim horizontal gestures clearly horizontal, not vertical scroll
        return Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5 && Math.abs(gs.dx) > 15;
      },
      onMoveShouldSetPanResponderCapture: () => false,
      onPanResponderRelease: (_evt, gs) => {
        const { dx, vx } = gs;
        if (dx < -SWIPE_THRESHOLD || (dx < -20 && vx < -0.5)) {
          // Swiped left -> next day
          if (canGoForwardRef.current) {
            goToNextDayRef.current();
          }
        } else if (dx > SWIPE_THRESHOLD || (dx > 20 && vx > 0.5)) {
          // Swiped right -> prev day
          goToPrevDayRef.current();
        }
      },
    }),
  ).current.panHandlers;

  // ─── Data loading ────────────────────────────────────────────────────────
  const dateStr = useMemo(() => toDateStr(selectedDate), [selectedDate]);

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
    load(toDateStr(selectedDate));
  }, [selectedDate]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

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
    const counts: Record<string, { count: number; log: AIFoodLog }> = {};
    for (const log of logs) {
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
        }).catch(() => {});
        break; // Only suggest one at a time
      }
    }
  }, [logs]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

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
              // Reload to refresh summary
              load();
            } catch {
              showNotification({ message: 'Error al eliminar comidas', type: 'warning', icon: 'alert-circle' });
            }
          },
        },
      ],
    );
  }, [logs, track, load]);

  const consumed = summary?.total_calories ?? 0;
  const target = summary?.target_calories ?? 2000;

  // Memoize meal grouping to avoid re-filtering on every render
  const logsByMeal = useMemo(() => {
    const grouped: Record<string, AIFoodLog[]> = {};
    for (const mt of MEAL_ORDER) {
      grouped[mt] = logs.filter((l) => l.meal_type === mt);
    }
    return grouped;
  }, [logs]);

  // Date display strings
  const dateLabel = useMemo(() => formatDateLabel(selectedDate), [selectedDate]);
  const dateSubtitle = useMemo(() => formatDateSubtitle(selectedDate), [selectedDate]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: sidePadding }]}>
        <View accessibilityRole="header" style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: c.black }]}>Registro</Text>
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
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: c.black }]}
            onPress={() => openAddModal('snack')}
            accessibilityLabel="Anadir alimento"
            accessibilityRole="button"
            accessibilityHint="Abre el menu para anadir una comida"
          >
            <Ionicons name="add" size={22} color={c.white} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Day navigator -- swipe or tap arrows to change day */}
      <View
        style={[styles.dayNav, { paddingHorizontal: sidePadding }]}
        accessibilityRole="toolbar"
        accessibilityLabel={`Navegacion de dias. Dia seleccionado: ${dateLabel}`}
      >
        <TouchableOpacity
          onPress={goToPrevDay}
          style={styles.dayNavBtn}
          accessibilityLabel="Dia anterior"
          accessibilityRole="button"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="chevron-back" size={22} color={c.black} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={goToToday}
          style={styles.dayNavCenter}
          activeOpacity={isToday(selectedDate) ? 1 : 0.6}
          accessibilityLabel={isToday(selectedDate) ? dateLabel : `${dateLabel}. Toca para ir a hoy`}
          accessibilityRole="button"
        >
          <Animated.View style={{
            alignItems: 'center',
            transform: [{ translateX: dateTranslateX }],
            opacity: dateOpacity,
          }}>
            <Text style={[styles.dayNavLabel, { color: c.black }]}>{dateLabel}</Text>
            {dateSubtitle !== '' && (
              <Text style={[styles.dayNavSub, { color: c.gray }]}>{dateSubtitle}</Text>
            )}
          </Animated.View>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={goToNextDay}
          style={[styles.dayNavBtn, !canGoForward && styles.dayNavBtnDisabled]}
          disabled={!canGoForward}
          accessibilityLabel="Dia siguiente"
          accessibilityRole="button"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons
            name="chevron-forward"
            size={22}
            color={canGoForward ? c.black : c.disabled}
          />
        </TouchableOpacity>
      </View>

      {/* Error banner */}
      {error && !loading && (
        <TouchableOpacity
          style={[styles.errorBanner, { marginHorizontal: sidePadding, backgroundColor: c.accent }]}
          onPress={() => { setLoading(true); load(); }}
          activeOpacity={0.8}
          accessibilityLabel="Sin conexion, mostrando datos de ejemplo. Toca para reintentar"
          accessibilityRole="button"
        >
          <Ionicons name="wifi-outline" size={14} color={c.white} />
          <Text style={[styles.errorBannerText, { color: c.white }]}>Sin conexion -- datos de ejemplo. Toca para reintentar</Text>
        </TouchableOpacity>
      )}

      {/* Calorie summary strip */}
      <View
        style={[styles.summaryStrip, { marginHorizontal: sidePadding, backgroundColor: c.surface }]}
        accessibilityLabel={`Resumen: ${Math.round(consumed)} calorias consumidas de ${Math.round(target)} objetivo, ${Math.max(0, Math.round(target - consumed))} restantes`}
      >
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: c.black }]}>{Math.round(consumed)}</Text>
          <Text style={[styles.summaryLabel, { color: c.gray }]}>consumidas</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: c.grayLight }]} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: c.black }]}>{Math.round(target)}</Text>
          <Text style={[styles.summaryLabel, { color: c.gray }]}>objetivo</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: c.grayLight }]} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: c.success }]}>
            {Math.max(0, Math.round(target - consumed))}
          </Text>
          <Text style={[styles.summaryLabel, { color: c.gray }]}>restantes</Text>
        </View>
      </View>

      {loading && !refreshing ? (
        <View style={[styles.loadingOverlay, { paddingHorizontal: sidePadding }]}>
          <HomeSkeleton />
        </View>
      ) : (
      <View style={{ flex: 1 }} {...panHandlers}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        bounces={true}
        overScrollMode="never"
        contentContainerStyle={[styles.scroll, { paddingHorizontal: sidePadding }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Fitsi contextual expression */}
        {logs.length === 0 ? (
          <View style={styles.globalEmptyState}>
            <FitsiMascot
              expression="hungry"
              size="medium"
              animation="sad"
              message={isToday(selectedDate) ? 'Aun no has registrado nada hoy' : 'Sin registros este dia'}
            />
            {isToday(selectedDate) && (
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
        ) : (
          <View style={{ alignItems: 'center', paddingVertical: spacing.xs }}>
            <FitsiMascot
              expression="happy"
              size="small"
              animation="idle"
            />
          </View>
        )}

        {/* Water tracking */}
        <WaterTracker waterMl={waterMl} onAdd={handleAddWater} weightKg={userWeightKg} />

        {/* Quick Log -- re-log recent meals in one tap */}
        <QuickLog recentLogs={logs} onLogged={load} />

        {/* Meal sections */}
        {MEAL_ORDER.map((mt) => {
          const meta = MEAL_META[mt];
          const mealLogs = logsByMeal[mt];
          const mealTotal = mealLogs.reduce((s, l) => s + l.calories, 0);

          return (
            <View
              key={mt}
              style={[styles.mealCard, { backgroundColor: c.surface, borderColor: c.grayLight }]}
              accessibilityLabel={`${meta.label}: ${mealLogs.length > 0 ? `${Math.round(mealTotal)} kilocalorias, ${mealLogs.length} alimento${mealLogs.length > 1 ? 's' : ''}` : 'sin registros'}`}
            >
              <View style={styles.mealHeader}>
                <View style={[styles.mealIconBg, { backgroundColor: meta.color + '20' }]}>
                  <Ionicons name={meta.icon as any} size={18} color={meta.color} />
                </View>
                <Text style={[styles.mealTitle, { color: c.black }]}>{meta.label}</Text>
                {mealLogs.length > 0 && (
                  <Text style={[styles.mealKcal, { color: c.black }]}>{Math.round(mealTotal)} kcal</Text>
                )}
                <TouchableOpacity
                  onPress={() => openAddModal(mt)}
                  style={styles.mealAddBtn}
                  accessibilityLabel={`Anadir alimento a ${meta.label.toLowerCase()}`}
                  accessibilityRole="button"
                >
                  <Ionicons name="add" size={16} color={c.gray} />
                </TouchableOpacity>
              </View>

              {mealLogs.length > 0 ? (
                mealLogs.map((log: AIFoodLog) => {
                  const fatPercent = userFatTargetG > 0 ? (log.fats_g / userFatTargetG) * 100 : 0;
                  const isExtremeFat = fatPercent > 200;
                  return (
                    <React.Fragment key={log.id}>
                      <SwipeableMealItem
                        onEdit={() => handleEdit(log)}
                        onDelete={() => handleDelete(log)}
                        accessibilityLabel={`${log.food_name}, ${Math.round(log.calories)} kilocalorias`}
                      >
                        <View
                          style={[styles.foodRow, { borderTopColor: c.grayLight }]}
                          accessibilityLabel={`${log.food_name}, ${Math.round(log.calories)} kilocalorias, proteina ${Math.round(log.protein_g)} gramos, carbohidratos ${Math.round(log.carbs_g)} gramos, grasas ${Math.round(log.fats_g)} gramos`}
                        >
                          <View style={styles.foodInfo}>
                            <Text style={[styles.foodName, { color: c.black }]} numberOfLines={1}>{log.food_name}</Text>
                            <View style={styles.macroPills}>
                              <Text style={[styles.macroPill, { color: c.gray }]}>P {Math.round(log.protein_g)}g</Text>
                              <Text style={[styles.macroPill, { color: c.gray }]}>C {Math.round(log.carbs_g)}g</Text>
                              <Text style={[styles.macroPill, { color: c.gray }]}>G {Math.round(log.fats_g)}g</Text>
                            </View>
                          </View>
                          <TouchableOpacity
                            style={styles.favHeart}
                            onPress={async () => {
                              haptics.light();
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
                            }}
                            accessibilityLabel="Agregar a favoritos"
                            accessibilityRole="button"
                          >
                            <Ionicons name="heart-outline" size={18} color="#EF4444" />
                          </TouchableOpacity>
                          <View style={styles.foodRight}>
                            <Text style={[styles.foodKcal, { color: c.black }]}>{Math.round(log.calories)}</Text>
                            <Text style={[styles.foodKcalUnit, { color: c.gray }]}>kcal</Text>
                          </View>
                        </View>
                      </SwipeableMealItem>
                      {isExtremeFat && (
                        <NutritionAlerts
                          alerts={[{
                            level: 'danger',
                            title: 'Grasa extrema detectada',
                            message: `"${log.food_name}" tiene ${Math.round(log.fats_g)}g de grasa (${Math.round(fatPercent)}% de tu meta diaria de ${Math.round(userFatTargetG)}g). Considera una porcion mas pequena.`,
                            icon: 'alert-circle',
                            color: '#EF4444',
                            action_label: '',
                            action_route: '',
                          }]}
                        />
                      )}
                    </React.Fragment>
                  );
                })
              ) : (
                <TouchableOpacity
                  style={styles.emptyMeal}
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
                      <Text style={[styles.emptyMealText, { color: c.gray }]}>Anadir {meta.label.toLowerCase()}</Text>
                      <Text style={[styles.emptyMealHint, { color: c.disabled }]}>
                        {mt === 'breakfast' ? 'Empieza bien el dia' :
                         mt === 'lunch' ? 'Registra tu almuerzo' :
                         mt === 'dinner' ? 'No olvides la cena' :
                         'Un snack saludable'}
                      </Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={c.disabled} />
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        {/* Food Diary -- emotional journal for meals */}
        {logs.length > 0 && (
          <FoodDiary
            mealType={logs[0]?.meal_type}
            foodName={logs[0]?.food_name}
            date={dateStr}
          />
        )}

        {/* Delete all meals today -- discrete button at the bottom */}
        {isToday(selectedDate) && logs.length > 0 && (
          <TouchableOpacity
            style={styles.deleteAllBtn}
            onPress={handleDeleteAllToday}
            activeOpacity={0.7}
            accessibilityLabel={`Borrar todas las ${logs.length} comidas de hoy`}
            accessibilityRole="button"
            accessibilityHint="Elimina todas las comidas registradas hoy"
          >
            <Ionicons name="trash-outline" size={14} color="#EF4444" />
            <Text style={styles.deleteAllBtnText}>Borrar todas las comidas de hoy</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: spacing.xl }} />
      </ScrollView>
      </View>
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
  scroll: { paddingTop: spacing.xs },
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
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealTitle: { ...typography.label, flex: 1 },
  mealKcal: { ...typography.caption, fontWeight: '700' },
  mealAddBtn: { padding: 4 },
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
  emptyMeal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.xs,
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
    color: '#EF4444',
    fontWeight: '600',
  },
});
