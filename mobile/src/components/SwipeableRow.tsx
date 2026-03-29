/**
 * SwipeableRow -- Reusable swipe-to-reveal actions component.
 *
 * Swipe left  (<-) -> reveals a right action panel (e.g. "Eliminar")
 * Swipe right (->) -> reveals a left action panel  (e.g. "Editar")
 *
 * Features:
 * - Smooth reveal animation with scale + translateX interpolation
 * - Haptic feedback (medium impact) when an action is triggered
 * - Supports "only one open at a time" via SwipeableRowProvider context
 * - Fully decoupled from any domain (food logs, exercises, etc.)
 * - Works on iOS and Android
 *
 * Uses the Animated-based Swipeable from react-native-gesture-handler
 * (no Reanimated dependency required).
 */
import React, { useRef, useCallback, useContext, createContext, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
} from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { Ionicons } from '@expo/vector-icons';
import { haptics } from '../hooks/useHaptics';
import { spacing, radius } from '../theme';

// ─── Context: ensures only one SwipeableRow is open at a time ─────────────────

type SwipeableRowContextValue = {
  register: (ref: React.RefObject<Swipeable | null>) => void;
  unregister: (ref: React.RefObject<Swipeable | null>) => void;
  closeAllExcept: (ref: React.RefObject<Swipeable | null>) => void;
};

const SwipeableRowContext = createContext<SwipeableRowContextValue | null>(null);

/**
 * Wrap a list of SwipeableRow items with this provider so that opening
 * one row automatically closes all other open rows.
 */
export function SwipeableRowProvider({ children }: { children: React.ReactNode }) {
  const openRefs = useRef<Set<React.RefObject<Swipeable | null>>>(new Set());

  const value = useMemo<SwipeableRowContextValue>(() => ({
    register: (ref) => {
      openRefs.current.add(ref);
    },
    unregister: (ref) => {
      openRefs.current.delete(ref);
    },
    closeAllExcept: (ref) => {
      openRefs.current.forEach((r) => {
        if (r !== ref && r.current) {
          r.current.close();
        }
      });
    },
  }), []);

  return (
    <SwipeableRowContext.Provider value={value}>
      {children}
    </SwipeableRowContext.Provider>
  );
}

// ─── Action configuration ─────────────────────────────────────────────────────

export interface SwipeAction {
  /** Ionicons icon name */
  icon: string;
  /** Label displayed below the icon */
  label: string;
  /** Background color of the action panel */
  color: string;
  /** Callback when the action is pressed */
  onPress: () => void;
  /** Accessibility label (defaults to `label` if not provided) */
  accessibilityLabel?: string;
}

// ─── Component props ──────────────────────────────────────────────────────────

const ACTION_WIDTH = 76;

interface SwipeableRowProps {
  children: React.ReactNode;
  /** Action revealed when swiping right (left panel). Typically "Edit". */
  leftAction?: SwipeAction;
  /** Action revealed when swiping left (right panel). Typically "Delete". */
  rightAction?: SwipeAction;
  /** Whether to fire haptic feedback when an action button is pressed (default: true) */
  hapticEnabled?: boolean;
  /** Optional accessibility hint for the entire row */
  accessibilityHint?: string;
  /** Optional callback invoked when the row starts opening */
  onSwipeOpen?: () => void;
}

export default function SwipeableRow({
  children,
  leftAction,
  rightAction,
  hapticEnabled = true,
  accessibilityHint,
  onSwipeOpen,
}: SwipeableRowProps) {
  const swipeableRef = useRef<Swipeable>(null);
  const ctx = useContext(SwipeableRowContext);

  // Register/unregister with the provider
  React.useEffect(() => {
    if (!ctx) return;
    ctx.register(swipeableRef);
    return () => ctx.unregister(swipeableRef);
  }, [ctx]);

  const closeSwipeable = useCallback(() => {
    swipeableRef.current?.close();
  }, []);

  const handleActionPress = useCallback((action: SwipeAction) => {
    closeSwipeable();
    if (hapticEnabled) {
      haptics.medium();
    }
    action.onPress();
  }, [closeSwipeable, hapticEnabled]);

  const handleSwipeableOpen = useCallback(() => {
    // Close all other open rows
    if (ctx) {
      ctx.closeAllExcept(swipeableRef);
    }
    if (hapticEnabled) {
      haptics.light();
    }
    onSwipeOpen?.();
  }, [ctx, hapticEnabled, onSwipeOpen]);

  // Left actions: revealed when swiping right (e.g. Edit)
  const renderLeftActions = useCallback(
    (progress: Animated.AnimatedInterpolation<number>) => {
      if (!leftAction) return null;

      const translateX = progress.interpolate({
        inputRange: [0, 1],
        outputRange: [-ACTION_WIDTH, 0],
        extrapolate: 'clamp',
      });
      const scale = progress.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0.6, 0.9, 1],
        extrapolate: 'clamp',
      });
      const opacity = progress.interpolate({
        inputRange: [0, 0.3, 1],
        outputRange: [0, 0.5, 1],
        extrapolate: 'clamp',
      });

      return (
        <Animated.View
          style={[
            styles.actionContainer,
            styles.leftAction,
            {
              backgroundColor: leftAction.color,
              transform: [{ translateX }, { scale }],
              opacity,
            },
          ]}
        >
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleActionPress(leftAction)}
            accessibilityLabel={leftAction.accessibilityLabel ?? leftAction.label}
            accessibilityRole="button"
          >
            <Ionicons name={leftAction.icon as any} size={22} color="#FFFFFF" />
            <Text style={styles.actionText}>{leftAction.label}</Text>
          </TouchableOpacity>
        </Animated.View>
      );
    },
    [leftAction, handleActionPress],
  );

  // Right actions: revealed when swiping left (e.g. Delete)
  const renderRightActions = useCallback(
    (progress: Animated.AnimatedInterpolation<number>) => {
      if (!rightAction) return null;

      const translateX = progress.interpolate({
        inputRange: [0, 1],
        outputRange: [ACTION_WIDTH, 0],
        extrapolate: 'clamp',
      });
      const scale = progress.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0.6, 0.9, 1],
        extrapolate: 'clamp',
      });
      const opacity = progress.interpolate({
        inputRange: [0, 0.3, 1],
        outputRange: [0, 0.5, 1],
        extrapolate: 'clamp',
      });

      return (
        <Animated.View
          style={[
            styles.actionContainer,
            styles.rightAction,
            {
              backgroundColor: rightAction.color,
              transform: [{ translateX }, { scale }],
              opacity,
            },
          ]}
        >
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleActionPress(rightAction)}
            accessibilityLabel={rightAction.accessibilityLabel ?? rightAction.label}
            accessibilityRole="button"
          >
            <Ionicons name={rightAction.icon as any} size={22} color="#FFFFFF" />
            <Text style={styles.actionText}>{rightAction.label}</Text>
          </TouchableOpacity>
        </Animated.View>
      );
    },
    [rightAction, handleActionPress],
  );

  return (
    <Swipeable
      ref={swipeableRef}
      renderLeftActions={leftAction ? renderLeftActions : undefined}
      renderRightActions={rightAction ? renderRightActions : undefined}
      leftThreshold={ACTION_WIDTH / 2}
      rightThreshold={ACTION_WIDTH / 2}
      overshootLeft={false}
      overshootRight={false}
      friction={2}
      useNativeAnimations
      onSwipeableOpen={handleSwipeableOpen}
      containerStyle={styles.swipeableContainer}
      childrenContainerStyle={styles.childrenContainer}
    >
      <View
        style={styles.itemWrapper}
        accessibilityHint={
          accessibilityHint ??
          (leftAction && rightAction
            ? `Desliza a la derecha para ${leftAction.label.toLowerCase()}, a la izquierda para ${rightAction.label.toLowerCase()}`
            : leftAction
              ? `Desliza a la derecha para ${leftAction.label.toLowerCase()}`
              : rightAction
                ? `Desliza a la izquierda para ${rightAction.label.toLowerCase()}`
                : undefined)
        }
      >
        {children}
      </View>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  swipeableContainer: {
    overflow: 'hidden',
    borderRadius: radius.sm,
    marginVertical: 1,
  },
  childrenContainer: {},
  itemWrapper: {},
  actionContainer: {
    width: ACTION_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
  },
  leftAction: {
    borderTopLeftRadius: radius.sm,
    borderBottomLeftRadius: radius.sm,
  },
  rightAction: {
    borderTopRightRadius: radius.sm,
    borderBottomRightRadius: radius.sm,
  },
  actionButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: spacing.xs,
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 3,
  },
});
