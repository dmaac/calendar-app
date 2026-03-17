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

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

const AuthNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Login" component={LoginScreen} />
    <Stack.Screen name="Register" component={RegisterScreen} />
  </Stack.Navigator>
);

const MainTabNavigator = () => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarIcon: ({ focused, color, size }) => {
        let iconName: keyof typeof Ionicons.glyphMap;

        if (route.name === 'Home') {
          iconName = focused ? 'home' : 'home-outline';
        } else if (route.name === 'Calendar') {
          iconName = focused ? 'calendar' : 'calendar-outline';
        } else if (route.name === 'Nutrition') {
          iconName = focused ? 'leaf' : 'leaf-outline';
        } else {
          iconName = 'home-outline';
        }

        return <Ionicons name={iconName} size={size} color={color} />;
      },
      tabBarActiveTintColor: theme.colors.tabActive,
      tabBarInactiveTintColor: theme.colors.tabInactive,
      tabBarStyle: {
        backgroundColor: theme.colors.surface,
        borderTopColor: theme.colors.border,
        borderTopWidth: 1,
        height: 88,
        paddingBottom: 24,
        paddingTop: 8,
      },
    })}
  >
    <Tab.Screen name="Home" component={HomeScreen} />
    <Tab.Screen name="Calendar" component={CalendarScreen} />
    <Tab.Screen name="Nutrition" component={NutritionDashboardScreen} />
  </Tab.Navigator>
);

const MainNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="MainTabs" component={MainTabNavigator} />
    <Stack.Screen
      name="AddActivity"
      component={AddActivityScreen}
      options={{
        presentation: 'modal',
        headerShown: false,
      }}
    />
    <Stack.Screen
      name="MealLog"
      component={MealLogScreen}
      options={{
        presentation: 'modal',
        headerShown: false,
      }}
    />
    <Stack.Screen
      name="FoodSearch"
      component={FoodSearchScreen}
      options={{
        presentation: 'modal',
        headerShown: false,
      }}
    />
    <Stack.Screen
      name="NutritionProfile"
      component={NutritionProfileScreen}
      options={{
        presentation: 'modal',
        headerShown: false,
      }}
    />
  </Stack.Navigator>
);

const AppNavigator = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <NavigationContainer>
      {user ? <MainNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
};

export default AppNavigator;
