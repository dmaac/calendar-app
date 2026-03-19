/**
 * MainNavigator — Tab bar principal (post-onboarding)
 * 4 tabs: Inicio · Escanear · Registro · Perfil
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';

import HomeScreen    from '../screens/main/HomeScreen';
import ScanScreen    from '../screens/main/ScanScreen';
import LogScreen     from '../screens/main/LogScreen';
import ProfileScreen from '../screens/main/ProfileScreen';

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
      <Tab.Screen name="Registro" component={LogScreen}     options={{ tabBarLabel: 'Registro' }} />
      <Tab.Screen name="Perfil"   component={ProfileScreen} options={{ tabBarLabel: 'Perfil' }} />
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
