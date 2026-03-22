/**
 * LoadingScreen — Full-screen branded loading state for Fitsi IA.
 *
 * Uses a pulsing logo circle + fade-in entrance instead of a plain spinner.
 * The subtle scale animation communicates "working" without being distracting.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing } from '../theme';

const LoadingScreen: React.FC = () => {
  const fadeIn = useRef(new Animated.Value(0)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Fade in the whole screen
    Animated.timing(fadeIn, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();

    // Continuous gentle pulse on the logo circle
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseScale, {
          toValue: 1.06,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseScale, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  return (
    <Animated.View
      style={[styles.container, { opacity: fadeIn }]}
      accessibilityLabel="Cargando"
      accessibilityRole="progressbar"
    >
      <Animated.View style={[styles.logoCircle, { transform: [{ scale: pulseScale }] }]}>
        <Ionicons name="nutrition-outline" size={32} color={colors.white} />
      </Animated.View>
      <Text style={styles.text}>Cargando...</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  text: {
    ...typography.label,
    color: colors.gray,
  },
});

export default LoadingScreen;
