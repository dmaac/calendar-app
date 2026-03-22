/**
 * NutritionSemaphore — Visual risk score indicator.
 *
 * Displays a circular semaphore with color-coded risk zones:
 *   0-19  Green (#22C55E)      "Estable"
 *   20-39 Yellow (#EAB308)     "Atencion"
 *   40-59 Orange (#F97316)     "Riesgo"
 *   60-79 Red (#EF4444)        "Alto riesgo"
 *   80-100 Dark Red (#DC2626)  "Critico"
 *
 * Pulse animation activates when score > 60.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, useColorScheme } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useThemeColors, typography, spacing } from '../theme';

// ─── Types ──────────────────────────────────────────────────────────────────

interface NutritionSemaphoreProps {
  riskScore: number;
  status: string;
  size?: number;
  primaryReason?: string;
  trend?: 'improving' | 'worsening' | 'stable';
}

const REASON_LABELS: Record<string, string> = {
  no_log: 'Registra tu primera comida',
  low_calories: 'Agrega mas comidas hoy',
  excess: 'Modera la proxima comida',
  bad_quality: 'Mejora la variedad',
  low_protein: 'Agrega proteina',
  macro_imbalance: 'Equilibra tus macros',
};

// ─── Color zones ────────────────────────────────────────────────────────────

interface RiskZone {
  color: string;
  label: string;
}

// WCAG AA compliant colors (4.5:1 contrast ratio minimum)
// Light mode: darker variants to contrast against #FFFFFF
// Dark mode: brighter variants to contrast against #0D0D1A
const RISK_COLORS_LIGHT: Record<string, string> = {
  stable: '#15803D',     // dark green — 5.1:1 vs white
  attention: '#A16207',  // dark yellow — 4.8:1 vs white
  risk: '#C2410C',       // dark orange — 5.3:1 vs white
  high: '#DC2626',       // red — 4.6:1 vs white
  critical: '#991B1B',   // dark red — 7.8:1 vs white
};

const RISK_COLORS_DARK: Record<string, string> = {
  stable: '#4ADE80',     // bright green — 9.5:1 vs #0D0D1A
  attention: '#FACC15',  // bright yellow — 12:1 vs #0D0D1A
  risk: '#FB923C',       // bright orange — 7.3:1 vs #0D0D1A
  high: '#F87171',       // bright red — 5.8:1 vs #0D0D1A
  critical: '#FCA5A5',   // light red — 8.7:1 vs #0D0D1A
};

function getRiskZone(score: number, isDark: boolean): RiskZone {
  const palette = isDark ? RISK_COLORS_DARK : RISK_COLORS_LIGHT;
  if (score < 20) return { color: palette.stable, label: 'Estable' };
  if (score < 40) return { color: palette.attention, label: 'Atencion' };
  if (score < 60) return { color: palette.risk, label: 'Riesgo' };
  if (score < 80) return { color: palette.high, label: 'Alto riesgo' };
  return { color: palette.critical, label: 'Critico' };
}

// ─── Actionable text by risk range ──────────────────────────────────────────

function getActionText(score: number): { text: string; key: string } {
  if (score < 20) return { text: 'Sigue asi! Manten tu rutina.', key: 'stable' };
  if (score < 40) return { text: 'Agrega una comida mas hoy.', key: 'attention' };
  if (score < 60) return { text: 'Registra tu proxima comida ahora.', key: 'risk' };
  if (score < 80) return { text: 'Abre el scanner y registra algo.', key: 'high' };
  return { text: 'Un yogurt o fruta es un buen comienzo.', key: 'critical' };
}

// ─── Component ──────────────────────────────────────────────────────────────

const NutritionSemaphore = React.memo(function NutritionSemaphore({
  riskScore,
  status,
  size = 120,
  primaryReason,
  trend,
}: NutritionSemaphoreProps) {
  const c = useThemeColors();
  let isDark = false;
  try {
    const { useAppTheme } = require('../context/ThemeContext');
    isDark = useAppTheme().isDark;
  } catch {
    isDark = useColorScheme() === 'dark';
  }
  const clampedScore = Math.max(0, Math.min(100, Math.round(riskScore)));
  const zone = getRiskZone(clampedScore, isDark);
  const action = getActionText(clampedScore);

  const strokeWidth = 10;
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const progress = clampedScore / 100;
  const dashLen = progress * circ;

  // Pulse animation for high-risk scores
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const shouldPulse = clampedScore > 60;

  useEffect(() => {
    if (!shouldPulse) {
      pulseAnim.setValue(1);
      return;
    }

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.06,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();

    return () => pulse.stop();
  }, [shouldPulse, pulseAnim]);

  // Mejorando badge — scale entrance animation
  const badgeScale = useRef(new Animated.Value(0)).current;
  // Sparkle dots — 3 dots that fade out
  const sparkle1 = useRef(new Animated.Value(0)).current;
  const sparkle2 = useRef(new Animated.Value(0)).current;
  const sparkle3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (trend !== 'improving') {
      badgeScale.setValue(0);
      return;
    }

    Animated.spring(badgeScale, {
      toValue: 1,
      friction: 5,
      tension: 120,
      useNativeDriver: true,
    }).start();

    // Sparkle dots staggered fade-in then fade-out
    const sparkleAnim = (anim: Animated.Value, delay: number) =>
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]);

    Animated.parallel([
      sparkleAnim(sparkle1, 100),
      sparkleAnim(sparkle2, 250),
      sparkleAnim(sparkle3, 400),
    ]).start();
  }, [trend, badgeScale, sparkle1, sparkle2, sparkle3]);

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: [{ scale: pulseAnim }] },
      ]}
      accessibilityLabel={`Puntaje de riesgo nutricional: ${clampedScore} de 100. Estado: ${zone.label}`}
      accessibilityRole="adjustable"
      accessibilityValue={{ min: 0, max: 100, now: clampedScore, text: `${clampedScore} de 100 — ${zone.label}` }}
    >
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          {/* Track */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={c.surface}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {/* Progress arc */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={zone.color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${dashLen} ${circ - dashLen}`}
            strokeDashoffset={circ / 4}
            strokeLinecap="round"
          />
        </Svg>
        <Text style={[styles.scoreText, { color: zone.color }]}>{clampedScore}</Text>
      </View>
      <Text style={[styles.label, { color: zone.color }]}>{zone.label}</Text>
      {primaryReason != null && REASON_LABELS[primaryReason] != null && (
        <Text style={[styles.reasonText, { color: zone.color }]}>
          {REASON_LABELS[primaryReason]}
        </Text>
      )}
      {/* Actionable "what to do today" line */}
      <Text style={[styles.actionText, { color: zone.color }]}>
        {action.text}
      </Text>
      {trend === 'improving' && (
        <View style={styles.improvingRow}>
          <Animated.View style={[styles.improvingBadge, { transform: [{ scale: badgeScale }] }]}>
            <Text style={styles.improvingText}>Mejorando</Text>
          </Animated.View>
          {/* Sparkle dots */}
          <Animated.View style={[styles.sparkle, { opacity: sparkle1, transform: [{ translateX: -14 }, { translateY: -6 }] }]} />
          <Animated.View style={[styles.sparkle, { opacity: sparkle2, transform: [{ translateX: 14 }, { translateY: -8 }] }]} />
          <Animated.View style={[styles.sparkle, { opacity: sparkle3, transform: [{ translateX: 0 }, { translateY: -12 }] }]} />
        </View>
      )}
    </Animated.View>
  );
});

export default NutritionSemaphore;

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  scoreText: {
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
  },
  label: {
    ...typography.label,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  reasonText: {
    ...typography.caption,
    opacity: 0.8,
  },
  actionText: {
    ...typography.caption,
    fontWeight: '700',
  },
  improvingRow: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  improvingBadge: {
    backgroundColor: '#22C55E20',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  improvingText: {
    ...typography.caption,
    color: '#22C55E',
    fontWeight: '700',
  },
  sparkle: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#22C55E',
  },
});
