import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

import { useAuth } from '../context/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import LoadingScreen from '../components/LoadingScreen';
import OnboardingNavigator from '../screens/onboarding/OnboardingNavigator';
import { OnboardingProvider } from '../context/OnboardingContext';

const Stack = createStackNavigator();

// ─── Auth stack ───────────────────────────────────────────────────────────────
const AuthNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Login"    component={LoginScreen} />
    <Stack.Screen name="Register" component={RegisterScreen} />
  </Stack.Navigator>
);

// ─── Placeholder: main app screens (FASE 6 — en construcción) ────────────────
const MainNavigator = () => (
  <View style={styles.placeholder}>
    <Text style={styles.emoji}>🚀</Text>
    <Text style={styles.title}>Cal AI</Text>
    <Text style={styles.subtitle}>Main screens coming soon</Text>
    <Text style={styles.caption}>HomeScreen · ScanScreen · LogScreen</Text>
  </View>
);

const styles = StyleSheet.create({
  placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', gap: 8 },
  emoji:    { fontSize: 56 },
  title:    { fontSize: 28, fontWeight: '800', color: '#111' },
  subtitle: { fontSize: 16, color: '#8E8E93' },
  caption:  { fontSize: 12, color: '#C7C7CC', marginTop: 8 },
});

// ─── Root navigator ───────────────────────────────────────────────────────────
const AppNavigator = () => {
  const { isLoading, isAuthenticated, isOnboardingComplete, markOnboardingComplete } = useAuth();

  // Espera a que AuthContext cargue los tokens de SecureStore
  if (isLoading) return <LoadingScreen />;

  // Onboarding first
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
