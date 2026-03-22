/**
 * MicronutrientDashboard -- Estimated daily micronutrient intake from logged foods
 *
 * Displays key vitamins and minerals with mini circular progress indicators.
 * Color coding: red <50%, yellow 50-80%, green >80% of RDA.
 *
 * RDA values sourced from Institute of Medicine / National Academies
 * for adults 19-50 (general reference values).
 *
 * IMPORTANT DISCLAIMER: These are rough estimates based on food-category
 * heuristics applied to logged meals. They are NOT a substitute for
 * professional nutritional assessment or blood work.
 *
 * References:
 *   - IOM Dietary Reference Intakes (2006, 2011)
 *   - USDA FoodData Central compositional tables
 */
import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius, shadows } from '../theme';
import { useAppTheme } from '../context/ThemeContext';
import { haptics } from '../hooks/useHaptics';

// Enable LayoutAnimation on Android
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ---- Types ------------------------------------------------------------------

export interface MicronutrientData {
  /** Vitamin A in mcg RAE */
  vitaminA: number;
  /** Vitamin B12 in mcg */
  vitaminB12: number;
  /** Vitamin C in mg */
  vitaminC: number;
  /** Vitamin D in mcg (IU/40) */
  vitaminD: number;
  /** Iron in mg */
  iron: number;
  /** Calcium in mg */
  calcium: number;
  /** Zinc in mg */
  zinc: number;
  /** Magnesium in mg */
  magnesium: number;
}

interface MicronutrientDashboardProps {
  /** Estimated micronutrient intake from today's logged foods */
  data?: MicronutrientData;
  /** User's biological sex for RDA selection ('male' | 'female'). Defaults to average. */
  sex?: 'male' | 'female';
}

// ---- RDA Reference Values (IOM, adults 19-50) ------------------------------

interface RDAEntry {
  key: keyof MicronutrientData;
  label: string;
  unit: string;
  icon: string;
  /** RDA for adult males 19-50 */
  rdaMale: number;
  /** RDA for adult females 19-50 */
  rdaFemale: number;
  /** Brief role description */
  role: string;
}

const MICRONUTRIENTS: RDAEntry[] = [
  {
    key: 'vitaminA',
    label: 'Vit A',
    unit: 'mcg',
    icon: 'eye-outline',
    rdaMale: 900,
    rdaFemale: 700,
    role: 'Vision, immune function',
  },
  {
    key: 'vitaminB12',
    label: 'Vit B12',
    unit: 'mcg',
    icon: 'flash-outline',
    rdaMale: 2.4,
    rdaFemale: 2.4,
    role: 'Nerve function, red blood cells',
  },
  {
    key: 'vitaminC',
    label: 'Vit C',
    unit: 'mg',
    icon: 'shield-outline',
    rdaMale: 90,
    rdaFemale: 75,
    role: 'Antioxidant, collagen synthesis',
  },
  {
    key: 'vitaminD',
    label: 'Vit D',
    unit: 'mcg',
    icon: 'sunny-outline',
    rdaMale: 15,
    rdaFemale: 15,
    role: 'Bone health, immune support',
  },
  {
    key: 'iron',
    label: 'Iron',
    unit: 'mg',
    icon: 'water-outline',
    rdaMale: 8,
    rdaFemale: 18,
    role: 'Oxygen transport, energy',
  },
  {
    key: 'calcium',
    label: 'Calcium',
    unit: 'mg',
    icon: 'fitness-outline',
    rdaMale: 1000,
    rdaFemale: 1000,
    role: 'Bone density, muscle contraction',
  },
  {
    key: 'zinc',
    label: 'Zinc',
    unit: 'mg',
    icon: 'medkit-outline',
    rdaMale: 11,
    rdaFemale: 8,
    role: 'Immune function, wound healing',
  },
  {
    key: 'magnesium',
    label: 'Magnesium',
    unit: 'mg',
    icon: 'heart-outline',
    rdaMale: 420,
    rdaFemale: 320,
    role: 'Muscle, nerve, blood sugar',
  },
];

// ---- Color helpers ----------------------------------------------------------

function getStatusColor(pct: number, isDark: boolean): string {
  if (pct < 50) return '#EF4444'; // red
  if (pct < 80) return '#F59E0B'; // yellow/amber
  return isDark ? '#34D399' : '#10B981'; // green
}

function getStatusLabel(pct: number): string {
  if (pct < 50) return 'Low';
  if (pct < 80) return 'Fair';
  return 'Good';
}

// ---- Default mock data (for preview / no data state) ------------------------

const DEFAULT_DATA: MicronutrientData = {
  vitaminA: 520,
  vitaminB12: 1.8,
  vitaminC: 62,
  vitaminD: 5.2,
  iron: 10,
  calcium: 680,
  zinc: 6.5,
  magnesium: 240,
};

// ---- Animated mini ring -----------------------------------------------------

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const RING_SIZE = 44;
const RING_STROKE = 4;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = RING_RADIUS * 2 * Math.PI;

const MiniRing = React.memo(function MiniRing({
  progress,
  color,
  trackColor,
}: {
  progress: number;
  color: string;
  trackColor: string;
}) {
  const animVal = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    animVal.setValue(0);
    Animated.timing(animVal, {
      toValue: Math.min(progress, 1),
      duration: 700,
      delay: 150,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const strokeDashoffset = animVal.interpolate({
    inputRange: [0, 1],
    outputRange: [RING_CIRCUMFERENCE, 0],
    extrapolate: 'clamp',
  });

  return (
    <Svg width={RING_SIZE} height={RING_SIZE}>
      <Circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_RADIUS}
        stroke={trackColor}
        strokeWidth={RING_STROKE}
        fill="none"
      />
      <AnimatedCircle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_RADIUS}
        stroke={color}
        strokeWidth={RING_STROKE}
        fill="none"
        strokeDasharray={RING_CIRCUMFERENCE}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        rotation="-90"
        origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
      />
    </Svg>
  );
});

// ---- Nutrient item row ------------------------------------------------------

const NutrientItem = React.memo(function NutrientItem({
  entry,
  currentValue,
  rda,
  isDark,
  trackColor,
  textPrimary,
  textSecondary,
  expanded,
}: {
  entry: RDAEntry;
  currentValue: number;
  rda: number;
  isDark: boolean;
  trackColor: string;
  textPrimary: string;
  textSecondary: string;
  expanded: boolean;
}) {
  const pct = rda > 0 ? Math.min((currentValue / rda) * 100, 150) : 0;
  const displayPct = Math.round(pct);
  const color = getStatusColor(pct, isDark);
  const progress = Math.min(pct / 100, 1);

  return (
    <View
      style={s.nutrientItem}
      accessibilityLabel={`${entry.label}: ${displayPct} percent of daily recommended intake`}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.min(displayPct, 100) }}
    >
      {/* Mini ring with percentage inside */}
      <View style={s.ringContainer}>
        <MiniRing progress={progress} color={color} trackColor={trackColor} />
        <View style={s.ringCenter}>
          <Text style={[s.ringPct, { color }]}>{displayPct > 99 ? '99+' : displayPct}</Text>
        </View>
      </View>

      {/* Label and details */}
      <View style={s.nutrientInfo}>
        <View style={s.nutrientTopRow}>
          <View style={s.nutrientLabelRow}>
            <Ionicons name={entry.icon as any} size={13} color={textSecondary} />
            <Text style={[s.nutrientLabel, { color: textPrimary }]}>{entry.label}</Text>
          </View>
          <Text style={[s.nutrientValue, { color: textSecondary }]}>
            {formatValue(currentValue, entry.unit)} / {formatValue(rda, entry.unit)}
          </Text>
        </View>

        {/* Inline progress bar */}
        <View style={[s.barTrack, { backgroundColor: trackColor }]}>
          <Animated.View
            style={[
              s.barFill,
              {
                width: `${Math.min(pct, 100)}%`,
                backgroundColor: color,
              },
            ]}
          />
        </View>

        {/* Expanded detail */}
        {expanded && (
          <Text style={[s.roleText, { color: textSecondary }]}>{entry.role}</Text>
        )}
      </View>
    </View>
  );
});

function formatValue(val: number, unit: string): string {
  if (val >= 100) return `${Math.round(val)}${unit}`;
  if (val >= 10) return `${Math.round(val * 10) / 10}${unit}`;
  return `${Math.round(val * 100) / 100}${unit}`;
}

// ---- Main component ---------------------------------------------------------

export default function MicronutrientDashboard({
  data,
  sex,
}: MicronutrientDashboardProps) {
  const c = useThemeColors();
  const { isDark } = useAppTheme();
  const [expanded, setExpanded] = useState(false);

  const nutrientData = data ?? DEFAULT_DATA;

  // Calculate RDA based on sex (average if not specified)
  const getRDA = useMemo(() => {
    return (entry: RDAEntry): number => {
      if (sex === 'male') return entry.rdaMale;
      if (sex === 'female') return entry.rdaFemale;
      // Average when sex not specified
      return (entry.rdaMale + entry.rdaFemale) / 2;
    };
  }, [sex]);

  // Overall micronutrient score (average of all percentages, capped at 100 each)
  const overallScore = useMemo(() => {
    const pcts = MICRONUTRIENTS.map((entry) => {
      const rda = getRDA(entry);
      const val = nutrientData[entry.key];
      return Math.min((val / rda) * 100, 100);
    });
    return Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
  }, [nutrientData, getRDA]);

  const overallColor = getStatusColor(overallScore, isDark);

  const handleToggle = () => {
    haptics.light();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  };

  // Items to show: 4 when collapsed, all 8 when expanded
  const visibleItems = expanded ? MICRONUTRIENTS : MICRONUTRIENTS.slice(0, 4);

  return (
    <View
      style={[
        s.card,
        { backgroundColor: c.surface, borderColor: c.grayLight },
      ]}
    >
      {/* Header */}
      <TouchableOpacity
        style={s.header}
        onPress={handleToggle}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Micronutrients dashboard, ${overallScore} percent overall. ${expanded ? 'Tap to collapse' : 'Tap to expand'}`}
        accessibilityState={{ expanded }}
      >
        <View style={s.headerLeft}>
          <Ionicons name="nutrition-outline" size={18} color={overallColor} />
          <Text style={[s.headerTitle, { color: c.black }]}>Micronutrients</Text>
          <View style={[s.scoreBadge, { backgroundColor: overallColor + '20' }]}>
            <Text style={[s.scoreBadgeText, { color: overallColor }]}>
              {overallScore}%
            </Text>
          </View>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={c.gray}
        />
      </TouchableOpacity>

      {/* Grid of nutrient items */}
      <View style={s.grid}>
        {visibleItems.map((entry) => (
          <NutrientItem
            key={entry.key}
            entry={entry}
            currentValue={nutrientData[entry.key]}
            rda={getRDA(entry)}
            isDark={isDark}
            trackColor={c.grayLight}
            textPrimary={c.black}
            textSecondary={c.gray}
            expanded={expanded}
          />
        ))}
      </View>

      {/* Expand/collapse button */}
      {!expanded && (
        <TouchableOpacity
          style={s.expandButton}
          onPress={handleToggle}
          activeOpacity={0.7}
        >
          <Text style={[s.expandText, { color: c.accent }]}>
            Show all {MICRONUTRIENTS.length} nutrients
          </Text>
          <Ionicons name="chevron-down" size={14} color={c.accent} />
        </TouchableOpacity>
      )}

      {/* Disclaimer */}
      {expanded && (
        <Text style={[s.disclaimer, { color: c.disabled }]}>
          Estimates based on logged foods. Not a substitute for professional
          nutritional assessment. RDA values for adults 19-50 (IOM/National
          Academies).
        </Text>
      )}
    </View>
  );
}

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
    marginBottom: spacing.md,
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
  scoreBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
    marginLeft: spacing.xs,
  },
  scoreBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // Grid
  grid: {
    gap: spacing.sm + 2,
  },
  nutrientItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
  },
  ringContainer: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringPct: {
    fontSize: 10,
    fontWeight: '800',
  },
  nutrientInfo: {
    flex: 1,
    gap: 3,
  },
  nutrientTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nutrientLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  nutrientLabel: {
    ...typography.label,
    fontWeight: '600',
  },
  nutrientValue: {
    fontSize: 10,
    fontWeight: '500',
  },
  barTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: 4,
    borderRadius: 2,
  },
  roleText: {
    fontSize: 10,
    fontWeight: '400',
    fontStyle: 'italic',
    marginTop: 1,
  },

  // Expand
  expandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: spacing.md,
    paddingVertical: spacing.xs,
  },
  expandText: {
    ...typography.caption,
    fontWeight: '600',
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
