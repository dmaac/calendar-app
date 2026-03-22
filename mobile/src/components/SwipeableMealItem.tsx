/**
 * SwipeableMealItem -- Swipe-to-reveal actions for food log items.
 *
 * Swipe left  -> red "Eliminar" button
 * Swipe right -> blue "Editar" button
 *
 * Uses the Animated-based Swipeable from react-native-gesture-handler
 * (no Reanimated dependency required).
 */
import React, { useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
} from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, spacing, radius } from '../theme';

const ACTION_WIDTH = 72;

interface SwipeableMealItemProps {
  children: React.ReactNode;
  onEdit: () => void;
  onDelete: () => void;
  /** Optional accessibility label for the item */
  accessibilityLabel?: string;
}

export default function SwipeableMealItem({
  children,
  onEdit,
  onDelete,
  accessibilityLabel,
}: SwipeableMealItemProps) {
  const c = useThemeColors();
  const swipeableRef = useRef<Swipeable>(null);

  const closeSwipeable = useCallback(() => {
    swipeableRef.current?.close();
  }, []);

  const handleEdit = useCallback(() => {
    closeSwipeable();
    onEdit();
  }, [onEdit, closeSwipeable]);

  const handleDelete = useCallback(() => {
    closeSwipeable();
    onDelete();
  }, [onDelete, closeSwipeable]);

  // Left actions: Edit button (revealed when swiping right)
  const renderLeftActions = useCallback(
    (progress: Animated.AnimatedInterpolation<number>) => {
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

      return (
        <Animated.View
          style={[
            styles.actionContainer,
            styles.leftAction,
            {
              backgroundColor: c.accent,
              transform: [{ translateX }, { scale }],
            },
          ]}
        >
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleEdit}
            accessibilityLabel="Editar alimento"
            accessibilityRole="button"
          >
            <Ionicons name="create-outline" size={20} color="#FFFFFF" />
            <Text style={styles.actionText}>Editar</Text>
          </TouchableOpacity>
        </Animated.View>
      );
    },
    [c.accent, handleEdit],
  );

  // Right actions: Delete button (revealed when swiping left)
  const renderRightActions = useCallback(
    (progress: Animated.AnimatedInterpolation<number>) => {
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

      return (
        <Animated.View
          style={[
            styles.actionContainer,
            styles.rightAction,
            {
              backgroundColor: '#EF4444',
              transform: [{ translateX }, { scale }],
            },
          ]}
        >
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleDelete}
            accessibilityLabel="Eliminar alimento"
            accessibilityRole="button"
          >
            <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
            <Text style={styles.actionText}>Eliminar</Text>
          </TouchableOpacity>
        </Animated.View>
      );
    },
    [handleDelete],
  );

  return (
    <Swipeable
      ref={swipeableRef}
      renderLeftActions={renderLeftActions}
      renderRightActions={renderRightActions}
      leftThreshold={ACTION_WIDTH / 2}
      rightThreshold={ACTION_WIDTH / 2}
      overshootLeft={false}
      overshootRight={false}
      friction={2}
      useNativeAnimations
      containerStyle={styles.swipeableContainer}
      childrenContainerStyle={styles.childrenContainer}
    >
      <View
        style={[styles.itemWrapper, { backgroundColor: c.surface }]}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint="Desliza a la derecha para editar, a la izquierda para eliminar"
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
  childrenContainer: {
    // Ensure the foreground content fills its container
  },
  itemWrapper: {
    // The foreground surface that sits on top of the actions
  },
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
    marginTop: 2,
  },
});
