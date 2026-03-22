/**
 * TrialBanner — "7 dias gratis de Premium" banner for HomeScreen
 *
 * Shows a dismissible, animated banner for free users encouraging them to
 * start a Premium trial. Respects user dismissal (persisted in AsyncStorage).
 *
 * Usage:
 *   <TrialBanner
 *     visible={!isPremium}
 *     onStartTrial={() => navigation.navigate('Paywall')}
 *   />
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { typography, spacing, radius, useThemeColors } from '../theme';
import { haptics } from '../hooks/useHaptics';

const DISMISSED_KEY = '@fitsi_trial_banner_dismissed';
const DISMISS_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // Re-show after 3 days

interface TrialBannerProps {
  /** Whether the banner should be visible (typically !isPremium) */
  visible: boolean;
  /** Called when user taps "Probar gratis" */
  onStartTrial: () => void;
}

export default function TrialBanner({ visible, onStartTrial }: TrialBannerProps) {
  const c = useThemeColors();
  const [show, setShow] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  // Check if banner was recently dismissed
  useEffect(() => {
    if (!visible) return;

    AsyncStorage.getItem(DISMISSED_KEY).then((raw) => {
      if (raw) {
        const dismissedAt = parseInt(raw, 10);
        if (Date.now() - dismissedAt < DISMISS_COOLDOWN_MS) {
          return; // Still within cooldown
        }
      }
      setShow(true);
    }).catch(() => setShow(true));
  }, [visible]);

  // Slide-in animation
  useEffect(() => {
    if (show) {
      Animated.spring(slideAnim, {
        toValue: 1,
        tension: 60,
        friction: 9,
        useNativeDriver: true,
      }).start();

      // Shimmer loop on the crown icon
      Animated.loop(
        Animated.sequence([
          Animated.timing(shimmerAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(shimmerAnim, {
            toValue: 0,
            duration: 1500,
            useNativeDriver: true,
          }),
        ]),
      ).start();
    }
  }, [show]);

  const handleDismiss = useCallback(async () => {
    haptics.light();
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start(() => setShow(false));
    await AsyncStorage.setItem(DISMISSED_KEY, String(Date.now()));
  }, [slideAnim]);

  const handleStartTrial = useCallback(() => {
    haptics.medium();
    onStartTrial();
  }, [onStartTrial]);

  if (!visible || !show) return null;

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-80, 0],
  });

  const crownScale = shimmerAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.15, 1],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: c.accent,
          transform: [{ translateY }],
          opacity: slideAnim,
        },
      ]}
    >
      {/* Dismiss button */}
      <TouchableOpacity
        style={styles.dismissBtn}
        onPress={handleDismiss}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel="Cerrar banner"
        accessibilityRole="button"
      >
        <Ionicons name="close" size={14} color="rgba(255,255,255,0.7)" />
      </TouchableOpacity>

      {/* Content */}
      <View style={styles.content}>
        <Animated.View style={[styles.iconContainer, { transform: [{ scale: crownScale }] }]}>
          <Text style={styles.crownEmoji}>{'\u{1F451}'}</Text>
        </Animated.View>

        <View style={styles.textContainer}>
          <Text style={styles.title}>7 dias gratis de Premium</Text>
          <Text style={styles.subtitle}>
            Escaneos ilimitados, AI Coach y mas
          </Text>
        </View>

        <TouchableOpacity
          style={styles.ctaBtn}
          onPress={handleStartTrial}
          activeOpacity={0.85}
          accessibilityLabel="Iniciar prueba gratuita de 7 dias"
          accessibilityRole="button"
        >
          <Text style={styles.ctaText}>Probar</Text>
          <Ionicons name="arrow-forward" size={14} color="#1A1A2E" />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    position: 'relative',
    overflow: 'hidden',
  },
  dismissBtn: {
    position: 'absolute',
    top: 6,
    right: 8,
    zIndex: 2,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  crownEmoji: {
    fontSize: 18,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    ...typography.label,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  subtitle: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 1,
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  ctaText: {
    ...typography.label,
    color: '#1A1A2E',
    fontSize: 13,
    fontWeight: '700',
  },
});
