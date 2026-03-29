/**
 * AchievementsScreen — Grid of badges/achievements organized by category.
 * Shows locked/unlocked state with progress bars, unlock celebration animation,
 * share buttons, and category filtering.
 *
 * Categories: Logging, Streaks, Nutrition, Milestones
 * Features:
 *   - Badge grid with locked/unlocked visual states
 *   - Progress bars for in-progress achievements
 *   - Category pill tabs for filtering
 *   - Celebration animation + haptic on unlock
 *   - Share button for completed achievements
 *   - Overall progress summary header
 */
import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  Easing,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { typography, spacing, radius, shadows, useLayout, useThemeColors } from '../../theme';
import { haptics } from '../../hooks/useHaptics';
import { useAnalytics } from '../../hooks/useAnalytics';
import ShareableCard from '../../components/ShareableCard';

// ─── Achievement category definitions ───────────────────────────────────────

type AchievementCategory = 'all' | 'logging' | 'streaks' | 'nutrition' | 'milestones';

interface CategoryTab {
  key: AchievementCategory;
  label: string;
  icon: string;
}

const CATEGORIES: CategoryTab[] = [
  { key: 'all', label: 'Todos', icon: 'grid' },
  { key: 'logging', label: 'Registro', icon: 'restaurant' },
  { key: 'streaks', label: 'Rachas', icon: 'flame' },
  { key: 'nutrition', label: 'Nutricion', icon: 'nutrition' },
  { key: 'milestones', label: 'Hitos', icon: 'trophy' },
];

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
  category: AchievementCategory;
}

const GOLD = '#FFD700';
const SILVER = '#C0C0C0';
const ACCENT = '#4285F4';
const GREEN = '#10B981';
const BLUE = '#3B82F6';
const PURPLE = '#8B5CF6';
const ORANGE = '#F59E0B';

const ACHIEVEMENTS: Achievement[] = [
  // --- Logging ---
  {
    id: 'first_scan',
    title: 'Primer Escaneo',
    description: 'Escanea tu primera comida',
    icon: 'camera',
    conditionKey: 'total_scans',
    conditionValue: 1,
    color: ACCENT,
    category: 'logging',
  },
  {
    id: 'meals_10',
    title: '10 Comidas',
    description: 'Registra 10 comidas',
    icon: 'restaurant',
    conditionKey: 'total_meals',
    conditionValue: 10,
    color: GREEN,
    category: 'logging',
  },
  {
    id: 'meals_50',
    title: '50 Comidas',
    description: 'Registra 50 comidas',
    icon: 'restaurant',
    conditionKey: 'total_meals',
    conditionValue: 50,
    color: GREEN,
    category: 'logging',
  },
  {
    id: 'meals_100',
    title: 'Centenario',
    description: 'Registra 100 comidas',
    icon: 'restaurant',
    conditionKey: 'total_meals',
    conditionValue: 100,
    color: GOLD,
    category: 'logging',
  },
  {
    id: 'early_bird',
    title: 'Madrugador',
    description: 'Registra desayuno antes de las 8am',
    icon: 'sunny',
    conditionKey: 'early_breakfasts',
    conditionValue: 1,
    color: ORANGE,
    category: 'logging',
  },

  // --- Streaks ---
  {
    id: 'streak_3',
    title: 'Racha de 3',
    description: '3 dias consecutivos registrando',
    icon: 'flame',
    conditionKey: 'streak_days',
    conditionValue: 3,
    color: ACCENT,
    category: 'streaks',
  },
  {
    id: 'streak_7',
    title: 'Semana Perfecta',
    description: '7 dias consecutivos registrando',
    icon: 'flame',
    conditionKey: 'streak_days',
    conditionValue: 7,
    color: GOLD,
    category: 'streaks',
  },
  {
    id: 'streak_30',
    title: 'Habito de Hierro',
    description: '30 dias consecutivos registrando',
    icon: 'flame',
    conditionKey: 'streak_days',
    conditionValue: 30,
    color: GOLD,
    category: 'streaks',
  },

  // --- Nutrition ---
  {
    id: 'goal_met',
    title: 'Objetivo Cumplido',
    description: 'Cumple tu meta calorica del dia',
    icon: 'checkmark-circle',
    conditionKey: 'goals_met',
    conditionValue: 1,
    color: GREEN,
    category: 'nutrition',
  },
  {
    id: 'goal_met_7',
    title: 'Disciplina Total',
    description: 'Cumple tu meta 7 dias',
    icon: 'shield-checkmark',
    conditionKey: 'goals_met',
    conditionValue: 7,
    color: PURPLE,
    category: 'nutrition',
  },
  {
    id: 'water_champion',
    title: 'Campeon del Agua',
    description: 'Registra 8 vasos de agua en un dia',
    icon: 'water',
    conditionKey: 'water_glasses_max',
    conditionValue: 8,
    color: BLUE,
    category: 'nutrition',
  },
  {
    id: 'variety',
    title: 'Variedad',
    description: 'Registra 20 alimentos diferentes',
    icon: 'nutrition',
    conditionKey: 'unique_foods',
    conditionValue: 20,
    color: PURPLE,
    category: 'nutrition',
  },

  // --- Milestones ---
  {
    id: 'first_week',
    title: 'Primera Semana',
    description: 'Usa Fitsi durante 7 dias',
    icon: 'calendar',
    conditionKey: 'days_active',
    conditionValue: 7,
    color: ACCENT,
    category: 'milestones',
  },
  {
    id: 'first_month',
    title: 'Primer Mes',
    description: 'Usa Fitsi durante 30 dias',
    icon: 'calendar',
    conditionKey: 'days_active',
    conditionValue: 30,
    color: GOLD,
    category: 'milestones',
  },
  {
    id: 'weight_goal',
    title: 'Meta Alcanzada',
    description: 'Alcanza tu peso objetivo',
    icon: 'star',
    conditionKey: 'weight_goal_reached',
    conditionValue: 1,
    color: GOLD,
    category: 'milestones',
  },
];

// ─── Simulated user stats (replace with real data from API/context) ─────────

function useUserStats() {
  // TODO: Replace with GET /api/achievements endpoint or AuthContext user stats
  return {
    total_scans: 5,
    streak_days: 4,
    total_meals: 12,
    goals_met: 2,
    water_glasses_max: 3,
    early_breakfasts: 0,
    unique_foods: 8,
    days_active: 10,
    weight_goal_reached: 0,
  };
}

// ─── Celebration Overlay ────────────────────────────────────────────────────

function CelebrationOverlay({
  visible,
  achievement,
  onDismiss,
  c,
}: {
  visible: boolean;
  achievement: Achievement | null;
  onDismiss: () => void;
  c: ReturnType<typeof useThemeColors>;
}) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const particleAnims = useRef(
    Array.from({ length: 8 }, () => ({
      translateY: new Animated.Value(0),
      translateX: new Animated.Value(0),
      opacity: new Animated.Value(0),
      scale: new Animated.Value(0),
    })),
  ).current;

  useEffect(() => {
    if (visible && achievement) {
      // Reset
      scaleAnim.setValue(0);
      opacityAnim.setValue(0);
      rotateAnim.setValue(0);
      particleAnims.forEach((p) => {
        p.translateY.setValue(0);
        p.translateX.setValue(0);
        p.opacity.setValue(0);
        p.scale.setValue(0);
      });

      // Background fade in
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();

      // Badge entrance: scale from 0 with overshoot
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 4,
        tension: 60,
        useNativeDriver: true,
      }).start();

      // Rotation wobble
      Animated.sequence([
        Animated.timing(rotateAnim, { toValue: 8, duration: 150, useNativeDriver: true }),
        Animated.timing(rotateAnim, { toValue: -6, duration: 120, useNativeDriver: true }),
        Animated.timing(rotateAnim, { toValue: 4, duration: 100, useNativeDriver: true }),
        Animated.timing(rotateAnim, { toValue: 0, duration: 80, useNativeDriver: true }),
      ]).start();

      // Particle burst
      const angles = Array.from({ length: 8 }, (_, i) => (i * 45 * Math.PI) / 180);
      particleAnims.forEach((p, i) => {
        const angle = angles[i];
        const distance = 80 + Math.random() * 40;
        Animated.parallel([
          Animated.timing(p.opacity, {
            toValue: 1,
            duration: 200,
            delay: 300,
            useNativeDriver: true,
          }),
          Animated.timing(p.scale, {
            toValue: 1,
            duration: 300,
            delay: 300,
            useNativeDriver: true,
          }),
          Animated.timing(p.translateX, {
            toValue: Math.cos(angle) * distance,
            duration: 600,
            delay: 300,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(p.translateY, {
            toValue: Math.sin(angle) * distance,
            duration: 600,
            delay: 300,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(p.opacity, {
            toValue: 0,
            duration: 400,
            delay: 700,
            useNativeDriver: true,
          }),
        ]).start();
      });

      haptics.success();
    }
  }, [visible, achievement]);

  if (!visible || !achievement) return null;

  const rotateInterp = rotateAnim.interpolate({
    inputRange: [-10, 0, 10],
    outputRange: ['-10deg', '0deg', '10deg'],
  });

  const particleColors = [
    achievement.color,
    GOLD,
    '#34A853',
    ACCENT,
    achievement.color,
    PURPLE,
    ORANGE,
    GOLD,
  ];

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={onDismiss}>
      <Animated.View style={[celebStyles.overlay, { opacity: opacityAnim }]}>
        <TouchableOpacity
          style={celebStyles.dismissArea}
          activeOpacity={1}
          onPress={onDismiss}
          accessibilityLabel="Cerrar celebracion"
          accessibilityRole="button"
        >
          {/* Particles */}
          {particleAnims.map((p, i) => (
            <Animated.View
              key={i}
              style={[
                celebStyles.particle,
                {
                  backgroundColor: particleColors[i],
                  opacity: p.opacity,
                  transform: [
                    { translateX: p.translateX },
                    { translateY: p.translateY },
                    { scale: p.scale },
                  ],
                },
              ]}
            />
          ))}

          {/* Badge */}
          <Animated.View
            style={[
              celebStyles.celebBadge,
              {
                backgroundColor: c.bg,
                transform: [{ scale: scaleAnim }, { rotate: rotateInterp }],
              },
            ]}
          >
            <View
              style={[
                celebStyles.celebIconCircle,
                { backgroundColor: achievement.color + '20' },
              ]}
            >
              <Ionicons
                name={achievement.icon as any}
                size={48}
                color={achievement.color}
              />
            </View>
            <Text style={[celebStyles.celebTitle, { color: c.black }]}>
              {achievement.title}
            </Text>
            <Text style={[celebStyles.celebDesc, { color: c.gray }]}>
              {achievement.description}
            </Text>
            <View style={[celebStyles.celebUnlockedBadge, { backgroundColor: '#34A85315' }]}>
              <Ionicons name="checkmark-circle" size={16} color="#34A853" />
              <Text style={celebStyles.celebUnlockedText}>Desbloqueado</Text>
            </View>
          </Animated.View>

          <Animated.View style={{ opacity: opacityAnim, marginTop: spacing.lg }}>
            <Text style={celebStyles.tapHint}>Toca para continuar</Text>
          </Animated.View>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

// ─── Badge card ─────────────────────────────────────────────────────────────

function BadgeCard({
  achievement,
  unlocked,
  progress,
  index,
  c,
  cardWidth,
  onShare,
  onCelebrate,
}: {
  achievement: Achievement;
  unlocked: boolean;
  progress: number; // 0..1
  index: number;
  c: ReturnType<typeof useThemeColors>;
  cardWidth?: number;
  onShare?: (achievement: Achievement) => void;
  onCelebrate?: (achievement: Achievement) => void;
}) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
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
        // Subtle rotation bounce for unlocked badges
        Animated.sequence([
          Animated.timing(rotateAnim, { toValue: 5, duration: 120, useNativeDriver: true }),
          Animated.timing(rotateAnim, { toValue: -3, duration: 100, useNativeDriver: true }),
          Animated.timing(rotateAnim, { toValue: 0, duration: 80, useNativeDriver: true }),
        ]).start();
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

  const rotateInterp = rotateAnim.interpolate({
    inputRange: [-5, 0, 5],
    outputRange: ['-5deg', '0deg', '5deg'],
  });

  const showProgress = !unlocked && progress > 0 && progress < 1;

  return (
    <TouchableOpacity
      activeOpacity={unlocked ? 0.7 : 0.9}
      onPress={() => {
        if (unlocked && onCelebrate) {
          haptics.light();
          onCelebrate(achievement);
        }
      }}
      disabled={!unlocked}
      accessibilityLabel={`${achievement.title}: ${achievement.description}. ${unlocked ? 'Desbloqueado' : showProgress ? `${Math.round(progress * 100)}% completado` : 'Bloqueado'}`}
      accessibilityRole="button"
      accessibilityState={{ disabled: !unlocked }}
    >
      <Animated.View
        style={[
          styles.badgeCard,
          cardWidth ? { width: cardWidth } : undefined,
          { backgroundColor: c.surface, borderColor: unlocked ? achievement.color + '40' : c.border },
          !unlocked && styles.badgeCardLocked,
          { transform: [{ scale: scaleAnim }, { rotate: rotateInterp }] },
        ]}
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
          numberOfLines={2}
        >
          {achievement.title}
        </Text>
        <Text
          style={[styles.badgeDesc, { color: c.gray }, !unlocked && { color: c.disabled }]}
          numberOfLines={3}
        >
          {achievement.description}
        </Text>

        {/* Progress bar for in-progress achievements */}
        {showProgress && (
          <View style={styles.progressContainer} accessibilityLabel={`${Math.round(progress * 100)}% completado`}>
            <View style={[styles.progressBarBg, { backgroundColor: c.grayLight }]}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${Math.round(progress * 100)}%` as any,
                    backgroundColor: achievement.color,
                  },
                ]}
              />
            </View>
            <Text style={[styles.progressText, { color: c.gray }]}>
              {Math.round(progress * 100)}%
            </Text>
          </View>
        )}

        {/* Unlocked checkmark */}
        {unlocked && (
          <View style={[styles.unlockedBadge, { backgroundColor: '#34A85315' }]}>
            <Ionicons name="checkmark-circle" size={12} color="#34A853" />
          </View>
        )}

        {/* Share button for unlocked achievements */}
        {unlocked && onShare && (
          <TouchableOpacity
            onPress={() => {
              haptics.light();
              onShare(achievement);
            }}
            style={[styles.shareBadgeBtn, { backgroundColor: c.accent + '15' }]}
            accessibilityLabel={`Compartir ${achievement.title}`}
            accessibilityRole="button"
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons name="share-outline" size={14} color={c.accent} />
          </TouchableOpacity>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─── Category Tab ───────────────────────────────────────────────────────────

function CategoryPill({
  tab,
  active,
  onPress,
  c,
}: {
  tab: CategoryTab;
  active: boolean;
  onPress: (key: AchievementCategory) => void;
  c: ReturnType<typeof useThemeColors>;
}) {
  return (
    <TouchableOpacity
      onPress={() => {
        haptics.selection();
        onPress(tab.key);
      }}
      style={[
        styles.categoryPill,
        {
          backgroundColor: active ? c.accent : c.surface,
          borderColor: active ? c.accent : c.grayLight,
        },
      ]}
      activeOpacity={0.8}
      accessibilityLabel={`Categoria ${tab.label}`}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
    >
      <Ionicons
        name={tab.icon as any}
        size={14}
        color={active ? '#FFFFFF' : c.gray}
      />
      <Text
        style={[
          styles.categoryPillText,
          { color: active ? '#FFFFFF' : c.gray },
        ]}
      >
        {tab.label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Main screen ────────────────────────────────────────────────────────────

export default function AchievementsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { sidePadding, innerWidth } = useLayout();
  const c = useThemeColors();
  const { track } = useAnalytics('Achievements');
  const stats = useUserStats();
  const [shareAchievement, setShareAchievement] = useState<Achievement | null>(null);
  const [celebrateAchievement, setCelebrateAchievement] = useState<Achievement | null>(null);
  const [activeCategory, setActiveCategory] = useState<AchievementCategory>('all');

  // Filter achievements by category
  const filteredAchievements = useMemo(() => {
    if (activeCategory === 'all') return ACHIEVEMENTS;
    return ACHIEVEMENTS.filter((a) => a.category === activeCategory);
  }, [activeCategory]);

  // Compute overall stats
  const totalUnlocked = ACHIEVEMENTS.filter(
    (a) => (stats[a.conditionKey as keyof typeof stats] ?? 0) >= a.conditionValue,
  ).length;

  const filteredUnlocked = filteredAchievements.filter(
    (a) => (stats[a.conditionKey as keyof typeof stats] ?? 0) >= a.conditionValue,
  ).length;

  // Overall progress percentage
  const overallProgress = Math.round((totalUnlocked / ACHIEVEMENTS.length) * 100);

  const handleShareBadge = useCallback(
    (achievement: Achievement) => {
      track('share_achievement_open', { badge_id: achievement.id });
      setShareAchievement(achievement);
    },
    [track],
  );

  const handleCelebrate = useCallback(
    (achievement: Achievement) => {
      track('celebration_viewed', { badge_id: achievement.id });
      setCelebrateAchievement(achievement);
    },
    [track],
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: sidePadding }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: c.black }]} accessibilityRole="header">
            Logros
          </Text>
          <Text style={[styles.headerSubtitle, { color: c.gray }]}>
            {totalUnlocked} de {ACHIEVEMENTS.length} desbloqueados
          </Text>
        </View>
      </View>

      {/* Overall progress bar */}
      <View style={[styles.overallProgressContainer, { paddingHorizontal: sidePadding }]}>
        <View style={[styles.overallProgressCard, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={styles.overallProgressHeader}>
            <Text style={[styles.overallProgressLabel, { color: c.gray }]}>Progreso total</Text>
            <Text style={[styles.overallProgressPct, { color: c.accent }]}>
              {overallProgress}%
            </Text>
          </View>
          <View style={[styles.overallProgressBarBg, { backgroundColor: c.grayLight }]}>
            <View
              style={[
                styles.overallProgressBarFill,
                {
                  width: `${overallProgress}%` as any,
                  backgroundColor: c.accent,
                },
              ]}
            />
          </View>
          <View style={styles.overallProgressStats}>
            <View style={styles.overallStat}>
              <Ionicons name="trophy" size={14} color={GOLD} />
              <Text style={[styles.overallStatText, { color: c.black }]}>
                {totalUnlocked} logros
              </Text>
            </View>
            <View style={styles.overallStat}>
              <Ionicons name="lock-open" size={14} color={c.accent} />
              <Text style={[styles.overallStatText, { color: c.black }]}>
                {ACHIEVEMENTS.length - totalUnlocked} por desbloquear
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Category tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.categoryScroll, { paddingHorizontal: sidePadding }]}
        style={styles.categoryScrollContainer}
      >
        {CATEGORIES.map((tab) => (
          <CategoryPill
            key={tab.key}
            tab={tab}
            active={tab.key === activeCategory}
            onPress={setActiveCategory}
            c={c}
          />
        ))}
      </ScrollView>

      {/* Category count */}
      <View style={[styles.categoryCount, { paddingHorizontal: sidePadding }]}>
        <Text style={[styles.categoryCountText, { color: c.gray }]}>
          {filteredUnlocked}/{filteredAchievements.length} desbloqueados
        </Text>
      </View>

      {/* Badge grid */}
      {(() => {
        const cardWidth = Math.floor((innerWidth - CARD_GAP) / NUM_COLUMNS);
        return (
          <ScrollView
            showsVerticalScrollIndicator={false}
            bounces={true}
            overScrollMode="never"
            contentContainerStyle={[styles.grid, { paddingHorizontal: sidePadding }]}
          >
            {filteredAchievements.map((achievement, index) => {
              const statValue = stats[achievement.conditionKey as keyof typeof stats] ?? 0;
              const unlocked = statValue >= achievement.conditionValue;
              const progress = unlocked ? 1 : statValue / achievement.conditionValue;

              return (
                <BadgeCard
                  key={achievement.id}
                  achievement={achievement}
                  unlocked={unlocked}
                  progress={progress}
                  index={index}
                  c={c}
                  cardWidth={cardWidth}
                  onShare={unlocked ? handleShareBadge : undefined}
                  onCelebrate={unlocked ? handleCelebrate : undefined}
                />
              );
            })}
            <View style={{ height: spacing.xl }} />
          </ScrollView>
        );
      })()}

      {/* Celebration overlay */}
      <CelebrationOverlay
        visible={celebrateAchievement !== null}
        achievement={celebrateAchievement}
        onDismiss={() => setCelebrateAchievement(null)}
        c={c}
      />

      {/* Share modal */}
      <Modal
        visible={shareAchievement !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setShareAchievement(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: c.bg }]}>
            {shareAchievement && (
              <ShareableCard
                type="achievement"
                data={{
                  title: shareAchievement.title,
                  description: shareAchievement.description,
                  icon: shareAchievement.icon,
                  color: shareAchievement.color,
                }}
                onShareComplete={() => {
                  track('share_achievement_sent', { badge_id: shareAchievement.id });
                  setShareAchievement(null);
                }}
              />
            )}
            <TouchableOpacity
              onPress={() => setShareAchievement(null)}
              style={[styles.modalClose, { backgroundColor: c.surface }]}
              accessibilityLabel="Cerrar"
              accessibilityRole="button"
            >
              <Text style={[styles.modalCloseText, { color: c.gray }]}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Celebration styles ─────────────────────────────────────────────────────

const celebStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dismissArea: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  particle: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  celebBadge: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    width: '75%',
    maxWidth: 300,
    gap: spacing.sm,
    ...shadows.lg,
  },
  celebIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  celebTitle: {
    ...typography.titleMd,
    textAlign: 'center',
  },
  celebDesc: {
    ...typography.body,
    textAlign: 'center',
    lineHeight: 22,
  },
  celebUnlockedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    marginTop: spacing.sm,
  },
  celebUnlockedText: {
    ...typography.label,
    color: '#34A853',
  },
  tapHint: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
  },
});

// ─── Styles ─────────────────────────────────────────────────────────────────

const CARD_GAP = spacing.sm;
const NUM_COLUMNS = 2;

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

  // Overall progress
  overallProgressContainer: {
    marginBottom: spacing.sm,
  },
  overallProgressCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    ...shadows.sm,
  },
  overallProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  overallProgressLabel: {
    ...typography.label,
  },
  overallProgressPct: {
    ...typography.titleSm,
  },
  overallProgressBarBg: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  overallProgressBarFill: {
    height: 8,
    borderRadius: 4,
  },
  overallProgressStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  overallStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  overallStatText: {
    ...typography.caption,
    fontWeight: '500',
  },

  // Category tabs
  categoryScrollContainer: {
    maxHeight: 44,
    marginBottom: spacing.xs,
  },
  categoryScroll: {
    gap: spacing.sm,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  categoryPillText: {
    ...typography.caption,
    fontWeight: '600',
  },
  categoryCount: {
    marginBottom: spacing.xs,
  },
  categoryCountText: {
    ...typography.caption,
    fontWeight: '500',
  },

  // Badge grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_GAP,
    paddingTop: spacing.sm,
  },
  badgeCard: {
    borderRadius: 16,
    borderWidth: 0,
    padding: spacing.md,
    paddingBottom: spacing.lg,
    alignItems: 'center',
    gap: spacing.xs,
    ...shadows.sm,
  },
  badgeCardLocked: {
    opacity: 0.45,
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

  // Progress bar inside badge card
  progressContainer: {
    width: '100%',
    gap: 2,
    marginTop: 2,
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    width: '100%',
  },
  progressBarFill: {
    height: 6,
    borderRadius: 3,
  },
  progressText: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 2,
  },

  // Unlocked check
  unlockedBadge: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Share button
  shareBadgeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },

  // Share modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    width: '100%',
    maxWidth: 340,
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
  },
  modalClose: {
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.full,
  },
  modalCloseText: {
    ...typography.label,
  },
});
