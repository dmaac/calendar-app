/**
 * StreakCard — Detailed streak display.
 * Shows: current streak with fire emoji, best streak record, freezes available,
 * "Racha en riesgo!" warning, countdown to midnight.
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius, shadows } from '../theme';

interface StreakCardProps {
  currentStreak: number;
  bestStreak: number;
  freezesAvailable: number;
  /** Whether the streak is at risk of breaking today (user hasn't logged) */
  atRisk?: boolean;
}

function useCountdown(): string {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      const diff = midnight.getTime() - now.getTime();
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      setTimeLeft(
        `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
      );
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return timeLeft;
}

const StreakCard = React.memo(function StreakCard({
  currentStreak,
  bestStreak,
  freezesAvailable,
  atRisk = false,
}: StreakCardProps) {
  const c = useThemeColors();
  const countdown = useCountdown();

  // Pulse animation for at-risk warning
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (atRisk) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    }
    pulseAnim.setValue(1);
  }, [atRisk]);

  // Freeze icons
  const freezeIcons = useMemo(() => {
    const icons = [];
    for (let i = 0; i < 3; i++) {
      icons.push(
        <Ionicons
          key={i}
          name="snow"
          size={16}
          color={i < freezesAvailable ? '#60A5FA' : c.grayLight}
        />,
      );
    }
    return icons;
  }, [freezesAvailable, c.grayLight]);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: c.surface, borderColor: atRisk ? '#F97316' : c.grayLight },
      ]}
      accessibilityLabel={`Racha actual: ${currentStreak} dias. Mejor racha: ${bestStreak} dias. ${freezesAvailable} freezes disponibles. ${atRisk ? 'Racha en riesgo!' : ''}`}
    >
      {/* Main streak display */}
      <View style={styles.mainRow}>
        <View style={styles.streakDisplay}>
          <Ionicons name="flame" size={28} color="#F97316" />
          <Text style={[styles.streakNumber, { color: c.black }]}>{currentStreak}</Text>
          <Text style={[styles.streakLabel, { color: c.gray }]}>dias</Text>
        </View>

        <View style={styles.statsCol}>
          <View style={styles.statRow}>
            <Ionicons name="trophy" size={14} color="#FBBF24" />
            <Text style={[styles.statLabel, { color: c.gray }]}>Mejor:</Text>
            <Text style={[styles.statValue, { color: c.black }]}>{bestStreak}</Text>
          </View>
          <View style={styles.statRow}>
            <Ionicons name="snow" size={14} color="#60A5FA" />
            <Text style={[styles.statLabel, { color: c.gray }]}>Freezes:</Text>
            <View style={styles.freezeRow}>{freezeIcons}</View>
          </View>
        </View>
      </View>

      {/* At risk warning */}
      {atRisk && (
        <Animated.View
          style={[
            styles.riskBanner,
            { transform: [{ scale: pulseAnim }] },
          ]}
        >
          <Ionicons name="warning" size={16} color="#F97316" />
          <Text style={styles.riskText}>Racha en riesgo!</Text>
          <Text style={styles.riskSubtext}>Registra algo antes de medianoche</Text>
        </Animated.View>
      )}

      {/* Countdown to midnight */}
      <View style={styles.countdownRow}>
        <Ionicons name="time-outline" size={14} color={c.gray} />
        <Text style={[styles.countdownLabel, { color: c.gray }]}>Tiempo restante:</Text>
        <Text style={[styles.countdownValue, { color: atRisk ? '#F97316' : c.black }]}>
          {countdown}
        </Text>
      </View>
    </View>
  );
});

export default StreakCard;

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  mainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  streakDisplay: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  streakNumber: {
    fontSize: 36,
    fontWeight: '800',
    lineHeight: 40,
  },
  streakLabel: {
    ...typography.caption,
    fontWeight: '500',
  },
  statsCol: {
    gap: spacing.sm,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statLabel: {
    ...typography.caption,
    fontWeight: '500',
  },
  statValue: {
    ...typography.caption,
    fontWeight: '700',
  },
  freezeRow: {
    flexDirection: 'row',
    gap: 2,
  },
  riskBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: '#FFF7ED',
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    flexWrap: 'wrap',
  },
  riskText: {
    color: '#EA580C',
    fontWeight: '700',
    fontSize: 13,
  },
  riskSubtext: {
    color: '#EA580C',
    fontSize: 12,
    fontWeight: '400',
    opacity: 0.8,
    width: '100%',
    paddingLeft: 20,
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
    paddingTop: spacing.sm,
  },
  countdownLabel: {
    ...typography.caption,
  },
  countdownValue: {
    ...typography.label,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
