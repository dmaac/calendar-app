/**
 * QuickCorrectionBar — Horizontal bar with 3 quick-action buttons.
 *
 * Shown when riskScore > 40 to help the user correct their nutrition.
 * Buttons: "Scan rapido", "Copiar ayer", "Snack proteico"
 * Animated entrance (slide up from bottom), haptic feedback on tap.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius } from '../theme';
import { haptics } from '../hooks/useHaptics';
import { useAnalytics } from '../hooks/useAnalytics';

interface QuickCorrectionBarProps {
  riskScore: number;
  onScanRapido: () => void;
  onCopiarAyer: () => void;
  onSnackProteico: () => void;
}

const BUTTONS = [
  { key: 'scan', label: 'Scan rapido', icon: 'camera' as const },
  { key: 'copy', label: 'Copiar ayer', icon: 'copy' as const },
  { key: 'snack', label: 'Snack proteico', icon: 'nutrition' as const },
] as const;

function QuickCorrectionBar({
  riskScore,
  onScanRapido,
  onCopiarAyer,
  onSnackProteico,
}: QuickCorrectionBarProps) {
  const c = useThemeColors();
  const { track } = useAnalytics();
  const slideAnim = useRef(new Animated.Value(60)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const visible = riskScore > 40;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      slideAnim.setValue(60);
      opacityAnim.setValue(0);
    }
  }, [visible, slideAnim, opacityAnim]);

  if (!visible) return null;

  const handlers = {
    scan: onScanRapido,
    copy: onCopiarAyer,
    snack: onSnackProteico,
  };

  const ACTION_MAP: Record<string, 'scan' | 'copy_yesterday' | 'protein_snack'> = {
    scan: 'scan',
    copy: 'copy_yesterday',
    snack: 'protein_snack',
  };

  const handlePress = (key: 'scan' | 'copy' | 'snack') => {
    haptics.light();
    track('risk_cta_clicked', { action: ACTION_MAP[key], riskScore });
    handlers[key]();
  };

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: c.surface, borderColor: c.grayLight },
        { transform: [{ translateY: slideAnim }], opacity: opacityAnim },
      ]}
    >
      {BUTTONS.map((btn) => (
        <TouchableOpacity
          key={btn.key}
          style={[styles.button, { backgroundColor: c.bg }]}
          onPress={() => handlePress(btn.key)}
          activeOpacity={0.7}
          accessibilityLabel={btn.label}
          accessibilityRole="button"
        >
          <Ionicons name={btn.icon} size={20} color={c.accent} />
          <Text style={[styles.buttonLabel, { color: c.black }]} numberOfLines={1}>
            {btn.label}
          </Text>
        </TouchableOpacity>
      ))}
    </Animated.View>
  );
}

export default React.memo(QuickCorrectionBar);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.sm,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  button: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    gap: 4,
  },
  buttonLabel: {
    ...typography.caption,
    fontWeight: '600',
  },
});
