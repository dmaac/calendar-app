/**
 * SkeletonLoader — Shimmer/pulse loading placeholder for Fitsi IA
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
        { width: width as any, height, borderRadius: br, opacity },
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
    backgroundColor: colors.grayLight,
    overflow: 'hidden',
  },
  shimmer: {
    position: 'absolute',
    width: 60,
    backgroundColor: 'rgba(255,255,255,0.35)',
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
