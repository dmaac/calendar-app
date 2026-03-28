/**
 * RiskDetailScreen — Full-screen breakdown of the nutrition risk score.
 *
 * Shows: NutritionSemaphore (large), CalorieComparisonCard, RiskWeeklyChart,
 * RecoveryPlanCard. Pull-to-refresh support.
 *
 * Navigation: tapping NutritionSemaphore on HomeScreen opens this screen.
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useThemeColors, typography, spacing, radius, useLayout } from '../../theme';
import useNutritionRisk from '../../hooks/useNutritionRisk';
import NutritionSemaphore from '../../components/NutritionSemaphore';
import CalorieComparisonCard from '../../components/CalorieComparisonCard';
import RiskWeeklyChart from '../../components/RiskWeeklyChart';
import RecoveryPlanCard, { RecoveryPlanData } from '../../components/RecoveryPlanCard';
import RiskSkeleton from '../../components/RiskSkeleton';
import { apiClient } from '../../services/apiClient';
import { haptics } from '../../hooks/useHaptics';
import * as foodService from '../../services/food.service';

export default function RiskDetailScreen() {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const { sidePadding } = useLayout();
  const navigation = useNavigation();

  const {
    riskScore,
    qualityScore,
    weeklyAvgCalories,
    status,
    trend,
    loading: riskLoading,
    refetch: refetchRisk,
  } = useNutritionRisk();

  const [refreshing, setRefreshing] = useState(false);
  const [recoveryPlan, setRecoveryPlan] = useState<RecoveryPlanData | null>(null);
  const [weeklyData, setWeeklyData] = useState<{ date: string; score: number }[]>([]);
  const [summary, setSummary] = useState<{ total_calories: number; target_calories: number } | null>(null);

  const fetchExtras = useCallback(async () => {
    try {
      const [recoveryRes, historyRes, summaryRes] = await Promise.allSettled([
        riskScore > 40
          ? apiClient.get<RecoveryPlanData>('/api/risk/recovery-plan', { params: { horizon: '24h' } })
          : Promise.resolve(null),
        apiClient.get<{ date: string; score: number }[]>('/api/risk/history', { params: { days: 7 } }),
        foodService.getDailySummary(),
      ]);

      if (recoveryRes.status === 'fulfilled' && recoveryRes.value) {
        setRecoveryPlan((recoveryRes.value as any).data ?? null);
      }
      if (historyRes.status === 'fulfilled' && historyRes.value) {
        setWeeklyData((historyRes.value as any).data ?? []);
      }
      if (summaryRes.status === 'fulfilled' && summaryRes.value) {
        setSummary(summaryRes.value as any);
      }
    } catch (err) {
      console.error('[RiskDetailScreen] Failed to fetch risk extras:', err);
    }
  }, [riskScore]);

  useEffect(() => {
    if (!riskLoading) {
      fetchExtras();
    }
  }, [riskLoading, fetchExtras]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchRisk(), fetchExtras()]);
    setRefreshing(false);
  }, [refetchRisk, fetchExtras]);

  const onBack = useCallback(() => {
    haptics.light();
    navigation.goBack();
  }, [navigation]);

  const onRegisterFood = useCallback(() => {
    haptics.light();
    (navigation as any).navigate('Scan');
  }, [navigation]);

  const logged = summary?.total_calories ?? 0;
  const target = summary?.target_calories ?? 2000;

  if (riskLoading && !refreshing) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
        <View style={[styles.header, { paddingHorizontal: sidePadding }]}>
          <TouchableOpacity onPress={onBack} style={[styles.backBtn, { backgroundColor: c.surface }]}>
            <Ionicons name="arrow-back" size={20} color={c.black} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: c.black }]}>Detalle de Riesgo</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={{ paddingHorizontal: sidePadding, paddingTop: spacing.lg }}>
          <RiskSkeleton />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: sidePadding }]}>
        <TouchableOpacity
          onPress={onBack}
          style={[styles.backBtn, { backgroundColor: c.surface }]}
          accessibilityLabel="Volver"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={20} color={c.black} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.black }]}>Detalle de Riesgo</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingHorizontal: sidePadding }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.black} />
        }
      >
        {/* Large Semaphore */}
        <View style={styles.semaphoreSection}>
          <NutritionSemaphore
            riskScore={riskScore}
            status={status}
            size={140}
            trend={trend}
          />
        </View>

        {/* Calorie Comparison */}
        <CalorieComparisonCard
          logged={logged}
          target={target}
          status={status}
          weekAvg={weeklyAvgCalories || undefined}
        />

        {/* Weekly Chart */}
        {weeklyData.length > 0 && (
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
            <Text style={[styles.sectionTitle, { color: c.black }]}>Ultimos 7 dias</Text>
            <RiskWeeklyChart data={weeklyData} />
          </View>
        )}

        {/* Recovery Plan */}
        {recoveryPlan && riskScore > 40 && (
          <RecoveryPlanCard plan={recoveryPlan} onRegisterFood={onRegisterFood} />
        )}

        {/* Quality score summary */}
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
          <Text style={[styles.sectionTitle, { color: c.black }]}>Resumen</Text>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: c.gray }]}>Calidad nutricional</Text>
            <Text style={[styles.summaryValue, { color: c.black }]}>{Math.round(qualityScore)}%</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: c.gray }]}>Promedio semanal</Text>
            <Text style={[styles.summaryValue, { color: c.black }]}>{Math.round(weeklyAvgCalories)} kcal</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: c.gray }]}>Tendencia</Text>
            <Text style={[styles.summaryValue, { color: c.black }]}>
              {trend === 'improving' ? 'Mejorando' : trend === 'worsening' ? 'Empeorando' : 'Estable'}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  backBtn: {
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
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  semaphoreSection: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.label,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  summaryLabel: {
    ...typography.bodyMd,
  },
  summaryValue: {
    ...typography.bodyMd,
    fontWeight: '700',
  },
});
