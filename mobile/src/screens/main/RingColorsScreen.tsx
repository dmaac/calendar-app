/**
 * RingColorsScreen — Cal AI style with weekly calendar, score icon, and color legend
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { typography, spacing, radius, useThemeColors } from '../../theme';

// ─── Ring component ─────────────────────────────────────────────────────────

const RING_SIZE = 36;
const STROKE_WIDTH = 4;
const R = (RING_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;

function MiniRing({ color, fillPercent, trackColor }: { color: string; fillPercent: number; trackColor: string }) {
  const offset = CIRCUMFERENCE * (1 - fillPercent);
  return (
    <Svg width={RING_SIZE} height={RING_SIZE}>
      <Circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={R}
        stroke={trackColor}
        strokeWidth={STROKE_WIDTH}
        fill="none"
      />
      {fillPercent > 0 && (
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={R}
          stroke={color}
          strokeWidth={STROKE_WIDTH}
          fill="none"
          strokeDasharray={`${CIRCUMFERENCE}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          rotation={-90}
          origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
        />
      )}
    </Svg>
  );
}

// ─── Weekly calendar data ───────────────────────────────────────────────────

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface DayData {
  day: string;
  number: number;
  color: string;
  fill: number;
}

const WEEK_DATA: DayData[] = [
  { day: 'Sun', number: 10, color: '#4CAF50', fill: 0.95 },
  { day: 'Mon', number: 11, color: '#FFC107', fill: 0.7 },
  { day: 'Tue', number: 12, color: '#4CAF50', fill: 0.9 },
  { day: 'Wed', number: 13, color: '#F44336', fill: 0.3 },
  { day: 'Thu', number: 14, color: '#4CAF50', fill: 0.85 },
  { day: 'Fri', number: 15, color: '#FFC107', fill: 0.65 },
  { day: 'Sat', number: 16, color: '#9E9E9E', fill: 0 },
];

// ─── Color legend items ─────────────────────────────────────────────────────

interface ColorItem {
  color: string;
  dotStyle?: 'solid' | 'dotted';
  description: string;
}

const COLOR_ITEMS: ColorItem[] = [
  {
    color: '#4CAF50',
    dotStyle: 'solid',
    description: '\u2264100 calories left (or already slightly over)',
  },
  {
    color: '#FFC107',
    dotStyle: 'solid',
    description: 'Within 200 calories of your planned surplus',
  },
  {
    color: '#F44336',
    dotStyle: 'solid',
    description: 'More than 200 calories left to eat',
  },
  {
    color: '#9E9E9E',
    dotStyle: 'dotted',
    description: 'No meals logged that day',
  },
];

// ─── Main component ─────────────────────────────────────────────────────────

export default function RingColorsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const c = useThemeColors();

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: c.grayLight }]}>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: c.surface }]}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={20} color={c.black} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.black }]}>Ring Colors Explained</Text>
        <View style={[styles.backButton, { backgroundColor: 'transparent' }]} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {/* Score icon + label */}
        <View style={styles.scoreSection}>
          <View style={[styles.scoreIcon, { backgroundColor: c.accent }]}>
            <Text style={styles.scoreText}>15</Text>
          </View>
        </View>

        {/* Weekly calendar */}
        <View style={[styles.weekCard, { backgroundColor: c.surface }]}>
          <View style={styles.weekRow}>
            {WEEK_DATA.map((day) => (
              <View key={day.day} style={styles.dayCol}>
                <Text style={[styles.dayLabel, { color: c.gray }]}>{day.day}</Text>
                <View style={styles.dayRingWrap}>
                  <MiniRing
                    color={day.color}
                    fillPercent={day.fill}
                    trackColor={c.grayLight}
                  />
                  <Text style={[styles.dayNumber, { color: c.black }]}>{day.number}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Explanation text */}
        <Text style={[styles.explanation, { color: c.gray }]}>
          On the homepage calendar, the colored rings around each date show how close you were to your daily calorie goal
        </Text>

        {/* Color legend */}
        <View style={[styles.legendCard, { backgroundColor: c.surface }]}>
          {COLOR_ITEMS.map((item, index) => (
            <View
              key={index}
              style={[
                styles.legendRow,
                index < COLOR_ITEMS.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: c.grayLight,
                },
              ]}
            >
              {item.dotStyle === 'dotted' ? (
                <View style={[styles.dottedDot, { borderColor: item.color }]} />
              ) : (
                <View style={[styles.solidDot, { backgroundColor: item.color }]} />
              )}
              <Text style={[styles.legendText, { color: c.black }]}>{item.description}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typography.titleSm,
  },

  scroll: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
  },

  // Score icon
  scoreSection: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  scoreIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreText: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.white,
  },

  // Weekly calendar
  weekCard: {
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayCol: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  dayLabel: {
    ...typography.caption,
    fontWeight: '600',
  },
  dayRingWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumber: {
    position: 'absolute',
    fontSize: 12,
    fontWeight: '700',
  },

  // Explanation
  explanation: {
    ...typography.subtitle,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
    lineHeight: 20,
  },

  // Legend
  legendCard: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  solidDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  dottedDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  legendText: {
    ...typography.bodyMd,
    flex: 1,
  },
});
