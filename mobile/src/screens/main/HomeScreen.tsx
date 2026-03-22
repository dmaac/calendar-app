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
  Platform,
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
import OnboardingProgress from '../../components/OnboardingProgress';
import useFadeIn from '../../hooks/useFadeIn';
import usePulse from '../../hooks/usePulse';
import { haptics } from '../../hooks/useHaptics';
import { useAnalytics } from '../../hooks/useAnalytics';

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
};

const MOCK_LOGS: AIFoodLog[] = [
  {
    id: -1, logged_at: new Date().toISOString(), meal_type: 'breakfast',
    food_name: 'Avena con frutas', calories: 320, carbs_g: 52, protein_g: 12, fats_g: 8,
    fiber_g: 5, image_url: null, ai_confidence: 0.95, was_edited: false,
  },
  {
    id: -2, logged_at: new Date().toISOString(), meal_type: 'lunch',
    food_name: 'Pollo a la plancha con arroz', calories: 520, carbs_g: 48, protein_g: 42, fats_g: 14,
    fiber_g: 3, image_url: null, ai_confidence: 0.92, was_edited: false,
  },
  {
    id: -3, logged_at: new Date().toISOString(), meal_type: 'snack',
    food_name: 'Yogurt griego con miel', calories: 180, carbs_g: 18, protein_g: 16, fats_g: 6,
    fiber_g: 0, image_url: null, ai_confidence: 0.88, was_edited: false,
  },
  {
    id: -4, logged_at: new Date().toISOString(), meal_type: 'lunch',
    food_name: 'Ensalada cesar', calories: 220, carbs_g: 12, protein_g: 12, fats_g: 10,
    fiber_g: 4, image_url: null, ai_confidence: 0.90, was_edited: false,
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
  const progress = target > 0 ? Math.min(consumed / target, 1) : 0;
  const remaining = Math.max(target - consumed, 0);

  // Animated ring fill — grows from 0 to target on load
  const fillAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    fillAnim.setValue(0);
    Animated.timing(fillAnim, {
      toValue: progress,
      duration: 900,
      delay: 200,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  // Listen to animated value for SVG strokeDasharray (can't use native driver for SVG)
  const [animDash, setAnimDash] = useState(0);
  useEffect(() => {
    const id = fillAnim.addListener(({ value }) => {
      setAnimDash(value * circ);
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
      accessibilityValue={{ min: 0, max: target, now: consumed }}
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
      <AnimatedNumber value={consumed} style={[styles.ringCalories, { color: c.black }]} />
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
  const progress = target > 0 ? Math.min(value / target, 1) : 0;

  // Animated fill width — grows from left with staggered delay
  const fillAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    fillAnim.setValue(0);
    Animated.timing(fillAnim, {
      toValue: progress,
      duration: 700,
      delay: 300 + delay,
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
      accessibilityValue={{ min: 0, max: target, now: value }}
    >
      <View style={styles.macroHeader}>
        <Text style={[styles.macroLabel, { color: c.gray }]}>{label}</Text>
        <Text style={[styles.macroValue, { color: c.black }]}>
          <AnimatedNumber value={value} style={[styles.macroValue, { color: c.black }]} />
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

  const load = async () => {
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
        // Summary failed but logs worked — show mock summary with realistic targets
        setError(true);
        setSummary(MOCK_SUMMARY);
      } else if (!logsOk) {
        // Logs failed but summary worked — show empty logs, user still sees calorie ring
        setError(true);
      }
    } catch {
      // Total network failure — use mock data so the app doesn't look broken
      setError(true);
      setSummary(MOCK_SUMMARY);
      setLogs(MOCK_LOGS);
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

  // Stable callback ref to avoid re-creating on every render
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    haptics.light();
    await load();
    haptics.success();
    setRefreshing(false);
  }, []);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return t('home.goodMorning');
    if (h < 18) return t('home.goodAfternoon');
    return t('home.goodEvening');
  };

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

  const mealOrder = ['breakfast', 'lunch', 'dinner', 'snack'];

  // Memoize meal grouping to avoid re-filtering on unrelated state changes
  const logsByMeal = useMemo(() => {
    const grouped: Record<string, AIFoodLog[]> = {};
    for (const mt of mealOrder) {
      grouped[mt] = logs.filter((l) => l.meal_type === mt);
    }
    return grouped;
  }, [logs]);

  const hasMeals = logs.length > 0;

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
            <Text style={[styles.greeting, { color: c.gray }]}>{greeting()},</Text>
            <Text style={[styles.userName, { color: c.black }]}>{user?.first_name || t('profile.user')}</Text>
          </View>
        </Animated.View>
        <View style={styles.headerRight}>
          <StreakBadge
            days={streak}
            onPress={() => {
              haptics.light();
              navigation.navigate('Achievements');
            }}
          />
          <TouchableOpacity
            onPress={() => {
              haptics.light();
              track('scan_button_pressed', { source: 'header' });
              navigation.navigate('Escanear');
            }}
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
              onPress={() => {
                haptics.light();
                setLoading(true);
                load();
              }}
              activeOpacity={0.8}
              accessibilityLabel="Error al cargar datos. Toca para reintentar"
              accessibilityRole="button"
            >
              <Ionicons name="wifi-outline" size={16} color={c.white} />
              <Text style={[styles.errorBannerText, { color: c.white }]}>{t('home.offlineBanner')}</Text>
            </TouchableOpacity>
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
              {/* Calorie card */}
              <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.grayLight }]} accessibilityLabel="Resumen de calorias del dia">
                <View style={styles.ringRow}>
                  <CalorieRing
                    consumed={consumed}
                    target={target}
                    colors={c}
                    remainingLabel={t('home.caloriesLeft', { count: Math.round(Math.max(target - consumed, 0)) })}
                    goalReachedLabel={t('home.goalReached')}
                  />
                  <View style={styles.macros}>
                    <MacroBar label={t('home.protein')} value={protein} target={proteinTarget} color={c.protein} delay={0} colors={c} />
                    <MacroBar label={t('home.carbs')} value={carbs} target={carbsTarget} color={c.carbs} delay={100} colors={c} />
                    <MacroBar label={t('home.fats')} value={fats} target={fatsTarget} color={c.fats} delay={200} colors={c} />
                  </View>
                </View>
              </View>

              {/* Today's Tip */}
              <View style={[styles.tipCard, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
                <View style={styles.tipHeader}>
                  <FitsiMascot expression="cool" size="small" animation="idle" />
                  <Text style={[styles.tipTitle, { color: c.black }]}>{t('home.today')} Tip</Text>
                </View>
                <Text style={[styles.tipText, { color: c.gray }]}>
                  {DAILY_TIPS[new Date().getDate() - 1] ?? DAILY_TIPS[0]}
                </Text>
              </View>

              {/* Quick Actions */}
              <View style={styles.quickActionsRow}>
                <TouchableOpacity
                  style={[styles.quickAction, { backgroundColor: c.surface, borderColor: c.grayLight }]}
                  onPress={() => { haptics.light(); navigation.navigate('Escanear'); }}
                  activeOpacity={0.8}
                >
                  <View style={[styles.quickActionIcon, { backgroundColor: c.black }]}>
                    <Ionicons name="camera" size={18} color={c.white} />
                  </View>
                  <Text style={[styles.quickActionLabel, { color: c.black }]}>Scan Food</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.quickAction, { backgroundColor: c.surface, borderColor: c.grayLight }]}
                  onPress={() => { haptics.light(); navigation.navigate('Registro'); }}
                  activeOpacity={0.8}
                >
                  <View style={[styles.quickActionIcon, { backgroundColor: '#4285F4' }]}>
                    <Ionicons name="water" size={18} color={c.white} />
                  </View>
                  <Text style={[styles.quickActionLabel, { color: c.black }]}>Add Water</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.quickAction, { backgroundColor: c.surface, borderColor: c.grayLight }]}
                  onPress={() => { haptics.light(); navigation.navigate('Recetas'); }}
                  activeOpacity={0.8}
                >
                  <View style={[styles.quickActionIcon, { backgroundColor: '#34A853' }]}>
                    <Ionicons name="book" size={18} color={c.white} />
                  </View>
                  <Text style={[styles.quickActionLabel, { color: c.black }]}>Recipes</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.quickAction, { backgroundColor: c.surface, borderColor: c.grayLight }]}
                  onPress={() => { haptics.light(); navigation.navigate('Coach'); }}
                  activeOpacity={0.8}
                >
                  <View style={[styles.quickActionIcon, { backgroundColor: '#EC4899' }]}>
                    <Ionicons name="sparkles" size={18} color={c.white} />
                  </View>
                  <Text style={[styles.quickActionLabel, { color: c.black }]}>AI Coach</Text>
                </TouchableOpacity>
              </View>

              {/* Profile completion progress */}
              <OnboardingProgress
                data={{
                  hasProfilePhoto: false,
                  mealsLogged: logs.length,
                  hasLoggedWeight: (summary?.streak_days ?? 0) > 0,
                  hasConfiguredGoals: (summary?.target_calories ?? 0) > 0,
                  notificationsEnabled: true,
                }}
                navigation={navigation}
              />

              {/* Today's meals */}
              <Text style={[styles.sectionTitle, { color: c.black }]} accessibilityRole="header">{t('home.today')}</Text>
              {hasMeals ? (
                <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
                  {mealOrder.map((mt) => (
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
                    onPress={() => {
                      haptics.light();
                      track('scan_button_pressed', { source: 'empty_state' });
                      navigation.navigate('Escanear');
                    }}
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
                onPress={() => {
                  haptics.light();
                  navigation.navigate('Reports');
                }}
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

      {/* Floating AI Coach button */}
      <TouchableOpacity
        style={[styles.coachFab, { backgroundColor: c.accent }]}
        onPress={() => {
          haptics.light();
          navigation.navigate('Coach');
        }}
        activeOpacity={0.85}
        accessibilityLabel="Abrir AI Coach"
        accessibilityRole="button"
        accessibilityHint="Abre el chat con tu coach de nutricion con IA"
      >
        <Ionicons name="sparkles" size={20} color={c.white} />
        <Text style={[styles.coachFabText, { color: c.white }]}>{t('home.aiCoach')}</Text>
      </TouchableOpacity>
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
  tipCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  tipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  tipTitle: {
    ...typography.label,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tipText: {
    ...typography.subtitle,
    lineHeight: 20,
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
  coachFab: {
    position: 'absolute',
    bottom: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
    minHeight: 44,
    ...shadows.md,
  },
  coachFabText: {
    ...typography.label,
  },
});
