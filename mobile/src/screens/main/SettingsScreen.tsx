/**
 * SettingsScreen — Cal AI style preferences with Appearance selector + feature toggles
 */
import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, typography, spacing, radius, useThemeColors } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { useAppTheme } from '../../context/ThemeContext';
import { useTranslation } from '../../context/LanguageContext';
import { haptics } from '../../hooks/useHaptics';
import { useAnalytics } from '../../hooks/useAnalytics';
import ApiService from '../../services/api';
import useHealthKit from '../../hooks/useHealthKit';

const APP_VERSION = '1.0.0';

// AsyncStorage keys for Cal AI toggles
const TOGGLE_KEYS = {
  badgeCelebrations: '@fitsi_badge_celebrations',
  liveActivity: '@fitsi_live_activity',
  addBurnedCalories: '@fitsi_add_burned_calories',
  rolloverCalories: '@fitsi_rollover_calories',
  autoAdjustMacros: '@fitsi_auto_adjust_macros',
};

// ─── Appearance mode button ──────────────────────────────────────────────────

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
      onPress={() => {
        haptics.light();
        onPress();
      }}
      activeOpacity={0.7}
    >
      <Ionicons
        name={icon as any}
        size={24}
        color={isSelected ? c.accent : c.gray}
      />
      <Text
        style={[
          styles.appearanceBtnLabel,
          { color: isSelected ? c.accent : c.gray },
          isSelected && { fontWeight: '700' },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Section header ─────────────────────────────────────────────────────────

function SectionHeader({ title, c }: { title: string; c: ReturnType<typeof useThemeColors> }) {
  return <Text style={[styles.sectionHeader, { color: c.gray }]}>{title}</Text>;
}

// ─── Row variants ───────────────────────────────────────────────────────────

function SettingsRow({
  icon,
  iconColor = colors.gray,
  label,
  value,
  onPress,
  destructive,
  isLast,
  c,
}: {
  icon: string;
  iconColor?: string;
  label: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  isLast?: boolean;
  c: ReturnType<typeof useThemeColors>;
}) {
  return (
    <TouchableOpacity
      style={[styles.row, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.grayLight }]}
      onPress={onPress}
      activeOpacity={onPress ? 0.6 : 1}
      disabled={!onPress}
    >
      <View style={[styles.iconCircle, { backgroundColor: destructive ? '#FFEDED' : c.surface }]}>
        <Ionicons
          name={icon as any}
          size={18}
          color={destructive ? colors.protein : iconColor}
        />
      </View>
      <Text style={[styles.rowLabel, { color: c.black }, destructive && { color: colors.protein }]}>
        {label}
      </Text>
      {value != null && <Text style={[styles.rowValue, { color: c.gray }]}>{value}</Text>}
      {onPress && !destructive && (
        <Ionicons name="chevron-forward" size={16} color={c.disabled} />
      )}
    </TouchableOpacity>
  );
}

function ToggleRow({
  icon,
  iconColor = colors.gray,
  label,
  value,
  onToggle,
  isLast,
  c,
}: {
  icon: string;
  iconColor?: string;
  label: string;
  value: boolean;
  onToggle: (v: boolean) => void;
  isLast?: boolean;
  c: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View style={[styles.row, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.grayLight }]}>
      <View style={[styles.iconCircle, { backgroundColor: c.surface }]}>
        <Ionicons name={icon as any} size={18} color={iconColor} />
      </View>
      <Text style={[styles.rowLabel, { color: c.black }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={(v) => {
          haptics.light();
          onToggle(v);
        }}
        trackColor={{ false: c.grayLight, true: colors.accent }}
        thumbColor={colors.white}
        ios_backgroundColor={c.grayLight}
      />
    </View>
  );
}

function SliderRow({
  icon,
  iconColor = colors.gray,
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
          <Ionicons name={icon as any} size={18} color={iconColor} />
        </View>
        <Text style={[styles.rowLabel, { color: c.black }]}>{label}</Text>
      </View>
      <View style={styles.stepperContainer}>
        <TouchableOpacity
          style={[styles.stepperBtn, { backgroundColor: c.surface }, value <= min && styles.stepperBtnDisabled]}
          onPress={() => { haptics.light(); onDecrease(); }}
          disabled={value <= min}
          activeOpacity={0.6}
        >
          <Ionicons name="remove" size={18} color={value <= min ? c.disabled : c.black} />
        </TouchableOpacity>
        <Text style={[styles.stepperValue, { color: c.black }]}>
          {value.toFixed(1)} {unit}
        </Text>
        <TouchableOpacity
          style={[styles.stepperBtn, { backgroundColor: c.surface }, value >= max && styles.stepperBtnDisabled]}
          onPress={() => { haptics.light(); onIncrease(); }}
          disabled={value >= max}
          activeOpacity={0.6}
        >
          <Ionicons name="add" size={18} color={value >= max ? c.disabled : c.black} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Card wrapper ───────────────────────────────────────────────────────────

function Card({ children, c }: { children: React.ReactNode; c: ReturnType<typeof useThemeColors> }) {
  return <View style={[styles.card, { backgroundColor: c.bg }]}>{children}</View>;
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function SettingsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();
  const { isDark, mode: themeMode, setMode } = useAppTheme();
  const c = useThemeColors();
  const { t } = useTranslation();
  const { track } = useAnalytics('Settings');
  const healthKit = useHealthKit();

  // Local state for toggles
  const [unitSystem, setUnitSystem] = useState<'metric' | 'imperial'>('metric');
  const [waterGoal, setWaterGoal] = useState(2.5);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [scheduleReminders, setScheduleReminders] = useState(true);

  // Cal AI feature toggles
  const [badgeCelebrations, setBadgeCelebrations] = useState(true);
  const [liveActivity, setLiveActivity] = useState(false);
  const [addBurnedCalories, setAddBurnedCalories] = useState(false);
  const [rolloverCalories, setRolloverCalories] = useState(false);
  const [autoAdjustMacros, setAutoAdjustMacros] = useState(false);

  // Load saved toggle states
  useEffect(() => {
    const loadToggles = async () => {
      try {
        const [badge, live, burned, rollover, autoAdj] = await Promise.all([
          AsyncStorage.getItem(TOGGLE_KEYS.badgeCelebrations),
          AsyncStorage.getItem(TOGGLE_KEYS.liveActivity),
          AsyncStorage.getItem(TOGGLE_KEYS.addBurnedCalories),
          AsyncStorage.getItem(TOGGLE_KEYS.rolloverCalories),
          AsyncStorage.getItem(TOGGLE_KEYS.autoAdjustMacros),
        ]);
        if (badge !== null) setBadgeCelebrations(badge === 'true');
        if (live !== null) setLiveActivity(live === 'true');
        if (burned !== null) setAddBurnedCalories(burned === 'true');
        if (rollover !== null) setRolloverCalories(rollover === 'true');
        if (autoAdj !== null) setAutoAdjustMacros(autoAdj === 'true');
      } catch {}
    };
    loadToggles();
  }, []);

  const persistToggle = (key: string, setter: (v: boolean) => void) => (v: boolean) => {
    setter(v);
    track('setting_changed', { setting: key, value: v });
    AsyncStorage.setItem(key, String(v));
  };

  const handleLogout = () => {
    haptics.heavy();
    Alert.alert(t('settings.logoutConfirmTitle'), t('settings.logoutConfirmMessage'), [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('settings.logout'),
        style: 'destructive',
        onPress: async () => {
          haptics.medium();
          try {
            await logout();
          } catch (err) {
            console.error('Logout failed:', err);
          }
        },
      },
    ]);
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
          onPress: async () => {
            haptics.heavy();
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
  };

  const handleExportData = () => {
    haptics.medium();
    Alert.alert(
      t('settings.exportDataTitle'),
      t('settings.exportDataMessage'),
      [
        { text: t('settings.cancel'), style: 'cancel' },
        { text: t('settings.export'), onPress: () => {} },
      ],
    );
  };

  const handleContactSupport = () => {
    Linking.openURL('mailto:support@fitsi.app');
  };

  const handleRateApp = () => {
    const storeUrl = Platform.select({
      ios: 'https://apps.apple.com/app/fitsi',
      android: 'https://play.google.com/store/apps/details?id=com.fitsi',
      default: '',
    });
    if (storeUrl) Linking.openURL(storeUrl);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.surface }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: c.bg, borderBottomColor: c.grayLight }]}>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: c.surface }]}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={20} color={c.black} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.black }]}>{t('settings.title')}</Text>
        <View style={[styles.backButton, { backgroundColor: c.surface }]} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        bounces={true}
        overScrollMode="never"
        contentContainerStyle={styles.scroll}
      >
        {/* APPEARANCE — Cal AI 3-button selector */}
        <SectionHeader title={t('settings.appearance')} c={c} />
        <Card c={c}>
          <View style={styles.appearanceRow}>
            <AppearanceButton
              icon="phone-portrait-outline"
              label={t('settings.system')}
              isSelected={themeMode === 'system'}
              onPress={() => { track('theme_changed', { theme: 'system' }); setMode('system'); }}
              c={c}
            />
            <AppearanceButton
              icon="sunny-outline"
              label={t('settings.light')}
              isSelected={themeMode === 'light'}
              onPress={() => { track('theme_changed', { theme: 'light' }); setMode('light'); }}
              c={c}
            />
            <AppearanceButton
              icon="moon-outline"
              label={t('settings.dark')}
              isSelected={themeMode === 'dark'}
              onPress={() => { track('theme_changed', { theme: 'dark' }); setMode('dark'); }}
              c={c}
            />
          </View>
        </Card>

        {/* FEATURES — Cal AI toggles */}
        <SectionHeader title={t('settings.features')} c={c} />
        <Card c={c}>
          <ToggleRow
            icon="trophy-outline"
            iconColor="#F59E0B"
            label={t('settings.badgeCelebrations')}
            value={badgeCelebrations}
            onToggle={persistToggle(TOGGLE_KEYS.badgeCelebrations, setBadgeCelebrations)}
            c={c}
          />
          <ToggleRow
            icon="pulse-outline"
            iconColor="#10B981"
            label={t('settings.liveActivity')}
            value={liveActivity}
            onToggle={persistToggle(TOGGLE_KEYS.liveActivity, setLiveActivity)}
            c={c}
          />
          <ToggleRow
            icon="flame-outline"
            iconColor="#EA4335"
            label={t('settings.addBurnedCalories')}
            value={addBurnedCalories}
            onToggle={persistToggle(TOGGLE_KEYS.addBurnedCalories, setAddBurnedCalories)}
            c={c}
          />
          <ToggleRow
            icon="arrow-redo-outline"
            iconColor="#6366F1"
            label={t('settings.rolloverCalories')}
            value={rolloverCalories}
            onToggle={persistToggle(TOGGLE_KEYS.rolloverCalories, setRolloverCalories)}
            c={c}
          />
          <ToggleRow
            icon="options-outline"
            iconColor={colors.accent}
            label={t('settings.autoAdjustMacros')}
            value={autoAdjustMacros}
            onToggle={persistToggle(TOGGLE_KEYS.autoAdjustMacros, setAutoAdjustMacros)}
            isLast
            c={c}
          />
        </Card>

        {/* INTEGRATIONS — Apple Health toggle */}
        {healthKit.isAvailable && (
          <>
            <SectionHeader title={t('settings.integrations')} c={c} />
            <Card c={c}>
              <ToggleRow
                icon="heart-outline"
                iconColor="#FF2D55"
                label={t('settings.appleHealth')}
                value={healthKit.connected}
                onToggle={async (v) => {
                  if (v) {
                    track('apple_health_connect_started');
                    const ok = await healthKit.connect();
                    track('apple_health_connect_result', { success: ok });
                    if (!ok && healthKit.error) {
                      Alert.alert(
                        'Apple Health',
                        healthKit.error,
                      );
                    }
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

        {/* GENERAL */}
        <SectionHeader title={t('settings.general')} c={c} />
        <Card c={c}>
          <SettingsRow
            icon="swap-horizontal-outline"
            iconColor={c.accent}
            label={t('settings.units')}
            value={unitSystem === 'metric' ? t('settings.metric') : t('settings.imperial')}
            onPress={() => {
              haptics.light();
              setUnitSystem((u) => (u === 'metric' ? 'imperial' : 'metric'));
            }}
            c={c}
          />
          <SettingsRow
            icon="language-outline"
            iconColor="#6366F1"
            label={t('settings.language')}
            onPress={() => { track('language_changed'); navigation.navigate('Language'); }}
            isLast
            c={c}
          />
        </Card>

        {/* METAS */}
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

        {/* NOTIFICACIONES */}
        <SectionHeader title={t('settings.notifications')} c={c} />
        <Card c={c}>
          <ToggleRow
            icon="notifications-outline"
            iconColor={c.accent}
            label={t('settings.pushNotifications')}
            value={pushEnabled}
            onToggle={setPushEnabled}
            c={c}
          />
          <ToggleRow
            icon="time-outline"
            iconColor="#8B5CF6"
            label={t('settings.scheduleReminders')}
            value={scheduleReminders}
            onToggle={setScheduleReminders}
            isLast
            c={c}
          />
        </Card>

        {/* CUENTA */}
        <SectionHeader title={t('settings.accountSection')} c={c} />
        <Card c={c}>
          <SettingsRow
            icon="download-outline"
            iconColor="#3B82F6"
            label={t('settings.exportData')}
            onPress={handleExportData}
            c={c}
          />
          <SettingsRow
            icon="trash-outline"
            label={t('settings.deleteAccount')}
            onPress={handleDeleteAccount}
            destructive
            c={c}
          />
          <SettingsRow
            icon="log-out-outline"
            label={t('settings.logout')}
            onPress={handleLogout}
            destructive
            isLast
            c={c}
          />
        </Card>

        {/* AYUDA */}
        <SectionHeader title={t('settings.help')} c={c} />
        <Card c={c}>
          <SettingsRow
            icon="color-palette-outline"
            iconColor="#4CAF50"
            label={t('settings.ringColorsExplained')}
            onPress={() => navigation.navigate('RingColors')}
            isLast
            c={c}
          />
        </Card>

        {/* SUPPORT */}
        <SectionHeader title={t('settings.support')} c={c} />
        <Card c={c}>
          <SettingsRow
            icon="help-circle-outline"
            iconColor="#4285F4"
            label={t('settings.helpAndFaq')}
            onPress={() => navigation.navigate('Help')}
            isLast
            c={c}
          />
        </Card>

        {/* LEGAL */}
        <SectionHeader title={t('settings.legal')} c={c} />
        <Card c={c}>
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

        {/* APP */}
        <SectionHeader title={t('settings.app')} c={c} />
        <Card c={c}>
          <SettingsRow
            icon="document-text-outline"
            iconColor="#4285F4"
            label={t('settings.pdfReport')}
            onPress={() => navigation.navigate('PDFReport')}
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
            icon="information-circle-outline"
            iconColor={c.gray}
            label={t('settings.version')}
            value={APP_VERSION}
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
            c={c}
          />
          <SettingsRow
            icon="information-circle-outline"
            iconColor="#6366F1"
            label={t('settings.aboutApp')}
            onPress={() => navigation.navigate('About')}
            isLast
            c={c}
          />
        </Card>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.grayLight,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typography.titleSm,
    color: colors.black,
  },
  scroll: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  sectionHeader: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.gray,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    marginLeft: spacing.sm,
  },
  card: {
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  // Appearance selector
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
  appearanceBtnLabel: {
    ...typography.caption,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    gap: spacing.sm,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.grayLight,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    ...typography.bodyMd,
    color: colors.black,
    flex: 1,
  },
  rowValue: {
    ...typography.caption,
    color: colors.gray,
    marginRight: 4,
  },
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
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnDisabled: {
    opacity: 0.4,
  },
  stepperValue: {
    ...typography.titleSm,
    color: colors.black,
    minWidth: 60,
    textAlign: 'center',
  },
});
