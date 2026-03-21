/**
 * MainNavigator — Tab bar principal (post-onboarding)
 * 4 tabs: Inicio · Escanear · Registro · Perfil
 * Floating dark pill tab bar — norte.digital style
 */
import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';

import HomeScreen       from '../screens/main/HomeScreen';
import ScanScreen       from '../screens/main/ScanScreen';
import LogScreen        from '../screens/main/LogScreen';
import AddFoodScreen    from '../screens/main/AddFoodScreen';
import EditFoodScreen   from '../screens/main/EditFoodScreen';
import HistoryScreen    from '../screens/main/HistoryScreen';
import ProfileScreen    from '../screens/main/ProfileScreen';
import EditProfileScreen from '../screens/main/EditProfileScreen';
import PaywallScreen    from '../screens/main/PaywallScreen';

const Stack = createStackNavigator();
const Tab   = createBottomTabNavigator();

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

const ProfileStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="ProfileMain" component={ProfileScreen} />
    <Stack.Screen name="Paywall"     component={PaywallScreen} />
    <Stack.Screen name="EditProfile" component={EditProfileScreen} />
  </Stack.Navigator>
);

const LogStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="LogMain"  component={LogScreen} />
    <Stack.Screen name="AddFood"  component={AddFoodScreen} />
    <Stack.Screen name="EditFood" component={EditFoodScreen} />
    <Stack.Screen name="History"  component={HistoryScreen} />
  </Stack.Navigator>
);

export default function MainNavigator() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = 64;
  const tabBarBottom = insets.bottom + 12;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          bottom: tabBarBottom,
          left: 20,
          right: 20,
          height: tabBarHeight,
          backgroundColor: colors.surfaceHigh,
          borderTopWidth: 0,
          borderRadius: 24,
          ...Platform.select({
            ios: {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.5,
              shadowRadius: 20,
            },
            android: { elevation: 16 },
          }),
        },
        tabBarItemStyle: {
          paddingTop: 8,
          paddingBottom: 10,
        },
        tabBarActiveTintColor:   colors.primary,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          marginTop: 2,
        },
        tabBarIcon: ({ focused, color }) => {
          const [active, inactive] = TAB_ICONS[route.name] ?? ['ellipse', 'ellipse-outline'];
          const iconName = focused ? active : inactive;

          if (route.name === 'Escanear') {
            return (
              <View style={[styles.scanIcon, focused && styles.scanIconActive]}>
                <Ionicons name={iconName} size={20} color={focused ? colors.white : colors.tabInactive} />
              </View>
            );
          }

          return <Ionicons name={iconName as any} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Inicio"   component={HomeScreen}   options={{ tabBarLabel: 'Inicio' }} />
      <Tab.Screen name="Escanear" component={ScanScreen}   options={{ tabBarLabel: 'Escanear' }} />
      <Tab.Screen name="Registro" component={LogStack}     options={{ tabBarLabel: 'Registro' }} />
      <Tab.Screen name="Perfil"   component={ProfileStack} options={{ tabBarLabel: 'Perfil' }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  scanIcon: {
    width: 44,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanIconActive: {
    backgroundColor: colors.primary,
  },
});
