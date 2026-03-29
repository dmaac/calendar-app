/**
 * AchievementPost -- Individual feed card for the Community feed.
 *
 * Displays a user's nutritional achievement with avatar, content,
 * timestamp, and social actions (like, comment, share).
 *
 * Features:
 * - Scale-bounce animation on like tap with haptic feedback
 * - Like counter with animated transition
 * - Dark mode support via theme system
 * - Accessibility labels on all interactive elements
 */
import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Share,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius, shadows } from '../theme';
import { haptics } from '../hooks/useHaptics';

// ─── Types ──────────────────────────────────────────────────────────────────

export type AchievementType =
  | 'streak'
  | 'nutri_score'
  | 'goal_reached'
  | 'meals_logged'
  | 'water_champion'
  | 'weight_milestone'
  | 'challenge_complete';

export interface CommunityPost {
  id: string;
  userName: string;
  userAvatar: string;
  achievementType: AchievementType;
  title: string;
  description: string;
  /** Achievement value displayed prominently (e.g. "7 dias", "NutriScore 92") */
  value?: string;
  timestamp: string;
  likes: number;
  comments: number;
  /** Color accent for the achievement badge */
  accentColor: string;
  /** Ionicons icon name */
  icon: string;
}

interface AchievementPostProps {
  post: CommunityPost;
  onComment?: (postId: string) => void;
}

// ─── Achievement badge colors ───────────────────────────────────────────────

const ACHIEVEMENT_COLORS: Record<AchievementType, string> = {
  streak: '#FF6B35',
  nutri_score: '#10B981',
  goal_reached: '#4285F4',
  meals_logged: '#8B5CF6',
  water_champion: '#3B82F6',
  weight_milestone: '#F59E0B',
  challenge_complete: '#EC4899',
};

// ─── Avatar component ───────────────────────────────────────────────────────

function UserAvatar({ initials, color }: { initials: string; color: string }) {
  const c = useThemeColors();
  return (
    <View style={[styles.avatar, { backgroundColor: color + '20' }]}>
      <Text style={[styles.avatarText, { color }]}>{initials}</Text>
    </View>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

function AchievementPost({ post, onComment }: AchievementPostProps) {
  const c = useThemeColors();
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(post.likes);

  // Like animation refs
  const heartScale = useRef(new Animated.Value(1)).current;
  const heartBounce = useRef(new Animated.Value(0)).current;

  const handleLike = useCallback(() => {
    haptics.medium();

    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikeCount((prev) => (nextLiked ? prev + 1 : prev - 1));

    // Scale bounce animation: 1 -> 0.6 -> 1.3 -> 1
    heartScale.setValue(0.6);
    Animated.sequence([
      Animated.spring(heartScale, {
        toValue: 1.3,
        friction: 3,
        tension: 200,
        useNativeDriver: true,
      }),
      Animated.spring(heartScale, {
        toValue: 1,
        friction: 5,
        tension: 100,
        useNativeDriver: true,
      }),
    ]).start();

    // Subtle vertical bounce for the counter
    if (nextLiked) {
      heartBounce.setValue(-6);
      Animated.spring(heartBounce, {
        toValue: 0,
        friction: 5,
        tension: 150,
        useNativeDriver: true,
      }).start();
    }
  }, [liked]);

  const handleShare = useCallback(async () => {
    haptics.light();
    try {
      const text = [
        `${post.userName} logro: ${post.title}`,
        post.description,
        '',
        'Logrado en Fitsi AI',
        '#FitsiAI #Comunidad',
      ].join('\n');

      await Share.share(
        Platform.OS === 'ios'
          ? { message: text }
          : { message: text, title: 'Fitsi AI' },
      );
    } catch {
      // User cancelled or share failed
    }
  }, [post]);

  const handleComment = useCallback(() => {
    haptics.light();
    onComment?.(post.id);
  }, [post.id, onComment]);

  // Extract initials from user name
  const initials = post.userName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <View
      style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}
      accessibilityLabel={`Logro de ${post.userName}: ${post.title}`}
      accessibilityRole="summary"
    >
      {/* Header: Avatar + Name + Timestamp */}
      <View style={styles.header}>
        <UserAvatar initials={initials} color={post.accentColor} />
        <View style={styles.headerInfo}>
          <Text style={[styles.userName, { color: c.black }]} numberOfLines={1}>
            {post.userName}
          </Text>
          <Text style={[styles.timestamp, { color: c.gray }]}>{post.timestamp}</Text>
        </View>
        <View style={[styles.achievementBadge, { backgroundColor: post.accentColor + '15' }]}>
          <Ionicons name={post.icon as any} size={12} color={post.accentColor} />
        </View>
      </View>

      {/* Achievement content */}
      <View style={[styles.achievementCard, { backgroundColor: c.surfaceAlt }]}>
        <View style={[styles.achievementIcon, { backgroundColor: post.accentColor + '20' }]}>
          <Ionicons name={post.icon as any} size={24} color={post.accentColor} />
        </View>
        <View style={styles.achievementContent}>
          <Text style={[styles.achievementTitle, { color: c.black }]} numberOfLines={1}>
            {post.title}
          </Text>
          <Text style={[styles.achievementDesc, { color: c.gray }]} numberOfLines={2}>
            {post.description}
          </Text>
          {post.value && (
            <Text style={[styles.achievementValue, { color: post.accentColor }]}>
              {post.value}
            </Text>
          )}
        </View>
      </View>

      {/* Actions: Like, Comment, Share */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={handleLike}
          activeOpacity={0.7}
          accessibilityLabel={liked ? 'Quitar me gusta' : 'Me gusta'}
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Animated.View style={{ transform: [{ scale: heartScale }] }}>
            <Ionicons
              name={liked ? 'heart' : 'heart-outline'}
              size={20}
              color={liked ? '#EF4444' : c.gray}
            />
          </Animated.View>
          <Animated.Text
            style={[
              styles.actionCount,
              { color: liked ? '#EF4444' : c.gray },
              { transform: [{ translateY: heartBounce }] },
            ]}
          >
            {likeCount > 0 ? likeCount : ''}
          </Animated.Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={handleComment}
          activeOpacity={0.7}
          accessibilityLabel="Comentar"
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chatbubble-outline" size={19} color={c.gray} />
          {post.comments > 0 && (
            <Text style={[styles.actionCount, { color: c.gray }]}>{post.comments}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={handleShare}
          activeOpacity={0.7}
          accessibilityLabel="Compartir"
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="share-outline" size={19} color={c.gray} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm + 4,
    ...shadows.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    marginBottom: spacing.sm + 4,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '700',
  },
  headerInfo: {
    flex: 1,
  },
  userName: {
    ...typography.bodyMd,
    fontWeight: '700',
  },
  timestamp: {
    ...typography.caption,
    marginTop: 1,
  },
  achievementBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  achievementCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    padding: spacing.sm + 4,
    borderRadius: radius.md,
    marginBottom: spacing.sm + 4,
  },
  achievementIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  achievementContent: {
    flex: 1,
    gap: 2,
  },
  achievementTitle: {
    ...typography.label,
    fontWeight: '700',
  },
  achievementDesc: {
    ...typography.caption,
    lineHeight: 16,
  },
  achievementValue: {
    ...typography.label,
    fontWeight: '800',
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingTop: spacing.xs,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 1,
  },
  actionCount: {
    fontSize: 13,
    fontWeight: '600',
  },
});

export default React.memo(AchievementPost);
