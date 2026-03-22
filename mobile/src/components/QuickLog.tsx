/**
 * QuickLog -- Re-log comidas frecuentes en <5 segundos
 *
 * Muestra las ultimas 5 comidas logueadas como chips horizontales.
 * Un tap re-logea la comida con la fecha de hoy via manualLogFood().
 * Usa haptics + in-app notification para feedback inmediato.
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius, shadows, mealColors } from '../theme';
import { haptics } from '../hooks/useHaptics';
import { showNotification } from './InAppNotification';
import * as foodService from '../services/food.service';
import { AIFoodLog } from '../types';
import { MealType } from '../services/food.service';

interface QuickLogProps {
  /** Recent food logs (component takes last 5 unique by food_name) */
  recentLogs: AIFoodLog[];
  /** Callback after a food is re-logged so parent can refresh */
  onLogged?: () => void;
}

/**
 * Deduplicate by food_name and take the most recent N items.
 * Preserves insertion order so the most recently logged comes first.
 */
function getUniqueRecent(logs: AIFoodLog[], limit = 5): AIFoodLog[] {
  const seen = new Set<string>();
  const result: AIFoodLog[] = [];
  // logs are ordered by logged_at descending (newest first from API)
  // but we sort just in case
  const sorted = [...logs].sort(
    (a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime(),
  );
  for (const log of sorted) {
    const key = log.food_name.toLowerCase().trim();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(log);
    }
    if (result.length >= limit) break;
  }
  return result;
}

export default function QuickLog({ recentLogs, onLogged }: QuickLogProps) {
  const c = useThemeColors();
  const [loadingId, setLoadingId] = useState<number | null>(null);

  const items = getUniqueRecent(recentLogs);

  const handleQuickLog = useCallback(async (log: AIFoodLog) => {
    haptics.light();
    setLoadingId(log.id);

    try {
      await foodService.manualLogFood({
        food_name: log.food_name,
        calories: log.calories,
        carbs_g: log.carbs_g,
        protein_g: log.protein_g,
        fats_g: log.fats_g,
        fiber_g: log.fiber_g ?? undefined,
        meal_type: (log.meal_type as MealType) || 'snack',
      });

      haptics.success();
      showNotification({
        message: `${log.food_name} registrado!`,
        type: 'success',
        icon: 'checkmark-circle',
      });
      onLogged?.();
    } catch {
      haptics.error();
      showNotification({
        message: 'Error al registrar. Intenta de nuevo.',
        type: 'warning',
        icon: 'alert-circle',
      });
    } finally {
      setLoadingId(null);
    }
  }, [onLogged]);

  if (items.length === 0) return null;

  return (
    <View
      style={[s.container, { backgroundColor: c.surface, borderColor: c.grayLight }]}
      accessibilityLabel="Quick Log: toca para re-registrar comidas recientes"
    >
      {/* Header */}
      <View style={s.header}>
        <Ionicons name="flash" size={14} color={c.accent} />
        <Text style={[s.title, { color: c.black }]}>Quick Log</Text>
        <Text style={[s.subtitle, { color: c.gray }]}>Toca para repetir</Text>
      </View>

      {/* Horizontal scroll of chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.chipScroll}
      >
        {items.map((log) => {
          const meta = mealColors[log.meal_type] ?? mealColors.snack;
          const isLoading = loadingId === log.id;

          return (
            <TouchableOpacity
              key={log.id}
              style={[s.chip, { backgroundColor: c.bg, borderColor: c.grayLight }]}
              onPress={() => handleQuickLog(log)}
              activeOpacity={0.7}
              disabled={isLoading}
              accessibilityLabel={`Registrar ${log.food_name}, ${Math.round(log.calories)} kilocalorias`}
              accessibilityRole="button"
              accessibilityHint="Toca para registrar esta comida nuevamente hoy"
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={c.accent} style={s.chipLoader} />
              ) : (
                <>
                  {/* Meal type icon */}
                  <View style={[s.chipIcon, { backgroundColor: meta.color + '20' }]}>
                    <Ionicons name={meta.icon as any} size={14} color={meta.color} />
                  </View>

                  {/* Food name + macros */}
                  <View style={s.chipContent}>
                    <Text
                      style={[s.chipName, { color: c.black }]}
                      numberOfLines={1}
                    >
                      {log.food_name}
                    </Text>
                    <View style={s.chipMacros}>
                      <Text style={[s.chipKcal, { color: c.gray }]}>
                        {Math.round(log.calories)} kcal
                      </Text>
                    </View>
                  </View>

                  {/* Re-log icon */}
                  <Ionicons name="add-circle" size={20} color={c.accent} />
                </>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ---- Styles ----------------------------------------------------------------

const s = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    paddingBottom: spacing.sm,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.label,
    fontWeight: '700',
  },
  subtitle: {
    ...typography.caption,
    flex: 1,
    textAlign: 'right',
  },
  chipScroll: {
    gap: spacing.sm,
    paddingRight: spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    minWidth: 160,
    maxWidth: 220,
  },
  chipLoader: {
    flex: 1,
    paddingVertical: spacing.xs,
  },
  chipIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipContent: {
    flex: 1,
    gap: 1,
  },
  chipName: {
    ...typography.caption,
    fontWeight: '600',
    fontSize: 13,
  },
  chipMacros: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  chipKcal: {
    fontSize: 11,
    fontWeight: '400',
  },
});
