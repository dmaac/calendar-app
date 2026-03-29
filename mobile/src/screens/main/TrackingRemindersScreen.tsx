/**
 * TrackingRemindersScreen — Configure meal, water, and weight tracking reminders.
 * Apple Settings grouped style with toggle switches and native time pickers.
 * Persisted via AsyncStorage.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, typography, spacing, radius, useThemeColors } from '../../theme';
import { haptics } from '../../hooks/useHaptics';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Reminder {
  key: string;
  label: string;
  icon: string;
  iconColor: string;
  enabled: boolean;
  hour: number;
  minute: number;
  subtitle?: string;
}

const STORAGE_KEY = '@fitsi_tracking_reminders';

// ─── Default reminders ──────────────────────────────────────────────────────

const DEFAULT_REMINDERS: Reminder[] = [
  { key: 'breakfast', label: 'Desayuno',  icon: 'sunny-outline',      iconColor: '#F59E0B', enabled: true,  hour: 8,  minute: 0 },
  { key: 'lunch',     label: 'Almuerzo',  icon: 'restaurant-outline', iconColor: '#10B981', enabled: true,  hour: 13, minute: 0 },
  { key: 'dinner',    label: 'Cena',      icon: 'moon-outline',       iconColor: '#6366F1', enabled: true,  hour: 19, minute: 0 },
  { key: 'snack',     label: 'Snack',     icon: 'cafe-outline',       iconColor: '#EC4899', enabled: true,  hour: 16, minute: 0 },
  { key: 'water',     label: 'Agua',      icon: 'water-outline',      iconColor: '#3B82F6', enabled: true,  hour: 9,  minute: 0, subtitle: 'Cada 2 horas' },
  { key: 'weight',    label: 'Peso',      icon: 'scale-outline',      iconColor: '#8B5CF6', enabled: false, hour: 9,  minute: 0, subtitle: 'Lun, Mie, Vie' },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTime(hour: number, minute: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const h = hour % 12 || 12;
  const m = minute.toString().padStart(2, '0');
  return `${h}:${m} ${period}`;
}

function dateFromTime(hour: number, minute: number): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

type ThemeColors = ReturnType<typeof useThemeColors>;

function SectionHeader({ title, themeColors: tc }: { title: string; themeColors: ThemeColors }) {
  return <Text style={[styles.sectionHeader, { color: tc.gray }]}>{title}</Text>;
}

function Card({ children, themeColors: tc }: { children: React.ReactNode; themeColors: ThemeColors }) {
  return <View style={[styles.card, { backgroundColor: tc.bg }]}>{children}</View>;
}

function ReminderRow({
  reminder,
  isLast,
  onToggle,
  onTimeTap,
  themeColors: tc,
}: {
  reminder: Reminder;
  isLast: boolean;
  onToggle: (enabled: boolean) => void;
  onTimeTap: () => void;
  themeColors: ThemeColors;
}) {
  return (
    <View style={[styles.row, !isLast && [styles.rowBorder, { borderBottomColor: tc.grayLight }]]}>
      <View style={[styles.iconCircle, { backgroundColor: tc.surface }]}>
        <Ionicons name={reminder.icon as any} size={18} color={reminder.iconColor} />
      </View>
      <View style={styles.labelContainer}>
        <Text style={[styles.rowLabel, { color: tc.black }]}>{reminder.label}</Text>
        {reminder.subtitle != null && (
          <Text style={[styles.rowSubtitle, { color: tc.gray }]}>{reminder.subtitle}</Text>
        )}
      </View>
      <TouchableOpacity
        style={[styles.timeBadge, { backgroundColor: tc.surface }, !reminder.enabled && styles.timeBadgeDisabled]}
        onPress={() => {
          if (reminder.enabled) {
            haptics.light();
            onTimeTap();
          }
        }}
        activeOpacity={reminder.enabled ? 0.6 : 1}
        disabled={!reminder.enabled}
      >
        <Text style={[styles.timeText, { color: tc.accent }, !reminder.enabled && { color: tc.gray }]}>
          {formatTime(reminder.hour, reminder.minute)}
        </Text>
      </TouchableOpacity>
      <Switch
        value={reminder.enabled}
        onValueChange={(v) => {
          haptics.light();
          onToggle(v);
        }}
        trackColor={{ false: tc.grayLight, true: tc.accent }}
        thumbColor={tc.white}
        ios_backgroundColor={tc.grayLight}
      />
    </View>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function TrackingRemindersScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const c = useThemeColors();
  const [reminders, setReminders] = useState<Reminder[]>(DEFAULT_REMINDERS);
  const [pickerTarget, setPickerTarget] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  // Load persisted reminders
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed: Reminder[] = JSON.parse(stored);
          // Merge with defaults to pick up any new reminder keys added in future updates
          const merged = DEFAULT_REMINDERS.map((def) => {
            const saved = parsed.find((r) => r.key === def.key);
            return saved ? { ...def, enabled: saved.enabled, hour: saved.hour, minute: saved.minute } : def;
          });
          setReminders(merged);
        }
      } catch {}
    })();
  }, []);

  // Persist on change
  const persist = useCallback(async (updated: Reminder[]) => {
    setReminders(updated);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {}
  }, []);

  const handleToggle = useCallback(
    (key: string, enabled: boolean) => {
      const updated = reminders.map((r) => (r.key === key ? { ...r, enabled } : r));
      persist(updated);
    },
    [reminders, persist],
  );

  const handleTimeTap = useCallback((key: string) => {
    setPickerTarget(key);
    setShowPicker(true);
  }, []);

  const handleTimeChange = useCallback(
    (_event: DateTimePickerEvent, selectedDate?: Date) => {
      if (Platform.OS === 'android') {
        setShowPicker(false);
      }
      if (!selectedDate || !pickerTarget) return;
      const updated = reminders.map((r) =>
        r.key === pickerTarget
          ? { ...r, hour: selectedDate.getHours(), minute: selectedDate.getMinutes() }
          : r,
      );
      persist(updated);
    },
    [reminders, pickerTarget, persist],
  );

  const handlePickerDone = useCallback(() => {
    setShowPicker(false);
    setPickerTarget(null);
  }, []);

  const activeTarget = reminders.find((r) => r.key === pickerTarget);

  // Split reminders into sections
  const mealReminders = reminders.filter((r) => ['breakfast', 'lunch', 'dinner', 'snack'].includes(r.key));
  const otherReminders = reminders.filter((r) => ['water', 'weight'].includes(r.key));

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.surface }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: c.bg, borderBottomColor: c.grayLight }]}>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: c.surface }]}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={20} color={c.black} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.black }]}>Recordatorios</Text>
        <View style={[styles.backButton, { backgroundColor: c.surface }]} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {/* COMIDAS */}
        <SectionHeader title="COMIDAS" themeColors={c} />
        <Card themeColors={c}>
          {mealReminders.map((r, i) => (
            <ReminderRow
              key={r.key}
              reminder={r}
              isLast={i === mealReminders.length - 1}
              onToggle={(v) => handleToggle(r.key, v)}
              onTimeTap={() => handleTimeTap(r.key)}
              themeColors={c}
            />
          ))}
        </Card>

        {/* SALUD */}
        <SectionHeader title="SALUD" themeColors={c} />
        <Card themeColors={c}>
          {otherReminders.map((r, i) => (
            <ReminderRow
              key={r.key}
              reminder={r}
              isLast={i === otherReminders.length - 1}
              onToggle={(v) => handleToggle(r.key, v)}
              onTimeTap={() => handleTimeTap(r.key)}
              themeColors={c}
            />
          ))}
        </Card>

        <Text style={[styles.footer, { color: c.gray }]}>
          Los recordatorios se envian como notificaciones push. Asegurate de tener las notificaciones activadas en Configuracion.
        </Text>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>

      {/* iOS inline time picker */}
      {showPicker && Platform.OS === 'ios' && activeTarget && (
        <View style={styles.pickerOverlay}>
          <View style={[styles.pickerContainer, { backgroundColor: c.bg }]}>
            <View style={[styles.pickerHeader, { borderBottomColor: c.grayLight }]}>
              <Text style={[styles.pickerTitle, { color: c.black }]}>{activeTarget.label}</Text>
              <TouchableOpacity onPress={handlePickerDone} activeOpacity={0.7}>
                <Text style={[styles.pickerDone, { color: c.accent }]}>Listo</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={dateFromTime(activeTarget.hour, activeTarget.minute)}
              mode="time"
              display="spinner"
              onChange={handleTimeChange}
              locale="es"
            />
          </View>
        </View>
      )}

      {/* Android modal picker */}
      {showPicker && Platform.OS === 'android' && activeTarget && (
        <DateTimePicker
          value={dateFromTime(activeTarget.hour, activeTarget.minute)}
          mode="time"
          display="default"
          onChange={handleTimeChange}
        />
      )}
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.grayLight,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typography.titleSm,
    color: colors.black,
  },
  scroll: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  sectionHeader: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.gray,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    marginLeft: spacing.sm,
  },
  card: {
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    gap: spacing.sm,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.grayLight,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelContainer: {
    flex: 1,
  },
  rowLabel: {
    ...typography.bodyMd,
    color: colors.black,
  },
  rowSubtitle: {
    ...typography.caption,
    color: colors.gray,
    marginTop: 1,
  },
  timeBadge: {
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.sm,
  },
  timeBadgeDisabled: {
    opacity: 0.4,
  },
  timeText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.accent,
  },
  timeTextDisabled: {
    color: colors.gray,
  },
  footer: {
    ...typography.caption,
    color: colors.gray,
    textAlign: 'center',
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    lineHeight: 18,
  },
  // iOS picker bottom sheet
  pickerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-end',
  },
  pickerContainer: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: 34,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.grayLight,
  },
  pickerTitle: {
    ...typography.titleSm,
    color: colors.black,
  },
  pickerDone: {
    ...typography.button,
    color: colors.accent,
  },
});
