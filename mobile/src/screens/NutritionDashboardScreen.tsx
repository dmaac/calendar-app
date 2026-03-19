import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { ProgressBar, FAB } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { DailySummary, MealLog } from '../types';
import ApiService from '../services/api';
import CircularProgress from '../components/CircularProgress';
import { theme } from '../theme';

interface NutritionDashboardScreenProps {
  navigation: any;
}

const NutritionDashboardScreen: React.FC<NutritionDashboardScreenProps> = ({ navigation }) => {
  const { user } = useAuth();
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [meals, setMeals] = useState<MealLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  useFocusEffect(
    useCallback(() => {
      fetchDashboardData();
    }, [])
  );

  const fetchDashboardData = async () => {
    setIsLoading(true);
    try {
      const [summaryData, mealsData] = await Promise.all([
        ApiService.getDailySummary(today),
        ApiService.getMeals(today),
      ]);
      setSummary(summaryData);
      setMeals(mealsData);
    } catch (error: any) {
      if (error?.response?.status !== 404) {
        console.error('Error fetching dashboard data:', error);
      }
      if (!summary) {
        setSummary({
          date: today,
          total_calories: 0,
          total_protein_g: 0,
          total_carbs_g: 0,
          total_fats_g: 0,
          target_calories: 2000,
          target_protein_g: 150,
          target_carbs_g: 250,
          target_fats_g: 65,
          water_ml: 0,
          meals_logged: 0,
          streak_days: 0,
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteMeal = (mealId: number) => {
    Alert.alert(
      'Delete Meal',
      'Are you sure you want to remove this meal?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await ApiService.deleteMeal(mealId);
              fetchDashboardData();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete meal');
            }
          },
        },
      ]
    );
  };

  const getCalorieRingColor = (current: number, target: number): string => {
    const ratio = target > 0 ? current / target : 0;
    if (ratio > 1.0) return theme.colors.danger;
    if (ratio > 0.85) return theme.colors.warning;
    return theme.colors.primary;
  };

  const getProgressValue = (current: number, target: number): number => {
    if (target <= 0) return 0;
    return Math.min(current / target, 1.0);
  };

  const getMealTypeLabel = (mealType: string): string => {
    return mealType.charAt(0).toUpperCase() + mealType.slice(1);
  };

  const getMealTypeColor = (mealType: string): string => {
    switch (mealType) {
      case 'breakfast': return theme.colors.warning;
      case 'lunch': return theme.colors.primary;
      case 'dinner': return '#6366F1';
      case 'snack': return '#EC4899';
      default: return theme.colors.primary;
    }
  };

  const getMealTypeIcon = (mealType: string): string => {
    switch (mealType) {
      case 'breakfast': return 'sunny-outline';
      case 'lunch': return 'restaurant-outline';
      case 'dinner': return 'moon-outline';
      case 'snack': return 'cafe-outline';
      default: return 'restaurant-outline';
    }
  };

  const caloriesConsumed = summary?.total_calories ?? 0;
  const caloriesTarget = summary?.target_calories ?? 2000;
  const caloriesRemaining = Math.max(0, caloriesTarget - caloriesConsumed);

  const proteinCurrent = summary?.total_protein ?? 0;
  const proteinTarget = summary?.target_protein ?? 150;
  const carbsCurrent = summary?.total_carbs ?? 0;
  const carbsTarget = summary?.target_carbs ?? 250;
  const fatCurrent = summary?.total_fat ?? 0;
  const fatTarget = summary?.target_fat ?? 65;

  const userName = user?.first_name || 'there';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerGreeting}>Hello, {userName}</Text>
          <Text style={styles.headerDate}>
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'short',
              day: 'numeric',
            })}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate('NutritionProfile')}
          style={styles.profileButton}
        >
          <Ionicons name="person-circle-outline" size={30} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Calorie Ring Hero */}
        <View style={styles.calorieCard}>
          <Text style={styles.cardTitle}>Calories Today</Text>
          <View style={styles.calorieRingContainer}>
            <CircularProgress
              size={180}
              strokeWidth={14}
              progress={getProgressValue(caloriesConsumed, caloriesTarget)}
              color={getCalorieRingColor(caloriesConsumed, caloriesTarget)}
              backgroundColor="#F3F4F6"
            >
              <Text style={[styles.calorieNumber, { color: getCalorieRingColor(caloriesConsumed, caloriesTarget) }]}>
                {Math.round(caloriesConsumed)}
              </Text>
              <Text style={styles.calorieTargetText}>/ {Math.round(caloriesTarget)} kcal</Text>
            </CircularProgress>
          </View>
          <Text style={styles.calorieRemaining}>
            {Math.round(caloriesRemaining)} kcal remaining
          </Text>
        </View>

        {/* Macro Mini Rings */}
        <View style={styles.macroCard}>
          <Text style={styles.cardTitle}>Macros</Text>
          <View style={styles.macroRingsRow}>
            {/* Protein */}
            <View style={styles.macroRingItem}>
              <CircularProgress
                size={70}
                strokeWidth={6}
                progress={getProgressValue(proteinCurrent, proteinTarget)}
                color={theme.colors.protein}
                backgroundColor={theme.colors.proteinLight}
              >
                <Text style={[styles.macroRingValue, { color: theme.colors.protein }]}>
                  {Math.round(proteinCurrent)}g
                </Text>
              </CircularProgress>
              <Text style={styles.macroRingLabel}>Protein</Text>
              <Text style={styles.macroRingTarget}>/ {Math.round(proteinTarget)}g</Text>
            </View>

            {/* Carbs */}
            <View style={styles.macroRingItem}>
              <CircularProgress
                size={70}
                strokeWidth={6}
                progress={getProgressValue(carbsCurrent, carbsTarget)}
                color={theme.colors.carbs}
                backgroundColor={theme.colors.carbsLight}
              >
                <Text style={[styles.macroRingValue, { color: theme.colors.carbs }]}>
                  {Math.round(carbsCurrent)}g
                </Text>
              </CircularProgress>
              <Text style={styles.macroRingLabel}>Carbs</Text>
              <Text style={styles.macroRingTarget}>/ {Math.round(carbsTarget)}g</Text>
            </View>

            {/* Fat */}
            <View style={styles.macroRingItem}>
              <CircularProgress
                size={70}
                strokeWidth={6}
                progress={getProgressValue(fatCurrent, fatTarget)}
                color={theme.colors.fat}
                backgroundColor={theme.colors.fatLight}
              >
                <Text style={[styles.macroRingValue, { color: theme.colors.fat }]}>
                  {Math.round(fatCurrent)}g
                </Text>
              </CircularProgress>
              <Text style={styles.macroRingLabel}>Fat</Text>
              <Text style={styles.macroRingTarget}>/ {Math.round(fatTarget)}g</Text>
            </View>
          </View>
        </View>

        {/* Water Card */}
        <View style={styles.waterCard}>
          <View style={styles.waterHeader}>
            <View style={styles.waterTitleRow}>
              <Ionicons name="water-outline" size={20} color={theme.colors.water} />
              <Text style={styles.waterLabel}>Water Intake</Text>
            </View>
            <Text style={styles.waterValue}>
              {Math.round((summary?.water_ml ?? 0) / 1000 * 10) / 10}L / 2.5L
            </Text>
          </View>
          <ProgressBar
            progress={Math.min((summary?.water_ml ?? 0) / 2500, 1.0)}
            color={theme.colors.water}
            style={styles.waterProgressBar}
          />
          <View style={styles.waterButtons}>
            {[250, 500].map((ml) => (
              <TouchableOpacity
                key={ml}
                style={styles.waterPillButton}
                onPress={async () => {
                  try {
                    const newWater = (summary?.water_ml ?? 0) + ml;
                    await ApiService.updateWater(today, newWater);
                    fetchDashboardData();
                  } catch (error) {
                    Alert.alert('Error', 'Failed to update water intake');
                  }
                }}
              >
                <Ionicons name="add" size={14} color={theme.colors.water} />
                <Text style={styles.waterPillText}>{ml}ml</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Today's Meals */}
        <View style={styles.mealsSection}>
          <Text style={styles.cardTitle}>Today's Meals</Text>
          {meals.length === 0 ? (
            <View style={styles.emptyMealCard}>
              <Ionicons name="restaurant-outline" size={36} color={theme.colors.textLight} />
              <Text style={styles.emptyMealText}>No meals logged today</Text>
              <Text style={styles.emptyMealSubtext}>
                Tap the + button to log your first meal
              </Text>
            </View>
          ) : (
            meals.map((meal) => (
              <View key={meal.id} style={styles.mealCard}>
                <View style={styles.mealContent}>
                  <View style={styles.mealTopRow}>
                    <View style={styles.mealLeft}>
                      <Ionicons
                        name={getMealTypeIcon(meal.meal_type) as any}
                        size={20}
                        color={getMealTypeColor(meal.meal_type)}
                      />
                      <View style={styles.mealInfo}>
                        <Text style={styles.mealFoodName}>{meal.food_name || 'Unknown food'}</Text>
                        <View style={styles.mealMeta}>
                          <Text style={[styles.mealTypeLabel, { color: getMealTypeColor(meal.meal_type) }]}>
                            {getMealTypeLabel(meal.meal_type)}
                          </Text>
                          <Text style={styles.mealDot}>·</Text>
                          <Text style={styles.mealServings}>
                            {meal.servings} serving{meal.servings !== 1 ? 's' : ''}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View style={styles.mealRight}>
                      <Text style={styles.mealCalories}>{Math.round(meal.total_calories)} kcal</Text>
                      <TouchableOpacity onPress={() => handleDeleteMeal(meal.id)}>
                        <Ionicons name="trash-outline" size={16} color={theme.colors.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={styles.mealMacros}>
                    <View style={[styles.macroBadge, { backgroundColor: theme.colors.proteinLight }]}>
                      <Text style={[styles.macroBadgeText, { color: theme.colors.protein }]}>P {Math.round(meal.total_protein)}g</Text>
                    </View>
                    <View style={[styles.macroBadge, { backgroundColor: theme.colors.carbsLight }]}>
                      <Text style={[styles.macroBadgeText, { color: theme.colors.carbs }]}>C {Math.round(meal.total_carbs)}g</Text>
                    </View>
                    <View style={[styles.macroBadge, { backgroundColor: theme.colors.fatLight }]}>
                      <Text style={[styles.macroBadgeText, { color: theme.colors.fat }]}>F {Math.round(meal.total_fat)}g</Text>
                    </View>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Spacer for FAB */}
        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Floating Action Button */}
      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() => navigation.navigate('MealLog')}
        color="#fff"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 20,
    paddingVertical: 18,
    paddingTop: 54,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerGreeting: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  headerDate: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  profileButton: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Calorie Ring Card
  calorieCard: {
    ...theme.card,
    padding: 24,
    marginBottom: 16,
  },
  calorieRingContainer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  calorieNumber: {
    fontSize: 36,
    fontWeight: 'bold',
    fontVariant: ['tabular-nums'],
  },
  calorieTargetText: {
    fontSize: 13,
    color: theme.colors.textLight,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  calorieRemaining: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '300',
  },
  // Macro Card
  macroCard: {
    ...theme.card,
    padding: 24,
    marginBottom: 16,
  },
  macroRingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
  },
  macroRingItem: {
    alignItems: 'center',
  },
  macroRingValue: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  macroRingLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text,
    marginTop: 8,
  },
  macroRingTarget: {
    fontSize: 11,
    color: theme.colors.textLight,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  // Water Card
  waterCard: {
    ...theme.card,
    padding: 18,
    marginBottom: 16,
  },
  waterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  waterTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  waterLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text,
  },
  waterValue: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  waterProgressBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F3F4F6',
  },
  waterButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  waterPillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 4,
  },
  waterPillText: {
    color: theme.colors.water,
    fontSize: 13,
    fontWeight: '600',
  },
  // Meals Section
  mealsSection: {
    marginTop: 4,
  },
  emptyMealCard: {
    ...theme.card,
    padding: 32,
    alignItems: 'center',
  },
  emptyMealText: {
    fontSize: 15,
    color: theme.colors.textSecondary,
    marginTop: 12,
    fontWeight: '500',
  },
  emptyMealSubtext: {
    fontSize: 13,
    color: theme.colors.textLight,
    marginTop: 4,
    fontWeight: '300',
  },
  mealCard: {
    ...theme.card,
    marginBottom: 10,
    overflow: 'hidden',
  },
  mealContent: {
    padding: 14,
  },
  mealTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  mealLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    gap: 10,
  },
  mealInfo: {
    flex: 1,
  },
  mealFoodName: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 3,
  },
  mealMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mealTypeLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  mealDot: {
    fontSize: 12,
    color: theme.colors.textLight,
  },
  mealServings: {
    fontSize: 12,
    color: theme.colors.textLight,
  },
  mealRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  mealCalories: {
    fontSize: 15,
    fontWeight: 'bold',
    color: theme.colors.text,
    fontVariant: ['tabular-nums'],
  },
  mealMacros: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
    paddingLeft: 30,
  },
  macroBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  macroBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    backgroundColor: theme.colors.primary,
    borderRadius: 28,
  },
});

export default NutritionDashboardScreen;
