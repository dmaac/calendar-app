/**
 * WidgetGuideScreen — 3-step tutorial for adding iOS home screen widgets
 * Uses placeholder icons since we don't have real screenshots.
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { typography, spacing, radius, useThemeColors } from '../../theme';
import { haptics } from '../../hooks/useHaptics';

const STEPS: { step: number; icon: string; instruction: string; detail: string }[] = [
  {
    step: 2,
    icon: 'finger-print-outline',
    instruction: 'Long press on your Home Screen',
    detail: 'Tap "Customise" when the icons start jiggling',
  },
  {
    step: 3,
    icon: 'time-outline',
    instruction: 'Tap the box below the time',
    detail: 'This opens the widget gallery for your Lock Screen',
  },
  {
    step: 4,
    icon: 'apps-outline',
    instruction: 'Find Fitsi in "App widgets"',
    detail: 'Select the widget size you prefer and tap Done',
  },
];

export default function WidgetGuideScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const c = useThemeColors();

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
        {/* Hero */}
        <View style={[styles.heroIcon, { backgroundColor: c.surfaceAlt }]}>
          <Ionicons name="grid" size={48} color={c.accent} />
        </View>

        <Text style={[styles.title, { color: c.black }]}>
          Add Fitsi Widget{'\n'}to your Home Screen
        </Text>

        <Text style={[styles.subtitle, { color: c.gray }]}>
          Follow these steps to see your daily progress at a glance.
        </Text>

        {/* Steps */}
        <View style={styles.stepsList}>
          {STEPS.map((item, index) => (
            <View key={index} style={[styles.stepCard, { backgroundColor: c.surface }]}>
              {/* Step badge */}
              <View style={[styles.stepBadge, { backgroundColor: c.accent }]}>
                <Text style={styles.stepBadgeText}>Step {item.step}</Text>
              </View>

              {/* Placeholder screenshot area */}
              <View style={[styles.screenshotPlaceholder, { backgroundColor: c.surfaceAlt }]}>
                <Ionicons name={item.icon as any} size={40} color={c.accent} />
              </View>

              {/* Instruction */}
              <Text style={[styles.stepInstruction, { color: c.black }]}>
                {item.instruction}
              </Text>
              <Text style={[styles.stepDetail, { color: c.gray }]}>
                {item.detail}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Bottom CTA */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.md }]}>
        <TouchableOpacity
          style={[styles.doneButton, { backgroundColor: c.black }]}
          onPress={() => {
            haptics.medium();
            navigation.goBack();
          }}
          activeOpacity={0.8}
        >
          <Text style={[styles.doneButtonText, { color: c.white }]}>Done</Text>
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
  stepsList: {
    width: '100%',
    gap: spacing.md,
  },
  stepCard: {
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
  },
  stepBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  stepBadgeText: {
    ...typography.caption,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  screenshotPlaceholder: {
    width: '100%',
    height: 140,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepInstruction: {
    ...typography.bodyMd,
    fontWeight: '600',
    textAlign: 'center',
  },
  stepDetail: {
    ...typography.caption,
    textAlign: 'center',
    lineHeight: 18,
  },
  bottomBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  doneButton: {
    height: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButtonText: {
    ...typography.button,
  },
});
