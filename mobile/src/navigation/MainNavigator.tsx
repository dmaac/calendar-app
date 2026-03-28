/**
 * MainNavigator -- Tab bar principal (post-onboarding)
 * 6 tabs: Inicio - Registro - Progress - Groups - Community - Perfil
 * Each tab with its own typed Stack for nested navigation.
 *
 * UX Polish:
 * - Spring-based bounce animation on tab icon selection
 * - Active dot indicator below focused tab icon
 * - Haptic feedback on every tab press
 * - Platform-native screen transitions (iOS slide, Android fade)
 * - Consistent back button gesture handling
 */
import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  createStackNavigator,
  TransitionPresets,
} from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../theme';
import { haptics } from '../hooks/useHaptics';
import { useTranslation } from '../context/LanguageContext';

import type {
  HomeStackParamList,
  LogStackParamList,
  ProfileStackParamList,
  MainTabParamList,
} from './types';

// ─── Screen imports ─────────────────────────────────────────────────────────
import HomeScreen               from '../screens/main/HomeScreen';
import AchievementsScreen       from '../screens/main/AchievementsScreen';
import ScanScreen               from '../screens/main/ScanScreen';
import BarcodeScreen            from '../screens/main/BarcodeScreen';
import LogScreen                from '../screens/main/LogScreen';
import AddFoodScreen            from '../screens/main/AddFoodScreen';
import EditFoodScreen           from '../screens/main/EditFoodScreen';
import HistoryScreen            from '../screens/main/HistoryScreen';
import ProfileScreen            from '../screens/main/ProfileScreen';
import EditProfileScreen        from '../screens/main/EditProfileScreen';
import WeightTrackingScreen     from '../screens/main/WeightTrackingScreen';
import PaywallScreen            from '../screens/main/PaywallScreen';
import ReportsScreen            from '../screens/main/ReportsScreen';
import CoachScreen              from '../screens/main/CoachScreen';
import RecipesScreen            from '../screens/main/RecipesScreen';
import RecipeDetailScreen       from '../screens/main/RecipeDetailScreen';
import SettingsScreen           from '../screens/main/SettingsScreen';
import RingColorsScreen         from '../screens/main/RingColorsScreen';
import GroupsScreen             from '../screens/main/GroupsScreen';
import ProgressScreen           from '../screens/main/ProgressScreen';
import FamilyPlanScreen         from '../screens/main/FamilyPlanScreen';
import PersonalDetailsScreen    from '../screens/main/PersonalDetailsScreen';
import TrackingRemindersScreen  from '../screens/main/TrackingRemindersScreen';
import LanguageScreen           from '../screens/main/LanguageScreen';
import ReferralScreen           from '../screens/main/ReferralScreen';
import NutritionGoalsScreen     from '../screens/main/NutritionGoalsScreen';
import PDFReportScreen          from '../screens/main/PDFReportScreen';
import WidgetGuideScreen        from '../screens/main/WidgetGuideScreen';
import MealPlanScreen           from '../screens/main/MealPlanScreen';
import FoodSearchScreen         from '../screens/main/FoodSearchScreen';
import CalendarViewScreen       from '../screens/main/CalendarViewScreen';
import HelpScreen               from '../screens/main/HelpScreen';
import AboutScreen              from '../screens/main/AboutScreen';
import WorkoutScreen            from '../screens/main/WorkoutScreen';
import ChallengesScreen         from '../screens/main/ChallengesScreen';
import CommunityScreen          from '../screens/main/CommunityScreen';
import FavoritesScreen          from '../screens/main/FavoritesScreen';
import RiskDetailScreen         from '../screens/main/RiskDetailScreen';
import ShoppingListScreen       from '../screens/main/ShoppingListScreen';
import AchievementShowcaseScreen from '../screens/main/AchievementShowcaseScreen';
import RewardsShopScreen        from '../screens/main/RewardsShopScreen';
import MealBrowserScreen        from '../screens/main/MealBrowserScreen';
import NotificationPreferencesScreen from '../screens/main/NotificationPreferencesScreen';
import CalorieAdjustmentScreen  from '../screens/main/CalorieAdjustmentScreen';
import PrivacyPolicy            from '../screens/legal/PrivacyPolicy';
import TermsOfService           from '../screens/legal/TermsOfService';

// ─── Typed navigators ───────────────────────────────────────────────────────

const HomeStackNav    = createStackNavigator<HomeStackParamList>();
const LogStackNav     = createStackNavigator<LogStackParamList>();
const ProfileStackNav = createStackNavigator<ProfileStackParamList>();

const Tab = createBottomTabNavigator<MainTabParamList>();

// ─── Tab icon configuration ─────────────────────────────────────────────────

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

type TabIconName =
  | 'home' | 'home-outline'
  | 'camera' | 'camera-outline'
  | 'nutrition' | 'nutrition-outline'
  | 'book' | 'book-outline'
  | 'people' | 'people-outline'
  | 'chatbubbles' | 'chatbubbles-outline'
  | 'trending-up' | 'trending-up-outline'
  | 'person' | 'person-outline';

const TAB_ICONS: Record<string, [TabIconName, TabIconName]> = {
  Inicio:    ['home',         'home-outline'],
  Escanear:  ['camera',       'camera-outline'],
  Recetas:   ['nutrition',    'nutrition-outline'],
  Registro:  ['book',         'book-outline'],
  Progress:  ['trending-up',  'trending-up-outline'],
  Groups:    ['people',       'people-outline'],
  Community: ['chatbubbles',  'chatbubbles-outline'],
  Perfil:    ['person',       'person-outline'],
};

// ─── Shared stack screen options ────────────────────────────────────────────
// Provides platform-native transitions: iOS gets slide-from-right with gesture,
// Android gets a subtle fade-in. All stacks share these defaults.

const SHARED_STACK_OPTIONS = {
  headerShown: false as const,
  gestureEnabled: true,
  ...TransitionPresets.DefaultTransition,
};

// Modal presentation -- used for overlay screens like Paywall, Scan
const MODAL_SCREEN_OPTIONS = {
  headerShown: false as const,
  gestureEnabled: true,
  ...TransitionPresets.ModalTransition,
};

// ─── Animated Tab Icon ──────────────────────────────────────────────────────
/** Bounces with spring physics when tab becomes focused.
 *  Includes an active dot indicator below the icon for clear visual feedback. */
function AnimatedTabIcon({
  iconName,
  color,
  focused,
  size = 22,
}: {
  iconName: string;
  color: string;
  focused: boolean;
  size?: number;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const dotScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (focused) {
      // Icon bounce -- starts small, springs to full size
      scale.setValue(0.8);
      Animated.spring(scale, {
        toValue: 1,
        friction: 5,
        tension: 180,
        useNativeDriver: true,
      }).start();

      // Active dot appears with spring
      Animated.spring(dotScale, {
        toValue: 1,
        friction: 6,
        tension: 150,
        useNativeDriver: true,
      }).start();
    } else {
      // Dot disappears smoothly when unfocused
      Animated.timing(dotScale, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }
  }, [focused]);

  return (
    <View style={tabIconStyles.wrapper}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Ionicons name={iconName as IoniconsName} size={size} color={color} />
      </Animated.View>
      <Animated.View
        style={[
          tabIconStyles.dot,
          {
            backgroundColor: color,
            transform: [{ scale: dotScale }],
          },
        ]}
      />
    </View>
  );
}

const tabIconStyles = StyleSheet.create({
  wrapper: { alignItems: 'center', gap: 3 },
  dot: { width: 4, height: 4, borderRadius: 2 },
});

// ─── Stack Navigators ───────────────────────────────────────────────────────

const HomeStack = () => (
  <HomeStackNav.Navigator screenOptions={SHARED_STACK_OPTIONS}>
    <HomeStackNav.Screen name="HomeMain"     component={HomeScreen} />
    <HomeStackNav.Screen name="Achievements" component={AchievementsScreen} />
    <HomeStackNav.Screen name="Reports"      component={ReportsScreen} />
    <HomeStackNav.Screen name="Coach"        component={CoachScreen} />
    <HomeStackNav.Screen name="MealPlan"     component={MealPlanScreen} />
    <HomeStackNav.Screen name="Challenges"   component={ChallengesScreen} />
    <HomeStackNav.Screen name="Paywall"      component={PaywallScreen} options={MODAL_SCREEN_OPTIONS} />
    <HomeStackNav.Screen name="Scan"         component={ScanScreen} />
    <HomeStackNav.Screen name="Barcode"      component={BarcodeScreen} />
    <HomeStackNav.Screen name="Recipes"      component={RecipesScreen} />
    <HomeStackNav.Screen name="RecipeDetail" component={RecipeDetailScreen} />
    <HomeStackNav.Screen name="Favorites"    component={FavoritesScreen} />
    <HomeStackNav.Screen name="RiskDetail"   component={RiskDetailScreen} />
    <HomeStackNav.Screen name="ShoppingList" component={ShoppingListScreen} />
    <HomeStackNav.Screen name="AchievementShowcase" component={AchievementShowcaseScreen} />
    <HomeStackNav.Screen name="RewardsShop"  component={RewardsShopScreen} />
    <HomeStackNav.Screen name="MealBrowser"  component={MealBrowserScreen} />
    <HomeStackNav.Screen name="CalorieAdjustment" component={CalorieAdjustmentScreen} />
  </HomeStackNav.Navigator>
);

const LogStack = () => (
  <LogStackNav.Navigator screenOptions={SHARED_STACK_OPTIONS}>
    <LogStackNav.Screen name="LogMain"      component={LogScreen} />
    <LogStackNav.Screen name="AddFood"      component={AddFoodScreen} />
    <LogStackNav.Screen name="EditFood"     component={EditFoodScreen} />
    <LogStackNav.Screen name="History"      component={HistoryScreen} />
    <LogStackNav.Screen name="FoodSearch"   component={FoodSearchScreen} />
    <LogStackNav.Screen name="CalendarView" component={CalendarViewScreen} />
    <LogStackNav.Screen name="Favorites"    component={FavoritesScreen} />
  </LogStackNav.Navigator>
);

const ProfileStack = () => (
  <ProfileStackNav.Navigator screenOptions={SHARED_STACK_OPTIONS}>
    <ProfileStackNav.Screen name="ProfileMain"  component={ProfileScreen} />
    <ProfileStackNav.Screen name="Paywall"      component={PaywallScreen} options={MODAL_SCREEN_OPTIONS} />
    <ProfileStackNav.Screen name="EditProfile"  component={EditProfileScreen} />
    <ProfileStackNav.Screen name="WeightTracking" component={WeightTrackingScreen} />
    <ProfileStackNav.Screen name="Settings"     component={SettingsScreen} />
    <ProfileStackNav.Screen name="PersonalDetails" component={PersonalDetailsScreen} />
    <ProfileStackNav.Screen name="FamilyPlan"   component={FamilyPlanScreen} />
    <ProfileStackNav.Screen name="RingColors"   component={RingColorsScreen} />
    <ProfileStackNav.Screen name="Language"     component={LanguageScreen} />
    <ProfileStackNav.Screen name="TrackingReminders" component={TrackingRemindersScreen} />
    <ProfileStackNav.Screen name="NotificationPreferences" component={NotificationPreferencesScreen} />
    <ProfileStackNav.Screen name="Referral"     component={ReferralScreen} />
    <ProfileStackNav.Screen name="NutritionGoals" component={NutritionGoalsScreen} />
    <ProfileStackNav.Screen name="PDFReport"    component={PDFReportScreen} />
    <ProfileStackNav.Screen name="WidgetGuide"  component={WidgetGuideScreen} />
    <ProfileStackNav.Screen name="Help"         component={HelpScreen} />
    <ProfileStackNav.Screen name="Workouts"     component={WorkoutScreen} />
    <ProfileStackNav.Screen name="PrivacyPolicy" component={PrivacyPolicy} />
    <ProfileStackNav.Screen name="TermsOfService" component={TermsOfService} />
    <ProfileStackNav.Screen name="About"        component={AboutScreen} />
  </ProfileStackNav.Navigator>
);

// ─── Main Tab Navigator ─────────────────────────────────────────────────────

export default function MainNavigator() {
  const insets = useSafeAreaInsets();
  const c = useThemeColors();
  const { t } = useTranslation();

  return (
    <Tab.Navigator
      screenListeners={{
        tabPress: () => {
          haptics.light();
        },
      }}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: c.surface,
          borderTopColor: c.border,
          borderTopWidth: 1,
          height: 56 + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 6,
        },
        tabBarActiveTintColor: c.tabActive,
        tabBarInactiveTintColor: c.tabInactive,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600' as const,
        },
        // Disable swipe between tabs on Android (interferes with stack gestures)
        tabBarHideOnKeyboard: true,
        tabBarIcon: ({ focused, color }) => {
          const [active, inactive] = TAB_ICONS[route.name] ?? ['ellipse', 'ellipse-outline'];
          const iconName = focused ? active : inactive;

          return (
            <AnimatedTabIcon iconName={iconName} color={color} focused={focused} />
          );
        },
      })}
    >
      {/* Home tab mounts immediately; other tabs lazy-load on first visit to reduce initial memory */}
      <Tab.Screen
        name="Inicio"
        component={HomeStack}
        options={{
          tabBarLabel: t('tabs.home'),
          tabBarAccessibilityLabel: 'Inicio',
        }}
      />
      <Tab.Screen
        name="Registro"
        component={LogStack}
        options={{
          tabBarLabel: t('tabs.log'),
          tabBarAccessibilityLabel: 'Registro de comidas',
          lazy: true,
        }}
      />
      <Tab.Screen
        name="Progress"
        component={ProgressScreen}
        options={{
          tabBarLabel: t('tabs.progress'),
          tabBarAccessibilityLabel: 'Progreso y estadisticas',
          lazy: true,
        }}
      />
      <Tab.Screen
        name="Groups"
        component={GroupsScreen}
        options={{
          tabBarLabel: t('tabs.groups'),
          tabBarAccessibilityLabel: 'Grupos de nutricion',
          lazy: true,
        }}
      />
      <Tab.Screen
        name="Community"
        component={CommunityScreen}
        options={{
          tabBarLabel: t('tabs.community'),
          tabBarAccessibilityLabel: 'Comunidad y logros',
          lazy: true,
        }}
      />
      <Tab.Screen
        name="Perfil"
        component={ProfileStack}
        options={{
          tabBarLabel: t('tabs.profile'),
          tabBarAccessibilityLabel: 'Perfil y configuracion',
          lazy: true,
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({});
