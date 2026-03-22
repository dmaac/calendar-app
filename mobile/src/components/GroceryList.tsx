/**
 * GroceryList -- Smart grocery list generated from the weekly meal plan.
 *
 * Sprint 12 Features:
 * - Auto-generates shopping list from all meals in the week plan
 * - Groups items by category: Frutas, Verduras, Proteinas, Lacteos, Granos, Otros
 * - Checkbox to mark items as purchased
 * - Manual item addition with category picker
 * - Share list via native Share API
 * - Persists checked state + manual items in AsyncStorage
 * - Collapsible category sections
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Share,
  Platform,
  UIManager,
  LayoutAnimation,
  Alert,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useThemeColors, typography, spacing, radius, shadows } from '../theme';
import { haptics } from '../hooks/useHaptics';
import { recipes, Recipe } from '../data/recipes';

// Enable LayoutAnimation on Android
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// -- Storage key --
const STORAGE_KEY = '@fitsi_grocery_list';

// -- Category definitions --

export type GroceryCategory =
  | 'frutas'
  | 'verduras'
  | 'proteinas'
  | 'lacteos'
  | 'granos'
  | 'otros';

interface CategoryMeta {
  id: GroceryCategory;
  label: string;
  icon: string;
  color: string;
}

const CATEGORIES: CategoryMeta[] = [
  { id: 'frutas',    label: 'Frutas',    icon: 'nutrition-outline',    color: '#F59E0B' },
  { id: 'verduras',  label: 'Verduras',  icon: 'leaf-outline',         color: '#10B981' },
  { id: 'proteinas', label: 'Proteinas', icon: 'fitness-outline',      color: '#EF4444' },
  { id: 'lacteos',   label: 'Lacteos',   icon: 'water-outline',        color: '#3B82F6' },
  { id: 'granos',    label: 'Granos',    icon: 'grid-outline',         color: '#8B5CF6' },
  { id: 'otros',     label: 'Otros',     icon: 'basket-outline',       color: '#6B7280' },
];

const CATEGORY_MAP: Record<GroceryCategory, string[]> = {
  frutas: [
    'banana', 'manzana', 'berries', 'fresa', 'arandano', 'frambuesa', 'naranja',
    'limon', 'lima', 'palta', 'aguacate', 'avocado', 'durazno', 'piña', 'uva',
    'mango', 'kiwi', 'pera', 'melon', 'sandia', 'mandarina', 'pomelo', 'cereza',
    'fruta', 'tomate cherry', 'tomate',
  ],
  verduras: [
    'espinaca', 'lechuga', 'brocoli', 'zanahoria', 'cebolla', 'ajo', 'pimiento',
    'pepino', 'calabacin', 'zapallo', 'berenjena', 'apio', 'perejil', 'cilantro',
    'albahaca', 'rucula', 'kale', 'col', 'repollo', 'champiñon', 'hongos',
    'choclo', 'papa', 'camote', 'batata', 'coliflor', 'jengibre', 'verdura',
    'tomate', 'jitomate',
  ],
  proteinas: [
    'pollo', 'pechuga', 'carne', 'res', 'cerdo', 'salmon', 'atun', 'huevo',
    'pescado', 'camaron', 'jamon', 'tocino', 'bacon', 'pavo', 'lomo', 'filete',
    'carne molida', 'proteina', 'whey', 'tofu', 'tempeh', 'lentejas', 'garbanzos',
    'frijoles', 'porotos', 'edamame', 'soja',
  ],
  lacteos: [
    'leche', 'yogur', 'yogurt', 'queso', 'crema', 'mantequilla', 'nata',
    'ricotta', 'mozzarella', 'parmesano', 'cottage', 'skyr', 'kefir',
    'queso crema', 'cream cheese',
  ],
  granos: [
    'arroz', 'pasta', 'avena', 'pan', 'tostada', 'tortilla', 'quinoa', 'quinua',
    'trigo', 'harina', 'cereal', 'granola', 'cuscus', 'fideos', 'maiz',
    'wrap', 'pita', 'integral',
  ],
  otros: [],
};

// -- Types --

export interface GroceryItem {
  id: string;
  name: string;
  category: GroceryCategory;
  checked: boolean;
  isManual: boolean;
}

interface PersistedState {
  items: GroceryItem[];
  /** ISO timestamp of last generation to detect stale data */
  generatedAt: string;
}

// -- Helpers --

/** Classify an ingredient string into a grocery category. */
function classifyIngredient(ingredient: string): GroceryCategory {
  const lower = ingredient.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_MAP) as [GroceryCategory, string[]][]) {
    if (cat === 'otros') continue;
    for (const kw of keywords) {
      if (lower.includes(kw)) return cat;
    }
  }
  return 'otros';
}

/** Normalize an ingredient name: trim quantity prefixes like "3 huevos" -> "huevos", "200ml de leche" -> "leche". */
function normalizeIngredient(raw: string): string {
  return raw
    .replace(/^\d+(\.\d+)?\s*(g|gr|kg|ml|l|oz|cups?|cucharadas?|cucharaditas?|rebanadas?|rodajas?|dientes?|unidades?|tazas?|pizca|puñado)?\s*(de\s+)?/i, '')
    .replace(/\s+al\s+gusto$/i, '')
    .trim();
}

/** Generate unique id. */
let _idCounter = 0;
function uid(): string {
  return `gi_${Date.now()}_${++_idCounter}`;
}

/** Extract all unique ingredients from a set of recipe IDs and build grocery items. */
function buildGroceryFromRecipes(recipeIds: string[]): GroceryItem[] {
  const seen = new Map<string, GroceryItem>();

  for (const rid of recipeIds) {
    const recipe = recipes.find((r) => r.id === rid);
    if (!recipe) continue;
    for (const ing of recipe.ingredients) {
      const normalized = normalizeIngredient(ing);
      const key = normalized.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, {
          id: uid(),
          name: normalized.charAt(0).toUpperCase() + normalized.slice(1),
          category: classifyIngredient(ing),
          checked: false,
          isManual: false,
        });
      }
    }
  }

  return Array.from(seen.values());
}

// -- Props --

export interface GroceryListProps {
  /** Recipe IDs from the week's meal plan (breakfast + lunch + dinner x 7 days). */
  recipeIds: string[];
  /** Called when user wants to close / go back. */
  onClose?: () => void;
}

// -- Component --

function GroceryListInner({ recipeIds, onClose }: GroceryListProps) {
  const c = useThemeColors();
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [newItemText, setNewItemText] = useState('');
  const [newItemCategory, setNewItemCategory] = useState<GroceryCategory>('otros');
  const [showAddForm, setShowAddForm] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<GroceryCategory>>(new Set());

  // -- Load persisted state --
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          const parsed: PersistedState = JSON.parse(raw);
          setItems(parsed.items);
          setLoaded(true);
          return;
        } catch {
          // Corrupted, regenerate
        }
      }
      // Generate fresh list from recipe IDs
      const generated = buildGroceryFromRecipes(recipeIds);
      setItems(generated);
      setLoaded(true);
    });
  }, []);

  // -- Persist on change --
  const persist = useCallback((nextItems: GroceryItem[]) => {
    setItems(nextItems);
    const state: PersistedState = {
      items: nextItems,
      generatedAt: new Date().toISOString(),
    };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, []);

  // -- Regenerate from current meal plan --
  const handleRegenerate = useCallback(() => {
    haptics.medium();
    Alert.alert(
      'Regenerar lista',
      'Esto reemplazara la lista actual con los ingredientes del plan semanal. Los items manuales se mantendran.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Regenerar',
          onPress: () => {
            const generated = buildGroceryFromRecipes(recipeIds);
            // Keep manual items
            const manualItems = items.filter((i) => i.isManual);
            persist([...generated, ...manualItems]);
          },
        },
      ],
    );
  }, [recipeIds, items, persist]);

  // -- Toggle check --
  const toggleItem = useCallback((id: string) => {
    haptics.light();
    setItems((prev) => {
      const next = prev.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i));
      const state: PersistedState = {
        items: next,
        generatedAt: new Date().toISOString(),
      };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
      return next;
    });
  }, []);

  // -- Remove item --
  const removeItem = useCallback((id: string) => {
    haptics.heavy();
    setItems((prev) => {
      const next = prev.filter((i) => i.id !== id);
      const state: PersistedState = {
        items: next,
        generatedAt: new Date().toISOString(),
      };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
      return next;
    });
  }, []);

  // -- Add manual item --
  const handleAddItem = useCallback(() => {
    const trimmed = newItemText.trim();
    if (!trimmed) return;
    haptics.medium();
    const newItem: GroceryItem = {
      id: uid(),
      name: trimmed.charAt(0).toUpperCase() + trimmed.slice(1),
      category: newItemCategory,
      checked: false,
      isManual: true,
    };
    const next = [...items, newItem];
    persist(next);
    setNewItemText('');
    setShowAddForm(false);
  }, [newItemText, newItemCategory, items, persist]);

  // -- Toggle category collapse --
  const toggleCategory = useCallback((cat: GroceryCategory) => {
    haptics.light();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  // -- Share list --
  const handleShare = useCallback(async () => {
    haptics.medium();
    const unchecked = items.filter((i) => !i.checked);
    const grouped = CATEGORIES.map((cat) => {
      const catItems = unchecked.filter((i) => i.category === cat.id);
      if (catItems.length === 0) return '';
      return `${cat.label}:\n${catItems.map((i) => `  - ${i.name}`).join('\n')}`;
    })
      .filter(Boolean)
      .join('\n\n');

    const message = `Lista de Compras - FITSI\n\n${grouped}\n\nTotal: ${unchecked.length} items pendientes`;

    try {
      await Share.share({ message, title: 'Lista de Compras FITSI' });
    } catch {
      // User cancelled or share failed
    }
  }, [items]);

  // -- Grouped items by category --
  const grouped = useMemo(() => {
    return CATEGORIES.map((cat) => ({
      ...cat,
      items: items.filter((i) => i.category === cat.id),
    })).filter((g) => g.items.length > 0);
  }, [items]);

  // -- Stats --
  const totalItems = items.length;
  const checkedCount = items.filter((i) => i.checked).length;
  const progress = totalItems > 0 ? checkedCount / totalItems : 0;

  if (!loaded) return null;

  return (
    <KeyboardAvoidingView
      style={[s.container, { backgroundColor: c.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          {onClose && (
            <TouchableOpacity
              onPress={onClose}
              style={[s.backBtn, { backgroundColor: c.surface }]}
              accessibilityLabel="Cerrar lista de compras"
              accessibilityRole="button"
            >
              <Ionicons name="chevron-back" size={20} color={c.black} />
            </TouchableOpacity>
          )}
          <View>
            <Text style={[s.title, { color: c.black }]}>Lista de Compras</Text>
            <Text style={[s.subtitle, { color: c.gray }]}>
              {checkedCount}/{totalItems} comprados
            </Text>
          </View>
        </View>
        <View style={s.headerActions}>
          <TouchableOpacity
            onPress={handleRegenerate}
            style={[s.iconBtn, { backgroundColor: c.surface }]}
            accessibilityLabel="Regenerar lista"
            accessibilityRole="button"
          >
            <Ionicons name="refresh-outline" size={18} color={c.accent} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleShare}
            style={[s.iconBtn, { backgroundColor: c.surface }]}
            accessibilityLabel="Compartir lista"
            accessibilityRole="button"
          >
            <Ionicons name="share-outline" size={18} color={c.accent} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Progress bar */}
      <View style={[s.progressContainer, { backgroundColor: c.surface }]}>
        <View style={[s.progressBg, { backgroundColor: c.grayLight }]}>
          <View
            style={[
              s.progressFill,
              {
                backgroundColor: progress >= 1 ? c.success : c.accent,
                width: `${Math.min(progress * 100, 100)}%`,
              },
            ]}
          />
        </View>
        <Text style={[s.progressText, { color: c.gray }]}>
          {Math.round(progress * 100)}% completado
        </Text>
      </View>

      {/* Category list */}
      <FlatList
        data={grouped}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.listContent}
        renderItem={({ item: group }) => {
          const isCollapsed = collapsedCategories.has(group.id);
          const groupChecked = group.items.filter((i) => i.checked).length;
          return (
            <View style={[s.categoryCard, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
              {/* Category header */}
              <TouchableOpacity
                style={s.categoryHeader}
                onPress={() => toggleCategory(group.id)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${group.label}, ${group.items.length} items, ${isCollapsed ? 'expandir' : 'colapsar'}`}
                accessibilityState={{ expanded: !isCollapsed }}
              >
                <View style={[s.categoryIcon, { backgroundColor: group.color + '15' }]}>
                  <Ionicons name={group.icon as any} size={16} color={group.color} />
                </View>
                <Text style={[s.categoryLabel, { color: c.black }]}>{group.label}</Text>
                <View style={[s.categoryBadge, { backgroundColor: c.grayLight }]}>
                  <Text style={[s.categoryCount, { color: c.gray }]}>
                    {groupChecked}/{group.items.length}
                  </Text>
                </View>
                <Ionicons
                  name={isCollapsed ? 'chevron-down' : 'chevron-up'}
                  size={16}
                  color={c.gray}
                />
              </TouchableOpacity>

              {/* Items */}
              {!isCollapsed &&
                group.items.map((item) => (
                  <View
                    key={item.id}
                    style={[s.itemRow, { borderTopColor: c.grayLight }]}
                  >
                    <TouchableOpacity
                      style={s.itemLeft}
                      onPress={() => toggleItem(item.id)}
                      activeOpacity={0.7}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: item.checked }}
                      accessibilityLabel={`${item.name}${item.checked ? ', comprado' : ''}`}
                    >
                      <View
                        style={[
                          s.checkbox,
                          { borderColor: c.grayLight },
                          item.checked && { backgroundColor: c.success, borderColor: c.success },
                        ]}
                      >
                        {item.checked && (
                          <Ionicons name="checkmark" size={14} color="#FFF" />
                        )}
                      </View>
                      <Text
                        style={[
                          s.itemName,
                          { color: c.black },
                          item.checked && { textDecorationLine: 'line-through', color: c.gray },
                        ]}
                      >
                        {item.name}
                      </Text>
                      {item.isManual && (
                        <View style={[s.manualBadge, { backgroundColor: c.accent + '15' }]}>
                          <Text style={[s.manualBadgeText, { color: c.accent }]}>manual</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => removeItem(item.id)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityLabel={`Eliminar ${item.name}`}
                    >
                      <Ionicons name="close-circle-outline" size={18} color={c.gray} />
                    </TouchableOpacity>
                  </View>
                ))}
            </View>
          );
        }}
        ListFooterComponent={
          <View style={{ height: spacing.xxl + 80 }} />
        }
      />

      {/* Add item form / FAB */}
      {showAddForm ? (
        <View style={[s.addForm, { backgroundColor: c.surface, borderTopColor: c.border }]}>
          <TextInput
            style={[s.addInput, { color: c.black, backgroundColor: c.bg, borderColor: c.grayLight }]}
            placeholder="Nombre del item..."
            placeholderTextColor={c.gray}
            value={newItemText}
            onChangeText={setNewItemText}
            onSubmitEditing={handleAddItem}
            returnKeyType="done"
            autoFocus
            accessibilityLabel="Nombre del item a agregar"
          />
          {/* Category selector */}
          <View style={s.catPickerRow}>
            {CATEGORIES.map((cat) => {
              const isSelected = newItemCategory === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    s.catChip,
                    { borderColor: isSelected ? cat.color : c.grayLight },
                    isSelected && { backgroundColor: cat.color + '15' },
                  ]}
                  onPress={() => {
                    haptics.selection();
                    setNewItemCategory(cat.id);
                  }}
                  accessibilityLabel={`Categoria ${cat.label}`}
                  accessibilityState={{ selected: isSelected }}
                >
                  <Ionicons name={cat.icon as any} size={12} color={isSelected ? cat.color : c.gray} />
                  <Text
                    style={[
                      s.catChipText,
                      { color: isSelected ? cat.color : c.gray },
                    ]}
                  >
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={s.addFormActions}>
            <TouchableOpacity
              onPress={() => {
                setShowAddForm(false);
                setNewItemText('');
              }}
              style={[s.addCancelBtn, { borderColor: c.grayLight }]}
              accessibilityLabel="Cancelar"
            >
              <Text style={[s.addCancelText, { color: c.gray }]}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleAddItem}
              style={[s.addConfirmBtn, { backgroundColor: c.accent }]}
              disabled={!newItemText.trim()}
              accessibilityLabel="Agregar item"
            >
              <Ionicons name="add" size={18} color="#FFF" />
              <Text style={s.addConfirmText}>Agregar</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={[s.fab, { backgroundColor: c.accent }]}
          onPress={() => {
            haptics.light();
            setShowAddForm(true);
          }}
          activeOpacity={0.8}
          accessibilityLabel="Agregar item manualmente"
          accessibilityRole="button"
        >
          <Ionicons name="add" size={24} color="#FFF" />
        </TouchableOpacity>
      )}
    </KeyboardAvoidingView>
  );
}

export default React.memo(GroceryListInner);

// -- Styles --

const s = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.titleSm,
  },
  subtitle: {
    ...typography.caption,
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Progress
  progressContainer: {
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.lg,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  progressBg: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    ...typography.caption,
    textAlign: 'center',
  },

  // List
  listContent: {
    paddingHorizontal: spacing.lg,
  },

  // Category card
  categoryCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.sm,
    overflow: 'hidden',
    ...shadows.sm,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.sm,
  },
  categoryIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryLabel: {
    ...typography.label,
    flex: 1,
  },
  categoryBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  categoryCount: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '600',
  },

  // Item row
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderTopWidth: 1,
  },
  itemLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemName: {
    ...typography.body,
    flex: 1,
  },
  manualBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.full,
  },
  manualBadgeText: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: '600',
  },

  // Add form
  addForm: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.md,
    paddingBottom: spacing.xl,
    borderTopWidth: 1,
    ...shadows.lg,
  },
  addInput: {
    ...typography.body,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.sm,
  },
  catPickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  catChipText: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '600',
  },
  addFormActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  addCancelBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  addCancelText: {
    ...typography.label,
  },
  addConfirmBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
  },
  addConfirmText: {
    ...typography.label,
    color: '#FFF',
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: spacing.xl,
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.lg,
  },
});
