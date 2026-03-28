/**
 * PersonalDetailsScreen — Fitsi AI style with Goal Weight card + field list with checkmarks
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { typography, spacing, radius, useThemeColors } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { getOnboardingProfile, updateProfile } from '../../services/onboarding.service';
import { OnboardingProfileRead } from '../../types';
import { haptics } from '../../hooks/useHaptics';

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
  const [stepGoal, setStepGoal] = useState(10000);
  const [showDateModal, setShowDateModal] = useState(false);
  const [tempDate, setTempDate] = useState(new Date(1990, 0, 1));

  const handleUpdateField = async (field: string, value: any) => {
    haptics.success();
    try {
      await updateProfile({ [field]: value });
      setProfile((prev) => prev ? { ...prev, [field]: value } : prev);
    } catch {
      Alert.alert('Error', 'No se pudo actualizar. Intenta de nuevo.');
    }
  };

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
      onPress: () => {
        setTempDate(profile?.birth_date ? new Date(profile.birth_date) : new Date(1990, 0, 1));
        setShowDateModal(true);
      },
    },
    {
      label: 'Gender',
      value: genderLabel,
      hasValue: !!profile?.gender,
      onPress: () => {
        Alert.alert('Genero', 'Selecciona tu genero:', [
          { text: 'Male', onPress: () => handleUpdateField('gender', 'male') },
          { text: 'Female', onPress: () => handleUpdateField('gender', 'female') },
          { text: 'Other', onPress: () => handleUpdateField('gender', 'other') },
          { text: 'Cancelar', style: 'cancel' },
        ]);
      },
    },
    {
      label: 'Daily step goal',
      value: `${stepGoal} steps`,
      hasValue: true,
      onPress: () => {
        Alert.alert('Meta de pasos', 'Selecciona tu meta diaria:', [
          { text: '5,000', onPress: () => setStepGoal(5000) },
          { text: '7,500', onPress: () => setStepGoal(7500) },
          { text: '10,000', onPress: () => setStepGoal(10000) },
          { text: '15,000', onPress: () => setStepGoal(15000) },
          { text: 'Cancelar', style: 'cancel' },
        ]);
      },
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
        bounces={true}
        overScrollMode="never"
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
                      <View style={[styles.checkCircle, { backgroundColor: c.success }]}>
                        <Ionicons name="checkmark" size={14} color={c.white} />
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

      {/* Date picker modal with scroll day/month/year */}
      <Modal visible={showDateModal} transparent animationType="slide">
        <View style={styles.dateModalOverlay}>
          <View style={[styles.dateModalContent, { backgroundColor: c.surface }]}>
            <View style={styles.dateModalHeader}>
              <TouchableOpacity onPress={() => setShowDateModal(false)}>
                <Text style={[styles.dateModalBtn, { color: c.gray }]}>Cancelar</Text>
              </TouchableOpacity>
              <Text style={[styles.dateModalTitle, { color: c.black }]}>Fecha de nacimiento</Text>
              <TouchableOpacity onPress={() => {
                const iso = tempDate.toISOString().split('T')[0];
                handleUpdateField('birth_date', iso);
                setShowDateModal(false);
              }}>
                <Text style={[styles.dateModalBtn, { color: c.accent }]}>Guardar</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={tempDate}
              mode="date"
              display="spinner"
              maximumDate={new Date()}
              minimumDate={new Date(1920, 0, 1)}
              onChange={(_, date) => { if (date) setTempDate(date); }}
              themeVariant="dark"
              style={{ height: 200 }}
            />
          </View>
        </View>
      </Modal>
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
    color: '#FFFFFF',
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
  dateModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  dateModalContent: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingBottom: spacing.xl,
  },
  dateModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  dateModalTitle: {
    ...typography.bodyMd,
    fontWeight: '600',
  },
  dateModalBtn: {
    ...typography.bodyMd,
    fontWeight: '600',
  },
});
