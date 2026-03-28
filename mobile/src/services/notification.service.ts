/**
 * notification.service.ts -- Smart Notifications service
 *
 * Responsibilities:
 * 1. Register / unregister Expo push tokens with the backend
 * 2. Configure foreground notification handling
 * 3. Handle notification deep-linking (tap -> navigate to screen)
 * 4. Schedule local notifications as fallback (offline mode)
 * 5. Sync notification preferences with the backend
 * 6. Evaluate and schedule local reminders from predicted meal times
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';
import { showNotification } from '../components/InAppNotification';

/**
 * Helper to build a daily trigger input. The expo-notifications SchedulableTriggerInputTypes.DAILY
 * type requires channelId on Android in strict mode, but the SDK fills it with the default channel
 * when not provided. This helper casts through unknown to satisfy the compiler while preserving
 * runtime correctness.
 */
function dailyTrigger(
  hour: number,
  minute: number,
): Notifications.NotificationTriggerInput {
  return {
    type: Notifications.SchedulableTriggerInputTypes.DAILY,
    hour,
    minute,
  } as unknown as Notifications.NotificationTriggerInput;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface NotificationPreferences {
  notifications_enabled: boolean;
  meal_reminders_enabled: boolean;
  breakfast_reminder_hour: number;
  breakfast_reminder_minute: number;
  lunch_reminder_hour: number;
  lunch_reminder_minute: number;
  dinner_reminder_hour: number;
  dinner_reminder_minute: number;
  snack_reminder_hour: number;
  snack_reminder_minute: number;
  use_predicted_times: boolean;
  reminder_lead_minutes: number;
  evening_summary_enabled: boolean;
  evening_summary_hour: number;
  evening_summary_minute: number;
  streak_alerts_enabled: boolean;
  streak_risk_hour: number;
  streak_risk_minute: number;
  streak_celebrations_enabled: boolean;
  inactivity_nudge_enabled: boolean;
  inactivity_days_threshold: number;
  water_reminders_enabled: boolean;
  water_reminder_interval_hours: number;
}

const DEFAULT_PREFS: NotificationPreferences = {
  notifications_enabled: true,
  meal_reminders_enabled: true,
  breakfast_reminder_hour: 8,
  breakfast_reminder_minute: 0,
  lunch_reminder_hour: 13,
  lunch_reminder_minute: 0,
  dinner_reminder_hour: 19,
  dinner_reminder_minute: 0,
  snack_reminder_hour: 16,
  snack_reminder_minute: 0,
  use_predicted_times: true,
  reminder_lead_minutes: 15,
  evening_summary_enabled: true,
  evening_summary_hour: 21,
  evening_summary_minute: 0,
  streak_alerts_enabled: true,
  streak_risk_hour: 18,
  streak_risk_minute: 0,
  streak_celebrations_enabled: true,
  inactivity_nudge_enabled: true,
  inactivity_days_threshold: 2,
  water_reminders_enabled: false,
  water_reminder_interval_hours: 2,
};

export interface NotificationIntent {
  type: string;
  title: string;
  body: string;
  scheduled_for: string | null;
  data: Record<string, unknown>;
  priority: number;
}

export interface EvaluateResponse {
  notifications_enabled: boolean;
  intents: NotificationIntent[];
  count: number;
}

export interface MealTimePrediction {
  meal_type: string;
  predicted_time: string | null;
}

// ─── Notification channel configuration ─────────────────────────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ─── Allowed deep-link screen names (whitelist) ─────────────────────────────
// SEC: Only navigate to known screens from notification data to prevent
// arbitrary navigation injection.

const ALLOWED_NOTIFICATION_SCREENS = new Set([
  // Home stack
  'HomeMain', 'Achievements', 'Reports', 'Coach', 'MealPlan',
  'Challenges', 'Scan', 'Barcode', 'Recipes', 'RecipeDetail',
  'Favorites', 'RiskDetail', 'ShoppingList', 'AchievementShowcase',
  'RewardsShop', 'MealBrowser', 'CalorieAdjustment', 'Paywall',
  // Log stack
  'LogMain', 'AddFood', 'EditFood', 'History', 'FoodSearch', 'CalendarView',
  // Profile stack
  'ProfileMain', 'EditProfile', 'WeightTracking', 'Settings',
  'PersonalDetails', 'FamilyPlan', 'RingColors', 'Language',
  'TrackingReminders', 'NotificationPreferences', 'Referral',
  'NutritionGoals', 'PDFReport', 'WidgetGuide', 'Help', 'Workouts',
  'PrivacyPolicy', 'TermsOfService', 'About',
  // Tab screens
  'Inicio', 'Registro', 'Progress', 'Groups', 'Community', 'Perfil',
  // Scan stack
  'Scan',
  // Recipes stack
  'Recipes',
]);

function isAllowedScreen(screen: string): boolean {
  return ALLOWED_NOTIFICATION_SCREENS.has(screen);
}

/** Shape of the `data` field in notification content. */
interface NotificationData {
  type?: string;
  screen?: string;
  params?: Record<string, unknown>;
  meal_type?: string;
  [key: string]: unknown;
}

// ─── Navigation reference (set by AppNavigator) ────────────────────────────

/** Minimal navigation interface to avoid importing the full navigation package. */
interface NavigationRef {
  navigate(screen: string, params?: Record<string, unknown>): void;
}

let _navigationRef: NavigationRef | null = null;

export function setNavigationRef(ref: NavigationRef): void {
  _navigationRef = ref;
}

// ─── Push token registration ────────────────────────────────────────────────

/**
 * Request push notification permissions and register the Expo push token
 * with the backend. Returns the token string if successful, null otherwise.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return null;
  }

  if (!Device.isDevice) {
    console.warn('[Notifications] Must use physical device for push notifications');
    return null;
  }

  // Check / request permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('[Notifications] Permission not granted');
    return null;
  }

  // Get Expo push token
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    // Skip push token registration when projectId is missing or placeholder
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!projectId || !uuidRegex.test(projectId)) {
      console.warn('[Notifications] No valid EAS projectId configured — skipping push token registration');
      return null;
    }
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    const token = tokenData.data;

    // Register with backend
    await registerTokenWithBackend(token);

    // Set up Android notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Fitsi',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#4285F4',
        sound: 'default',
      });

      await Notifications.setNotificationChannelAsync('meal-reminders', {
        name: 'Recordatorios de comida',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
      });

      await Notifications.setNotificationChannelAsync('streaks', {
        name: 'Rachas y logros',
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: 'default',
      });
    }

    return token;
  } catch (error) {
    console.error('[Notifications] Failed to get push token:', error);
    return null;
  }
}

/**
 * Register the push token with the Fitsi backend.
 */
async function registerTokenWithBackend(token: string): Promise<void> {
  try {
    await api.post('/api/notifications/register', {
      token,
      platform: Platform.OS,
    });
    console.log('[Notifications] Token registered with backend');
  } catch (error) {
    console.error('[Notifications] Failed to register token with backend:', error);
  }
}

/**
 * Unregister the push token from the backend (logout / disable notifications).
 */
export async function unregisterPushToken(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!projectId || !uuidRegex.test(projectId)) return;
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    await api.delete('/api/notifications/unregister', {
      data: { token: tokenData.data, platform: Platform.OS },
    });
    console.log('[Notifications] Token unregistered from backend');
  } catch (error) {
    console.error('[Notifications] Failed to unregister token:', error);
  }
}

// ─── Foreground notification listener ───────────────────────────────────────

let _foregroundSubscription: Notifications.Subscription | null = null;
let _responseSubscription: Notifications.Subscription | null = null;

/**
 * Start listening for foreground notifications and tap responses.
 * Call once at app startup (e.g., in AppNavigator).
 */
export function startNotificationListeners(): () => void {
  // Foreground: show in-app banner
  _foregroundSubscription = Notifications.addNotificationReceivedListener(
    (notification) => {
      const { title, body } = notification.request.content;
      const data = notification.request.content.data as NotificationData | undefined;

      // Show in-app notification banner
      showNotification({
        message: body ?? title ?? 'Nueva notificacion',
        type: _mapNotificationType(data?.type),
        icon: _mapNotificationIcon(data?.type),
        duration: 4000,
      });
    },
  );

  // Response: user tapped the notification -> navigate to screen
  _responseSubscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response.notification.request.content.data as NotificationData | undefined;
      if (data?.screen && _navigationRef) {
        if (!isAllowedScreen(data.screen)) {
          console.warn('[Notifications] Blocked navigation to unknown screen:', data.screen);
          return;
        }
        try {
          _navigationRef.navigate(data.screen, data.params ?? {});
        } catch (error) {
          console.warn('[Notifications] Failed to navigate to screen:', data.screen, error);
        }
      }
    },
  );

  return () => {
    _foregroundSubscription?.remove();
    _responseSubscription?.remove();
    _foregroundSubscription = null;
    _responseSubscription = null;
  };
}

/**
 * Check if a notification was tapped while the app was killed (cold start).
 * Call after navigation is ready.
 */
export async function handleInitialNotification(): Promise<void> {
  const response = await Notifications.getLastNotificationResponseAsync();
  if (response) {
    const data = response.notification.request.content.data as NotificationData | undefined;
    if (data?.screen && _navigationRef) {
      if (!isAllowedScreen(data.screen)) {
        console.warn('[Notifications] Blocked initial navigation to unknown screen:', data.screen);
        return;
      }
      // Small delay to ensure navigation is mounted
      setTimeout(() => {
        try {
          _navigationRef.navigate(data.screen, data.params ?? {});
        } catch (error) {
          console.warn('[Notifications] Failed to handle initial notification:', error);
        }
      }, 500);
    }
  }
}

// ─── In-app notification type mapping ───────────────────────────────────────

function _mapNotificationType(type?: string): 'success' | 'info' | 'warning' {
  switch (type) {
    case 'streak_celebration':
      return 'success';
    case 'streak_at_risk':
    case 'inactivity_reengagement':
      return 'warning';
    default:
      return 'info';
  }
}

function _mapNotificationIcon(type?: string): string {
  switch (type) {
    case 'meal_reminder':
      return 'restaurant';
    case 'evening_summary':
      return 'stats-chart';
    case 'streak_at_risk':
      return 'flame';
    case 'streak_celebration':
      return 'trophy';
    case 'inactivity_nudge':
      return 'time';
    case 'inactivity_reengagement':
      return 'heart';
    default:
      return 'notifications';
  }
}

// ─── Backend API calls ──────────────────────────────────────────────────────

/**
 * Get user's notification preferences from backend.
 */
export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  try {
    const response = await api.get('/api/smart-notifications/preferences');
    return response.data;
  } catch {
    // Backend not available — load from local storage or return defaults
    const stored = await AsyncStorage.getItem('@fitsi_notification_prefs');
    if (stored) return JSON.parse(stored);
    return DEFAULT_PREFS;
  }
}

/**
 * Update user's notification preferences. Saves locally and attempts backend sync.
 */
export async function updateNotificationPreferences(
  updates: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  // Always save locally first
  const stored = await AsyncStorage.getItem('@fitsi_notification_prefs');
  const current: NotificationPreferences = stored ? JSON.parse(stored) : DEFAULT_PREFS;
  const merged = { ...current, ...updates };
  await AsyncStorage.setItem('@fitsi_notification_prefs', JSON.stringify(merged));

  // Try to sync with backend (best-effort)
  try {
    const response = await api.put('/api/smart-notifications/preferences', updates);
    return response.data;
  } catch {
    return merged;
  }
}

/**
 * Evaluate smart notifications (returns intents without sending).
 */
export async function evaluateNotifications(): Promise<EvaluateResponse> {
  const response = await api.get('/api/smart-notifications/evaluate');
  return response.data;
}

/**
 * Get predicted meal times based on user's logging patterns.
 */
export async function getPredictedMealTimes(): Promise<MealTimePrediction[]> {
  const response = await api.get('/api/smart-notifications/meal-times');
  return response.data.predictions;
}

/**
 * Send a test push notification.
 */
export async function sendTestNotification(
  title?: string,
  body?: string,
): Promise<void> {
  const testTitle = title ?? 'Test Fitsi';
  const testBody = body ?? 'Esta es una notificacion de prueba desde Fitsi IA';

  try {
    await api.post('/api/smart-notifications/send-test', {
      title: testTitle,
      body: testBody,
      notification_type: 'test',
    });
  } catch {
    // Backend unavailable — send local notification instead
    if (Platform.OS !== 'web') {
      await Notifications.scheduleNotificationAsync({
        content: { title: testTitle, body: testBody, sound: true },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 2 } as any,
      });
    }
  }
}

/**
 * Trigger evaluation + dispatch of smart notifications from backend.
 */
export async function dispatchNotifications(): Promise<{
  intents_count: number;
  tickets_count: number;
}> {
  const response = await api.post('/api/smart-notifications/dispatch');
  return response.data;
}

// ─── Local notification scheduling (offline fallback) ───────────────────────

/**
 * Schedule local notifications based on user preferences.
 * This serves as a fallback when the backend push system is unavailable.
 * Should be called after preferences change or on app launch.
 */
export async function scheduleLocalNotifications(
  prefs: NotificationPreferences,
): Promise<void> {
  if (Platform.OS === 'web') return;

  // Cancel all existing scheduled notifications
  await Notifications.cancelAllScheduledNotificationsAsync();

  if (!prefs.notifications_enabled) return;

  // Schedule meal reminders
  if (prefs.meal_reminders_enabled && !prefs.use_predicted_times) {
    const meals = [
      { key: 'breakfast', label: 'desayuno', hour: prefs.breakfast_reminder_hour, minute: prefs.breakfast_reminder_minute },
      { key: 'lunch', label: 'almuerzo', hour: prefs.lunch_reminder_hour, minute: prefs.lunch_reminder_minute },
      { key: 'dinner', label: 'cena', hour: prefs.dinner_reminder_hour, minute: prefs.dinner_reminder_minute },
      { key: 'snack', label: 'snack', hour: prefs.snack_reminder_hour, minute: prefs.snack_reminder_minute },
    ];

    for (const meal of meals) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Fitsi IA',
          body: `Ya ${meal.label}aste? No olvides registrar tu ${meal.label}`,
          data: { type: 'meal_reminder', meal_type: meal.key, screen: 'LogMain' },
          sound: 'default',
        },
        trigger: dailyTrigger(meal.hour, meal.minute),
      });
    }
  }

  // Schedule evening summary reminder
  if (prefs.evening_summary_enabled) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Fitsi IA',
        body: 'Revisa tu resumen del dia y cierra fuerte',
        data: { type: 'evening_summary', screen: 'HomeMain' },
        sound: 'default',
      },
      trigger: dailyTrigger(prefs.evening_summary_hour, prefs.evening_summary_minute),
    });
  }

  // Schedule streak risk alert
  if (prefs.streak_alerts_enabled) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Fitsi IA',
        body: 'No has registrado comida hoy. Tu racha puede estar en riesgo!',
        data: { type: 'streak_at_risk', screen: 'LogMain' },
        sound: 'default',
      },
      trigger: dailyTrigger(prefs.streak_risk_hour, prefs.streak_risk_minute),
    });
  }
}

/**
 * Schedule local notifications using predicted meal times from the backend.
 * Called when the app has connectivity and can fetch predictions.
 */
export async function scheduleFromPredictedTimes(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const prefs = await getNotificationPreferences();
    if (!prefs.notifications_enabled || !prefs.meal_reminders_enabled) return;

    if (prefs.use_predicted_times) {
      const predictions = await getPredictedMealTimes();

      // Cancel meal-related local notifications
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      for (const notif of scheduled) {
        const data = notif.content.data as NotificationData | undefined;
        if (data?.type === 'meal_reminder') {
          await Notifications.cancelScheduledNotificationAsync(notif.identifier);
        }
      }

      // Schedule from predictions
      const mealLabels: Record<string, string> = {
        breakfast: 'desayuno',
        lunch: 'almuerzo',
        dinner: 'cena',
        snack: 'snack',
      };

      for (const pred of predictions) {
        if (!pred.predicted_time) continue;

        const [hourStr, minStr] = pred.predicted_time.split(':');
        const predHour = parseInt(hourStr, 10);
        const predMinute = parseInt(minStr, 10);

        // Schedule reminder_lead_minutes before predicted time
        let reminderHour = predHour;
        let reminderMinute = predMinute - prefs.reminder_lead_minutes;
        if (reminderMinute < 0) {
          reminderMinute += 60;
          reminderHour = (reminderHour - 1 + 24) % 24;
        }

        const label = mealLabels[pred.meal_type] ?? pred.meal_type;

        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Fitsi IA',
            body: `Ya ${label}aste? No olvides registrar tu ${label}`,
            data: {
              type: 'meal_reminder',
              meal_type: pred.meal_type,
              screen: 'LogMain',
            },
            sound: 'default',
          },
          trigger: dailyTrigger(reminderHour, reminderMinute),
        });
      }
    } else {
      // Use manual schedule
      await scheduleLocalNotifications(prefs);
    }
  } catch (error) {
    console.error('[Notifications] Failed to schedule from predicted times:', error);
  }
}

// ─── Initialization (call once at app startup) ─────────────────────────────

/**
 * Full notification initialization sequence.
 * Registers push token, sets up listeners, schedules local fallbacks.
 */
export async function initializeNotifications(): Promise<void> {
  const token = await registerForPushNotifications();
  if (!token) return;

  // Schedule local notifications as fallback
  try {
    await scheduleFromPredictedTimes();
  } catch (error) {
    console.warn('[Notifications] Failed to schedule local notifications:', error);
  }
}
