/**
 * MainNavigator — Tab bar principal (post-onboarding)
 * 4 tabs: Inicio · Escanear · Registro · Perfil
 * Cada tab tiene su propio Stack para navegación anidada.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';

import HomeScreen     from '../screens/main/HomeScreen';
import ScanScreen     from '../screens/main/ScanScreen';
import LogScreen      from '../screens/main/LogScreen';
import AddFoodScreen  from '../screens/main/AddFoodScreen';
import ProfileScreen  from '../screens/main/ProfileScreen';
import PaywallScreen  from '../screens/main/PaywallScreen';

const Stack = createStackNavigator();

const Tab = createBottomTabNavigator();

type TabIconName =
  | 'home' | 'home-outline'
  | 'camera' | 'camera-outline'
  | 'book' | 'book-outline'
  | 'person' | 'person-outline';

const TAB_ICONS: Record<string, [TabIconName, TabIconName]> = {
  Inicio:   ['home',   'home-outline'],
  Escanear: ['camera', 'camera-outline'],
  Registro: ['book',   'book-outline'],
  Perfil:   ['person', 'person-outline'],
};

// Stack navigators para tabs que necesitan navegación anidada
const ProfileStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="ProfileMain" component={ProfileScreen} />
    <Stack.Screen name="Paywall"     component={PaywallScreen} />
  </Stack.Navigator>
);

const LogStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="LogMain"   component={LogScreen} />
    <Stack.Screen name="AddFood"   component={AddFoodScreen} />
  </Stack.Navigator>
);

export default function MainNavigator() {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 56 + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 6,
        },
        tabBarActiveTintColor: colors.black,
        tabBarInactiveTintColor: colors.disabled,
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
              <View style={[styles.scanIcon, focused && styles.scanIconActive]}>
                <Ionicons name={iconName} size={22} color={focused ? colors.white : colors.disabled} />
              </View>
            );
          }

          return <Ionicons name={iconName as any} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Inicio"   component={HomeScreen}    options={{ tabBarLabel: 'Inicio' }} />
      <Tab.Screen name="Escanear" component={ScanScreen}    options={{ tabBarLabel: 'Escanear' }} />
      <Tab.Screen name="Registro" component={LogStack}      options={{ tabBarLabel: 'Registro' }} />
      <Tab.Screen name="Perfil"   component={ProfileStack}  options={{ tabBarLabel: 'Perfil' }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  scanIcon: {
    width: 40,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanIconActive: {
    backgroundColor: colors.black,
  },
});
