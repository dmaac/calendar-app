/**
 * FoodLogItem -- Renders a single food log entry wrapped in a SwipeableRow.
 *
 * Swipe left  -> "Eliminar" with confirmation dialog
 * Swipe right -> "Editar" navigates to EditFood screen
 *
 * Features:
 * - Animated exit (height collapse + fade) when item is deleted
 * - Haptic feedback on both swipe actions
 * - Displays food name, calories, macros (P/C/G)
 * - Favorite heart toggle
 * - Consistent with the Fitsi IA design system
 */
import React, { useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Animated,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SwipeableRow, { SwipeAction } from './SwipeableRow';
import { useThemeColors, typography, spacing } from '../theme';
import { haptics } from '../hooks/useHaptics';
import { AIFoodLog } from '../types';

interface FoodLogItemProps {
  log: AIFoodLog;
  /** Called after user confirms deletion */
  onDelete: (log: AIFoodLog) => void;
  /** Called when user taps Edit (or swipes to edit) */
  onEdit: (log: AIFoodLog) => void;
  /** Called when user taps the heart icon */
  onToggleFavorite?: (log: AIFoodLog) => void;
  /** Whether this item is currently a favorite */
  isFavorite?: boolean;
  /** Theme color for the surface background */
  surfaceColor?: string;
  /** Theme color for border */
  borderColor?: string;
}

export default function FoodLogItem({
  log,
  onDelete,
  onEdit,
  onToggleFavorite,
  isFavorite = false,
  surfaceColor,
  borderColor,
}: FoodLogItemProps) {
  const c = useThemeColors();
  const surface = surfaceColor ?? c.surface;
  const border = borderColor ?? c.grayLight;

  // Animated values for exit animation
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const heightAnim = useRef(new Animated.Value(1)).current;

  const animateExit = useCallback((callback: () => void) => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: false, // height animation requires layout, can't use native driver
      }),
      Animated.timing(heightAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: false,
      }),
    ]).start(() => {
      callback();
    });
  }, [fadeAnim, heightAnim]);

  const handleDelete = useCallback(() => {
    haptics.heavy();
    Alert.alert(
      'Eliminar registro',
      `Eliminar "${log.food_name}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            haptics.success();
            animateExit(() => onDelete(log));
          },
        },
      ],
    );
  }, [log, onDelete, animateExit]);

  const handleEdit = useCallback(() => {
    onEdit(log);
  }, [log, onEdit]);

  const handleToggleFavorite = useCallback(() => {
    haptics.light();
    onToggleFavorite?.(log);
  }, [log, onToggleFavorite]);

  const leftAction: SwipeAction = {
    icon: 'create-outline',
    label: 'Editar',
    color: c.accent,
    onPress: handleEdit,
    accessibilityLabel: `Editar ${log.food_name}`,
  };

  const rightAction: SwipeAction = {
    icon: 'trash-outline',
    label: 'Eliminar',
    color: c.protein,
    onPress: handleDelete,
    accessibilityLabel: `Eliminar ${log.food_name}`,
  };

  // Interpolate max height for the exit animation
  // We use a scale of 0..1 mapped to 0..80 (a generous max for a food row)
  const animatedMaxHeight = heightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 80],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View
      style={{
        opacity: fadeAnim,
        maxHeight: animatedMaxHeight,
        overflow: 'hidden',
      }}
    >
      <SwipeableRow
        leftAction={leftAction}
        rightAction={rightAction}
        accessibilityHint={`${log.food_name}, ${Math.round(log.calories)} kilocalorias. Desliza a la derecha para editar, a la izquierda para eliminar`}
      >
        <View
          style={[styles.foodRow, { backgroundColor: surface, borderTopColor: border }]}
          accessibilityLabel={`${log.food_name}, ${Math.round(log.calories)} kilocalorias, proteina ${Math.round(log.protein_g)} gramos, carbohidratos ${Math.round(log.carbs_g)} gramos, grasas ${Math.round(log.fats_g)} gramos`}
        >
          <View style={styles.foodInfo}>
            <Text style={[styles.foodName, { color: c.black }]} numberOfLines={1} allowFontScaling>
              {log.food_name}
            </Text>
            <View style={styles.macroPills} importantForAccessibility="no-hide-descendants">
              <Text style={[styles.macroPill, { color: c.protein }]} allowFontScaling>
                P {Math.round(log.protein_g)}g
              </Text>
              <Text style={[styles.macroPill, { color: c.carbs }]} allowFontScaling>
                C {Math.round(log.carbs_g)}g
              </Text>
              <Text style={[styles.macroPill, { color: c.fats }]} allowFontScaling>
                G {Math.round(log.fats_g)}g
              </Text>
            </View>
          </View>

          {onToggleFavorite && (
            <TouchableOpacity
              style={styles.favHeart}
              onPress={handleToggleFavorite}
              accessibilityLabel={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
              accessibilityRole="button"
            >
              <Ionicons
                name={isFavorite ? 'heart' : 'heart-outline'}
                size={18}
                color="#EF4444"
              />
            </TouchableOpacity>
          )}

          <View style={styles.foodRight} importantForAccessibility="no-hide-descendants">
            <Text style={[styles.foodKcal, { color: c.black }]} allowFontScaling>
              {Math.round(log.calories)}
            </Text>
            <Text style={[styles.foodKcalUnit, { color: c.gray }]} allowFontScaling>kcal</Text>
          </View>
        </View>
      </SwipeableRow>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm,
    borderTopWidth: 1,
    minHeight: 52,
  },
  foodInfo: {
    flex: 1,
  },
  foodName: {
    ...typography.bodyMd,
    marginBottom: 2,
  },
  macroPills: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  macroPill: {
    ...typography.caption,
    fontWeight: '600',
  },
  favHeart: {
    padding: 4,
    marginRight: 4,
  },
  foodRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  foodKcal: {
    ...typography.label,
    fontSize: 15,
  },
  foodKcalUnit: {
    ...typography.caption,
  },
});
