/**
 * QuickLogSection -- Seccion de Quick Log con tabs "Frecuentes" y "Favoritos"
 *
 * Muestra las comidas mas frecuentes del usuario y sus favoritos en tabs,
 * permitiendo re-loguear cualquier comida en <5 segundos con un solo tap.
 * Incluye boton de corazon para marcar/desmarcar favoritos.
 */
import React, { useCallback, useState, useEffect, useMemo } from 'react';
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
import type { FrequentFood, MealType } from '../services/food.service';
import * as favoritesService from '../services/favorites.service';
import type { FavoriteFood } from '../services/favorites.service';

type TabKey = 'frequent' | 'favorites';

interface QuickLogSectionProps {
  /** Callback after a food is re-logged so parent can refresh */
  onLogged?: () => void;
}

function QuickLogSection({ onLogged }: QuickLogSectionProps) {
  const c = useThemeColors();
  const [activeTab, setActiveTab] = useState<TabKey>('frequent');
  const [frequentFoods, setFrequentFoods] = useState<FrequentFood[]>([]);
  const [favorites, setFavorites] = useState<FavoriteFood[]>([]);
  const [loadingFrequent, setLoadingFrequent] = useState(true);
  const [loadingFavorites, setLoadingFavorites] = useState(true);
  const [loggingId, setLoggingId] = useState<string | null>(null);
  const [togglingFav, setTogglingFav] = useState<string | null>(null);

  // Track which food names are in favorites for heart icon state
  const favoriteNames = useMemo(() => {
    return new Set(favorites.map((f) => f.name.toLowerCase().trim()));
  }, [favorites]);

  // Load frequent foods
  useEffect(() => {
    let mounted = true;
    setLoadingFrequent(true);
    foodService
      .getFrequentFoods(10)
      .then((data) => {
        if (mounted) setFrequentFoods(data);
      })
      .catch(() => {
        if (mounted) setFrequentFoods([]);
      })
      .finally(() => {
        if (mounted) setLoadingFrequent(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Load favorites
  useEffect(() => {
    let mounted = true;
    setLoadingFavorites(true);
    favoritesService
      .getFavorites()
      .then((data) => {
        if (mounted) setFavorites(data);
      })
      .catch(() => {
        if (mounted) setFavorites([]);
      })
      .finally(() => {
        if (mounted) setLoadingFavorites(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Re-log a frequent food via quick-log endpoint
  const handleQuickLogFrequent = useCallback(
    async (food: FrequentFood) => {
      const itemKey = `freq_${food.food_name}_${food.meal_type}`;
      haptics.light();
      setLoggingId(itemKey);

      try {
        await foodService.quickLogFood({
          food_name: food.food_name,
          calories: food.calories,
          protein_g: food.protein_g,
          carbs_g: food.carbs_g,
          fats_g: food.fats_g,
          fiber_g: food.fiber_g ?? undefined,
          sugar_g: food.sugar_g ?? undefined,
          sodium_mg: food.sodium_mg ?? undefined,
          serving_size: food.serving_size ?? undefined,
          meal_type: (food.meal_type as MealType) || 'snack',
        });

        haptics.success();
        showNotification({
          message: `${food.food_name} registrado!`,
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
        setLoggingId(null);
      }
    },
    [onLogged],
  );

  // Re-log a favorite food
  const handleQuickLogFavorite = useCallback(
    async (fav: FavoriteFood) => {
      const itemKey = `fav_${fav.id}`;
      haptics.light();
      setLoggingId(itemKey);

      try {
        // If the favorite has a server_id, use the favorites log endpoint
        if (fav.server_id) {
          await favoritesService.logFavorite(fav.id);
        }

        // Also create a quick-log food entry for today
        await foodService.quickLogFood({
          food_name: fav.name,
          calories: fav.calories,
          protein_g: fav.protein_g,
          carbs_g: fav.carbs_g,
          fats_g: fav.fats_g,
          meal_type: 'snack',
        });

        haptics.success();
        showNotification({
          message: `${fav.name} registrado!`,
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
        setLoggingId(null);
      }
    },
    [onLogged],
  );

  // Toggle favorite on a frequent food
  const handleToggleFavorite = useCallback(
    async (food: FrequentFood) => {
      const favKey = `toggle_${food.food_name}`;
      haptics.light();
      setTogglingFav(favKey);

      try {
        const added = await favoritesService.toggleFavorite({
          name: food.food_name,
          calories: food.calories,
          protein_g: food.protein_g,
          carbs_g: food.carbs_g,
          fats_g: food.fats_g,
        });

        // Refresh favorites list
        const updatedFavs = await favoritesService.getFavorites();
        setFavorites(updatedFavs);

        showNotification({
          message: added
            ? `${food.food_name} agregado a favoritos!`
            : `${food.food_name} eliminado de favoritos`,
          type: added ? 'success' : 'info',
          icon: added ? 'heart' : 'heart-dislike',
        });
      } catch {
        showNotification({
          message: 'Error al actualizar favoritos.',
          type: 'warning',
          icon: 'alert-circle',
        });
      } finally {
        setTogglingFav(null);
      }
    },
    [],
  );

  // Toggle favorite on a favorite item (remove)
  const handleRemoveFavorite = useCallback(
    async (fav: FavoriteFood) => {
      const favKey = `toggle_fav_${fav.id}`;
      haptics.light();
      setTogglingFav(favKey);

      try {
        await favoritesService.removeFavorite(fav.id);
        const updatedFavs = await favoritesService.getFavorites();
        setFavorites(updatedFavs);

        showNotification({
          message: `${fav.name} eliminado de favoritos`,
          type: 'info',
          icon: 'heart-dislike',
        });
      } catch {
        showNotification({
          message: 'Error al actualizar favoritos.',
          type: 'warning',
          icon: 'alert-circle',
        });
      } finally {
        setTogglingFav(null);
      }
    },
    [],
  );

  const isLoading = activeTab === 'frequent' ? loadingFrequent : loadingFavorites;
  const isEmpty =
    activeTab === 'frequent'
      ? frequentFoods.length === 0
      : favorites.length === 0;

  // Don't render if both lists are empty and loaded
  if (!loadingFrequent && !loadingFavorites && frequentFoods.length === 0 && favorites.length === 0) {
    return null;
  }

  return (
    <View
      style={[s.container, { backgroundColor: c.surface, borderColor: c.grayLight }]}
      accessibilityLabel="Quick Log: registra comidas frecuentes o favoritas con un toque"
    >
      {/* Header with tabs */}
      <View style={s.header} accessibilityRole="header">
        <Ionicons name="flash" size={14} color={c.accent} />
        <Text style={[s.title, { color: c.black }]} allowFontScaling>Quick Log</Text>
      </View>

      {/* Tabs */}
      <View style={[s.tabRow, { borderColor: c.grayLight }]} accessibilityRole="tablist">
        <TouchableOpacity
          style={[
            s.tab,
            activeTab === 'frequent' && [s.tabActive, { borderBottomColor: c.accent }],
          ]}
          onPress={() => {
            haptics.light();
            setActiveTab('frequent');
          }}
          activeOpacity={0.7}
          accessibilityLabel="Pestaña Frecuentes"
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'frequent' }}
        >
          <Ionicons
            name="trending-up"
            size={14}
            color={activeTab === 'frequent' ? c.accent : c.gray}
          />
          <Text
            style={[
              s.tabLabel,
              { color: activeTab === 'frequent' ? c.accent : c.gray },
              activeTab === 'frequent' && s.tabLabelActive,
            ]}
          >
            Frecuentes
          </Text>
          {frequentFoods.length > 0 && (
            <View style={[s.tabBadge, { backgroundColor: activeTab === 'frequent' ? c.accent : c.grayLight }]}>
              <Text style={[s.tabBadgeText, { color: activeTab === 'frequent' ? c.white : c.gray }]}>
                {frequentFoods.length}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            s.tab,
            activeTab === 'favorites' && [s.tabActive, { borderBottomColor: c.accent }],
          ]}
          onPress={() => {
            haptics.light();
            setActiveTab('favorites');
          }}
          activeOpacity={0.7}
          accessibilityLabel="Pestaña Favoritos"
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'favorites' }}
        >
          <Ionicons
            name="heart"
            size={14}
            color={activeTab === 'favorites' ? '#EF4444' : c.gray}
          />
          <Text
            style={[
              s.tabLabel,
              { color: activeTab === 'favorites' ? c.accent : c.gray },
              activeTab === 'favorites' && s.tabLabelActive,
            ]}
          >
            Favoritos
          </Text>
          {favorites.length > 0 && (
            <View style={[s.tabBadge, { backgroundColor: activeTab === 'favorites' ? c.accent : c.grayLight }]}>
              <Text style={[s.tabBadgeText, { color: activeTab === 'favorites' ? c.white : c.gray }]}>
                {favorites.length}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={s.loadingContainer}>
          <ActivityIndicator size="small" color={c.accent} />
        </View>
      ) : isEmpty ? (
        <View style={s.emptyContainer}>
          <Ionicons
            name={activeTab === 'frequent' ? 'restaurant-outline' : 'heart-outline'}
            size={24}
            color={c.disabled}
          />
          <Text style={[s.emptyText, { color: c.gray }]}>
            {activeTab === 'frequent'
              ? 'Registra comidas para ver tus mas frecuentes'
              : 'Marca comidas con el corazon para verlas aqui'}
          </Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.itemScroll}
        >
          {activeTab === 'frequent'
            ? frequentFoods.map((food) => {
                const itemKey = `freq_${food.food_name}_${food.meal_type}`;
                const isLogging = loggingId === itemKey;
                const isFav = favoriteNames.has(food.food_name.toLowerCase().trim());
                const isTogglingFav = togglingFav === `toggle_${food.food_name}`;
                const meta = mealColors[food.meal_type] ?? mealColors.snack;

                return (
                  <View key={itemKey} style={[s.card, { backgroundColor: c.bg, borderColor: c.grayLight }]}>
                    {/* Top row: meal icon + name + fav heart */}
                    <View style={s.cardTopRow}>
                      <View style={[s.mealIcon, { backgroundColor: meta.color + '20' }]}>
                        <Ionicons name={meta.icon as any} size={14} color={meta.color} />
                      </View>
                      <Text style={[s.cardName, { color: c.black }]} numberOfLines={2}>
                        {food.food_name}
                      </Text>
                      <TouchableOpacity
                        onPress={() => handleToggleFavorite(food)}
                        disabled={isTogglingFav}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityLabel={isFav ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                        accessibilityRole="button"
                      >
                        {isTogglingFav ? (
                          <ActivityIndicator size={14} color="#EF4444" />
                        ) : (
                          <Ionicons
                            name={isFav ? 'heart' : 'heart-outline'}
                            size={16}
                            color="#EF4444"
                          />
                        )}
                      </TouchableOpacity>
                    </View>

                    {/* Macros row */}
                    <View style={s.macrosRow}>
                      <Text style={[s.kcalText, { color: c.black }]}>
                        {Math.round(food.calories)} kcal
                      </Text>
                      <View style={s.macroDetails}>
                        <Text style={[s.macroText, { color: c.protein }]}>
                          P {Math.round(food.protein_g)}g
                        </Text>
                        <Text style={[s.macroText, { color: c.carbs }]}>
                          C {Math.round(food.carbs_g)}g
                        </Text>
                        <Text style={[s.macroText, { color: c.fats }]}>
                          G {Math.round(food.fats_g)}g
                        </Text>
                      </View>
                    </View>

                    {/* Log count badge */}
                    <View style={s.metaRow}>
                      <View style={[s.countBadge, { backgroundColor: c.accent + '15' }]}>
                        <Ionicons name="repeat" size={10} color={c.accent} />
                        <Text style={[s.countText, { color: c.accent }]}>
                          {food.log_count}x
                        </Text>
                      </View>
                    </View>

                    {/* Quick add button */}
                    <TouchableOpacity
                      style={[s.addButton, { backgroundColor: c.accent }]}
                      onPress={() => handleQuickLogFrequent(food)}
                      disabled={isLogging}
                      activeOpacity={0.7}
                      accessibilityLabel={`Registrar ${food.food_name}, ${Math.round(food.calories)} kilocalorias`}
                      accessibilityRole="button"
                      accessibilityHint="Toca para registrar esta comida nuevamente hoy"
                    >
                      {isLogging ? (
                        <ActivityIndicator size={14} color={c.white} />
                      ) : (
                        <>
                          <Ionicons name="add" size={16} color={c.white} />
                          <Text style={[s.addButtonText, { color: c.white }]}>Registrar</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })
            : favorites.map((fav) => {
                const itemKey = `fav_${fav.id}`;
                const isLogging = loggingId === itemKey;
                const isTogglingFav = togglingFav === `toggle_fav_${fav.id}`;

                return (
                  <View key={itemKey} style={[s.card, { backgroundColor: c.bg, borderColor: c.grayLight }]}>
                    {/* Top row: heart icon + name + remove */}
                    <View style={s.cardTopRow}>
                      <View style={[s.mealIcon, { backgroundColor: '#EF444420' }]}>
                        <Ionicons name="heart" size={14} color="#EF4444" />
                      </View>
                      <Text style={[s.cardName, { color: c.black }]} numberOfLines={2}>
                        {fav.name}
                      </Text>
                      <TouchableOpacity
                        onPress={() => handleRemoveFavorite(fav)}
                        disabled={isTogglingFav}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityLabel="Quitar de favoritos"
                        accessibilityRole="button"
                      >
                        {isTogglingFav ? (
                          <ActivityIndicator size={14} color="#EF4444" />
                        ) : (
                          <Ionicons name="heart-dislike-outline" size={16} color="#EF4444" />
                        )}
                      </TouchableOpacity>
                    </View>

                    {/* Macros row */}
                    <View style={s.macrosRow}>
                      <Text style={[s.kcalText, { color: c.black }]}>
                        {Math.round(fav.calories)} kcal
                      </Text>
                      <View style={s.macroDetails}>
                        <Text style={[s.macroText, { color: c.protein }]}>
                          P {Math.round(fav.protein_g)}g
                        </Text>
                        <Text style={[s.macroText, { color: c.carbs }]}>
                          C {Math.round(fav.carbs_g)}g
                        </Text>
                        <Text style={[s.macroText, { color: c.fats }]}>
                          G {Math.round(fav.fats_g)}g
                        </Text>
                      </View>
                    </View>

                    {/* Times logged badge */}
                    {fav.times_logged > 0 && (
                      <View style={s.metaRow}>
                        <View style={[s.countBadge, { backgroundColor: c.accent + '15' }]}>
                          <Ionicons name="repeat" size={10} color={c.accent} />
                          <Text style={[s.countText, { color: c.accent }]}>
                            {fav.times_logged}x
                          </Text>
                        </View>
                      </View>
                    )}

                    {/* Quick add button */}
                    <TouchableOpacity
                      style={[s.addButton, { backgroundColor: c.accent }]}
                      onPress={() => handleQuickLogFavorite(fav)}
                      disabled={isLogging}
                      activeOpacity={0.7}
                      accessibilityLabel={`Registrar ${fav.name}, ${Math.round(fav.calories)} kilocalorias`}
                      accessibilityRole="button"
                      accessibilityHint="Toca para registrar esta comida favorita hoy"
                    >
                      {isLogging ? (
                        <ActivityIndicator size={14} color={c.white} />
                      ) : (
                        <>
                          <Ionicons name="add" size={16} color={c.white} />
                          <Text style={[s.addButtonText, { color: c.white }]}>Registrar</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

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
  // ─── Tabs ──
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    marginBottom: spacing.sm,
    marginHorizontal: -spacing.xs,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomWidth: 2,
  },
  tabLabel: {
    ...typography.caption,
    fontWeight: '500',
  },
  tabLabelActive: {
    fontWeight: '700',
  },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tabBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  // ─── Loading / Empty ──
  loadingContainer: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  emptyContainer: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyText: {
    ...typography.caption,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  // ─── Card list ──
  itemScroll: {
    gap: spacing.sm,
    paddingRight: spacing.xs,
    paddingBottom: spacing.xs,
  },
  card: {
    width: 170,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.sm + 2,
    gap: spacing.xs + 2,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  mealIcon: {
    width: 26,
    height: 26,
    borderRadius: radius.sm - 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardName: {
    ...typography.caption,
    fontWeight: '600',
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },
  // ─── Macros ──
  macrosRow: {
    gap: 2,
  },
  kcalText: {
    fontSize: 14,
    fontWeight: '700',
  },
  macroDetails: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  macroText: {
    fontSize: 10,
    fontWeight: '600',
  },
  // ─── Meta ──
  metaRow: {
    flexDirection: 'row',
  },
  countBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  countText: {
    fontSize: 10,
    fontWeight: '600',
  },
  // ─── Add button ──
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.sm,
    marginTop: 2,
  },
  addButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
});

export default React.memo(QuickLogSection);
