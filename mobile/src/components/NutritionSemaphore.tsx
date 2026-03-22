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
import { View, Text, StyleSheet, Animated } from 'react-native';
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

function getRiskZone(score: number): RiskZone {
  if (score < 20) return { color: '#22C55E', label: 'Estable' };
  if (score < 40) return { color: '#EAB308', label: 'Atencion' };
  if (score < 60) return { color: '#F97316', label: 'Riesgo' };
  if (score < 80) return { color: '#EF4444', label: 'Alto riesgo' };
  return { color: '#DC2626', label: 'Critico' };
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
  const clampedScore = Math.max(0, Math.min(100, Math.round(riskScore)));
  const zone = getRiskZone(clampedScore);

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

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: [{ scale: pulseAnim }] },
      ]}
      accessibilityLabel={`Puntaje de riesgo nutricional: ${clampedScore} de 100. Estado: ${zone.label}`}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: clampedScore }}
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
      {trend === 'improving' && (
        <View style={styles.improvingBadge}>
          <Text style={styles.improvingText}>Mejorando</Text>
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
  improvingBadge: {
    backgroundColor: '#22C55E20',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: spacing.xs,
  },
  improvingText: {
    ...typography.caption,
    color: '#22C55E',
    fontWeight: '700',
  },
});
