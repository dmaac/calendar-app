/**
 * WorkoutScreen — Full-featured workout tracking with strength logging,
 * rest timer, workout type selection, calorie estimation, and history.
 *
 * Features:
 * 1. Workout type tabs: Strength | Cardio | Flexibility
 * 2. Strength mode: exercise name, sets with reps/weight, set completion tracking
 * 3. Rest timer between sets with haptic alerts and visual countdown
 * 4. Cardio/Flexibility mode: duration + MET-based calorie burn
 * 5. Animated set completion with scale spring + check animation
 * 6. Calorie burn estimation display (real-time as user adjusts)
 * 7. Weekly summary cards with fade-in animation
 * 8. Workout history with re-log capability
 * 9. Skeleton loading state, empty state with mascot
 * 10. Full dark mode, haptics, accessibility labels, analytics
 */
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Animated,
  FlatList,
  Easing,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useThemeColors, typography, spacing, radius, shadows, useLayout } from '../../theme';
import { haptics } from '../../hooks/useHaptics';
import { useAnalytics } from '../../hooks/useAnalytics';
import useFadeIn from '../../hooks/useFadeIn';
import FitsiMascot from '../../components/FitsiMascot';
import BottomSheet from '../../components/BottomSheet';
import {
  Exercise,
  ExerciseCategory,
  EXERCISE_CATEGORIES,
  exerciseDatabase,
  searchExercises,
  calculateCalories,
  caloriesPerMinute,
} from '../../data/exerciseDatabase';
import * as workoutService from '../../services/workout.service';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Workout mode determines the logging UI */
type WorkoutMode = 'strength' | 'cardio' | 'flexibility';

interface SetEntry {
  id: string;
  setNumber: number;
  reps: number;
  weight: number; // kg
  completed: boolean;
  isWarmup: boolean;
}

interface StrengthExerciseEntry {
  id: string;
  exerciseName: string;
  sets: SetEntry[];
}

interface WorkoutEntry {
  id: string;
  exerciseId: string;
  exerciseName: string;
  exerciseCategory: ExerciseCategory;
  exerciseIcon: string;
  exerciseColor: string;
  exerciseMet: number;
  duration: number; // minutes
  calories: number;
  notes: string;
  date: string; // ISO date (YYYY-MM-DD)
  mode: WorkoutMode;
  // Strength-specific data
  strengthExercises?: StrengthExerciseEntry[];
  totalSets?: number;
  totalReps?: number;
  totalVolume?: number; // sets * reps * weight
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STORAGE_KEY = '@fitsi_workout_log';
const MAX_HISTORY = 15;
const DEFAULT_WEIGHT_KG = 70;
const DEFAULT_REST_SECONDS = 90;
const MIN_REST_SECONDS = 15;
const MAX_REST_SECONDS = 300;

const WORKOUT_MODES: { key: WorkoutMode; label: string; icon: string; color: string }[] = [
  { key: 'strength', label: 'Fuerza', icon: 'barbell-outline', color: '#6366F1' },
  { key: 'cardio', label: 'Cardio', icon: 'heart-outline', color: '#EF4444' },
  { key: 'flexibility', label: 'Flexibilidad', icon: 'body-outline', color: '#8B5CF6' },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function createDefaultSets(count: number): SetEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    id: generateId(),
    setNumber: i + 1,
    reps: 10,
    weight: 0,
    completed: false,
    isWarmup: false,
  }));
}

// ─── Skeleton Loading ───────────────────────────────────────────────────────

function WorkoutSkeleton({ c }: { c: ReturnType<typeof useThemeColors> }) {
  const pulseAnim = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.75,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.35,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  const bar = (width: number | string, height: number, mb = spacing.sm) => (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius: radius.sm,
          backgroundColor: c.grayLight,
          marginBottom: mb,
          opacity: pulseAnim,
        },
      ]}
    />
  );

  return (
    <View style={{ paddingTop: spacing.md }}>
      {/* Summary skeleton */}
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
        {[1, 2, 3].map((i) => (
          <Animated.View
            key={i}
            style={{
              flex: 1,
              height: 80,
              borderRadius: radius.md,
              backgroundColor: c.surface,
              opacity: pulseAnim,
            }}
          />
        ))}
      </View>
      {/* Button skeleton */}
      {bar('100%', 52, spacing.lg)}
      {/* List skeleton */}
      {bar('40%', 14, spacing.md)}
      {[1, 2, 3].map((i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            marginBottom: spacing.md,
          }}
        >
          <Animated.View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: c.grayLight,
              opacity: pulseAnim,
            }}
          />
          <View style={{ flex: 1 }}>
            {bar('70%', 14, 4)}
            {bar('50%', 10, 0)}
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── Summary Card ───────────────────────────────────────────────────────────

function SummaryCard({
  icon,
  label,
  value,
  color,
  c,
  delay,
}: {
  icon: string;
  label: string;
  value: string;
  color: string;
  c: ReturnType<typeof useThemeColors>;
  delay: number;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, delay, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, delay, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.summaryCard,
        { backgroundColor: c.surface, opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
      ]}
      accessibilityLabel={`${label}: ${value}`}
      accessibilityRole="text"
    >
      <Ionicons name={icon as any} size={20} color={color} />
      <Text style={[styles.summaryValue, { color: c.black }]}>{value}</Text>
      <Text style={[styles.summaryLabel, { color: c.gray }]}>{label}</Text>
    </Animated.View>
  );
}

// ─── Rest Timer Overlay ─────────────────────────────────────────────────────

function RestTimerOverlay({
  seconds,
  totalSeconds,
  isRunning,
  onStop,
  onAddTime,
  onSubtractTime,
  c,
}: {
  seconds: number;
  totalSeconds: number;
  isRunning: boolean;
  onStop: () => void;
  onAddTime: () => void;
  onSubtractTime: () => void;
  c: ReturnType<typeof useThemeColors>;
}) {
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isRunning) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          damping: 15,
          stiffness: 200,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(scaleAnim, {
          toValue: 0.9,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isRunning]);

  // Progress from 1 -> 0
  const progress = totalSeconds > 0 ? seconds / totalSeconds : 0;

  // Color shifts from accent to warning to danger as timer runs down
  const timerColor =
    progress > 0.5 ? c.accent : progress > 0.2 ? '#F59E0B' : '#EF4444';

  if (!isRunning) return null;

  return (
    <Animated.View
      style={[
        styles.restTimerOverlay,
        {
          backgroundColor: c.surface,
          borderColor: timerColor + '40',
          opacity: opacityAnim,
          transform: [{ scale: scaleAnim }],
        },
      ]}
      accessibilityLabel={`Descanso: ${formatTime(seconds)} restantes`}
      accessibilityRole="timer"
    >
      {/* Timer circle indicator */}
      <View style={styles.restTimerContent}>
        <View style={[styles.restTimerCircle, { borderColor: timerColor + '30' }]}>
          <View
            style={[
              styles.restTimerCircleProgress,
              {
                borderColor: timerColor,
                borderTopColor: 'transparent',
                transform: [{ rotate: `${(1 - progress) * 360}deg` }],
              },
            ]}
          />
          <View style={styles.restTimerCircleInner}>
            <Ionicons name="hourglass-outline" size={16} color={timerColor} />
            <Text style={[styles.restTimerTime, { color: c.black }]}>
              {formatTime(seconds)}
            </Text>
          </View>
        </View>

        <Text style={[styles.restTimerLabel, { color: c.gray }]}>Descanso</Text>

        {/* Controls row */}
        <View style={styles.restTimerControls}>
          <TouchableOpacity
            style={[styles.restTimerControlBtn, { backgroundColor: c.bg }]}
            onPress={() => { haptics.light(); onSubtractTime(); }}
            accessibilityLabel="Restar 15 segundos"
            accessibilityRole="button"
          >
            <Text style={[styles.restTimerControlText, { color: c.gray }]}>-15s</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.restTimerStopBtn, { backgroundColor: timerColor + '15' }]}
            onPress={() => { haptics.medium(); onStop(); }}
            accessibilityLabel="Detener descanso"
            accessibilityRole="button"
          >
            <Ionicons name="stop-circle" size={18} color={timerColor} />
            <Text style={[styles.restTimerStopText, { color: timerColor }]}>Saltar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.restTimerControlBtn, { backgroundColor: c.bg }]}
            onPress={() => { haptics.light(); onAddTime(); }}
            accessibilityLabel="Agregar 15 segundos"
            accessibilityRole="button"
          >
            <Text style={[styles.restTimerControlText, { color: c.gray }]}>+15s</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Set Row (Strength Mode) ────────────────────────────────────────────────

function SetRow({
  set,
  exerciseName,
  c,
  onToggleComplete,
  onUpdateReps,
  onUpdateWeight,
  onRemove,
}: {
  set: SetEntry;
  exerciseName: string;
  c: ReturnType<typeof useThemeColors>;
  onToggleComplete: () => void;
  onUpdateReps: (reps: number) => void;
  onUpdateWeight: (weight: number) => void;
  onRemove: () => void;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const bgAnim = useRef(new Animated.Value(set.completed ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(bgAnim, {
      toValue: set.completed ? 1 : 0,
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [set.completed]);

  const handleComplete = () => {
    // Spring scale animation on completion
    Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: 1.05,
        useNativeDriver: true,
        damping: 10,
        stiffness: 300,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        damping: 12,
        stiffness: 200,
      }),
    ]).start();
    onToggleComplete();
  };

  const backgroundColor = bgAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [c.surface, c.accent + '12'],
  });

  return (
    <Animated.View
      style={[
        styles.setRow,
        {
          backgroundColor,
          borderColor: set.completed ? c.accent + '30' : c.grayLight,
          transform: [{ scale: scaleAnim }],
        },
      ]}
      accessibilityLabel={`${exerciseName} set ${set.setNumber}: ${set.reps} reps a ${set.weight} kg, ${set.completed ? 'completado' : 'pendiente'}`}
      accessibilityRole="none"
    >
      {/* Set number / warmup badge */}
      <View style={styles.setNumberContainer}>
        {set.isWarmup ? (
          <View style={[styles.warmupBadge, { backgroundColor: '#F59E0B' + '20' }]}>
            <Text style={[styles.warmupText, { color: '#F59E0B' }]}>W</Text>
          </View>
        ) : (
          <Text style={[styles.setNumber, { color: c.gray }]}>{set.setNumber}</Text>
        )}
      </View>

      {/* Reps input */}
      <View style={styles.setInputGroup}>
        <Text style={[styles.setInputLabel, { color: c.gray }]}>Reps</Text>
        <View style={[styles.setInput, { backgroundColor: c.bg, borderColor: c.grayLight }]}>
          <TextInput
            style={[styles.setInputText, { color: c.black }]}
            value={set.reps.toString()}
            onChangeText={(v) => {
              const n = parseInt(v, 10);
              if (!isNaN(n) && n >= 0 && n <= 999) onUpdateReps(n);
              else if (v === '') onUpdateReps(0);
            }}
            keyboardType="number-pad"
            selectTextOnFocus
            accessibilityLabel={`Repeticiones, set ${set.setNumber}`}
            maxLength={3}
          />
        </View>
      </View>

      {/* Weight input */}
      <View style={styles.setInputGroup}>
        <Text style={[styles.setInputLabel, { color: c.gray }]}>Peso (kg)</Text>
        <View style={[styles.setInput, { backgroundColor: c.bg, borderColor: c.grayLight }]}>
          <TextInput
            style={[styles.setInputText, { color: c.black }]}
            value={set.weight > 0 ? set.weight.toString() : ''}
            placeholder="0"
            placeholderTextColor={c.disabled}
            onChangeText={(v) => {
              const n = parseFloat(v);
              if (!isNaN(n) && n >= 0 && n <= 500) onUpdateWeight(n);
              else if (v === '' || v === '0') onUpdateWeight(0);
            }}
            keyboardType="decimal-pad"
            selectTextOnFocus
            accessibilityLabel={`Peso en kilogramos, set ${set.setNumber}`}
            maxLength={5}
          />
        </View>
      </View>

      {/* Complete toggle */}
      <TouchableOpacity
        style={[
          styles.setCompleteBtn,
          {
            backgroundColor: set.completed ? c.accent : c.bg,
            borderColor: set.completed ? c.accent : c.grayLight,
          },
        ]}
        onPress={handleComplete}
        activeOpacity={0.7}
        accessibilityLabel={set.completed ? 'Desmarcar set completado' : 'Marcar set completado'}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: set.completed }}
      >
        <Ionicons
          name={set.completed ? 'checkmark' : 'checkmark-outline'}
          size={16}
          color={set.completed ? '#FFFFFF' : c.disabled}
        />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Workout Row (History) ──────────────────────────────────────────────────

function WorkoutRow({
  entry,
  c,
  onReLog,
}: {
  entry: WorkoutEntry;
  c: ReturnType<typeof useThemeColors>;
  onReLog: (entry: WorkoutEntry) => void;
}) {
  const dateObj = new Date(entry.date + 'T12:00:00');
  const dayLabel = dateObj.toLocaleDateString('es-CL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  const modeLabel = WORKOUT_MODES.find((m) => m.key === entry.mode)?.label ?? entry.mode;
  const modeColor = WORKOUT_MODES.find((m) => m.key === entry.mode)?.color ?? c.accent;

  // Build detail string based on mode
  let detailStr = `${dayLabel} -- ${entry.duration} min -- ${entry.calories} kcal`;
  if (entry.mode === 'strength' && entry.totalSets) {
    detailStr = `${dayLabel} -- ${entry.totalSets} sets -- ${entry.totalVolume ?? 0} kg vol`;
  }

  return (
    <TouchableOpacity
      style={[styles.workoutRow, { borderBottomColor: c.grayLight + '40' }]}
      onPress={() => {
        haptics.light();
        onReLog(entry);
      }}
      activeOpacity={0.7}
      accessibilityLabel={`Re-registrar ${entry.exerciseName}, ${modeLabel}`}
      accessibilityHint="Toca para registrar este ejercicio nuevamente"
      accessibilityRole="button"
    >
      <View style={[styles.workoutIcon, { backgroundColor: entry.exerciseColor + '18' }]}>
        <Ionicons name={entry.exerciseIcon as any} size={20} color={entry.exerciseColor} />
      </View>
      <View style={styles.workoutInfo}>
        <View style={styles.workoutTitleRow}>
          <Text style={[styles.workoutTitle, { color: c.black }]} numberOfLines={1}>
            {entry.exerciseName}
          </Text>
          <View style={[styles.modeBadgeMini, { backgroundColor: modeColor + '15' }]}>
            <Text style={[styles.modeBadgeMiniText, { color: modeColor }]}>{modeLabel}</Text>
          </View>
        </View>
        <Text style={[styles.workoutMeta, { color: c.gray }]}>{detailStr}</Text>
        {entry.notes ? (
          <Text style={[styles.workoutNotes, { color: c.gray }]} numberOfLines={1}>
            {entry.notes}
          </Text>
        ) : null}
      </View>
      <Ionicons name="refresh-outline" size={16} color={c.disabled} />
    </TouchableOpacity>
  );
}

// ─── Exercise Search Item ───────────────────────────────────────────────────

function ExerciseItem({
  exercise,
  isSelected,
  c,
  onSelect,
}: {
  exercise: Exercise;
  isSelected: boolean;
  c: ReturnType<typeof useThemeColors>;
  onSelect: (ex: Exercise) => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.exerciseItem,
        {
          backgroundColor: isSelected ? exercise.color + '18' : c.surface,
          borderColor: isSelected ? exercise.color : c.grayLight,
        },
      ]}
      onPress={() => {
        haptics.light();
        onSelect(exercise);
      }}
      activeOpacity={0.7}
      accessibilityLabel={`${exercise.name}, MET ${exercise.met}${isSelected ? ', seleccionado' : ''}`}
      accessibilityRole="radio"
      accessibilityState={{ selected: isSelected }}
    >
      <View style={[styles.exerciseItemIcon, { backgroundColor: exercise.color + '15' }]}>
        <Ionicons name={exercise.icon as any} size={18} color={exercise.color} />
      </View>
      <View style={styles.exerciseItemInfo}>
        <Text
          style={[styles.exerciseItemName, { color: isSelected ? exercise.color : c.black }]}
          numberOfLines={1}
        >
          {exercise.name}
        </Text>
        <Text style={[styles.exerciseItemMet, { color: c.gray }]}>MET {exercise.met}</Text>
      </View>
      {isSelected && <Ionicons name="checkmark-circle" size={20} color={exercise.color} />}
    </TouchableOpacity>
  );
}

// ─── Main Screen ────────────────────────────────────────────────────────────

export default function WorkoutScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { sidePadding } = useLayout();
  const c = useThemeColors();
  const { track } = useAnalytics('Workouts');

  // ── Loading state ──
  const [isLoading, setIsLoading] = useState(true);

  // ── Workout log state ──
  const [workouts, setWorkouts] = useState<WorkoutEntry[]>([]);
  const [modalVisible, setModalVisible] = useState(false);

  // ── Workout mode ──
  const [workoutMode, setWorkoutMode] = useState<WorkoutMode>('cardio');

  // ── Modal state — exercise selection ──
  const [selectedExercise, setSelectedExercise] = useState<Exercise>(exerciseDatabase[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<ExerciseCategory | null>(null);
  const [duration, setDuration] = useState(30);
  const [notes, setNotes] = useState('');
  const [userWeight] = useState(DEFAULT_WEIGHT_KG);

  // ── Strength mode state ──
  const [strengthSets, setStrengthSets] = useState<SetEntry[]>(() => createDefaultSets(4));
  const [strengthExerciseName, setStrengthExerciseName] = useState('');

  // ── Rest timer state ──
  const [restTimerActive, setRestTimerActive] = useState(false);
  const [restSeconds, setRestSeconds] = useState(DEFAULT_REST_SECONDS);
  const [restTotal, setRestTotal] = useState(DEFAULT_REST_SECONDS);
  const [restDuration, setRestDuration] = useState(DEFAULT_REST_SECONDS);
  const restIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Active workout tracking ──
  const [activeWorkoutStarted, setActiveWorkoutStarted] = useState(false);
  const [activeWorkoutStart, setActiveWorkoutStart] = useState<Date | null>(null);
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const elapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Calorie confirmation banner ──
  const [savedCalories, setSavedCalories] = useState<number | null>(null);
  const savedCaloriesAnim = useRef(new Animated.Value(0)).current;

  // ── Derived ──
  const estimatedCalories = useMemo(
    () => calculateCalories(selectedExercise.met, userWeight, duration),
    [selectedExercise.met, userWeight, duration],
  );

  const calPerMin = useMemo(
    () => caloriesPerMinute(selectedExercise.met, userWeight),
    [selectedExercise.met, userWeight],
  );

  // Filtered exercise list
  const filteredExercises = useMemo(
    () => searchExercises(searchQuery, activeCategory ?? undefined),
    [searchQuery, activeCategory],
  );

  // Strength stats
  const strengthStats = useMemo(() => {
    const completed = strengthSets.filter((s) => s.completed && !s.isWarmup);
    const totalReps = completed.reduce((acc, s) => acc + s.reps, 0);
    const totalVolume = completed.reduce((acc, s) => acc + s.reps * s.weight, 0);
    // Estimate calories for strength training: ~5 MET * weight * time
    const estimatedMins = completed.length * 2; // ~2 min per set average
    const cal = calculateCalories(5.0, userWeight, estimatedMins);
    return { completedSets: completed.length, totalReps, totalVolume, calories: cal };
  }, [strengthSets, userWeight]);

  // Weekly summary
  const weeklyStats = useMemo(() => {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - diff);
    const weekStartStr = weekStart.toISOString().slice(0, 10);

    const thisWeek = workouts.filter((w) => w.date >= weekStartStr);
    return {
      count: thisWeek.length,
      minutes: thisWeek.reduce((s, w) => s + w.duration, 0),
      calories: thisWeek.reduce((s, w) => s + w.calories, 0),
    };
  }, [workouts]);

  // Recent workouts for re-log
  const recentWorkouts = useMemo(() => workouts.slice(0, MAX_HISTORY), [workouts]);

  // Content fade-in
  const fadeStyle = useFadeIn(!isLoading, { duration: 400 });

  // ── Persistence ──
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as WorkoutEntry[];
            if (parsed.length > 0) setWorkouts(parsed);
          } catch {
            /* use empty state */
          }
        }
      })
      .finally(() => {
        // Small delay so skeleton is visible briefly for polish
        setTimeout(() => setIsLoading(false), 400);
      });
  }, []);

  const persistWorkouts = useCallback((updated: WorkoutEntry[]) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
  }, []);

  // ── Rest Timer Logic ──
  const startRestTimer = useCallback(
    (seconds?: number) => {
      const total = seconds ?? restDuration;
      setRestTotal(total);
      setRestSeconds(total);
      setRestTimerActive(true);
      haptics.light();

      // Clear any existing interval
      if (restIntervalRef.current) clearInterval(restIntervalRef.current);

      restIntervalRef.current = setInterval(() => {
        setRestSeconds((prev) => {
          if (prev <= 1) {
            // Timer complete
            if (restIntervalRef.current) clearInterval(restIntervalRef.current);
            restIntervalRef.current = null;
            setRestTimerActive(false);
            haptics.success();
            return 0;
          }
          // Haptic tick at 10, 5, 3, 2, 1
          if ([10, 5, 3, 2, 1].includes(prev - 1)) {
            haptics.light();
          }
          return prev - 1;
        });
      }, 1000);
    },
    [restDuration],
  );

  const stopRestTimer = useCallback(() => {
    if (restIntervalRef.current) clearInterval(restIntervalRef.current);
    restIntervalRef.current = null;
    setRestTimerActive(false);
    haptics.medium();
  }, []);

  const addRestTime = useCallback(() => {
    setRestSeconds((prev) => Math.min(prev + 15, MAX_REST_SECONDS));
    setRestTotal((prev) => Math.min(prev + 15, MAX_REST_SECONDS));
  }, []);

  const subtractRestTime = useCallback(() => {
    setRestSeconds((prev) => Math.max(prev - 15, MIN_REST_SECONDS));
  }, []);

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      if (restIntervalRef.current) clearInterval(restIntervalRef.current);
      if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current);
    };
  }, []);

  // ── Active Workout Timer ──
  const startActiveWorkout = useCallback(() => {
    setActiveWorkoutStarted(true);
    setActiveWorkoutStart(new Date());
    setElapsedMinutes(0);

    if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current);
    elapsedIntervalRef.current = setInterval(() => {
      setElapsedMinutes((prev) => prev + 1);
    }, 60000);
  }, []);

  const stopActiveWorkout = useCallback(() => {
    setActiveWorkoutStarted(false);
    if (elapsedIntervalRef.current) {
      clearInterval(elapsedIntervalRef.current);
      elapsedIntervalRef.current = null;
    }
  }, []);

  // ── Strength set operations ──
  const addSet = useCallback(() => {
    haptics.light();
    setStrengthSets((prev) => {
      const lastWorking = [...prev].reverse().find((s) => !s.isWarmup);
      return [
        ...prev,
        {
          id: generateId(),
          setNumber: prev.filter((s) => !s.isWarmup).length + 1,
          reps: lastWorking?.reps ?? 10,
          weight: lastWorking?.weight ?? 0,
          completed: false,
          isWarmup: false,
        },
      ];
    });
  }, []);

  const removeSet = useCallback((setId: string) => {
    haptics.light();
    setStrengthSets((prev) => {
      const filtered = prev.filter((s) => s.id !== setId);
      // Renumber working sets
      let workingNum = 1;
      return filtered.map((s) => {
        if (!s.isWarmup) {
          return { ...s, setNumber: workingNum++ };
        }
        return s;
      });
    });
  }, []);

  const toggleSetComplete = useCallback(
    (setId: string) => {
      haptics.medium();
      setStrengthSets((prev) =>
        prev.map((s) => (s.id === setId ? { ...s, completed: !s.completed } : s)),
      );
      // Auto-start rest timer when a set is completed
      const set = strengthSets.find((s) => s.id === setId);
      if (set && !set.completed) {
        startRestTimer();
        track('set_completed', { setNumber: set.setNumber, reps: set.reps, weight: set.weight });
      }
    },
    [strengthSets, startRestTimer],
  );

  const updateSetReps = useCallback((setId: string, reps: number) => {
    setStrengthSets((prev) => prev.map((s) => (s.id === setId ? { ...s, reps } : s)));
  }, []);

  const updateSetWeight = useCallback((setId: string, weight: number) => {
    setStrengthSets((prev) => prev.map((s) => (s.id === setId ? { ...s, weight } : s)));
  }, []);

  const addWarmupSet = useCallback(() => {
    haptics.light();
    setStrengthSets((prev) => [
      {
        id: generateId(),
        setNumber: 0,
        reps: 10,
        weight: 0,
        completed: false,
        isWarmup: true,
      },
      ...prev,
    ]);
  }, []);

  // ── Modal actions ──
  const openModal = useCallback(
    (mode?: WorkoutMode) => {
      haptics.light();
      if (mode) setWorkoutMode(mode);
      setSelectedExercise(exerciseDatabase[0]);
      setSearchQuery('');
      setActiveCategory(null);
      setDuration(30);
      setNotes('');
      setStrengthSets(createDefaultSets(4));
      setStrengthExerciseName('');
      stopActiveWorkout();
      setModalVisible(true);
      track('log_workout_opened', { mode: mode ?? workoutMode });
    },
    [workoutMode],
  );

  const openModalWithExercise = useCallback(
    (entry: WorkoutEntry) => {
      const ex = exerciseDatabase.find((e) => e.id === entry.exerciseId) ?? exerciseDatabase[0];
      setWorkoutMode(entry.mode ?? 'cardio');
      setSelectedExercise(ex);
      setSearchQuery('');
      setActiveCategory(ex.category);
      setDuration(entry.duration);
      setNotes('');
      if (entry.mode === 'strength' && entry.strengthExercises?.[0]) {
        setStrengthExerciseName(entry.strengthExercises[0].exerciseName);
        setStrengthSets(
          entry.strengthExercises[0].sets.map((s) => ({ ...s, completed: false, id: generateId() })),
        );
      } else {
        setStrengthSets(createDefaultSets(4));
        setStrengthExerciseName('');
      }
      setModalVisible(true);
      track('log_workout_relog', { exerciseId: entry.exerciseId, mode: entry.mode });
    },
    [],
  );

  // ── Calorie banner ──
  const showCalorieBanner = useCallback(
    (cal: number) => {
      setSavedCalories(cal);
      savedCaloriesAnim.setValue(0);
      Animated.sequence([
        Animated.timing(savedCaloriesAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.delay(2500),
        Animated.timing(savedCaloriesAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => setSavedCalories(null));
    },
    [savedCaloriesAnim],
  );

  // ── Save workout ──
  const saveWorkout = useCallback(async () => {
    haptics.success();

    let entry: WorkoutEntry;

    if (workoutMode === 'strength') {
      const completedSets = strengthSets.filter((s) => s.completed);
      const totalSets = completedSets.filter((s) => !s.isWarmup).length;
      const totalReps = completedSets.reduce((acc, s) => acc + s.reps, 0);
      const totalVolume = completedSets.reduce((acc, s) => acc + s.reps * s.weight, 0);
      const estimatedMins = activeWorkoutStart
        ? Math.max(1, Math.round((Date.now() - activeWorkoutStart.getTime()) / 60000))
        : totalSets * 2 + (totalSets - 1) * 1.5; // est: 2 min/set + 1.5 min rest
      const cal = calculateCalories(5.0, userWeight, estimatedMins);

      entry = {
        id: `w-${Date.now()}`,
        exerciseId: selectedExercise.id,
        exerciseName: strengthExerciseName || selectedExercise.name,
        exerciseCategory: 'weights',
        exerciseIcon: 'barbell-outline',
        exerciseColor: '#6366F1',
        exerciseMet: 5.0,
        duration: Math.round(estimatedMins),
        calories: cal,
        notes: notes.trim(),
        date: new Date().toISOString().slice(0, 10),
        mode: 'strength',
        strengthExercises: [
          {
            id: generateId(),
            exerciseName: strengthExerciseName || selectedExercise.name,
            sets: completedSets,
          },
        ],
        totalSets,
        totalReps,
        totalVolume,
      };
    } else {
      entry = {
        id: `w-${Date.now()}`,
        exerciseId: selectedExercise.id,
        exerciseName: selectedExercise.name,
        exerciseCategory: selectedExercise.category,
        exerciseIcon: selectedExercise.icon,
        exerciseColor: selectedExercise.color,
        exerciseMet: selectedExercise.met,
        duration,
        calories: estimatedCalories,
        notes: notes.trim(),
        date: new Date().toISOString().slice(0, 10),
        mode: workoutMode,
      };
    }

    // Save locally
    const updated = [entry, ...workouts];
    setWorkouts(updated);
    persistWorkouts(updated);
    setModalVisible(false);
    stopActiveWorkout();
    stopRestTimer();

    // Show calorie burn confirmation banner
    showCalorieBanner(entry.calories);

    // Sync to backend (fire-and-forget)
    const backendType = workoutMode === 'strength'
      ? 'strength'
      : workoutMode === 'flexibility'
        ? 'flexibility'
        : workoutService.mapCategoryToWorkoutType(selectedExercise.category);

    workoutService
      .logWorkout({
        workout_type: backendType as workoutService.WorkoutType,
        duration_min: entry.duration,
        calories_burned: entry.calories,
        notes: entry.notes || null,
      })
      .catch(() => {
        // Backend sync failed; workout is saved locally
      });

    track('workout_logged', {
      exerciseId: selectedExercise.id,
      category: selectedExercise.category,
      mode: workoutMode,
      duration: entry.duration,
      calories: entry.calories,
      ...(workoutMode === 'strength' && {
        totalSets: entry.totalSets,
        totalReps: entry.totalReps,
        totalVolume: entry.totalVolume,
      }),
    });
  }, [
    workoutMode,
    selectedExercise,
    strengthSets,
    strengthExerciseName,
    duration,
    estimatedCalories,
    notes,
    workouts,
    persistWorkouts,
    showCalorieBanner,
    userWeight,
    activeWorkoutStart,
    stopActiveWorkout,
    stopRestTimer,
  ]);

  // ── Can save? ──
  const canSave = useMemo(() => {
    if (workoutMode === 'strength') {
      return strengthSets.some((s) => s.completed);
    }
    return duration >= 5;
  }, [workoutMode, strengthSets, duration]);

  // ── Render ──
  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: sidePadding }]}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: c.surface }]}
          onPress={() => {
            haptics.light();
            navigation.goBack();
          }}
          accessibilityLabel="Volver"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={20} color={c.black} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.black }]}>Workouts</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Calorie burn confirmation banner */}
      {savedCalories !== null && (
        <Animated.View
          style={[
            styles.calorieBurnBanner,
            {
              backgroundColor: '#F97316',
              marginHorizontal: sidePadding,
              opacity: savedCaloriesAnim,
              transform: [
                {
                  translateY: savedCaloriesAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-20, 0],
                  }),
                },
              ],
            },
          ]}
          accessibilityLabel={`${savedCalories} calorias quemadas registradas`}
          accessibilityRole="alert"
        >
          <Ionicons name="flame" size={18} color="#FFFFFF" />
          <Text style={styles.calorieBurnBannerText}>
            -{savedCalories} kcal quemadas! Tu balance se actualizo.
          </Text>
        </Animated.View>
      )}

      {/* Rest timer overlay (floating) */}
      <RestTimerOverlay
        seconds={restSeconds}
        totalSeconds={restTotal}
        isRunning={restTimerActive}
        onStop={stopRestTimer}
        onAddTime={addRestTime}
        onSubtractTime={subtractRestTime}
        c={c}
      />

      {isLoading ? (
        <View style={{ paddingHorizontal: sidePadding }}>
          <WorkoutSkeleton c={c} />
        </View>
      ) : (
        <Animated.View style={[{ flex: 1 }, fadeStyle]}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            bounces
            contentContainerStyle={[styles.scroll, { paddingHorizontal: sidePadding }]}
          >
            {/* Weekly Summary */}
            <Text
              style={[styles.sectionTitle, { color: c.black }]}
              accessibilityRole="header"
            >
              RESUMEN SEMANAL
            </Text>
            <View style={styles.summaryRow}>
              <SummaryCard
                icon="barbell-outline"
                label="Workouts"
                value={`${weeklyStats.count}`}
                color={c.accent}
                c={c}
                delay={0}
              />
              <SummaryCard
                icon="time-outline"
                label="Minutos"
                value={`${weeklyStats.minutes}`}
                color="#34A853"
                c={c}
                delay={100}
              />
              <SummaryCard
                icon="flame-outline"
                label="Calorias"
                value={`${weeklyStats.calories}`}
                color="#EA4335"
                c={c}
                delay={200}
              />
            </View>

            {/* Workout Type Selection */}
            <Text
              style={[styles.sectionTitle, { color: c.black }]}
              accessibilityRole="header"
            >
              TIPO DE ENTRENAMIENTO
            </Text>
            <View style={styles.modeRow}>
              {WORKOUT_MODES.map((mode) => {
                const isActive = workoutMode === mode.key;
                return (
                  <TouchableOpacity
                    key={mode.key}
                    style={[
                      styles.modeCard,
                      {
                        backgroundColor: isActive ? mode.color + '15' : c.surface,
                        borderColor: isActive ? mode.color : c.grayLight,
                      },
                    ]}
                    onPress={() => {
                      haptics.light();
                      setWorkoutMode(mode.key);
                    }}
                    activeOpacity={0.7}
                    accessibilityLabel={`Modo ${mode.label}${isActive ? ', seleccionado' : ''}`}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isActive }}
                  >
                    <Ionicons
                      name={mode.icon as any}
                      size={22}
                      color={isActive ? mode.color : c.gray}
                    />
                    <Text
                      style={[
                        styles.modeLabel,
                        { color: isActive ? mode.color : c.gray },
                      ]}
                    >
                      {mode.label}
                    </Text>
                    {isActive && (
                      <View
                        style={[styles.modeActiveDot, { backgroundColor: mode.color }]}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Log Workout Button */}
            <TouchableOpacity
              style={[styles.logBtn, { backgroundColor: c.accent }]}
              onPress={() => openModal()}
              activeOpacity={0.85}
              accessibilityLabel={`Registrar workout de ${WORKOUT_MODES.find((m) => m.key === workoutMode)?.label}`}
              accessibilityRole="button"
            >
              <Ionicons name="add-circle-outline" size={20} color={c.white} />
              <Text style={[styles.logBtnText, { color: c.white }]}>
                Log Workout
              </Text>
            </TouchableOpacity>

            {/* Recent Workouts */}
            <Text
              style={[styles.sectionTitle, { color: c.black, marginTop: spacing.lg }]}
              accessibilityRole="header"
            >
              ULTIMOS WORKOUTS
            </Text>
            {recentWorkouts.length > 0 && (
              <Text style={[styles.sectionHint, { color: c.gray }]}>
                Toca para re-registrar
              </Text>
            )}
            <View
              style={[
                styles.card,
                { backgroundColor: c.surface, borderColor: c.grayLight },
              ]}
            >
              {recentWorkouts.length === 0 ? (
                <View style={styles.emptyState}>
                  <FitsiMascot expression="muscle" size="medium" animation="idle" />
                  <Text style={[styles.emptyTitle, { color: c.black }]}>
                    Sin workouts recientes
                  </Text>
                  <Text style={[styles.emptyText, { color: c.gray }]}>
                    Registra tu primer entrenamiento para ver tus estadisticas y
                    progreso
                  </Text>
                  <TouchableOpacity
                    style={[styles.emptyCta, { backgroundColor: c.accent }]}
                    onPress={() => openModal()}
                    activeOpacity={0.85}
                    accessibilityLabel="Registrar primer workout"
                    accessibilityRole="button"
                  >
                    <Ionicons name="add-circle-outline" size={18} color={c.white} />
                    <Text style={[styles.emptyCtaText, { color: c.white }]}>
                      Registrar workout
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                recentWorkouts.map((w) => (
                  <WorkoutRow
                    key={w.id}
                    entry={w}
                    c={c}
                    onReLog={openModalWithExercise}
                  />
                ))
              )}
            </View>

            {/* Rest timer configuration */}
            <View
              style={[
                styles.restConfigCard,
                { backgroundColor: c.surface, borderColor: c.grayLight },
              ]}
            >
              <View style={styles.restConfigHeader}>
                <Ionicons name="hourglass-outline" size={18} color={c.accent} />
                <Text style={[styles.restConfigTitle, { color: c.black }]}>
                  Timer de descanso
                </Text>
              </View>
              <Text style={[styles.restConfigDesc, { color: c.gray }]}>
                Se activa automaticamente al completar un set en modo fuerza
              </Text>
              <View style={styles.restConfigRow}>
                <TouchableOpacity
                  style={[
                    styles.restConfigBtn,
                    { backgroundColor: c.bg },
                    restDuration <= MIN_REST_SECONDS && { opacity: 0.4 },
                  ]}
                  onPress={() => {
                    haptics.selection();
                    setRestDuration((d) => Math.max(MIN_REST_SECONDS, d - 15));
                  }}
                  disabled={restDuration <= MIN_REST_SECONDS}
                  accessibilityLabel="Reducir descanso 15 segundos"
                  accessibilityRole="button"
                >
                  <Ionicons name="remove" size={18} color={c.black} />
                </TouchableOpacity>
                <Text style={[styles.restConfigValue, { color: c.black }]}>
                  {formatTime(restDuration)}
                </Text>
                <TouchableOpacity
                  style={[
                    styles.restConfigBtn,
                    { backgroundColor: c.bg },
                    restDuration >= MAX_REST_SECONDS && { opacity: 0.4 },
                  ]}
                  onPress={() => {
                    haptics.selection();
                    setRestDuration((d) => Math.min(MAX_REST_SECONDS, d + 15));
                  }}
                  disabled={restDuration >= MAX_REST_SECONDS}
                  accessibilityLabel="Aumentar descanso 15 segundos"
                  accessibilityRole="button"
                >
                  <Ionicons name="add" size={18} color={c.black} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ height: spacing.xl + insets.bottom }} />
          </ScrollView>
        </Animated.View>
      )}

      {/* ── Log Workout Bottom Sheet ── */}
      <BottomSheet
        visible={modalVisible}
        onClose={() => {
          setModalVisible(false);
          stopActiveWorkout();
        }}
        avoidKeyboard
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          bounces={false}
          nestedScrollEnabled
          style={{ maxHeight: 600 }}
        >
          <Text style={[styles.modalTitle, { color: c.black }]}>Registrar Workout</Text>

          {/* Workout mode tabs in sheet */}
          <View
            style={styles.modeTabsRow}
            accessibilityRole="tablist"
          >
            {WORKOUT_MODES.map((mode) => {
              const isActive = workoutMode === mode.key;
              return (
                <TouchableOpacity
                  key={mode.key}
                  style={[
                    styles.modeTab,
                    {
                      backgroundColor: isActive ? mode.color + '15' : 'transparent',
                      borderBottomColor: isActive ? mode.color : 'transparent',
                    },
                  ]}
                  onPress={() => {
                    haptics.light();
                    setWorkoutMode(mode.key);
                  }}
                  activeOpacity={0.7}
                  accessibilityLabel={`Tab ${mode.label}`}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                >
                  <Ionicons
                    name={mode.icon as any}
                    size={16}
                    color={isActive ? mode.color : c.gray}
                  />
                  <Text
                    style={[
                      styles.modeTabLabel,
                      { color: isActive ? mode.color : c.gray },
                    ]}
                  >
                    {mode.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── STRENGTH MODE ── */}
          {workoutMode === 'strength' && (
            <View>
              {/* Exercise name input */}
              <Text style={[styles.modalLabel, { color: c.gray }]}>
                NOMBRE DEL EJERCICIO
              </Text>
              <View
                style={[
                  styles.searchContainer,
                  { backgroundColor: c.surface, borderColor: c.grayLight },
                ]}
              >
                <Ionicons name="barbell-outline" size={18} color={c.gray} />
                <TextInput
                  style={[styles.searchInput, { color: c.black }]}
                  placeholder="Ej: Press banca, Sentadilla..."
                  placeholderTextColor={c.disabled}
                  value={strengthExerciseName}
                  onChangeText={setStrengthExerciseName}
                  autoCorrect={false}
                  returnKeyType="done"
                  accessibilityLabel="Nombre del ejercicio de fuerza"
                />
              </View>

              {/* Active workout timer */}
              {!activeWorkoutStarted ? (
                <TouchableOpacity
                  style={[
                    styles.startWorkoutBtn,
                    { backgroundColor: '#34A853' + '15', borderColor: '#34A853' + '40' },
                  ]}
                  onPress={() => {
                    haptics.medium();
                    startActiveWorkout();
                  }}
                  activeOpacity={0.7}
                  accessibilityLabel="Iniciar cronometro de entrenamiento"
                  accessibilityRole="button"
                >
                  <Ionicons name="play-circle" size={20} color="#34A853" />
                  <Text style={[styles.startWorkoutBtnText, { color: '#34A853' }]}>
                    Iniciar entrenamiento
                  </Text>
                </TouchableOpacity>
              ) : (
                <View
                  style={[
                    styles.activeWorkoutBanner,
                    { backgroundColor: '#34A853' + '10', borderColor: '#34A853' + '30' },
                  ]}
                  accessibilityLabel={`Entrenamiento activo: ${elapsedMinutes} minutos`}
                  accessibilityRole="timer"
                >
                  <Ionicons name="timer-outline" size={16} color="#34A853" />
                  <Text style={[styles.activeWorkoutText, { color: '#34A853' }]}>
                    En curso: {elapsedMinutes} min
                  </Text>
                  <View
                    style={[styles.activeWorkoutDot, { backgroundColor: '#34A853' }]}
                  />
                </View>
              )}

              {/* Sets table header */}
              <View style={styles.setsHeader}>
                <Text
                  style={[styles.setsHeaderLabel, { color: c.gray, width: 36 }]}
                >
                  Set
                </Text>
                <Text
                  style={[styles.setsHeaderLabel, { color: c.gray, flex: 1 }]}
                >
                  Reps
                </Text>
                <Text
                  style={[styles.setsHeaderLabel, { color: c.gray, flex: 1 }]}
                >
                  Peso (kg)
                </Text>
                <View style={{ width: 36 }} />
              </View>

              {/* Sets list */}
              {strengthSets.map((set) => (
                <SetRow
                  key={set.id}
                  set={set}
                  exerciseName={strengthExerciseName || 'Ejercicio'}
                  c={c}
                  onToggleComplete={() => toggleSetComplete(set.id)}
                  onUpdateReps={(reps) => updateSetReps(set.id, reps)}
                  onUpdateWeight={(weight) => updateSetWeight(set.id, weight)}
                  onRemove={() => removeSet(set.id)}
                />
              ))}

              {/* Add set buttons */}
              <View style={styles.addSetRow}>
                <TouchableOpacity
                  style={[
                    styles.addSetBtn,
                    { backgroundColor: c.surface, borderColor: c.grayLight },
                  ]}
                  onPress={addSet}
                  activeOpacity={0.7}
                  accessibilityLabel="Agregar set de trabajo"
                  accessibilityRole="button"
                >
                  <Ionicons name="add" size={16} color={c.accent} />
                  <Text style={[styles.addSetBtnText, { color: c.accent }]}>
                    + Set
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.addSetBtn,
                    { backgroundColor: '#F59E0B' + '10', borderColor: '#F59E0B' + '30' },
                  ]}
                  onPress={addWarmupSet}
                  activeOpacity={0.7}
                  accessibilityLabel="Agregar set de calentamiento"
                  accessibilityRole="button"
                >
                  <Ionicons name="sunny-outline" size={16} color="#F59E0B" />
                  <Text style={[styles.addSetBtnText, { color: '#F59E0B' }]}>
                    + Warmup
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Strength stats summary */}
              {strengthStats.completedSets > 0 && (
                <View
                  style={[
                    styles.strengthSummary,
                    { backgroundColor: '#6366F1' + '08', borderColor: '#6366F1' + '20' },
                  ]}
                  accessibilityLabel={`Resumen: ${strengthStats.completedSets} sets, ${strengthStats.totalReps} reps, ${strengthStats.totalVolume} kg volumen, ${strengthStats.calories} calorias`}
                  accessibilityRole="text"
                >
                  <View style={styles.strengthSummaryRow}>
                    <View style={styles.strengthStat}>
                      <Text style={[styles.strengthStatValue, { color: '#6366F1' }]}>
                        {strengthStats.completedSets}
                      </Text>
                      <Text style={[styles.strengthStatLabel, { color: c.gray }]}>
                        Sets
                      </Text>
                    </View>
                    <View style={styles.strengthStatDivider} />
                    <View style={styles.strengthStat}>
                      <Text style={[styles.strengthStatValue, { color: '#6366F1' }]}>
                        {strengthStats.totalReps}
                      </Text>
                      <Text style={[styles.strengthStatLabel, { color: c.gray }]}>
                        Reps
                      </Text>
                    </View>
                    <View style={styles.strengthStatDivider} />
                    <View style={styles.strengthStat}>
                      <Text style={[styles.strengthStatValue, { color: '#6366F1' }]}>
                        {strengthStats.totalVolume.toLocaleString()}
                      </Text>
                      <Text style={[styles.strengthStatLabel, { color: c.gray }]}>
                        kg Vol
                      </Text>
                    </View>
                    <View style={styles.strengthStatDivider} />
                    <View style={styles.strengthStat}>
                      <Ionicons name="flame" size={14} color="#EF4444" />
                      <Text style={[styles.strengthStatValue, { color: '#EF4444' }]}>
                        ~{strengthStats.calories}
                      </Text>
                      <Text style={[styles.strengthStatLabel, { color: c.gray }]}>
                        kcal
                      </Text>
                    </View>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* ── CARDIO / FLEXIBILITY MODE ── */}
          {(workoutMode === 'cardio' || workoutMode === 'flexibility') && (
            <View>
              {/* Search */}
              <View
                style={[
                  styles.searchContainer,
                  { backgroundColor: c.surface, borderColor: c.grayLight },
                ]}
              >
                <Ionicons name="search-outline" size={18} color={c.gray} />
                <TextInput
                  style={[styles.searchInput, { color: c.black }]}
                  placeholder="Buscar ejercicio..."
                  placeholderTextColor={c.disabled}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoCorrect={false}
                  returnKeyType="search"
                  accessibilityLabel="Buscar ejercicio"
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setSearchQuery('')}
                    accessibilityLabel="Limpiar busqueda"
                    accessibilityRole="button"
                  >
                    <Ionicons name="close-circle" size={18} color={c.gray} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Category chips */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.categoryScroll}
                accessibilityRole="tablist"
              >
                <TouchableOpacity
                  style={[
                    styles.categoryChip,
                    {
                      backgroundColor:
                        activeCategory === null ? c.accent + '20' : c.surface,
                      borderColor: activeCategory === null ? c.accent : c.grayLight,
                    },
                  ]}
                  onPress={() => {
                    haptics.light();
                    setActiveCategory(null);
                  }}
                  activeOpacity={0.7}
                  accessibilityLabel={`Categoria Todos${activeCategory === null ? ', seleccionada' : ''}`}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: activeCategory === null }}
                >
                  <Text
                    style={[
                      styles.categoryLabel,
                      { color: activeCategory === null ? c.accent : c.gray },
                    ]}
                  >
                    Todos
                  </Text>
                </TouchableOpacity>
                {EXERCISE_CATEGORIES.map((cat) => {
                  const isActive = activeCategory === cat.key;
                  return (
                    <TouchableOpacity
                      key={cat.key}
                      style={[
                        styles.categoryChip,
                        {
                          backgroundColor: isActive ? cat.color + '20' : c.surface,
                          borderColor: isActive ? cat.color : c.grayLight,
                        },
                      ]}
                      onPress={() => {
                        haptics.light();
                        setActiveCategory(isActive ? null : cat.key);
                      }}
                      activeOpacity={0.7}
                      accessibilityLabel={`Categoria ${cat.label}${isActive ? ', seleccionada' : ''}`}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: isActive }}
                    >
                      <Ionicons
                        name={cat.icon as any}
                        size={14}
                        color={isActive ? cat.color : c.gray}
                      />
                      <Text
                        style={[
                          styles.categoryLabel,
                          { color: isActive ? cat.color : c.gray },
                        ]}
                      >
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Exercise list */}
              <View style={styles.exerciseListContainer}>
                <FlatList
                  data={filteredExercises}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <ExerciseItem
                      exercise={item}
                      isSelected={item.id === selectedExercise.id}
                      c={c}
                      onSelect={setSelectedExercise}
                    />
                  )}
                  showsVerticalScrollIndicator={false}
                  style={styles.exerciseList}
                  nestedScrollEnabled
                  initialNumToRender={10}
                  ListEmptyComponent={
                    <View style={styles.noResults}>
                      <Ionicons name="search-outline" size={24} color={c.disabled} />
                      <Text style={[styles.noResultsText, { color: c.gray }]}>
                        Sin resultados para "{searchQuery}"
                      </Text>
                    </View>
                  }
                />
              </View>

              {/* Selected exercise badge */}
              <View
                style={[
                  styles.selectedBadge,
                  {
                    backgroundColor: selectedExercise.color + '15',
                    borderColor: selectedExercise.color + '30',
                  },
                ]}
                accessibilityLabel={`Ejercicio seleccionado: ${selectedExercise.name}, MET ${selectedExercise.met}`}
              >
                <Ionicons
                  name={selectedExercise.icon as any}
                  size={16}
                  color={selectedExercise.color}
                />
                <Text
                  style={[styles.selectedBadgeText, { color: selectedExercise.color }]}
                  numberOfLines={1}
                >
                  {selectedExercise.name}
                </Text>
                <Text style={[styles.selectedBadgeMet, { color: c.gray }]}>
                  MET {selectedExercise.met}
                </Text>
              </View>

              {/* Duration stepper */}
              <Text style={[styles.modalLabel, { color: c.gray, marginTop: spacing.sm }]}>
                DURACION
              </Text>
              <View style={styles.durationRow}>
                <TouchableOpacity
                  style={[
                    styles.stepperBtn,
                    { backgroundColor: c.surface },
                    duration <= 5 && { opacity: 0.4 },
                  ]}
                  onPress={() => {
                    haptics.selection();
                    setDuration((d) => Math.max(5, d - 5));
                  }}
                  disabled={duration <= 5}
                  activeOpacity={0.6}
                  accessibilityLabel="Reducir duracion 5 minutos"
                  accessibilityRole="button"
                >
                  <Ionicons name="remove" size={20} color={c.black} />
                </TouchableOpacity>
                <Text
                  style={[styles.durationValue, { color: c.black }]}
                  accessibilityLabel={`Duracion: ${duration} minutos`}
                >
                  {duration} min
                </Text>
                <TouchableOpacity
                  style={[
                    styles.stepperBtn,
                    { backgroundColor: c.surface },
                    duration >= 180 && { opacity: 0.4 },
                  ]}
                  onPress={() => {
                    haptics.selection();
                    setDuration((d) => Math.min(180, d + 5));
                  }}
                  disabled={duration >= 180}
                  activeOpacity={0.6}
                  accessibilityLabel="Aumentar duracion 5 minutos"
                  accessibilityRole="button"
                >
                  <Ionicons name="add" size={20} color={c.black} />
                </TouchableOpacity>
              </View>

              {/* Calorie estimate (real-time) */}
              <View
                style={[
                  styles.calEstimate,
                  { backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FDBA74' },
                ]}
                accessibilityLabel={`Estimacion: ${estimatedCalories} calorias a quemar, ${calPerMin.toFixed(1)} calorias por minuto`}
                accessibilityRole="text"
              >
                <Ionicons name="flame" size={18} color="#F97316" />
                <View style={styles.calEstimateInfo}>
                  <Text style={[styles.calEstimateText, { color: '#9A3412' }]}>
                    ~{estimatedCalories} kcal a quemar
                  </Text>
                  <Text style={[styles.calEstimateRate, { color: '#C2410C' }]}>
                    {calPerMin.toFixed(1)} kcal/min ({userWeight} kg) — se sumaran a tu
                    balance
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Notes (all modes) */}
          <Text style={[styles.modalLabel, { color: c.gray, marginTop: spacing.md }]}>
            NOTAS (OPCIONAL)
          </Text>
          <TextInput
            style={[
              styles.notesInput,
              { backgroundColor: c.surface, color: c.black, borderColor: c.grayLight },
            ]}
            placeholder={
              workoutMode === 'strength'
                ? 'Ej: Dia de pecho, se sintio facil...'
                : 'Ej: Pecho y espalda, 5K en cinta...'
            }
            placeholderTextColor={c.disabled}
            value={notes}
            onChangeText={setNotes}
            multiline
            maxLength={200}
            accessibilityLabel="Notas del entrenamiento"
          />

          {/* Save button */}
          <TouchableOpacity
            style={[
              styles.saveBtn,
              {
                backgroundColor: canSave ? c.accent : c.disabled,
              },
            ]}
            onPress={saveWorkout}
            activeOpacity={canSave ? 0.85 : 1}
            disabled={!canSave}
            accessibilityLabel={canSave ? 'Guardar workout' : 'Completa al menos un set o ajusta la duracion'}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSave }}
          >
            <Ionicons
              name="checkmark-circle-outline"
              size={20}
              color={c.white}
            />
            <Text style={[styles.saveBtnText, { color: c.white }]}>
              {workoutMode === 'strength'
                ? `Guardar (${strengthStats.completedSets} sets)`
                : 'Guardar'}
            </Text>
          </TouchableOpacity>

          <View style={{ height: spacing.md }} />
        </ScrollView>
      </BottomSheet>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
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
    flex: 1,
  },
  scroll: {
    paddingTop: spacing.sm,
  },
  sectionTitle: {
    ...typography.label,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionHint: {
    ...typography.caption,
    marginBottom: spacing.sm,
  },

  // ── Summary ──
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  summaryCard: {
    flex: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  summaryValue: {
    ...typography.label,
    fontSize: 18,
    textAlign: 'center',
  },
  summaryLabel: { ...typography.caption, textAlign: 'center' },

  // ── Workout mode selection ──
  modeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  modeCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
  },
  modeLabel: {
    ...typography.label,
    fontSize: 12,
  },
  modeActiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    position: 'absolute',
    top: 6,
    right: 6,
  },

  // ── Mode tabs in bottom sheet ──
  modeTabsRow: {
    flexDirection: 'row',
    marginBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E020',
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 2,
  },
  modeTabLabel: {
    ...typography.label,
    fontSize: 13,
  },

  // ── Log button ──
  logBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: radius.full,
    gap: spacing.sm,
    ...shadows.sm,
  },
  logBtnText: { ...typography.button },

  // ── Card ──
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    ...shadows.sm,
  },

  // ── Workout row (history) ──
  workoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: 1,
  },
  workoutIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workoutInfo: { flex: 1 },
  workoutTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  workoutTitle: { ...typography.bodyMd, flex: 1 },
  workoutMeta: { ...typography.caption, marginTop: 2 },
  workoutNotes: {
    ...typography.caption,
    fontStyle: 'italic',
    marginTop: 2,
  },
  modeBadgeMini: {
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  modeBadgeMiniText: {
    fontSize: 10,
    fontWeight: '600',
  },

  // ── Empty state ──
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  emptyTitle: { ...typography.bodyMd, marginTop: spacing.sm },
  emptyText: {
    ...typography.caption,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
    marginTop: spacing.sm,
  },
  emptyCtaText: { ...typography.label },

  // ── Rest timer config ──
  restConfigCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  restConfigHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  restConfigTitle: {
    ...typography.bodyMd,
  },
  restConfigDesc: {
    ...typography.caption,
    marginBottom: spacing.sm,
  },
  restConfigRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  restConfigBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restConfigValue: {
    ...typography.titleSm,
    minWidth: 60,
    textAlign: 'center',
  },

  // ── Rest timer overlay ──
  restTimerOverlay: {
    position: 'absolute',
    bottom: 100,
    left: spacing.lg,
    right: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    zIndex: 100,
    ...shadows.lg,
  },
  restTimerContent: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  restTimerCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  restTimerCircleProgress: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
  },
  restTimerCircleInner: {
    alignItems: 'center',
    gap: 2,
  },
  restTimerTime: {
    ...typography.titleSm,
    fontSize: 16,
  },
  restTimerLabel: {
    ...typography.caption,
    marginBottom: spacing.sm,
  },
  restTimerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  restTimerControlBtn: {
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
  },
  restTimerControlText: {
    ...typography.label,
    fontSize: 12,
  },
  restTimerStopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
  },
  restTimerStopText: {
    ...typography.label,
    fontSize: 12,
  },

  // ── Bottom sheet content ──
  modalTitle: { ...typography.titleSm, marginBottom: spacing.md },
  modalLabel: {
    ...typography.label,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    height: 44,
    marginBottom: spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    paddingVertical: 0,
  },

  // Category chips
  categoryScroll: {
    marginBottom: spacing.sm,
    maxHeight: 40,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    borderWidth: 1,
    marginRight: spacing.xs,
  },
  categoryLabel: { ...typography.caption, fontWeight: '600' },

  // Exercise list
  exerciseListContainer: {
    maxHeight: 160,
    marginBottom: spacing.sm,
  },
  exerciseList: {
    flexGrow: 0,
  },
  exerciseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.xs,
  },
  exerciseItemIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseItemInfo: {
    flex: 1,
  },
  exerciseItemName: {
    ...typography.bodyMd,
    fontSize: 14,
  },
  exerciseItemMet: {
    ...typography.caption,
  },
  noResults: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.xs,
  },
  noResultsText: {
    ...typography.caption,
    textAlign: 'center',
  },

  // Selected badge
  selectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.xs,
  },
  selectedBadgeText: {
    ...typography.bodyMd,
    fontSize: 14,
    flex: 1,
  },
  selectedBadgeMet: {
    ...typography.caption,
  },

  // Duration
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  stepperBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationValue: {
    ...typography.titleSm,
    minWidth: 80,
    textAlign: 'center',
  },

  // Calorie estimate
  calEstimate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  calEstimateInfo: {
    flex: 1,
  },
  calEstimateText: { ...typography.bodyMd },
  calEstimateRate: { ...typography.caption, marginTop: 2 },

  // Notes
  notesInput: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    minHeight: 60,
    ...typography.body,
    textAlignVertical: 'top',
  },

  // Save
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: radius.full,
    gap: spacing.sm,
    marginTop: spacing.md,
    ...shadows.sm,
  },
  saveBtnText: { ...typography.button },

  // Calorie burn confirmation banner
  calorieBurnBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.sm,
  },
  calorieBurnBannerText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },

  // ── Strength mode ──
  startWorkoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  startWorkoutBtnText: {
    ...typography.label,
  },
  activeWorkoutBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  activeWorkoutText: {
    ...typography.label,
    flex: 1,
  },
  activeWorkoutDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Sets table
  setsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.xs,
  },
  setsHeaderLabel: {
    ...typography.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.xs,
  },
  setNumberContainer: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setNumber: {
    ...typography.label,
    fontSize: 14,
  },
  warmupBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warmupText: {
    fontSize: 11,
    fontWeight: '700',
  },
  setInputGroup: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  setInputLabel: {
    fontSize: 10,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  setInput: {
    width: '100%',
    height: 38,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setInputText: {
    ...typography.bodyMd,
    fontSize: 15,
    textAlign: 'center',
    width: '100%',
    paddingHorizontal: spacing.xs,
  },
  setCompleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addSetRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  addSetBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  addSetBtnText: {
    ...typography.label,
    fontSize: 13,
  },

  // Strength summary
  strengthSummary: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  strengthSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  strengthStat: {
    alignItems: 'center',
    gap: 2,
  },
  strengthStatValue: {
    ...typography.label,
    fontSize: 16,
  },
  strengthStatLabel: {
    ...typography.caption,
    fontSize: 10,
  },
  strengthStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#6366F1' + '20',
  },
});
