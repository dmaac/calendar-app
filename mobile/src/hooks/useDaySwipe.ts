/**
 * useDaySwipe -- Manages horizontal day navigation with swipe gesture support.
 *
 * Provides:
 * - selectedDate state with navigation helpers (goToNextDay, goToPreviousDay, goToToday)
 * - PanResponder handlers for horizontal swipe detection
 * - Animated values for content transition (translateX + opacity)
 * - Boundary enforcement: cannot go into the future, max 90 days into the past
 *
 * Swipe thresholds: >50px displacement OR >20px with velocity >500
 * Transition: 150ms exit, spring enter (damping 20, stiffness 200)
 */
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Animated, PanResponder, Dimensions, GestureResponderHandlers } from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_DISPLACEMENT_THRESHOLD = 50;
const SWIPE_VELOCITY_THRESHOLD = 0.5;
const SWIPE_MIN_DISPLACEMENT = 20;
const MAX_PAST_DAYS = 90;

// ---- Date helpers ----

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

function isToday(d: Date): boolean {
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isYesterday(d: Date): boolean {
  return isSameDay(addDays(d, 1), new Date());
}

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 86_400_000;
  const aStart = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const bStart = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round(Math.abs(aStart - bStart) / msPerDay);
}

/** Format date to YYYY-MM-DD string for API calls. */
export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** User-friendly label: "Hoy", "Ayer", or "Lun 17 Mar". */
export function formatDateLabel(d: Date): string {
  if (isToday(d)) return 'Hoy';
  if (isYesterday(d)) return 'Ayer';
  const weekday = d.toLocaleDateString('es', { weekday: 'short' });
  const day = d.getDate();
  const month = d.toLocaleDateString('es', { month: 'short' });
  // Capitalize first letter
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return `${cap(weekday)} ${day} ${cap(month)}`;
}

/** Subtitle for "Hoy" / "Ayer" showing the full date, empty otherwise. */
export function formatDateSubtitle(d: Date): string {
  if (isToday(d) || isYesterday(d)) {
    return d.toLocaleDateString('es', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }
  return '';
}

export interface UseDaySwipeReturn {
  /** Currently selected date */
  selectedDate: Date;
  /** YYYY-MM-DD string of selectedDate */
  dateStr: string;
  /** User-friendly label ("Hoy", "Ayer", "Lun 17 Mar") */
  dateLabel: string;
  /** Subtitle (full date string for Hoy/Ayer, empty otherwise) */
  dateSubtitle: string;
  /** Whether we can navigate forward (false if selectedDate is today) */
  canGoForward: boolean;
  /** Whether we can navigate backward (false if at 90-day limit) */
  canGoBack: boolean;
  /** Whether the selected date is today */
  isSelectedToday: boolean;
  /** Navigate to the previous day */
  goToPreviousDay: () => void;
  /** Navigate to the next day */
  goToNextDay: () => void;
  /** Jump back to today */
  goToToday: () => void;
  /** Set a specific date (e.g. from date picker) */
  setDate: (date: Date) => void;
  /** Animated translateX for content transition */
  contentTranslateX: Animated.Value;
  /** Animated opacity for content transition */
  contentOpacity: Animated.Value;
  /** PanResponder panHandlers to spread on a View wrapping scrollable content */
  gestureHandlers: GestureResponderHandlers;
}

interface UseDaySwipeOptions {
  /** Called when the date changes (useful for haptic feedback). */
  onDateChange?: (date: Date, direction: 'prev' | 'next' | 'today' | 'pick') => void;
}

export default function useDaySwipe(options: UseDaySwipeOptions = {}): UseDaySwipeReturn {
  const { onDateChange } = options;

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // Animated values for content transitions
  const contentTranslateX = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(1)).current;

  // Derived state
  const isSelectedToday = isToday(selectedDate);
  const canGoForward = !isSelectedToday;
  const canGoBack = daysBetween(selectedDate, new Date()) < MAX_PAST_DAYS;

  const dateStr = useMemo(() => toDateStr(selectedDate), [selectedDate]);
  const dateLabel = useMemo(() => formatDateLabel(selectedDate), [selectedDate]);
  const dateSubtitle = useMemo(() => formatDateSubtitle(selectedDate), [selectedDate]);

  // Animate transition between days
  const animateDateTransition = useCallback(
    (direction: 'left' | 'right', newDate: Date) => {
      const exitX = direction === 'left' ? -SCREEN_WIDTH * 0.3 : SCREEN_WIDTH * 0.3;
      const enterX = direction === 'left' ? SCREEN_WIDTH * 0.3 : -SCREEN_WIDTH * 0.3;

      Animated.parallel([
        Animated.timing(contentTranslateX, {
          toValue: exitX,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(contentOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setSelectedDate(newDate);
        contentTranslateX.setValue(enterX);
        Animated.parallel([
          Animated.spring(contentTranslateX, {
            toValue: 0,
            useNativeDriver: true,
            damping: 20,
            stiffness: 200,
          }),
          Animated.timing(contentOpacity, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
        ]).start();
      });
    },
    [contentTranslateX, contentOpacity],
  );

  const goToPreviousDay = useCallback(() => {
    if (!canGoBack) return;
    const newDate = addDays(selectedDate, -1);
    onDateChange?.(newDate, 'prev');
    animateDateTransition('right', newDate);
  }, [selectedDate, canGoBack, animateDateTransition, onDateChange]);

  const goToNextDay = useCallback(() => {
    if (!canGoForward) return;
    const newDate = addDays(selectedDate, 1);
    onDateChange?.(newDate, 'next');
    animateDateTransition('left', newDate);
  }, [selectedDate, canGoForward, animateDateTransition, onDateChange]);

  const goToToday = useCallback(() => {
    if (isSelectedToday) return;
    const newDate = new Date();
    onDateChange?.(newDate, 'today');
    animateDateTransition('left', newDate);
  }, [isSelectedToday, animateDateTransition, onDateChange]);

  const setDate = useCallback(
    (date: Date) => {
      // Clamp to valid range
      const now = new Date();
      const earliest = addDays(now, -MAX_PAST_DAYS);
      let clamped = date;
      if (date > now) clamped = now;
      if (date < earliest) clamped = earliest;

      if (isSameDay(clamped, selectedDate)) return;

      const direction = clamped > selectedDate ? 'left' : 'right';
      onDateChange?.(clamped, 'pick');
      animateDateTransition(direction, clamped);
    },
    [selectedDate, animateDateTransition, onDateChange],
  );

  // ---- PanResponder for horizontal swipe ----
  // Use refs so PanResponder always sees the latest callback values
  const canGoForwardRef = useRef(canGoForward);
  const canGoBackRef = useRef(canGoBack);
  const goToPreviousDayRef = useRef(goToPreviousDay);
  const goToNextDayRef = useRef(goToNextDay);

  useEffect(() => { canGoForwardRef.current = canGoForward; }, [canGoForward]);
  useEffect(() => { canGoBackRef.current = canGoBack; }, [canGoBack]);
  useEffect(() => { goToPreviousDayRef.current = goToPreviousDay; }, [goToPreviousDay]);
  useEffect(() => { goToNextDayRef.current = goToNextDay; }, [goToNextDay]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gs) => {
        // Only claim horizontal gestures that are clearly horizontal, not vertical scroll
        return Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5 && Math.abs(gs.dx) > 15;
      },
      onMoveShouldSetPanResponderCapture: () => false,
      onPanResponderRelease: (_evt, gs) => {
        const { dx, vx } = gs;
        if (
          dx < -SWIPE_DISPLACEMENT_THRESHOLD ||
          (dx < -SWIPE_MIN_DISPLACEMENT && vx < -SWIPE_VELOCITY_THRESHOLD)
        ) {
          // Swiped left -> next day
          if (canGoForwardRef.current) {
            goToNextDayRef.current();
          }
        } else if (
          dx > SWIPE_DISPLACEMENT_THRESHOLD ||
          (dx > SWIPE_MIN_DISPLACEMENT && vx > SWIPE_VELOCITY_THRESHOLD)
        ) {
          // Swiped right -> previous day
          if (canGoBackRef.current) {
            goToPreviousDayRef.current();
          }
        }
      },
    }),
  ).current;

  return {
    selectedDate,
    dateStr,
    dateLabel,
    dateSubtitle,
    canGoForward,
    canGoBack,
    isSelectedToday,
    goToPreviousDay,
    goToNextDay,
    goToToday,
    setDate,
    contentTranslateX,
    contentOpacity,
    gestureHandlers: panResponder.panHandlers,
  };
}
