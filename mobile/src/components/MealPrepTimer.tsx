/**
 * MealPrepTimer -- Parallel cooking timers for meal prep sessions.
 *
 * Sprint 12 Features:
 * - Up to 4 simultaneous timers running in parallel
 * - Each timer has: name, duration (configurable), color, progress ring
 * - Start/pause/reset individual timers
 * - Notification when each timer completes
 * - Collapsible card that integrates into RecipeDetailScreen
 * - Persists active timers in memory (resets on unmount since these are cooking sessions)
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  FlatList,
  LayoutAnimation,
  Platform,
  UIManager,
  Vibration,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
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

// -- Constants --

const MAX_TIMERS = 4;

const TIMER_COLORS = [
  '#4285F4', // blue
  '#EA4335', // red
  '#FBBC04', // yellow
  '#34A853', // green
];

const PRESET_DURATIONS: { label: string; minutes: number }[] = [
  { label: '5 min', minutes: 5 },
  { label: '10 min', minutes: 10 },
  { label: '15 min', minutes: 15 },
  { label: '20 min', minutes: 20 },
  { label: '30 min', minutes: 30 },
  { label: '45 min', minutes: 45 },
  { label: '60 min', minutes: 60 },
];

// -- Types --

interface PrepTimer {
  id: string;
  name: string;
  totalSeconds: number;
  remainingSeconds: number;
  isRunning: boolean;
  isComplete: boolean;
  color: string;
  notificationId: string | null;
}

// -- Helpers --

let _timerId = 0;
function newTimerId(): string {
  return `pt_${Date.now()}_${++_timerId}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

// -- Ring Component --

function TimerRing({
  progress,
  color,
  isComplete,
  remainingSeconds,
  totalSeconds,
  name,
  isRunning,
  onStart,
  onPause,
  onReset,
  onRemove,
  c,
}: {
  progress: number;
  color: string;
  isComplete: boolean;
  remainingSeconds: number;
  totalSeconds: number;
  name: string;
  isRunning: boolean;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onRemove: () => void;
  c: ReturnType<typeof useThemeColors>;
}) {
  const SIZE = 100;
  const STROKE = 6;
  const R = (SIZE - STROKE) / 2;
  const CIRCUMFERENCE = R * 2 * Math.PI;
  const strokeDashoffset = CIRCUMFERENCE * (1 - progress);

  return (
    <View
      style={[timerStyles.timerCard, { backgroundColor: c.surface, borderColor: c.grayLight }]}
      accessibilityLabel={`Timer ${name}: ${isComplete ? 'completado' : formatTime(remainingSeconds) + ' restante'}`}
    >
      {/* Remove button */}
      <TouchableOpacity
        style={timerStyles.removeBtn}
        onPress={onRemove}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel={`Eliminar timer ${name}`}
      >
        <Ionicons name="close" size={14} color={c.gray} />
      </TouchableOpacity>

      {/* Ring */}
      <View style={timerStyles.ringWrap}>
        <Svg width={SIZE} height={SIZE}>
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            stroke={c.grayLight}
            strokeWidth={STROKE}
            fill="none"
          />
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            stroke={isComplete ? '#34A853' : color}
            strokeWidth={STROKE}
            fill="none"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            rotation="-90"
            origin={`${SIZE / 2}, ${SIZE / 2}`}
          />
        </Svg>
        <View style={timerStyles.ringCenter}>
          <Text
            style={[
              timerStyles.ringTime,
              { color: isComplete ? '#34A853' : c.black },
            ]}
          >
            {isComplete ? 'Listo!' : formatTime(remainingSeconds)}
          </Text>
        </View>
      </View>

      {/* Name */}
      <Text style={[timerStyles.timerName, { color: c.black }]} numberOfLines={1}>
        {name}
      </Text>

      {/* Controls */}
      <View style={timerStyles.controls}>
        {isComplete ? (
          <TouchableOpacity
            style={[timerStyles.ctrlBtn, { backgroundColor: c.grayLight }]}
            onPress={onReset}
            accessibilityLabel={`Reiniciar ${name}`}
          >
            <Ionicons name="refresh" size={14} color={c.black} />
          </TouchableOpacity>
        ) : isRunning ? (
          <TouchableOpacity
            style={[timerStyles.ctrlBtn, { backgroundColor: c.grayLight }]}
            onPress={onPause}
            accessibilityLabel={`Pausar ${name}`}
          >
            <Ionicons name="pause" size={14} color={c.black} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[timerStyles.ctrlBtn, { backgroundColor: color }]}
            onPress={onStart}
            accessibilityLabel={`Iniciar ${name}`}
          >
            <Ionicons name="play" size={14} color="#FFF" />
          </TouchableOpacity>
        )}
        {!isComplete && (
          <TouchableOpacity
            style={[timerStyles.ctrlBtn, { backgroundColor: c.grayLight }]}
            onPress={onReset}
            accessibilityLabel={`Reiniciar ${name}`}
          >
            <Ionicons name="refresh" size={14} color={c.gray} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const timerStyles = StyleSheet.create({
  timerCard: {
    flex: 1,
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.sm,
    paddingTop: spacing.lg,
    ...shadows.sm,
    position: 'relative',
  },
  removeBtn: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringWrap: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringTime: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  timerName: {
    ...typography.caption,
    fontWeight: '600',
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  controls: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  ctrlBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// -- Props --

export interface MealPrepTimerProps {
  /** Whether the card starts collapsed. */
  initiallyCollapsed?: boolean;
}

// -- Main Component --

function MealPrepTimerInner({ initiallyCollapsed = false }: MealPrepTimerProps) {
  const c = useThemeColors();
  const [timers, setTimers] = useState<PrepTimer[]>([]);
  const [collapsed, setCollapsed] = useState(initiallyCollapsed);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newMinutes, setNewMinutes] = useState(10);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // -- Tick all running timers every second --
  useEffect(() => {
    const hasRunning = timers.some((t) => t.isRunning && !t.isComplete);
    if (hasRunning) {
      intervalRef.current = setInterval(() => {
        setTimers((prev) =>
          prev.map((t) => {
            if (!t.isRunning || t.isComplete) return t;
            const next = t.remainingSeconds - 1;
            if (next <= 0) {
              Vibration.vibrate([0, 500, 200, 500]);
              haptics.success();
              return { ...t, remainingSeconds: 0, isRunning: false, isComplete: true };
            }
            return { ...t, remainingSeconds: next };
          }),
        );
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [timers.some((t) => t.isRunning && !t.isComplete)]);

  // -- Schedule notification when timer starts --
  const scheduleNotification = useCallback(
    async (name: string, seconds: number): Promise<string | null> => {
      try {
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') {
          const { status: newStatus } = await Notifications.requestPermissionsAsync();
          if (newStatus !== 'granted') return null;
        }
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Timer completado',
            body: `"${name}" esta listo.`,
            sound: 'default',
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: new Date(Date.now() + seconds * 1000),
          },
        });
        return id;
      } catch {
        return null;
      }
    },
    [],
  );

  // -- Cancel notification --
  const cancelNotification = useCallback(async (notifId: string | null) => {
    if (notifId) {
      try {
        await Notifications.cancelScheduledNotificationAsync(notifId);
      } catch {}
    }
  }, []);

  // -- Actions --

  const addTimer = useCallback(() => {
    if (timers.length >= MAX_TIMERS) return;
    const name = newName.trim() || `Timer ${timers.length + 1}`;
    const totalSec = newMinutes * 60;
    const color = TIMER_COLORS[timers.length % TIMER_COLORS.length];

    haptics.medium();
    setTimers((prev) => [
      ...prev,
      {
        id: newTimerId(),
        name,
        totalSeconds: totalSec,
        remainingSeconds: totalSec,
        isRunning: false,
        isComplete: false,
        color,
        notificationId: null,
      },
    ]);
    setNewName('');
    setNewMinutes(10);
    setShowAddModal(false);
  }, [timers.length, newName, newMinutes]);

  const startTimer = useCallback(
    async (id: string) => {
      haptics.light();
      setTimers((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t;
          return { ...t, isRunning: true };
        }),
      );
      // Schedule notification
      const timer = timers.find((t) => t.id === id);
      if (timer) {
        const notifId = await scheduleNotification(timer.name, timer.remainingSeconds);
        setTimers((prev) =>
          prev.map((t) => (t.id === id ? { ...t, notificationId: notifId } : t)),
        );
      }
    },
    [timers, scheduleNotification],
  );

  const pauseTimer = useCallback(
    async (id: string) => {
      haptics.light();
      const timer = timers.find((t) => t.id === id);
      if (timer) await cancelNotification(timer.notificationId);
      setTimers((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, isRunning: false, notificationId: null } : t,
        ),
      );
    },
    [timers, cancelNotification],
  );

  const resetTimer = useCallback(
    async (id: string) => {
      haptics.light();
      const timer = timers.find((t) => t.id === id);
      if (timer) await cancelNotification(timer.notificationId);
      setTimers((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                remainingSeconds: t.totalSeconds,
                isRunning: false,
                isComplete: false,
                notificationId: null,
              }
            : t,
        ),
      );
    },
    [timers, cancelNotification],
  );

  const removeTimer = useCallback(
    async (id: string) => {
      haptics.heavy();
      const timer = timers.find((t) => t.id === id);
      if (timer) await cancelNotification(timer.notificationId);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setTimers((prev) => prev.filter((t) => t.id !== id));
    },
    [timers, cancelNotification],
  );

  // -- Collapse toggle --
  const toggleCollapse = useCallback(() => {
    haptics.light();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsed((prev) => !prev);
  }, []);

  // -- Derived --
  const activeCount = timers.filter((t) => t.isRunning).length;
  const completedCount = timers.filter((t) => t.isComplete).length;

  return (
    <View style={[s.card, { backgroundColor: c.bg, borderColor: c.grayLight }]}>
      {/* Header */}
      <TouchableOpacity
        style={s.header}
        onPress={toggleCollapse}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={collapsed ? 'Expandir panel de timers' : 'Colapsar panel de timers'}
        accessibilityState={{ expanded: !collapsed }}
      >
        <View style={s.headerLeft}>
          <View style={[s.headerIcon, { backgroundColor: '#E8F5E9' }]}>
            <Ionicons name="alarm-outline" size={18} color="#34A853" />
          </View>
          <View>
            <Text style={[s.title, { color: c.black }]}>Meal Prep Timers</Text>
            {collapsed && timers.length > 0 && (
              <Text style={[s.headerSub, { color: c.gray }]}>
                {activeCount > 0
                  ? `${activeCount} activo${activeCount > 1 ? 's' : ''}`
                  : completedCount > 0
                  ? `${completedCount} completado${completedCount > 1 ? 's' : ''}`
                  : `${timers.length} timer${timers.length > 1 ? 's' : ''}`}
              </Text>
            )}
            {collapsed && timers.length === 0 && (
              <Text style={[s.headerSub, { color: c.gray }]}>Toca para expandir</Text>
            )}
          </View>
        </View>
        <Ionicons
          name={collapsed ? 'chevron-down' : 'chevron-up'}
          size={18}
          color={c.gray}
        />
      </TouchableOpacity>

      {/* Body */}
      {!collapsed && (
        <View style={s.body}>
          {timers.length === 0 ? (
            <View style={s.emptyState}>
              <Ionicons name="alarm-outline" size={40} color={c.grayLight} />
              <Text style={[s.emptyText, { color: c.gray }]}>
                Agrega timers para tus preparaciones
              </Text>
              <Text style={[s.emptyHint, { color: c.gray }]}>
                Hasta {MAX_TIMERS} timers en paralelo
              </Text>
            </View>
          ) : (
            <View style={s.timersGrid}>
              {timers.map((timer) => {
                const progress =
                  timer.totalSeconds > 0
                    ? 1 - timer.remainingSeconds / timer.totalSeconds
                    : 0;
                return (
                  <TimerRing
                    key={timer.id}
                    progress={progress}
                    color={timer.color}
                    isComplete={timer.isComplete}
                    remainingSeconds={timer.remainingSeconds}
                    totalSeconds={timer.totalSeconds}
                    name={timer.name}
                    isRunning={timer.isRunning}
                    onStart={() => startTimer(timer.id)}
                    onPause={() => pauseTimer(timer.id)}
                    onReset={() => resetTimer(timer.id)}
                    onRemove={() => removeTimer(timer.id)}
                    c={c}
                  />
                );
              })}
            </View>
          )}

          {/* Add timer button */}
          {timers.length < MAX_TIMERS && (
            <TouchableOpacity
              style={[s.addBtn, { borderColor: c.grayLight }]}
              onPress={() => {
                haptics.light();
                setShowAddModal(true);
              }}
              activeOpacity={0.7}
              accessibilityLabel="Agregar timer"
              accessibilityRole="button"
            >
              <Ionicons name="add-circle-outline" size={18} color={c.accent} />
              <Text style={[s.addBtnText, { color: c.accent }]}>Agregar Timer</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Add Timer Modal */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: c.bg }]}>
            <View style={[s.modalHandle, { backgroundColor: c.grayLight }]} />

            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: c.black }]}>Nuevo Timer</Text>
              <TouchableOpacity
                onPress={() => setShowAddModal(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityLabel="Cerrar"
              >
                <Ionicons name="close" size={24} color={c.gray} />
              </TouchableOpacity>
            </View>

            {/* Name input */}
            <Text style={[s.inputLabel, { color: c.gray }]}>Nombre</Text>
            <TextInput
              style={[s.input, { color: c.black, backgroundColor: c.surface, borderColor: c.grayLight }]}
              placeholder="Ej: Arroz, Pollo al horno..."
              placeholderTextColor={c.gray}
              value={newName}
              onChangeText={setNewName}
              accessibilityLabel="Nombre del timer"
            />

            {/* Duration presets */}
            <Text style={[s.inputLabel, { color: c.gray }]}>Duracion</Text>
            <View style={s.presetRow}>
              {PRESET_DURATIONS.map((p) => {
                const isSelected = newMinutes === p.minutes;
                return (
                  <TouchableOpacity
                    key={p.minutes}
                    style={[
                      s.presetChip,
                      {
                        backgroundColor: isSelected ? c.accent : c.surface,
                        borderColor: isSelected ? c.accent : c.grayLight,
                      },
                    ]}
                    onPress={() => {
                      haptics.selection();
                      setNewMinutes(p.minutes);
                    }}
                    accessibilityLabel={p.label}
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Text
                      style={[
                        s.presetText,
                        { color: isSelected ? '#FFF' : c.black },
                      ]}
                    >
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Custom duration input */}
            <View style={s.customRow}>
              <Text style={[s.customLabel, { color: c.gray }]}>o minutos personalizados:</Text>
              <TextInput
                style={[s.customInput, { color: c.black, backgroundColor: c.surface, borderColor: c.grayLight }]}
                keyboardType="numeric"
                value={String(newMinutes)}
                onChangeText={(t) => {
                  const n = parseInt(t, 10);
                  if (!isNaN(n) && n > 0 && n <= 720) setNewMinutes(n);
                  else if (t === '') setNewMinutes(0);
                }}
                accessibilityLabel="Minutos personalizados"
              />
              <Text style={[s.customUnit, { color: c.gray }]}>min</Text>
            </View>

            {/* Confirm */}
            <TouchableOpacity
              style={[
                s.confirmBtn,
                { backgroundColor: c.accent },
                newMinutes <= 0 && { opacity: 0.5 },
              ]}
              onPress={addTimer}
              disabled={newMinutes <= 0}
              activeOpacity={0.8}
              accessibilityLabel="Crear timer"
              accessibilityRole="button"
            >
              <Ionicons name="alarm-outline" size={20} color="#FFF" />
              <Text style={s.confirmBtnText}>
                Crear Timer -- {newMinutes > 0 ? `${newMinutes} min` : '...'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default React.memo(MealPrepTimerInner);

// -- Styles --

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
  headerSub: {
    ...typography.caption,
    marginTop: 1,
  },
  body: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.xs,
  },
  emptyText: {
    ...typography.body,
    textAlign: 'center',
  },
  emptyHint: {
    ...typography.caption,
    textAlign: 'center',
  },

  // Timers grid
  timersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },

  // Add button
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  addBtnText: {
    ...typography.label,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalSheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  modalTitle: {
    ...typography.titleSm,
  },

  // Inputs
  inputLabel: {
    ...typography.label,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  input: {
    ...typography.body,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.md,
  },

  // Presets
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  presetChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  presetText: {
    ...typography.label,
    fontSize: 13,
  },

  // Custom
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  customLabel: {
    ...typography.caption,
    flex: 1,
  },
  customInput: {
    ...typography.body,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    width: 70,
    textAlign: 'center',
  },
  customUnit: {
    ...typography.label,
  },

  // Confirm
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.full,
    height: 52,
  },
  confirmBtnText: {
    ...typography.button,
    color: '#FFF',
  },
});
