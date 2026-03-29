/**
 * CalendarViewScreen — Monthly calendar view for nutrition history.
 * Shows a month grid with dots on days that have logs.
 * Tapping a day navigates to that day's history via HistoryScreen date param.
 * Modern design using Fitsi design system.
 */
import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, typography, spacing, radius, shadows, useLayout } from '../../theme';
import { haptics } from '../../hooks/useHaptics';

// ─── Helpers ────────────────────────────────────────────────────────────────

const WEEKDAYS = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];
const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstWeekday(year: number, month: number): number {
  const d = new Date(year, month, 1).getDay();
  return d === 0 ? 6 : d - 1; // Monday=0
}

function formatDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Mock data — days with logs (in production fetched from API)
function getMockLogDays(year: number, month: number): Set<number> {
  const days = new Set<number>();
  const total = getDaysInMonth(year, month);
  // Simulate ~60% of days having logs
  for (let d = 1; d <= total; d++) {
    if (Math.sin(d * 3.14 + month * 7 + year) > -0.2) {
      days.add(d);
    }
  }
  return days;
}

// ─── Calendar Grid ──────────────────────────────────────────────────────────

function CalendarGrid({
  year,
  month,
  selectedDay,
  logDays,
  onSelectDay,
  c,
}: {
  year: number;
  month: number;
  selectedDay: number | null;
  logDays: Set<number>;
  onSelectDay: (day: number) => void;
  c: ReturnType<typeof useThemeColors>;
}) {
  const totalDays = getDaysInMonth(year, month);
  const firstWeekday = getFirstWeekday(year, month);
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
  const todayDay = today.getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }

  return (
    <View style={gridStyles.container}>
      {/* Weekday headers */}
      <View style={gridStyles.headerRow}>
        {WEEKDAYS.map((wd) => (
          <View key={wd} style={gridStyles.headerCell}>
            <Text style={[gridStyles.headerText, { color: c.gray }]}>{wd}</Text>
          </View>
        ))}
      </View>

      {/* Day rows */}
      {rows.map((row, ri) => (
        <View key={ri} style={gridStyles.row}>
          {row.map((day, ci) => {
            if (day === null) {
              return <View key={`e-${ci}`} style={gridStyles.cell} />;
            }

            const isToday = isCurrentMonth && day === todayDay;
            const isSelected = day === selectedDay;
            const hasLog = logDays.has(day);
            const isFuture = isCurrentMonth && day > todayDay;

            return (
              <TouchableOpacity
                key={day}
                style={[
                  gridStyles.cell,
                  isSelected && { backgroundColor: c.black, borderRadius: 20 },
                  isToday && !isSelected && { borderWidth: 1.5, borderColor: c.accent, borderRadius: 20 },
                ]}
                onPress={() => {
                  if (!isFuture) {
                    haptics.light();
                    onSelectDay(day);
                  }
                }}
                disabled={isFuture}
                activeOpacity={0.7}
                accessibilityLabel={`${day} de ${MONTHS[month]}${isToday ? ', hoy' : ''}${hasLog ? ', tiene registros' : ''}`}
              >
                <Text style={[
                  gridStyles.dayText,
                  { color: c.black },
                  isFuture && { color: c.disabled },
                  isSelected && { color: c.white },
                ]}>
                  {day}
                </Text>
                {hasLog && !isSelected && (
                  <View style={[gridStyles.dot, { backgroundColor: c.accent }]} />
                )}
                {hasLog && isSelected && (
                  <View style={[gridStyles.dot, { backgroundColor: c.white }]} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const gridStyles = StyleSheet.create({
  container: { gap: 2 },
  headerRow: { flexDirection: 'row' },
  headerCell: { flex: 1, alignItems: 'center', paddingVertical: spacing.xs },
  headerText: { ...typography.caption, fontWeight: '600' },
  row: { flexDirection: 'row' },
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    gap: 2,
  },
  dayText: { fontSize: 15, fontWeight: '500' },
  dot: { width: 4, height: 4, borderRadius: 2 },
});

// ─── Main Screen ────────────────────────────────────────────────────────────

export default function CalendarViewScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { sidePadding } = useLayout();
  const c = useThemeColors();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(now.getDate());

  const logDays = useMemo(() => getMockLogDays(year, month), [year, month]);

  const goMonth = useCallback((delta: number) => {
    haptics.light();
    let newMonth = month + delta;
    let newYear = year;
    if (newMonth < 0) { newMonth = 11; newYear--; }
    if (newMonth > 11) { newMonth = 0; newYear++; }
    // Don't go into future months
    if (newYear > now.getFullYear() || (newYear === now.getFullYear() && newMonth > now.getMonth())) return;
    setYear(newYear);
    setMonth(newMonth);
    setSelectedDay(null);
  }, [month, year]);

  const handleSelectDay = useCallback((day: number) => {
    setSelectedDay(day);
  }, []);

  const handleViewDay = useCallback(() => {
    if (selectedDay === null) return;
    haptics.light();
    // Navigate to History screen — it supports date-based loading
    navigation.navigate('History', { date: formatDateStr(year, month, selectedDay) });
  }, [selectedDay, year, month, navigation]);

  const isFutureMonth = year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth());

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
          <Ionicons name="arrow-back" size={20} color={c.black} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.black }]}>Calendario</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingHorizontal: sidePadding }]}
      >
        {/* Month navigator */}
        <View style={[styles.monthNav, { backgroundColor: c.surface }]}>
          <TouchableOpacity onPress={() => goMonth(-1)} style={styles.monthBtn} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={22} color={c.black} />
          </TouchableOpacity>
          <Text style={[styles.monthLabel, { color: c.black }]}>
            {MONTHS[month]} {year}
          </Text>
          <TouchableOpacity
            onPress={() => goMonth(1)}
            style={[styles.monthBtn, isFutureMonth && { opacity: 0.25 }]}
            disabled={isFutureMonth}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-forward" size={22} color={c.black} />
          </TouchableOpacity>
        </View>

        {/* Calendar grid */}
        <View style={[styles.calendarCard, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
          <CalendarGrid
            year={year}
            month={month}
            selectedDay={selectedDay}
            logDays={logDays}
            onSelectDay={handleSelectDay}
            c={c}
          />
        </View>

        {/* Selected day info */}
        {selectedDay !== null ? (
          <TouchableOpacity
            style={[styles.dayCard, { backgroundColor: c.surface, borderColor: c.grayLight }]}
            onPress={handleViewDay}
            activeOpacity={0.7}
            accessibilityLabel={`Ver registros del ${selectedDay} de ${MONTHS[month]}`}
            accessibilityRole="button"
          >
            <View style={styles.dayCardLeft}>
              <Text style={[styles.dayCardDate, { color: c.black }]}>
                {selectedDay} de {MONTHS[month]}
              </Text>
              <Text style={[styles.dayCardHint, { color: c.gray }]}>
                {logDays.has(selectedDay) ? 'Tiene registros de comida' : 'Sin registros'}
              </Text>
            </View>
            <View style={[styles.viewBtn, { backgroundColor: c.black }]}>
              <Text style={[styles.viewBtnText, { color: c.white }]}>Ver dia</Text>
              <Ionicons name="chevron-forward" size={14} color={c.white} />
            </View>
          </TouchableOpacity>
        ) : (
          <View style={styles.hintBox}>
            <Text style={[styles.hintText, { color: c.gray }]}>
              Selecciona un dia para ver tus registros
            </Text>
          </View>
        )}

        {/* Legend */}
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: c.accent }]} />
            <Text style={[styles.legendText, { color: c.gray }]}>Dias con registros</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendRing, { borderColor: c.accent }]} />
            <Text style={[styles.legendText, { color: c.gray }]}>Hoy</Text>
          </View>
        </View>

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { ...typography.titleSm },
  scroll: { paddingTop: spacing.xs },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.md,
  },
  monthBtn: { padding: spacing.sm },
  monthLabel: { ...typography.label, textTransform: 'capitalize' },
  calendarCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  dayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  dayCardLeft: { flex: 1, gap: 2 },
  dayCardDate: { ...typography.bodyMd },
  dayCardHint: { ...typography.caption },
  viewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  viewBtnText: { ...typography.label, fontSize: 13 },
  hintBox: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  hintText: { ...typography.caption, textAlign: 'center' },
  legend: {
    flexDirection: 'row',
    gap: spacing.lg,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendRing: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5 },
  legendText: { ...typography.caption },
});
