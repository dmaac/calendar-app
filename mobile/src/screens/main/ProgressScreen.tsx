/**
 * ProgressScreen -- Fitsi AI-style progress dashboard
 *
 * Sections:
 * 1. Header with Share Progress button
 * 2. Weekly Summary card (shows on Sunday/Monday, dismissible)
 * 3. Share Progress Card (daily NutriScore, streak, macros)
 * 4. Calendar Heatmap (90 days NutriScore)
 * 5. Day Streak + Badges Earned (side-by-side cards)
 * 6. Current Weight card with start/goal + prediction
 * 7. Weight Progress SVG line chart with goal line + time filters (90D, 6M, 1Y, ALL)
 * 8. Weight Changes table (3d, 7d, 14d, 30d, 90d, All Time)
 * 9. Milestone Achievements
 * 10. Progress Photos section with upload button
 * 11. Body Metrics Tracker
 * 12. Workout Summary (weekly activity)
 * 13. Micronutrient Dashboard (expandable)
 * 14. Supplement Tracker
 * 15. Daily Average Calories bar chart
 *
 * Uses ThemeContext for dark/light mode support.
 */
import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
  Alert,
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
import { typography, spacing, radius, useThemeColors, useLayout } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';
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
import type { MainTabScreenProps } from '../../navigation/types';

// ─── Theme-aware color palette ───────────────────────────────────────────────

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
    success: '#10B981',
    danger: '#EF4444',
    purple: '#8B5CF6',
    grayLight: tc.grayLight,
  }), [isDark, tc]);
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK = {
  streak: 12,
  badges: 5,
  currentWeight: 80.0,
  startWeight: 85.0,
  goalWeight: 75.0,
  goalDate: 'Jun 2, 2026',
  nextWeighIn: 'Tomorrow',
};

const MOCK_DAILY_PROGRESS = {
  nutriScore: 74,
  caloriesCurrent: 1820,
  caloriesTarget: 2100,
  protein: { current: 125, target: 150 },
  carbs: { current: 190, target: 240 },
  fats: { current: 60, target: 70 },
};

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

function generateMockWorkoutLog(): WorkoutLogEntry[] {
  const entries: WorkoutLogEntry[] = [];
  const now = new Date();
  const samples = [
    { name: 'Pesas (general)', cat: 'weights', color: '#6366F1', icon: 'barbell-outline', dur: 55, cal: 337 },
    { name: 'Correr (ritmo moderado)', cat: 'running', color: '#EA4335', icon: 'walk-outline', dur: 30, cal: 360 },
    { name: 'Yoga (Hatha)', cat: 'yoga', color: '#8B5CF6', icon: 'body-outline', dur: 20, cal: 61 },
    { name: 'Peso muerto / Deadlift', cat: 'weights', color: '#6366F1', icon: 'barbell-outline', dur: 60, cal: 441 },
    { name: 'Futbol', cat: 'sports', color: '#F97316', icon: 'football-outline', dur: 90, cal: 771 },
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

function generateWeightHistory(
  days: number,
  start: number,
  current: number,
): { date: Date; weight: number }[] {
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

// ─── Milestone data ──────────────────────────────────────────────────────────

interface Milestone {
  id: string;
  icon: string;
  iconColor: string;
  bgColor: string;
  title: string;
  subtitle: string;
  achieved: boolean;
  achievedDate?: string;
}

const MILESTONES: Milestone[] = [
  {
    id: 'first_log',
    icon: 'camera-outline',
    iconColor: '#4285F4',
    bgColor: '#E8F0FE',
    title: 'Primera comida registrada',
    subtitle: 'Empezaste tu viaje',
    achieved: true,
    achievedDate: 'Ene 15',
  },
  {
    id: 'streak_7',
    icon: 'flame-outline',
    iconColor: '#F59E0B',
    bgColor: '#FEF3C7',
    title: 'Racha de 7 dias',
    subtitle: 'Una semana seguida',
    achieved: true,
    achievedDate: 'Feb 3',
  },
  {
    id: 'lose_1kg',
    icon: 'trending-down-outline',
    iconColor: '#10B981',
    bgColor: '#D1FAE5',
    title: 'Primer kilogramo perdido',
    subtitle: '1 kg menos',
    achieved: true,
    achievedDate: 'Feb 12',
  },
  {
    id: 'streak_30',
    icon: 'star-outline',
    iconColor: '#8B5CF6',
    bgColor: '#EDE9FE',
    title: 'Racha de 30 dias',
    subtitle: 'Un mes completo',
    achieved: false,
  },
  {
    id: 'lose_5kg',
    icon: 'trophy-outline',
    iconColor: '#F59E0B',
    bgColor: '#FEF3C7',
    title: '5 kilogramos perdidos',
    subtitle: 'Mitad del camino',
    achieved: false,
  },
  {
    id: 'goal_reached',
    icon: 'ribbon-outline',
    iconColor: '#EA4335',
    bgColor: '#FEE2E2',
    title: 'Meta alcanzada',
    subtitle: `Llegar a ${MOCK.goalWeight} kg`,
    achieved: false,
  },
];

// ─── Time filter ─────────────────────────────────────────────────────────────

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

// ─── Weight Line Chart (with goal line) ──────────────────────────────────────

const CHART_H = 200;
const CHART_PAD_TOP = 20;
const CHART_PAD_BOTTOM = 28;
const CHART_PAD_LEFT = 40;
const CHART_PAD_RIGHT = 16;

const WeightLineChart = React.memo(function WeightLineChart({
  data,
  goalWeight,
  width,
  colors: C,
}: {
  data: { date: Date; weight: number }[];
  goalWeight: number;
  width: number;
  colors: ReturnType<typeof useProgressColors>;
}) {
  if (data.length < 2) return null;

  const drawW = width - CHART_PAD_LEFT - CHART_PAD_RIGHT;
  const drawH = CHART_H - CHART_PAD_TOP - CHART_PAD_BOTTOM;

  const weights = data.map((d) => d.weight);
  const minW = Math.min(...weights, goalWeight) - 0.5;
  const maxW = Math.max(...weights, goalWeight) + 0.5;
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

  const goalY = toY(goalWeight);

  const yTicks = 4;
  const yLabels = Array.from({ length: yTicks }, (_, i) => {
    const val = minW + (range * i) / (yTicks - 1);
    return { val, y: toY(val) };
  });

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
          <Stop offset="0" stopColor={C.accent} stopOpacity="0.25" />
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

      {/* Goal weight dashed line */}
      <Line
        x1={CHART_PAD_LEFT}
        y1={goalY}
        x2={width - CHART_PAD_RIGHT}
        y2={goalY}
        stroke={C.success}
        strokeWidth={1.5}
        strokeDasharray="6,4"
      />
      <SvgText
        x={width - CHART_PAD_RIGHT - 2}
        y={goalY - 5}
        fontSize={9}
        fontWeight="700"
        fill={C.success}
        textAnchor="end"
      >
        Meta {goalWeight} kg
      </SvgText>

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

      {/* Weight line */}
      <Path
        d={linePath}
        fill="none"
        stroke={C.accent}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Latest point */}
      <Circle cx={lastX} cy={lastY} r={5} fill={C.accent} />
      <Circle cx={lastX} cy={lastY} r={2.5} fill={C.white} />

      {/* Latest value label */}
      <SvgText
        x={lastX}
        y={lastY - 10}
        fontSize={11}
        fontWeight="700"
        fill={C.accent}
        textAnchor="middle"
      >
        {data[lastIdx].weight} kg
      </SvgText>
    </Svg>
  );
});

// ─── Calories Bar Chart ──────────────────────────────────────────────────────

const BAR_CHART_H = 160;
const BAR_PAD_TOP = 12;
const BAR_PAD_BOTTOM = 24;
const BAR_PAD_LEFT = 36;
const BAR_PAD_RIGHT = 12;

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

// ─── Weight Change Row ────────────────────────────────────────────────────────

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
      <Text
        style={[
          s.changeValue,
          { color: C.textSecondary },
          isLoss && { color: C.accent },
        ]}
      >
        {displayText}
      </Text>
    </View>
  );
});

// ─── Milestones section ───────────────────────────────────────────────────────

function MilestonesSection({ colors: C }: { colors: ReturnType<typeof useProgressColors> }) {
  const achieved = MILESTONES.filter((m) => m.achieved);
  const pending = MILESTONES.filter((m) => !m.achieved);

  return (
    <View style={[s.card, { backgroundColor: C.card, borderColor: C.cardBorder }]}>
      <Text style={[s.sectionTitle, { color: C.textPrimary }]} accessibilityRole="header">
        Logros
      </Text>

      {/* Achieved */}
      <View style={msStyles.group}>
        <Text style={[msStyles.groupLabel, { color: C.textSecondary }]}>Conseguidos</Text>
        {achieved.map((m) => (
          <View key={m.id} style={[msStyles.row, { borderBottomColor: C.separator }]}>
            <View style={[msStyles.iconWrap, { backgroundColor: m.bgColor }]}>
              <Ionicons name={m.icon as any} size={20} color={m.iconColor} />
            </View>
            <View style={msStyles.info}>
              <Text style={[msStyles.title, { color: C.textPrimary }]}>{m.title}</Text>
              <Text style={[msStyles.sub, { color: C.textSecondary }]}>{m.subtitle}</Text>
            </View>
            <View style={msStyles.right}>
              <View style={[msStyles.checkBadge, { backgroundColor: '#D1FAE5' }]}>
                <Ionicons name="checkmark" size={12} color="#059669" />
              </View>
              {m.achievedDate && (
                <Text style={[msStyles.date, { color: C.textTertiary }]}>{m.achievedDate}</Text>
              )}
            </View>
          </View>
        ))}
      </View>

      {/* Pending */}
      <View style={msStyles.group}>
        <Text style={[msStyles.groupLabel, { color: C.textSecondary }]}>Proximos logros</Text>
        {pending.map((m) => (
          <View
            key={m.id}
            style={[msStyles.row, { borderBottomColor: C.separator, opacity: 0.5 }]}
          >
            <View style={[msStyles.iconWrap, { backgroundColor: C.separator + '50' }]}>
              <Ionicons name={m.icon as any} size={20} color={C.textTertiary} />
            </View>
            <View style={msStyles.info}>
              <Text style={[msStyles.title, { color: C.textPrimary }]}>{m.title}</Text>
              <Text style={[msStyles.sub, { color: C.textSecondary }]}>{m.subtitle}</Text>
            </View>
            <View style={[msStyles.lockBadge, { backgroundColor: C.separator }]}>
              <Ionicons name="lock-closed-outline" size={12} color={C.textTertiary} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const msStyles = StyleSheet.create({
  group: { marginBottom: spacing.sm },
  groupLabel: {
    ...typography.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1 },
  title: { ...typography.label, marginBottom: 2 },
  sub: { ...typography.caption },
  right: { alignItems: 'flex-end', gap: 2 },
  checkBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  date: { ...typography.caption },
});

// ─── Share progress handler ───────────────────────────────────────────────────

async function handleShareProgress(streak: number) {
  try {
    const result = await Share.share({
      message:
        `Mi progreso en Fitsi AI:\n` +
        `Peso actual: ${MOCK.currentWeight} kg\n` +
        `Perdido: ${(MOCK.startWeight - MOCK.currentWeight).toFixed(1)} kg\n` +
        `Racha: ${streak} dias seguidos\n` +
        `Meta: ${MOCK.goalWeight} kg para ${MOCK.goalDate}`,
      title: 'Mi progreso en Fitsi AI',
    });
    // result.action will be Share.sharedAction or Share.dismissedAction
  } catch {
    Alert.alert('Error', 'No se pudo compartir. Intenta de nuevo.');
  }
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ProgressScreen(_props: MainTabScreenProps<'Progress'>) {
  const insets = useSafeAreaInsets();
  const { track } = useAnalytics('Progress');
  const C = useProgressColors();
  const { width: screenWidth, sidePadding } = useLayout();
  const innerWidth = screenWidth - sidePadding * 2;

  const [timeFilter, setTimeFilter] = useState<TimeFilter>('90D');

  const {
    streak: streakDays,
    hasFreezeAvailable,
    freezeUsedToday,
  } = useStreak();

  const displayStreak = streakDays > 0 ? streakDays : MOCK.streak;

  const weightData = useMemo(() => {
    const filteredDays = filterDays(timeFilter);
    return ALL_WEIGHT_DATA.slice(-Math.min(filteredDays, ALL_WEIGHT_DATA.length));
  }, [timeFilter]);

  const maxAbsChange = useMemo(
    () => Math.max(...WEIGHT_CHANGES.map((c) => Math.abs(c.value))),
    [],
  );

  const onShareProgress = useCallback(() => {
    haptics.light();
    track('share_progress_tapped');
    handleShareProgress(displayStreak);
  }, [displayStreak, track]);

  return (
    <View style={[s.screen, { paddingTop: insets.top, backgroundColor: C.bg }]}>
      {/* Header with Share button */}
      <View style={[s.header, { paddingHorizontal: sidePadding }]} accessibilityRole="header">
        <Text style={[s.headerTitle, { color: C.textPrimary }]}>Progreso</Text>
        <TouchableOpacity
          style={[s.shareHeaderBtn, { backgroundColor: C.accent + '18', borderColor: C.accent + '30' }]}
          onPress={onShareProgress}
          activeOpacity={0.7}
          accessibilityLabel="Compartir progreso"
          accessibilityRole="button"
        >
          <Ionicons name="share-social-outline" size={16} color={C.accent} />
          <Text style={[s.shareHeaderText, { color: C.accent }]}>Compartir</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        bounces
        overScrollMode="never"
        contentContainerStyle={[s.scroll, { paddingHorizontal: sidePadding, paddingBottom: insets.bottom + 100 }]}
      >
        {/* Weekly Summary (shows on Sunday/Monday) */}
        <WeeklySummary
          data={{ ...MOCK_WEEKLY_SUMMARY, streak: displayStreak }}
          onDismiss={() => track('weekly_summary_dismissed')}
          onShareComplete={() => track('weekly_summary_shared')}
        />

        {/* Daily snapshot share card */}
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

        {/* Calendar Heatmap */}
        <View
          accessibilityLabel="Mapa de calor nutricional de los ultimos 90 dias"
          accessibilityRole="summary"
        >
          <CalendarHeatmap />
        </View>

        {/* Streak + Badges */}
        <View style={s.topCardsRow}>
          <View
            style={[s.topCard, { backgroundColor: C.card, borderColor: C.cardBorder }]}
            accessibilityLabel={`Racha de ${displayStreak} dias${hasFreezeAvailable ? ', congelamiento disponible' : ''}`}
          >
            <Ionicons name="flame" size={28} color="#FF6B35" />
            <Text style={[s.topCardValue, { color: C.textPrimary }]}>{displayStreak}</Text>
            <Text style={[s.topCardLabel, { color: C.textSecondary }]}>
              {'Dia de racha'}
              {hasFreezeAvailable ? ' \u2744' : ''}
            </Text>
          </View>
          <View
            style={[s.topCard, { backgroundColor: C.card, borderColor: C.cardBorder }]}
            accessibilityLabel={`${MOCK.badges} insignias obtenidas`}
          >
            <View style={[s.topCardIcon, { backgroundColor: C.separator + '30' }]}>
              <Ionicons
                name="medal"
                size={24}
                color={C.medal}
                accessibilityRole="image"
                accessibilityLabel="Icono de medalla"
              />
            </View>
            <Text style={[s.topCardValue, { color: C.textPrimary }]}>{MOCK.badges}</Text>
            <Text style={[s.topCardLabel, { color: C.textSecondary }]}>Logros</Text>
          </View>
        </View>

        {/* Current Weight Card */}
        <View
          style={[s.card, { backgroundColor: C.card, borderColor: C.cardBorder }]}
          accessibilityLabel={`Peso actual ${MOCK.currentWeight} kilogramos. Inicio ${MOCK.startWeight}, meta ${MOCK.goalWeight}`}
        >
          <View style={s.weightHeaderRow}>
            <View>
              <Text style={[s.weightLabel, { color: C.textSecondary }]}>Peso actual</Text>
              <Text style={[s.weightValue, { color: C.textPrimary }]}>
                {MOCK.currentWeight} kg
              </Text>
            </View>
            <View style={[s.weightBadge, { backgroundColor: C.accent + '1F' }]}>
              <Ionicons name="scale-outline" size={14} color={C.accent} />
              <Text style={[s.weightBadgeText, { color: C.accentLight }]}>
                Proximo: {MOCK.nextWeighIn}
              </Text>
            </View>
          </View>

          <View style={s.weightStatsRow}>
            <View style={s.weightStat}>
              <Text style={[s.weightStatLabel, { color: C.textTertiary }]}>Inicio</Text>
              <Text style={[s.weightStatValue, { color: C.textPrimary }]}>
                {MOCK.startWeight} kg
              </Text>
            </View>
            <View style={[s.weightStatDivider, { backgroundColor: C.separator }]} />
            <View style={s.weightStat}>
              <Text style={[s.weightStatLabel, { color: C.textTertiary }]}>Perdido</Text>
              <Text style={[s.weightStatValue, { color: C.success }]}>
                -{(MOCK.startWeight - MOCK.currentWeight).toFixed(1)} kg
              </Text>
            </View>
            <View style={[s.weightStatDivider, { backgroundColor: C.separator }]} />
            <View style={s.weightStat}>
              <Text style={[s.weightStatLabel, { color: C.textTertiary }]}>Meta</Text>
              <Text style={[s.weightStatValue, { color: C.textPrimary }]}>
                {MOCK.goalWeight} kg
              </Text>
            </View>
          </View>

          <View style={s.goalPrediction}>
            <Ionicons name="trending-down" size={14} color={C.green} />
            <Text style={[s.goalPredictionText, { color: C.green }]}>
              Llegas a tu meta el {MOCK.goalDate}
            </Text>
          </View>
        </View>

        {/* Weight Progress Chart */}
        <View
          style={[s.card, { backgroundColor: C.card, borderColor: C.cardBorder }]}
          accessibilityLabel="Grafico de progreso de peso con linea de meta"
          accessibilityRole="summary"
        >
          <Text style={[s.sectionTitle, { color: C.textPrimary }]} accessibilityRole="header">
            Tendencia de peso
          </Text>

          {/* Legend */}
          <View style={s.chartLegend}>
            <View style={s.legendItem}>
              <View style={[s.legendLine, { backgroundColor: C.accent }]} />
              <Text style={[s.legendText, { color: C.textSecondary }]}>Peso</Text>
            </View>
            <View style={s.legendItem}>
              <View style={[s.legendDash, { borderColor: C.success }]} />
              <Text style={[s.legendText, { color: C.textSecondary }]}>Meta</Text>
            </View>
          </View>

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
              >
                <Text
                  style={[
                    s.filterPillText,
                    { color: C.textSecondary },
                    timeFilter === f && { color: C.white },
                  ]}
                >
                  {f}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <WeightLineChart
            data={weightData}
            goalWeight={MOCK.goalWeight}
            width={innerWidth - spacing.md * 2}
            colors={C}
          />
        </View>

        {/* Weight Changes Table */}
        <View style={[s.card, { backgroundColor: C.card, borderColor: C.cardBorder }]}>
          <Text style={[s.sectionTitle, { color: C.textPrimary }]} accessibilityRole="header">
            Cambios de peso
          </Text>
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

        {/* Milestone Achievements */}
        <MilestonesSection colors={C} />

        {/* Progress Photos */}
        <ProgressPhotos />

        {/* Body Metrics */}
        <BodyMetrics />

        {/* Workout Summary */}
        <WorkoutSummaryCard workouts={MOCK_WORKOUT_LOG} />

        {/* Micronutrient Dashboard */}
        <MicronutrientDashboard />

        {/* Supplement Tracker */}
        <SupplementTracker />

        {/* Daily Average Calories */}
        <View style={[s.card, { backgroundColor: C.card, borderColor: C.cardBorder }]}>
          <Text style={[s.sectionTitle, { color: C.textPrimary }]} accessibilityRole="header">
            Calorias diarias
          </Text>
          <Text style={[s.calSubtitle, { color: C.textTertiary }]}>
            Meta: {CALORIE_TARGET} kcal
          </Text>
          <CaloriesBarChart
            data={DAILY_CALORIES}
            target={CALORIE_TARGET}
            width={innerWidth - spacing.md * 2}
            colors={C}
          />
        </View>

        {/* Share progress CTA at the bottom */}
        <TouchableOpacity
          style={[s.shareBottomBtn, { backgroundColor: C.accent }]}
          onPress={onShareProgress}
          activeOpacity={0.85}
          accessibilityLabel="Compartir mi progreso"
          accessibilityRole="button"
        >
          <Ionicons name="share-social-outline" size={20} color="#FFFFFF" />
          <Text style={s.shareBottomBtnText}>Compartir mi progreso</Text>
        </TouchableOpacity>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen: { flex: 1 },

  // Header
  header: {
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  shareHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  shareHeaderText: {
    ...typography.label,
  },

  scroll: { paddingTop: spacing.sm },

  // Top cards
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
  topCardValue: { fontSize: 28, fontWeight: '800' },
  topCardLabel: { ...typography.caption },

  // Card
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
  },

  // Weight card
  weightHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  weightLabel: { ...typography.caption, marginBottom: 4 },
  weightValue: { fontSize: 32, fontWeight: '800' },
  weightBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
  },
  weightBadgeText: { ...typography.caption, fontWeight: '600' },
  weightStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  weightStat: { flex: 1, alignItems: 'center' },
  weightStatLabel: { ...typography.caption, marginBottom: 2 },
  weightStatValue: { ...typography.bodyMd, fontWeight: '700' },
  weightStatDivider: { width: 1, height: 28 },
  goalPrediction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(52,211,153,0.1)',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  goalPredictionText: { ...typography.caption, fontWeight: '600' },

  // Section title
  sectionTitle: { ...typography.titleSm, marginBottom: spacing.sm },

  // Chart legend
  chartLegend: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendLine: { width: 16, height: 2.5, borderRadius: 2 },
  legendDash: {
    width: 16,
    borderTopWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 2,
  },
  legendText: { ...typography.caption, fontWeight: '600' },

  // Time filter
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
  filterPillText: { ...typography.caption, fontWeight: '600' },

  // Weight changes
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  changeLabel: { width: 70, ...typography.caption, fontWeight: '600' },
  changeBarContainer: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    marginHorizontal: spacing.sm,
    overflow: 'hidden',
  },
  changeBar: { height: 8, borderRadius: 4 },
  changeValue: { width: 80, ...typography.caption, fontWeight: '600', textAlign: 'right' },

  // Daily calories
  calSubtitle: { ...typography.caption, marginBottom: spacing.sm },

  // Share bottom CTA
  shareBottomBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 56,
    borderRadius: radius.full,
    marginBottom: spacing.md,
  },
  shareBottomBtnText: { ...typography.button, color: '#FFFFFF' },
});
