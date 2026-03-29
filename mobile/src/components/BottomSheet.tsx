/**
 * BottomSheet — Gesture-dismissable bottom sheet using react-native-gesture-handler.
 *
 * Replaces plain <Modal> bottom sheets with a swipe-to-dismiss pattern.
 * Uses RN Animated (no Reanimated dependency) for broad compatibility.
 *
 * IMPORTANT: The Modal is only mounted when visible=true. This prevents
 * hidden Modals from interfering with touch events on sibling components
 * (e.g., the tab bar becoming unresponsive when a screen renders hidden
 * Modals inside a ScrollView).
 *
 * Props:
 *  - visible: controls open/close
 *  - onClose: called when user swipes down or taps backdrop
 *  - children: bottom sheet content
 */
import React, { useEffect, useRef, useCallback, useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Animated,
  Pressable,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { PanGestureHandler, State, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, radius, spacing } from '../theme';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const DISMISS_THRESHOLD = 100; // px to swipe down before auto-dismiss

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** If true, wraps content in KeyboardAvoidingView (default: false) */
  avoidKeyboard?: boolean;
}

export default function BottomSheet({
  visible,
  onClose,
  children,
  avoidKeyboard = false,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const c = useThemeColors();
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  // Track whether the Modal should be mounted. We keep it mounted briefly
  // after visible becomes false so the exit animation can play out.
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      // Mount the Modal immediately, then animate in
      setMounted(true);
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 25,
          stiffness: 300,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (mounted) {
      // Animate out, then unmount the Modal
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: SCREEN_HEIGHT,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => setMounted(false));
    }
  }, [visible]);

  const handleGestureEvent = useCallback(
    Animated.event(
      [{ nativeEvent: { translationY: translateY } }],
      { useNativeDriver: true },
    ),
    [],
  );

  const handleStateChange = useCallback(
    ({ nativeEvent }: any) => {
      if (nativeEvent.state === State.END) {
        if (nativeEvent.translationY > DISMISS_THRESHOLD) {
          // Dismiss
          Animated.timing(translateY, {
            toValue: SCREEN_HEIGHT,
            duration: 200,
            useNativeDriver: true,
          }).start(() => onClose());
        } else {
          // Snap back
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            damping: 25,
            stiffness: 300,
          }).start();
        }
      }
    },
    [onClose],
  );

  // Clamp translateY so user can't drag upward past 0
  const clampedTranslateY = translateY.interpolate({
    inputRange: [-100, 0, SCREEN_HEIGHT],
    outputRange: [0, 0, SCREEN_HEIGHT],
    extrapolate: 'clamp',
  });

  // Do not render the Modal at all when not needed. This prevents
  // hidden Modals and their GestureHandler trees from interfering
  // with the tab bar's touch handling.
  if (!mounted) return null;

  const content = (
    <GestureHandlerRootView style={styles.gestureRoot}>
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Cerrar"
          accessibilityRole="button"
        />
      </Animated.View>

      {/* Sheet */}
      <PanGestureHandler
        onGestureEvent={handleGestureEvent}
        onHandlerStateChange={handleStateChange}
        activeOffsetY={[-10, 10]}
      >
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: c.bg,
              paddingBottom: insets.bottom + spacing.md,
              transform: [{ translateY: clampedTranslateY }],
            },
          ]}
        >
          {/* Handle bar */}
          <View
            style={styles.handleContainer}
            accessible={true}
            accessibilityLabel="Arrastrar hacia abajo para cerrar"
            accessibilityRole="button"
            accessibilityHint="Desliza hacia abajo para cerrar este panel"
          >
            <View style={[styles.handle, { backgroundColor: c.grayLight }]} />
          </View>
          {children}
        </Animated.View>
      </PanGestureHandler>
    </GestureHandlerRootView>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {avoidKeyboard ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.overlay}
        >
          {content}
        </KeyboardAvoidingView>
      ) : (
        <View style={styles.overlay}>{content}</View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  gestureRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: SCREEN_HEIGHT * 0.85,
  },
  handleContainer: {
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
});
