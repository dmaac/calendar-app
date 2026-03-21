/**
 * SkeletonLoader — Shimmer/pulse loading placeholder for Fitsi IA
 *
 * Uses React Native's built-in Animated API (no heavy deps).
 * Renders a pulsing rectangle that communicates "content loading"
 * instead of a generic spinner.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, ViewStyle } from 'react-native';
import { colors, radius } from '../theme';

interface SkeletonProps {
  /** Width of the skeleton bar. Defaults to '100%'. */
  width?: number | string;
  /** Height of the skeleton bar. Defaults to 16. */
  height?: number;
  /** Border radius. Defaults to radius.sm (8). */
  borderRadius?: number;
  /** Optional additional style. */
  style?: ViewStyle;
}

export default function SkeletonLoader({
  width = '100%',
  height = 16,
  borderRadius: br = radius.sm,
  style,
}: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.8,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.35,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        baseStyle.bar,
        { width: width as any, height, borderRadius: br, opacity },
        style,
      ]}
      accessibilityLabel="Cargando contenido"
      accessibilityRole="progressbar"
    />
  );
}

const baseStyle = StyleSheet.create({
  bar: {
    backgroundColor: colors.grayLight,
  },
});

/**
 * HomeSkeleton — Full skeleton for the HomeScreen dashboard.
 * Shows a calorie ring placeholder + macro bars + meal cards.
 */
export function HomeSkeleton() {
  return (
    <Animated.View style={skeletonStyles.container}>
      {/* Calorie ring placeholder */}
      <Animated.View style={skeletonStyles.ringRow}>
        <SkeletonLoader width={160} height={160} borderRadius={80} />
        <Animated.View style={skeletonStyles.macros}>
          <SkeletonLoader height={12} width="60%" />
          <SkeletonLoader height={5} />
          <SkeletonLoader height={12} width="50%" />
          <SkeletonLoader height={5} />
          <SkeletonLoader height={12} width="55%" />
          <SkeletonLoader height={5} />
        </Animated.View>
      </Animated.View>

      {/* Section title placeholder */}
      <SkeletonLoader width={60} height={12} style={{ marginTop: 20, marginBottom: 12 }} />

      {/* Meal card placeholders */}
      <Animated.View style={skeletonStyles.mealCard}>
        <SkeletonLoader width="40%" height={14} />
        <SkeletonLoader height={12} style={{ marginTop: 8 }} />
        <SkeletonLoader height={12} width="80%" style={{ marginTop: 6 }} />
      </Animated.View>
      <Animated.View style={skeletonStyles.mealCard}>
        <SkeletonLoader width="35%" height={14} />
        <SkeletonLoader height={12} style={{ marginTop: 8 }} />
      </Animated.View>
    </Animated.View>
  );
}

const skeletonStyles = StyleSheet.create({
  container: {
    paddingTop: 8,
  },
  ringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.grayLight,
    padding: 16,
    marginBottom: 16,
  },
  macros: {
    flex: 1,
    gap: 8,
  },
  mealCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.grayLight,
    padding: 16,
    marginBottom: 8,
  },
});
