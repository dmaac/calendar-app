/**
 * GlobalLoadingOverlay — Semi-transparent overlay with spinner and message.
 *
 * Provides a global loading state that can be shown/hidden from any screen
 * via the useGlobalLoading() hook.
 *
 * Usage:
 *   // In App.tsx (mount once):
 *   <GlobalLoadingOverlay />
 *
 *   // In any screen/component:
 *   const { showLoading, hideLoading } = useGlobalLoading();
 *   showLoading('Guardando...');
 *   await save();
 *   hideLoading();
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Platform,
} from 'react-native';
import { useThemeColors, typography, spacing, radius } from '../theme';

// ---- Global loading state (module-level singleton) ----

interface LoadingState {
  visible: boolean;
  message: string;
}

type LoadingListener = (state: LoadingState) => void;

const _listeners = new Set<LoadingListener>();
let _currentState: LoadingState = { visible: false, message: 'Cargando...' };

function emitChange(state: LoadingState) {
  _currentState = state;
  _listeners.forEach((cb) => cb(state));
}

/**
 * Hook to control the global loading overlay from any component.
 *
 * @example
 *   const { showLoading, hideLoading, isLoading } = useGlobalLoading();
 *   showLoading('Sincronizando...');
 */
export function useGlobalLoading() {
  const showLoading = useCallback((message?: string) => {
    emitChange({ visible: true, message: message ?? 'Cargando...' });
  }, []);

  const hideLoading = useCallback(() => {
    emitChange({ visible: false, message: 'Cargando...' });
  }, []);

  return { showLoading, hideLoading, isLoading: _currentState.visible };
}

// ---- Component ----

const GlobalLoadingOverlay: React.FC = () => {
  const c = useThemeColors();
  const [state, setState] = useState<LoadingState>(_currentState);
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    const listener: LoadingListener = (newState) => {
      setState({ ...newState });
    };
    _listeners.add(listener);
    return () => {
      _listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (state.visible) {
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(cardScale, {
          toValue: 1,
          useNativeDriver: true,
          tension: 100,
          friction: 10,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(cardScale, {
          toValue: 0.9,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [state.visible]);

  if (!state.visible) return null;

  return (
    <Animated.View
      style={[styles.overlay, { opacity: overlayOpacity }]}
      pointerEvents="auto"
      accessibilityRole="progressbar"
      accessibilityLabel={state.message}
      accessibilityLiveRegion="assertive"
    >
      <Animated.View
        style={[
          styles.card,
          {
            backgroundColor: c.surface,
            transform: [{ scale: cardScale }],
          },
        ]}
      >
        <ActivityIndicator
          size="large"
          color={c.accent}
          accessibilityLabel="Indicador de carga"
        />
        <Text style={[styles.message, { color: c.black }]}>
          {state.message}
        </Text>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99999,
    ...Platform.select({
      web: { position: 'fixed' as any },
      default: {},
    }),
  },
  card: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    gap: spacing.md,
    minWidth: 160,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: { elevation: 10 },
      default: {},
    }),
  },
  message: {
    ...typography.bodyMd,
    textAlign: 'center',
  },
});

export default GlobalLoadingOverlay;
