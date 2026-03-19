import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from '../context/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import LoadingScreen from '../components/LoadingScreen';
import OnboardingNavigator from '../screens/onboarding/OnboardingNavigator';
import { OnboardingProvider } from '../context/OnboardingContext';
import MainNavigator from './MainNavigator';

const Stack = createStackNavigator();

// ─── Auth stack ───────────────────────────────────────────────────────────────
const AuthNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Login"    component={LoginScreen} />
    <Stack.Screen name="Register" component={RegisterScreen} />
  </Stack.Navigator>
);

// ─── Root navigator ───────────────────────────────────────────────────────────
const AppNavigator = () => {
  const { isLoading, isAuthenticated, isOnboardingComplete, markOnboardingComplete, logout } = useAuth();

  // Espera a que AuthContext cargue los tokens de SecureStore
  if (isLoading) return <LoadingScreen />;

  // En dev siempre arranca en onboarding para poder testear
  if (!isOnboardingComplete || __DEV__) {
    return (
      <OnboardingProvider>
        <OnboardingNavigator onComplete={markOnboardingComplete} />
      </OnboardingProvider>
    );
  }

  const handleReset = async () => {
    await AsyncStorage.multiRemove(['onboarding_completed', 'onboarding_data_v2', 'onboarding_current_step']);
    await logout();
  };

  return (
    <NavigationContainer>
      {isAuthenticated
        ? <MainNavigator />
        : <AuthNavigator />}
    </NavigationContainer>
  );
};

export default AppNavigator;
