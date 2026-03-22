/**
 * NotificationCenter -- In-app notification center with bell icon and bottom sheet.
 *
 * Features:
 *   - Bell icon with unread count badge (designed for HomeScreen header)
 *   - Bottom sheet list of notifications, grouped by date
 *   - Notification types: streak_milestone, health_alert, coach_tip, weekly_summary
 *   - Mark as read (tap), swipe-to-dismiss (horizontal gesture)
 *   - Persisted to AsyncStorage (@fitsi_notifications)
 *   - Haptic feedback on interactions
 *
 * Architecture:
 *   - NotificationBell: icon + badge, placed in header
 *   - NotificationCenter: full bottom-sheet list (opened by bell)
 *   - useNotifications: hook managing state + persistence
 *   - addNotification: imperative API callable from anywhere
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useThemeColors, typography, spacing, radius, shadows } from '../theme';
import { haptics } from '../hooks/useHaptics';
import BottomSheet from './BottomSheet';

// ─── Types ──────────────────────────────────────────────────────────────────

export type NotificationType =
  | 'streak_milestone'
  | 'health_alert'
  | 'coach_tip'
  | 'weekly_summary';

export interface AppNotification {
  /** Unique identifier (timestamp-based UUID) */
  id: string;
  /** Notification category */
  type: NotificationType;
  /** Short title */
  title: string;
  /** Descriptive body text */
  body: string;
  /** ISO 8601 timestamp */
  created_at: string;
  /** Whether the user has seen/tapped this notification */
  read: boolean;
  /** Optional metadata (e.g., streak count, score, etc.) */
  meta?: Record<string, unknown>;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STORAGE_KEY = '@fitsi_notifications';
const MAX_NOTIFICATIONS = 50;
const SWIPE_THRESHOLD = 120;
const SCREEN_WIDTH = Dimensions.get('window').width;

const TYPE_CONFIG: Record<
  NotificationType,
  { icon: string; color: string; label: string }
> = {
  streak_milestone: {
    icon: 'flame',
    color: '#F59E0B',
    label: 'Racha',
  },
  health_alert: {
    icon: 'heart',
    color: '#EF4444',
    label: 'Salud',
  },
  coach_tip: {
    icon: 'sparkles',
    color: '#8B5CF6',
    label: 'Coach IA',
  },
  weekly_summary: {
    icon: 'bar-chart',
    color: '#3B82F6',
    label: 'Resumen',
  },
};

// ─── Persistence helpers ────────────────────────────────────────────────────

async function loadNotifications(): Promise<AppNotification[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as AppNotification[];
  } catch {
    return [];
  }
}

async function saveNotifications(items: AppNotification[]): Promise<void> {
  const trimmed = items.slice(0, MAX_NOTIFICATIONS);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

// ─── Global event bus (imperative API) ──────────────────────────────────────

type NotificationListener = (notification: AppNotification) => void;
const _listeners = new Set<NotificationListener>();

/**
 * Add a notification to the center from anywhere in the app.
 * Generates a unique ID and timestamp automatically.
 */
export function addNotification(
  params: Omit<AppNotification, 'id' | 'created_at' | 'read'>,
): void {
  const notification: AppNotification = {
    ...params,
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    created_at: new Date().toISOString(),
    read: false,
  };
  _listeners.forEach((cb) => cb(notification));
}

// ─── useNotifications hook ──────────────────────────────────────────────────

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  // Load on mount
  useEffect(() => {
    let cancelled = false;
    loadNotifications().then((items) => {
      if (!cancelled) {
        setNotifications(items);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Listen for new notifications
  useEffect(() => {
    const listener: NotificationListener = (notification) => {
      setNotifications((prev) => {
        const next = [notification, ...prev].slice(0, MAX_NOTIFICATIONS);
        saveNotifications(next);
        return next;
      });
    };
    _listeners.add(listener);
    return () => {
      _listeners.delete(listener);
    };
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) => {
      const next = prev.map((n) =>
        n.id === id ? { ...n, read: true } : n,
      );
      saveNotifications(next);
      return next;
    });
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => {
      const next = prev.map((n) => ({ ...n, read: true }));
      saveNotifications(next);
      return next;
    });
  }, []);

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => {
      const next = prev.filter((n) => n.id !== id);
      saveNotifications(next);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
    saveNotifications([]);
  }, []);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  );

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    dismiss,
    clearAll,
  };
}

// ─── NotificationBell (header icon) ─────────────────────────────────────────

interface NotificationBellProps {
  /** Number of unread notifications (0 hides the badge) */
  unreadCount: number;
  /** Called when the bell is tapped */
  onPress: () => void;
}

export function NotificationBell({ unreadCount, onPress }: NotificationBellProps) {
  const c = useThemeColors();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Subtle bounce when unread count changes
  useEffect(() => {
    if (unreadCount > 0) {
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.2,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 4,
          tension: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [unreadCount]);

  return (
    <TouchableOpacity
      onPress={() => {
        haptics.light();
        onPress();
      }}
      activeOpacity={0.8}
      accessibilityLabel={
        unreadCount > 0
          ? `Notificaciones, ${unreadCount} sin leer`
          : 'Notificaciones'
      }
      accessibilityRole="button"
      accessibilityHint="Abre el centro de notificaciones"
      style={styles.bellTouchable}
    >
      <Animated.View
        style={[
          styles.bellContainer,
          { backgroundColor: c.surface, transform: [{ scale: scaleAnim }] },
        ]}
      >
        <Ionicons
          name={unreadCount > 0 ? 'notifications' : 'notifications-outline'}
          size={20}
          color={c.black}
        />
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {unreadCount > 9 ? '9+' : String(unreadCount)}
            </Text>
          </View>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─── SwipeableNotificationRow ───────────────────────────────────────────────

interface SwipeableRowProps {
  notification: AppNotification;
  onRead: (id: string) => void;
  onDismiss: (id: string) => void;
  colors: ReturnType<typeof useThemeColors>;
}

function SwipeableNotificationRow({
  notification,
  onRead,
  onDismiss,
  colors: c,
}: SwipeableRowProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const rowHeight = useRef(new Animated.Value(1)).current;
  const config = TYPE_CONFIG[notification.type];

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dy) < 10,
      onPanResponderMove: (_, gestureState) => {
        // Only allow left swipe (negative dx)
        if (gestureState.dx < 0) {
          translateX.setValue(gestureState.dx);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -SWIPE_THRESHOLD) {
          haptics.medium();
          Animated.parallel([
            Animated.timing(translateX, {
              toValue: -SCREEN_WIDTH,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(rowHeight, {
              toValue: 0,
              duration: 200,
              delay: 100,
              useNativeDriver: false,
            }),
          ]).start(() => {
            onDismiss(notification.id);
          });
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            friction: 8,
            useNativeDriver: true,
          }).start();
        }
      },
    }),
  ).current;

  const timeAgo = useMemo(() => {
    const now = Date.now();
    const created = new Date(notification.created_at).getTime();
    const diffMs = now - created;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return 'Ahora';
    if (diffMin < 60) return `${diffMin}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return new Date(notification.created_at).toLocaleDateString('es-CL', {
      day: 'numeric',
      month: 'short',
    });
  }, [notification.created_at]);

  const handlePress = useCallback(() => {
    if (!notification.read) {
      haptics.light();
      onRead(notification.id);
    }
  }, [notification.id, notification.read, onRead]);

  return (
    <Animated.View
      style={{
        maxHeight: rowHeight.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 120],
        }),
        opacity: rowHeight,
        overflow: 'hidden',
      }}
    >
      {/* Delete background revealed on swipe */}
      <View style={[styles.swipeBackground, { backgroundColor: '#EF4444' }]}>
        <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
        <Text style={styles.swipeLabel}>Eliminar</Text>
      </View>

      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          onPress={handlePress}
          activeOpacity={0.85}
          style={[
            styles.notificationRow,
            {
              backgroundColor: notification.read ? c.bg : c.surfaceAlt,
              borderBottomColor: c.border,
            },
          ]}
          accessibilityLabel={`${config.label}: ${notification.title}. ${notification.body}. ${notification.read ? 'Leida' : 'Sin leer'}. ${timeAgo}`}
          accessibilityRole="button"
          accessibilityHint={
            notification.read
              ? 'Desliza a la izquierda para eliminar'
              : 'Toca para marcar como leida'
          }
        >
          {/* Type icon */}
          <View
            style={[
              styles.typeIcon,
              { backgroundColor: `${config.color}18` },
            ]}
          >
            <Ionicons
              name={config.icon as any}
              size={18}
              color={config.color}
            />
          </View>

          {/* Content */}
          <View style={styles.notificationContent}>
            <View style={styles.notificationHeader}>
              <Text
                style={[
                  styles.notificationTitle,
                  { color: c.black },
                  !notification.read && styles.notificationTitleUnread,
                ]}
                numberOfLines={1}
              >
                {notification.title}
              </Text>
              <Text style={[styles.notificationTime, { color: c.gray }]}>
                {timeAgo}
              </Text>
            </View>
            <Text
              style={[styles.notificationBody, { color: c.gray }]}
              numberOfLines={2}
            >
              {notification.body}
            </Text>
            <Text style={[styles.notificationTag, { color: config.color }]}>
              {config.label}
            </Text>
          </View>

          {/* Unread indicator */}
          {!notification.read && (
            <View style={[styles.unreadDot, { backgroundColor: config.color }]} />
          )}
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}

// ─── NotificationCenter (bottom sheet content) ──────────────────────────────

interface NotificationCenterProps {
  visible: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onDismiss: (id: string) => void;
  onClearAll: () => void;
}

export default function NotificationCenter({
  visible,
  onClose,
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onDismiss,
  onClearAll,
}: NotificationCenterProps) {
  const c = useThemeColors();
  const unreadCount = notifications.filter((n) => !n.read).length;

  const renderItem = useCallback(
    ({ item }: { item: AppNotification }) => (
      <SwipeableNotificationRow
        notification={item}
        onRead={onMarkAsRead}
        onDismiss={onDismiss}
        colors={c}
      />
    ),
    [c, onMarkAsRead, onDismiss],
  );

  const keyExtractor = useCallback((item: AppNotification) => item.id, []);

  const ListEmptyComponent = useMemo(
    () => (
      <View style={styles.emptyState}>
        <Ionicons
          name="notifications-off-outline"
          size={48}
          color={c.grayLight}
        />
        <Text style={[styles.emptyTitle, { color: c.black }]}>
          Sin notificaciones
        </Text>
        <Text style={[styles.emptyBody, { color: c.gray }]}>
          Aqui apareceran tus logros, alertas de salud y tips del coach IA.
        </Text>
      </View>
    ),
    [c],
  );

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      {/* Header */}
      <View style={styles.sheetHeader}>
        <Text style={[styles.sheetTitle, { color: c.black }]}>
          Notificaciones
        </Text>
        <View style={styles.sheetActions}>
          {unreadCount > 0 && (
            <TouchableOpacity
              onPress={() => {
                haptics.light();
                onMarkAllAsRead();
              }}
              activeOpacity={0.7}
              accessibilityLabel="Marcar todas como leidas"
              accessibilityRole="button"
            >
              <Text style={[styles.actionText, { color: c.accent }]}>
                Leer todas
              </Text>
            </TouchableOpacity>
          )}
          {notifications.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                haptics.medium();
                onClearAll();
              }}
              activeOpacity={0.7}
              accessibilityLabel="Eliminar todas las notificaciones"
              accessibilityRole="button"
            >
              <Text style={[styles.actionText, { color: c.gray }]}>
                Limpiar
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Notification list */}
      <FlatList
        data={notifications}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListEmptyComponent={ListEmptyComponent}
        showsVerticalScrollIndicator={false}
        style={styles.list}
        contentContainerStyle={
          notifications.length === 0 ? styles.listEmpty : undefined
        }
      />
    </BottomSheet>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Bell
  bellTouchable: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
  },

  // Sheet header
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  sheetTitle: {
    ...typography.titleSm,
  },
  sheetActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  actionText: {
    ...typography.label,
  },

  // List
  list: {
    maxHeight: 420,
  },
  listEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyTitle: {
    ...typography.bodyMd,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
  emptyBody: {
    ...typography.caption,
    textAlign: 'center',
    maxWidth: 260,
  },

  // Notification row
  notificationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  notificationTitleUnread: {
    fontWeight: '700',
  },

  // Swipe background
  swipeBackground: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: 0,
  },
  swipeLabel: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },

  // Type icon
  typeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },

  // Content
  notificationContent: {
    flex: 1,
    gap: 2,
  },
  notificationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  notificationTitle: {
    ...typography.bodyMd,
    flex: 1,
    marginRight: spacing.sm,
  },
  notificationTime: {
    ...typography.caption,
    flexShrink: 0,
  },
  notificationBody: {
    ...typography.caption,
    lineHeight: 18,
  },
  notificationTag: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },

  // Unread dot
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 8,
  },
});
