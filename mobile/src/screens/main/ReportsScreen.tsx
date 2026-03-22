/**
 * ReportsScreen — Weekly/Monthly reports with insights
 * Bar chart (calories per day), goal line, summary cards,
 * AI-generated insights, and macro pie chart.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Rect, Line, Circle, Path, G, Text as SvgText } from 'react-native-svg';
import { typography, spacing, radius, shadows, useLayout, useThemeColors } from '../../theme';
import { haptics } from '../../hooks/useHaptics';
import FitsiMascot from '../../components/FitsiMascot';
import { shareWeeklySummary } from '../../components/ShareableCard';

// ─── Mock data ───────────────────────────────────────────────────────────────

const WEEKLY_DATA = [
  { day: 'Lun', calories: 1850 },
  { day: 'Mar', calories: 1420 },
  { day: 'Mie', calories: 2100 },
  { day: 'Jue', calories: 1980 },
  { day: 'Vie', calories: 2250 },
  { day: 'Sab', calories: 1760 },
  { day: 'Dom', calories: 1900 },
];

const MONTHLY_DATA = [
  { day: 'S1', calories: 1900 },
  { day: 'S2', calories: 1780 },
  { day: 'S3', calories: 2050 },
  { day: 'S4', calories: 1850 },
];

const CALORIE_TARGET = 2000;

const WEEKLY_SUMMARY = {
  avgCalories: 1894,
  avgProtein: 85,
  adherence: 71,
  proteinTarget: 120,
};

const MONTHLY_SUMMARY = {
  avgCalories: 1895,
  avgProtein: 90,
  adherence: 68,
  proteinTarget: 120,
};

const WEEKLY_MACROS = { protein: 85, carbs: 210, fat: 62 };
const MONTHLY_MACROS = { protein: 90, carbs: 220, fat: 58 };

const WEEKLY_BEST_DAY = { day: 'Viernes', metric: '125g proteinas', delta: '+5g sobre la meta' };
const MONTHLY_BEST_DAY = { day: 'Semana 3', metric: '132g proteinas', delta: '+12g sobre la meta' };

const WEEKLY_INSIGHTS = [
  { icon: 'trending-down-outline' as const, text: 'Tu proteina promedio es 85g, debajo de tu meta de 120g. Intenta agregar una porcion extra de proteina al almuerzo.' },
  { icon: 'flame-outline' as const, text: 'Llevas 5 dias seguidos logueando, sigue asi!' },
  { icon: 'calendar-outline' as const, text: 'Los martes es cuando menos registras comidas. Pon una alarma para no olvidar.' },
];

const MONTHLY_INSIGHTS = [
  { icon: 'trending-up-outline' as const, text: 'Tu adherencia mejoro 8% respecto al mes anterior.' },
  { icon: 'nutrition-outline' as const, text: 'Tu consumo de grasas esta dentro del rango ideal de forma consistente.' },
  { icon: 'alert-circle-outline' as const, text: 'Las semanas 2 y 4 tuvieron menor registro. Intenta mantener la consistencia.' },
];

// ─── Bar chart (SVG) ─────────────────────────────────────────────────────────

function CalorieBarChart({
  data,
  target,
  width,
  c,
}: {
  data: { day: string; calories: number }[];
  target: number;
  width: number;
  c: ReturnType<typeof useThemeColors>;
}) {
  const chartHeight = 180;
  const barPadding = 8;
  const labelHeight = 24;
  const topPadding = 16;
  const maxVal = Math.max(...data.map((d) => d.calories), target) * 1.15;
  const barWidth = (width - barPadding * (data.length + 1)) / data.length;
  const targetY = topPadding + chartHeight - (target / maxVal) * chartHeight;

  return (
    <Svg width={width} height={chartHeight + labelHeight + topPadding}>
      {/* Target line */}
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
        Meta
      </SvgText>

      {/* Bars */}
      {data.map((d, i) => {
        const barH = (d.calories / maxVal) * chartHeight;
        const x = barPadding + i * (barWidth + barPadding);
        const y = topPadding + chartHeight - barH;
        const overTarget = d.calories > target;

        return (
          <G key={d.day}>
            {/* Bar background track */}
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
              fill={overTarget ? c.accent : c.primary}
            />
            {/* Value label */}
            <SvgText
              x={x + barWidth / 2}
              y={y - 4}
              fontSize={10}
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

// ─── Macro pie chart (SVG) ───────────────────────────────────────────────────

function MacroPieChart({
  protein,
  carbs,
  fat,
  size = 120,
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
  const r = size / 2 - 4;

  const slices = [
    { value: protein, color: c.protein, label: 'Proteina' },
    { value: carbs, color: c.carbs, label: 'Carbos' },
    { value: fat, color: c.fats, label: 'Grasas' },
  ];

  let cumAngle = -90; // start from top

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
    <View style={pieStyles.container}>
      <Svg width={size} height={size}>
        {paths.map((p) => (
          <Path key={p.label} d={p.d} fill={p.color} />
        ))}
        {/* Center hole for donut effect */}
        <Circle cx={cx} cy={cy} r={r * 0.55} fill={c.surface} />
      </Svg>
      <View style={pieStyles.legend}>
        {paths.map((p) => (
          <View key={p.label} style={pieStyles.legendRow}>
            <View style={[pieStyles.legendDot, { backgroundColor: p.color }]} />
            <Text style={[pieStyles.legendLabel, { color: c.gray }]}>{p.label}</Text>
            <Text style={[pieStyles.legendPct, { color: c.black }]}>{p.pct}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const pieStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  legend: { flex: 1, gap: spacing.sm },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { ...typography.caption, flex: 1 },
  legendPct: { ...typography.label },
});

// ─── Summary card ────────────────────────────────────────────────────────────

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
    <View style={[summaryStyles.card, { backgroundColor: c.surface, borderColor: c.border }]} accessibilityLabel={`${label}: ${value} ${unit}`}>
      <View style={[summaryStyles.iconWrap, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon as any} size={18} color={color} />
      </View>
      <Text style={[summaryStyles.value, { color: c.black }]}>
        {value}<Text style={[summaryStyles.unit, { color: c.gray }]}>{unit}</Text>
      </Text>
      <Text style={[summaryStyles.label, { color: c.gray }]}>{label}</Text>
    </View>
  );
}

const summaryStyles = StyleSheet.create({
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
  value: {
    fontSize: 20,
    fontWeight: '800',
  },
  unit: {
    fontSize: 12,
    fontWeight: '400',
  },
  label: {
    ...typography.caption,
    textAlign: 'center',
  },
});

// ─── Best day card ──────────────────────────────────────────────────────────

function BestDayCard({
  bestDay,
  c,
}: {
  bestDay: { day: string; metric: string; delta: string };
  c: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View
      style={[bestDayStyles.card, { backgroundColor: c.surface, borderColor: c.border }]}
      accessibilityLabel={`Mejor dia: ${bestDay.day}, ${bestDay.metric}, ${bestDay.delta}`}
    >
      <View style={bestDayStyles.left}>
        <View style={bestDayStyles.trophyWrap}>
          <Ionicons name="trophy" size={24} color="#F59E0B" />
        </View>
        <View style={bestDayStyles.info}>
          <Text style={[bestDayStyles.label, { color: c.gray }]}>Mejor Dia</Text>
          <Text style={[bestDayStyles.day, { color: c.black }]}>{bestDay.day}</Text>
          <Text style={[bestDayStyles.metric, { color: c.black }]}>{bestDay.metric}</Text>
        </View>
      </View>
      <View style={bestDayStyles.badge}>
        <Ionicons name="arrow-up" size={12} color="#10B981" />
        <Text style={bestDayStyles.badgeText}>{bestDay.delta}</Text>
      </View>
    </View>
  );
}

const bestDayStyles = StyleSheet.create({
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
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  trophyWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    gap: 1,
  },
  label: {
    ...typography.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  day: {
    ...typography.label,
    fontSize: 16,
  },
  metric: {
    ...typography.caption,
    fontWeight: '600',
  },
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
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#10B981',
  },
});

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function ReportsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { innerWidth, sidePadding } = useLayout();
  const c = useThemeColors();
  const [period, setPeriod] = useState<'week' | 'month'>('week');

  const isWeek = period === 'week';
  const data = isWeek ? WEEKLY_DATA : MONTHLY_DATA;
  const summary = isWeek ? WEEKLY_SUMMARY : MONTHLY_SUMMARY;
  const macros = isWeek ? WEEKLY_MACROS : MONTHLY_MACROS;
  const insights = isWeek ? WEEKLY_INSIGHTS : MONTHLY_INSIGHTS;
  const bestDay = isWeek ? WEEKLY_BEST_DAY : MONTHLY_BEST_DAY;

  const adherenceColor =
    summary.adherence >= 80 ? '#10B981' : summary.adherence >= 60 ? '#F59E0B' : c.accent;

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: sidePadding }]}>
        <TouchableOpacity
          onPress={() => {
            haptics.light();
            navigation.goBack();
          }}
          style={[styles.backBtn, { backgroundColor: c.surface }]}
          accessibilityLabel="Volver"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={20} color={c.black} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.black }]} accessibilityRole="header">Reportes</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        bounces={true}
        overScrollMode="never"
        contentContainerStyle={[styles.scroll, { paddingHorizontal: sidePadding }]}
      >
        {/* Period toggle */}
        <View style={[styles.toggleRow, { backgroundColor: c.surface }]}>
          <TouchableOpacity
            style={[styles.toggleBtn, isWeek && { backgroundColor: c.primary }]}
            onPress={() => {
              haptics.light();
              setPeriod('week');
            }}
            accessibilityLabel="Reporte semanal"
            accessibilityRole="button"
            accessibilityState={{ selected: isWeek }}
          >
            <Text style={[styles.toggleText, { color: isWeek ? c.white : c.gray }]}>Semanal</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, !isWeek && { backgroundColor: c.primary }]}
            onPress={() => {
              haptics.light();
              setPeriod('month');
            }}
            accessibilityLabel="Reporte mensual"
            accessibilityRole="button"
            accessibilityState={{ selected: !isWeek }}
          >
            <Text style={[styles.toggleText, { color: !isWeek ? c.white : c.gray }]}>Mensual</Text>
          </TouchableOpacity>
        </View>

        {/* Fitsi celebrate when adherence is high */}
        <View style={{ alignItems: 'center', marginBottom: spacing.md }}>
          <FitsiMascot
            expression={summary.adherence >= 80 ? 'fire' : summary.adherence < 50 ? 'sad' : 'neutral'}
            size="small"
            animation={summary.adherence >= 80 ? 'celebrate' : 'idle'}
            message={summary.adherence >= 80 ? 'On fire!' : summary.adherence < 50 ? 'Podemos mejorar!' : undefined}
          />
        </View>

        {/* Bar chart */}
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={[styles.sectionTitle, { color: c.black }]}>
            Calorias {isWeek ? 'esta semana' : 'este mes'}
          </Text>
          <CalorieBarChart data={data} target={CALORIE_TARGET} width={innerWidth - spacing.md * 2} c={c} />
        </View>

        {/* Summary cards */}
        <View style={styles.summaryRow}>
          <SummaryCard
            icon="flame-outline"
            label="Cal. promedio"
            value={summary.avgCalories}
            unit=" kcal"
            color={c.accent}
            c={c}
          />
          <SummaryCard
            icon="fish-outline"
            label="Prot. promedio"
            value={summary.avgProtein}
            unit="g"
            color={c.protein}
            c={c}
          />
          <SummaryCard
            icon="checkmark-circle-outline"
            label="Adherencia"
            value={summary.adherence}
            unit="%"
            color={adherenceColor}
            c={c}
          />
        </View>

        {/* Best Day */}
        <BestDayCard bestDay={bestDay} c={c} />

        {/* Macro pie chart */}
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={[styles.sectionTitle, { color: c.black }]}>Distribucion de macros</Text>
          <MacroPieChart protein={macros.protein} carbs={macros.carbs} fat={macros.fat} c={c} />
        </View>

        {/* Insights */}
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={[styles.sectionTitle, { color: c.black }]}>Insights</Text>
          {insights.map((insight, i) => (
            <View key={i} style={[styles.insightRow, { borderBottomColor: c.grayLight }]}>
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
          accessibilityLabel="Compartir resumen semanal"
          accessibilityRole="button"
        >
          <Ionicons name="share-outline" size={18} color="#FFFFFF" />
          <Text style={styles.shareBtnText}>Compartir resumen</Text>
        </TouchableOpacity>

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
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
  headerTitle: {
    ...typography.titleSm,
  },
  scroll: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
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
  toggleText: {
    ...typography.label,
  },
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
    borderBottomWidth: 1,
  },
  insightIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  insightText: {
    ...typography.caption,
    flex: 1,
    lineHeight: 18,
  },
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
  shareBtnText: {
    ...typography.button,
    color: '#FFFFFF',
  },
});
