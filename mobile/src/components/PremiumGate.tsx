/**
 * PremiumGate — Reusable premium feature lock overlay.
 *
 * Renders a blurred/locked overlay with a lock icon, a title, a subtitle,
 * and an "Upgrade to Premium" CTA button. Optionally renders children behind
 * a blur effect to give users a preview of the locked content.
 *
 * Usage:
 *   <PremiumGate
 *     title="Unlock AI Coach"
 *     subtitle="Get personalized nutrition advice from your AI coach."
 *     onUpgrade={showPaywall}
 *   />
 *
 * Or with blurred preview:
 *   <PremiumGate
 *     title="Unlock detailed reports"
 *     subtitle="Weekly and monthly analytics with AI insights."
 *     onUpgrade={showPaywall}
 *     showPreview
 *   >
 *     <ReportsContent />
 *   </PremiumGate>
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { typography, spacing, radius, shadows, useThemeColors } from '../theme';

// ─── Premium feature list (shared for upgrade prompts) ──────────────────────

export const PREMIUM_FEATURES = [
  { icon: 'scan-outline' as const, text: 'Escaneos ilimitados con IA' },
  { icon: 'chatbubble-ellipses-outline' as const, text: 'AI Coach personalizado' },
  { icon: 'bar-chart-outline' as const, text: 'Reportes y analytics detallados' },
  { icon: 'restaurant-outline' as const, text: 'Biblioteca completa de recetas' },
  { icon: 'ban-outline' as const, text: 'Sin anuncios' },
  { icon: 'headset-outline' as const, text: 'Soporte prioritario' },
];

interface PremiumGateProps {
  /** Headline shown above the lock icon */
  title: string;
  /** Subtitle / description of what gets unlocked */
  subtitle: string;
  /** Called when the user taps the upgrade button */
  onUpgrade: () => void;
  /** Whether to show the feature list below the CTA */
  showFeatures?: boolean;
  /** Optional: render children behind a blurred overlay */
  showPreview?: boolean;
  /** Children to render as blurred preview (only used when showPreview=true) */
  children?: React.ReactNode;
}

export default function PremiumGate({
  title,
  subtitle,
  onUpgrade,
  showFeatures = false,
  showPreview = false,
  children,
}: PremiumGateProps) {
  const c = useThemeColors();

  const overlay = (
    <View
      style={[styles.container, { backgroundColor: c.bg }]}
      accessibilityRole="alert"
      accessibilityLabel={`${title}. ${subtitle}`}
    >
      {/* Lock icon */}
      <View style={[styles.lockCircle, { backgroundColor: c.accent + '15' }]}>
        <View style={[styles.lockInner, { backgroundColor: c.accent + '25' }]}>
          <Ionicons name="lock-closed" size={32} color={c.accent} />
        </View>
      </View>

      {/* Title & subtitle */}
      <Text style={[styles.title, { color: c.black }]}>{title}</Text>
      <Text style={[styles.subtitle, { color: c.gray }]}>{subtitle}</Text>

      {/* Upgrade CTA */}
      <TouchableOpacity
        style={[styles.upgradeBtn, { backgroundColor: c.black }]}
        onPress={onUpgrade}
        activeOpacity={0.85}
        accessibilityLabel="Ver planes Premium"
        accessibilityRole="button"
        accessibilityHint="Navega a la pantalla de suscripciones Premium"
      >
        <Ionicons name="star" size={16} color="#FFFFFF" />
        <Text style={styles.upgradeBtnText}>Ver planes Premium</Text>
      </TouchableOpacity>

      {/* Feature list */}
      {showFeatures && (
        <View style={styles.featureList}>
          {PREMIUM_FEATURES.map((feature) => (
            <View key={feature.text} style={styles.featureRow}>
              <Ionicons name={feature.icon} size={16} color={c.accent} />
              <Text style={[styles.featureText, { color: c.gray }]}>{feature.text}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );

  // If showPreview, render children behind a semi-transparent overlay
  if (showPreview && children) {
    return (
      <View style={styles.previewWrapper}>
        {/* Blurred content (opacity to simulate blur without native blur module) */}
        <View style={styles.previewContent} pointerEvents="none">
          {children}
        </View>
        {/* Overlay */}
        <View style={[styles.previewOverlay, { backgroundColor: c.bg + 'E6' }]}>
          {overlay}
        </View>
      </View>
    );
  }

  return overlay;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  lockCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  lockInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.titleSm,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.subtitle,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  upgradeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    width: '100%',
    maxWidth: 300,
    height: 52,
    borderRadius: 999,
    marginTop: spacing.sm,
    ...shadows.sm,
  },
  upgradeBtnText: {
    ...typography.button,
    color: '#FFFFFF',
  },
  featureList: {
    marginTop: spacing.lg,
    gap: spacing.sm + 2,
    alignSelf: 'stretch',
    paddingHorizontal: spacing.md,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  featureText: {
    ...typography.body,
    flex: 1,
  },
  // Preview overlay styles
  previewWrapper: {
    flex: 1,
    position: 'relative',
  },
  previewContent: {
    flex: 1,
    opacity: 0.3,
  },
  previewOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
