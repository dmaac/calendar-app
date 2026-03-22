/**
 * WeightTrackingScreen — Weight history with SVG line chart + area gradient
 */
import React, { useState, useCallback } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Path, Defs, LinearGradient, Stop, Line, Circle, Text as SvgText } from 'react-native-svg';
import { typography, spacing, radius, shadows, useLayout, useThemeColors } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { getOnboardingProfile } from '../../services/onboarding.service';
import { OnboardingProfileRead } from '../../types';
import { haptics } from '../../hooks/useHaptics';
import { useAnalytics } from '../../hooks/useAnalytics';

// ─── Types ──────────────────────────────────────────────────────────────────

interface WeightEntry {
  date: string; // ISO date string YYYY-MM-DD
  weight: number; // kg
}

// ─── Demo data (last 30 days) ───────────────────────────────────────────────

function generateDemoData(currentWeight: number, days = 30): WeightEntry[] {
  const entries: WeightEntry[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    // Simulate a gradual trend with small variance
    const trend = currentWeight + (i * 0.05) + (Math.sin(i * 0.7) * 0.3);
    entries.push({
      date: d.toISOString().slice(0, 10),
      weight: Math.round(trend * 10) / 10,
    });
  }
  return entries;
}

// ─── Chart component ────────────────────────────────────────────────────────

const CHART_HEIGHT = 200;
const CHART_PADDING_TOP = 20;
const CHART_PADDING_BOTTOM = 28;
const CHART_PADDING_LEFT = 40;
const CHART_PADDING_RIGHT = 16;

function WeightChart({
  data,
  targetWeight,
  width,
}: {
  data: WeightEntry[];
  targetWeight: number | null;
  width: number;
}) {
  if (data.length < 2) {
    return (
      <View style={[chartStyles.empty, { height: CHART_HEIGHT }]}>
        <Ionicons name="analytics-outline" size={32} color={colors.grayLight} />
        <Text style={chartStyles.emptyText}>Registra al menos 2 pesos para ver el grafico</Text>
      </View>
    );
  }

  const drawWidth = width - CHART_PADDING_LEFT - CHART_PADDING_RIGHT;
  const drawHeight = CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;

  const weights = data.map((d) => d.weight);
  const allValues = targetWeight != null ? [...weights, targetWeight] : weights;
  const minW = Math.min(...allValues) - 0.5;
  const maxW = Math.max(...allValues) + 0.5;
  const range = maxW - minW || 1;

  const toX = (i: number) => CHART_PADDING_LEFT + (i / (data.length - 1)) * drawWidth;
  const toY = (w: number) => CHART_PADDING_TOP + drawHeight - ((w - minW) / range) * drawHeight;

  // Line path
  const linePath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(d.weight).toFixed(1)}`)
    .join(' ');

  // Area path (fill under line)
  const areaPath =
    linePath +
    ` L${toX(data.length - 1).toFixed(1)},${(CHART_HEIGHT - CHART_PADDING_BOTTOM).toFixed(1)}` +
    ` L${toX(0).toFixed(1)},${(CHART_HEIGHT - CHART_PADDING_BOTTOM).toFixed(1)} Z`;

  // Y-axis labels (5 ticks)
  const yTicks = 5;
  const yLabels = Array.from({ length: yTicks }, (_, i) => {
    const val = minW + (range * i) / (yTicks - 1);
    return { val, y: toY(val) };
  });

  // X-axis labels (first, middle, last)
  const xIndices = [0, Math.floor(data.length / 2), data.length - 1];
  const formatDate = (iso: string) => {
    const [, m, d] = iso.split('-');
    return `${parseInt(d, 10)}/${parseInt(m, 10)}`;
  };

  // Latest point
  const lastIdx = data.length - 1;
  const lastX = toX(lastIdx);
  const lastY = toY(data[lastIdx].weight);

  // Target line Y
  const targetY = targetWeight != null ? toY(targetWeight) : null;

  return (
    <Svg width={width} height={CHART_HEIGHT}>
      <Defs>
        <LinearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#4285F4" stopOpacity="0.25" />
          <Stop offset="1" stopColor="#4285F4" stopOpacity="0.02" />
        </LinearGradient>
      </Defs>

      {/* Grid lines */}
      {yLabels.map((t, i) => (
        <Line
          key={i}
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
          x={toX(idx)}
          y={CHART_HEIGHT - 6}
          fontSize={10}
          fill={colors.gray}
          textAnchor="middle"
        >
          {formatDate(data[idx].date)}
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

      {/* Area fill */}
      <Path d={areaPath} fill="url(#areaGrad)" />

      {/* Line */}
      <Path d={linePath} fill="none" stroke={colors.accent} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

      {/* Latest point dot */}
      <Circle cx={lastX} cy={lastY} r={5} fill={colors.accent} />
      <Circle cx={lastX} cy={lastY} r={3} fill={colors.white} />
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

// ─── BMI helper ─────────────────────────────────────────────────────────────

function calcBMI(weightKg: number, heightCm: number | null): string {
  if (!heightCm || heightCm <= 0) return '—';
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  return bmi.toFixed(1);
}

function bmiCategory(bmi: string): string {
  const v = parseFloat(bmi);
  if (isNaN(v)) return '';
  if (v < 18.5) return 'Bajo peso';
  if (v < 25) return 'Normal';
  if (v < 30) return 'Sobrepeso';
  return 'Obesidad';
}

// ─── Main screen ────────────────────────────────────────────────────────────

export default function WeightTrackingScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { sidePadding, innerWidth } = useLayout();
  const c = useThemeColors();
  const { track } = useAnalytics('WeightTracking');

  const [profile, setProfile] = useState<OnboardingProfileRead | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [progressPhotos, setProgressPhotos] = useState<{ uri: string; date: string }[]>([]);

  // Demo data — in production this comes from API
  const currentWeight = profile?.weight_kg ?? 75;
  const [entries, setEntries] = useState<WeightEntry[]>([]);

  // Load profile once
  React.useEffect(() => {
    getOnboardingProfile()
      .then((p) => {
        setProfile(p);
        setEntries(generateDemoData(p.weight_kg ?? 75));
      })
      .catch(() => {})
      .finally(() => setProfileLoaded(true));
  }, []);

  // Fill demo data if no profile
  React.useEffect(() => {
    if (profileLoaded && entries.length === 0) {
      setEntries(generateDemoData(75));
    }
  }, [profileLoaded]);

  const latestWeight = entries.length > 0 ? entries[entries.length - 1].weight : currentWeight;
  const targetWeight = profile?.target_weight_kg ?? null;
  const heightCm = profile?.height_cm ?? null;
  const diff = targetWeight != null ? latestWeight - targetWeight : null;
  const bmi = calcBMI(latestWeight, heightCm);
  const bmiCat = bmiCategory(bmi);

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
      setProgressPhotos((prev) => [
        { uri: result.assets[0].uri, date: new Date().toISOString().slice(0, 10) },
        ...prev,
      ]);
    }
  }, []);

  const handleLogWeight = useCallback(() => {
    const val = parseFloat(weightInput.replace(',', '.'));
    if (isNaN(val) || val <= 0 || val > 500) {
      haptics.error();
      Alert.alert('Peso invalido', 'Ingresa un peso entre 0.1 y 500 kg.');
      return;
    }

    haptics.success();
    track('weight_logged', { weight_kg: val });
    const today = new Date().toISOString().slice(0, 10);
    setEntries((prev) => {
      // Replace today's entry if exists, otherwise append
      const filtered = prev.filter((e) => e.date !== today);
      return [...filtered, { date: today, weight: Math.round(val * 10) / 10 }];
    });
    setWeightInput('');
  }, [weightInput]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: sidePadding }]}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: c.surface }]}
          onPress={() => {
            haptics.light();
            navigation.goBack();
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={20} color={c.black} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.black }]}>Historial de peso</Text>
        <View style={[styles.backBtn, { backgroundColor: c.surface }]} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          bounces={true}
          overScrollMode="never"
          contentContainerStyle={[styles.scroll, { paddingHorizontal: sidePadding }]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Stats cards */}
          <View style={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: c.surface }]}>
              <Text style={[styles.statLabel, { color: c.gray }]}>Actual</Text>
              <Text style={[styles.statValue, { color: c.black }]}>{latestWeight.toFixed(1)}</Text>
              <Text style={[styles.statUnit, { color: c.gray }]}>kg</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: c.surface }]}>
              <Text style={[styles.statLabel, { color: c.gray }]}>Meta</Text>
              <Text style={[styles.statValue, { color: c.black }]}>{targetWeight != null ? targetWeight.toFixed(1) : '—'}</Text>
              <Text style={[styles.statUnit, { color: c.gray }]}>{targetWeight != null ? 'kg' : ''}</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: c.surface }]}>
              <Text style={[styles.statLabel, { color: c.gray }]}>Diferencia</Text>
              <Text
                style={[
                  styles.statValue,
                  { color: c.black },
                  diff != null && diff <= 0 ? { color: '#4CAF50' } : {},
                ]}
              >
                {diff != null ? `${diff > 0 ? '+' : ''}${diff.toFixed(1)}` : '—'}
              </Text>
              <Text style={[styles.statUnit, { color: c.gray }]}>{diff != null ? 'kg' : ''}</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: c.surface }]}>
              <Text style={[styles.statLabel, { color: c.gray }]}>BMI</Text>
              <Text style={[styles.statValue, { color: c.black }]}>{bmi}</Text>
              <Text style={[styles.statUnit, { color: c.gray }]}>{bmiCat}</Text>
            </View>
          </View>

          {/* Chart */}
          <Text style={[styles.sectionTitle, { color: c.black }]}>Ultimos 30 dias</Text>
          <View style={[styles.chartCard, { backgroundColor: c.bg, borderColor: c.grayLight }]}>
            <WeightChart data={entries} targetWeight={targetWeight} width={innerWidth} />
          </View>

          {/* Progress Photos */}
          <Text style={[styles.sectionTitle, { color: c.black }]}>Fotos de progreso</Text>
          <View style={[styles.photosCard, { backgroundColor: c.bg, borderColor: c.grayLight }]}>
            <View style={styles.photoBtnsRow}>
              <TouchableOpacity style={[styles.photoBtn, { backgroundColor: c.accent }]} onPress={handleTakePhoto} activeOpacity={0.8}>
                <Ionicons name="camera-outline" size={18} color="#FFF" />
                <Text style={styles.photoBtnText}>Tomar foto</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.photoBtn, { backgroundColor: c.surface, borderWidth: 1, borderColor: c.grayLight }]} onPress={handleAddPhoto} activeOpacity={0.8}>
                <Ionicons name="images-outline" size={18} color={c.black} />
                <Text style={[styles.photoBtnText, { color: c.black }]}>Galeria</Text>
              </TouchableOpacity>
            </View>
            {progressPhotos.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photosScroll}>
                {progressPhotos.map((photo, i) => (
                  <View key={i} style={styles.photoItem}>
                    <View>
                      <Image source={{ uri: photo.uri }} style={[styles.photoImage, { borderColor: c.grayLight }]} />
                      <TouchableOpacity
                        style={styles.photoDeleteBtn}
                        onPress={() => {
                          haptics.medium();
                          Alert.alert('Eliminar foto', 'Seguro que quieres eliminar esta foto?', [
                            { text: 'Cancelar', style: 'cancel' },
                            { text: 'Eliminar', style: 'destructive', onPress: () => setProgressPhotos((prev) => prev.filter((_, idx) => idx !== i)) },
                          ]);
                        }}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="close" size={12} color="#FFF" />
                      </TouchableOpacity>
                    </View>
                    <Text style={[styles.photoDate, { color: c.gray }]}>{photo.date.slice(5)}</Text>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.photosEmpty}>
                <Ionicons name="body-outline" size={32} color={c.disabled} />
                <Text style={[styles.photosEmptyText, { color: c.gray }]}>Sube fotos para ver tu progreso visual</Text>
              </View>
            )}
          </View>

          {/* Log weight input */}
          <Text style={[styles.sectionTitle, { color: c.black }]}>Registrar peso</Text>
          <View style={[styles.inputCard, { backgroundColor: c.bg, borderColor: c.grayLight }]}>
            <View style={[styles.inputRow, { backgroundColor: c.surface }]}>
              <Ionicons name="scale-outline" size={20} color={c.gray} />
              <TextInput
                style={[styles.input, { color: c.black }]}
                placeholder="Ej: 72.5"
                placeholderTextColor={c.disabled}
                keyboardType="decimal-pad"
                value={weightInput}
                onChangeText={setWeightInput}
                returnKeyType="done"
                onSubmitEditing={handleLogWeight}
                maxLength={6}
              />
              <Text style={[styles.inputUnit, { color: c.gray }]}>kg</Text>
            </View>
            <TouchableOpacity
              style={[styles.logBtn, { backgroundColor: c.black }, !weightInput && { backgroundColor: c.disabled }]}
              onPress={handleLogWeight}
              activeOpacity={0.8}
              disabled={!weightInput}
            >
              <Ionicons name="add-circle-outline" size={18} color={colors.white} />
              <Text style={styles.logBtnText}>Registrar peso</Text>
            </TouchableOpacity>
          </View>

          {/* Recent entries */}
          <Text style={[styles.sectionTitle, { color: c.black }]}>Registros recientes</Text>
          <View style={[styles.entriesCard, { backgroundColor: c.bg, borderColor: c.grayLight }]}>
            {entries
              .slice(-7)
              .reverse()
              .map((entry, i) => {
                const d = new Date(entry.date + 'T00:00:00');
                const dayStr = d.toLocaleDateString('es-CL', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                });
                return (
                  <View key={entry.date} style={[styles.entryRow, { borderTopColor: c.surface }, i === 0 && styles.entryRowFirst]}>
                    <Text style={[styles.entryDate, { color: c.black }]}>{dayStr}</Text>
                    <Text style={[styles.entryWeight, { color: c.gray }]}>{entry.weight.toFixed(1)} kg</Text>
                  </View>
                );
              })}
          </View>

          <View style={{ height: spacing.xl }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
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
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { ...typography.titleSm, color: colors.black },
  scroll: { paddingTop: spacing.md, paddingBottom: spacing.xl },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    alignItems: 'center',
    gap: 2,
  },
  statLabel: { ...typography.caption, color: colors.gray },
  statValue: { ...typography.titleSm, color: colors.black },
  statUnit: { ...typography.caption, color: colors.gray, minHeight: 14 },

  // Section
  sectionTitle: {
    ...typography.label,
    color: colors.black,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Chart
  chartCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.grayLight,
    padding: spacing.sm,
    marginBottom: spacing.md,
    overflow: 'hidden',
    ...shadows.sm,
  },

  // Input
  inputCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.grayLight,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.md,
    ...shadows.sm,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 48,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.black,
    height: 48,
  },
  inputUnit: {
    ...typography.label,
    color: colors.gray,
  },
  logBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.black,
    borderRadius: radius.full,
    height: 48,
  },
  logBtnDisabled: {
    backgroundColor: colors.disabled,
  },
  logBtnText: {
    ...typography.button,
    color: colors.white,
  },

  // Entries
  entriesCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.grayLight,
    overflow: 'hidden',
    ...shadows.sm,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    borderTopWidth: 1,
    borderTopColor: colors.surface,
  },
  entryRowFirst: {
    borderTopWidth: 0,
  },
  entryDate: { ...typography.bodyMd, color: colors.black },
  entryWeight: { ...typography.label, color: colors.gray },

  // Progress photos
  photosCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.md,
    ...shadows.sm,
  },
  photoBtnsRow: {
    flexDirection: 'row' as const,
    gap: spacing.sm,
  },
  photoBtn: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: spacing.xs,
    borderRadius: radius.md,
    height: 44,
  },
  photoBtnText: {
    ...typography.label,
    color: '#FFFFFF',
  },
  photosScroll: {
    marginTop: spacing.xs,
  },
  photoItem: {
    alignItems: 'center' as const,
    marginRight: spacing.sm,
  },
  photoImage: {
    width: 80,
    height: 107,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  photoDeleteBtn: {
    position: 'absolute' as const,
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  photoDate: {
    ...typography.caption,
    marginTop: 4,
  },
  photosEmpty: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  photosEmptyText: {
    ...typography.caption,
    textAlign: 'center' as const,
    maxWidth: 200,
  },
});
