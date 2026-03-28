/**
 * ChallengesScreen — Weekly challenges with XP rewards, progress tracking,
 * countdown timer, join functionality, and leaderboard.
 *
 * Features:
 *   - Active vs Completed tabs for challenge state
 *   - Challenge cards with progress bar, deadline, reward XP
 *   - Join challenge button with haptic feedback
 *   - Leaderboard for competitive challenges with user highlighting
 *   - Total XP summary
 *   - Countdown timer for weekly reset
 */
import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, typography, spacing, radius, shadows } from '../../theme';
import { haptics } from '../../hooks/useHaptics';
import { useAnalytics } from '../../hooks/useAnalytics';
import FitsiMascot from '../../components/FitsiMascot';

// ─── Types ──────────────────────────────────────────────────────────────────

type ChallengeStatus = 'available' | 'active' | 'completed';

interface Challenge {
  id: string;
  title: string;
  description: string;
  icon: string;
  target: number;
  unit: string;
  xpReward: number;
  /** Difficulty label for visual badge */
  difficulty: 'easy' | 'medium' | 'hard';
  /** Whether competitive (shows leaderboard) */
  competitive: boolean;
}

interface LeaderboardEntry {
  id: string;
  name: string;
  avatar: string;
  xp: number;
  progress: number; // 0..1 for the current challenge
}

type TabKey = 'active' | 'completed';

// ─── Data ───────────────────────────────────────────────────────────────────

const ALL_CHALLENGES: Challenge[] = [
  {
    id: 'log_7_days',
    title: 'Racha Semanal',
    description: 'Registra tu comida 7 dias seguidos',
    icon: 'flame',
    target: 7,
    unit: 'dias',
    xpReward: 500,
    difficulty: 'medium',
    competitive: true,
  },
  {
    id: 'protein_goal_5',
    title: 'Meta Proteina x5',
    description: 'Cumple tu meta de proteina 5 veces esta semana',
    icon: 'barbell',
    target: 5,
    unit: 'dias',
    xpReward: 400,
    difficulty: 'medium',
    competitive: false,
  },
  {
    id: 'water_2_5_l',
    title: 'Hidratacion Total',
    description: 'Bebe 2.5L de agua en 5 dias esta semana',
    icon: 'water',
    target: 5,
    unit: 'dias',
    xpReward: 350,
    difficulty: 'easy',
    competitive: false,
  },
  {
    id: 'new_recipes_3',
    title: 'Explorador Culinario',
    description: 'Prueba 3 recetas nuevas esta semana',
    icon: 'restaurant',
    target: 3,
    unit: 'recetas',
    xpReward: 300,
    difficulty: 'easy',
    competitive: false,
  },
  {
    id: 'scan_10_meals',
    title: 'Scanner Pro',
    description: 'Escanea 10 comidas con la camara esta semana',
    icon: 'camera',
    target: 10,
    unit: 'escaneos',
    xpReward: 450,
    difficulty: 'hard',
    competitive: true,
  },
  {
    id: 'calorie_streak_5',
    title: 'Precision Calorica',
    description: 'Mantente dentro del +/- 10% de tu meta calorica por 5 dias',
    icon: 'analytics',
    target: 5,
    unit: 'dias',
    xpReward: 550,
    difficulty: 'hard',
    competitive: true,
  },
  {
    id: 'breakfast_5',
    title: 'Desayuno Champion',
    description: 'Registra desayuno 5 dias esta semana',
    icon: 'sunny',
    target: 5,
    unit: 'dias',
    xpReward: 250,
    difficulty: 'easy',
    competitive: false,
  },
];

/** Mock progress for each challenge (replace with real user data) */
const MOCK_PROGRESS: Record<string, number> = {
  log_7_days: 5,
  protein_goal_5: 3,
  water_2_5_l: 2,
  new_recipes_3: 1,
  scan_10_meals: 10,
  calorie_streak_5: 5,
  breakfast_5: 0,
};

/** Mock joined challenges */
const MOCK_JOINED = new Set(['log_7_days', 'protein_goal_5', 'water_2_5_l', 'scan_10_meals', 'calorie_streak_5']);

const LEADERBOARD: LeaderboardEntry[] = [
  { id: 'u1', name: 'Valentina R.', avatar: '1', xp: 2450, progress: 1.0 },
  { id: 'u2', name: 'Diego M.', avatar: '2', xp: 2100, progress: 0.86 },
  { id: 'u3', name: 'Tu', avatar: '3', xp: 1800, progress: 0.71 },
  { id: 'u4', name: 'Camila S.', avatar: '4', xp: 1650, progress: 0.57 },
  { id: 'u5', name: 'Matias L.', avatar: '5', xp: 1200, progress: 0.43 },
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
  const day = now.getDay();
  if (day === 0) return 1;
  if (day === 1) return 7;
  return 8 - day;
}

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: '#34A853',
  medium: '#F59E0B',
  hard: '#EA4335',
};

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: 'Facil',
  medium: 'Medio',
  hard: 'Dificil',
};

// ─── Challenge Card ─────────────────────────────────────────────────────────

function ChallengeCard({
  challenge,
  progress,
  isJoined,
  onJoin,
  onViewLeaderboard,
  colors,
}: {
  challenge: Challenge;
  progress: number;
  isJoined: boolean;
  onJoin: (challenge: Challenge) => void;
  onViewLeaderboard: (challenge: Challenge) => void;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const completed = progress >= challenge.target;
  const pct = Math.min(progress / challenge.target, 1);
  const diffColor = DIFFICULTY_COLORS[challenge.difficulty];
  const diffLabel = DIFFICULTY_LABELS[challenge.difficulty];

  return (
    <View
      style={[s.challengeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      accessibilityLabel={`${challenge.title}: ${challenge.description}. ${completed ? 'Completado' : `${progress} de ${challenge.target} ${challenge.unit}`}. Recompensa: ${challenge.xpReward} XP`}
    >
      {/* Top row: icon + info + XP */}
      <View style={s.challengeTop}>
        <View style={[s.challengeIcon, { backgroundColor: completed ? '#34A85320' : colors.surfaceAlt }]}>
          <Ionicons
            name={challenge.icon as any}
            size={22}
            color={completed ? '#34A853' : colors.accent}
          />
          {completed && (
            <View style={s.completedCheckmark}>
              <Ionicons name="checkmark-circle" size={16} color="#34A853" />
            </View>
          )}
        </View>
        <View style={s.challengeInfo}>
          <View style={s.challengeTitleRow}>
            <Text style={[s.challengeTitle, { color: colors.black }]} numberOfLines={1}>
              {challenge.title}
            </Text>
            <View style={[s.difficultyBadge, { backgroundColor: diffColor + '20' }]}>
              <Text style={[s.difficultyText, { color: diffColor }]}>{diffLabel}</Text>
            </View>
          </View>
          <Text style={[s.challengeDesc, { color: colors.gray }]} numberOfLines={2}>
            {challenge.description}
          </Text>
        </View>
        <View style={[s.xpBadge, { backgroundColor: completed ? '#34A85320' : colors.accent + '15' }]}>
          <Text style={[s.xpText, { color: completed ? '#34A853' : colors.accent }]}>
            {completed ? '' : '+'}{challenge.xpReward}
          </Text>
          <Text style={[s.xpLabel, { color: completed ? '#34A853' : colors.gray }]}>
            {completed ? 'Ganado' : 'XP'}
          </Text>
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

      {/* Action row: join button or leaderboard link */}
      <View style={s.actionRow}>
        {/* Deadline */}
        <View style={s.deadlineRow}>
          <Ionicons name="time-outline" size={12} color={colors.gray} />
          <Text style={[s.deadlineText, { color: colors.gray }]}>
            {daysUntilNextMonday()} dias restantes
          </Text>
        </View>

        <View style={s.actionButtons}>
          {/* Leaderboard link for competitive challenges */}
          {challenge.competitive && isJoined && (
            <TouchableOpacity
              onPress={() => {
                haptics.light();
                onViewLeaderboard(challenge);
              }}
              style={[s.leaderboardBtn, { backgroundColor: colors.surfaceAlt }]}
              accessibilityLabel={`Ver leaderboard de ${challenge.title}`}
              accessibilityRole="button"
            >
              <Ionicons name="podium-outline" size={14} color={colors.accent} />
            </TouchableOpacity>
          )}

          {/* Join / Joined / Completed button */}
          {completed ? (
            <View style={[s.statusBadge, { backgroundColor: '#34A85315' }]}>
              <Ionicons name="checkmark-circle" size={14} color="#34A853" />
              <Text style={[s.statusText, { color: '#34A853' }]}>Completado</Text>
            </View>
          ) : isJoined ? (
            <View style={[s.statusBadge, { backgroundColor: colors.accent + '15' }]}>
              <Ionicons name="play" size={12} color={colors.accent} />
              <Text style={[s.statusText, { color: colors.accent }]}>En progreso</Text>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => {
                haptics.medium();
                onJoin(challenge);
              }}
              style={[s.joinBtn, { backgroundColor: colors.black }]}
              activeOpacity={0.85}
              accessibilityLabel={`Unirse al desafio ${challenge.title}`}
              accessibilityRole="button"
            >
              <Ionicons name="add" size={16} color="#FFFFFF" />
              <Text style={s.joinBtnText}>Unirse</Text>
            </TouchableOpacity>
          )}
        </View>
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
  const medalColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
  const hasMedal = rank <= 3;

  return (
    <View
      style={[
        s.lbRow,
        isCurrentUser && { backgroundColor: colors.accent + '10' },
        rank < LEADERBOARD.length && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
      ]}
      accessibilityLabel={`Posicion ${rank}: ${entry.name}, ${entry.xp} XP${isCurrentUser ? ' (tu)' : ''}`}
    >
      {/* Rank */}
      <View style={[s.lbRankCircle, { backgroundColor: hasMedal ? medalColors[rank - 1] + '20' : 'transparent' }]}>
        <Text style={[s.lbRank, { color: hasMedal ? medalColors[rank - 1] : colors.gray }]}>
          {rank}
        </Text>
      </View>

      {/* Name */}
      <View style={s.lbNameContainer}>
        <Text
          style={[s.lbName, { color: colors.black }, isCurrentUser && { fontWeight: '700' }]}
          numberOfLines={1}
        >
          {entry.name}
        </Text>
        {isCurrentUser && (
          <View style={[s.youBadge, { backgroundColor: colors.accent + '20' }]}>
            <Text style={[s.youBadgeText, { color: colors.accent }]}>Tu</Text>
          </View>
        )}
      </View>

      {/* Progress mini bar */}
      <View style={s.lbProgressContainer}>
        <View style={[s.lbProgressBg, { backgroundColor: colors.surfaceAlt }]}>
          <View
            style={[
              s.lbProgressFill,
              {
                width: `${entry.progress * 100}%` as any,
                backgroundColor: entry.progress >= 1 ? '#34A853' : colors.accent,
              },
            ]}
          />
        </View>
      </View>

      {/* XP */}
      <Text style={[s.lbXp, { color: colors.accent }]}>
        {entry.xp.toLocaleString()}
      </Text>
    </View>
  );
}

// ─── Tab Button ─────────────────────────────────────────────────────────────

function TabButton({
  label,
  icon,
  active,
  count,
  onPress,
  colors,
}: {
  label: string;
  icon: string;
  active: boolean;
  count: number;
  onPress: () => void;
  colors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <TouchableOpacity
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      style={[
        s.tabBtn,
        {
          backgroundColor: active ? colors.black : colors.surface,
          borderColor: active ? colors.black : colors.grayLight,
        },
      ]}
      activeOpacity={0.85}
      accessibilityLabel={`${label}: ${count} desafios`}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
    >
      <Ionicons name={icon as any} size={16} color={active ? '#FFFFFF' : colors.gray} />
      <Text style={[s.tabBtnText, { color: active ? '#FFFFFF' : colors.gray }]}>
        {label}
      </Text>
      <View style={[s.tabCountBadge, { backgroundColor: active ? 'rgba(255,255,255,0.25)' : colors.surfaceAlt }]}>
        <Text style={[s.tabCountText, { color: active ? '#FFFFFF' : colors.gray }]}>{count}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main Screen ────────────────────────────────────────────────────────────

export default function ChallengesScreen() {
  const insets = useSafeAreaInsets();
  const c = useThemeColors();
  const { track } = useAnalytics('Challenges');

  const [activeTab, setActiveTab] = useState<TabKey>('active');
  const [joinedSet, setJoinedSet] = useState<Set<string>>(new Set(MOCK_JOINED));
  const [leaderboardChallenge, setLeaderboardChallenge] = useState<Challenge | null>(null);

  const daysLeft = daysUntilNextMonday();

  // Determine challenge states
  const getStatus = useCallback(
    (ch: Challenge): ChallengeStatus => {
      const prog = MOCK_PROGRESS[ch.id] ?? 0;
      if (prog >= ch.target) return 'completed';
      if (joinedSet.has(ch.id)) return 'active';
      return 'available';
    },
    [joinedSet],
  );

  // Split into active (including available-to-join) and completed
  const activeChallenges = useMemo(
    () => ALL_CHALLENGES.filter((ch) => getStatus(ch) !== 'completed'),
    [getStatus],
  );

  const completedChallenges = useMemo(
    () => ALL_CHALLENGES.filter((ch) => getStatus(ch) === 'completed'),
    [getStatus],
  );

  const displayedChallenges = activeTab === 'active' ? activeChallenges : completedChallenges;

  // Total XP from completed challenges
  const totalXp = useMemo(() => {
    return ALL_CHALLENGES.reduce((sum, ch) => {
      const prog = MOCK_PROGRESS[ch.id] ?? 0;
      return sum + (prog >= ch.target ? ch.xpReward : 0);
    }, 0);
  }, []);

  const totalCompleted = completedChallenges.length;

  // Weekly challenge (featured)
  const weekNum = useMemo(() => getWeekNumber(new Date()), []);
  const featuredIndex = weekNum % ALL_CHALLENGES.length;
  const featuredChallenge = ALL_CHALLENGES[featuredIndex];
  const featuredProgress = MOCK_PROGRESS[featuredChallenge.id] ?? 0;
  const featuredCompleted = featuredProgress >= featuredChallenge.target;

  const handleJoin = useCallback(
    (challenge: Challenge) => {
      track('challenge_joined', { challenge_id: challenge.id });
      setJoinedSet((prev) => new Set(prev).add(challenge.id));
    },
    [track],
  );

  const handleViewLeaderboard = useCallback(
    (challenge: Challenge) => {
      track('leaderboard_opened', { challenge_id: challenge.id });
      setLeaderboardChallenge(challenge);
    },
    [track],
  );

  return (
    <View style={[s.container, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={[s.headerTitle, { color: c.black }]} accessibilityRole="header">
            Desafios
          </Text>
          <Text style={[s.headerSubtitle, { color: c.gray }]}>
            {totalCompleted}/{ALL_CHALLENGES.length} completados
          </Text>
        </View>
        <FitsiMascot
          expression={featuredCompleted ? 'proud' : 'muscle'}
          size="medium"
          animation={featuredCompleted ? 'celebrate' : 'idle'}
          message={featuredCompleted ? 'Desafio completado!' : 'Tu puedes!'}
        />
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        bounces={true}
        overScrollMode="never"
      >
        {/* XP Summary Card */}
        <View style={[s.xpSummaryCard, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={s.xpSummaryLeft}>
            <Text style={[s.xpSummaryLabel, { color: c.gray }]}>XP Total</Text>
            <Text style={[s.xpSummaryValue, { color: c.accent }]}>
              {totalXp.toLocaleString()}
            </Text>
          </View>
          <View style={s.xpSummaryDivider} />
          <View style={s.xpSummaryRight}>
            <View style={s.xpStatRow}>
              <Ionicons name="trophy" size={14} color="#FFD700" />
              <Text style={[s.xpStatText, { color: c.black }]}>
                {totalCompleted} completados
              </Text>
            </View>
            <View style={s.xpStatRow}>
              <Ionicons name="time-outline" size={14} color={c.gray} />
              <Text style={[s.xpStatText, { color: c.black }]}>
                {daysLeft} dias para reset
              </Text>
            </View>
          </View>
        </View>

        {/* Weekly Challenge — Featured Banner */}
        <View style={[s.weeklyBanner, { backgroundColor: c.black }]}>
          <View style={s.weeklyHeader}>
            <View style={[s.weeklyBadge, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
              <Ionicons name="trophy" size={16} color="#FFD700" />
              <Text style={s.weeklyBadgeText}>Desafio Semanal</Text>
            </View>
            <View style={[s.countdownBadge, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
              <Ionicons name="time-outline" size={14} color="rgba(255,255,255,0.8)" />
              <Text style={s.countdownText}>
                {daysLeft} {daysLeft === 1 ? 'dia' : 'dias'}
              </Text>
            </View>
          </View>

          <View style={s.weeklyContent}>
            <View style={[s.weeklyIcon, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
              <Ionicons name={featuredChallenge.icon as any} size={28} color="#FFFFFF" />
            </View>
            <View style={s.weeklyInfo}>
              <Text style={s.weeklyTitle}>{featuredChallenge.title}</Text>
              <Text style={s.weeklyDesc}>{featuredChallenge.description}</Text>
            </View>
            <View style={[s.weeklyXp, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
              <Text style={s.weeklyXpValue}>+{featuredChallenge.xpReward}</Text>
              <Text style={s.weeklyXpLabel}>XP</Text>
            </View>
          </View>

          {/* Progress */}
          <View style={s.weeklyProgressRow}>
            <View style={s.weeklyProgressBarBg}>
              <View
                style={[
                  s.weeklyProgressBarFill,
                  {
                    width: `${Math.min(featuredProgress / featuredChallenge.target, 1) * 100}%` as any,
                  },
                ]}
              />
            </View>
            <Text style={s.weeklyProgressLabel}>
              {featuredProgress}/{featuredChallenge.target} {featuredChallenge.unit}
            </Text>
          </View>
        </View>

        {/* Active / Completed tabs */}
        <View style={s.tabRow}>
          <TabButton
            label="Activos"
            icon="play-circle"
            active={activeTab === 'active'}
            count={activeChallenges.length}
            onPress={() => setActiveTab('active')}
            colors={c}
          />
          <TabButton
            label="Completados"
            icon="checkmark-done-circle"
            active={activeTab === 'completed'}
            count={completedChallenges.length}
            onPress={() => setActiveTab('completed')}
            colors={c}
          />
        </View>

        {/* Challenge list */}
        {displayedChallenges.length === 0 ? (
          <View style={s.emptyState}>
            <Ionicons
              name={activeTab === 'completed' ? 'trophy-outline' : 'flag-outline'}
              size={48}
              color={c.grayLight}
            />
            <Text style={[s.emptyTitle, { color: c.gray }]}>
              {activeTab === 'completed'
                ? 'Aun no has completado desafios'
                : 'No hay desafios activos'}
            </Text>
            <Text style={[s.emptyDesc, { color: c.disabled }]}>
              {activeTab === 'completed'
                ? 'Unete a desafios y completa las metas para ganar XP'
                : 'Los nuevos desafios llegan cada lunes'}
            </Text>
          </View>
        ) : (
          displayedChallenges.map((ch) => (
            <ChallengeCard
              key={ch.id}
              challenge={ch}
              progress={MOCK_PROGRESS[ch.id] ?? 0}
              isJoined={joinedSet.has(ch.id)}
              onJoin={handleJoin}
              onViewLeaderboard={handleViewLeaderboard}
              colors={c}
            />
          ))
        )}

        {/* Global Leaderboard */}
        <View style={s.leaderboardSection}>
          <View style={s.leaderboardHeader}>
            <View style={s.leaderboardTitleRow}>
              <Ionicons name="podium" size={20} color={c.accent} />
              <Text style={[s.leaderboardTitle, { color: c.black }]}>Leaderboard Semanal</Text>
            </View>
            <Text style={[s.leaderboardSubtitle, { color: c.gray }]}>
              Top 5 esta semana
            </Text>
          </View>

          <View style={[s.leaderboardCard, { backgroundColor: c.surface, borderColor: c.border }]}>
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
        </View>
      </ScrollView>

      {/* Leaderboard detail modal */}
      <Modal
        visible={leaderboardChallenge !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setLeaderboardChallenge(null)}
      >
        <TouchableOpacity
          style={s.modalBackdrop}
          activeOpacity={1}
          onPress={() => setLeaderboardChallenge(null)}
        >
          <View style={[s.modalCard, { backgroundColor: c.surface }]}>
            {leaderboardChallenge && (
              <>
                <View style={s.modalHeader}>
                  <View style={[s.modalIcon, { backgroundColor: c.accent + '15' }]}>
                    <Ionicons name="podium" size={28} color={c.accent} />
                  </View>
                  <Text style={[s.modalTitle, { color: c.black }]}>
                    {leaderboardChallenge.title}
                  </Text>
                  <Text style={[s.modalSubtitle, { color: c.gray }]}>
                    Leaderboard del desafio
                  </Text>
                </View>

                {LEADERBOARD.map((entry, i) => (
                  <LeaderboardRow
                    key={entry.id}
                    entry={entry}
                    rank={i + 1}
                    isCurrentUser={entry.name === 'Tu'}
                    colors={c}
                  />
                ))}

                <TouchableOpacity
                  onPress={() => setLeaderboardChallenge(null)}
                  style={[s.modalCloseBtn, { backgroundColor: c.grayLight }]}
                  accessibilityLabel="Cerrar leaderboard"
                  accessibilityRole="button"
                >
                  <Text style={[s.modalCloseBtnText, { color: c.black }]}>Cerrar</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
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

  // XP Summary
  xpSummaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  xpSummaryLeft: {
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  xpSummaryLabel: {
    ...typography.caption,
    marginBottom: 2,
  },
  xpSummaryValue: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  xpSummaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#E0E0E0',
    marginHorizontal: spacing.md,
  },
  xpSummaryRight: {
    flex: 1,
    gap: spacing.xs + 2,
  },
  xpStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  xpStatText: {
    ...typography.caption,
    fontWeight: '500',
  },

  // Weekly banner
  weeklyBanner: {
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    ...shadows.md,
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
    color: '#FFFFFF',
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
    color: 'rgba(255,255,255,0.8)',
  },
  weeklyContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  weeklyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weeklyInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  weeklyTitle: {
    ...typography.bodyMd,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  weeklyDesc: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  weeklyXp: {
    alignItems: 'center',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    minWidth: 52,
  },
  weeklyXpValue: {
    ...typography.label,
    color: '#FFD700',
  },
  weeklyXpLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
  },
  weeklyProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  weeklyProgressBarBg: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  weeklyProgressBarFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFD700',
  },
  weeklyProgressLabel: {
    ...typography.caption,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    minWidth: 70,
    textAlign: 'right',
  },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
    borderWidth: 1,
    minHeight: 44,
  },
  tabBtnText: {
    ...typography.label,
  },
  tabCountBadge: {
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 1,
    borderRadius: radius.full,
    minWidth: 22,
    alignItems: 'center',
  },
  tabCountText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // Challenge card
  challengeCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.sm,
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
  completedCheckmark: {
    position: 'absolute',
    bottom: -2,
    right: -2,
  },
  challengeInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  challengeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  challengeTitle: {
    ...typography.bodyMd,
    flex: 1,
  },
  difficultyBadge: {
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 1,
    borderRadius: radius.full,
  },
  difficultyText: {
    fontSize: 10,
    fontWeight: '700',
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
    marginLeft: spacing.sm,
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

  // Action row
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm + 2,
  },
  deadlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  deadlineText: {
    ...typography.caption,
    fontWeight: '500',
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  leaderboardBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    minHeight: 32,
  },
  joinBtnText: {
    ...typography.label,
    color: '#FFFFFF',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
  },
  statusText: {
    ...typography.caption,
    fontWeight: '600',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyTitle: {
    ...typography.bodyMd,
    textAlign: 'center',
  },
  emptyDesc: {
    ...typography.caption,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: spacing.xl,
  },

  // Leaderboard
  leaderboardSection: {
    marginTop: spacing.lg,
  },
  leaderboardHeader: {
    marginBottom: spacing.md,
  },
  leaderboardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  leaderboardTitle: {
    ...typography.titleSm,
  },
  leaderboardSubtitle: {
    ...typography.caption,
    marginTop: 2,
    marginLeft: spacing.lg + spacing.sm,
  },
  leaderboardCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    ...shadows.sm,
  },
  lbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  lbRankCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lbRank: {
    ...typography.label,
    fontWeight: '800',
  },
  lbNameContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginLeft: spacing.sm,
  },
  lbName: {
    ...typography.bodyMd,
  },
  youBadge: {
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 1,
    borderRadius: radius.full,
  },
  youBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  lbProgressContainer: {
    width: 48,
    marginRight: spacing.sm,
  },
  lbProgressBg: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  lbProgressFill: {
    height: 4,
    borderRadius: 2,
  },
  lbXp: {
    ...typography.label,
    fontWeight: '700',
    minWidth: 44,
    textAlign: 'right',
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    width: '85%',
    maxWidth: 360,
    ...shadows.lg,
  },
  modalHeader: {
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  modalIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    ...typography.titleSm,
    textAlign: 'center',
  },
  modalSubtitle: {
    ...typography.caption,
  },
  modalCloseBtn: {
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
    alignItems: 'center',
    marginTop: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  modalCloseBtnText: {
    ...typography.button,
    textAlign: 'center',
  },
});
