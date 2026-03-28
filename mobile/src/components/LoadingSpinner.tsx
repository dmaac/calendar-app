/**
 * LoadingSpinner -- Consistent inline loading indicator with optional message.
 *
 * Unlike LoadingScreen (which is full-screen), this component is designed to be
 * embedded inside cards, sections, or partial views where data is still loading.
 *
 * Usage:
 *   <LoadingSpinner />
 *   <LoadingSpinner message="Cargando comidas..." size="large" />
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Easing,
} from 'react-native';
import { useThemeColors, typography, spacing } from '../theme';

interface LoadingSpinnerProps {
  /** Optional message displayed below the spinner */
  message?: string;
  /** Spinner size. Defaults to 'small'. */
  size?: 'small' | 'large';
  /** Override spinner color. Defaults to theme accent. */
  color?: string;
  /** Whether the container takes up all available vertical space. Defaults to false. */
  fullHeight?: boolean;
  /** Accessibility label override. Defaults to message or 'Cargando'. */
  accessibilityLabel?: string;
}

const LoadingSpinner = React.memo(function LoadingSpinner({
  message,
  size = 'small',
  color,
  fullHeight = false,
  accessibilityLabel,
}: LoadingSpinnerProps) {
  const c = useThemeColors();
  const fadeIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeIn, {
      toValue: 1,
      duration: 300,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.container,
        fullHeight && styles.fullHeight,
        { opacity: fadeIn },
      ]}
      accessibilityLabel={accessibilityLabel ?? message ?? 'Cargando'}
      accessibilityRole="progressbar"
    >
      <ActivityIndicator
        size={size}
        color={color ?? c.accent}
      />
      {message != null && message.length > 0 && (
        <Text style={[styles.message, { color: c.gray }]}>{message}</Text>
      )}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  fullHeight: {
    flex: 1,
  },
  message: {
    ...typography.caption,
    textAlign: 'center',
  },
});

export default LoadingSpinner;
