import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../context/AuthContext';
import { theme } from '../theme';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import HomeScreen from '../screens/HomeScreen';
import CalendarScreen from '../screens/CalendarScreen';
import AddActivityScreen from '../screens/AddActivityScreen';
import NutritionDashboardScreen from '../screens/NutritionDashboardScreen';
import MealLogScreen from '../screens/MealLogScreen';
import FoodSearchScreen from '../screens/FoodSearchScreen';
import NutritionProfileScreen from '../screens/NutritionProfileScreen';
import LoadingScreen from '../components/LoadingScreen';
import OnboardingNavigator from '../screens/onboarding/OnboardingNavigator';
import { OnboardingProvider } from '../context/OnboardingContext';

const Stack = createStackNavigator();
const Tab   = createBottomTabNavigator();

// ─── Auth stack (login / register) ───────────────────────────────────────────
const AuthNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Login"    component={LoginScreen} />
    <Stack.Screen name="Register" component={RegisterScreen} />
  </Stack.Navigator>
);

// ─── Main tab bar ─────────────────────────────────────────────────────────────
const MainTabNavigator = () => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarIcon: ({ focused, color, size }) => {
        const icons: Record<string, [string, string]> = {
          Home:      ['home',     'home-outline'],
          Calendar:  ['calendar', 'calendar-outline'],
          Nutrition: ['leaf',     'leaf-outline'],
        };
        const [active, inactive] = icons[route.name] ?? ['home', 'home-outline'];
        return <Ionicons name={(focused ? active : inactive) as any} size={size} color={color} />;
      },
      tabBarActiveTintColor:   theme.colors.tabActive,
      tabBarInactiveTintColor: theme.colors.tabInactive,
      tabBarStyle: {
        backgroundColor: theme.colors.surface,
        borderTopColor:  theme.colors.border,
        borderTopWidth:  1,
        height:          88,
        paddingBottom:   24,
        paddingTop:      8,
      },
    })}
  >
    <Tab.Screen name="Home"      component={HomeScreen} />
    <Tab.Screen name="Calendar"  component={CalendarScreen} />
    <Tab.Screen name="Nutrition" component={NutritionDashboardScreen} />
  </Tab.Navigator>
);

// ─── Main stack (tabs + modals) ───────────────────────────────────────────────
const MainNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="MainTabs"        component={MainTabNavigator} />
    <Stack.Screen name="AddActivity"     component={AddActivityScreen}       options={{ presentation: 'modal' }} />
    <Stack.Screen name="MealLog"         component={MealLogScreen}           options={{ presentation: 'modal' }} />
    <Stack.Screen name="FoodSearch"      component={FoodSearchScreen}        options={{ presentation: 'modal' }} />
    <Stack.Screen name="NutritionProfile" component={NutritionProfileScreen} options={{ presentation: 'modal' }} />
  </Stack.Navigator>
);

// ─── Root navigator ───────────────────────────────────────────────────────────
const AppNavigator = () => {
  const { isLoading, isAuthenticated, isOnboardingComplete, markOnboardingComplete } = useAuth();

  // Espera a que AuthContext cargue los tokens de SecureStore
  if (isLoading) return <LoadingScreen />;

  // Onboarding first — antes de login
  if (!isOnboardingComplete) {
    return (
      <OnboardingProvider>
        <OnboardingNavigator onComplete={markOnboardingComplete} />
      </OnboardingProvider>
    );
  }

  return (
    <NavigationContainer>
      {isAuthenticated ? <MainNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
};

export default AppNavigator;
