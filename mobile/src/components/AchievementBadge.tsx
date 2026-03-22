/**
 * AchievementBadge — Single achievement display.
 * Rarity border: Common (gray), Rare (blue #4285F4), Epic (purple #8B5CF6).
 * Locked: grayscale + lock icon. Unlocked: full color + glow effect.
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius } from '../theme';
import { haptics } from '../hooks/useHaptics';

export type AchievementRarity = 'common' | 'rare' | 'epic';

export interface AchievementData {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: AchievementRarity;
  category: string;
  unlockedAt?: string | null;
}

interface AchievementBadgeProps {
  achievement: AchievementData;
  unlocked: boolean;
  onPress?: (achievement: AchievementData) => void;
  size?: number;
}

const RARITY_COLORS: Record<AchievementRarity, string> = {
  common: '#9CA3AF',
  rare: '#4285F4',
  epic: '#8B5CF6',
};

const RARITY_GLOW: Record<AchievementRarity, string> = {
  common: 'rgba(156, 163, 175, 0.3)',
  rare: 'rgba(66, 133, 244, 0.3)',
  epic: 'rgba(139, 92, 246, 0.3)',
};

const AchievementBadge = React.memo(function AchievementBadge({
  achievement,
  unlocked,
  onPress,
  size = 80,
}: AchievementBadgeProps) {
  const c = useThemeColors();
  const rarityColor = RARITY_COLORS[achievement.rarity];
  const glowColor = RARITY_GLOW[achievement.rarity];

  // Glow pulse for unlocked badges
  const glowAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (unlocked) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
          Animated.timing(glowAnim, {
            toValue: 0,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    }
    glowAnim.setValue(0);
  }, [unlocked]);

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.2, 0.6],
  });

  const handlePress = () => {
    haptics.light();
    onPress?.(achievement);
  };

  const iconSize = Math.round(size * 0.35);

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.8}
      disabled={!onPress}
      accessibilityLabel={`${achievement.name}: ${unlocked ? 'desbloqueado' : 'bloqueado'}, rareza ${achievement.rarity}`}
      accessibilityRole="button"
    >
      <View style={[styles.wrapper, { width: size }]}>
        {/* Glow ring for unlocked */}
        {unlocked && (
          <Animated.View
            style={[
              styles.glowRing,
              {
                width: size + 8,
                height: size + 8,
                borderRadius: (size + 8) / 2,
                backgroundColor: glowColor,
                opacity: glowOpacity,
              },
            ]}
          />
        )}

        {/* Badge circle */}
        <View
          style={[
            styles.badge,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderColor: unlocked ? rarityColor : c.grayLight,
              backgroundColor: unlocked ? c.surface : c.grayLight,
            },
          ]}
        >
          {unlocked ? (
            <Ionicons
              name={achievement.icon as any}
              size={iconSize}
              color={rarityColor}
            />
          ) : (
            <View style={styles.lockedContent}>
              <Ionicons
                name={achievement.icon as any}
                size={iconSize}
                color={c.disabled}
                style={{ opacity: 0.4 }}
              />
              <View style={[styles.lockOverlay, { backgroundColor: c.grayLight }]}>
                <Ionicons name="lock-closed" size={14} color={c.gray} />
              </View>
            </View>
          )}
        </View>

        {/* Name */}
        <Text
          style={[
            styles.name,
            { color: unlocked ? c.black : c.disabled },
          ]}
          numberOfLines={2}
        >
          {achievement.name}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

export default AchievementBadge;

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  glowRing: {
    position: 'absolute',
    top: -4,
  },
  badge: {
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockOverlay: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    ...typography.caption,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 15,
  },
});
