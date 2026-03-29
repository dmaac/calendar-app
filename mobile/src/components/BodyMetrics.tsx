/**
 * BodyMetrics -- Body measurement tracking with trend line charts.
 *
 * Features:
 * 1. Track: weight (kg), body fat (%), waist (cm), chest (cm), arms (cm)
 * 2. Numeric keypad input with increment/decrement buttons
 * 3. SVG line chart with 12-week trend per metric
 * 4. Persisted in AsyncStorage
 * 5. Full dark mode support via ThemeContext
 *
 * Uses: react-native-svg, AsyncStorage, theme system, haptics, analytics.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  Dimensions,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, {
  Path,
  Line,
  Circle,
  Defs,
  LinearGradient,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { useThemeColors, typography, spacing, radius, shadows } from '../theme';
import { useAppTheme } from '../context/ThemeContext';
import { haptics } from '../hooks/useHaptics';
import { useAnalytics } from '../hooks/useAnalytics';
import BottomSheet from './BottomSheet';

// ─── Types ──────────────────────────────────────────────────────────────────

interface MetricEntry {
  date: string; // ISO date (YYYY-MM-DD)
  weight?: number;
  bodyFat?: number;
  waist?: number;
  chest?: number;
  arms?: number;
}

type MetricKey = 'weight' | 'bodyFat' | 'waist' | 'chest' | 'arms';

interface MetricConfig {
  key: MetricKey;
  label: string;
  unit: string;
  icon: string;
  color: string;
  colorDark: string;
  min: number;
  max: number;
  step: number;
  decimals: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STORAGE_KEY = '@fitsi_body_metrics';
const SCREEN_WIDTH = Dimensions.get('window').width;

const METRICS: MetricConfig[] = [
  { key: 'weight', label: 'Peso', unit: 'kg', icon: 'scale-outline', color: '#4285F4', colorDark: '#6BA5FF', min: 20, max: 300, step: 0.1, decimals: 1 },
  { key: 'bodyFat', label: 'Grasa Corporal', unit: '%', icon: 'water-outline', color: '#F59E0B', colorDark: '#FBBF24', min: 2, max: 60, step: 0.1, decimals: 1 },
  { key: 'waist', label: 'Cintura', unit: 'cm', icon: 'resize-outline', color: '#10B981', colorDark: '#4ADE80', min: 40, max: 200, step: 0.5, decimals: 1 },
  { key: 'chest', label: 'Pecho', unit: 'cm', icon: 'fitness-outline', color: '#EC4899', colorDark: '#FF6B6B', min: 50, max: 200, step: 0.5, decimals: 1 },
  { key: 'arms', label: 'Brazos', unit: 'cm', icon: 'barbell-outline', color: '#8B5CF6', colorDark: '#A78BFA', min: 15, max: 60, step: 0.5, decimals: 1 },
];

const CHART_H = 140;
const CHART_PAD_TOP = 12;
const CHART_PAD_BOTTOM = 20;
const CHART_PAD_LEFT = 36;
const CHART_PAD_RIGHT = 12;

// ─── Helpers ────────────────────────────────────────────────────────────────

function getISODate(date: Date = new Date()): string {
  return date.toISOString().split('T')[0];
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

function formatValue(val: number, decimals: number): string {
  return val.toFixed(decimals);
}

// ─── Trend Line Chart ───────────────────────────────────────────────────────

const MetricLineChart = React.memo(function MetricLineChart({
  data,
  metricKey,
  color,
  width,
  isDark,
  grayLight,
  textTertiary,
}: {
  data: { date: string; value: number }[];
  metricKey: MetricKey;
  color: string;
  width: number;
  isDark: boolean;
  grayLight: string;
  textTertiary: string;
}) {
  if (data.length < 2) {
    return (
      <View style={[chartStyles.emptyChart, { height: CHART_H }]}>
        <Text style={[chartStyles.emptyText, { color: textTertiary }]}>
          Necesitas al menos 2 mediciones para ver la tendencia
        </Text>
      </View>
    );
  }

  const drawW = width - CHART_PAD_LEFT - CHART_PAD_RIGHT;
  const drawH = CHART_H - CHART_PAD_TOP - CHART_PAD_BOTTOM;

  const values = data.map((d) => d.value);
  const minV = Math.min(...values) - 0.5;
  const maxV = Math.max(...values) + 0.5;
  const range = maxV - minV || 1;

  const toX = (i: number) => CHART_PAD_LEFT + (i / (data.length - 1)) * drawW;
  const toY = (v: number) => CHART_PAD_TOP + drawH - ((v - minV) / range) * drawH;

  const linePath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(d.value).toFixed(1)}`)
    .join(' ');

  const areaPath =
    linePath +
    ` L${toX(data.length - 1).toFixed(1)},${(CHART_H - CHART_PAD_BOTTOM).toFixed(1)}` +
    ` L${toX(0).toFixed(1)},${(CHART_H - CHART_PAD_BOTTOM).toFixed(1)} Z`;

  // Y-axis ticks (3 ticks)
  const yTicks = 3;
  const yLabels = Array.from({ length: yTicks }, (_, i) => {
    const val = minV + (range * i) / (yTicks - 1);
    return { val, y: toY(val) };
  });

  // X-axis labels (first and last)
  const xIndices = data.length <= 3
    ? data.map((_, i) => i)
    : [0, Math.floor(data.length / 2), data.length - 1];

  const lastIdx = data.length - 1;
  const lastX = toX(lastIdx);
  const lastY = toY(data[lastIdx].value);

  const gradId = `areaGrad_${metricKey}`;

  return (
    <Svg width={width} height={CHART_H}>
      <Defs>
        <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.25" />
          <Stop offset="1" stopColor={color} stopOpacity="0.02" />
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
          stroke={grayLight}
          strokeWidth={0.5}
        />
      ))}

      {/* Y labels */}
      {yLabels.map((t, i) => (
        <SvgText
          key={`yl-${i}`}
          x={CHART_PAD_LEFT - 6}
          y={t.y + 4}
          fontSize={9}
          fill={textTertiary}
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
          y={CHART_H - 3}
          fontSize={9}
          fill={textTertiary}
          textAnchor="middle"
        >
          {formatShortDate(data[idx].date)}
        </SvgText>
      ))}

      {/* Area fill */}
      <Path d={areaPath} fill={`url(#${gradId})`} />

      {/* Line */}
      <Path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Data points */}
      {data.map((d, i) => (
        <Circle
          key={i}
          cx={toX(i)}
          cy={toY(d.value)}
          r={i === lastIdx ? 4 : 2.5}
          fill={color}
          opacity={i === lastIdx ? 1 : 0.6}
        />
      ))}

      {/* Latest dot highlight */}
      <Circle cx={lastX} cy={lastY} r={2} fill="#FFFFFF" />
    </Svg>
  );
});

const chartStyles = StyleSheet.create({
  emptyChart: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  emptyText: {
    ...typography.caption,
    textAlign: 'center',
  },
});

// ─── Component ──────────────────────────────────────────────────────────────

export default function BodyMetrics() {
  const c = useThemeColors();
  const { isDark } = useAppTheme();
  const { track } = useAnalytics('BodyMetrics');

  const [entries, setEntries] = useState<MetricEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('weight');
  const [inputSheetVisible, setInputSheetVisible] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [editingMetric, setEditingMetric] = useState<MetricConfig>(METRICS[0]);

  // Entrance animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      delay: 100,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, []);

  // ─── Storage ────────────────────────────────────────────────────────────────

  const loadEntries = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        setEntries(JSON.parse(raw));
      }
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const saveEntries = useCallback(async (updated: MetricEntry[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      Alert.alert('Error', 'No se pudo guardar la medicion. Intenta de nuevo.');
    }
  }, []);

  // ─── Input handling ─────────────────────────────────────────────────────────

  const openInput = useCallback((metric: MetricConfig) => {
    haptics.light();
    setEditingMetric(metric);

    // Pre-fill with today's value if it exists
    const today = getISODate();
    const todayEntry = entries.find((e) => e.date === today);
    const existing = todayEntry?.[metric.key];
    setInputValue(existing !== undefined ? formatValue(existing, metric.decimals) : '');

    setInputSheetVisible(true);
    track('metric_input_opened', { metric: metric.key });
  }, [entries, track]);

  const saveMetric = useCallback(async () => {
    const numVal = parseFloat(inputValue);
    if (isNaN(numVal) || numVal < editingMetric.min || numVal > editingMetric.max) {
      Alert.alert(
        'Valor invalido',
        `El valor debe estar entre ${editingMetric.min} y ${editingMetric.max} ${editingMetric.unit}`,
      );
      return;
    }

    haptics.success();

    const today = getISODate();
    let updated = [...entries];
    const existingIdx = updated.findIndex((e) => e.date === today);

    if (existingIdx >= 0) {
      updated[existingIdx] = { ...updated[existingIdx], [editingMetric.key]: numVal };
    } else {
      updated.push({ date: today, [editingMetric.key]: numVal });
    }

    // Sort by date ascending
    updated.sort((a, b) => a.date.localeCompare(b.date));
    setEntries(updated);
    await saveEntries(updated);

    setInputSheetVisible(false);
    track('metric_saved', { metric: editingMetric.key, value: numVal });
  }, [inputValue, editingMetric, entries, saveEntries, track]);

  const adjustValue = useCallback((delta: number) => {
    haptics.selection();
    const current = parseFloat(inputValue) || 0;
    const newVal = Math.max(editingMetric.min, Math.min(editingMetric.max, current + delta));
    setInputValue(formatValue(newVal, editingMetric.decimals));
  }, [inputValue, editingMetric]);

  // ─── Derived data ───────────────────────────────────────────────────────────

  const selectedConfig = useMemo(
    () => METRICS.find((m) => m.key === selectedMetric) ?? METRICS[0],
    [selectedMetric],
  );

  const chartData = useMemo(() => {
    // Last 12 weeks of data for the selected metric
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 84); // 12 weeks
    const cutoffStr = getISODate(cutoff);

    return entries
      .filter((e) => e.date >= cutoffStr && e[selectedMetric] !== undefined)
      .map((e) => ({
        date: e.date,
        value: e[selectedMetric] as number,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [entries, selectedMetric]);

  const latestValues = useMemo(() => {
    const result: Partial<Record<MetricKey, { value: number; date: string; change: number | null }>> = {};

    for (const metric of METRICS) {
      const relevantEntries = entries
        .filter((e) => e[metric.key] !== undefined)
        .sort((a, b) => b.date.localeCompare(a.date));

      if (relevantEntries.length > 0) {
        const latest = relevantEntries[0][metric.key] as number;
        const previous = relevantEntries.length > 1 ? (relevantEntries[1][metric.key] as number) : null;

        result[metric.key] = {
          value: latest,
          date: relevantEntries[0].date,
          change: previous !== null ? latest - previous : null,
        };
      }
    }

    return result;
  }, [entries]);

  const chartColor = isDark ? selectedConfig.colorDark : selectedConfig.color;
  const chartWidth = SCREEN_WIDTH - spacing.lg * 2 - spacing.md * 2;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <Animated.View style={{ opacity: fadeAnim }}>
      <View style={[s.card, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
        <Text style={[s.sectionTitle, { color: c.black }]}>Body Metrics</Text>

        {/* Metric Cards Grid */}
        <View style={s.metricsGrid}>
          {METRICS.map((metric) => {
            const latest = latestValues[metric.key];
            const isSelected = selectedMetric === metric.key;
            const metricColor = isDark ? metric.colorDark : metric.color;

            return (
              <TouchableOpacity
                key={metric.key}
                style={[
                  s.metricCard,
                  { backgroundColor: isDark ? c.surface : '#FFFFFF', borderColor: c.grayLight },
                  isSelected && { borderColor: metricColor, borderWidth: 2 },
                ]}
                onPress={() => { haptics.light(); setSelectedMetric(metric.key); }}
                onLongPress={() => openInput(metric)}
                activeOpacity={0.7}
                accessibilityLabel={`${metric.label}: ${latest ? formatValue(latest.value, metric.decimals) : 'sin datos'} ${metric.unit}`}
                accessibilityRole="button"
                accessibilityHint="Toca para ver grafico, manten presionado para editar"
              >
                <View style={s.metricCardHeader}>
                  <Ionicons name={metric.icon as any} size={16} color={metricColor} />
                  <Text style={[s.metricCardLabel, { color: c.gray }]}>{metric.label}</Text>
                </View>

                {latest ? (
                  <>
                    <Text style={[s.metricCardValue, { color: c.black }]}>
                      {formatValue(latest.value, metric.decimals)}
                      <Text style={[s.metricCardUnit, { color: c.gray }]}> {metric.unit}</Text>
                    </Text>
                    {latest.change !== null && (
                      <View style={s.changeRow}>
                        <Ionicons
                          name={latest.change < 0 ? 'trending-down' : latest.change > 0 ? 'trending-up' : 'remove'}
                          size={12}
                          color={
                            metric.key === 'weight' || metric.key === 'bodyFat' || metric.key === 'waist'
                              ? (latest.change <= 0 ? '#10B981' : '#F59E0B')
                              : (latest.change >= 0 ? '#10B981' : '#F59E0B')
                          }
                        />
                        <Text style={[s.changeText, {
                          color:
                            metric.key === 'weight' || metric.key === 'bodyFat' || metric.key === 'waist'
                              ? (latest.change <= 0 ? '#10B981' : '#F59E0B')
                              : (latest.change >= 0 ? '#10B981' : '#F59E0B'),
                        }]}>
                          {latest.change > 0 ? '+' : ''}{formatValue(latest.change, metric.decimals)}
                        </Text>
                      </View>
                    )}
                  </>
                ) : (
                  <Text style={[s.metricCardEmpty, { color: c.disabled }]}>--</Text>
                )}
              </TouchableOpacity>
            );
          })}

          {/* Add measurement button */}
          <TouchableOpacity
            style={[
              s.metricCard,
              s.addMetricCard,
              { borderColor: c.accent, backgroundColor: c.accent + '08' },
            ]}
            onPress={() => openInput(selectedConfig)}
            activeOpacity={0.7}
            accessibilityLabel="Agregar medicion"
            accessibilityRole="button"
          >
            <Ionicons name="add-circle-outline" size={28} color={c.accent} />
            <Text style={[s.addMetricText, { color: c.accent }]}>Registrar</Text>
          </TouchableOpacity>
        </View>

        {/* Trend Chart */}
        <View style={s.chartSection}>
          <View style={s.chartHeader}>
            <View style={s.chartTitleRow}>
              <View style={[s.chartDot, { backgroundColor: chartColor }]} />
              <Text style={[s.chartTitle, { color: c.black }]}>
                {selectedConfig.label}
              </Text>
              <Text style={[s.chartPeriod, { color: c.gray }]}> - 12 semanas</Text>
            </View>
          </View>

          <MetricLineChart
            data={chartData}
            metricKey={selectedMetric}
            color={chartColor}
            width={chartWidth}
            isDark={isDark}
            grayLight={c.grayLight}
            textTertiary={c.disabled}
          />
        </View>

        {/* Recent entries table */}
        {chartData.length > 0 && (
          <View style={s.recentSection}>
            <Text style={[s.recentTitle, { color: c.black }]}>Historial Reciente</Text>
            {chartData.slice(-5).reverse().map((entry) => (
              <View key={entry.date} style={[s.recentRow, { borderBottomColor: c.grayLight }]}>
                <Text style={[s.recentDate, { color: c.gray }]}>{formatShortDate(entry.date)}</Text>
                <Text style={[s.recentValue, { color: c.black }]}>
                  {formatValue(entry.value, selectedConfig.decimals)} {selectedConfig.unit}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* ── Metric Input Bottom Sheet ── */}
      <BottomSheet
        visible={inputSheetVisible}
        onClose={() => setInputSheetVisible(false)}
        avoidKeyboard
      >
        <View style={s.inputSheet}>
          <Text style={[s.inputTitle, { color: c.black }]}>
            {editingMetric.label}
          </Text>
          <Text style={[s.inputSubtitle, { color: c.gray }]}>
            {formatShortDate(getISODate())} - Hoy
          </Text>

          {/* Value display */}
          <View style={s.inputDisplayRow}>
            <TouchableOpacity
              style={[s.stepBtn, { backgroundColor: c.grayLight + '40' }]}
              onPress={() => adjustValue(-editingMetric.step)}
              activeOpacity={0.6}
              accessibilityLabel={`Disminuir ${editingMetric.step}`}
              accessibilityRole="button"
            >
              <Ionicons name="remove" size={24} color={c.black} />
            </TouchableOpacity>

            <View style={s.inputFieldContainer}>
              <TextInput
                style={[s.inputField, { color: c.black, borderBottomColor: isDark ? editingMetric.colorDark : editingMetric.color }]}
                value={inputValue}
                onChangeText={setInputValue}
                keyboardType="numeric"
                placeholder="0.0"
                placeholderTextColor={c.disabled}
                selectTextOnFocus
                accessibilityLabel={`Valor de ${editingMetric.label}`}
              />
              <Text style={[s.inputUnit, { color: c.gray }]}>{editingMetric.unit}</Text>
            </View>

            <TouchableOpacity
              style={[s.stepBtn, { backgroundColor: c.grayLight + '40' }]}
              onPress={() => adjustValue(editingMetric.step)}
              activeOpacity={0.6}
              accessibilityLabel={`Aumentar ${editingMetric.step}`}
              accessibilityRole="button"
            >
              <Ionicons name="add" size={24} color={c.black} />
            </TouchableOpacity>
          </View>

          {/* Range hint */}
          <Text style={[s.rangeHint, { color: c.disabled }]}>
            Rango: {editingMetric.min} - {editingMetric.max} {editingMetric.unit}
          </Text>

          {/* Save button */}
          <TouchableOpacity
            style={[s.saveBtn, { backgroundColor: isDark ? editingMetric.colorDark : editingMetric.color }]}
            onPress={saveMetric}
            activeOpacity={0.8}
            accessibilityLabel="Guardar medicion"
            accessibilityRole="button"
          >
            <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" />
            <Text style={s.saveBtnText}>Guardar</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>
    </Animated.View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.titleSm,
    marginBottom: spacing.md,
  },

  // Metrics grid
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  metricCard: {
    width: '31%',
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.sm,
    gap: 4,
    minHeight: 90,
  },
  metricCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  metricCardLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  metricCardValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  metricCardUnit: {
    fontSize: 11,
    fontWeight: '500',
  },
  metricCardEmpty: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  changeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  addMetricCard: {
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  addMetricText: {
    ...typography.caption,
    fontWeight: '700',
  },

  // Chart section
  chartSection: {
    marginBottom: spacing.md,
  },
  chartHeader: {
    marginBottom: spacing.sm,
  },
  chartTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chartDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.xs,
  },
  chartTitle: {
    ...typography.label,
  },
  chartPeriod: {
    ...typography.caption,
  },

  // Recent entries
  recentSection: {
    gap: 0,
  },
  recentTitle: {
    ...typography.label,
    marginBottom: spacing.sm,
  },
  recentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  recentDate: {
    ...typography.caption,
    fontWeight: '500',
  },
  recentValue: {
    ...typography.bodyMd,
    fontWeight: '700',
  },

  // Input bottom sheet
  inputSheet: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.md,
    alignItems: 'center',
  },
  inputTitle: {
    ...typography.titleMd,
  },
  inputSubtitle: {
    ...typography.caption,
    marginTop: -spacing.sm,
  },
  inputDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    width: '100%',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  stepBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputFieldContainer: {
    alignItems: 'center',
    gap: 2,
  },
  inputField: {
    fontSize: 36,
    fontWeight: '800',
    textAlign: 'center',
    minWidth: 120,
    borderBottomWidth: 3,
    paddingBottom: 4,
    letterSpacing: -1,
  },
  inputUnit: {
    ...typography.caption,
    fontWeight: '600',
    marginTop: 4,
  },
  rangeHint: {
    ...typography.caption,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    width: '100%',
    paddingVertical: 14,
    borderRadius: radius.full,
    ...shadows.sm,
  },
  saveBtnText: {
    ...typography.button,
    color: '#FFFFFF',
  },
});
