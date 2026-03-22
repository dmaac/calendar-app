/**
 * MoodTracker -- Collapsible card tracking mood, energy, and hunger 3x daily
 *
 * Features:
 * - 3 sliders: Animo (1-5), Energia (1-5), Hambre (1-5)
 * - Time-of-day tracking: manana, tarde, noche
 * - Mini line chart showing 7-day weekly trend
 * - Visual correlation with NutriScore of the same day
 * - Persists in AsyncStorage with daily granularity
 * - Collapsible card for HomeScreen integration
 *
 * Visual inspiration: Apple Health mood tracking + Fitsi card style
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
  Dimensions,
} from 'react-native';
import Svg, { Path, Circle as SvgCircle, Line, Rect, Text as SvgText } from 'react-native-svg';
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

const STORAGE_KEY = '@fitsi_mood_tracker';
const NUTRI_SCORE_KEY = '@fitsi_wellness_yesterday'; // shared with WellnessScore for correlation

const MOOD_PURPLE = '#7C3AED';
const ENERGY_AMBER = '#F59E0B';
const HUNGER_TEAL = '#14B8A6';

type TimeOfDay = 'morning' | 'afternoon' | 'night';

const TIME_LABELS: Record<TimeOfDay, { label: string; icon: string; hours: [number, number] }> = {
  morning: { label: 'Manana', icon: 'sunny-outline', hours: [5, 12] },
  afternoon: { label: 'Tarde', icon: 'partly-sunny-outline', hours: [12, 19] },
  night: { label: 'Noche', icon: 'moon-outline', hours: [19, 5] },
};

const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

// ─── Types ──────────────────────────────────────────────────────────────────

interface MoodRecord {
  mood: number;      // 1-5
  energy: number;    // 1-5
  hunger: number;    // 1-5
}

interface DailyMoodData {
  date: string;
  morning?: MoodRecord;
  afternoon?: MoodRecord;
  night?: MoodRecord;
}

interface MoodTrackerProps {
  /** Start collapsed (default: true for HomeScreen) */
  initiallyCollapsed?: boolean;
  /** NutriScore value 0-100 for correlation display */
  nutriScore?: number;
}

// ─── Storage ────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function getTimeOfDay(): TimeOfDay {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 19) return 'afternoon';
  return 'night';
}

async function loadMoodHistory(days: number): Promise<DailyMoodData[]> {
  const history: DailyMoodData[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    try {
      const raw = await AsyncStorage.getItem(`${STORAGE_KEY}_${dateStr}`);
      if (raw) {
        history.push(JSON.parse(raw) as DailyMoodData);
      } else {
        history.push({ date: dateStr });
      }
    } catch {
      history.push({ date: dateStr });
    }
  }
  return history;
}

async function saveDayMood(data: DailyMoodData): Promise<void> {
  await AsyncStorage.setItem(`${STORAGE_KEY}_${data.date}`, JSON.stringify(data));
}

// ─── Score level helpers ────────────────────────────────────────────────────

function getLevelEmoji(value: number, type: 'mood' | 'energy' | 'hunger'): string {
  const emojis: Record<string, string[]> = {
    mood: ['\u{1F614}', '\u{1F615}', '\u{1F610}', '\u{1F642}', '\u{1F60A}'],
    energy: ['\u{1F634}', '\u{1F971}', '\u{26A1}', '\u{1F4AA}', '\u{1F525}'],
    hunger: ['\u{1F60C}', '\u{1F610}', '\u{1F37D}\uFE0F', '\u{1F924}', '\u{1F922}'],
  };
  return emojis[type]?.[value - 1] ?? '\u{1F610}';
}

function getLevelLabel(value: number, type: 'mood' | 'energy' | 'hunger'): string {
  const labels: Record<string, string[]> = {
    mood: ['Muy bajo', 'Bajo', 'Normal', 'Bien', 'Excelente'],
    energy: ['Agotado', 'Cansado', 'Normal', 'Activo', 'Energetico'],
    hunger: ['Lleno', 'Satisfecho', 'Normal', 'Hambriento', 'Mucha hambre'],
  };
  return labels[type]?.[value - 1] ?? 'Normal';
}

// ─── Slider Component ───────────────────────────────────────────────────────

const LevelSlider = React.memo(function LevelSlider({
  label,
  icon,
  color,
  value,
  type,
  onChange,
  themeColors: c,
}: {
  label: string;
  icon: string;
  color: string;
  value: number;
  type: 'mood' | 'energy' | 'hunger';
  onChange: (val: number) => void;
  themeColors: ReturnType<typeof useThemeColors>;
}) {
  const levels = [1, 2, 3, 4, 5];

  return (
    <View
      style={sliderStyles.container}
      accessibilityLabel={`${label}: nivel ${value} de 5, ${getLevelLabel(value, type)}`}
      accessibilityRole="adjustable"
      accessibilityValue={{ min: 1, max: 5, now: value }}
    >
      <View style={sliderStyles.labelRow}>
        <Ionicons name={icon as any} size={16} color={color} />
        <Text style={[sliderStyles.label, { color: c.black }]}>{label}</Text>
        <Text style={sliderStyles.emoji}>{getLevelEmoji(value, type)}</Text>
        <Text style={[sliderStyles.levelText, { color }]}>
          {getLevelLabel(value, type)}
        </Text>
      </View>
      <View style={sliderStyles.dotsRow}>
        {levels.map((level) => {
          const isActive = level <= value;
          const isSelected = level === value;

          return (
            <TouchableOpacity
              key={level}
              onPress={() => {
                haptics.selection();
                onChange(level);
              }}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              style={sliderStyles.dotWrapper}
              accessibilityLabel={`Nivel ${level}`}
              accessibilityRole="button"
            >
              <View
                style={[
                  sliderStyles.dot,
                  {
                    backgroundColor: isActive ? color : c.grayLight,
                    transform: [{ scale: isSelected ? 1.3 : 1 }],
                  },
                  isSelected && sliderStyles.dotSelected,
                ]}
              />
              {/* Connecting line between dots */}
              {level < 5 && (
                <View
                  style={[
                    sliderStyles.connector,
                    {
                      backgroundColor: level < value ? color : c.grayLight,
                    },
                  ]}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
});

const sliderStyles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  label: {
    ...typography.bodyMd,
    fontWeight: '600',
    flex: 1,
  },
  emoji: {
    fontSize: 16,
  },
  levelText: {
    fontSize: 11,
    fontWeight: '700',
    minWidth: 70,
    textAlign: 'right',
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  dotWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  dotSelected: {
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  connector: {
    flex: 1,
    height: 3,
    borderRadius: 1.5,
    marginHorizontal: -1,
  },
});

// ─── Trend Line Chart ───────────────────────────────────────────────────────

const CHART_H = 100;
const CHART_PAD = { top: 12, bottom: 20, left: 24, right: 8 };

const TrendChart = React.memo(function TrendChart({
  history,
  nutriScores,
  width,
  themeColors: c,
}: {
  history: DailyMoodData[];
  nutriScores: (number | null)[];
  width: number;
  themeColors: ReturnType<typeof useThemeColors>;
}) {
  if (history.length < 2) return null;

  const drawW = width - CHART_PAD.left - CHART_PAD.right;
  const drawH = CHART_H - CHART_PAD.top - CHART_PAD.bottom;

  // Calculate daily averages
  const dailyAvgs = history.map((day) => {
    const records = [day.morning, day.afternoon, day.night].filter(Boolean) as MoodRecord[];
    if (records.length === 0) return null;
    return {
      mood: records.reduce((s, r) => s + r.mood, 0) / records.length,
      energy: records.reduce((s, r) => s + r.energy, 0) / records.length,
      hunger: records.reduce((s, r) => s + r.hunger, 0) / records.length,
    };
  });

  const toX = (i: number) => CHART_PAD.left + (i / (history.length - 1)) * drawW;
  const toY = (val: number) => CHART_PAD.top + drawH - ((val - 1) / 4) * drawH;

  // Build SVG paths for mood and energy lines
  const buildPath = (getValue: (avg: NonNullable<(typeof dailyAvgs)[0]>) => number): string | null => {
    let path = '';
    let started = false;
    dailyAvgs.forEach((avg, i) => {
      if (!avg) return;
      const x = toX(i).toFixed(1);
      const y = toY(getValue(avg)).toFixed(1);
      path += started ? ` L${x},${y}` : `M${x},${y}`;
      started = true;
    });
    return started ? path : null;
  };

  const moodPath = buildPath((a) => a.mood);
  const energyPath = buildPath((a) => a.energy);

  // NutriScore correlation dots (scaled from 0-100 to 1-5)
  const nutriDots = nutriScores.map((score, i) => {
    if (score === null) return null;
    const scaled = 1 + (score / 100) * 4;
    return { x: toX(i), y: toY(scaled) };
  });

  // Y-axis labels
  const yTicks = [1, 3, 5];

  return (
    <View style={chartStyles.container}>
      <Text style={[chartStyles.title, { color: c.black }]}>Tendencia semanal</Text>
      <Svg width={width} height={CHART_H}>
        {/* Grid lines */}
        {yTicks.map((tick) => (
          <Line
            key={tick}
            x1={CHART_PAD.left}
            y1={toY(tick)}
            x2={width - CHART_PAD.right}
            y2={toY(tick)}
            stroke={c.grayLight}
            strokeWidth={0.5}
          />
        ))}

        {/* Y labels */}
        {yTicks.map((tick) => (
          <SvgText
            key={`yl-${tick}`}
            x={CHART_PAD.left - 6}
            y={toY(tick) + 4}
            fontSize={9}
            fill={c.gray}
            textAnchor="end"
          >
            {tick}
          </SvgText>
        ))}

        {/* X labels (day of week) */}
        {history.map((day, i) => {
          const date = new Date(day.date);
          const dayIdx = (date.getDay() + 6) % 7; // Monday=0
          return (
            <SvgText
              key={`xl-${i}`}
              x={toX(i)}
              y={CHART_H - 4}
              fontSize={9}
              fill={c.gray}
              textAnchor="middle"
            >
              {DAY_LABELS[dayIdx]}
            </SvgText>
          );
        })}

        {/* Mood line */}
        {moodPath && (
          <Path
            d={moodPath}
            fill="none"
            stroke={MOOD_PURPLE}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Energy line */}
        {energyPath && (
          <Path
            d={energyPath}
            fill="none"
            stroke={ENERGY_AMBER}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="4,3"
          />
        )}

        {/* NutriScore correlation dots */}
        {nutriDots.map((dot, i) =>
          dot ? (
            <SvgCircle
              key={`ns-${i}`}
              cx={dot.x}
              cy={dot.y}
              r={3}
              fill="#10B981"
              opacity={0.6}
            />
          ) : null,
        )}

        {/* Mood dots on data points */}
        {dailyAvgs.map((avg, i) =>
          avg ? (
            <SvgCircle
              key={`md-${i}`}
              cx={toX(i)}
              cy={toY(avg.mood)}
              r={3}
              fill={MOOD_PURPLE}
            />
          ) : null,
        )}
      </Svg>

      {/* Legend */}
      <View style={chartStyles.legend}>
        <View style={chartStyles.legendItem}>
          <View style={[chartStyles.legendDot, { backgroundColor: MOOD_PURPLE }]} />
          <Text style={[chartStyles.legendText, { color: c.gray }]}>Animo</Text>
        </View>
        <View style={chartStyles.legendItem}>
          <View style={[chartStyles.legendDash, { backgroundColor: ENERGY_AMBER }]} />
          <Text style={[chartStyles.legendText, { color: c.gray }]}>Energia</Text>
        </View>
        <View style={chartStyles.legendItem}>
          <View style={[chartStyles.legendDot, { backgroundColor: '#10B981' }]} />
          <Text style={[chartStyles.legendText, { color: c.gray }]}>NutriScore</Text>
        </View>
      </View>
    </View>
  );
});

const chartStyles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  title: {
    ...typography.label,
    fontWeight: '700',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendDash: {
    width: 12,
    height: 3,
    borderRadius: 1.5,
  },
  legendText: {
    fontSize: 10,
    fontWeight: '500',
  },
});

// ─── Main Component ─────────────────────────────────────────────────────────

export default function MoodTracker({
  initiallyCollapsed = true,
  nutriScore,
}: MoodTrackerProps) {
  const c = useThemeColors();
  const screenWidth = Dimensions.get('window').width;
  const chartWidth = screenWidth - spacing.lg * 2 - spacing.md * 2; // account for screen + card padding

  const today = todayStr();
  const currentTimeOfDay = getTimeOfDay();

  // State
  const [collapsed, setCollapsed] = useState(initiallyCollapsed);
  const [todayData, setTodayData] = useState<DailyMoodData>({ date: today });
  const [history, setHistory] = useState<DailyMoodData[]>([]);
  const [nutriScores, setNutriScores] = useState<(number | null)[]>([]);

  // Current time-of-day values
  const currentRecord = todayData[currentTimeOfDay] ?? { mood: 3, energy: 3, hunger: 3 };
  const [mood, setMood] = useState(currentRecord.mood);
  const [energy, setEnergy] = useState(currentRecord.energy);
  const [hunger, setHunger] = useState(currentRecord.hunger);

  // Track whether user has logged for current time-of-day
  const hasLogged = !!todayData[currentTimeOfDay];

  // Chevron animation
  const chevronAnim = useRef(new Animated.Value(initiallyCollapsed ? 0 : 1)).current;

  // Load data
  useEffect(() => {
    loadMoodHistory(7).then((h) => {
      setHistory(h);
      const todayEntry = h.find((d) => d.date === today);
      if (todayEntry) {
        setTodayData(todayEntry);
        const record = todayEntry[currentTimeOfDay];
        if (record) {
          setMood(record.mood);
          setEnergy(record.energy);
          setHunger(record.hunger);
        }
      }
    });

    // Load NutriScore correlation data (mock: use wellness storage)
    // In production, this would read from NutriScore daily history
    const loadNutriScores = async () => {
      const scores: (number | null)[] = [];
      const now = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        try {
          const raw = await AsyncStorage.getItem(NUTRI_SCORE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed.date === d.toISOString().split('T')[0]) {
              scores.push(parsed.score);
              continue;
            }
          }
        } catch {
          // ignore
        }
        scores.push(i === 0 ? (nutriScore ?? null) : null);
      }
      setNutriScores(scores);
    };
    loadNutriScores();
  }, [today, currentTimeOfDay, nutriScore]);

  // Toggle collapse
  const toggleCollapsed = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsed((prev) => {
      Animated.spring(chevronAnim, {
        toValue: prev ? 1 : 0,
        useNativeDriver: true,
        damping: 15,
        stiffness: 200,
      }).start();
      return !prev;
    });
    haptics.light();
  }, [chevronAnim]);

  const chevronRotation = chevronAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  // Save current time-of-day record
  const saveRecord = useCallback(async () => {
    haptics.medium();
    const record: MoodRecord = { mood, energy, hunger };
    const updated: DailyMoodData = {
      ...todayData,
      date: today,
      [currentTimeOfDay]: record,
    };
    setTodayData(updated);
    await saveDayMood(updated);

    // Update history
    setHistory((prev) =>
      prev.map((d) => (d.date === today ? updated : d)),
    );
  }, [mood, energy, hunger, todayData, today, currentTimeOfDay]);

  // Time-of-day completion indicators
  const completionDots = useMemo(() => {
    const times: TimeOfDay[] = ['morning', 'afternoon', 'night'];
    return times.map((t) => ({
      time: t,
      completed: !!todayData[t],
      current: t === currentTimeOfDay,
      ...TIME_LABELS[t],
    }));
  }, [todayData, currentTimeOfDay]);

  // NutriScore correlation summary
  const correlationText = useMemo(() => {
    if (!nutriScore || !hasLogged) return null;
    const avgMood = ((todayData.morning?.mood ?? 0) + (todayData.afternoon?.mood ?? 0) + (todayData.night?.mood ?? 0)) /
      [todayData.morning, todayData.afternoon, todayData.night].filter(Boolean).length;
    if (isNaN(avgMood)) return null;

    if (nutriScore >= 70 && avgMood >= 4) {
      return 'Tu buen animo coincide con buena nutricion hoy';
    }
    if (nutriScore < 40 && avgMood < 3) {
      return 'Tu bajo animo podria estar relacionado con la alimentacion';
    }
    return null;
  }, [nutriScore, todayData, hasLogged]);

  return (
    <View
      style={[s.card, { backgroundColor: c.surface, borderColor: c.grayLight }]}
      accessibilityLabel={`Mood Tracker. ${hasLogged ? 'Registrado' : 'Sin registrar'} para ${TIME_LABELS[currentTimeOfDay].label}`}
    >
      {/* Header */}
      <TouchableOpacity
        onPress={toggleCollapsed}
        style={s.headerRow}
        activeOpacity={0.7}
        accessibilityLabel={`Animo y energia. ${collapsed ? 'Toca para expandir' : 'Toca para colapsar'}`}
        accessibilityRole="button"
      >
        <View style={s.headerLeft}>
          <Ionicons name="happy-outline" size={18} color={MOOD_PURPLE} />
          <Text style={[s.headerTitle, { color: c.black }]}>Animo</Text>
        </View>

        {/* Mini completion dots */}
        <View style={s.completionDots}>
          {completionDots.map((dot) => (
            <View
              key={dot.time}
              style={[
                s.completionDot,
                {
                  backgroundColor: dot.completed ? MOOD_PURPLE : c.grayLight,
                  borderWidth: dot.current ? 2 : 0,
                  borderColor: dot.current ? MOOD_PURPLE + '60' : 'transparent',
                },
              ]}
              accessibilityLabel={`${dot.label}: ${dot.completed ? 'registrado' : 'pendiente'}`}
            />
          ))}
        </View>

        <Animated.View style={{ transform: [{ rotate: chevronRotation }] }}>
          <Ionicons name="chevron-down" size={20} color={c.gray} />
        </Animated.View>
      </TouchableOpacity>

      {/* Collapsed preview */}
      {collapsed && hasLogged && (
        <View style={s.previewRow}>
          <Text style={s.previewEmoji}>{getLevelEmoji(mood, 'mood')}</Text>
          <Text style={[s.previewText, { color: c.gray }]}>
            Animo: {getLevelLabel(mood, 'mood')} | Energia: {getLevelLabel(energy, 'energy')}
          </Text>
        </View>
      )}

      {/* Expanded content */}
      {!collapsed && (
        <View style={s.content}>
          {/* Time-of-day selector */}
          <View style={s.timeRow}>
            {completionDots.map((dot) => (
              <View
                key={dot.time}
                style={[
                  s.timePill,
                  {
                    backgroundColor: dot.current ? MOOD_PURPLE + '15' : 'transparent',
                    borderColor: dot.current ? MOOD_PURPLE : c.grayLight,
                  },
                ]}
              >
                <Ionicons
                  name={dot.icon as any}
                  size={14}
                  color={dot.current ? MOOD_PURPLE : c.gray}
                />
                <Text
                  style={[
                    s.timeLabel,
                    { color: dot.current ? MOOD_PURPLE : c.gray },
                  ]}
                >
                  {dot.label}
                </Text>
                {dot.completed && (
                  <Ionicons name="checkmark-circle" size={12} color="#10B981" />
                )}
              </View>
            ))}
          </View>

          {/* Sliders */}
          <View style={s.slidersSection}>
            <LevelSlider
              label="Animo"
              icon="happy-outline"
              color={MOOD_PURPLE}
              value={mood}
              type="mood"
              onChange={setMood}
              themeColors={c}
            />
            <LevelSlider
              label="Energia"
              icon="flash-outline"
              color={ENERGY_AMBER}
              value={energy}
              type="energy"
              onChange={setEnergy}
              themeColors={c}
            />
            <LevelSlider
              label="Hambre"
              icon="restaurant-outline"
              color={HUNGER_TEAL}
              value={hunger}
              type="hunger"
              onChange={setHunger}
              themeColors={c}
            />
          </View>

          {/* Save button */}
          <TouchableOpacity
            onPress={saveRecord}
            style={[
              s.saveBtn,
              { backgroundColor: MOOD_PURPLE },
            ]}
            activeOpacity={0.8}
            accessibilityLabel={`Guardar registro de ${TIME_LABELS[currentTimeOfDay].label}`}
            accessibilityRole="button"
          >
            <Ionicons name="checkmark" size={18} color="#FFFFFF" />
            <Text style={s.saveBtnText}>
              {hasLogged ? 'Actualizar' : 'Guardar'} {TIME_LABELS[currentTimeOfDay].label}
            </Text>
          </TouchableOpacity>

          {/* Correlation insight */}
          {correlationText && (
            <View style={[s.insightCard, { backgroundColor: '#10B981' + '10', borderColor: '#10B981' + '30' }]}>
              <Ionicons name="bulb-outline" size={14} color="#10B981" />
              <Text style={[s.insightText, { color: c.gray }]}>{correlationText}</Text>
            </View>
          )}

          {/* Weekly trend chart */}
          <TrendChart
            history={history}
            nutriScores={nutriScores}
            width={chartWidth}
            themeColors={c}
          />
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
    padding: spacing.md,
    marginBottom: spacing.md,
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
  completionDots: {
    flexDirection: 'row',
    gap: 6,
    flex: 1,
    justifyContent: 'center',
  },
  completionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  previewEmoji: {
    fontSize: 20,
  },
  previewText: {
    ...typography.caption,
    flex: 1,
  },
  content: {
    marginTop: spacing.md,
    gap: spacing.md,
  },
  timeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  timePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  timeLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  slidersSection: {
    gap: spacing.md,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
  },
  saveBtnText: {
    ...typography.bodyMd,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  insightCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  insightText: {
    ...typography.caption,
    flex: 1,
    lineHeight: 18,
  },
});
