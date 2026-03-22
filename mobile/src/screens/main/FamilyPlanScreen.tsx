/**
 * FamilyPlanScreen — Cal AI style with dark cards, emoji illustration, feature bullets
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { typography, spacing, radius, useThemeColors } from '../../theme';

const BENEFITS = [
  { emoji: '\u{1F465}', text: 'Up to 6 members, one plan' },
  { emoji: '\u{1F916}', text: 'Unlimited AI meal scanning for all' },
  { emoji: '\u{1F4CA}', text: 'Personalized plans for everyone' },
  { emoji: '\u{1F4B0}', text: 'Save up to 80% vs individual plans' },
];

export default function FamilyPlanScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const c = useThemeColors();

  const handleUpgrade = () => {
    Alert.alert('Family Plan', 'Family Plan upgrade coming soon!');
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: c.grayLight }]}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: c.surface }]}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={20} color={c.black} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.black }]}>Family Plan</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {/* Emoji illustration */}
        <View style={[styles.illustrationCard, { backgroundColor: c.surface }]}>
          <Text style={styles.familyEmoji}>{'\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}'}</Text>
        </View>

        {/* Title */}
        <Text style={[styles.mainTitle, { color: c.black }]}>Cal AI Family Plan</Text>
        <Text style={[styles.subtitle, { color: c.gray }]}>
          One subscription for the whole family. Everyone gets their own personalized experience.
        </Text>

        {/* Benefits card */}
        <View style={[styles.benefitsCard, { backgroundColor: c.surface }]}>
          {BENEFITS.map((b, i) => (
            <View
              key={i}
              style={[
                styles.benefitRow,
                i < BENEFITS.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: c.grayLight,
                },
              ]}
            >
              <Text style={styles.benefitEmoji}>{b.emoji}</Text>
              <Text style={[styles.benefitText, { color: c.black }]}>{b.text}</Text>
            </View>
          ))}
        </View>

        {/* Spacer before CTA */}
        <View style={{ height: spacing.xl }} />

        {/* Upgrade button */}
        <TouchableOpacity
          style={[styles.upgradeBtn, { backgroundColor: c.accent }]}
          onPress={handleUpgrade}
          activeOpacity={0.85}
        >
          <Text style={styles.upgradeBtnText}>Upgrade</Text>
        </TouchableOpacity>

        <Text style={[styles.disclaimer, { color: c.gray }]}>
          Cancel anytime. Billed monthly.
        </Text>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { ...typography.titleSm },
  scroll: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
  },

  // Illustration
  illustrationCard: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  familyEmoji: {
    fontSize: 72,
  },

  // Title
  mainTitle: {
    ...typography.title,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.subtitle,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
    lineHeight: 20,
  },

  // Benefits
  benefitsCard: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  benefitEmoji: {
    fontSize: 24,
  },
  benefitText: {
    ...typography.bodyMd,
    flex: 1,
  },

  // CTA
  upgradeBtn: {
    height: 56,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeBtnText: {
    ...typography.button,
    color: colors.white,
  },
  disclaimer: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
