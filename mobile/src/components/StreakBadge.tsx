/**
 * StreakBadge — Compact streak counter with fire icon.
 * Shows current consecutive-day logging streak.
 * Designed to sit in the HomeScreen header row.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius } from '../theme';

interface StreakBadgeProps {
  /** Number of consecutive days with at least one meal logged. */
  days: number;
  /** Optional press handler (e.g. navigate to Achievements). */
  onPress?: () => void;
}

export default function StreakBadge({ days, onPress }: StreakBadgeProps) {
  const c = useThemeColors();
  const scaleAnim = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    scaleAnim.setValue(0.6);
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 4,
      tension: 160,
      useNativeDriver: true,
    }).start();
  }, [days]);

  if (days <= 0) return null;

  const content = (
    <Animated.View
      style={[styles.badge, { backgroundColor: c.badgeBg, transform: [{ scale: scaleAnim }] }]}
      accessibilityLabel={`Racha de ${days} dia${days > 1 ? 's' : ''}`}
      accessibilityRole="text"
    >
      <Ionicons name="flame" size={14} color="#4285F4" />
      <Text style={[styles.count, { color: c.badgeText }]}>{days}</Text>
    </Animated.View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
    borderRadius: radius.full,
    gap: 3,
  },
  count: {
    fontSize: 13,
    fontWeight: '800',
  },
});
