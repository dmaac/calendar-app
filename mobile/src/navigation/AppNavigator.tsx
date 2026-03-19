import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { useAuth } from '../context/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import LoadingScreen from '../components/LoadingScreen';
import OnboardingNavigator from '../screens/onboarding/OnboardingNavigator';
import { OnboardingProvider } from '../context/OnboardingContext';
import MainNavigator from './MainNavigator';

const Stack = createStackNavigator();

// ─── Auth stack — solo Login (registro ocurre en Step25 del onboarding) ───────
const AuthNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Login" component={LoginScreen} />
  </Stack.Navigator>
);

// ─── Root navigator ───────────────────────────────────────────────────────────
const AppNavigator = () => {
  const { isLoading, isAuthenticated, isOnboardingComplete, markOnboardingComplete } = useAuth();

  // Espera a que AuthContext cargue los tokens de SecureStore
  if (isLoading) return <LoadingScreen />;

  if (!isOnboardingComplete) {
    return (
      <OnboardingProvider>
        <OnboardingNavigator onComplete={markOnboardingComplete} />
      </OnboardingProvider>
    );
  }

  return (
    <NavigationContainer>
      {isAuthenticated
        ? <MainNavigator />
        : <AuthNavigator />}
    </NavigationContainer>
  );
};

export default AppNavigator;
