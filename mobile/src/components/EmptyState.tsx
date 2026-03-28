/**
 * EmptyState -- Reusable empty-state placeholder with icon, title, description,
 * and an optional call-to-action button.
 *
 * Designed to replace the ad-hoc empty views scattered across screens
 * (WorkoutSummaryCard, MealRecommendationsSection, HistoryScreen, etc.).
 *
 * Usage:
 *   <EmptyState
 *     icon="restaurant-outline"
 *     title="Sin comidas registradas"
 *     description="Escanea tu primera comida para comenzar"
 *     ctaLabel="Escanear"
 *     onCtaPress={() => navigate('Scan')}
 *   />
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius } from '../theme';

interface EmptyStateProps {
  /** Ionicons icon name displayed at the top. Defaults to 'document-text-outline'. */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Icon size in points. Defaults to 48. */
  iconSize?: number;
  /** Override icon color. Defaults to theme disabled. */
  iconColor?: string;
  /** Primary message. */
  title: string;
  /** Secondary explanatory text. */
  description?: string;
  /** Label for the CTA button. When provided, the button is rendered. */
  ctaLabel?: string;
  /** Callback when the CTA button is pressed. */
  onCtaPress?: () => void;
  /** Whether the container fills all available vertical space. Defaults to false. */
  fullHeight?: boolean;
  /** Accessibility label override. Defaults to title. */
  accessibilityLabel?: string;
}

const EmptyState = React.memo(function EmptyState({
  icon = 'document-text-outline',
  iconSize = 48,
  iconColor,
  title,
  description,
  ctaLabel,
  onCtaPress,
  fullHeight = false,
  accessibilityLabel,
}: EmptyStateProps) {
  const c = useThemeColors();

  return (
    <View
      style={[styles.container, fullHeight && styles.fullHeight]}
      accessibilityLabel={accessibilityLabel ?? title}
    >
      <Ionicons
        name={icon}
        size={iconSize}
        color={iconColor ?? c.disabled}
      />

      <Text style={[styles.title, { color: c.black }]}>{title}</Text>

      {description != null && description.length > 0 && (
        <Text style={[styles.description, { color: c.gray }]}>{description}</Text>
      )}

      {ctaLabel != null && onCtaPress != null && (
        <TouchableOpacity
          style={[styles.ctaButton, { backgroundColor: c.black }]}
          onPress={onCtaPress}
          activeOpacity={0.85}
          accessibilityLabel={ctaLabel}
          accessibilityRole="button"
        >
          <Text style={[styles.ctaText, { color: c.white }]}>{ctaLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  fullHeight: {
    flex: 1,
  },
  title: {
    ...typography.bodyMd,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  description: {
    ...typography.caption,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 18,
  },
  ctaButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
    marginTop: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctaText: {
    ...typography.button,
  },
});

export default EmptyState;
