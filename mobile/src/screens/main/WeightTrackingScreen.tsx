/**
 * WeightTrackingScreen — Weight history with SVG trend chart, BMI, goal line,
 * period change table, unit toggle (kg/lbs), and smooth animations.
 */
import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
  Animated,
  AccessibilityInfo,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import Svg, {
  Path,
  Defs,
  LinearGradient,
  Stop,
  Line,
  Circle,
  Text as SvgText,
} from 'react-native-svg';
import { colors, typography, spacing, radius, shadows, useLayout, useThemeColors } from '../../theme';
import { getOnboardingProfile } from '../../services/onboarding.service';
import { OnboardingProfileRead } from '../../types';
import { haptics } from '../../hooks/useHaptics';
import { useAnalytics } from '../../hooks/useAnalytics';
import {
  getWeightHistory,
  logWeight as apiLogWeight,
  WeightLogEntry,
} from '../../services/adaptiveCalorie.service';

// ─── Constants ───────────────────────────────────────────────────────────────

const KG_TO_LBS = 2.20462;

// ─── Types ───────────────────────────────────────────────────────────────────

interface WeightEntry {
  date: string; // YYYY-MM-DD
  weight: number; // always stored in kg internally
}

type Unit = 'kg' | 'lbs';
type PeriodFilter = '7D' | '30D' | '90D' | 'ALL';
const PERIOD_FILTERS: PeriodFilter[] = ['7D', '30D', '90D', 'ALL'];

// ─── Unit helpers ────────────────────────────────────────────────────────────

function toDisplay(kg: number, unit: Unit): number {
  return unit === 'lbs' ? Math.round(kg * KG_TO_LBS * 10) / 10 : kg;
}

function fromDisplay(val: number, unit: Unit): number {
  return unit === 'lbs' ? Math.round((val / KG_TO_LBS) * 10) / 10 : val;
}

function displayLabel(kg: number, unit: Unit, decimals = 1): string {
  return toDisplay(kg, unit).toFixed(decimals);
}

// ─── Demo data ───────────────────────────────────────────────────────────────

function generateDemoData(currentWeight: number, days = 90): WeightEntry[] {
  const entries: WeightEntry[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const trend = currentWeight + i * 0.05 + Math.sin(i * 0.7) * 0.3;
    entries.push({
      date: d.toISOString().slice(0, 10),
      weight: Math.round(trend * 10) / 10,
    });
  }
  return entries;
}

// ─── Period filtering ─────────────────────────────────────────────────────────

function filterByPeriod(entries: WeightEntry[], period: PeriodFilter): WeightEntry[] {
  if (period === 'ALL') return entries;
  const days = period === '7D' ? 7 : period === '30D' ? 30 : 90;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return entries.filter((e) => e.date >= cutoffStr);
}

// ─── Period change calculation ───────────────────────────────────────────────

interface PeriodChange {
  label: string;
  days: number;
  change: number | null; // kg
}

function calcPeriodChanges(entries: WeightEntry[]): PeriodChange[] {
  const periods = [
    { label: '3 days', days: 3 },
    { label: '7 days', days: 7 },
    { label: '30 days', days: 30 },
    { label: '90 days', days: 90 },
  ];

  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1];
  if (!latest) return periods.map((p) => ({ ...p, change: null }));

  return periods.map(({ label, days }) => {
    const cutoff = new Date(latest.date);
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const candidates = sorted.filter((e) => e.date <= cutoffStr);
    if (candidates.length === 0) return { label, days, change: null };
    const prior = candidates[candidates.length - 1];
    return { label, days, change: Math.round((latest.weight - prior.weight) * 10) / 10 };
  });
}

// ─── BMI helpers ──────────────────────────────────────────────────────────────

function calcBMI(weightKg: number, heightCm: number | null): number | null {
  if (!heightCm || heightCm <= 0) return null;
  const h = heightCm / 100;
  return Math.round((weightKg / (h * h)) * 10) / 10;
}

type BMICategory = 'Bajo peso' | 'Normal' | 'Sobrepeso' | 'Obesidad';

function bmiCategory(bmi: number): BMICategory {
  if (bmi < 18.5) return 'Bajo peso';
  if (bmi < 25) return 'Normal';
  if (bmi < 30) return 'Sobrepeso';
  return 'Obesidad';
}

function bmiColor(cat: BMICategory): string {
  switch (cat) {
    case 'Bajo peso': return '#F59E0B';
    case 'Normal':    return '#34A853';
    case 'Sobrepeso': return '#FB8C00';
    case 'Obesidad':  return '#EA4335';
  }
}

// ─── Chart ───────────────────────────────────────────────────────────────────

const CHART_HEIGHT = 210;
const CHART_PAD_TOP = 24;
const CHART_PAD_BOTTOM = 28;
const CHART_PAD_LEFT = 44;
const CHART_PAD_RIGHT = 16;

interface WeightChartProps {
  data: WeightEntry[];
  targetWeight: number | null; // kg
  unit: Unit;
  width: number;
}

const WeightChart = React.memo(function WeightChart({
  data,
  targetWeight,
  unit,
  width,
}: WeightChartProps) {
  if (data.length === 0) {
    return (
      <View
        style={[chartStyles.emptyWrap, { height: CHART_HEIGHT }]}
        accessibilityLabel="Sin datos de peso aun. Registra tu primer peso para ver el grafico."
        accessibilityRole="text"
      >
        <Ionicons name="analytics-outline" size={40} color={colors.grayLight} />
        <Text style={chartStyles.emptyTitle}>Sin datos aun</Text>
        <Text style={chartStyles.emptySubtitle}>
          Registra tu primer peso{'\n'}para ver la grafica de progreso
        </Text>
      </View>
    );
  }

  if (data.length === 1) {
    return (
      <View
        style={[chartStyles.emptyWrap, { height: CHART_HEIGHT }]}
        accessibilityLabel="Solo tienes un registro. Agrega mas mediciones para ver la tendencia."
        accessibilityRole="text"
      >
        <Ionicons name="git-commit-outline" size={40} color={colors.grayLight} />
        <Text style={chartStyles.emptyTitle}>1 registro</Text>
        <Text style={chartStyles.emptySubtitle}>
          Agrega al menos 2 registros{'\n'}para ver la linea de tendencia
        </Text>
      </View>
    );
  }

  const drawW = width - CHART_PAD_LEFT - CHART_PAD_RIGHT;
  const drawH = CHART_HEIGHT - CHART_PAD_TOP - CHART_PAD_BOTTOM;

  // Convert weights to display unit for chart axes
  const weights = data.map((d) => toDisplay(d.weight, unit));
  const targetDisp = targetWeight != null ? toDisplay(targetWeight, unit) : null;
  const allVals = targetDisp != null ? [...weights, targetDisp] : weights;

  const rawMin = Math.min(...allVals);
  const rawMax = Math.max(...allVals);
  const padding = Math.max((rawMax - rawMin) * 0.15, 0.5);
  const minW = rawMin - padding;
  const maxW = rawMax + padding;
  const range = maxW - minW || 1;

  const toX = (i: number) =>
    CHART_PAD_LEFT + (i / Math.max(data.length - 1, 1)) * drawW;
  const toY = (w: number) =>
    CHART_PAD_TOP + drawH - ((w - minW) / range) * drawH;

  // Smooth cubic bezier line path
  const linePath = data
    .map((d, i) => {
      const x = toX(i).toFixed(1);
      const y = toY(weights[i]).toFixed(1);
      if (i === 0) return `M${x},${y}`;
      const px = toX(i - 1);
      const py = toY(weights[i - 1]);
      const cx1 = (px + parseFloat(x)) / 2;
      return `C${cx1.toFixed(1)},${py.toFixed(1)} ${cx1.toFixed(1)},${y} ${x},${y}`;
    })
    .join(' ');

  const bottomY = (CHART_HEIGHT - CHART_PAD_BOTTOM).toFixed(1);
  const areaPath =
    linePath +
    ` L${toX(data.length - 1).toFixed(1)},${bottomY}` +
    ` L${toX(0).toFixed(1)},${bottomY} Z`;

  // Y-axis labels (4 ticks)
  const yTicks = 4;
  const yLabels = Array.from({ length: yTicks }, (_, i) => {
    const val = minW + (range * i) / (yTicks - 1);
    return { val, y: toY(val) };
  });

  // X-axis labels — show first, middle, last
  const xCount = Math.min(data.length, 3);
  const xIndices =
    data.length <= 3
      ? data.map((_, i) => i)
      : [0, Math.floor(data.length / 2), data.length - 1];

  const fmtDate = (iso: string) => {
    const [, m, d] = iso.split('-');
    return `${parseInt(d, 10)}/${parseInt(m, 10)}`;
  };

  const lastIdx = data.length - 1;
  const lastX = toX(lastIdx);
  const lastY = toY(weights[lastIdx]);

  // Target line
  const targetY = targetDisp != null ? toY(targetDisp) : null;

  // Determine trend direction for tooltip label
  const firstW = weights[0];
  const lastW = weights[lastIdx];
  const trendDown = lastW < firstW;

  return (
    <Svg
      width={width}
      height={CHART_HEIGHT}
      accessibilityLabel={`Grafico de peso. Primer valor: ${firstW.toFixed(1)} ${unit}. Ultimo valor: ${lastW.toFixed(1)} ${unit}.`}
      accessibilityRole="image"
    >
      <Defs>
        <LinearGradient id="wAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#4285F4" stopOpacity="0.28" />
          <Stop offset="1" stopColor="#4285F4" stopOpacity="0.01" />
        </LinearGradient>
      </Defs>

      {/* Grid lines */}
      {yLabels.map((t, i) => (
        <Line
          key={`gl-${i}`}
          x1={CHART_PAD_LEFT}
          y1={t.y}
          x2={width - CHART_PAD_RIGHT}
          y2={t.y}
          stroke={colors.grayLight}
          strokeWidth={0.5}
          strokeDasharray="4,4"
        />
      ))}

      {/* Y-axis labels */}
      {yLabels.map((t, i) => (
        <SvgText
          key={`yl-${i}`}
          x={CHART_PAD_LEFT - 6}
          y={t.y + 4}
          fontSize={10}
          fill={colors.gray}
          textAnchor="end"
        >
          {t.val.toFixed(1)}
        </SvgText>
      ))}

      {/* X-axis labels */}
      {xIndices.map((idx) => (
        <SvgText
          key={`xl-${idx}`}
          x={toX(idx)}
          y={CHART_HEIGHT - 6}
          fontSize={10}
          fill={colors.gray}
          textAnchor="middle"
        >
          {fmtDate(data[idx].date)}
        </SvgText>
      ))}

      {/* Goal weight line */}
      {targetY != null && (
        <>
          <Line
            x1={CHART_PAD_LEFT}
            y1={targetY}
            x2={width - CHART_PAD_RIGHT}
            y2={targetY}
            stroke="#34A853"
            strokeWidth={1.5}
            strokeDasharray="6,4"
          />
          <SvgText
            x={width - CHART_PAD_RIGHT - 2}
            y={targetY - 5}
            fontSize={9}
            fill="#34A853"
            textAnchor="end"
            fontWeight="700"
          >
            Meta {targetDisp!.toFixed(1)} {unit}
          </SvgText>
        </>
      )}

      {/* Area gradient fill */}
      <Path d={areaPath} fill="url(#wAreaGrad)" />

      {/* Trend line */}
      <Path
        d={linePath}
        fill="none"
        stroke="#4285F4"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Latest value dot + tooltip */}
      <Circle cx={lastX} cy={lastY} r={6} fill="#4285F4" opacity={0.18} />
      <Circle cx={lastX} cy={lastY} r={4} fill="#4285F4" />
      <Circle cx={lastX} cy={lastY} r={2} fill="#FFFFFF" />

      {/* Latest weight callout bubble */}
      {(() => {
        const label = `${lastW.toFixed(1)} ${unit}`;
        const bubbleX = Math.min(lastX + 8, width - CHART_PAD_RIGHT - 52);
        const bubbleY = Math.max(lastY - 24, CHART_PAD_TOP);
        return (
          <>
            <SvgText
              x={bubbleX}
              y={bubbleY}
              fontSize={11}
              fill="#4285F4"
              fontWeight="700"
            >
              {label}
            </SvgText>
          </>
        );
      })()}
    </Svg>
  );
});

const chartStyles = StyleSheet.create({
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: {
    ...typography.label,
    color: colors.gray,
  },
  emptySubtitle: {
    ...typography.caption,
    color: colors.disabled,
    textAlign: 'center',
    lineHeight: 18,
  },
});

// ─── BMI Bar ─────────────────────────────────────────────────────────────────

function BMIBar({ bmi, category }: { bmi: number; category: BMICategory }) {
  // BMI display range: 14 – 40
  const MIN_BMI = 14;
  const MAX_BMI = 40;
  const pct = Math.max(0, Math.min(1, (bmi - MIN_BMI) / (MAX_BMI - MIN_BMI)));
  const color = bmiColor(category);

  return (
    <View style={bmiStyles.wrap} accessibilityLabel={`IMC ${bmi.toFixed(1)}, categoria ${category}`}>
      <View style={bmiStyles.scaleWrap}>
        {/* Colored zones */}
        <View style={[bmiStyles.zone, { backgroundColor: '#F59E0B', borderRadius: 4 }]} />
        <View style={[bmiStyles.zone, { backgroundColor: '#34A853' }]} />
        <View style={[bmiStyles.zone, { backgroundColor: '#FB8C00' }]} />
        <View style={[bmiStyles.zone, { backgroundColor: '#EA4335', borderRadius: 4 }]} />
        {/* Pointer */}
        <View style={[bmiStyles.pointer, { left: `${pct * 100}%`, backgroundColor: color }]} />
      </View>
      <View style={bmiStyles.labelRow}>
        <Text style={bmiStyles.zoneLabel}>Bajo</Text>
        <Text style={bmiStyles.zoneLabel}>Normal</Text>
        <Text style={bmiStyles.zoneLabel}>Sobre</Text>
        <Text style={bmiStyles.zoneLabel}>Obeso</Text>
      </View>
    </View>
  );
}

const bmiStyles = StyleSheet.create({
  wrap: { width: '100%' },
  scaleWrap: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'visible',
    position: 'relative',
    marginBottom: 4,
  },
  zone: { flex: 1, height: 8 },
  pointer: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    top: -3,
    marginLeft: -7,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  zoneLabel: {
    ...typography.caption,
    fontSize: 10,
    color: colors.gray,
    flex: 1,
    textAlign: 'center',
  },
});

// ─── Period Change Row ───────────────────────────────────────────────────────

function PeriodChangeRow({
  label,
  change,
  unit,
  maxAbs,
}: {
  label: string;
  change: number | null;
  unit: Unit;
  maxAbs: number;
}) {
  if (change === null) {
    return (
      <View style={changeRowStyles.row}>
        <Text style={changeRowStyles.label}>{label}</Text>
        <View style={changeRowStyles.barWrap}>
          <View style={[changeRowStyles.bar, { width: '0%', backgroundColor: colors.disabled }]} />
        </View>
        <Text style={[changeRowStyles.value, { color: colors.disabled }]}>—</Text>
      </View>
    );
  }

  const displayChange = toDisplay(change, unit);
  const absVal = Math.abs(displayChange);
  const barPct = maxAbs > 0 ? Math.max((absVal / maxAbs) * 100, 3) : 3;
  const isLoss = displayChange < 0;
  const isZero = displayChange === 0;
  const sign = displayChange > 0 ? '+' : '';
  const barColor = isLoss ? '#34A853' : isZero ? colors.disabled : '#EA4335';
  const textColor = isLoss ? '#34A853' : isZero ? colors.gray : '#EA4335';

  return (
    <View
      style={changeRowStyles.row}
      accessibilityLabel={`Cambio en ${label}: ${sign}${displayChange.toFixed(1)} ${unit}`}
    >
      <Text style={changeRowStyles.label}>{label}</Text>
      <View style={changeRowStyles.barWrap}>
        <View style={[changeRowStyles.bar, { width: `${barPct}%`, backgroundColor: barColor }]} />
      </View>
      <Text style={[changeRowStyles.value, { color: textColor }]}>
        {`${sign}${displayChange.toFixed(1)} ${unit}`}
      </Text>
    </View>
  );
}

const changeRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.grayLight,
  },
  label: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.gray,
    width: 68,
  },
  barWrap: {
    flex: 1,
    height: 8,
    backgroundColor: colors.surface,
    borderRadius: 4,
    marginHorizontal: spacing.sm,
    overflow: 'hidden',
  },
  bar: {
    height: 8,
    borderRadius: 4,
  },
  value: {
    ...typography.caption,
    fontWeight: '700',
    width: 76,
    textAlign: 'right',
  },
});

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function WeightTrackingScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { sidePadding, innerWidth } = useLayout();
  const c = useThemeColors();
  const { track } = useAnalytics('WeightTracking');

  // ── State ──
  const [profile, setProfile] = useState<OnboardingProfileRead | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [isDemoData, setIsDemoData] = useState(false);

  const [weightInput, setWeightInput] = useState('');
  const [unit, setUnit] = useState<Unit>('kg');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('30D');
  const [savingWeight, setSavingWeight] = useState(false);
  const [progressPhotos, setProgressPhotos] = useState<{ uri: string; date: string }[]>([]);

  // ── Animated values ──
  const chartScaleAnim = useRef(new Animated.Value(1)).current;
  const inputFocusAnim = useRef(new Animated.Value(0)).current;

  // ── Load data ──
  React.useEffect(() => {
    const loadData = async () => {
      try {
        const [profileResult, weightResult] = await Promise.allSettled([
          getOnboardingProfile(),
          getWeightHistory(365),
        ]);

        let prof: OnboardingProfileRead | null = null;
        if (profileResult.status === 'fulfilled') {
          prof = profileResult.value;
          setProfile(prof);
          // Respect stored unit preference
          if (prof.unit_system === 'imperial') setUnit('lbs');
        } else {
          console.warn('[WeightTracking] Failed to load profile:', profileResult.reason);
        }

        if (weightResult.status === 'fulfilled' && weightResult.value.length > 0) {
          setEntries(
            weightResult.value.map((e: WeightLogEntry) => ({
              date: e.date,
              weight: e.weight_kg,
            }))
          );
          setIsDemoData(false);
        } else {
          if (weightResult.status === 'rejected') {
            console.warn('[WeightTracking] Failed to load weight history:', weightResult.reason);
          }
          const fallbackWeight = prof?.weight_kg ?? 75;
          setEntries(generateDemoData(fallbackWeight, 60));
          setIsDemoData(true);
        }
      } catch (err) {
        console.error('[WeightTracking] Unexpected error during data load:', err);
        setEntries(generateDemoData(75, 60));
        setIsDemoData(true);
      } finally {
        setProfileLoaded(true);
      }
    };
    loadData();
  }, []);

  // ── Derived values ──
  const targetWeight = profile?.target_weight_kg ?? null; // kg
  const heightCm = profile?.height_cm ?? null;

  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => a.date.localeCompare(b.date)),
    [entries]
  );

  const latestEntry = sortedEntries[sortedEntries.length - 1] ?? null;
  const latestWeightKg = latestEntry?.weight ?? (profile?.weight_kg ?? 75);

  const filteredEntries = useMemo(
    () => filterByPeriod(sortedEntries, periodFilter),
    [sortedEntries, periodFilter]
  );

  const bmiVal = calcBMI(latestWeightKg, heightCm);
  const bmiCat = bmiVal != null ? bmiCategory(bmiVal) : null;

  const diffKg =
    targetWeight != null ? Math.round((latestWeightKg - targetWeight) * 10) / 10 : null;
  const goalReached = diffKg != null && Math.abs(diffKg) < 0.2;

  const periodChanges = useMemo(() => calcPeriodChanges(sortedEntries), [sortedEntries]);
  const maxAbsChange = useMemo(
    () =>
      Math.max(
        ...periodChanges.map((p) =>
          p.change != null ? Math.abs(toDisplay(p.change, unit)) : 0
        ),
        0.1
      ),
    [periodChanges, unit]
  );

  // ── Unit toggle ──
  const handleUnitToggle = useCallback(() => {
    haptics.light();
    setUnit((u) => (u === 'kg' ? 'lbs' : 'kg'));
    // Clear input to avoid stale display value confusion
    setWeightInput('');
    track('unit_toggled', { to: unit === 'kg' ? 'lbs' : 'kg' });
  }, [unit, track]);

  // ── Period filter ──
  const handlePeriodFilter = useCallback(
    (p: PeriodFilter) => {
      haptics.light();
      setPeriodFilter(p);
      // Pulse chart on filter change
      Animated.sequence([
        Animated.timing(chartScaleAnim, { toValue: 0.97, duration: 80, useNativeDriver: true }),
        Animated.spring(chartScaleAnim, { toValue: 1, friction: 6, useNativeDriver: true }),
      ]).start();
      track('period_filter_changed', { period: p });
    },
    [chartScaleAnim, track]
  );

  // ── Input focus animation ──
  const handleInputFocus = useCallback(() => {
    Animated.timing(inputFocusAnim, { toValue: 1, duration: 150, useNativeDriver: false }).start();
  }, [inputFocusAnim]);

  const handleInputBlur = useCallback(() => {
    Animated.timing(inputFocusAnim, { toValue: 0, duration: 150, useNativeDriver: false }).start();
  }, [inputFocusAnim]);

  const inputBorderColor = inputFocusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [c.grayLight, c.accent],
  });

  // ── Refresh weight history from backend ──
  const refreshWeightHistory = useCallback(async () => {
    try {
      const freshEntries = await getWeightHistory(365);
      if (freshEntries.length > 0) {
        setEntries(
          freshEntries.map((e: WeightLogEntry) => ({
            date: e.date,
            weight: e.weight_kg,
          }))
        );
        setIsDemoData(false);
      }
    } catch (err) {
      console.warn('[WeightTracking] Failed to refresh weight history:', err);
    }
  }, []);

  // ── Log weight ──
  const handleLogWeight = useCallback(async () => {
    const raw = parseFloat(weightInput.replace(',', '.'));
    if (isNaN(raw) || raw <= 0) {
      haptics.error();
      Alert.alert('Peso invalido', `Ingresa un valor valido en ${unit}.`);
      return;
    }

    const minDisplay = unit === 'lbs' ? 44 : 20;
    const maxDisplay = unit === 'lbs' ? 1100 : 500;
    if (raw < minDisplay || raw > maxDisplay) {
      haptics.error();
      Alert.alert('Valor fuera de rango', `El peso debe estar entre ${minDisplay} y ${maxDisplay} ${unit}.`);
      return;
    }

    const weightKg = fromDisplay(raw, unit);

    setSavingWeight(true);
    try {
      const result = await apiLogWeight({ weight_kg: weightKg, source: 'manual' });
      haptics.success();
      track('weight_logged', { weight_kg: weightKg, unit });

      // Optimistic update: replace demo data entirely or append to real data
      const today = result.date;
      setEntries((prev) => {
        // If we were showing demo data, start fresh with just this entry
        if (isDemoData) {
          return [{ date: today, weight: Math.round(weightKg * 10) / 10 }];
        }
        // Otherwise append/update in the existing real entries
        const filtered = prev.filter((e) => e.date !== today);
        return [...filtered, { date: today, weight: Math.round(weightKg * 10) / 10 }];
      });
      setIsDemoData(false);
      setWeightInput('');

      // Re-fetch full history from backend to ensure consistency
      refreshWeightHistory();

      // Animate chart update
      Animated.sequence([
        Animated.timing(chartScaleAnim, { toValue: 0.96, duration: 100, useNativeDriver: true }),
        Animated.spring(chartScaleAnim, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
      ]).start();

      // Announce to screen readers
      AccessibilityInfo.announceForAccessibility(
        `Peso registrado: ${raw.toFixed(1)} ${unit}`
      );
    } catch (err: unknown) {
      haptics.error();
      const errorMsg =
        err instanceof Error ? err.message : 'No se pudo guardar el peso. Intenta de nuevo.';
      console.error('[WeightTracking] Failed to log weight:', err);
      Alert.alert('Error', errorMsg);
    } finally {
      setSavingWeight(false);
    }
  }, [weightInput, unit, isDemoData, chartScaleAnim, track, refreshWeightHistory]);

  // ── Progress photos ──
  const handleAddPhoto = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
      aspect: [3, 4],
    });
    if (!result.canceled && result.assets[0]) {
      haptics.success();
      track('photo_uploaded', { source: 'library' });
      setProgressPhotos((prev) => [
        { uri: result.assets[0].uri, date: new Date().toISOString().slice(0, 10) },
        ...prev,
      ]);
    }
  }, [track]);

  const handleTakePhoto = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a la camara para tomar fotos de progreso.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      allowsEditing: true,
      aspect: [3, 4],
    });
    if (!result.canceled && result.assets[0]) {
      haptics.success();
      track('photo_taken');
      setProgressPhotos((prev) => [
        { uri: result.assets[0].uri, date: new Date().toISOString().slice(0, 10) },
        ...prev,
      ]);
    }
  }, [track]);

  // ── Goal progress banner ──
  const renderGoalBanner = () => {
    if (diffKg == null) return null;
    if (goalReached) {
      return (
        <View
          style={[ss.goalBanner, { backgroundColor: '#E8F5E9' }]}
          accessibilityLabel="Meta de peso alcanzada"
          accessibilityRole="alert"
        >
          <Ionicons name="trophy" size={18} color="#34A853" />
          <Text style={[ss.goalBannerText, { color: '#1B5E20' }]}>
            Meta alcanzada — excelente trabajo!
          </Text>
        </View>
      );
    }

    const dispDiff = toDisplay(Math.abs(diffKg), unit);
    const losing = diffKg > 0; // above target = still needs to lose
    const gaining = diffKg < 0; // below target = still needs to gain

    return (
      <View
        style={[ss.goalBanner, { backgroundColor: c.accent + '14' }]}
        accessibilityLabel={`Faltan ${dispDiff.toFixed(1)} ${unit} para la meta`}
        accessibilityRole="text"
      >
        <Ionicons name="flag-outline" size={18} color={c.accent} />
        <Text style={[ss.goalBannerText, { color: c.accent }]}>
          {losing
            ? `Faltan ${dispDiff.toFixed(1)} ${unit} para tu meta`
            : `${dispDiff.toFixed(1)} ${unit} por encima de la meta`}
        </Text>
      </View>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={[ss.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={[ss.header, { paddingHorizontal: sidePadding }]} accessibilityRole="header">
        <TouchableOpacity
          style={[ss.backBtn, { backgroundColor: c.surface }]}
          onPress={() => { haptics.light(); navigation.goBack(); }}
          activeOpacity={0.7}
          accessibilityLabel="Volver"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={20} color={c.black} />
        </TouchableOpacity>
        <Text style={[ss.headerTitle, { color: c.black }]} accessibilityRole="header">
          Historial de peso
        </Text>
        {/* Unit toggle pill */}
        <TouchableOpacity
          style={[ss.unitToggle, { backgroundColor: c.surface }]}
          onPress={handleUnitToggle}
          activeOpacity={0.7}
          accessibilityLabel={`Cambiar unidad a ${unit === 'kg' ? 'libras' : 'kilogramos'}`}
          accessibilityRole="button"
          accessibilityHint="Activa para alternar entre kg y lbs"
        >
          <Text style={[ss.unitToggleText, unit === 'kg' && { color: c.accent }, { fontWeight: unit === 'kg' ? '700' : '400' }]}>kg</Text>
          <Text style={[ss.unitToggleSep, { color: c.disabled }]}>|</Text>
          <Text style={[ss.unitToggleText, unit === 'lbs' && { color: c.accent }, { fontWeight: unit === 'lbs' ? '700' : '400' }]}>lbs</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          bounces
          overScrollMode="never"
          contentContainerStyle={[ss.scroll, { paddingHorizontal: sidePadding }]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Demo data notice */}
          {isDemoData && profileLoaded && (
            <View
              style={[ss.demoNotice, { backgroundColor: '#FFF8E1', borderColor: '#FFD54F' }]}
              accessibilityRole="alert"
              accessibilityLabel="Datos de ejemplo. Registra tu peso real para ver tu progreso."
            >
              <Ionicons name="information-circle-outline" size={16} color="#F59E0B" />
              <Text style={ss.demoNoticeText}>Datos de ejemplo — registra tu peso real</Text>
            </View>
          )}

          {/* Stats row */}
          <View style={ss.statsRow}>
            {/* Current weight */}
            <View
              style={[ss.statCard, { backgroundColor: c.surface }]}
              accessibilityLabel={`Peso actual: ${displayLabel(latestWeightKg, unit)} ${unit}`}
            >
              <Text style={[ss.statLabel, { color: c.gray }]}>Actual</Text>
              <Text style={[ss.statValue, { color: c.black }]}>
                {displayLabel(latestWeightKg, unit)}
              </Text>
              <Text style={[ss.statUnit, { color: c.gray }]}>{unit}</Text>
            </View>

            {/* Goal weight */}
            <View
              style={[ss.statCard, { backgroundColor: c.surface }]}
              accessibilityLabel={targetWeight != null ? `Meta: ${displayLabel(targetWeight, unit)} ${unit}` : 'Sin meta definida'}
            >
              <Text style={[ss.statLabel, { color: c.gray }]}>Meta</Text>
              <Text style={[ss.statValue, { color: c.black }]}>
                {targetWeight != null ? displayLabel(targetWeight, unit) : '—'}
              </Text>
              <Text style={[ss.statUnit, { color: c.gray }]}>
                {targetWeight != null ? unit : ''}
              </Text>
            </View>

            {/* Difference */}
            <View
              style={[ss.statCard, { backgroundColor: c.surface }]}
              accessibilityLabel={
                diffKg != null
                  ? `Diferencia con meta: ${diffKg > 0 ? '+' : ''}${displayLabel(diffKg, unit)} ${unit}`
                  : 'Sin diferencia disponible'
              }
            >
              <Text style={[ss.statLabel, { color: c.gray }]}>Diferencia</Text>
              <Text
                style={[
                  ss.statValue,
                  { color: c.black },
                  goalReached && { color: '#34A853' },
                  diffKg != null && diffKg > 0 && !goalReached && { color: '#EA4335' },
                ]}
              >
                {diffKg != null
                  ? goalReached
                    ? 'Meta!'
                    : `${diffKg > 0 ? '+' : ''}${displayLabel(diffKg, unit)}`
                  : '—'}
              </Text>
              <Text style={[ss.statUnit, { color: c.gray }]}>
                {diffKg != null && !goalReached ? unit : ''}
              </Text>
            </View>

            {/* BMI */}
            <View
              style={[ss.statCard, { backgroundColor: c.surface }]}
              accessibilityLabel={bmiVal != null ? `IMC: ${bmiVal.toFixed(1)}, ${bmiCat}` : 'IMC no disponible'}
            >
              <Text style={[ss.statLabel, { color: c.gray }]}>IMC</Text>
              <Text style={[ss.statValue, { color: bmiVal != null ? bmiColor(bmiCat!) : c.black }]}>
                {bmiVal != null ? bmiVal.toFixed(1) : '—'}
              </Text>
              <Text style={[ss.statUnit, { color: bmiVal != null ? bmiColor(bmiCat!) : c.gray, fontSize: 10 }]}>
                {bmiCat ?? ''}
              </Text>
            </View>
          </View>

          {/* Goal banner */}
          {renderGoalBanner()}

          {/* ── Chart section ── */}
          <View style={ss.sectionHeader}>
            <Text style={[ss.sectionTitle, { color: c.black }]}>Progreso de peso</Text>
            {/* Period filter pills */}
            <View style={ss.filterRow}>
              {PERIOD_FILTERS.map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[
                    ss.filterPill,
                    { backgroundColor: c.surface },
                    periodFilter === p && { backgroundColor: c.accent },
                  ]}
                  onPress={() => handlePeriodFilter(p)}
                  activeOpacity={0.7}
                  accessibilityLabel={`Ver ${p}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: periodFilter === p }}
                >
                  <Text
                    style={[
                      ss.filterPillText,
                      { color: c.gray },
                      periodFilter === p && { color: '#FFFFFF' },
                    ]}
                  >
                    {p}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <Animated.View
            style={[
              ss.chartCard,
              { backgroundColor: c.bg, borderColor: c.grayLight },
              { transform: [{ scale: chartScaleAnim }] },
            ]}
          >
            <WeightChart
              data={filteredEntries}
              targetWeight={targetWeight}
              unit={unit}
              width={innerWidth}
            />
          </Animated.View>

          {/* ── BMI detail card ── */}
          {bmiVal != null && bmiCat != null && (
            <View
              style={[ss.bmiCard, { backgroundColor: c.surface }]}
              accessibilityLabel={`IMC ${bmiVal.toFixed(1)}, clasificado como ${bmiCat}`}
            >
              <View style={ss.bmiTopRow}>
                <View>
                  <Text style={[ss.bmiTitle, { color: c.black }]}>Indice de Masa Corporal</Text>
                  <Text style={[ss.bmiSub, { color: c.gray }]}>
                    Basado en {heightCm} cm / {displayLabel(latestWeightKg, unit)} {unit}
                  </Text>
                </View>
                <View style={[ss.bmiBadge, { backgroundColor: bmiColor(bmiCat) + '20' }]}>
                  <Text style={[ss.bmiBadgeVal, { color: bmiColor(bmiCat) }]}>
                    {bmiVal.toFixed(1)}
                  </Text>
                  <Text style={[ss.bmiBadgeCat, { color: bmiColor(bmiCat) }]}>{bmiCat}</Text>
                </View>
              </View>
              <BMIBar bmi={bmiVal} category={bmiCat} />
            </View>
          )}

          {/* ── Weight Changes Table ── */}
          <Text style={[ss.sectionTitle, { color: c.black }]}>Cambios por periodo</Text>
          <View style={[ss.changesCard, { backgroundColor: c.bg, borderColor: c.grayLight }]}>
            {periodChanges.map((pc) => (
              <PeriodChangeRow
                key={pc.label}
                label={pc.label}
                change={pc.change}
                unit={unit}
                maxAbs={maxAbsChange}
              />
            ))}
          </View>

          {/* ── Log weight input ── */}
          <Text style={[ss.sectionTitle, { color: c.black }]}>Registrar peso</Text>
          <View style={[ss.inputCard, { backgroundColor: c.bg, borderColor: c.grayLight }]}>
            <Animated.View
              style={[
                ss.inputRow,
                { backgroundColor: c.surface, borderWidth: 1.5, borderColor: inputBorderColor },
              ]}
            >
              <Ionicons name="scale-outline" size={20} color={c.gray} />
              <TextInput
                style={[ss.input, { color: c.black }]}
                placeholder={unit === 'kg' ? 'Ej: 72.5' : 'Ej: 160.0'}
                placeholderTextColor={c.disabled}
                keyboardType="decimal-pad"
                value={weightInput}
                onChangeText={(t) => {
                  // Allow only digits, comma, period
                  const cleaned = t.replace(/[^0-9.,]/g, '');
                  setWeightInput(cleaned);
                }}
                returnKeyType="done"
                onSubmitEditing={handleLogWeight}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                maxLength={7}
                accessibilityLabel={`Campo de entrada de peso en ${unit}`}
                accessibilityHint="Ingresa tu peso actual y presiona registrar"
              />
              {/* Unit toggle inside input */}
              <TouchableOpacity
                onPress={handleUnitToggle}
                style={[ss.inputUnitBtn, { backgroundColor: c.accent + '15' }]}
                accessibilityLabel={`Unidad actual: ${unit}. Toca para cambiar`}
                accessibilityRole="button"
              >
                <Text style={[ss.inputUnitText, { color: c.accent }]}>{unit}</Text>
              </TouchableOpacity>
            </Animated.View>

            <TouchableOpacity
              style={[
                ss.logBtn,
                { backgroundColor: c.black },
                (!weightInput || savingWeight) && { backgroundColor: c.disabled },
              ]}
              onPress={handleLogWeight}
              activeOpacity={0.8}
              disabled={!weightInput || savingWeight}
              accessibilityLabel={savingWeight ? 'Guardando peso' : 'Registrar peso'}
              accessibilityRole="button"
              accessibilityState={{ disabled: !weightInput || savingWeight, busy: savingWeight }}
            >
              <Ionicons
                name={savingWeight ? 'hourglass-outline' : 'add-circle-outline'}
                size={18}
                color="#FFFFFF"
              />
              <Text style={ss.logBtnText}>
                {savingWeight ? 'Guardando...' : 'Registrar peso'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── Recent entries ── */}
          <Text style={[ss.sectionTitle, { color: c.black }]}>Registros recientes</Text>
          <View
            style={[ss.entriesCard, { backgroundColor: c.bg, borderColor: c.grayLight }]}
            accessibilityLabel="Lista de registros de peso recientes"
          >
            {sortedEntries.length === 0 ? (
              <View style={ss.entriesEmpty}>
                <Text style={[ss.entriesEmptyText, { color: c.gray }]}>
                  Aun no hay registros
                </Text>
              </View>
            ) : (
              sortedEntries
                .slice(-10)
                .reverse()
                .map((entry, i) => {
                  const d = new Date(entry.date + 'T00:00:00');
                  const dayStr = d.toLocaleDateString('es-CL', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  });
                  const isToday = entry.date === new Date().toISOString().slice(0, 10);

                  return (
                    <View
                      key={entry.date}
                      style={[
                        ss.entryRow,
                        { borderTopColor: c.surface },
                        i === 0 && ss.entryRowFirst,
                      ]}
                      accessibilityLabel={`${dayStr}: ${displayLabel(entry.weight, unit)} ${unit}${isToday ? ', hoy' : ''}`}
                    >
                      <View style={ss.entryDateWrap}>
                        <Text style={[ss.entryDate, { color: c.black }]}>{dayStr}</Text>
                        {isToday && (
                          <View style={[ss.todayBadge, { backgroundColor: c.accent + '18' }]}>
                            <Text style={[ss.todayBadgeText, { color: c.accent }]}>Hoy</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[ss.entryWeight, { color: c.gray }]}>
                        {displayLabel(entry.weight, unit)} {unit}
                      </Text>
                    </View>
                  );
                })
            )}
          </View>

          {/* ── Progress Photos ── */}
          <Text style={[ss.sectionTitle, { color: c.black }]}>Fotos de progreso</Text>
          <View style={[ss.photosCard, { backgroundColor: c.bg, borderColor: c.grayLight }]}>
            <View style={ss.photoBtnsRow}>
              <TouchableOpacity
                style={[ss.photoBtn, { backgroundColor: c.accent }]}
                onPress={handleTakePhoto}
                activeOpacity={0.8}
                accessibilityLabel="Tomar una foto con la camara"
                accessibilityRole="button"
              >
                <Ionicons name="camera-outline" size={18} color="#FFF" />
                <Text style={ss.photoBtnText}>Tomar foto</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  ss.photoBtn,
                  { backgroundColor: c.surface, borderWidth: 1, borderColor: c.grayLight },
                ]}
                onPress={handleAddPhoto}
                activeOpacity={0.8}
                accessibilityLabel="Seleccionar una foto de la galeria"
                accessibilityRole="button"
              >
                <Ionicons name="images-outline" size={18} color={c.black} />
                <Text style={[ss.photoBtnText, { color: c.black }]}>Galeria</Text>
              </TouchableOpacity>
            </View>

            {progressPhotos.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={ss.photosScroll}
                accessibilityLabel="Galeria de fotos de progreso"
              >
                {progressPhotos.map((photo, i) => (
                  <View key={i} style={ss.photoItem}>
                    <View>
                      <Image
                        source={{ uri: photo.uri }}
                        style={[ss.photoImage, { borderColor: c.grayLight }]}
                        accessibilityLabel={`Foto de progreso del ${photo.date}`}
                      />
                      <TouchableOpacity
                        style={ss.photoDeleteBtn}
                        onPress={() => {
                          haptics.medium();
                          Alert.alert(
                            'Eliminar foto',
                            'Seguro que quieres eliminar esta foto?',
                            [
                              { text: 'Cancelar', style: 'cancel' },
                              {
                                text: 'Eliminar',
                                style: 'destructive',
                                onPress: () =>
                                  setProgressPhotos((prev) =>
                                    prev.filter((_, idx) => idx !== i)
                                  ),
                              },
                            ]
                          );
                        }}
                        accessibilityLabel="Eliminar foto"
                        accessibilityRole="button"
                        activeOpacity={0.7}
                      >
                        <Ionicons name="close" size={12} color="#FFF" />
                      </TouchableOpacity>
                    </View>
                    <Text style={[ss.photoDate, { color: c.gray }]}>
                      {photo.date.slice(5).replace('-', '/')}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <View style={ss.photosEmpty} accessibilityLabel="Sin fotos de progreso aun">
                <Ionicons name="body-outline" size={32} color={c.disabled} />
                <Text style={[ss.photosEmptyText, { color: c.gray }]}>
                  Sube fotos para ver tu progreso visual
                </Text>
              </View>
            )}
          </View>

          <View style={{ height: spacing.xl + insets.bottom }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  screen: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { ...typography.titleSm },
  unitToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  unitToggleText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.gray,
  },
  unitToggleSep: {
    ...typography.caption,
    marginHorizontal: 2,
  },

  scroll: { paddingTop: spacing.md },

  // Demo notice
  demoNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  demoNoticeText: {
    ...typography.caption,
    color: '#F59E0B',
    fontWeight: '600',
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statCard: {
    flex: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    alignItems: 'center',
    gap: 2,
  },
  statLabel: { ...typography.caption, textAlign: 'center' },
  statValue: { ...typography.titleSm, textAlign: 'center' },
  statUnit: { ...typography.caption, minHeight: 14, textAlign: 'center' },

  // Goal banner
  goalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.md,
  },
  goalBannerText: {
    ...typography.label,
    flex: 1,
  },

  // Section header (title + filter pills inline)
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    ...typography.label,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 6,
  },
  filterPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  filterPillText: {
    ...typography.caption,
    fontWeight: '600',
  },

  // Chart
  chartCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.sm,
    marginBottom: spacing.md,
    overflow: 'hidden',
    ...shadows.sm,
  },

  // BMI card
  bmiCard: {
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.md,
    ...shadows.sm,
  },
  bmiTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  bmiTitle: {
    ...typography.label,
    marginBottom: 2,
  },
  bmiSub: {
    ...typography.caption,
  },
  bmiBadge: {
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    minWidth: 70,
  },
  bmiBadgeVal: {
    fontSize: 22,
    fontWeight: '800',
  },
  bmiBadgeCat: {
    ...typography.caption,
    fontWeight: '600',
  },

  // Changes table
  changesCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    marginBottom: spacing.md,
    ...shadows.sm,
  },

  // Input
  inputCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.md,
    ...shadows.sm,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 52,
  },
  input: {
    flex: 1,
    ...typography.body,
    height: 52,
  },
  inputUnitBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  inputUnitText: {
    ...typography.label,
    fontWeight: '700',
  },
  logBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.full,
    height: 52,
  },
  logBtnText: {
    ...typography.button,
    color: colors.white,
  },

  // Entries
  entriesCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  entriesEmpty: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  entriesEmptyText: {
    ...typography.caption,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    borderTopWidth: 1,
  },
  entryRowFirst: { borderTopWidth: 0 },
  entryDateWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  entryDate: { ...typography.bodyMd },
  todayBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  todayBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  entryWeight: { ...typography.label },

  // Photos
  photosCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.md,
    ...shadows.sm,
  },
  photoBtnsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  photoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.md,
    height: 44,
  },
  photoBtnText: {
    ...typography.label,
    color: '#FFFFFF',
  },
  photosScroll: { marginTop: spacing.xs },
  photoItem: {
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  photoImage: {
    width: 80,
    height: 107,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  photoDeleteBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoDate: {
    ...typography.caption,
    marginTop: 4,
  },
  photosEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  photosEmptyText: {
    ...typography.caption,
    textAlign: 'center',
    maxWidth: 200,
  },
});
