import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import { Activity } from '../types';
import ApiService from '../services/api';
import { theme } from '../theme';

interface CalendarScreenProps {
  navigation: any;
}

const CalendarScreen: React.FC<CalendarScreenProps> = ({ navigation }) => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [markedDates, setMarkedDates] = useState<any>({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchActivities();
    fetchMonthActivities();
  }, []);

  useEffect(() => {
    fetchActivities();
  }, [selectedDate]);

  const fetchActivities = async () => {
    setIsLoading(true);
    try {
      const startOfDay = new Date(selectedDate + 'T00:00:00');
      const endOfDay = new Date(selectedDate + 'T23:59:59');

      const dayActivities = await ApiService.getActivities(
        startOfDay.toISOString(),
        endOfDay.toISOString()
      );
      setActivities(dayActivities);
    } catch (error) {
      console.error('Error fetching activities:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMonthActivities = async () => {
    try {
      const currentDate = new Date();
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

      const monthActivities = await ApiService.getActivities(
        startOfMonth.toISOString(),
        endOfMonth.toISOString()
      );

      const marked: any = {};
      monthActivities.forEach((activity: any) => {
        const activityDate = new Date(activity.start_time).toISOString().split('T')[0];
        if (!marked[activityDate]) {
          marked[activityDate] = { marked: true, dotColor: theme.colors.primary };
        }
      });

      marked[selectedDate] = {
        ...marked[selectedDate],
        selected: true,
        selectedColor: theme.colors.primary,
      };

      setMarkedDates(marked);
    } catch (error) {
      console.error('Error fetching month activities:', error);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const onDayPress = (day: any) => {
    const newMarked = { ...markedDates };

    Object.keys(newMarked).forEach((date) => {
      if (newMarked[date].selected) {
        newMarked[date] = { ...newMarked[date], selected: false };
        delete newMarked[date].selectedColor;
      }
    });

    newMarked[day.dateString] = {
      ...newMarked[day.dateString],
      selected: true,
      selectedColor: theme.colors.primary,
    };

    setMarkedDates(newMarked);
    setSelectedDate(day.dateString);
  };

  const handleDeleteActivity = (activityId: number) => {
    Alert.alert('Delete Activity', 'Are you sure you want to delete this activity?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await ApiService.deleteActivity(activityId);
            fetchActivities();
            fetchMonthActivities();
          } catch (error) {
            Alert.alert('Error', 'Failed to delete activity');
          }
        },
      },
    ]);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return theme.colors.info;
      case 'completed': return theme.colors.success;
      case 'cancelled': return theme.colors.danger;
      default: return theme.colors.textLight;
    }
  };

  const getStatusIcon = (status: string): string => {
    switch (status) {
      case 'scheduled': return 'time-outline';
      case 'completed': return 'checkmark-circle-outline';
      case 'cancelled': return 'close-circle-outline';
      default: return 'ellipse-outline';
    }
  };

  const formattedSelectedDate = new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  const renderActivityItem = ({ item }: { item: Activity }) => (
    <View style={styles.activityCard}>
      <View style={styles.activityContent}>
        <View style={styles.activityTop}>
          <Text style={styles.activityTitle} numberOfLines={1}>{item.title}</Text>
          <TouchableOpacity
            onPress={() => handleDeleteActivity(item.id)}
            style={styles.deleteButton}
          >
            <Ionicons name="trash-outline" size={16} color={theme.colors.danger} />
          </TouchableOpacity>
        </View>
        {item.description && (
          <Text style={styles.activityDescription} numberOfLines={2}>{item.description}</Text>
        )}
        <View style={styles.activityBottom}>
          <View style={styles.timeRow}>
            <Ionicons name="time-outline" size={13} color={theme.colors.textLight} />
            <Text style={styles.activityTime}>
              {formatTime(item.start_time)} - {formatTime(item.end_time)}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '15' }]}>
            <Ionicons name={getStatusIcon(item.status) as any} size={11} color={getStatusColor(item.status)} />
            <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
              {item.status}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Calendar</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('AddActivity', { selectedDate })}
          style={styles.addButton}
        >
          <Ionicons name="add" size={22} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Calendar */}
      <View style={styles.calendarContainer}>
        <Calendar
          current={selectedDate}
          onDayPress={onDayPress}
          markedDates={markedDates}
          theme={{
            backgroundColor: theme.colors.surface,
            calendarBackground: theme.colors.surface,
            textSectionTitleColor: theme.colors.textSecondary,
            selectedDayBackgroundColor: theme.colors.primary,
            selectedDayTextColor: '#ffffff',
            todayTextColor: theme.colors.primary,
            dayTextColor: theme.colors.text,
            textDisabledColor: '#D1D5DB',
            dotColor: theme.colors.primary,
            selectedDotColor: '#ffffff',
            arrowColor: theme.colors.textSecondary,
            monthTextColor: theme.colors.text,
            indicatorColor: theme.colors.primary,
            textDayFontWeight: '400',
            textMonthFontWeight: 'bold',
            textDayHeaderFontWeight: '500',
            textDayFontSize: 15,
            textMonthFontSize: 17,
            textDayHeaderFontSize: 13,
          }}
        />
      </View>

      {/* Activities for Selected Date */}
      <View style={styles.activitiesSection}>
        <View style={styles.dateLabelRow}>
          <Text style={styles.dateLabel}>{formattedSelectedDate}</Text>
          <Text style={styles.activityCount}>
            {activities.length} {activities.length === 1 ? 'activity' : 'activities'}
          </Text>
        </View>

        {isLoading ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Loading...</Text>
          </View>
        ) : activities.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="calendar-outline" size={32} color={theme.colors.textLight} />
            <Text style={styles.emptyText}>No activities for this date</Text>
            <TouchableOpacity
              style={styles.createButton}
              onPress={() => navigation.navigate('AddActivity', { selectedDate })}
            >
              <Ionicons name="add" size={16} color={theme.colors.primary} />
              <Text style={styles.createButtonText}>Create Activity</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={activities}
            renderItem={renderActivityItem}
            keyExtractor={(item) => item.id.toString()}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.activitiesList}
          />
        )}
      </View>
    </View>
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
    paddingVertical: 16,
    paddingTop: 54,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarContainer: {
    backgroundColor: theme.colors.surface,
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingBottom: 8,
  },
  activitiesSection: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  dateLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dateLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
  },
  activityCount: {
    fontSize: 13,
    color: theme.colors.textLight,
    fontWeight: '400',
  },
  activitiesList: {
    paddingBottom: 16,
  },
  activityCard: {
    ...theme.card,
    marginBottom: 10,
    overflow: 'hidden',
  },
  activityContent: {
    padding: 14,
  },
  activityTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  activityTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text,
    flex: 1,
    marginRight: 8,
  },
  deleteButton: {
    padding: 4,
  },
  activityDescription: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: 6,
    fontWeight: '300',
  },
  activityBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  activityTime: {
    fontSize: 13,
    color: theme.colors.textLight,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 30,
  },
  emptyCard: {
    ...theme.card,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 10,
    marginBottom: 14,
    fontWeight: '300',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: theme.borderRadius.sm,
    gap: 6,
  },
  createButtonText: {
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
});

export default CalendarScreen;
