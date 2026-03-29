/**
 * NutritionAlert — Multi-level nutrition alert components.
 *
 * Renders alerts from the backend /api/alerts/daily endpoint with
 * four severity levels:
 *
 *   INFO:     Blue subtle banner with info icon
 *   WARNING:  Yellow banner (#F59E0B) with warning icon
 *   DANGER:   Red banner (#EF4444) with alert icon, haptic heavy
 *   CRITICAL: Full-screen red overlay with white text, Fitsi "sick", "Entendido" button
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { typography, spacing, radius, shadows } from '../theme';
import { haptics } from '../hooks/useHaptics';
import type { NutritionAlertData } from '../hooks/useNutritionAlerts';

// Enable LayoutAnimation on Android
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Level style config ─────────────────────────────────────────────────────

interface LevelStyle {
  bg: string;
  border: string;
  iconColor: string;
  textColor: string;
  accentBg: string;
}

const LEVEL_STYLES: Record<string, LevelStyle> = {
  info: {
    bg: '#EFF6FF',
    border: '#BFDBFE',
    iconColor: '#3B82F6',
    textColor: '#1E40AF',
    accentBg: '#3B82F620',
  },
  warning: {
    bg: '#FEF3C7',
    border: '#FDE68A',
    iconColor: '#F59E0B',
    textColor: '#92400E',
    accentBg: '#F59E0B20',
  },
  danger: {
    bg: '#FEE2E2',
    border: '#FECACA',
    iconColor: '#EF4444',
    textColor: '#991B1B',
    accentBg: '#EF444420',
  },
  critical: {
    bg: '#FEE2E2',
    border: '#FECACA',
    iconColor: '#DC2626',
    textColor: '#7F1D1D',
    accentBg: '#DC262620',
  },
};

// Map backend icon names to Ionicons names
function resolveIcon(icon: string): string {
  const map: Record<string, string> = {
    'alert-circle': 'alert-circle',
    'alert-triangle': 'alert-circle-outline',
    'trending-up': 'trending-up',
    'pie-chart': 'pie-chart',
    'arrow-down': 'arrow-down',
    'battery-low': 'battery-dead',
    'droplet': 'water',
    'zap': 'flash',
    'clock': 'time',
    'camera': 'camera',
  };
  return map[icon] || 'information-circle';
}

// ─── Single alert banner ────────────────────────────────────────────────────

interface AlertBannerProps {
  alert: NutritionAlertData;
  onDismiss: () => void;
  onAction?: (route: string) => void;
}

const AlertBanner = React.memo(function AlertBanner({
  alert,
  onDismiss,
  onAction,
}: AlertBannerProps) {
  const style = LEVEL_STYLES[alert.level] || LEVEL_STYLES.info;
  const slideX = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

  // Trigger haptic on mount for danger alerts
  useEffect(() => {
    if (alert.level === 'danger') {
      haptics.heavy();
    }
  }, [alert.level]);

  const handleDismiss = useCallback(() => {
    haptics.light();
    Animated.parallel([
      Animated.timing(slideX, {
        toValue: 300,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      onDismiss();
    });
  }, [onDismiss, slideX, opacityAnim]);

  const handleAction = useCallback(() => {
    haptics.light();
    onAction?.(alert.action_route);
  }, [onAction, alert.action_route]);

  return (
    <Animated.View
      style={[
        s.banner,
        {
          backgroundColor: style.bg,
          borderColor: style.border,
          transform: [{ translateX: slideX }],
          opacity: opacityAnim,
        },
      ]}
      accessibilityLabel={`Alerta: ${alert.title}. ${alert.message}`}
      accessibilityRole="alert"
    >
      {/* Left accent bar */}
      <View style={[s.accentBar, { backgroundColor: style.iconColor }]} />

      <View style={s.bannerContent}>
        {/* Header: icon + title + dismiss */}
        <View style={s.bannerHeader}>
          <View style={[s.iconCircle, { backgroundColor: style.accentBg }]}>
            <Ionicons
              name={resolveIcon(alert.icon) as any}
              size={16}
              color={style.iconColor}
            />
          </View>
          <Text style={[s.bannerTitle, { color: style.textColor }]} numberOfLines={1}>
            {alert.title}
          </Text>
          <TouchableOpacity
            onPress={handleDismiss}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel={`Descartar alerta: ${alert.title}`}
            accessibilityRole="button"
          >
            <Ionicons name="close" size={18} color={style.textColor} style={{ opacity: 0.6 }} />
          </TouchableOpacity>
        </View>

        {/* Message */}
        <Text style={[s.bannerMessage, { color: style.textColor }]}>
          {alert.message}
        </Text>

        {/* Action button */}
        {alert.action_label && onAction && (
          <TouchableOpacity
            style={[s.actionBtn, { borderColor: style.iconColor + '40' }]}
            onPress={handleAction}
            activeOpacity={0.7}
            accessibilityLabel={alert.action_label}
            accessibilityRole="button"
          >
            <Text style={[s.actionBtnText, { color: style.iconColor }]}>
              {alert.action_label}
            </Text>
            <Ionicons name="chevron-forward" size={12} color={style.iconColor} />
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
});

// ─── Critical full-screen overlay ───────────────────────────────────────────

interface CriticalOverlayProps {
  alert: NutritionAlertData;
  visible: boolean;
  onDismiss: () => void;
}

function CriticalOverlay({ alert, visible, onDismiss }: CriticalOverlayProps) {
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    if (visible) {
      haptics.error();
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, fadeAnim, scaleAnim]);

  const handleDismiss = useCallback(() => {
    haptics.medium();
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      onDismiss();
    });
  }, [onDismiss, fadeAnim]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleDismiss}
    >
      <Animated.View style={[s.criticalOverlay, { opacity: fadeAnim }]}>
        <Animated.View
          style={[
            s.criticalContent,
            {
              paddingTop: insets.top + 60,
              paddingBottom: insets.bottom + 40,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <View style={s.criticalTextBlock}>
            <Ionicons name="alert-circle" size={48} color="#FFFFFF" />
            <Text style={s.criticalTitle}>{alert.title}</Text>
            <Text style={s.criticalMessage}>{alert.message}</Text>
          </View>

          <TouchableOpacity
            style={s.criticalButton}
            onPress={handleDismiss}
            activeOpacity={0.85}
            accessibilityLabel="Entendido"
            accessibilityRole="button"
          >
            <Text style={s.criticalButtonText}>Entendido</Text>
          </TouchableOpacity>

          <Text style={s.criticalDisclaimer}>
            Esta informacion es orientativa. Consulta a un profesional de salud.
          </Text>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

// ─── Main export: NutritionAlerts container ─────────────────────────────────

interface NutritionAlertsProps {
  alerts: NutritionAlertData[];
  onAction?: (route: string) => void;
}

export default function NutritionAlerts({ alerts, onAction }: NutritionAlertsProps) {
  const [dismissedCodes, setDismissedCodes] = useState<Set<string>>(new Set());
  const [criticalDismissed, setCriticalDismissed] = useState(false);

  // Find the first critical alert (if any)
  const criticalAlert = alerts.find(
    (a) => a.level === 'critical' && !dismissedCodes.has(`critical-${a.title}`)
  );

  // Non-critical alerts, filtered by dismissed state
  const bannerAlerts = alerts.filter(
    (a) => a.level !== 'critical' && !dismissedCodes.has(`${a.level}-${a.title}`)
  );

  const handleDismissBanner = useCallback((alert: NutritionAlertData) => {
    setDismissedCodes((prev) => {
      const next = new Set(prev);
      next.add(`${alert.level}-${alert.title}`);
      return next;
    });
  }, []);

  const handleDismissCritical = useCallback(() => {
    setCriticalDismissed(true);
    if (criticalAlert) {
      setDismissedCodes((prev) => {
        const next = new Set(prev);
        next.add(`critical-${criticalAlert.title}`);
        return next;
      });
    }
  }, [criticalAlert]);

  if (bannerAlerts.length === 0 && !criticalAlert) return null;

  return (
    <>
      {/* CRITICAL: full-screen red overlay */}
      {criticalAlert && !criticalDismissed && (
        <CriticalOverlay
          alert={criticalAlert}
          visible={!criticalDismissed}
          onDismiss={handleDismissCritical}
        />
      )}

      {/* DANGER / WARNING / INFO banners */}
      {bannerAlerts.length > 0 && (
        <View
          style={s.container}
          accessibilityLabel={`${bannerAlerts.length} alerta${bannerAlerts.length > 1 ? 's' : ''} nutricional${bannerAlerts.length > 1 ? 'es' : ''}`}
        >
          {bannerAlerts.map((alert, index) => (
            <AlertBanner
              key={`${alert.level}-${alert.title}-${index}`}
              alert={alert}
              onDismiss={() => handleDismissBanner(alert)}
              onAction={onAction}
            />
          ))}
        </View>
      )}
    </>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },

  // ── Banner (info/warning/danger) ──
  banner: {
    flexDirection: 'row',
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
    ...shadows.sm,
  },
  accentBar: {
    width: 4,
  },
  bannerContent: {
    flex: 1,
    padding: spacing.sm + 2,
    gap: spacing.xs,
  },
  bannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTitle: {
    ...typography.label,
    fontWeight: '700',
    flex: 1,
  },
  bannerMessage: {
    ...typography.caption,
    lineHeight: 18,
    opacity: 0.85,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    marginTop: 2,
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // ── Critical overlay (full-screen red) ──
  criticalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(220, 38, 38, 0.95)',
  },
  criticalContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  criticalTextBlock: {
    alignItems: 'center',
    gap: spacing.md,
  },
  criticalTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  criticalMessage: {
    fontSize: 16,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 24,
    opacity: 0.9,
    paddingHorizontal: spacing.md,
  },
  criticalButton: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: spacing.xl + spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.full,
    marginTop: spacing.lg,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
  criticalButtonText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#DC2626',
  },
  criticalDisclaimer: {
    fontSize: 11,
    color: '#FFFFFF',
    opacity: 0.6,
    textAlign: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
});
