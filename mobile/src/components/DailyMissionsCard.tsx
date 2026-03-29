/**
 * DailyMissionsCard — Shows today's 3 missions as a checklist.
 * Each mission: checkbox icon, name, XP/coins reward, progress indicator.
 * Completed missions have green checkmark + strikethrough.
 * Haptic on completion.
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

export interface Mission {
  id: string;
  name: string;
  description: string;
  xpReward: number;
  coinsReward: number;
  currentProgress: number;
  targetProgress: number;
  completed: boolean;
  icon: string;
}

interface DailyMissionsCardProps {
  missions: Mission[];
}

const MissionItem = React.memo(function MissionItem({ mission }: { mission: Mission }) {
  const c = useThemeColors();
  const progress = mission.targetProgress > 0
    ? Math.min(mission.currentProgress / mission.targetProgress, 1)
    : 0;
  const progressPercent = `${Math.round(progress * 100)}%`;

  // Celebration scale on completion
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const prevCompleted = useRef(mission.completed);
  useEffect(() => {
    if (mission.completed && !prevCompleted.current) {
      haptics.success();
      scaleAnim.setValue(0.95);
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 4,
        tension: 200,
        useNativeDriver: true,
      }).start();
    }
    prevCompleted.current = mission.completed;
  }, [mission.completed]);

  return (
    <Animated.View
      style={[
        styles.missionItem,
        { borderBottomColor: c.grayLight, transform: [{ scale: scaleAnim }] },
      ]}
      accessibilityLabel={`${mission.name}: ${mission.completed ? 'completada' : `${Math.round(mission.currentProgress)} de ${Math.round(mission.targetProgress)}`}, ${Math.round(mission.xpReward)} XP, ${Math.round(mission.coinsReward)} monedas`}
    >
      <View style={styles.missionLeft}>
        {mission.completed ? (
          <View style={[styles.checkCircle, { backgroundColor: '#34A853' }]}>
            <Ionicons name="checkmark" size={14} color="#FFFFFF" />
          </View>
        ) : (
          <View style={[styles.checkCircle, { backgroundColor: c.grayLight }]}>
            <Ionicons name={mission.icon as any} size={14} color={c.gray} />
          </View>
        )}
        <View style={styles.missionInfo}>
          <Text
            style={[
              styles.missionName,
              { color: mission.completed ? c.gray : c.black },
              mission.completed && styles.strikethrough,
            ]}
            numberOfLines={1}
          >
            {mission.name}
          </Text>
          {!mission.completed && (
            <View style={styles.progressRow}>
              <View style={[styles.miniTrack, { backgroundColor: c.grayLight }]}>
                <View
                  style={[
                    styles.miniFill,
                    { width: progressPercent as any, backgroundColor: c.primary },
                  ]}
                />
              </View>
              <Text style={[styles.progressText, { color: c.gray }]}>
                {Math.round(mission.currentProgress)}/{Math.round(mission.targetProgress)}
              </Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.rewardBadge}>
        <Text style={[styles.rewardText, { color: c.primary }]}>+{Math.round(mission.xpReward)} XP</Text>
        {mission.coinsReward > 0 && (
          <Text style={[styles.rewardCoins, { color: '#FBBF24' }]}>+{Math.round(mission.coinsReward)}</Text>
        )}
      </View>
    </Animated.View>
  );
});

const DailyMissionsCard = React.memo(function DailyMissionsCard({
  missions,
}: DailyMissionsCardProps) {
  const c = useThemeColors();
  const completedCount = missions.filter((m) => m.completed).length;
  const allDone = completedCount === missions.length && missions.length > 0;

  // Celebration animation when all missions done
  const celebrateAnim = useRef(new Animated.Value(0)).current;
  const prevAllDone = useRef(allDone);
  useEffect(() => {
    if (allDone && !prevAllDone.current) {
      haptics.success();
      Animated.sequence([
        Animated.timing(celebrateAnim, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(celebrateAnim, {
          toValue: 0.8,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
    prevAllDone.current = allDone;
  }, [allDone]);

  const celebrateScale = celebrateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.02],
    extrapolate: 'clamp',
  });

  if (missions.length === 0) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: c.surface, borderColor: c.grayLight, transform: [{ scale: celebrateScale }] },
        allDone && { borderColor: '#34A853' },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="flag" size={16} color={allDone ? '#34A853' : c.primary} />
          <Text style={[styles.headerTitle, { color: c.black }]}>Misiones del dia</Text>
        </View>
        <Text
          style={[
            styles.headerCount,
            { color: allDone ? '#34A853' : c.gray },
          ]}
        >
          {completedCount}/{missions.length} completadas
        </Text>
      </View>

      {/* Mission list */}
      {missions.map((mission) => (
        <MissionItem key={mission.id} mission={mission} />
      ))}
    </Animated.View>
  );
});

export default DailyMissionsCard;

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerTitle: {
    ...typography.label,
    fontWeight: '700',
  },
  headerCount: {
    ...typography.caption,
    fontWeight: '600',
  },
  missionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  missionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  missionInfo: {
    flex: 1,
    gap: 3,
  },
  missionName: {
    ...typography.bodyMd,
    fontSize: 14,
  },
  strikethrough: {
    textDecorationLine: 'line-through',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  miniTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    maxWidth: 80,
  },
  miniFill: {
    height: 4,
    borderRadius: 2,
  },
  progressText: {
    fontSize: 11,
    fontWeight: '500',
  },
  rewardBadge: {
    alignItems: 'flex-end',
    gap: 1,
  },
  rewardText: {
    fontSize: 12,
    fontWeight: '700',
  },
  rewardCoins: {
    fontSize: 11,
    fontWeight: '600',
  },
});
