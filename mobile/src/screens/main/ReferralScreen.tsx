/**
 * ReferralScreen — Invite friends & earn rewards
 * Cal AI style: "Refer a friend and earn $10"
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { typography, spacing, radius, shadows, useLayout, useThemeColors } from '../../theme';
import { haptics } from '../../hooks/useHaptics';
import { useAnalytics } from '../../hooks/useAnalytics';

const ACCENT = '#4285F4';
const REWARD_GREEN = '#4CAF50';

function generatePromoCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `FITSIA-${code}`;
}

const PROMO_CODE = generatePromoCode();

export default function ReferralScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { sidePadding } = useLayout();
  const c = useThemeColors();
  const { track } = useAnalytics('Referral');
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await Share.share({ message: PROMO_CODE });
    } catch (_) {}
    haptics.success();
    track('code_copied', { code: PROMO_CODE });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    haptics.light();
    track('referral_shared', { code: PROMO_CODE });
    try {
      await Share.share({
        message: `Join me on Fitsi IA! Use my code ${PROMO_CODE} to sign up and we both earn $10. Download now!`,
      });
    } catch (_) {
      // User cancelled share
    }
  };

  const stats = [
    { label: 'Friends invited', value: '0', icon: 'paper-plane-outline' },
    { label: 'Friends joined', value: '0', icon: 'people-outline' },
    { label: 'Rewards earned', value: '$0', icon: 'gift-outline', color: REWARD_GREEN },
  ];

  const steps = [
    { number: '1', title: 'Share your code', description: 'Send your unique promo code to friends' },
    { number: '2', title: 'Friend signs up', description: 'They create an account using your code' },
    { number: '3', title: 'You both earn $10', description: 'Rewards are credited automatically' },
  ];

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: sidePadding }]}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: c.surface }]}
          onPress={() => { haptics.light(); navigation.goBack(); }}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={20} color={c.black} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.black }]}>Invite Friends</Text>
        <View style={[styles.backBtn, { backgroundColor: c.surface }]} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingHorizontal: sidePadding }]}
      >
        {/* Hero card */}
        <View style={[styles.heroCard, { backgroundColor: c.surface }]}>
          <View style={[styles.heroIconWrap, { backgroundColor: c.bg }]}>
            <Ionicons name="people" size={36} color={ACCENT} />
          </View>
          <Text style={[styles.heroTitle, { color: c.black }]}>Refer a friend and earn $10</Text>
          <Text style={[styles.heroSubtitle, { color: c.gray }]}>
            Earn $10 per friend that signs up with your promo code.
          </Text>
        </View>

        {/* Promo code card */}
        <View style={[styles.promoCard, { backgroundColor: c.bg, borderColor: c.grayLight }]}>
          <Text style={[styles.promoLabel, { color: c.gray }]}>YOUR PROMO CODE</Text>
          <View style={styles.promoRow}>
            <Text style={[styles.promoCode, { color: c.black }]}>{PROMO_CODE}</Text>
            <TouchableOpacity
              style={[styles.copyBtn, copied && styles.copyBtnActive]}
              onPress={handleCopy}
              activeOpacity={0.7}
            >
              <Ionicons
                name={copied ? 'checkmark' : 'copy-outline'}
                size={16}
                color={copied ? c.white : ACCENT}
              />
              <Text style={[styles.copyText, copied && styles.copyTextActive]}>
                {copied ? 'Copied!' : 'Copy'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Share button */}
        <TouchableOpacity style={[styles.shareBtn, { backgroundColor: c.black }]} onPress={handleShare} activeOpacity={0.85}>
          <Ionicons name="share-outline" size={20} color={c.white} />
          <Text style={[styles.shareBtnText, { color: c.white }]}>Share Invite Link</Text>
        </TouchableOpacity>

        {/* Stats */}
        <View style={styles.statsRow}>
          {stats.map((s) => (
            <View key={s.label} style={[styles.statCard, { backgroundColor: c.bg, borderColor: c.grayLight }]}>
              <Ionicons name={s.icon as any} size={18} color={s.color ?? c.gray} />
              <Text style={[styles.statValue, { color: c.black }, s.color ? { color: s.color } : null]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: c.gray }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* How it works */}
        <Text style={[styles.sectionTitle, { color: c.black }]}>How it works</Text>
        <View style={[styles.stepsCard, { backgroundColor: c.bg, borderColor: c.grayLight }]}>
          {steps.map((step, i) => (
            <View key={step.number} style={styles.stepRow}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>{step.number}</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={[styles.stepTitle, { color: c.black }]}>{step.title}</Text>
                <Text style={[styles.stepDesc, { color: c.gray }]}>{step.description}</Text>
              </View>
              {i < steps.length - 1 && <View style={[styles.stepDivider, { backgroundColor: c.surface }]} />}
            </View>
          ))}
        </View>

        {/* Referral history */}
        <Text style={[styles.sectionTitle, { color: c.black }]}>Referral history</Text>
        <View style={[styles.emptyCard, { backgroundColor: c.surface }]}>
          <Ionicons name="time-outline" size={28} color={c.disabled} />
          <Text style={[styles.emptyText, { color: c.gray }]}>No referrals yet</Text>
          <Text style={[styles.emptySubtext, { color: c.disabled }]}>Share your code to start earning rewards!</Text>
        </View>

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
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
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { ...typography.titleSm, color: colors.black },
  scroll: { paddingTop: spacing.md },

  // Hero
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  heroIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  heroTitle: {
    ...typography.titleMd,
    color: colors.black,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  heroSubtitle: {
    ...typography.subtitle,
    color: colors.gray,
    textAlign: 'center',
    maxWidth: 280,
  },

  // Promo code
  promoCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.grayLight,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  promoLabel: {
    ...typography.caption,
    color: colors.gray,
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  promoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  promoCode: {
    ...typography.titleMd,
    color: colors.black,
    letterSpacing: 1.5,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: ACCENT,
  },
  copyBtnActive: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  copyText: {
    ...typography.label,
    color: ACCENT,
  },
  copyTextActive: {
    color: colors.white,
  },

  // Share
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.black,
    borderRadius: radius.full,
    height: 56,
    marginBottom: spacing.lg,
  },
  shareBtnText: {
    ...typography.button,
    color: colors.white,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.grayLight,
    padding: spacing.md,
    alignItems: 'center',
    gap: 4,
    ...shadows.sm,
  },
  statValue: { ...typography.titleSm, color: colors.black },
  statLabel: { ...typography.caption, color: colors.gray, textAlign: 'center' },

  // Section
  sectionTitle: {
    ...typography.label,
    color: colors.black,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Steps
  stepsCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.grayLight,
    marginBottom: spacing.lg,
    overflow: 'hidden',
    ...shadows.sm,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  stepBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeText: {
    ...typography.label,
    color: colors.white,
    fontWeight: '700',
  },
  stepContent: { flex: 1 },
  stepTitle: { ...typography.bodyMd, color: colors.black },
  stepDesc: { ...typography.caption, color: colors.gray, marginTop: 2 },
  stepDivider: {
    position: 'absolute',
    bottom: 0,
    left: spacing.md + 32 + spacing.md,
    right: spacing.md,
    height: 1,
    backgroundColor: colors.surface,
  },

  // Empty history
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  emptyText: { ...typography.bodyMd, color: colors.gray },
  emptySubtext: { ...typography.caption, color: colors.disabled, textAlign: 'center' },
});
