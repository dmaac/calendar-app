/**
 * FavoritesScreen -- Smart Favorites
 * Guarda tus platos favoritos para registrarlos con un solo tap.
 *
 * Features:
 * - List of saved favorite foods with macros
 * - Quick-log with one tap (+ button) and meal type picker
 * - Swipe-to-delete (via SwipeableRow)
 * - Search/filter favorites
 * - Group by meal category (most-logged meal type) with section headers
 * - Last-logged date display
 * - Empty state with Fitsi mascot
 */
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  TextInput,
  Alert,
  RefreshControl,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useThemeColors, typography, spacing, radius, shadows, useLayout, mealColors } from '../../theme';
import { haptics } from '../../hooks/useHaptics';
import { useAnalytics } from '../../hooks/useAnalytics';
import FitsiMascot from '../../components/FitsiMascot';
import { showNotification } from '../../components/InAppNotification';
import SwipeableRow, { SwipeableRowProvider } from '../../components/SwipeableRow';
import * as favoritesService from '../../services/favorites.service';
import type { FavoriteFood } from '../../services/favorites.service';
import type { MealType } from '../../services/food.service';

// ── Filter chip values ──────────────────────────────────────────────────────

type FilterValue = 'all' | 'breakfast' | 'lunch' | 'dinner' | 'snack';

const FILTER_OPTIONS: { key: FilterValue; label: string; icon: string }[] = [
  { key: 'all', label: 'Todos', icon: 'grid-outline' },
  { key: 'breakfast', label: 'Desayuno', icon: 'sunny-outline' },
  { key: 'lunch', label: 'Almuerzo', icon: 'restaurant-outline' },
  { key: 'dinner', label: 'Cena', icon: 'moon-outline' },
  { key: 'snack', label: 'Snack', icon: 'cafe-outline' },
];

const MEAL_TYPE_OPTIONS: { key: MealType; label: string; icon: string; color: string }[] = [
  { key: 'breakfast', label: 'Desayuno', icon: 'sunny-outline', color: '#F59E0B' },
  { key: 'lunch', label: 'Almuerzo', icon: 'restaurant-outline', color: '#10B981' },
  { key: 'dinner', label: 'Cena', icon: 'moon-outline', color: '#6366F1' },
  { key: 'snack', label: 'Snack', icon: 'cafe-outline', color: '#EC4899' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Infer the most likely category for a favorite based on its name.
 * Defaults to 'snack' when no keyword match is found.
 */
function inferCategory(name: string): MealType {
  const n = name.toLowerCase();
  // Breakfast keywords
  if (/avena|cereal|huevo|tostada|pan|yogur|granola|pancake|waffle|fruta|jugo|smoothie|desayuno/i.test(n)) {
    return 'breakfast';
  }
  // Dinner keywords
  if (/sopa|cena|ensalada nocturna/i.test(n)) {
    return 'dinner';
  }
  // Lunch keywords (broader match)
  if (/arroz|pollo|carne|pasta|ensalada|sandwich|burrito|taco|wrap|almuerzo|lomo|pescado|salmon/i.test(n)) {
    return 'lunch';
  }
  return 'snack';
}

/**
 * Format a date string relative to today.
 */
function formatLastLogged(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays} dias`;
  if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} sem`;
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
}

// ── Macro mini pill ──────────────────────────────────────────────────────────

function MacroMini({
  label,
  value,
  color,
  textColor,
}: {
  label: string;
  value: number;
  color: string;
  textColor: string;
}) {
  return (
    <View style={[miniStyles.pill, { backgroundColor: color + '15', borderColor: color + '30' }]}>
      <Text style={[miniStyles.value, { color }]}>{Math.round(value)}</Text>
      <Text style={[miniStyles.label, { color: textColor }]}>{label}</Text>
    </View>
  );
}

const miniStyles = StyleSheet.create({
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    minWidth: 48,
  },
  value: { fontSize: 13, fontWeight: '700' },
  label: { fontSize: 9, fontWeight: '500', marginTop: 1 },
});

// ── Meal type picker modal ───────────────────────────────────────────────────

function MealTypePicker({
  visible,
  itemName,
  colors: c,
  onSelect,
  onClose,
}: {
  visible: boolean;
  itemName: string;
  colors: ReturnType<typeof useThemeColors>;
  onSelect: (mealType: MealType) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={pickerStyles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={[pickerStyles.sheet, { backgroundColor: c.bg }]}>
          <Text style={[pickerStyles.title, { color: c.black }]}>
            Registrar como...
          </Text>
          <Text style={[pickerStyles.subtitle, { color: c.gray }]} numberOfLines={1}>
            {itemName}
          </Text>
          <View style={pickerStyles.options}>
            {MEAL_TYPE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[pickerStyles.option, { backgroundColor: opt.color + '15', borderColor: opt.color + '30' }]}
                onPress={() => onSelect(opt.key)}
                activeOpacity={0.7}
              >
                <Ionicons name={opt.icon as any} size={22} color={opt.color} />
                <Text style={[pickerStyles.optionLabel, { color: c.black }]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={[pickerStyles.cancelBtn, { backgroundColor: c.surface }]} onPress={onClose}>
            <Text style={[pickerStyles.cancelText, { color: c.gray }]}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const pickerStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  title: {
    ...typography.titleSm,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  option: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 80,
    height: 80,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.xs,
  },
  optionLabel: {
    ...typography.caption,
    fontWeight: '600',
  },
  cancelBtn: {
    marginTop: spacing.md,
    height: 48,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    ...typography.button,
  },
});

// ── Favorite item ────────────────────────────────────────────────────────────

const FavoriteItem = React.memo(function FavoriteItem({
  item,
  colors: c,
  onLog,
  onRemove,
}: {
  item: FavoriteFood & { _category?: MealType; _lastLoggedLabel?: string };
  colors: ReturnType<typeof useThemeColors>;
  onLog: (item: FavoriteFood) => void;
  onRemove: (item: FavoriteFood) => void;
}) {
  const categoryColor = mealColors[item._category ?? 'snack']?.color ?? c.gray;

  return (
    <SwipeableRow
      rightAction={{
        icon: 'trash-outline',
        label: 'Eliminar',
        color: '#EF4444',
        onPress: () => onRemove(item),
        accessibilityLabel: `Eliminar ${item.name} de favoritos`,
      }}
      accessibilityHint={`Desliza a la izquierda para eliminar ${item.name}`}
    >
      <View
        style={[styles.favItem, { backgroundColor: c.surface, borderColor: c.grayLight }]}
        accessibilityLabel={`${item.name}, ${Math.round(item.calories)} calorias`}
      >
        <View style={styles.favLeft}>
          <Text style={styles.favEmoji}>{item.emoji || '🍽️'}</Text>
          <View style={styles.favInfo}>
            <Text style={[styles.favName, { color: c.black }]} numberOfLines={1}>
              {item.name}
            </Text>
            <View style={styles.favMeta}>
              <Text style={[styles.favCals, { color: c.gray }]}>
                {Math.round(item.calories)} kcal
              </Text>
              {item.times_logged > 0 && (
                <View style={[styles.logCountBadge, { backgroundColor: c.accent + '15' }]}>
                  <Text style={[styles.logCountText, { color: c.accent }]}>
                    {item.times_logged}x
                  </Text>
                </View>
              )}
              {item._lastLoggedLabel ? (
                <Text style={[styles.lastLogged, { color: c.gray }]}>
                  {item._lastLoggedLabel}
                </Text>
              ) : null}
            </View>
            <View style={styles.macrosRow}>
              <MacroMini label="P" value={item.protein_g} color={c.protein} textColor={c.gray} />
              <MacroMini label="C" value={item.carbs_g} color={c.carbs} textColor={c.gray} />
              <MacroMini label="G" value={item.fats_g} color={c.fats} textColor={c.gray} />
            </View>
          </View>
        </View>
        <View style={styles.favActions}>
          <TouchableOpacity
            style={[styles.logBtn, { backgroundColor: c.black }]}
            onPress={() => onLog(item)}
            activeOpacity={0.8}
            accessibilityLabel={`Registrar ${item.name}`}
            accessibilityRole="button"
          >
            <Ionicons name="add" size={20} color={c.white} />
          </TouchableOpacity>
          <View style={[styles.categoryDot, { backgroundColor: categoryColor }]} />
        </View>
      </View>
    </SwipeableRow>
  );
});

// ── Section header ───────────────────────────────────────────────────────────

function SectionHeader({
  title,
  icon,
  color,
  count,
  textColor,
}: {
  title: string;
  icon: string;
  color: string;
  count: number;
  textColor: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={[styles.sectionIconBg, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon as any} size={14} color={color} />
      </View>
      <Text style={[styles.sectionTitle, { color: textColor }]}>{title}</Text>
      <Text style={[styles.sectionCount, { color }]}>{count}</Text>
    </View>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────

export default function FavoritesScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { sidePadding } = useLayout();
  const c = useThemeColors();
  const { track } = useAnalytics('Favorites');

  const [favorites, setFavorites] = useState<FavoriteFood[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterValue>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Meal type picker state
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerItem, setPickerItem] = useState<FavoriteFood | null>(null);

  const loadFavorites = useCallback(async () => {
    try {
      const data = await favoritesService.getFavorites();
      setFavorites(data);
    } catch (err) {
      console.error('[FavoritesScreen] Failed to load favorites:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadFavorites();
    }, [loadFavorites]),
  );

  // Build enriched + filtered + grouped data
  const sections = useMemo(() => {
    // Enrich each item with inferred category and last-logged label
    let enriched = favorites.map((f) => ({
      ...f,
      _category: inferCategory(f.name),
      _lastLoggedLabel: formatLastLogged(f.created_at),
    }));

    // Apply text search
    if (search.trim()) {
      const q = search.toLowerCase();
      enriched = enriched.filter((f) => f.name.toLowerCase().includes(q));
    }

    // Apply category filter
    if (filter !== 'all') {
      enriched = enriched.filter((f) => f._category === filter);
    }

    // Sort by times_logged descending within each category
    enriched.sort((a, b) => b.times_logged - a.times_logged);

    // Group by category
    const groups: Record<MealType, typeof enriched> = {
      breakfast: [],
      lunch: [],
      dinner: [],
      snack: [],
    };
    for (const item of enriched) {
      groups[item._category].push(item);
    }

    // Build section list data
    const order: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
    return order
      .filter((key) => groups[key].length > 0)
      .map((key) => ({
        key,
        title: mealColors[key].label,
        icon: mealColors[key].icon,
        color: mealColors[key].color,
        data: groups[key],
      }));
  }, [favorites, search, filter]);

  const totalFiltered = useMemo(
    () => sections.reduce((sum, s) => sum + s.data.length, 0),
    [sections],
  );

  const handleLog = useCallback((item: FavoriteFood) => {
    haptics.selection();
    setPickerItem(item);
    setPickerVisible(true);
  }, []);

  const handleLogWithMealType = useCallback(async (mealType: MealType) => {
    if (!pickerItem) return;
    setPickerVisible(false);
    const item = pickerItem;
    setPickerItem(null);

    haptics.success();
    track('favorite_logged', { name: item.name, meal_type: mealType });
    try {
      await favoritesService.logFavorite(item.id, mealType);
      showNotification({
        message: `${item.name} registrado como ${mealColors[mealType].label}!`,
        type: 'success',
        icon: 'checkmark-circle',
      });
      // Refresh to update times_logged
      const data = await favoritesService.getFavorites();
      setFavorites(data);
    } catch {
      showNotification({
        message: 'Error al registrar',
        type: 'warning',
      });
    }
  }, [pickerItem, track]);

  const handleRemove = useCallback((item: FavoriteFood) => {
    Alert.alert(
      'Eliminar favorito',
      `Quitar "${item.name}" de tus favoritos?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            haptics.light();
            track('favorite_removed', { name: item.name });
            await favoritesService.removeFavorite(item.id);
            setFavorites((prev) => prev.filter((f) => f.id !== item.id));
            showNotification({
              message: `${item.name} eliminado de favoritos`,
              type: 'info',
              icon: 'heart-dislike',
            });
          },
        },
      ],
    );
  }, [track]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadFavorites();
  }, [loadFavorites]);

  const renderItem = useCallback(
    ({ item }: { item: FavoriteFood }) => (
      <FavoriteItem item={item} colors={c} onLog={handleLog} onRemove={handleRemove} />
    ),
    [c, handleLog, handleRemove],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: { title: string; icon: string; color: string; data: FavoriteFood[] } }) => (
      <SectionHeader
        title={section.title}
        icon={section.icon}
        color={section.color}
        count={section.data.length}
        textColor={c.black}
      />
    ),
    [c.black],
  );

  return (
    <View style={[styles.container, { backgroundColor: c.bg, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: sidePadding }]}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: c.surface }]}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Volver"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={20} color={c.black} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: c.black }]}>Mis Favoritos</Text>
          <FitsiMascot expression="love" size="small" />
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Search */}
      <View style={[styles.searchRow, { paddingHorizontal: sidePadding }]}>
        <View style={[styles.searchBox, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
          <Ionicons name="search" size={18} color={c.gray} />
          <TextInput
            style={[styles.searchInput, { color: c.black }]}
            placeholder="Buscar favoritos..."
            placeholderTextColor={c.gray}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={c.gray} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter chips */}
      <View style={[styles.filterRow, { paddingHorizontal: sidePadding }]}>
        {FILTER_OPTIONS.map((opt) => {
          const isActive = filter === opt.key;
          const chipColor = opt.key === 'all'
            ? c.accent
            : mealColors[opt.key]?.color ?? c.accent;
          return (
            <TouchableOpacity
              key={opt.key}
              style={[
                styles.filterChip,
                { backgroundColor: c.surface, borderColor: c.grayLight },
                isActive && { backgroundColor: chipColor, borderColor: chipColor },
              ]}
              onPress={() => {
                haptics.selection();
                setFilter(opt.key);
              }}
              activeOpacity={0.7}
            >
              <Ionicons
                name={opt.icon as any}
                size={13}
                color={isActive ? c.white : c.gray}
              />
              <Text
                style={[
                  styles.filterChipText,
                  { color: c.gray },
                  isActive && { color: c.white },
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Content */}
      {favorites.length === 0 && !loading ? (
        <View style={styles.emptyState}>
          <FitsiMascot expression="wink" size="medium" />
          <Text style={[styles.emptyTitle, { color: c.black }]}>
            No favorites yet
          </Text>
          <Text style={[styles.emptySubtitle, { color: c.gray }]}>
            Scan a meal to get started! Tap the heart on any food to save it here for quick logging.
          </Text>
        </View>
      ) : (
        <SwipeableRowProvider>
          <SectionList
            sections={sections}
            renderItem={renderItem}
            renderSectionHeader={renderSectionHeader}
            keyExtractor={(item) => item.id}
            stickySectionHeadersEnabled={false}
            contentContainerStyle={[
              styles.list,
              { paddingHorizontal: sidePadding, paddingBottom: insets.bottom + 20 },
            ]}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />
            }
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              (search.length > 0 || filter !== 'all') ? (
                <View style={styles.emptyState}>
                  <Ionicons name="search-outline" size={48} color={c.grayLight} />
                  <Text style={[styles.emptyTitle, { color: c.gray }]}>
                    No se encontraron favoritos
                  </Text>
                  <Text style={[styles.emptySubtitle, { color: c.gray }]}>
                    Intenta con otra busqueda o cambia el filtro.
                  </Text>
                </View>
              ) : null
            }
            ListHeaderComponent={
              totalFiltered > 0 ? (
                <Text style={[styles.resultCount, { color: c.gray }]}>
                  {totalFiltered} favorito{totalFiltered !== 1 ? 's' : ''}
                </Text>
              ) : null
            }
          />
        </SwipeableRowProvider>
      )}

      {/* Meal type picker modal */}
      <MealTypePicker
        visible={pickerVisible}
        itemName={pickerItem?.name ?? ''}
        colors={c}
        onSelect={handleLogWithMealType}
        onClose={() => {
          setPickerVisible(false);
          setPickerItem(null);
        }}
      />
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  headerTitle: {
    ...typography.title,
    fontSize: 20,
  },
  searchRow: {
    paddingVertical: spacing.sm,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    height: 44,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    paddingVertical: 0,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingBottom: spacing.sm,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  filterChipText: {
    ...typography.caption,
    fontWeight: '600',
  },
  resultCount: {
    ...typography.caption,
    marginBottom: spacing.sm,
  },
  list: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  sectionIconBg: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    ...typography.label,
    fontSize: 14,
    flex: 1,
  },
  sectionCount: {
    ...typography.caption,
    fontWeight: '700',
  },
  favItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    ...shadows.sm,
  },
  favLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
  },
  favEmoji: {
    fontSize: 32,
  },
  favInfo: {
    flex: 1,
    gap: 2,
  },
  favName: {
    ...typography.label,
    fontSize: 15,
  },
  favMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  favCals: {
    ...typography.caption,
  },
  logCountBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  logCountText: {
    fontSize: 10,
    fontWeight: '700',
  },
  lastLogged: {
    ...typography.caption,
    fontSize: 10,
    fontStyle: 'italic',
  },
  macrosRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  favActions: {
    alignItems: 'center',
    gap: spacing.sm,
    marginLeft: spacing.sm,
  },
  logBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  emptyTitle: {
    ...typography.title,
    fontSize: 18,
    textAlign: 'center',
  },
  emptySubtitle: {
    ...typography.subtitle,
    textAlign: 'center',
    lineHeight: 20,
  },
});
