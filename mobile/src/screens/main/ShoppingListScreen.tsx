/**
 * ShoppingListScreen — Shopping list generated from meal plan.
 *
 * Fetches GET /api/risk/shopping-list?days=3
 * Groups items by category with section headers.
 * Each item has name, quantity, and a local checkbox.
 * Share button exports list as plain text.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  RefreshControl,
  Share,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useThemeColors, typography, spacing, radius, useLayout } from '../../theme';
import { apiClient } from '../../services/apiClient';
import { haptics } from '../../hooks/useHaptics';

interface ShoppingItem {
  name: string;
  quantity: string;
  category: string;
}

interface ShoppingListResponse {
  items: ShoppingItem[];
}

export default function ShoppingListScreen() {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const { sidePadding } = useLayout();
  const navigation = useNavigation();

  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const fetchList = useCallback(async () => {
    try {
      const res = await apiClient.get<ShoppingListResponse>('/api/risk/shopping-list', {
        params: { days: 3 },
      });
      setItems(res.data.items ?? []);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchList();
    setRefreshing(false);
  }, [fetchList]);

  const toggleItem = useCallback((name: string) => {
    haptics.light();
    setChecked((prev) => ({ ...prev, [name]: !prev[name] }));
  }, []);

  const sections = useMemo(() => {
    const grouped: Record<string, ShoppingItem[]> = {};
    for (const item of items) {
      const cat = item.category || 'Otros';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(item);
    }
    return Object.keys(grouped)
      .sort()
      .map((title) => ({ title, data: grouped[title] }));
  }, [items]);

  const onShare = useCallback(async () => {
    haptics.medium();
    const lines: string[] = ['Lista de compras (3 dias)', ''];
    for (const section of sections) {
      lines.push(`-- ${section.title} --`);
      for (const item of section.data) {
        const mark = checked[item.name] ? '[x]' : '[ ]';
        lines.push(`${mark} ${item.name} - ${item.quantity}`);
      }
      lines.push('');
    }
    try {
      await Share.share({ message: lines.join('\n') });
    } catch {
      // User cancelled
    }
  }, [sections, checked]);

  const onBack = useCallback(() => {
    haptics.light();
    navigation.goBack();
  }, [navigation]);

  const renderItem = useCallback(
    ({ item }: { item: ShoppingItem }) => {
      const isChecked = checked[item.name] ?? false;
      return (
        <TouchableOpacity
          onPress={() => toggleItem(item.name)}
          style={[styles.itemRow, { borderBottomColor: c.grayLight }]}
          accessibilityLabel={`${item.name}, ${item.quantity}${isChecked ? ', marcado' : ''}`}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isChecked }}
        >
          <View style={[styles.checkbox, { borderColor: isChecked ? c.primary : c.gray }]}>
            {isChecked && <Ionicons name="checkmark" size={14} color={c.primary} />}
          </View>
          <View style={styles.itemTextCol}>
            <Text
              style={[
                styles.itemName,
                { color: c.black },
                isChecked && styles.itemChecked,
              ]}
            >
              {item.name}
            </Text>
            <Text style={[styles.itemQty, { color: c.gray }]}>{item.quantity}</Text>
          </View>
        </TouchableOpacity>
      );
    },
    [checked, toggleItem, c],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: { title: string } }) => (
      <View style={[styles.sectionHeader, { backgroundColor: c.bg }]}>
        <Text style={[styles.sectionTitle, { color: c.black }]}>{section.title}</Text>
      </View>
    ),
    [c],
  );

  if (loading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
        <View style={[styles.header, { paddingHorizontal: sidePadding }]}>
          <TouchableOpacity onPress={onBack} style={[styles.backBtn, { backgroundColor: c.surface }]}>
            <Ionicons name="arrow-back" size={20} color={c.black} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: c.black }]}>Lista de Compras</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: sidePadding }]}>
        <TouchableOpacity
          onPress={onBack}
          style={[styles.backBtn, { backgroundColor: c.surface }]}
          accessibilityLabel="Volver"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={20} color={c.black} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.black }]}>Lista de Compras</Text>
        <TouchableOpacity
          onPress={onShare}
          style={[styles.backBtn, { backgroundColor: c.surface }]}
          accessibilityLabel="Compartir lista"
          accessibilityRole="button"
        >
          <Ionicons name="share-outline" size={20} color={c.black} />
        </TouchableOpacity>
      </View>

      {error || items.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="cart-outline" size={48} color={c.gray} />
          <Text style={[styles.emptyText, { color: c.gray }]}>
            {error ? 'No se pudo cargar la lista' : 'Sin items por ahora'}
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item, index) => `${item.name}-${index}`}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={[styles.list, { paddingHorizontal: sidePadding }]}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.black} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typography.titleSm,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  emptyText: {
    ...typography.bodyMd,
    textAlign: 'center',
  },
  list: {
    paddingBottom: spacing.xxl,
  },
  sectionHeader: {
    paddingVertical: spacing.sm,
    paddingTop: spacing.md,
  },
  sectionTitle: {
    ...typography.label,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: spacing.sm,
    borderBottomWidth: 1,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTextCol: {
    flex: 1,
    gap: 2,
  },
  itemName: {
    ...typography.bodyMd,
    fontWeight: '500',
  },
  itemQty: {
    ...typography.caption,
  },
  itemChecked: {
    textDecorationLine: 'line-through',
    opacity: 0.5,
  },
});
