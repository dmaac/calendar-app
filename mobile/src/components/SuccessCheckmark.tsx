/**
 * SuccessCheckmark — Animated checkmark with bouncy scale + confetti-like particles.
 *
 * Used after completing onboarding, logging food, and other success moments.
 * Triggers haptic success feedback automatically.
 */
import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { haptics } from '../hooks/useHaptics';

interface SuccessCheckmarkProps {
  /** Size of the circle. Defaults to 88. */
  size?: number;
  /** Background color. Defaults to colors.success. */
  color?: string;
  /** Whether to show particle burst. Defaults to true. */
  showParticles?: boolean;
  /** Callback after animation completes. */
  onAnimationEnd?: () => void;
}

const PARTICLE_COUNT = 8;
const PARTICLE_COLORS = ['#F59E0B', '#EF4444', '#3B82F6', '#10B981', '#EC4899', '#8B5CF6', '#F97316', '#06B6D4'];

export default function SuccessCheckmark({
  size = 88,
  color = colors.success,
  showParticles = true,
  onAnimationEnd,
}: SuccessCheckmarkProps) {
  const checkScale = useRef(new Animated.Value(0)).current;
  const ringScale = useRef(new Animated.Value(0)).current;
  const ringOpacity = useRef(new Animated.Value(1)).current;
  const particles = useRef(
    Array.from({ length: PARTICLE_COUNT }, () => ({
      translateX: new Animated.Value(0),
      translateY: new Animated.Value(0),
      scale: new Animated.Value(0),
      opacity: new Animated.Value(1),
    })),
  ).current;

  useEffect(() => {
    haptics.success();

    // Main checkmark bounce
    Animated.spring(checkScale, {
      toValue: 1,
      friction: 4,
      tension: 100,
      useNativeDriver: true,
    }).start();

    // Expanding ring
    Animated.parallel([
      Animated.timing(ringScale, {
        toValue: 2.2,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(ringOpacity, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();

    // Particle burst
    if (showParticles) {
      const particleAnims = particles.map((p, i) => {
        const angle = (i / PARTICLE_COUNT) * 2 * Math.PI;
        const distance = size * 0.9 + Math.random() * 20;
        return Animated.parallel([
          Animated.sequence([
            Animated.timing(p.scale, {
              toValue: 1,
              duration: 150,
              delay: 100,
              useNativeDriver: true,
            }),
            Animated.timing(p.scale, {
              toValue: 0,
              duration: 400,
              useNativeDriver: true,
            }),
          ]),
          Animated.timing(p.translateX, {
            toValue: Math.cos(angle) * distance,
            duration: 550,
            delay: 100,
            useNativeDriver: true,
          }),
          Animated.timing(p.translateY, {
            toValue: Math.sin(angle) * distance,
            duration: 550,
            delay: 100,
            useNativeDriver: true,
          }),
          Animated.timing(p.opacity, {
            toValue: 0,
            duration: 400,
            delay: 250,
            useNativeDriver: true,
          }),
        ]);
      });

      Animated.parallel(particleAnims).start(() => {
        onAnimationEnd?.();
      });
    } else {
      // No particles — fire callback after main animation
      setTimeout(() => onAnimationEnd?.(), 600);
    }
  }, []);

  return (
    <View
      style={[styles.container, { width: size * 3, height: size * 3 }]}
      accessibilityLabel="Completado exitosamente"
      accessibilityRole="image"
    >
      {/* Expanding ring */}
      <Animated.View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: color,
            transform: [{ scale: ringScale }],
            opacity: ringOpacity,
          },
        ]}
      />

      {/* Particles */}
      {showParticles &&
        particles.map((p, i) => (
          <Animated.View
            key={i}
            style={[
              styles.particle,
              {
                backgroundColor: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
                width: 8,
                height: 8,
                borderRadius: 4,
                transform: [
                  { translateX: p.translateX },
                  { translateY: p.translateY },
                  { scale: p.scale },
                ],
                opacity: p.opacity,
              },
            ]}
          />
        ))}

      {/* Checkmark circle */}
      <Animated.View
        style={[
          styles.circle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            transform: [{ scale: checkScale }],
          },
        ]}
      >
        <Ionicons name="checkmark" size={size * 0.5} color={colors.white} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderWidth: 3,
  },
  particle: {
    position: 'absolute',
  },
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
