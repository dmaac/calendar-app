/**
 * ErrorState -- Lightweight error display with retry button.
 *
 * Unlike ErrorFallback (which depends on FitsiMascot and haptics),
 * this component is fully self-contained and suitable for embedding
 * inside cards, sections, or partial views where an API call failed.
 *
 * Usage:
 *   <ErrorState
 *     message="No pudimos cargar tus datos"
 *     onRetry={() => refetch()}
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

interface ErrorStateProps {
  /** Primary error message. Defaults to 'Algo salio mal'. */
  message?: string;
  /** Secondary hint text. Defaults to 'Revisa tu conexion e intenta de nuevo.' */
  hint?: string;
  /** Ionicons icon name. Defaults to 'alert-circle-outline'. */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Icon size in points. Defaults to 40. */
  iconSize?: number;
  /** Callback when the retry button is pressed. When omitted, no button is shown. */
  onRetry?: () => void;
  /** Label for the retry button. Defaults to 'Reintentar'. */
  retryLabel?: string;
  /** Whether the container fills all available vertical space. Defaults to false. */
  fullHeight?: boolean;
  /** Accessibility label override. Defaults to message. */
  accessibilityLabel?: string;
}

const ErrorState = React.memo(function ErrorState({
  message = 'Algo salio mal',
  hint = 'Revisa tu conexion e intenta de nuevo.',
  icon = 'alert-circle-outline',
  iconSize = 40,
  onRetry,
  retryLabel = 'Reintentar',
  fullHeight = false,
  accessibilityLabel,
}: ErrorStateProps) {
  const c = useThemeColors();

  return (
    <View
      style={[styles.container, fullHeight && styles.fullHeight]}
      accessibilityLabel={accessibilityLabel ?? `Error: ${message}`}
    >
      <Ionicons
        name={icon}
        size={iconSize}
        color={c.disabled}
      />

      <Text style={[styles.message, { color: c.black }]}>{message}</Text>

      {hint != null && hint.length > 0 && (
        <Text style={[styles.hint, { color: c.gray }]}>{hint}</Text>
      )}

      {onRetry != null && (
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: c.black }]}
          onPress={onRetry}
          activeOpacity={0.85}
          accessibilityLabel={retryLabel}
          accessibilityRole="button"
        >
          <Ionicons name="refresh" size={16} color={c.white} />
          <Text style={[styles.retryText, { color: c.white }]}>{retryLabel}</Text>
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
  message: {
    ...typography.bodyMd,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  hint: {
    ...typography.caption,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 18,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
    marginTop: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  retryText: {
    ...typography.label,
  },
});

export default ErrorState;
