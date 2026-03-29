/**
 * ProgressWidget — Compact progress card for HomeScreen.
 * Shows: level name, XP bar to next level, current streak, coins balance.
 * Tap opens full progress/achievement screen.
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
import { useThemeColors, typography, spacing, radius, shadows } from '../theme';
import { haptics } from '../hooks/useHaptics';

interface ProgressWidgetProps {
  levelName: string;
  levelNumber: number;
  currentXp: number;
  xpToNextLevel: number;
  streakDays: number;
  coins: number;
  onPress?: () => void;
}

const ProgressWidget = React.memo(function ProgressWidget({
  levelName,
  levelNumber,
  currentXp,
  xpToNextLevel,
  streakDays,
  coins,
  onPress,
}: ProgressWidgetProps) {
  const c = useThemeColors();
  const safeXp = currentXp ?? 0;
  const safeXpNext = xpToNextLevel ?? 0;
  const safeStreak = streakDays ?? 0;
  const safeCoins = coins ?? 0;
  const progress = safeXpNext > 0 ? Math.min(safeXp / safeXpNext, 1) : 0;
  const percentText = `${Math.round(progress * 100)}%`;

  // Animated XP bar fill on mount
  const fillAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    fillAnim.setValue(0);
    Animated.timing(fillAnim, {
      toValue: progress,
      duration: 900,
      delay: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const fillWidth = fillAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  const handlePress = () => {
    haptics.light();
    onPress?.();
  };

  return (
    <TouchableOpacity
      style={[styles.container, { backgroundColor: c.surface, borderColor: c.grayLight }]}
      onPress={handlePress}
      activeOpacity={0.85}
      accessibilityLabel={`Nivel ${levelNumber} ${levelName}, ${Math.round(safeXp)} de ${Math.round(safeXpNext)} XP, racha ${safeStreak} dias, ${Math.round(safeCoins)} monedas`}
      accessibilityRole="button"
      accessibilityHint="Abre la pantalla de progreso completa"
    >
      {/* Top row: level + streak + coins */}
      <View style={styles.topRow}>
        <View style={styles.levelBadge}>
          <View style={[styles.levelCircle, { backgroundColor: c.primary }]}>
            <Text style={styles.levelNumber}>{levelNumber}</Text>
          </View>
          <View>
            <Text style={[styles.levelName, { color: c.black }]}>{levelName}</Text>
            <Text style={[styles.xpText, { color: c.gray }]}>
              {Math.round(safeXp)}/{Math.round(safeXpNext)} XP
            </Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Ionicons name="flame" size={14} color="#F97316" />
            <Text style={[styles.statValue, { color: c.black }]}>{safeStreak}</Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="ellipse" size={12} color="#FBBF24" />
            <Text style={[styles.statValue, { color: c.black }]}>{Math.round(safeCoins)}</Text>
          </View>
          <Ionicons name="chevron-forward" size={14} color={c.gray} />
        </View>
      </View>

      {/* XP progress bar */}
      <View style={styles.barContainer}>
        <View style={[styles.barTrack, { backgroundColor: c.grayLight }]}>
          <Animated.View
            style={[
              styles.barFill,
              { width: fillWidth as any, backgroundColor: c.primary },
            ]}
          />
        </View>
        <Text style={[styles.percentText, { color: c.gray }]}>{percentText}</Text>
      </View>
    </TouchableOpacity>
  );
});

export default ProgressWidget;

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  levelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  levelCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelNumber: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  levelName: {
    ...typography.label,
    fontWeight: '700',
  },
  xpText: {
    ...typography.caption,
    marginTop: 1,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  barContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  barTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: 6,
    borderRadius: 3,
  },
  percentText: {
    ...typography.caption,
    fontWeight: '600',
    minWidth: 32,
    textAlign: 'right',
  },
});
