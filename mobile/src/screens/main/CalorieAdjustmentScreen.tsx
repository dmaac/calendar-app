/**
 * CalorieAdjustmentScreen — Full detail view of the adaptive calorie system.
 *
 * Shows:
 *   1. Current recommendation with full explanation
 *   2. Weight chart (actual vs predicted, last 4 weeks)
 *   3. Adjustment history timeline
 *   4. BMR floor indicator
 *
 * Accessible from the AdaptiveCalorieBanner "Detalle" button.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, {
  Path,
  Defs,
  LinearGradient,
  Stop,
  Line,
  Circle,
  Text as SvgText,
} from 'react-native-svg';
import { useThemeColors, typography, spacing, radius, shadows, useLayout, colors } from '../../theme';
import { haptics } from '../../hooks/useHaptics';
import useAdaptiveCalories from '../../hooks/useAdaptiveCalories';
import {
  getWeightChartData,
  getAdjustmentHistory,
  WeightChartData,
  CalorieAdjustmentRecord,
  WeightLogEntry,
  PredictedEntry,
} from '../../services/adaptiveCalorie.service';

// ---- Chart constants ------------------------------------------------------

const CHART_HEIGHT = 220;
const CHART_PADDING_TOP = 24;
const CHART_PADDING_BOTTOM = 32;
const CHART_PADDING_LEFT = 44;
const CHART_PADDING_RIGHT = 16;

// ---- Weight comparison chart ----------------------------------------------

function WeightComparisonChart({
  actual,
  predicted,
  targetWeight,
  width,
}: {
  actual: WeightLogEntry[];
  predicted: PredictedEntry[];
  targetWeight: number | null;
  width: number;
}) {
  if (actual.length < 2 && predicted.length < 2) {
    return (
      <View style={[chartStyles.empty, { height: CHART_HEIGHT }]}>
        <Ionicons name="analytics-outline" size={32} color={colors.grayLight} />
        <Text style={chartStyles.emptyText}>
          Necesitas al menos 2 registros de peso para ver el grafico
        </Text>
      </View>
    );
  }

  const drawWidth = width - CHART_PADDING_LEFT - CHART_PADDING_RIGHT;
  const drawHeight = CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;

  // Collect all dates and weights
  const allDates = new Set<string>();
  actual.forEach((e) => allDates.add(e.date));
  predicted.forEach((e) => allDates.add(e.date));
  const sortedDates = Array.from(allDates).sort();

  const actualMap = new Map(actual.map((e) => [e.date, e.weight_kg]));
  const predictedMap = new Map(predicted.map((e) => [e.date, e.weight_kg]));

  const allWeights: number[] = [];
  actual.forEach((e) => allWeights.push(e.weight_kg));
  predicted.forEach((e) => allWeights.push(e.weight_kg));
  if (targetWeight != null) allWeights.push(targetWeight);

  const minW = Math.min(...allWeights) - 0.5;
  const maxW = Math.max(...allWeights) + 0.5;
  const range = maxW - minW || 1;

  const dateToX = (dateStr: string) => {
    const idx = sortedDates.indexOf(dateStr);
    if (idx < 0) return CHART_PADDING_LEFT;
    return CHART_PADDING_LEFT + (idx / Math.max(sortedDates.length - 1, 1)) * drawWidth;
  };
  const toY = (w: number) =>
    CHART_PADDING_TOP + drawHeight - ((w - minW) / range) * drawHeight;

  // Build actual line path
  const actualPoints = actual
    .filter((e) => sortedDates.includes(e.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  const actualPath = actualPoints
    .map(
      (d, i) =>
        `${i === 0 ? 'M' : 'L'}${dateToX(d.date).toFixed(1)},${toY(d.weight_kg).toFixed(1)}`
    )
    .join(' ');

  // Build predicted line path
  const predictedPoints = predicted
    .filter((e) => sortedDates.includes(e.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  const predictedPath = predictedPoints
    .map(
      (d, i) =>
        `${i === 0 ? 'M' : 'L'}${dateToX(d.date).toFixed(1)},${toY(d.weight_kg).toFixed(1)}`
    )
    .join(' ');

  // Area fill under actual line
  const actualArea =
    actualPoints.length > 1
      ? actualPath +
        ` L${dateToX(actualPoints[actualPoints.length - 1].date).toFixed(1)},${(CHART_HEIGHT - CHART_PADDING_BOTTOM).toFixed(1)}` +
        ` L${dateToX(actualPoints[0].date).toFixed(1)},${(CHART_HEIGHT - CHART_PADDING_BOTTOM).toFixed(1)} Z`
      : '';

  // Y-axis labels
  const yTicks = 5;
  const yLabels = Array.from({ length: yTicks }, (_, i) => {
    const val = minW + (range * i) / (yTicks - 1);
    return { val, y: toY(val) };
  });

  // X-axis labels (first, middle, last)
  const xIndices = [0, Math.floor(sortedDates.length / 2), sortedDates.length - 1].filter(
    (v, i, arr) => arr.indexOf(v) === i
  );
  const formatDate = (iso: string) => {
    const parts = iso.split('-');
    return `${parseInt(parts[2], 10)}/${parseInt(parts[1], 10)}`;
  };

  // Latest actual point
  const lastActual = actualPoints[actualPoints.length - 1];
  const targetY = targetWeight != null ? toY(targetWeight) : null;

  return (
    <Svg width={width} height={CHART_HEIGHT}>
      <Defs>
        <LinearGradient id="actualAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#4285F4" stopOpacity="0.2" />
          <Stop offset="1" stopColor="#4285F4" stopOpacity="0.02" />
        </LinearGradient>
      </Defs>

      {/* Grid lines */}
      {yLabels.map((t, i) => (
        <Line
          key={`grid-${i}`}
          x1={CHART_PADDING_LEFT}
          y1={t.y}
          x2={width - CHART_PADDING_RIGHT}
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
          x={CHART_PADDING_LEFT - 6}
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
          x={dateToX(sortedDates[idx])}
          y={CHART_HEIGHT - 8}
          fontSize={10}
          fill={colors.gray}
          textAnchor="middle"
        >
          {formatDate(sortedDates[idx])}
        </SvgText>
      ))}

      {/* Target weight line */}
      {targetY != null && (
        <>
          <Line
            x1={CHART_PADDING_LEFT}
            y1={targetY}
            x2={width - CHART_PADDING_RIGHT}
            y2={targetY}
            stroke="#4CAF50"
            strokeWidth={1.5}
            strokeDasharray="6,4"
          />
          <SvgText
            x={width - CHART_PADDING_RIGHT}
            y={targetY - 6}
            fontSize={10}
            fill="#4CAF50"
            textAnchor="end"
            fontWeight="600"
          >
            Meta
          </SvgText>
        </>
      )}

      {/* Area fill under actual */}
      {actualArea.length > 0 && <Path d={actualArea} fill="url(#actualAreaGrad)" />}

      {/* Predicted line (dashed) */}
      {predictedPath.length > 0 && (
        <Path
          d={predictedPath}
          fill="none"
          stroke="#F59E0B"
          strokeWidth={2}
          strokeDasharray="6,4"
          strokeLinecap="round"
        />
      )}

      {/* Actual line (solid) */}
      {actualPath.length > 0 && (
        <Path
          d={actualPath}
          fill="none"
          stroke="#4285F4"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {/* Latest actual point */}
      {lastActual && (
        <>
          <Circle
            cx={dateToX(lastActual.date)}
            cy={toY(lastActual.weight_kg)}
            r={5}
            fill="#4285F4"
          />
          <Circle
            cx={dateToX(lastActual.date)}
            cy={toY(lastActual.weight_kg)}
            r={3}
            fill="#FFFFFF"
          />
        </>
      )}
    </Svg>
  );
}

const chartStyles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  emptyText: {
    ...typography.caption,
    color: colors.gray,
    textAlign: 'center',
    maxWidth: 200,
  },
});

// ---- Trend badge helper ---------------------------------------------------

function TrendBadge({ trend }: { trend: string }) {
  const labels: Record<string, { text: string; color: string; bg: string }> = {
    losing_too_fast: { text: 'Perdiendo muy rapido', color: '#D97706', bg: '#FEF3C7' },
    losing_on_track: { text: 'Perdida saludable', color: '#059669', bg: '#D1FAE5' },
    stable: { text: 'Estable', color: '#6B7280', bg: '#F3F4F6' },
    gaining_on_track: { text: 'Ganancia saludable', color: '#059669', bg: '#D1FAE5' },
    gaining_too_fast: { text: 'Ganando muy rapido', color: '#DC2626', bg: '#FEE2E2' },
    not_losing: { text: 'Sin cambio', color: '#D97706', bg: '#FEF3C7' },
    not_gaining: { text: 'Sin cambio', color: '#D97706', bg: '#FEF3C7' },
    insufficient_data: { text: 'Datos insuficientes', color: '#6B7280', bg: '#F3F4F6' },
  };
  const config = labels[trend] ?? labels.stable;

  return (
    <View style={[badgeStyles.container, { backgroundColor: config.bg }]}>
      <Text style={[badgeStyles.text, { color: config.color }]}>{config.text}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
  },
});

// ---- Adjustment history item ----------------------------------------------

function AdjustmentHistoryItem({
  item,
  colors: c,
}: {
  item: CalorieAdjustmentRecord;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const isIncrease = item.adjustment_kcal > 0;
  const weekLabel = formatWeekRange(item.week_start, item.week_end);
  const statusLabel = item.applied
    ? 'Aplicado'
    : item.dismissed
    ? 'Ignorado'
    : 'Pendiente';
  const statusColor = item.applied
    ? '#059669'
    : item.dismissed
    ? '#6B7280'
    : '#D97706';

  return (
    <View style={[historyStyles.item, { borderBottomColor: c.surface }]}>
      <View style={historyStyles.left}>
        <View style={[historyStyles.dot, { backgroundColor: isIncrease ? '#D1FAE5' : '#FEE2E2' }]}>
          <Ionicons
            name={isIncrease ? 'arrow-up' : 'arrow-down'}
            size={12}
            color={isIncrease ? '#059669' : '#DC2626'}
          />
        </View>
        <View style={historyStyles.textCol}>
          <Text style={[historyStyles.weekText, { color: c.black }]}>{weekLabel}</Text>
          <Text style={[historyStyles.detailText, { color: c.gray }]}>
            {item.previous_target} {'>'} {item.new_target} kcal ({isIncrease ? '+' : ''}
            {item.adjustment_kcal})
          </Text>
          {item.actual_weight != null && (
            <Text style={[historyStyles.weightText, { color: c.gray }]}>
              Peso: {item.actual_weight.toFixed(1)} kg
              {item.weight_delta != null && ` (${item.weight_delta > 0 ? '+' : ''}${item.weight_delta.toFixed(1)})`}
            </Text>
          )}
        </View>
      </View>
      <Text style={[historyStyles.status, { color: statusColor }]}>{statusLabel}</Text>
    </View>
  );
}

function formatWeekRange(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  const fmtDay = (d: Date) =>
    d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
  return `${fmtDay(s)} - ${fmtDay(e)}`;
}

const historyStyles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm + 4,
    borderBottomWidth: 1,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    flex: 1,
  },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
  weekText: {
    ...typography.label,
    fontWeight: '600',
  },
  detailText: {
    ...typography.caption,
    fontSize: 12,
  },
  weightText: {
    ...typography.caption,
    fontSize: 11,
  },
  status: {
    ...typography.caption,
    fontWeight: '700',
    fontSize: 11,
    textTransform: 'uppercase',
  },
});

// ---- Main screen ----------------------------------------------------------

export default function CalorieAdjustmentScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { sidePadding, innerWidth } = useLayout();
  const c = useThemeColors();

  const {
    data: adaptive,
    loading: adaptiveLoading,
    apply,
    dismiss,
    acting,
    refetch: refetchAdaptive,
  } = useAdaptiveCalories();

  const [chartData, setChartData] = useState<WeightChartData | null>(null);
  const [history, setHistory] = useState<CalorieAdjustmentRecord[]>([]);
  const [loadingChart, setLoadingChart] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [chart, hist] = await Promise.allSettled([
        getWeightChartData(4),
        getAdjustmentHistory(12),
      ]);
      if (chart.status === 'fulfilled') setChartData(chart.value);
      if (hist.status === 'fulfilled') setHistory(hist.value);
    } catch {
      // Silently fail — UI handles empty states
    } finally {
      setLoadingChart(false);
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchAdaptive(), fetchAll()]);
    setRefreshing(false);
  }, [refetchAdaptive, fetchAll]);

  const handleApply = useCallback(async () => {
    haptics.success();
    await apply();
    await fetchAll();
  }, [apply, fetchAll]);

  const handleDismiss = useCallback(async () => {
    haptics.light();
    await dismiss();
  }, [dismiss]);

  // Derived values
  const isLoading = adaptiveLoading || loadingChart;
  const hasAdjustment = adaptive && adaptive.has_pending_adjustment && Math.abs(adaptive.adjustment) > 0;

  return (
    <View style={[s.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={[s.header, { paddingHorizontal: sidePadding }]}>
        <TouchableOpacity
          style={[s.backBtn, { backgroundColor: c.surface }]}
          onPress={() => {
            haptics.light();
            navigation.goBack();
          }}
          activeOpacity={0.7}
          accessibilityLabel="Volver"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={20} color={c.black} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: c.black }]}>Ajuste metabolico</Text>
        <View style={s.backBtn} />
      </View>

      {isLoading ? (
        <View style={s.loadingContainer}>
          <ActivityIndicator size="large" color={c.accent} />
          <Text style={[s.loadingText, { color: c.gray }]}>Analizando tu metabolismo...</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          bounces
          contentContainerStyle={[s.scroll, { paddingHorizontal: sidePadding }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.black} />
          }
        >
          {/* Current recommendation card */}
          {adaptive && (
            <View style={[s.card, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
              <View style={s.cardHeader}>
                <Text style={[s.cardTitle, { color: c.black }]}>Recomendacion actual</Text>
                <TrendBadge trend={adaptive.trend} />
              </View>

              <View style={s.targetRow}>
                <View style={s.targetItem}>
                  <Text style={[s.targetLabel, { color: c.gray }]}>Actual</Text>
                  <Text style={[s.targetValue, { color: c.black }]}>
                    {adaptive.current_target}
                  </Text>
                  <Text style={[s.targetUnit, { color: c.gray }]}>kcal/dia</Text>
                </View>
                {hasAdjustment && (
                  <>
                    <Ionicons
                      name={adaptive.adjustment > 0 ? 'arrow-forward' : 'arrow-forward'}
                      size={20}
                      color={c.accent}
                    />
                    <View style={s.targetItem}>
                      <Text style={[s.targetLabel, { color: c.gray }]}>Sugerido</Text>
                      <Text style={[s.targetValue, { color: c.accent }]}>
                        {adaptive.recommended_target}
                      </Text>
                      <Text style={[s.targetUnit, { color: c.gray }]}>kcal/dia</Text>
                    </View>
                  </>
                )}
              </View>

              <Text style={[s.reasonText, { color: c.gray }]}>{adaptive.reason}</Text>

              {/* Weight comparison */}
              {adaptive.actual_weight != null && adaptive.predicted_weight_this_week != null && (
                <View style={[s.weightCompare, { borderTopColor: c.grayLight }]}>
                  <View style={s.weightItem}>
                    <Text style={[s.weightLabel, { color: c.gray }]}>Peso real</Text>
                    <Text style={[s.weightValue, { color: c.black }]}>
                      {adaptive.actual_weight} kg
                    </Text>
                  </View>
                  <View style={s.weightItem}>
                    <Text style={[s.weightLabel, { color: c.gray }]}>Peso predicho</Text>
                    <Text style={[s.weightValue, { color: '#F59E0B' }]}>
                      {adaptive.predicted_weight_this_week} kg
                    </Text>
                  </View>
                </View>
              )}

              {/* BMR floor */}
              {adaptive.bmr != null && (
                <View style={[s.bmrRow, { borderTopColor: c.grayLight }]}>
                  <Ionicons name="shield-checkmark-outline" size={16} color={c.gray} />
                  <Text style={[s.bmrText, { color: c.gray }]}>
                    Limite minimo (BMR): {Math.round(adaptive.bmr)} kcal/dia
                  </Text>
                </View>
              )}

              {/* Action buttons */}
              {hasAdjustment && (
                <View style={s.actionRow}>
                  <TouchableOpacity
                    style={[s.applyBtn, { backgroundColor: c.black }]}
                    onPress={handleApply}
                    activeOpacity={0.8}
                    disabled={acting}
                    accessibilityLabel={`Aplicar ajuste a ${adaptive.recommended_target} calorias`}
                    accessibilityRole="button"
                  >
                    {acting ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
                        <Text style={s.applyBtnText}>Aplicar ajuste</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[s.dismissBtn, { borderColor: c.grayLight }]}
                    onPress={handleDismiss}
                    activeOpacity={0.8}
                    disabled={acting}
                    accessibilityLabel="Ignorar ajuste"
                    accessibilityRole="button"
                  >
                    <Text style={[s.dismissBtnText, { color: c.gray }]}>Ignorar</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* Weight chart */}
          <Text style={[s.sectionTitle, { color: c.black }]}>Peso: real vs predicho</Text>
          <View style={[s.chartCard, { backgroundColor: c.bg, borderColor: c.grayLight }]}>
            {/* Legend */}
            <View style={s.legendRow}>
              <View style={s.legendItem}>
                <View style={[s.legendLine, { backgroundColor: '#4285F4' }]} />
                <Text style={[s.legendText, { color: c.gray }]}>Peso real</Text>
              </View>
              <View style={s.legendItem}>
                <View style={[s.legendDashed, { borderColor: '#F59E0B' }]} />
                <Text style={[s.legendText, { color: c.gray }]}>Peso predicho</Text>
              </View>
              <View style={s.legendItem}>
                <View style={[s.legendDashed, { borderColor: '#4CAF50' }]} />
                <Text style={[s.legendText, { color: c.gray }]}>Meta</Text>
              </View>
            </View>

            {chartData ? (
              <WeightComparisonChart
                actual={chartData.entries}
                predicted={chartData.predicted_entries}
                targetWeight={chartData.target_weight}
                width={innerWidth}
              />
            ) : (
              <View style={[chartStyles.empty, { height: CHART_HEIGHT }]}>
                <Ionicons name="analytics-outline" size={32} color={colors.grayLight} />
                <Text style={chartStyles.emptyText}>
                  Registra tu peso para ver el grafico
                </Text>
              </View>
            )}

            {/* 4-week summary */}
            {chartData?.weight_change_4w != null && (
              <View style={[s.summaryRow, { borderTopColor: c.grayLight }]}>
                <Text style={[s.summaryLabel, { color: c.gray }]}>Cambio en 4 semanas</Text>
                <Text
                  style={[
                    s.summaryValue,
                    {
                      color:
                        chartData.weight_change_4w < 0
                          ? '#059669'
                          : chartData.weight_change_4w > 0
                          ? '#DC2626'
                          : c.black,
                    },
                  ]}
                >
                  {chartData.weight_change_4w > 0 ? '+' : ''}
                  {chartData.weight_change_4w.toFixed(1)} kg
                </Text>
              </View>
            )}
          </View>

          {/* Adjustment history */}
          <Text style={[s.sectionTitle, { color: c.black }]}>Historial de ajustes</Text>
          <View style={[s.historyCard, { backgroundColor: c.bg, borderColor: c.grayLight }]}>
            {loadingHistory ? (
              <View style={s.historyLoading}>
                <ActivityIndicator size="small" color={c.accent} />
              </View>
            ) : history.length > 0 ? (
              history.map((item) => (
                <AdjustmentHistoryItem key={item.id} item={item} colors={c} />
              ))
            ) : (
              <View style={s.historyEmpty}>
                <Ionicons name="time-outline" size={28} color={c.disabled} />
                <Text style={[s.historyEmptyText, { color: c.gray }]}>
                  Aun no hay ajustes registrados. Tu primer ajuste aparecera aqui.
                </Text>
              </View>
            )}
          </View>

          {/* Science note */}
          <View style={[s.scienceCard, { backgroundColor: c.surfaceAlt, borderColor: c.grayLight }]}>
            <Ionicons name="flask-outline" size={18} color={c.accent} />
            <Text style={[s.scienceText, { color: c.gray }]}>
              Este sistema se basa en la investigacion de Helms et al. (2014) sobre
              tasas de perdida de peso seguras para preservar masa muscular. La tasa
              recomendada es 0.5-1.0% del peso corporal por semana durante deficit calorico.
            </Text>
          </View>

          <View style={{ height: spacing.xl * 2 }} />
        </ScrollView>
      )}
    </View>
  );
}

// ---- Styles ---------------------------------------------------------------

const s = StyleSheet.create({
  screen: { flex: 1 },
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
  headerTitle: {
    ...typography.titleSm,
    fontWeight: '700',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    ...typography.body,
  },
  scroll: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },

  // Card
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.md,
    ...shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    ...typography.label,
    fontWeight: '700',
    fontSize: 16,
  },

  // Target comparison
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  targetItem: {
    alignItems: 'center',
    gap: 2,
  },
  targetLabel: {
    ...typography.caption,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  targetValue: {
    fontSize: 32,
    fontWeight: '800',
  },
  targetUnit: {
    ...typography.caption,
    fontSize: 12,
  },

  // Reason
  reasonText: {
    ...typography.body,
    lineHeight: 22,
    fontSize: 14,
  },

  // Weight comparison
  weightCompare: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    paddingTop: spacing.sm,
  },
  weightItem: {
    alignItems: 'center',
    gap: 4,
  },
  weightLabel: {
    ...typography.caption,
    fontSize: 11,
    textTransform: 'uppercase',
  },
  weightValue: {
    ...typography.label,
    fontWeight: '700',
    fontSize: 16,
  },

  // BMR
  bmrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderTopWidth: 1,
    paddingTop: spacing.sm,
  },
  bmrText: {
    ...typography.caption,
    fontSize: 12,
  },

  // Actions
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  applyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.full,
    height: 48,
  },
  applyBtnText: {
    ...typography.button,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  dismissBtn: {
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    borderWidth: 1,
    height: 48,
  },
  dismissBtnText: {
    ...typography.button,
    fontWeight: '600',
  },

  // Section title
  sectionTitle: {
    ...typography.label,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },

  // Chart card
  chartCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.sm,
    marginBottom: spacing.md,
    overflow: 'hidden',
    ...shadows.sm,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendLine: {
    width: 16,
    height: 3,
    borderRadius: 1.5,
  },
  legendDashed: {
    width: 16,
    height: 0,
    borderTopWidth: 2,
    borderStyle: 'dashed',
  },
  legendText: {
    fontSize: 11,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
  },
  summaryLabel: {
    ...typography.caption,
  },
  summaryValue: {
    ...typography.label,
    fontWeight: '700',
  },

  // History
  historyCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  historyLoading: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  historyEmpty: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  historyEmptyText: {
    ...typography.caption,
    textAlign: 'center',
    maxWidth: 240,
  },

  // Science note
  scienceCard: {
    flexDirection: 'row',
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  scienceText: {
    flex: 1,
    ...typography.caption,
    lineHeight: 18,
    fontSize: 12,
  },
});
