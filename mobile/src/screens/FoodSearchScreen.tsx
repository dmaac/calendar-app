import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { Searchbar } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { Food } from '../types';
import ApiService from '../services/api';
import { theme } from '../theme';

interface FoodSearchScreenProps {
  navigation: any;
  route: any;
}

const getCategoryColor = (food: Food): string => {
  if (food.protein_g >= 20) return theme.colors.protein;
  if (food.carbs_g >= 30) return theme.colors.carbs;
  if (food.fat_g >= 15) return theme.colors.fat;
  return theme.colors.primary;
};

const FoodSearchScreen: React.FC<FoodSearchScreenProps> = ({ navigation, route }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [foods, setFoods] = useState<Food[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const onSelectFood = route.params?.onSelectFood;

  useEffect(() => {
    fetchFoods();
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchFoods(searchQuery);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const fetchFoods = async (query?: string) => {
    setIsLoading(true);
    try {
      const results = await ApiService.searchFoods(query || undefined);
      setFoods(results);
    } catch (error) {
      console.error('Error searching foods:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectFood = (food: Food) => {
    if (onSelectFood) {
      onSelectFood(food);
    }
    navigation.goBack();
  };

  const renderFoodItem = ({ item }: { item: Food }) => (
    <TouchableOpacity onPress={() => handleSelectFood(item)}>
      <View style={styles.foodCard}>
        <View style={styles.foodCardContent}>
          <View style={styles.foodRow}>
            <View style={styles.foodInfo}>
              <View style={styles.foodNameRow}>
                <Text style={styles.foodName}>{item.name}</Text>
                {item.is_verified && (
                  <View style={styles.verifiedBadge}>
                    <Ionicons name="checkmark-circle-outline" size={14} color={theme.colors.primary} />
                    <Text style={styles.verifiedText}>Verified</Text>
                  </View>
                )}
              </View>
              <Text style={styles.foodBrand}>
                {item.brand || 'Generic'} - {item.serving_size}{item.serving_unit}
              </Text>
              <View style={styles.macroBadgeRow}>
                <View style={[styles.macroPill, { backgroundColor: theme.colors.proteinLight }]}>
                  <Text style={[styles.macroPillText, { color: theme.colors.protein }]}>P {item.protein_g}g</Text>
                </View>
                <View style={[styles.macroPill, { backgroundColor: theme.colors.carbsLight }]}>
                  <Text style={[styles.macroPillText, { color: theme.colors.carbs }]}>C {item.carbs_g}g</Text>
                </View>
                <View style={[styles.macroPill, { backgroundColor: theme.colors.fatLight }]}>
                  <Text style={[styles.macroPillText, { color: theme.colors.fat }]}>F {item.fat_g}g</Text>
                </View>
              </View>
            </View>
            <View style={styles.foodCalories}>
              <Text style={styles.calorieNumber}>{Math.round(item.calories)}</Text>
              <Text style={styles.calorieLabel}>kcal</Text>
            </View>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Search Foods</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search foods..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchBar}
          inputStyle={styles.searchInput}
          loading={isLoading}
          iconColor={theme.colors.textSecondary}
          selectionColor={theme.colors.primaryLight}
        />
      </View>

      {/* Results */}
      <FlatList
        data={foods}
        renderItem={renderFoodItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={48} color={theme.colors.textLight} />
              <Text style={styles.emptyText}>
                {searchQuery ? 'No foods found' : 'Search for a food to get started'}
              </Text>
            </View>
          ) : null
        }
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
  searchContainer: {
    padding: 16,
    paddingBottom: 8,
  },
  searchBar: {
    borderRadius: theme.borderRadius.md,
    elevation: 0,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  searchInput: {
    fontSize: 15,
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
  },
  foodCard: {
    ...theme.card,
    marginBottom: 10,
    overflow: 'hidden',
  },
  foodCardContent: {
    padding: 14,
  },
  foodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  foodInfo: {
    flex: 1,
    marginRight: 12,
  },
  foodNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  foodName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  verifiedText: {
    fontSize: 10,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  foodBrand: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: 6,
  },
  macroBadgeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  macroPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  macroPillText: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  foodCalories: {
    alignItems: 'center',
    minWidth: 60,
  },
  calorieNumber: {
    fontSize: 22,
    fontWeight: 'bold',
    color: theme.colors.text,
    fontVariant: ['tabular-nums'],
  },
  calorieLabel: {
    fontSize: 11,
    color: theme.colors.textLight,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 15,
    color: theme.colors.textSecondary,
    marginTop: 16,
    textAlign: 'center',
    fontWeight: '300',
  },
});

export default FoodSearchScreen;
