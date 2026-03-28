/**
 * GroupsScreen -- Community groups discovery and membership.
 *
 * Features:
 * - "Your Groups" section with joined groups showing member count & activity level
 * - "Discover Groups" section with recommended groups, categories, and activity indicators
 * - Search/filter bar to find groups by name or category
 * - "Join Group" button with confirmation alert
 * - Group category badges (nutrition, fitness, weight loss, etc.)
 * - Activity level indicator (active, moderate, new)
 * - Weekly challenges banner
 * - Dark mode support via theme system
 * - Haptic feedback on interactions
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, typography, spacing, radius, shadows } from '../../theme';
import { haptics } from '../../hooks/useHaptics';
import { useAnalytics } from '../../hooks/useAnalytics';
import type { MainTabScreenProps } from '../../navigation/types';

// ─── Types ───────────────────────────────────────────────────────────────────

type GroupCategory = 'weight_loss' | 'clean_eating' | 'protein' | 'vegan' | 'fitness' | 'beginners' | 'keto' | 'running';
type ActivityLevel = 'high' | 'medium' | 'new';

interface Group {
  id: string;
  name: string;
  emoji: string;
  members: number;
  category: GroupCategory;
  activityLevel: ActivityLevel;
  description: string;
  postsThisWeek: number;
}

// ─── Data ───────────────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<GroupCategory, { label: string; color: string }> = {
  weight_loss: { label: 'Perdida de peso', color: '#EF4444' },
  clean_eating: { label: 'Comida saludable', color: '#10B981' },
  protein: { label: 'Proteina', color: '#8B5CF6' },
  vegan: { label: 'Vegano', color: '#22C55E' },
  fitness: { label: 'Fitness', color: '#F59E0B' },
  beginners: { label: 'Principiantes', color: '#3B82F6' },
  keto: { label: 'Keto', color: '#EC4899' },
  running: { label: 'Running', color: '#06B6D4' },
};

const ACTIVITY_CONFIG: Record<ActivityLevel, { label: string; color: string; icon: string }> = {
  high: { label: 'Muy activo', color: '#10B981', icon: 'flash' },
  medium: { label: 'Activo', color: '#F59E0B', icon: 'pulse' },
  new: { label: 'Nuevo', color: '#3B82F6', icon: 'sparkles' },
};

const ALL_GROUPS: Group[] = [
  {
    id: 'g1',
    name: 'Weight Loss Warriors',
    emoji: '\u{1F525}',
    members: 1200,
    category: 'weight_loss',
    activityLevel: 'high',
    description: 'Grupo para quienes buscan perder peso de forma saludable y sostenible.',
    postsThisWeek: 48,
  },
  {
    id: 'g2',
    name: 'Clean Eating Club',
    emoji: '\u{1F957}',
    members: 890,
    category: 'clean_eating',
    activityLevel: 'high',
    description: 'Recetas, tips y motivacion para comer limpio todos los dias.',
    postsThisWeek: 35,
  },
  {
    id: 'g3',
    name: 'Protein Kings',
    emoji: '\u{1F4AA}',
    members: 2100,
    category: 'protein',
    activityLevel: 'high',
    description: 'Maximiza tu ingesta de proteina. Compartimos recetas high-protein.',
    postsThisWeek: 62,
  },
  {
    id: 'g4',
    name: 'Vegan Journey',
    emoji: '\u{1F331}',
    members: 650,
    category: 'vegan',
    activityLevel: 'medium',
    description: 'Nutricion vegana equilibrada. Macros, recetas y suplementos.',
    postsThisWeek: 18,
  },
  {
    id: 'g5',
    name: 'Fitness & Nutrition',
    emoji: '\u{1F3CB}\u{FE0F}',
    members: 3400,
    category: 'fitness',
    activityLevel: 'high',
    description: 'La comunidad mas grande de fitness y nutricion en Fitsi.',
    postsThisWeek: 89,
  },
  {
    id: 'g6',
    name: 'Beginners Welcome',
    emoji: '\u{1F44B}',
    members: 1800,
    category: 'beginners',
    activityLevel: 'medium',
    description: 'Espacio seguro para principiantes. Preguntas basicas bienvenidas.',
    postsThisWeek: 24,
  },
  {
    id: 'g7',
    name: 'Keto Warriors',
    emoji: '\u{1F969}',
    members: 920,
    category: 'keto',
    activityLevel: 'medium',
    description: 'Dieta cetogenica: recetas, macros y experiencias.',
    postsThisWeek: 21,
  },
  {
    id: 'g8',
    name: 'Runners Fuel',
    emoji: '\u{1F3C3}',
    members: 450,
    category: 'running',
    activityLevel: 'new',
    description: 'Nutricion optimizada para corredores. Pre, durante y post carrera.',
    postsThisWeek: 8,
  },
];

const FILTER_OPTIONS: { key: 'all' | GroupCategory; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'weight_loss', label: 'Peso' },
  { key: 'clean_eating', label: 'Saludable' },
  { key: 'protein', label: 'Proteina' },
  { key: 'fitness', label: 'Fitness' },
  { key: 'vegan', label: 'Vegano' },
  { key: 'keto', label: 'Keto' },
];

function formatMembers(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K miembros`;
  return `${n} miembros`;
}

// ─── Search Bar ──────────────────────────────────────────────────────────────

function SearchBar({
  value,
  onChangeText,
  colors,
}: {
  value: string;
  onChangeText: (text: string) => void;
  colors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View style={[s.searchBar, { backgroundColor: colors.surface }]}>
      <Ionicons name="search" size={18} color={colors.gray} />
      <TextInput
        style={[s.searchInput, { color: colors.black }]}
        placeholder="Buscar grupos..."
        placeholderTextColor={colors.disabled}
        value={value}
        onChangeText={onChangeText}
        returnKeyType="search"
        autoCorrect={false}
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={() => onChangeText('')} activeOpacity={0.7}>
          <Ionicons name="close-circle" size={18} color={colors.gray} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Category Filter ─────────────────────────────────────────────────────────

function CategoryFilter({
  selected,
  onSelect,
  colors,
}: {
  selected: 'all' | GroupCategory;
  onSelect: (key: 'all' | GroupCategory) => void;
  colors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.filterRow}
      style={s.filterScroll}
    >
      {FILTER_OPTIONS.map((opt) => {
        const isActive = selected === opt.key;
        return (
          <TouchableOpacity
            key={opt.key}
            style={[
              s.filterChip,
              { backgroundColor: isActive ? colors.accent : colors.surface },
            ]}
            onPress={() => {
              haptics.light();
              onSelect(opt.key);
            }}
            activeOpacity={0.7}
            accessibilityLabel={`Filtrar por ${opt.label}`}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
          >
            <Text
              style={[
                s.filterChipText,
                { color: isActive ? '#FFFFFF' : colors.gray },
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// ─── Group Card ─────────────────────────────────────────────────────────────

function GroupCard({
  group,
  joined,
  onToggle,
  colors,
}: {
  group: Group;
  joined: boolean;
  onToggle: () => void;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const catConfig = CATEGORY_CONFIG[group.category];
  const actConfig = ACTIVITY_CONFIG[group.activityLevel];

  return (
    <View
      style={[s.card, { backgroundColor: colors.surface }]}
      accessibilityLabel={`Grupo ${group.name}, ${formatMembers(group.members)}, ${catConfig.label}${joined ? ', unido' : ''}`}
    >
      {/* Top row: emoji + info + join button */}
      <View style={s.cardTopRow}>
        <View style={[s.cardEmoji, { backgroundColor: colors.surfaceAlt }]}>
          <Text style={s.emoji}>{group.emoji}</Text>
        </View>
        <View style={s.cardInfo}>
          <Text style={[s.cardName, { color: colors.black }]} numberOfLines={1}>
            {group.name}
          </Text>
          <Text style={[s.cardMembers, { color: colors.gray }]}>
            {formatMembers(group.members)}
          </Text>
        </View>
        <TouchableOpacity
          style={[
            s.joinBtn,
            joined
              ? { backgroundColor: colors.surfaceAlt }
              : { backgroundColor: colors.accent },
          ]}
          onPress={onToggle}
          activeOpacity={0.7}
          accessibilityLabel={joined ? `Salir de ${group.name}` : `Unirse a ${group.name}`}
          accessibilityRole="button"
        >
          <Ionicons
            name={joined ? 'checkmark' : 'add'}
            size={14}
            color={joined ? colors.gray : '#FFFFFF'}
            style={{ marginRight: 2 }}
          />
          <Text
            style={[
              s.joinText,
              { color: joined ? colors.gray : '#FFFFFF' },
            ]}
          >
            {joined ? 'Unido' : 'Unirse'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Description */}
      <Text style={[s.cardDesc, { color: colors.gray }]} numberOfLines={2}>
        {group.description}
      </Text>

      {/* Bottom: category badge + activity level */}
      <View style={s.cardBottom}>
        <View style={[s.categoryBadge, { backgroundColor: catConfig.color + '15' }]}>
          <Text style={[s.categoryBadgeText, { color: catConfig.color }]}>
            {catConfig.label}
          </Text>
        </View>
        <View style={s.activityRow}>
          <Ionicons name={actConfig.icon as any} size={12} color={actConfig.color} />
          <Text style={[s.activityText, { color: actConfig.color }]}>
            {actConfig.label}
          </Text>
        </View>
        <Text style={[s.postsWeek, { color: colors.disabled }]}>
          {group.postsThisWeek} posts/sem
        </Text>
      </View>
    </View>
  );
}

// ─── Recommended Section Header ─────────────────────────────────────────────

function DiscoverHeader({ count, colors }: { count: number; colors: ReturnType<typeof useThemeColors> }) {
  return (
    <View style={s.discoverHeader}>
      <View>
        <Text style={[s.sectionTitle, { color: colors.black }]}>Descubrir Grupos</Text>
        <Text style={[s.sectionSubtitle, { color: colors.gray }]}>
          {count} grupos disponibles para ti
        </Text>
      </View>
      <View style={[s.discoverBadge, { backgroundColor: colors.accent + '15' }]}>
        <Ionicons name="compass" size={16} color={colors.accent} />
      </View>
    </View>
  );
}

// ─── Empty state ────────────────────────────────────────────────────────────

function EmptyGroups({
  onDiscover,
  colors,
}: {
  onDiscover: () => void;
  colors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View style={[s.emptyContainer, { backgroundColor: colors.surface }]}>
      <Text style={[s.emptyTitle, { color: colors.black, marginTop: spacing.sm }]}>
        Unete a tu primer grupo!
      </Text>
      <Text style={[s.emptySubtitle, { color: colors.gray }]}>
        Conecta con personas que comparten tus mismos objetivos de nutricion y fitness
      </Text>
      <TouchableOpacity
        style={[s.ctaBtn, { backgroundColor: colors.accent }]}
        onPress={() => {
          haptics.light();
          onDiscover();
        }}
        activeOpacity={0.7}
        accessibilityLabel="Explorar grupos"
        accessibilityRole="button"
        accessibilityHint="Desplaza hacia abajo para ver los grupos disponibles"
      >
        <Ionicons name="compass-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
        <Text style={[s.ctaText, { color: '#FFFFFF' }]}>Explorar grupos</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── No results state ────────────────────────────────────────────────────────

function NoResults({ query, colors }: { query: string; colors: ReturnType<typeof useThemeColors> }) {
  return (
    <View style={s.noResultsContainer}>
      <Ionicons name="search-outline" size={40} color={colors.disabled} />
      <Text style={[s.noResultsTitle, { color: colors.black }]}>Sin resultados</Text>
      <Text style={[s.noResultsDesc, { color: colors.gray }]}>
        No encontramos grupos que coincidan con "{query}". Intenta con otro termino.
      </Text>
    </View>
  );
}

// ─── Main Screen ────────────────────────────────────────────────────────────

export default function GroupsScreen({ navigation }: MainTabScreenProps<'Groups'>) {
  const insets = useSafeAreaInsets();
  const c = useThemeColors();
  const { track } = useAnalytics('Groups');
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | GroupCategory>('all');
  const scrollRef = React.useRef<ScrollView>(null);

  const toggleGroup = useCallback(
    (id: string) => {
      const group = ALL_GROUPS.find((g) => g.id === id);
      const isCurrentlyJoined = joinedIds.has(id);

      if (!isCurrentlyJoined) {
        // Show confirmation before joining
        Alert.alert(
          `Unirse a ${group?.name ?? 'grupo'}?`,
          group?.description ?? 'Quieres unirte a este grupo?',
          [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Unirse',
              onPress: () => {
                haptics.success();
                setJoinedIds((prev) => {
                  const next = new Set(prev);
                  next.add(id);
                  return next;
                });
                track('group_joined', { group_id: id, group_name: group?.name });
              },
            },
          ],
        );
      } else {
        // Leave group directly
        haptics.light();
        setJoinedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        track('group_left', { group_id: id, group_name: group?.name });
      }
    },
    [joinedIds, track],
  );

  const scrollToDiscover = useCallback(() => {
    scrollRef.current?.scrollTo({ y: 400, animated: true });
  }, []);

  // Filter groups based on search and category
  const filteredGroups = useMemo(() => {
    let groups = ALL_GROUPS;

    if (categoryFilter !== 'all') {
      groups = groups.filter((g) => g.category === categoryFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      groups = groups.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          g.description.toLowerCase().includes(q) ||
          CATEGORY_CONFIG[g.category].label.toLowerCase().includes(q),
      );
    }

    return groups;
  }, [searchQuery, categoryFilter]);

  const yourGroups = useMemo(
    () => filteredGroups.filter((g) => joinedIds.has(g.id)),
    [filteredGroups, joinedIds],
  );

  const discoverGroups = useMemo(
    () => filteredGroups.filter((g) => !joinedIds.has(g.id)),
    [filteredGroups, joinedIds],
  );

  const hasActiveSearch = searchQuery.trim().length > 0 || categoryFilter !== 'all';

  return (
    <View style={[s.container, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={s.header}>
        <Text style={[s.headerTitle, { color: c.black }]} accessibilityRole="header">
          Grupos
        </Text>
        <View style={[s.headerBadge, { backgroundColor: c.accent + '15' }]}>
          <Ionicons name="people" size={14} color={c.accent} />
          <Text style={[s.headerBadgeText, { color: c.accent }]}>
            {joinedIds.size}
          </Text>
        </View>
      </View>

      {/* Search bar */}
      <View style={s.searchWrapper}>
        <SearchBar value={searchQuery} onChangeText={setSearchQuery} colors={c} />
      </View>

      {/* Category filter */}
      <CategoryFilter selected={categoryFilter} onSelect={setCategoryFilter} colors={c} />

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        bounces={true}
        overScrollMode="never"
        keyboardShouldPersistTaps="handled"
      >
        {/* Challenges Banner */}
        <TouchableOpacity
          style={[s.challengesBanner, { backgroundColor: c.accent + '15' }]}
          activeOpacity={0.7}
          onPress={() => {
            haptics.light();
            track('challenges_opened');
            navigation.navigate('Inicio', { screen: 'Challenges' });
          }}
          accessibilityLabel="Desafios semanales. Compite y gana XP cada semana"
          accessibilityRole="button"
          accessibilityHint="Abre la pantalla de desafios semanales"
        >
          <Ionicons name="trophy" size={22} color={c.accent} />
          <View style={s.challengesBannerInfo}>
            <Text style={[s.challengesBannerTitle, { color: c.black }]}>
              Desafios Semanales
            </Text>
            <Text style={[s.challengesBannerDesc, { color: c.gray }]}>
              Compite y gana XP cada semana
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={c.gray} />
        </TouchableOpacity>

        {/* No results */}
        {hasActiveSearch && filteredGroups.length === 0 && (
          <NoResults query={searchQuery || FILTER_OPTIONS.find(f => f.key === categoryFilter)?.label || ''} colors={c} />
        )}

        {/* Your Groups */}
        {(!hasActiveSearch || yourGroups.length > 0) && (
          <>
            <Text style={[s.sectionTitle, { color: c.black }]}>Tus Grupos</Text>

            {yourGroups.length === 0 && !hasActiveSearch ? (
              <EmptyGroups onDiscover={scrollToDiscover} colors={c} />
            ) : yourGroups.length === 0 ? null : (
              yourGroups.map((g) => (
                <GroupCard
                  key={g.id}
                  group={g}
                  joined
                  onToggle={() => toggleGroup(g.id)}
                  colors={c}
                />
              ))
            )}
          </>
        )}

        {/* Discover */}
        {discoverGroups.length > 0 && (
          <>
            <View style={{ marginTop: spacing.xl }}>
              <DiscoverHeader count={discoverGroups.length} colors={c} />
            </View>

            {discoverGroups.map((g) => (
              <GroupCard
                key={g.id}
                group={g}
                joined={false}
                onToggle={() => toggleGroup(g.id)}
                colors={c}
              />
            ))}
          </>
        )}

        {/* All joined message */}
        {!hasActiveSearch && discoverGroups.length === 0 && yourGroups.length > 0 && (
          <View style={s.allJoinedContainer}>
            <Ionicons name="checkmark-circle" size={24} color={c.accent} />
            <Text style={[s.allJoined, { color: c.gray }]}>
              Te has unido a todos los grupos disponibles!
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    ...typography.title,
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
  },
  headerBadgeText: {
    ...typography.label,
    fontWeight: '700',
  },

  // ─── Search ──────────────────────────────────────────────────────────────────
  searchWrapper: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    height: 44,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    height: 44,
  },

  // ─── Category filter ─────────────────────────────────────────────────────────
  filterScroll: {
    maxHeight: 44,
    marginBottom: spacing.sm,
  },
  filterRow: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    flexDirection: 'row',
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
  },
  filterChipText: {
    ...typography.label,
  },

  // ─── Scroll ──────────────────────────────────────────────────────────────────
  scroll: {
    paddingHorizontal: spacing.lg,
  },
  sectionTitle: {
    ...typography.titleSm,
    marginBottom: spacing.md,
  },
  sectionSubtitle: {
    ...typography.caption,
    marginTop: 2,
  },

  // ─── Card ─────────────────────────────────────────────────────────────────────
  card: {
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardEmoji: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 22,
  },
  cardInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  cardName: {
    ...typography.bodyMd,
    fontWeight: '600',
  },
  cardMembers: {
    ...typography.caption,
    marginTop: 2,
  },
  cardDesc: {
    ...typography.caption,
    lineHeight: 17,
    marginTop: spacing.sm,
    marginLeft: 44 + spacing.md,
  },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    marginLeft: 44 + spacing.md,
    gap: spacing.sm,
  },
  categoryBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  activityText: {
    fontSize: 10,
    fontWeight: '600',
  },
  postsWeek: {
    fontSize: 10,
    marginLeft: 'auto',
  },
  joinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 3,
  },
  joinText: {
    ...typography.label,
    fontSize: 12,
  },

  // ─── Discover header ─────────────────────────────────────────────────────────
  discoverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  discoverBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ─── Empty state ──────────────────────────────────────────────────────────────
  emptyContainer: {
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    ...typography.bodyMd,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    ...typography.caption,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 17,
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.full,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
  },
  ctaText: {
    ...typography.label,
  },

  // ─── No results ───────────────────────────────────────────────────────────────
  noResultsContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  noResultsTitle: {
    ...typography.titleSm,
  },
  noResultsDesc: {
    ...typography.caption,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 17,
  },

  // ─── All joined ───────────────────────────────────────────────────────────────
  allJoinedContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  allJoined: {
    ...typography.caption,
    textAlign: 'center',
  },

  // ─── Challenges banner ────────────────────────────────────────────────────────
  challengesBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  challengesBannerInfo: {
    flex: 1,
  },
  challengesBannerTitle: {
    ...typography.bodyMd,
    fontWeight: '600',
  },
  challengesBannerDesc: {
    ...typography.caption,
    marginTop: 2,
  },
});
