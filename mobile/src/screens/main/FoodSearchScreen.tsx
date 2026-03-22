/**
 * FoodSearchScreen -- Full-screen wrapper around the FoodSearch component.
 *
 * Provides the screen shell (header with back button) and passes route params
 * (mealType) to FoodSearch which handles all search, debounce, recent history,
 * portion selection, and logging logic.
 *
 * Navigated to from:
 * - LogScreen AddSheet -> "Buscar alimento"
 * - Navigation: LogStack -> FoodSearch
 */
import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, typography, spacing, useLayout } from '../../theme';
import { haptics } from '../../hooks/useHaptics';
import FoodSearch from '../../components/FoodSearch';

export default function FoodSearchScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { sidePadding } = useLayout();
  const c = useThemeColors();
  const mealType = route?.params?.mealType ?? 'snack';

  const handleLogged = useCallback(() => {
    // Go back to LogScreen after logging -- it will auto-refresh on focus
    navigation.goBack();
  }, [navigation]);

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
        <View style={{ width: 36 }} />
      </View>

      {/* FoodSearch component handles everything else */}
      <View style={[styles.content, { paddingHorizontal: sidePadding }]}>
        <FoodSearch
          mealType={mealType}
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
  content: {
    flex: 1,
  },
});
