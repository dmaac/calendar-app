/**
 * OfflineModeBanner — Network status banner with offline/reconnect states.
 *
 * Replaces the old OfflineBanner with a two-state design:
 *   - Red banner: "Sin conexion -- datos guardados localmente"
 *   - Green banner: "Conectado -- sincronizando..." (auto-dismiss 3s)
 *
 * Uses the existing useNetworkStatus hook (expo-network polling).
 * Integrates with the app theme system for dark mode support.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useThemeColors, spacing, typography } from '../theme';

type BannerState = 'hidden' | 'offline' | 'reconnected';

const OfflineModeBanner: React.FC = () => {
  const { isConnected } = useNetworkStatus();
  const c = useThemeColors();
  const insets = useSafeAreaInsets();

  const [bannerState, setBannerState] = useState<BannerState>('hidden');
  const wasOfflineRef = useRef(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRenderRef = useRef(true);

  const translateY = useRef(new Animated.Value(-80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  // Slide banner in
  const slideIn = () => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 12,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // Slide banner out
  const slideOut = (onComplete?: () => void) => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -80,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => onComplete?.());
  };

  useEffect(() => {
    // Skip the very first render to avoid flashing a banner on app start
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      wasOfflineRef.current = !isConnected;
      if (!isConnected) {
        setBannerState('offline');
        slideIn();
      }
      return;
    }

    // Clear any pending dismiss timer
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }

    if (!isConnected) {
      // Went offline
      wasOfflineRef.current = true;
      setBannerState('offline');
      slideIn();
    } else if (wasOfflineRef.current) {
      // Just reconnected after being offline
      wasOfflineRef.current = false;
      setBannerState('reconnected');
      slideIn();

      // Auto-dismiss after 3 seconds
      dismissTimerRef.current = setTimeout(() => {
        slideOut(() => setBannerState('hidden'));
        dismissTimerRef.current = null;
      }, 3000);
    } else {
      // Was never offline, nothing to show
      slideOut(() => setBannerState('hidden'));
    }
  }, [isConnected]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
    };
  }, []);

  if (bannerState === 'hidden') return null;

  const isOffline = bannerState === 'offline';

  const bgColor = isOffline ? '#DC2626' : '#16A34A';
  const textColor = '#FFFFFF';
  const iconName = isOffline ? 'cloud-offline-outline' : 'cloud-done-outline';
  const message = isOffline
    ? 'Sin conexion -- datos guardados localmente'
    : 'Conectado -- sincronizando...';

  return (
    <Animated.View
      style={[
        styles.banner,
        {
          backgroundColor: bgColor,
          paddingTop: insets.top + 4,
          transform: [{ translateY }],
          opacity,
        },
      ]}
      pointerEvents="none"
      accessibilityRole="alert"
      accessibilityLabel={message}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.content}>
        <Ionicons name={iconName as any} size={16} color={textColor} />
        <Text style={[styles.text, { color: textColor }]}>{message}</Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  text: {
    ...typography.caption,
    fontWeight: '600',
    flexShrink: 1,
  },
});

export default OfflineModeBanner;
