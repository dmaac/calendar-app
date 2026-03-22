/**
 * HealthAlerts — Dismissable health/nutrition alert cards.
 *
 * Alert levels:
 *   Warning (yellow): low protein, low fiber, other nutritional gaps
 *   Danger  (red):    very low calories for 3+ consecutive days
 *
 * Each alert shows an icon, descriptive text, a "Mas info" button,
 * and can be dismissed individually with an animated slide-out.
 */
import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, typography, spacing, radius, shadows } from '../theme';
import { haptics } from '../hooks/useHaptics';

// Enable LayoutAnimation on Android
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ---- Types ----------------------------------------------------------------

export type AlertLevel = 'warning' | 'danger';

export interface HealthAlert {
  /** Unique identifier for the alert. */
  id: string;
  /** Severity level. */
  level: AlertLevel;
  /** Ionicons icon name. */
  icon: string;
  /** Short alert title. */
  title: string;
  /** Descriptive message. */
  message: string;
  /** Optional callback when "Mas info" is tapped. */
  onMoreInfo?: () => void;
}

interface HealthAlertsProps {
  /** List of active alerts to display. */
  alerts: HealthAlert[];
  /** Called when an alert is dismissed, receives the alert id. */
  onDismiss?: (alertId: string) => void;
}

// ---- Alert generator (pure utility) ----------------------------------------

export interface AlertInput {
  /** Average daily protein in grams (last 3-7 days). */
  avgProtein: number;
  /** Daily protein target in grams. */
  targetProtein: number;
  /** Average daily fiber in grams. */
  avgFiber: number;
  /** Array of daily calorie totals for last N days (most recent last). */
  recentDailyCalories: number[];
  /** Minimum safe calorie threshold. Default 1200. */
  minSafeCalories?: number;
  /** Navigation callback for "Mas info" actions. */
  onNavigate?: (screen: string) => void;
}

/**
 * generateHealthAlerts — Pure function that computes which alerts to show.
 *
 * This is separated from the component so it can be unit-tested independently.
 */
export function generateHealthAlerts(input: AlertInput): HealthAlert[] {
  const alerts: HealthAlert[] = [];
  const minSafe = input.minSafeCalories ?? 1200;

  // ---- Danger: Very low calories for 3+ consecutive days ----
  const recent = input.recentDailyCalories;
  if (recent.length >= 3) {
    const lastThree = recent.slice(-3);
    const allBelowMin = lastThree.every((cal) => cal < minSafe);
    if (allBelowMin) {
      const avg = Math.round(lastThree.reduce((a, b) => a + b, 0) / lastThree.length);
      alerts.push({
        id: 'danger_low_calories',
        level: 'danger',
        icon: 'warning',
        title: 'Calorias muy bajas',
        message: `Llevas 3+ dias con un promedio de ${avg} kcal. Consumir menos de ${minSafe} kcal puede afectar tu metabolismo y salud.`,
        onMoreInfo: () => input.onNavigate?.('Coach'),
      });
    }
  }

  // ---- Warning: Low protein ----
  if (input.targetProtein > 0 && input.avgProtein < input.targetProtein * 0.6) {
    const pct = Math.round((input.avgProtein / input.targetProtein) * 100);
    alerts.push({
      id: 'warning_low_protein',
      level: 'warning',
      icon: 'barbell-outline',
      title: 'Proteina baja',
      message: `Tu consumo promedio de proteina es solo el ${pct}% de tu objetivo (${Math.round(input.avgProtein)}g / ${Math.round(input.targetProtein)}g). La proteina es esencial para mantener masa muscular.`,
      onMoreInfo: () => input.onNavigate?.('Coach'),
    });
  }

  // ---- Warning: Low fiber ----
  const FIBER_GOAL = 25; // grams/day recommended
  if (input.avgFiber < FIBER_GOAL * 0.5) {
    alerts.push({
      id: 'warning_low_fiber',
      level: 'warning',
      icon: 'leaf-outline',
      title: 'Fibra insuficiente',
      message: `Tu consumo promedio de fibra es ${Math.round(input.avgFiber)}g/dia. Se recomienda al menos ${FIBER_GOAL}g para una buena digestion y salud intestinal.`,
      onMoreInfo: () => input.onNavigate?.('Recetas'),
    });
  }

  return alerts;
}

// ---- Alert Card sub-component ---------------------------------------------

const LEVEL_CONFIG: Record<AlertLevel, { bg: string; border: string; iconColor: string; accentColor: string }> = {
  warning: {
    bg: '#FEF3C7',
    border: '#FDE68A',
    iconColor: '#D97706',
    accentColor: '#92400E',
  },
  danger: {
    bg: '#FEE2E2',
    border: '#FECACA',
    iconColor: '#DC2626',
    accentColor: '#991B1B',
  },
};

const AlertCard = React.memo(function AlertCard({
  alert,
  onDismiss,
}: {
  alert: HealthAlert;
  onDismiss: (id: string) => void;
}) {
  const config = LEVEL_CONFIG[alert.level];
  const slideX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const handleDismiss = useCallback(() => {
    haptics.light();
    Animated.parallel([
      Animated.timing(slideX, {
        toValue: 300,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      onDismiss(alert.id);
    });
  }, [alert.id, onDismiss, slideX, opacity]);

  const handleMoreInfo = useCallback(() => {
    haptics.light();
    alert.onMoreInfo?.();
  }, [alert.onMoreInfo]);

  return (
    <Animated.View
      style={[
        s.alertCard,
        {
          backgroundColor: config.bg,
          borderColor: config.border,
          transform: [{ translateX: slideX }],
          opacity,
        },
      ]}
      accessibilityLabel={`Alerta de salud: ${alert.title}. ${alert.message}`}
      accessibilityRole="alert"
    >
      {/* Left accent bar */}
      <View style={[s.accentBar, { backgroundColor: config.iconColor }]} />

      {/* Content */}
      <View style={s.alertContent}>
        {/* Top row: icon + title + dismiss */}
        <View style={s.alertHeader}>
          <View style={[s.alertIconCircle, { backgroundColor: config.iconColor + '20' }]}>
            <Ionicons name={alert.icon as any} size={16} color={config.iconColor} />
          </View>
          <Text style={[s.alertTitle, { color: config.accentColor }]}>
            {alert.title}
          </Text>
          <TouchableOpacity
            onPress={handleDismiss}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel={`Descartar alerta: ${alert.title}`}
            accessibilityRole="button"
          >
            <Ionicons name="close" size={18} color={config.accentColor} style={{ opacity: 0.6 }} />
          </TouchableOpacity>
        </View>

        {/* Message */}
        <Text style={[s.alertMessage, { color: config.accentColor }]}>
          {alert.message}
        </Text>

        {/* More info button */}
        {alert.onMoreInfo && (
          <TouchableOpacity
            style={[s.moreInfoBtn, { borderColor: config.iconColor + '40' }]}
            onPress={handleMoreInfo}
            activeOpacity={0.7}
            accessibilityLabel={`Mas informacion sobre ${alert.title}`}
            accessibilityRole="button"
          >
            <Ionicons name="information-circle-outline" size={14} color={config.iconColor} />
            <Text style={[s.moreInfoText, { color: config.iconColor }]}>Mas info</Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
});

// ---- Main component -------------------------------------------------------

export default function HealthAlerts({ alerts, onDismiss }: HealthAlertsProps) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const handleDismiss = useCallback(
    (alertId: string) => {
      setDismissedIds((prev) => {
        const next = new Set(prev);
        next.add(alertId);
        return next;
      });
      onDismiss?.(alertId);
    },
    [onDismiss],
  );

  const visibleAlerts = alerts.filter((a) => !dismissedIds.has(a.id));

  if (visibleAlerts.length === 0) return null;

  // Sort: danger first, then warning
  const sorted = [...visibleAlerts].sort((a, b) => {
    if (a.level === 'danger' && b.level !== 'danger') return -1;
    if (a.level !== 'danger' && b.level === 'danger') return 1;
    return 0;
  });

  return (
    <View
      style={s.container}
      accessibilityLabel={`${sorted.length} alerta${sorted.length > 1 ? 's' : ''} de salud`}
    >
      {sorted.map((alert) => (
        <AlertCard key={alert.id} alert={alert} onDismiss={handleDismiss} />
      ))}
    </View>
  );
}

// ---- Styles ---------------------------------------------------------------

const s = StyleSheet.create({
  container: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  alertCard: {
    flexDirection: 'row',
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
    ...shadows.sm,
  },
  accentBar: {
    width: 4,
  },
  alertContent: {
    flex: 1,
    padding: spacing.sm + 2,
    gap: spacing.xs,
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  alertIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertTitle: {
    ...typography.label,
    fontWeight: '700',
    flex: 1,
  },
  alertMessage: {
    ...typography.caption,
    lineHeight: 18,
    opacity: 0.85,
  },
  moreInfoBtn: {
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
  moreInfoText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
