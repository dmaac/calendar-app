/**
 * CommunityScreen -- Instagram-style feed of nutritional achievements.
 *
 * Displays a scrollable feed of community posts showing user achievements
 * such as streaks, NutriScore highs, goals reached, and milestones.
 *
 * Features:
 * - Two tabs: "Feed" (all posts) and "Mis logros" (user's own achievements)
 * - Pull-to-refresh with simulated network delay
 * - Skeleton loading state on initial mount
 * - 10 mock posts with varied achievement types
 * - Dark mode support via theme system
 * - Haptic feedback on tab switches
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, typography, spacing, radius, shadows, useLayout } from '../../theme';
import { haptics } from '../../hooks/useHaptics';
import { useAnalytics } from '../../hooks/useAnalytics';
import AchievementPost, { CommunityPost } from '../../components/AchievementPost';
import SkeletonLoader from '../../components/SkeletonLoader';

// ─── Mock data ──────────────────────────────────────────────────────────────

const MOCK_FEED: CommunityPost[] = [
  {
    id: '1',
    userName: 'Carolina Mendez',
    userAvatar: 'CM',
    achievementType: 'streak',
    title: 'Racha de 30 dias',
    description: '30 dias consecutivos registrando comidas. La constancia es la clave.',
    value: '30 dias',
    timestamp: 'Hace 15 min',
    likes: 42,
    comments: 8,
    accentColor: '#FF6B35',
    icon: 'flame',
  },
  {
    id: '2',
    userName: 'Diego Fuentes',
    userAvatar: 'DF',
    achievementType: 'nutri_score',
    title: 'NutriScore Excelente',
    description: 'Alcanzo un NutriScore de 95 hoy. Macros, fibra e hidratacion perfectos.',
    value: 'NutriScore 95',
    timestamp: 'Hace 32 min',
    likes: 28,
    comments: 5,
    accentColor: '#10B981',
    icon: 'leaf',
  },
  {
    id: '3',
    userName: 'Valentina Rojas',
    userAvatar: 'VR',
    achievementType: 'goal_reached',
    title: 'Objetivo Calorico Cumplido',
    description: 'Cumplio su meta de 1800 kcal por 7 dias seguidos.',
    value: '7 dias en meta',
    timestamp: 'Hace 1 hora',
    likes: 36,
    comments: 12,
    accentColor: '#4285F4',
    icon: 'checkmark-circle',
  },
  {
    id: '4',
    userName: 'Matias Gonzalez',
    userAvatar: 'MG',
    achievementType: 'water_champion',
    title: 'Campeon del Agua',
    description: 'Registro 8 vasos de agua hoy. Hidratacion al 100%.',
    value: '8 vasos',
    timestamp: 'Hace 2 horas',
    likes: 19,
    comments: 3,
    accentColor: '#3B82F6',
    icon: 'water',
  },
  {
    id: '5',
    userName: 'Isidora Navarro',
    userAvatar: 'IN',
    achievementType: 'weight_milestone',
    title: 'Meta de Peso Alcanzada',
    description: 'Llego a su peso objetivo despues de 3 meses de seguimiento.',
    value: '-5.2 kg',
    timestamp: 'Hace 3 horas',
    likes: 87,
    comments: 24,
    accentColor: '#F59E0B',
    icon: 'trophy',
  },
  {
    id: '6',
    userName: 'Sebastian Reyes',
    userAvatar: 'SR',
    achievementType: 'meals_logged',
    title: '100 Comidas Registradas',
    description: 'Centenario: 100 comidas escaneadas y registradas en Fitsi.',
    value: '100 comidas',
    timestamp: 'Hace 4 horas',
    likes: 31,
    comments: 6,
    accentColor: '#8B5CF6',
    icon: 'restaurant',
  },
  {
    id: '7',
    userName: 'Fernanda Castro',
    userAvatar: 'FC',
    achievementType: 'streak',
    title: 'Semana Perfecta',
    description: '7 dias consecutivos manteniendo su registro al dia.',
    value: '7 dias',
    timestamp: 'Hace 5 horas',
    likes: 22,
    comments: 4,
    accentColor: '#FF6B35',
    icon: 'flame',
  },
  {
    id: '8',
    userName: 'Tomas Herrera',
    userAvatar: 'TH',
    achievementType: 'challenge_complete',
    title: 'Reto Proteina Completado',
    description: 'Consumio mas de 120g de proteina diaria durante 5 dias.',
    value: '120g+ x5',
    timestamp: 'Hace 6 horas',
    likes: 45,
    comments: 9,
    accentColor: '#EC4899',
    icon: 'barbell',
  },
  {
    id: '9',
    userName: 'Camila Soto',
    userAvatar: 'CS',
    achievementType: 'nutri_score',
    title: 'Primera Semana Verde',
    description: 'NutriScore sobre 70 durante 7 dias consecutivos.',
    value: 'NutriScore 78+',
    timestamp: 'Hace 8 horas',
    likes: 54,
    comments: 11,
    accentColor: '#10B981',
    icon: 'leaf',
  },
  {
    id: '10',
    userName: 'Nicolas Pinto',
    userAvatar: 'NP',
    achievementType: 'goal_reached',
    title: 'Disciplina Total',
    description: 'Cumplio su meta calorica y de macros por 14 dias.',
    value: '14 dias perfectos',
    timestamp: 'Hace 10 horas',
    likes: 63,
    comments: 15,
    accentColor: '#4285F4',
    icon: 'shield-checkmark',
  },
];

const MY_ACHIEVEMENTS: CommunityPost[] = [
  {
    id: 'my1',
    userName: 'Tu',
    userAvatar: 'YO',
    achievementType: 'streak',
    title: 'Racha de 5 dias',
    description: '5 dias consecutivos registrando tus comidas.',
    value: '5 dias',
    timestamp: 'Hoy',
    likes: 12,
    comments: 2,
    accentColor: '#FF6B35',
    icon: 'flame',
  },
  {
    id: 'my2',
    userName: 'Tu',
    userAvatar: 'YO',
    achievementType: 'goal_reached',
    title: 'Objetivo Cumplido',
    description: 'Cumpliste tu meta calorica del dia.',
    value: '1 dia',
    timestamp: 'Ayer',
    likes: 8,
    comments: 1,
    accentColor: '#4285F4',
    icon: 'checkmark-circle',
  },
  {
    id: 'my3',
    userName: 'Tu',
    userAvatar: 'YO',
    achievementType: 'meals_logged',
    title: '10 Comidas Registradas',
    description: 'Llevas 10 comidas escaneadas en Fitsi.',
    value: '10 comidas',
    timestamp: 'Hace 2 dias',
    likes: 5,
    comments: 0,
    accentColor: '#8B5CF6',
    icon: 'restaurant',
  },
];

// ─── Tab indicator ──────────────────────────────────────────────────────────

type TabKey = 'feed' | 'my';

function TabBar({
  activeTab,
  onTabChange,
}: {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
}) {
  const c = useThemeColors();
  const indicatorPos = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(indicatorPos, {
      toValue: activeTab === 'feed' ? 0 : 1,
      friction: 8,
      tension: 120,
      useNativeDriver: true,
    }).start();
  }, [activeTab]);

  const handleTabPress = (tab: TabKey) => {
    haptics.light();
    onTabChange(tab);
  };

  return (
    <View style={[styles.tabBar, { borderBottomColor: c.border }]}>
      <TouchableOpacity
        style={styles.tab}
        onPress={() => handleTabPress('feed')}
        activeOpacity={0.7}
        accessibilityLabel="Feed"
        accessibilityRole="tab"
        accessibilityState={{ selected: activeTab === 'feed' }}
      >
        <Ionicons
          name="globe-outline"
          size={16}
          color={activeTab === 'feed' ? c.accent : c.gray}
          style={{ marginRight: 4 }}
        />
        <Text
          style={[
            styles.tabText,
            { color: activeTab === 'feed' ? c.accent : c.gray },
            activeTab === 'feed' && styles.tabTextActive,
          ]}
        >
          Feed
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.tab}
        onPress={() => handleTabPress('my')}
        activeOpacity={0.7}
        accessibilityLabel="Mis logros"
        accessibilityRole="tab"
        accessibilityState={{ selected: activeTab === 'my' }}
      >
        <Ionicons
          name="trophy-outline"
          size={16}
          color={activeTab === 'my' ? c.accent : c.gray}
          style={{ marginRight: 4 }}
        />
        <Text
          style={[
            styles.tabText,
            { color: activeTab === 'my' ? c.accent : c.gray },
            activeTab === 'my' && styles.tabTextActive,
          ]}
        >
          Mis logros
        </Text>
      </TouchableOpacity>

      {/* Animated underline indicator */}
      <Animated.View
        style={[
          styles.tabIndicator,
          {
            backgroundColor: c.accent,
            transform: [
              {
                translateX: indicatorPos.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 1], // placeholder; width computed in layout
                }),
              },
            ],
            left: activeTab === 'feed' ? '0%' : '50%',
            width: '50%',
          },
        ]}
      />
    </View>
  );
}

// ─── Skeleton loading ───────────────────────────────────────────────────────

function FeedSkeleton() {
  const c = useThemeColors();
  return (
    <View style={styles.skeletonContainer}>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={[styles.skeletonCard, { backgroundColor: c.surface, borderColor: c.border }]}
        >
          {/* Header skeleton */}
          <View style={styles.skeletonHeader}>
            <SkeletonLoader width={40} height={40} borderRadius={20} />
            <View style={styles.skeletonHeaderText}>
              <SkeletonLoader width="60%" height={14} />
              <SkeletonLoader width="30%" height={10} style={{ marginTop: 6 }} />
            </View>
          </View>
          {/* Content skeleton */}
          <View style={[styles.skeletonContent, { backgroundColor: c.surfaceAlt }]}>
            <SkeletonLoader width={44} height={44} borderRadius={22} />
            <View style={{ flex: 1, gap: 6 }}>
              <SkeletonLoader width="70%" height={13} />
              <SkeletonLoader width="90%" height={11} />
              <SkeletonLoader width="40%" height={13} />
            </View>
          </View>
          {/* Actions skeleton */}
          <View style={styles.skeletonActions}>
            <SkeletonLoader width={50} height={20} borderRadius={10} />
            <SkeletonLoader width={50} height={20} borderRadius={10} />
            <SkeletonLoader width={30} height={20} borderRadius={10} />
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── Empty state ────────────────────────────────────────────────────────────

function EmptyState({ isMyTab }: { isMyTab: boolean }) {
  const c = useThemeColors();
  return (
    <View style={styles.emptyContainer}>
      <View style={[styles.emptyIcon, { backgroundColor: c.surfaceAlt }]}>
        <Ionicons
          name={isMyTab ? 'trophy-outline' : 'people-outline'}
          size={40}
          color={c.gray}
        />
      </View>
      <Text style={[styles.emptyTitle, { color: c.black }]}>
        {isMyTab ? 'Aun no tienes logros' : 'No hay publicaciones'}
      </Text>
      <Text style={[styles.emptyDesc, { color: c.gray }]}>
        {isMyTab
          ? 'Registra tus comidas diariamente para desbloquear logros y compartirlos con la comunidad.'
          : 'Pronto apareceran logros de otros usuarios aqui.'}
      </Text>
    </View>
  );
}

// ─── Main screen ────────────────────────────────────────────────────────────

export default function CommunityScreen() {
  const insets = useSafeAreaInsets();
  const { sidePadding } = useLayout();
  const c = useThemeColors();
  const { track } = useAnalytics('Community');

  const [activeTab, setActiveTab] = useState<TabKey>('feed');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [feedData, setFeedData] = useState<CommunityPost[]>([]);
  const [myData, setMyData] = useState<CommunityPost[]>([]);

  // Simulate initial data load
  useEffect(() => {
    const timer = setTimeout(() => {
      setFeedData(MOCK_FEED);
      setMyData(MY_ACHIEVEMENTS);
      setIsLoading(false);
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  const handleTabChange = useCallback(
    (tab: TabKey) => {
      setActiveTab(tab);
      track('community_tab_switch', { tab });
    },
    [track],
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    haptics.light();
    track('community_pull_refresh', { tab: activeTab });

    // Simulate network refresh
    setTimeout(() => {
      setRefreshing(false);
    }, 1500);
  }, [activeTab, track]);

  const handleComment = useCallback(
    (postId: string) => {
      track('community_comment_tap', { post_id: postId });
      // Future: open comment sheet
    },
    [track],
  );

  const currentData = activeTab === 'feed' ? feedData : myData;

  const renderPost = useCallback(
    ({ item }: { item: CommunityPost }) => (
      <AchievementPost post={item} onComment={handleComment} />
    ),
    [handleComment],
  );

  const keyExtractor = useCallback((item: CommunityPost) => item.id, []);

  return (
    <View style={[styles.screen, { backgroundColor: c.bg, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: sidePadding }]}>
        <Text style={[styles.headerTitle, { color: c.black }]} accessibilityRole="header">
          Comunidad
        </Text>
        <View style={[styles.headerBadge, { backgroundColor: c.accent + '15' }]}>
          <Ionicons name="people" size={16} color={c.accent} />
          <Text style={[styles.headerBadgeText, { color: c.accent }]}>
            {MOCK_FEED.length + MY_ACHIEVEMENTS.length}
          </Text>
        </View>
      </View>

      {/* Tabs */}
      <TabBar activeTab={activeTab} onTabChange={handleTabChange} />

      {/* Content */}
      {isLoading ? (
        <FeedSkeleton />
      ) : (
        <FlatList
          data={currentData}
          renderItem={renderPost}
          keyExtractor={keyExtractor}
          contentContainerStyle={[
            styles.list,
            { paddingHorizontal: sidePadding },
            currentData.length === 0 && styles.listEmpty,
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={c.accent}
              colors={[c.accent]}
            />
          }
          ListEmptyComponent={<EmptyState isMyTab={activeTab === 'my'} />}
          // Performance optimizations
          removeClippedSubviews={true}
          maxToRenderPerBatch={6}
          initialNumToRender={5}
          windowSize={7}
        />
      )}
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
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
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    position: 'relative',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm + 4,
  },
  tabText: {
    ...typography.bodyMd,
  },
  tabTextActive: {
    fontWeight: '700',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: -1,
    height: 2,
    borderRadius: 1,
  },
  list: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  listEmpty: {
    flexGrow: 1,
  },

  // Skeleton
  skeletonContainer: {
    padding: spacing.md,
    gap: spacing.sm + 4,
  },
  skeletonCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm + 4,
  },
  skeletonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
  },
  skeletonHeaderText: {
    flex: 1,
  },
  skeletonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    padding: spacing.sm + 4,
    borderRadius: radius.md,
  },
  skeletonActions: {
    flexDirection: 'row',
    gap: spacing.lg,
    paddingTop: spacing.xs,
  },

  // Empty state
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl * 2,
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    ...typography.titleSm,
    textAlign: 'center',
  },
  emptyDesc: {
    ...typography.subtitle,
    textAlign: 'center',
    lineHeight: 20,
  },
});
