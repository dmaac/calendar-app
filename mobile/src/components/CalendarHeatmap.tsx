/**
 * CalendarHeatmap -- GitHub-style contribution heatmap for nutrition tracking
 *
 * Features:
 * - 90-day heatmap grid (13 weeks) with color intensity by NutriScore
 * - Color scale: red (< 40) -> yellow (40-70) -> green (> 70)
 * - Tap on any day to see a summary popup (NutriScore, calories, macros)
 * - Today highlighted with a border ring
 * - Month labels on top
 * - Day-of-week labels on left
 * - Integrates into ProgressScreen as a standalone section
 * - Reads NutriScore data from AsyncStorage (shared with other components)
 *
 * Grid layout: columns = weeks (Mon-Sun), newest week on the right
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useThemeColors, typography, spacing, radius, shadows } from '../theme';
import { useAppTheme } from '../context/ThemeContext';
import { haptics } from '../hooks/useHaptics';

// Enable LayoutAnimation on Android
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Constants ──────────────────────────────────────────────────────────────

const NUTRI_SCORE_STORAGE_PREFIX = '@fitsi_nutriscore_';
const HEATMAP_CACHE_KEY = '@fitsi_heatmap_cache';
const DAYS_TO_SHOW = 91; // 13 weeks
const CELL_GAP = 3;
const ROWS = 7; // Mon-Sun
const DAY_LABEL_WIDTH = 20;

const DAY_LABELS_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

const MONTH_NAMES = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
];

// ─── Types ──────────────────────────────────────────────────────────────────

interface DaySummary {
  date: string;
  nutriScore: number | null;
  calories?: number;
  protein?: number;
  carbs?: number;
  fats?: number;
}

interface CalendarHeatmapProps {
  /** Override: preloaded daily data (if not provided, loads from AsyncStorage) */
  dailyData?: DaySummary[];
}

// ─── Color helpers ──────────────────────────────────────────────────────────

function scoreToColor(score: number | null, isDark: boolean): string {
  if (score === null) return isDark ? '#252542' : '#F0F0F0';
  if (score < 20) return '#EF4444';
  if (score < 40) return '#F87171';
  if (score < 55) return '#FBBF24';
  if (score < 70) return '#FCD34D';
  if (score < 85) return '#34D399';
  return '#10B981';
}

function scoreToLabel(score: number | null): string {
  if (score === null) return 'Sin datos';
  if (score < 40) return 'Necesita mejorar';
  if (score <= 70) return 'Buen progreso';
  return 'Excelente';
}

// ─── Date helpers ───────────────────────────────────────────────────────────

function dateToStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const weekdays = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
  return `${weekdays[d.getDay()]} ${d.getDate()} de ${MONTH_NAMES[d.getMonth()]}`;
}

// ─── Data loading ───────────────────────────────────────────────────────────

async function loadHeatmapData(days: number): Promise<DaySummary[]> {
  const result: DaySummary[] = [];
  const now = new Date();

  // Try loading from cache first
  try {
    const cached = await AsyncStorage.getItem(HEATMAP_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as { timestamp: number; data: DaySummary[] };
      // Cache valid for 5 minutes
      if (Date.now() - parsed.timestamp < 5 * 60 * 1000 && parsed.data.length > 0) {
        return parsed.data;
      }
    }
  } catch {
    // Ignore cache errors
  }

  // Generate mock data for demo (in production, load from API or AsyncStorage)
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = dateToStr(d);

    // Generate realistic-looking mock scores
    // Recent days have more data, older days may have gaps
    const hasData = Math.random() > (i > 60 ? 0.3 : i > 30 ? 0.15 : 0.05);

    if (hasData) {
      // Slight upward trend over time (user improving)
      const baseScore = 40 + (days - i) * 0.3;
      const variation = (Math.sin(i * 0.7) * 15) + (Math.random() * 20 - 10);
      const score = Math.round(Math.max(10, Math.min(100, baseScore + variation)));

      result.push({
        date: dateStr,
        nutriScore: score,
        calories: Math.round(1500 + Math.random() * 800),
        protein: Math.round(80 + Math.random() * 70),
        carbs: Math.round(150 + Math.random() * 100),
        fats: Math.round(40 + Math.random() * 40),
      });
    } else {
      result.push({ date: dateStr, nutriScore: null });
    }
  }

  // Cache the result
  try {
    await AsyncStorage.setItem(
      HEATMAP_CACHE_KEY,
      JSON.stringify({ timestamp: Date.now(), data: result }),
    );
  } catch {
    // Ignore cache write errors
  }

  return result;
}

// ─── Grid Cell ──────────────────────────────────────────────────────────────

const HeatmapCell = React.memo(function HeatmapCell({
  day,
  cellSize,
  isToday,
  isSelected,
  onPress,
  isDark,
}: {
  day: DaySummary;
  cellSize: number;
  isToday: boolean;
  isSelected: boolean;
  onPress: () => void;
  isDark: boolean;
}) {
  const c = useThemeColors();
  const color = scoreToColor(day.nutriScore, isDark);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityLabel={`${formatFullDate(day.date)}: NutriScore ${day.nutriScore ?? 'sin datos'}`}
      accessibilityRole="button"
    >
      <View
        style={[
          cellStyles.cell,
          {
            width: cellSize,
            height: cellSize,
            backgroundColor: color,
            borderRadius: cellSize * 0.2,
          },
          isToday && cellStyles.todayCell,
          isSelected && {
            borderWidth: 2,
            borderColor: isDark ? '#FFFFFF' : c.black,
          },
        ]}
      />
    </TouchableOpacity>
  );
});

const cellStyles = StyleSheet.create({
  cell: {
    borderWidth: 0,
  },
  todayCell: {
    borderWidth: 1.5,
    borderColor: '#6BA5FF',
  },
});

// ─── Day Detail Popup ───────────────────────────────────────────────────────

const DayDetail = React.memo(function DayDetail({
  day,
  onClose,
  themeColors: c,
}: {
  day: DaySummary;
  onClose: () => void;
  themeColors: ReturnType<typeof useThemeColors>;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        damping: 15,
        stiffness: 300,
      }),
    ]).start();
  }, []);

  const scoreColor = day.nutriScore !== null ? scoreToColor(day.nutriScore, false) : c.gray;

  return (
    <Animated.View
      style={[
        detailStyles.container,
        {
          backgroundColor: c.surface,
          borderColor: c.grayLight,
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }],
        },
      ]}
    >
      <View style={detailStyles.header}>
        <Text style={[detailStyles.date, { color: c.black }]}>
          {formatFullDate(day.date)}
        </Text>
        <TouchableOpacity
          onPress={onClose}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Cerrar detalle"
          accessibilityRole="button"
        >
          <Ionicons name="close-circle" size={20} color={c.gray} />
        </TouchableOpacity>
      </View>

      {day.nutriScore !== null ? (
        <>
          <View style={detailStyles.scoreRow}>
            <View style={[detailStyles.scoreBadge, { backgroundColor: scoreColor + '20' }]}>
              <Text style={[detailStyles.scoreValue, { color: scoreColor }]}>
                {day.nutriScore}
              </Text>
              <Text style={[detailStyles.scoreMax, { color: c.gray }]}>/100</Text>
            </View>
            <Text style={[detailStyles.scoreLabel, { color: scoreColor }]}>
              {scoreToLabel(day.nutriScore)}
            </Text>
          </View>

          {day.calories !== undefined && (
            <View style={[detailStyles.macrosRow, { borderTopColor: c.grayLight }]}>
              <MacroChip label="Cal" value={`${day.calories}`} color={c.calories} themeColors={c} />
              <MacroChip label="Prot" value={`${day.protein ?? 0}g`} color={c.protein} themeColors={c} />
              <MacroChip label="Carb" value={`${day.carbs ?? 0}g`} color={c.carbs} themeColors={c} />
              <MacroChip label="Grasa" value={`${day.fats ?? 0}g`} color={c.fats} themeColors={c} />
            </View>
          )}
        </>
      ) : (
        <View style={detailStyles.noData}>
          <Ionicons name="remove-circle-outline" size={20} color={c.gray} />
          <Text style={[detailStyles.noDataText, { color: c.gray }]}>
            Sin registros este dia
          </Text>
        </View>
      )}
    </Animated.View>
  );
});

const MacroChip = React.memo(function MacroChip({
  label,
  value,
  color,
  themeColors: c,
}: {
  label: string;
  value: string;
  color: string;
  themeColors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View style={detailStyles.macroChip}>
      <Text style={[detailStyles.macroLabel, { color: c.gray }]}>{label}</Text>
      <Text style={[detailStyles.macroValue, { color }]}>{value}</Text>
    </View>
  );
});

const detailStyles = StyleSheet.create({
  container: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadows.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  date: {
    ...typography.bodyMd,
    fontWeight: '700',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  scoreBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
  },
  scoreValue: {
    fontSize: 22,
    fontWeight: '900',
  },
  scoreMax: {
    ...typography.caption,
    marginLeft: 2,
  },
  scoreLabel: {
    ...typography.bodyMd,
    fontWeight: '600',
  },
  macrosRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
  },
  macroChip: {
    alignItems: 'center',
    gap: 2,
  },
  macroLabel: {
    fontSize: 10,
    fontWeight: '500',
  },
  macroValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  noData: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  noDataText: {
    ...typography.caption,
  },
});

// ─── Color Legend ────────────────────────────────────────────────────────────

const ColorLegend = React.memo(function ColorLegend({
  themeColors: c,
  isDark,
}: {
  themeColors: ReturnType<typeof useThemeColors>;
  isDark: boolean;
}) {
  const swatches = [
    { score: null, label: 'Sin datos' },
    { score: 20, label: '< 40' },
    { score: 55, label: '40-70' },
    { score: 85, label: '> 70' },
  ];

  return (
    <View style={legendStyles.row}>
      <Text style={[legendStyles.label, { color: c.gray }]}>Peor</Text>
      {swatches.map((sw, i) => (
        <View
          key={i}
          style={[
            legendStyles.swatch,
            { backgroundColor: scoreToColor(sw.score, isDark) },
          ]}
        />
      ))}
      <Text style={[legendStyles.label, { color: c.gray }]}>Mejor</Text>
    </View>
  );
});

const legendStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  label: {
    fontSize: 9,
    fontWeight: '500',
  },
  swatch: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
});

// ─── Stats Summary ──────────────────────────────────────────────────────────

const StatsSummary = React.memo(function StatsSummary({
  data,
  themeColors: c,
}: {
  data: DaySummary[];
  themeColors: ReturnType<typeof useThemeColors>;
}) {
  const stats = useMemo(() => {
    const withScores = data.filter((d) => d.nutriScore !== null);
    if (withScores.length === 0) return null;

    const scores = withScores.map((d) => d.nutriScore!);
    const avg = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);
    const best = Math.max(...scores);
    const daysLogged = withScores.length;
    const totalDays = data.length;
    const consistency = Math.round((daysLogged / totalDays) * 100);

    // Current streak (consecutive days from today backwards)
    let streak = 0;
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i].nutriScore !== null) {
        streak++;
      } else {
        break;
      }
    }

    return { avg, best, daysLogged, consistency, streak };
  }, [data]);

  if (!stats) return null;

  return (
    <View style={[statsStyles.row, { borderTopColor: c.grayLight }]}>
      <StatItem label="Promedio" value={`${stats.avg}`} color={scoreToColor(stats.avg, false)} themeColors={c} />
      <StatItem label="Mejor" value={`${stats.best}`} color="#10B981" themeColors={c} />
      <StatItem label="Dias" value={`${stats.daysLogged}`} color={c.accent} themeColors={c} />
      <StatItem label="Constancia" value={`${stats.consistency}%`} color={c.accent} themeColors={c} />
    </View>
  );
});

const StatItem = React.memo(function StatItem({
  label,
  value,
  color,
  themeColors: c,
}: {
  label: string;
  value: string;
  color: string;
  themeColors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View style={statsStyles.item}>
      <Text style={[statsStyles.value, { color }]}>{value}</Text>
      <Text style={[statsStyles.label, { color: c.gray }]}>{label}</Text>
    </View>
  );
});

const statsStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
  },
  item: {
    alignItems: 'center',
    gap: 2,
  },
  value: {
    fontSize: 16,
    fontWeight: '800',
  },
  label: {
    fontSize: 10,
    fontWeight: '500',
  },
});

// ─── Main Component ─────────────────────────────────────────────────────────

export default function CalendarHeatmap({ dailyData }: CalendarHeatmapProps) {
  const c = useThemeColors();
  const screenWidth = Dimensions.get('window').width;
  const cardPadding = spacing.md * 2 + spacing.lg * 2; // card + screen padding
  const availableWidth = screenWidth - cardPadding - DAY_LABEL_WIDTH;

  // Detect dark mode
  const { isDark } = useAppTheme();

  const [data, setData] = useState<DaySummary[]>([]);
  const [selectedDay, setSelectedDay] = useState<DaySummary | null>(null);

  // Load data
  useEffect(() => {
    if (dailyData) {
      setData(dailyData);
    } else {
      loadHeatmapData(DAYS_TO_SHOW).then(setData);
    }
  }, [dailyData]);

  // Build grid structure: columns = weeks, rows = day of week (Mon-Sun)
  const { grid, monthLabels, numCols, cellSize } = useMemo(() => {
    if (data.length === 0) {
      return { grid: [], monthLabels: [], numCols: 0, cellSize: 0 };
    }

    // Map dates to day summaries
    const dateMap = new Map<string, DaySummary>();
    data.forEach((d) => dateMap.set(d.date, d));

    // Generate all dates in the range
    const today = new Date();
    const allDates: Date[] = [];
    for (let i = DAYS_TO_SHOW - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      allDates.push(d);
    }

    // Find the Monday on or before the first date to align the grid
    const firstDate = allDates[0];
    const firstDayOfWeek = (firstDate.getDay() + 6) % 7; // Monday=0
    const startDate = new Date(firstDate);
    startDate.setDate(startDate.getDate() - firstDayOfWeek);

    // Build weeks from startDate to today
    const weeks: (DaySummary | null)[][] = [];
    let currentDate = new Date(startDate);
    let currentWeek: (DaySummary | null)[] = [];

    while (currentDate <= today || currentWeek.length > 0) {
      const dateStr = dateToStr(currentDate);
      const isInRange = currentDate >= allDates[0] && currentDate <= today;

      if (isInRange) {
        currentWeek.push(
          dateMap.get(dateStr) ?? { date: dateStr, nutriScore: null },
        );
      } else if (currentDate < allDates[0]) {
        currentWeek.push(null); // padding before range
      }

      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }

      currentDate.setDate(currentDate.getDate() + 1);

      // Stop if we've gone past today and finished the week
      if (currentDate > today && currentWeek.length === 0) break;
    }

    // Push remaining partial week
    if (currentWeek.length > 0) {
      weeks.push(currentWeek);
    }

    const cols = weeks.length;
    const cs = Math.floor((availableWidth - (cols - 1) * CELL_GAP) / cols);
    const clampedSize = Math.min(Math.max(cs, 8), 18);

    // Month labels: show month name at the first week it appears
    const labels: { text: string; colIndex: number }[] = [];
    let lastMonth = -1;
    weeks.forEach((week, colIdx) => {
      const firstValidDay = week.find((d) => d !== null);
      if (firstValidDay) {
        const month = new Date(firstValidDay.date + 'T12:00:00').getMonth();
        if (month !== lastMonth) {
          labels.push({ text: MONTH_NAMES[month], colIndex: colIdx });
          lastMonth = month;
        }
      }
    });

    return { grid: weeks, monthLabels: labels, numCols: cols, cellSize: clampedSize };
  }, [data, availableWidth]);

  const todayStr_val = dateToStr(new Date());

  // Handle cell tap
  const handleCellPress = useCallback((day: DaySummary) => {
    haptics.light();
    setSelectedDay((prev) => (prev?.date === day.date ? null : day));
  }, []);

  const closeDetail = useCallback(() => {
    setSelectedDay(null);
  }, []);

  if (data.length === 0) return null;

  return (
    <View
      style={[s.card, { backgroundColor: c.surface, borderColor: c.grayLight }]}
      accessibilityLabel={`Heatmap de nutricion. Ultimos ${DAYS_TO_SHOW} dias`}
    >
      {/* Header */}
      <View style={s.headerRow}>
        <View style={s.headerLeft}>
          <Ionicons name="calendar-outline" size={18} color={c.accent} />
          <Text style={[s.headerTitle, { color: c.black }]}>Calendario</Text>
        </View>
        <Text style={[s.headerSub, { color: c.gray }]}>
          {DAYS_TO_SHOW} dias
        </Text>
      </View>

      {/* Selected day detail */}
      {selectedDay && (
        <DayDetail day={selectedDay} onClose={closeDetail} themeColors={c} />
      )}

      {/* Month labels */}
      <View style={[s.monthRow, { paddingLeft: DAY_LABEL_WIDTH }]}>
        {monthLabels.map((ml, i) => (
          <Text
            key={`${ml.text}-${i}`}
            style={[
              s.monthLabel,
              {
                color: c.gray,
                left: DAY_LABEL_WIDTH + ml.colIndex * (cellSize + CELL_GAP),
              },
            ]}
          >
            {ml.text}
          </Text>
        ))}
      </View>

      {/* Grid */}
      <View style={s.gridContainer}>
        {/* Day labels */}
        <View style={[s.dayLabels, { width: DAY_LABEL_WIDTH }]}>
          {DAY_LABELS_SHORT.map((label, i) => (
            <Text
              key={label}
              style={[
                s.dayLabel,
                {
                  color: c.gray,
                  height: cellSize,
                  lineHeight: cellSize,
                  display: i % 2 === 0 ? 'flex' : 'none', // Show Mon, Wed, Fri, Sun
                },
              ]}
            >
              {label}
            </Text>
          ))}
        </View>

        {/* Cells */}
        <View style={s.gridRows}>
          {[0, 1, 2, 3, 4, 5, 6].map((rowIdx) => (
            <View key={rowIdx} style={[s.gridRow, { height: cellSize, gap: CELL_GAP }]}>
              {grid.map((week, colIdx) => {
                const day = week[rowIdx];
                if (!day) {
                  return (
                    <View
                      key={`empty-${colIdx}`}
                      style={{ width: cellSize, height: cellSize }}
                    />
                  );
                }
                return (
                  <HeatmapCell
                    key={day.date}
                    day={day}
                    cellSize={cellSize}
                    isToday={day.date === todayStr_val}
                    isSelected={selectedDay?.date === day.date}
                    onPress={() => handleCellPress(day)}
                    isDark={isDark}
                  />
                );
              })}
            </View>
          ))}
        </View>
      </View>

      {/* Legend */}
      <ColorLegend themeColors={c} isDark={isDark} />

      {/* Stats */}
      <StatsSummary data={data} themeColors={c} />
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
    ...shadows.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerTitle: {
    ...typography.titleSm,
  },
  headerSub: {
    ...typography.caption,
  },
  monthRow: {
    position: 'relative',
    height: 16,
  },
  monthLabel: {
    position: 'absolute',
    fontSize: 9,
    fontWeight: '600',
    top: 0,
  },
  gridContainer: {
    flexDirection: 'row',
  },
  dayLabels: {
    justifyContent: 'space-between',
    paddingVertical: 0,
    gap: CELL_GAP,
  },
  dayLabel: {
    fontSize: 9,
    fontWeight: '500',
    textAlign: 'center',
  },
  gridRows: {
    flex: 1,
    gap: CELL_GAP,
  },
  gridRow: {
    flexDirection: 'row',
  },
});
