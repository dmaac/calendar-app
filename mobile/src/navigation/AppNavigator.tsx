import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

// ─── Placeholder: main app screens (Rama 2 — en construcción) ────────────────
const MainNavigatorPlaceholder = ({ onReset }: { onReset: () => void }) => (
  <View style={styles.placeholder}>
    <Text style={styles.emoji}>🚀</Text>
    <Text style={styles.title}>Cal AI</Text>
    <Text style={styles.subtitle}>Pantallas principales en construcción</Text>
    <Text style={styles.caption}>HomeScreen · ScanScreen · LogScreen</Text>
    <TouchableOpacity style={styles.resetBtn} onPress={onReset}>
      <Text style={styles.resetText}>↩ Reiniciar onboarding (dev)</Text>
    </TouchableOpacity>
  </View>
);

const styles = StyleSheet.create({
  placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', gap: 8 },
  emoji:    { fontSize: 56 },
  title:    { fontSize: 28, fontWeight: '800', color: '#111' },
  subtitle: { fontSize: 16, color: '#8E8E93' },
  caption:  { fontSize: 12, color: '#C7C7CC', marginTop: 8 },
  resetBtn: { marginTop: 24, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#F5F5F7', borderRadius: 20 },
  resetText: { fontSize: 13, color: '#8E8E93' },
});

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
        ? <MainNavigatorPlaceholder onReset={handleReset} />
        : <AuthNavigator />}
    </NavigationContainer>
  );
};

export default AppNavigator;
