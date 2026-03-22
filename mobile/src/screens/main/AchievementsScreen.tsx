/**
 * AchievementsScreen — Grid of badges/achievements.
 * Shows locked/unlocked state, with unlock animation + haptics.
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, useLayout, useThemeColors } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { haptics } from '../../hooks/useHaptics';
import { useAnalytics } from '../../hooks/useAnalytics';
import FitsiMascot from '../../components/FitsiMascot';

// ─── Achievement definitions ────────────────────────────────────────────────

interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  /** Condition key checked against user stats. */
  conditionKey: string;
  conditionValue: number;
  color: string;
}

const GOLD = '#FFD700';
const SILVER = '#C0C0C0';
const ACCENT = '#4285F4';
const GREEN = '#10B981';
const BLUE = '#3B82F6';
const PURPLE = '#8B5CF6';

const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first_scan',
    title: 'Primer Escaneo',
    description: 'Escanea tu primera comida',
    icon: 'camera',
    conditionKey: 'total_scans',
    conditionValue: 1,
    color: ACCENT,
  },
  {
    id: 'streak_3',
    title: 'Racha de 3',
    description: '3 dias consecutivos registrando',
    icon: 'flame',
    conditionKey: 'streak_days',
    conditionValue: 3,
    color: ACCENT,
  },
  {
    id: 'streak_7',
    title: 'Semana Perfecta',
    description: '7 dias consecutivos registrando',
    icon: 'flame',
    conditionKey: 'streak_days',
    conditionValue: 7,
    color: GOLD,
  },
  {
    id: 'streak_30',
    title: 'Habito de Hierro',
    description: '30 dias consecutivos registrando',
    icon: 'flame',
    conditionKey: 'streak_days',
    conditionValue: 30,
    color: GOLD,
  },
  {
    id: 'meals_10',
    title: '10 Comidas',
    description: 'Registra 10 comidas',
    icon: 'restaurant',
    conditionKey: 'total_meals',
    conditionValue: 10,
    color: GREEN,
  },
  {
    id: 'meals_50',
    title: '50 Comidas',
    description: 'Registra 50 comidas',
    icon: 'restaurant',
    conditionKey: 'total_meals',
    conditionValue: 50,
    color: GREEN,
  },
  {
    id: 'meals_100',
    title: 'Centenario',
    description: 'Registra 100 comidas',
    icon: 'restaurant',
    conditionKey: 'total_meals',
    conditionValue: 100,
    color: GOLD,
  },
  {
    id: 'goal_met',
    title: 'Objetivo Cumplido',
    description: 'Cumple tu meta calorica del dia',
    icon: 'checkmark-circle',
    conditionKey: 'goals_met',
    conditionValue: 1,
    color: GREEN,
  },
  {
    id: 'goal_met_7',
    title: 'Disciplina Total',
    description: 'Cumple tu meta 7 dias',
    icon: 'shield-checkmark',
    conditionKey: 'goals_met',
    conditionValue: 7,
    color: PURPLE,
  },
  {
    id: 'water_champion',
    title: 'Campeon del Agua',
    description: 'Registra 8 vasos de agua en un dia',
    icon: 'water',
    conditionKey: 'water_glasses_max',
    conditionValue: 8,
    color: BLUE,
  },
  {
    id: 'early_bird',
    title: 'Madrugador',
    description: 'Registra desayuno antes de las 8am',
    icon: 'sunny',
    conditionKey: 'early_breakfasts',
    conditionValue: 1,
    color: GOLD,
  },
  {
    id: 'variety',
    title: 'Variedad',
    description: 'Registra 20 alimentos diferentes',
    icon: 'nutrition',
    conditionKey: 'unique_foods',
    conditionValue: 20,
    color: PURPLE,
  },
];

// ─── Simulated user stats (replace with real data from API/context) ─────────

function useUserStats() {
  // TODO: Replace with real API call or context value
  return {
    total_scans: 5,
    streak_days: 4,
    total_meals: 12,
    goals_met: 2,
    water_glasses_max: 3,
    early_breakfasts: 0,
    unique_foods: 8,
  };
}

// ─── Badge card ─────────────────────────────────────────────────────────────

function BadgeCard({
  achievement,
  unlocked,
  index,
  c,
}: {
  achievement: Achievement;
  unlocked: boolean;
  index: number;
  c: ReturnType<typeof useThemeColors>;
}) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0.3)).current;
  const hasTriggeredHaptic = useRef(false);

  useEffect(() => {
    const delay = 60 * index;
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 5,
      tension: 80,
      delay,
      useNativeDriver: true,
    }).start(() => {
      if (unlocked && !hasTriggeredHaptic.current) {
        hasTriggeredHaptic.current = true;
        haptics.light();
      }
    });

    // Subtle shimmer/glow pulse for unlocked badges
    if (unlocked) {
      const glowLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 0.7,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(glowAnim, {
            toValue: 0.3,
            duration: 1200,
            useNativeDriver: true,
          }),
        ]),
      );
      setTimeout(() => glowLoop.start(), delay + 300);
      return () => glowLoop.stop();
    }
  }, []);

  return (
    <Animated.View
      style={[
        styles.badgeCard,
        { backgroundColor: c.surface, borderColor: c.border },
        !unlocked && styles.badgeCardLocked,
        { transform: [{ scale: scaleAnim }] },
      ]}
      accessibilityLabel={`${achievement.title}: ${achievement.description}. ${unlocked ? 'Desbloqueado' : 'Bloqueado'}`}
      accessibilityRole="text"
    >
      <View
        style={[
          styles.iconCircle,
          {
            backgroundColor: unlocked ? achievement.color + '20' : c.grayLight,
          },
        ]}
      >
        {unlocked && (
          <Animated.View
            style={[
              styles.glowRing,
              {
                borderColor: achievement.color,
                opacity: glowAnim,
              },
            ]}
          />
        )}
        <Ionicons
          name={(unlocked ? achievement.icon : 'lock-closed') as any}
          size={28}
          color={unlocked ? achievement.color : c.disabled}
        />
      </View>
      <Text
        style={[styles.badgeTitle, { color: c.black }, !unlocked && { color: c.gray }]}
        numberOfLines={1}
      >
        {achievement.title}
      </Text>
      <Text
        style={[styles.badgeDesc, { color: c.gray }, !unlocked && { color: c.disabled }]}
        numberOfLines={2}
      >
        {achievement.description}
      </Text>
    </Animated.View>
  );
}

// ─── Main screen ────────────────────────────────────────────────────────────

export default function AchievementsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { sidePadding } = useLayout();
  const c = useThemeColors();
  const { track } = useAnalytics('Achievements');
  const stats = useUserStats();

  const unlockedCount = ACHIEVEMENTS.filter(
    (a) => (stats[a.conditionKey as keyof typeof stats] ?? 0) >= a.conditionValue,
  ).length;

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: sidePadding }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: c.black }]} accessibilityRole="header">
            Logros
          </Text>
          <Text style={[styles.headerSubtitle, { color: c.gray }]}>
            {unlockedCount} de {ACHIEVEMENTS.length} desbloqueados
          </Text>
        </View>
        <FitsiMascot
          expression={unlockedCount === ACHIEVEMENTS.length ? 'crown' : unlockedCount > 0 ? 'proud' : 'muscle'}
          size="medium"
          animation={unlockedCount > 0 ? 'celebrate' : 'idle'}
          message={unlockedCount === ACHIEVEMENTS.length ? 'Todos desbloqueados!' : unlockedCount > 0 ? 'Felicidades!' : 'A desbloquear logros!'}
        />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        bounces={true}
        overScrollMode="never"
        contentContainerStyle={[styles.grid, { paddingHorizontal: sidePadding }]}
      >
        {ACHIEVEMENTS.map((achievement, index) => {
          const statValue = stats[achievement.conditionKey as keyof typeof stats] ?? 0;
          const unlocked = statValue >= achievement.conditionValue;

          return (
            <BadgeCard
              key={achievement.id}
              achievement={achievement}
              unlocked={unlocked}
              index={index}
              c={c}
            />
          );
        })}
        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const CARD_GAP = spacing.sm;
const NUM_COLUMNS = 3;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    paddingVertical: spacing.md,
  },
  headerTitle: {
    ...typography.title,
  },
  headerSubtitle: {
    ...typography.caption,
    marginTop: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_GAP,
    paddingTop: spacing.sm,
  },
  badgeCard: {
    width: `${(100 - (NUM_COLUMNS - 1) * 2) / NUM_COLUMNS}%` as any,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.sm + 2,
    alignItems: 'center',
    gap: spacing.xs,
    ...shadows.sm,
  },
  badgeCardLocked: {
    opacity: 0.55,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  glowRing: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
  },
  badgeTitle: {
    ...typography.label,
    textAlign: 'center',
  },
  badgeDesc: {
    fontSize: 10,
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 13,
  },
});
