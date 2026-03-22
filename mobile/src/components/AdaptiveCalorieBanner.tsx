/**
 * AdaptiveCalorieBanner — Suggests calorie goal adjustments based on recent intake.
 *
 * Logic:
 *   If the 7-day rolling average differs by >15% from the current target,
 *   the banner appears with a suggestion to adjust the goal.
 *
 * UX:
 *   - Fade-in animation on appearance
 *   - Haptic feedback on button press
 *   - Dismissable with "Mantener" or actionable with "Ajustar"
 *   - Subtle surface card matching Fitsi design language
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius, shadows } from '../theme';
import { haptics } from '../hooks/useHaptics';

// ---- Types ----------------------------------------------------------------

interface AdaptiveCalorieBannerProps {
  /** Array of daily calorie totals for the last 7 days (most recent last). */
  recentDailyCalories: number[];
  /** Current daily calorie target. */
  currentTarget: number;
  /** Called when the user accepts the suggested adjustment. */
  onAdjust: (newTarget: number) => void;
  /** Called when the user dismisses the suggestion. */
  onDismiss?: () => void;
}

// ---- Constants ------------------------------------------------------------

/** Threshold: if average differs by more than this fraction, suggest adjustment. */
const DEVIATION_THRESHOLD = 0.15;

/** Minimum number of days required to evaluate a trend. */
const MIN_DAYS_REQUIRED = 5;

/** Minimum safe calorie intake — never suggest below this. */
const MIN_SAFE_CALORIES = 1200;

// ---- Helpers --------------------------------------------------------------

function computeSuggestedTarget(
  recentCalories: number[],
  currentTarget: number,
): number | null {
  if (recentCalories.length < MIN_DAYS_REQUIRED) return null;

  const sum = recentCalories.reduce((acc, v) => acc + v, 0);
  const avg = sum / recentCalories.length;

  const deviation = Math.abs(avg - currentTarget) / currentTarget;
  if (deviation <= DEVIATION_THRESHOLD) return null;

  // Round to nearest 50 for cleaner UX
  const raw = Math.round(avg / 50) * 50;
  return Math.max(MIN_SAFE_CALORIES, raw);
}

// ---- Component ------------------------------------------------------------

export default function AdaptiveCalorieBanner({
  recentDailyCalories,
  currentTarget,
  onAdjust,
  onDismiss,
}: AdaptiveCalorieBannerProps) {
  const c = useThemeColors();
  const [dismissed, setDismissed] = useState(false);

  const suggestedTarget = useMemo(
    () => computeSuggestedTarget(recentDailyCalories, currentTarget),
    [recentDailyCalories, currentTarget],
  );

  // Fade-in animation
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    if (suggestedTarget !== null && !dismissed) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 400,
          delay: 300,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 400,
          delay: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [suggestedTarget, dismissed]);

  const handleAdjust = useCallback(() => {
    if (suggestedTarget === null) return;
    haptics.success();
    onAdjust(suggestedTarget);
    setDismissed(true);
  }, [suggestedTarget, onAdjust]);

  const handleDismiss = useCallback(() => {
    haptics.light();
    // Animate out
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: -8,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setDismissed(true);
      onDismiss?.();
    });
  }, [onDismiss, opacity, translateY]);

  // Don't render if no suggestion or already dismissed
  if (suggestedTarget === null || dismissed) return null;

  const avg = Math.round(
    recentDailyCalories.reduce((a, b) => a + b, 0) / recentDailyCalories.length,
  );
  const daysCount = recentDailyCalories.length;
  const diff = currentTarget - avg;
  const isEatingLess = diff > 0;

  return (
    <Animated.View
      style={[
        s.container,
        {
          backgroundColor: c.surface,
          borderColor: c.grayLight,
          opacity,
          transform: [{ translateY }],
        },
      ]}
      accessibilityLabel={`Sugerencia: llevas ${daysCount} dias consumiendo un promedio de ${avg} calorias. Tu objetivo actual es ${currentTarget}. Sugerencia: ajustar a ${suggestedTarget}.`}
      accessibilityRole="alert"
    >
      {/* Icon */}
      <View style={[s.iconCircle, { backgroundColor: '#FEF3C7' }]}>
        <Ionicons name="trending-down" size={18} color="#D97706" />
      </View>

      {/* Text */}
      <View style={s.textCol}>
        <Text style={[s.title, { color: c.black }]}>
          {isEatingLess ? 'Consumo por debajo del objetivo' : 'Consumo por encima del objetivo'}
        </Text>
        <Text style={[s.subtitle, { color: c.gray }]}>
          Llevas {daysCount} dias consumiendo ~{Math.abs(diff)} kcal {isEatingLess ? 'menos' : 'mas'} de tu objetivo.
          {'\n'}Ajustar a {suggestedTarget} kcal?
        </Text>

        {/* Action buttons */}
        <View style={s.actions}>
          <TouchableOpacity
            style={[s.btnPrimary, { backgroundColor: c.accent }]}
            onPress={handleAdjust}
            activeOpacity={0.8}
            accessibilityLabel={`Ajustar objetivo a ${suggestedTarget} calorias`}
            accessibilityRole="button"
          >
            <Text style={s.btnPrimaryText}>Ajustar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.btnSecondary, { borderColor: c.grayLight }]}
            onPress={handleDismiss}
            activeOpacity={0.8}
            accessibilityLabel="Mantener objetivo actual"
            accessibilityRole="button"
          >
            <Text style={[s.btnSecondaryText, { color: c.gray }]}>Mantener</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

// ---- Styles ---------------------------------------------------------------

const s = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
    alignItems: 'flex-start',
    ...shadows.sm,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  textCol: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    ...typography.label,
    fontWeight: '700',
  },
  subtitle: {
    ...typography.caption,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  btnPrimary: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryText: {
    ...typography.caption,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  btnSecondary: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    borderWidth: 1,
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondaryText: {
    ...typography.caption,
    fontWeight: '600',
  },
});
