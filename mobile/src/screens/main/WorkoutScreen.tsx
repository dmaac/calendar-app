/**
 * WorkoutScreen — Workout tracking with weekly summary, log modal, and recent history
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, typography, spacing, radius, shadows, useLayout } from '../../theme';
import { haptics } from '../../hooks/useHaptics';
import { useAnalytics } from '../../hooks/useAnalytics';
import FitsiMascot from '../../components/FitsiMascot';
import BottomSheet from '../../components/BottomSheet';

// ─── Types ──────────────────────────────────────────────────────────────────

interface WorkoutType {
  key: string;
  label: string;
  icon: string;
  calPerMin: number; // avg calories per minute
  color: string;
}

interface WorkoutEntry {
  id: string;
  type: WorkoutType;
  duration: number; // minutes
  calories: number;
  notes: string;
  date: string; // ISO date
}

// ─── Constants ──────────────────────────────────────────────────────────────

const WORKOUT_TYPES: WorkoutType[] = [
  { key: 'cardio',      label: 'Cardio',       icon: 'heart-outline',      calPerMin: 10, color: '#EA4335' },
  { key: 'strength',    label: 'Fuerza',       icon: 'barbell-outline',    calPerMin: 7,  color: '#4285F4' },
  { key: 'flexibility', label: 'Flexibilidad', icon: 'body-outline',       calPerMin: 4,  color: '#34A853' },
  { key: 'sports',      label: 'Deportes',     icon: 'football-outline',   calPerMin: 9,  color: '#FBBC04' },
  { key: 'other',       label: 'Otro',         icon: 'fitness-outline',    calPerMin: 6,  color: '#9C27B0' },
];

// ─── Mock data (last 7 days) ────────────────────────────────────────────────

function generateMockWorkouts(): WorkoutEntry[] {
  const entries: WorkoutEntry[] = [];
  const now = new Date();
  const samples = [
    { typeIdx: 1, dur: 55, notes: 'Pecho y triceps' },
    { typeIdx: 0, dur: 30, notes: 'Correr 5K' },
    { typeIdx: 2, dur: 20, notes: 'Yoga matutino' },
    { typeIdx: 1, dur: 60, notes: 'Espalda y biceps' },
    { typeIdx: 3, dur: 90, notes: 'Futbol con amigos' },
  ];
  for (let i = 0; i < samples.length; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i - 1);
    const s = samples[i];
    const type = WORKOUT_TYPES[s.typeIdx];
    entries.push({
      id: `mock-${i}`,
      type,
      duration: s.dur,
      calories: Math.round(s.dur * type.calPerMin),
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
}: {
  entry: WorkoutEntry;
  c: ReturnType<typeof useThemeColors>;
}) {
  const dateObj = new Date(entry.date + 'T12:00:00');
  const dayLabel = dateObj.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <View style={[styles.workoutRow, { borderBottomColor: c.surface }]}>
      <View style={[styles.workoutIcon, { backgroundColor: entry.type.color + '18' }]}>
        <Ionicons name={entry.type.icon as any} size={20} color={entry.type.color} />
      </View>
      <View style={styles.workoutInfo}>
        <Text style={[styles.workoutTitle, { color: c.black }]}>{entry.type.label}</Text>
        <Text style={[styles.workoutMeta, { color: c.gray }]}>
          {dayLabel} · {entry.duration} min · {entry.calories} kcal
        </Text>
        {entry.notes ? (
          <Text style={[styles.workoutNotes, { color: c.gray }]} numberOfLines={1}>
            {entry.notes}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// ─── Main Screen ────────────────────────────────────────────────────────────

export default function WorkoutScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { sidePadding } = useLayout();
  const c = useThemeColors();
  const { track } = useAnalytics('Workouts');

  const [workouts, setWorkouts] = useState<WorkoutEntry[]>(generateMockWorkouts);
  const [modalVisible, setModalVisible] = useState(false);

  // Modal state
  const [selectedType, setSelectedType] = useState<WorkoutType>(WORKOUT_TYPES[0]);
  const [duration, setDuration] = useState(30);
  const [notes, setNotes] = useState('');

  const estimatedCalories = Math.round(duration * selectedType.calPerMin);

  // Weekly summary
  const totalWorkouts = workouts.length;
  const totalMinutes = workouts.reduce((sum, w) => sum + w.duration, 0);
  const totalCalories = workouts.reduce((sum, w) => sum + w.calories, 0);

  const openModal = useCallback(() => {
    haptics.light();
    setSelectedType(WORKOUT_TYPES[0]);
    setDuration(30);
    setNotes('');
    setModalVisible(true);
    track('log_workout_opened');
  }, []);

  const saveWorkout = useCallback(() => {
    haptics.medium();
    const entry: WorkoutEntry = {
      id: `w-${Date.now()}`,
      type: selectedType,
      duration,
      calories: estimatedCalories,
      notes: notes.trim(),
      date: new Date().toISOString().slice(0, 10),
    };
    setWorkouts((prev) => [entry, ...prev]);
    setModalVisible(false);
    track('workout_logged', { type: selectedType.key, duration, calories: estimatedCalories });
  }, [selectedType, duration, estimatedCalories, notes]);

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
        <FitsiMascot expression="muscle" size="small" animation="idle" disableTouch />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        bounces
        contentContainerStyle={[styles.scroll, { paddingHorizontal: sidePadding }]}
      >
        {/* Weekly Summary */}
        <Text style={[styles.sectionTitle, { color: c.black }]}>RESUMEN SEMANAL</Text>
        <View style={styles.summaryRow}>
          <SummaryCard icon="barbell-outline" label="Workouts" value={`${totalWorkouts}`} color={c.accent} c={c} delay={0} />
          <SummaryCard icon="time-outline" label="Minutos" value={`${totalMinutes}`} color="#34A853" c={c} delay={100} />
          <SummaryCard icon="flame-outline" label="Calorias" value={`${totalCalories}`} color="#EA4335" c={c} delay={200} />
        </View>

        {/* Log Workout Button */}
        <TouchableOpacity
          style={[styles.logBtn, { backgroundColor: c.black }]}
          onPress={openModal}
          activeOpacity={0.85}
          accessibilityLabel="Registrar workout"
          accessibilityRole="button"
        >
          <Ionicons name="add-circle-outline" size={20} color={c.white} />
          <Text style={[styles.logBtnText, { color: c.white }]}>Log Workout</Text>
        </TouchableOpacity>

        {/* Recent Workouts */}
        <Text style={[styles.sectionTitle, { color: c.black, marginTop: spacing.lg }]}>ULTIMOS 7 DIAS</Text>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
          {workouts.length === 0 ? (
            <View style={styles.emptyState}>
              <FitsiMascot expression="muscle" size="medium" animation="idle" />
              <Text style={[styles.emptyTitle, { color: c.black }]}>Sin workouts esta semana</Text>
              <Text style={[styles.emptyText, { color: c.gray }]}>Registra tu primer entrenamiento para ver tus estadisticas y progreso</Text>
              <TouchableOpacity
                style={[styles.emptyCta, { backgroundColor: c.black }]}
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
            workouts.map((w) => <WorkoutRow key={w.id} entry={w} c={c} />)
          )}
        </View>

        <View style={{ height: spacing.xl }} />
      </ScrollView>

      {/* Log Workout Bottom Sheet */}
      <BottomSheet
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        avoidKeyboard
      >
        <Text style={[styles.modalTitle, { color: c.black }]}>Registrar Workout</Text>

        {/* Type selector */}
        <Text style={[styles.modalLabel, { color: c.gray }]}>TIPO</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeScroll}>
          {WORKOUT_TYPES.map((wt) => {
            const isSelected = wt.key === selectedType.key;
            return (
              <TouchableOpacity
                key={wt.key}
                style={[
                  styles.typeChip,
                  { backgroundColor: isSelected ? wt.color + '20' : c.surface, borderColor: isSelected ? wt.color : c.grayLight },
                ]}
                onPress={() => { haptics.light(); setSelectedType(wt); }}
                activeOpacity={0.7}
              >
                <Ionicons name={wt.icon as any} size={18} color={isSelected ? wt.color : c.gray} />
                <Text style={[styles.typeLabel, { color: isSelected ? wt.color : c.gray }]}>{wt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Duration stepper */}
        <Text style={[styles.modalLabel, { color: c.gray, marginTop: spacing.md }]}>DURACION</Text>
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
            style={[styles.stepperBtn, { backgroundColor: c.surface }, duration >= 120 && { opacity: 0.4 }]}
            onPress={() => { haptics.light(); setDuration((d) => Math.min(120, d + 5)); }}
            disabled={duration >= 120}
            activeOpacity={0.6}
          >
            <Ionicons name="add" size={20} color={c.black} />
          </TouchableOpacity>
        </View>

        {/* Calorie estimate */}
        <View style={[styles.calEstimate, { backgroundColor: c.surface }]}>
          <Ionicons name="flame-outline" size={18} color="#EA4335" />
          <Text style={[styles.calEstimateText, { color: c.black }]}>
            ~{estimatedCalories} kcal estimadas
          </Text>
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
          style={[styles.saveBtn, { backgroundColor: c.black }]}
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
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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

  // Bottom sheet content
  modalTitle: { ...typography.titleSm, marginBottom: spacing.md },
  modalLabel: {
    ...typography.label,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  typeScroll: { marginBottom: spacing.sm },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    marginRight: spacing.sm,
  },
  typeLabel: { ...typography.label },
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
  calEstimate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  calEstimateText: { ...typography.bodyMd },
  notesInput: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    minHeight: 60,
    ...typography.body,
    textAlignVertical: 'top',
  },
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
