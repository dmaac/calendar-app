/**
 * SleepTracker -- Collapsible card for sleep tracking
 *
 * Features:
 * - Input: bedtime + wake time via time picker buttons
 * - Calculates: total duration, estimated quality based on consistency
 * - Visualization: semicircular arc showing hours slept vs recommended 7-9h
 * - Weekly history trend (mini bar chart, similar pattern to WaterTracker)
 * - Persists all data in AsyncStorage
 * - Designed to integrate into HomeScreen as a collapsible card
 *
 * Sleep science basis:
 * - Adults need 7-9 hours (National Sleep Foundation)
 * - Quality estimation based on duration + consistency (std deviation of last 7 days)
 * - Consistency matters: irregular schedules degrade sleep quality even with
 *   adequate duration (Lunsford-Avery et al., 2018)
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useThemeColors, typography, spacing, radius, shadows } from '../theme';
import { haptics } from '../hooks/useHaptics';

// Enable LayoutAnimation on Android
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STORAGE_KEY = '@fitsi_sleep_state';
const HISTORY_STORAGE_KEY = '@fitsi_sleep_history';

const SLEEP_PURPLE = '#7C3AED';
const SLEEP_PURPLE_LIGHT = '#EDE9FE';
const SLEEP_PURPLE_DARK = '#5B21B6';
const SLEEP_GREEN = '#10B981';
const SLEEP_YELLOW = '#F59E0B';
const SLEEP_RED = '#EF4444';

const RECOMMENDED_MIN = 7;
const RECOMMENDED_MAX = 9;
const ARC_MAX_HOURS = 12; // arc scale: 0 to 12 hours

const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

// ─── Types ──────────────────────────────────────────────────────────────────

interface SleepRecord {
  /** ISO date string YYYY-MM-DD (the date the user woke up) */
  date: string;
  /** Bedtime as HH:MM */
  bedtime: string;
  /** Wake time as HH:MM */
  wakeTime: string;
  /** Duration in hours (decimal) */
  durationHours: number;
  /** Quality score 0-100 */
  quality: number;
}

interface SleepState {
  /** Last bedtime set (HH:MM), used as default for next entry */
  lastBedtime: string;
  /** Last wake time set (HH:MM), used as default for next entry */
  lastWakeTime: string;
  /** Whether sleep has been logged for today */
  loggedToday: boolean;
  /** Date of last log (YYYY-MM-DD) */
  lastLogDate: string | null;
}

interface SleepTrackerProps {
  /** Whether the card starts collapsed (default: true) */
  initiallyCollapsed?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getLast7Days(): string[] {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    );
  }
  return days;
}

function getDayLabel(dateStr: string): string {
  const day = new Date(dateStr + 'T12:00:00').getDay();
  const map = [6, 0, 1, 2, 3, 4, 5]; // Sun->6(D), Mon->0(L)
  return DAY_LABELS[map[day]];
}

/** Calculate sleep duration from bedtime to wake time, handling midnight crossing */
function calculateDuration(bedtime: string, wakeTime: string): number {
  const [bH, bM] = bedtime.split(':').map(Number);
  const [wH, wM] = wakeTime.split(':').map(Number);

  let bedMinutes = bH * 60 + bM;
  let wakeMinutes = wH * 60 + wM;

  // If wake is earlier than bed, sleep crossed midnight
  if (wakeMinutes <= bedMinutes) {
    wakeMinutes += 24 * 60;
  }

  return (wakeMinutes - bedMinutes) / 60;
}

/** Estimate sleep quality 0-100 based on duration and consistency */
function estimateQuality(
  durationHours: number,
  recentDurations: number[],
): number {
  // Duration score (0-70): penalize under 7h and over 9h
  let durationScore: number;
  if (durationHours >= RECOMMENDED_MIN && durationHours <= RECOMMENDED_MAX) {
    durationScore = 70; // optimal range
  } else if (durationHours < RECOMMENDED_MIN) {
    // Linear penalty below 7h: at 5h = 40, at 0h = 0
    durationScore = Math.max(0, (durationHours / RECOMMENDED_MIN) * 70);
  } else {
    // Slight penalty above 9h (oversleeping can indicate issues)
    const excess = durationHours - RECOMMENDED_MAX;
    durationScore = Math.max(30, 70 - excess * 10);
  }

  // Consistency score (0-30): lower std deviation = higher score
  let consistencyScore = 30; // default if not enough data
  if (recentDurations.length >= 3) {
    const mean =
      recentDurations.reduce((a, b) => a + b, 0) / recentDurations.length;
    const variance =
      recentDurations.reduce((sum, d) => sum + (d - mean) ** 2, 0) /
      recentDurations.length;
    const stdDev = Math.sqrt(variance);
    // stdDev of 0 = perfect consistency (30 pts), stdDev >= 2h = 0 pts
    consistencyScore = Math.max(0, Math.min(30, (1 - stdDev / 2) * 30));
  }

  return Math.round(Math.max(0, Math.min(100, durationScore + consistencyScore)));
}

function getQualityColor(quality: number): string {
  if (quality >= 70) return SLEEP_GREEN;
  if (quality >= 40) return SLEEP_YELLOW;
  return SLEEP_RED;
}

function getQualityLabel(quality: number): string {
  if (quality >= 70) return 'Excelente';
  if (quality >= 40) return 'Regular';
  return 'Insuficiente';
}

function getDurationColor(hours: number): string {
  if (hours >= RECOMMENDED_MIN && hours <= RECOMMENDED_MAX) return SLEEP_GREEN;
  if (hours >= 6 && hours < RECOMMENDED_MIN) return SLEEP_YELLOW;
  return SLEEP_RED;
}

function formatHoursMin(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

// ─── Time picker step (increments of 15 minutes) ───────────────────────────

function stepTime(time: string, delta: number): string {
  const [h, m] = time.split(':').map(Number);
  let totalMinutes = h * 60 + m + delta;
  if (totalMinutes < 0) totalMinutes += 24 * 60;
  totalMinutes = totalMinutes % (24 * 60);
  return `${pad(Math.floor(totalMinutes / 60))}:${pad(totalMinutes % 60)}`;
}

// ─── Semicircular arc SVG ───────────────────────────────────────────────────

const ARC_SIZE = 160;
const ARC_STROKE = 10;
const ARC_RADIUS = (ARC_SIZE - ARC_STROKE) / 2 - 4;
const ARC_CENTER_X = ARC_SIZE / 2;
const ARC_CENTER_Y = ARC_SIZE / 2 + 10;

/** Generates an SVG arc path for a semicircle (180 degrees, from left to right) */
function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  angleDeg: number,
): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

// ─── Weekly Chart ───────────────────────────────────────────────────────────

const CHART_HEIGHT = 48;
const BAR_WIDTH = 8;
const BAR_GAP = 4;

const WeeklyChart = React.memo(function WeeklyChart({
  history,
  themeColors: c,
}: {
  history: SleepRecord[];
  themeColors: ReturnType<typeof useThemeColors>;
}) {
  const last7 = getLast7Days();
  const today = todayISO();

  const historyMap = useMemo(() => {
    const map = new Map<string, SleepRecord>();
    history.forEach((r) => map.set(r.date, r));
    return map;
  }, [history]);

  const maxVal = useMemo(() => {
    let max = RECOMMENDED_MAX;
    last7.forEach((d) => {
      const rec = historyMap.get(d);
      if (rec && rec.durationHours > max) max = rec.durationHours;
    });
    return max;
  }, [historyMap, last7]);

  const totalWidth = last7.length * (BAR_WIDTH + BAR_GAP) - BAR_GAP;
  const goalLineY =
    CHART_HEIGHT - (RECOMMENDED_MIN / maxVal) * CHART_HEIGHT;

  return (
    <View
      style={chartStyles.container}
      accessibilityLabel={`Historial semanal de sueno. Recomendado: ${RECOMMENDED_MIN} a ${RECOMMENDED_MAX} horas`}
    >
      <View style={chartStyles.row}>
        <Svg width={totalWidth} height={CHART_HEIGHT}>
          {/* Recommended minimum line */}
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
            const rec = historyMap.get(dateStr);
            const hours = rec?.durationHours ?? 0;
            const barH =
              maxVal > 0
                ? Math.max((hours / maxVal) * CHART_HEIGHT, hours > 0 ? 4 : 2)
                : 2;
            const isToday = dateStr === today;
            const inRange =
              hours >= RECOMMENDED_MIN && hours <= RECOMMENDED_MAX;

            return (
              <Rect
                key={dateStr}
                x={i * (BAR_WIDTH + BAR_GAP)}
                y={CHART_HEIGHT - barH}
                width={BAR_WIDTH}
                height={barH}
                rx={BAR_WIDTH / 2}
                fill={
                  hours === 0
                    ? c.grayLight
                    : inRange
                      ? SLEEP_PURPLE
                      : isToday
                        ? SLEEP_PURPLE
                        : SLEEP_YELLOW
                }
                opacity={hours === 0 ? 0.3 : inRange ? 1 : isToday ? 0.7 : 0.5}
              />
            );
          })}
        </Svg>
      </View>
      {/* Day labels */}
      <View style={[chartStyles.labels, { width: totalWidth }]}>
        {last7.map((dateStr) => (
          <Text
            key={dateStr}
            style={[
              chartStyles.dayLabel,
              {
                color: dateStr === today ? SLEEP_PURPLE : c.gray,
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

// ─── Time Stepper Component ─────────────────────────────────────────────────

const TimeStepper = React.memo(function TimeStepper({
  label,
  icon,
  time,
  onTimeChange,
  themeColors: c,
  disabled,
}: {
  label: string;
  icon: string;
  time: string;
  onTimeChange: (newTime: string) => void;
  themeColors: ReturnType<typeof useThemeColors>;
  disabled?: boolean;
}) {
  return (
    <View style={stepperStyles.container}>
      <View style={stepperStyles.labelRow}>
        <Ionicons name={icon as any} size={14} color={SLEEP_PURPLE} />
        <Text style={[stepperStyles.label, { color: c.gray }]}>{label}</Text>
      </View>
      <View style={stepperStyles.row}>
        <TouchableOpacity
          onPress={() => {
            haptics.selection();
            onTimeChange(stepTime(time, -15));
          }}
          activeOpacity={0.7}
          disabled={disabled}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={`Restar 15 minutos a ${label}`}
          accessibilityRole="button"
        >
          <View style={[stepperStyles.btn, { backgroundColor: c.surface }]}>
            <Ionicons name="remove" size={16} color={disabled ? c.disabled : c.black} />
          </View>
        </TouchableOpacity>
        <Text
          style={[stepperStyles.time, { color: disabled ? c.disabled : c.black }]}
          accessibilityLabel={`${label}: ${time}`}
        >
          {time}
        </Text>
        <TouchableOpacity
          onPress={() => {
            haptics.selection();
            onTimeChange(stepTime(time, 15));
          }}
          activeOpacity={0.7}
          disabled={disabled}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={`Sumar 15 minutos a ${label}`}
          accessibilityRole="button"
        >
          <View style={[stepperStyles.btn, { backgroundColor: c.surface }]}>
            <Ionicons name="add" size={16} color={disabled ? c.disabled : c.black} />
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
});

// ─── Main Component ─────────────────────────────────────────────────────────

const DEFAULT_STATE: SleepState = {
  lastBedtime: '23:00',
  lastWakeTime: '07:00',
  loggedToday: false,
  lastLogDate: null,
};

export default function SleepTracker({
  initiallyCollapsed = true,
}: SleepTrackerProps) {
  const c = useThemeColors();
  const [state, setState] = useState<SleepState>(DEFAULT_STATE);
  const [history, setHistory] = useState<SleepRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [collapsed, setCollapsed] = useState(initiallyCollapsed);

  // Current input values
  const [bedtime, setBedtime] = useState('23:00');
  const [wakeTime, setWakeTime] = useState('07:00');

  // ─── Load persisted state ──────────────────────────────────────────

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(HISTORY_STORAGE_KEY),
    ]).then(([stateRaw, historyRaw]) => {
      if (stateRaw) {
        try {
          const parsed = JSON.parse(stateRaw) as SleepState;
          // Reset loggedToday if it's a new day
          const today = todayISO();
          if (parsed.lastLogDate !== today) {
            parsed.loggedToday = false;
          }
          setState(parsed);
          setBedtime(parsed.lastBedtime);
          setWakeTime(parsed.lastWakeTime);
        } catch {
          // Corrupted -- use default
        }
      }
      if (historyRaw) {
        try {
          const parsed = JSON.parse(historyRaw) as SleepRecord[];
          setHistory(parsed);
        } catch {
          // Corrupted -- start fresh
        }
      }
      setLoaded(true);
    });
  }, []);

  // ─── Persistence ───────────────────────────────────────────────────

  const persistState = useCallback(async (next: SleepState) => {
    setState(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const persistHistory = useCallback(async (next: SleepRecord[]) => {
    // Keep only last 30 days
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffISO = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
    const trimmed = next.filter((r) => r.date >= cutoffISO);
    setHistory(trimmed);
    await AsyncStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(trimmed));
  }, []);

  // ─── Derived values ────────────────────────────────────────────────

  const duration = useMemo(
    () => calculateDuration(bedtime, wakeTime),
    [bedtime, wakeTime],
  );

  const recentDurations = useMemo(
    () => history.slice(-7).map((r) => r.durationHours),
    [history],
  );

  const quality = useMemo(
    () => estimateQuality(duration, recentDurations),
    [duration, recentDurations],
  );

  const todayRecord = useMemo(
    () => history.find((r) => r.date === todayISO()),
    [history],
  );

  // ─── Log sleep ─────────────────────────────────────────────────────

  const logSleep = useCallback(async () => {
    haptics.medium();
    const today = todayISO();

    const record: SleepRecord = {
      date: today,
      bedtime,
      wakeTime,
      durationHours: duration,
      quality,
    };

    // Update history: replace today's entry if exists
    const updatedHistory = [
      ...history.filter((r) => r.date !== today),
      record,
    ];

    const newState: SleepState = {
      lastBedtime: bedtime,
      lastWakeTime: wakeTime,
      loggedToday: true,
      lastLogDate: today,
    };

    await persistState(newState);
    await persistHistory(updatedHistory);

    if (quality >= 70) {
      haptics.success();
    }
  }, [bedtime, wakeTime, duration, quality, history, persistState, persistHistory]);

  // ─── Collapse toggle ──────────────────────────────────────────────

  const toggleCollapse = useCallback(() => {
    haptics.light();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsed((prev) => !prev);
  }, []);

  // ─── Arc animation ────────────────────────────────────────────────

  const arcProgress = useRef(new Animated.Value(0)).current;
  const progress = Math.min(duration / ARC_MAX_HOURS, 1);

  useEffect(() => {
    Animated.timing(arcProgress, {
      toValue: progress,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  // We need to listen and update state for the SVG path
  const [arcAngle, setArcAngle] = useState(0);
  useEffect(() => {
    const id = arcProgress.addListener(({ value }) => {
      setArcAngle(value * 180);
    });
    return () => arcProgress.removeListener(id);
  }, []);

  // Average sleep this week
  const weekAvg = useMemo(() => {
    const last7 = getLast7Days();
    const weekRecords = history.filter((r) => last7.includes(r.date));
    if (weekRecords.length === 0) return null;
    const avg =
      weekRecords.reduce((sum, r) => sum + r.durationHours, 0) /
      weekRecords.length;
    return avg;
  }, [history]);

  if (!loaded) return null;

  // ─── Render ────────────────────────────────────────────────────────

  const durationColor = getDurationColor(duration);
  const qualityColor = getQualityColor(quality);
  const qualityLabel = getQualityLabel(quality);
  const isLogged = state.loggedToday || todayRecord !== undefined;

  return (
    <View
      style={[s.card, { backgroundColor: c.bg, borderColor: c.grayLight }]}
      accessibilityLabel={
        isLogged
          ? `Sueno registrado hoy: ${formatHoursMin(todayRecord?.durationHours ?? duration)}, calidad ${todayRecord?.quality ?? quality} por ciento`
          : 'Registro de sueno. Toca para expandir'
      }
    >
      {/* Header -- always visible */}
      <TouchableOpacity
        style={s.header}
        onPress={toggleCollapse}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={
          collapsed ? 'Expandir panel de sueno' : 'Colapsar panel de sueno'
        }
        accessibilityState={{ expanded: !collapsed }}
      >
        <View style={s.headerLeft}>
          <View style={[s.headerIcon, { backgroundColor: SLEEP_PURPLE_LIGHT }]}>
            <Ionicons name="moon-outline" size={18} color={SLEEP_PURPLE} />
          </View>
          <View>
            <Text style={[s.title, { color: c.black }]}>Sueno</Text>
            {collapsed && isLogged && (
              <Text style={[s.headerSubtitle, { color: SLEEP_PURPLE }]}>
                {formatHoursMin(todayRecord?.durationHours ?? duration)} --{' '}
                {getQualityLabel(todayRecord?.quality ?? quality)}
              </Text>
            )}
            {collapsed && !isLogged && (
              <Text style={[s.headerSubtitle, { color: c.gray }]}>
                Sin registrar -- Toca para expandir
              </Text>
            )}
          </View>
        </View>
        <Ionicons
          name={collapsed ? 'chevron-down' : 'chevron-up'}
          size={18}
          color={c.gray}
        />
      </TouchableOpacity>

      {/* Collapsible body */}
      {!collapsed && (
        <View style={s.body}>
          {/* Semicircular arc visualization */}
          <View style={s.arcSection}>
            <View
              style={s.arcWrap}
              accessibilityLabel={`Duracion del sueno: ${formatHoursMin(duration)} de ${RECOMMENDED_MIN} a ${RECOMMENDED_MAX} horas recomendadas`}
              accessibilityRole="progressbar"
            >
              <Svg width={ARC_SIZE} height={ARC_SIZE / 2 + 30}>
                {/* Background arc (full semicircle) */}
                <Path
                  d={describeArc(
                    ARC_CENTER_X,
                    ARC_CENTER_Y,
                    ARC_RADIUS,
                    180,
                    360,
                  )}
                  stroke={c.grayLight}
                  strokeWidth={ARC_STROKE}
                  fill="none"
                  strokeLinecap="round"
                />
                {/* Progress arc */}
                {arcAngle > 1 && (
                  <Path
                    d={describeArc(
                      ARC_CENTER_X,
                      ARC_CENTER_Y,
                      ARC_RADIUS,
                      180,
                      180 + Math.min(arcAngle, 179.9),
                    )}
                    stroke={durationColor}
                    strokeWidth={ARC_STROKE}
                    fill="none"
                    strokeLinecap="round"
                  />
                )}
                {/* Recommended range markers (7h and 9h) */}
                {/* 7h marker */}
                {(() => {
                  const angle7 = 180 + (RECOMMENDED_MIN / ARC_MAX_HOURS) * 180;
                  const p = polarToCartesian(
                    ARC_CENTER_X,
                    ARC_CENTER_Y,
                    ARC_RADIUS + ARC_STROKE + 4,
                    angle7 - 90,
                  );
                  return (
                    <Circle
                      cx={p.x}
                      cy={p.y}
                      r={2.5}
                      fill={c.gray}
                      opacity={0.5}
                    />
                  );
                })()}
                {/* 9h marker */}
                {(() => {
                  const angle9 = 180 + (RECOMMENDED_MAX / ARC_MAX_HOURS) * 180;
                  const p = polarToCartesian(
                    ARC_CENTER_X,
                    ARC_CENTER_Y,
                    ARC_RADIUS + ARC_STROKE + 4,
                    angle9 - 90,
                  );
                  return (
                    <Circle
                      cx={p.x}
                      cy={p.y}
                      r={2.5}
                      fill={c.gray}
                      opacity={0.5}
                    />
                  );
                })()}
              </Svg>
              {/* Center content */}
              <View style={s.arcCenter}>
                <Text style={[s.arcDuration, { color: durationColor }]}>
                  {formatHoursMin(duration)}
                </Text>
                <Text style={[s.arcRecommended, { color: c.gray }]}>
                  de {RECOMMENDED_MIN}-{RECOMMENDED_MAX}h
                </Text>
              </View>
            </View>
          </View>

          {/* Time pickers */}
          <View style={s.pickersRow}>
            <TimeStepper
              label="Dormirse"
              icon="bed-outline"
              time={bedtime}
              onTimeChange={setBedtime}
              themeColors={c}
              disabled={isLogged}
            />
            <View style={[s.pickerDivider, { backgroundColor: c.grayLight }]} />
            <TimeStepper
              label="Despertar"
              icon="sunny-outline"
              time={wakeTime}
              onTimeChange={setWakeTime}
              themeColors={c}
              disabled={isLogged}
            />
          </View>

          {/* Quality indicator */}
          <View style={s.qualityRow}>
            <View style={s.qualityLeft}>
              <Ionicons name="sparkles-outline" size={14} color={qualityColor} />
              <Text style={[s.qualityLabel, { color: c.gray }]}>
                Calidad estimada
              </Text>
            </View>
            <View style={s.qualityRight}>
              <Text style={[s.qualityValue, { color: qualityColor }]}>
                {quality}%
              </Text>
              <Text style={[s.qualityText, { color: qualityColor }]}>
                {qualityLabel}
              </Text>
            </View>
          </View>

          {/* Quality bar */}
          <View style={[s.qualityTrack, { backgroundColor: c.grayLight }]}>
            <View
              style={[
                s.qualityFill,
                {
                  backgroundColor: qualityColor,
                  width: `${Math.min(quality, 100)}%`,
                },
              ]}
            />
          </View>

          {/* Log / Update button */}
          <TouchableOpacity
            style={[
              s.actionBtn,
              {
                backgroundColor: isLogged ? c.surface : SLEEP_PURPLE,
                borderWidth: isLogged ? 1 : 0,
                borderColor: isLogged ? c.grayLight : undefined,
              },
            ]}
            onPress={logSleep}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={
              isLogged ? 'Actualizar registro de sueno' : 'Registrar sueno'
            }
          >
            <Ionicons
              name={isLogged ? 'checkmark-circle-outline' : 'moon-outline'}
              size={20}
              color={isLogged ? SLEEP_GREEN : '#FFF'}
            />
            <Text
              style={[
                s.actionBtnText,
                { color: isLogged ? c.black : '#FFF' },
              ]}
            >
              {isLogged ? 'Actualizar' : 'Registrar Sueno'}
            </Text>
          </TouchableOpacity>

          {/* Weekly history */}
          {history.length > 0 && (
            <View style={[s.weekSection, { borderTopColor: c.grayLight }]}>
              <View style={s.weekHeader}>
                <Ionicons name="bar-chart-outline" size={14} color={c.gray} />
                <Text style={[s.weekTitle, { color: c.gray }]}>Esta semana</Text>
                {weekAvg !== null && (
                  <Text style={[s.weekAvg, { color: SLEEP_PURPLE }]}>
                    Prom: {formatHoursMin(weekAvg)}
                  </Text>
                )}
              </View>
              <WeeklyChart history={history} themeColors={c} />
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
    overflow: 'hidden',
    ...shadows.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.label,
  },
  headerSubtitle: {
    ...typography.caption,
    marginTop: 1,
  },
  body: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },

  // Arc
  arcSection: {
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  arcWrap: {
    width: ARC_SIZE,
    height: ARC_SIZE / 2 + 30,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  arcCenter: {
    position: 'absolute',
    bottom: 8,
    alignItems: 'center',
  },
  arcDuration: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  arcRecommended: {
    ...typography.caption,
    fontSize: 11,
  },

  // Time pickers
  pickersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  pickerDivider: {
    width: 1,
    height: 40,
  },

  // Quality
  qualityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  qualityLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  qualityLabel: {
    ...typography.caption,
  },
  qualityRight: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  qualityValue: {
    ...typography.label,
    fontWeight: '800',
  },
  qualityText: {
    ...typography.caption,
    fontWeight: '600',
  },
  qualityTrack: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  qualityFill: {
    height: 5,
    borderRadius: 3,
  },

  // Action button
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
    minHeight: 44,
  },
  actionBtnText: {
    ...typography.button,
  },

  // Weekly section
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
    flex: 1,
  },
  weekAvg: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '700',
  },
});

const chartStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  row: {
    alignItems: 'flex-end',
  },
  labels: {
    flexDirection: 'row',
    marginTop: 4,
  },
  dayLabel: {
    fontSize: 9,
    textAlign: 'center',
  },
});

const stepperStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  label: {
    ...typography.caption,
    fontSize: 11,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  btn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  time: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    minWidth: 56,
    textAlign: 'center',
  },
});
