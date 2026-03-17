import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { TextInput, Button, Card } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import {
  Gender,
  ActivityLevelType,
  NutritionGoalType,
  NutritionProfileCreate,
  MacroTargets,
} from '../types';
import ApiService from '../services/api';
import { theme } from '../theme';

interface NutritionProfileScreenProps {
  navigation: any;
}

const GENDERS: { label: string; value: Gender }[] = [
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
  { label: 'Other', value: 'other' },
];

const ACTIVITY_LEVELS: { label: string; value: ActivityLevelType }[] = [
  { label: 'Sedentary', value: 'sedentary' },
  { label: 'Lightly Active', value: 'lightly_active' },
  { label: 'Moderately Active', value: 'moderately_active' },
  { label: 'Very Active', value: 'very_active' },
  { label: 'Extra Active', value: 'extra_active' },
];

const GOALS: { label: string; value: NutritionGoalType; icon: string }[] = [
  { label: 'Lose Weight', value: 'lose_weight', icon: 'trending-down-outline' },
  { label: 'Maintain', value: 'maintain', icon: 'remove-outline' },
  { label: 'Gain Muscle', value: 'gain_muscle', icon: 'trending-up-outline' },
];

const NutritionProfileScreen: React.FC<NutritionProfileScreenProps> = ({ navigation }) => {
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<Gender>('male');
  const [activityLevel, setActivityLevel] = useState<ActivityLevelType>('moderately_active');
  const [goal, setGoal] = useState<NutritionGoalType>('maintain');
  const [targets, setTargets] = useState<MacroTargets | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    setIsLoading(true);
    try {
      const profile = await ApiService.getNutritionProfile();
      if (profile.height_cm) setHeightCm(profile.height_cm.toString());
      if (profile.weight_kg) setWeightKg(profile.weight_kg.toString());
      if (profile.age) setAge(profile.age.toString());
      if (profile.gender) setGender(profile.gender);
      setActivityLevel(profile.activity_level);
      setGoal(profile.goal);
      setTargets({
        target_calories: profile.target_calories,
        target_protein_g: profile.target_protein_g,
        target_carbs_g: profile.target_carbs_g,
        target_fat_g: profile.target_fat_g,
      });
    } catch (error: any) {
      // 404 means no profile yet, that's fine
      if (error?.response?.status !== 404) {
        console.error('Error fetching profile:', error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCalculateTargets = async () => {
    if (!heightCm || !weightKg || !age) {
      Alert.alert('Missing Info', 'Please fill in height, weight, and age to calculate targets.');
      return;
    }

    try {
      const result = await ApiService.calculateTargets(
        parseFloat(heightCm),
        parseFloat(weightKg),
        parseInt(age),
        gender,
        activityLevel,
        goal,
      );
      setTargets(result);
    } catch (error) {
      console.error('Error calculating targets:', error);
      Alert.alert('Error', 'Failed to calculate targets');
    }
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      const profileData: NutritionProfileCreate = {
        height_cm: heightCm ? parseFloat(heightCm) : undefined,
        weight_kg: weightKg ? parseFloat(weightKg) : undefined,
        age: age ? parseInt(age) : undefined,
        gender,
        activity_level: activityLevel,
        goal,
      };

      await ApiService.createOrUpdateNutritionProfile(profileData);
      Alert.alert('Success', 'Nutrition profile saved!', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error: any) {
      console.error('Error saving profile:', error);
      const errorMessage = error?.response?.data?.detail || 'Failed to save profile';
      Alert.alert('Error', errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nutrition Profile</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.content}>
        {/* Body Measurements */}
        <Card style={styles.sectionCard}>
          <Card.Content>
            <Text style={styles.sectionTitle}>Body Measurements</Text>
            <View style={styles.rowInputs}>
              <View style={styles.halfInput}>
                <TextInput
                  mode="outlined"
                  label="Height (cm)"
                  value={heightCm}
                  onChangeText={setHeightCm}
                  keyboardType="decimal-pad"
                  style={styles.input}
                  outlineColor={theme.colors.border}
                  activeOutlineColor={theme.colors.primary}
                />
              </View>
              <View style={styles.halfInput}>
                <TextInput
                  mode="outlined"
                  label="Weight (kg)"
                  value={weightKg}
                  onChangeText={setWeightKg}
                  keyboardType="decimal-pad"
                  style={styles.input}
                  outlineColor={theme.colors.border}
                  activeOutlineColor={theme.colors.primary}
                />
              </View>
            </View>
            <TextInput
              mode="outlined"
              label="Age"
              value={age}
              onChangeText={setAge}
              keyboardType="number-pad"
              style={styles.input}
              outlineColor={theme.colors.border}
              activeOutlineColor={theme.colors.primary}
            />
          </Card.Content>
        </Card>

        {/* Gender */}
        <Card style={styles.sectionCard}>
          <Card.Content>
            <Text style={styles.sectionTitle}>Gender</Text>
            <View style={styles.chipRow}>
              {GENDERS.map((g) => (
                <TouchableOpacity
                  key={g.value}
                  style={[
                    styles.chipButton,
                    gender === g.value && styles.chipButtonActive,
                  ]}
                  onPress={() => setGender(g.value)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      gender === g.value && styles.chipTextActive,
                    ]}
                  >
                    {g.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Card.Content>
        </Card>

        {/* Activity Level */}
        <Card style={styles.sectionCard}>
          <Card.Content>
            <Text style={styles.sectionTitle}>Activity Level</Text>
            {ACTIVITY_LEVELS.map((level) => (
              <TouchableOpacity
                key={level.value}
                style={[
                  styles.listItem,
                  activityLevel === level.value && styles.listItemActive,
                ]}
                onPress={() => setActivityLevel(level.value)}
              >
                <Text
                  style={[
                    styles.listItemText,
                    activityLevel === level.value && styles.listItemTextActive,
                  ]}
                >
                  {level.label}
                </Text>
                {activityLevel === level.value && (
                  <Ionicons name="checkmark" size={20} color={theme.colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </Card.Content>
        </Card>

        {/* Goal */}
        <Card style={styles.sectionCard}>
          <Card.Content>
            <Text style={styles.sectionTitle}>Goal</Text>
            <View style={styles.goalRow}>
              {GOALS.map((g) => (
                <TouchableOpacity
                  key={g.value}
                  style={[
                    styles.goalButton,
                    goal === g.value && styles.goalButtonActive,
                  ]}
                  onPress={() => setGoal(g.value)}
                >
                  <Ionicons
                    name={g.icon as any}
                    size={24}
                    color={goal === g.value ? '#fff' : theme.colors.primary}
                  />
                  <Text
                    style={[
                      styles.goalText,
                      goal === g.value && styles.goalTextActive,
                    ]}
                  >
                    {g.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Card.Content>
        </Card>

        {/* Calculate Targets Button */}
        <Button
          mode="outlined"
          onPress={handleCalculateTargets}
          style={styles.calculateButton}
          textColor={theme.colors.primary}
          contentStyle={styles.buttonContent}
          icon="calculator"
        >
          Calculate Targets
        </Button>

        {/* Calculated Targets Preview */}
        {targets && (
          <Card style={styles.targetsCard}>
            <Card.Content>
              <Text style={styles.sectionTitle}>Your Daily Targets</Text>
              <View style={styles.targetsGrid}>
                <View style={styles.targetItem}>
                  <Text style={styles.targetValue}>{Math.round(targets.target_calories)}</Text>
                  <Text style={styles.targetLabel}>Calories</Text>
                </View>
                <View style={styles.targetItem}>
                  <Text style={[styles.targetValue, { color: theme.colors.protein }]}>
                    {Math.round(targets.target_protein_g)}g
                  </Text>
                  <Text style={styles.targetLabel}>Protein</Text>
                </View>
                <View style={styles.targetItem}>
                  <Text style={[styles.targetValue, { color: theme.colors.carbs }]}>
                    {Math.round(targets.target_carbs_g)}g
                  </Text>
                  <Text style={styles.targetLabel}>Carbs</Text>
                </View>
                <View style={styles.targetItem}>
                  <Text style={[styles.targetValue, { color: theme.colors.fat }]}>
                    {Math.round(targets.target_fat_g)}g
                  </Text>
                  <Text style={styles.targetLabel}>Fat</Text>
                </View>
              </View>
            </Card.Content>
          </Card>
        )}

        {/* Save Button */}
        <Button
          mode="contained"
          onPress={handleSaveProfile}
          loading={isSaving}
          disabled={isSaving}
          style={styles.saveButton}
          buttonColor={theme.colors.primary}
          textColor="#fff"
          contentStyle={styles.buttonContent}
          labelStyle={styles.saveButtonLabel}
        >
          {isSaving ? 'Saving...' : 'Save Profile'}
        </Button>

        <View style={{ height: 40 }} />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 20,
    paddingVertical: 15,
    paddingTop: 54,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  placeholder: {
    width: 32,
  },
  content: {
    padding: 16,
  },
  sectionCard: {
    marginBottom: 12,
    borderRadius: theme.borderRadius.md,
    elevation: 0,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  rowInputs: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 4,
  },
  halfInput: {
    flex: 1,
  },
  input: {
    backgroundColor: theme.colors.surface,
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 10,
  },
  chipButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  chipButtonActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  chipTextActive: {
    color: '#fff',
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  listItemActive: {
    backgroundColor: '#F0FDF4',
  },
  listItemText: {
    fontSize: 15,
    color: theme.colors.textSecondary,
  },
  listItemTextActive: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
  goalRow: {
    flexDirection: 'row',
    gap: 10,
  },
  goalButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    gap: 6,
  },
  goalButtonActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  goalText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  goalTextActive: {
    color: '#fff',
  },
  calculateButton: {
    marginBottom: 12,
    borderRadius: theme.borderRadius.sm,
    borderColor: theme.colors.primary,
  },
  buttonContent: {
    paddingVertical: 4,
  },
  targetsCard: {
    marginBottom: 16,
    borderRadius: theme.borderRadius.md,
    elevation: 0,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  targetsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  targetItem: {
    alignItems: 'center',
  },
  targetValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: theme.colors.text,
    fontVariant: ['tabular-nums'],
  },
  targetLabel: {
    fontSize: 12,
    color: theme.colors.textLight,
    marginTop: 2,
  },
  saveButton: {
    borderRadius: theme.borderRadius.sm,
  },
  saveButtonLabel: {
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default NutritionProfileScreen;
