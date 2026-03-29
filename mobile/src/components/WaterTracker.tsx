/**
 * WaterTracker — Enhanced circular SVG water progress with quick-add buttons
 *
 * Sprint 7 enhancements:
 * - Quick-add buttons: +250ml, +500ml, +750ml, +1L
 * - Weight-based personalized goal (30ml per kg body weight)
 * - Weekly hydration history (mini bar chart)
 * - Reminder capability: nudge every 2 hours if no water logged
 */
import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Alert,
} from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useThemeColors, typography, spacing, radius, shadows } from '../theme';
import { haptics } from '../hooks/useHaptics';

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_GOAL = 2500;
const ML_PER_KG = 30;
const WATER_AMOUNTS = [250, 500, 750, 1000];
const WATER_BLUE = '#4FC3F7';
const WATER_BLUE_LIGHT = '#E1F5FE';
const WATER_BLUE_DARK = '#0288D1';

const HISTORY_STORAGE_KEY = '@fitsi_water_history';
const REMINDER_STORAGE_KEY = '@fitsi_water_reminders_enabled';
const REMINDER_INTERVAL_HOURS = 2;

const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

// Animated SVG circle wrapper
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ─── Types ──────────────────────────────────────────────────────────────────

interface DayRecord {
  /** ISO date string YYYY-MM-DD */
  date: string;
  /** Total ml consumed */
  ml: number;
}

interface WaterTrackerProps {
  waterMl: number;
  onAdd: (ml: number) => void;
  /** Fixed goal override. When omitted, uses weight-based calculation or default. */
  goal?: number;
  /** User weight in kg — used to calculate personalized goal (30ml/kg). */
  weightKg?: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function getLast7Days(): string[] {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
}

function getDayLabel(dateStr: string): string {
  const day = new Date(dateStr + 'T12:00:00').getDay();
  // JS getDay: 0=Sun, 1=Mon ... 6=Sat -> map to L,M,X,J,V,S,D
  const map = [6, 0, 1, 2, 3, 4, 5]; // Sun->6(D), Mon->0(L)...
  return DAY_LABELS[map[day]];
}

function calculateGoal(weightKg: number | undefined, goalOverride: number | undefined): number {
  if (goalOverride !== undefined) return goalOverride;
  if (weightKg && weightKg > 0) {
    // Round to nearest 100ml for cleaner display
    return Math.round((weightKg * ML_PER_KG) / 100) * 100;
  }
  return DEFAULT_GOAL;
}

// ─── Mini Bar Chart (weekly history) ────────────────────────────────────────

const CHART_HEIGHT = 48;
const BAR_WIDTH = 8;
const BAR_GAP = 4;

const WeeklyChart = React.memo(function WeeklyChart({
  history,
  goal,
  themeColors: c,
}: {
  history: DayRecord[];
  goal: number;
  themeColors: ReturnType<typeof useThemeColors>;
}) {
  const last7 = getLast7Days();
  const today = todayISO();

  // Map date -> ml
  const historyMap = useMemo(() => {
    const map = new Map<string, number>();
    history.forEach((r) => map.set(r.date, r.ml));
    return map;
  }, [history]);

  // Find max value for scaling (at least the goal)
  const maxVal = useMemo(() => {
    let max = goal;
    last7.forEach((d) => {
      const ml = historyMap.get(d) ?? 0;
      if (ml > max) max = ml;
    });
    return max;
  }, [historyMap, goal, last7]);

  const totalWidth = last7.length * (BAR_WIDTH + BAR_GAP) - BAR_GAP;
  const goalLineY = CHART_HEIGHT - (goal / maxVal) * CHART_HEIGHT;

  return (
    <View
      style={s.chartContainer}
      accessibilityLabel={`Historial semanal de hidratacion. Meta: ${goal} mililitros`}
    >
      <View style={s.chartRow}>
        <Svg width={totalWidth} height={CHART_HEIGHT}>
          {/* Goal line */}
          <Rect
            x={0}
            y={goalLineY}
            width={totalWidth}
            height={1}
            fill={c.grayLight}
            opacity={0.6}
          />
          {/* Bars */}
          {last7.map((dateStr, i) => {
            const ml = historyMap.get(dateStr) ?? 0;
            const barH = maxVal > 0 ? Math.max((ml / maxVal) * CHART_HEIGHT, 2) : 2;
            const isToday = dateStr === today;
            const metGoal = ml >= goal;

            return (
              <Rect
                key={dateStr}
                x={i * (BAR_WIDTH + BAR_GAP)}
                y={CHART_HEIGHT - barH}
                width={BAR_WIDTH}
                height={barH}
                rx={BAR_WIDTH / 2}
                fill={metGoal ? WATER_BLUE : isToday ? WATER_BLUE : c.grayLight}
                opacity={metGoal ? 1 : isToday ? 0.7 : 0.4}
              />
            );
          })}
        </Svg>
      </View>
      {/* Day labels */}
      <View style={[s.chartLabels, { width: totalWidth }]}>
        {last7.map((dateStr) => (
          <Text
            key={dateStr}
            style={[
              s.chartDayLabel,
              {
                color: dateStr === today ? WATER_BLUE : c.gray,
                width: BAR_WIDTH + BAR_GAP,
                fontWeight: dateStr === today ? '700' : '400',
              },
            ]}
          >
            {getDayLabel(dateStr)}
          </Text>
        ))}
      </View>
    </View>
  );
});

// ─── Main Component ─────────────────────────────────────────────────────────

export default function WaterTracker({ waterMl, onAdd, goal: goalProp, weightKg }: WaterTrackerProps) {
  const c = useThemeColors();
  const goal = calculateGoal(weightKg, goalProp);
  const pct = Math.min(waterMl / goal, 1);

  // ─── Weekly history persistence ─────────────────────────────────────

  const [weekHistory, setWeekHistory] = useState<DayRecord[]>([]);

  // Load history on mount
  useEffect(() => {
    AsyncStorage.getItem(HISTORY_STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as DayRecord[];
          setWeekHistory(parsed);
        } catch {
          // Corrupted — start fresh
        }
      }
    });
  }, []);

  // Update today's entry whenever waterMl changes
  useEffect(() => {
    const today = todayISO();
    setWeekHistory((prev) => {
      const filtered = prev.filter((r) => r.date !== today);
      const updated = [...filtered, { date: today, ml: waterMl }];
      // Keep only last 14 days to avoid storage bloat
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 14);
      const cutoffISO = cutoff.toISOString().split('T')[0];
      const trimmed = updated.filter((r) => r.date >= cutoffISO);
      AsyncStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(trimmed));
      return trimmed;
    });
  }, [waterMl]);

  // ─── Reminder toggle ────────────────────────────────────────────────

  const [remindersEnabled, setRemindersEnabled] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(REMINDER_STORAGE_KEY).then((raw) => {
      if (raw === 'true') setRemindersEnabled(true);
    });
  }, []);

  const toggleReminders = useCallback(async () => {
    haptics.light();
    const next = !remindersEnabled;
    setRemindersEnabled(next);
    await AsyncStorage.setItem(REMINDER_STORAGE_KEY, next ? 'true' : 'false');

    if (next) {
      // Request permissions and schedule repeating reminders
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') {
        const { status: newStatus } = await Notifications.requestPermissionsAsync();
        if (newStatus !== 'granted') {
          setRemindersEnabled(false);
          await AsyncStorage.setItem(REMINDER_STORAGE_KEY, 'false');
          return;
        }
      }

      // Schedule reminders every 2 hours during waking hours (8am - 10pm)
      await cancelWaterReminders();
      for (let hour = 8; hour <= 22; hour += REMINDER_INTERVAL_HOURS) {
        try {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: 'Hora de hidratarte',
              body: `Llevas ${waterMl}ml de ${goal}ml. Toma un vaso de agua.`,
              sound: 'default',
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DAILY,
              hour,
              minute: 0,
            },
          });
        } catch {
          // Non-critical — continue scheduling others
        }
      }
    } else {
      await cancelWaterReminders();
    }
  }, [remindersEnabled, waterMl, goal]);

  const cancelWaterReminders = useCallback(async () => {
    try {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      for (const notif of scheduled) {
        if (notif.content.title === 'Hora de hidratarte') {
          await Notifications.cancelScheduledNotificationAsync(notif.identifier);
        }
      }
    } catch {
      // Best effort
    }
  }, []);

  // ─── Circular progress animation ───────────────────────────────────

  const SIZE = 120;
  const STROKE = 10;
  const R = (SIZE - STROKE) / 2;
  const CIRCUMFERENCE = R * 2 * Math.PI;

  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: pct,
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [pct]);

  const strokeDashoffset = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [CIRCUMFERENCE, 0],
  });

  // ─── Bounce on add ─────────────────────────────────────────────────

  const bounceAnim = useRef(new Animated.Value(1)).current;

  const handleAdd = useCallback((ml: number) => {
    const newTotal = waterMl + ml;
    // Warn if exceeding 150% of goal
    if (newTotal > goal * 1.5) {
      Alert.alert(
        'Agua muy alta',
        `Ya llevas ${(waterMl / 1000).toFixed(1)}L de ${(goal / 1000).toFixed(1)}L. Beber demasiada agua puede ser peligroso. Seguro que quieres agregar ${ml}ml mas?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Agregar',
            onPress: () => {
              haptics.medium();
              onAdd(ml);
            },
          },
        ],
      );
      return;
    }
    haptics.medium();
    bounceAnim.setValue(1.08);
    Animated.spring(bounceAnim, {
      toValue: 1,
      friction: 4,
      tension: 120,
      useNativeDriver: true,
    }).start();
    onAdd(ml);
  }, [onAdd, bounceAnim, waterMl, goal]);

  // ─── Goal reached haptic ───────────────────────────────────────────

  const prevWater = useRef(0);
  useEffect(() => {
    if (waterMl >= goal && prevWater.current < goal && goal > 0) {
      haptics.success();
    }
    prevWater.current = waterMl;
  }, [waterMl, goal]);

  const formatAmount = (ml: number) => (ml >= 1000 ? `+${ml / 1000}L` : `+${ml}ml`);

  const goalLabel = weightKg && !goalProp
    ? `Meta: ${goal}ml (${ML_PER_KG}ml x ${weightKg}kg)`
    : undefined;

  return (
    <Animated.View style={[s.card, { backgroundColor: c.bg, borderColor: c.grayLight, transform: [{ scale: bounceAnim }] }]}>
      {/* Header */}
      <View style={s.header} accessible={true} accessibilityRole="header">
        <View style={s.headerLeft}>
          <Ionicons name="water" size={18} color={WATER_BLUE} />
          <Text style={[s.title, { color: c.black }]} allowFontScaling>Agua</Text>
          {goalLabel && (
            <Text style={[s.goalHint, { color: c.gray }]}>{goalLabel}</Text>
          )}
        </View>
        {/* Reminder toggle */}
        <TouchableOpacity
          onPress={toggleReminders}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={remindersEnabled ? 'Desactivar recordatorios de agua' : 'Activar recordatorios de agua cada 2 horas'}
          accessibilityState={{ selected: remindersEnabled }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={remindersEnabled ? 'notifications' : 'notifications-outline'}
            size={18}
            color={remindersEnabled ? WATER_BLUE : c.gray}
          />
        </TouchableOpacity>
      </View>

      {/* Circular progress + value + quick-add */}
      <View style={s.body}>
        <View
          style={s.ringWrap}
          accessibilityLabel={`Agua: ${waterMl} de ${goal} mililitros. ${Math.round(pct * 100)} por ciento completado`}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: Math.round(goal), now: Math.round(waterMl) }}
        >
          <Svg width={SIZE} height={SIZE}>
            {/* Background track */}
            <Circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              stroke={WATER_BLUE_LIGHT}
              strokeWidth={STROKE}
              fill="none"
            />
            {/* Animated fill */}
            <AnimatedCircle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              stroke={waterMl >= goal ? WATER_BLUE_DARK : WATER_BLUE}
              strokeWidth={STROKE}
              fill="none"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              rotation="-90"
              origin={`${SIZE / 2}, ${SIZE / 2}`}
            />
          </Svg>
          {/* Center label */}
          <View style={s.ringCenter} importantForAccessibility="no-hide-descendants">
            <Ionicons
              name={waterMl >= goal ? 'checkmark-circle' : 'water'}
              size={20}
              color={waterMl >= goal ? WATER_BLUE_DARK : WATER_BLUE}
            />
            <Text style={[s.ringValue, { color: waterMl >= goal ? WATER_BLUE_DARK : WATER_BLUE }]} allowFontScaling>
              {waterMl}
            </Text>
            <Text style={[s.ringUnit, { color: c.gray }]} allowFontScaling>/ {goal} ml</Text>
          </View>
        </View>

        {/* Quick-add buttons */}
        <View style={s.btnsCol}>
          {WATER_AMOUNTS.map((ml) => (
            <TouchableOpacity
              key={ml}
              style={[s.btn, { backgroundColor: WATER_BLUE_LIGHT }]}
              onPress={() => handleAdd(ml)}
              activeOpacity={0.7}
              accessibilityLabel={`Agregar ${ml >= 1000 ? ml / 1000 + ' litro' : ml + ' mililitros'} de agua`}
              accessibilityRole="button"
            >
              <Text style={s.btnText}>{formatAmount(ml)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Weekly mini bar chart */}
      <View style={[s.weekSection, { borderTopColor: c.grayLight }]}>
        <View style={s.weekHeader}>
          <Ionicons name="bar-chart-outline" size={14} color={c.gray} />
          <Text style={[s.weekTitle, { color: c.gray }]}>Esta semana</Text>
        </View>
        <WeeklyChart history={weekHistory} goal={goal} themeColors={c} />
      </View>
    </Animated.View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  title: {
    ...typography.label,
  },
  goalHint: {
    ...typography.caption,
    fontSize: 10,
    marginLeft: spacing.xs,
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  ringWrap: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringValue: {
    ...typography.titleSm,
    marginTop: 2,
  },
  ringUnit: {
    ...typography.caption,
  },
  btnsCol: {
    gap: spacing.sm,
  },
  btn: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    minWidth: 80,
  },
  btnText: {
    ...typography.label,
    color: WATER_BLUE,
    fontWeight: '700',
  },

  // Weekly chart section
  weekSection: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
  },
  weekHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  weekTitle: {
    ...typography.caption,
    fontSize: 11,
  },

  // Chart
  chartContainer: {
    alignItems: 'center',
  },
  chartRow: {
    alignItems: 'flex-end',
  },
  chartLabels: {
    flexDirection: 'row',
    marginTop: 4,
  },
  chartDayLabel: {
    fontSize: 9,
    textAlign: 'center',
  },
});
