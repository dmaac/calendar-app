/**
 * FavoritesScreen — Smart Favorites
 * Guarda tus platos favoritos para registrarlos con un solo tap.
 *
 * Features:
 * - List of saved favorite foods with macros
 * - Quick-log with one tap (+ button)
 * - Remove from favorites (heart button)
 * - Search/filter favorites
 * - Empty state with Fitsi mascot
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  RefreshControl,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useThemeColors, typography, spacing, radius, shadows, useLayout } from '../../theme';
import { haptics } from '../../hooks/useHaptics';
import { useAnalytics } from '../../hooks/useAnalytics';
import FitsiMascot from '../../components/FitsiMascot';
import { showNotification } from '../../components/InAppNotification';
import * as favoritesService from '../../services/favorites.service';
import type { FavoriteFood } from '../../services/favorites.service';

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

// ── Favorite item ────────────────────────────────────────────────────────────

const FavoriteItem = React.memo(function FavoriteItem({
  item,
  colors: c,
  onLog,
  onRemove,
}: {
  item: FavoriteFood;
  colors: ReturnType<typeof useThemeColors>;
  onLog: (item: FavoriteFood) => void;
  onRemove: (item: FavoriteFood) => void;
}) {
  return (
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
          <Text style={[styles.favCals, { color: c.gray }]}>
            {Math.round(item.calories)} kcal
            {item.times_logged > 0 ? ` · ${item.times_logged}x` : ''}
          </Text>
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
        <TouchableOpacity
          onPress={() => onRemove(item)}
          activeOpacity={0.7}
          accessibilityLabel={`Eliminar ${item.name} de favoritos`}
          accessibilityRole="button"
        >
          <Ionicons name="heart" size={22} color="#EF4444" />
        </TouchableOpacity>
      </View>
    </View>
  );
});

// ── Main screen ──────────────────────────────────────────────────────────────

export default function FavoritesScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { contentWidth, sidePadding } = useLayout();
  const c = useThemeColors();
  const { track } = useAnalytics('Favorites');

  const [favorites, setFavorites] = useState<FavoriteFood[]>([]);
  const [filtered, setFiltered] = useState<FavoriteFood[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadFavorites = useCallback(async () => {
    try {
      const data = await favoritesService.getFavorites();
      setFavorites(data);
    } catch {
      // Already handled by service fallback
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

  // Filter when search changes
  useEffect(() => {
    if (!search.trim()) {
      setFiltered(favorites);
    } else {
      const q = search.toLowerCase();
      setFiltered(favorites.filter((f) => f.name.toLowerCase().includes(q)));
    }
  }, [search, favorites]);

  const handleLog = useCallback(async (item: FavoriteFood) => {
    haptics.success();
    track('favorite_logged', { name: item.name });
    try {
      await favoritesService.logFavorite(item.id);
      showNotification({
        message: `${item.name} registrado!`,
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
  }, [track]);

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

      {/* Content */}
      {favorites.length === 0 && !loading ? (
        <View style={styles.emptyState}>
          <FitsiMascot expression="wink" size="medium" />
          <Text style={[styles.emptyTitle, { color: c.black }]}>
            Agrega tu primera comida favorita!
          </Text>
          <Text style={[styles.emptySubtitle, { color: c.gray }]}>
            Escanea o registra comidas y toca el corazon para guardarlas aqui.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.list,
            { paddingHorizontal: sidePadding, paddingBottom: insets.bottom + 20 },
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />
          }
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            search.length > 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="search-outline" size={48} color={c.grayLight} />
                <Text style={[styles.emptyTitle, { color: c.gray }]}>
                  No se encontraron favoritos
                </Text>
              </View>
            ) : null
          }
        />
      )}
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
  list: {
    gap: spacing.sm,
    paddingTop: spacing.xs,
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
  favCals: {
    ...typography.caption,
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
