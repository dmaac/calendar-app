/**
 * ChallengesScreen — Weekly challenges with XP rewards, progress tracking,
 * countdown timer, and a basic mock leaderboard.
 * 5 hardcoded challenges rotate by week number.
 */
import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, typography, spacing, radius, shadows } from '../../theme';
import { haptics } from '../../hooks/useHaptics';
import { useAnalytics } from '../../hooks/useAnalytics';
import FitsiMascot from '../../components/FitsiMascot';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Challenge {
  id: string;
  title: string;
  description: string;
  icon: string;
  target: number;
  unit: string;
  xpReward: number;
}

interface LeaderboardEntry {
  id: string;
  name: string;
  avatar: string;
  xp: number;
}

// ─── Data ───────────────────────────────────────────────────────────────────

const ALL_CHALLENGES: Challenge[] = [
  {
    id: 'log_7_days',
    title: 'Log 7 Days Straight',
    description: 'Registra tu comida 7 dias seguidos',
    icon: 'flame',
    target: 7,
    unit: 'dias',
    xpReward: 500,
  },
  {
    id: 'protein_goal_5',
    title: 'Hit Protein Goal 5 Times',
    description: 'Cumple tu meta de proteina 5 veces esta semana',
    icon: 'barbell',
    target: 5,
    unit: 'dias',
    xpReward: 400,
  },
  {
    id: 'water_2_5_l',
    title: 'Drink 2.5L Water 5 Days',
    description: 'Bebe 2.5L de agua en 5 dias esta semana',
    icon: 'water',
    target: 5,
    unit: 'dias',
    xpReward: 350,
  },
  {
    id: 'new_recipes_3',
    title: 'Try 3 New Recipes',
    description: 'Prueba 3 recetas nuevas esta semana',
    icon: 'restaurant',
    target: 3,
    unit: 'recetas',
    xpReward: 300,
  },
  {
    id: 'scan_10_meals',
    title: 'Scan 10 Meals',
    description: 'Escanea 10 comidas con la camara esta semana',
    icon: 'camera',
    target: 10,
    unit: 'escaneos',
    xpReward: 450,
  },
];

/** Mock progress for each challenge (replace with real user data) */
const MOCK_PROGRESS: Record<string, number> = {
  log_7_days: 5,
  protein_goal_5: 3,
  water_2_5_l: 2,
  new_recipes_3: 1,
  scan_10_meals: 7,
};

const LEADERBOARD: LeaderboardEntry[] = [
  { id: 'u1', name: 'Valentina R.', avatar: '🏆', xp: 2450 },
  { id: 'u2', name: 'Diego M.', avatar: '🔥', xp: 2100 },
  { id: 'u3', name: 'Tu', avatar: '💪', xp: 1800 },
  { id: 'u4', name: 'Camila S.', avatar: '⭐', xp: 1650 },
  { id: 'u5', name: 'Matias L.', avatar: '🎯', xp: 1200 },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Get the ISO week number for a given date */
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** Days remaining until next Monday */
function daysUntilNextMonday(): number {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon...
  if (day === 0) return 1;
  if (day === 1) return 7; // it's Monday, full week left
  return 8 - day;
}

// ─── Challenge Card ─────────────────────────────────────────────────────────

function ChallengeCard({
  challenge,
  progress,
  colors,
}: {
  challenge: Challenge;
  progress: number;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const completed = progress >= challenge.target;
  const pct = Math.min(progress / challenge.target, 1);

  return (
    <View style={[s.challengeCard, { backgroundColor: colors.surface }]}>
      <View style={s.challengeTop}>
        <View style={[s.challengeIcon, { backgroundColor: completed ? '#34A85320' : colors.surfaceAlt }]}>
          <Ionicons
            name={challenge.icon as any}
            size={22}
            color={completed ? '#34A853' : colors.accent}
          />
        </View>
        <View style={s.challengeInfo}>
          <Text style={[s.challengeTitle, { color: colors.black }]} numberOfLines={1}>
            {challenge.title}
          </Text>
          <Text style={[s.challengeDesc, { color: colors.gray }]} numberOfLines={1}>
            {challenge.description}
          </Text>
        </View>
        <View style={[s.xpBadge, { backgroundColor: completed ? '#34A85320' : colors.surfaceAlt }]}>
          <Text style={[s.xpText, { color: completed ? '#34A853' : colors.accent }]}>
            {completed ? '✓' : `+${challenge.xpReward}`}
          </Text>
          {!completed && <Text style={[s.xpLabel, { color: colors.gray }]}>XP</Text>}
        </View>
      </View>

      {/* Progress bar */}
      <View style={s.progressRow}>
        <View style={[s.progressBarBg, { backgroundColor: colors.surfaceAlt }]}>
          <View
            style={[
              s.progressBarFill,
              {
                width: `${pct * 100}%` as any,
                backgroundColor: completed ? '#34A853' : colors.accent,
              },
            ]}
          />
        </View>
        <Text style={[s.progressLabel, { color: completed ? '#34A853' : colors.gray }]}>
          {progress}/{challenge.target} {challenge.unit}
        </Text>
      </View>
    </View>
  );
}

// ─── Leaderboard Row ────────────────────────────────────────────────────────

function LeaderboardRow({
  entry,
  rank,
  isCurrentUser,
  colors,
}: {
  entry: LeaderboardEntry;
  rank: number;
  isCurrentUser: boolean;
  colors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View style={[s.lbRow, isCurrentUser && { backgroundColor: colors.surfaceAlt }]}>
      <Text style={[s.lbRank, { color: rank <= 3 ? colors.accent : colors.gray }]}>
        {rank}
      </Text>
      <Text style={s.lbAvatar}>{entry.avatar}</Text>
      <Text
        style={[s.lbName, { color: colors.black }, isCurrentUser && { fontWeight: '700' }]}
        numberOfLines={1}
      >
        {entry.name}
      </Text>
      <Text style={[s.lbXp, { color: colors.accent }]}>
        {entry.xp.toLocaleString()} XP
      </Text>
    </View>
  );
}

// ─── Main Screen ────────────────────────────────────────────────────────────

export default function ChallengesScreen() {
  const insets = useSafeAreaInsets();
  const c = useThemeColors();
  const { track } = useAnalytics('Challenges');

  const weekNum = useMemo(() => getWeekNumber(new Date()), []);
  const challengeIndex = weekNum % ALL_CHALLENGES.length;
  const activeChallenge = ALL_CHALLENGES[challengeIndex];
  const daysLeft = daysUntilNextMonday();

  const activeProgress = MOCK_PROGRESS[activeChallenge.id] ?? 0;
  const activeCompleted = activeProgress >= activeChallenge.target;

  // Total XP from completed challenges
  const totalXp = useMemo(() => {
    return ALL_CHALLENGES.reduce((sum, ch) => {
      const prog = MOCK_PROGRESS[ch.id] ?? 0;
      return sum + (prog >= ch.target ? ch.xpReward : 0);
    }, 0);
  }, []);

  const completedCount = ALL_CHALLENGES.filter(
    (ch) => (MOCK_PROGRESS[ch.id] ?? 0) >= ch.target,
  ).length;

  return (
    <View style={[s.container, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={[s.headerTitle, { color: c.black }]}>Challenges</Text>
          <Text style={[s.headerSubtitle, { color: c.gray }]}>
            {completedCount}/{ALL_CHALLENGES.length} completados
          </Text>
        </View>
        <FitsiMascot
          expression={activeCompleted ? 'proud' : 'muscle'}
          size="medium"
          animation={activeCompleted ? 'celebrate' : 'idle'}
          message={activeCompleted ? 'Challenge completado!' : 'Tu puedes!'}
        />
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        bounces={true}
        overScrollMode="never"
      >
        {/* Weekly Challenge — Active */}
        <View style={[s.weeklyBanner, { backgroundColor: c.surface }]}>
          <View style={s.weeklyHeader}>
            <View style={[s.weeklyBadge, { backgroundColor: c.accent + '20' }]}>
              <Ionicons name="trophy" size={16} color={c.accent} />
              <Text style={[s.weeklyBadgeText, { color: c.accent }]}>Weekly Challenge</Text>
            </View>
            <View style={[s.countdownBadge, { backgroundColor: c.surfaceAlt }]}>
              <Ionicons name="time-outline" size={14} color={c.gray} />
              <Text style={[s.countdownText, { color: c.gray }]}>
                {daysLeft} {daysLeft === 1 ? 'dia' : 'dias'}
              </Text>
            </View>
          </View>

          <ChallengeCard challenge={activeChallenge} progress={activeProgress} colors={c} />
        </View>

        {/* All Challenges */}
        <Text style={[s.sectionTitle, { color: c.black }]}>All Challenges</Text>

        {ALL_CHALLENGES.map((ch) => (
          <ChallengeCard
            key={ch.id}
            challenge={ch}
            progress={MOCK_PROGRESS[ch.id] ?? 0}
            colors={c}
          />
        ))}

        {/* Leaderboard */}
        <Text style={[s.sectionTitle, { color: c.black, marginTop: spacing.lg }]}>
          Leaderboard
        </Text>

        <View style={[s.leaderboardCard, { backgroundColor: c.surface }]}>
          {LEADERBOARD.map((entry, i) => (
            <LeaderboardRow
              key={entry.id}
              entry={entry}
              rank={i + 1}
              isCurrentUser={entry.name === 'Tu'}
              colors={c}
            />
          ))}
        </View>

        {/* Total XP */}
        <View style={[s.xpTotalCard, { backgroundColor: c.surface }]}>
          <Text style={[s.xpTotalLabel, { color: c.gray }]}>Total XP Earned</Text>
          <Text style={[s.xpTotalValue, { color: c.accent }]}>
            {totalXp.toLocaleString()} XP
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    ...typography.title,
  },
  headerSubtitle: {
    ...typography.caption,
    marginTop: 2,
  },
  scroll: {
    paddingHorizontal: spacing.lg,
  },

  // Weekly banner
  weeklyBanner: {
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  weeklyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  weeklyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 1,
    borderRadius: radius.full,
  },
  weeklyBadgeText: {
    ...typography.label,
  },
  countdownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 1,
    borderRadius: radius.full,
  },
  countdownText: {
    ...typography.caption,
    fontWeight: '600',
  },

  // Section
  sectionTitle: {
    ...typography.titleSm,
    marginBottom: spacing.md,
  },

  // Challenge card
  challengeCard: {
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  challengeTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  challengeIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  challengeInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  challengeTitle: {
    ...typography.bodyMd,
  },
  challengeDesc: {
    ...typography.caption,
    marginTop: 2,
  },
  xpBadge: {
    alignItems: 'center',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    minWidth: 52,
  },
  xpText: {
    ...typography.label,
  },
  xpLabel: {
    fontSize: 9,
    fontWeight: '600',
  },

  // Progress bar
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm + 2,
    gap: spacing.sm,
  },
  progressBarBg: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 6,
    borderRadius: 3,
  },
  progressLabel: {
    ...typography.caption,
    fontWeight: '600',
    minWidth: 70,
    textAlign: 'right',
  },

  // Leaderboard
  leaderboardCard: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  lbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  lbRank: {
    ...typography.label,
    width: 24,
    textAlign: 'center',
  },
  lbAvatar: {
    fontSize: 20,
    marginLeft: spacing.sm,
  },
  lbName: {
    ...typography.bodyMd,
    flex: 1,
    marginLeft: spacing.sm,
  },
  lbXp: {
    ...typography.label,
  },

  // Total XP
  xpTotalCard: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  xpTotalLabel: {
    ...typography.caption,
    marginBottom: spacing.xs,
  },
  xpTotalValue: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
});
