import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import { ActivityCreate } from '../types';
import ApiService from '../services/api';
import { theme } from '../theme';

interface AddActivityScreenProps {
  navigation: any;
  route: any;
}

const AddActivityScreen: React.FC<AddActivityScreenProps> = ({ navigation, route }) => {
  const selectedDate = route.params?.selectedDate || new Date().toISOString().split('T')[0];

  const [activity, setActivity] = useState<ActivityCreate>({
    title: '',
    description: '',
    start_time: new Date(selectedDate + 'T09:00:00').toISOString(),
    end_time: new Date(selectedDate + 'T10:00:00').toISOString(),
    status: 'scheduled',
  });

  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleCreateActivity = async () => {
    if (!activity.title.trim()) {
      Alert.alert('Error', 'Please enter a title for the activity');
      return;
    }

    const startTime = new Date(activity.start_time);
    const endTime = new Date(activity.end_time);

    if (endTime <= startTime) {
      Alert.alert('Error', 'End time must be after start time');
      return;
    }

    setIsLoading(true);
    try {
      // Check for duplicate titles by fetching all activities
      const existingActivities = await ApiService.getActivities();
      const duplicateTitle = existingActivities.find(
        (existingActivity: any) => existingActivity.title.toLowerCase() === activity.title.trim().toLowerCase()
      );

      if (duplicateTitle) {
        Alert.alert('Duplicate Activity', `An activity with the title "${activity.title}" already exists. Please use a different title.`);
        setIsLoading(false);
        return;
      }

      // Create the activity
      await ApiService.createActivity(activity);

      // Show success message and navigate to Home
      Alert.alert('Success', 'Activity created successfully!', [
        { text: 'OK', onPress: () => navigation.navigate('Home') }
      ]);
    } catch (error: any) {
      console.error('Error creating activity:', error);
      const errorMessage = error?.response?.data?.detail || 'Failed to create activity';
      Alert.alert('Error', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const onStartTimeChange = (event: any, selectedDate?: Date) => {
    setShowStartPicker(Platform.OS === 'ios');
    if (selectedDate) {
      setActivity({ ...activity, start_time: selectedDate.toISOString() });
    }
  };

  const onEndTimeChange = (event: any, selectedDate?: Date) => {
    setShowEndPicker(Platform.OS === 'ios');
    if (selectedDate) {
      setActivity({ ...activity, end_time: selectedDate.toISOString() });
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Activity</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.form}>
        <View style={styles.formGroup}>
          <Text style={styles.label}>Title *</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter activity title"
            placeholderTextColor={theme.colors.textLight}
            value={activity.title}
            onChangeText={(text) => setActivity({ ...activity, title: text })}
            multiline={false}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Enter activity description (optional)"
            placeholderTextColor={theme.colors.textLight}
            value={activity.description}
            onChangeText={(text) => setActivity({ ...activity, description: text })}
            multiline={true}
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Start Time</Text>
          <TouchableOpacity
            style={styles.dateTimeButton}
            onPress={() => setShowStartPicker(true)}
          >
            <Ionicons name="time-outline" size={20} color={theme.colors.textSecondary} />
            <Text style={styles.dateTimeText}>
              {formatDateTime(activity.start_time)}
            </Text>
          </TouchableOpacity>
        </View>

        {showStartPicker && (
          <DateTimePicker
            value={new Date(activity.start_time)}
            mode="datetime"
            is24Hour={false}
            display="default"
            onChange={onStartTimeChange}
          />
        )}

        <View style={styles.formGroup}>
          <Text style={styles.label}>End Time</Text>
          <TouchableOpacity
            style={styles.dateTimeButton}
            onPress={() => setShowEndPicker(true)}
          >
            <Ionicons name="time-outline" size={20} color={theme.colors.textSecondary} />
            <Text style={styles.dateTimeText}>
              {formatDateTime(activity.end_time)}
            </Text>
          </TouchableOpacity>
        </View>

        {showEndPicker && (
          <DateTimePicker
            value={new Date(activity.end_time)}
            mode="datetime"
            is24Hour={false}
            display="default"
            onChange={onEndTimeChange}
          />
        )}

        <View style={styles.formGroup}>
          <Text style={styles.label}>Status</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={activity.status}
              onValueChange={(itemValue) =>
                setActivity({ ...activity, status: itemValue })
              }
              style={styles.picker}
            >
              <Picker.Item label="Scheduled" value="scheduled" />
              <Picker.Item label="Completed" value="completed" />
              <Picker.Item label="Cancelled" value="cancelled" />
            </Picker>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.createButton, isLoading && styles.buttonDisabled]}
          onPress={handleCreateActivity}
          disabled={isLoading}
        >
          <Text style={styles.createButtonText}>
            {isLoading ? 'Creating...' : 'Create Activity'}
          </Text>
        </TouchableOpacity>
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
  form: {
    padding: 20,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: theme.colors.text,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  dateTimeButton: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dateTimeText: {
    fontSize: 16,
    color: theme.colors.text,
  },
  pickerContainer: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
  },
  picker: {
    height: 50,
  },
  createButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 15,
    borderRadius: theme.borderRadius.md,
    marginTop: 20,
  },
  buttonDisabled: {
    backgroundColor: theme.colors.primaryLight,
  },
  createButtonText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default AddActivityScreen;
