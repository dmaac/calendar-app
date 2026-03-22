/**
 * MainNavigator — Tab bar principal (post-onboarding)
 * 6 tabs: Inicio · Registro · Progress · Groups · Community · Perfil
 * Cada tab tiene su propio Stack para navegacion anidada.
 *
 * UX Polish:
 * - Spring-based bounce animation on tab icon selection
 * - Active dot indicator below focused tab icon
 * - Haptic feedback on every tab press
 */
import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, Animated, useColorScheme } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../theme';
import { haptics } from '../hooks/useHaptics';
import { useTranslation } from '../context/LanguageContext';

import HomeScreen         from '../screens/main/HomeScreen';
import AchievementsScreen from '../screens/main/AchievementsScreen';
import ScanScreen         from '../screens/main/ScanScreen';
import BarcodeScreen      from '../screens/main/BarcodeScreen';
import LogScreen      from '../screens/main/LogScreen';
import AddFoodScreen  from '../screens/main/AddFoodScreen';
import EditFoodScreen    from '../screens/main/EditFoodScreen';
import HistoryScreen     from '../screens/main/HistoryScreen';
import ProfileScreen     from '../screens/main/ProfileScreen';
import EditProfileScreen from '../screens/main/EditProfileScreen';
import WeightTrackingScreen from '../screens/main/WeightTrackingScreen';
import PaywallScreen        from '../screens/main/PaywallScreen';
import ReportsScreen        from '../screens/main/ReportsScreen';
import CoachScreen          from '../screens/main/CoachScreen';
import RecipesScreen        from '../screens/main/RecipesScreen';
import RecipeDetailScreen   from '../screens/main/RecipeDetailScreen';
import SettingsScreen       from '../screens/main/SettingsScreen';
import RingColorsScreen    from '../screens/main/RingColorsScreen';
import GroupsScreen         from '../screens/main/GroupsScreen';
import ProgressScreen       from '../screens/main/ProgressScreen';
import FamilyPlanScreen     from '../screens/main/FamilyPlanScreen';
import PersonalDetailsScreen from '../screens/main/PersonalDetailsScreen';
import TrackingRemindersScreen from '../screens/main/TrackingRemindersScreen';
import LanguageScreen       from '../screens/main/LanguageScreen';
import ReferralScreen       from '../screens/main/ReferralScreen';
import NutritionGoalsScreen from '../screens/main/NutritionGoalsScreen';
import PDFReportScreen      from '../screens/main/PDFReportScreen';
import WidgetGuideScreen    from '../screens/main/WidgetGuideScreen';
import MealPlanScreen       from '../screens/main/MealPlanScreen';
import FoodSearchScreen     from '../screens/main/FoodSearchScreen';
import CalendarViewScreen   from '../screens/main/CalendarViewScreen';
import HelpScreen           from '../screens/main/HelpScreen';
import AboutScreen          from '../screens/main/AboutScreen';
import WorkoutScreen        from '../screens/main/WorkoutScreen';
import ChallengesScreen     from '../screens/main/ChallengesScreen';
import CommunityScreen      from '../screens/main/CommunityScreen';
import FavoritesScreen      from '../screens/main/FavoritesScreen';
import RiskDetailScreen     from '../screens/main/RiskDetailScreen';
import ShoppingListScreen  from '../screens/main/ShoppingListScreen';
import AchievementShowcaseScreen from '../screens/main/AchievementShowcaseScreen';
import RewardsShopScreen   from '../screens/main/RewardsShopScreen';
import PrivacyPolicy        from '../screens/legal/PrivacyPolicy';
import TermsOfService       from '../screens/legal/TermsOfService';

const Stack = createStackNavigator();

const Tab = createBottomTabNavigator();

type TabIconName =
  | 'home' | 'home-outline'
  | 'camera' | 'camera-outline'
  | 'nutrition' | 'nutrition-outline'
  | 'book' | 'book-outline'
  | 'people' | 'people-outline'
  | 'chatbubbles' | 'chatbubbles-outline'
  | 'trending-up' | 'trending-up-outline'
  | 'person' | 'person-outline';

/** Animated tab icon — bounces with spring physics when tab becomes focused.
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
      // Icon bounce — starts small, springs to full size
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
        <Ionicons name={iconName as any} size={size} color={color} />
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

// Stack navigators para tabs que necesitan navegacion anidada
const ProfileStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="ProfileMain"  component={ProfileScreen} />
    <Stack.Screen name="Paywall"      component={PaywallScreen} />
    <Stack.Screen name="EditProfile"    component={EditProfileScreen} />
    <Stack.Screen name="WeightTracking"  component={WeightTrackingScreen} />
    <Stack.Screen name="Settings"        component={SettingsScreen} />
    <Stack.Screen name="PersonalDetails"  component={PersonalDetailsScreen} />
    <Stack.Screen name="FamilyPlan"      component={FamilyPlanScreen} />
    <Stack.Screen name="RingColors"      component={RingColorsScreen} />
    <Stack.Screen name="Language"        component={LanguageScreen} />
    <Stack.Screen name="TrackingReminders" component={TrackingRemindersScreen} />
    <Stack.Screen name="Referral"         component={ReferralScreen} />
    <Stack.Screen name="NutritionGoals"  component={NutritionGoalsScreen} />
    <Stack.Screen name="PDFReport"       component={PDFReportScreen} />
    <Stack.Screen name="WidgetGuide"     component={WidgetGuideScreen} />
    <Stack.Screen name="Help"            component={HelpScreen} />
    <Stack.Screen name="Workouts"        component={WorkoutScreen} />
    <Stack.Screen name="PrivacyPolicy"   component={PrivacyPolicy} />
    <Stack.Screen name="TermsOfService"  component={TermsOfService} />
    <Stack.Screen name="About"           component={AboutScreen} />
  </Stack.Navigator>
);

const HomeStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="HomeMain"     component={HomeScreen} />
    <Stack.Screen name="Achievements" component={AchievementsScreen} />
    <Stack.Screen name="Reports"      component={ReportsScreen} />
    <Stack.Screen name="Coach"        component={CoachScreen} />
    <Stack.Screen name="MealPlan"     component={MealPlanScreen} />
    <Stack.Screen name="Challenges"  component={ChallengesScreen} />
    <Stack.Screen name="Paywall"     component={PaywallScreen} />
    <Stack.Screen name="Scan"        component={ScanScreen} />
    <Stack.Screen name="Barcode"     component={BarcodeScreen} />
    <Stack.Screen name="Recipes"     component={RecipesScreen} />
    <Stack.Screen name="RecipeDetail" component={RecipeDetailScreen} />
    <Stack.Screen name="Favorites"   component={FavoritesScreen} />
    <Stack.Screen name="RiskDetail"    component={RiskDetailScreen} />
    <Stack.Screen name="ShoppingList"  component={ShoppingListScreen} />
    <Stack.Screen name="AchievementShowcase" component={AchievementShowcaseScreen} />
    <Stack.Screen name="RewardsShop"  component={RewardsShopScreen} />
  </Stack.Navigator>
);

const ScanStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="ScanMain" component={ScanScreen} />
    <Stack.Screen name="Barcode"  component={BarcodeScreen} />
  </Stack.Navigator>
);

const RecipesStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="RecipesMain"   component={RecipesScreen} />
    <Stack.Screen name="RecipeDetail"  component={RecipeDetailScreen} />
  </Stack.Navigator>
);

const LogStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="LogMain"       component={LogScreen} />
    <Stack.Screen name="AddFood"       component={AddFoodScreen} />
    <Stack.Screen name="EditFood"      component={EditFoodScreen} />
    <Stack.Screen name="History"       component={HistoryScreen} />
    <Stack.Screen name="FoodSearch"    component={FoodSearchScreen} />
    <Stack.Screen name="CalendarView"  component={CalendarViewScreen} />
    <Stack.Screen name="Favorites"     component={FavoritesScreen} />
  </Stack.Navigator>
);

export default function MainNavigator() {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const c = useThemeColors();
  const { t } = useTranslation();

  const navTheme = {
    dark: scheme === 'dark',
    colors: {
      primary: c.accent,
      background: c.bg,
      card: c.surface,
      text: c.black,
      border: c.border,
      notification: c.accent,
    },
  };

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
          fontWeight: '600',
        },
        tabBarIcon: ({ focused, color }) => {
          const [active, inactive] = TAB_ICONS[route.name] ?? ['ellipse', 'ellipse-outline'];
          const iconName = focused ? active : inactive;

          // Scan tab: bigger icon with accent highlight
          if (route.name === 'Escanear') {
            return (
              <View style={[styles.scanIcon, { backgroundColor: c.surfaceAlt }, focused && { backgroundColor: c.black }]}>
                <AnimatedTabIcon
                  iconName={iconName}
                  color={focused ? c.white : c.tabInactive}
                  focused={focused}
                  size={22}
                />
              </View>
            );
          }

          return (
            <AnimatedTabIcon iconName={iconName} color={color} focused={focused} />
          );
        },
      })}
    >
      {/* Home tab mounts immediately; other tabs lazy-load on first visit to reduce initial memory */}
      <Tab.Screen name="Inicio"   component={HomeStack}     options={{ tabBarLabel: t('tabs.home'), tabBarAccessibilityLabel: 'Inicio' }} />
      <Tab.Screen name="Registro" component={LogStack}      options={{ tabBarLabel: t('tabs.log'), tabBarAccessibilityLabel: 'Registro de comidas', lazy: true }} />
      <Tab.Screen name="Progress" component={ProgressScreen} options={{ tabBarLabel: t('tabs.progress'), tabBarAccessibilityLabel: 'Progreso y estadisticas', lazy: true }} />
      <Tab.Screen name="Groups"    component={GroupsScreen}     options={{ tabBarLabel: t('tabs.groups'), tabBarAccessibilityLabel: 'Grupos de nutricion', lazy: true }} />
      <Tab.Screen name="Community" component={CommunityScreen} options={{ tabBarLabel: t('tabs.community'), tabBarAccessibilityLabel: 'Comunidad y logros', lazy: true }} />
      <Tab.Screen name="Perfil"    component={ProfileStack}    options={{ tabBarLabel: t('tabs.profile'), tabBarAccessibilityLabel: 'Perfil y configuracion', lazy: true }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  scanIcon: {
    width: 40,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
