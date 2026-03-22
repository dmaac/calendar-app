/**
 * RiskDashboardWeb — Tablet/web layout for risk components.
 *
 * On wide screens (>600px): two-column side-by-side layout.
 *   Left: NutritionSemaphore + CalorieComparisonCard
 *   Right: RiskWeeklyChart + RecoveryPlanCard
 *
 * On narrow screens: falls back to vertical stacked layout.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useLayout, spacing } from '../theme';
import NutritionSemaphore from './NutritionSemaphore';
import CalorieComparisonCard from './CalorieComparisonCard';
import RiskWeeklyChart from './RiskWeeklyChart';
import RecoveryPlanCard, { RecoveryPlanData } from './RecoveryPlanCard';

interface HistoryDot {
  date: string;
  ratio: number;
}

interface RiskDashboardWebProps {
  riskScore: number;
  riskStatus: string;
  riskTrend?: 'improving' | 'worsening' | 'stable';
  logged: number;
  target: number;
  weeklyChartData: { date: string; score: number }[];
  recoveryPlan: RecoveryPlanData | null;
  onRegisterFood: () => void;
  weekAvg?: number;
  history?: HistoryDot[];
  trendDirection?: 'improving' | 'stable' | 'worsening';
  lastLoggedDate?: string;
}

const WIDE_BREAKPOINT = 600;

function RiskDashboardWeb({
  riskScore,
  riskStatus,
  riskTrend,
  logged,
  target,
  weeklyChartData,
  recoveryPlan,
  onRegisterFood,
  weekAvg,
  history,
  trendDirection,
  lastLoggedDate,
}: RiskDashboardWebProps) {
  const { width } = useLayout();
  const isWide = width > WIDE_BREAKPOINT;

  if (!isWide) {
    return (
      <View style={styles.vertical}>
        <NutritionSemaphore riskScore={riskScore} status={riskStatus} trend={riskTrend} />
        <CalorieComparisonCard
          logged={logged}
          target={target}
          status={riskStatus}
          weekAvg={weekAvg}
          history={history}
          trendDirection={trendDirection}
          lastLoggedDate={lastLoggedDate}
        />
        {weeklyChartData.length > 0 && <RiskWeeklyChart data={weeklyChartData} />}
        {recoveryPlan != null && (
          <RecoveryPlanCard plan={recoveryPlan} onRegisterFood={onRegisterFood} />
        )}
      </View>
    );
  }

  return (
    <View style={styles.horizontal}>
      <View style={styles.column}>
        <NutritionSemaphore riskScore={riskScore} status={riskStatus} trend={riskTrend} />
        <CalorieComparisonCard
          logged={logged}
          target={target}
          status={riskStatus}
          weekAvg={weekAvg}
          history={history}
          trendDirection={trendDirection}
          lastLoggedDate={lastLoggedDate}
        />
      </View>
      <View style={styles.column}>
        {weeklyChartData.length > 0 && <RiskWeeklyChart data={weeklyChartData} />}
        {recoveryPlan != null && (
          <RecoveryPlanCard plan={recoveryPlan} onRegisterFood={onRegisterFood} />
        )}
      </View>
    </View>
  );
}

export default React.memo(RiskDashboardWeb);

const styles = StyleSheet.create({
  vertical: {
    gap: spacing.md,
  },
  horizontal: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  column: {
    flex: 1,
    gap: spacing.md,
  },
});
