/**
 * FoodDiary -- Emotional food journal with mood tracking
 *
 * Features:
 * - Post-meal journal entry with emoji mood selector
 * - Context tags: "en casa", "restaurante", "rapido", "social", "solo"
 * - Free-text notes about feelings, environment, company
 * - Daily history timeline view
 * - Pattern identification (shows most common mood per meal type)
 * - Persists in AsyncStorage keyed by date
 * - Integrates into LogScreen after adding a meal
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

const STORAGE_KEY = '@fitsi_food_diary';

const MOOD_OPTIONS: { emoji: string; label: string; value: string }[] = [
  { emoji: '\u{1F60A}', label: 'Feliz', value: 'happy' },
  { emoji: '\u{1F610}', label: 'Normal', value: 'neutral' },
  { emoji: '\u{1F61F}', label: 'Mal', value: 'sad' },
  { emoji: '\u{1F922}', label: 'Nauseado', value: 'nauseous' },
  { emoji: '\u{1F924}', label: 'Delicioso', value: 'delicious' },
];

const CONTEXT_TAGS: { label: string; icon: string; value: string }[] = [
  { label: 'En casa', icon: 'home-outline', value: 'en_casa' },
  { label: 'Restaurante', icon: 'restaurant-outline', value: 'restaurante' },
  { label: 'Rapido', icon: 'flash-outline', value: 'rapido' },
  { label: 'Social', icon: 'people-outline', value: 'social' },
  { label: 'Solo', icon: 'person-outline', value: 'solo' },
];

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FoodDiaryEntry {
  id: string;
  date: string;
  timestamp: string;
  mealType: string;
  foodName: string;
  mood: string;
  tags: string[];
  notes: string;
}

interface FoodDiaryProps {
  /** The meal that was just logged (triggers new entry form) */
  mealType?: string;
  /** Food name to associate with the diary entry */
  foodName?: string;
  /** Currently selected date in YYYY-MM-DD format */
  date?: string;
  /** Callback when an entry is saved */
  onEntrySaved?: () => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getMealLabel(mealType: string): string {
  const labels: Record<string, string> = {
    breakfast: 'Desayuno',
    lunch: 'Almuerzo',
    dinner: 'Cena',
    snack: 'Snack',
  };
  return labels[mealType] ?? mealType;
}

function formatTime(isoStr: string): string {
  const d = new Date(isoStr);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

// ─── Storage ────────────────────────────────────────────────────────────────

async function loadEntries(date: string): Promise<FoodDiaryEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(`${STORAGE_KEY}_${date}`);
    if (raw) return JSON.parse(raw) as FoodDiaryEntry[];
  } catch {
    // Corrupted data -- return empty
  }
  return [];
}

async function saveEntries(date: string, entries: FoodDiaryEntry[]): Promise<void> {
  await AsyncStorage.setItem(`${STORAGE_KEY}_${date}`, JSON.stringify(entries));
}

async function loadAllEntries(days: number): Promise<FoodDiaryEntry[]> {
  const all: FoodDiaryEntry[] = [];
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const entries = await loadEntries(dateStr);
    all.push(...entries);
  }
  return all;
}

// ─── Mood Emoji Button ──────────────────────────────────────────────────────

const MoodButton = React.memo(function MoodButton({
  emoji,
  label,
  selected,
  onPress,
  themeColors: c,
}: {
  emoji: string;
  label: string;
  selected: boolean;
  onPress: () => void;
  themeColors: ReturnType<typeof useThemeColors>;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePress = useCallback(() => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 1.3,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        damping: 8,
        stiffness: 300,
      }),
    ]).start();
    onPress();
  }, [onPress, scaleAnim]);

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
      accessibilityLabel={`Mood: ${label}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Animated.View
        style={[
          s.moodBtn,
          {
            backgroundColor: selected ? c.accent + '20' : 'transparent',
            borderColor: selected ? c.accent : c.grayLight,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <Text style={s.moodEmoji}>{emoji}</Text>
        <Text
          style={[
            s.moodLabel,
            { color: selected ? c.accent : c.gray },
          ]}
        >
          {label}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
});

// ─── Context Tag Pill ───────────────────────────────────────────────────────

const TagPill = React.memo(function TagPill({
  label,
  icon,
  selected,
  onPress,
  themeColors: c,
}: {
  label: string;
  icon: string;
  selected: boolean;
  onPress: () => void;
  themeColors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityLabel={`Tag: ${label}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <View
        style={[
          s.tagPill,
          {
            backgroundColor: selected ? c.accent + '15' : c.surface,
            borderColor: selected ? c.accent : c.grayLight,
          },
        ]}
      >
        <Ionicons
          name={icon as any}
          size={14}
          color={selected ? c.accent : c.gray}
        />
        <Text
          style={[
            s.tagLabel,
            { color: selected ? c.accent : c.gray },
          ]}
        >
          {label}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

// ─── Timeline Entry ─────────────────────────────────────────────────────────

const TimelineEntry = React.memo(function TimelineEntry({
  entry,
  onDelete,
  themeColors: c,
}: {
  entry: FoodDiaryEntry;
  onDelete: (id: string) => void;
  themeColors: ReturnType<typeof useThemeColors>;
}) {
  const moodData = MOOD_OPTIONS.find((m) => m.value === entry.mood);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View
      style={[
        s.timelineEntry,
        {
          backgroundColor: c.surface,
          borderColor: c.grayLight,
          opacity: fadeAnim,
          transform: [
            {
              translateY: fadeAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [12, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={s.timelineHeader}>
        <View style={s.timelineLeft}>
          <Text style={s.timelineEmoji}>{moodData?.emoji ?? '\u{1F610}'}</Text>
          <View>
            <Text style={[s.timelineFoodName, { color: c.black }]} numberOfLines={1}>
              {entry.foodName}
            </Text>
            <Text style={[s.timelineMeta, { color: c.gray }]}>
              {getMealLabel(entry.mealType)} - {formatTime(entry.timestamp)}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => onDelete(entry.id)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={`Eliminar nota de ${entry.foodName}`}
          accessibilityRole="button"
        >
          <Ionicons name="close-circle-outline" size={18} color={c.gray} />
        </TouchableOpacity>
      </View>

      {entry.tags.length > 0 && (
        <View style={s.timelineTags}>
          {entry.tags.map((tag) => {
            const tagData = CONTEXT_TAGS.find((t) => t.value === tag);
            return (
              <View
                key={tag}
                style={[s.timelineTag, { backgroundColor: c.grayLight + '60' }]}
              >
                <Text style={[s.timelineTagText, { color: c.gray }]}>
                  {tagData?.label ?? tag}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {entry.notes.trim().length > 0 && (
        <Text style={[s.timelineNotes, { color: c.gray }]} numberOfLines={3}>
          {entry.notes}
        </Text>
      )}
    </Animated.View>
  );
});

// ─── Pattern Summary ────────────────────────────────────────────────────────

const PatternSummary = React.memo(function PatternSummary({
  entries,
  themeColors: c,
}: {
  entries: FoodDiaryEntry[];
  themeColors: ReturnType<typeof useThemeColors>;
}) {
  if (entries.length < 3) return null;

  // Calculate most common mood
  const moodCounts: Record<string, number> = {};
  entries.forEach((e) => {
    moodCounts[e.mood] = (moodCounts[e.mood] ?? 0) + 1;
  });
  const topMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0];
  const topMoodData = MOOD_OPTIONS.find((m) => m.value === topMood[0]);

  // Most common tag
  const tagCounts: Record<string, number> = {};
  entries.forEach((e) => {
    e.tags.forEach((t) => {
      tagCounts[t] = (tagCounts[t] ?? 0) + 1;
    });
  });
  const tagEntries = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
  const topTag = tagEntries.length > 0 ? tagEntries[0] : null;
  const topTagData = topTag ? CONTEXT_TAGS.find((t) => t.value === topTag[0]) : null;

  return (
    <View
      style={[s.patternCard, { backgroundColor: c.accent + '08', borderColor: c.accent + '20' }]}
      accessibilityLabel="Patron emocional detectado"
    >
      <View style={s.patternHeader}>
        <Ionicons name="analytics-outline" size={16} color={c.accent} />
        <Text style={[s.patternTitle, { color: c.accent }]}>Patron detectado</Text>
      </View>
      <Text style={[s.patternText, { color: c.gray }]}>
        Tu estado de animo mas frecuente es {topMoodData?.emoji}{' '}
        <Text style={{ fontWeight: '700', color: c.black }}>
          {topMoodData?.label}
        </Text>
        {topTagData && (
          <>
            , generalmente cuando comes{' '}
            <Text style={{ fontWeight: '700', color: c.black }}>
              {topTagData.label.toLowerCase()}
            </Text>
          </>
        )}
        . ({entries.length} registros)
      </Text>
    </View>
  );
});

// ─── Main Component ─────────────────────────────────────────────────────────

export default function FoodDiary({
  mealType,
  foodName,
  date,
  onEntrySaved,
}: FoodDiaryProps) {
  const c = useThemeColors();
  const currentDate = date ?? todayStr();

  // State
  const [entries, setEntries] = useState<FoodDiaryEntry[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [collapsed, setCollapsed] = useState(true);
  const [allEntries, setAllEntries] = useState<FoodDiaryEntry[]>([]);

  // Chevron rotation animation
  const chevronAnim = useRef(new Animated.Value(0)).current;

  // Load entries for current date
  useEffect(() => {
    loadEntries(currentDate).then(setEntries);
  }, [currentDate]);

  // Load all entries for pattern detection (last 30 days)
  useEffect(() => {
    loadAllEntries(30).then(setAllEntries);
  }, []);

  // Toggle collapse with animation
  const toggleCollapsed = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsed((prev) => {
      Animated.spring(chevronAnim, {
        toValue: prev ? 1 : 0,
        useNativeDriver: true,
        damping: 15,
        stiffness: 200,
      }).start();
      return !prev;
    });
    haptics.light();
  }, [chevronAnim]);

  const chevronRotation = chevronAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  // Toggle a context tag
  const toggleTag = useCallback((tag: string) => {
    haptics.selection();
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }, []);

  // Select mood
  const selectMood = useCallback((mood: string) => {
    haptics.light();
    setSelectedMood(mood);
  }, []);

  // Open the new entry form
  const openForm = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowForm(true);
    setSelectedMood(null);
    setSelectedTags([]);
    setNotes('');
  }, []);

  // Save entry
  const saveEntry = useCallback(async () => {
    if (!selectedMood) return;

    haptics.medium();

    const entry: FoodDiaryEntry = {
      id: generateId(),
      date: currentDate,
      timestamp: new Date().toISOString(),
      mealType: mealType ?? 'snack',
      foodName: foodName ?? 'Comida',
      mood: selectedMood,
      tags: selectedTags,
      notes: notes.trim(),
    };

    const updated = [entry, ...entries];
    setEntries(updated);
    await saveEntries(currentDate, updated);

    // Reset form
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowForm(false);
    setSelectedMood(null);
    setSelectedTags([]);
    setNotes('');

    // Update all entries for pattern detection
    setAllEntries((prev) => [entry, ...prev]);

    onEntrySaved?.();
  }, [selectedMood, selectedTags, notes, entries, currentDate, mealType, foodName, onEntrySaved]);

  // Delete entry
  const deleteEntry = useCallback(
    async (id: string) => {
      haptics.heavy();
      const updated = entries.filter((e) => e.id !== id);
      setEntries(updated);
      await saveEntries(currentDate, updated);
      setAllEntries((prev) => prev.filter((e) => e.id !== id));
    },
    [entries, currentDate],
  );

  // Cancel form
  const cancelForm = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowForm(false);
    setSelectedMood(null);
    setSelectedTags([]);
    setNotes('');
  }, []);

  return (
    <View
      style={[s.card, { backgroundColor: c.surface, borderColor: c.grayLight }]}
      accessibilityLabel={`Diario de comidas: ${entries.length} notas hoy`}
    >
      {/* Header */}
      <TouchableOpacity
        onPress={toggleCollapsed}
        style={s.headerRow}
        activeOpacity={0.7}
        accessibilityLabel={`Diario emocional. ${entries.length} notas. ${collapsed ? 'Toca para expandir' : 'Toca para colapsar'}`}
        accessibilityRole="button"
      >
        <View style={s.headerLeft}>
          <Ionicons name="journal-outline" size={18} color={c.accent} />
          <Text style={[s.headerTitle, { color: c.black }]}>Diario</Text>
          {entries.length > 0 && (
            <View style={[s.badge, { backgroundColor: c.accent + '15' }]}>
              <Text style={[s.badgeText, { color: c.accent }]}>{entries.length}</Text>
            </View>
          )}
        </View>
        <Animated.View style={{ transform: [{ rotate: chevronRotation }] }}>
          <Ionicons name="chevron-down" size={20} color={c.gray} />
        </Animated.View>
      </TouchableOpacity>

      {/* Collapsed preview */}
      {collapsed && entries.length > 0 && (
        <View style={s.previewRow}>
          {entries.slice(0, 5).map((entry) => {
            const moodData = MOOD_OPTIONS.find((m) => m.value === entry.mood);
            return (
              <Text key={entry.id} style={s.previewEmoji}>
                {moodData?.emoji ?? '\u{1F610}'}
              </Text>
            );
          })}
          {entries.length > 5 && (
            <Text style={[s.previewMore, { color: c.gray }]}>+{entries.length - 5}</Text>
          )}
        </View>
      )}

      {/* Expanded content */}
      {!collapsed && (
        <View style={s.content}>
          {/* Pattern Summary */}
          <PatternSummary entries={allEntries} themeColors={c} />

          {/* New entry button or form */}
          {!showForm ? (
            <TouchableOpacity
              onPress={openForm}
              style={[s.addButton, { borderColor: c.accent + '40' }]}
              activeOpacity={0.7}
              accessibilityLabel="Agregar nota al diario"
              accessibilityRole="button"
            >
              <Ionicons name="add-circle-outline" size={20} color={c.accent} />
              <Text style={[s.addButtonText, { color: c.accent }]}>
                Agregar nota
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={[s.formCard, { backgroundColor: c.bg, borderColor: c.grayLight }]}>
              {/* Meal context */}
              {foodName && (
                <Text style={[s.formContext, { color: c.gray }]}>
                  {getMealLabel(mealType ?? 'snack')} - {foodName}
                </Text>
              )}

              {/* Mood selector */}
              <Text style={[s.formSectionLabel, { color: c.black }]}>
                Como te sientes?
              </Text>
              <View style={s.moodRow}>
                {MOOD_OPTIONS.map((mood) => (
                  <MoodButton
                    key={mood.value}
                    emoji={mood.emoji}
                    label={mood.label}
                    selected={selectedMood === mood.value}
                    onPress={() => selectMood(mood.value)}
                    themeColors={c}
                  />
                ))}
              </View>

              {/* Context tags */}
              <Text style={[s.formSectionLabel, { color: c.black }]}>
                Contexto
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.tagsRow}
              >
                {CONTEXT_TAGS.map((tag) => (
                  <TagPill
                    key={tag.value}
                    label={tag.label}
                    icon={tag.icon}
                    selected={selectedTags.includes(tag.value)}
                    onPress={() => toggleTag(tag.value)}
                    themeColors={c}
                  />
                ))}
              </ScrollView>

              {/* Notes */}
              <TextInput
                style={[
                  s.notesInput,
                  {
                    color: c.black,
                    backgroundColor: c.surface,
                    borderColor: c.grayLight,
                  },
                ]}
                placeholder="Como te hizo sentir esta comida?"
                placeholderTextColor={c.disabled}
                multiline
                numberOfLines={3}
                maxLength={300}
                value={notes}
                onChangeText={setNotes}
                textAlignVertical="top"
                accessibilityLabel="Notas sobre tu comida"
              />

              {/* Actions */}
              <View style={s.formActions}>
                <TouchableOpacity
                  onPress={cancelForm}
                  style={[s.cancelBtn, { borderColor: c.grayLight }]}
                  activeOpacity={0.7}
                  accessibilityLabel="Cancelar"
                  accessibilityRole="button"
                >
                  <Text style={[s.cancelBtnText, { color: c.gray }]}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={saveEntry}
                  style={[
                    s.saveBtn,
                    {
                      backgroundColor: selectedMood ? c.accent : c.disabled,
                    },
                  ]}
                  activeOpacity={0.7}
                  disabled={!selectedMood}
                  accessibilityLabel="Guardar nota"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !selectedMood }}
                >
                  <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                  <Text style={s.saveBtnText}>Guardar</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Timeline */}
          {entries.length > 0 && (
            <View style={s.timeline}>
              <Text style={[s.timelineTitle, { color: c.black }]}>
                Hoy
              </Text>
              {entries.map((entry) => (
                <TimelineEntry
                  key={entry.id}
                  entry={entry}
                  onDelete={deleteEntry}
                  themeColors={c}
                />
              ))}
            </View>
          )}

          {entries.length === 0 && !showForm && (
            <View style={s.emptyState}>
              <Ionicons name="book-outline" size={28} color={c.grayLight} />
              <Text style={[s.emptyText, { color: c.gray }]}>
                Registra como te sientes con cada comida
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerTitle: {
    ...typography.titleSm,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  previewEmoji: {
    fontSize: 20,
  },
  previewMore: {
    ...typography.caption,
    fontWeight: '600',
  },
  content: {
    marginTop: spacing.md,
    gap: spacing.md,
  },

  // ── Add button ──
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.md,
  },
  addButtonText: {
    ...typography.bodyMd,
    fontWeight: '600',
  },

  // ── Form ──
  formCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.md,
  },
  formContext: {
    ...typography.caption,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: -spacing.xs,
  },
  formSectionLabel: {
    ...typography.label,
    fontWeight: '700',
  },
  moodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  moodBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1.5,
    minWidth: 56,
  },
  moodEmoji: {
    fontSize: 24,
  },
  moodLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  tagsRow: {
    gap: spacing.sm,
    paddingVertical: 2,
  },
  tagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  tagLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  notesInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm + 2,
    ...typography.body,
    minHeight: 72,
  },
  formActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  cancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  cancelBtnText: {
    ...typography.bodyMd,
    fontWeight: '600',
  },
  saveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
  },
  saveBtnText: {
    ...typography.bodyMd,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ── Timeline ──
  timeline: {
    gap: spacing.sm,
  },
  timelineTitle: {
    ...typography.label,
    fontWeight: '700',
  },
  timelineEntry: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.sm + 2,
    gap: spacing.xs,
  },
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timelineLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  timelineEmoji: {
    fontSize: 22,
  },
  timelineFoodName: {
    ...typography.bodyMd,
    fontWeight: '600',
  },
  timelineMeta: {
    ...typography.caption,
  },
  timelineTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: 2,
  },
  timelineTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  timelineTagText: {
    fontSize: 10,
    fontWeight: '600',
  },
  timelineNotes: {
    ...typography.caption,
    fontStyle: 'italic',
    lineHeight: 18,
    marginTop: 2,
  },

  // ── Empty ──
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  emptyText: {
    ...typography.caption,
    textAlign: 'center',
  },

  // ── Pattern ──
  patternCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.sm + 2,
    gap: spacing.xs,
  },
  patternHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  patternTitle: {
    ...typography.caption,
    fontWeight: '700',
  },
  patternText: {
    ...typography.caption,
    lineHeight: 18,
  },
});
