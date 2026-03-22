import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { Activity, DailySummary } from '../types';
import ApiService from '../services/api';
import CircularProgress from '../components/CircularProgress';
import { theme } from '../theme';
import OfflineBanner from '../components/OfflineBanner';
import { fetchWithCache } from '../services/offlineStore';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

interface HomeScreenProps {
  navigation: any;
}

const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const { user, logout } = useAuth();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [nutritionSummary, setNutritionSummary] = useState<DailySummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFromCache, setIsFromCache] = useState(false);
  const { isConnected } = useNetworkStatus();

  useFocusEffect(
    useCallback(() => {
      fetchTodayData();
    }, [])
  );

  const fetchTodayData = async () => {
    setIsLoading(true);
    try {
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
      const todayStr = today.toISOString().split('T')[0];

      const [activitiesResult, summaryResult] = await Promise.allSettled([
        fetchWithCache<Activity[]>('activities/today', () =>
          ApiService.getActivities(startOfDay.toISOString(), endOfDay.toISOString()),
        ),
        fetchWithCache<DailySummary>('nutrition/summary', () =>
          ApiService.getDailySummary(todayStr),
        ),
      ]);

      let anyFromCache = false;

      if (activitiesResult.status === 'fulfilled') {
        setActivities(activitiesResult.value.data);
        if (activitiesResult.value.fromCache) anyFromCache = true;
      }
      if (summaryResult.status === 'fulfilled') {
        setNutritionSummary(summaryResult.value.data);
        if (summaryResult.value.fromCache) anyFromCache = true;
      }

      setIsFromCache(anyFromCache);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          try {
            await logout();
            setActivities([]);
          } catch (error) {
            console.error('Error during logout:', error);
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'scheduled': return 'time-outline';
      case 'completed': return 'checkmark-circle-outline';
      case 'cancelled': return 'close-circle-outline';
      default: return 'ellipse-outline';
    }
  };

  const caloriesConsumed = nutritionSummary?.total_calories ?? 0;
  const caloriesTarget = nutritionSummary?.target_calories ?? 2000;
  const caloriesProgress = caloriesTarget > 0 ? caloriesConsumed / caloriesTarget : 0;

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <View style={styles.container}>
      <OfflineBanner />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{greeting()},</Text>
          <Text style={styles.userName}>{user?.first_name || 'User'}</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <Ionicons name="log-out-outline" size={22} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={fetchTodayData}
            tintColor={theme.colors.primary}
          />
        }
      >
        {/* Quick Nutrition Overview */}
        <View style={styles.nutritionOverview}>
          <CircularProgress
            size={100}
            strokeWidth={10}
            progress={Math.min(caloriesProgress, 1)}
            color={caloriesProgress > 1 ? theme.colors.danger : caloriesProgress > 0.85 ? theme.colors.warning : theme.colors.primary}
            backgroundColor="#F3F4F6"
          >
            <Text style={styles.ringCalories}>{Math.round(caloriesConsumed)}</Text>
            <Text style={styles.ringLabel}>kcal</Text>
          </CircularProgress>
          <View style={styles.nutritionInfo}>
            <Text style={styles.nutritionTitle}>Today's Nutrition</Text>
            <Text style={styles.nutritionSubtitle}>
              {Math.round(caloriesConsumed)} / {Math.round(caloriesTarget)} kcal
            </Text>
            <View style={styles.macroRow}>
              <View style={styles.macroPill}>
                <View style={[styles.macroDot, { backgroundColor: theme.colors.protein }]} />
                <Text style={styles.macroText}>P {Math.round(nutritionSummary?.total_protein_g ?? 0)}g</Text>
              </View>
              <View style={styles.macroPill}>
                <View style={[styles.macroDot, { backgroundColor: theme.colors.carbs }]} />
                <Text style={styles.macroText}>C {Math.round(nutritionSummary?.total_carbs_g ?? 0)}g</Text>
              </View>
              <View style={styles.macroPill}>
                <View style={[styles.macroDot, { backgroundColor: theme.colors.fat }]} />
                <Text style={styles.macroText}>F {Math.round(nutritionSummary?.total_fats_g ?? 0)}g</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate('Nutrition')}
          >
            <Ionicons name="leaf-outline" size={22} color={theme.colors.primary} />
            <Text style={styles.actionLabel}>Nutrition</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate('Calendar')}
          >
            <Ionicons name="calendar-outline" size={22} color={theme.colors.info} />
            <Text style={styles.actionLabel}>Calendar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate('MealLog')}
          >
            <Ionicons name="restaurant-outline" size={22} color={theme.colors.warning} />
            <Text style={styles.actionLabel}>Log Meal</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate('AddActivity')}
          >
            <Ionicons name="add-outline" size={22} color="#EC4899" />
            <Text style={styles.actionLabel}>Activity</Text>
          </TouchableOpacity>
        </View>

        {/* Today's Activities */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Today's Activities</Text>
          <TouchableOpacity onPress={fetchTodayData}>
            <Ionicons name="refresh-outline" size={18} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Loading...</Text>
          </View>
        ) : activities.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="calendar-outline" size={36} color={theme.colors.textLight} />
            <Text style={styles.emptyText}>No activities for today</Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => navigation.navigate('AddActivity')}
            >
              <Text style={styles.emptyButtonText}>Add Activity</Text>
            </TouchableOpacity>
          </View>
        ) : (
          activities.slice(0, 5).map((item) => (
            <View key={item.id} style={styles.activityCard}>
              <View style={styles.activityContent}>
                <View style={styles.activityTop}>
                  <Text style={styles.activityTitle} numberOfLines={1}>{item.title}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '15' }]}>
                    <Ionicons name={getStatusIcon(item.status) as any} size={12} color={getStatusColor(item.status)} />
                    <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>{item.status}</Text>
                  </View>
                </View>
                {item.description && (
                  <Text style={styles.activityDescription} numberOfLines={1}>{item.description}</Text>
                )}
                <View style={styles.activityTimeRow}>
                  <Ionicons name="time-outline" size={13} color={theme.colors.textLight} />
                  <Text style={styles.activityTime}>
                    {formatTime(item.start_time)} - {formatTime(item.end_time)}
                  </Text>
                </View>
              </View>
            </View>
          ))
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
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
    paddingVertical: 20,
    paddingTop: 54,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  greeting: {
    fontSize: 15,
    color: theme.colors.textSecondary,
    fontWeight: '300',
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginTop: 2,
  },
  logoutButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  nutritionOverview: {
    ...theme.card,
    flexDirection: 'row',
    padding: 16,
    alignItems: 'center',
    gap: 16,
    marginBottom: 24,
  },
  ringCalories: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
    fontVariant: ['tabular-nums'],
  },
  ringLabel: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    marginTop: -2,
  },
  nutritionInfo: {
    flex: 1,
  },
  nutritionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  nutritionSubtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  macroRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  macroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  macroDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  macroText: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 28,
  },
  actionCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: theme.borderRadius.md,
    gap: 8,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  emptyState: {
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
  emptyButton: {
    borderWidth: 1,
    borderColor: theme.colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: theme.borderRadius.sm,
  },
  emptyButtonText: {
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: '600',
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
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  activityDescription: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: 4,
    fontWeight: '300',
  },
  activityTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  activityTime: {
    fontSize: 12,
    color: theme.colors.textLight,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
});

export default HomeScreen;
