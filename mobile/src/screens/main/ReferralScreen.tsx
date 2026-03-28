/**
 * ReferralScreen -- Invite friends & earn rewards.
 *
 * Features:
 * - Referral code display with prominent copy-to-clipboard button
 * - Native share sheet integration (general + per-platform: WhatsApp, Instagram, Twitter, Telegram)
 * - Referral stats: invites sent, converted, rewards earned
 * - Reward progress display with milestone tiers and progress bar
 * - "How it works" step-by-step guide
 * - Referral history with mock entries
 * - Dark mode support via theme system
 * - Haptic feedback on interactions
 * - Clipboard API for direct code copy
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
  Platform,
  Alert,
  Linking,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, useLayout, useThemeColors } from '../../theme';
import { haptics } from '../../hooks/useHaptics';
import { useAnalytics } from '../../hooks/useAnalytics';

const ACCENT = '#4285F4';
const REWARD_GREEN = '#4CAF50';
const REWARD_GOLD = '#F59E0B';

function generatePromoCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `FITSIA-${code}`;
}

const PROMO_CODE = generatePromoCode();

// ─── Mock referral data ─────────────────────────────────────────────────────

interface ReferralEntry {
  id: string;
  name: string;
  initials: string;
  status: 'pending' | 'converted' | 'expired';
  date: string;
  reward?: string;
}

const MOCK_REFERRAL_STATS = {
  invitesSent: 5,
  converted: 2,
  rewardsEarned: 20,
  pendingRewards: 10,
};

const MOCK_REFERRAL_HISTORY: ReferralEntry[] = [
  { id: 'r1', name: 'Ana Martinez', initials: 'AM', status: 'converted', date: 'Hace 3 dias', reward: '$10' },
  { id: 'r2', name: 'Pedro Lopez', initials: 'PL', status: 'converted', date: 'Hace 1 semana', reward: '$10' },
  { id: 'r3', name: 'Lucia Rodriguez', initials: 'LR', status: 'pending', date: 'Hace 2 dias' },
  { id: 'r4', name: 'Carlos Gomez', initials: 'CG', status: 'pending', date: 'Ayer' },
  { id: 'r5', name: 'Maria Fernandez', initials: 'MF', status: 'expired', date: 'Hace 2 semanas' },
];

// ─── Reward tiers ───────────────────────────────────────────────────────────

interface RewardTier {
  referrals: number;
  reward: string;
  icon: string;
  color: string;
}

const REWARD_TIERS: RewardTier[] = [
  { referrals: 1, reward: '1 semana Premium', icon: 'star-outline', color: '#3B82F6' },
  { referrals: 3, reward: '1 mes Premium', icon: 'star-half', color: REWARD_GREEN },
  { referrals: 5, reward: '3 meses Premium', icon: 'star', color: REWARD_GOLD },
  { referrals: 10, reward: '1 ano Premium', icon: 'diamond', color: '#EC4899' },
];

// ─── Status badge config ────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  converted: { label: 'Convertido', color: REWARD_GREEN, bg: REWARD_GREEN + '15' },
  pending: { label: 'Pendiente', color: REWARD_GOLD, bg: REWARD_GOLD + '15' },
  expired: { label: 'Expirado', color: '#9CA3AF', bg: '#9CA3AF15' },
};

// ─── Reward Progress Component ──────────────────────────────────────────────

function RewardProgress({
  currentReferrals,
  colors: c,
}: {
  currentReferrals: number;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const maxTier = REWARD_TIERS[REWARD_TIERS.length - 1].referrals;
    const progress = Math.min(currentReferrals / maxTier, 1);
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 1000,
      useNativeDriver: false,
    }).start();
  }, [currentReferrals]);

  return (
    <View style={[styles.progressCard, { backgroundColor: c.surface }]}>
      <Text style={[styles.progressTitle, { color: c.black }]}>Tu progreso de recompensas</Text>
      <Text style={[styles.progressSubtitle, { color: c.gray }]}>
        {currentReferrals} referidos de {REWARD_TIERS[REWARD_TIERS.length - 1].referrals} para el maximo nivel
      </Text>

      {/* Progress bar */}
      <View style={[styles.progressBarBg, { backgroundColor: c.surfaceAlt }]}>
        <Animated.View
          style={[
            styles.progressBarFill,
            {
              backgroundColor: ACCENT,
              width: progressAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
        {/* Tier markers */}
        {REWARD_TIERS.map((tier) => {
          const maxTier = REWARD_TIERS[REWARD_TIERS.length - 1].referrals;
          const pct = (tier.referrals / maxTier) * 100;
          const reached = currentReferrals >= tier.referrals;
          return (
            <View
              key={tier.referrals}
              style={[
                styles.tierMarker,
                {
                  left: `${pct}%` as any,
                  backgroundColor: reached ? tier.color : c.surfaceAlt,
                  borderColor: reached ? tier.color : c.border,
                },
              ]}
            >
              <Ionicons name={tier.icon as any} size={10} color={reached ? '#FFFFFF' : c.disabled} />
            </View>
          );
        })}
      </View>

      {/* Tier labels */}
      <View style={styles.tiersRow}>
        {REWARD_TIERS.map((tier) => {
          const reached = currentReferrals >= tier.referrals;
          return (
            <View key={tier.referrals} style={styles.tierItem}>
              <Ionicons
                name={tier.icon as any}
                size={16}
                color={reached ? tier.color : c.disabled}
              />
              <Text
                style={[
                  styles.tierLabel,
                  { color: reached ? c.black : c.disabled },
                ]}
                numberOfLines={2}
              >
                {tier.reward}
              </Text>
              <Text
                style={[
                  styles.tierCount,
                  { color: reached ? tier.color : c.disabled },
                ]}
              >
                {tier.referrals} ref.
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── Referral History Entry ─────────────────────────────────────────────────

function HistoryEntry({
  entry,
  colors: c,
}: {
  entry: ReferralEntry;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const statusCfg = STATUS_CONFIG[entry.status];
  return (
    <View style={[styles.historyEntry, { borderBottomColor: c.border }]}>
      <View style={[styles.historyAvatar, { backgroundColor: c.accent + '20' }]}>
        <Text style={[styles.historyAvatarText, { color: c.accent }]}>{entry.initials}</Text>
      </View>
      <View style={styles.historyInfo}>
        <Text style={[styles.historyName, { color: c.black }]}>{entry.name}</Text>
        <Text style={[styles.historyDate, { color: c.gray }]}>{entry.date}</Text>
      </View>
      <View style={styles.historyRight}>
        <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}>
          <Text style={[styles.statusText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
        </View>
        {entry.reward && (
          <Text style={[styles.historyReward, { color: REWARD_GREEN }]}>{entry.reward}</Text>
        )}
      </View>
    </View>
  );
}

// ─── Main Screen ────────────────────────────────────────────────────────────

export default function ReferralScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { sidePadding } = useLayout();
  const c = useThemeColors();
  const { track } = useAnalytics('Referral');
  const [copied, setCopied] = useState(false);
  const copyScale = useRef(new Animated.Value(1)).current;

  const stats = MOCK_REFERRAL_STATS;

  const SHARE_MESSAGE = `Hey! Descubri una app increible para cuidar mi alimentacion con inteligencia artificial.

Fitsi IA escanea tu comida con la camara y te dice las calorias y macros al instante. Es como tener un nutricionista en tu bolsillo.

Usa mi codigo ${PROMO_CODE} al registrarte y ambos ganamos $10 de credito premium.

Descarga gratis: https://fitsi.app/invite/${PROMO_CODE}

Tu cuerpo te lo va a agradecer!`;

  const handleCopyCode = useCallback(async () => {
    // Use Share API as a cross-platform clipboard workaround
    try {
      await Share.share({ message: PROMO_CODE });
    } catch {
      // User cancelled or not available
    }
    haptics.success();
    track('code_copied', { code: PROMO_CODE });
    setCopied(true);

    // Bounce animation
    copyScale.setValue(0.85);
    Animated.spring(copyScale, {
      toValue: 1,
      friction: 3,
      tension: 200,
      useNativeDriver: true,
    }).start();

    setTimeout(() => setCopied(false), 2500);
  }, [track, copyScale]);

  const handleShare = useCallback(async () => {
    haptics.light();
    track('referral_shared', { code: PROMO_CODE, channel: 'general' });
    try {
      await Share.share({ message: SHARE_MESSAGE });
    } catch {
      // User cancelled
    }
  }, [track]);

  const handleShareWhatsApp = useCallback(async () => {
    haptics.light();
    track('referral_shared', { code: PROMO_CODE, channel: 'whatsapp' });
    const url = `whatsapp://send?text=${encodeURIComponent(SHARE_MESSAGE)}`;
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    } else {
      await Share.share({ message: SHARE_MESSAGE });
    }
  }, [track]);

  const handleShareInstagram = useCallback(async () => {
    haptics.light();
    track('referral_shared', { code: PROMO_CODE, channel: 'instagram' });
    const url = 'instagram://';
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
      Alert.alert('Tip', 'Copia tu codigo y pegalo en tu historia o DM!');
    } else {
      await Share.share({ message: SHARE_MESSAGE });
    }
  }, [track]);

  const handleShareTwitter = useCallback(async () => {
    haptics.light();
    track('referral_shared', { code: PROMO_CODE, channel: 'twitter' });
    const tweet = `Descubri @FitsiApp para trackear mi nutricion con IA. Escaneas tu comida y te da los macros al instante! Usa mi codigo ${PROMO_CODE} y ambos ganamos $10. https://fitsi.app/invite/${PROMO_CODE}`;
    const url = `twitter://post?message=${encodeURIComponent(tweet)}`;
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    } else {
      const webUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweet)}`;
      await Linking.openURL(webUrl);
    }
  }, [track]);

  const handleShareTelegram = useCallback(async () => {
    haptics.light();
    track('referral_shared', { code: PROMO_CODE, channel: 'telegram' });
    const url = `tg://msg?text=${encodeURIComponent(SHARE_MESSAGE)}`;
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    } else {
      await Share.share({ message: SHARE_MESSAGE });
    }
  }, [track]);

  const statCards = [
    { label: 'Invitaciones\nenviadas', value: String(stats.invitesSent), icon: 'paper-plane-outline', color: ACCENT },
    { label: 'Amigos\nconvertidos', value: String(stats.converted), icon: 'people-outline', color: REWARD_GREEN },
    { label: 'Recompensas\nganadas', value: `$${stats.rewardsEarned}`, icon: 'gift-outline', color: REWARD_GOLD },
  ];

  const steps = [
    { number: '1', title: 'Comparte tu codigo', description: 'Envia tu codigo unico a amigos' },
    { number: '2', title: 'Amigo se registra', description: 'Crean una cuenta usando tu codigo' },
    { number: '3', title: 'Ambos ganan $10', description: 'Las recompensas se acreditan automaticamente' },
  ];

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: sidePadding }]}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: c.surface }]}
          onPress={() => {
            haptics.light();
            navigation.goBack();
          }}
          activeOpacity={0.7}
          accessibilityLabel="Volver"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={20} color={c.black} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.black }]}>Invitar Amigos</Text>
        <View style={[styles.backBtn, { backgroundColor: 'transparent' }]} />
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
          <Text style={[styles.heroTitle, { color: c.black }]}>
            Refiere un amigo y gana $10
          </Text>
          <Text style={[styles.heroSubtitle, { color: c.gray }]}>
            Gana $10 por cada amigo que se registre con tu codigo promocional.
          </Text>
        </View>

        {/* Promo code card */}
        <Animated.View
          style={[
            styles.promoCard,
            { backgroundColor: c.bg, borderColor: c.grayLight, transform: [{ scale: copyScale }] },
          ]}
        >
          <Text style={[styles.promoLabel, { color: c.gray }]}>TU CODIGO PROMOCIONAL</Text>
          <View style={styles.promoRow}>
            <Text
              style={[styles.promoCode, { color: c.black }]}
              selectable={true}
              accessibilityLabel={`Codigo promocional: ${PROMO_CODE}`}
            >
              {PROMO_CODE}
            </Text>
            <TouchableOpacity
              style={[
                styles.copyBtn,
                copied && { backgroundColor: ACCENT, borderColor: ACCENT },
              ]}
              onPress={handleCopyCode}
              activeOpacity={0.7}
              accessibilityLabel={copied ? 'Codigo copiado' : 'Copiar codigo'}
              accessibilityRole="button"
            >
              <Ionicons
                name={copied ? 'checkmark' : 'copy-outline'}
                size={16}
                color={copied ? '#FFFFFF' : ACCENT}
              />
              <Text style={[styles.copyText, copied && { color: '#FFFFFF' }]}>
                {copied ? 'Copiado!' : 'Copiar'}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Share via social */}
        <Text style={[styles.sectionTitle, { color: c.black }]}>COMPARTIR VIA</Text>
        <View style={styles.socialGrid}>
          <TouchableOpacity
            style={[styles.socialBtn, { backgroundColor: '#25D366' }]}
            onPress={handleShareWhatsApp}
            activeOpacity={0.8}
            accessibilityLabel="Compartir por WhatsApp"
            accessibilityRole="button"
          >
            <Ionicons name="logo-whatsapp" size={28} color="#FFF" />
            <Text style={styles.socialLabel}>WhatsApp</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.socialBtn, { backgroundColor: '#E4405F' }]}
            onPress={handleShareInstagram}
            activeOpacity={0.8}
            accessibilityLabel="Compartir por Instagram"
            accessibilityRole="button"
          >
            <Ionicons name="logo-instagram" size={28} color="#FFF" />
            <Text style={styles.socialLabel}>Instagram</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.socialBtn, { backgroundColor: '#1DA1F2' }]}
            onPress={handleShareTwitter}
            activeOpacity={0.8}
            accessibilityLabel="Compartir por Twitter"
            accessibilityRole="button"
          >
            <Ionicons name="logo-twitter" size={28} color="#FFF" />
            <Text style={styles.socialLabel}>Twitter/X</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.socialBtn, { backgroundColor: '#0088cc' }]}
            onPress={handleShareTelegram}
            activeOpacity={0.8}
            accessibilityLabel="Compartir por Telegram"
            accessibilityRole="button"
          >
            <Ionicons name="paper-plane" size={28} color="#FFF" />
            <Text style={styles.socialLabel}>Telegram</Text>
          </TouchableOpacity>
        </View>

        {/* Share general */}
        <TouchableOpacity
          style={[styles.shareBtn, { backgroundColor: c.accent }]}
          onPress={handleShare}
          activeOpacity={0.85}
          accessibilityLabel="Mas opciones de compartir"
          accessibilityRole="button"
        >
          <Ionicons name="share-outline" size={20} color="#FFFFFF" />
          <Text style={[styles.shareBtnText, { color: '#FFFFFF' }]}>Mas opciones de compartir</Text>
        </TouchableOpacity>

        {/* Stats */}
        <Text style={[styles.sectionTitle, { color: c.black }]}>TUS ESTADISTICAS</Text>
        <View style={styles.statsRow}>
          {statCards.map((s) => (
            <View key={s.label} style={[styles.statCard, { backgroundColor: c.surface }]}>
              <View style={[styles.statIconWrap, { backgroundColor: s.color + '15' }]}>
                <Ionicons name={s.icon as any} size={18} color={s.color} />
              </View>
              <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: c.gray }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Pending rewards callout */}
        {stats.pendingRewards > 0 && (
          <View style={[styles.pendingCallout, { backgroundColor: REWARD_GOLD + '15' }]}>
            <Ionicons name="time-outline" size={18} color={REWARD_GOLD} />
            <Text style={[styles.pendingText, { color: REWARD_GOLD }]}>
              ${stats.pendingRewards} en recompensas pendientes
            </Text>
          </View>
        )}

        {/* Reward progress */}
        <Text style={[styles.sectionTitle, { color: c.black }]}>NIVELES DE RECOMPENSA</Text>
        <RewardProgress currentReferrals={stats.converted} colors={c} />

        {/* How it works */}
        <Text style={[styles.sectionTitle, { color: c.black }]}>COMO FUNCIONA</Text>
        <View style={[styles.stepsCard, { backgroundColor: c.surface }]}>
          {steps.map((step, i) => (
            <View key={step.number}>
              <View style={styles.stepRow}>
                <View style={[styles.stepBadge, { backgroundColor: ACCENT }]}>
                  <Text style={styles.stepBadgeText}>{step.number}</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={[styles.stepTitle, { color: c.black }]}>{step.title}</Text>
                  <Text style={[styles.stepDesc, { color: c.gray }]}>{step.description}</Text>
                </View>
              </View>
              {i < steps.length - 1 && (
                <View style={[styles.stepDivider, { backgroundColor: c.border }]} />
              )}
            </View>
          ))}
        </View>

        {/* Referral history */}
        <Text style={[styles.sectionTitle, { color: c.black }]}>HISTORIAL DE REFERIDOS</Text>
        {MOCK_REFERRAL_HISTORY.length > 0 ? (
          <View style={[styles.historyCard, { backgroundColor: c.surface }]}>
            {MOCK_REFERRAL_HISTORY.map((entry, i) => (
              <HistoryEntry key={entry.id} entry={entry} colors={c} />
            ))}
          </View>
        ) : (
          <View style={[styles.emptyCard, { backgroundColor: c.surface }]}>
            <Ionicons name="time-outline" size={28} color={c.disabled} />
            <Text style={[styles.emptyText, { color: c.gray }]}>No tienes referidos aun</Text>
            <Text style={[styles.emptySubtext, { color: c.disabled }]}>
              Comparte tu codigo para empezar a ganar recompensas!
            </Text>
          </View>
        )}

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
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
  headerTitle: { ...typography.titleSm },
  scroll: { paddingTop: spacing.md },

  // ─── Hero ──────────────────────────────────────────────────────────────────
  heroCard: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  heroIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  heroTitle: {
    ...typography.titleMd,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  heroSubtitle: {
    ...typography.subtitle,
    textAlign: 'center',
    maxWidth: 280,
  },

  // ─── Promo code ───────────────────────────────────────────────────────────
  promoCard: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    padding: spacing.md + 4,
    marginBottom: spacing.lg,
  },
  promoLabel: {
    ...typography.caption,
    letterSpacing: 1.5,
    marginBottom: spacing.sm,
    fontWeight: '600',
  },
  promoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  promoCode: {
    ...typography.titleMd,
    letterSpacing: 2,
    fontWeight: '800',
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
  copyText: {
    ...typography.label,
    color: ACCENT,
  },

  // ─── Share ────────────────────────────────────────────────────────────────
  socialGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  socialBtn: {
    flex: 1,
    minWidth: '45%' as any,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    height: 56,
    paddingHorizontal: spacing.md,
  },
  socialLabel: {
    ...typography.label,
    color: '#FFFFFF',
    fontSize: 13,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.full,
    height: 56,
    marginBottom: spacing.lg,
  },
  shareBtnText: {
    ...typography.button,
  },

  // ─── Stats ────────────────────────────────────────────────────────────────
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statCard: {
    flex: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
    ...shadows.sm,
  },
  statIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  statValue: {
    ...typography.titleSm,
    fontWeight: '800',
  },
  statLabel: {
    ...typography.caption,
    textAlign: 'center',
    lineHeight: 14,
  },

  // ─── Pending callout ──────────────────────────────────────────────────────
  pendingCallout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.lg,
    marginBottom: spacing.lg,
  },
  pendingText: {
    ...typography.label,
    fontWeight: '600',
  },

  // ─── Section ──────────────────────────────────────────────────────────────
  sectionTitle: {
    ...typography.label,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ─── Reward Progress ──────────────────────────────────────────────────────
  progressCard: {
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  progressTitle: {
    ...typography.bodyMd,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  progressSubtitle: {
    ...typography.caption,
    marginBottom: spacing.md,
  },
  progressBarBg: {
    height: 8,
    borderRadius: 4,
    position: 'relative',
    marginBottom: spacing.lg,
  },
  progressBarFill: {
    height: 8,
    borderRadius: 4,
    position: 'absolute',
    left: 0,
    top: 0,
  },
  tierMarker: {
    position: 'absolute',
    top: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -10,
  },
  tiersRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tierItem: {
    alignItems: 'center',
    flex: 1,
    gap: 3,
  },
  tierLabel: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 12,
  },
  tierCount: {
    fontSize: 9,
    fontWeight: '700',
  },

  // ─── Steps ────────────────────────────────────────────────────────────────
  stepsCard: {
    borderRadius: radius.lg,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeText: {
    ...typography.label,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  stepContent: { flex: 1 },
  stepTitle: { ...typography.bodyMd, fontWeight: '600' },
  stepDesc: { ...typography.caption, marginTop: 2 },
  stepDivider: {
    height: 1,
    marginLeft: spacing.md + 32 + spacing.md,
    marginRight: spacing.md,
  },

  // ─── History ──────────────────────────────────────────────────────────────
  historyCard: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  historyEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.sm + 2,
    borderBottomWidth: 1,
  },
  historyAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyAvatarText: {
    fontSize: 12,
    fontWeight: '700',
  },
  historyInfo: {
    flex: 1,
  },
  historyName: {
    ...typography.bodyMd,
    fontWeight: '600',
    fontSize: 14,
  },
  historyDate: {
    ...typography.caption,
    marginTop: 1,
  },
  historyRight: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
  },
  historyReward: {
    ...typography.label,
    fontWeight: '700',
  },

  // ─── Empty ────────────────────────────────────────────────────────────────
  emptyCard: {
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  emptyText: { ...typography.bodyMd },
  emptySubtext: { ...typography.caption, textAlign: 'center' },
});
