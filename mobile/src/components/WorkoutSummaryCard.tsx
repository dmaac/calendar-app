/**
 * WorkoutSummaryCard — Weekly workout summary with mini bar chart.
 *
 * Features:
 * 1. Total minutes, total calories, number of workouts this week
 * 2. Most frequent exercise types
 * 3. SVG mini bar chart showing minutes per day of the week
 * 4. Full dark mode support via ThemeContext
 *
 * Integration: Import into ProgressScreen alongside other tracking components.
 */
import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  LayoutChangeEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, {
  Rect,
  Text as SvgText,
  Line,
} from 'react-native-svg';
import { useThemeColors, typography, spacing, radius, shadows } from '../theme';
import { useAppTheme } from '../context/ThemeContext';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WorkoutLogEntry {
  id: string;
  exerciseName: string;
  exerciseCategory: string;
  exerciseColor: string;
  exerciseIcon: string;
  duration: number;    // minutes
  calories: number;
  date: string;        // ISO date (YYYY-MM-DD)
}

interface WorkoutSummaryCardProps {
  /** Recent workout entries (the component filters to current week internally) */
  workouts: WorkoutLogEntry[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const DAY_LABELS = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];

/** Get Monday of the current week (ISO week starts Monday). */
function getWeekStart(): Date {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? 6 : day - 1; // days since Monday
  const monday = new Date(now);
  monday.setDate(now.getDate() - diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/** Parse an ISO date string into a Date at noon (avoids timezone issues). */
function parseDate(iso: string): Date {
  return new Date(iso + 'T12:00:00');
}

/** Get day-of-week index (0=Mon, 6=Sun) for an ISO date string. */
function getDayIndex(iso: string): number {
  const d = parseDate(iso);
  const day = d.getDay(); // 0=Sun, 1=Mon
  return day === 0 ? 6 : day - 1;
}

// ─── Mini Bar Chart ─────────────────────────────────────────────────────────

const CHART_H = 100;
const CHART_PAD_TOP = 8;
const CHART_PAD_BOTTOM = 20;
const CHART_PAD_X = 4;

const MiniBarChart = React.memo(function MiniBarChart({
  minutesPerDay,
  width,
  accentColor,
  textColor,
  gridColor,
}: {
  minutesPerDay: number[];
  width: number;
  accentColor: string;
  textColor: string;
  gridColor: string;
}) {
  const drawW = width - CHART_PAD_X * 2;
  const drawH = CHART_H - CHART_PAD_TOP - CHART_PAD_BOTTOM;
  const maxVal = Math.max(...minutesPerDay, 1); // at least 1 to avoid div-by-zero

  const barSlotW = drawW / 7;
  const barW = Math.min(barSlotW * 0.55, 28);

  return (
    <Svg width={width} height={CHART_H}>
      {/* Baseline */}
      <Line
        x1={CHART_PAD_X}
        y1={CHART_PAD_TOP + drawH}
        x2={width - CHART_PAD_X}
        y2={CHART_PAD_TOP + drawH}
        stroke={gridColor}
        strokeWidth={0.5}
      />

      {minutesPerDay.map((mins, i) => {
        const barH = maxVal > 0 ? (mins / maxVal) * drawH : 0;
        const x = CHART_PAD_X + i * barSlotW + (barSlotW - barW) / 2;
        const y = CHART_PAD_TOP + drawH - barH;
        const today = new Date().getDay();
        const todayIdx = today === 0 ? 6 : today - 1;
        const isToday = i === todayIdx;

        return (
          <React.Fragment key={i}>
            {/* Bar */}
            <Rect
              x={x}
              y={mins > 0 ? y : CHART_PAD_TOP + drawH - 2}
              width={barW}
              height={mins > 0 ? barH : 2}
              rx={3}
              fill={mins > 0 ? accentColor : gridColor}
              opacity={mins > 0 ? (isToday ? 1 : 0.7) : 0.3}
            />

            {/* Minutes label on top of bar (only if > 0) */}
            {mins > 0 && (
              <SvgText
                x={x + barW / 2}
                y={y - 4}
                fontSize={9}
                fill={textColor}
                textAnchor="middle"
                fontWeight="600"
              >
                {mins}
              </SvgText>
            )}

            {/* Day label */}
            <SvgText
              x={CHART_PAD_X + i * barSlotW + barSlotW / 2}
              y={CHART_H - 4}
              fontSize={10}
              fill={isToday ? accentColor : textColor}
              textAnchor="middle"
              fontWeight={isToday ? '700' : '400'}
            >
              {DAY_LABELS[i]}
            </SvgText>
          </React.Fragment>
        );
      })}
    </Svg>
  );
});

// ─── Stat Pill ──────────────────────────────────────────────────────────────

function StatPill({
  icon,
  value,
  label,
  color,
  bgColor,
  textColor,
}: {
  icon: string;
  value: string;
  label: string;
  color: string;
  bgColor: string;
  textColor: string;
}) {
  return (
    <View style={[styles.statPill, { backgroundColor: bgColor }]}>
      <Ionicons name={icon as any} size={16} color={color} />
      <Text style={[styles.statValue, { color: textColor }]}>{value}</Text>
      <Text style={[styles.statLabel, { color }]}>{label}</Text>
    </View>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function WorkoutSummaryCard({ workouts }: WorkoutSummaryCardProps) {
  const c = useThemeColors();
  const { isDark } = useAppTheme();
  const [cardWidth, setCardWidth] = useState(280);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width - spacing.md * 2; // subtract card padding
    if (w > 0) setCardWidth(w);
  }, []);

  const weekStart = useMemo(() => getWeekStart(), []);

  // Filter workouts to current week
  const weekWorkouts = useMemo(() => {
    const weekStartStr = weekStart.toISOString().slice(0, 10);
    return workouts.filter((w) => w.date >= weekStartStr);
  }, [workouts, weekStart]);

  // Aggregate stats
  const stats = useMemo(() => {
    const totalMinutes = weekWorkouts.reduce((sum, w) => sum + w.duration, 0);
    const totalCalories = weekWorkouts.reduce((sum, w) => sum + w.calories, 0);
    const totalWorkouts = weekWorkouts.length;

    // Minutes per day of week (Mon=0 ... Sun=6)
    const minutesPerDay = [0, 0, 0, 0, 0, 0, 0];
    for (const w of weekWorkouts) {
      const idx = getDayIndex(w.date);
      if (idx >= 0 && idx < 7) {
        minutesPerDay[idx] += w.duration;
      }
    }

    // Most frequent exercise categories
    const catCount: Record<string, { count: number; color: string; icon: string; name: string }> = {};
    for (const w of weekWorkouts) {
      const key = w.exerciseCategory;
      if (!catCount[key]) {
        catCount[key] = { count: 0, color: w.exerciseColor, icon: w.exerciseIcon, name: w.exerciseCategory };
      }
      catCount[key].count++;
    }
    const topCategories = Object.values(catCount)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    return { totalMinutes, totalCalories, totalWorkouts, minutesPerDay, topCategories };
  }, [weekWorkouts]);

  const accentColor = c.accent;
  const pillBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';

  return (
    <View
      style={[styles.card, { backgroundColor: c.surface, borderColor: c.grayLight }]}
      onLayout={handleLayout}
    >
      {/* Title row */}
      <View style={styles.titleRow}>
        <Ionicons name="fitness-outline" size={20} color={accentColor} />
        <Text style={[styles.title, { color: c.black }]}>Resumen Semanal</Text>
      </View>

      {/* Stat pills */}
      <View style={styles.statsRow}>
        <StatPill
          icon="barbell-outline"
          value={`${stats.totalWorkouts}`}
          label="sesiones"
          color={accentColor}
          bgColor={pillBg}
          textColor={c.black}
        />
        <StatPill
          icon="time-outline"
          value={`${stats.totalMinutes}`}
          label="min"
          color="#34A853"
          bgColor={pillBg}
          textColor={c.black}
        />
        <StatPill
          icon="flame-outline"
          value={`${stats.totalCalories}`}
          label="kcal"
          color="#EA4335"
          bgColor={pillBg}
          textColor={c.black}
        />
      </View>

      {/* Mini bar chart */}
      <View style={styles.chartContainer}>
        <MiniBarChart
          minutesPerDay={stats.minutesPerDay}
          width={cardWidth}
          accentColor={accentColor}
          textColor={c.gray}
          gridColor={c.grayLight}
        />
      </View>

      {/* Top exercises */}
      {stats.topCategories.length > 0 && (
        <View style={styles.topSection}>
          <Text style={[styles.topLabel, { color: c.gray }]}>MAS FRECUENTES</Text>
          <View style={styles.topRow}>
            {stats.topCategories.map((cat, i) => (
              <View
                key={i}
                style={[styles.topChip, { backgroundColor: cat.color + '18', borderColor: cat.color + '30' }]}
              >
                <Ionicons name={cat.icon as any} size={14} color={cat.color} />
                <Text style={[styles.topChipText, { color: cat.color }]}>
                  {cat.name} ({cat.count})
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Empty state */}
      {stats.totalWorkouts === 0 && (
        <View style={styles.emptyState}>
          <Ionicons name="barbell-outline" size={24} color={c.disabled} />
          <Text style={[styles.emptyText, { color: c.gray }]}>
            Sin workouts esta semana
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  title: {
    ...typography.titleSm,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    gap: 2,
  },
  statValue: {
    ...typography.label,
    fontSize: 16,
  },
  statLabel: {
    ...typography.caption,
  },

  // Chart
  chartContainer: {
    alignItems: 'center',
    marginBottom: spacing.sm,
  },

  // Top categories
  topSection: {
    marginTop: spacing.xs,
  },
  topLabel: {
    ...typography.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  topRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  topChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  topChipText: {
    ...typography.caption,
    fontWeight: '600',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  emptyText: {
    ...typography.caption,
    textAlign: 'center',
  },
});
