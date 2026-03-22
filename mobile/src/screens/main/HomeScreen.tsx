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
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Animated,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, typography, spacing, radius, shadows, useLayout, mealColors } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../context/LanguageContext';
import * as foodService from '../../services/food.service';
import { AIFoodLog, DailySummary } from '../../types';
import { HomeSkeleton } from '../../components/SkeletonLoader';
import AnimatedNumber from '../../components/AnimatedNumber';
import StreakBadge from '../../components/StreakBadge';
import FitsiMascot from '../../components/FitsiMascot';
// MINIMALIST REDESIGN Phase 1: removed from HomeScreen
// import HealthAlerts, { generateHealthAlerts } from '../../components/HealthAlerts';
// import HealthKitCard from '../../components/HealthKitCard';
// import FastingTimer from '../../components/FastingTimer';
// import WellnessScore from '../../components/WellnessScore';
import useFadeIn from '../../hooks/useFadeIn';
// MINIMALIST REDESIGN Phase 1: HealthKit card removed
// import useHealthKit from '../../hooks/useHealthKit';
import usePulse from '../../hooks/usePulse';
import { haptics } from '../../hooks/useHaptics';
import { useAnalytics } from '../../hooks/useAnalytics';
import NotificationCenter, {
  NotificationBell,
  useNotifications,
} from '../../components/NotificationCenter';
import { syncWidgetData } from '../../services/widgetData.service';
import NutritionAlerts from '../../components/NutritionAlert';
import useNutritionAlerts from '../../hooks/useNutritionAlerts';
import NutritionSemaphore from '../../components/NutritionSemaphore';
import CalorieComparisonCard from '../../components/CalorieComparisonCard';
import useNutritionRisk from '../../hooks/useNutritionRisk';
// MINIMALIST REDESIGN Phase 1: TrialBanner removed from HomeScreen
// import TrialBanner from '../../components/TrialBanner';

// ─── Below-the-fold components: lazy loaded to speed up initial render ────────
// MINIMALIST REDESIGN Phase 1: removed from HomeScreen
// const NutriScore = lazy(() => import('../../components/NutriScore'));
// const ExerciseBalanceCard = lazy(() => import('../../components/ExerciseBalanceCard'));
// const AdaptiveCalorieBanner = lazy(() => import('../../components/AdaptiveCalorieBanner'));
// const SleepTracker = lazy(() => import('../../components/SleepTracker'));
// const MoodTracker = lazy(() => import('../../components/MoodTracker'));
// const DailyChallenges = lazy(() => import('../../components/DailyChallenges'));
// const OnboardingProgress = lazy(() => import('../../components/OnboardingProgress'));

// ─── Daily nutrition tips (30 tips, one per day of month) ─────────────────────
// MINIMALIST REDESIGN Phase 1: tips removed from HomeScreen, kept array for future use
const DAILY_TIPS = [
  'Beber agua antes de comer puede ayudarte a reducir la ingesta calorica.',
  'La proteina en el desayuno aumenta la saciedad durante toda la manana.',
  'Las frutas enteras tienen mas fibra que los jugos y te mantienen lleno mas tiempo.',
  'Dormir bien es clave: menos de 7 horas altera las hormonas del hambre.',
  'Masticar despacio ayuda a tu cerebro a reconocer la saciedad a tiempo.',
  'Los frutos secos son caloricos pero muy nutritivos. Un punado diario es ideal.',
  'Cocinar en casa te da control total sobre ingredientes y porciones.',
  'La fibra en vegetales verdes mejora la digestion y alimenta tu microbioma.',
  'Reducir el azucar anadido es mas impactante que reducir grasa.',
  'El aguacate es rico en grasas saludables y potasio.',
  'Planificar tus comidas el domingo reduce las malas decisiones entre semana.',
  'Las legumbres son una fuente economica de proteina y fibra.',
  'Evita comer distraido: sin pantallas puedes reconocer mejor la saciedad.',
  'El yogurt griego tiene el doble de proteina que el yogurt normal.',
  'Especias como canela y curcuma tienen propiedades antiinflamatorias.',
  'Hidratar bien mejora la energia, piel y funcion cognitiva.',
  'Los huevos son una de las fuentes mas completas de nutrientes.',
  'Cambiar arroz blanco por integral aumenta la fibra significativamente.',
  'Comer verduras primero en cada comida reduce los picos de glucosa.',
  'El salmon es rico en omega-3, esencial para el cerebro y corazon.',
  'Los batidos verdes son una forma facil de aumentar tu ingesta de vegetales.',
  'Las semillas de chia absorben liquido y aumentan la saciedad.',
  'Reducir alimentos ultraprocesados es el cambio mas impactante.',
  'El te verde contiene antioxidantes y un boost suave de energia.',
  'Comer 5 porciones de frutas y verduras al dia reduce riesgos de salud.',
  'La avena es un desayuno excelente: fibra soluble que sacia por horas.',
  'Caminar 10 minutos despues de comer mejora la digestion y glucosa.',
  'El brocoli tiene mas vitamina C por caloria que las naranjas.',
  'Congelar comida preparada te salva en dias sin tiempo para cocinar.',
  'La consistencia importa mas que la perfeccion. Un 80% es suficiente.',
];

// ─── Mock data for offline / backend unavailable ─────────────────────────────
const MOCK_SUMMARY: DailySummary = {
  date: new Date().toISOString().split('T')[0],
  total_calories: 1240,
  total_protein_g: 82,
  total_carbs_g: 130,
  total_fats_g: 38,
  target_calories: 2100,
  target_protein_g: 150,
  target_carbs_g: 210,
  target_fats_g: 70,
  water_ml: 1500,
  meals_logged: 3,
  streak_days: 4,
};

const MOCK_LOGS: AIFoodLog[] = [
  {
    id: -1, logged_at: new Date().toISOString(), meal_type: 'breakfast',
    food_name: 'Avena con frutas', calories: 320, carbs_g: 52, protein_g: 12, fats_g: 8,
    fiber_g: 5, sugar_g: null, sodium_mg: null, serving_size: null, image_url: null, ai_confidence: 0.95, was_edited: false,
  },
  {
    id: -2, logged_at: new Date().toISOString(), meal_type: 'lunch',
    food_name: 'Pollo a la plancha con arroz', calories: 520, carbs_g: 48, protein_g: 42, fats_g: 14,
    fiber_g: 3, sugar_g: null, sodium_mg: null, serving_size: null, image_url: null, ai_confidence: 0.92, was_edited: false,
  },
  {
    id: -3, logged_at: new Date().toISOString(), meal_type: 'snack',
    food_name: 'Yogurt griego con miel', calories: 180, carbs_g: 18, protein_g: 16, fats_g: 6,
    fiber_g: 0, sugar_g: null, sodium_mg: null, serving_size: null, image_url: null, ai_confidence: 0.88, was_edited: false,
  },
  {
    id: -4, logged_at: new Date().toISOString(), meal_type: 'lunch',
    food_name: 'Ensalada cesar', calories: 220, carbs_g: 12, protein_g: 12, fats_g: 10,
    fiber_g: 4, sugar_g: null, sodium_mg: null, serving_size: null, image_url: null, ai_confidence: 0.90, was_edited: false,
  },
];

// ─── Calorie ring (memoized to avoid re-render when parent state changes) ────

const CalorieRing = React.memo(function CalorieRing({
  consumed,
  target,
  size = 160,
  colors: c,
  remainingLabel,
  goalReachedLabel,
}: {
  consumed: number;
  target: number;
  size?: number;
  colors: ReturnType<typeof useThemeColors>;
  remainingLabel: string;
  goalReachedLabel: string;
}) {
  const strokeWidth = 12;
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const safeConsumed = Math.round(consumed);
  const safeTarget = Math.round(target);
  const progress = safeTarget > 0 ? Math.min(safeConsumed / safeTarget, 1) : 0;
  const remaining = Math.max(safeTarget - safeConsumed, 0);

  // Use integer-safe progress (multiply by 100 to avoid float in Animated)
  const progressInt = Math.round(progress * 100);
  const fillAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    fillAnim.setValue(0);
    Animated.timing(fillAnim, {
      toValue: progressInt,
      duration: 900,
      delay: 200,
      useNativeDriver: false,
    }).start();
  }, [progressInt]);

  // Listen to animated value for SVG strokeDasharray (can't use native driver for SVG)
  const [animDash, setAnimDash] = useState(0);
  useEffect(() => {
    const id = fillAnim.addListener(({ value }) => {
      setAnimDash((value / 100) * circ);
    });
    return () => fillAnim.removeListener(id);
  }, [circ]);

  // Haptic notification when calorie goal is met
  const prevConsumed = useRef(0);
  useEffect(() => {
    if (consumed >= target && prevConsumed.current < target && target > 0) {
      haptics.success();
    }
    prevConsumed.current = consumed;
  }, [consumed, target]);

  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      accessibilityLabel={`${Math.round(consumed)} de ${Math.round(target)} kilocalorías consumidas, ${Math.round(remaining)} restantes`}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: Math.round(target), now: Math.round(consumed) }}
    >
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        {/* Track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={c.surface}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Animated progress */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={consumed > target ? c.protein : c.black}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${animDash} ${circ - animDash}`}
          strokeDashoffset={circ / 4}
          strokeLinecap="round"
        />
      </Svg>
      <AnimatedNumber value={Math.round(consumed)} style={[styles.ringCalories, { color: c.black }]} />
      <Text style={[styles.ringUnit, { color: c.gray }]}>kcal</Text>
      <Text style={[styles.ringRemaining, { color: c.accent }]}>
        {remaining > 0 ? remainingLabel : goalReachedLabel}
      </Text>
    </View>
  );
});

// ─── Macro bar (memoized to skip re-render when sibling macros update) ───────

const MacroBar = React.memo(function MacroBar({
  label,
  value,
  target,
  color,
  unit = 'g',
  delay = 0,
  colors: c,
}: {
  label: string;
  value: number;
  target: number;
  color: string;
  unit?: string;
  delay?: number;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const progress = target > 0 ? Math.min(Math.round(value) / Math.round(target), 1) : 0;
  const fillPercent = `${Math.round(progress * 100)}%`;

  return (
    <View
      style={styles.macroItem}
      accessibilityLabel={`${label}: ${Math.round(value)} de ${Math.round(target)} ${unit}`}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: Math.round(target), now: Math.round(value) }}
    >
      <View style={styles.macroHeader}>
        <Text style={[styles.macroLabel, { color: c.gray }]}>{label}</Text>
        <Text style={[styles.macroValue, { color: c.black }]}>
          {Math.round(value)}
          <Text style={[styles.macroTarget, { color: c.gray }]}>/{Math.round(target)}{unit}</Text>
        </Text>
      </View>
      <View style={[styles.macroTrack, { backgroundColor: c.surface }]}>
        <View style={[styles.macroFill, { width: fillPercent as any, backgroundColor: color }]} />
      </View>
    </View>
  );
});

// ─── Meal section (memoized so unchanged meal groups skip re-render) ─────────

const MEAL_META = mealColors;

const MealSection = React.memo(function MealSection({
  mealType,
  logs,
  colors: c,
}: {
  mealType: string;
  logs: AIFoodLog[];
  colors: ReturnType<typeof useThemeColors>;
}) {
  const meta = MEAL_META[mealType] ?? { label: mealType, icon: 'restaurant-outline', color: c.gray };
  const total = logs.reduce((s, l) => s + l.calories, 0);

  if (logs.length === 0) return null;

  return (
    <View
      style={[styles.mealSection, { borderBottomColor: c.surface }]}
      accessibilityLabel={`${meta.label}: ${Math.round(total)} kilocalorías, ${logs.length} alimento${logs.length > 1 ? 's' : ''}`}
    >
      <View style={styles.mealHeader}>
        <Ionicons name={meta.icon as any} size={16} color={meta.color} />
        <Text style={[styles.mealTitle, { color: c.black }]}>{meta.label}</Text>
        <Text style={[styles.mealCalories, { color: c.black }]}>{Math.round(total)} kcal</Text>
      </View>
      {logs.map((log) => (
        <View
          key={log.id}
          style={styles.foodRow}
          accessibilityLabel={`${log.food_name}, ${Math.round(log.calories)} kilocalorías`}
        >
          <Text style={[styles.foodName, { color: c.gray }]} numberOfLines={1}>{log.food_name}</Text>
          <Text style={[styles.foodKcal, { color: c.gray }]}>{Math.round(log.calories)} kcal</Text>
        </View>
      ))}
    </View>
  );
});

// ─── Main screen ──────────────────────────────────────────────────────────────

// ─── Stable constant — hoisted outside component to avoid re-creation ────────
const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

export default function HomeScreen({ navigation }: any) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { contentWidth, sidePadding } = useLayout();
  const c = useThemeColors();
  const { t } = useTranslation();
  const { track } = useAnalytics('Home');
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [logs, setLogs] = useState<AIFoodLog[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Nutrition alerts
  const { alerts: nutritionAlerts, refetch: refetchAlerts } = useNutritionAlerts();

  // Nutrition risk engine
  const {
    riskScore,
    status: riskStatus,
    daysSinceLastLog,
    refetch: refetchRisk,
  } = useNutritionRisk();

  // Notification center state
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    dismiss: dismissNotification,
    clearAll: clearAllNotifications,
  } = useNotifications();
  const [notifSheetVisible, setNotifSheetVisible] = useState(false);

  // Fade-in animation for content — show even during error if mock data is loaded
  const fadeStyle = useFadeIn(!loading);

  // Pulse animation on scan button when no meals logged (draws attention)
  const pulseStyle = usePulse({ active: !loading && logs.length === 0, duration: 2000 });

  // Parallax: header greeting moves slower than scroll content
  const scrollY = useRef(new Animated.Value(0)).current;
  const headerTranslateY = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [0, 20],
    extrapolate: 'clamp',
  });
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 80],
    outputRange: [1, 0.6],
    extrapolate: 'clamp',
  });

  // Stable load function — single fetch for summary + logs (no duplicate calls)
  const load = useCallback(async () => {
    setError(false);
    try {
      const [s, l] = await Promise.allSettled([
        foodService.getDailySummary(),
        foodService.getFoodLogs(),
      ]);

      const summaryOk = s.status === 'fulfilled';
      const logsOk = l.status === 'fulfilled';

      if (summaryOk) {
        setSummary(s.value);
      }
      if (logsOk) {
        setLogs(l.value);
      }

      // If both API calls failed, fall back to mock data so the screen is usable
      if (!summaryOk && !logsOk) {
        setError(true);
        setSummary(MOCK_SUMMARY);
        setLogs(MOCK_LOGS);
      } else if (!summaryOk) {
        setError(true);
        setSummary(MOCK_SUMMARY);
      } else if (!logsOk) {
        setError(true);
      }
    } catch {
      setError(true);
      setSummary(MOCK_SUMMARY);
      setLogs(MOCK_LOGS);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  // Sync widget data whenever summary or logs update
  useEffect(() => {
    if (!summary) return;
    const totalFiber = logs.reduce((sum, l) => sum + (l.fiber_g ?? 0), 0);
    const uniqueFoods = new Set(logs.map((l) => l.food_name.toLowerCase().trim())).size;
    syncWidgetData({
      total_calories: summary.total_calories,
      target_calories: summary.target_calories,
      total_protein_g: summary.total_protein_g,
      target_protein_g: summary.target_protein_g,
      total_carbs_g: summary.total_carbs_g,
      target_carbs_g: summary.target_carbs_g,
      total_fats_g: summary.total_fats_g,
      target_fats_g: summary.target_fats_g,
      water_ml: summary.water_ml,
      streak_days: summary.streak_days,
      meals_logged: summary.meals_logged,
      total_fiber_g: totalFiber,
      food_variety: uniqueFoods,
    }).catch(() => {});
  }, [summary, logs]);

  // Stable callback — avoids re-creating on every render
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    haptics.light();
    await Promise.all([load(), refetchAlerts(), refetchRisk()]);
    haptics.success();
    setRefreshing(false);
  }, [load, refetchAlerts, refetchRisk]);

  // Memoize greeting to avoid calling t() on every render
  const greetingText = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return t('home.goodMorning');
    if (h < 18) return t('home.goodAfternoon');
    return t('home.goodEvening');
  }, [t]);

  // Memoize derived nutrition values to avoid recalculation on every render
  const { consumed, target, protein, proteinTarget, carbs, carbsTarget, fats, fatsTarget, streak } = useMemo(() => ({
    consumed: summary?.total_calories ?? 0,
    target: summary?.target_calories ?? 2000,
    protein: summary?.total_protein_g ?? 0,
    proteinTarget: summary?.target_protein_g ?? 150,
    carbs: summary?.total_carbs_g ?? 0,
    carbsTarget: summary?.target_carbs_g ?? 200,
    fats: summary?.total_fats_g ?? 0,
    fatsTarget: summary?.target_fats_g ?? 65,
    streak: summary?.streak_days ?? 0,
  }), [summary]);

  // Memoize meal grouping to avoid re-filtering on unrelated state changes
  const logsByMeal = useMemo(() => {
    const grouped: Record<string, AIFoodLog[]> = {};
    for (const mt of MEAL_ORDER) {
      grouped[mt] = logs.filter((l) => l.meal_type === mt);
    }
    return grouped;
  }, [logs]);

  const hasMeals = logs.length > 0;

  // MINIMALIST REDESIGN Phase 1: removed NutriScore, HealthAlerts, ExerciseBalance,
  // WellnessScore, AdaptiveCalorieBanner derived data

  // ---- Navigation callbacks (stable refs to prevent child re-renders) ----
  const onNavigateToAchievements = useCallback(() => {
    haptics.light();
    navigation.navigate('Achievements');
  }, [navigation]);

  const onNotifBellPress = useCallback(() => {
    track('notification_bell_pressed', { unread: unreadCount });
    setNotifSheetVisible(true);
  }, [track, unreadCount]);

  const onScanPress = useCallback(() => {
    haptics.light();
    track('scan_button_pressed', { source: 'header' });
    navigation.navigate('Scan');
  }, [track, navigation]);

  const onRetryPress = useCallback(() => {
    haptics.light();
    setLoading(true);
    load();
  }, [load]);

  const onCloseNotifications = useCallback(() => {
    setNotifSheetVisible(false);
  }, []);

  // Nutrition alert action handler — navigates based on backend action_route
  const onAlertAction = useCallback((route: string) => {
    const routeMap: Record<string, string> = {
      '/log': 'Registro',
      '/scan': 'Scan',
      '/dashboard': 'Home',
      '/water': 'Registro',
      '/foods': 'FoodSearch',
      '/foods?category=protein': 'FoodSearch',
      '/foods?category=healthy': 'FoodSearch',
    };
    const screen = routeMap[route] || 'Home';
    navigation.navigate(screen);
  }, [navigation]);

  // ---- QuickAction navigation callbacks (stable refs) ----
  const onQuickScan = useCallback(() => { haptics.light(); navigation.navigate('Scan'); }, [navigation]);
  const onQuickWater = useCallback(() => { haptics.light(); navigation.navigate('Registro'); }, [navigation]);
  const onQuickFavorites = useCallback(() => { haptics.light(); navigation.navigate('Favorites'); }, [navigation]);
  const onQuickReports = useCallback(() => { haptics.light(); navigation.navigate('Reports'); }, [navigation]);

  // ---- Risk-adaptive QuickAction callbacks ----
  const onQuickLog = useCallback(() => { haptics.light(); navigation.navigate('Registro'); }, [navigation]);
  const onCopyYesterday = useCallback(() => { haptics.light(); navigation.navigate('Registro'); }, [navigation]);
  const onSuggestedMeal = useCallback(() => { haptics.light(); navigation.navigate('Recipes'); }, [navigation]);
  const isHighRisk = riskScore > 40;

  const onScanFromEmpty = useCallback(() => {
    haptics.light();
    track('scan_button_pressed', { source: 'empty_state' });
    navigation.navigate('Scan');
  }, [track, navigation]);

  // Memoize calorie ring labels
  const caloriesLeftLabel = useMemo(
    () => t('home.caloriesLeft', { count: Math.round(Math.max(target - consumed, 0)) }),
    [t, target, consumed],
  );
  const goalReachedLabel = useMemo(() => t('home.goalReached'), [t]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      {/* Header with parallax */}
      <View style={[styles.header, { paddingHorizontal: sidePadding }]}>
        <Animated.View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, transform: [{ translateY: headerTranslateY }], opacity: headerOpacity }}>
          <FitsiMascot
            expression="strong"
            size="small"
            animation="idle"
          />
          <View accessibilityRole="header">
            <Text style={[styles.greeting, { color: c.gray }]}>{greetingText},</Text>
            <Text style={[styles.userName, { color: c.black }]}>{user?.first_name || t('profile.user')}</Text>
          </View>
        </Animated.View>
        <View style={styles.headerRight}>
          <StreakBadge
            days={streak}
            onPress={onNavigateToAchievements}
          />
          <NotificationBell
            unreadCount={unreadCount}
            onPress={onNotifBellPress}
          />
          <TouchableOpacity
            onPress={onScanPress}
            accessibilityLabel="Escanear comida con la camara"
            accessibilityRole="button"
            accessibilityHint="Abre la camara para escanear alimentos con IA"
            activeOpacity={0.85}
          >
            <Animated.View style={[styles.scanBtn, { backgroundColor: c.black }, pulseStyle]}>
              <Ionicons name="camera" size={20} color={c.white} />
            </Animated.View>
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
              style={[styles.errorBanner, { marginHorizontal: sidePadding, backgroundColor: c.accent }]}
              onPress={onRetryPress}
              activeOpacity={0.8}
              accessibilityLabel="Error al cargar datos. Toca para reintentar"
              accessibilityRole="button"
            >
              <Ionicons name="wifi-outline" size={16} color={c.white} />
              <Text style={[styles.errorBannerText, { color: c.white }]}>{t('home.offlineBanner')}</Text>
            </TouchableOpacity>
          )}

          {/* Nutrition alerts — rendered above scroll content */}
          {nutritionAlerts.length > 0 && (
            <View style={{ paddingHorizontal: sidePadding }}>
              <NutritionAlerts alerts={nutritionAlerts} onAction={onAlertAction} />
            </View>
          )}

          {/* Risk semaphore — prominent when riskScore > 60 */}
          {riskScore > 60 && (
            <View style={[styles.semaphoreContainer, { paddingHorizontal: sidePadding }]}>
              <NutritionSemaphore riskScore={riskScore} status={riskStatus} size={100} />
            </View>
          )}

          {/* Re-engagement banner — user hasn't logged in 3+ days */}
          {daysSinceLastLog >= 3 && (
            <View style={[styles.reengageBanner, { marginHorizontal: sidePadding }]}>
              <FitsiMascot expression="sad" size="small" animation="sad" />
              <View style={{ flex: 1 }}>
                <Text style={styles.reengageTitle}>Te echamos de menos!</Text>
                <Text style={styles.reengageMsg}>
                  Llevas {daysSinceLastLog} dias sin registrar. Fitsi te espera para retomar tu seguimiento.
                </Text>
              </View>
            </View>
          )}

          <Animated.ScrollView
            showsVerticalScrollIndicator={false}
            bounces={true}
            overScrollMode="never"
            contentContainerStyle={[styles.scroll, { paddingHorizontal: sidePadding }]}
            scrollEventThrottle={16}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { y: scrollY } } }],
              { useNativeDriver: true }
            )}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={c.black}
              />
            }
          >
            <Animated.View style={fadeStyle}>
              {/* Calorie Ring + Macro Bars — the core card */}
              <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.grayLight }]} accessibilityLabel="Resumen de calorias del dia">
                <View style={styles.ringRow}>
                  <CalorieRing
                    consumed={consumed}
                    target={target}
                    colors={c}
                    remainingLabel={caloriesLeftLabel}
                    goalReachedLabel={goalReachedLabel}
                  />
                  <View style={styles.macros}>
                    <MacroBar label={t('home.protein')} value={protein} target={proteinTarget} color={c.protein} delay={0} colors={c} />
                    <MacroBar label={t('home.carbs')} value={carbs} target={carbsTarget} color={c.carbs} delay={100} colors={c} />
                    <MacroBar label={t('home.fats')} value={fats} target={fatsTarget} color={c.fats} delay={200} colors={c} />
                  </View>
                </View>
              </View>

              {/* Calorie comparison bar */}
              <CalorieComparisonCard logged={consumed} target={target} status={riskStatus} />

              {/* Best Day Banner */}
              {summary && (summary.meals_logged ?? 0) > 0 && (
                <TouchableOpacity
                  style={styles.bestDayBanner}
                  onPress={onQuickReports}
                  activeOpacity={0.8}
                  accessibilityLabel="Tu mejor dia esta semana: Viernes, 125 gramos de proteinas"
                  accessibilityRole="button"
                >
                  <Ionicons name="trophy" size={18} color="#F59E0B" />
                  <Text style={styles.bestDayText}>
                    <Text style={styles.bestDayBold}>Tu mejor dia esta semana: </Text>
                    Viernes — 125g proteinas
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color="#92400E" />
                </TouchableOpacity>
              )}

              {/* Quick Actions — adaptive based on risk score */}
              <View style={styles.quickActionsRow}>
                {isHighRisk ? (
                  <>
                    <TouchableOpacity
                      style={[styles.quickAction, { backgroundColor: c.surface, borderColor: c.grayLight }]}
                      onPress={onQuickLog}
                      activeOpacity={0.8}
                      accessibilityLabel="Registro rapido de comida"
                      accessibilityRole="button"
                    >
                      <View style={[styles.quickActionIcon, { backgroundColor: '#22C55E' }]}>
                        <Ionicons name="add-circle" size={18} color={c.white} />
                      </View>
                      <Text style={[styles.quickActionLabel, { color: c.black }]}>Registro Rapido</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.quickAction, { backgroundColor: c.surface, borderColor: c.grayLight }]}
                      onPress={onCopyYesterday}
                      activeOpacity={0.8}
                      accessibilityLabel="Copiar comidas de ayer"
                      accessibilityRole="button"
                    >
                      <View style={[styles.quickActionIcon, { backgroundColor: c.primary }]}>
                        <Ionicons name="copy" size={18} color={c.white} />
                      </View>
                      <Text style={[styles.quickActionLabel, { color: c.black }]}>Copiar ayer</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.quickAction, { backgroundColor: c.surface, borderColor: c.grayLight }]}
                      onPress={onSuggestedMeal}
                      activeOpacity={0.8}
                      accessibilityLabel="Ver comida sugerida"
                      accessibilityRole="button"
                    >
                      <View style={[styles.quickActionIcon, { backgroundColor: '#F97316' }]}>
                        <Ionicons name="restaurant" size={18} color={c.white} />
                      </View>
                      <Text style={[styles.quickActionLabel, { color: c.black }]}>Comida sugerida</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TouchableOpacity
                      style={[styles.quickAction, { backgroundColor: c.surface, borderColor: c.grayLight }]}
                      onPress={onQuickScan}
                      activeOpacity={0.8}
                      accessibilityLabel="Escanear comida"
                      accessibilityRole="button"
                    >
                      <View style={[styles.quickActionIcon, { backgroundColor: c.black }]}>
                        <Ionicons name="camera" size={18} color={c.white} />
                      </View>
                      <Text style={[styles.quickActionLabel, { color: c.black }]}>Scan</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.quickAction, { backgroundColor: c.surface, borderColor: c.grayLight }]}
                      onPress={onQuickWater}
                      activeOpacity={0.8}
                      accessibilityLabel="Registrar agua"
                      accessibilityRole="button"
                    >
                      <View style={[styles.quickActionIcon, { backgroundColor: c.primary }]}>
                        <Ionicons name="water" size={18} color={c.white} />
                      </View>
                      <Text style={[styles.quickActionLabel, { color: c.black }]}>Water</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.quickAction, { backgroundColor: c.surface, borderColor: c.grayLight }]}
                      onPress={onQuickFavorites}
                      activeOpacity={0.8}
                      accessibilityLabel="Ver favoritos"
                      accessibilityRole="button"
                    >
                      <View style={[styles.quickActionIcon, { backgroundColor: '#EF4444' }]}>
                        <Ionicons name="heart" size={18} color={c.white} />
                      </View>
                      <Text style={[styles.quickActionLabel, { color: c.black }]}>Favoritos</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>

              {/* Motivational banner — no meals logged and it's past 2pm */}
              {!hasMeals && new Date().getHours() >= 14 && (
                <View
                  style={[styles.motivationalBanner, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}
                  accessibilityLabel="Aun no has registrado comida hoy. Tu cuerpo necesita combustible."
                >
                  <FitsiMascot expression="hungry" size="small" animation="sad" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.motivationalTitle, { color: '#92400E' }]}>
                      Aun no has registrado comida hoy!
                    </Text>
                    <Text style={[styles.motivationalMessage, { color: '#92400E' }]}>
                      Tu cuerpo necesita combustible. Registra lo que has comido para mantener tu seguimiento al dia.
                    </Text>
                  </View>
                </View>
              )}

              {/* Today's meals — always visible (core content) */}
              <Text style={[styles.sectionTitle, { color: c.black }]} accessibilityRole="header">{t('home.today')}</Text>
              {hasMeals ? (
                <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
                  {MEAL_ORDER.map((mt) => (
                    <MealSection key={mt} mealType={mt} logs={logsByMeal[mt]} colors={c} />
                  ))}
                </View>
              ) : (
                <View style={[styles.card, styles.emptyCard, { backgroundColor: c.surface, borderColor: c.grayLight }]} accessibilityLabel="Sin comidas registradas hoy">
                  <Ionicons name="restaurant-outline" size={36} color={c.grayLight} />
                  <Text style={[styles.emptyText, { color: c.black }]}>{t('home.noMealsLogged')}</Text>
                  <Text style={[styles.emptyHint, { color: c.gray }]}>{t('home.scanYourFood')}</Text>
                  <TouchableOpacity
                    style={[styles.scanCta, { backgroundColor: c.black }]}
                    onPress={onScanFromEmpty}
                    accessibilityLabel="Escanear ahora"
                    accessibilityRole="button"
                    accessibilityHint="Abre la camara para escanear tu primer alimento del dia"
                  >
                    <Ionicons name="camera-outline" size={18} color={c.white} />
                    <Text style={[styles.scanCtaText, { color: c.white }]}>{t('home.scanNow')}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Report CTA */}
              <TouchableOpacity
                style={[styles.reportBtn, { backgroundColor: c.surface, borderColor: c.grayLight }]}
                onPress={onQuickReports}
                activeOpacity={0.85}
                accessibilityLabel="Ver reporte semanal y mensual"
                accessibilityRole="button"
              >
                <Ionicons name="bar-chart-outline" size={18} color={c.accent} />
                <Text style={[styles.reportBtnText, { color: c.black }]}>{t('home.viewReport')}</Text>
                <Ionicons name="chevron-forward" size={16} color={c.gray} />
              </TouchableOpacity>

              <View style={{ height: spacing.xl }} />
            </Animated.View>
          </Animated.ScrollView>
        </>
      )}

      {/* Notification Center bottom sheet */}
      <NotificationCenter
        visible={notifSheetVisible}
        onClose={onCloseNotifications}
        notifications={notifications}
        onMarkAsRead={markAsRead}
        onMarkAllAsRead={markAllAsRead}
        onDismiss={dismissNotification}
        onClearAll={clearAllNotifications}
      />

      {/* Critical overlay — semi-transparent red when status is critical */}
      {riskStatus === 'critical' && (
        <View style={styles.criticalOverlay} pointerEvents="none" accessibilityLabel="Alerta critica: tu riesgo nutricional es critico">
          <View style={styles.criticalBadge}>
            <Ionicons name="warning" size={24} color="#FFFFFF" />
            <Text style={styles.criticalText}>ALERTA CRITICA</Text>
            <Text style={styles.criticalSubtext}>Tu riesgo nutricional requiere atencion inmediata</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  errorBannerText: { ...typography.caption, flex: 1 },
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
  greeting: {
    ...typography.caption,
  },
  userName: {
    ...typography.titleSm,
    marginTop: 2,
  },
  scanBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    paddingTop: spacing.sm,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
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
    textAlign: 'center',
  },
  ringUnit: {
    ...typography.caption,
    textAlign: 'center',
  },
  ringRemaining: {
    fontSize: 11,
    fontWeight: '600',
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
  },
  macroValue: {
    ...typography.caption,
    fontWeight: '700',
  },
  macroTarget: {
    fontWeight: '400',
  },
  macroTrack: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
  },
  macroFill: {
    height: 5,
    borderRadius: 3,
  },
  sectionTitle: {
    ...typography.label,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  mealSection: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  mealHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 6,
  },
  mealTitle: {
    ...typography.label,
    flex: 1,
  },
  mealCalories: {
    ...typography.caption,
    fontWeight: '700',
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
    flex: 1,
  },
  foodKcal: {
    ...typography.caption,
    fontWeight: '600',
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  emptyText: {
    ...typography.bodyMd,
  },
  emptyHint: {
    ...typography.caption,
  },
  scanCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
    marginTop: spacing.sm,
    minHeight: 44,
  },
  scanCtaText: {
    ...typography.label,
  },
  bestDayBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: radius.lg,
    padding: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  bestDayText: {
    flex: 1,
    fontSize: 13,
    color: '#92400E',
    lineHeight: 18,
  },
  bestDayBold: {
    fontWeight: '700',
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  quickAction: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.xs,
    ...shadows.sm,
  },
  quickActionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionLabel: {
    ...typography.caption,
    fontWeight: '600',
  },
  reportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  reportBtnText: {
    ...typography.label,
    flex: 1,
  },
  motivationalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  motivationalTitle: {
    ...typography.label,
    fontWeight: '700',
    marginBottom: 2,
  },
  motivationalMessage: {
    ...typography.caption,
    lineHeight: 18,
    opacity: 0.85,
  },
  // ─── Risk UI styles ─────────────────────────────────────────────────────
  semaphoreContainer: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  reengageBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  reengageTitle: {
    ...typography.label,
    fontWeight: '700',
    color: '#991B1B',
    marginBottom: 2,
  },
  reengageMsg: {
    ...typography.caption,
    color: '#991B1B',
    lineHeight: 18,
    opacity: 0.85,
  },
  criticalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(220, 38, 38, 0.12)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 100,
  },
  criticalBadge: {
    backgroundColor: '#DC2626',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
  criticalText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
  criticalSubtext: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
});
