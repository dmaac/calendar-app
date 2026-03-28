/**
 * SkeletonLoader — Shimmer/pulse loading placeholder for Fitsi AI
 *
 * Uses React Native's built-in Animated API (no heavy deps).
 * Combines an opacity pulse with a subtle horizontal shimmer sweep
 * for a premium "content loading" feel.
 *
 * The shimmer is achieved via a translateX animation on an overlay,
 * clipped by the borderRadius of the container.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, radius, useThemeColors } from '../theme';

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
  const c = useThemeColors();
  const opacity = useRef(new Animated.Value(0.35)).current;
  const shimmerTranslate = useRef(new Animated.Value(-1)).current;

  useEffect(() => {
    // Smooth opacity pulse
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.75,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.35,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();

    // Horizontal shimmer sweep — a bright band that slides across
    const shimmer = Animated.loop(
      Animated.timing(shimmerTranslate, {
        toValue: 1,
        duration: 1400,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    shimmer.start();

    return () => {
      pulse.stop();
      shimmer.stop();
    };
  }, []);

  return (
    <Animated.View
      style={[
        baseStyle.bar,
        { width: width as any, height, borderRadius: br, opacity, backgroundColor: c.grayLight },
        style,
      ]}
      accessibilityLabel="Cargando contenido"
      accessibilityRole="progressbar"
    >
      {/* Shimmer highlight band */}
      <Animated.View
        style={[
          baseStyle.shimmer,
          {
            height,
            borderRadius: br,
            backgroundColor: c.white + '35',
            transform: [{
              translateX: shimmerTranslate.interpolate({
                inputRange: [-1, 1],
                outputRange: [-60, 260],
              }),
            }],
          },
        ]}
      />
    </Animated.View>
  );
}

const baseStyle = StyleSheet.create({
  bar: {
    overflow: 'hidden',
  },
  shimmer: {
    position: 'absolute',
    width: 60,
  },
});

/**
 * HomeSkeleton — Full skeleton for the HomeScreen dashboard.
 * Shows a calorie ring placeholder + macro bars + quick actions + meal cards.
 * Matches the real HomeScreen layout so content "snaps into place" on load.
 * Uses theme colors for proper dark/light mode support.
 */
export function HomeSkeleton() {
  const c = useThemeColors();
  return (
    <Animated.View
      style={skeletonStyles.container}
      accessibilityLabel="Cargando dashboard"
      accessibilityRole="progressbar"
    >
      {/* Calorie ring + macro bars card */}
      <Animated.View style={[skeletonStyles.ringRow, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
        <SkeletonLoader width={160} height={160} borderRadius={80} />
        <Animated.View style={skeletonStyles.macros}>
          {/* Protein bar skeleton */}
          <SkeletonLoader height={10} width="55%" />
          <SkeletonLoader height={5} />
          {/* Carbs bar skeleton */}
          <SkeletonLoader height={10} width="48%" />
          <SkeletonLoader height={5} />
          {/* Fats bar skeleton */}
          <SkeletonLoader height={10} width="52%" />
          <SkeletonLoader height={5} />
        </Animated.View>
      </Animated.View>

      {/* Quick actions row skeleton */}
      <View style={skeletonStyles.quickActionsRow}>
        <View style={[skeletonStyles.quickActionSkeleton, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
          <SkeletonLoader width={36} height={36} borderRadius={18} />
          <SkeletonLoader width={40} height={10} />
        </View>
        <View style={[skeletonStyles.quickActionSkeleton, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
          <SkeletonLoader width={36} height={36} borderRadius={18} />
          <SkeletonLoader width={36} height={10} />
        </View>
        <View style={[skeletonStyles.quickActionSkeleton, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
          <SkeletonLoader width={36} height={36} borderRadius={18} />
          <SkeletonLoader width={44} height={10} />
        </View>
      </View>

      {/* Section title placeholder */}
      <SkeletonLoader width={60} height={12} style={{ marginTop: 12, marginBottom: 12 }} />

      {/* Meal card placeholders */}
      <Animated.View style={[skeletonStyles.mealCard, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
        <SkeletonLoader width="40%" height={14} />
        <SkeletonLoader height={12} style={{ marginTop: 8 }} />
        <SkeletonLoader height={12} width="80%" style={{ marginTop: 6 }} />
      </Animated.View>
      <Animated.View style={[skeletonStyles.mealCard, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
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
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  macros: {
    flex: 1,
    gap: 8,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  quickActionSkeleton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 6,
  },
  mealCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 16,
    marginBottom: 8,
  },
});
