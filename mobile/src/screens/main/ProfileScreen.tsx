/**
 * ProfileScreen -- User profile with editable avatar, streak display,
 * daily stats summary, achievement badges, nutrition plan, and account nav.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Pressable,
  RefreshControl,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, typography, spacing, radius, shadows, useLayout } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { useAppTheme } from '../../context/ThemeContext';
import { useTranslation } from '../../context/LanguageContext';
import { useAnalytics } from '../../hooks/useAnalytics';
import { haptics } from '../../hooks/useHaptics';
import { getOnboardingProfile } from '../../services/onboarding.service';
import { getDailySummary } from '../../services/food.service';
import { OnboardingProfileRead, DailySummary } from '../../types';
import ReferralCard from '../../components/ReferralCard';

// ---- Mock data for offline / backend unavailable ----------------------------

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

const MOCK_SUMMARY: Partial<DailySummary> = {
  date: new Date().toISOString().slice(0, 10),
  total_calories: 0, total_protein_g: 0, total_carbs_g: 0, total_fats_g: 0,
  target_calories: 2100, target_protein_g: 150, target_carbs_g: 210, target_fats_g: 70,
  water_ml: 0, meals_logged: 0, streak_days: 0,
  calories_burned_exercise: 0,
};

// ---- Achievement badge definitions ------------------------------------------

interface AchievementBadge {
  id: string;
  icon: string;
  label: string;
  color: string;
  unlocked: boolean;
  requirement: string;
}

function buildBadges(
  summary: Partial<DailySummary> | null,
  profile: OnboardingProfileRead | null,
  colors: ReturnType<typeof useThemeColors>,
): AchievementBadge[] {
  const streak = summary?.streak_days ?? 0;
  const meals = summary?.meals_logged ?? 0;

  return [
    {
      id: 'first_meal',
      icon: 'restaurant-outline',
      label: 'First Meal',
      color: '#10B981',
      unlocked: meals >= 1,
      requirement: 'Log your first meal',
    },
    {
      id: 'streak_3',
      icon: 'flame-outline',
      label: '3-Day Streak',
      color: '#F59E0B',
      unlocked: streak >= 3,
      requirement: '3 consecutive days',
    },
    {
      id: 'streak_7',
      icon: 'flame',
      label: 'Week Warrior',
      color: colors.protein,
      unlocked: streak >= 7,
      requirement: '7-day streak',
    },
    {
      id: 'streak_30',
      icon: 'trophy-outline',
      label: 'Monthly Master',
      color: '#6366F1',
      unlocked: streak >= 30,
      requirement: '30-day streak',
    },
    {
      id: 'health_80',
      icon: 'heart-outline',
      label: 'Health Star',
      color: '#EC4899',
      unlocked: (profile?.health_score ?? 0) >= 80,
      requirement: '80+ health score',
    },
    {
      id: 'profile_done',
      icon: 'checkmark-circle-outline',
      label: 'All Set',
      color: '#4285F4',
      unlocked: profile?.completed_at != null,
      requirement: 'Complete onboarding',
    },
  ];
}

// ---- Reusable sub-components ------------------------------------------------

function AnimatedStatValue({ value, color }: { value: string; color: string }) {
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
    return <Text style={[styles.statValue, { color }]} allowFontScaling>{value}</Text>;
  }

  return (
    <Text style={[styles.statValue, { color }]} allowFontScaling>{displayNum}{suffix}</Text>
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
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, delay, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, delay, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Pressable
      onPressIn={() => Animated.spring(pressScale, { toValue: 0.97, useNativeDriver: true, speed: 50, bounciness: 4 }).start()}
      onPressOut={() => Animated.spring(pressScale, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 4 }).start()}
    >
      <Animated.View
        style={[
          styles.statCard,
          { backgroundColor: c.surface, opacity: fadeAnim, transform: [{ translateY: slideAnim }, { scale: pressScale }] },
        ]}
        accessibilityLabel={`${label}: ${value}`}
      >
        <Ionicons name={icon as any} size={20} color={color ?? c.black} accessibilityElementsHidden importantForAccessibility="no" />
        <AnimatedStatValue value={value} color={c.black} />
        <Text style={[styles.statLabel, { color: c.gray }]} allowFontScaling>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

function StreakBanner({
  days,
  colors: c,
}: {
  days: number;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  const flameColor = days >= 30 ? c.protein : days >= 7 ? '#F59E0B' : c.accent;

  return (
    <Animated.View
      style={[styles.streakBanner, { backgroundColor: c.surface, opacity: opacityAnim, transform: [{ scale: scaleAnim }] }]}
      accessibilityLabel={`${days} day streak`}
    >
      <View style={[styles.streakIconWrap, { backgroundColor: flameColor + '18' }]}>
        <Ionicons name="flame" size={28} color={flameColor} />
      </View>
      <View style={styles.streakTextWrap}>
        <Text style={[styles.streakCount, { color: c.black }]}>{days}</Text>
        <Text style={[styles.streakLabel, { color: c.gray }]}>day streak</Text>
      </View>
      {days >= 7 && (
        <View style={[styles.streakStar, { backgroundColor: flameColor + '18' }]}>
          <Ionicons name="star" size={12} color={flameColor} />
        </View>
      )}
    </Animated.View>
  );
}

function BadgeItem({
  badge,
  colors: c,
  delay = 0,
}: {
  badge: AchievementBadge;
  colors: ReturnType<typeof useThemeColors>;
  delay?: number;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 350, delay, useNativeDriver: true }).start();
  }, []);

  return (
    <Animated.View
      style={[styles.badgeItem, { opacity: fadeAnim }, !badge.unlocked && styles.badgeLocked]}
      accessibilityLabel={`${badge.label}: ${badge.unlocked ? 'unlocked' : badge.requirement}`}
    >
      <View style={[styles.badgeCircle, { backgroundColor: badge.unlocked ? badge.color + '18' : c.grayLight + '40' }]}>
        <Ionicons name={badge.icon as any} size={22} color={badge.unlocked ? badge.color : c.disabled} />
      </View>
      <Text style={[styles.badgeText, { color: badge.unlocked ? c.black : c.disabled }]} numberOfLines={1}>
        {badge.label}
      </Text>
    </Animated.View>
  );
}

function SectionDivider({ title, c }: { title: string; c: ReturnType<typeof useThemeColors> }) {
  return (
    <View style={styles.sectionDividerWrap}>
      <Text style={[styles.sectionTitle, { color: c.gray }]} accessibilityRole="header">{title}</Text>
    </View>
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
      accessibilityHint={onPress ? `Navigate to ${label.toLowerCase()}` : undefined}
    >
      <View style={[styles.rowIcon, { backgroundColor: destructive ? c.protein + '15' : c.surface }]}>
        <Ionicons name={icon as any} size={18} color={destructive ? c.protein : c.gray} accessibilityElementsHidden importantForAccessibility="no" />
      </View>
      <Text style={[styles.rowLabel, { color: c.black }, destructive && { color: c.protein }]} allowFontScaling>{label}</Text>
      {value != null && <Text style={[styles.rowValue, { color: c.gray }]} allowFontScaling>{value}</Text>}
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
      Animated.timing(opacity, { toValue: 1, duration: 450, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 450, delay, useNativeDriver: true }),
    ]).start();
  }, []);

  return { opacity, transform: [{ translateY }] };
}

// ---- Main component ---------------------------------------------------------

export default function ProfileScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { sidePadding } = useLayout();
  const { user } = useAuth();
  const c = useThemeColors();
  const { isDark } = useAppTheme();
  const { t } = useTranslation();
  const { track } = useAnalytics('Profile');

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
  const [summary, setSummary] = useState<Partial<DailySummary> | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadProfile = useCallback(() => {
    setProfileLoading(true);
    setProfileError(false);
    getOnboardingProfile()
      .then((p) => { setProfile(p); })
      .catch(() => {
        setProfileError(true);
        if (!profile) setProfile(MOCK_PROFILE);
      })
      .finally(() => setProfileLoading(false));
  }, []);

  const loadSummary = useCallback(() => {
    getDailySummary()
      .then((s) => setSummary(s))
      .catch(() => {
        if (!summary) setSummary(MOCK_SUMMARY);
      });
  }, []);

  useEffect(() => {
    loadProfile();
    loadSummary();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.all([
      getOnboardingProfile().then(setProfile).catch(() => {}),
      getDailySummary().then(setSummary).catch(() => {}),
    ]).finally(() => setRefreshing(false));
  }, []);

  // Derived values
  const initials = user?.first_name
    ? user.first_name[0].toUpperCase()
    : user?.email?.[0]?.toUpperCase() ?? 'U';

  const goalLabel = GOAL_LABELS[profile?.goal ?? ''] ?? '--';
  const targetCal = profile?.daily_calories ? `${Math.round(profile.daily_calories)} kcal` : '--';
  const heightVal = profile?.height_cm ? `${profile.height_cm} cm` : '--';
  const weightVal = profile?.weight_kg ? `${profile.weight_kg} kg` : '--';
  const targetWeight = profile?.target_weight_kg ? `${profile.target_weight_kg} kg` : '--';

  const streakDays = summary?.streak_days ?? 0;
  const mealsToday = summary?.meals_logged ?? 0;
  const caloriesToday = summary?.total_calories ?? 0;

  const badges = buildBadges(summary, profile, c);
  const unlockedCount = badges.filter((b) => b.unlocked).length;

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={c.bg} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        bounces
        overScrollMode="never"
        contentContainerStyle={[styles.scroll, { paddingHorizontal: sidePadding }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} colors={[c.accent]} />
        }
      >
        {/* ---- Avatar + user info ---- */}
        <View
          style={styles.profileHeader}
          accessible
          accessibilityRole="header"
          accessibilityLabel={`Profile: ${[user?.first_name, user?.last_name].filter(Boolean).join(' ') || t('profile.user')}. ${user?.email ?? ''}${user?.is_premium ? '. Premium account' : ''}`}
        >
          <TouchableOpacity
            style={styles.avatarTouchable}
            onPress={() => {
              haptics.light();
              track('edit_avatar_tapped');
              navigation.navigate('PersonalDetails');
            }}
            activeOpacity={0.8}
            accessibilityLabel="Edit profile picture"
            accessibilityRole="button"
          >
            <View style={[styles.avatar, { backgroundColor: c.accent }]}>
              <Text style={[styles.avatarText, { color: c.white }]} allowFontScaling={false}>{initials}</Text>
            </View>
            <View style={[styles.avatarEditBadge, { backgroundColor: c.bg, borderColor: c.grayLight }]}>
              <Ionicons name="camera-outline" size={14} color={c.accent} />
            </View>
          </TouchableOpacity>

          <Text style={[styles.profileName, { color: c.black }]} allowFontScaling>
            {[user?.first_name, user?.last_name].filter(Boolean).join(' ') || t('profile.user')}
          </Text>
          <Text style={[styles.profileEmail, { color: c.gray }]} allowFontScaling>{user?.email}</Text>

          {user?.is_premium && (
            <View style={[styles.premiumBadge, { backgroundColor: c.badgeBg }]} accessibilityLabel="Premium account">
              <Ionicons name="diamond-outline" size={12} color={c.badgeText} />
              <Text style={[styles.premiumText, { color: c.badgeText }]} allowFontScaling>Premium</Text>
            </View>
          )}
        </View>

        {/* ---- Loading / error ---- */}
        {profileLoading && (
          <ActivityIndicator size="small" color={c.accent} style={{ marginBottom: spacing.md }} />
        )}
        {profileError && !profileLoading && (
          <TouchableOpacity
            style={[styles.errorRow, { backgroundColor: c.accent + '15' }]}
            onPress={loadProfile}
            activeOpacity={0.8}
            accessibilityLabel="Could not load profile. Tap to retry"
            accessibilityRole="button"
          >
            <Ionicons name="refresh-outline" size={14} color={c.accent} />
            <Text style={[styles.errorRowText, { color: c.accent }]}>Could not load profile. Tap to retry</Text>
          </TouchableOpacity>
        )}

        {/* ---- Streak banner ---- */}
        {summary != null && (
          <StreakBanner days={streakDays} colors={c} />
        )}

        {/* ---- Today's stats ---- */}
        {profile && (
          <View style={styles.statsRow} accessible={false} accessibilityRole="none">
            <StatCard icon="flame-outline" label="Target" value={targetCal} color={c.accent} colors={c} delay={0} />
            <StatCard icon="restaurant-outline" label="Today" value={`${Math.round(caloriesToday)} kcal`} color={caloriesToday > 0 ? '#10B981' : c.gray} colors={c} delay={100} />
            <StatCard icon="nutrition-outline" label="Meals" value={`${mealsToday}`} colors={c} delay={200} />
          </View>
        )}

        {/* ---- Achievement badges ---- */}
        <Animated.View style={section1Style}>
          <SectionDivider title={`ACHIEVEMENTS (${unlockedCount}/${badges.length})`} c={c} />
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
            <View style={styles.badgesGrid}>
              {badges.map((badge, idx) => (
                <BadgeItem key={badge.id} badge={badge} colors={c} delay={idx * 60} />
              ))}
            </View>
            <TouchableOpacity
              style={[styles.viewAllBtn, { borderTopColor: c.grayLight + '50' }]}
              onPress={() => { haptics.light(); track('achievements_viewed'); navigation.navigate('Inicio', { screen: 'Achievements' }); }}
              activeOpacity={0.7}
              accessibilityLabel="View all achievements"
              accessibilityRole="button"
            >
              <Text style={[styles.viewAllText, { color: c.accent }]}>View all achievements</Text>
              <Ionicons name="chevron-forward" size={14} color={c.accent} />
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* ---- Personal data ---- */}
        <Animated.View style={section2Style}>
          <SectionDivider title={t('profile.personalData').toUpperCase()} c={c} />
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
            <Row icon="resize-outline"      label={t('profile.height')}         value={heightVal} colors={c} />
            <Row icon="scale-outline"       label={t('profile.currentWeight')}  value={weightVal} colors={c} />
            <Row icon="trophy-outline"      label={t('profile.goal')}           value={goalLabel} colors={c} />
            <Row icon="speedometer-outline" label={t('profile.targetWeight')}   value={targetWeight} colors={c} />
            <Row icon="barbell-outline"     label="Workouts"                     onPress={() => navigation.navigate('Workouts')} colors={c} />
            <Row icon="trending-down-outline" label={t('profile.weightHistory')} onPress={() => navigation.navigate('WeightTracking')} colors={c} />
            {profile && (
              <Row icon="create-outline" label={t('profile.editData')} onPress={() => navigation.navigate('EditProfile', { profile })} colors={c} />
            )}
          </View>
        </Animated.View>

        {/* ---- Nutrition plan ---- */}
        {profile?.daily_calories != null && (
          <Animated.View style={section3Style}>
            <SectionDivider title={t('profile.nutritionPlan').toUpperCase()} c={c} />
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
              <Row icon="flame-outline"     label={t('profile.dailyCalories')}  value={targetCal} colors={c} />
              <Row icon="barbell-outline"   label={t('profile.protein')}        value={profile.daily_protein_g ? `${Math.round(profile.daily_protein_g)}g` : '--'} colors={c} />
              <Row icon="leaf-outline"      label={t('profile.carbs')}          value={profile.daily_carbs_g ? `${Math.round(profile.daily_carbs_g)}g` : '--'} colors={c} />
              <Row icon="water-outline"     label={t('profile.fats')}           value={profile.daily_fats_g ? `${Math.round(profile.daily_fats_g)}g` : '--'} colors={c} />
              <Row icon="nutrition-outline" label={t('profile.editNutritionGoals')} onPress={() => navigation.navigate('NutritionGoals')} colors={c} />
            </View>
          </Animated.View>
        )}

        {/* ---- Premium banner (non-premium) ---- */}
        {!user?.is_premium && (
          <TouchableOpacity
            style={[styles.premiumBanner, { backgroundColor: c.black }]}
            onPress={() => navigation.navigate('Paywall')}
            activeOpacity={0.85}
            accessibilityLabel="Go Premium. Unlimited AI scans"
            accessibilityRole="button"
            accessibilityHint="Navigate to Premium subscription screen"
          >
            <View style={styles.premiumBannerLeft}>
              <View style={[styles.premiumBannerIconCircle, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                <Ionicons name="diamond" size={20} color="#F59E0B" />
              </View>
              <View>
                <Text style={[styles.premiumBannerTitle, { color: c.white }]}>{t('profile.goPremium')}</Text>
                <Text style={styles.premiumBannerSub}>{t('profile.unlimitedScans')}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={c.white} />
          </TouchableOpacity>
        )}

        {/* ---- Referral ---- */}
        <ReferralCard onViewDetails={() => navigation.navigate('Referral')} />

        {/* ---- Account ---- */}
        <Animated.View style={section4Style}>
          <SectionDivider title={t('profile.account').toUpperCase()} c={c} />
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.grayLight }]}>
            <Row icon="person-outline"        label={t('profile.personalDetails')}    onPress={() => navigation.navigate('PersonalDetails')} colors={c} />
            <Row icon="mail-outline"           label={t('profile.email')}              value={user?.email} colors={c} />
            <Row icon="shield-outline"         label={t('profile.subscription')}       value={user?.is_premium ? t('profile.premium') : t('profile.free')} onPress={() => navigation.navigate('Paywall')} colors={c} />
            <Row icon="people-outline"         label={t('profile.upgradeFamilyPlan')}  onPress={() => navigation.navigate('FamilyPlan')} colors={c} />
            <Row icon="notifications-outline"  label="Notifications"                    onPress={() => navigation.navigate('NotificationPreferences')} colors={c} />
            <Row
              icon="settings-outline"
              label={t('profile.settings')}
              onPress={() => { track('settings_opened'); navigation.navigate('Settings'); }}
              colors={c}
            />
          </View>
        </Animated.View>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </View>
  );
}

// ---- Styles -----------------------------------------------------------------

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { paddingTop: spacing.md },

  // Header
  profileHeader: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.xs,
  },
  avatarTouchable: {
    position: 'relative',
    marginBottom: spacing.xs,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 34,
    fontWeight: '800',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileName: { ...typography.titleSm, marginTop: spacing.xs },
  profileEmail: { ...typography.caption },
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    marginTop: spacing.xs,
  },
  premiumText: { ...typography.caption, fontWeight: '700' },

  // Error
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

  // Streak
  streakBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  streakIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakTextWrap: { flex: 1 },
  streakCount: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  streakLabel: { ...typography.caption, marginTop: 1 },
  streakStar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },

  // Stats
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

  // Badges
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: spacing.md,
    gap: spacing.sm,
  },
  badgeItem: {
    alignItems: 'center',
    width: '30%' as any,
    gap: 6,
    paddingVertical: spacing.sm,
  },
  badgeLocked: { opacity: 0.4 },
  badgeCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { ...typography.caption, fontWeight: '600', textAlign: 'center' },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderTopWidth: 1,
    paddingVertical: spacing.sm + 2,
  },
  viewAllText: { ...typography.caption, fontWeight: '600' },

  // Sections
  sectionDividerWrap: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    paddingLeft: spacing.xs,
  },
  sectionTitle: {
    ...typography.label,
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

  // Rows
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    gap: spacing.sm,
    borderBottomWidth: 1,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { ...typography.bodyMd, flex: 1 },
  rowValue: { ...typography.caption, maxWidth: 140, textAlign: 'right' },

  // Premium banner
  premiumBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  premiumBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  premiumBannerIconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  premiumBannerTitle: { ...typography.label },
  premiumBannerSub: { ...typography.caption, color: 'rgba(255,255,255,0.65)', marginTop: 2 },

  // Legacy compat (kept so nothing referencing these breaks)
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
