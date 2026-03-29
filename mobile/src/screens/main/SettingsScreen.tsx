/**
 * SettingsScreen -- Organized preferences with clear section hierarchy:
 * Appearance, Preferences, Features, Integrations, Goals, Notifications,
 * Data & Privacy, Help & Support, Account (destructive), About.
 *
 * Key improvements:
 * - Logical section grouping (data/privacy together, destructive actions at bottom)
 * - Subtitle support on rows for additional context
 * - Two-step delete account confirmation
 * - App version pinned at bottom footer
 * - Consistent icon colors and circle backgrounds
 * - Proper bottom inset padding for scroll content
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Linking,
  Platform,
  PanResponder,
  LayoutChangeEvent,
  DimensionValue,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { typography, spacing, radius, shadows, useThemeColors } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { useAppTheme } from '../../context/ThemeContext';
import { useTranslation } from '../../context/LanguageContext';
import { haptics } from '../../hooks/useHaptics';
import { useAnalytics } from '../../hooks/useAnalytics';
import ApiService from '../../services/api';
import useHealthKit from '../../hooks/useHealthKit';
import {
  getCustomerInfo,
  getTrialStatus,
  type TrialStatus,
} from '../../services/purchase.service';
import type { ProfileStackScreenProps } from '../../navigation/types';

const APP_VERSION = '1.0.0';
const BUILD_NUMBER = '1';

const LOCALE_LABELS: Record<string, string> = {
  en: 'English',
  es: 'Espanol',
  pt: 'Portugues',
  fr: 'Francais',
  de: 'Deutsch',
  it: 'Italiano',
  zh: 'Chinese',
  hi: 'Hindi',
  ru: 'Russian',
  ro: 'Romana',
  az: 'Azerbaycanca',
  nl: 'Nederlands',
};

// AsyncStorage keys
const TOGGLE_KEYS = {
  badgeCelebrations: '@fitsi_badge_celebrations',
  liveActivity: '@fitsi_live_activity',
  addBurnedCalories: '@fitsi_add_burned_calories',
  rolloverCalories: '@fitsi_rollover_calories',
  autoAdjustMacros: '@fitsi_auto_adjust_macros',
};

const AI_PROVIDER_KEY = '@fitsi_ai_provider';
const AI_PROVIDER_OPTIONS = [
  { value: 'auto', label: 'Auto (recommended)' },
  { value: 'claude', label: 'Claude AI' },
  { value: 'openai', label: 'GPT-4o' },
] as const;
type AIProviderValue = typeof AI_PROVIDER_OPTIONS[number]['value'];

// ---- Sub-components ---------------------------------------------------------

function AppearanceButton({
  icon,
  label,
  isSelected,
  onPress,
  c,
}: {
  icon: string;
  label: string;
  isSelected: boolean;
  onPress: () => void;
  c: ReturnType<typeof useThemeColors>;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.appearanceBtn,
        { backgroundColor: c.surface },
        isSelected && { borderColor: c.accent, borderWidth: 2 },
      ]}
      onPress={() => { haptics.light(); onPress(); }}
      activeOpacity={0.7}
      accessibilityLabel={`Appearance: ${label}`}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
    >
      <Ionicons name={icon as any} size={24} color={isSelected ? c.accent : c.gray} />
      <Text style={[styles.appearanceBtnLabel, { color: isSelected ? c.accent : c.gray }, isSelected && { fontWeight: '700' }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function SectionHeader({ title, c }: { title: string; c: ReturnType<typeof useThemeColors> }) {
  return (
    <Text style={[styles.sectionHeader, { color: c.gray }]} accessibilityRole="header" allowFontScaling>
      {title}
    </Text>
  );
}

function SettingsRow({
  icon,
  iconColor,
  label,
  subtitle,
  value,
  onPress,
  destructive,
  isLast,
  c,
}: {
  icon: string;
  iconColor?: string;
  label: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  isLast?: boolean;
  c: ReturnType<typeof useThemeColors>;
}) {
  const resolvedColor = iconColor ?? c.gray;

  return (
    <TouchableOpacity
      style={[styles.row, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.grayLight }]}
      onPress={onPress}
      activeOpacity={onPress ? 0.6 : 1}
      disabled={!onPress}
      accessibilityLabel={value != null ? `${label}: ${value}` : label}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityHint={onPress && !destructive ? `Navigate to ${label.toLowerCase()}` : undefined}
    >
      <View style={[styles.iconCircle, { backgroundColor: destructive ? c.protein + '15' : c.surface }]}>
        <Ionicons name={icon as any} size={18} color={destructive ? c.protein : resolvedColor} />
      </View>
      <View style={styles.rowTextWrap}>
        <Text style={[styles.rowLabel, { color: c.black }, destructive && { color: c.protein }]} allowFontScaling>
          {label}
        </Text>
        {subtitle != null && (
          <Text style={[styles.rowSubtitle, { color: c.gray }]} allowFontScaling numberOfLines={2}>
            {subtitle}
          </Text>
        )}
      </View>
      {value != null && <Text style={[styles.rowValue, { color: c.gray }]} allowFontScaling>{value}</Text>}
      {onPress && !destructive && (
        <Ionicons name="chevron-forward" size={16} color={c.disabled} />
      )}
    </TouchableOpacity>
  );
}

function ToggleRow({
  icon,
  iconColor,
  label,
  subtitle,
  value,
  onToggle,
  isLast,
  c,
}: {
  icon: string;
  iconColor?: string;
  label: string;
  subtitle?: string;
  value: boolean;
  onToggle: (v: boolean) => void;
  isLast?: boolean;
  c: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View
      style={[styles.row, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.grayLight }]}
      accessibilityLabel={`${label}: ${value ? 'enabled' : 'disabled'}`}
    >
      <View style={[styles.iconCircle, { backgroundColor: c.surface }]}>
        <Ionicons name={icon as any} size={18} color={iconColor ?? c.gray} />
      </View>
      <View style={styles.rowTextWrap}>
        <Text style={[styles.rowLabel, { color: c.black }]} allowFontScaling>{label}</Text>
        {subtitle != null && (
          <Text style={[styles.rowSubtitle, { color: c.gray }]} allowFontScaling numberOfLines={2}>
            {subtitle}
          </Text>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={(v) => { haptics.light(); onToggle(v); }}
        trackColor={{ false: c.grayLight, true: c.accent }}
        thumbColor={c.white}
        ios_backgroundColor={c.grayLight}
        accessibilityLabel={label}
        accessibilityRole="switch"
      />
    </View>
  );
}

function SliderRow({
  icon,
  iconColor,
  label,
  value,
  min,
  max,
  step,
  unit,
  onDecrease,
  onIncrease,
  isLast,
  c,
}: {
  icon: string;
  iconColor?: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onDecrease: () => void;
  onIncrease: () => void;
  isLast?: boolean;
  c: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View style={[styles.row, styles.sliderRow, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.grayLight }]}>
      <View style={styles.sliderTop}>
        <View style={[styles.iconCircle, { backgroundColor: c.surface }]}>
          <Ionicons name={icon as any} size={18} color={iconColor ?? c.gray} />
        </View>
        <Text style={[styles.rowLabel, { color: c.black }]}>{label}</Text>
      </View>
      <View style={styles.stepperContainer}>
        <TouchableOpacity
          style={[styles.stepperBtn, { backgroundColor: c.surface }, value <= min && styles.stepperBtnDisabled]}
          onPress={() => { haptics.light(); onDecrease(); }}
          disabled={value <= min}
          activeOpacity={0.6}
          accessibilityLabel={`Decrease ${label.toLowerCase()}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: value <= min }}
        >
          <Ionicons name="remove" size={18} color={value <= min ? c.disabled : c.black} />
        </TouchableOpacity>
        <Text style={[styles.stepperValue, { color: c.black }]} accessibilityLabel={`${label}: ${value.toFixed(1)} ${unit}`}>
          {value.toFixed(1)} {unit}
        </Text>
        <TouchableOpacity
          style={[styles.stepperBtn, { backgroundColor: c.surface }, value >= max && styles.stepperBtnDisabled]}
          onPress={() => { haptics.light(); onIncrease(); }}
          disabled={value >= max}
          activeOpacity={0.6}
          accessibilityLabel={`Increase ${label.toLowerCase()}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: value >= max }}
        >
          <Ionicons name="add" size={18} color={value >= max ? c.disabled : c.black} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function TrueToneSlider({
  value,
  onValueChange,
  c,
}: {
  value: number;
  onValueChange: (v: number) => void;
  c: ReturnType<typeof useThemeColors>;
}) {
  const trackWidth = useRef(0);
  const currentValue = useRef(value);
  currentValue.current = value;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const x = evt.nativeEvent.locationX;
        onValueChange(Math.round(Math.max(0, Math.min(100, (x / trackWidth.current) * 100))));
      },
      onPanResponderMove: (evt) => {
        const x = evt.nativeEvent.locationX;
        onValueChange(Math.round(Math.max(0, Math.min(100, (x / trackWidth.current) * 100))));
      },
    }),
  ).current;

  const handleLayout = (e: LayoutChangeEvent) => { trackWidth.current = e.nativeEvent.layout.width; };
  const pct = `${value}%` as DimensionValue;

  return (
    <View
      style={styles.trueToneTrack}
      onLayout={handleLayout}
      {...panResponder.panHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`True Tone: ${value} percent`}
      accessibilityValue={{ min: 0, max: 100, now: value }}
      accessibilityHint="Drag to adjust screen warmth"
    >
      <View style={[styles.trueToneTrackFill, { width: pct, backgroundColor: '#F59E0B' }]} />
      <View style={[styles.trueToneThumb, { left: pct, backgroundColor: '#FFFFFF', borderColor: '#F59E0B' }]} />
    </View>
  );
}

function Card({ children, c }: { children: React.ReactNode; c: ReturnType<typeof useThemeColors> }) {
  return <View style={[styles.card, { backgroundColor: c.bg }]}>{children}</View>;
}

// ---- Main component ---------------------------------------------------------

export default function SettingsScreen({ navigation }: ProfileStackScreenProps<'Settings'>) {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { isDark, mode: themeMode, setMode, warmth, setWarmth } = useAppTheme();
  const c = useThemeColors();
  const { t, locale } = useTranslation();
  const { track } = useAnalytics('Settings');
  const healthKit = useHealthKit();

  // Local state
  const [unitSystem, setUnitSystem] = useState<'metric' | 'imperial'>('metric');
  const [waterGoal, setWaterGoal] = useState(2.5);
  const [aiProvider, setAiProvider] = useState<AIProviderValue>('auto');

  // Feature toggles
  const [badgeCelebrations, setBadgeCelebrations] = useState(true);
  const [liveActivity, setLiveActivity] = useState(false);
  const [addBurnedCalories, setAddBurnedCalories] = useState(false);
  const [rolloverCalories, setRolloverCalories] = useState(false);
  const [autoAdjustMacros, setAutoAdjustMacros] = useState(false);

  // Subscription state
  const [subPlan, setSubPlan] = useState<'monthly' | 'yearly' | 'lifetime' | null>(null);
  const [subExpirationDate, setSubExpirationDate] = useState<string | null>(null);
  const [trialStatus, setTrialStatus] = useState<TrialStatus>({
    isTrialing: false,
    trialDaysRemaining: 0,
    trialExpirationDate: null,
  });

  // Load persisted values on mount
  useEffect(() => {
    (async () => {
      try {
        const [badge, live, burned, rollover, autoAdj, savedProvider] = await Promise.all([
          AsyncStorage.getItem(TOGGLE_KEYS.badgeCelebrations),
          AsyncStorage.getItem(TOGGLE_KEYS.liveActivity),
          AsyncStorage.getItem(TOGGLE_KEYS.addBurnedCalories),
          AsyncStorage.getItem(TOGGLE_KEYS.rolloverCalories),
          AsyncStorage.getItem(TOGGLE_KEYS.autoAdjustMacros),
          AsyncStorage.getItem(AI_PROVIDER_KEY),
        ]);
        if (badge !== null) setBadgeCelebrations(badge === 'true');
        if (live !== null) setLiveActivity(live === 'true');
        if (burned !== null) setAddBurnedCalories(burned === 'true');
        if (rollover !== null) setRolloverCalories(rollover === 'true');
        if (autoAdj !== null) setAutoAdjustMacros(autoAdj === 'true');
        if (savedProvider !== null) setAiProvider(savedProvider as AIProviderValue);
      } catch {}
    })();
  }, []);

  // Load subscription info on mount
  useEffect(() => {
    (async () => {
      try {
        const [info, trial] = await Promise.all([getCustomerInfo(), getTrialStatus()]);
        setTrialStatus(trial);

        if (info) {
          const entitlement = info.entitlements.active?.premium;
          if (entitlement) {
            // Determine plan from productIdentifier
            const pid = (entitlement as Record<string, unknown>).productIdentifier as string | undefined;
            if (pid?.includes('lifetime')) {
              setSubPlan('lifetime');
            } else if (pid?.includes('annual') || pid?.includes('yearly')) {
              setSubPlan('yearly');
            } else {
              setSubPlan('monthly');
            }
            setSubExpirationDate(entitlement.expirationDate ?? null);
          }
        }
      } catch {}
    })();
  }, []);

  const isPremium = user?.is_premium ?? false;
  const isTrialing = trialStatus.isTrialing;

  // Format the renewal date for display
  const formattedRenewalDate = subExpirationDate
    ? new Date(subExpirationDate).toLocaleDateString(locale === 'es' ? 'es-CL' : locale === 'pt' ? 'pt-BR' : 'en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  const handleManageSubscription = () => {
    track('manage_subscription_tapped');
    const url = Platform.select({
      ios: 'https://apps.apple.com/account/subscriptions',
      android: 'https://play.google.com/store/account/subscriptions',
      default: '',
    });
    if (url) Linking.openURL(url);
  };

  const persistToggle = (key: string, setter: (v: boolean) => void) => (v: boolean) => {
    setter(v);
    track('setting_changed', { setting: key, value: v });
    AsyncStorage.setItem(key, String(v));
  };

  // ---- Action handlers ------------------------------------------------------

  const handleLogout = () => {
    haptics.heavy();
    Alert.alert(
      t('settings.logoutConfirmTitle'),
      t('settings.logoutConfirmMessage'),
      [
        { text: t('settings.cancel'), style: 'cancel' },
        {
          text: t('settings.logout'),
          style: 'destructive',
          onPress: async () => {
            haptics.medium();
            track('logout_confirmed');
            try { await logout(); } catch {}
          },
        },
      ],
    );
  };

  const handleDeleteAccount = () => {
    haptics.heavy();
    Alert.alert(
      t('settings.deleteAccountTitle'),
      t('settings.deleteAccountMessage'),
      [
        { text: t('settings.cancel'), style: 'cancel' },
        {
          text: t('settings.deleteAccount'),
          style: 'destructive',
          onPress: () => {
            // Second confirmation for this irreversible action
            Alert.alert(
              'Are you sure?',
              'This cannot be undone. Your account and all associated data will be permanently removed.',
              [
                { text: t('settings.cancel'), style: 'cancel' },
                {
                  text: 'Delete permanently',
                  style: 'destructive',
                  onPress: async () => {
                    haptics.heavy();
                    track('account_delete_confirmed');
                    try {
                      await ApiService.deleteAccount();
                      await logout();
                      Alert.alert(t('settings.accountDeleted'), t('settings.accountDeletedMessage'));
                    } catch (error: any) {
                      Alert.alert(t('common.error'), error?.response?.data?.detail || t('common.error'));
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  const handleExportData = () => {
    haptics.medium();
    track('export_data_started');
    Alert.alert(
      t('settings.exportDataTitle'),
      t('settings.exportDataMessage'),
      [
        { text: t('settings.cancel'), style: 'cancel' },
        { text: t('settings.export'), onPress: () => { track('export_data_confirmed'); } },
      ],
    );
  };

  const handleContactSupport = () => {
    track('contact_support_tapped');
    Linking.openURL('mailto:support@fitsi.app');
  };

  const handleRateApp = () => {
    track('rate_app_tapped');
    const storeUrl = Platform.select({
      ios: 'https://apps.apple.com/app/fitsi',
      android: 'https://play.google.com/store/apps/details?id=com.fitsi',
      default: '',
    });
    if (storeUrl) Linking.openURL(storeUrl);
  };

  // ---- Render ---------------------------------------------------------------

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.surface }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={c.bg} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: c.bg, borderBottomColor: c.grayLight }]}>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: c.surface }]}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={20} color={c.black} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.black }]} accessibilityRole="header" allowFontScaling>
          {t('settings.title')}
        </Text>
        <View style={styles.backButton} importantForAccessibility="no" />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        bounces
        overScrollMode="never"
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + spacing.xxl }]}
      >
        {/* ---- APPEARANCE ---- */}
        <SectionHeader title={t('settings.appearance')} c={c} />
        <Card c={c}>
          <View style={styles.appearanceRow} accessibilityRole="radiogroup" accessibilityLabel="Select appearance mode">
            <AppearanceButton icon="phone-portrait-outline" label={t('settings.system')} isSelected={themeMode === 'system'} onPress={() => { track('theme_changed', { theme: 'system' }); setMode('system'); }} c={c} />
            <AppearanceButton icon="sunny-outline" label={t('settings.light')} isSelected={themeMode === 'light'} onPress={() => { track('theme_changed', { theme: 'light' }); setMode('light'); }} c={c} />
            <AppearanceButton icon="moon-outline" label={t('settings.dark')} isSelected={themeMode === 'dark'} onPress={() => { track('theme_changed', { theme: 'dark' }); setMode('dark'); }} c={c} />
          </View>
        </Card>

        {/* True Tone (dark mode only) */}
        {isDark && (
          <Card c={c}>
            <View style={styles.trueToneContainer}>
              <View style={styles.trueToneHeader}>
                <View style={[styles.iconCircle, { backgroundColor: c.surface }]}>
                  <Ionicons name="moon-outline" size={18} color="#F59E0B" />
                </View>
                <Text style={[styles.rowLabel, { color: c.black }]}>True Tone</Text>
                <Text style={[styles.trueToneValue, { color: c.gray }]}>{warmth}%</Text>
              </View>
              <View style={styles.trueToneSliderRow}>
                <Text style={[styles.trueToneEndLabel, { color: c.gray }]}>Cool</Text>
                <View style={styles.trueToneTrackWrapper}>
                  <TrueToneSlider value={warmth} onValueChange={setWarmth} c={c} />
                </View>
                <Text style={[styles.trueToneEndLabel, { color: c.gray }]}>Warm</Text>
              </View>
              <View style={[styles.trueTonePreview, { backgroundColor: c.bg, borderColor: c.grayLight }]}>
                <View style={[styles.trueTonePreviewBar, { backgroundColor: c.surface }]} />
                <View style={[styles.trueTonePreviewBar, { backgroundColor: c.surfaceAlt, width: '60%' as DimensionValue }]} />
              </View>
            </View>
          </Card>
        )}

        {/* ---- SUBSCRIPTION ---- */}
        <SectionHeader title="SUSCRIPCION" c={c} />
        <Card c={c}>
          {isPremium && !isTrialing ? (
            /* ── Premium user ── */
            <View style={styles.subscriptionCard}>
              <View style={styles.subscriptionHeader}>
                <View style={[styles.iconCircle, { backgroundColor: '#F59E0B' + '20' }]}>
                  <Ionicons name="star" size={18} color="#F59E0B" />
                </View>
                <View style={styles.rowTextWrap}>
                  <Text style={[styles.rowLabel, { color: c.black, fontWeight: '700' }]} allowFontScaling>
                    Fitsi AI Premium
                  </Text>
                  <Text style={[styles.rowSubtitle, { color: c.gray }]} allowFontScaling>
                    {subPlan === 'lifetime'
                      ? 'Lifetime'
                      : subPlan === 'yearly'
                        ? 'Plan Anual'
                        : 'Plan Mensual'}
                  </Text>
                </View>
              </View>
              <View style={[styles.subscriptionDetail, { borderTopColor: c.grayLight }]}>
                <Ionicons name="calendar-outline" size={16} color={c.gray} />
                <Text style={[styles.subscriptionDetailText, { color: c.gray }]} allowFontScaling>
                  {subPlan === 'lifetime'
                    ? 'Acceso de por vida'
                    : formattedRenewalDate
                      ? `Renueva el ${formattedRenewalDate}`
                      : 'Suscripcion activa'}
                </Text>
              </View>
              {subPlan !== 'lifetime' && (
                <TouchableOpacity
                  style={[styles.subscriptionButton, { backgroundColor: c.surface }]}
                  onPress={handleManageSubscription}
                  activeOpacity={0.7}
                  accessibilityLabel="Manage subscription"
                  accessibilityRole="button"
                >
                  <Text style={[styles.subscriptionButtonText, { color: c.accent }]} allowFontScaling>
                    Gestionar suscripcion
                  </Text>
                  <Ionicons name="open-outline" size={14} color={c.accent} />
                </TouchableOpacity>
              )}
            </View>
          ) : isTrialing ? (
            /* ── Trial user ── */
            <View style={styles.subscriptionCard}>
              <View style={styles.subscriptionHeader}>
                <View style={[styles.iconCircle, { backgroundColor: '#8B5CF6' + '20' }]}>
                  <Ionicons name="time" size={18} color="#8B5CF6" />
                </View>
                <View style={styles.rowTextWrap}>
                  <Text style={[styles.rowLabel, { color: c.black, fontWeight: '700' }]} allowFontScaling>
                    Prueba Premium
                  </Text>
                  <Text style={[styles.rowSubtitle, { color: '#8B5CF6' }]} allowFontScaling>
                    {trialStatus.trialDaysRemaining} {trialStatus.trialDaysRemaining === 1 ? 'dia restante' : 'dias restantes'}
                  </Text>
                </View>
                <View style={[styles.trialBadge, { backgroundColor: '#8B5CF6' + '15' }]}>
                  <Text style={styles.trialBadgeText}>TRIAL</Text>
                </View>
              </View>
              {/* Trial progress bar */}
              <View style={[styles.trialProgressContainer, { borderTopColor: c.grayLight }]}>
                <View style={[styles.trialProgressTrack, { backgroundColor: c.grayLight }]}>
                  <View
                    style={[
                      styles.trialProgressFill,
                      {
                        backgroundColor: '#8B5CF6',
                        width: `${Math.max(5, Math.min(100, ((7 - trialStatus.trialDaysRemaining) / 7) * 100))}%` as any,
                      },
                    ]}
                  />
                </View>
              </View>
              <TouchableOpacity
                style={[styles.subscriptionButton, { backgroundColor: c.surface }]}
                onPress={handleManageSubscription}
                activeOpacity={0.7}
                accessibilityLabel="Manage subscription"
                accessibilityRole="button"
              >
                <Text style={[styles.subscriptionButtonText, { color: c.accent }]} allowFontScaling>
                  Gestionar suscripcion
                </Text>
                <Ionicons name="open-outline" size={14} color={c.accent} />
              </TouchableOpacity>
            </View>
          ) : (
            /* ── Free user ── */
            <View style={styles.subscriptionCard}>
              <View style={styles.subscriptionHeader}>
                <View style={[styles.iconCircle, { backgroundColor: c.surface }]}>
                  <Ionicons name="lock-closed-outline" size={18} color={c.gray} />
                </View>
                <View style={styles.rowTextWrap}>
                  <Text style={[styles.rowLabel, { color: c.black, fontWeight: '700' }]} allowFontScaling>
                    Plan gratuito
                  </Text>
                  <Text style={[styles.rowSubtitle, { color: c.gray }]} allowFontScaling>
                    Escaneos limitados, sin coach IA
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.subscriptionUpgradeButton, { backgroundColor: c.accent }]}
                onPress={() => {
                  haptics.medium();
                  track('upgrade_tapped_settings');
                  navigation.navigate('Paywall');
                }}
                activeOpacity={0.7}
                accessibilityLabel="Upgrade to Premium"
                accessibilityRole="button"
              >
                <Ionicons name="star" size={16} color="#FFFFFF" />
                <Text style={styles.subscriptionUpgradeText} allowFontScaling>
                  Mejorar a Premium
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </Card>

        {/* ---- PREFERENCES ---- */}
        <SectionHeader title={t('settings.general')} c={c} />
        <Card c={c}>
          <SettingsRow
            icon="swap-horizontal-outline"
            iconColor={c.accent}
            label={t('settings.units')}
            value={unitSystem === 'metric' ? t('settings.metric') : t('settings.imperial')}
            onPress={() => { haptics.light(); setUnitSystem((u) => (u === 'metric' ? 'imperial' : 'metric')); }}
            c={c}
          />
          <SettingsRow
            icon="sparkles-outline"
            iconColor="#7C3AED"
            label="AI Provider"
            value={AI_PROVIDER_OPTIONS.find((o) => o.value === aiProvider)?.label ?? 'Auto'}
            onPress={() => {
              haptics.light();
              const nextIdx = (AI_PROVIDER_OPTIONS.findIndex((o) => o.value === aiProvider) + 1) % AI_PROVIDER_OPTIONS.length;
              const next = AI_PROVIDER_OPTIONS[nextIdx].value;
              setAiProvider(next);
              track('setting_changed', { setting: 'ai_provider', value: next });
              AsyncStorage.setItem(AI_PROVIDER_KEY, next);
            }}
            c={c}
          />
          <SettingsRow
            icon="language-outline"
            iconColor="#6366F1"
            label={t('settings.language')}
            value={LOCALE_LABELS[locale] ?? locale.toUpperCase()}
            onPress={() => { track('language_changed'); navigation.navigate('Language'); }}
            isLast
            c={c}
          />
        </Card>

        {/* ---- FEATURES ---- */}
        <SectionHeader title={t('settings.features')} c={c} />
        <Card c={c}>
          <ToggleRow icon="trophy-outline" iconColor="#F59E0B" label={t('settings.badgeCelebrations')} value={badgeCelebrations} onToggle={persistToggle(TOGGLE_KEYS.badgeCelebrations, setBadgeCelebrations)} c={c} />
          <ToggleRow icon="pulse-outline" iconColor="#10B981" label={t('settings.liveActivity')} value={liveActivity} onToggle={persistToggle(TOGGLE_KEYS.liveActivity, setLiveActivity)} c={c} />
          <ToggleRow icon="flame-outline" iconColor="#EA4335" label={t('settings.addBurnedCalories')} value={addBurnedCalories} onToggle={persistToggle(TOGGLE_KEYS.addBurnedCalories, setAddBurnedCalories)} c={c} />
          <ToggleRow icon="arrow-redo-outline" iconColor="#6366F1" label={t('settings.rolloverCalories')} value={rolloverCalories} onToggle={persistToggle(TOGGLE_KEYS.rolloverCalories, setRolloverCalories)} c={c} />
          <ToggleRow icon="options-outline" iconColor={c.accent} label={t('settings.autoAdjustMacros')} value={autoAdjustMacros} onToggle={persistToggle(TOGGLE_KEYS.autoAdjustMacros, setAutoAdjustMacros)} isLast c={c} />
        </Card>

        {/* ---- INTEGRATIONS ---- */}
        {healthKit.isAvailable && (
          <>
            <SectionHeader title={t('settings.integrations')} c={c} />
            <Card c={c}>
              <ToggleRow
                icon="heart-outline"
                iconColor="#FF2D55"
                label={t('settings.appleHealth')}
                subtitle="Sync workouts and activity data"
                value={healthKit.connected}
                onToggle={async (v) => {
                  if (v) {
                    track('apple_health_connect_started');
                    const ok = await healthKit.connect();
                    track('apple_health_connect_result', { success: ok });
                    if (!ok && healthKit.error) Alert.alert('Apple Health', healthKit.error);
                  } else {
                    track('apple_health_disconnected');
                    await healthKit.disconnect();
                  }
                }}
                isLast
                c={c}
              />
            </Card>
          </>
        )}

        {/* ---- GOALS ---- */}
        <SectionHeader title={t('settings.goals')} c={c} />
        <Card c={c}>
          <SliderRow
            icon="water-outline"
            iconColor="#3B82F6"
            label={t('settings.dailyWaterGoal')}
            value={waterGoal}
            min={1}
            max={5}
            step={0.5}
            unit="L"
            onDecrease={() => setWaterGoal((v) => Math.max(1, +(v - 0.5).toFixed(1)))}
            onIncrease={() => setWaterGoal((v) => Math.min(5, +(v + 0.5).toFixed(1)))}
            c={c}
          />
          <SettingsRow
            icon="restaurant-outline"
            iconColor="#10B981"
            label={t('settings.mealReminders')}
            onPress={() => navigation.navigate('TrackingReminders')}
            isLast
            c={c}
          />
        </Card>

        {/* ---- NOTIFICATIONS ---- */}
        <SectionHeader title={t('settings.notifications')} c={c} />
        <Card c={c}>
          <SettingsRow
            icon="notifications-outline"
            iconColor={c.accent}
            label="Notification Preferences"
            subtitle="Manage what notifications you receive"
            onPress={() => navigation.navigate('NotificationPreferences')}
            c={c}
          />
          <SettingsRow
            icon="time-outline"
            iconColor="#8B5CF6"
            label={t('settings.scheduleReminders')}
            subtitle="Set meal and water reminders"
            onPress={() => navigation.navigate('TrackingReminders')}
            isLast
            c={c}
          />
        </Card>

        {/* ---- DATA & PRIVACY ---- */}
        <SectionHeader title="DATA & PRIVACY" c={c} />
        <Card c={c}>
          <SettingsRow
            icon="document-text-outline"
            iconColor="#4285F4"
            label={t('settings.pdfReport')}
            subtitle="Download a PDF summary of your progress"
            onPress={() => navigation.navigate('PDFReport')}
            c={c}
          />
          <SettingsRow
            icon="download-outline"
            iconColor="#3B82F6"
            label={t('settings.exportData')}
            subtitle="Export all your data via email"
            onPress={handleExportData}
            c={c}
          />
          <SettingsRow
            icon="shield-checkmark-outline"
            iconColor="#10B981"
            label={t('settings.privacyPolicy')}
            onPress={() => navigation.navigate('PrivacyPolicy')}
            c={c}
          />
          <SettingsRow
            icon="document-text-outline"
            iconColor="#6366F1"
            label={t('settings.termsOfService')}
            onPress={() => navigation.navigate('TermsOfService')}
            isLast
            c={c}
          />
        </Card>

        {/* ---- HELP & SUPPORT ---- */}
        <SectionHeader title="HELP & SUPPORT" c={c} />
        <Card c={c}>
          <SettingsRow
            icon="help-circle-outline"
            iconColor="#4285F4"
            label={t('settings.helpAndFaq')}
            onPress={() => navigation.navigate('Help')}
            c={c}
          />
          <SettingsRow
            icon="color-palette-outline"
            iconColor="#4CAF50"
            label={t('settings.ringColorsExplained')}
            onPress={() => navigation.navigate('RingColors')}
            c={c}
          />
          <SettingsRow
            icon="grid-outline"
            iconColor="#8B5CF6"
            label={t('settings.widgetGuide')}
            onPress={() => navigation.navigate('WidgetGuide')}
            c={c}
          />
          <SettingsRow
            icon="mail-outline"
            iconColor="#3B82F6"
            label={t('settings.contactSupport')}
            onPress={handleContactSupport}
            c={c}
          />
          <SettingsRow
            icon="star-outline"
            iconColor="#F59E0B"
            label={t('settings.rateApp')}
            onPress={handleRateApp}
            isLast
            c={c}
          />
        </Card>

        {/* ---- ACCOUNT (destructive actions grouped at bottom) ---- */}
        <SectionHeader title={t('settings.accountSection')} c={c} />
        <Card c={c}>
          <SettingsRow
            icon="log-out-outline"
            label={t('settings.logout')}
            onPress={handleLogout}
            destructive
            c={c}
          />
          <SettingsRow
            icon="trash-outline"
            label={t('settings.deleteAccount')}
            subtitle="Permanently delete your account and all data"
            onPress={handleDeleteAccount}
            destructive
            isLast
            c={c}
          />
        </Card>

        {/* ---- ABOUT ---- */}
        <SectionHeader title="ABOUT" c={c} />
        <Card c={c}>
          <SettingsRow
            icon="information-circle-outline"
            iconColor="#6366F1"
            label={t('settings.aboutApp')}
            onPress={() => navigation.navigate('About')}
            c={c}
          />
          <SettingsRow
            icon="information-circle-outline"
            iconColor={c.gray}
            label={t('settings.version')}
            value={`${APP_VERSION} (${BUILD_NUMBER})`}
            isLast
            c={c}
          />
        </Card>

        {/* Version footer */}
        <Text style={[styles.versionFooter, { color: c.disabled }]} allowFontScaling>
          Fitsi AI v{APP_VERSION} ({BUILD_NUMBER})
        </Text>
      </ScrollView>
    </View>
  );
}

// ---- Styles -----------------------------------------------------------------

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
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { ...typography.titleSm },
  scroll: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  sectionHeader: {
    ...typography.caption,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    marginLeft: spacing.sm,
  },
  card: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadows.sm,
  },

  // Appearance
  appearanceRow: {
    flexDirection: 'row',
    padding: spacing.md,
    gap: spacing.sm,
  },
  appearanceBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
    gap: spacing.xs,
  },
  appearanceBtnLabel: { ...typography.caption, fontWeight: '600' },

  // Row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    gap: spacing.sm,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTextWrap: { flex: 1 },
  rowLabel: { ...typography.bodyMd },
  rowSubtitle: { ...typography.caption, marginTop: 2 },
  rowValue: { ...typography.caption, marginRight: 4 },

  // Slider
  sliderRow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: spacing.sm,
  },
  sliderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingBottom: spacing.xs,
  },
  stepperBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnDisabled: { opacity: 0.4 },
  stepperValue: { ...typography.titleSm, minWidth: 60, textAlign: 'center' },

  // True Tone
  trueToneContainer: { padding: spacing.md, gap: spacing.sm },
  trueToneHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  trueToneValue: { ...typography.caption, fontWeight: '600' },
  trueToneSliderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xs },
  trueToneEndLabel: { ...typography.caption, fontWeight: '500', width: 38, textAlign: 'center' },
  trueToneTrackWrapper: { flex: 1 },
  trueToneTrack: {
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    overflow: 'visible',
  },
  trueToneTrackFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 14,
    opacity: 0.3,
  },
  trueToneThumb: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    marginLeft: -12,
    top: 2,
    borderWidth: 2,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  trueTonePreview: {
    height: 36,
    borderRadius: radius.sm,
    borderWidth: 1,
    padding: spacing.xs,
    gap: 4,
    justifyContent: 'center',
  },
  trueTonePreviewBar: {
    height: 6,
    borderRadius: 3,
    width: '80%' as DimensionValue,
  },

  // Subscription
  subscriptionCard: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  subscriptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  subscriptionDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  subscriptionDetailText: {
    ...typography.caption,
  },
  subscriptionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  subscriptionButtonText: {
    ...typography.bodyMd,
    fontWeight: '600',
  },
  subscriptionUpgradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: 14,
    borderRadius: 999,
  },
  subscriptionUpgradeText: {
    ...typography.bodyMd,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  trialBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 999,
  },
  trialBadgeText: {
    ...typography.caption,
    fontWeight: '700',
    color: '#8B5CF6',
    fontSize: 10,
  },
  trialProgressContainer: {
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  trialProgressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  trialProgressFill: {
    height: '100%',
    borderRadius: 3,
  },

  // Version footer
  versionFooter: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
});
