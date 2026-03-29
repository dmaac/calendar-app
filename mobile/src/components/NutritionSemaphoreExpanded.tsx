/**
 * NutritionSemaphoreExpanded — Full-width card with detailed risk breakdown.
 *
 * Shows:
 *   - Large NutritionSemaphore (size=140)
 *   - Breakdown: Calorias % | Proteina % | Constancia X/7 dias
 *   - Trend arrow (up/down/stable)
 *   - "Ver detalle" button -> navigates to RiskDetailScreen
 */
import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useThemeColors, typography, spacing, radius } from '../theme';
import { haptics } from '../hooks/useHaptics';
import NutritionSemaphore from './NutritionSemaphore';

interface NutritionSemaphoreExpandedProps {
  riskScore: number;
  status: string;
  trend: 'improving' | 'worsening' | 'stable';
  caloriesPct?: number;
  proteinPct?: number;
  consistencyDays?: number;
  primaryReason?: string;
}

const TREND_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  improving: { icon: 'trending-up', label: 'Mejorando', color: '#22C55E' },
  worsening: { icon: 'trending-down', label: 'Empeorando', color: '#EF4444' },
  stable: { icon: 'remove-outline', label: 'Estable', color: '#F59E0B' },
};

const NutritionSemaphoreExpanded = React.memo(function NutritionSemaphoreExpanded({
  riskScore,
  status,
  trend,
  caloriesPct,
  proteinPct,
  consistencyDays,
  primaryReason,
}: NutritionSemaphoreExpandedProps) {
  const c = useThemeColors();
  const navigation = useNavigation();

  const trendInfo = TREND_CONFIG[trend] ?? TREND_CONFIG.stable;

  const onDetail = useCallback(() => {
    haptics.light();
    (navigation as any).navigate('RiskDetail');
  }, [navigation]);

  const breakdownParts: string[] = [];
  if (caloriesPct != null) breakdownParts.push(`Calorias: ${Math.round(caloriesPct)}%`);
  if (proteinPct != null) breakdownParts.push(`Proteina: ${Math.round(proteinPct)}%`);
  if (consistencyDays != null) breakdownParts.push(`Constancia: ${Math.round(consistencyDays)}/7 dias`);

  return (
    <View
      style={[styles.card, { backgroundColor: c.surface, borderColor: c.grayLight }]}
      accessibilityLabel={`Semaforo nutricional expandido. Puntaje: ${Math.round(riskScore)}. Tendencia: ${trendInfo.label}`}
    >
      <View style={styles.semaphoreSection}>
        <NutritionSemaphore
          riskScore={riskScore}
          status={status}
          size={140}
          trend={trend}
          primaryReason={primaryReason}
        />
      </View>

      {breakdownParts.length > 0 && (
        <Text style={[styles.breakdown, { color: c.gray }]}>
          {breakdownParts.join(' | ')}
        </Text>
      )}

      <View style={styles.trendRow}>
        <Ionicons name={trendInfo.icon as any} size={18} color={trendInfo.color} />
        <Text style={[styles.trendLabel, { color: trendInfo.color }]}>{trendInfo.label}</Text>
      </View>

      <TouchableOpacity
        onPress={onDetail}
        style={[styles.detailBtn, { backgroundColor: c.primary }]}
        accessibilityLabel="Ver detalle de riesgo nutricional"
        accessibilityRole="button"
      >
        <Text style={styles.detailBtnText}>Ver detalle</Text>
        <Ionicons name="chevron-forward" size={16} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
});

export default NutritionSemaphoreExpanded;

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
    alignItems: 'center',
  },
  semaphoreSection: {
    paddingVertical: spacing.sm,
  },
  breakdown: {
    ...typography.caption,
    fontWeight: '500',
    textAlign: 'center',
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  trendLabel: {
    ...typography.label,
    fontWeight: '700',
  },
  detailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    marginTop: spacing.xs,
  },
  detailBtnText: {
    ...typography.button,
    color: '#FFFFFF',
  },
});
