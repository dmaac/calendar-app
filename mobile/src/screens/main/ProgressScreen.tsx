/**
 * ProgressScreen -- Fitsi AI progress dashboard (rebuilt)
 * FlatList-based, no Modals, no heavy sub-components.
 */
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Share, Alert, ListRenderItem } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Line, Circle, Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';
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

type SK = 'streak' | 'weight' | 'chart' | 'calories' | 'achievements' | 'photos';
const SECTIONS: SK[] = ['streak', 'weight', 'chart', 'calories', 'achievements', 'photos'];

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

// ---- Main screen ------------------------------------------------------------
export default function ProgressScreen(_props: MainTabScreenProps<'Progress'>) {
  const ins = useSafeAreaInsets();
  const { track } = useAnalytics('Progress');
  const c = useThemeColors();
  const { sidePadding, width: sw } = useLayout();
  const { streak, hasFreezeAvailable } = useStreak();
  const [tf, setTf] = useState<TF>('90D');
  const ds = streak > 0 ? streak : 12;

  useEffect(() => { track('screen_viewed', { screen: 'Progress' }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const wd = useMemo(() => ALL_WEIGHT.slice(-Math.min(tfDays(tf), ALL_WEIGHT.length)), [tf]);
  const avgCal = useMemo(() => Math.round(DAILY_CAL.reduce((a, d) => a + d.v, 0) / DAILY_CAL.length), []);

  const onShare = useCallback(async () => {
    haptics.light(); track('share_progress_tapped');
    try {
      await Share.share({ message: `Mi progreso en Fitsi AI:\nPeso actual: ${W.current} kg\nPerdido: ${(W.start - W.current).toFixed(1)} kg\nRacha: ${ds} dias seguidos\nMeta: ${W.goal} kg` });
    } catch { Alert.alert('Error', 'No se pudo compartir.'); }
  }, [ds, track]);

  const renderItem: ListRenderItem<SK> = useCallback(({ item }) => {
    const card = [s.card, { backgroundColor: c.surface, borderColor: c.grayLight }];
    switch (item) {
      case 'streak': return (
        <View style={card}>
          <View style={s.row}>
            <Ionicons name="flame" size={32} color="#FF6B35" />
            <View style={{ marginLeft: spacing.sm, flex: 1 }}>
              <Text style={[s.big22, { color: c.black }]}>{ds} dias</Text>
              <Text style={[s.cap, { color: c.gray }]}>Racha actual</Text>
            </View>
            {hasFreezeAvailable && (
              <View style={[s.badge, { backgroundColor: c.accent + '1A' }]}>
                <Text style={[s.capBold, { color: c.accent }]}>Freeze disponible</Text>
              </View>
            )}
          </View>
        </View>
      );
      case 'weight': {
        const lost = W.start - W.current;
        return (
          <View style={card}>
            <Text style={[s.cap, { color: c.gray, marginBottom: 4 }]}>Peso actual</Text>
            <Text style={[s.big32, { color: c.black, marginBottom: spacing.md }]}>{W.current} kg</Text>
            <View style={[s.row, { marginBottom: spacing.md }]}>
              {[{ l: 'Inicio', v: `${W.start} kg`, cl: c.black }, { l: 'Perdido', v: `-${lost.toFixed(1)} kg`, cl: c.success }, { l: 'Meta', v: `${W.goal} kg`, cl: c.black }].map((x, i) => (
                <React.Fragment key={x.l}>
                  {i > 0 && <View style={[s.div, { backgroundColor: c.grayLight }]} />}
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={[s.cap, { color: c.gray, marginBottom: 2 }]}>{x.l}</Text>
                    <Text style={[s.statV, { color: x.cl }]}>{x.v}</Text>
                  </View>
                </React.Fragment>
              ))}
            </View>
            <View style={s.goalRow}>
              <Ionicons name="trending-down" size={14} color={c.success} />
              <Text style={[s.capBold, { color: c.success }]}>Llegas a tu meta el {W.goalDate}</Text>
            </View>
          </View>
        );
      }
      case 'chart': {
        const cw = sw - sidePadding * 2 - spacing.md * 2;
        return (
          <View style={card}>
            <Text style={[s.secTitle, { color: c.black }]}>Tendencia de peso</Text>
            <View style={s.filterRow}>
              {TF_LIST.map(f => (
                <TouchableOpacity key={f} style={[s.pill, { backgroundColor: c.grayLight + '30' }, tf === f && { backgroundColor: c.accent }]} onPress={() => { haptics.light(); setTf(f); }} activeOpacity={0.7}>
                  <Text style={[s.capBold, { color: c.gray }, tf === f && { color: '#FFF' }]}>{f}</Text>
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
            <Text style={[s.secTitle, { color: c.black }]}>Calorias diarias</Text>
            <Text style={[s.cap, { color: c.gray, marginBottom: spacing.sm }]}>Promedio esta semana</Text>
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={[s.big24, { color: c.black }]}>{avgCal} kcal</Text>
                <Text style={[s.cap, { color: diff <= 0 ? c.success : c.protein }]}>{diff <= 0 ? `${Math.abs(diff)} bajo meta` : `${diff} sobre meta`}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[s.cap, { color: c.gray }]}>Meta</Text>
                <Text style={[s.statV, { color: c.black }]}>{CALORIE_TARGET} kcal</Text>
              </View>
            </View>
          </View>
        );
      }
      case 'achievements': return (
        <View style={card}>
          <View style={[s.row, { marginBottom: spacing.sm }]}>
            <Text style={[s.secTitle, { color: c.black, flex: 1, marginBottom: 0 }]}>Logros</Text>
            <TouchableOpacity onPress={() => haptics.light()} activeOpacity={0.7}>
              <Text style={[s.capBold, { color: c.accent }]}>Ver todo</Text>
            </TouchableOpacity>
          </View>
          <FlatList horizontal data={BADGES} keyExtractor={b => b.id} showsHorizontalScrollIndicator={false}
            renderItem={({ item: b }) => (
              <View style={s.badgeItem}>
                <View style={[s.badgeCircle, { backgroundColor: b.bg }]}><Ionicons name={b.icon} size={22} color={b.color} /></View>
                <Text style={[s.cap, { color: c.gray, textAlign: 'center' }]} numberOfLines={1}>{b.label}</Text>
              </View>
            )}
          />
        </View>
      );
      case 'photos': return (
        <View style={{ marginBottom: spacing.md }}>
          <View style={card}>
            <Text style={[s.secTitle, { color: c.black }]}>Fotos de progreso</Text>
            <View style={s.photosRow}>
              {['Agregar', ''].map((lbl, i) => (
                <TouchableOpacity key={i} style={[s.photoBox, { backgroundColor: c.grayLight + '40', borderColor: c.grayLight }]} onPress={() => haptics.light()} activeOpacity={0.7}>
                  <Ionicons name={i === 0 ? 'camera-outline' : 'add-outline'} size={28} color={c.gray} />
                  {lbl ? <Text style={[s.cap, { color: c.gray, marginTop: 4 }]}>{lbl}</Text> : null}
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <TouchableOpacity style={[s.shareCta, { backgroundColor: c.accent }]} onPress={onShare} activeOpacity={0.85} accessibilityLabel="Compartir mi progreso" accessibilityRole="button">
            <Ionicons name="share-social-outline" size={20} color="#FFF" />
            <Text style={s.shareCtaText}>Compartir mi progreso</Text>
          </TouchableOpacity>
        </View>
      );
      default: return null;
    }
  }, [ds, hasFreezeAvailable, c, tf, wd, sw, sidePadding, avgCal, onShare]);

  return (
    <View style={[s.screen, { paddingTop: ins.top, backgroundColor: c.bg }]}>
      <View style={[s.header, { paddingHorizontal: sidePadding }]}>
        <Text style={[s.big28, { color: c.black }]}>Progreso</Text>
        <TouchableOpacity style={[s.shareBtn, { backgroundColor: c.accent + '18', borderColor: c.accent + '30' }]} onPress={onShare} activeOpacity={0.7} accessibilityLabel="Compartir progreso" accessibilityRole="button">
          <Ionicons name="share-social-outline" size={16} color={c.accent} />
          <Text style={[s.capBold, { color: c.accent }]}>Compartir</Text>
        </TouchableOpacity>
      </View>
      <FlatList data={SECTIONS} renderItem={renderItem} keyExtractor={k => k} showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: sidePadding, paddingTop: spacing.sm, paddingBottom: ins.bottom + 100 }}
      />
    </View>
  );
}

// ---- Styles -----------------------------------------------------------------
const s = StyleSheet.create({
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
});
