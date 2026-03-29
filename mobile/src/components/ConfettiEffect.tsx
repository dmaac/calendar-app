/**
 * ConfettiEffect — Animated confetti particles that fire on trigger.
 *
 * Props:
 *   trigger  — set to true to fire confetti
 *   duration — animation duration in ms (default 3000)
 *   colors   — array of particle colors
 *
 * Renders animated SVG circles and squares falling from top with random
 * horizontal drift and rotation. Uses Animated API for smooth performance.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Easing, Dimensions } from 'react-native';
import Svg, { Rect, Circle as SvgCircle } from 'react-native-svg';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const DEFAULT_COLORS = ['#4285F4', '#EA4335', '#FBBC04', '#34A853', '#EC4899', '#6366F1'];
const PARTICLE_COUNT = 40;

interface Particle {
  id: number;
  x: number;
  color: string;
  size: number;
  shape: 'circle' | 'square';
  drift: number;
  delay: number;
}

interface ConfettiEffectProps {
  trigger: boolean;
  duration?: number;
  colors?: string[];
}

function generateParticles(colors: string[]): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    id: i,
    x: Math.random() * SCREEN_WIDTH,
    color: colors[Math.floor(Math.random() * colors.length)],
    size: 6 + Math.random() * 6,
    shape: Math.random() > 0.5 ? 'circle' : 'square',
    drift: (Math.random() - 0.5) * 80,
    delay: Math.random() * 600,
  }));
}

const AnimatedSvg = Animated.createAnimatedComponent(View);

function ConfettiParticle({ particle, duration }: { particle: Particle; duration: number }) {
  const fallAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const mainDuration = duration - particle.delay;

    Animated.parallel([
      Animated.timing(fallAnim, {
        toValue: 1,
        duration: mainDuration,
        delay: particle.delay,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: mainDuration,
        delay: particle.delay + mainDuration * 0.6,
        useNativeDriver: true,
      }),
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: mainDuration,
        delay: particle.delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const translateY = fallAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-20, SCREEN_HEIGHT + 20],
  });

  const translateX = fallAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, particle.drift],
  });

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', `${360 + Math.random() * 360}deg`],
  });

  return (
    <AnimatedSvg
      style={[
        styles.particle,
        {
          left: particle.x,
          opacity: opacityAnim,
          transform: [{ translateY }, { translateX }, { rotate }],
        },
      ]}
    >
      <Svg width={particle.size} height={particle.size}>
        {particle.shape === 'circle' ? (
          <SvgCircle
            cx={particle.size / 2}
            cy={particle.size / 2}
            r={particle.size / 2}
            fill={particle.color}
          />
        ) : (
          <Rect
            width={particle.size}
            height={particle.size}
            rx={2}
            fill={particle.color}
          />
        )}
      </Svg>
    </AnimatedSvg>
  );
}

export default function ConfettiEffect({
  trigger,
  duration = 3000,
  colors = DEFAULT_COLORS,
}: ConfettiEffectProps) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [visible, setVisible] = useState(false);
  const prevTrigger = useRef(false);

  useEffect(() => {
    // Only fire on rising edge (false -> true)
    if (trigger && !prevTrigger.current) {
      setParticles(generateParticles(colors));
      setVisible(true);

      const timer = setTimeout(() => {
        setVisible(false);
        setParticles([]);
      }, duration + 200);

      return () => clearTimeout(timer);
    }
    prevTrigger.current = trigger;
  }, [trigger, duration, colors]);

  if (!visible || particles.length === 0) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      {particles.map((p) => (
        <ConfettiParticle key={p.id} particle={p} duration={duration} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },
  particle: {
    position: 'absolute',
    top: 0,
  },
});
