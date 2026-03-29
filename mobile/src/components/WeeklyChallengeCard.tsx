/**
 * WeeklyChallengeCard — Current weekly challenge with progress.
 * Shows: challenge name + description, progress bar, reward preview,
 * days remaining, completion celebration.
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius, shadows } from '../theme';
import { haptics } from '../hooks/useHaptics';

export interface WeeklyChallenge {
  id: string;
  name: string;
  description: string;
  icon: string;
  currentProgress: number;
  targetProgress: number;
  unit: string;
  xpReward: number;
  coinsReward: number;
  daysRemaining: number;
  completed: boolean;
}

interface WeeklyChallengeCardProps {
  challenge: WeeklyChallenge;
}

const WeeklyChallengeCard = React.memo(function WeeklyChallengeCard({
  challenge,
}: WeeklyChallengeCardProps) {
  const c = useThemeColors();
  const progress = challenge.targetProgress > 0
    ? Math.min(challenge.currentProgress / challenge.targetProgress, 1)
    : 0;
  const progressPercent = `${Math.round(progress * 100)}%`;

  // Animated fill on mount
  const fillAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    fillAnim.setValue(0);
    Animated.timing(fillAnim, {
      toValue: progress,
      duration: 800,
      delay: 100,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const fillWidth = fillAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  // Completion celebration
  const celebrateScale = useRef(new Animated.Value(1)).current;
  const prevCompleted = useRef(challenge.completed);
  useEffect(() => {
    if (challenge.completed && !prevCompleted.current) {
      haptics.success();
      celebrateScale.setValue(0.95);
      Animated.spring(celebrateScale, {
        toValue: 1,
        friction: 4,
        tension: 200,
        useNativeDriver: true,
      }).start();
    }
    prevCompleted.current = challenge.completed;
  }, [challenge.completed]);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: c.surface,
          borderColor: challenge.completed ? '#34A853' : c.grayLight,
          transform: [{ scale: celebrateScale }],
        },
      ]}
      accessibilityLabel={`Desafio semanal: ${challenge.name}. ${Math.round(challenge.currentProgress)} de ${Math.round(challenge.targetProgress)} ${challenge.unit}. ${challenge.completed ? 'Completado' : `${challenge.daysRemaining} dias restantes`}`}
    >
      {/* Header row */}
      <View style={styles.headerRow}>
        <View style={[styles.iconCircle, { backgroundColor: challenge.completed ? '#34A853' : c.primary }]}>
          <Ionicons
            name={challenge.completed ? 'checkmark' : (challenge.icon as any)}
            size={18}
            color="#FFFFFF"
          />
        </View>
        <View style={styles.headerText}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: c.black }]} numberOfLines={1}>{challenge.name}</Text>
            {challenge.completed && (
              <View style={styles.completedBadge}>
                <Text style={styles.completedText}>Completado!</Text>
              </View>
            )}
          </View>
          <Text style={[styles.description, { color: c.gray }]} numberOfLines={2}>
            {challenge.description}
          </Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.progressSection}>
        <View style={[styles.progressTrack, { backgroundColor: c.grayLight }]}>
          <Animated.View
            style={[
              styles.progressFill,
              {
                width: fillWidth as any,
                backgroundColor: challenge.completed ? '#34A853' : c.primary,
              },
            ]}
          />
        </View>
        <View style={styles.progressLabels}>
          <Text style={[styles.progressText, { color: c.black }]}>
            {Math.round(challenge.currentProgress)}/{Math.round(challenge.targetProgress)} {challenge.unit}
          </Text>
          <Text style={[styles.progressPercent, { color: c.gray }]}>{progressPercent}</Text>
        </View>
      </View>

      {/* Bottom row: rewards + days remaining */}
      <View style={styles.bottomRow}>
        <View style={styles.rewardsRow}>
          <View style={styles.rewardItem}>
            <Ionicons name="star" size={14} color="#4285F4" />
            <Text style={[styles.rewardValue, { color: c.primary }]}>
              {Math.round(challenge.xpReward)} XP
            </Text>
          </View>
          {challenge.coinsReward > 0 && (
            <View style={styles.rewardItem}>
              <Ionicons name="ellipse" size={12} color="#FBBF24" />
              <Text style={[styles.rewardValue, { color: '#D97706' }]}>
                {Math.round(challenge.coinsReward)}
              </Text>
            </View>
          )}
        </View>
        {!challenge.completed && (
          <View style={styles.daysLeft}>
            <Ionicons name="time-outline" size={14} color={c.gray} />
            <Text style={[styles.daysText, { color: c.gray }]}>
              {challenge.daysRemaining} {challenge.daysRemaining === 1 ? 'dia' : 'dias'}
            </Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
});

export default WeeklyChallengeCard;

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  headerRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    ...typography.label,
    fontWeight: '700',
    flex: 1,
  },
  description: {
    ...typography.caption,
    lineHeight: 17,
  },
  completedBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  completedText: {
    color: '#16A34A',
    fontSize: 11,
    fontWeight: '700',
  },
  progressSection: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: 8,
    borderRadius: 4,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressText: {
    ...typography.caption,
    fontWeight: '600',
  },
  progressPercent: {
    ...typography.caption,
    fontWeight: '500',
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
    paddingTop: spacing.sm,
  },
  rewardsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  rewardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  rewardValue: {
    fontSize: 12,
    fontWeight: '700',
  },
  daysLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  daysText: {
    ...typography.caption,
    fontWeight: '500',
  },
});
