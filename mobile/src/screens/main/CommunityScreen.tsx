/**
 * CommunityScreen -- Instagram-style feed of nutritional achievements.
 *
 * Displays a scrollable feed of community posts showing user achievements
 * such as streaks, NutriScore highs, goals reached, milestones,
 * meal photos, and tips.
 *
 * Features:
 * - Three tabs: "Feed" (all posts), "Fotos" (meal photos), "Mis logros" (own achievements)
 * - Pull-to-refresh with simulated network delay
 * - Skeleton loading state on initial mount
 * - Like/cheer button with animated count
 * - Collapsible comment section (expand on tap)
 * - "Share Achievement" CTA floating button
 * - FlatList with pagination (onEndReached)
 * - Dark mode support via theme system
 * - Haptic feedback on interactions
 */
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Animated,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Share,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, typography, spacing, radius, shadows, useLayout } from '../../theme';
import { haptics } from '../../hooks/useHaptics';
import { useAnalytics } from '../../hooks/useAnalytics';
import SkeletonLoader from '../../components/SkeletonLoader';

// ─── Types ──────────────────────────────────────────────────────────────────

type PostType = 'achievement' | 'meal_photo' | 'tip';

interface Comment {
  id: string;
  userName: string;
  userAvatar: string;
  text: string;
  timestamp: string;
}

interface CommunityFeedPost {
  id: string;
  userName: string;
  userAvatar: string;
  postType: PostType;
  title: string;
  description: string;
  value?: string;
  timestamp: string;
  likes: number;
  cheers: number;
  comments: Comment[];
  accentColor: string;
  icon: string;
  mealPhotoPlaceholder?: string;
}

// ─── Mock data ──────────────────────────────────────────────────────────────

const MOCK_COMMENTS: Comment[] = [
  { id: 'c1', userName: 'Ana M.', userAvatar: 'AM', text: 'Increible, sigue asi!', timestamp: 'Hace 5 min' },
  { id: 'c2', userName: 'Pedro L.', userAvatar: 'PL', text: 'Motivacion pura', timestamp: 'Hace 12 min' },
  { id: 'c3', userName: 'Lucia R.', userAvatar: 'LR', text: 'Yo tambien quiero llegar a eso', timestamp: 'Hace 20 min' },
];

const MOCK_FEED: CommunityFeedPost[] = [
  {
    id: '1',
    userName: 'Carolina Mendez',
    userAvatar: 'CM',
    postType: 'achievement',
    title: 'Racha de 30 dias',
    description: '30 dias consecutivos registrando comidas. La constancia es la clave.',
    value: '30 dias',
    timestamp: 'Hace 15 min',
    likes: 42,
    cheers: 18,
    comments: [MOCK_COMMENTS[0], MOCK_COMMENTS[1]],
    accentColor: '#FF6B35',
    icon: 'flame',
  },
  {
    id: '2',
    userName: 'Diego Fuentes',
    userAvatar: 'DF',
    postType: 'meal_photo',
    title: 'Almuerzo saludable',
    description: 'Salmon con quinoa y vegetales al vapor. 520 kcal, 42g proteina.',
    value: '520 kcal',
    timestamp: 'Hace 32 min',
    likes: 28,
    cheers: 9,
    comments: [MOCK_COMMENTS[2]],
    accentColor: '#10B981',
    icon: 'camera',
    mealPhotoPlaceholder: 'Salmon + Quinoa + Vegetales',
  },
  {
    id: '3',
    userName: 'Valentina Rojas',
    userAvatar: 'VR',
    postType: 'achievement',
    title: 'Objetivo Calorico Cumplido',
    description: 'Cumplio su meta de 1800 kcal por 7 dias seguidos.',
    value: '7 dias en meta',
    timestamp: 'Hace 1 hora',
    likes: 36,
    cheers: 22,
    comments: MOCK_COMMENTS,
    accentColor: '#4285F4',
    icon: 'checkmark-circle',
  },
  {
    id: '4',
    userName: 'Matias Gonzalez',
    userAvatar: 'MG',
    postType: 'tip',
    title: 'Tip: Hidratacion matutina',
    description: 'Tomar 2 vasos de agua al despertar acelera tu metabolismo un 24% por 90 minutos.',
    timestamp: 'Hace 2 horas',
    likes: 19,
    cheers: 7,
    comments: [],
    accentColor: '#3B82F6',
    icon: 'bulb',
  },
  {
    id: '5',
    userName: 'Isidora Navarro',
    userAvatar: 'IN',
    postType: 'achievement',
    title: 'Meta de Peso Alcanzada',
    description: 'Llego a su peso objetivo despues de 3 meses de seguimiento.',
    value: '-5.2 kg',
    timestamp: 'Hace 3 horas',
    likes: 87,
    cheers: 45,
    comments: [MOCK_COMMENTS[0], MOCK_COMMENTS[1], MOCK_COMMENTS[2]],
    accentColor: '#F59E0B',
    icon: 'trophy',
  },
  {
    id: '6',
    userName: 'Sebastian Reyes',
    userAvatar: 'SR',
    postType: 'meal_photo',
    title: 'Bowl de acai',
    description: 'Desayuno energetico: acai, granola, banana y frutos rojos. 380 kcal.',
    value: '380 kcal',
    timestamp: 'Hace 4 horas',
    likes: 31,
    cheers: 14,
    comments: [MOCK_COMMENTS[1]],
    accentColor: '#8B5CF6',
    icon: 'camera',
    mealPhotoPlaceholder: 'Acai + Granola + Frutos',
  },
  {
    id: '7',
    userName: 'Fernanda Castro',
    userAvatar: 'FC',
    postType: 'achievement',
    title: 'Semana Perfecta',
    description: '7 dias consecutivos manteniendo su registro al dia.',
    value: '7 dias',
    timestamp: 'Hace 5 horas',
    likes: 22,
    cheers: 11,
    comments: [],
    accentColor: '#FF6B35',
    icon: 'flame',
  },
  {
    id: '8',
    userName: 'Tomas Herrera',
    userAvatar: 'TH',
    postType: 'tip',
    title: 'Tip: Proteina antes de dormir',
    description: 'La caseina (queso cottage, yogurt griego) antes de dormir ayuda a la recuperacion muscular nocturna.',
    timestamp: 'Hace 6 horas',
    likes: 45,
    cheers: 20,
    comments: [MOCK_COMMENTS[0]],
    accentColor: '#EC4899',
    icon: 'bulb',
  },
  {
    id: '9',
    userName: 'Camila Soto',
    userAvatar: 'CS',
    postType: 'achievement',
    title: 'Primera Semana Verde',
    description: 'NutriScore sobre 70 durante 7 dias consecutivos.',
    value: 'NutriScore 78+',
    timestamp: 'Hace 8 horas',
    likes: 54,
    cheers: 28,
    comments: [MOCK_COMMENTS[2]],
    accentColor: '#10B981',
    icon: 'leaf',
  },
  {
    id: '10',
    userName: 'Nicolas Pinto',
    userAvatar: 'NP',
    postType: 'achievement',
    title: 'Disciplina Total',
    description: 'Cumplio su meta calorica y de macros por 14 dias.',
    value: '14 dias perfectos',
    timestamp: 'Hace 10 horas',
    likes: 63,
    cheers: 31,
    comments: [MOCK_COMMENTS[0], MOCK_COMMENTS[1]],
    accentColor: '#4285F4',
    icon: 'shield-checkmark',
  },
];

const MY_ACHIEVEMENTS: CommunityFeedPost[] = [
  {
    id: 'my1',
    userName: 'Tu',
    userAvatar: 'YO',
    postType: 'achievement',
    title: 'Racha de 5 dias',
    description: '5 dias consecutivos registrando tus comidas.',
    value: '5 dias',
    timestamp: 'Hoy',
    likes: 12,
    cheers: 6,
    comments: [MOCK_COMMENTS[0]],
    accentColor: '#FF6B35',
    icon: 'flame',
  },
  {
    id: 'my2',
    userName: 'Tu',
    userAvatar: 'YO',
    postType: 'achievement',
    title: 'Objetivo Cumplido',
    description: 'Cumpliste tu meta calorica del dia.',
    value: '1 dia',
    timestamp: 'Ayer',
    likes: 8,
    cheers: 3,
    comments: [],
    accentColor: '#4285F4',
    icon: 'checkmark-circle',
  },
  {
    id: 'my3',
    userName: 'Tu',
    userAvatar: 'YO',
    postType: 'meal_photo',
    title: 'Mi ensalada favorita',
    description: 'Ensalada mediterranea con queso feta y aceitunas. 320 kcal.',
    value: '320 kcal',
    timestamp: 'Hace 2 dias',
    likes: 5,
    cheers: 2,
    comments: [],
    accentColor: '#8B5CF6',
    icon: 'camera',
    mealPhotoPlaceholder: 'Ensalada Mediterranea',
  },
];

// ─── Tab indicator ──────────────────────────────────────────────────────────

type TabKey = 'feed' | 'photos' | 'my';

function TabBar({
  activeTab,
  onTabChange,
}: {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
}) {
  const c = useThemeColors();

  const tabs: { key: TabKey; label: string; icon: string }[] = [
    { key: 'feed', label: 'Feed', icon: 'globe-outline' },
    { key: 'photos', label: 'Fotos', icon: 'camera-outline' },
    { key: 'my', label: 'Mis logros', icon: 'trophy-outline' },
  ];

  const handleTabPress = (tab: TabKey) => {
    haptics.light();
    onTabChange(tab);
  };

  const tabIndex = tabs.findIndex((t) => t.key === activeTab);

  return (
    <View style={[styles.tabBar, { borderBottomColor: c.border }]}>
      {tabs.map((tab) => (
        <TouchableOpacity
          key={tab.key}
          style={styles.tab}
          onPress={() => handleTabPress(tab.key)}
          activeOpacity={0.7}
          accessibilityLabel={tab.label}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === tab.key }}
        >
          <Ionicons
            name={tab.icon as any}
            size={16}
            color={activeTab === tab.key ? c.accent : c.gray}
            style={{ marginRight: 4 }}
          />
          <Text
            style={[
              styles.tabText,
              { color: activeTab === tab.key ? c.accent : c.gray },
              activeTab === tab.key && styles.tabTextActive,
            ]}
          >
            {tab.label}
          </Text>
        </TouchableOpacity>
      ))}

      {/* Animated underline indicator */}
      <View
        style={[
          styles.tabIndicator,
          {
            backgroundColor: c.accent,
            left: `${(tabIndex / tabs.length) * 100}%` as any,
            width: `${100 / tabs.length}%` as any,
          },
        ]}
      />
    </View>
  );
}

// ─── Avatar ──────────────────────────────────────────────────────────────────

function UserAvatar({ initials, color }: { initials: string; color: string }) {
  return (
    <View style={[styles.avatar, { backgroundColor: color + '20' }]}>
      <Text style={[styles.avatarText, { color }]}>{initials}</Text>
    </View>
  );
}

// ─── Comment Section ─────────────────────────────────────────────────────────

function CommentSection({
  comments,
  postId,
  expanded,
  onToggle,
}: {
  comments: Comment[];
  postId: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const c = useThemeColors();
  const [newComment, setNewComment] = useState('');

  if (comments.length === 0 && !expanded) {
    return null;
  }

  return (
    <View style={styles.commentSection}>
      {/* Toggle button */}
      {comments.length > 0 && (
        <TouchableOpacity
          onPress={() => {
            haptics.light();
            onToggle();
          }}
          activeOpacity={0.7}
          accessibilityLabel={expanded ? 'Ocultar comentarios' : `Ver ${comments.length} comentarios`}
          accessibilityRole="button"
        >
          <Text style={[styles.commentToggle, { color: c.gray }]}>
            {expanded
              ? 'Ocultar comentarios'
              : `Ver ${comments.length} comentario${comments.length > 1 ? 's' : ''}`}
          </Text>
        </TouchableOpacity>
      )}

      {/* Expanded comments */}
      {expanded && (
        <View style={styles.commentList}>
          {comments.map((comment) => (
            <View key={comment.id} style={styles.commentRow}>
              <View style={[styles.commentAvatar, { backgroundColor: c.accent + '20' }]}>
                <Text style={[styles.commentAvatarText, { color: c.accent }]}>
                  {comment.userAvatar}
                </Text>
              </View>
              <View style={styles.commentContent}>
                <Text style={[styles.commentUser, { color: c.black }]}>
                  {comment.userName}
                  <Text style={[styles.commentText, { color: c.gray }]}>
                    {'  '}{comment.text}
                  </Text>
                </Text>
                <Text style={[styles.commentTime, { color: c.disabled }]}>
                  {comment.timestamp}
                </Text>
              </View>
            </View>
          ))}

          {/* Add comment input */}
          <View style={[styles.commentInputRow, { borderTopColor: c.border }]}>
            <TextInput
              style={[styles.commentInput, { color: c.black, backgroundColor: c.surfaceAlt }]}
              placeholder="Escribe un comentario..."
              placeholderTextColor={c.disabled}
              value={newComment}
              onChangeText={setNewComment}
              returnKeyType="send"
              onSubmitEditing={() => {
                if (newComment.trim()) {
                  haptics.light();
                  setNewComment('');
                }
              }}
            />
            <TouchableOpacity
              onPress={() => {
                if (newComment.trim()) {
                  haptics.light();
                  setNewComment('');
                }
              }}
              activeOpacity={0.7}
              disabled={!newComment.trim()}
              accessibilityLabel="Enviar comentario"
              accessibilityRole="button"
            >
              <Ionicons
                name="send"
                size={20}
                color={newComment.trim() ? c.accent : c.disabled}
              />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Meal Photo Placeholder ─────────────────────────────────────────────────

function MealPhotoCard({ label, color }: { label: string; color: string }) {
  const c = useThemeColors();
  return (
    <View style={[styles.mealPhotoCard, { backgroundColor: color + '10', borderColor: color + '30' }]}>
      <Ionicons name="image-outline" size={32} color={color} />
      <Text style={[styles.mealPhotoLabel, { color }]}>{label}</Text>
    </View>
  );
}

// ─── Feed Post Card ─────────────────────────────────────────────────────────

function FeedPostCard({
  post,
  onComment,
}: {
  post: CommunityFeedPost;
  onComment?: (postId: string) => void;
}) {
  const c = useThemeColors();
  const [liked, setLiked] = useState(false);
  const [cheered, setCheered] = useState(false);
  const [likeCount, setLikeCount] = useState(post.likes);
  const [cheerCount, setCheerCount] = useState(post.cheers);
  const [commentsExpanded, setCommentsExpanded] = useState(false);

  const heartScale = useRef(new Animated.Value(1)).current;
  const cheerScale = useRef(new Animated.Value(1)).current;

  const animateButton = useCallback((scaleRef: Animated.Value) => {
    scaleRef.setValue(0.6);
    Animated.sequence([
      Animated.spring(scaleRef, {
        toValue: 1.3,
        friction: 3,
        tension: 200,
        useNativeDriver: true,
      }),
      Animated.spring(scaleRef, {
        toValue: 1,
        friction: 5,
        tension: 100,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleLike = useCallback(() => {
    haptics.medium();
    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikeCount((prev) => (nextLiked ? prev + 1 : prev - 1));
    animateButton(heartScale);
  }, [liked, animateButton, heartScale]);

  const handleCheer = useCallback(() => {
    haptics.medium();
    const nextCheered = !cheered;
    setCheered(nextCheered);
    setCheerCount((prev) => (nextCheered ? prev + 1 : prev - 1));
    animateButton(cheerScale);
  }, [cheered, animateButton, cheerScale]);

  const handleShare = useCallback(async () => {
    haptics.light();
    try {
      const text = [
        `${post.userName} en Fitsi: ${post.title}`,
        post.description,
        '',
        '#FitsiIA #Comunidad',
      ].join('\n');
      await Share.share(
        Platform.OS === 'ios' ? { message: text } : { message: text, title: 'Fitsi IA' },
      );
    } catch {
      // User cancelled
    }
  }, [post]);

  const initials = post.userName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const postTypeLabel =
    post.postType === 'meal_photo'
      ? 'compartio una foto'
      : post.postType === 'tip'
        ? 'compartio un tip'
        : 'desbloqueo un logro';

  return (
    <View
      style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}
      accessibilityLabel={`Post de ${post.userName}: ${post.title}`}
      accessibilityRole="summary"
    >
      {/* Header: Avatar + Name + Timestamp */}
      <View style={styles.cardHeader}>
        <UserAvatar initials={initials} color={post.accentColor} />
        <View style={styles.cardHeaderInfo}>
          <Text style={[styles.cardUserName, { color: c.black }]} numberOfLines={1}>
            {post.userName}
          </Text>
          <Text style={[styles.cardMeta, { color: c.gray }]}>
            {postTypeLabel} {' \u00B7 '} {post.timestamp}
          </Text>
        </View>
        <View style={[styles.postTypeBadge, { backgroundColor: post.accentColor + '15' }]}>
          <Ionicons name={post.icon as any} size={12} color={post.accentColor} />
        </View>
      </View>

      {/* Meal photo placeholder (for meal_photo posts) */}
      {post.postType === 'meal_photo' && post.mealPhotoPlaceholder && (
        <MealPhotoCard label={post.mealPhotoPlaceholder} color={post.accentColor} />
      )}

      {/* Achievement/content card */}
      <View style={[styles.contentCard, { backgroundColor: c.surfaceAlt }]}>
        <View style={[styles.contentIcon, { backgroundColor: post.accentColor + '20' }]}>
          <Ionicons
            name={
              post.postType === 'tip'
                ? 'bulb'
                : post.postType === 'meal_photo'
                  ? 'restaurant'
                  : (post.icon as any)
            }
            size={24}
            color={post.accentColor}
          />
        </View>
        <View style={styles.contentBody}>
          <Text style={[styles.contentTitle, { color: c.black }]} numberOfLines={1}>
            {post.title}
          </Text>
          <Text style={[styles.contentDesc, { color: c.gray }]} numberOfLines={2}>
            {post.description}
          </Text>
          {post.value && (
            <Text style={[styles.contentValue, { color: post.accentColor }]}>
              {post.value}
            </Text>
          )}
        </View>
      </View>

      {/* Actions: Like, Cheer, Comment, Share */}
      <View style={styles.actions}>
        {/* Like button */}
        <TouchableOpacity
          style={styles.actionButton}
          onPress={handleLike}
          activeOpacity={0.7}
          accessibilityLabel={liked ? 'Quitar me gusta' : 'Me gusta'}
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Animated.View style={{ transform: [{ scale: heartScale }] }}>
            <Ionicons
              name={liked ? 'heart' : 'heart-outline'}
              size={20}
              color={liked ? '#EF4444' : c.gray}
            />
          </Animated.View>
          <Text style={[styles.actionCount, { color: liked ? '#EF4444' : c.gray }]}>
            {likeCount > 0 ? likeCount : ''}
          </Text>
        </TouchableOpacity>

        {/* Cheer button */}
        <TouchableOpacity
          style={styles.actionButton}
          onPress={handleCheer}
          activeOpacity={0.7}
          accessibilityLabel={cheered ? 'Quitar cheer' : 'Dar cheer'}
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Animated.View style={{ transform: [{ scale: cheerScale }] }}>
            <Ionicons
              name={cheered ? 'hand-left' : 'hand-left-outline'}
              size={19}
              color={cheered ? '#F59E0B' : c.gray}
            />
          </Animated.View>
          <Text style={[styles.actionCount, { color: cheered ? '#F59E0B' : c.gray }]}>
            {cheerCount > 0 ? cheerCount : ''}
          </Text>
        </TouchableOpacity>

        {/* Comment button */}
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => {
            haptics.light();
            setCommentsExpanded((prev) => !prev);
            onComment?.(post.id);
          }}
          activeOpacity={0.7}
          accessibilityLabel="Comentar"
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={commentsExpanded ? 'chatbubble' : 'chatbubble-outline'}
            size={19}
            color={commentsExpanded ? c.accent : c.gray}
          />
          {post.comments.length > 0 && (
            <Text style={[styles.actionCount, { color: commentsExpanded ? c.accent : c.gray }]}>
              {post.comments.length}
            </Text>
          )}
        </TouchableOpacity>

        {/* Share button */}
        <TouchableOpacity
          style={[styles.actionButton, { marginLeft: 'auto' }]}
          onPress={handleShare}
          activeOpacity={0.7}
          accessibilityLabel="Compartir"
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="share-outline" size={19} color={c.gray} />
        </TouchableOpacity>
      </View>

      {/* Collapsible comment section */}
      <CommentSection
        comments={post.comments}
        postId={post.id}
        expanded={commentsExpanded}
        onToggle={() => setCommentsExpanded((prev) => !prev)}
      />
    </View>
  );
}

const MemoizedFeedPostCard = React.memo(FeedPostCard);

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
          <View style={styles.skeletonHeader}>
            <SkeletonLoader width={40} height={40} borderRadius={20} />
            <View style={styles.skeletonHeaderText}>
              <SkeletonLoader width="60%" height={14} />
              <SkeletonLoader width="40%" height={10} style={{ marginTop: 6 }} />
            </View>
          </View>
          <View style={[styles.skeletonContent, { backgroundColor: c.surfaceAlt }]}>
            <SkeletonLoader width={44} height={44} borderRadius={22} />
            <View style={{ flex: 1, gap: 6 }}>
              <SkeletonLoader width="70%" height={13} />
              <SkeletonLoader width="90%" height={11} />
              <SkeletonLoader width="40%" height={13} />
            </View>
          </View>
          <View style={styles.skeletonActions}>
            <SkeletonLoader width={50} height={20} borderRadius={10} />
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

function EmptyState({ tabKey }: { tabKey: TabKey }) {
  const c = useThemeColors();

  const config = {
    feed: {
      icon: 'people-outline' as const,
      title: 'No hay publicaciones',
      desc: 'Pronto apareceran logros de otros usuarios aqui.',
    },
    photos: {
      icon: 'camera-outline' as const,
      title: 'No hay fotos de comidas',
      desc: 'Comparte fotos de tus comidas saludables con la comunidad.',
    },
    my: {
      icon: 'trophy-outline' as const,
      title: 'Aun no tienes logros',
      desc: 'Registra tus comidas diariamente para desbloquear logros y compartirlos con la comunidad.',
    },
  };

  const { icon, title, desc } = config[tabKey];

  return (
    <View style={styles.emptyContainer}>
      <View style={[styles.emptyIcon, { backgroundColor: c.surfaceAlt }]}>
        <Ionicons name={icon} size={40} color={c.gray} />
      </View>
      <Text style={[styles.emptyTitle, { color: c.black }]}>{title}</Text>
      <Text style={[styles.emptyDesc, { color: c.gray }]}>{desc}</Text>
    </View>
  );
}

// ─── Pagination footer ─────────────────────────────────────────────────────

function PaginationFooter({ loading }: { loading: boolean }) {
  const c = useThemeColors();
  if (!loading) return null;
  return (
    <View style={styles.paginationFooter}>
      <ActivityIndicator size="small" color={c.accent} />
      <Text style={[styles.paginationText, { color: c.gray }]}>Cargando mas...</Text>
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
  const [loadingMore, setLoadingMore] = useState(false);
  const [feedData, setFeedData] = useState<CommunityFeedPost[]>([]);
  const [myData, setMyData] = useState<CommunityFeedPost[]>([]);
  const [page, setPage] = useState(1);

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
    setPage(1);
    setTimeout(() => {
      setRefreshing(false);
    }, 1500);
  }, [activeTab, track]);

  const handleComment = useCallback(
    (postId: string) => {
      track('community_comment_tap', { post_id: postId });
    },
    [track],
  );

  // Pagination handler
  const handleEndReached = useCallback(() => {
    if (loadingMore || activeTab === 'my') return;
    setLoadingMore(true);
    track('community_load_more', { tab: activeTab, page: page + 1 });
    // Simulate loading more posts
    setTimeout(() => {
      setPage((p) => p + 1);
      setLoadingMore(false);
    }, 1000);
  }, [loadingMore, activeTab, page, track]);

  // Share achievement CTA handler
  const handleShareAchievement = useCallback(async () => {
    haptics.medium();
    track('community_share_achievement_tap');
    try {
      await Share.share({
        message:
          'Estoy logrando mis metas de nutricion con Fitsi IA. Descargala gratis en https://fitsi.app',
      });
    } catch {
      // User cancelled
    }
  }, [track]);

  // Filtered data based on tab
  const currentData = useMemo(() => {
    if (activeTab === 'my') return myData;
    if (activeTab === 'photos') return feedData.filter((p) => p.postType === 'meal_photo');
    return feedData;
  }, [activeTab, feedData, myData]);

  const renderPost = useCallback(
    ({ item }: { item: CommunityFeedPost }) => (
      <MemoizedFeedPostCard post={item} onComment={handleComment} />
    ),
    [handleComment],
  );

  const keyExtractor = useCallback((item: CommunityFeedPost) => item.id, []);

  return (
    <View style={[styles.screen, { backgroundColor: c.bg, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: sidePadding }]}>
        <Text style={[styles.headerTitle, { color: c.black }]} accessibilityRole="header">
          Comunidad
        </Text>
        <View style={styles.headerRight}>
          <View style={[styles.headerBadge, { backgroundColor: c.accent + '15' }]}>
            <Ionicons name="people" size={16} color={c.accent} />
            <Text style={[styles.headerBadgeText, { color: c.accent }]}>
              {MOCK_FEED.length + MY_ACHIEVEMENTS.length}
            </Text>
          </View>
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
          ListEmptyComponent={<EmptyState tabKey={activeTab} />}
          ListFooterComponent={<PaginationFooter loading={loadingMore} />}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.3}
          // Performance optimizations
          removeClippedSubviews={true}
          maxToRenderPerBatch={6}
          initialNumToRender={5}
          windowSize={7}
        />
      )}

      {/* Floating "Share Achievement" CTA */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: c.accent }]}
        onPress={handleShareAchievement}
        activeOpacity={0.85}
        accessibilityLabel="Compartir logro"
        accessibilityRole="button"
        accessibilityHint="Comparte tus logros de nutricion con tus amigos"
      >
        <Ionicons name="add" size={24} color="#FFFFFF" />
      </TouchableOpacity>
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
    paddingBottom: spacing.xxl + 60,
  },
  listEmpty: {
    flexGrow: 1,
  },

  // ─── Post Card ──────────────────────────────────────────────────────────────
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm + 4,
    ...shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    marginBottom: spacing.sm + 4,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '700',
  },
  cardHeaderInfo: {
    flex: 1,
  },
  cardUserName: {
    ...typography.bodyMd,
    fontWeight: '700',
  },
  cardMeta: {
    ...typography.caption,
    marginTop: 1,
  },
  postTypeBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ─── Meal Photo ─────────────────────────────────────────────────────────────
  mealPhotoCard: {
    height: 140,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm + 4,
    gap: spacing.sm,
  },
  mealPhotoLabel: {
    ...typography.label,
    fontWeight: '600',
  },

  // ─── Content Card ──────────────────────────────────────────────────────────
  contentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    padding: spacing.sm + 4,
    borderRadius: radius.md,
    marginBottom: spacing.sm + 4,
  },
  contentIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentBody: {
    flex: 1,
    gap: 2,
  },
  contentTitle: {
    ...typography.label,
    fontWeight: '700',
  },
  contentDesc: {
    ...typography.caption,
    lineHeight: 16,
  },
  contentValue: {
    ...typography.label,
    fontWeight: '800',
    marginTop: 2,
  },

  // ─── Actions ────────────────────────────────────────────────────────────────
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingTop: spacing.xs,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 1,
  },
  actionCount: {
    fontSize: 13,
    fontWeight: '600',
  },

  // ─── Comment Section ────────────────────────────────────────────────────────
  commentSection: {
    marginTop: spacing.sm,
  },
  commentToggle: {
    ...typography.caption,
    fontWeight: '600',
    paddingVertical: spacing.xs,
  },
  commentList: {
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  commentAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentAvatarText: {
    fontSize: 9,
    fontWeight: '700',
  },
  commentContent: {
    flex: 1,
  },
  commentUser: {
    ...typography.caption,
    fontWeight: '700',
  },
  commentText: {
    fontWeight: '400',
  },
  commentTime: {
    fontSize: 10,
    marginTop: 2,
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
  },
  commentInput: {
    flex: 1,
    height: 36,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    fontSize: 13,
  },

  // ─── FAB ────────────────────────────────────────────────────────────────────
  fab: {
    position: 'absolute',
    bottom: 100,
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.lg,
  },

  // ─── Skeleton ───────────────────────────────────────────────────────────────
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

  // ─── Empty state ───────────────────────────────────────────────────────────
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

  // ─── Pagination ─────────────────────────────────────────────────────────────
  paginationFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  paginationText: {
    ...typography.caption,
  },
});
