/**
 * RecoveryPlanCard — Collapsible card showing a 24h recovery plan.
 *
 * Displays suggested meals, water recommendation, and motivational text.
 * Starts collapsed; tap header to expand.
 * CTA button navigates to Scan screen.
 */
import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius, shadows } from '../theme';
import { haptics } from '../hooks/useHaptics';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export interface RecoveryMeal {
  name: string;
  calories: number;
  protein_g: number;
}

export interface RecoveryPlanData {
  meals: RecoveryMeal[];
  water_ml?: number;
  motivational_text?: string;
}

interface RecoveryPlanCardProps {
  plan: RecoveryPlanData;
  onRegisterFood: () => void;
}

const RecoveryPlanCard = React.memo(function RecoveryPlanCard({
  plan,
  onRegisterFood,
}: RecoveryPlanCardProps) {
  const c = useThemeColors();
  const [expanded, setExpanded] = useState(false);
  const rotateAnim = useRef(new Animated.Value(0)).current;

  const toggle = useCallback(() => {
    haptics.light();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => {
      Animated.timing(rotateAnim, {
        toValue: prev ? 0 : 1,
        duration: 250,
        useNativeDriver: true,
      }).start();
      return !prev;
    });
  }, [rotateAnim]);

  const chevronRotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const meals = plan?.meals ?? [];
  const water_ml = plan?.water_ml ?? 0;
  const motivational_text = plan?.motivational_text ?? '';

  return (
    <View
      style={[styles.container, { backgroundColor: c.surface, borderColor: c.grayLight }]}
      accessibilityLabel="Plan de recuperacion"
    >
      {/* Header — always visible, tappable */}
      <TouchableOpacity
        style={styles.header}
        onPress={toggle}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`Plan de recuperacion, ${expanded ? 'colapsar' : 'expandir'}`}
        accessibilityState={{ expanded }}
      >
        <Ionicons name="nutrition-outline" size={20} color={c.accent} />
        <Text style={[styles.headerTitle, { color: c.black }]}>Plan de recuperacion</Text>
        <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
          <Ionicons name="chevron-down" size={18} color={c.gray} />
        </Animated.View>
      </TouchableOpacity>

      {/* Expandable content */}
      {expanded && (
        <View style={styles.body}>
          {/* Meals list */}
          {meals.map((meal, i) => (
            <View key={`meal-${i}`} style={[styles.mealRow, { borderBottomColor: c.grayLight }]}>
              <View style={styles.mealInfo}>
                <Text style={[styles.mealName, { color: c.black }]}>{meal.name}</Text>
                <Text style={[styles.mealMacros, { color: c.gray }]}>
                  {Math.round(meal.calories)} kcal · {Math.round(meal.protein_g)}g proteina
                </Text>
              </View>
              <View style={[styles.mealBadge, { backgroundColor: c.accent + '1A' }]}>
                <Text style={[styles.mealBadgeText, { color: c.accent }]}>
                  {Math.round(meal.calories)}
                </Text>
              </View>
            </View>
          ))}

          {/* Water recommendation */}
          {water_ml != null && water_ml > 0 && (
            <View style={styles.waterRow}>
              <Ionicons name="water-outline" size={16} color="#3B82F6" />
              <Text style={[styles.waterText, { color: c.gray }]}>
                Bebe al menos {Math.round(water_ml)} ml de agua hoy
              </Text>
            </View>
          )}

          {/* Motivational text */}
          {motivational_text ? (
            <Text style={[styles.motivational, { color: c.gray }]}>
              {motivational_text}
            </Text>
          ) : null}

          {/* CTA button */}
          <TouchableOpacity
            style={[styles.ctaButton, { backgroundColor: c.accent }]}
            onPress={onRegisterFood}
            activeOpacity={0.85}
            accessibilityLabel="Registrar comida"
            accessibilityRole="button"
          >
            <Ionicons name="camera-outline" size={18} color="#FFFFFF" />
            <Text style={styles.ctaText}>Registrar comida</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
});

export default RecoveryPlanCard;

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
    overflow: 'hidden',
    ...shadows.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
  },
  headerTitle: {
    ...typography.label,
    flex: 1,
  },
  body: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  mealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  mealInfo: {
    flex: 1,
    gap: 2,
  },
  mealName: {
    ...typography.bodyMd,
  },
  mealMacros: {
    ...typography.caption,
  },
  mealBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  mealBadgeText: {
    ...typography.caption,
    fontWeight: '700',
  },
  waterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  waterText: {
    ...typography.caption,
  },
  motivational: {
    ...typography.caption,
    fontStyle: 'italic',
    lineHeight: 18,
    marginTop: spacing.sm,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 44,
    borderRadius: radius.full,
    marginTop: spacing.md,
  },
  ctaText: {
    color: '#FFFFFF',
    ...typography.button,
  },
});
