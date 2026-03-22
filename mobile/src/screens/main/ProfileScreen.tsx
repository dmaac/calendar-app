/**
 * ProfileScreen — Perfil del usuario y configuración
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, typography, spacing, radius, shadows, useLayout } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../context/LanguageContext';
import { useAnalytics } from '../../hooks/useAnalytics';
import { haptics } from '../../hooks/useHaptics';
import { getOnboardingProfile } from '../../services/onboarding.service';
import { OnboardingProfileRead } from '../../types';
import ReferralCard from '../../components/ReferralCard';
// GOAL_LABELS is now resolved via i18n in the component

// ─── Mock profile for offline / backend unavailable ──────────────────────────
const MOCK_PROFILE: OnboardingProfileRead = {
  id: 0, user_id: 0,
  gender: 'male', workouts_per_week: 4, heard_from: null, used_other_apps: true,
  height_cm: 175, weight_kg: 78, unit_system: 'metric',
  birth_date: '1993-06-15', goal: 'lose', target_weight_kg: 72,
  weekly_speed_kg: 0.8, pain_points: null, diet_type: null, accomplishments: null,
  health_connected: false, notifications_enabled: true, referral_code: null,
  daily_calories: 2100, daily_carbs_g: 210, daily_protein_g: 150, daily_fats_g: 70,
  health_score: 75, completed_at: new Date().toISOString(),
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};

function AnimatedStatValue({ value, color }: { value: string; color: string }) {
  // Extract numeric part for animation, keep suffix (e.g. "2100 kcal" -> 2100 + " kcal")
  const match = value.match(/^([\d.]+)\s*(.*)$/);
  const numericTarget = match ? parseFloat(match[1]) : 0;
  const suffix = match ? (match[2] ? ` ${match[2]}` : '') : '';
  const hasNumeric = match && !isNaN(numericTarget);

  const animValue = useRef(new Animated.Value(0)).current;
  const [displayNum, setDisplayNum] = useState(0);

  useEffect(() => {
    if (!hasNumeric) return;
    animValue.setValue(0);
    Animated.timing(animValue, {
      toValue: numericTarget,
      duration: 500,
      useNativeDriver: false,
    }).start();
    const id = animValue.addListener(({ value: v }) => {
      setDisplayNum(Math.round(v));
    });
    return () => animValue.removeListener(id);
  }, [numericTarget]);

  if (!hasNumeric) {
    return <Text style={[styles.statValue, { color }]}>{value}</Text>;
  }

  return (
    <Text style={[styles.statValue, { color }]}>{displayNum}{suffix}</Text>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
  colors: c,
  delay = 0,
}: {
  icon: string;
  label: string;
  value: string;
  color?: string;
  colors: ReturnType<typeof useThemeColors>;
  delay?: number;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(12)).current;
  const pressScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const onPressIn = () => {
    Animated.spring(pressScale, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const onPressOut = () => {
    Animated.spring(pressScale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  return (
    <Pressable onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View
        style={[
          styles.statCard,
          { backgroundColor: c.surface, opacity: fadeAnim, transform: [{ translateY: slideAnim }, { scale: pressScale }] },
        ]}
        accessibilityLabel={`${label}: ${value}`}
      >
        <Ionicons name={icon as any} size={20} color={color ?? c.black} />
        <AnimatedStatValue value={value} color={c.black} />
        <Text style={[styles.statLabel, { color: c.gray }]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

function Row({
  icon,
  label,
  value,
  onPress,
  destructive,
  colors: c,
}: {
  icon: string;
  label: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  colors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: c.surface }]}
      onPress={() => { if (onPress) { haptics.light(); onPress(); } }}
      activeOpacity={onPress ? 0.7 : 1}
      accessibilityLabel={value ? `${label}: ${value}` : label}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityHint={onPress ? `Navega a ${label.toLowerCase()}` : undefined}
    >
      <Ionicons name={icon as any} size={20} color={destructive ? c.protein : c.gray} />
      <Text style={[styles.rowLabel, { color: c.black }, destructive && { color: c.protein }]}>{label}</Text>
      {value && <Text style={[styles.rowValue, { color: c.gray }]}>{value}</Text>}
      {onPress && !destructive && (
        <Ionicons name="chevron-forward" size={16} color={c.grayLight} />
      )}
    </TouchableOpacity>
  );
}

function useSectionFadeIn(delay: number) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 450,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 450,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return { opacity, transform: [{ translateY }] };
}

export default function ProfileScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { sidePadding } = useLayout();
  const { user } = useAuth();
  const c = useThemeColors();
  const { t } = useTranslation();
  const { track } = useAnalytics('Profile');

  // Staggered fade-in for each section
  const section1Style = useSectionFadeIn(100);
  const section2Style = useSectionFadeIn(200);
  const section3Style = useSectionFadeIn(300);
  const section4Style = useSectionFadeIn(400);

  const GOAL_LABELS: Record<string, string> = {
    lose:     t('profile.goalLabels.lose'),
    maintain: t('profile.goalLabels.maintain'),
    gain:     t('profile.goalLabels.gain'),
  };
  const [profile, setProfile] = useState<OnboardingProfileRead | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState(false);

  const loadProfile = () => {
    setProfileLoading(true);
    setProfileError(false);
    getOnboardingProfile()
      .then((p) => { setProfile(p); })
      .catch(() => {
        setProfileError(true);
        // Fall back to mock profile so the screen is usable without backend
        if (!profile) setProfile(MOCK_PROFILE);
      })
      .finally(() => setProfileLoading(false));
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const initials = user?.first_name
    ? user.first_name[0].toUpperCase()
    : user?.email?.[0]?.toUpperCase() ?? 'U';

  const goalLabel = GOAL_LABELS[profile?.goal ?? ''] ?? '—';
  const targetCal = profile?.daily_calories ? `${Math.round(profile.daily_calories)} kcal` : '—';
  const heightVal = profile?.height_cm ? `${profile.height_cm} cm` : '—';
  const weightVal = profile?.weight_kg ? `${profile.weight_kg} kg` : '—';
  const targetWeight = profile?.target_weight_kg ? `${profile.target_weight_kg} kg` : '—';

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        bounces={true}
        overScrollMode="never"
        contentContainerStyle={[styles.scroll, { paddingHorizontal: sidePadding }]}
      >
        {/* Avatar + info */}
        <View style={styles.profileHeader}>
          <View style={[styles.avatar, { backgroundColor: c.black }]}>
            <Text style={[styles.avatarText, { color: c.white }]}>{initials}</Text>
          </View>
          <Text style={[styles.profileName, { color: c.black }]}>
            {[user?.first_name, user?.last_name].filter(Boolean).join(' ') || t('profile.user')}
          </Text>
          <Text style={[styles.profileEmail, { color: c.gray }]}>{user?.email}</Text>
          {user?.is_premium && (
            <View style={[styles.premiumBadge, { backgroundColor: c.badgeBg }]}>
              <Text style={[styles.premiumText, { color: c.badgeText }]}>✦ Premium</Text>
            </View>
          )}
        </View>

        {/* Loading / error perfil */}
        {profileLoading && (
          <ActivityIndicator size="small" color={c.black} style={{ marginBottom: spacing.md }} />
        )}
        {profileError && !profileLoading && (
          <TouchableOpacity style={[styles.errorRow, { backgroundColor: c.accent + '15' }]} onPress={loadProfile} activeOpacity={0.8}>
            <Ionicons name="refresh-outline" size={14} color={c.accent} />
            <Text style={[styles.errorRowText, { color: c.accent }]}>No se pudo cargar el perfil. Toca para reintentar</Text>
          </TouchableOpacity>
        )}

        {/* Stats */}
        {profile && (
          <View style={styles.statsRow}>
            <StatCard icon="flame-outline"   label="Objetivo" value={targetCal} color={c.accent} colors={c} delay={0} />
            <StatCard icon="trophy-outline"  label="Meta" value={goalLabel === '—' ? '—' : goalLabel.split(' ')[0]} colors={c} delay={100} />
            <StatCard icon="scale-outline"   label="Peso meta" value={targetWeight} colors={c} delay={200} />
          </View>
        )}

        {/* Datos personales */}
        <Animated.View style={section1Style}>
          <Text style={[styles.sectionTitle, { color: c.black }]} accessibilityRole="header">{t('profile.personalData')}</Text>
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
            <Row icon="resize-outline"      label={t('profile.height')}       value={heightVal} colors={c} />
            <Row icon="scale-outline"       label={t('profile.currentWeight')}  value={weightVal} colors={c} />
            <Row icon="trophy-outline"      label={t('profile.goal')}     value={goalLabel} colors={c} />
            <Row icon="speedometer-outline" label={t('profile.targetWeight')} value={targetWeight} colors={c} />
            <Row
              icon="barbell-outline"
              label="Workouts"
              onPress={() => navigation.navigate('Workouts')}
              colors={c}
            />
            <Row
              icon="trending-down-outline"
              label={t('profile.weightHistory')}
              onPress={() => navigation.navigate('WeightTracking')}
              colors={c}
            />
            {profile && (
              <Row
                icon="create-outline"
                label={t('profile.editData')}
                onPress={() => navigation.navigate('EditProfile', { profile })}
                colors={c}
              />
            )}
          </View>
        </Animated.View>

        {/* Nutrición */}
        {profile?.daily_calories && (
          <Animated.View style={section2Style}>
            <Text style={[styles.sectionTitle, { color: c.black }]} accessibilityRole="header">{t('profile.nutritionPlan')}</Text>
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
              <Row icon="flame-outline"   label={t('profile.dailyCalories')}  value={targetCal} colors={c} />
              <Row icon="barbell-outline" label={t('profile.protein')}           value={profile.daily_protein_g ? `${Math.round(profile.daily_protein_g)}g` : '—'} colors={c} />
              <Row icon="leaf-outline"    label={t('profile.carbs')}      value={profile.daily_carbs_g ? `${Math.round(profile.daily_carbs_g)}g` : '—'} colors={c} />
              <Row icon="water-outline"   label={t('profile.fats')}             value={profile.daily_fats_g ? `${Math.round(profile.daily_fats_g)}g` : '—'} colors={c} />
              <Row
                icon="nutrition-outline"
                label={t('profile.editNutritionGoals')}
                onPress={() => navigation.navigate('NutritionGoals')}
                colors={c}
              />
            </View>
          </Animated.View>
        )}

        {/* Premium banner (si no es premium) */}
        {!user?.is_premium && (
          <TouchableOpacity
            style={[styles.premiumBanner, { backgroundColor: c.black }]}
            onPress={() => navigation.navigate('Paywall')}
            activeOpacity={0.85}
            accessibilityLabel="Hazte Premium. Escaneos ilimitados con IA"
            accessibilityRole="button"
            accessibilityHint="Navega a la pantalla de suscripcion Premium"
          >
            <View style={styles.premiumBannerLeft}>
              <Text style={styles.premiumBannerIcon}>👑</Text>
              <View>
                <Text style={[styles.premiumBannerTitle, { color: c.white }]}>{t('profile.goPremium')}</Text>
                <Text style={styles.premiumBannerSub}>{t('profile.unlimitedScans')}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={c.white} />
          </TouchableOpacity>
        )}

        {/* Invite Friends — ReferralCard with code generation + share */}
        <ReferralCard onViewDetails={() => navigation.navigate('Referral')} />

        {/* Configuración */}
        <Animated.View style={section3Style}>
          <Text style={[styles.sectionTitle, { color: c.black }]} accessibilityRole="header">{t('profile.account')}</Text>
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
            <Row
              icon="person-outline"
              label={t('profile.personalDetails')}
              onPress={() => navigation.navigate('PersonalDetails')}
              colors={c}
            />
            <Row icon="mail-outline"       label={t('profile.email')} value={user?.email} colors={c} />
            <Row icon="shield-outline"     label={t('profile.subscription')} value={user?.is_premium ? t('profile.premium') : t('profile.free')} onPress={() => navigation.navigate('Paywall')} colors={c} />
            <Row
              icon="people-outline"
              label={t('profile.upgradeFamilyPlan')}
              onPress={() => navigation.navigate('FamilyPlan')}
              colors={c}
            />
            <Row
              icon="settings-outline"
              label={t('profile.settings')}
              onPress={() => {
                track('settings_opened');
                navigation.navigate('Settings');
              }}
              colors={c}
            />
          </View>
        </Animated.View>

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { paddingTop: spacing.md },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '800',
  },
  profileName: { ...typography.titleSm },
  profileEmail: { ...typography.caption },
  premiumBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  premiumText: { ...typography.caption, fontWeight: '700' },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statCard: {
    flex: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  statValue: { ...typography.label, textAlign: 'center' },
  statLabel: { ...typography.caption, textAlign: 'center' },
  sectionTitle: {
    ...typography.label,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
    overflow: 'hidden',
    ...shadows.sm,
  },
  premiumBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  premiumBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  premiumBannerIcon: { fontSize: 28 },
  premiumBannerTitle: { ...typography.label },
  premiumBannerSub: { ...typography.caption, color: 'rgba(255,255,255,0.65)', marginTop: 2 },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  errorRowText: { ...typography.caption, flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    gap: spacing.sm,
    borderBottomWidth: 1,
  },
  rowLabel: { ...typography.bodyMd, flex: 1 },
  rowValue: { ...typography.caption, maxWidth: 120, textAlign: 'right' },
  referralBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  referralBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  referralBannerTitle: { ...typography.label },
  referralBannerSub: { ...typography.caption, marginTop: 2 },
});
