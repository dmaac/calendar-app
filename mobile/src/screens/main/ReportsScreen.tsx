/**
 * ReportsScreen — Weekly / Monthly / Last-30-Days nutrition reports with insights.
 *
 * Sections:
 * 1. Time-range selector (Esta Semana / Este Mes / Ultimos 30 Dias)
 * 2. Fitsi mascot mood
 * 3. Calorie bar chart (SVG) with goal line
 * 4. Average calories hero card + adherence ring
 * 5. Macro summary cards (avg protein / adherence)
 * 6. Goal vs actual comparison bars (calories, protein, carbs, fat)
 * 7. Macro donut / pie chart with legend
 * 8. Top foods eaten list
 * 9. Best day card
 * 10. AI-generated insights
 * 11. Share button
 */
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, {
  Rect,
  Line,
  Circle,
  Path,
  G,
  Defs,
  LinearGradient,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { typography, spacing, radius, shadows, useLayout, useThemeColors } from '../../theme';
import { haptics } from '../../hooks/useHaptics';
import { shareWeeklySummary } from '../../components/ShareableCard';
import { usePremium } from '../../hooks/usePremium';
import PremiumGate from '../../components/PremiumGate';

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = 'week' | 'month' | 'last30';

interface DayEntry { day: string; calories: number }
interface Summary {
  avgCalories: number;
  avgProtein: number;
  avgCarbs: number;
  avgFats: number;
  adherence: number;
  proteinTarget: number;
  carbsTarget: number;
  fatsTarget: number;
}
interface Macros { protein: number; carbs: number; fat: number }
interface BestDay { day: string; metric: string; delta: string }
interface Insight { icon: 'trending-down-outline' | 'trending-up-outline' | 'flame-outline' | 'calendar-outline' | 'nutrition-outline' | 'alert-circle-outline'; text: string }
interface TopFood { name: string; count: number; avgCalories: number; icon: string; color: string }

// ─── Mock data ────────────────────────────────────────────────────────────────

const CALORIE_TARGET = 2000;
const PROTEIN_TARGET = 120;
const CARBS_TARGET = 250;
const FATS_TARGET = 65;

const WEEKLY_DATA: DayEntry[] = [
  { day: 'Lun', calories: 1850 },
  { day: 'Mar', calories: 1420 },
  { day: 'Mie', calories: 2100 },
  { day: 'Jue', calories: 1980 },
  { day: 'Vie', calories: 2250 },
  { day: 'Sab', calories: 1760 },
  { day: 'Dom', calories: 1900 },
];

const MONTHLY_DATA: DayEntry[] = [
  { day: 'S1', calories: 1900 },
  { day: 'S2', calories: 1780 },
  { day: 'S3', calories: 2050 },
  { day: 'S4', calories: 1850 },
];

const LAST30_DATA: DayEntry[] = [
  { day: 'S1', calories: 1820 },
  { day: 'S2', calories: 1960 },
  { day: 'S3', calories: 2080 },
  { day: 'S4', calories: 1750 },
];

const WEEKLY_SUMMARY: Summary = {
  avgCalories: 1894, avgProtein: 85, avgCarbs: 210, avgFats: 62,
  adherence: 71, proteinTarget: PROTEIN_TARGET, carbsTarget: CARBS_TARGET, fatsTarget: FATS_TARGET,
};
const MONTHLY_SUMMARY: Summary = {
  avgCalories: 1895, avgProtein: 90, avgCarbs: 220, avgFats: 58,
  adherence: 68, proteinTarget: PROTEIN_TARGET, carbsTarget: CARBS_TARGET, fatsTarget: FATS_TARGET,
};
const LAST30_SUMMARY: Summary = {
  avgCalories: 1902, avgProtein: 88, avgCarbs: 215, avgFats: 60,
  adherence: 72, proteinTarget: PROTEIN_TARGET, carbsTarget: CARBS_TARGET, fatsTarget: FATS_TARGET,
};

const WEEKLY_MACROS: Macros = { protein: 85, carbs: 210, fat: 62 };
const MONTHLY_MACROS: Macros = { protein: 90, carbs: 220, fat: 58 };
const LAST30_MACROS: Macros = { protein: 88, carbs: 215, fat: 60 };

const WEEKLY_BEST_DAY: BestDay = { day: 'Viernes', metric: '125g proteinas', delta: '+5g sobre la meta' };
const MONTHLY_BEST_DAY: BestDay = { day: 'Semana 3', metric: '132g proteinas', delta: '+12g sobre la meta' };
const LAST30_BEST_DAY: BestDay = { day: 'Semana 2', metric: '128g proteinas', delta: '+8g sobre la meta' };

const WEEKLY_INSIGHTS: Insight[] = [
  { icon: 'trending-down-outline', text: 'Tu proteina promedio es 85g, debajo de tu meta de 120g. Agrega una porcion extra de proteina al almuerzo.' },
  { icon: 'flame-outline', text: 'Llevas 5 dias seguidos logueando. Sigue asi.' },
  { icon: 'calendar-outline', text: 'Los martes es cuando menos registras comidas. Pon una alarma para no olvidar.' },
];
const MONTHLY_INSIGHTS: Insight[] = [
  { icon: 'trending-up-outline', text: 'Tu adherencia mejoro 8% respecto al mes anterior.' },
  { icon: 'nutrition-outline', text: 'Tu consumo de grasas esta dentro del rango ideal de forma consistente.' },
  { icon: 'alert-circle-outline', text: 'Las semanas 2 y 4 tuvieron menor registro. Intenta mantener la consistencia.' },
];
const LAST30_INSIGHTS: Insight[] = [
  { icon: 'trending-up-outline', text: 'Tus calorias promedio bajaron 50 kcal respecto al mes anterior, acercandote a tu meta.' },
  { icon: 'flame-outline', text: 'Tu mejor racha en los ultimos 30 dias fue de 9 dias consecutivos.' },
  { icon: 'nutrition-outline', text: 'Los carbohidratos se mantienen estables. Trabaja en aumentar la proteina.' },
];

const TOP_FOODS_WEEKLY: TopFood[] = [
  { name: 'Pechuga de pollo', count: 5, avgCalories: 165, icon: 'restaurant-outline', color: '#EA4335' },
  { name: 'Arroz integral', count: 5, avgCalories: 215, icon: 'leaf-outline', color: '#FBBC04' },
  { name: 'Huevos', count: 4, avgCalories: 155, icon: 'egg-outline', color: '#F59E0B' },
  { name: 'Platano', count: 4, avgCalories: 105, icon: 'nutrition-outline', color: '#10B981' },
  { name: 'Yogur griego', count: 3, avgCalories: 130, icon: 'water-outline', color: '#4285F4' },
];
const TOP_FOODS_MONTHLY: TopFood[] = [
  { name: 'Pechuga de pollo', count: 18, avgCalories: 165, icon: 'restaurant-outline', color: '#EA4335' },
  { name: 'Arroz integral', count: 16, avgCalories: 215, icon: 'leaf-outline', color: '#FBBC04' },
  { name: 'Huevos', count: 15, avgCalories: 155, icon: 'egg-outline', color: '#F59E0B' },
  { name: 'Avena', count: 14, avgCalories: 150, icon: 'nutrition-outline', color: '#10B981' },
  { name: 'Salmon', count: 10, avgCalories: 208, icon: 'fish-outline', color: '#4285F4' },
];
const TOP_FOODS_LAST30: TopFood[] = [
  { name: 'Pechuga de pollo', count: 20, avgCalories: 165, icon: 'restaurant-outline', color: '#EA4335' },
  { name: 'Huevos', count: 17, avgCalories: 155, icon: 'egg-outline', color: '#F59E0B' },
  { name: 'Arroz integral', count: 15, avgCalories: 215, icon: 'leaf-outline', color: '#FBBC04' },
  { name: 'Salmon', count: 12, avgCalories: 208, icon: 'fish-outline', color: '#4285F4' },
  { name: 'Espinaca', count: 11, avgCalories: 23, icon: 'leaf-outline', color: '#10B981' },
];

// ─── Calorie bar chart (SVG) ───────────────────────────────────────────────────

function CalorieBarChart({
  data,
  target,
  width,
  c,
}: {
  data: DayEntry[];
  target: number;
  width: number;
  c: ReturnType<typeof useThemeColors>;
}) {
  const chartHeight = 180;
  const barPadding = 8;
  const labelHeight = 24;
  const topPadding = 20;
  const maxVal = Math.max(...data.map((d) => d.calories), target) * 1.15;
  const barWidth = (width - barPadding * (data.length + 1)) / data.length;
  const targetY = topPadding + chartHeight - (target / maxVal) * chartHeight;

  return (
    <Svg width={width} height={chartHeight + labelHeight + topPadding}>
      <Defs>
        <LinearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={c.primary} stopOpacity="1" />
          <Stop offset="1" stopColor={c.primary} stopOpacity="0.6" />
        </LinearGradient>
        <LinearGradient id="barGradOver" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={c.accent} stopOpacity="1" />
          <Stop offset="1" stopColor={c.accent} stopOpacity="0.6" />
        </LinearGradient>
      </Defs>

      {/* Target dashed line */}
      <Line
        x1={0}
        y1={targetY}
        x2={width}
        y2={targetY}
        stroke={c.accent}
        strokeWidth={1.5}
        strokeDasharray="6,4"
      />
      <SvgText
        x={width - 4}
        y={targetY - 5}
        fontSize={10}
        fontWeight="600"
        fill={c.accent}
        textAnchor="end"
      >
        Meta {target}
      </SvgText>

      {/* Bars */}
      {data.map((d, i) => {
        const barH = (d.calories / maxVal) * chartHeight;
        const x = barPadding + i * (barWidth + barPadding);
        const y = topPadding + chartHeight - barH;
        const overTarget = d.calories > target;

        return (
          <G key={d.day}>
            {/* Track */}
            <Rect
              x={x}
              y={topPadding}
              width={barWidth}
              height={chartHeight}
              rx={6}
              fill={c.surface}
            />
            {/* Filled bar */}
            <Rect
              x={x}
              y={y}
              width={barWidth}
              height={barH}
              rx={6}
              fill={overTarget ? 'url(#barGradOver)' : 'url(#barGrad)'}
            />
            {/* Value */}
            <SvgText
              x={x + barWidth / 2}
              y={y - 4}
              fontSize={9}
              fontWeight="600"
              fill={c.gray}
              textAnchor="middle"
            >
              {d.calories}
            </SvgText>
            {/* Day label */}
            <SvgText
              x={x + barWidth / 2}
              y={topPadding + chartHeight + 16}
              fontSize={11}
              fontWeight="600"
              fill={c.gray}
              textAnchor="middle"
            >
              {d.day}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

// ─── Macro donut chart (SVG) ──────────────────────────────────────────────────

function MacroDonutChart({
  protein,
  carbs,
  fat,
  size = 130,
  c,
}: {
  protein: number;
  carbs: number;
  fat: number;
  size?: number;
  c: ReturnType<typeof useThemeColors>;
}) {
  const total = protein + carbs + fat;
  if (total === 0) return null;

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 6;
  const innerR = r * 0.58;

  const slices = [
    { value: protein, color: c.protein, label: 'Proteina', grams: protein },
    { value: carbs, color: c.carbs, label: 'Carbos', grams: carbs },
    { value: fat, color: c.fats, label: 'Grasas', grams: fat },
  ];

  let cumAngle = -90;
  const paths = slices.map((slice) => {
    const angle = (slice.value / total) * 360;
    const startAngle = cumAngle;
    const endAngle = cumAngle + angle;
    cumAngle = endAngle;

    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);
    const largeArc = angle > 180 ? 1 : 0;

    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    return { ...slice, d, pct: Math.round((slice.value / total) * 100) };
  });

  return (
    <View style={donutStyles.container}>
      <View style={donutStyles.svgWrap}>
        <Svg width={size} height={size}>
          {paths.map((p) => (
            <Path key={p.label} d={p.d} fill={p.color} />
          ))}
          <Circle cx={cx} cy={cy} r={innerR} fill={c.surface} />
        </Svg>
        <View style={donutStyles.centerLabel}>
          <Text style={[donutStyles.centerPct, { color: c.black }]}>{total}g</Text>
          <Text style={[donutStyles.centerSub, { color: c.gray }]}>total</Text>
        </View>
      </View>
      <View style={donutStyles.legend}>
        {paths.map((p) => (
          <View key={p.label} style={donutStyles.legendRow}>
            <View style={[donutStyles.legendDot, { backgroundColor: p.color }]} />
            <Text style={[donutStyles.legendLabel, { color: c.gray }]}>{p.label}</Text>
            <Text style={[donutStyles.legendGrams, { color: c.black }]}>{p.grams}g</Text>
            <Text style={[donutStyles.legendPct, { color: c.gray }]}>{p.pct}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const donutStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  svgWrap: { alignItems: 'center', justifyContent: 'center' },
  centerLabel: {
    position: 'absolute',
    alignItems: 'center',
  },
  centerPct: { fontSize: 15, fontWeight: '800' },
  centerSub: { fontSize: 10, fontWeight: '400' },
  legend: { flex: 1, gap: spacing.sm },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendLabel: { ...typography.caption, flex: 1 },
  legendGrams: { ...typography.caption, fontWeight: '700', marginRight: 2 },
  legendPct: { ...typography.caption, width: 32, textAlign: 'right' },
});

// ─── Adherence ring (SVG) ─────────────────────────────────────────────────────

function AdherenceRing({
  pct,
  size = 72,
  color,
  c,
}: {
  pct: number;
  size?: number;
  color: string;
  c: ReturnType<typeof useThemeColors>;
}) {
  const strokeWidth = 7;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const progress = Math.min(1, Math.max(0, pct / 100));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={c.grayLight}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${progress * circumference} ${circumference}`}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <Text style={{ fontSize: 15, fontWeight: '800', color: c.black }}>{pct}%</Text>
    </View>
  );
}

// ─── Average calories hero card ───────────────────────────────────────────────

function AvgCaloriesCard({
  avgCalories,
  target,
  adherence,
  adherenceColor,
  c,
}: {
  avgCalories: number;
  target: number;
  adherence: number;
  adherenceColor: string;
  c: ReturnType<typeof useThemeColors>;
}) {
  const diff = avgCalories - target;
  const diffAbs = Math.abs(diff);
  const isOver = diff > 0;

  return (
    <View style={[avgStyles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={avgStyles.left}>
        <Text style={[avgStyles.label, { color: c.gray }]}>Promedio diario</Text>
        <Text style={[avgStyles.value, { color: c.black }]}>
          {avgCalories}
          <Text style={[avgStyles.unit, { color: c.gray }]}> kcal</Text>
        </Text>
        <View style={[avgStyles.diffBadge, { backgroundColor: isOver ? '#FEE2E2' : '#D1FAE5' }]}>
          <Ionicons
            name={isOver ? 'arrow-up' : 'arrow-down'}
            size={11}
            color={isOver ? '#DC2626' : '#059669'}
          />
          <Text style={[avgStyles.diffText, { color: isOver ? '#DC2626' : '#059669' }]}>
            {diffAbs} kcal {isOver ? 'sobre' : 'bajo'} meta
          </Text>
        </View>
      </View>
      <AdherenceRing pct={adherence} color={adherenceColor} c={c} />
    </View>
  );
}

const avgStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  left: { gap: 4 },
  label: { ...typography.caption, textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontSize: 32, fontWeight: '800', letterSpacing: -1 },
  unit: { fontSize: 14, fontWeight: '400' },
  diffBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
  },
  diffText: { fontSize: 11, fontWeight: '700' },
});

// ─── Goal vs actual comparison bars ──────────────────────────────────────────

interface ComparisonItem {
  label: string;
  actual: number;
  target: number;
  unit: string;
  color: string;
}

function GoalComparisonRow({
  item,
  c,
}: {
  item: ComparisonItem;
  c: ReturnType<typeof useThemeColors>;
}) {
  const pct = Math.min(1, item.actual / item.target);
  const isOnTarget = item.actual >= item.target * 0.85;

  return (
    <View style={cmpStyles.row}>
      <View style={cmpStyles.header}>
        <Text style={[cmpStyles.label, { color: c.black }]}>{item.label}</Text>
        <Text style={[cmpStyles.values, { color: c.gray }]}>
          <Text style={{ color: isOnTarget ? '#10B981' : c.accent, fontWeight: '700' }}>
            {item.actual}{item.unit}
          </Text>
          {' / '}{item.target}{item.unit}
        </Text>
      </View>
      <View style={[cmpStyles.track, { backgroundColor: c.grayLight }]}>
        <View
          style={[
            cmpStyles.fill,
            {
              width: `${Math.round(pct * 100)}%`,
              backgroundColor: pct >= 1 ? '#10B981' : item.color,
            },
          ]}
        />
      </View>
      <Text style={[cmpStyles.pctLabel, { color: isOnTarget ? '#10B981' : c.gray }]}>
        {Math.round(pct * 100)}% de la meta
      </Text>
    </View>
  );
}

const cmpStyles = StyleSheet.create({
  row: { gap: 4, marginBottom: spacing.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { ...typography.label },
  values: { ...typography.caption },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  pctLabel: { ...typography.caption, fontWeight: '600', textAlign: 'right' },
});

// ─── Top foods list ───────────────────────────────────────────────────────────

function TopFoodsList({
  foods,
  c,
}: {
  foods: TopFood[];
  c: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View style={{ gap: spacing.xs }}>
      {foods.map((food, i) => (
        <View
          key={food.name}
          style={[foodStyles.row, { borderBottomColor: c.grayLight, borderBottomWidth: i < foods.length - 1 ? 1 : 0 }]}
        >
          <View style={foodStyles.rank}>
            <Text style={[foodStyles.rankNum, { color: c.gray }]}>{i + 1}</Text>
          </View>
          <View style={[foodStyles.iconWrap, { backgroundColor: food.color + '18' }]}>
            <Ionicons name={food.icon as any} size={16} color={food.color} />
          </View>
          <View style={foodStyles.info}>
            <Text style={[foodStyles.name, { color: c.black }]}>{food.name}</Text>
            <Text style={[foodStyles.sub, { color: c.gray }]}>{food.count} veces registrado</Text>
          </View>
          <Text style={[foodStyles.cal, { color: c.gray }]}>{food.avgCalories} kcal</Text>
        </View>
      ))}
    </View>
  );
}

const foodStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  rank: { width: 18, alignItems: 'center' },
  rankNum: { ...typography.caption, fontWeight: '700' },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, gap: 1 },
  name: { ...typography.label },
  sub: { ...typography.caption },
  cal: { ...typography.caption, fontWeight: '600' },
});

// ─── Summary mini-cards ───────────────────────────────────────────────────────

function SummaryCard({
  icon,
  label,
  value,
  unit,
  color,
  c,
}: {
  icon: string;
  label: string;
  value: number;
  unit: string;
  color: string;
  c: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View
      style={[smStyles.card, { backgroundColor: c.surface, borderColor: c.border }]}
      accessibilityLabel={`${label}: ${value} ${unit}`}
    >
      <View style={[smStyles.iconWrap, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon as any} size={18} color={color} />
      </View>
      <Text style={[smStyles.value, { color: c.black }]}>
        {value}
        <Text style={[smStyles.unit, { color: c.gray }]}>{unit}</Text>
      </Text>
      <Text style={[smStyles.label, { color: c.gray }]}>{label}</Text>
    </View>
  );
}

const smStyles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    alignItems: 'center',
    gap: 4,
    ...shadows.sm,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  value: { fontSize: 20, fontWeight: '800' },
  unit: { fontSize: 12, fontWeight: '400' },
  label: { ...typography.caption, textAlign: 'center' },
});

// ─── Best day card ────────────────────────────────────────────────────────────

function BestDayCard({
  bestDay,
  c,
}: {
  bestDay: BestDay;
  c: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View
      style={[bdStyles.card, { backgroundColor: c.surface, borderColor: c.border }]}
      accessibilityLabel={`Mejor dia: ${bestDay.day}, ${bestDay.metric}, ${bestDay.delta}`}
    >
      <View style={bdStyles.left}>
        <View style={bdStyles.trophyWrap}>
          <Ionicons name="trophy" size={24} color="#F59E0B" />
        </View>
        <View style={bdStyles.info}>
          <Text style={[bdStyles.label, { color: c.gray }]}>Mejor Dia</Text>
          <Text style={[bdStyles.day, { color: c.black }]}>{bestDay.day}</Text>
          <Text style={[bdStyles.metric, { color: c.black }]}>{bestDay.metric}</Text>
        </View>
      </View>
      <View style={bdStyles.badge}>
        <Ionicons name="arrow-up" size={12} color="#10B981" />
        <Text style={bdStyles.badgeText}>{bestDay.delta}</Text>
      </View>
    </View>
  );
}

const bdStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  trophyWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { gap: 1 },
  label: { ...typography.caption, textTransform: 'uppercase', letterSpacing: 0.5 },
  day: { ...typography.label, fontSize: 16 },
  metric: { ...typography.caption, fontWeight: '600' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#10B981' },
});

// ─── Period toggle ────────────────────────────────────────────────────────────

const PERIODS: { key: Period; label: string }[] = [
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mes' },
  { key: 'last30', label: '30 Dias' },
];

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ReportsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { innerWidth, sidePadding } = useLayout();
  const c = useThemeColors();
  const { isPremium, showPaywall } = usePremium();
  const [period, setPeriod] = useState<Period>('week');

  const data = useMemo(() => {
    switch (period) {
      case 'week': return WEEKLY_DATA;
      case 'month': return MONTHLY_DATA;
      case 'last30': return LAST30_DATA;
    }
  }, [period]);

  const summary = useMemo(() => {
    switch (period) {
      case 'week': return WEEKLY_SUMMARY;
      case 'month': return MONTHLY_SUMMARY;
      case 'last30': return LAST30_SUMMARY;
    }
  }, [period]);

  const macros = useMemo(() => {
    switch (period) {
      case 'week': return WEEKLY_MACROS;
      case 'month': return MONTHLY_MACROS;
      case 'last30': return LAST30_MACROS;
    }
  }, [period]);

  const insights = useMemo(() => {
    switch (period) {
      case 'week': return WEEKLY_INSIGHTS;
      case 'month': return MONTHLY_INSIGHTS;
      case 'last30': return LAST30_INSIGHTS;
    }
  }, [period]);

  const bestDay = useMemo(() => {
    switch (period) {
      case 'week': return WEEKLY_BEST_DAY;
      case 'month': return MONTHLY_BEST_DAY;
      case 'last30': return LAST30_BEST_DAY;
    }
  }, [period]);

  const topFoods = useMemo(() => {
    switch (period) {
      case 'week': return TOP_FOODS_WEEKLY;
      case 'month': return TOP_FOODS_MONTHLY;
      case 'last30': return TOP_FOODS_LAST30;
    }
  }, [period]);

  const adherenceColor =
    summary.adherence >= 80 ? '#10B981' : summary.adherence >= 60 ? '#F59E0B' : c.accent;

  const comparisonItems: ComparisonItem[] = [
    { label: 'Calorias', actual: summary.avgCalories, target: CALORIE_TARGET, unit: ' kcal', color: c.accent },
    { label: 'Proteina', actual: summary.avgProtein, target: summary.proteinTarget, unit: 'g', color: c.protein },
    { label: 'Carbohidratos', actual: summary.avgCarbs, target: summary.carbsTarget, unit: 'g', color: c.carbs },
    { label: 'Grasas', actual: summary.avgFats, target: summary.fatsTarget, unit: 'g', color: c.fats },
  ];

  const periodLabel = period === 'week' ? 'esta semana' : period === 'month' ? 'este mes' : 'ultimos 30 dias';

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: sidePadding }]}>
        <TouchableOpacity
          onPress={() => { haptics.light(); navigation.goBack(); }}
          style={[styles.backBtn, { backgroundColor: c.surface }]}
          accessibilityLabel="Volver"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={20} color={c.black} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.black }]} accessibilityRole="header">
          Reportes
        </Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        bounces
        overScrollMode="never"
        contentContainerStyle={[styles.scroll, { paddingHorizontal: sidePadding }]}
      >
        {/* Period toggle — three options */}
        <View style={[styles.toggleRow, { backgroundColor: c.surface }]}>
          {PERIODS.map(({ key, label }) => {
            const active = period === key;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.toggleBtn, active && { backgroundColor: c.primary }]}
                onPress={() => { haptics.light(); setPeriod(key); }}
                accessibilityLabel={`Ver reporte ${label}`}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.toggleText, { color: active ? c.white : c.gray }]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Average calories hero + adherence ring (visible to all users as teaser) */}
        <AvgCaloriesCard
          avgCalories={summary.avgCalories}
          target={CALORIE_TARGET}
          adherence={summary.adherence}
          adherenceColor={adherenceColor}
          c={c}
        />

        {/* Premium gate: free users see the avg card above, then a blurred preview */}
        {!isPremium ? (
          <PremiumGate
            title="Desbloquea reportes detallados"
            subtitle="Analisis semanal y mensual de calorias, macros, insights con IA y mas."
            onUpgrade={showPaywall}
            showFeatures
            showPreview
          >
            {/* Blurred preview content for free users */}
            <View>
              <View style={styles.summaryRow}>
                <SummaryCard icon="fish-outline" label="Prot. promedio" value={summary.avgProtein} unit="g" color={c.protein} c={c} />
                <SummaryCard icon="leaf-outline" label="Carbos prom." value={summary.avgCarbs} unit="g" color={c.carbs} c={c} />
                <SummaryCard icon="water-outline" label="Grasas prom." value={summary.avgFats} unit="g" color={c.fats} c={c} />
              </View>
              <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
                <Text style={[styles.sectionTitle, { color: c.black }]}>Calorias {periodLabel}</Text>
                <CalorieBarChart data={data} target={CALORIE_TARGET} width={innerWidth - spacing.md * 2} c={c} />
              </View>
            </View>
          </PremiumGate>
        ) : (
          <>
            {/* Macro mini-cards */}
            <View style={styles.summaryRow}>
              <SummaryCard
                icon="fish-outline"
                label="Prot. promedio"
                value={summary.avgProtein}
                unit="g"
                color={c.protein}
                c={c}
              />
              <SummaryCard
                icon="leaf-outline"
                label="Carbos prom."
                value={summary.avgCarbs}
                unit="g"
                color={c.carbs}
                c={c}
              />
              <SummaryCard
                icon="water-outline"
                label="Grasas prom."
                value={summary.avgFats}
                unit="g"
                color={c.fats}
                c={c}
              />
            </View>

            {/* Calorie bar chart */}
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text style={[styles.sectionTitle, { color: c.black }]}>
                Calorias {periodLabel}
              </Text>
              <CalorieBarChart
                data={data}
                target={CALORIE_TARGET}
                width={innerWidth - spacing.md * 2}
                c={c}
              />
            </View>

            {/* Goal vs actual comparison */}
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text style={[styles.sectionTitle, { color: c.black }]}>Meta vs real</Text>
              {comparisonItems.map((item) => (
                <GoalComparisonRow key={item.label} item={item} c={c} />
              ))}
            </View>

            {/* Macro donut chart */}
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text style={[styles.sectionTitle, { color: c.black }]}>Distribucion de macros</Text>
              <MacroDonutChart
                protein={macros.protein}
                carbs={macros.carbs}
                fat={macros.fat}
                c={c}
              />
            </View>

            {/* Top foods */}
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text style={[styles.sectionTitle, { color: c.black }]}>Alimentos mas frecuentes</Text>
              <TopFoodsList foods={topFoods} c={c} />
            </View>

            {/* Best day */}
            <BestDayCard bestDay={bestDay} c={c} />

            {/* Insights */}
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text style={[styles.sectionTitle, { color: c.black }]}>Insights</Text>
              {insights.map((insight, i) => (
                <View
                  key={i}
                  style={[
                    styles.insightRow,
                    {
                      borderBottomColor: c.grayLight,
                      borderBottomWidth: i < insights.length - 1 ? 1 : 0,
                    },
                  ]}
                >
                  <View style={[styles.insightIcon, { backgroundColor: c.accent + '18' }]}>
                    <Ionicons name={insight.icon as any} size={18} color={c.accent} />
                  </View>
                  <Text style={[styles.insightText, { color: c.gray }]}>{insight.text}</Text>
                </View>
              ))}
            </View>

            {/* Share summary */}
            <TouchableOpacity
              style={styles.shareBtn}
              activeOpacity={0.8}
              onPress={() => {
                haptics.light();
                shareWeeklySummary({
                  avgCalories: summary.avgCalories,
                  avgProtein: summary.avgProtein,
                  adherence: summary.adherence,
                }).catch(() => {});
              }}
              accessibilityLabel="Compartir resumen"
              accessibilityRole="button"
            >
              <Ionicons name="share-outline" size={18} color="#FFFFFF" />
              <Text style={styles.shareBtnText}>Compartir resumen</Text>
            </TouchableOpacity>
          </>
        )}

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { ...typography.titleSm },
  scroll: { paddingTop: spacing.sm, paddingBottom: spacing.xl },
  toggleRow: {
    flexDirection: 'row',
    borderRadius: radius.full,
    padding: 3,
    marginBottom: spacing.md,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
    alignItems: 'center',
  },
  toggleText: { ...typography.label },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  sectionTitle: {
    ...typography.label,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  insightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  insightIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  insightText: { ...typography.caption, flex: 1, lineHeight: 18 },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: '#1A73E8',
    paddingVertical: spacing.sm + 4,
    borderRadius: radius.full,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  shareBtnText: { ...typography.button, color: '#FFFFFF' },
});
