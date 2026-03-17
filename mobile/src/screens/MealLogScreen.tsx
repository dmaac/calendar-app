import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { TextInput } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { MealType, Food, MealLogCreate } from '../types';
import ApiService from '../services/api';
import CircularProgress from '../components/CircularProgress';
import { theme } from '../theme';

interface MealLogScreenProps {
  navigation: any;
  route: any;
}

const MEAL_TYPES: { label: string; value: MealType; icon: string; color: string }[] = [
  { label: 'Breakfast', value: 'breakfast', icon: 'sunny-outline', color: '#F59E0B' },
  { label: 'Lunch', value: 'lunch', icon: 'restaurant-outline', color: '#10B981' },
  { label: 'Dinner', value: 'dinner', icon: 'moon-outline', color: '#6366F1' },
  { label: 'Snack', value: 'snack', icon: 'cafe-outline', color: '#EC4899' },
];

const MealLogScreen: React.FC<MealLogScreenProps> = ({ navigation, route }) => {
  const [selectedMealType, setSelectedMealType] = useState<MealType>('breakfast');
  const [selectedFood, setSelectedFood] = useState<Food | null>(
    route.params?.selectedFood || null
  );
  const [servings, setServings] = useState('1');
  const [isLoading, setIsLoading] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  const handleSaveMeal = async () => {
    if (!selectedFood) {
      Alert.alert('Error', 'Please select a food item');
      return;
    }

    const servingsNum = parseFloat(servings);
    if (isNaN(servingsNum) || servingsNum <= 0) {
      Alert.alert('Error', 'Please enter a valid number of servings');
      return;
    }

    setIsLoading(true);
    try {
      const mealData: MealLogCreate = {
        date: today,
        meal_type: selectedMealType,
        food_id: selectedFood.id,
        servings: servingsNum,
      };

      await ApiService.logMeal(mealData);
      Alert.alert('Success', 'Meal logged successfully!', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error: any) {
      console.error('Error logging meal:', error);
      const errorMessage = error?.response?.data?.detail || 'Failed to log meal';
      Alert.alert('Error', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const calculatedCalories = selectedFood
    ? Math.round(selectedFood.calories * parseFloat(servings || '0'))
    : 0;
  const calculatedProtein = selectedFood
    ? Math.round(selectedFood.protein_g * parseFloat(servings || '0') * 10) / 10
    : 0;
  const calculatedCarbs = selectedFood
    ? Math.round(selectedFood.carbs_g * parseFloat(servings || '0') * 10) / 10
    : 0;
  const calculatedFat = selectedFood
    ? Math.round(selectedFood.fat_g * parseFloat(servings || '0') * 10) / 10
    : 0;

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Log Meal</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.content}>
        {/* Meal Type Selection */}
        <Text style={styles.label}>Meal Type</Text>
        <View style={styles.mealTypeRow}>
          {MEAL_TYPES.map((type) => {
            const isSelected = selectedMealType === type.value;
            return (
              <TouchableOpacity
                key={type.value}
                style={[
                  styles.mealTypeButton,
                  isSelected && { borderColor: type.color, backgroundColor: type.color },
                  !isSelected && { borderColor: theme.colors.border },
                ]}
                onPress={() => setSelectedMealType(type.value)}
              >
                <Ionicons
                  name={type.icon as any}
                  size={18}
                  color={isSelected ? '#fff' : type.color}
                />
                <Text
                  style={[
                    styles.mealTypeText,
                    { color: isSelected ? '#fff' : type.color },
                  ]}
                >
                  {type.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Food Selection */}
        <Text style={styles.label}>Food</Text>
        <TouchableOpacity
          style={styles.foodSelector}
          onPress={() =>
            navigation.navigate('FoodSearch', {
              onSelectFood: (food: Food) => {
                setSelectedFood(food);
              },
            })
          }
        >
          {selectedFood ? (
            <View style={styles.selectedFoodRow}>
              <View style={styles.selectedFoodInfo}>
                <Text style={styles.selectedFoodName}>{selectedFood.name}</Text>
                <Text style={styles.selectedFoodBrand}>
                  {selectedFood.brand || 'Generic'} - {selectedFood.calories} kcal per {selectedFood.serving_size}{selectedFood.serving_unit}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textLight} />
            </View>
          ) : (
            <View style={styles.foodPlaceholderRow}>
              <Ionicons name="search-outline" size={20} color={theme.colors.textLight} />
              <Text style={styles.foodPlaceholder}>Search and select a food</Text>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textLight} />
            </View>
          )}
        </TouchableOpacity>

        {/* Servings */}
        <Text style={styles.label}>
          Servings {selectedFood ? `(1 serving = ${selectedFood.serving_size}${selectedFood.serving_unit})` : ''}
        </Text>
        <TextInput
          mode="outlined"
          value={servings}
          onChangeText={setServings}
          keyboardType="decimal-pad"
          style={styles.servingsInput}
          outlineColor={theme.colors.border}
          activeOutlineColor={theme.colors.primary}
          outlineStyle={{ borderRadius: 12 }}
        />

        {/* Nutrition Preview */}
        {selectedFood && (
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>Nutrition Summary</Text>
            <View style={styles.previewGrid}>
              <View style={styles.previewItem}>
                <CircularProgress
                  size={56}
                  strokeWidth={5}
                  progress={Math.min(calculatedCalories / 800, 1)}
                  color={theme.colors.primary}
                  backgroundColor="#F3F4F6"
                >
                  <Text style={[styles.ringValue, { color: theme.colors.primary }]}>{calculatedCalories}</Text>
                </CircularProgress>
                <Text style={styles.previewLabel}>Calories</Text>
              </View>
              <View style={styles.previewItem}>
                <CircularProgress
                  size={56}
                  strokeWidth={5}
                  progress={Math.min(calculatedProtein / 50, 1)}
                  color={theme.colors.protein}
                  backgroundColor={theme.colors.proteinLight}
                >
                  <Text style={[styles.ringValue, { color: theme.colors.protein }]}>{calculatedProtein}g</Text>
                </CircularProgress>
                <Text style={styles.previewLabel}>Protein</Text>
              </View>
              <View style={styles.previewItem}>
                <CircularProgress
                  size={56}
                  strokeWidth={5}
                  progress={Math.min(calculatedCarbs / 80, 1)}
                  color={theme.colors.carbs}
                  backgroundColor={theme.colors.carbsLight}
                >
                  <Text style={[styles.ringValue, { color: theme.colors.carbs }]}>{calculatedCarbs}g</Text>
                </CircularProgress>
                <Text style={styles.previewLabel}>Carbs</Text>
              </View>
              <View style={styles.previewItem}>
                <CircularProgress
                  size={56}
                  strokeWidth={5}
                  progress={Math.min(calculatedFat / 30, 1)}
                  color={theme.colors.fat}
                  backgroundColor={theme.colors.fatLight}
                >
                  <Text style={[styles.ringValue, { color: theme.colors.fat }]}>{calculatedFat}g</Text>
                </CircularProgress>
                <Text style={styles.previewLabel}>Fat</Text>
              </View>
            </View>
          </View>
        )}

        {/* Save Button */}
        <TouchableOpacity
          style={[
            styles.saveButton,
            (!selectedFood || isLoading) && styles.saveButtonDisabled,
          ]}
          onPress={handleSaveMeal}
          disabled={isLoading || !selectedFood}
          activeOpacity={0.8}
        >
          <Text style={styles.saveButtonText}>
            {isLoading ? 'Saving...' : 'Log Meal'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
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
    paddingVertical: 15,
    paddingTop: 54,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  placeholder: {
    width: 32,
  },
  content: {
    padding: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: 10,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  mealTypeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 22,
  },
  mealTypeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 22,
    borderWidth: 1,
    gap: 6,
  },
  mealTypeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  foodSelector: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: 16,
    marginBottom: 22,
  },
  selectedFoodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectedFoodInfo: {
    flex: 1,
  },
  selectedFoodName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 2,
  },
  selectedFoodBrand: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  foodPlaceholderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  foodPlaceholder: {
    flex: 1,
    fontSize: 15,
    color: theme.colors.textLight,
  },
  servingsInput: {
    backgroundColor: theme.colors.surface,
    marginBottom: 22,
  },
  previewCard: {
    ...theme.card,
    padding: 18,
    marginBottom: 24,
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  previewGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  previewItem: {
    alignItems: 'center',
  },
  ringValue: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  previewLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 6,
    fontWeight: '400',
  },
  saveButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: theme.colors.primaryLight,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold',
  },
});

export default MealLogScreen;
