/**
 * AppNavigator -- Root navigator for Fitsi AI.
 *
 * Responsibilities:
 * 1. NavigationContainer with deep linking configuration
 * 2. Auth/Onboarding/Main flow selection
 * 3. Notification listener setup
 * 4. Offline sync watcher
 * 5. Navigation theme (dark/light) at root level
 */
import React, { useEffect, useRef, useMemo } from 'react';
import {
  NavigationContainer,
  NavigationContainerRef,
  DefaultTheme,
  DarkTheme,
  LinkingOptions,
} from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { useAuth } from '../context/AuthContext';
import { useAppTheme } from '../context/ThemeContext';
import { useThemeColors } from '../theme';
import LoginScreen from '../screens/LoginScreen';
import LoadingScreen from '../components/LoadingScreen';
import ErrorBoundary from '../components/ErrorBoundary';
import OnboardingNavigator from '../screens/onboarding/OnboardingNavigator';
import { OnboardingProvider } from '../context/OnboardingContext';
import MainNavigator from './MainNavigator';
import { startOfflineSyncWatcher, stopOfflineSyncWatcher } from '../services/offlineSync';
import { InAppNotificationHost } from '../components/InAppNotification';
import {
  initializeNotifications,
  startNotificationListeners,
  handleInitialNotification,
  setNavigationRef,
} from '../services/notification.service';

import type { MainTabParamList } from './types';

// ─── Deep linking configuration ─────────────────────────────────────────────
// Maps URL paths to screens for both custom scheme (fitsiai://) and universal
// links. Notification taps use _navigationRef.navigate() directly, but these
// paths cover external deep links (e.g., shared recipes, referral links).

const linking: LinkingOptions<MainTabParamList> = {
  prefixes: [
    'fitsiai://',
    'https://app.fitsiai.com',
    'https://fitsiai.com',
  ],
  config: {
    screens: {
      Inicio: {
        path: 'home',
        screens: {
          HomeMain: '',
          Scan: 'scan',
          Achievements: 'achievements',
          Reports: 'reports',
          Coach: 'coach',
          MealPlan: 'meal-plan',
          Challenges: 'challenges',
          Paywall: 'paywall',
          Recipes: 'recipes',
          RecipeDetail: 'recipe/:id',
          Favorites: 'favorites',
          RiskDetail: 'risk',
          ShoppingList: 'shopping-list',
          AchievementShowcase: 'achievement-showcase',
          RewardsShop: 'rewards',
          MealBrowser: 'meals',
          CalorieAdjustment: 'calorie-adjustment',
          Barcode: 'barcode',
        },
      },
      Registro: {
        path: 'log',
        screens: {
          LogMain: '',
          AddFood: 'add',
          EditFood: 'edit',
          History: 'history',
          FoodSearch: 'search',
          CalendarView: 'calendar',
          Favorites: 'favorites',
        },
      },
      Progress: 'progress',
      Groups: 'groups',
      Community: 'community',
      Perfil: {
        path: 'profile',
        screens: {
          ProfileMain: '',
          Settings: 'settings',
          EditProfile: 'edit',
          WeightTracking: 'weight',
          PersonalDetails: 'details',
          FamilyPlan: 'family',
          RingColors: 'ring-colors',
          Language: 'language',
          TrackingReminders: 'reminders',
          NotificationPreferences: 'notification-preferences',
          Referral: 'referral',
          NutritionGoals: 'nutrition-goals',
          PDFReport: 'pdf-report',
          WidgetGuide: 'widget-guide',
          Help: 'help',
          Workouts: 'workouts',
          Paywall: 'paywall',
          PrivacyPolicy: 'privacy',
          TermsOfService: 'terms',
          About: 'about',
        },
      },
    },
  },
};

// ─── Auth stack -- solo Login (registro ocurre en Step25 del onboarding) ─────

const AuthStack = createStackNavigator();

const AuthNavigator = () => (
  <AuthStack.Navigator screenOptions={{ headerShown: false }}>
    <AuthStack.Screen name="Login" component={LoginScreen} />
  </AuthStack.Navigator>
);

// ─── Inner navigator -- decides which flow to show ──────────────────────────

const AppContent = () => {
  const { isLoading, isAuthenticated, isOnboardingComplete, markOnboardingComplete } = useAuth();

  // Start offline sync watcher when app mounts
  useEffect(() => {
    startOfflineSyncWatcher();
    return () => stopOfflineSyncWatcher();
  }, []);

  // Initialize push notifications when authenticated
  useEffect(() => {
    if (isAuthenticated && isOnboardingComplete) {
      initializeNotifications().catch((err) => {
        console.warn('[AppNavigator] Notification init failed:', err);
      });
    }
  }, [isAuthenticated, isOnboardingComplete]);

  // Start foreground notification listeners
  useEffect(() => {
    const cleanup = startNotificationListeners();
    return cleanup;
  }, []);

  // Wait for AuthContext to load tokens from SecureStore
  if (isLoading) return <LoadingScreen />;

  if (!isOnboardingComplete) {
    return (
      <OnboardingProvider>
        <OnboardingNavigator onComplete={markOnboardingComplete} />
      </OnboardingProvider>
    );
  }

  return isAuthenticated ? <MainNavigator /> : <AuthNavigator />;
};

// ─── Root navigator -- NavigationContainer wraps EVERYTHING ─────────────────

const AppNavigator = () => {
  const navigationRef = useRef<NavigationContainerRef<MainTabParamList>>(null);
  const { isDark } = useAppTheme();
  const c = useThemeColors();

  // Build navigation theme from app design tokens so React Navigation's
  // built-in components (headers, back buttons, etc.) match the app palette.
  const navTheme = useMemo(() => {
    return {
      dark: isDark,
      colors: {
        ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
        primary: c.accent,
        background: c.bg,
        card: c.surface,
        text: c.black,
        border: c.border,
        notification: c.accent,
      },
      fonts: isDark ? DarkTheme.fonts : DefaultTheme.fonts,
    };
  }, [isDark, c]);

  return (
    <ErrorBoundary>
      <NavigationContainer
        ref={navigationRef}
        theme={navTheme}
        linking={linking}
        fallback={<LoadingScreen />}
        onReady={() => {
          // Wire up navigation ref for deep-linking from notification taps
          if (navigationRef.current) {
            setNavigationRef(navigationRef.current);
            // Handle notification that launched the app (cold start)
            handleInitialNotification().catch((err) => {
              console.warn('[AppNavigator] Failed to handle initial notification:', err);
            });
          }
        }}
      >
        <AppContent />
        <InAppNotificationHost />
      </NavigationContainer>
    </ErrorBoundary>
  );
};

export default AppNavigator;
