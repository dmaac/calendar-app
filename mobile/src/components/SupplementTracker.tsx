/**
 * SupplementTracker -- Daily supplement adherence tracker
 *
 * Features:
 * - Pre-defined supplements with evidence-based annotations
 * - Daily checkbox tracking ("Did you take it today?")
 * - Weekly history grid (7 days)
 * - Custom supplement addition
 * - Full persistence via AsyncStorage
 *
 * Only includes supplements with peer-reviewed evidence:
 *   - Vitamin D: Holick MF, N Engl J Med 2007;357:266-81
 *   - Omega-3: Mozaffarian D, JAMA 2006;296:1885-99
 *   - Magnesium: Volpe SL, Adv Nutr 2013;4:378S-83S
 *   - Protein: Morton RW, Br J Sports Med 2018;52:376-84
 *   - Creatine: Kreider RB, J Int Soc Sports Nutr 2017;14:18
 *   - Multivitamin: Ward E, Nutrients 2014;6:1354-68
 *
 * DISCLAIMER: Not medical advice. Consult a healthcare professional
 * before starting any supplement regimen.
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius, shadows } from '../theme';
import { useAppTheme } from '../context/ThemeContext';
import { useAsyncStorage } from '../hooks/useAsyncStorage';
import { haptics } from '../hooks/useHaptics';

// Enable LayoutAnimation on Android
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ---- Types ------------------------------------------------------------------

interface Supplement {
  id: string;
  name: string;
  icon: string;
  /** Brief evidence-based note */
  note: string;
  /** Is this a user-added custom supplement? */
  isCustom: boolean;
}

/** History map: { "2026-03-22": ["vit-d", "omega-3", ...] } */
type SupplementHistory = Record<string, string[]>;

/** User's configured supplement list (ids of active supplements) */
type ActiveSupplements = string[];

// ---- Pre-defined supplements ------------------------------------------------

const PREDEFINED_SUPPLEMENTS: Supplement[] = [
  {
    id: 'vit-d',
    name: 'Vitamin D',
    icon: 'sunny-outline',
    note: 'Bone health, immune function. 600-2000 IU/day.',
    isCustom: false,
  },
  {
    id: 'omega-3',
    name: 'Omega-3',
    icon: 'fish-outline',
    note: 'Heart, brain health. 250-500mg EPA+DHA/day.',
    isCustom: false,
  },
  {
    id: 'magnesium',
    name: 'Magnesium',
    icon: 'heart-outline',
    note: 'Muscle, nerve function, sleep. 200-400mg/day.',
    isCustom: false,
  },
  {
    id: 'protein',
    name: 'Protein',
    icon: 'barbell-outline',
    note: 'Muscle synthesis. 1.6-2.2g/kg for athletes.',
    isCustom: false,
  },
  {
    id: 'creatine',
    name: 'Creatine',
    icon: 'flash-outline',
    note: 'Strength, power output. 3-5g/day monohydrate.',
    isCustom: false,
  },
  {
    id: 'multivitamin',
    name: 'Multivitamin',
    icon: 'medical-outline',
    note: 'Nutritional insurance. Choose third-party tested.',
    isCustom: false,
  },
];

// ---- Helpers ----------------------------------------------------------------

function getTodayKey(): string {
  return new Date().toISOString().split('T')[0];
}

function getLast7Days(): string[] {
  const days: string[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
}

function getDayLabel(dateKey: string): string {
  const d = new Date(dateKey + 'T12:00:00');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[d.getDay()];
}

const STORAGE_KEY_HISTORY = '@fitsi_supplement_history';
const STORAGE_KEY_ACTIVE = '@fitsi_supplement_active';
const STORAGE_KEY_CUSTOM = '@fitsi_supplement_custom';

// ---- Component --------------------------------------------------------------

function SupplementTrackerInner() {
  const c = useThemeColors();
  const { isDark } = useAppTheme();

  // Persisted state
  const [history, setHistory, historyLoading] = useAsyncStorage<SupplementHistory>(
    STORAGE_KEY_HISTORY,
    {},
  );
  const [activeIds, setActiveIds, activeLoading] = useAsyncStorage<ActiveSupplements>(
    STORAGE_KEY_ACTIVE,
    PREDEFINED_SUPPLEMENTS.map((s) => s.id),
  );
  const [customSupplements, setCustomSupplements, customLoading] = useAsyncStorage<Supplement[]>(
    STORAGE_KEY_CUSTOM,
    [],
  );

  // Local UI state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const todayKey = getTodayKey();
  const last7Days = useMemo(() => getLast7Days(), [todayKey]);

  // Merge predefined + custom
  const allSupplements = useMemo(
    () => [...PREDEFINED_SUPPLEMENTS, ...customSupplements],
    [customSupplements],
  );

  // Active supplement objects
  const activeSupplements = useMemo(
    () => allSupplements.filter((s) => activeIds.includes(s.id)),
    [allSupplements, activeIds],
  );

  // Today's taken supplements
  const todayTaken = useMemo(
    () => new Set(history[todayKey] ?? []),
    [history, todayKey],
  );

  // Toggle supplement for today
  const toggleToday = useCallback(
    (supplementId: string) => {
      haptics.light();
      const current = history[todayKey] ?? [];
      const isCurrentlyTaken = current.includes(supplementId);
      const updated = isCurrentlyTaken
        ? current.filter((id) => id !== supplementId)
        : [...current, supplementId];

      setHistory({ ...history, [todayKey]: updated });

      // Success haptic when checking off
      if (!isCurrentlyTaken) {
        haptics.success();
      }
    },
    [history, todayKey, setHistory],
  );

  // Toggle supplement active/inactive
  const toggleActive = useCallback(
    (supplementId: string) => {
      haptics.light();
      const isActive = activeIds.includes(supplementId);
      if (isActive) {
        setActiveIds(activeIds.filter((id) => id !== supplementId));
      } else {
        setActiveIds([...activeIds, supplementId]);
      }
    },
    [activeIds, setActiveIds],
  );

  // Add custom supplement
  const handleAddCustom = useCallback(() => {
    const trimmed = newName.trim();
    if (!trimmed) return;

    // Check for duplicates
    const exists = allSupplements.some(
      (s) => s.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (exists) {
      Alert.alert('Already exists', `"${trimmed}" is already in your list.`);
      return;
    }

    haptics.medium();
    const id = `custom-${Date.now()}`;
    const newSupplement: Supplement = {
      id,
      name: trimmed,
      icon: 'add-circle-outline',
      note: 'Custom supplement',
      isCustom: true,
    };

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCustomSupplements([...customSupplements, newSupplement]);
    setActiveIds([...activeIds, id]);
    setNewName('');
    setShowAddForm(false);
  }, [newName, allSupplements, customSupplements, activeIds, setCustomSupplements, setActiveIds]);

  // Delete custom supplement
  const handleDeleteCustom = useCallback(
    (supplementId: string) => {
      Alert.alert(
        'Remove supplement',
        'Are you sure you want to remove this supplement?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              haptics.medium();
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setCustomSupplements(customSupplements.filter((s) => s.id !== supplementId));
              setActiveIds(activeIds.filter((id) => id !== supplementId));
            },
          },
        ],
      );
    },
    [customSupplements, activeIds, setCustomSupplements, setActiveIds],
  );

  // Adherence percentage for today
  const todayAdherence = activeSupplements.length > 0
    ? Math.round((todayTaken.size / activeSupplements.length) * 100)
    : 0;

  // Loading guard
  if (historyLoading || activeLoading || customLoading) return null;

  return (
    <View
      style={[
        s.card,
        { backgroundColor: c.surface, borderColor: c.grayLight },
      ]}
    >
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Ionicons name="medical-outline" size={18} color={c.accent} />
          <Text style={[s.headerTitle, { color: c.black }]}>Supplements</Text>
          {todayAdherence > 0 && (
            <View
              style={[
                s.adherenceBadge,
                {
                  backgroundColor:
                    todayAdherence === 100
                      ? (isDark ? '#34D399' : '#10B981') + '20'
                      : c.accent + '20',
                },
              ]}
            >
              <Text
                style={[
                  s.adherenceBadgeText,
                  {
                    color:
                      todayAdherence === 100
                        ? isDark ? '#34D399' : '#10B981'
                        : c.accent,
                  },
                ]}
              >
                {todayAdherence}%
              </Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          onPress={() => {
            haptics.light();
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setShowHistory(!showHistory);
          }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons
            name={showHistory ? 'today' : 'calendar-outline'}
            size={20}
            color={c.gray}
          />
        </TouchableOpacity>
      </View>

      {/* Today's checklist */}
      {!showHistory && (
        <>
          <Text style={[s.dayLabel, { color: c.gray }]}>Today</Text>
          <View style={s.checklistContainer}>
            {activeSupplements.map((supp) => {
              const taken = todayTaken.has(supp.id);
              return (
                <TouchableOpacity
                  key={supp.id}
                  style={[
                    s.checkItem,
                    {
                      backgroundColor: taken
                        ? (isDark ? '#34D399' : '#10B981') + '12'
                        : c.grayLight + '30',
                      borderColor: taken
                        ? (isDark ? '#34D399' : '#10B981') + '40'
                        : c.grayLight,
                    },
                  ]}
                  onPress={() => toggleToday(supp.id)}
                  onLongPress={
                    supp.isCustom
                      ? () => handleDeleteCustom(supp.id)
                      : undefined
                  }
                  activeOpacity={0.7}
                  accessibilityLabel={`${supp.name}: ${taken ? 'taken' : 'not taken'}`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: taken }}
                >
                  <Ionicons
                    name={supp.icon as any}
                    size={16}
                    color={taken ? (isDark ? '#34D399' : '#10B981') : c.gray}
                  />
                  <Text
                    style={[
                      s.checkItemLabel,
                      { color: taken ? c.black : c.gray },
                      taken && s.checkItemLabelTaken,
                    ]}
                    numberOfLines={1}
                  >
                    {supp.name}
                  </Text>
                  <View
                    style={[
                      s.checkbox,
                      {
                        borderColor: taken
                          ? isDark ? '#34D399' : '#10B981'
                          : c.disabled,
                        backgroundColor: taken
                          ? isDark ? '#34D399' : '#10B981'
                          : 'transparent',
                      },
                    ]}
                  >
                    {taken && (
                      <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Add custom supplement */}
          {showAddForm ? (
            <View style={s.addForm}>
              <TextInput
                style={[
                  s.addInput,
                  {
                    backgroundColor: c.grayLight + '30',
                    color: c.black,
                    borderColor: c.accent,
                  },
                ]}
                placeholder="Supplement name..."
                placeholderTextColor={c.disabled}
                value={newName}
                onChangeText={setNewName}
                autoFocus
                onSubmitEditing={handleAddCustom}
                returnKeyType="done"
                maxLength={30}
              />
              <View style={s.addFormButtons}>
                <TouchableOpacity
                  style={[s.addFormBtn, { backgroundColor: c.accent }]}
                  onPress={handleAddCustom}
                  activeOpacity={0.7}
                >
                  <Text style={s.addFormBtnText}>Add</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.addFormBtn, { backgroundColor: c.grayLight }]}
                  onPress={() => {
                    setShowAddForm(false);
                    setNewName('');
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[s.addFormBtnText, { color: c.gray }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={s.addButton}
              onPress={() => {
                haptics.light();
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setShowAddForm(true);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="add-circle-outline" size={16} color={c.accent} />
              <Text style={[s.addButtonText, { color: c.accent }]}>
                Add custom supplement
              </Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {/* Weekly history view */}
      {showHistory && (
        <View style={s.historyContainer}>
          <Text style={[s.historyTitle, { color: c.gray }]}>
            Last 7 days
          </Text>

          {/* Column headers (days) */}
          <View style={s.historyGrid}>
            {/* Left column: supplement names */}
            <View style={s.historyLabelCol}>
              <View style={s.historyCorner} />
              {activeSupplements.map((supp) => (
                <View key={supp.id} style={s.historyLabelCell}>
                  <Text
                    style={[s.historyLabel, { color: c.black }]}
                    numberOfLines={1}
                  >
                    {supp.name}
                  </Text>
                </View>
              ))}
            </View>

            {/* Day columns */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.historyDaysContainer}
            >
              {last7Days.map((dayKey) => {
                const isToday = dayKey === todayKey;
                const dayTaken = new Set(history[dayKey] ?? []);

                return (
                  <View key={dayKey} style={s.historyDayCol}>
                    <View
                      style={[
                        s.historyDayHeader,
                        isToday && { backgroundColor: c.accent + '15' },
                      ]}
                    >
                      <Text
                        style={[
                          s.historyDayLabel,
                          { color: isToday ? c.accent : c.gray },
                          isToday && { fontWeight: '700' },
                        ]}
                      >
                        {getDayLabel(dayKey)}
                      </Text>
                    </View>

                    {activeSupplements.map((supp) => {
                      const taken = dayTaken.has(supp.id);
                      return (
                        <View key={supp.id} style={s.historyCell}>
                          <View
                            style={[
                              s.historyDot,
                              {
                                backgroundColor: taken
                                  ? isDark ? '#34D399' : '#10B981'
                                  : c.grayLight + '50',
                              },
                            ]}
                          >
                            {taken && (
                              <Ionicons
                                name="checkmark"
                                size={10}
                                color="#FFFFFF"
                              />
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                );
              })}
            </ScrollView>
          </View>

          {/* Weekly adherence summary */}
          <View style={s.weeklySummary}>
            {(() => {
              const totalPossible = activeSupplements.length * 7;
              const totalTaken = last7Days.reduce((sum, dayKey) => {
                const dayTaken = history[dayKey] ?? [];
                return sum + dayTaken.filter((id) => activeIds.includes(id)).length;
              }, 0);
              const weeklyPct = totalPossible > 0
                ? Math.round((totalTaken / totalPossible) * 100)
                : 0;

              return (
                <>
                  <Text style={[s.weeklyPct, { color: c.black }]}>
                    {weeklyPct}%
                  </Text>
                  <Text style={[s.weeklyLabel, { color: c.gray }]}>
                    weekly adherence
                  </Text>
                </>
              );
            })()}
          </View>
        </View>
      )}

      {/* Disclaimer */}
      <Text style={[s.disclaimer, { color: c.disabled }]}>
        Not medical advice. Consult a healthcare professional before starting
        supplements.
      </Text>
    </View>
  );
}

export default React.memo(SupplementTrackerInner);

// ---- Styles -----------------------------------------------------------------

const s = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerTitle: {
    ...typography.label,
    fontWeight: '700',
  },
  adherenceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
    marginLeft: spacing.xs,
  },
  adherenceBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  dayLabel: {
    ...typography.caption,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },

  // Checklist
  checklistContainer: {
    gap: spacing.sm,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  checkItemLabel: {
    flex: 1,
    ...typography.bodyMd,
    fontWeight: '500',
  },
  checkItemLabelTaken: {
    fontWeight: '600',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Add form
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: spacing.md,
    paddingVertical: spacing.xs,
  },
  addButtonText: {
    ...typography.caption,
    fontWeight: '600',
  },
  addForm: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  addInput: {
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: spacing.md,
    ...typography.bodyMd,
  },
  addFormButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  addFormBtn: {
    flex: 1,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addFormBtnText: {
    ...typography.button,
    fontSize: 14,
    color: '#FFFFFF',
  },

  // History view
  historyContainer: {
    gap: spacing.sm,
  },
  historyTitle: {
    ...typography.caption,
    fontWeight: '600',
  },
  historyGrid: {
    flexDirection: 'row',
  },
  historyLabelCol: {
    width: 80,
  },
  historyCorner: {
    height: 28,
  },
  historyLabelCell: {
    height: 28,
    justifyContent: 'center',
  },
  historyLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  historyDaysContainer: {
    gap: 0,
  },
  historyDayCol: {
    width: 34,
    alignItems: 'center',
  },
  historyDayHeader: {
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 6,
    paddingHorizontal: 4,
  },
  historyDayLabel: {
    fontSize: 10,
    fontWeight: '500',
  },
  historyCell: {
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Weekly summary
  weeklySummary: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  weeklyPct: {
    fontSize: 22,
    fontWeight: '800',
  },
  weeklyLabel: {
    ...typography.caption,
    fontWeight: '500',
  },

  // Disclaimer
  disclaimer: {
    fontSize: 9,
    fontWeight: '400',
    lineHeight: 13,
    marginTop: spacing.md,
    textAlign: 'center',
  },
});
