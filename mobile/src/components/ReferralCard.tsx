/**
 * ReferralCard -- Compact referral widget for ProfileScreen / SettingsScreen.
 *
 * - Generates a unique referral code per user (first 3 letters of name + 4 random chars)
 * - "Invitar amigos" button opens native Share sheet with link + code
 * - Shows how many friends have used the code (mock: AsyncStorage counter)
 * - Reward messaging: "Invita 3 amigos y obten 1 mes premium gratis" (UI only)
 * - Persists code and counter in AsyncStorage so the code is stable across sessions
 * - Full dark mode support via useThemeColors
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Share,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useThemeColors, typography, spacing, radius, shadows } from '../theme';
import { haptics } from '../hooks/useHaptics';
import { useAnalytics } from '../hooks/useAnalytics';
import { useAuth } from '../context/AuthContext';

// ─── Storage keys ────────────────────────────────────────────────────────────

const STORAGE_REFERRAL_CODE = '@fitsi_referral_code';
const STORAGE_REFERRAL_COUNT = '@fitsi_referral_count';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateReferralCode(userName: string | null | undefined): string {
  const prefix = (userName ?? 'USR')
    .replace(/[^a-zA-Z]/g, '')
    .substring(0, 3)
    .toUpperCase()
    .padEnd(3, 'X');

  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += CHARSET[Math.floor(Math.random() * CHARSET.length)];
  }

  return `${prefix}-${suffix}`;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ReferralCardProps {
  /** Optional callback when the user taps "Ver detalles" to navigate to full ReferralScreen. */
  onViewDetails?: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

function ReferralCard({ onViewDetails }: ReferralCardProps) {
  const c = useThemeColors();
  const { user } = useAuth();
  const { track } = useAnalytics();

  const [code, setCode] = useState<string | null>(null);
  const [friendsCount, setFriendsCount] = useState(0);
  const [copied, setCopied] = useState(false);

  // Entrance animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;

  // Progress bar animation
  const progressAnim = useRef(new Animated.Value(0)).current;

  const GOAL = 3;
  const progressPct = Math.min(friendsCount / GOAL, 1);

  // ─── Load / generate referral code ─────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const savedCode = await AsyncStorage.getItem(STORAGE_REFERRAL_CODE);
        const savedCount = await AsyncStorage.getItem(STORAGE_REFERRAL_COUNT);

        if (savedCode) {
          setCode(savedCode);
        } else {
          const newCode = generateReferralCode(user?.first_name);
          await AsyncStorage.setItem(STORAGE_REFERRAL_CODE, newCode);
          setCode(newCode);
        }

        if (savedCount) {
          setFriendsCount(parseInt(savedCount, 10) || 0);
        }
      } catch {
        // Fallback: generate in-memory code
        setCode(generateReferralCode(user?.first_name));
      }
    })();
  }, [user?.first_name]);

  // ─── Animations ────────────────────────────────────────────────────────────

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 450,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 450,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progressPct,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progressPct]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleShare = async () => {
    if (!code) return;
    haptics.light();
    track('referral_card_share_pressed', { code });

    try {
      await Share.share({
        message: `Unete a Fitsi IA y lleva tu nutricion al siguiente nivel. Usa mi codigo ${code} al registrarte. Descarga ahora: https://fitsi.app/invite/${code}`,
      });
      track('referral_card_shared', { code });
    } catch {
      // User cancelled
    }
  };

  const handleCopy = async () => {
    if (!code) return;
    haptics.success();
    track('referral_card_code_copied', { code });

    // Trigger native share as a copy mechanism (React Native does not expose Clipboard universally)
    try {
      await Share.share({ message: code });
    } catch {
      // User cancelled
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ─── Derived values ────────────────────────────────────────────────────────

  const isGoalReached = friendsCount >= GOAL;
  const accentColor = c.accent;
  const rewardColor = c.success;

  const progressBarWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  if (!code) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: c.surface,
          borderColor: c.grayLight,
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      {/* Header row */}
      <View style={styles.headerRow}>
        <View style={[styles.iconWrap, { backgroundColor: accentColor + '15' }]}>
          <Ionicons name="gift" size={20} color={accentColor} />
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: c.black }]} allowFontScaling>Invita amigos</Text>
          <Text style={[styles.subtitle, { color: c.gray }]} allowFontScaling>
            {isGoalReached
              ? '1 mes premium desbloqueado'
              : `Invita ${GOAL - friendsCount} amigo${GOAL - friendsCount !== 1 ? 's' : ''} mas para 1 mes premium gratis`}
          </Text>
        </View>
      </View>

      {/* Progress toward reward */}
      <View
        style={styles.progressSection}
        accessible={true}
        accessibilityRole="progressbar"
        accessibilityLabel={`Progreso de referidos: ${friendsCount} de ${GOAL} amigos${isGoalReached ? '. Premium gratis desbloqueado' : ''}`}
        accessibilityValue={{ min: 0, max: GOAL, now: friendsCount }}
      >
        <View style={styles.progressLabels}>
          <Text style={[styles.progressCount, { color: c.black }]}>
            {friendsCount}/{GOAL} amigos
          </Text>
          {isGoalReached && (
            <View style={[styles.rewardBadge, { backgroundColor: rewardColor + '15' }]}>
              <Ionicons name="checkmark-circle" size={14} color={rewardColor} />
              <Text style={[styles.rewardBadgeText, { color: rewardColor }]}>
                Premium gratis
              </Text>
            </View>
          )}
        </View>
        <View style={[styles.progressBarBg, { backgroundColor: c.surfaceAlt }]}>
          <Animated.View
            style={[
              styles.progressBarFill,
              {
                width: progressBarWidth,
                backgroundColor: isGoalReached ? rewardColor : accentColor,
              },
            ]}
          />
        </View>
      </View>

      {/* Referral code display */}
      <View style={[styles.codeRow, { backgroundColor: c.bg, borderColor: c.grayLight }]}>
        <View style={styles.codeLeft}>
          <Text style={[styles.codeLabel, { color: c.gray }]}>TU CODIGO</Text>
          <Text style={[styles.codeValue, { color: c.black }]}>{code}</Text>
        </View>
        <TouchableOpacity
          style={[
            styles.copyBtn,
            { borderColor: accentColor },
            copied && { backgroundColor: accentColor, borderColor: accentColor },
          ]}
          onPress={handleCopy}
          activeOpacity={0.7}
          accessibilityLabel={copied ? 'Codigo copiado' : 'Copiar codigo de referido'}
          accessibilityRole="button"
        >
          <Ionicons
            name={copied ? 'checkmark' : 'copy-outline'}
            size={14}
            color={copied ? c.white : accentColor}
          />
          <Text
            style={[
              styles.copyBtnText,
              { color: accentColor },
              copied && { color: c.white },
            ]}
          >
            {copied ? 'Copiado' : 'Copiar'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Share button */}
      <TouchableOpacity
        style={[styles.shareBtn, { backgroundColor: c.accent }]}
        onPress={handleShare}
        activeOpacity={0.85}
        accessibilityLabel="Invitar amigos. Compartir codigo de referido"
        accessibilityRole="button"
      >
        <Ionicons name="share-outline" size={18} color={c.white} />
        <Text style={[styles.shareBtnText, { color: c.white }]}>Invitar amigos</Text>
      </TouchableOpacity>

      {/* View details link */}
      {onViewDetails && (
        <TouchableOpacity
          style={styles.detailsLink}
          onPress={() => {
            haptics.light();
            track('referral_card_view_details');
            onViewDetails();
          }}
          activeOpacity={0.7}
          accessibilityLabel="Ver detalles del programa de referidos"
          accessibilityRole="button"
        >
          <Text style={[styles.detailsLinkText, { color: accentColor }]}>
            Ver detalles
          </Text>
          <Ionicons name="chevron-forward" size={14} color={accentColor} />
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  title: {
    ...typography.bodyMd,
    fontWeight: '700',
  },
  subtitle: {
    ...typography.caption,
    marginTop: 2,
  },

  // Progress
  progressSection: {
    marginBottom: spacing.md,
  },
  progressLabels: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs + 2,
  },
  progressCount: {
    ...typography.label,
  },
  rewardBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  rewardBadgeText: {
    ...typography.caption,
    fontWeight: '600',
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 6,
    borderRadius: 3,
  },

  // Code
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.sm + 2,
    marginBottom: spacing.sm,
  },
  codeLeft: {
    gap: 2,
  },
  codeLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  codeValue: {
    ...typography.bodyMd,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    borderWidth: 1.5,
  },
  copyBtnText: {
    ...typography.caption,
    fontWeight: '700',
  },

  // Share
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.full,
    height: 48,
    marginBottom: spacing.xs,
  },
  shareBtnText: {
    ...typography.button,
  },

  // Details link
  detailsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.xs,
  },
  detailsLinkText: {
    ...typography.caption,
    fontWeight: '600',
  },
});

export default React.memo(ReferralCard);
