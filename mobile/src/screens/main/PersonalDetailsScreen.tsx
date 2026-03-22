/**
 * PersonalDetailsScreen — Cal AI style with Goal Weight card + field list with checkmarks
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
import { colors, typography, spacing, radius, useThemeColors } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { getOnboardingProfile } from '../../services/onboarding.service';
import { OnboardingProfileRead } from '../../types';

const GENDER_LABELS: Record<string, string> = {
  male: 'Male',
  female: 'Female',
  other: 'Other',
};

interface DetailField {
  label: string;
  value: string;
  hasValue: boolean;
  onPress?: () => void;
}

export default function PersonalDetailsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const c = useThemeColors();

  const [profile, setProfile] = useState<OnboardingProfileRead | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getOnboardingProfile()
      .then(setProfile)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const targetWeight = profile?.target_weight_kg ?? 70;
  const currentWeight = profile?.weight_kg ?? 80;
  const heightCm = profile?.height_cm ?? 175;

  const birthDateFormatted = profile?.birth_date
    ? new Date(profile.birth_date).toLocaleDateString('en-US', {
        month: 'numeric',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  const genderLabel = GENDER_LABELS[profile?.gender ?? ''] ?? '';

  const fields: DetailField[] = [
    {
      label: 'Current weight',
      value: `${currentWeight} kg`,
      hasValue: !!profile?.weight_kg,
      onPress: () => navigation.navigate('WeightTracking'),
    },
    {
      label: 'Height',
      value: `${heightCm} cm`,
      hasValue: !!profile?.height_cm,
      onPress: () => {},
    },
    {
      label: 'Date of birth',
      value: birthDateFormatted,
      hasValue: !!profile?.birth_date,
      onPress: () => {},
    },
    {
      label: 'Gender',
      value: genderLabel,
      hasValue: !!profile?.gender,
      onPress: () => {},
    },
    {
      label: 'Daily step goal',
      value: '10000 steps',
      hasValue: true,
      onPress: () => {},
    },
  ];

  const handleChangeGoal = () => {
    Alert.alert('Change Goal', 'Goal weight editor coming soon!');
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: c.bg, borderBottomColor: c.grayLight }]}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: c.surface }]}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={20} color={c.black} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.black }]}>Personal Details</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {loading ? (
          <ActivityIndicator size="small" color={c.accent} style={{ marginTop: spacing.xl }} />
        ) : (
          <>
            {/* Goal Weight Card */}
            <View style={[styles.goalCard, { backgroundColor: c.surface }]}>
              <Text style={[styles.goalLabel, { color: c.gray }]}>Goal Weight</Text>
              <Text style={[styles.goalValue, { color: c.black }]}>{targetWeight} kg</Text>
              <TouchableOpacity
                style={[styles.changeGoalBtn, { backgroundColor: c.accent }]}
                onPress={handleChangeGoal}
                activeOpacity={0.8}
              >
                <Text style={styles.changeGoalText}>Change Goal</Text>
              </TouchableOpacity>
            </View>

            {/* Details list */}
            <View style={[styles.listCard, { backgroundColor: c.surface }]}>
              {fields.map((field, index) => (
                <TouchableOpacity
                  key={field.label}
                  style={[
                    styles.fieldRow,
                    index < fields.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.grayLight },
                  ]}
                  onPress={field.onPress}
                  activeOpacity={0.7}
                >
                  <View style={styles.fieldLeft}>
                    <Text style={[styles.fieldLabel, { color: c.black }]}>{field.label}</Text>
                    {field.value ? (
                      <Text style={[styles.fieldValue, { color: c.gray }]}>{field.value}</Text>
                    ) : null}
                  </View>
                  <View style={styles.fieldRight}>
                    {field.hasValue && (
                      <View style={styles.checkCircle}>
                        <Ionicons name="checkmark" size={14} color={colors.white} />
                      </View>
                    )}
                    <Ionicons name="chevron-forward" size={16} color={c.disabled} />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </View>
  );
}

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
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { ...typography.titleSm },
  scroll: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
  },

  // Goal Weight Card
  goalCard: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  goalLabel: {
    ...typography.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  goalValue: {
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: -1,
  },
  changeGoalBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
    marginTop: spacing.xs,
  },
  changeGoalText: {
    ...typography.button,
    color: colors.white,
  },

  // Fields list
  listCard: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  fieldLeft: {
    flex: 1,
    gap: 2,
  },
  fieldLabel: {
    ...typography.bodyMd,
    fontWeight: '500',
  },
  fieldValue: {
    ...typography.caption,
  },
  fieldRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#34A853',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
