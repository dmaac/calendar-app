/**
 * MealCard -- Card displaying a meal with optional image thumbnail,
 * food name, calorie count, time, and macro pill badges.
 *
 * Designed as a self-contained, reusable card for meal lists, history views,
 * recommendations, and search results. Follows the same visual language as
 * FoodLogItem and MealRecommendationCard but in a standalone card format.
 *
 * Usage:
 *   <MealCard
 *     foodName="Pollo a la plancha con arroz"
 *     calories={520}
 *     proteinG={42}
 *     carbsG={48}
 *     fatsG={14}
 *     mealType="lunch"
 *     time="13:30"
 *     imageUrl="https://..."
 *     onPress={() => navigate('Detail', { id })}
 *   />
 */
import React from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius, shadows, mealColors } from '../theme';

interface MealCardProps {
  /** Name of the food/meal. */
  foodName: string;
  /** Total calories. */
  calories: number;
  /** Protein in grams. */
  proteinG: number;
  /** Carbohydrates in grams. */
  carbsG: number;
  /** Fat in grams. */
  fatsG: number;
  /** Meal type key (breakfast/lunch/dinner/snack). Used for icon and color. */
  mealType?: string;
  /** Display time string (e.g. "13:30"). */
  time?: string;
  /** Optional food image URL. When absent, a placeholder icon is shown. */
  imageUrl?: string | null;
  /** Callback when the card is pressed. When omitted, the card is not tappable. */
  onPress?: () => void;
  /** Accessibility label override. */
  accessibilityLabel?: string;
}

const THUMBNAIL_SIZE = 56;

const MealCard = React.memo(function MealCard({
  foodName,
  calories,
  proteinG,
  carbsG,
  fatsG,
  mealType,
  time,
  imageUrl,
  onPress,
  accessibilityLabel: a11yLabel,
}: MealCardProps) {
  const c = useThemeColors();
  const meal = mealType != null ? mealColors[mealType] : undefined;
  const mealIcon = meal?.icon ?? 'restaurant-outline';
  const mealColor = meal?.color ?? c.gray;

  const defaultA11y = `${foodName}, ${Math.round(calories)} kilocalorias, proteina ${Math.round(proteinG)} gramos, carbohidratos ${Math.round(carbsG)} gramos, grasas ${Math.round(fatsG)} gramos`;

  const content = (
    <View
      style={[styles.card, { backgroundColor: c.surface, borderColor: c.grayLight }]}
      accessibilityLabel={a11yLabel ?? defaultA11y}
    >
      {/* Thumbnail or placeholder */}
      {imageUrl != null && imageUrl.length > 0 ? (
        <Image
          source={{ uri: imageUrl }}
          style={styles.thumbnail}
          accessibilityLabel={`Foto de ${foodName}`}
        />
      ) : (
        <View style={[styles.placeholder, { backgroundColor: mealColor + '18' }]}>
          <Ionicons name={mealIcon as any} size={24} color={mealColor} />
        </View>
      )}

      {/* Info section */}
      <View style={styles.info}>
        <Text style={[styles.foodName, { color: c.black }]} numberOfLines={1}>
          {foodName}
        </Text>

        {/* Meta row: time and meal type */}
        {(time != null || meal != null) && (
          <View style={styles.metaRow}>
            {time != null && (
              <View style={styles.metaItem}>
                <Ionicons name="time-outline" size={12} color={c.gray} />
                <Text style={[styles.metaText, { color: c.gray }]}>{time}</Text>
              </View>
            )}
            {meal != null && (
              <View style={styles.metaItem}>
                <Ionicons name={mealIcon as any} size={12} color={mealColor} />
                <Text style={[styles.metaText, { color: mealColor }]}>{meal.label}</Text>
              </View>
            )}
          </View>
        )}

        {/* Macro pills */}
        <View style={styles.macroRow}>
          <View style={[styles.pill, { backgroundColor: c.protein + '20' }]}>
            <Text style={[styles.pillText, { color: c.protein }]}>P {Math.round(proteinG)}g</Text>
          </View>
          <View style={[styles.pill, { backgroundColor: c.carbs + '20' }]}>
            <Text style={[styles.pillText, { color: c.carbs }]}>C {Math.round(carbsG)}g</Text>
          </View>
          <View style={[styles.pill, { backgroundColor: c.fats + '20' }]}>
            <Text style={[styles.pillText, { color: c.fats }]}>G {Math.round(fatsG)}g</Text>
          </View>
        </View>
      </View>

      {/* Calorie display */}
      <View style={styles.calorieSection}>
        <Text style={[styles.calorieValue, { color: c.black }]}>{Math.round(calories)}</Text>
        <Text style={[styles.calorieUnit, { color: c.gray }]}>kcal</Text>
      </View>
    </View>
  );

  if (onPress != null) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityHint={`Ver detalle de ${foodName}`}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return content;
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm + 2,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    ...shadows.sm,
  },
  thumbnail: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    borderRadius: radius.md,
  },
  placeholder: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: 3,
  },
  foodName: {
    ...typography.bodyMd,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metaText: {
    ...typography.caption,
    fontSize: 11,
  },
  macroRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  pill: {
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 1,
    borderRadius: radius.full,
  },
  pillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  calorieSection: {
    alignItems: 'flex-end',
    gap: 1,
    minWidth: 44,
  },
  calorieValue: {
    ...typography.label,
    fontSize: 16,
  },
  calorieUnit: {
    ...typography.caption,
    fontSize: 10,
  },
});

export default MealCard;
