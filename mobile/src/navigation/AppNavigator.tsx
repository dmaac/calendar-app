import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { useAuth } from '../context/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import LoadingScreen from '../components/LoadingScreen';
import OnboardingNavigator from '../screens/onboarding/OnboardingNavigator';
import { OnboardingProvider } from '../context/OnboardingContext';
import MainNavigator from './MainNavigator';
import { startOfflineSyncWatcher, stopOfflineSyncWatcher } from '../services/offlineSync';

const Stack = createStackNavigator();

// ─── Auth stack — solo Login (registro ocurre en Step25 del onboarding) ───────
const AuthNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Login" component={LoginScreen} />
  </Stack.Navigator>
);

// ─── Inner navigator — decides which flow to show ────────────────────────────
const AppContent = () => {
  const { isLoading, isAuthenticated, isOnboardingComplete, markOnboardingComplete } = useAuth();

  // Start offline sync watcher when app mounts
  useEffect(() => {
    startOfflineSyncWatcher();
    return () => stopOfflineSyncWatcher();
  }, []);

  // Espera a que AuthContext cargue los tokens de SecureStore
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

// ─── Root navigator — NavigationContainer wraps EVERYTHING ──────────────────
const AppNavigator = () => (
  <NavigationContainer>
    <AppContent />
  </NavigationContainer>
);

export default AppNavigator;
