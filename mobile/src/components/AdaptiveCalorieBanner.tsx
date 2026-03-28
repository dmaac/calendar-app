/**
 * AdaptiveCalorieBanner — Server-driven calorie adjustment recommendation banner.
 *
 * Fetches the adaptive calorie target from the backend and displays a
 * contextual banner when an adjustment is recommended. The user can
 * accept ("Aplicar") or dismiss ("Ignorar") the recommendation.
 *
 * UX:
 *   - Fade-in + slide-up animation on appearance
 *   - Haptic feedback on button press
 *   - Contextual icon and color based on trend
 *   - Navigates to CalorieAdjustmentScreen on "Ver detalle" press
 */
import React, { useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius, shadows } from '../theme';
import { haptics } from '../hooks/useHaptics';
import useAdaptiveCalories from '../hooks/useAdaptiveCalories';

// ---- Types ----------------------------------------------------------------

interface AdaptiveCalorieBannerProps {
  /** Called when the user wants to navigate to the detail screen. */
  onViewDetail?: () => void;
  /** Called when an adjustment is successfully applied (to trigger a data refresh). */
  onAdjustmentApplied?: () => void;
}

// ---- Trend config ---------------------------------------------------------

interface TrendConfig {
  icon: string;
  iconColor: string;
  bgColor: string;
}

const TREND_MAP: Record<string, TrendConfig> = {
  losing_too_fast: {
    icon: 'trending-down',
    iconColor: '#D97706',
    bgColor: '#FEF3C7',
  },
  losing_on_track: {
    icon: 'checkmark-circle',
    iconColor: '#059669',
    bgColor: '#D1FAE5',
  },
  stable: {
    icon: 'remove-circle',
    iconColor: '#6B7280',
    bgColor: '#F3F4F6',
  },
  gaining_on_track: {
    icon: 'checkmark-circle',
    iconColor: '#059669',
    bgColor: '#D1FAE5',
  },
  gaining_too_fast: {
    icon: 'trending-up',
    iconColor: '#DC2626',
    bgColor: '#FEE2E2',
  },
  not_losing: {
    icon: 'pause-circle',
    iconColor: '#D97706',
    bgColor: '#FEF3C7',
  },
  not_gaining: {
    icon: 'pause-circle',
    iconColor: '#D97706',
    bgColor: '#FEF3C7',
  },
  insufficient_data: {
    icon: 'information-circle',
    iconColor: '#6B7280',
    bgColor: '#F3F4F6',
  },
};

// ---- Component ------------------------------------------------------------

export default function AdaptiveCalorieBanner({
  onViewDetail,
  onAdjustmentApplied,
}: AdaptiveCalorieBannerProps) {
  const c = useThemeColors();
  const {
    data,
    loading,
    acting,
    apply,
    dismiss,
  } = useAdaptiveCalories();

  // Animation refs
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  // Animate in when data arrives and there is a pending adjustment
  useEffect(() => {
    if (data && data.has_pending_adjustment && Math.abs(data.adjustment) > 0) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 450,
          delay: 400,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 450,
          delay: 400,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [data, opacity, translateY]);

  const handleApply = useCallback(async () => {
    haptics.success();
    const ok = await apply();
    if (ok) {
      // Animate out
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -12, duration: 250, useNativeDriver: true }),
      ]).start();
      onAdjustmentApplied?.();
    }
  }, [apply, opacity, translateY, onAdjustmentApplied]);

  const handleDismiss = useCallback(async () => {
    haptics.light();
    const ok = await dismiss();
    if (ok) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -12, duration: 250, useNativeDriver: true }),
      ]).start();
    }
  }, [dismiss, opacity, translateY]);

  const handleViewDetail = useCallback(() => {
    haptics.light();
    onViewDetail?.();
  }, [onViewDetail]);

  // Don't render if loading, no data, or no meaningful adjustment
  if (loading || !data) return null;
  if (!data.has_pending_adjustment || Math.abs(data.adjustment) === 0) return null;

  const trendConfig = TREND_MAP[data.trend] ?? TREND_MAP.stable;
  const isIncrease = data.adjustment > 0;

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
      accessibilityRole="alert"
      accessibilityLabel={`Ajuste de calorias recomendado: ${isIncrease ? 'subir' : 'bajar'} ${Math.abs(data.adjustment)} calorias. ${data.reason}`}
    >
      {/* Icon */}
      <View style={[s.iconCircle, { backgroundColor: trendConfig.bgColor }]}>
        <Ionicons
          name={trendConfig.icon as any}
          size={20}
          color={trendConfig.iconColor}
        />
      </View>

      {/* Content */}
      <View style={s.textCol}>
        {/* Title */}
        <Text style={[s.title, { color: c.black }]} allowFontScaling>
          {isIncrease ? 'Subir' : 'Bajar'} a {data.recommended_target} kcal
        </Text>

        {/* Adjustment badge */}
        <View style={s.badgeRow}>
          <View style={[s.badge, { backgroundColor: isIncrease ? '#D1FAE5' : '#FEE2E2' }]}>
            <Text style={[s.badgeText, { color: isIncrease ? '#059669' : '#DC2626' }]}>
              {isIncrease ? '+' : ''}{data.adjustment} kcal
            </Text>
          </View>
          {data.actual_weight && (
            <Text style={[s.weightInfo, { color: c.gray }]}>
              Peso actual: {data.actual_weight} kg
            </Text>
          )}
        </View>

        {/* Reason */}
        <Text style={[s.reason, { color: c.gray }]} numberOfLines={3} allowFontScaling>
          {data.reason}
        </Text>

        {/* Actions */}
        <View style={s.actions}>
          <TouchableOpacity
            style={[s.btnPrimary, { backgroundColor: c.accent }]}
            onPress={handleApply}
            activeOpacity={0.8}
            disabled={acting}
            accessibilityLabel={`Aplicar ajuste a ${data.recommended_target} calorias`}
            accessibilityRole="button"
          >
            {acting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={s.btnPrimaryText}>Aplicar</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.btnSecondary, { borderColor: c.grayLight }]}
            onPress={handleDismiss}
            activeOpacity={0.8}
            disabled={acting}
            accessibilityLabel="Ignorar ajuste"
            accessibilityRole="button"
          >
            <Text style={[s.btnSecondaryText, { color: c.gray }]}>Ignorar</Text>
          </TouchableOpacity>

          {onViewDetail && (
            <TouchableOpacity
              style={s.btnLink}
              onPress={handleViewDetail}
              activeOpacity={0.7}
              accessibilityLabel="Ver detalle del ajuste"
              accessibilityRole="button"
            >
              <Text style={[s.btnLinkText, { color: c.accent }]}>Detalle</Text>
              <Ionicons name="chevron-forward" size={14} color={c.accent} />
            </TouchableOpacity>
          )}
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
    width: 40,
    height: 40,
    borderRadius: 20,
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
    fontSize: 15,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  weightInfo: {
    ...typography.caption,
    fontSize: 12,
  },
  reason: {
    ...typography.caption,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  btnPrimary: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    minHeight: 34,
    minWidth: 72,
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
  btnLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginLeft: 'auto',
  },
  btnLinkText: {
    ...typography.caption,
    fontWeight: '600',
  },
});
