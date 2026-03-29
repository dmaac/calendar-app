/**
 * HistoryScreen -- Historial de dias anteriores
 * Navega dia a dia . Muestra totales + comidas agrupadas por tipo
 *
 * v2 Improvements:
 * - Inline calendar view with colored dots on days that have logged meals
 * - Tap any day to load that day's log
 * - Weekly summary view with macro averages and trends
 * - Smooth animated transitions between day/week views
 * - FlatList performance with keyExtractor and proper memoization
 * - Pull-to-refresh support
 */
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  RefreshControl,
  Platform,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useThemeColors, typography, spacing, radius, shadows, useLayout, mealColors,
} from '../../theme';
import * as foodService from '../../services/food.service';
import { AIFoodLog, DailySummary } from '../../types';
import { haptics } from '../../hooks/useHaptics';
import { useAppTheme } from '../../context/ThemeContext';

const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
const WEEKDAYS = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];
const ITEM_HEIGHT = 56;

type ViewMode = 'day' | 'week';

// ─── Mock data for offline / backend unavailable ─────────────────────────────
const MOCK_HISTORY_SUMMARY: DailySummary = {
  date: '', total_calories: 1850, total_protein_g: 110, total_carbs_g: 185, total_fats_g: 55,
  target_calories: 2100, target_protein_g: 150, target_carbs_g: 210, target_fats_g: 70,
  water_ml: 2000, meals_logged: 4, streak_days: 3,
  calories_burned_exercise: 0, calories_remaining: 250, net_calories: 1850, exercises_today: [],
};

const MOCK_HISTORY_LOGS: AIFoodLog[] = [
  { id: -10, logged_at: '', meal_type: 'breakfast', food_name: 'Tostadas con palta', calories: 350, carbs_g: 38, protein_g: 10, fats_g: 18, fiber_g: 7, sugar_g: null, sodium_mg: null, serving_size: null, image_url: null, ai_confidence: 0.93, was_edited: false },
  { id: -11, logged_at: '', meal_type: 'lunch', food_name: 'Pasta con bolognesa', calories: 620, carbs_g: 72, protein_g: 32, fats_g: 18, fiber_g: 4, sugar_g: null, sodium_mg: null, serving_size: null, image_url: null, ai_confidence: 0.90, was_edited: false },
  { id: -12, logged_at: '', meal_type: 'dinner', food_name: 'Sopa de lentejas', calories: 380, carbs_g: 45, protein_g: 22, fats_g: 8, fiber_g: 12, sugar_g: null, sodium_mg: null, serving_size: null, image_url: null, ai_confidence: 0.87, was_edited: false },
  { id: -13, logged_at: '', meal_type: 'snack', food_name: 'Manzana con mantequilla de mani', calories: 250, carbs_g: 30, protein_g: 6, fats_g: 14, fiber_g: 5, sugar_g: null, sodium_mg: null, serving_size: null, image_url: null, ai_confidence: 0.94, was_edited: false },
];

// ─── Date helpers ────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstWeekday(year: number, month: number): number {
  const d = new Date(year, month, 1).getDay();
  return d === 0 ? 6 : d - 1; // Monday=0
}

function getWeekRange(d: Date): { start: Date; end: Date } {
  const day = d.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = addDays(d, mondayOffset);
  const sunday = addDays(monday, 6);
  return { start: monday, end: sunday };
}

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// ─── Mock log days (deterministic seed for offline) ──────────────────────────
function getMockLogDays(year: number, month: number): Set<number> {
  const days = new Set<number>();
  const total = getDaysInMonth(year, month);
  for (let d = 1; d <= total; d++) {
    if (Math.sin(d * 3.14 + month * 7 + year) > -0.2) {
      days.add(d);
    }
  }
  return days;
}

// ─── Inline Mini Calendar ────────────────────────────────────────────────────

interface MiniCalendarProps {
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  logDays: Set<number>;
  calYear: number;
  calMonth: number;
  onChangeMonth: (delta: number) => void;
}

const MiniCalendar = React.memo(function MiniCalendar({
  selectedDate,
  onSelectDate,
  logDays,
  calYear,
  calMonth,
  onChangeMonth,
}: MiniCalendarProps) {
  const c = useThemeColors();
  const todayStr = formatDate(new Date());
  const selectedStr = formatDate(selectedDate);

  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstWeekday = getFirstWeekday(calYear, calMonth);

  // Build the calendar grid (6 weeks max)
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }

  return (
    <View style={[calStyles.container, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
      {/* Month header */}
      <View style={calStyles.monthHeader}>
        <TouchableOpacity
          onPress={() => { haptics.light(); onChangeMonth(-1); }}
          style={calStyles.monthArrow}
          accessibilityLabel="Mes anterior"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={18} color={c.black} />
        </TouchableOpacity>
        <Text style={[calStyles.monthLabel, { color: c.black }]}>
          {MONTHS_ES[calMonth]} {calYear}
        </Text>
        <TouchableOpacity
          onPress={() => { haptics.light(); onChangeMonth(1); }}
          style={calStyles.monthArrow}
          accessibilityLabel="Mes siguiente"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-forward" size={18} color={c.black} />
        </TouchableOpacity>
      </View>

      {/* Weekday labels */}
      <View style={calStyles.weekdayRow}>
        {WEEKDAYS.map((wd) => (
          <Text key={wd} style={[calStyles.weekdayLabel, { color: c.gray }]}>{wd}</Text>
        ))}
      </View>

      {/* Day grid */}
      {rows.map((row, ri) => (
        <View key={ri} style={calStyles.weekRow}>
          {row.map((day, ci) => {
            if (day === null) {
              return <View key={`e-${ci}`} style={calStyles.dayCell} />;
            }

            const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isSelected = dateStr === selectedStr;
            const isToday = dateStr === todayStr;
            const hasLog = logDays.has(day);
            const isFuture = new Date(calYear, calMonth, day) > new Date();

            return (
              <TouchableOpacity
                key={day}
                style={[
                  calStyles.dayCell,
                  isSelected && [calStyles.dayCellSelected, { backgroundColor: c.accent }],
                  isToday && !isSelected && [calStyles.dayCellToday, { borderColor: c.accent }],
                ]}
                onPress={() => {
                  if (isFuture) return;
                  haptics.light();
                  onSelectDate(new Date(calYear, calMonth, day));
                }}
                disabled={isFuture}
                activeOpacity={0.6}
                accessibilityLabel={`${day} de ${MONTHS_ES[calMonth]}${hasLog ? ', tiene registros' : ''}${isToday ? ', hoy' : ''}`}
              >
                <Text
                  style={[
                    calStyles.dayText,
                    { color: isFuture ? c.disabled : isSelected ? c.white : c.black },
                  ]}
                >
                  {day}
                </Text>
                {hasLog && !isSelected && (
                  <View style={[calStyles.logDot, { backgroundColor: c.accent }]} />
                )}
                {hasLog && isSelected && (
                  <View style={[calStyles.logDot, { backgroundColor: c.white }]} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
});

const calStyles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.sm,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.sm,
  },
  monthArrow: {
    padding: spacing.xs,
  },
  monthLabel: {
    ...typography.label,
    fontSize: 15,
    textTransform: 'capitalize',
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    ...typography.caption,
    fontWeight: '600',
    fontSize: 11,
  },
  weekRow: {
    flexDirection: 'row',
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.sm,
    minHeight: 36,
  },
  dayCellSelected: {
    borderRadius: radius.sm,
  },
  dayCellToday: {
    borderWidth: 1.5,
    borderRadius: radius.sm,
  },
  dayText: {
    ...typography.caption,
    fontSize: 13,
    fontWeight: '500',
  },
  logDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 2,
  },
});

// ─── Weekly Summary Card ─────────────────────────────────────────────────────

interface WeeklySummaryProps {
  weekData: {
    day: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fats_g: number;
    logged: boolean;
  }[];
  targetCalories: number;
}

const WeeklySummary = React.memo(function WeeklySummary({
  weekData,
  targetCalories,
}: WeeklySummaryProps) {
  const c = useThemeColors();

  const loggedDays = weekData.filter((d) => d.logged);
  const avgCalories = loggedDays.length > 0
    ? Math.round(loggedDays.reduce((s, d) => s + d.calories, 0) / loggedDays.length)
    : 0;
  const avgProtein = loggedDays.length > 0
    ? Math.round(loggedDays.reduce((s, d) => s + d.protein_g, 0) / loggedDays.length)
    : 0;
  const avgCarbs = loggedDays.length > 0
    ? Math.round(loggedDays.reduce((s, d) => s + d.carbs_g, 0) / loggedDays.length)
    : 0;
  const avgFats = loggedDays.length > 0
    ? Math.round(loggedDays.reduce((s, d) => s + d.fats_g, 0) / loggedDays.length)
    : 0;
  const totalCalories = loggedDays.reduce((s, d) => s + d.calories, 0);

  // Max calorie value for bar chart scaling
  const maxCal = Math.max(targetCalories, ...weekData.map((d) => d.calories), 1);

  return (
    <View style={[weekStyles.container, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
      <Text style={[weekStyles.title, { color: c.black }]}>Resumen semanal</Text>

      {/* Average macro stats */}
      <View style={weekStyles.avgRow}>
        <View style={weekStyles.avgItem}>
          <Text style={[weekStyles.avgValue, { color: c.black }]}>{avgCalories}</Text>
          <Text style={[weekStyles.avgLabel, { color: c.gray }]}>kcal/dia</Text>
        </View>
        <View style={[weekStyles.avgDivider, { backgroundColor: c.grayLight }]} />
        <View style={weekStyles.avgItem}>
          <Text style={[weekStyles.avgValue, { color: c.protein }]}>{avgProtein}g</Text>
          <Text style={[weekStyles.avgLabel, { color: c.gray }]}>proteina</Text>
        </View>
        <View style={[weekStyles.avgDivider, { backgroundColor: c.grayLight }]} />
        <View style={weekStyles.avgItem}>
          <Text style={[weekStyles.avgValue, { color: c.carbs }]}>{avgCarbs}g</Text>
          <Text style={[weekStyles.avgLabel, { color: c.gray }]}>carbos</Text>
        </View>
        <View style={[weekStyles.avgDivider, { backgroundColor: c.grayLight }]} />
        <View style={weekStyles.avgItem}>
          <Text style={[weekStyles.avgValue, { color: c.fats }]}>{avgFats}g</Text>
          <Text style={[weekStyles.avgLabel, { color: c.gray }]}>grasas</Text>
        </View>
      </View>

      {/* Daily calorie bar chart */}
      <View style={weekStyles.chartContainer}>
        {/* Target line */}
        <View style={weekStyles.targetLineContainer}>
          <View
            style={[
              weekStyles.targetLine,
              {
                backgroundColor: c.accent + '40',
                bottom: `${(targetCalories / maxCal) * 100}%`,
              },
            ]}
          />
          <Text
            style={[
              weekStyles.targetLabel,
              {
                color: c.accent,
                bottom: `${(targetCalories / maxCal) * 100}%`,
              },
            ]}
          >
            {targetCalories}
          </Text>
        </View>

        <View style={weekStyles.barsRow}>
          {weekData.map((day, i) => {
            const pct = maxCal > 0 ? (day.calories / maxCal) * 100 : 0;
            const overTarget = day.calories > targetCalories;
            return (
              <View key={i} style={weekStyles.barColumn}>
                <View style={weekStyles.barTrack}>
                  <View
                    style={[
                      weekStyles.barFill,
                      {
                        height: `${Math.min(100, pct)}%`,
                        backgroundColor: !day.logged
                          ? c.grayLight
                          : overTarget
                            ? c.protein
                            : c.accent,
                        borderRadius: 3,
                      },
                    ]}
                  />
                </View>
                <Text style={[weekStyles.barLabel, { color: c.gray }]}>
                  {WEEKDAYS[i]?.charAt(0) ?? ''}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Total + days logged */}
      <View style={weekStyles.footerRow}>
        <Text style={[weekStyles.footerText, { color: c.gray }]}>
          Total: {Math.round(totalCalories).toLocaleString()} kcal
        </Text>
        <Text style={[weekStyles.footerText, { color: c.gray }]}>
          {loggedDays.length}/7 dias registrados
        </Text>
      </View>
    </View>
  );
});

const weekStyles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  title: {
    ...typography.label,
    fontSize: 14,
    marginBottom: spacing.sm,
  },
  avgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  avgItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  avgValue: {
    ...typography.titleSm,
    fontSize: 16,
  },
  avgLabel: {
    ...typography.caption,
    fontSize: 10,
  },
  avgDivider: {
    width: 1,
    height: 24,
  },
  chartContainer: {
    height: 120,
    marginBottom: spacing.sm,
    position: 'relative',
  },
  targetLineContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  targetLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
  },
  targetLabel: {
    position: 'absolute',
    right: 0,
    fontSize: 9,
    fontWeight: '600',
    marginBottom: 2,
  },
  barsRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  barTrack: {
    width: '100%',
    height: '100%',
    justifyContent: 'flex-end',
  },
  barFill: {
    width: '100%',
    minHeight: 2,
  },
  barLabel: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: '600',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    ...typography.caption,
    fontSize: 11,
  },
});

// ─── View Mode Toggle ────────────────────────────────────────────────────────

const ViewToggle = React.memo(function ViewToggle({
  mode,
  onChangeMode,
}: {
  mode: ViewMode;
  onChangeMode: (m: ViewMode) => void;
}) {
  const c = useThemeColors();

  return (
    <View style={[toggleStyles.container, { backgroundColor: c.surface }]}>
      <TouchableOpacity
        style={[
          toggleStyles.tab,
          mode === 'day' && [toggleStyles.tabActive, { backgroundColor: c.accent }],
        ]}
        onPress={() => { haptics.light(); onChangeMode('day'); }}
        accessibilityLabel="Vista diaria"
        accessibilityRole="tab"
        accessibilityState={{ selected: mode === 'day' }}
      >
        <Ionicons
          name="today-outline"
          size={14}
          color={mode === 'day' ? c.white : c.gray}
        />
        <Text style={[
          toggleStyles.tabText,
          { color: mode === 'day' ? c.white : c.gray },
        ]}>
          Dia
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          toggleStyles.tab,
          mode === 'week' && [toggleStyles.tabActive, { backgroundColor: c.accent }],
        ]}
        onPress={() => { haptics.light(); onChangeMode('week'); }}
        accessibilityLabel="Vista semanal"
        accessibilityRole="tab"
        accessibilityState={{ selected: mode === 'week' }}
      >
        <Ionicons
          name="bar-chart-outline"
          size={14}
          color={mode === 'week' ? c.white : c.gray}
        />
        <Text style={[
          toggleStyles.tabText,
          { color: mode === 'week' ? c.white : c.gray },
        ]}>
          Semana
        </Text>
      </TouchableOpacity>
    </View>
  );
});

const toggleStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: radius.md,
    padding: 3,
    marginBottom: spacing.md,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.sm,
  },
  tabActive: {},
  tabText: {
    ...typography.caption,
    fontWeight: '600',
  },
});

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function HistoryScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { sidePadding } = useLayout();
  const c = useThemeColors();
  const { isDark } = useAppTheme();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [logs, setLogs]       = useState<AIFoodLog[]>([]);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]     = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [calendarVisible, setCalendarVisible] = useState(true);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [logDays, setLogDays] = useState<Set<number>>(getMockLogDays(new Date().getFullYear(), new Date().getMonth()));

  // Weekly data
  const [weekData, setWeekData] = useState<WeeklySummaryProps['weekData']>([]);

  // Transition animation
  const contentFade = useRef(new Animated.Value(1)).current;
  const calendarHeight = useRef(new Animated.Value(calendarVisible ? 1 : 0)).current;

  const isToday = formatDate(currentDate) === formatDate(new Date());

  // ─── Data loading ──────────────────────────────────────────────────────────

  const load = useCallback(async (date: Date) => {
    setLoading(true);
    setError(false);

    // Fade out content
    Animated.timing(contentFade, {
      toValue: 0.3,
      duration: 100,
      useNativeDriver: true,
    }).start();

    try {
      const dateStr = formatDate(date);
      const [l, s] = await Promise.allSettled([
        foodService.getFoodLogs(dateStr),
        foodService.getDailySummary(dateStr),
      ]);

      const logsOk = l.status === 'fulfilled';
      const summaryOk = s.status === 'fulfilled';

      if (logsOk) setLogs(l.value);
      if (summaryOk) setSummary(s.value);

      // Fall back to mock data when API is unavailable
      if (!logsOk && !summaryOk) {
        setError(true);
        setLogs(MOCK_HISTORY_LOGS);
        setSummary({ ...MOCK_HISTORY_SUMMARY, date: dateStr });
      } else if (!logsOk) {
        setError(true);
        setLogs(MOCK_HISTORY_LOGS);
      } else if (!summaryOk) {
        setSummary(null);
      }
    } catch {
      setError(true);
      const dateStr = formatDate(date);
      setLogs(MOCK_HISTORY_LOGS);
      setSummary({ ...MOCK_HISTORY_SUMMARY, date: dateStr });
    } finally {
      setLoading(false);
      // Fade in content
      Animated.timing(contentFade, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [contentFade]);

  // Load weekly data for the week containing the current date
  const loadWeekData = useCallback(async (date: Date) => {
    const { start } = getWeekRange(date);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      const dateStr = formatDate(d);
      try {
        const [summaryResult] = await Promise.allSettled([
          foodService.getDailySummary(dateStr),
        ]);
        if (summaryResult.status === 'fulfilled') {
          days.push({
            day: dateStr,
            calories: summaryResult.value.total_calories,
            protein_g: summaryResult.value.total_protein_g,
            carbs_g: summaryResult.value.total_carbs_g,
            fats_g: summaryResult.value.total_fats_g,
            logged: summaryResult.value.meals_logged > 0,
          });
        } else {
          // Mock data for offline
          const mockCals = 1500 + Math.floor(Math.sin(i * 2.5) * 500);
          days.push({
            day: dateStr,
            calories: mockCals,
            protein_g: Math.round(mockCals * 0.06),
            carbs_g: Math.round(mockCals * 0.1),
            fats_g: Math.round(mockCals * 0.03),
            logged: i < 5, // mock: 5 of 7 days logged
          });
        }
      } catch {
        const mockCals = 1500 + Math.floor(Math.sin(i * 2.5) * 500);
        days.push({
          day: dateStr,
          calories: mockCals,
          protein_g: Math.round(mockCals * 0.06),
          carbs_g: Math.round(mockCals * 0.1),
          fats_g: Math.round(mockCals * 0.03),
          logged: i < 5,
        });
      }
    }
    setWeekData(days);
  }, []);

  useEffect(() => { load(currentDate); }, [currentDate]);

  useEffect(() => {
    if (viewMode === 'week') {
      loadWeekData(currentDate);
    }
  }, [viewMode, currentDate, loadWeekData]);

  // Update calendar log dots when month changes
  useEffect(() => {
    // In production, you would fetch which days have logs from the API.
    // For now, use deterministic mock data.
    setLogDays(getMockLogDays(calYear, calMonth));
  }, [calYear, calMonth]);

  const goToDay = useCallback((n: number) => {
    const next = addDays(currentDate, n);
    if (next > new Date()) return;
    haptics.light();
    setCurrentDate(next);

    // Update calendar month if the new date is in a different month
    if (next.getMonth() !== calMonth || next.getFullYear() !== calYear) {
      setCalMonth(next.getMonth());
      setCalYear(next.getFullYear());
    }
  }, [currentDate, calMonth, calYear]);

  const handleCalendarDateSelect = useCallback((d: Date) => {
    setCurrentDate(d);
    // Update calendar month if needed
    if (d.getMonth() !== calMonth || d.getFullYear() !== calYear) {
      setCalMonth(d.getMonth());
      setCalYear(d.getFullYear());
    }
  }, [calMonth, calYear]);

  const handleChangeMonth = useCallback((delta: number) => {
    let newMonth = calMonth + delta;
    let newYear = calYear;
    if (newMonth < 0) { newMonth = 11; newYear -= 1; }
    if (newMonth > 11) { newMonth = 0; newYear += 1; }
    // Don't navigate to future months
    const now = new Date();
    if (newYear > now.getFullYear() || (newYear === now.getFullYear() && newMonth > now.getMonth())) {
      return;
    }
    setCalMonth(newMonth);
    setCalYear(newYear);
  }, [calMonth, calYear]);

  const toggleCalendar = useCallback(() => {
    haptics.light();
    const newVisible = !calendarVisible;
    setCalendarVisible(newVisible);
    Animated.spring(calendarHeight, {
      toValue: newVisible ? 1 : 0,
      damping: 18,
      stiffness: 200,
      useNativeDriver: false,
    }).start();
  }, [calendarVisible, calendarHeight]);

  const handleViewModeChange = useCallback((m: ViewMode) => {
    // Animate the transition
    Animated.sequence([
      Animated.timing(contentFade, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.timing(contentFade, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
    setViewMode(m);
  }, [contentFade]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    haptics.light();
    await load(currentDate);
    if (viewMode === 'week') {
      await loadWeekData(currentDate);
    }
    setRefreshing(false);
  }, [currentDate, load, loadWeekData, viewMode]);

  const logsByMeal: Record<string, AIFoodLog[]> = useMemo(() => {
    const grouped: Record<string, AIFoodLog[]> = {};
    for (const mt of MEAL_ORDER) {
      grouped[mt] = logs.filter((l) => l.meal_type === mt);
    }
    return grouped;
  }, [logs]);

  // Flatten logs for FlatList with meal headers
  type ListItem =
    | { type: 'meal_header'; mealType: string; meta: { label: string; icon: string; color: string }; total: number; count: number }
    | { type: 'food_item'; log: AIFoodLog };

  const listData: ListItem[] = useMemo(() => {
    const items: ListItem[] = [];
    for (const mt of MEAL_ORDER) {
      const mealLogs = logsByMeal[mt] ?? [];
      if (mealLogs.length === 0) continue;
      const total = mealLogs.reduce((s, l) => s + l.calories, 0);
      items.push({
        type: 'meal_header',
        mealType: mt,
        meta: mealColors[mt],
        total,
        count: mealLogs.length,
      });
      for (const log of mealLogs) {
        items.push({ type: 'food_item', log });
      }
    }
    return items;
  }, [logsByMeal]);

  const flatListKeyExtractor = useCallback((item: ListItem, index: number) => {
    if (item.type === 'meal_header') return `header-${item.mealType}`;
    return `food-${item.log.id}`;
  }, []);

  const getItemLayout = useCallback((data: any, index: number) => ({
    length: ITEM_HEIGHT,
    offset: ITEM_HEIGHT * index,
    index,
  }), []);

  const renderListItem = useCallback(({ item }: { item: ListItem }) => {
    if (item.type === 'meal_header') {
      return (
        <View style={[styles.mealHeaderRow, { marginHorizontal: sidePadding }]}>
          <View style={[styles.mealIconBg, { backgroundColor: item.meta.color + '20' }]}>
            <Ionicons name={item.meta.icon as any} size={16} color={item.meta.color} />
          </View>
          <Text style={[styles.mealTitle, { color: c.black }]}>{item.meta.label}</Text>
          <Text style={[styles.mealTotal, { color: c.gray }]}>
            {item.count} {item.count === 1 ? 'item' : 'items'}
          </Text>
          <Text style={[styles.mealKcal, { color: c.black }]}>{Math.round(item.total)} kcal</Text>
        </View>
      );
    }

    const { log } = item;
    return (
      <View style={[styles.foodRow, { borderTopColor: c.grayLight, marginHorizontal: sidePadding }]}>
        <View style={styles.foodInfo}>
          <Text style={[styles.foodName, { color: c.black }]} numberOfLines={1}>{log.food_name}</Text>
          <Text style={[styles.foodMacros, { color: c.gray }]}>
            P {Math.round(log.protein_g)}g  ·  C {Math.round(log.carbs_g)}g  ·  G {Math.round(log.fats_g)}g
          </Text>
        </View>
        <Text style={[styles.foodKcal, { color: c.black }]}>{Math.round(log.calories)} kcal</Text>
      </View>
    );
  }, [c, sidePadding]);

  // Calendar animated max height
  const calendarMaxHeight = calendarHeight.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 380],
    extrapolate: 'clamp',
  });

  const calendarOpacity = calendarHeight.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0.5, 1],
    extrapolate: 'clamp',
  });

  // List header component
  const ListHeader = useMemo(() => (
    <View>
      {/* Error banner with mock data indicator */}
      {error && (
        <TouchableOpacity
          style={[styles.errorBanner, { backgroundColor: c.accent, marginHorizontal: sidePadding }]}
          onPress={() => load(currentDate)}
          activeOpacity={0.8}
          accessibilityLabel="Sin conexion, mostrando datos de ejemplo. Toca para reintentar"
          accessibilityRole="button"
          accessibilityHint="Intenta cargar los datos nuevamente desde el servidor"
        >
          <Ionicons name="wifi-outline" size={14} color={c.white} />
          <Text style={[styles.errorText, { color: c.white }]} allowFontScaling>Sin conexion -- datos de ejemplo. Toca para reintentar</Text>
        </TouchableOpacity>
      )}

      {/* View mode toggle */}
      <View style={{ paddingHorizontal: sidePadding }}>
        <ViewToggle mode={viewMode} onChangeMode={handleViewModeChange} />
      </View>

      {/* Calendar (collapsible) */}
      <Animated.View
        style={{
          maxHeight: calendarMaxHeight,
          opacity: calendarOpacity,
          overflow: 'hidden',
          paddingHorizontal: sidePadding,
        }}
      >
        <MiniCalendar
          selectedDate={currentDate}
          onSelectDate={handleCalendarDateSelect}
          logDays={logDays}
          calYear={calYear}
          calMonth={calMonth}
          onChangeMonth={handleChangeMonth}
        />
      </Animated.View>

      {/* Weekly summary (when in week mode) */}
      {viewMode === 'week' && (
        <Animated.View style={{ opacity: contentFade, paddingHorizontal: sidePadding }}>
          <WeeklySummary
            weekData={weekData}
            targetCalories={summary?.target_calories ?? 2100}
          />
        </Animated.View>
      )}

      {/* Day summary card */}
      {summary && viewMode === 'day' && (
        <View
          style={[styles.summaryCard, { backgroundColor: c.surface, borderColor: c.grayLight, marginHorizontal: sidePadding }]}
          accessible={true}
          accessibilityLabel={`Resumen del dia: ${Math.round(summary.total_calories)} kilocalorias, ${Math.round(summary.total_protein_g)} gramos de proteina, ${Math.round(summary.total_carbs_g)} gramos de carbohidratos, ${Math.round(summary.total_fats_g)} gramos de grasas`}
          accessibilityRole="summary"
        >
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: c.black }]} allowFontScaling>{Math.round(summary.total_calories)}</Text>
            <Text style={[styles.summaryLabel, { color: c.gray }]} allowFontScaling>kcal</Text>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: c.grayLight }]} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: c.protein }]} allowFontScaling>
              {Math.round(summary.total_protein_g)}g
            </Text>
            <Text style={[styles.summaryLabel, { color: c.gray }]} allowFontScaling>proteina</Text>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: c.grayLight }]} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: c.carbs }]} allowFontScaling>
              {Math.round(summary.total_carbs_g)}g
            </Text>
            <Text style={[styles.summaryLabel, { color: c.gray }]} allowFontScaling>carbos</Text>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: c.grayLight }]} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: c.fats }]} allowFontScaling>
              {Math.round(summary.total_fats_g)}g
            </Text>
            <Text style={[styles.summaryLabel, { color: c.gray }]} allowFontScaling>grasas</Text>
          </View>
        </View>
      )}

      {/* Calorie progress indicator */}
      {summary && viewMode === 'day' && (
        <View style={[styles.progressContainer, { marginHorizontal: sidePadding }]}>
          <View style={[styles.progressTrack, { backgroundColor: c.grayLight }]}>
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: summary.total_calories > summary.target_calories ? c.protein : c.accent,
                  width: `${Math.min(100, (summary.total_calories / Math.max(1, summary.target_calories)) * 100)}%`,
                },
              ]}
            />
          </View>
          <Text style={[styles.progressText, { color: c.gray }]}>
            {Math.round(summary.total_calories)} / {Math.round(summary.target_calories)} kcal
          </Text>
        </View>
      )}
    </View>
  ), [
    error, c, sidePadding, viewMode, handleViewModeChange, calendarMaxHeight,
    calendarOpacity, currentDate, handleCalendarDateSelect, logDays, calYear,
    calMonth, handleChangeMonth, contentFade, weekData, summary, load,
  ]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={c.bg} />
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: sidePadding }]}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: c.surface }]}
          onPress={() => { haptics.light(); navigation.goBack(); }}
          accessibilityLabel="Volver"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={20} color={c.black} />
        </TouchableOpacity>
        <Text
          style={[styles.headerTitle, { color: c.black }]}
          accessibilityRole="header"
          allowFontScaling
        >
          Historial
        </Text>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: c.surface }]}
          onPress={toggleCalendar}
          accessibilityLabel={calendarVisible ? 'Ocultar calendario' : 'Mostrar calendario'}
          accessibilityRole="button"
        >
          <Ionicons
            name={calendarVisible ? 'calendar' : 'calendar-outline'}
            size={18}
            color={calendarVisible ? c.accent : c.black}
          />
        </TouchableOpacity>
      </View>

      {/* Date navigator */}
      <View
        style={[styles.dateNav, { marginHorizontal: sidePadding, backgroundColor: c.surface }]}
        accessibilityRole="toolbar"
        accessibilityLabel={`Navegacion de fechas. Dia seleccionado: ${displayDate(currentDate)}`}
      >
        <TouchableOpacity
          onPress={() => goToDay(-1)}
          style={styles.navBtn}
          activeOpacity={0.7}
          accessibilityLabel="Dia anterior"
          accessibilityRole="button"
          accessibilityHint="Navega al dia anterior en el historial"
        >
          <Ionicons name="chevron-back" size={22} color={c.black} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={toggleCalendar}
          activeOpacity={0.6}
          accessibilityLabel={`${displayDate(currentDate)}. Toca para ${calendarVisible ? 'ocultar' : 'mostrar'} el calendario`}
        >
          <Text
            style={[styles.dateLabel, { color: c.black }]}
            accessibilityRole="text"
            allowFontScaling
          >
            {displayDate(currentDate)}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => goToDay(1)}
          style={[styles.navBtn, isToday && { opacity: 0.25 }]}
          disabled={isToday}
          activeOpacity={0.7}
          accessibilityLabel="Dia siguiente"
          accessibilityRole="button"
          accessibilityState={{ disabled: isToday }}
          accessibilityHint={isToday ? 'No puedes navegar al futuro' : 'Navega al dia siguiente en el historial'}
        >
          <Ionicons name="chevron-forward" size={22} color={c.black} />
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={c.accent} />
        </View>
      ) : (
        <Animated.View style={{ flex: 1, opacity: contentFade }}>
          {logs.length === 0 && viewMode === 'day' ? (
            <FlatList
              data={[]}
              ListHeaderComponent={ListHeader}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={[styles.emptyTitle, { color: c.black }]}>No hay datos para este dia</Text>
                  <Text style={[styles.emptyText, { color: c.gray }]}>Parece que no registraste nada. Vuelve al dia de hoy para empezar.</Text>
                </View>
              }
              renderItem={() => null}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[styles.scroll, { paddingHorizontal: 0 }]}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={c.accent}
                  colors={[c.accent]}
                />
              }
            />
          ) : (
            <FlatList
              data={viewMode === 'day' ? listData : []}
              keyExtractor={flatListKeyExtractor}
              renderItem={renderListItem}
              getItemLayout={getItemLayout}
              ListHeaderComponent={ListHeader}
              ListFooterComponent={<View style={{ height: spacing.xxl }} />}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scroll}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={c.accent}
                  colors={[c.accent]}
                />
              }
              // Performance
              initialNumToRender={12}
              maxToRenderPerBatch={8}
              windowSize={7}
              removeClippedSubviews={Platform.OS !== 'web'}
            />
          )}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { ...typography.titleSm },
  dateNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: radius.md,
    paddingVertical: spacing.xs, paddingHorizontal: spacing.xs,
    marginBottom: spacing.md,
  },
  navBtn: { padding: spacing.sm },
  dateLabel: { ...typography.label, textTransform: 'capitalize' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.md,
  },
  errorText: { ...typography.caption, flex: 1 },
  scroll: { paddingTop: spacing.xs },
  summaryCard: {
    flexDirection: 'row',
    borderRadius: radius.lg, borderWidth: 1,
    padding: spacing.md, marginBottom: spacing.sm,
    alignItems: 'center', ...shadows.sm,
  },
  summaryItem: { flex: 1, alignItems: 'center', gap: 2 },
  summaryValue: { ...typography.titleSm },
  summaryLabel: { ...typography.caption },
  summaryDivider: { width: 1, height: 28 },
  // ── Progress bar ──
  progressContainer: {
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressText: {
    ...typography.caption,
    fontSize: 11,
    textAlign: 'right',
  },
  // ── Empty state ──
  empty: {
    alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.sm,
  },
  emptyTitle: { ...typography.bodyMd, marginTop: spacing.sm },
  emptyText: { ...typography.caption, textAlign: 'center', paddingHorizontal: spacing.md },
  // ── Meal sections ──
  mealHeaderRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: spacing.sm, paddingVertical: spacing.sm,
    paddingTop: spacing.md,
  },
  mealIconBg: {
    width: 30, height: 30, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  mealTitle: { ...typography.label, flex: 1 },
  mealTotal: { ...typography.caption },
  mealKcal: { ...typography.caption, fontWeight: '700' },
  foodRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.xs + 2, borderTopWidth: 1,
    minHeight: ITEM_HEIGHT,
  },
  foodInfo: { flex: 1 },
  foodName: { ...typography.bodyMd, marginBottom: 2 },
  foodMacros: { ...typography.caption },
  foodKcal: { ...typography.label },
});
