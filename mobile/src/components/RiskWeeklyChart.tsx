/**
 * RiskWeeklyChart — 7-day bar chart showing daily risk scores.
 *
 * X-axis: day labels (L, M, X, J, V, S, D)
 * Y-axis: 0-100 risk score
 * Each bar is colored by risk zone (green/yellow/orange/red/dark red).
 * Current day is highlighted with a larger dot.
 *
 * Props:
 *   data: { date: string; score: number }[] — 7 entries, most recent last.
 *   size?: { width: number; height: number }
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect, Circle, Line } from 'react-native-svg';
import { useThemeColors, typography, spacing, radius, shadows } from '../theme';

interface RiskWeeklyChartProps {
  data: { date: string; score: number }[];
  size?: { width: number; height: number };
}

const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function getBarColor(score: number): string {
  if (score < 20) return '#22C55E';
  if (score < 40) return '#EAB308';
  if (score < 60) return '#F97316';
  if (score < 80) return '#EF4444';
  return '#DC2626';
}

function getDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const dayIndex = d.getDay(); // 0=Sunday
  // Map: Sun=D, Mon=L, Tue=M, Wed=X, Thu=J, Fri=V, Sat=S
  const map = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
  return map[dayIndex] ?? '?';
}

function isToday(dateStr: string): boolean {
  const today = new Date().toISOString().split('T')[0];
  return dateStr === today;
}

const DEFAULT_SIZE = { width: 300, height: 160 };
const PADDING_TOP = 12;
const PADDING_BOTTOM = 28; // room for day labels
const PADDING_X = 16;
const BAR_RADIUS = 4;

const RiskWeeklyChart = React.memo(function RiskWeeklyChart({
  data,
  size = DEFAULT_SIZE,
}: RiskWeeklyChartProps) {
  const c = useThemeColors();

  if (data.length === 0) return null;

  const { width, height } = size;
  const chartHeight = height - PADDING_TOP - PADDING_BOTTOM;
  const chartWidth = width - PADDING_X * 2;
  const barCount = data.length;
  const barGap = 8;
  const barWidth = Math.max(12, (chartWidth - barGap * (barCount - 1)) / barCount);

  // Build bar data
  const bars = data.map((entry, i) => {
    const score = Math.max(0, Math.min(100, Math.round(entry.score)));
    const barH = (score / 100) * chartHeight;
    const x = PADDING_X + i * (barWidth + barGap);
    const y = PADDING_TOP + chartHeight - barH;
    const color = getBarColor(score);
    const label = getDayLabel(entry.date);
    const today = isToday(entry.date);
    return { x, y, barH, color, label, score, today };
  });

  // Horizontal guide lines at 25, 50, 75
  const guides = [25, 50, 75].map((val) => ({
    y: PADDING_TOP + chartHeight - (val / 100) * chartHeight,
    val,
  }));

  const accessLabel = data
    .map((d) => `${getDayLabel(d.date)}: ${Math.round(d.score)}`)
    .join(', ');

  return (
    <View
      style={[styles.container, { backgroundColor: c.surface, borderColor: c.grayLight }]}
      accessibilityLabel={`Evolucion semanal de riesgo: ${accessLabel}`}
      accessibilityRole="image"
    >
      <Text style={[styles.title, { color: c.black }]}>Evolucion semanal</Text>
      <Svg width={width} height={height}>
        {/* Guide lines */}
        {guides.map((g) => (
          <Line
            key={`guide-${g.val}`}
            x1={PADDING_X}
            y1={g.y}
            x2={width - PADDING_X}
            y2={g.y}
            stroke={c.grayLight}
            strokeWidth={0.5}
            strokeDasharray="4,4"
          />
        ))}

        {/* Bars */}
        {bars.map((bar, i) => (
          <React.Fragment key={`bar-${i}`}>
            <Rect
              x={bar.x}
              y={bar.y}
              width={barWidth}
              height={Math.max(bar.barH, 2)}
              rx={BAR_RADIUS}
              ry={BAR_RADIUS}
              fill={bar.color}
              opacity={bar.today ? 1 : 0.7}
            />
            {/* Current day highlight dot */}
            {bar.today && (
              <Circle
                cx={bar.x + barWidth / 2}
                cy={bar.y - 6}
                r={4}
                fill={bar.color}
              />
            )}
          </React.Fragment>
        ))}
      </Svg>

      {/* Day labels below chart */}
      <View style={[styles.labelsRow, { paddingHorizontal: PADDING_X }]}>
        {bars.map((bar, i) => (
          <Text
            key={`label-${i}`}
            style={[
              styles.dayLabel,
              { color: bar.today ? c.black : c.gray, width: barWidth + barGap },
              bar.today && styles.dayLabelToday,
            ]}
          >
            {bar.label}
          </Text>
        ))}
      </View>
    </View>
  );
});

export default RiskWeeklyChart;

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  title: {
    ...typography.label,
    marginBottom: spacing.sm,
  },
  labelsRow: {
    flexDirection: 'row',
    marginTop: -PADDING_BOTTOM + 4,
  },
  dayLabel: {
    ...typography.caption,
    textAlign: 'center',
  },
  dayLabelToday: {
    fontWeight: '700',
  },
});
