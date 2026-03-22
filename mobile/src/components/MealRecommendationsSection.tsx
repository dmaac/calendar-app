/**
 * MealRecommendationsSection — Horizontal carousel of meal recommendations.
 *
 * Header: "Que comer ahora" with restaurant icon + remaining macros summary.
 * Shows 3 MealRecommendationCards in a horizontal FlatList.
 * Loading skeleton while fetching. Empty state when no data.
 */
import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius } from '../theme';
import SkeletonLoader from './SkeletonLoader';
import MealRecommendationCard from './MealRecommendationCard';
import useRecommendations, { RecommendedMeal } from '../hooks/useRecommendations';

interface MealRecommendationsSectionProps {
  onRegisterMeal: (meal: RecommendedMeal) => void;
}

function RecommendationSkeleton() {
  return (
    <View style={skeletonStyles.row}>
      {[1, 2, 3].map((i) => (
        <View key={i} style={skeletonStyles.card}>
          <SkeletonLoader width={60} height={16} borderRadius={10} />
          <SkeletonLoader width="90%" height={18} />
          <SkeletonLoader width="70%" height={12} />
          <SkeletonLoader width="80%" height={12} />
          <View style={skeletonStyles.pillRow}>
            <SkeletonLoader width={50} height={16} borderRadius={10} />
            <SkeletonLoader width={50} height={16} borderRadius={10} />
            <SkeletonLoader width={50} height={16} borderRadius={10} />
          </View>
          <SkeletonLoader width={80} height={28} borderRadius={14} />
        </View>
      ))}
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  card: {
    width: 220,
    gap: spacing.sm,
    padding: spacing.md,
  },
  pillRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
});

const MealRecommendationsSection = React.memo(function MealRecommendationsSection({
  onRegisterMeal,
}: MealRecommendationsSectionProps) {
  const c = useThemeColors();
  const { meals, remaining, loading, error } = useRecommendations();

  const renderItem = useCallback(
    ({ item }: { item: RecommendedMeal }) => (
      <MealRecommendationCard
        meal={item}
        missingProtein={remaining.protein_g}
        onRegister={onRegisterMeal}
      />
    ),
    [remaining.protein_g, onRegisterMeal],
  );

  const keyExtractor = useCallback((item: RecommendedMeal) => String(item.id), []);

  if (error && meals.length === 0) return null;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="restaurant" size={18} color={c.accent} />
          <Text style={[styles.headerTitle, { color: c.black }]}>Que comer ahora</Text>
        </View>
      </View>

      {/* Remaining macros summary */}
      {!loading && remaining.calories > 0 && (
        <Text style={[styles.remainingSummary, { color: c.gray }]}>
          Te faltan {Math.round(remaining.calories)} kcal y {Math.round(remaining.protein_g)}g de proteina
        </Text>
      )}

      {/* Content */}
      {loading ? (
        <RecommendationSkeleton />
      ) : meals.length === 0 ? (
        <View style={[styles.emptyState, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
          <Ionicons name="restaurant-outline" size={28} color={c.grayLight} />
          <Text style={[styles.emptyText, { color: c.gray }]}>
            Registra una comida para ver recomendaciones
          </Text>
        </View>
      ) : (
        <FlatList
          data={meals.slice(0, 3)}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.list}
          snapToInterval={228}
          decelerationRate="fast"
        />
      )}
    </View>
  );
});

export default MealRecommendationsSection;

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerTitle: {
    ...typography.titleSm,
    fontSize: 16,
  },
  remainingSummary: {
    ...typography.caption,
    marginBottom: spacing.sm,
  },
  list: {
    paddingVertical: spacing.xs,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  emptyText: {
    ...typography.caption,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
});
