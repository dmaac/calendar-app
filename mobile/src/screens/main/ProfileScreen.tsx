/**
 * ProfileScreen — Perfil del usuario y configuración
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, useLayout } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { getOnboardingProfile } from '../../services/onboarding.service';
import { OnboardingProfileRead } from '../../types';
import { haptics } from '../../hooks/useHaptics';

const GOAL_LABELS: Record<string, string> = {
  lose:     'Perder peso',
  maintain: 'Mantener peso',
  gain:     'Ganar masa muscular',
};

function StatCard({
  icon,
  label,
  value,
  color = colors.black,
}: {
  icon: string;
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon as any} size={20} color={color} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Row({
  icon,
  label,
  value,
  onPress,
  destructive,
}: {
  icon: string;
  label: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
      <Ionicons name={icon as any} size={20} color={destructive ? colors.protein : colors.gray} />
      <Text style={[styles.rowLabel, destructive && { color: colors.protein }]}>{label}</Text>
      {value && <Text style={styles.rowValue}>{value}</Text>}
      {onPress && !destructive && (
        <Ionicons name="chevron-forward" size={16} color={colors.grayLight} />
      )}
    </TouchableOpacity>
  );
}

export default function ProfileScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { sidePadding } = useLayout();
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState<OnboardingProfileRead | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState(false);

  const loadProfile = () => {
    setProfileLoading(true);
    setProfileError(false);
    getOnboardingProfile()
      .then((p) => { setProfile(p); })
      .catch(() => { setProfileError(true); })
      .finally(() => setProfileLoading(false));
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const handleLogout = () => {
    haptics.heavy();
    Alert.alert('Cerrar sesión', '¿Estás seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar sesión',
        style: 'destructive',
        onPress: () => {
          haptics.medium();
          logout();
        },
      },
    ]);
  };

  const initials = user?.first_name
    ? user.first_name[0].toUpperCase()
    : user?.email?.[0]?.toUpperCase() ?? 'U';

  const goalLabel = GOAL_LABELS[profile?.goal ?? ''] ?? '—';
  const targetCal = profile?.daily_calories ? `${Math.round(profile.daily_calories)} kcal` : '—';
  const heightVal = profile?.height_cm ? `${profile.height_cm} cm` : '—';
  const weightVal = profile?.weight_kg ? `${profile.weight_kg} kg` : '—';
  const targetWeight = profile?.target_weight_kg ? `${profile.target_weight_kg} kg` : '—';

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingHorizontal: sidePadding }]}
      >
        {/* Avatar + info */}
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.profileName}>
            {[user?.first_name, user?.last_name].filter(Boolean).join(' ') || 'Usuario'}
          </Text>
          <Text style={styles.profileEmail}>{user?.email}</Text>
          {user?.is_premium && (
            <View style={styles.premiumBadge}>
              <Text style={styles.premiumText}>✦ Premium</Text>
            </View>
          )}
        </View>

        {/* Loading / error perfil */}
        {profileLoading && (
          <ActivityIndicator size="small" color={colors.black} style={{ marginBottom: spacing.md }} />
        )}
        {profileError && !profileLoading && (
          <TouchableOpacity style={styles.errorRow} onPress={loadProfile} activeOpacity={0.8}>
            <Ionicons name="refresh-outline" size={14} color={colors.accent} />
            <Text style={styles.errorRowText}>No se pudo cargar el perfil. Toca para reintentar</Text>
          </TouchableOpacity>
        )}

        {/* Stats */}
        {profile && (
          <View style={styles.statsRow}>
            <StatCard icon="flame-outline"   label="Objetivo" value={targetCal} color={colors.accent} />
            <StatCard icon="trophy-outline"  label="Meta" value={goalLabel === '—' ? '—' : goalLabel.split(' ')[0]} />
            <StatCard icon="scale-outline"   label="Peso meta" value={targetWeight} />
          </View>
        )}

        {/* Datos personales */}
        <Text style={styles.sectionTitle}>Datos personales</Text>
        <View style={styles.card}>
          <Row icon="resize-outline"      label="Altura"       value={heightVal} />
          <Row icon="scale-outline"       label="Peso actual"  value={weightVal} />
          <Row icon="trophy-outline"      label="Objetivo"     value={goalLabel} />
          <Row icon="speedometer-outline" label="Peso objetivo" value={targetWeight} />
          {profile && (
            <Row
              icon="create-outline"
              label="Editar datos"
              onPress={() => navigation.navigate('EditProfile', { profile })}
            />
          )}
        </View>

        {/* Nutrición */}
        {profile?.daily_calories && (
          <>
            <Text style={styles.sectionTitle}>Plan nutricional</Text>
            <View style={styles.card}>
              <Row icon="flame-outline"   label="Calorías diarias"  value={targetCal} />
              <Row icon="barbell-outline" label="Proteína"           value={profile.daily_protein_g ? `${Math.round(profile.daily_protein_g)}g` : '—'} />
              <Row icon="leaf-outline"    label="Carbohidratos"      value={profile.daily_carbs_g ? `${Math.round(profile.daily_carbs_g)}g` : '—'} />
              <Row icon="water-outline"   label="Grasas"             value={profile.daily_fats_g ? `${Math.round(profile.daily_fats_g)}g` : '—'} />
            </View>
          </>
        )}

        {/* Premium banner (si no es premium) */}
        {!user?.is_premium && (
          <TouchableOpacity
            style={styles.premiumBanner}
            onPress={() => navigation.navigate('Paywall')}
            activeOpacity={0.85}
          >
            <View style={styles.premiumBannerLeft}>
              <Text style={styles.premiumBannerIcon}>👑</Text>
              <View>
                <Text style={styles.premiumBannerTitle}>Hazte Premium</Text>
                <Text style={styles.premiumBannerSub}>Escaneos ilimitados · Sin restricciones</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.white} />
          </TouchableOpacity>
        )}

        {/* Configuración */}
        <Text style={styles.sectionTitle}>Cuenta</Text>
        <View style={styles.card}>
          <Row icon="mail-outline"       label="Correo" value={user?.email} />
          <Row icon="shield-outline"     label="Suscripción" value={user?.is_premium ? 'Premium' : 'Gratuita'} onPress={() => navigation.navigate('Paywall')} />
          <Row
            icon="log-out-outline"
            label="Cerrar sesión"
            onPress={handleLogout}
            destructive
          />
        </View>

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
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
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.white,
  },
  profileName: { ...typography.titleSm, color: colors.black },
  profileEmail: { ...typography.caption, color: colors.gray },
  premiumBadge: {
    backgroundColor: colors.badgeBg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  premiumText: { ...typography.caption, fontWeight: '700', color: colors.badgeText },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  statValue: { ...typography.label, color: colors.black, textAlign: 'center' },
  statLabel: { ...typography.caption, color: colors.gray, textAlign: 'center' },
  sectionTitle: {
    ...typography.label,
    color: colors.black,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.grayLight,
    marginBottom: spacing.md,
    overflow: 'hidden',
    ...shadows.sm,
  },
  premiumBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.black,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  premiumBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  premiumBannerIcon: { fontSize: 28 },
  premiumBannerTitle: { ...typography.label, color: colors.white },
  premiumBannerSub: { ...typography.caption, color: 'rgba(255,255,255,0.65)', marginTop: 2 },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: '#FFF5F5',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  errorRowText: { ...typography.caption, color: colors.accent, flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface,
  },
  rowLabel: { ...typography.bodyMd, color: colors.black, flex: 1 },
  rowValue: { ...typography.caption, color: colors.gray, maxWidth: 120, textAlign: 'right' },
});
