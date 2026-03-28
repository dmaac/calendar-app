/**
 * FoodSearchScreen -- Full-screen wrapper around the FoodSearch component.
 *
 * Provides the screen shell (header with back button), quick meal-type filter
 * chips, and a barcode scan shortcut. Passes route params (mealType) to
 * FoodSearch which handles all search, debounce, recent history, portion
 * selection, and logging logic.
 *
 * Sprint 5 improvements:
 * - Quick filter chips (breakfast, lunch, dinner, snack) to pre-select meal type
 * - Barcode scan shortcut in header
 * - Keyboard dismiss on scroll (propagated to FoodSearch)
 * - Animated chip selection with haptic feedback
 *
 * Navigated to from:
 * - LogScreen AddSheet -> "Buscar alimento"
 * - Navigation: LogStack -> FoodSearch
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, typography, spacing, radius, useLayout } from '../../theme';
import { haptics } from '../../hooks/useHaptics';
import FoodSearch from '../../components/FoodSearch';

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

const MEAL_FILTERS: { value: MealType; label: string; icon: string; color: string }[] = [
  { value: 'breakfast', label: 'Desayuno', icon: 'sunny-outline',     color: '#F59E0B' },
  { value: 'lunch',     label: 'Almuerzo', icon: 'restaurant-outline', color: '#10B981' },
  { value: 'dinner',    label: 'Cena',     icon: 'moon-outline',       color: '#6366F1' },
  { value: 'snack',     label: 'Snack',    icon: 'cafe-outline',       color: '#EC4899' },
];

export default function FoodSearchScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { sidePadding } = useLayout();
  const c = useThemeColors();
  const initialMealType: MealType = route?.params?.mealType ?? 'snack';
  const [selectedMeal, setSelectedMeal] = useState<MealType>(initialMealType);

  const handleLogged = useCallback(() => {
    // Go back to LogScreen after logging -- it will auto-refresh on focus
    navigation.goBack();
  }, [navigation]);

  const handleMealSelect = useCallback((meal: MealType) => {
    haptics.selection();
    setSelectedMeal(meal);
  }, []);

  const handleBarcodeScan = useCallback(() => {
    haptics.light();
    navigation.navigate('Inicio', { screen: 'Barcode' });
  }, [navigation, selectedMeal]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: sidePadding }]}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: c.surface }]}
          onPress={() => { haptics.light(); navigation.goBack(); }}
          accessibilityLabel="Volver"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={20} color={c.black} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.black }]}>Buscar Alimento</Text>
        <TouchableOpacity
          style={[styles.barcodeBtn, { backgroundColor: c.surface }]}
          onPress={handleBarcodeScan}
          accessibilityLabel="Escanear codigo de barras"
          accessibilityRole="button"
        >
          <Ionicons name="barcode-outline" size={20} color={c.black} />
        </TouchableOpacity>
      </View>

      {/* Quick meal-type filter chips */}
      <View style={[styles.filtersContainer, { paddingHorizontal: sidePadding }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersScroll}
          keyboardShouldPersistTaps="handled"
        >
          {MEAL_FILTERS.map((filter) => {
            const isActive = selectedMeal === filter.value;
            return (
              <TouchableOpacity
                key={filter.value}
                style={[
                  styles.filterChip,
                  { borderColor: c.grayLight, backgroundColor: c.surface },
                  isActive && { backgroundColor: c.black, borderColor: c.black },
                ]}
                onPress={() => handleMealSelect(filter.value)}
                activeOpacity={0.7}
                accessibilityLabel={`Filtrar por ${filter.label}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: isActive }}
              >
                <Ionicons
                  name={filter.icon as any}
                  size={14}
                  color={isActive ? '#FFFFFF' : filter.color}
                />
                <Text
                  style={[
                    styles.filterChipText,
                    { color: c.black },
                    isActive && { color: '#FFFFFF' },
                  ]}
                >
                  {filter.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* FoodSearch component handles everything else */}
      <View
        style={[styles.content, { paddingHorizontal: sidePadding }]}
        onStartShouldSetResponder={() => {
          Keyboard.dismiss();
          return false;
        }}
      >
        <FoodSearch
          mealType={selectedMeal}
          onLogged={handleLogged}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { ...typography.titleSm },
  barcodeBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  // Quick filter chips
  filtersContainer: {
    marginBottom: spacing.sm,
  },
  filtersScroll: {
    gap: spacing.xs,
    paddingRight: spacing.md,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    borderWidth: 1,
    minHeight: 36,
  },
  filterChipText: {
    ...typography.caption,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
});
