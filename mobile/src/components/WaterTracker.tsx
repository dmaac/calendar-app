/**
 * WaterTracker — Circular SVG water progress with quick-add buttons
 * Default daily goal: 2500ml
 */
import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius, shadows } from '../theme';
import { haptics } from '../hooks/useHaptics';

const WATER_GOAL = 2500;
const WATER_AMOUNTS = [250, 500, 1000];
const WATER_BLUE = '#4FC3F7';
const WATER_BLUE_LIGHT = '#E1F5FE';

// Animated SVG circle wrapper
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface WaterTrackerProps {
  waterMl: number;
  onAdd: (ml: number) => void;
  goal?: number;
}

export default function WaterTracker({ waterMl, onAdd, goal = WATER_GOAL }: WaterTrackerProps) {
  const c = useThemeColors();
  const pct = Math.min(waterMl / goal, 1);

  // --- Circular progress animation ---
  const SIZE = 120;
  const STROKE = 10;
  const R = (SIZE - STROKE) / 2;
  const CIRCUMFERENCE = R * 2 * Math.PI;

  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: pct,
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [pct]);

  const strokeDashoffset = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [CIRCUMFERENCE, 0],
  });

  // --- Bounce on add ---
  const bounceAnim = useRef(new Animated.Value(1)).current;

  const handleAdd = (ml: number) => {
    haptics.medium();
    bounceAnim.setValue(1.08);
    Animated.spring(bounceAnim, {
      toValue: 1,
      friction: 4,
      tension: 120,
      useNativeDriver: true,
    }).start();
    onAdd(ml);
  };

  const formatAmount = (ml: number) => (ml >= 1000 ? `+${ml / 1000}L` : `+${ml}ml`);

  return (
    <Animated.View style={[s.card, { backgroundColor: c.bg, borderColor: c.grayLight, transform: [{ scale: bounceAnim }] }]}>
      {/* Header */}
      <View style={s.header}>
        <Ionicons name="water" size={18} color={WATER_BLUE} />
        <Text style={[s.title, { color: c.black }]}>Agua</Text>
      </View>

      {/* Circular progress + value */}
      <View style={s.body}>
        <View
          style={s.ringWrap}
          accessibilityLabel={`Agua: ${waterMl} de ${goal} mililitros`}
          accessibilityRole="progressbar"
        >
          <Svg width={SIZE} height={SIZE}>
            {/* Background track */}
            <Circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              stroke={WATER_BLUE_LIGHT}
              strokeWidth={STROKE}
              fill="none"
            />
            {/* Animated fill */}
            <AnimatedCircle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              stroke={WATER_BLUE}
              strokeWidth={STROKE}
              fill="none"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              rotation="-90"
              origin={`${SIZE / 2}, ${SIZE / 2}`}
            />
          </Svg>
          {/* Center label */}
          <View style={s.ringCenter}>
            <Ionicons name="water" size={20} color={WATER_BLUE} />
            <Text style={s.ringValue}>{waterMl}</Text>
            <Text style={[s.ringUnit, { color: c.gray }]}>/ {goal} ml</Text>
          </View>
        </View>

        {/* Quick-add buttons */}
        <View style={s.btnsCol}>
          {WATER_AMOUNTS.map((ml) => (
            <TouchableOpacity
              key={ml}
              style={s.btn}
              onPress={() => handleAdd(ml)}
              activeOpacity={0.7}
              accessibilityLabel={`Agregar ${ml >= 1000 ? ml / 1000 + ' litro' : ml + ' mililitros'} de agua`}
              accessibilityRole="button"
            >
              <Text style={s.btnText}>{formatAmount(ml)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.label,
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  ringWrap: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringValue: {
    ...typography.titleSm,
    color: '#4FC3F7',
    marginTop: 2,
  },
  ringUnit: {
    ...typography.caption,
  },
  btnsCol: {
    gap: spacing.sm,
  },
  btn: {
    backgroundColor: '#E1F5FE',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    minWidth: 80,
  },
  btnText: {
    ...typography.label,
    color: '#4FC3F7',
    fontWeight: '700',
  },
});
