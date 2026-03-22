/**
 * ErrorFallback — Reusable API error state with Fitsi sad mascot
 * Shows a friendly error message + retry button.
 *
 * Usage:
 *   <ErrorFallback message="No pudimos cargar tus datos" onRetry={() => load()} />
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius } from '../theme';
import FitsiMascot from './FitsiMascot';
import { haptics } from '../hooks/useHaptics';

interface ErrorFallbackProps {
  message?: string;
  hint?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export default function ErrorFallback({
  message = 'Algo salio mal',
  hint = 'Revisa tu conexion e intenta de nuevo.',
  onRetry,
  retryLabel = 'Reintentar',
}: ErrorFallbackProps) {
  const c = useThemeColors();

  return (
    <View style={styles.container} accessibilityLabel={`Error: ${message}`}>
      <FitsiMascot
        expression="sad"
        size="medium"
        animation="sad"
      />

      <Text style={[styles.message, { color: c.black }]}>{message}</Text>
      <Text style={[styles.hint, { color: c.gray }]}>{hint}</Text>

      {onRetry && (
        <TouchableOpacity
          style={[styles.retryBtn, { backgroundColor: c.black }]}
          onPress={() => {
            haptics.light();
            onRetry();
          }}
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
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  message: {
    ...typography.bodyMd,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  hint: {
    ...typography.caption,
    textAlign: 'center',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
    marginTop: spacing.md,
    minHeight: 44,
  },
  retryText: {
    ...typography.label,
  },
});
