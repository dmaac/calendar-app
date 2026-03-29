/**
 * OfflineBanner — Subtle yellow banner shown when the device is offline.
 * Animates in/out based on connectivity state.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface OfflineBannerProps {
  /** If true, renders inside an absolute overlay at the top. Default: false (inline). */
  absolute?: boolean;
}

const OfflineBanner: React.FC<OfflineBannerProps> = ({ absolute = false }) => {
  const { isConnected } = useNetworkStatus();
  const translateY = useRef(new Animated.Value(-60)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!isConnected) {
      // Slide in
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
    } else {
      // Slide out
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -60,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isConnected]);

  const banner = (
    <Animated.View
      style={[
        styles.banner,
        absolute && { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 999, paddingTop: insets.top },
        { transform: [{ translateY }], opacity },
      ]}
      pointerEvents="none"
    >
      <View style={styles.content}>
        <Ionicons name="cloud-offline-outline" size={16} color="#92400E" />
        <Text style={styles.text}>
          Sin conexion — los cambios se sincronizaran automaticamente
        </Text>
      </View>
    </Animated.View>
  );

  return banner;
};

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#FEF3C7',
    borderBottomWidth: 1,
    borderBottomColor: '#FDE68A',
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
    fontSize: 12,
    fontWeight: '500',
    color: '#92400E',
    flexShrink: 1,
  },
});

export default OfflineBanner;
