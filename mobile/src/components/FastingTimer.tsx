/**
 * FastingTimer — Collapsible card with circular fasting countdown
 *
 * Features:
 * - Circular timer showing elapsed / remaining time and feeding window
 * - Protocols: 16:8, 18:6, 20:4, OMAD (23:1), Custom
 * - Start / Stop fasting toggle
 * - Persists fasting state in AsyncStorage (survives app restart)
 * - Scheduled local notification when fasting ends (expo-notifications)
 * - Integrates into HomeScreen as a collapsible card
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useThemeColors, typography, spacing, radius, shadows } from '../theme';
import { haptics } from '../hooks/useHaptics';

// Enable LayoutAnimation on Android
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STORAGE_KEY = '@fitsi_fasting_state';
const FASTING_ORANGE = '#FF8C00';
const FASTING_ORANGE_LIGHT = '#FFF3E0';
const FASTING_GREEN = '#34A853';

/** Pre-defined intermittent fasting protocols */
export interface FastingProtocol {
  id: string;
  label: string;
  /** Fasting hours */
  fastHours: number;
  /** Eating window hours */
  eatHours: number;
}

export const FASTING_PROTOCOLS: FastingProtocol[] = [
  { id: '16:8', label: '16:8', fastHours: 16, eatHours: 8 },
  { id: '18:6', label: '18:6', fastHours: 18, eatHours: 6 },
  { id: '20:4', label: '20:4', fastHours: 20, eatHours: 4 },
  { id: 'omad', label: 'OMAD', fastHours: 23, eatHours: 1 },
];

/** Persisted fasting state */
interface FastingState {
  /** ISO timestamp when fasting started (null = not fasting) */
  startedAt: string | null;
  /** Selected protocol id */
  protocolId: string;
  /** Custom fast hours (only when protocolId === 'custom') */
  customFastHours: number;
  /** Notification ID for scheduled end notification */
  notificationId: string | null;
}

const DEFAULT_STATE: FastingState = {
  startedAt: null,
  protocolId: '16:8',
  customFastHours: 16,
  notificationId: null,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function getFastHours(state: FastingState): number {
  if (state.protocolId === 'custom') return state.customFastHours;
  const p = FASTING_PROTOCOLS.find((pr) => pr.id === state.protocolId);
  return p?.fastHours ?? 16;
}

function getEatHours(state: FastingState): number {
  const fastH = getFastHours(state);
  return 24 - fastH;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function formatHourMin(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h ${pad(m)}m`;
  return `${m}m`;
}

// ─── Animated SVG Circle ────────────────────────────────────────────────────

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ─── Component ──────────────────────────────────────────────────────────────

interface FastingTimerProps {
  /** Whether the card starts collapsed (default: false) */
  initiallyCollapsed?: boolean;
}

function FastingTimerInner({ initiallyCollapsed = false }: FastingTimerProps) {
  const c = useThemeColors();
  const [state, setState] = useState<FastingState>(DEFAULT_STATE);
  const [loaded, setLoaded] = useState(false);
  const [collapsed, setCollapsed] = useState(initiallyCollapsed);
  const [now, setNow] = useState(Date.now());

  // ─── Persistence ────────────────────────────────────────────────────

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as FastingState;
          setState(parsed);
        } catch {
          // Corrupted — use default
        }
      }
      setLoaded(true);
    });
  }, []);

  const persist = useCallback(async (next: FastingState) => {
    setState(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  // ─── Live clock tick (every second while fasting) ───────────────────

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFasting = state.startedAt !== null;

  useEffect(() => {
    if (isFasting && !collapsed) {
      timerRef.current = setInterval(() => setNow(Date.now()), 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isFasting, collapsed]);

  // ─── Derived values ─────────────────────────────────────────────────

  const fastHours = getFastHours(state);
  const eatHours = getEatHours(state);
  const fastDurationSec = fastHours * 3600;

  let elapsedSec = 0;
  let remainingSec = fastDurationSec;
  let progress = 0;
  let fastingComplete = false;

  if (isFasting) {
    elapsedSec = Math.max(0, (now - new Date(state.startedAt!).getTime()) / 1000);
    remainingSec = Math.max(0, fastDurationSec - elapsedSec);
    progress = Math.min(elapsedSec / fastDurationSec, 1);
    fastingComplete = elapsedSec >= fastDurationSec;
  }

  // Feeding window times
  let feedingStart = '';
  let feedingEnd = '';
  if (isFasting) {
    const startDate = new Date(state.startedAt!);
    const endDate = new Date(startDate.getTime() + fastHours * 3600 * 1000);
    const feedEndDate = new Date(endDate.getTime() + eatHours * 3600 * 1000);
    feedingStart = endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    feedingEnd = feedEndDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // ─── Notifications ─────────────────────────────────────────────────

  const scheduleEndNotification = useCallback(async (endTime: Date): Promise<string | null> => {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') {
        const { status: newStatus } = await Notifications.requestPermissionsAsync();
        if (newStatus !== 'granted') return null;
      }

      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Ayuno completado',
          body: `Tu ayuno de ${fastHours} horas ha terminado. Es hora de comer.`,
          sound: 'default',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: endTime,
        },
      });
      return id;
    } catch {
      return null;
    }
  }, [fastHours]);

  const cancelNotification = useCallback(async (notifId: string | null) => {
    if (notifId) {
      try {
        await Notifications.cancelScheduledNotificationAsync(notifId);
      } catch {
        // Notification may have already fired
      }
    }
  }, []);

  // ─── Actions ────────────────────────────────────────────────────────

  const startFasting = useCallback(async () => {
    haptics.medium();
    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + fastHours * 3600 * 1000);
    const notifId = await scheduleEndNotification(endTime);

    await persist({
      ...state,
      startedAt: startTime.toISOString(),
      notificationId: notifId,
    });
    setNow(Date.now());
  }, [state, fastHours, persist, scheduleEndNotification]);

  const stopFasting = useCallback(async () => {
    haptics.heavy();
    await cancelNotification(state.notificationId);
    await persist({
      ...state,
      startedAt: null,
      notificationId: null,
    });
  }, [state, persist, cancelNotification]);

  const selectProtocol = useCallback(async (protocolId: string) => {
    haptics.selection();
    // If currently fasting, cancel and restart with new protocol
    if (isFasting) {
      await cancelNotification(state.notificationId);
    }
    await persist({
      ...state,
      protocolId,
      startedAt: null,
      notificationId: null,
    });
  }, [state, isFasting, persist, cancelNotification]);

  // ─── Collapse toggle ───────────────────────────────────────────────

  const toggleCollapse = useCallback(() => {
    haptics.light();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsed((prev) => !prev);
  }, []);

  // ─── Circular progress animation ───────────────────────────────────

  const SIZE = 140;
  const STROKE = 10;
  const R = (SIZE - STROKE) / 2;
  const CIRCUMFERENCE = R * 2 * Math.PI;

  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const strokeDashoffset = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [CIRCUMFERENCE, 0],
  });

  // ─── Haptic on fast completion ──────────────────────────────────────

  const prevComplete = useRef(false);
  useEffect(() => {
    if (fastingComplete && !prevComplete.current) {
      haptics.success();
    }
    prevComplete.current = fastingComplete;
  }, [fastingComplete]);

  if (!loaded) return null;

  // ─── Render ─────────────────────────────────────────────────────────

  const activeColor = fastingComplete ? FASTING_GREEN : FASTING_ORANGE;
  const activeColorLight = fastingComplete ? '#E8F5E9' : FASTING_ORANGE_LIGHT;

  const selectedProtocol = FASTING_PROTOCOLS.find((p) => p.id === state.protocolId);
  const protocolLabel = selectedProtocol?.label ?? `${fastHours}h`;

  return (
    <View
      style={[s.card, { backgroundColor: c.bg, borderColor: c.grayLight }]}
      accessibilityLabel={
        isFasting
          ? `Ayuno intermitente en curso. ${formatDuration(elapsedSec)} transcurridos de ${fastHours} horas`
          : `Ayuno intermitente. Protocolo ${protocolLabel}`
      }
    >
      {/* Header — always visible */}
      <TouchableOpacity
        style={s.header}
        onPress={toggleCollapse}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={collapsed ? 'Expandir panel de ayuno' : 'Colapsar panel de ayuno'}
        accessibilityState={{ expanded: !collapsed }}
      >
        <View style={s.headerLeft}>
          <View style={[s.headerIcon, { backgroundColor: activeColorLight }]}>
            <Ionicons name="timer-outline" size={18} color={activeColor} />
          </View>
          <View>
            <Text style={[s.title, { color: c.black }]}>Ayuno Intermitente</Text>
            {isFasting && collapsed && (
              <Text style={[s.headerSubtitle, { color: activeColor }]}>
                {fastingComplete ? 'Completado' : formatDuration(remainingSec) + ' restante'}
              </Text>
            )}
            {!isFasting && collapsed && (
              <Text style={[s.headerSubtitle, { color: c.gray }]}>
                {protocolLabel} -- Toca para expandir
              </Text>
            )}
          </View>
        </View>
        <Ionicons
          name={collapsed ? 'chevron-down' : 'chevron-up'}
          size={18}
          color={c.gray}
        />
      </TouchableOpacity>

      {/* Collapsible body */}
      {!collapsed && (
        <View style={s.body}>
          {/* Protocol selector */}
          <View style={s.protocolRow}>
            {FASTING_PROTOCOLS.map((p) => {
              const isSelected = state.protocolId === p.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[
                    s.protocolChip,
                    {
                      backgroundColor: isSelected ? activeColor : c.surface,
                      borderColor: isSelected ? activeColor : c.grayLight,
                    },
                  ]}
                  onPress={() => selectProtocol(p.id)}
                  activeOpacity={0.7}
                  disabled={isFasting}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected, disabled: isFasting }}
                  accessibilityLabel={`Protocolo ${p.label}: ${p.fastHours} horas de ayuno, ${p.eatHours} horas de alimentacion`}
                >
                  <Text
                    style={[
                      s.protocolLabel,
                      { color: isSelected ? '#FFF' : c.black },
                    ]}
                  >
                    {p.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Circular timer */}
          <View style={s.timerSection}>
            <View
              style={s.ringWrap}
              accessibilityLabel={
                isFasting
                  ? `Progreso del ayuno: ${Math.round(progress * 100)} por ciento`
                  : 'Timer de ayuno detenido'
              }
              accessibilityRole="progressbar"
            >
              <Svg width={SIZE} height={SIZE}>
                {/* Background track */}
                <Circle
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={R}
                  stroke={c.surface}
                  strokeWidth={STROKE}
                  fill="none"
                />
                {/* Progress arc */}
                <AnimatedCircle
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={R}
                  stroke={activeColor}
                  strokeWidth={STROKE}
                  fill="none"
                  strokeDasharray={CIRCUMFERENCE}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  rotation="-90"
                  origin={`${SIZE / 2}, ${SIZE / 2}`}
                />
              </Svg>
              {/* Center content */}
              <View style={s.ringCenter}>
                {isFasting ? (
                  <>
                    <Text style={[s.ringLabel, { color: c.gray }]}>
                      {fastingComplete ? 'Completado' : 'Restante'}
                    </Text>
                    <Text style={[s.ringTime, { color: activeColor }]}>
                      {fastingComplete
                        ? formatDuration(elapsedSec - fastDurationSec)
                        : formatDuration(remainingSec)}
                    </Text>
                    <Text style={[s.ringSubLabel, { color: c.gray }]}>
                      {fastingComplete ? 'extra' : `de ${fastHours}h`}
                    </Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="timer-outline" size={28} color={c.grayLight} />
                    <Text style={[s.ringLabel, { color: c.gray, marginTop: 4 }]}>
                      {fastHours}h ayuno
                    </Text>
                  </>
                )}
              </View>
            </View>
          </View>

          {/* Info row: elapsed + feeding window */}
          {isFasting && (
            <View style={s.infoRow}>
              <View style={s.infoItem}>
                <Ionicons name="time-outline" size={14} color={c.gray} />
                <Text style={[s.infoLabel, { color: c.gray }]}>En ayuno</Text>
                <Text style={[s.infoValue, { color: c.black }]}>
                  {formatHourMin(elapsedSec)}
                </Text>
              </View>
              <View style={[s.infoDivider, { backgroundColor: c.grayLight }]} />
              <View style={s.infoItem}>
                <Ionicons name="restaurant-outline" size={14} color={FASTING_GREEN} />
                <Text style={[s.infoLabel, { color: c.gray }]}>Ventana</Text>
                <Text style={[s.infoValue, { color: c.black }]}>
                  {feedingStart} - {feedingEnd}
                </Text>
              </View>
            </View>
          )}

          {/* Start / Stop button */}
          <TouchableOpacity
            style={[
              s.actionBtn,
              { backgroundColor: isFasting ? c.surface : activeColor },
              isFasting && { borderWidth: 1, borderColor: c.grayLight },
            ]}
            onPress={isFasting ? stopFasting : startFasting}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={isFasting ? 'Detener ayuno' : 'Iniciar ayuno'}
          >
            <Ionicons
              name={isFasting ? 'stop-circle-outline' : 'play-circle-outline'}
              size={20}
              color={isFasting ? c.black : '#FFF'}
            />
            <Text
              style={[
                s.actionBtnText,
                { color: isFasting ? c.black : '#FFF' },
              ]}
            >
              {isFasting ? 'Detener Ayuno' : 'Iniciar Ayuno'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default React.memo(FastingTimerInner);

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
    overflow: 'hidden',
    ...shadows.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.label,
  },
  headerSubtitle: {
    ...typography.caption,
    marginTop: 1,
  },
  body: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },

  // Protocol selector
  protocolRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  protocolChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  protocolLabel: {
    ...typography.label,
  },

  // Circular timer
  timerSection: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  ringWrap: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringLabel: {
    ...typography.caption,
  },
  ringTime: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  ringSubLabel: {
    ...typography.caption,
    fontSize: 11,
  },

  // Info row
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  infoItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  infoLabel: {
    ...typography.caption,
    fontSize: 11,
  },
  infoValue: {
    ...typography.label,
  },
  infoDivider: {
    width: 1,
    height: 32,
  },

  // Action button
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
    minHeight: 44,
  },
  actionBtnText: {
    ...typography.button,
  },
});
