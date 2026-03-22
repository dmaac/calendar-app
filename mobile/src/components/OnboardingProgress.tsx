/**
 * OnboardingProgress — Profile completion card for HomeScreen
 *
 * Shows a progress bar with percentage based on 5 profile completion checks:
 * 1. Has profile photo (avatar)
 * 2. Has logged 5+ meals
 * 3. Has registered weight
 * 4. Has configured nutrition goals
 * 5. Has notifications enabled
 *
 * Each check = 20%. "Completar perfil" button navigates to first incomplete item.
 * Hides automatically when 100% complete.
 */
import React, { useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius, shadows } from '../theme';
import { haptics } from '../hooks/useHaptics';
import { useAnalytics } from '../hooks/useAnalytics';

interface ProfileCheckData {
  hasProfilePhoto: boolean;
  mealsLogged: number;
  hasLoggedWeight: boolean;
  hasConfiguredGoals: boolean;
  notificationsEnabled: boolean;
}

interface OnboardingProgressProps {
  data: ProfileCheckData;
  navigation: any;
}

interface CheckItem {
  key: string;
  label: string;
  icon: string;
  completed: boolean;
  /** Navigation target when this is the first incomplete item */
  navigateTo: string;
  navigateParams?: any;
}

export default function OnboardingProgress({ data, navigation }: OnboardingProgressProps) {
  const c = useThemeColors();
  const { track } = useAnalytics();

  const checks: CheckItem[] = useMemo(() => [
    {
      key: 'photo',
      label: 'Foto de perfil',
      icon: 'camera-outline',
      completed: data.hasProfilePhoto,
      navigateTo: 'PersonalDetails',
    },
    {
      key: 'meals',
      label: '5+ comidas registradas',
      icon: 'restaurant-outline',
      completed: data.mealsLogged >= 5,
      navigateTo: 'Scan',
    },
    {
      key: 'weight',
      label: 'Peso registrado',
      icon: 'scale-outline',
      completed: data.hasLoggedWeight,
      navigateTo: 'WeightTracking',
    },
    {
      key: 'goals',
      label: 'Metas configuradas',
      icon: 'nutrition-outline',
      completed: data.hasConfiguredGoals,
      navigateTo: 'NutritionGoals',
    },
    {
      key: 'notifications',
      label: 'Notificaciones activas',
      icon: 'notifications-outline',
      completed: data.notificationsEnabled,
      navigateTo: 'Settings',
    },
  ], [data]);

  const completedCount = checks.filter((ch) => ch.completed).length;
  const percentage = completedCount * 20;
  const firstIncomplete = checks.find((ch) => !ch.completed);

  // Animated progress bar fill
  const fillAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fillAnim, {
      toValue: percentage,
      duration: 800,
      delay: 300,
      useNativeDriver: false,
    }).start();
  }, [percentage]);

  const fillWidth = fillAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  // Don't render if profile is complete
  if (percentage >= 100) return null;

  const handlePress = () => {
    if (!firstIncomplete) return;
    haptics.light();
    track('profile_completion_pressed', {
      percentage,
      next_step: firstIncomplete.key,
    });
    navigation.navigate(firstIncomplete.navigateTo, firstIncomplete.navigateParams);
  };

  return (
    <View
      style={[styles.container, { backgroundColor: c.surface, borderColor: c.grayLight }]}
      accessibilityLabel={`Tu perfil esta ${percentage}% completo. ${completedCount} de 5 pasos completados.`}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="person-circle-outline" size={20} color={c.accent} />
          <Text style={[styles.title, { color: c.black }]}>
            Tu perfil esta {percentage}% completo
          </Text>
        </View>
        <Text style={[styles.count, { color: c.gray }]}>{completedCount}/5</Text>
      </View>

      {/* Progress bar */}
      <View style={[styles.track, { backgroundColor: c.grayLight }]}>
        <Animated.View
          style={[
            styles.fill,
            {
              width: fillWidth as any,
              backgroundColor: percentage >= 80 ? '#34A853' : c.accent,
            },
          ]}
        />
      </View>

      {/* Check items */}
      <View style={styles.checks}>
        {checks.map((ch) => (
          <View key={ch.key} style={styles.checkRow}>
            <Ionicons
              name={ch.completed ? 'checkmark-circle' : ('ellipse-outline' as any)}
              size={16}
              color={ch.completed ? '#34A853' : c.grayLight}
            />
            <Text
              style={[
                styles.checkLabel,
                { color: ch.completed ? c.gray : c.black },
                ch.completed && styles.checkLabelDone,
              ]}
            >
              {ch.label}
            </Text>
          </View>
        ))}
      </View>

      {/* CTA button */}
      {firstIncomplete && (
        <TouchableOpacity
          style={[styles.cta, { backgroundColor: c.black }]}
          onPress={handlePress}
          activeOpacity={0.85}
          accessibilityLabel={`Completar perfil: ${firstIncomplete.label}`}
          accessibilityRole="button"
        >
          <Ionicons name={firstIncomplete.icon as any} size={16} color={c.white} />
          <Text style={[styles.ctaText, { color: c.white }]}>Completar perfil</Text>
          <Ionicons name="chevron-forward" size={14} color={c.white} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  title: {
    ...typography.label,
    flex: 1,
  },
  count: {
    ...typography.caption,
    fontWeight: '600',
  },
  track: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  fill: {
    height: 6,
    borderRadius: 3,
  },
  checks: {
    gap: 6,
    marginBottom: spacing.sm,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  checkLabel: {
    ...typography.caption,
  },
  checkLabelDone: {
    textDecorationLine: 'line-through',
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    marginTop: spacing.xs,
    minHeight: 40,
  },
  ctaText: {
    ...typography.label,
  },
});
