/**
 * NutritionSemaphoreCompact — Miniaturized risk indicator.
 *
 * A 40px filled circle with score number and zone color.
 * Single status label below. For use in HomeScreen header area.
 */
import React from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import { useThemeColors, typography, spacing } from '../theme';

interface NutritionSemaphoreCompactProps {
  riskScore: number;
  size?: number;
}

const ZONE_COLORS_LIGHT: Record<string, string> = {
  stable: '#15803D',
  attention: '#A16207',
  risk: '#C2410C',
  high: '#DC2626',
  critical: '#991B1B',
};

const ZONE_COLORS_DARK: Record<string, string> = {
  stable: '#4ADE80',
  attention: '#FACC15',
  risk: '#FB923C',
  high: '#F87171',
  critical: '#FCA5A5',
};

function getZone(score: number, isDark: boolean): { color: string; label: string } {
  const palette = isDark ? ZONE_COLORS_DARK : ZONE_COLORS_LIGHT;
  if (score < 20) return { color: palette.stable, label: 'Estable' };
  if (score < 40) return { color: palette.attention, label: 'Atencion' };
  if (score < 60) return { color: palette.risk, label: 'Riesgo' };
  if (score < 80) return { color: palette.high, label: 'Alto riesgo' };
  return { color: palette.critical, label: 'Critico' };
}

const NutritionSemaphoreCompact = React.memo(function NutritionSemaphoreCompact({
  riskScore,
  size = 40,
}: NutritionSemaphoreCompactProps) {
  const c = useThemeColors();
  let isDark = false;
  try {
    const { useAppTheme } = require('../context/ThemeContext');
    isDark = useAppTheme().isDark;
  } catch {
    isDark = useColorScheme() === 'dark';
  }

  const clamped = Math.max(0, Math.min(100, Math.round(riskScore)));
  const zone = getZone(clamped, isDark);

  return (
    <View
      style={styles.container}
      accessibilityLabel={`Riesgo nutricional: ${clamped}. ${zone.label}`}
      accessibilityRole="summary"
      accessibilityValue={{ min: 0, max: 100, now: clamped, text: `${clamped} de 100` }}
    >
      <View
        style={[
          styles.circle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: zone.color,
          },
        ]}
      >
        <Text style={[styles.scoreText, { fontSize: size * 0.4 }]}>{clamped}</Text>
      </View>
      <Text style={[styles.label, { color: zone.color }]}>{zone.label}</Text>
    </View>
  );
});

export default NutritionSemaphoreCompact;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreText: {
    color: '#FFFFFF',
    fontWeight: '800',
    textAlign: 'center',
  },
  label: {
    ...typography.caption,
    fontWeight: '700',
  },
});
