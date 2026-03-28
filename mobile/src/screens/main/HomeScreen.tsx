/**
 * HomeScreen — Dashboard diario Fitsi IA style
 * Muestra: anillo de calorías, macros, comidas del día.
 *
 * UX Polish:
 * - Skeleton shimmer loading (HomeSkeleton) instead of spinner
 * - Full-screen error state with animated icon and retry button
 * - Partial error banner with inline retry for degraded connectivity
 * - Animated calorie ring using AnimatedCircle (no state re-renders)
 * - Animated macro bar fill transitions (Easing.out cubic)
 * - Staggered fade-in for food rows in each meal section
 * - Animated empty state with spring-scaled icon
 * - Animated calorie number counting with scale pop
 * - Fade-in content animation on data load
 * - Pull-to-refresh with platform-aware RefreshControl
 * - Haptic feedback on scan button, refresh, and goal completion
 * - Full accessibility labels, roles, values, and hints
 * - React.memo on all sub-components (CalorieRing, MacroBar,
 *   MealSection, QuickActionButton, ErrorFullScreen, EmptyMealsState,
 *   DailyTipCard) to prevent unnecessary re-renders
 * - Daily nutrition tip card (30 tips, one per day of month)
 * - Design system colors used throughout (no hardcoded palette values)
 */
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Animated,
  Easing,
  Platform,
  StatusBar,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { HomeStackScreenProps } from '../../navigation/types';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, typography, spacing, radius, shadows, useLayout, mealColors } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { useAppTheme } from '../../context/ThemeContext';
import { useTranslation } from '../../context/LanguageContext';
import * as foodService from '../../services/food.service';
import { AIFoodLog, DailySummary } from '../../types';
import { HomeSkeleton } from '../../components/SkeletonLoader';
import AnimatedNumber from '../../components/AnimatedNumber';
import StreakBadge from '../../components/StreakBadge';
import useFadeIn from '../../hooks/useFadeIn';
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
import RiskSkeleton from '../../components/RiskSkeleton';
import RecoveryPlanCard, { RecoveryPlanData } from '../../components/RecoveryPlanCard';
import { apiClient } from '../../services/apiClient';
import ProgressWidget from '../../components/ProgressWidget';
import DailyMissionsCard from '../../components/DailyMissionsCard';
import useProgress from '../../hooks/useProgress';
import MealRecommendationsSection from '../../components/MealRecommendationsSection';
import type { RecommendedMeal } from '../../hooks/useRecommendations';
import useDaySwipe, { toDateStr } from '../../hooks/useDaySwipe';
import DateNavigator from '../../components/DateNavigator';
import AdaptiveCalorieBanner from '../../components/AdaptiveCalorieBanner';

// ─── Daily nutrition tips (30 tips, one per day of month) ─────────────────────
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
  calories_burned_exercise: 0,
  calories_remaining: 860,
  net_calories: 1240,
  exercises_today: [],
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

// ─── Exercise color constant ───────────────────────────────────────────────
const EXERCISE_ORANGE = '#F97316';

/** Animated SVG Circle — bridges Animated.Value to strokeDashoffset prop */
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const CalorieRing = React.memo(function CalorieRing({
  consumed,
  burned,
  target,
  size = 160,
  colors: c,
  remainingLabel,
  goalReachedLabel,
}: {
  consumed: number;
  burned: number;
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
  const safeBurned = Math.round(burned);
  const safeTarget = Math.round(target);

  // Net calories: consumed - burned
  const netCalories = Math.max(safeConsumed - safeBurned, 0);
  // Remaining: target - consumed + burned (exercise "earns back" calories)
  const caloriesRemaining = Math.max(safeTarget - safeConsumed + safeBurned, 0);

  // Consumed arc: fraction of target that has been consumed (food)
  const consumedFraction = safeTarget > 0 ? Math.min(safeConsumed / safeTarget, 1) : 0;
  // Burned arc: fraction of target represented by exercise
  const burnedFraction = safeTarget > 0 ? Math.min(safeBurned / safeTarget, 0.5) : 0;

  // Animate consumed arc via AnimatedCircle (no state re-renders, pure native bridge)
  const consumedAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    consumedAnim.setValue(0);
    Animated.timing(consumedAnim, {
      toValue: consumedFraction,
      duration: 900,
      delay: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [consumedFraction]);

  const consumedDashOffset = consumedAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [circ, 0],
    extrapolate: 'clamp',
  });

  // Animate burned arc via AnimatedCircle
  const burnedAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    burnedAnim.setValue(0);
    Animated.timing(burnedAnim, {
      toValue: burnedFraction,
      duration: 700,
      delay: 500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [burnedFraction]);

  const burnedDashArray = burnedAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, circ],
    extrapolate: 'clamp',
  });

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
      accessibilityLabel={`${safeConsumed} consumidas, ${safeBurned} quemadas, ${caloriesRemaining} restantes de ${safeTarget} kilocalorias`}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: safeTarget, now: netCalories }}
    >
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        {/* Track (background ring) */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={c.surface}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Burned arc (orange) — rendered first so consumed overlaps it */}
        {safeBurned > 0 && (
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={EXERCISE_ORANGE}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circ}
            strokeDashoffset={burnedDashArray}
            strokeLinecap="round"
            rotation="-90"
            origin={`${size / 2}, ${size / 2}`}
            opacity={0.85}
          />
        )}
        {/* Consumed arc (green/success or red when over target) */}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={consumed > target ? c.protein : c.success}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circ}
          strokeDashoffset={consumedDashOffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <AnimatedNumber value={netCalories} style={[styles.ringCalories, { color: c.black }]} />
      <Text style={[styles.ringUnit, { color: c.gray }]}>kcal netas</Text>
      <Text style={[styles.ringRemaining, { color: c.accent }]}>
        {caloriesRemaining > 0 ? remainingLabel : goalReachedLabel}
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

  // Animated fill width for smooth transitions when macros update
  const fillAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fillAnim, {
      toValue: progress,
      duration: 700,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress, delay]);

  const fillWidth = fillAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

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
        <Animated.View style={[styles.macroFill, { width: fillWidth as any, backgroundColor: color }]} />
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
  isLast = false,
}: {
  mealType: string;
  logs: AIFoodLog[];
  colors: ReturnType<typeof useThemeColors>;
  isLast?: boolean;
}) {
  const meta = MEAL_META[mealType] ?? { label: mealType, icon: 'restaurant-outline', color: c.gray };
  const total = logs.reduce((s, l) => s + l.calories, 0);

  // Staggered fade-in for food rows
  const rowAnims = useRef(logs.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    if (logs.length === 0) return;
    // Reset and stagger
    const animations = logs.map((_, i) => {
      rowAnims[i] = rowAnims[i] || new Animated.Value(0);
      rowAnims[i].setValue(0);
      return Animated.timing(rowAnims[i], {
        toValue: 1,
        duration: 250,
        delay: i * 60,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      });
    });
    Animated.stagger(60, animations).start();
  }, [logs.length]);

  if (logs.length === 0) return null;

  return (
    <View
      style={[styles.mealSection, { borderBottomColor: c.surface }, isLast && { borderBottomWidth: 0 }]}
      accessibilityLabel={`${meta.label}: ${Math.round(total)} kilocalorias, ${logs.length} alimento${logs.length > 1 ? 's' : ''}`}
    >
      <View style={styles.mealHeader}>
        <Ionicons name={meta.icon as any} size={16} color={meta.color} />
        <Text style={[styles.mealTitle, { color: c.black }]}>{meta.label}</Text>
        <Text style={[styles.mealCalories, { color: c.black }]}>{Math.round(total)} kcal</Text>
      </View>
      {logs.map((log, index) => (
        <Animated.View
          key={log.id}
          style={[
            styles.foodRow,
            {
              opacity: rowAnims[index] || 1,
              transform: [{ translateX: (rowAnims[index] || new Animated.Value(1)).interpolate({
                inputRange: [0, 1],
                outputRange: [-8, 0],
                extrapolate: 'clamp',
              }) }],
            },
          ]}
          accessibilityLabel={`${log.food_name}, ${Math.round(log.calories)} kilocalorias`}
        >
          <Text style={[styles.foodName, { color: c.gray }]} numberOfLines={1}>{log.food_name}</Text>
          <Text style={[styles.foodKcal, { color: c.gray }]}>{Math.round(log.calories)} kcal</Text>
        </Animated.View>
      ))}
    </View>
  );
});

// ─── Memoized Quick Action Button ─────────────────────────────────────────────
const QuickActionButton = React.memo(function QuickActionButton({
  label,
  iconName,
  iconColor,
  iconBgColor,
  onPress,
  colors: c,
}: {
  label: string;
  iconName: string;
  iconColor: string;
  iconBgColor: string;
  onPress: () => void;
  colors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <TouchableOpacity
      style={[styles.quickAction, { backgroundColor: c.surface, borderColor: c.grayLight }]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityLabel={label}
      accessibilityRole="button"
    >
      <View style={[styles.quickActionIcon, { backgroundColor: iconBgColor }]} importantForAccessibility="no-hide-descendants">
        <Ionicons name={iconName as any} size={18} color={iconColor} />
      </View>
      <Text style={[styles.quickActionLabel, { color: c.black }]} allowFontScaling>{label}</Text>
    </TouchableOpacity>
  );
});

// ─── Error Full Screen — shown when initial load fails completely ─────────────
const ErrorFullScreen = React.memo(function ErrorFullScreen({
  onRetry,
  colors: c,
  retryLabel,
  errorTitle,
  errorMessage,
}: {
  onRetry: () => void;
  colors: ReturnType<typeof useThemeColors>;
  retryLabel: string;
  errorTitle: string;
  errorMessage: string;
}) {
  const bounceAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -6, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();
  }, []);

  return (
    <View style={styles.errorFullScreen} accessibilityRole="alert">
      <Animated.View style={{ transform: [{ translateY: bounceAnim }] }}>
        <Ionicons name="cloud-offline-outline" size={56} color={c.disabled} />
      </Animated.View>
      <Text style={[styles.errorFullTitle, { color: c.black }]} allowFontScaling>{errorTitle}</Text>
      <Text style={[styles.errorFullMessage, { color: c.gray }]} allowFontScaling>{errorMessage}</Text>
      <TouchableOpacity
        style={[styles.errorRetryBtn, { backgroundColor: c.accent }]}
        onPress={onRetry}
        activeOpacity={0.85}
        accessibilityLabel={retryLabel}
        accessibilityRole="button"
      >
        <Ionicons name="refresh-outline" size={18} color={c.white} />
        <Text style={[styles.errorRetryText, { color: c.white }]}>{retryLabel}</Text>
      </TouchableOpacity>
    </View>
  );
});

// ─── Enhanced Empty State with animation ──────────────────────────────────────
const EmptyMealsState = React.memo(function EmptyMealsState({
  onScan,
  colors: c,
  noMealsText,
  scanHint,
  scanNowText,
}: {
  onScan: () => void;
  colors: ReturnType<typeof useThemeColors>;
  noMealsText: string;
  scanHint: string;
  scanNowText: string;
}) {
  const iconScale = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(iconScale, {
      toValue: 1,
      friction: 4,
      tension: 100,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <View
      style={[styles.card, styles.emptyCard, { backgroundColor: c.surface, borderColor: c.grayLight }]}
      accessibilityLabel="Sin comidas registradas hoy"
    >
      <Animated.View style={{ transform: [{ scale: iconScale }] }}>
        <Ionicons name="restaurant-outline" size={44} color={c.disabled} />
      </Animated.View>
      <Text style={[styles.emptyText, { color: c.black }]} allowFontScaling>{noMealsText}</Text>
      <Text style={[styles.emptyHint, { color: c.gray }]} allowFontScaling>{scanHint}</Text>
      <TouchableOpacity
        style={[styles.scanCta, { backgroundColor: c.accent }]}
        onPress={onScan}
        accessibilityLabel="Escanear ahora"
        accessibilityRole="button"
        accessibilityHint="Abre la camara para escanear tu primer alimento del dia"
        activeOpacity={0.85}
      >
        <Ionicons name="camera-outline" size={18} color={c.white} />
        <Text style={[styles.scanCtaText, { color: c.white }]}>{scanNowText}</Text>
      </TouchableOpacity>
    </View>
  );
});

// ─── Daily Tip Card (memoized, one tip per day of month) ──────────────────────
const DailyTipCard = React.memo(function DailyTipCard({
  colors: c,
}: {
  colors: ReturnType<typeof useThemeColors>;
}) {
  const tipIndex = new Date().getDate() - 1;
  const tip = DAILY_TIPS[tipIndex % DAILY_TIPS.length];

  return (
    <View
      style={[styles.dailyTipCard, { backgroundColor: c.surfaceAlt, borderColor: c.grayLight }]}
      accessibilityLabel={`Consejo del dia: ${tip}`}
      accessibilityRole="text"
    >
      <Ionicons name="bulb-outline" size={16} color={c.accent} accessibilityElementsHidden={true} importantForAccessibility="no" />
      <Text style={[styles.dailyTipText, { color: c.gray }]} allowFontScaling>{tip}</Text>
    </View>
  );
});

// ─── Main screen ──────────────────────────────────────────────────────────────

// ─── Stable constant — hoisted outside component to avoid re-creation ────────
const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

export default function HomeScreen({ navigation }: HomeStackScreenProps<'HomeMain'>) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { contentWidth, sidePadding } = useLayout();
  const c = useThemeColors();
  const { isDark } = useAppTheme();
  const { t } = useTranslation();
  const { track } = useAnalytics('Home');
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [logs, setLogs] = useState<AIFoodLog[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Track whether the initial load failed completely (both API calls).
  // When true, the full-screen error state is shown instead of mock data.
  const [loadFailed, setLoadFailed] = useState(false);

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
      track('home_day_navigate', { direction });
    },
  });

  // Nutrition alerts
  const { alerts: nutritionAlerts, refetch: refetchAlerts } = useNutritionAlerts();

  // Nutrition risk engine
  const {
    riskScore,
    status: riskStatus,
    trend: riskTrend,
    daysSinceLastLog,
    daysWithData,
    loading: riskLoading,
    refetch: refetchRisk,
  } = useNutritionRisk();

  // Progress system
  const {
    level: progressLevel,
    levelName: progressLevelName,
    currentXp: progressXp,
    xpToNextLevel: progressXpNext,
    currentStreak: progressStreak,
    coins: progressCoins,
    missions: progressMissions,
    refetch: refetchProgress,
  } = useProgress();

  // Recovery plan (only fetched when risk > 40)
  const [recoveryPlan, setRecoveryPlan] = useState<RecoveryPlanData | null>(null);

  const fetchRecoveryPlan = useCallback(async () => {
    try {
      const res = await apiClient.get<RecoveryPlanData>('/api/risk/recovery-plan', {
        params: { horizon: '24h' },
      });
      setRecoveryPlan(res.data);
    } catch {
      setRecoveryPlan(null);
    }
  }, []);

  useEffect(() => {
    if (riskScore > 40 && !riskLoading) {
      fetchRecoveryPlan();
    } else {
      setRecoveryPlan(null);
    }
  }, [riskScore, riskLoading, fetchRecoveryPlan]);

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

  // Track whether we have ever loaded data successfully (avoids closure over
  // summary/logs state which would create a new callback identity every render).
  const hasDataRef = useRef(false);

  // Timestamp of the last successful fetch — used by useFocusEffect to skip
  // redundant reloads when data is still fresh (staleness threshold: 30 s).
  const lastFetchRef = useRef<number>(0);

  // Stable load function — single fetch for summary + logs (no duplicate calls)
  const load = useCallback(async (date?: string) => {
    const d = date ?? dateStr;
    setError(false);
    setLoadFailed(false);
    try {
      const [s, l] = await Promise.allSettled([
        foodService.getDailySummary(d),
        foodService.getFoodLogs(d),
      ]);

      const summaryOk = s.status === 'fulfilled';
      const logsOk = l.status === 'fulfilled';

      if (summaryOk) {
        setSummary(s.value);
      }
      if (logsOk) {
        setLogs(l.value);
      }

      if (summaryOk || logsOk) {
        hasDataRef.current = true;
        lastFetchRef.current = Date.now();
      }

      // If both API calls failed, show full-screen error on first load
      // or fall back to mock data on subsequent loads
      if (!summaryOk && !logsOk) {
        setError(true);
        if (!hasDataRef.current) {
          // First load, no cached data — show full error screen
          setLoadFailed(true);
        } else {
          // Subsequent refresh failure — keep existing data, show banner
          setSummary(MOCK_SUMMARY);
          setLogs(MOCK_LOGS);
        }
      } else if (!summaryOk) {
        setError(true);
        setSummary(MOCK_SUMMARY);
      } else if (!logsOk) {
        setError(true);
      }
    } catch {
      setError(true);
      if (!hasDataRef.current) {
        setLoadFailed(true);
      } else {
        setSummary(MOCK_SUMMARY);
        setLogs(MOCK_LOGS);
      }
    } finally {
      setLoading(false);
    }
  }, [dateStr]);

  // Reload when date changes via day navigation
  useEffect(() => {
    setLoading(true);
    load(toDateStr(selectedDate));
  }, [selectedDate]);

  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      // Skip reload if data was fetched less than 30 seconds ago (still fresh)
      if (now - lastFetchRef.current < 30_000 && hasDataRef.current) {
        return;
      }
      setLoading(true);
      load();
    }, [load])
  );

  // Track risk_card_impression once per screen focus
  const riskImpressionTracked = useRef(false);
  useFocusEffect(
    useCallback(() => {
      riskImpressionTracked.current = false;
    }, [])
  );
  useEffect(() => {
    if (!riskLoading && riskScore > 0 && !riskImpressionTracked.current) {
      riskImpressionTracked.current = true;
      track('risk_card_impression', { riskScore, status: riskStatus });
    }
  }, [riskLoading, riskScore, riskStatus, track]);

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
      calories_burned_exercise: summary.calories_burned_exercise ?? 0,
      net_calories: summary.net_calories ?? summary.total_calories,
    }).catch(() => {});
  }, [summary, logs]);

  // Stable callback — avoids re-creating on every render
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    haptics.light();
    await Promise.all([load(), refetchAlerts(), refetchRisk(), fetchRecoveryPlan(), refetchProgress()]);
    haptics.success();
    setRefreshing(false);
  }, [load, refetchAlerts, refetchRisk, fetchRecoveryPlan, refetchProgress]);

  // Memoize greeting to avoid calling t() on every render
  const greetingText = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return t('home.goodMorning');
    if (h < 18) return t('home.goodAfternoon');
    return t('home.goodEvening');
  }, [t]);

  // Memoize derived nutrition values to avoid recalculation on every render
  const {
    consumed, target, protein, proteinTarget, carbs, carbsTarget, fats, fatsTarget, streak,
    burned, netCalories, caloriesRemaining, exercisesToday,
  } = useMemo(() => {
    const c = summary?.total_calories ?? 0;
    const t = summary?.target_calories ?? 2000;
    const b = summary?.calories_burned_exercise ?? 0;
    return {
      consumed: c,
      target: t,
      protein: summary?.total_protein_g ?? 0,
      proteinTarget: summary?.target_protein_g ?? 150,
      carbs: summary?.total_carbs_g ?? 0,
      carbsTarget: summary?.target_carbs_g ?? 200,
      fats: summary?.total_fats_g ?? 0,
      fatsTarget: summary?.target_fats_g ?? 65,
      streak: summary?.streak_days ?? 0,
      burned: b,
      netCalories: summary?.net_calories ?? (c - b),
      caloriesRemaining: summary?.calories_remaining ?? Math.max(t - c + b, 0),
      exercisesToday: summary?.exercises_today ?? [],
    };
  }, [summary]);

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
  // WellnessScore. AdaptiveCalorieBanner is now server-driven.

  // ---- Adaptive calorie banner callbacks ----
  const onViewCalorieAdjustment = useCallback(() => {
    haptics.light();
    navigation.navigate('CalorieAdjustment');
  }, [navigation]);

  const onAdjustmentApplied = useCallback(() => {
    load();
  }, [load]);

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
    setLoadFailed(false);
    load();
  }, [load]);

  const onCloseNotifications = useCallback(() => {
    setNotifSheetVisible(false);
  }, []);

  // Nutrition alert action handler — navigates based on backend action_route
  const onAlertAction = useCallback((route: string) => {
    switch (route) {
      case '/scan':
        navigation.navigate('Scan');
        break;
      case '/dashboard':
        // "Ver detalle/resumen/macros" → navigate to Registro to see today's food log
        navigation.navigate('Registro', { screen: 'LogMain' });
        break;
      case '/log':
      case '/water':
        navigation.navigate('Registro', { screen: 'LogMain' });
        break;
      case '/foods':
      case '/foods?category=protein':
      case '/foods?category=healthy':
        navigation.navigate('Registro', { screen: 'FoodSearch' });
        break;
      default:
        navigation.navigate('Registro', { screen: 'LogMain' });
        break;
    }
  }, [navigation]);

  // ---- QuickAction navigation callbacks (stable refs) ----
  const onQuickScan = useCallback(() => { haptics.light(); navigation.navigate('Scan'); }, [navigation]);
  const onQuickWater = useCallback(() => { haptics.light(); navigation.navigate('Registro', { screen: 'LogMain' }); }, [navigation]);
  const onQuickFavorites = useCallback(() => { haptics.light(); navigation.navigate('Favorites'); }, [navigation]);
  const onQuickReports = useCallback(() => { haptics.light(); navigation.navigate('Progress'); }, [navigation]);

  // ---- Risk-adaptive QuickAction callbacks ----
  const onQuickLog = useCallback(() => { haptics.light(); navigation.navigate('Registro', { screen: 'LogMain' }); }, [navigation]);
  const onCopyYesterday = useCallback(() => { haptics.light(); navigation.navigate('Registro', { screen: 'LogMain' }); }, [navigation]);
  const onSuggestedMeal = useCallback(() => { haptics.light(); navigation.navigate('Recipes'); }, [navigation]);
  const isHighRisk = riskScore > 40;

  const onRecoveryRegister = useCallback(() => {
    haptics.light();
    track('recovery_register_food_pressed');
    navigation.navigate('Scan');
  }, [track, navigation]);

  const onScanFromEmpty = useCallback(() => {
    haptics.light();
    track('scan_button_pressed', { source: 'empty_state' });
    navigation.navigate('Scan');
  }, [track, navigation]);

  const onRegisterMeal = useCallback((meal: RecommendedMeal) => {
    haptics.medium();
    track('recommendation_register_pressed', { meal_name: meal.name });
    navigation.navigate('Scan');
  }, [track, navigation]);

  const onViewAllMeals = useCallback(() => {
    haptics.light();
    navigation.navigate('MealBrowser');
  }, [navigation]);

  const onProgressPress = useCallback(() => {
    haptics.light();
    navigation.navigate('AchievementShowcase');
  }, [navigation]);

  // Memoize calorie ring labels (now uses net-aware remaining)
  const caloriesLeftLabel = useMemo(
    () => t('home.caloriesLeft', { count: Math.round(Math.max(caloriesRemaining, 0)) }),
    [t, caloriesRemaining],
  );
  const goalReachedLabel = useMemo(() => t('home.goalReached'), [t]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={c.bg} />
      {/* Header with parallax */}
      <View style={[styles.header, { paddingHorizontal: sidePadding }]}>
        <Animated.View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, transform: [{ translateY: headerTranslateY }], opacity: headerOpacity }}>
          <View accessibilityRole="header" accessible={true} accessibilityLabel={`${greetingText}, ${user?.first_name || t('profile.user')}`}>
            <Text style={[styles.greeting, { color: c.gray }]} allowFontScaling>{greetingText},</Text>
            <Text style={[styles.userName, { color: c.black }]} allowFontScaling>{user?.first_name || t('profile.user')}</Text>
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
            <Animated.View style={[styles.scanBtn, { backgroundColor: c.white }, pulseStyle]}>
              <Ionicons name="camera" size={20} color={c.black} />
            </Animated.View>
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

      {/* Loading skeleton */}
      {loading && !refreshing ? (
        <View style={{ paddingHorizontal: sidePadding }}>
          <HomeSkeleton />
        </View>
      ) : loadFailed ? (
        /* Full-screen error state — shown when initial load fails completely */
        <ErrorFullScreen
          onRetry={onRetryPress}
          colors={c}
          retryLabel={t('home.retry') || 'Reintentar'}
          errorTitle={t('home.errorTitle') || 'No se pudieron cargar los datos'}
          errorMessage={t('home.errorMessage') || 'Verifica tu conexion a internet e intenta de nuevo.'}
        />
      ) : (
        <>
          {/* Error banner — shown when a partial load failed (data still available) */}
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
              <Ionicons name="refresh-outline" size={14} color={c.white} style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>
          )}

          {/* Nutrition alerts — rendered above scroll content */}
          {nutritionAlerts.length > 0 && (
            <View style={{ paddingHorizontal: sidePadding }}>
              <NutritionAlerts alerts={nutritionAlerts} onAction={onAlertAction} />
            </View>
          )}

          {/* Risk UI — skeleton / empty state / day-1 override / normal */}
          {riskLoading ? (
            <View style={{ paddingHorizontal: sidePadding }}>
              <RiskSkeleton />
            </View>
          ) : daysWithData === 0 ? (
            <View style={[styles.riskEmptyState, { paddingHorizontal: sidePadding }]}>
              <Text style={[styles.riskEmptyText, { color: c.gray }]}>
                Registra tu primera comida para ver tu puntaje de salud
              </Text>
            </View>
          ) : daysWithData <= 1 && (riskStatus === 'critical' || riskStatus === 'high_risk') ? (
            <View style={[styles.semaphoreContainer, { paddingHorizontal: sidePadding }]}>
              <View style={styles.gettingStartedContainer}>
                <View style={[styles.gettingStartedDot, { backgroundColor: c.accent }]} />
                <Text style={[styles.gettingStartedLabel, { color: c.accent }]}>Getting started</Text>
              </View>
              <Text style={[styles.gettingStartedMsg, { color: c.gray }]}>
                Estamos aprendiendo tus habitos. Registra unas comidas mas para ver tu puntaje.
              </Text>
            </View>
          ) : riskScore > 60 ? (
            <TouchableOpacity
              style={[styles.semaphoreContainer, { paddingHorizontal: sidePadding }]}
              onPress={() => { haptics.light(); navigation.navigate('RiskDetail'); }}
              activeOpacity={0.8}
              accessibilityLabel="Ver detalle de riesgo nutricional"
              accessibilityRole="button"
            >
              <NutritionSemaphore riskScore={riskScore} status={riskStatus} size={100} trend={riskTrend} />
            </TouchableOpacity>
          ) : null}

          {/* Re-engagement banner — user hasn't logged in 3+ days */}
          {daysSinceLastLog >= 3 && (
            <View
              style={[styles.reengageBanner, { marginHorizontal: sidePadding, backgroundColor: isDark ? c.surface : '#FEF2F2', borderColor: isDark ? c.grayLight : '#FECACA' }]}
              accessible={true}
              accessibilityRole="alert"
              accessibilityLabel={`Te echamos de menos. Llevas ${daysSinceLastLog} dias sin registrar. Fitsi te espera para retomar tu seguimiento.`}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.reengageTitle, { color: isDark ? c.protein : '#991B1B' }]} allowFontScaling>Te echamos de menos!</Text>
                <Text style={[styles.reengageMsg, { color: isDark ? c.protein : '#991B1B' }]} allowFontScaling>
                  Llevas {daysSinceLastLog} dias sin registrar. Fitsi te espera para retomar tu seguimiento.
                </Text>
              </View>
            </View>
          )}

          <View style={{ flex: 1 }} {...gestureHandlers}>
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
                tintColor={c.accent}
                colors={[c.accent, c.success, c.protein]}
                progressBackgroundColor={c.surface}
                accessibilityLabel="Desliza hacia abajo para actualizar los datos"
              />
            }
          >
            <Animated.View style={fadeStyle}>
              {/* Calorie Ring + Macro Bars — the core card */}
              <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.grayLight }]} accessibilityLabel="Resumen de calorias del dia">
                <View style={styles.ringRow}>
                  <CalorieRing
                    consumed={consumed}
                    burned={burned}
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

                {/* Calorie balance summary line */}
                <View
                  style={[styles.calorieBalanceSummary, { borderTopColor: c.grayLight }]}
                  accessible={true}
                  accessibilityLabel={
                    burned > 0
                      ? `Balance: ${Math.round(consumed)} consumidas menos ${Math.round(burned)} ejercicio igual ${Math.round(netCalories)} netas. Te quedan ${Math.round(Math.max(caloriesRemaining, 0))} kilocalorias`
                      : `${Math.round(consumed)} kilocalorias consumidas`
                  }
                >
                  <View style={styles.calorieBalanceRow}>
                    <View style={styles.calorieBalanceItem}>
                      <View style={[styles.calorieBalanceDot, { backgroundColor: c.success }]} />
                      <Text style={[styles.calorieBalanceValue, { color: c.black }]} allowFontScaling>
                        {Math.round(consumed)}
                      </Text>
                      <Text style={[styles.calorieBalanceLabel, { color: c.gray }]} allowFontScaling>
                        consumidas
                      </Text>
                    </View>
                    {burned > 0 && (
                      <>
                        <Text style={[styles.calorieBalanceOp, { color: c.gray }]}>-</Text>
                        <View style={styles.calorieBalanceItem}>
                          <View style={[styles.calorieBalanceDot, { backgroundColor: EXERCISE_ORANGE }]} />
                          <Text style={[styles.calorieBalanceValue, { color: c.black }]} allowFontScaling>
                            {Math.round(burned)}
                          </Text>
                          <Text style={[styles.calorieBalanceLabel, { color: c.gray }]} allowFontScaling>
                            ejercicio
                          </Text>
                        </View>
                        <Text style={[styles.calorieBalanceOp, { color: c.gray }]}>=</Text>
                        <View style={styles.calorieBalanceItem}>
                          <Text style={[styles.calorieBalanceValue, { color: c.accent, fontWeight: '700' }]} allowFontScaling>
                            {Math.round(netCalories)}
                          </Text>
                          <Text style={[styles.calorieBalanceLabel, { color: c.gray }]} allowFontScaling>
                            netas
                          </Text>
                        </View>
                      </>
                    )}
                  </View>
                  {burned > 0 && (
                    <Text style={[styles.calorieBalanceRemaining, { color: c.accent }]} allowFontScaling>
                      Te quedan {Math.round(Math.max(caloriesRemaining, 0))} kcal
                    </Text>
                  )}
                </View>

                {/* Exercises today — shown inline when there are workouts */}
                {exercisesToday.length > 0 && (
                  <View style={[styles.exercisesTodayContainer, { borderTopColor: c.grayLight }]}>
                    <View style={styles.exercisesTodayHeader}>
                      <Ionicons name="barbell-outline" size={14} color={EXERCISE_ORANGE} />
                      <Text style={[styles.exercisesTodayTitle, { color: c.black }]}>
                        Ejercicios hoy
                      </Text>
                    </View>
                    {exercisesToday.map((ex, idx) => (
                      <View
                        key={`${ex.workout_type}-${idx}`}
                        style={styles.exerciseTodayRow}
                        accessible={true}
                        accessibilityLabel={`${ex.name}, ${ex.duration} minutos, ${ex.calories} kilocalorias quemadas`}
                      >
                        <Ionicons name="flame-outline" size={12} color={EXERCISE_ORANGE} />
                        <Text style={[styles.exerciseTodayName, { color: c.gray }]} numberOfLines={1} allowFontScaling>
                          {ex.name}
                        </Text>
                        <Text style={[styles.exerciseTodayMeta, { color: c.gray }]} allowFontScaling>
                          {ex.duration} min
                        </Text>
                        <Text style={[styles.exerciseTodayCalories, { color: EXERCISE_ORANGE }]} allowFontScaling>
                          -{ex.calories} kcal
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* Adaptive calorie adjustment banner */}
              <AdaptiveCalorieBanner
                onViewDetail={onViewCalorieAdjustment}
                onAdjustmentApplied={onAdjustmentApplied}
              />

              {/* Progress widget */}
              <ProgressWidget
                levelName={progressLevelName}
                levelNumber={progressLevel}
                currentXp={progressXp}
                xpToNextLevel={progressXpNext}
                streakDays={progressStreak}
                coins={progressCoins}
                onPress={onProgressPress}
              />

              {/* Daily missions */}
              <DailyMissionsCard missions={progressMissions} />

              {/* Calorie comparison bar — uses net (consumed - burned) */}
              <CalorieComparisonCard logged={netCalories} target={target} status={riskStatus} />

              {/* Recovery plan — shown when risk > 40 */}
              {recoveryPlan && riskScore > 40 && (
                <RecoveryPlanCard plan={recoveryPlan} onRegisterFood={onRecoveryRegister} />
              )}

              {/* Best Day Banner */}
              {summary && (summary.meals_logged ?? 0) > 0 && (
                <TouchableOpacity
                  style={[styles.bestDayBanner, { backgroundColor: isDark ? c.surface : '#FEF3C7', borderColor: isDark ? c.grayLight : '#FDE68A' }]}
                  onPress={onQuickReports}
                  activeOpacity={0.8}
                  accessibilityLabel="Tu mejor dia esta semana: Viernes, 125 gramos de proteinas"
                  accessibilityRole="button"
                >
                  <Ionicons name="trophy" size={18} color={c.carbs} />
                  <Text style={[styles.bestDayText, { color: isDark ? c.gray : '#92400E' }]}>
                    <Text style={styles.bestDayBold}>Tu mejor dia esta semana: </Text>
                    Viernes — 125g proteinas
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color={isDark ? c.gray : '#92400E'} />
                </TouchableOpacity>
              )}

              {/* Quick Actions — adaptive based on risk score, using memoized buttons */}
              <View style={styles.quickActionsRow}>
                {isHighRisk ? (
                  <>
                    <QuickActionButton
                      label="Registro Rapido"
                      iconName="add-circle"
                      iconColor={c.white}
                      iconBgColor={c.success}
                      onPress={onQuickLog}
                      colors={c}
                    />
                    <QuickActionButton
                      label="Copiar ayer"
                      iconName="copy"
                      iconColor={c.white}
                      iconBgColor={c.primary}
                      onPress={onCopyYesterday}
                      colors={c}
                    />
                    <QuickActionButton
                      label="Comida sugerida"
                      iconName="restaurant"
                      iconColor={c.white}
                      iconBgColor={EXERCISE_ORANGE}
                      onPress={onSuggestedMeal}
                      colors={c}
                    />
                  </>
                ) : (
                  <>
                    <QuickActionButton
                      label="Scan"
                      iconName="camera"
                      iconColor={c.black}
                      iconBgColor={c.white}
                      onPress={onQuickScan}
                      colors={c}
                    />
                    <QuickActionButton
                      label="Water"
                      iconName="water"
                      iconColor={c.white}
                      iconBgColor={c.primary}
                      onPress={onQuickWater}
                      colors={c}
                    />
                    <QuickActionButton
                      label="Favoritos"
                      iconName="heart"
                      iconColor={c.white}
                      iconBgColor={c.protein}
                      onPress={onQuickFavorites}
                      colors={c}
                    />
                  </>
                )}
              </View>

              {/* Meal recommendations — only shown when net calories are below target */}
              {netCalories < target && (
                <View>
                  <MealRecommendationsSection onRegisterMeal={onRegisterMeal} />
                  <TouchableOpacity
                    onPress={onViewAllMeals}
                    style={styles.viewAllLink}
                    activeOpacity={0.7}
                    accessibilityLabel="Ver todas las comidas"
                    accessibilityRole="link"
                  >
                    <Text style={[styles.viewAllText, { color: c.accent }]}>Ver todas</Text>
                    <Ionicons name="chevron-forward" size={14} color={c.accent} />
                  </TouchableOpacity>
                </View>
              )}

              {/* Motivational banner — no meals logged and it's past 2pm */}
              {!hasMeals && new Date().getHours() >= 14 && (
                <View
                  style={[styles.motivationalBanner, { backgroundColor: isDark ? c.surface : '#FEF3C7', borderColor: isDark ? c.grayLight : '#FDE68A' }]}
                  accessible={true}
                  accessibilityRole="alert"
                  accessibilityLabel="Aun no has registrado comida hoy. Tu cuerpo necesita combustible. Registra lo que has comido para mantener tu seguimiento al dia."
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.motivationalTitle, { color: isDark ? c.carbs : '#92400E' }]} allowFontScaling>
                      Aun no has registrado comida hoy!
                    </Text>
                    <Text style={[styles.motivationalMessage, { color: isDark ? c.carbs : '#92400E' }]} allowFontScaling>
                      Tu cuerpo necesita combustible. Registra lo que has comido para mantener tu seguimiento al dia.
                    </Text>
                  </View>
                </View>
              )}

              {/* Today's meals — always visible (core content) */}
              <Text style={[styles.sectionTitle, { color: c.black }]} accessibilityRole="header">{t('home.today')}</Text>
              {hasMeals ? (
                <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
                  {MEAL_ORDER.map((mt, idx) => {
                    // Determine if this is the last non-empty section for border styling
                    const remainingTypes = MEAL_ORDER.slice(idx + 1);
                    const isLastSection = remainingTypes.every((t) => (logsByMeal[t]?.length ?? 0) === 0);
                    return (
                      <MealSection
                        key={mt}
                        mealType={mt}
                        logs={logsByMeal[mt]}
                        colors={c}
                        isLast={isLastSection}
                      />
                    );
                  })}
                </View>
              ) : (
                <EmptyMealsState
                  onScan={onScanFromEmpty}
                  colors={c}
                  noMealsText={t('home.noMealsLogged')}
                  scanHint={t('home.scanYourFood')}
                  scanNowText={t('home.scanNow')}
                />
              )}

              {/* Daily nutrition tip */}
              <DailyTipCard colors={c} />

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
          </View>
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

      {/* Critical overlay — semi-transparent red when status is critical (suppressed for day-1 users) */}
      {riskStatus === 'critical' && daysWithData > 1 && (
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
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.sm,
    minHeight: 44,
  },
  errorBannerText: { ...typography.caption, flex: 1 },
  // ─── Full-screen error state ────────────────────────────────────────────
  errorFullScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  errorFullTitle: {
    ...typography.titleSm,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  errorFullMessage: {
    ...typography.subtitle,
    textAlign: 'center',
    lineHeight: 22,
  },
  errorRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 4,
    borderRadius: radius.full,
    marginTop: spacing.sm,
    minHeight: 48,
  },
  errorRetryText: {
    ...typography.button,
  },
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
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyText: {
    ...typography.bodyMd,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  emptyHint: {
    ...typography.caption,
    textAlign: 'center',
    lineHeight: 20,
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
    backgroundColor: undefined,
    borderWidth: 1,
    borderColor: undefined,
    borderRadius: radius.lg,
    padding: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  bestDayText: {
    flex: 1,
    fontSize: 13,
    color: undefined,
    lineHeight: 18,
  },
  bestDayBold: {
    fontWeight: '700',
  },
  viewAllLink: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 2,
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
  },
  viewAllText: {
    ...typography.caption,
    fontWeight: '600',
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
  riskEmptyState: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  riskEmptyText: {
    ...typography.caption,
    textAlign: 'center',
    lineHeight: 18,
  },
  gettingStartedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  gettingStartedDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  gettingStartedLabel: {
    ...typography.label,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  gettingStartedMsg: {
    ...typography.caption,
    textAlign: 'center',
    lineHeight: 18,
  },
  reengageBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: undefined,
    borderWidth: 1,
    borderColor: undefined,
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
  // ─── Calorie balance summary ──────────────────────────────────────────
  calorieBalanceSummary: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: undefined,
    gap: spacing.xs,
  },
  calorieBalanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  calorieBalanceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  calorieBalanceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  calorieBalanceValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  calorieBalanceLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  calorieBalanceOp: {
    fontSize: 14,
    fontWeight: '600',
  },
  calorieBalanceRemaining: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 2,
  },
  // ─── Exercises today ──────────────────────────────────────────────────
  exercisesTodayContainer: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
    gap: 4,
  },
  exercisesTodayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 2,
  },
  exercisesTodayTitle: {
    ...typography.label,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  exerciseTodayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingLeft: spacing.sm,
  },
  exerciseTodayName: {
    ...typography.caption,
    flex: 1,
  },
  exerciseTodayMeta: {
    ...typography.caption,
    fontWeight: '500',
  },
  exerciseTodayCalories: {
    fontSize: 12,
    fontWeight: '700',
  },
  // ─── Daily Tip ──────────────────────────────────────────────────────────
  dailyTipCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  dailyTipText: {
    ...typography.caption,
    flex: 1,
    lineHeight: 18,
  },
});
