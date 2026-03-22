/**
 * ProgressScreen -- Cal AI-style progress dashboard
 *
 * Sections:
 * 1. Weekly Summary card (shows on Sunday/Monday, dismissible)
 * 2. Share Progress Card (daily NutriScore, streak, macros)
 * 3. Day Streak + Badges Earned (side-by-side cards)
 * 4. Current Weight card with start/goal + prediction
 * 5. Weight Progress SVG line chart with time filters (90D, 6M, 1Y, ALL)
 * 6. Weight Changes table (3d, 7d, 14d, 30d, 90d, All Time)
 * 7. Progress Photos section with upload button
 * 8. Micronutrient Dashboard (expandable, estimated from logged foods)
 * 9. Supplement Tracker (daily checklist + weekly history)
 * 10. Daily Average Calories bar chart
 *
 * Uses ThemeContext for dark/light mode support.
 */
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, {
  Path,
  Line,
  Circle,
  Rect,
  Defs,
  LinearGradient,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { typography, spacing, radius, useThemeColors } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';
import FitsiMascot from '../../components/FitsiMascot';
import ShareProgressCard from '../../components/ShareProgressCard';
import WeeklySummary from '../../components/WeeklySummary';
import ProgressPhotos from '../../components/ProgressPhotos';
import BodyMetrics from '../../components/BodyMetrics';
import MicronutrientDashboard from '../../components/MicronutrientDashboard';
import SupplementTracker from '../../components/SupplementTracker';
import WorkoutSummaryCard, { WorkoutLogEntry } from '../../components/WorkoutSummaryCard';
import CalendarHeatmap from '../../components/CalendarHeatmap';
import { haptics } from '../../hooks/useHaptics';
import { useAnalytics } from '../../hooks/useAnalytics';
import useStreak from '../../hooks/useStreak';

// ─── Theme-aware color palette ──────────────────────────────────────────────

/** Returns a progress-screen color set derived from the active theme. */
function useProgressColors() {
  const { isDark } = useAppTheme();
  const tc = useThemeColors();

  return useMemo(() => ({
    bg: tc.bg,
    card: tc.surface,
    cardBorder: tc.grayLight,
    white: tc.white,
    textPrimary: tc.black,
    textSecondary: tc.gray,
    textTertiary: tc.disabled,
    accent: tc.accent,
    accentLight: isDark ? '#60A5FA' : '#93B8F4',
    orange: '#F59E0B',
    green: '#34D399',
    fire: '#FF6B35',
    medal: '#FBBF24',
    separator: tc.grayLight,
  }), [isDark, tc]);
}

// ─── Mock data ──────────────────────────────────────────────────────────────

const MOCK = {
  streak: 12,
  badges: 5,
  currentWeight: 80.0,
  startWeight: 85.0,
  goalWeight: 75.0,
  goalDate: 'Jun 2, 2026',
  nextWeighIn: 'Tomorrow',
};

// Mock data for ShareProgressCard (daily snapshot)
const MOCK_DAILY_PROGRESS = {
  nutriScore: 74,
  caloriesCurrent: 1820,
  caloriesTarget: 2100,
  protein: { current: 125, target: 150 },
  carbs: { current: 190, target: 240 },
  fats: { current: 60, target: 70 },
};

// Mock data for WeeklySummary
const MOCK_WEEKLY_SUMMARY = {
  avgCalories: 1950,
  bestNutriScore: 88,
  bestNutriScoreDay: 'Miercoles',
  totalMealsLogged: 24,
  streak: 12,
  avgProtein: 132,
  avgCarbs: 210,
  avgFats: 62,
};

// Mock data for WorkoutSummaryCard
function generateMockWorkoutLog(): WorkoutLogEntry[] {
  const entries: WorkoutLogEntry[] = [];
  const now = new Date();
  const samples = [
    { name: 'Pesas (general)',        cat: 'weights',  color: '#6366F1', icon: 'barbell-outline',   dur: 55, cal: 337 },
    { name: 'Correr (ritmo moderado)', cat: 'running',  color: '#EA4335', icon: 'walk-outline',      dur: 30, cal: 360 },
    { name: 'Yoga (Hatha)',           cat: 'yoga',     color: '#8B5CF6', icon: 'body-outline',      dur: 20, cal: 61  },
    { name: 'Peso muerto / Deadlift', cat: 'weights',  color: '#6366F1', icon: 'barbell-outline',   dur: 60, cal: 441 },
    { name: 'Futbol',                 cat: 'sports',   color: '#F97316', icon: 'football-outline',  dur: 90, cal: 771 },
    { name: 'Spinning / Indoor cycling', cat: 'cycling', color: '#10B981', icon: 'bicycle-outline', dur: 45, cal: 468 },
  ];
  for (let i = 0; i < samples.length; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const s = samples[i];
    entries.push({
      id: `pw-${i}`,
      exerciseName: s.name,
      exerciseCategory: s.cat,
      exerciseColor: s.color,
      exerciseIcon: s.icon,
      duration: s.dur,
      calories: s.cal,
      date: d.toISOString().slice(0, 10),
    });
  }
  return entries;
}

const MOCK_WORKOUT_LOG = generateMockWorkoutLog();

// Weight history (last ~120 days for ALL filter)
function generateWeightHistory(days: number, start: number, current: number): { date: Date; weight: number }[] {
  const data: { date: Date; weight: number }[] = [];
  const now = new Date();
  const diff = start - current;
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const progress = 1 - i / days;
    const trend = start - diff * progress + Math.sin(i * 0.4) * 0.4;
    data.push({ date: d, weight: Math.round(trend * 10) / 10 });
  }
  return data;
}

const ALL_WEIGHT_DATA = generateWeightHistory(365, 85.0, 80.0);

const WEIGHT_CHANGES = [
  { label: '3 day', value: -0.2 },
  { label: '7 day', value: -0.5 },
  { label: '14 day', value: -1.0 },
  { label: '30 day', value: -1.8 },
  { label: '90 day', value: -3.5 },
  { label: 'All Time', value: -5.0 },
];

// Daily average calories (last 7 days)
const DAILY_CALORIES = [
  { day: 'Mon', value: 1950 },
  { day: 'Tue', value: 2100 },
  { day: 'Wed', value: 1800 },
  { day: 'Thu', value: 2200 },
  { day: 'Fri', value: 1750 },
  { day: 'Sat', value: 2400 },
  { day: 'Sun', value: 2050 },
];

const CALORIE_TARGET = 2100;

// ─── Time filter ────────────────────────────────────────────────────────────

type TimeFilter = '90D' | '6M' | '1Y' | 'ALL';
const TIME_FILTERS: TimeFilter[] = ['90D', '6M', '1Y', 'ALL'];

function filterDays(f: TimeFilter): number {
  switch (f) {
    case '90D': return 90;
    case '6M': return 180;
    case '1Y': return 365;
    case 'ALL': return 9999;
  }
}

// ─── Weight Line Chart ──────────────────────────────────────────────────────

const CHART_H = 180;
const CHART_PAD_TOP = 16;
const CHART_PAD_BOTTOM = 24;
const CHART_PAD_LEFT = 36;
const CHART_PAD_RIGHT = 12;

// Memoized to prevent expensive SVG path recalculation on unrelated state changes
const WeightLineChart = React.memo(function WeightLineChart({
  data,
  width,
  colors: C,
}: {
  data: { date: Date; weight: number }[];
  width: number;
  colors: ReturnType<typeof useProgressColors>;
}) {
  if (data.length < 2) return null;

  const drawW = width - CHART_PAD_LEFT - CHART_PAD_RIGHT;
  const drawH = CHART_H - CHART_PAD_TOP - CHART_PAD_BOTTOM;

  const weights = data.map((d) => d.weight);
  const minW = Math.min(...weights) - 0.5;
  const maxW = Math.max(...weights) + 0.5;
  const range = maxW - minW || 1;

  const toX = (i: number) => CHART_PAD_LEFT + (i / (data.length - 1)) * drawW;
  const toY = (w: number) => CHART_PAD_TOP + drawH - ((w - minW) / range) * drawH;

  const linePath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(d.weight).toFixed(1)}`)
    .join(' ');

  const areaPath =
    linePath +
    ` L${toX(data.length - 1).toFixed(1)},${(CHART_H - CHART_PAD_BOTTOM).toFixed(1)}` +
    ` L${toX(0).toFixed(1)},${(CHART_H - CHART_PAD_BOTTOM).toFixed(1)} Z`;

  // Y-axis ticks
  const yTicks = 4;
  const yLabels = Array.from({ length: yTicks }, (_, i) => {
    const val = minW + (range * i) / (yTicks - 1);
    return { val, y: toY(val) };
  });

  // X-axis labels (first, mid, last)
  const xIndices = [0, Math.floor(data.length / 2), data.length - 1];
  const fmtDate = (d: Date) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[d.getMonth()]} ${d.getDate()}`;
  };

  const lastIdx = data.length - 1;
  const lastX = toX(lastIdx);
  const lastY = toY(data[lastIdx].weight);

  return (
    <Svg width={width} height={CHART_H}>
      <Defs>
        <LinearGradient id="weightAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={C.accent} stopOpacity="0.3" />
          <Stop offset="1" stopColor={C.accent} stopOpacity="0.02" />
        </LinearGradient>
      </Defs>

      {/* Grid lines */}
      {yLabels.map((t, i) => (
        <Line
          key={i}
          x1={CHART_PAD_LEFT}
          y1={t.y}
          x2={width - CHART_PAD_RIGHT}
          y2={t.y}
          stroke={C.separator}
          strokeWidth={0.5}
        />
      ))}

      {/* Y labels */}
      {yLabels.map((t, i) => (
        <SvgText
          key={`yl-${i}`}
          x={CHART_PAD_LEFT - 6}
          y={t.y + 4}
          fontSize={10}
          fill={C.textTertiary}
          textAnchor="end"
        >
          {t.val.toFixed(1)}
        </SvgText>
      ))}

      {/* X labels */}
      {xIndices.map((idx) => (
        <SvgText
          key={`xl-${idx}`}
          x={toX(idx)}
          y={CHART_H - 4}
          fontSize={10}
          fill={C.textTertiary}
          textAnchor="middle"
        >
          {fmtDate(data[idx].date)}
        </SvgText>
      ))}

      {/* Area fill */}
      <Path d={areaPath} fill="url(#weightAreaGrad)" />

      {/* Line */}
      <Path
        d={linePath}
        fill="none"
        stroke={C.accent}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Latest dot */}
      <Circle cx={lastX} cy={lastY} r={4} fill={C.accent} />
      <Circle cx={lastX} cy={lastY} r={2} fill={C.white} />
    </Svg>
  );
});

// ─── Calories Bar Chart ─────────────────────────────────────────────────────

const BAR_CHART_H = 160;
const BAR_PAD_TOP = 12;
const BAR_PAD_BOTTOM = 24;
const BAR_PAD_LEFT = 36;
const BAR_PAD_RIGHT = 12;

// Memoized to prevent bar re-render when time filter changes (only weight chart updates)
const CaloriesBarChart = React.memo(function CaloriesBarChart({
  data,
  target,
  width,
  colors: C,
}: {
  data: { day: string; value: number }[];
  target: number;
  width: number;
  colors: ReturnType<typeof useProgressColors>;
}) {
  const drawW = width - BAR_PAD_LEFT - BAR_PAD_RIGHT;
  const drawH = BAR_CHART_H - BAR_PAD_TOP - BAR_PAD_BOTTOM;

  const maxVal = Math.max(...data.map((d) => d.value), target) * 1.1;
  const barW = drawW / data.length;
  const innerBarW = barW * 0.55;

  const toY = (v: number) => BAR_PAD_TOP + drawH - (v / maxVal) * drawH;
  const targetY = toY(target);

  return (
    <Svg width={width} height={BAR_CHART_H}>
      {/* Target line */}
      <Line
        x1={BAR_PAD_LEFT}
        y1={targetY}
        x2={width - BAR_PAD_RIGHT}
        y2={targetY}
        stroke={C.textTertiary}
        strokeWidth={1}
        strokeDasharray="4,4"
      />
      <SvgText
        x={BAR_PAD_LEFT - 4}
        y={targetY + 4}
        fontSize={9}
        fill={C.textTertiary}
        textAnchor="end"
      >
        {target}
      </SvgText>

      {/* Bars */}
      {data.map((d, i) => {
        const x = BAR_PAD_LEFT + i * barW + (barW - innerBarW) / 2;
        const barH = (d.value / maxVal) * drawH;
        const y = BAR_PAD_TOP + drawH - barH;
        const isOverTarget = d.value > target;

        return (
          <React.Fragment key={d.day}>
            <Rect
              x={x}
              y={y}
              width={innerBarW}
              height={barH}
              rx={4}
              fill={isOverTarget ? C.orange : C.accent}
              opacity={0.9}
            />
            {/* Day label */}
            <SvgText
              x={BAR_PAD_LEFT + i * barW + barW / 2}
              y={BAR_CHART_H - 4}
              fontSize={10}
              fill={C.textTertiary}
              textAnchor="middle"
            >
              {d.day}
            </SvgText>
          </React.Fragment>
        );
      })}
    </Svg>
  );
});

// ─── Weight Change Row ──────────────────────────────────────────────────────

// Memoized to avoid re-render of all rows when only time filter changes
const WeightChangeRow = React.memo(function WeightChangeRow({
  label,
  value,
  maxAbsValue,
  colors: C,
}: {
  label: string;
  value: number;
  maxAbsValue: number;
  colors: ReturnType<typeof useProgressColors>;
}) {
  const absVal = Math.abs(value);
  const barPct = maxAbsValue > 0 ? (absVal / maxAbsValue) * 100 : 0;
  const isLoss = value < 0;
  const displayText = value === 0 ? 'No change' : `${value > 0 ? '+' : ''}${value.toFixed(1)} kg`;

  return (
    <View style={[s.changeRow, { borderBottomColor: C.separator }]}>
      <Text style={[s.changeLabel, { color: C.textSecondary }]}>{label}</Text>
      <View style={[s.changeBarContainer, { backgroundColor: C.separator + '20' }]}>
        <View
          style={[
            s.changeBar,
            {
              width: `${Math.max(barPct, 4)}%`,
              backgroundColor: isLoss ? C.accent : C.orange,
            },
          ]}
        />
      </View>
      <Text style={[s.changeValue, { color: C.textSecondary }, isLoss && { color: C.accent }]}>
        {displayText}
      </Text>
    </View>
  );
});

// ─── Main screen ────────────────────────────────────────────────────────────

export default function ProgressScreen() {
  const insets = useSafeAreaInsets();
  const { track } = useAnalytics('Progress');
  const C = useProgressColors();
  const screenWidth = Dimensions.get('window').width;
  const sidePadding = spacing.lg;
  const innerWidth = screenWidth - sidePadding * 2;

  const [timeFilter, setTimeFilter] = useState<TimeFilter>('90D');

  // Streak state (with freeze support)
  const {
    streak: streakDays,
    hasFreezeAvailable,
    freezeUsedToday,
  } = useStreak();

  // Use streak hook value if available, fallback to mock
  const displayStreak = streakDays > 0 ? streakDays : MOCK.streak;

  // Memoize filtered weight data to avoid re-slicing on every render
  const weightData = useMemo(() => {
    const filteredDays = filterDays(timeFilter);
    return ALL_WEIGHT_DATA.slice(-Math.min(filteredDays, ALL_WEIGHT_DATA.length));
  }, [timeFilter]);

  // Memoize max abs change — static data, computed once
  const maxAbsChange = useMemo(
    () => Math.max(...WEIGHT_CHANGES.map((c) => Math.abs(c.value))),
    [],
  );

  return (
    <View style={[s.screen, { paddingTop: insets.top, backgroundColor: C.bg }]}>
      {/* Header */}
      <View style={[s.header, { paddingHorizontal: sidePadding }]} accessibilityRole="header">
        <Text style={[s.headerTitle, { color: C.textPrimary }]}>Progress</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        bounces={true}
        overScrollMode="never"
        contentContainerStyle={[s.scroll, { paddingHorizontal: sidePadding }]}
      >
        {/* ── Weekly Summary (shows on Sunday/Monday) ── */}
        <WeeklySummary
          data={{ ...MOCK_WEEKLY_SUMMARY, streak: displayStreak }}
          onDismiss={() => track('weekly_summary_dismissed')}
          onShareComplete={() => track('weekly_summary_shared')}
        />

        {/* ── Share Progress Card (daily snapshot) ── */}
        <ShareProgressCard
          nutriScore={MOCK_DAILY_PROGRESS.nutriScore}
          streak={displayStreak}
          hasFreezeAvailable={hasFreezeAvailable}
          caloriesCurrent={MOCK_DAILY_PROGRESS.caloriesCurrent}
          caloriesTarget={MOCK_DAILY_PROGRESS.caloriesTarget}
          protein={MOCK_DAILY_PROGRESS.protein}
          carbs={MOCK_DAILY_PROGRESS.carbs}
          fats={MOCK_DAILY_PROGRESS.fats}
          onShareComplete={() => track('daily_progress_shared')}
        />

        {/* ── Calendar Heatmap (90 days NutriScore) ── */}
        <CalendarHeatmap />

        {/* ── Streak + Badges ── */}
        <View style={s.topCardsRow}>
          <View
            style={[s.topCard, { backgroundColor: C.card, borderColor: C.cardBorder }]}
            accessibilityLabel={`Racha de ${displayStreak} dias${hasFreezeAvailable ? ', congelamiento disponible' : ''}`}
          >
            <FitsiMascot expression="muscle" size="small" animation="idle" />
            <Text style={[s.topCardValue, { color: C.textPrimary }]}>{displayStreak}</Text>
            <Text style={[s.topCardLabel, { color: C.textSecondary }]}>
              Day Streak{hasFreezeAvailable ? ' \u2744' : ''}
            </Text>
          </View>
          <View
            style={[s.topCard, { backgroundColor: C.card, borderColor: C.cardBorder }]}
            accessibilityLabel={`${MOCK.badges} insignias obtenidas`}
          >
            <View style={[s.topCardIcon, { backgroundColor: C.separator + '30' }]}>
              <Ionicons name="medal" size={24} color={C.medal} accessibilityRole="image" accessibilityLabel="Icono de medalla" />
            </View>
            <Text style={[s.topCardValue, { color: C.textPrimary }]}>{MOCK.badges}</Text>
            <Text style={[s.topCardLabel, { color: C.textSecondary }]}>Badges Earned</Text>
          </View>
        </View>

        {/* ── Current Weight Card ── */}
        <View
          style={[s.card, { backgroundColor: C.card, borderColor: C.cardBorder }]}
          accessibilityLabel={`Peso actual ${MOCK.currentWeight} kilogramos. Peso inicial ${MOCK.startWeight}, objetivo ${MOCK.goalWeight}`}
        >
          <View style={s.weightHeaderRow}>
            <View>
              <Text style={[s.weightLabel, { color: C.textSecondary }]}>Current Weight</Text>
              <Text style={[s.weightValue, { color: C.textPrimary }]}>{MOCK.currentWeight} kg</Text>
            </View>
            <View style={[s.weightBadge, { backgroundColor: C.accent + '1F' }]}>
              <Ionicons name="scale-outline" size={14} color={C.accent} />
              <Text style={[s.weightBadgeText, { color: C.accentLight }]}>Next: {MOCK.nextWeighIn}</Text>
            </View>
          </View>

          <View style={s.weightStatsRow}>
            <View style={s.weightStat}>
              <Text style={[s.weightStatLabel, { color: C.textTertiary }]}>Start</Text>
              <Text style={[s.weightStatValue, { color: C.textPrimary }]}>{MOCK.startWeight} kg</Text>
            </View>
            <View style={[s.weightStatDivider, { backgroundColor: C.separator }]} />
            <View style={s.weightStat}>
              <Text style={[s.weightStatLabel, { color: C.textTertiary }]}>Goal</Text>
              <Text style={[s.weightStatValue, { color: C.textPrimary }]}>{MOCK.goalWeight} kg</Text>
            </View>
          </View>

          <View style={s.goalPrediction}>
            <Ionicons name="trending-down" size={14} color={C.green} />
            <Text style={[s.goalPredictionText, { color: C.green }]}>At your goal by {MOCK.goalDate}</Text>
          </View>
        </View>

        {/* ── Weight Progress Chart ── */}
        <View
          style={[s.card, { backgroundColor: C.card, borderColor: C.cardBorder }]}
          accessibilityLabel="Grafico de progreso de peso"
          accessibilityRole="summary"
        >
          <Text style={[s.sectionTitle, { color: C.textPrimary }]} accessibilityRole="header">Weight Progress</Text>

          {/* Time filter pills */}
          <View style={s.filterRow}>
            {TIME_FILTERS.map((f) => (
              <TouchableOpacity
                key={f}
                style={[
                  s.filterPill,
                  { backgroundColor: C.separator + '30' },
                  timeFilter === f && { backgroundColor: C.accent },
                ]}
                onPress={() => { haptics.light(); setTimeFilter(f); }}
                activeOpacity={0.7}
                accessibilityLabel={`Filtro de tiempo ${f}`}
                accessibilityRole="button"
                accessibilityState={{ selected: timeFilter === f }}
                accessibilityHint={`Muestra datos de peso de los ultimos ${f === 'ALL' ? 'todos los periodos' : f}`}
              >
                <Text style={[
                  s.filterPillText,
                  { color: C.textSecondary },
                  timeFilter === f && { color: C.white },
                ]}>
                  {f}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <WeightLineChart data={weightData} width={innerWidth - spacing.md * 2} colors={C} />
        </View>

        {/* ── Weight Changes Table ── */}
        <View style={[s.card, { backgroundColor: C.card, borderColor: C.cardBorder }]}>
          <Text style={[s.sectionTitle, { color: C.textPrimary }]} accessibilityRole="header">Weight Changes</Text>
          {WEIGHT_CHANGES.map((wc) => (
            <WeightChangeRow
              key={wc.label}
              label={wc.label}
              value={wc.value}
              maxAbsValue={maxAbsChange}
              colors={C}
            />
          ))}
        </View>

        {/* ── Progress Photos (full component) ── */}
        <ProgressPhotos />

        {/* ── Body Metrics Tracker ── */}
        <BodyMetrics />

        {/* ── Workout Summary (weekly activity) ── */}
        <WorkoutSummaryCard workouts={MOCK_WORKOUT_LOG} />

        {/* ── Micronutrient Dashboard (expandable) ── */}
        <MicronutrientDashboard />

        {/* ── Supplement Tracker ── */}
        <SupplementTracker />

        {/* ── Daily Average Calories ── */}
        <View style={[s.card, { backgroundColor: C.card, borderColor: C.cardBorder }]}>
          <Text style={[s.sectionTitle, { color: C.textPrimary }]} accessibilityRole="header">Daily Average Calories</Text>
          <Text style={[s.calSubtitle, { color: C.textTertiary }]}>
            Target: {CALORIE_TARGET} kcal
          </Text>
          <CaloriesBarChart
            data={DAILY_CALORIES}
            target={CALORIE_TARGET}
            width={innerWidth - spacing.md * 2}
            colors={C}
          />
        </View>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles (layout only — colors applied inline from theme) ─────────────

const s = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    paddingVertical: spacing.md,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  scroll: {
    paddingTop: spacing.sm,
  },

  // ── Top cards (Streak + Badges) ──
  topCardsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  topCard: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
  topCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  topCardValue: {
    fontSize: 28,
    fontWeight: '800',
  },
  topCardLabel: {
    ...typography.caption,
  },

  // ── Card ──
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
  },

  // ── Current Weight ──
  weightHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  weightLabel: {
    ...typography.caption,
    marginBottom: 4,
  },
  weightValue: {
    fontSize: 32,
    fontWeight: '800',
  },
  weightBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
  },
  weightBadgeText: {
    ...typography.caption,
    fontWeight: '600',
  },
  weightStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  weightStat: {
    flex: 1,
    alignItems: 'center',
  },
  weightStatLabel: {
    ...typography.caption,
    marginBottom: 2,
  },
  weightStatValue: {
    ...typography.bodyMd,
    fontWeight: '700',
  },
  weightStatDivider: {
    width: 1,
    height: 28,
  },
  goalPrediction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(52,211,153,0.1)',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  goalPredictionText: {
    ...typography.caption,
    fontWeight: '600',
  },

  // ── Section title ──
  sectionTitle: {
    ...typography.titleSm,
    marginBottom: spacing.sm,
  },

  // ── Time filter ──
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  filterPillText: {
    ...typography.caption,
    fontWeight: '600',
  },

  // ── Weight Changes ──
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  changeLabel: {
    width: 70,
    ...typography.caption,
    fontWeight: '600',
  },
  changeBarContainer: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    marginHorizontal: spacing.sm,
    overflow: 'hidden',
  },
  changeBar: {
    height: 8,
    borderRadius: 4,
  },
  changeValue: {
    width: 80,
    ...typography.caption,
    fontWeight: '600',
    textAlign: 'right',
  },

  // ── Daily Calories ──
  calSubtitle: {
    ...typography.caption,
    marginBottom: spacing.sm,
  },
});
