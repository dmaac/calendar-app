/**
 * InAppNotification — Slide-down banner for in-app achievements/events.
 *
 * Usage (imperative):
 *   import { showNotification } from '../components/InAppNotification';
 *   showNotification({ message: 'Comida registrada!', type: 'success', icon: 'checkmark-circle' });
 *
 * Usage (declarative — mount once at the top of the component tree):
 *   <InAppNotificationHost />
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ─── Types ──────────────────────────────────────────────────────────────────

export type NotificationType = 'success' | 'info' | 'warning';

export interface NotificationPayload {
  message: string;
  type?: NotificationType;
  /** Duration in ms before auto-dismiss. Default 3000. */
  duration?: number;
  /** Ionicons icon name. Defaults per type. */
  icon?: string;
}

// ─── Color config per type ──────────────────────────────────────────────────

const TYPE_CONFIG: Record<NotificationType, { bg: string; border: string; text: string; defaultIcon: string }> = {
  success: {
    bg: '#ECFDF5',
    border: '#A7F3D0',
    text: '#065F46',
    defaultIcon: 'checkmark-circle',
  },
  info: {
    bg: '#EFF6FF',
    border: '#BFDBFE',
    text: '#1E40AF',
    defaultIcon: 'information-circle',
  },
  warning: {
    bg: '#FEF3C7',
    border: '#FDE68A',
    text: '#92400E',
    defaultIcon: 'alert-circle',
  },
};

// ─── Global event bus (imperative API) ──────────────────────────────────────

type Listener = (payload: NotificationPayload) => void;
const _listeners = new Set<Listener>();

/** Show an in-app notification from anywhere. */
export function showNotification(payload: NotificationPayload): void {
  _listeners.forEach((cb) => cb(payload));
}

// ─── Host component (mount once, e.g., in AppNavigator or root layout) ──────

export function InAppNotificationHost() {
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState<NotificationPayload | null>(null);
  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -120,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setCurrent(null);
    });
  }, [translateY, opacity]);

  const show = useCallback(
    (payload: NotificationPayload) => {
      // Clear any existing timer
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      setCurrent(payload);

      // Reset position and animate in
      translateY.setValue(-120);
      opacity.setValue(0);

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

      // Auto-dismiss
      const duration = payload.duration ?? 3000;
      timerRef.current = setTimeout(() => {
        dismiss();
      }, duration);
    },
    [translateY, opacity, dismiss],
  );

  useEffect(() => {
    _listeners.add(show);
    return () => {
      _listeners.delete(show);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [show]);

  if (!current) return null;

  const type = current.type ?? 'info';
  const config = TYPE_CONFIG[type];
  const iconName = current.icon ?? config.defaultIcon;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          paddingTop: insets.top + 8,
          transform: [{ translateY }],
          opacity,
        },
      ]}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={dismiss}
        style={[
          styles.banner,
          {
            backgroundColor: config.bg,
            borderColor: config.border,
          },
        ]}
      >
        <Ionicons name={iconName as any} size={20} color={config.text} />
        <Text style={[styles.message, { color: config.text }]} numberOfLines={2}>
          {current.message}
        </Text>
        <Ionicons name="close" size={16} color={config.text} style={styles.closeIcon} />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  message: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  closeIcon: {
    opacity: 0.5,
  },
});

export default InAppNotificationHost;
