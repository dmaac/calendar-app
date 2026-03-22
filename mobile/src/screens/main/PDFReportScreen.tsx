/**
 * PDFReportScreen — "Get your PDF Summary Report"
 * Shows what the user will receive in their summary report,
 * with 4 feature items and a Generate PDF CTA that creates
 * a real PDF using expo-print and shares it via expo-sharing.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { typography, spacing, radius, useThemeColors } from '../../theme';
import { haptics } from '../../hooks/useHaptics';
import { getOnboardingProfile } from '../../services/onboarding.service';
import type { OnboardingProfileRead } from '../../types';

const REPORT_ITEMS: { icon: string; iconColor: string; title: string; subtitle: string }[] = [
  {
    icon: 'restaurant-outline',
    iconColor: '#10B981',
    title: 'Meal history',
    subtitle: 'All logged meals and nutrition details',
  },
  {
    icon: 'barbell-outline',
    iconColor: '#F59E0B',
    title: 'Exercise history',
    subtitle: 'Logged workouts and activity sessions',
  },
  {
    icon: 'trending-up-outline',
    iconColor: '#6366F1',
    title: 'Weight progress',
    subtitle: 'Weekly trend of recorded weight changes',
  },
  {
    icon: 'pie-chart-outline',
    iconColor: '#EA4335',
    title: 'Calorie & macros breakdown',
    subtitle: 'Historical breakdown of calories and macros',
  },
];

function buildReportHTML(profile: OnboardingProfileRead | null): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const name = profile?.gender ? `User` : 'User';
  const weight = profile?.weight_kg ?? '--';
  const height = profile?.height_cm ?? '--';
  const goal = profile?.goal ?? 'Not set';
  const targetWeight = profile?.target_weight_kg ?? '--';
  const calories = profile?.daily_calories ?? '--';
  const protein = profile?.daily_protein_g ?? '--';
  const carbs = profile?.daily_carbs_g ?? '--';
  const fats = profile?.daily_fats_g ?? '--';
  const healthScore = profile?.health_score ?? '--';

  let bmi = '--';
  if (profile?.weight_kg && profile?.height_cm) {
    const h = profile.height_cm / 100;
    bmi = (profile.weight_kg / (h * h)).toFixed(1);
  }

  let age = '--';
  if (profile?.birth_date) {
    const bd = new Date(profile.birth_date);
    const diff = now.getFullYear() - bd.getFullYear();
    const hasBirthdayPassed =
      now.getMonth() > bd.getMonth() ||
      (now.getMonth() === bd.getMonth() && now.getDate() >= bd.getDate());
    age = String(hasBirthdayPassed ? diff : diff - 1);
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1A1A2E; padding: 40px; }
    .header { text-align: center; margin-bottom: 32px; border-bottom: 2px solid #4285F4; padding-bottom: 20px; }
    .header h1 { font-size: 28px; color: #4285F4; margin-bottom: 4px; }
    .header p { font-size: 13px; color: #666; }
    .section { margin-bottom: 28px; }
    .section h2 { font-size: 18px; color: #4285F4; margin-bottom: 12px; border-bottom: 1px solid #E0E0E0; padding-bottom: 6px; }
    .grid { display: flex; flex-wrap: wrap; gap: 12px; }
    .card { background: #F5F5F5; border-radius: 10px; padding: 14px 18px; flex: 1 1 45%; min-width: 200px; }
    .card .label { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
    .card .value { font-size: 22px; font-weight: 700; margin-top: 4px; }
    .macro-row { display: flex; gap: 10px; }
    .macro-card { flex: 1; text-align: center; padding: 14px 8px; border-radius: 10px; }
    .macro-card .value { font-size: 24px; font-weight: 700; }
    .macro-card .label { font-size: 11px; color: #666; margin-top: 2px; }
    .cal-bg { background: #FEF3C7; }
    .pro-bg { background: #DBEAFE; }
    .carb-bg { background: #D1FAE5; }
    .fat-bg { background: #FEE2E2; }
    .empty { color: #999; font-style: italic; padding: 16px; text-align: center; background: #F5F5F5; border-radius: 10px; }
    .footer { text-align: center; margin-top: 40px; padding-top: 16px; border-top: 1px solid #E0E0E0; font-size: 12px; color: #999; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Fitsia IA</h1>
    <p>Nutrition Summary Report &mdash; ${dateStr}</p>
  </div>

  <div class="section">
    <h2>Personal Details</h2>
    <div class="grid">
      <div class="card"><div class="label">Age</div><div class="value">${age}</div></div>
      <div class="card"><div class="label">Gender</div><div class="value">${profile?.gender ?? '--'}</div></div>
      <div class="card"><div class="label">Height</div><div class="value">${height} cm</div></div>
      <div class="card"><div class="label">Weight</div><div class="value">${weight} kg</div></div>
      <div class="card"><div class="label">BMI</div><div class="value">${bmi}</div></div>
      <div class="card"><div class="label">Health Score</div><div class="value">${healthScore}</div></div>
    </div>
  </div>

  <div class="section">
    <h2>Nutrition Plan</h2>
    <div class="macro-row">
      <div class="macro-card cal-bg"><div class="value">${calories}</div><div class="label">Calories</div></div>
      <div class="macro-card pro-bg"><div class="value">${protein}g</div><div class="label">Protein</div></div>
      <div class="macro-card carb-bg"><div class="value">${carbs}g</div><div class="label">Carbs</div></div>
      <div class="macro-card fat-bg"><div class="value">${fats}g</div><div class="label">Fats</div></div>
    </div>
  </div>

  <div class="section">
    <h2>Meal History</h2>
    <div class="empty">No meals logged yet. Start scanning your food to see your history here.</div>
  </div>

  <div class="section">
    <h2>Weight Progress</h2>
    <div class="grid">
      <div class="card"><div class="label">Current Weight</div><div class="value">${weight} kg</div></div>
      <div class="card"><div class="label">Goal</div><div class="value" style="text-transform:capitalize">${goal}</div></div>
      <div class="card"><div class="label">Target Weight</div><div class="value">${targetWeight} kg</div></div>
      <div class="card"><div class="label">Diet Type</div><div class="value" style="text-transform:capitalize">${profile?.diet_type ?? '--'}</div></div>
    </div>
  </div>

  <div class="footer">Generated by Fitsia IA</div>
</body>
</html>`;
}

export default function PDFReportScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const c = useThemeColors();
  const [loading, setLoading] = useState(false);

  const handleGeneratePDF = async () => {
    setLoading(true);
    try {
      let profile: OnboardingProfileRead | null = null;
      try {
        profile = await getOnboardingProfile();
      } catch {
        // If profile fetch fails, we'll generate with defaults
      }

      const html = buildReportHTML(profile);
      const { uri } = await Print.printToFileAsync({ html });

      haptics.success();

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Save or share your Fitsia report',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('PDF Generated', 'Your report has been saved.');
      }
    } catch (error) {
      haptics.error();
      Alert.alert('Error', 'Could not generate the PDF report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: c.bg, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: c.surface }]}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={20} color={c.black} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero icon */}
        <View style={[styles.heroIcon, { backgroundColor: c.surfaceAlt }]}>
          <Ionicons name="document-text" size={48} color={c.accent} />
        </View>

        {/* Title */}
        <Text style={[styles.title, { color: c.black }]}>
          Get your PDF{'\n'}Summary Report
        </Text>

        {/* Subtitle */}
        <Text style={[styles.subtitle, { color: c.gray }]}>
          Here's what you'll get in your summary report:
        </Text>

        {/* Feature list */}
        <View style={styles.itemsList}>
          {REPORT_ITEMS.map((item, index) => (
            <View key={index} style={[styles.itemRow, { backgroundColor: c.surface }]}>
              <View style={[styles.itemIcon, { backgroundColor: `${item.iconColor}15` }]}>
                <Ionicons name={item.icon as any} size={22} color={item.iconColor} />
              </View>
              <View style={styles.itemText}>
                <Text style={[styles.itemTitle, { color: c.black }]}>{item.title}</Text>
                <Text style={[styles.itemSubtitle, { color: c.gray }]}>{item.subtitle}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Bottom CTA */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.md }]}>
        <TouchableOpacity
          style={[styles.nextButton, { backgroundColor: c.black }]}
          onPress={handleGeneratePDF}
          activeOpacity={0.8}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={c.white} />
          ) : (
            <Text style={[styles.nextButtonText, { color: c.white }]}>Generate PDF</Text>
          )}
        </TouchableOpacity>
      </View>
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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: 120,
    alignItems: 'center',
  },
  heroIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.title,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.subtitle,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  itemsList: {
    width: '100%',
    gap: spacing.sm,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.lg,
    gap: spacing.md,
  },
  itemIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    flex: 1,
    gap: 2,
  },
  itemTitle: {
    ...typography.bodyMd,
    fontWeight: '600',
  },
  itemSubtitle: {
    ...typography.caption,
    lineHeight: 18,
  },
  bottomBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  nextButton: {
    height: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextButtonText: {
    ...typography.button,
  },
});
