/**
 * WorkoutScreen — Enhanced workout tracking with exercise database, MET-based
 * calorie calculation, category/search selector, and recent history re-log.
 *
 * Features:
 * 1. Exercise selector from 50-exercise database (search + category filter)
 * 2. Automatic calorie calculation: MET * weightKg * 3.5 / 200 * duration
 * 3. Real-time calorie estimate updates as user adjusts duration
 * 4. Quick re-log from last 10 workouts
 * 5. Weekly summary with total minutes, calories, and workout count
 * 6. Full dark mode support, haptics, analytics
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
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useThemeColors, typography, spacing, radius, shadows, useLayout } from '../../theme';
import { haptics } from '../../hooks/useHaptics';
import { useAnalytics } from '../../hooks/useAnalytics';
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

// ─── Types ──────────────────────────────────────────────────────────────────

interface WorkoutEntry {
  id: string;
  exerciseId: string;
  exerciseName: string;
  exerciseCategory: ExerciseCategory;
  exerciseIcon: string;
  exerciseColor: string;
  exerciseMet: number;
  duration: number;   // minutes
  calories: number;
  notes: string;
  date: string;       // ISO date (YYYY-MM-DD)
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STORAGE_KEY = '@fitsi_workout_log';
const MAX_HISTORY = 10;
const DEFAULT_WEIGHT_KG = 70; // fallback if user weight not available

// ─── Mock data (seeds initial display) ──────────────────────────────────────

function generateMockWorkouts(): WorkoutEntry[] {
  const entries: WorkoutEntry[] = [];
  const now = new Date();
  const samples = [
    { exId: 'ex-wgt01', dur: 55, notes: 'Pecho y triceps' },
    { exId: 'ex-run02', dur: 30, notes: 'Correr 5K' },
    { exId: 'ex-yog01', dur: 20, notes: 'Yoga matutino' },
    { exId: 'ex-wgt04', dur: 60, notes: 'Espalda y biceps' },
    { exId: 'ex-spt01', dur: 90, notes: 'Futbol con amigos' },
  ];
  for (let i = 0; i < samples.length; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i - 1);
    const s = samples[i];
    const ex = exerciseDatabase.find((e) => e.id === s.exId) ?? exerciseDatabase[0];
    entries.push({
      id: `mock-${i}`,
      exerciseId: ex.id,
      exerciseName: ex.name,
      exerciseCategory: ex.category,
      exerciseIcon: ex.icon,
      exerciseColor: ex.color,
      exerciseMet: ex.met,
      duration: s.dur,
      calories: calculateCalories(ex.met, DEFAULT_WEIGHT_KG, s.dur),
      notes: s.notes,
      date: d.toISOString().slice(0, 10),
    });
  }
  return entries;
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
    >
      <Ionicons name={icon as any} size={20} color={color} />
      <Text style={[styles.summaryValue, { color: c.black }]}>{value}</Text>
      <Text style={[styles.summaryLabel, { color: c.gray }]}>{label}</Text>
    </Animated.View>
  );
}

// ─── Workout Row ────────────────────────────────────────────────────────────

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
  const dayLabel = dateObj.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <TouchableOpacity
      style={[styles.workoutRow, { borderBottomColor: c.surface }]}
      onPress={() => { haptics.light(); onReLog(entry); }}
      activeOpacity={0.7}
      accessibilityLabel={`Re-registrar ${entry.exerciseName}`}
      accessibilityHint="Toca para registrar este ejercicio nuevamente"
      accessibilityRole="button"
    >
      <View style={[styles.workoutIcon, { backgroundColor: entry.exerciseColor + '18' }]}>
        <Ionicons name={entry.exerciseIcon as any} size={20} color={entry.exerciseColor} />
      </View>
      <View style={styles.workoutInfo}>
        <Text style={[styles.workoutTitle, { color: c.black }]}>{entry.exerciseName}</Text>
        <Text style={[styles.workoutMeta, { color: c.gray }]}>
          {dayLabel} · {entry.duration} min · {entry.calories} kcal
        </Text>
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
        { backgroundColor: isSelected ? exercise.color + '18' : c.surface, borderColor: isSelected ? exercise.color : c.grayLight },
      ]}
      onPress={() => { haptics.light(); onSelect(exercise); }}
      activeOpacity={0.7}
    >
      <View style={[styles.exerciseItemIcon, { backgroundColor: exercise.color + '15' }]}>
        <Ionicons name={exercise.icon as any} size={18} color={exercise.color} />
      </View>
      <View style={styles.exerciseItemInfo}>
        <Text style={[styles.exerciseItemName, { color: isSelected ? exercise.color : c.black }]} numberOfLines={1}>
          {exercise.name}
        </Text>
        <Text style={[styles.exerciseItemMet, { color: c.gray }]}>
          MET {exercise.met}
        </Text>
      </View>
      {isSelected && (
        <Ionicons name="checkmark-circle" size={20} color={exercise.color} />
      )}
    </TouchableOpacity>
  );
}

// ─── Main Screen ────────────────────────────────────────────────────────────

export default function WorkoutScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { sidePadding } = useLayout();
  const c = useThemeColors();
  const { track } = useAnalytics('Workouts');

  // ── State ──
  const [workouts, setWorkouts] = useState<WorkoutEntry[]>(generateMockWorkouts);
  const [modalVisible, setModalVisible] = useState(false);

  // Modal — exercise selection state
  const [selectedExercise, setSelectedExercise] = useState<Exercise>(exerciseDatabase[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<ExerciseCategory | null>(null);
  const [duration, setDuration] = useState(30);
  const [notes, setNotes] = useState('');
  const [userWeight] = useState(DEFAULT_WEIGHT_KG); // TODO: pull from user profile

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

  // Recent workouts for re-log (last 10)
  const recentWorkouts = useMemo(() => workouts.slice(0, MAX_HISTORY), [workouts]);

  // ── Persistence ──
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as WorkoutEntry[];
          if (parsed.length > 0) setWorkouts(parsed);
        } catch { /* use mock data */ }
      }
    });
  }, []);

  const persistWorkouts = useCallback((updated: WorkoutEntry[]) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
  }, []);

  // ── Modal actions ──
  const openModal = useCallback(() => {
    haptics.light();
    setSelectedExercise(exerciseDatabase[0]);
    setSearchQuery('');
    setActiveCategory(null);
    setDuration(30);
    setNotes('');
    setModalVisible(true);
    track('log_workout_opened');
  }, []);

  const openModalWithExercise = useCallback((entry: WorkoutEntry) => {
    const ex = exerciseDatabase.find((e) => e.id === entry.exerciseId) ?? exerciseDatabase[0];
    setSelectedExercise(ex);
    setSearchQuery('');
    setActiveCategory(ex.category);
    setDuration(entry.duration);
    setNotes('');
    setModalVisible(true);
    track('log_workout_relog', { exerciseId: entry.exerciseId });
  }, []);

  const saveWorkout = useCallback(() => {
    haptics.medium();
    const entry: WorkoutEntry = {
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
    };
    const updated = [entry, ...workouts];
    setWorkouts(updated);
    persistWorkouts(updated);
    setModalVisible(false);
    track('workout_logged', {
      exerciseId: selectedExercise.id,
      category: selectedExercise.category,
      duration,
      calories: estimatedCalories,
    });
  }, [selectedExercise, duration, estimatedCalories, notes, workouts, persistWorkouts]);

  // ── Render ──
  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: sidePadding }]}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: c.surface }]}
          onPress={() => { haptics.light(); navigation.goBack(); }}
          accessibilityLabel="Volver"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={20} color={c.black} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.black }]}>Workouts</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        bounces
        contentContainerStyle={[styles.scroll, { paddingHorizontal: sidePadding }]}
      >
        {/* Weekly Summary */}
        <Text style={[styles.sectionTitle, { color: c.black }]}>RESUMEN SEMANAL</Text>
        <View style={styles.summaryRow}>
          <SummaryCard icon="barbell-outline" label="Workouts" value={`${weeklyStats.count}`} color={c.accent} c={c} delay={0} />
          <SummaryCard icon="time-outline" label="Minutos" value={`${weeklyStats.minutes}`} color="#34A853" c={c} delay={100} />
          <SummaryCard icon="flame-outline" label="Calorias" value={`${weeklyStats.calories}`} color="#EA4335" c={c} delay={200} />
        </View>

        {/* Log Workout Button */}
        <TouchableOpacity
          style={[styles.logBtn, { backgroundColor: c.accent }]}
          onPress={openModal}
          activeOpacity={0.85}
          accessibilityLabel="Registrar workout"
          accessibilityRole="button"
        >
          <Ionicons name="add-circle-outline" size={20} color={c.white} />
          <Text style={[styles.logBtnText, { color: c.white }]}>Log Workout</Text>
        </TouchableOpacity>

        {/* Recent Workouts */}
        <Text style={[styles.sectionTitle, { color: c.black, marginTop: spacing.lg }]}>
          ULTIMOS WORKOUTS
        </Text>
        <Text style={[styles.sectionHint, { color: c.gray }]}>
          Toca para re-registrar
        </Text>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
          {recentWorkouts.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyTitle, { color: c.black }]}>Sin workouts recientes</Text>
              <Text style={[styles.emptyText, { color: c.gray }]}>
                Registra tu primer entrenamiento para ver tus estadisticas y progreso
              </Text>
              <TouchableOpacity
                style={[styles.emptyCta, { backgroundColor: c.accent }]}
                onPress={openModal}
                activeOpacity={0.85}
                accessibilityLabel="Registrar primer workout"
                accessibilityRole="button"
              >
                <Ionicons name="add-circle-outline" size={18} color={c.white} />
                <Text style={[styles.emptyCtaText, { color: c.white }]}>Registrar workout</Text>
              </TouchableOpacity>
            </View>
          ) : (
            recentWorkouts.map((w) => (
              <WorkoutRow key={w.id} entry={w} c={c} onReLog={openModalWithExercise} />
            ))
          )}
        </View>

        <View style={{ height: spacing.xl }} />
      </ScrollView>

      {/* ── Log Workout Bottom Sheet ── */}
      <BottomSheet
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        avoidKeyboard
      >
        <Text style={[styles.modalTitle, { color: c.black }]}>Registrar Workout</Text>

        {/* Search */}
        <View style={[styles.searchContainer, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
          <Ionicons name="search-outline" size={18} color={c.gray} />
          <TextInput
            style={[styles.searchInput, { color: c.black }]}
            placeholder="Buscar ejercicio..."
            placeholderTextColor={c.disabled}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={c.gray} />
            </TouchableOpacity>
          )}
        </View>

        {/* Category chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
          <TouchableOpacity
            style={[
              styles.categoryChip,
              {
                backgroundColor: activeCategory === null ? c.accent + '20' : c.surface,
                borderColor: activeCategory === null ? c.accent : c.grayLight,
              },
            ]}
            onPress={() => { haptics.light(); setActiveCategory(null); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.categoryLabel, { color: activeCategory === null ? c.accent : c.gray }]}>
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
                onPress={() => { haptics.light(); setActiveCategory(isActive ? null : cat.key); }}
                activeOpacity={0.7}
              >
                <Ionicons name={cat.icon as any} size={14} color={isActive ? cat.color : c.gray} />
                <Text style={[styles.categoryLabel, { color: isActive ? cat.color : c.gray }]}>
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
        <View style={[styles.selectedBadge, { backgroundColor: selectedExercise.color + '15', borderColor: selectedExercise.color + '30' }]}>
          <Ionicons name={selectedExercise.icon as any} size={16} color={selectedExercise.color} />
          <Text style={[styles.selectedBadgeText, { color: selectedExercise.color }]} numberOfLines={1}>
            {selectedExercise.name}
          </Text>
          <Text style={[styles.selectedBadgeMet, { color: c.gray }]}>
            MET {selectedExercise.met}
          </Text>
        </View>

        {/* Duration stepper */}
        <Text style={[styles.modalLabel, { color: c.gray, marginTop: spacing.sm }]}>DURACION</Text>
        <View style={styles.durationRow}>
          <TouchableOpacity
            style={[styles.stepperBtn, { backgroundColor: c.surface }, duration <= 5 && { opacity: 0.4 }]}
            onPress={() => { haptics.light(); setDuration((d) => Math.max(5, d - 5)); }}
            disabled={duration <= 5}
            activeOpacity={0.6}
          >
            <Ionicons name="remove" size={20} color={c.black} />
          </TouchableOpacity>
          <Text style={[styles.durationValue, { color: c.black }]}>{duration} min</Text>
          <TouchableOpacity
            style={[styles.stepperBtn, { backgroundColor: c.surface }, duration >= 180 && { opacity: 0.4 }]}
            onPress={() => { haptics.light(); setDuration((d) => Math.min(180, d + 5)); }}
            disabled={duration >= 180}
            activeOpacity={0.6}
          >
            <Ionicons name="add" size={20} color={c.black} />
          </TouchableOpacity>
        </View>

        {/* Calorie estimate (real-time) */}
        <View style={[styles.calEstimate, { backgroundColor: c.surface }]}>
          <Ionicons name="flame-outline" size={18} color="#EA4335" />
          <View style={styles.calEstimateInfo}>
            <Text style={[styles.calEstimateText, { color: c.black }]}>
              ~{estimatedCalories} kcal estimadas
            </Text>
            <Text style={[styles.calEstimateRate, { color: c.gray }]}>
              {calPerMin.toFixed(1)} kcal/min ({userWeight} kg)
            </Text>
          </View>
        </View>

        {/* Notes */}
        <Text style={[styles.modalLabel, { color: c.gray, marginTop: spacing.md }]}>NOTAS (OPCIONAL)</Text>
        <TextInput
          style={[styles.notesInput, { backgroundColor: c.surface, color: c.black, borderColor: c.grayLight }]}
          placeholder="Ej: Pecho y espalda, 5K en cinta..."
          placeholderTextColor={c.disabled}
          value={notes}
          onChangeText={setNotes}
          multiline
          maxLength={200}
        />

        {/* Save button */}
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: c.accent }]}
          onPress={saveWorkout}
          activeOpacity={0.85}
          accessibilityLabel="Guardar workout"
          accessibilityRole="button"
        >
          <Ionicons name="checkmark-circle-outline" size={20} color={c.white} />
          <Text style={[styles.saveBtnText, { color: c.white }]}>Guardar</Text>
        </TouchableOpacity>
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
  summaryValue: { ...typography.label, fontSize: 18, textAlign: 'center' },
  summaryLabel: { ...typography.caption, textAlign: 'center' },
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
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    ...shadows.sm,
  },
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
  workoutTitle: { ...typography.bodyMd },
  workoutMeta: { ...typography.caption, marginTop: 2 },
  workoutNotes: { ...typography.caption, fontStyle: 'italic', marginTop: 2 },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  emptyTitle: { ...typography.bodyMd, marginTop: spacing.sm },
  emptyText: { ...typography.caption, textAlign: 'center', paddingHorizontal: spacing.md },
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
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationValue: { ...typography.titleSm, minWidth: 80, textAlign: 'center' },

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
});
