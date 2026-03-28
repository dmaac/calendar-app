/**
 * ProgressScreen -- Fitsi AI progress dashboard (redesigned)
 * Premium polish: hero streak, arc chart, compact heatmap, shadow cards.
 * FlatList-based, no Modals, uses useThemeColors(). Under 600 lines.
 */
import React, { useState, useMemo, useCallback, useEffect, memo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Share, Alert, ListRenderItem } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Line, Circle as SvgCircle, Rect, Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import { typography, spacing, radius, shadows, useThemeColors, useLayout } from '../../theme';
import { haptics } from '../../hooks/useHaptics';
import { useAnalytics } from '../../hooks/useAnalytics';
import useStreak from '../../hooks/useStreak';
import type { MainTabScreenProps } from '../../navigation/types';

/* ---- Mock data -------------------------------------------------------------- */
const W = { current: 75.2, start: 85.0, goal: 70.0, goalDate: 'Jun 2, 2026' };
const CAL_TARGET = 2100;
const DAILY_CAL = [{ d:'Lun',v:1950 },{ d:'Mar',v:2100 },{ d:'Mie',v:1800 },{ d:'Jue',v:2200 },{ d:'Vie',v:1750 },{ d:'Sab',v:2400 },{ d:'Dom',v:2050 }];
const BADGES = [
  { id:'1',icon:'camera-outline' as const,label:'1a comida',color:'#4285F4',bg:'#E8F0FE' },
  { id:'2',icon:'flame-outline' as const,label:'7 dias',color:'#F59E0B',bg:'#FEF3C7' },
  { id:'3',icon:'trending-down-outline' as const,label:'-1 kg',color:'#10B981',bg:'#D1FAE5' },
  { id:'4',icon:'water-outline' as const,label:'2L agua',color:'#4285F4',bg:'#E8F0FE' },
  { id:'5',icon:'star-outline' as const,label:'14 dias',color:'#8B5CF6',bg:'#EDE9FE' },
];
const ML = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
function genHeat(n: number) {
  const d: { date: Date; score: number }[] = [], now = new Date();
  for (let i = n - 1; i >= 0; i--) { const x = new Date(now); x.setDate(x.getDate() - i); d.push({ date: x, score: Math.random() > .15 ? Math.round(Math.random() * 10) : -1 }); }
  return d;
}
const HEAT = genHeat(90);
type Micro = { name: string; cur: number; tgt: number; unit: string; color: string };
const MICROS: Micro[] = [
  { name:'Vitamina A',cur:720,tgt:900,unit:'mcg',color:'#F59E0B' },{ name:'Vitamina C',cur:65,tgt:90,unit:'mg',color:'#FB923C' },
  { name:'Vitamina D',cur:12,tgt:20,unit:'mcg',color:'#FBBF24' },{ name:'Vitamina B12',cur:2.8,tgt:2.4,unit:'mcg',color:'#34D399' },
  { name:'Hierro',cur:11,tgt:18,unit:'mg',color:'#EF4444' },{ name:'Calcio',cur:850,tgt:1000,unit:'mg',color:'#E0E0E0' },
  { name:'Zinc',cur:7,tgt:11,unit:'mg',color:'#A78BFA' },{ name:'Magnesio',cur:280,tgt:400,unit:'mg',color:'#60A5FA' },
];
type Supp = { id: string; name: string; dose: string; time: string };
const SUPPS: Supp[] = [
  { id:'s1',name:'Multivitaminico',dose:'1 capsula',time:'Manana' },{ id:'s2',name:'Omega-3',dose:'2 capsulas',time:'Manana' },
  { id:'s3',name:'Vitamina D',dose:'1 capsula',time:'Manana' },{ id:'s4',name:'Proteina',dose:'1 scoop',time:'Post-entreno' },
  { id:'s5',name:'Creatina',dose:'5 g',time:'Tarde' },
];
const TC: Record<string, string> = { Manana:'#F59E0B', Tarde:'#4285F4', Noche:'#8B5CF6', 'Post-entreno':'#10B981' };
function genWeight(n: number, s: number, e: number) {
  const d: { date: Date; weight: number }[] = [], now = new Date(), diff = s - e;
  for (let i = n - 1; i >= 0; i--) { const x = new Date(now); x.setDate(x.getDate() - i); d.push({ date: x, weight: Math.round((s - diff * (1 - i / n) + Math.sin(i * .4) * .4) * 10) / 10 }); }
  return d;
}
const ALL_W = genWeight(365, W.start, W.current);
type TF = '90D' | '6M' | '1Y'; const TF_LIST: TF[] = ['90D','6M','1Y'];
const tfD = (f: TF) => f === '90D' ? 90 : f === '6M' ? 180 : 365;
const WT: Record<string, { icon: string; label: string; color: string }> = {
  cardio:{ icon:'bicycle-outline',label:'Cardio',color:'#F59E0B' }, fuerza:{ icon:'barbell-outline',label:'Fuerza',color:'#EF4444' },
  yoga:{ icon:'body-outline',label:'Yoga',color:'#8B5CF6' }, correr:{ icon:'walk-outline',label:'Correr',color:'#10B981' },
};
const WK_MINS = [45,0,30,60,0,45,0];
const REC_WK = [{ type:'cardio',dur:45,cal:380 },{ type:'fuerza',dur:60,cal:320 },{ type:'yoga',dur:30,cal:150 }];
const WKT = { sess: REC_WK.length, mins: WK_MINS.reduce((a,b) => a + b, 0), cals: REC_WK.reduce((a,w) => a + w.cal, 0) };

type SK = 'streak'|'weight'|'calories'|'heatmap'|'workouts'|'achievements'|'micronutrients'|'supplements'|'photos';
const SECTIONS: SK[] = ['streak','weight','calories','heatmap','workouts','achievements','micronutrients','supplements','photos'];

/* ---- Weight SVG chart ------------------------------------------------------- */
const CH = 200, CP = { t:20,b:28,l:40,r:16 };
const WtChart = React.memo(function WtChart({ data, gw, w, ac, su, dt, sp, wh }: {
  data: { date: Date; weight: number }[]; gw: number; w: number; ac: string; su: string; dt: string; sp: string; wh: string;
}) {
  if (data.length < 2 || w <= 0) return null;
  const dW = w - CP.l - CP.r, dH = CH - CP.t - CP.b;
  const ws = data.map(d => d.weight), mn = Math.min(...ws, gw) - .5, mx = Math.max(...ws, gw) + .5, rng = mx - mn || 1;
  const tX = (i: number) => CP.l + (i / (data.length - 1)) * dW;
  const tY = (v: number) => CP.t + dH - ((v - mn) / rng) * dH;
  const lp = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${tX(i).toFixed(1)},${tY(d.weight).toFixed(1)}`).join(' ');
  const ap = `${lp} L${tX(data.length - 1).toFixed(1)},${(CH - CP.b).toFixed(1)} L${tX(0).toFixed(1)},${(CH - CP.b).toFixed(1)} Z`;
  const gy = tY(gw), yt = Array.from({ length: 4 }, (_, i) => { const v = mn + (rng * i) / 3; return { v, y: tY(v) }; });
  const xi = [0, Math.floor(data.length / 2), data.length - 1];
  const li = data.length - 1, lx = tX(li), ly = tY(data[li].weight);
  return (
    <Svg width={w} height={CH}>
      <Defs><LinearGradient id="wg" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={ac} stopOpacity="0.2" /><Stop offset="1" stopColor={ac} stopOpacity="0.01" /></LinearGradient></Defs>
      {yt.map((t, i) => <Line key={i} x1={CP.l} y1={t.y} x2={w - CP.r} y2={t.y} stroke={sp} strokeWidth={.5} />)}
      <Line x1={CP.l} y1={gy} x2={w - CP.r} y2={gy} stroke={su} strokeWidth={1.5} strokeDasharray="6,4" />
      <SvgText x={w - CP.r - 2} y={gy - 5} fontSize={9} fontWeight="700" fill={su} textAnchor="end">Meta {gw} kg</SvgText>
      {yt.map((t, i) => <SvgText key={`y${i}`} x={CP.l - 6} y={t.y + 4} fontSize={10} fill={dt} textAnchor="end">{t.v.toFixed(1)}</SvgText>)}
      {xi.map(idx => <SvgText key={`x${idx}`} x={tX(idx)} y={CH - 4} fontSize={10} fill={dt} textAnchor="middle">{ML[data[idx].date.getMonth()]} {data[idx].date.getDate()}</SvgText>)}
      <Path d={ap} fill="url(#wg)" /><Path d={lp} fill="none" stroke={ac} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <SvgCircle cx={lx} cy={ly} r={5} fill={ac} /><SvgCircle cx={lx} cy={ly} r={2.5} fill={wh} />
      <SvgText x={lx} y={ly - 10} fontSize={11} fontWeight="700" fill={ac} textAnchor="middle">{data[li].weight} kg</SvgText>
    </Svg>
  );
});

/* ---- Calorie Arc ------------------------------------------------------------ */
const CalArc = React.memo(function CalArc({ avg, target, sz, ac, gl, tx, txS }: {
  avg: number; target: number; sz: number; ac: string; gl: string; tx: string; txS: string;
}) {
  const sw = 10, r = (sz - sw) / 2, cx = sz / 2, cy = sz / 2, total = 240, start = 150;
  const pct = Math.min(avg / target, 1.3), fill = total * Math.min(pct, 1);
  const pt = (a: number) => ({ x: cx + r * Math.cos(a * Math.PI / 180), y: cy + r * Math.sin(a * Math.PI / 180) });
  const arc = (s: number, sweep: number) => { const a = pt(s), b = pt(s + sweep); return `M ${a.x} ${a.y} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${b.x} ${b.y}`; };
  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={sz} height={sz}>
        <Path d={arc(start, total)} fill="none" stroke={gl} strokeWidth={sw} strokeLinecap="round" />
        <Path d={arc(start, fill)} fill="none" stroke={pct > 1 ? '#EF4444' : ac} strokeWidth={sw} strokeLinecap="round" />
        <SvgText x={cx} y={cy - 6} textAnchor="middle" fontSize={28} fontWeight="800" fill={tx}>{avg}</SvgText>
        <SvgText x={cx} y={cy + 14} textAnchor="middle" fontSize={11} fill={txS}>de {target} kcal</SvgText>
      </Svg>
    </View>
  );
});

/* ---- Helpers ---------------------------------------------------------------- */
const hCol = (s: number, sf: string) => s < 0 ? sf : s <= 3 ? '#EF4444' : s <= 6 ? '#F59E0B' : '#34A853';
const hOp = (s: number) => s < 0 ? .25 : .45 + (s / 10) * .55;

const MicroRow = memo(function MicroRow({ m, c }: { m: Micro; c: ReturnType<typeof useThemeColors> }) {
  const pct = Math.min((m.cur / m.tgt) * 100, 100), col = pct < 50 ? '#EF4444' : pct < 80 ? '#F59E0B' : '#34A853';
  return (
    <View style={{ marginBottom: 10 }}>
      <View style={[s.row, { justifyContent: 'space-between', marginBottom: 3 }]}>
        <View style={s.row}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: m.color, marginRight: 6 }} /><Text style={[s.lbl, { color: c.black }]}>{m.name}</Text></View>
        <Text style={[s.cap, { color: c.gray }]}>{m.cur}{m.unit} / {m.tgt}{m.unit}</Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: c.grayLight + '40', overflow: 'hidden' }}>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: col, width: `${pct}%` as any }} />
      </View>
    </View>
  );
});

/* ---- Main ------------------------------------------------------------------- */
export default function ProgressScreen(_props: MainTabScreenProps<'Progress'>) {
  const ins = useSafeAreaInsets(), nav = useNavigation(), { track } = useAnalytics('Progress');
  const c = useThemeColors(), { sidePadding: sp, width: sw } = useLayout();
  const { streak, hasFreezeAvailable } = useStreak();
  const [tf, setTf] = useState<TF>('90D'), [microExp, setMicroExp] = useState(false);
  const [suppCk, setSuppCk] = useState<Record<string, boolean>>({});
  const ds = streak > 0 ? streak : 12, suppN = Object.values(suppCk).filter(Boolean).length;
  useEffect(() => { track('screen_viewed', { screen: 'Progress' }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const wd = useMemo(() => ALL_W.slice(-Math.min(tfD(tf), ALL_W.length)), [tf]);
  const avgCal = useMemo(() => Math.round(DAILY_CAL.reduce((a, d) => a + d.v, 0) / DAILY_CAL.length), []);
  const togSupp = useCallback((id: string) => { haptics.medium(); setSuppCk(p => ({ ...p, [id]: !p[id] })); }, []);
  const onShare = useCallback(async () => {
    haptics.light(); track('share_progress_tapped');
    try { await Share.share({ message: `Mi progreso en Fitsi AI:\nPeso: ${W.current} kg | Perdido: ${(W.start - W.current).toFixed(1)} kg | Racha: ${ds} dias | Meta: ${W.goal} kg` }); }
    catch { Alert.alert('Error', 'No se pudo compartir.'); }
  }, [ds, track]);
  const hGrid = useMemo(() => {
    const SQ = 10, GAP = 2, first = HEAT[0].date, dow = (first.getDay() + 6) % 7;
    const pad: (typeof HEAT[0] | null)[] = [...Array(dow).fill(null), ...HEAT], cols = Math.ceil(pad.length / 7);
    const mm: { col: number; label: string }[] = []; let lm = -1;
    for (let col = 0; col < cols; col++) { const e = pad[col * 7]; if (e) { const m = e.date.getMonth(); if (m !== lm) { mm.push({ col, label: ML[m] }); lm = m; } } }
    return { pad, cols, mm, SQ, GAP };
  }, []);

  const renderItem: ListRenderItem<SK> = useCallback(({ item }) => {
    const cd: any[] = [s.card, { backgroundColor: c.surface }, shadows.sm];
    switch (item) {
      case 'streak': return (
        <View style={[s.card, { backgroundColor: c.accent + '12' }, shadows.sm]}>
          <View style={{ alignItems: 'center', paddingVertical: 6 }}>
            <Ionicons name="flame" size={36} color="#FF6B35" />
            <Text style={[s.heroN, { color: c.black }]}>{ds}</Text>
            <Text style={[s.heroS, { color: c.gray }]}>dias de racha</Text>
            {hasFreezeAvailable && <View style={[s.frzBadge, { backgroundColor: c.accent + '20' }]}><Ionicons name="snow-outline" size={12} color={c.accent} /><Text style={[s.capB, { color: c.accent, marginLeft: 4 }]}>Freeze disponible</Text></View>}
          </View>
        </View>
      );
      case 'weight': {
        const lost = W.start - W.current, losing = lost > 0, cw = sw - sp * 2 - 32;
        return (
          <View style={cd}>
            <View style={[s.row, { marginBottom: 8 }]}><Ionicons name="scale-outline" size={18} color={c.accent} style={{ marginRight: 6 }} /><Text style={[s.secT, { color: c.black, marginBottom: 0 }]}>Peso</Text></View>
            <View style={[s.row, { marginBottom: 12 }]}>
              <Text style={[s.big36, { color: c.black }]}>{W.current} kg</Text>
              <View style={[s.chgPill, { backgroundColor: losing ? '#34A85315' : '#EF444415', marginLeft: 10 }]}>
                <Ionicons name={losing ? 'arrow-down' : 'arrow-up'} size={12} color={losing ? '#34A853' : '#EF4444'} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: losing ? '#34A853' : '#EF4444', marginLeft: 2 }}>{Math.abs(lost).toFixed(1)} kg</Text>
              </View>
            </View>
            <View style={[s.row, { marginBottom: 12 }]}>
              <View style={{ flex: 1 }}><Text style={[s.cap, { color: c.gray }]}>Inicio</Text><Text style={[s.stV, { color: c.black }]}>{W.start} kg</Text></View>
              <View style={{ flex: 1, alignItems: 'flex-end' }}><Text style={[s.cap, { color: c.gray }]}>Meta</Text><Text style={[s.stV, { color: c.black }]}>{W.goal} kg</Text></View>
            </View>
            <View style={s.filterR}>{TF_LIST.map(f => <TouchableOpacity key={f} style={[s.pill, { backgroundColor: c.grayLight + '25' }, tf === f && { backgroundColor: c.accent }]} onPress={() => { haptics.light(); setTf(f); }} activeOpacity={.7}><Text style={[s.capB, { color: c.gray }, tf === f && { color: '#FFF' }]}>{f}</Text></TouchableOpacity>)}</View>
            <WtChart data={wd} gw={W.goal} w={cw} ac={c.accent} su={c.success} dt={c.disabled} sp={c.grayLight} wh={c.white} />
            <View style={[s.goalR, { marginTop: 8 }]}><Ionicons name="flag-outline" size={14} color={c.success} /><Text style={[s.capB, { color: c.success, marginLeft: 4 }]}>Meta estimada: {W.goalDate}</Text></View>
          </View>
        );
      }
      case 'calories': {
        const diff = avgCal - CAL_TARGET;
        return (
          <View style={cd}>
            <View style={[s.row, { marginBottom: 8 }]}><Ionicons name="pie-chart-outline" size={18} color={c.accent} style={{ marginRight: 6 }} /><Text style={[s.secT, { color: c.black, marginBottom: 0 }]}>Calorias diarias</Text></View>
            <Text style={[s.cap, { color: c.gray, marginBottom: 8 }]}>Promedio esta semana</Text>
            <CalArc avg={avgCal} target={CAL_TARGET} sz={160} ac={c.accent} gl={c.grayLight + '50'} tx={c.black} txS={c.gray} />
            <View style={[s.row, { justifyContent: 'center', marginTop: 8 }]}>
              <View style={[s.chgPill, { backgroundColor: diff <= 0 ? '#34A85315' : '#EF444415' }]}>
                <Ionicons name={diff <= 0 ? 'checkmark-circle' : 'alert-circle'} size={14} color={diff <= 0 ? '#34A853' : '#EF4444'} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: diff <= 0 ? '#34A853' : '#EF4444', marginLeft: 4 }}>{diff <= 0 ? `${Math.abs(diff)} bajo meta` : `${diff} sobre meta`}</Text>
              </View>
            </View>
          </View>
        );
      }
      case 'heatmap': {
        const { pad, cols, mm, SQ, GAP } = hGrid, gW = cols * (SQ + GAP), gH = 7 * (SQ + GAP);
        return (
          <View style={cd}>
            <View style={[s.row, { marginBottom: 8 }]}><Ionicons name="calendar-outline" size={18} color={c.accent} style={{ marginRight: 6 }} /><Text style={[s.secT, { color: c.black, marginBottom: 0 }]}>NutriScore diario</Text></View>
            <Text style={[s.cap, { color: c.gray, marginBottom: 8 }]}>Ultimos 90 dias</Text>
            <View style={{ height: 14, marginBottom: 2 }}>{mm.map((m, i) => <Text key={i} style={[s.cap, { color: c.gray, position: 'absolute', left: m.col * (SQ + GAP), fontSize: 10 }]}>{m.label}</Text>)}</View>
            <View style={{ width: gW, height: gH }}>
              {Array.from({ length: cols * 7 }).map((_, i) => {
                const col = Math.floor(i / 7), row = i % 7, e = pad[i];
                if (!e) return <View key={i} style={{ position: 'absolute', left: col * (SQ + GAP), top: row * (SQ + GAP), width: SQ, height: SQ }} />;
                return <View key={i} style={{ position: 'absolute', left: col * (SQ + GAP), top: row * (SQ + GAP), width: SQ, height: SQ, borderRadius: 2, backgroundColor: hCol(e.score, c.surface), opacity: hOp(e.score) }} />;
              })}
            </View>
            <View style={[s.row, { marginTop: 8, gap: 4 }]}>
              <Text style={[s.cap, { color: c.gray, fontSize: 10 }]}>Bajo</Text>
              {[c.surface,'#EF4444','#F59E0B','#34A853'].map((bg, i) => <View key={i} style={{ width: SQ, height: SQ, borderRadius: 2, backgroundColor: bg, opacity: i === 0 ? .25 : .75 }} />)}
              <Text style={[s.cap, { color: c.gray, fontSize: 10 }]}>Alto</Text>
            </View>
          </View>
        );
      }
      case 'workouts': {
        const mx = Math.max(...WK_MINS, 1), dl = ['L','M','X','J','V','S','D'], bw = (sw - sp * 2 - 32) / 7;
        return (
          <View style={cd}>
            <View style={[s.row, { marginBottom: 8 }]}>
              <Ionicons name="fitness-outline" size={18} color={c.accent} style={{ marginRight: 6 }} />
              <Text style={[s.secT, { color: c.black, flex: 1, marginBottom: 0 }]}>Ejercicio</Text>
              <TouchableOpacity onPress={() => { haptics.light(); (nav as any).navigate('Perfil', { screen: 'Workouts' }); }} activeOpacity={.7}><Text style={[s.capB, { color: c.accent }]}>Registrar</Text></TouchableOpacity>
            </View>
            <View style={[s.row, { marginBottom: 12 }]}>
              {[{ v: WKT.sess, l: 'Sesiones' },{ v: WKT.mins, l: 'Minutos' },{ v: WKT.cals, l: 'kcal' }].map((x, i) => (
                <React.Fragment key={x.l}>{i > 0 && <View style={{ width: 1, height: 28, backgroundColor: c.grayLight + '60', marginHorizontal: 8 }} />}<View style={{ flex: 1, alignItems: 'center' }}><Text style={[s.stV, { color: c.black }]}>{x.v}</Text><Text style={[s.cap, { color: c.gray }]}>{x.l}</Text></View></React.Fragment>
              ))}
            </View>
            <Svg width={bw * 7} height={85}>
              {WK_MINS.map((m, i) => { const bh = mx > 0 ? (m / mx) * 50 : 0; return (
                <React.Fragment key={i}><Rect x={i * bw + 4} y={58 - bh} width={bw - 8} height={bh || 2} rx={4} fill={m > 0 ? c.accent : c.grayLight + '30'} /><SvgText x={i * bw + bw / 2} y={74} textAnchor="middle" fontSize={10} fill={c.gray}>{dl[i]}</SvgText></React.Fragment>
              ); })}
            </Svg>
            {REC_WK.map((w, i) => { const wt = WT[w.type] || WT.cardio; return (
              <View key={i} style={[s.row, { paddingVertical: 10, borderTopWidth: i === 0 ? StyleSheet.hairlineWidth : 0, borderTopColor: c.grayLight + '60' }]}>
                <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: wt.color + '18', alignItems: 'center', justifyContent: 'center' }}><Ionicons name={wt.icon as any} size={18} color={wt.color} /></View>
                <View style={{ flex: 1, marginLeft: 8 }}><Text style={[s.lbl, { color: c.black }]}>{wt.label}</Text><Text style={[s.cap, { color: c.gray }]}>{w.dur} min</Text></View>
                <Text style={[s.stV, { color: c.black }]}>{w.cal} kcal</Text>
              </View>
            ); })}
          </View>
        );
      }
      case 'achievements': return (
        <View style={cd}>
          <View style={[s.row, { marginBottom: 8 }]}><Ionicons name="trophy-outline" size={18} color={c.accent} style={{ marginRight: 6 }} /><Text style={[s.secT, { color: c.black, flex: 1, marginBottom: 0 }]}>Logros</Text><TouchableOpacity onPress={() => haptics.light()} activeOpacity={.7}><Text style={[s.capB, { color: c.accent }]}>Ver todo</Text></TouchableOpacity></View>
          <FlatList horizontal data={BADGES} keyExtractor={b => b.id} showsHorizontalScrollIndicator={false}
            renderItem={({ item: b }) => <View style={s.bItem}><View style={[s.bCircle, { backgroundColor: b.bg }]}><Ionicons name={b.icon} size={22} color={b.color} /></View><Text style={[s.cap, { color: c.gray, textAlign: 'center' }]} numberOfLines={1}>{b.label}</Text></View>} />
        </View>
      );
      case 'micronutrients': {
        const vis = microExp ? MICROS : MICROS.slice(0, 4);
        return (
          <View style={cd}>
            <View style={[s.row, { marginBottom: 8 }]}><Ionicons name="nutrition-outline" size={18} color={c.accent} style={{ marginRight: 6 }} /><Text style={[s.secT, { color: c.black, flex: 1, marginBottom: 0 }]}>Micronutrientes</Text></View>
            <Text style={[s.cap, { color: c.gray, marginBottom: 12 }]}>% del valor diario recomendado</Text>
            {vis.map(m => <MicroRow key={m.name} m={m} c={c} />)}
            <TouchableOpacity style={[s.expBtn, { borderColor: c.grayLight + '60' }]} onPress={() => { haptics.light(); setMicroExp(v => !v); }} activeOpacity={.7}>
              <Text style={[s.capB, { color: c.accent }]}>{microExp ? 'Ver menos' : `Ver todo (${MICROS.length})`}</Text>
              <Ionicons name={microExp ? 'chevron-up' : 'chevron-down'} size={14} color={c.accent} />
            </TouchableOpacity>
          </View>
        );
      }
      case 'supplements': return (
        <View style={cd}>
          <View style={[s.row, { marginBottom: 8 }]}>
            <Ionicons name="medkit-outline" size={18} color={c.accent} style={{ marginRight: 6 }} />
            <Text style={[s.secT, { color: c.black, flex: 1, marginBottom: 0 }]}>Suplementos</Text>
            <View style={[s.cntBdg, { backgroundColor: c.accent + '18' }]}><Text style={[s.capB, { color: c.accent }]}>{suppN}/{SUPPS.length}</Text></View>
          </View>
          {SUPPS.map(sup => { const ck = !!suppCk[sup.id], pc = TC[sup.time] || c.accent; return (
            <TouchableOpacity key={sup.id} style={[s.supR, { borderBottomColor: c.grayLight + '30' }]} onPress={() => togSupp(sup.id)} activeOpacity={.7} accessibilityRole="checkbox" accessibilityState={{ checked: ck }}>
              <View style={[s.ckCirc, { borderColor: ck ? '#34A853' : c.grayLight, backgroundColor: ck ? '#34A853' : 'transparent' }]}>{ck && <Ionicons name="checkmark" size={13} color="#FFF" />}</View>
              <View style={{ flex: 1, marginLeft: 8 }}><Text style={[s.lbl, { color: ck ? c.gray : c.black, textDecorationLine: ck ? 'line-through' : 'none' }]}>{sup.name}</Text><Text style={[s.cap, { color: c.gray }]}>{sup.dose}</Text></View>
              <View style={[s.tPill, { backgroundColor: pc + '15' }]}><Text style={{ fontSize: 10, fontWeight: '600', color: pc }}>{sup.time}</Text></View>
            </TouchableOpacity>
          ); })}
        </View>
      );
      case 'photos': return (
        <View style={cd}>
          <View style={[s.row, { marginBottom: 8 }]}><Ionicons name="images-outline" size={18} color={c.accent} style={{ marginRight: 6 }} /><Text style={[s.secT, { color: c.black, marginBottom: 0 }]}>Fotos de progreso</Text></View>
          <View style={s.phRow}>
            <TouchableOpacity style={[s.phBox, { backgroundColor: c.grayLight + '25' }]} onPress={() => haptics.light()} activeOpacity={.7}><Ionicons name="camera-outline" size={22} color={c.gray} /><Text style={[s.cap, { color: c.gray, marginTop: 2 }]}>Agregar</Text></TouchableOpacity>
            <TouchableOpacity style={[s.phBox, { backgroundColor: c.grayLight + '25' }]} onPress={() => haptics.light()} activeOpacity={.7}><Ionicons name="add-outline" size={22} color={c.gray} /></TouchableOpacity>
          </View>
        </View>
      );
      default: return null;
    }
  }, [ds, hasFreezeAvailable, c, tf, wd, sw, sp, avgCal, onShare, hGrid, microExp, suppCk, suppN, togSupp, nav]);

  return (
    <View style={[s.screen, { paddingTop: ins.top, backgroundColor: c.bg }]}>
      <View style={[s.hdr, { paddingHorizontal: sp }]}>
        <Text style={[s.hdrT, { color: c.black }]}>Progreso</Text>
        <TouchableOpacity style={[s.shrBtn, { backgroundColor: c.accent + '12' }]} onPress={onShare} activeOpacity={.7} accessibilityLabel="Compartir progreso" accessibilityRole="button">
          <Ionicons name="share-social-outline" size={16} color={c.accent} />
          <Text style={[s.capB, { color: c.accent, marginLeft: 4 }]}>Compartir</Text>
        </TouchableOpacity>
      </View>
      <FlatList data={SECTIONS} renderItem={renderItem} keyExtractor={k => k} showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: sp, paddingTop: 4, paddingBottom: ins.bottom + 100 }} />
    </View>
  );
}

/* ---- Styles ----------------------------------------------------------------- */
const s = StyleSheet.create({
  screen: { flex: 1 },
  hdr: { paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hdrT: { fontSize: 28, fontWeight: '800', letterSpacing: -.5 },
  shrBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  card: { borderRadius: 16, padding: 16, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center' },
  heroN: { fontSize: 48, fontWeight: '800', letterSpacing: -1, marginTop: 4 },
  heroS: { fontSize: 15, fontWeight: '500', marginTop: 2 },
  big36: { fontSize: 36, fontWeight: '800', letterSpacing: -.5 },
  secT: { ...typography.titleSm, marginBottom: 8 },
  lbl: { fontSize: 13, fontWeight: '600' },
  cap: { ...typography.caption },
  capB: { ...typography.caption, fontWeight: '600' },
  stV: { ...typography.bodyMd, fontWeight: '700' },
  filterR: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  pill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999 },
  frzBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, marginTop: 10 },
  chgPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  goalR: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(52,211,153,0.08)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  bItem: { alignItems: 'center', marginRight: 16, width: 60 },
  bCircle: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  phRow: { flexDirection: 'row', gap: 8 },
  phBox: { flex: 1, height: 80, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  expBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 4 },
  supR: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  ckCirc: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  cntBdg: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  tPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
});
