/**
 * ProgressScreen -- Fitsi AI progress dashboard (rebuilt)
 * FlatList-based, no Modals, no heavy sub-components.
 */
import React, { useState, useMemo, useCallback, useEffect, memo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Share, Alert, ListRenderItem, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Line, Circle, Rect, Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import { typography, spacing, radius, useThemeColors, useLayout } from '../../theme';
import { haptics } from '../../hooks/useHaptics';
import { useAnalytics } from '../../hooks/useAnalytics';
import useStreak from '../../hooks/useStreak';
import type { MainTabScreenProps } from '../../navigation/types';

// ---- Placeholder data -------------------------------------------------------
const W = { current: 80.0, start: 85.0, goal: 75.0, goalDate: 'Jun 2, 2026' };
const CALORIE_TARGET = 2100;
const DAILY_CAL = [
  { day: 'Lun', v: 1950 }, { day: 'Mar', v: 2100 }, { day: 'Mie', v: 1800 },
  { day: 'Jue', v: 2200 }, { day: 'Vie', v: 1750 }, { day: 'Sab', v: 2400 }, { day: 'Dom', v: 2050 },
];
const BADGES = [
  { id: '1', icon: 'camera-outline' as const, label: '1a comida', color: '#4285F4', bg: '#E8F0FE' },
  { id: '2', icon: 'flame-outline' as const, label: '7 dias', color: '#F59E0B', bg: '#FEF3C7' },
  { id: '3', icon: 'trending-down-outline' as const, label: '-1 kg', color: '#10B981', bg: '#D1FAE5' },
  { id: '4', icon: 'water-outline' as const, label: '2L agua', color: '#4285F4', bg: '#E8F0FE' },
  { id: '5', icon: 'star-outline' as const, label: '14 dias', color: '#8B5CF6', bg: '#EDE9FE' },
];

// ---- Heatmap mock data (90 days) -------------------------------------------
function genHeatmap(days: number) {
  const data: { date: Date; score: number }[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    const hasData = Math.random() > 0.15;
    data.push({ date: d, score: hasData ? Math.round(Math.random() * 10) : -1 });
  }
  return data;
}
const HEATMAP_DATA = genHeatmap(90);
const MONTH_LABELS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

// ---- Micronutrient mock data -----------------------------------------------
type Micro = { name: string; current: number; target: number; unit: string };
const ALL_MICROS: Micro[] = [
  { name: 'Vitamina A', current: 720, target: 900, unit: 'mcg' },
  { name: 'Vitamina C', current: 65, target: 90, unit: 'mg' },
  { name: 'Vitamina D', current: 12, target: 20, unit: 'mcg' },
  { name: 'Vitamina B12', current: 2.8, target: 2.4, unit: 'mcg' },
  { name: 'Hierro', current: 11, target: 18, unit: 'mg' },
  { name: 'Calcio', current: 850, target: 1000, unit: 'mg' },
  { name: 'Zinc', current: 7, target: 11, unit: 'mg' },
  { name: 'Magnesio', current: 280, target: 400, unit: 'mg' },
];

// ---- Supplement mock data --------------------------------------------------
type Supp = { id: string; name: string; dose: string; time: string };
const SUPPLEMENTS: Supp[] = [
  { id: 's1', name: 'Multivitaminico', dose: '1 capsula', time: 'Manana' },
  { id: 's2', name: 'Omega-3', dose: '2 capsulas', time: 'Manana' },
  { id: 's3', name: 'Vitamina D', dose: '1 capsula', time: 'Manana' },
  { id: 's4', name: 'Proteina', dose: '1 scoop', time: 'Post-entreno' },
  { id: 's5', name: 'Creatina', dose: '5 g', time: 'Tarde' },
];

function genWeightHistory(days: number, start: number, cur: number) {
  const data: { date: Date; weight: number }[] = [];
  const now = new Date();
  const diff = start - cur;
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    const t = start - diff * (1 - i / days) + Math.sin(i * 0.4) * 0.4;
    data.push({ date: d, weight: Math.round(t * 10) / 10 });
  }
  return data;
}
const ALL_WEIGHT = genWeightHistory(365, W.start, W.current);

type TF = '90D' | '6M' | '1Y';
const TF_LIST: TF[] = ['90D', '6M', '1Y'];
const tfDays = (f: TF) => f === '90D' ? 90 : f === '6M' ? 180 : 365;

type SK = 'streak' | 'weight' | 'chart' | 'calories' | 'workouts' | 'achievements' | 'photos' | 'heatmap' | 'micronutrients' | 'supplements';
const SECTIONS: SK[] = ['streak', 'weight', 'chart', 'calories', 'workouts', 'achievements', 'photos', 'heatmap', 'micronutrients', 'supplements'];

// ---- Workout mock data -------------------------------------------------------
const WORKOUT_TYPES: Record<string, { icon: string; label: string; color: string }> = {
  cardio: { icon: 'bicycle-outline', label: 'Cardio', color: '#F59E0B' },
  fuerza: { icon: 'barbell-outline', label: 'Fuerza', color: '#EF4444' },
  yoga: { icon: 'body-outline', label: 'Yoga', color: '#8B5CF6' },
  correr: { icon: 'walk-outline', label: 'Correr', color: '#10B981' },
  hiit: { icon: 'flash-outline', label: 'HIIT', color: '#F97316' },
  natacion: { icon: 'water-outline', label: 'Natacion', color: '#06B6D4' },
};
const WEEKLY_MINS = [45, 0, 30, 60, 0, 45, 0]; // Lun-Dom
const RECENT_WK = [
  { type: 'cardio', duration: 45, calories: 380 },
  { type: 'fuerza', duration: 60, calories: 320 },
  { type: 'yoga', duration: 30, calories: 150 },
];
const WK_TOTALS = { sessions: RECENT_WK.length, mins: WEEKLY_MINS.reduce((a, b) => a + b, 0), cals: RECENT_WK.reduce((a, w) => a + w.calories, 0) };

// ---- Weight SVG chart -------------------------------------------------------
const CH = 200;
const CP = { t: 20, b: 28, l: 40, r: 16 };
const WeightChart = React.memo(function WeightChart({ data, gw, w, ac, su, dt, sp, wh }: {
  data: { date: Date; weight: number }[]; gw: number; w: number;
  ac: string; su: string; dt: string; sp: string; wh: string;
}) {
  if (data.length < 2 || w <= 0) return null;
  const dW = w - CP.l - CP.r, dH = CH - CP.t - CP.b;
  const ws = data.map(d => d.weight);
  const mn = Math.min(...ws, gw) - 0.5, mx = Math.max(...ws, gw) + 0.5, rng = mx - mn || 1;
  const tX = (i: number) => CP.l + (i / (data.length - 1)) * dW;
  const tY = (v: number) => CP.t + dH - ((v - mn) / rng) * dH;
  const lp = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${tX(i).toFixed(1)},${tY(d.weight).toFixed(1)}`).join(' ');
  const ap = `${lp} L${tX(data.length - 1).toFixed(1)},${(CH - CP.b).toFixed(1)} L${tX(0).toFixed(1)},${(CH - CP.b).toFixed(1)} Z`;
  const gy = tY(gw);
  const yt = Array.from({ length: 4 }, (_, i) => { const v = mn + (rng * i) / 3; return { v, y: tY(v) }; });
  const xi = [0, Math.floor(data.length / 2), data.length - 1];
  const fm = (d: Date) => { const m = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']; return `${m[d.getMonth()]} ${d.getDate()}`; };
  const li = data.length - 1, lx = tX(li), ly = tY(data[li].weight);
  return (
    <Svg width={w} height={CH}>
      <Defs><LinearGradient id="wg" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={ac} stopOpacity="0.25" /><Stop offset="1" stopColor={ac} stopOpacity="0.02" /></LinearGradient></Defs>
      {yt.map((t, i) => <Line key={i} x1={CP.l} y1={t.y} x2={w - CP.r} y2={t.y} stroke={sp} strokeWidth={0.5} />)}
      <Line x1={CP.l} y1={gy} x2={w - CP.r} y2={gy} stroke={su} strokeWidth={1.5} strokeDasharray="6,4" />
      <SvgText x={w - CP.r - 2} y={gy - 5} fontSize={9} fontWeight="700" fill={su} textAnchor="end">Meta {gw} kg</SvgText>
      {yt.map((t, i) => <SvgText key={`y${i}`} x={CP.l - 6} y={t.y + 4} fontSize={10} fill={dt} textAnchor="end">{t.v.toFixed(1)}</SvgText>)}
      {xi.map(idx => <SvgText key={`x${idx}`} x={tX(idx)} y={CH - 4} fontSize={10} fill={dt} textAnchor="middle">{fm(data[idx].date)}</SvgText>)}
      <Path d={ap} fill="url(#wg)" />
      <Path d={lp} fill="none" stroke={ac} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={lx} cy={ly} r={5} fill={ac} /><Circle cx={lx} cy={ly} r={2.5} fill={wh} />
      <SvgText x={lx} y={ly - 10} fontSize={11} fontWeight="700" fill={ac} textAnchor="middle">{data[li].weight} kg</SvgText>
    </Svg>
  );
});

// ---- Heatmap helpers --------------------------------------------------------
function heatColor(score: number, surface: string): string {
  if (score < 0) return surface;
  if (score <= 3) return '#EF4444';
  if (score <= 6) return '#F59E0B';
  return '#34A853';
}
function heatOpacity(score: number): number {
  if (score < 0) return 0.3;
  return 0.4 + (score / 10) * 0.6;
}

// ---- Micronutrient row (memoized) -------------------------------------------
const MicroRow = memo(function MicroRow({ m, c }: { m: Micro; c: ReturnType<typeof useThemeColors> }) {
  const pct = Math.min((m.current / m.target) * 100, 100);
  const barColor = pct < 50 ? '#EF4444' : pct < 80 ? '#F59E0B' : '#34A853';
  return (
    <View style={{ marginBottom: spacing.sm }}>
      <View style={[st.row, { justifyContent: 'space-between', marginBottom: 2 }]}>
        <Text style={[st.cap, { color: c.black, fontWeight: '600' }]}>{m.name}</Text>
        <Text style={[st.cap, { color: c.gray }]}>{m.current}{m.unit} / {m.target}{m.unit}</Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: c.grayLight + '50', overflow: 'hidden' }}>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: barColor, width: `${pct}%` as any }} />
      </View>
    </View>
  );
});

// ---- Main screen ------------------------------------------------------------
export default function ProgressScreen(_props: MainTabScreenProps<'Progress'>) {
  const ins = useSafeAreaInsets();
  const navigation = useNavigation();
  const { track } = useAnalytics('Progress');
  const c = useThemeColors();
  const { sidePadding, width: sw } = useLayout();
  const { streak, hasFreezeAvailable } = useStreak();
  const [tf, setTf] = useState<TF>('90D');
  const [microExpanded, setMicroExpanded] = useState(false);
  const [suppChecked, setSuppChecked] = useState<Record<string, boolean>>({});
  const ds = streak > 0 ? streak : 12;
  const suppCount = Object.values(suppChecked).filter(Boolean).length;

  useEffect(() => { track('screen_viewed', { screen: 'Progress' }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const wd = useMemo(() => ALL_WEIGHT.slice(-Math.min(tfDays(tf), ALL_WEIGHT.length)), [tf]);
  const avgCal = useMemo(() => Math.round(DAILY_CAL.reduce((a, d) => a + d.v, 0) / DAILY_CAL.length), []);

  const toggleSupp = useCallback((id: string) => {
    haptics.medium();
    setSuppChecked(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const onShare = useCallback(async () => {
    haptics.light(); track('share_progress_tapped');
    try {
      await Share.share({ message: `Mi progreso en Fitsi AI:\nPeso actual: ${W.current} kg\nPerdido: ${(W.start - W.current).toFixed(1)} kg\nRacha: ${ds} dias seguidos\nMeta: ${W.goal} kg` });
    } catch { Alert.alert('Error', 'No se pudo compartir.'); }
  }, [ds, track]);

  // Heatmap grid (computed once)
  const heatmapGrid = useMemo(() => {
    const SQ = 11, GAP = 3;
    const first = HEATMAP_DATA[0].date;
    const dayOfWeek = (first.getDay() + 6) % 7; // Mon=0
    const padded: (typeof HEATMAP_DATA[0] | null)[] = [...Array(dayOfWeek).fill(null), ...HEATMAP_DATA];
    const cols = Math.ceil(padded.length / 7);
    const monthMarkers: { col: number; label: string }[] = [];
    let lastMonth = -1;
    for (let col = 0; col < cols; col++) {
      const entry = padded[col * 7];
      if (entry) {
        const m = entry.date.getMonth();
        if (m !== lastMonth) { monthMarkers.push({ col, label: MONTH_LABELS[m] }); lastMonth = m; }
      }
    }
    return { padded, cols, monthMarkers, SQ, GAP };
  }, []);

  const renderItem: ListRenderItem<SK> = useCallback(({ item }) => {
    const card = [st.card, { backgroundColor: c.surface, borderColor: c.grayLight }];
    switch (item) {
      case 'streak': return (
        <View style={card}>
          <View style={st.row}>
            <Ionicons name="flame" size={32} color="#FF6B35" />
            <View style={{ marginLeft: spacing.sm, flex: 1 }}>
              <Text style={[st.big22, { color: c.black }]}>{ds} dias</Text>
              <Text style={[st.cap, { color: c.gray }]}>Racha actual</Text>
            </View>
            {hasFreezeAvailable && (
              <View style={[st.badge, { backgroundColor: c.accent + '1A' }]}>
                <Text style={[st.capBold, { color: c.accent }]}>Freeze disponible</Text>
              </View>
            )}
          </View>
        </View>
      );
      case 'weight': {
        const lost = W.start - W.current;
        return (
          <View style={card}>
            <Text style={[st.cap, { color: c.gray, marginBottom: 4 }]}>Peso actual</Text>
            <Text style={[st.big32, { color: c.black, marginBottom: spacing.md }]}>{W.current} kg</Text>
            <View style={[st.row, { marginBottom: spacing.md }]}>
              {[{ l: 'Inicio', v: `${W.start} kg`, cl: c.black }, { l: 'Perdido', v: `-${lost.toFixed(1)} kg`, cl: c.success }, { l: 'Meta', v: `${W.goal} kg`, cl: c.black }].map((x, i) => (
                <React.Fragment key={x.l}>
                  {i > 0 && <View style={[st.div, { backgroundColor: c.grayLight }]} />}
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={[st.cap, { color: c.gray, marginBottom: 2 }]}>{x.l}</Text>
                    <Text style={[st.statV, { color: x.cl }]}>{x.v}</Text>
                  </View>
                </React.Fragment>
              ))}
            </View>
            <View style={st.goalRow}>
              <Ionicons name="trending-down" size={14} color={c.success} />
              <Text style={[st.capBold, { color: c.success }]}>Llegas a tu meta el {W.goalDate}</Text>
            </View>
          </View>
        );
      }
      case 'chart': {
        const cw = sw - sidePadding * 2 - spacing.md * 2;
        return (
          <View style={card}>
            <Text style={[st.secTitle, { color: c.black }]}>Tendencia de peso</Text>
            <View style={st.filterRow}>
              {TF_LIST.map(f => (
                <TouchableOpacity key={f} style={[st.pill, { backgroundColor: c.grayLight + '30' }, tf === f && { backgroundColor: c.accent }]} onPress={() => { haptics.light(); setTf(f); }} activeOpacity={0.7}>
                  <Text style={[st.capBold, { color: c.gray }, tf === f && { color: '#FFF' }]}>{f}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <WeightChart data={wd} gw={W.goal} w={cw} ac={c.accent} su={c.success} dt={c.disabled} sp={c.grayLight} wh={c.white} />
          </View>
        );
      }
      case 'calories': {
        const diff = avgCal - CALORIE_TARGET;
        return (
          <View style={card}>
            <Text style={[st.secTitle, { color: c.black }]}>Calorias diarias</Text>
            <Text style={[st.cap, { color: c.gray, marginBottom: spacing.sm }]}>Promedio esta semana</Text>
            <View style={st.row}>
              <View style={{ flex: 1 }}>
                <Text style={[st.big24, { color: c.black }]}>{avgCal} kcal</Text>
                <Text style={[st.cap, { color: diff <= 0 ? c.success : c.protein }]}>{diff <= 0 ? `${Math.abs(diff)} bajo meta` : `${diff} sobre meta`}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[st.cap, { color: c.gray }]}>Meta</Text>
                <Text style={[st.statV, { color: c.black }]}>{CALORIE_TARGET} kcal</Text>
              </View>
            </View>
          </View>
        );
      }
      case 'workouts': {
        const nav = navigation;
        const maxMin = Math.max(...WEEKLY_MINS, 1);
        const dayLabels = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
        return (
          <View style={card}>
            <View style={[st.row, { marginBottom: spacing.sm }]}>
              <Text style={[st.secTitle, { color: c.black, flex: 1, marginBottom: 0 }]}>Ejercicio</Text>
              <TouchableOpacity onPress={() => { haptics.light(); (nav as any).navigate('Perfil', { screen: 'Workouts' }); }} activeOpacity={0.7}>
                <Text style={[st.capBold, { color: c.accent }]}>Registrar</Text>
              </TouchableOpacity>
            </View>
            <View style={st.row}>
              <View style={{ flex: 1, alignItems: 'center' }}><Text style={[st.statV, { color: c.black }]}>{WK_TOTALS.sessions}</Text><Text style={[st.cap, { color: c.gray }]}>Sesiones</Text></View>
              <View style={[st.div, { backgroundColor: c.grayLight }]} />
              <View style={{ flex: 1, alignItems: 'center' }}><Text style={[st.statV, { color: c.black }]}>{WK_TOTALS.mins}</Text><Text style={[st.cap, { color: c.gray }]}>Minutos</Text></View>
              <View style={[st.div, { backgroundColor: c.grayLight }]} />
              <View style={{ flex: 1, alignItems: 'center' }}><Text style={[st.statV, { color: c.black }]}>{WK_TOTALS.cals}</Text><Text style={[st.cap, { color: c.gray }]}>kcal</Text></View>
            </View>
            <Svg width={sw} height={100} style={{ marginTop: spacing.sm }}>
              {WEEKLY_MINS.map((m, i) => {
                const bw = (sw - 48) / 7;
                const bh = maxMin > 0 ? (m / maxMin) * 60 : 0;
                return (
                  <React.Fragment key={i}>
                    <Rect x={i * bw + 24} y={70 - bh} width={bw - 6} height={bh} rx={4} fill={m > 0 ? c.accent : c.grayLight + '40'} />
                    <SvgText x={i * bw + 24 + (bw - 6) / 2} y={90} textAnchor="middle" fontSize={10} fill={c.gray}>{dayLabels[i]}</SvgText>
                  </React.Fragment>
                );
              })}
            </Svg>
            {RECENT_WK.map((w, i) => {
              const wt = WORKOUT_TYPES[w.type] || WORKOUT_TYPES.cardio;
              return (
                <View key={i} style={[st.row, { paddingVertical: spacing.sm, borderTopWidth: i === 0 ? 1 : 0, borderTopColor: c.grayLight }]}>
                  <View style={[{ width: 36, height: 36, borderRadius: 18, backgroundColor: wt.color + '20', alignItems: 'center', justifyContent: 'center' }]}>
                    <Ionicons name={wt.icon as any} size={18} color={wt.color} />
                  </View>
                  <View style={{ flex: 1, marginLeft: spacing.sm }}>
                    <Text style={[st.body, { color: c.black }]}>{wt.label}</Text>
                    <Text style={[st.cap, { color: c.gray }]}>{w.duration} min</Text>
                  </View>
                  <Text style={[st.statV, { color: c.black }]}>{w.calories} kcal</Text>
                </View>
              );
            })}
          </View>
        );
      }
      case 'achievements': return (
        <View style={card}>
          <View style={[st.row, { marginBottom: spacing.sm }]}>
            <Text style={[st.secTitle, { color: c.black, flex: 1, marginBottom: 0 }]}>Logros</Text>
            <TouchableOpacity onPress={() => haptics.light()} activeOpacity={0.7}>
              <Text style={[st.capBold, { color: c.accent }]}>Ver todo</Text>
            </TouchableOpacity>
          </View>
          <FlatList horizontal data={BADGES} keyExtractor={b => b.id} showsHorizontalScrollIndicator={false}
            renderItem={({ item: b }) => (
              <View style={st.badgeItem}>
                <View style={[st.badgeCircle, { backgroundColor: b.bg }]}><Ionicons name={b.icon} size={22} color={b.color} /></View>
                <Text style={[st.cap, { color: c.gray, textAlign: 'center' }]} numberOfLines={1}>{b.label}</Text>
              </View>
            )}
          />
        </View>
      );
      case 'photos': return (
        <View style={{ marginBottom: spacing.md }}>
          <View style={card}>
            <Text style={[st.secTitle, { color: c.black }]}>Fotos de progreso</Text>
            <View style={st.photosRow}>
              {['Agregar', ''].map((lbl, i) => (
                <TouchableOpacity key={i} style={[st.photoBox, { backgroundColor: c.grayLight + '40', borderColor: c.grayLight }]} onPress={() => haptics.light()} activeOpacity={0.7}>
                  <Ionicons name={i === 0 ? 'camera-outline' : 'add-outline'} size={28} color={c.gray} />
                  {lbl ? <Text style={[st.cap, { color: c.gray, marginTop: 4 }]}>{lbl}</Text> : null}
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <TouchableOpacity style={[st.shareCta, { backgroundColor: c.accent }]} onPress={onShare} activeOpacity={0.85} accessibilityLabel="Compartir mi progreso" accessibilityRole="button">
            <Ionicons name="share-social-outline" size={20} color="#FFF" />
            <Text style={st.shareCtaText}>Compartir mi progreso</Text>
          </TouchableOpacity>
        </View>
      );

      /* ---- 1. Calendar Heatmap ------------------------------------------- */
      case 'heatmap': {
        const { padded, cols, monthMarkers, SQ, GAP } = heatmapGrid;
        const gridW = cols * (SQ + GAP);
        const gridH = 7 * (SQ + GAP);
        return (
          <View style={card}>
            <View style={[st.row, { marginBottom: spacing.sm }]}>
              <Ionicons name="calendar-outline" size={18} color={c.accent} style={{ marginRight: spacing.xs }} />
              <Text style={[st.secTitle, { color: c.black, marginBottom: 0 }]}>NutriScore diario</Text>
            </View>
            <Text style={[st.cap, { color: c.gray, marginBottom: spacing.sm }]}>Ultimos 90 dias</Text>
            {/* Month labels */}
            <View style={{ height: 14, marginBottom: 4 }}>
              {monthMarkers.map((mm, i) => (
                <Text key={i} style={[st.cap, { color: c.gray, position: 'absolute', left: mm.col * (SQ + GAP), fontSize: 10 }]}>{mm.label}</Text>
              ))}
            </View>
            {/* Grid: 7 rows x N cols, absolutely positioned squares */}
            <View style={{ width: gridW, height: gridH }}>
              {Array.from({ length: cols * 7 }).map((_, i) => {
                const col = Math.floor(i / 7);
                const row = i % 7;
                const entry = padded[i];
                if (!entry) return <View key={i} style={{ position: 'absolute', left: col * (SQ + GAP), top: row * (SQ + GAP), width: SQ, height: SQ }} />;
                return (
                  <View key={i} style={{ position: 'absolute', left: col * (SQ + GAP), top: row * (SQ + GAP), width: SQ, height: SQ, borderRadius: 2, backgroundColor: heatColor(entry.score, c.surface), opacity: heatOpacity(entry.score) }} />
                );
              })}
            </View>
            {/* Legend */}
            <View style={[st.row, { marginTop: spacing.sm, gap: spacing.xs }]}>
              <Text style={[st.cap, { color: c.gray, fontSize: 10 }]}>Bajo</Text>
              {[c.surface, '#EF4444', '#F59E0B', '#34A853'].map((bg, i) => (
                <View key={i} style={{ width: SQ, height: SQ, borderRadius: 2, backgroundColor: bg, opacity: i === 0 ? 0.3 : 0.75 }} />
              ))}
              <Text style={[st.cap, { color: c.gray, fontSize: 10 }]}>Alto</Text>
            </View>
          </View>
        );
      }

      /* ---- 2. Micronutrient Dashboard ------------------------------------ */
      case 'micronutrients': {
        const visible = microExpanded ? ALL_MICROS : ALL_MICROS.slice(0, 4);
        return (
          <View style={card}>
            <View style={[st.row, { marginBottom: spacing.sm }]}>
              <Ionicons name="nutrition-outline" size={18} color={c.accent} style={{ marginRight: spacing.xs }} />
              <Text style={[st.secTitle, { color: c.black, flex: 1, marginBottom: 0 }]}>Micronutrientes</Text>
            </View>
            <Text style={[st.cap, { color: c.gray, marginBottom: spacing.md }]}>% del valor diario recomendado</Text>
            {visible.map(m => <MicroRow key={m.name} m={m} c={c} />)}
            <TouchableOpacity
              style={[st.expandBtn, { borderColor: c.grayLight }]}
              onPress={() => { haptics.light(); setMicroExpanded(v => !v); }}
              activeOpacity={0.7}
            >
              <Text style={[st.capBold, { color: c.accent }]}>{microExpanded ? 'Ver menos' : `Ver todo (${ALL_MICROS.length})`}</Text>
              <Ionicons name={microExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={c.accent} />
            </TouchableOpacity>
          </View>
        );
      }

      /* ---- 3. Supplement Tracker ----------------------------------------- */
      case 'supplements': return (
        <View style={card}>
          <View style={[st.row, { marginBottom: spacing.sm }]}>
            <Ionicons name="medkit-outline" size={18} color={c.accent} style={{ marginRight: spacing.xs }} />
            <Text style={[st.secTitle, { color: c.black, flex: 1, marginBottom: 0 }]}>Suplementos diarios</Text>
            <View style={[st.badge, { backgroundColor: c.accent + '1A' }]}>
              <Text style={[st.capBold, { color: c.accent }]}>{suppCount}/{SUPPLEMENTS.length} tomados</Text>
            </View>
          </View>
          {SUPPLEMENTS.map(sup => {
            const checked = !!suppChecked[sup.id];
            return (
              <TouchableOpacity
                key={sup.id}
                style={[st.suppRow, { borderBottomColor: c.grayLight + '40' }]}
                onPress={() => toggleSupp(sup.id)}
                activeOpacity={0.7}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
              >
                <View style={[st.checkbox, { borderColor: checked ? c.accent : c.grayLight, backgroundColor: checked ? c.accent : 'transparent' }]}>
                  {checked && <Ionicons name="checkmark" size={14} color="#FFF" />}
                </View>
                <View style={{ flex: 1, marginLeft: spacing.sm }}>
                  <Text style={[st.capBold, { color: checked ? c.gray : c.black, textDecorationLine: checked ? 'line-through' : 'none' }]}>{sup.name}</Text>
                  <Text style={[st.cap, { color: c.gray }]}>{sup.dose}</Text>
                </View>
                <View style={[st.timePill, { backgroundColor: c.grayLight + '30' }]}>
                  <Ionicons name="time-outline" size={10} color={c.gray} />
                  <Text style={[st.cap, { color: c.gray, fontSize: 10, marginLeft: 2 }]}>{sup.time}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      );

      default: return null;
    }
  }, [ds, hasFreezeAvailable, c, tf, wd, sw, sidePadding, avgCal, onShare, heatmapGrid, microExpanded, suppChecked, suppCount, toggleSupp, navigation]);

  return (
    <View style={[st.screen, { paddingTop: ins.top, backgroundColor: c.bg }]}>
      <View style={[st.header, { paddingHorizontal: sidePadding }]}>
        <Text style={[st.big28, { color: c.black }]}>Progreso</Text>
        <TouchableOpacity style={[st.shareBtn, { backgroundColor: c.accent + '18', borderColor: c.accent + '30' }]} onPress={onShare} activeOpacity={0.7} accessibilityLabel="Compartir progreso" accessibilityRole="button">
          <Ionicons name="share-social-outline" size={16} color={c.accent} />
          <Text style={[st.capBold, { color: c.accent }]}>Compartir</Text>
        </TouchableOpacity>
      </View>
      <FlatList data={SECTIONS} renderItem={renderItem} keyExtractor={k => k} showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: sidePadding, paddingTop: spacing.sm, paddingBottom: ins.bottom + 100 }}
      />
    </View>
  );
}

// ---- Styles -----------------------------------------------------------------
const st = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingVertical: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  big28: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  big32: { fontSize: 32, fontWeight: '800' },
  big24: { fontSize: 24, fontWeight: '800' },
  big22: { fontSize: 22, fontWeight: '800' },
  shareBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, borderWidth: 1 },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, marginBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center' },
  cap: { ...typography.caption },
  capBold: { ...typography.caption, fontWeight: '600' },
  statV: { ...typography.bodyMd, fontWeight: '700' },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.full },
  div: { width: 1, height: 28 },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: 'rgba(52,211,153,0.1)', paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.sm, borderRadius: radius.md },
  secTitle: { ...typography.titleSm, marginBottom: spacing.sm },
  filterRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  pill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.full },
  badgeItem: { alignItems: 'center', marginRight: spacing.md, width: 60 },
  badgeCircle: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  photosRow: { flexDirection: 'row', gap: spacing.md },
  photoBox: { flex: 1, height: 140, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  shareCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, height: 56, borderRadius: radius.full },
  shareCtaText: { ...typography.button, color: '#FFFFFF' },
  // Micronutrients
  expandBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.sm, borderTopWidth: 1, marginTop: spacing.xs },
  // Supplements
  suppRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm + 2, borderBottomWidth: StyleSheet.hairlineWidth },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  timePill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
});
