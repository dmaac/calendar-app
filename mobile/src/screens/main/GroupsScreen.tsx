/**
 * GroupsScreen — Community groups discovery and membership.
 * Dark themed, Cal AI-inspired layout with "Your Groups" and "Discover" sections.
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, typography, spacing, radius } from '../../theme';
import { haptics } from '../../hooks/useHaptics';
import { useAnalytics } from '../../hooks/useAnalytics';
import FitsiMascot from '../../components/FitsiMascot';

// ─── Data ───────────────────────────────────────────────────────────────────

interface Group {
  id: string;
  name: string;
  emoji: string;
  members: number;
}

const DISCOVER_GROUPS: Group[] = [
  { id: 'g1', name: 'Weight Loss Warriors', emoji: '\u{1F525}', members: 1200 },
  { id: 'g2', name: 'Clean Eating Club', emoji: '\u{1F957}', members: 890 },
  { id: 'g3', name: 'Protein Kings', emoji: '\u{1F4AA}', members: 2100 },
  { id: 'g4', name: 'Vegan Journey', emoji: '\u{1F331}', members: 650 },
  { id: 'g5', name: 'Fitness & Nutrition', emoji: '\u{1F3CB}\u{FE0F}', members: 3400 },
  { id: 'g6', name: 'Beginners Welcome', emoji: '\u{1F44B}', members: 1800 },
];

function formatMembers(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K members`;
  return `${n} members`;
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
  return (
    <View style={[s.card, { backgroundColor: colors.surface }]}>
      <View style={[s.cardEmoji, { backgroundColor: colors.surfaceAlt }]}>
        <Text style={s.emoji}>{group.emoji}</Text>
      </View>
      <View style={s.cardInfo}>
        <Text style={[s.cardName, { color: colors.black }]} numberOfLines={1}>{group.name}</Text>
        <Text style={[s.cardMembers, { color: colors.gray }]}>{formatMembers(group.members)}</Text>
      </View>
      <TouchableOpacity
        style={[s.joinBtn, { backgroundColor: colors.white }, joined && { backgroundColor: colors.surfaceAlt }]}
        onPress={onToggle}
        activeOpacity={0.7}
      >
        <Text style={[s.joinText, joined && { color: colors.gray }]}>
          {joined ? 'Joined' : 'Join'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Empty state ────────────────────────────────────────────────────────────

function EmptyGroups({ onDiscover, colors }: { onDiscover: () => void; colors: ReturnType<typeof useThemeColors> }) {
  return (
    <View style={[s.emptyContainer, { backgroundColor: colors.surface }]}>
      <FitsiMascot expression="wink" size="medium" animation="wave" />
      <Text style={[s.emptyTitle, { color: colors.black, marginTop: spacing.sm }]}>Unete a tu primer grupo!</Text>
      <Text style={[s.emptySubtitle, { color: colors.gray }]}>Conecta con personas que comparten tus mismos objetivos de nutricion y fitness</Text>
      <TouchableOpacity style={[s.ctaBtn, { backgroundColor: colors.accent }]} onPress={() => { haptics.light(); onDiscover(); }} activeOpacity={0.7}>
        <Text style={s.ctaText}>Explorar grupos</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main Screen ────────────────────────────────────────────────────────────

export default function GroupsScreen() {
  const insets = useSafeAreaInsets();
  const c = useThemeColors();
  const { track } = useAnalytics('Groups');
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set());
  const scrollRef = React.useRef<ScrollView>(null);

  const toggleGroup = useCallback((id: string) => {
    haptics.light();
    setJoinedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        const group = DISCOVER_GROUPS.find((g) => g.id === id);
        track('group_joined', { group_id: id, group_name: group?.name });
      }
      return next;
    });
  }, [track]);

  const scrollToDiscover = useCallback(() => {
    scrollRef.current?.scrollTo({ y: 300, animated: true });
  }, []);

  const yourGroups = DISCOVER_GROUPS.filter((g) => joinedIds.has(g.id));
  const discoverGroups = DISCOVER_GROUPS.filter((g) => !joinedIds.has(g.id));

  return (
    <View style={[s.container, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={s.header}>
        <Text style={[s.headerTitle, { color: c.black }]}>Groups</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Your Groups */}
        <Text style={[s.sectionTitle, { color: c.black }]}>Your Groups</Text>

        {yourGroups.length === 0 ? (
          <EmptyGroups onDiscover={scrollToDiscover} colors={c} />
        ) : (
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

        {/* Discover */}
        <Text style={[s.sectionTitle, { marginTop: spacing.xl, color: c.black }]}>Discover</Text>

        {discoverGroups.length === 0 ? (
          <Text style={[s.allJoined, { color: c.gray }]}>You have joined all available groups!</Text>
        ) : (
          discoverGroups.map((g) => (
            <GroupCard
              key={g.id}
              group={g}
              joined={false}
              onToggle={() => toggleGroup(g.id)}
              colors={c}
            />
          ))
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    ...typography.title,
  },
  scroll: {
    paddingHorizontal: spacing.lg,
  },
  sectionTitle: {
    ...typography.titleSm,
    marginBottom: spacing.md,
  },

  // Card
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
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
  },
  cardMembers: {
    ...typography.caption,
    marginTop: 2,
  },
  joinBtn: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  joinText: {
    ...typography.label,
    color: '#111111',
  },

  // Empty state
  emptyContainer: {
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    ...typography.bodyMd,
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    ...typography.caption,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  ctaBtn: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
  },
  ctaText: {
    ...typography.label,
    color: '#111111',
  },

  // All joined
  allJoined: {
    ...typography.caption,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
});
