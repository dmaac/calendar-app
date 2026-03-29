/**
 * ShareableCard — Generates a visual card for sharing achievements, streaks, and weekly summaries.
 * Uses the native Share API with formatted text.
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Share,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { typography, spacing, radius, shadows } from '../theme';

// ─── Types ──────────────────────────────────────────────────────────────────

interface AchievementData {
  title: string;
  description: string;
  icon: string;
  color: string;
  unlockedAt?: string;
}

interface StreakData {
  days: number;
}

interface WeeklyData {
  avgCalories: number;
  adherence: number;
  avgProtein: number;
}

type ShareableCardProps =
  | { type: 'achievement'; data: AchievementData; onShareComplete?: () => void }
  | { type: 'streak'; data: StreakData; onShareComplete?: () => void }
  | { type: 'weekly'; data: WeeklyData; onShareComplete?: () => void };

// ─── Share text builders ────────────────────────────────────────────────────

function buildShareText(props: ShareableCardProps): string {
  switch (props.type) {
    case 'achievement':
      return [
        `\u{1F3C6} ${props.data.title}`,
        props.data.description,
        '',
        'Logrado en Fitsi AI',
        '#FitsiAI #Logro',
      ].join('\n');
    case 'streak':
      return [
        `\u{1F525} ${props.data.days} dias seguidos en Fitsi AI`,
        '',
        'La constancia es la clave!',
        '#FitsiAI #Racha',
      ].join('\n');
    case 'weekly': {
      const adh = props.data.adherence;
      const emoji = adh >= 80 ? '\u{1F525}' : adh >= 60 ? '\u{1F4AA}' : '\u{1F331}';
      const motivacion = adh >= 80
        ? 'Semana increible! Mi nutricion esta on fire'
        : adh >= 60
        ? 'Avanzando paso a paso hacia mis metas'
        : 'Cada dia es una nueva oportunidad para mejorar';
      return [
        `${emoji} Mi resumen semanal en Fitsi AI`,
        '',
        `\u{1F4CA} Calorias promedio: ${Math.round(props.data.avgCalories)} kcal/dia`,
        `\u{1F4AA} Proteina promedio: ${Math.round(props.data.avgProtein)}g/dia`,
        `\u{1F3AF} Adherencia a mi plan: ${adh}%`,
        '',
        `\u{2728} ${motivacion}`,
        '',
        '\u{1F34E} La nutricion inteligente cambia vidas.',
        'Fitsi AI escanea tu comida y te da los macros al instante.',
        '',
        '\u{1F449} Descarga gratis: https://fitsi.app',
        '',
        '#FitsiAI #NutricionInteligente #MiSemana #HealthyLifestyle #MacroTracking',
      ].join('\n');
    }
  }
}

// ─── Card content renderers ─────────────────────────────────────────────────

function AchievementContent({ data }: { data: AchievementData }) {
  return (
    <View style={cardStyles.content}>
      <View style={[cardStyles.iconCircle, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
        <Ionicons name={data.icon as any} size={36} color="#FFFFFF" />
      </View>
      <Text style={cardStyles.cardTitle}>{data.title}</Text>
      <Text style={cardStyles.cardSubtitle}>{data.description}</Text>
      {data.unlockedAt && (
        <Text style={cardStyles.cardDate}>{data.unlockedAt}</Text>
      )}
      <Text style={cardStyles.branding}>Logrado en Fitsi AI</Text>
    </View>
  );
}

function StreakContent({ data }: { data: StreakData }) {
  return (
    <View style={cardStyles.content}>
      <View style={[cardStyles.iconCircle, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
        <Ionicons name="flame" size={40} color="#FFD700" />
      </View>
      <Text style={cardStyles.streakNumber}>{data.days}</Text>
      <Text style={cardStyles.cardSubtitle}>dias seguidos</Text>
      <Text style={cardStyles.branding}>{data.days} dias seguidos en Fitsi AI</Text>
    </View>
  );
}

function WeeklyContent({ data }: { data: WeeklyData }) {
  return (
    <View style={cardStyles.content}>
      <View style={[cardStyles.iconCircle, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
        <Ionicons name="bar-chart" size={32} color="#FFFFFF" />
      </View>
      <Text style={cardStyles.cardTitle}>Mi Semana</Text>
      <View style={cardStyles.statsRow}>
        <View style={cardStyles.statItem}>
          <Text style={cardStyles.statValue}>{data.avgCalories}</Text>
          <Text style={cardStyles.statLabel}>kcal prom.</Text>
        </View>
        <View style={cardStyles.statDivider} />
        <View style={cardStyles.statItem}>
          <Text style={cardStyles.statValue}>{data.avgProtein}g</Text>
          <Text style={cardStyles.statLabel}>proteina</Text>
        </View>
        <View style={cardStyles.statDivider} />
        <View style={cardStyles.statItem}>
          <Text style={cardStyles.statValue}>{data.adherence}%</Text>
          <Text style={cardStyles.statLabel}>adherencia</Text>
        </View>
      </View>
      <Text style={cardStyles.branding}>Mi semana en Fitsi AI</Text>
    </View>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function ShareableCard(props: ShareableCardProps) {
  const handleShare = async () => {
    const text = buildShareText(props);
    try {
      await Share.share(
        Platform.OS === 'ios'
          ? { message: text }
          : { message: text, title: 'Fitsi AI' },
      );
      props.onShareComplete?.();
    } catch {
      // User cancelled or share failed — no action needed
    }
  };

  return (
    <View style={cardStyles.wrapper}>
      <View style={cardStyles.gradientBg}>
        {props.type === 'achievement' && <AchievementContent data={props.data} />}
        {props.type === 'streak' && <StreakContent data={props.data} />}
        {props.type === 'weekly' && <WeeklyContent data={props.data} />}
      </View>

      <TouchableOpacity
        style={cardStyles.shareBtn}
        onPress={handleShare}
        activeOpacity={0.8}
        accessibilityLabel="Compartir"
        accessibilityRole="button"
      >
        <Ionicons name="share-outline" size={18} color="#FFFFFF" />
        <Text style={cardStyles.shareBtnText}>Compartir</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Exported share helpers (for use without rendering the card) ────────────

export async function shareAchievement(data: AchievementData) {
  const text = buildShareText({ type: 'achievement', data });
  return Share.share(Platform.OS === 'ios' ? { message: text } : { message: text, title: 'Fitsi AI' });
}

export async function shareStreak(data: StreakData) {
  const text = buildShareText({ type: 'streak', data });
  return Share.share(Platform.OS === 'ios' ? { message: text } : { message: text, title: 'Fitsi AI' });
}

export async function shareWeeklySummary(data: WeeklyData) {
  const text = buildShareText({ type: 'weekly', data });
  return Share.share(Platform.OS === 'ios' ? { message: text } : { message: text, title: 'Fitsi AI' });
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const cardStyles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    gap: spacing.md,
  },
  gradientBg: {
    width: '100%',
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: '#1A73E8',
    ...shadows.lg,
  },
  content: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  cardTitle: {
    ...typography.titleMd,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  cardSubtitle: {
    ...typography.subtitle,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
  },
  cardDate: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.6)',
    marginTop: spacing.xs,
  },
  branding: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.5)',
    marginTop: spacing.md,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  streakNumber: {
    fontSize: 56,
    fontWeight: '900',
    color: '#FFFFFF',
    lineHeight: 62,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    gap: spacing.md,
  },
  statItem: {
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  statLabel: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.7)',
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#1A73E8',
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    ...shadows.sm,
  },
  shareBtnText: {
    ...typography.button,
    color: '#FFFFFF',
  },
});
