/**
 * StreakBadge -- Compact streak counter with fire icon.
 *
 * Shows current consecutive-day logging streak.
 * When a Streak Freeze is available, displays a small ice/snow icon
 * next to the flame to indicate the user has freeze protection.
 *
 * Designed to sit in the HomeScreen header row.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius } from '../theme';

interface StreakBadgeProps {
  /** Number of consecutive days with at least one meal logged. */
  days: number;
  /** Whether the user has a streak freeze available. Shows ice icon when true. */
  hasFreezeAvailable?: boolean;
  /** Whether a freeze was consumed today (shows a subtle frost glow). */
  freezeUsedToday?: boolean;
  /** Optional press handler (e.g. navigate to Achievements). */
  onPress?: () => void;
}

export default function StreakBadge({
  days,
  hasFreezeAvailable = false,
  freezeUsedToday = false,
  onPress,
}: StreakBadgeProps) {
  const c = useThemeColors();
  const safeDays = days ?? 0;
  const scaleAnim = useRef(new Animated.Value(0.6)).current;

  // Pulse animation for freeze indicator
  const freezePulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (hasFreezeAvailable) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(freezePulse, {
            toValue: 1.2,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(freezePulse, {
            toValue: 1,
            duration: 1200,
            useNativeDriver: true,
          }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    }
    freezePulse.setValue(1);
  }, [hasFreezeAvailable]);

  useEffect(() => {
    scaleAnim.setValue(0.6);
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 4,
      tension: 160,
      useNativeDriver: true,
    }).start();
  }, [safeDays]);

  if (safeDays <= 0) return null;

  const freezeColor = freezeUsedToday ? '#60A5FA' : '#93C5FD';

  const content = (
    <Animated.View
      style={[
        styles.badge,
        { backgroundColor: c.badgeBg, transform: [{ scale: scaleAnim }] },
        freezeUsedToday && styles.freezeGlow,
      ]}
      accessibilityLabel={
        `Racha de ${safeDays} dia${safeDays > 1 ? 's' : ''}` +
        (hasFreezeAvailable ? ', freeze disponible' : '') +
        (freezeUsedToday ? ', freeze usado hoy' : '')
      }
      accessibilityRole="text"
    >
      <Ionicons name="flame" size={14} color="#4285F4" />
      <Text style={[styles.count, { color: c.badgeText }]}>{safeDays}</Text>
      {hasFreezeAvailable && (
        <Animated.View style={{ transform: [{ scale: freezePulse }] }}>
          <Ionicons name="snow" size={11} color={freezeColor} />
        </Animated.View>
      )}
    </Animated.View>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        accessibilityLabel={
          `Racha de ${safeDays} dia${safeDays > 1 ? 's' : ''}` +
          (hasFreezeAvailable ? ', freeze disponible' : '') +
          (freezeUsedToday ? ', freeze usado hoy' : '')
        }
        accessibilityRole="button"
        accessibilityHint="Toca para ver tus logros y rachas"
      >
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
  freezeGlow: {
    borderWidth: 1,
    borderColor: 'rgba(147, 197, 253, 0.4)',
  },
});
