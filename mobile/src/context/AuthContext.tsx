/**
 * AuthContext — estado global de autenticación
 *
 * Tokens → SecureStore (Keychain/EncryptedSharedPreferences)
 * En cold launch: lee token de SecureStore → si expirado intenta refresh → carga usuario
 * Soporta: email, Apple Sign In, Google OAuth
 */
import React, {
  createContext, useContext, useEffect, useState,
  useCallback, ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { User } from '../types';
import * as authService from '../services/auth.service';
import ApiService from '../services/api';
import * as purchaseService from '../services/purchase.service';

WebBrowser.maybeCompleteAuthSession();

// ─── Types ───────────────────────────────────────────────────────────────────

interface AuthContextType {
  // State
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isPremium: boolean;
  isOnboardingComplete: boolean;

  // Methods
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, firstName?: string, lastName?: string) => Promise<void>;
  loginWithApple: () => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  markOnboardingComplete: () => Promise<void>;
  resetOnboarding: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setPremiumStatus: (isPremium: boolean) => void;
  /** DEV ONLY: bypass auth and enter app with a mock user */
  devBypass: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};

// ─── Google OAuth config ──────────────────────────────────────────────────────
// Redirect URI for Google — in production use your bundle ID
const GOOGLE_CLIENT_ID_IOS     = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';
const GOOGLE_CLIENT_ID_ANDROID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '';
const GOOGLE_CLIENT_ID_WEB     = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

const googleClientId = Platform.select({
  ios:     GOOGLE_CLIENT_ID_IOS,
  android: GOOGLE_CLIENT_ID_ANDROID,
  default: GOOGLE_CLIENT_ID_WEB,
}) ?? '';

// ─── Provider ─────────────────────────────────────────────────────────────────

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser]         = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnboardingComplete, setIsOnboardingComplete] = useState(false);

  // Google OAuth flow
  const [googleRequest, googleResponse, googlePromptAsync] = AuthSession.useAuthRequest(
    {
      clientId: googleClientId,
      scopes: ['openid', 'profile', 'email'],
      responseType: AuthSession.ResponseType.IdToken,
      redirectUri: AuthSession.makeRedirectUri(),
      extraParams: { nonce: Crypto.randomUUID() },
    },
    { authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth' }
  );

  // ── Cold launch: load stored session ───────────────────────────────────────
  useEffect(() => {
    loadStoredSession();
  }, []);

  // ── Handle Google OAuth response ───────────────────────────────────────────
  useEffect(() => {
    if (googleResponse?.type === 'success') {
      const idToken = googleResponse.params?.id_token;
      if (idToken) {
        handleGoogleToken(idToken);
      }
    }
  }, [googleResponse]);

  const loadStoredSession = async () => {
    try {
      setIsLoading(true);
      const [accessToken, onboardingFlag] = await Promise.all([
        authService.getAccessToken(),
        AsyncStorage.getItem('onboarding_completed'),
      ]);

      setIsOnboardingComplete(onboardingFlag === 'true');

      if (!accessToken) {
        // DEV: auto-login when no session exists
        if (__DEV__ && process.env.EXPO_PUBLIC_DEV_EMAIL && process.env.EXPO_PUBLIC_DEV_PASSWORD) {
          console.log('[AuthContext] DEV auto-login...');
          await devBypassInternal();
        }
        return;
      }

      // If access token expired, try refresh first
      if (authService.isTokenExpired(accessToken)) {
        const newTokens = await authService.refreshSession();
        if (!newTokens) {
          // DEV: auto-login when refresh fails
          if (__DEV__ && process.env.EXPO_PUBLIC_DEV_EMAIL && process.env.EXPO_PUBLIC_DEV_PASSWORD) {
            console.log('[AuthContext] DEV auto-login (refresh failed)...');
            await devBypassInternal();
          }
          return;
        }
      }

      // Load user profile
      const userData = await ApiService.getCurrentUser();
      setUser(userData);

      // Initialize RevenueCat and identify user
      await purchaseService.initializePurchases(String(userData.id));

      // Check premium status from RevenueCat (source of truth for subscriptions)
      const rcPremium = await purchaseService.checkSubscriptionStatus();
      if (rcPremium && !userData.is_premium) {
        // RevenueCat says premium but backend doesn't — update local state
        // (backend will be synced via webhooks)
        userData.is_premium = true;
        setUser({ ...userData });
      }
    } catch (err) {
      // Session invalid — clear and start fresh
      await authService.clearTokens();
      // DEV: auto-login on any session error
      if (__DEV__ && process.env.EXPO_PUBLIC_DEV_EMAIL && process.env.EXPO_PUBLIC_DEV_PASSWORD) {
        console.log('[AuthContext] DEV auto-login (session error)...');
        await devBypassInternal();
      }
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAndSetUser = async () => {
    const userData = await ApiService.getCurrentUser();
    setUser(userData);

    // Identify user with RevenueCat after login/register
    await purchaseService.initializePurchases(String(userData.id));
    await purchaseService.identifyUser(String(userData.id));

    return userData;
  };

  // ── Email login ────────────────────────────────────────────────────────────
  const login = useCallback(async (email: string, password: string) => {
    await authService.login({ username: email, password });
    await fetchAndSetUser();
  }, []);

  // ── Email register ─────────────────────────────────────────────────────────
  const register = useCallback(async (
    email: string, password: string,
    firstName?: string, lastName?: string,
  ) => {
    await authService.register({ email, password, first_name: firstName, last_name: lastName });
    // After register, login
    await authService.login({ username: email, password });
    await fetchAndSetUser();
  }, []);

  // ── Apple Sign In ──────────────────────────────────────────────────────────
  const loginWithApple = useCallback(async () => {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    await authService.loginWithApple({
      identity_token:     credential.identityToken ?? '',
      authorization_code: credential.authorizationCode ?? '',
      first_name:         credential.fullName?.givenName  ?? undefined,
      last_name:          credential.fullName?.familyName ?? undefined,
    });

    await fetchAndSetUser();
  }, []);

  // ── Google Sign In ─────────────────────────────────────────────────────────
  const loginWithGoogle = useCallback(async () => {
    if (!googleClientId) {
      throw new Error('Google client ID not configured. Set EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID / EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID / EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in .env');
    }
    await googlePromptAsync();
    // Result is handled by the useEffect watching googleResponse
  }, [googlePromptAsync]);

  const handleGoogleToken = async (idToken: string) => {
    try {
      await authService.loginWithGoogle({ id_token: idToken });
      await fetchAndSetUser();
    } catch {
      // Google login failed
    }
  };

  // ── Logout ─────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      // authService.logout failed
    }
    try {
      await purchaseService.logOutPurchases();
    } catch {
      // purchaseService.logOutPurchases failed
    }
    // Keep onboarding_completed so returning users see Login, not onboarding again
    await AsyncStorage.multiRemove(['onboarding_data_v2', 'onboarding_current_step']).catch(() => {});
    setUser(null);
    // isOnboardingComplete stays true → AuthNavigator shows Login
  }, []);

  // ── Mark onboarding complete ───────────────────────────────────────────────
  const markOnboardingComplete = useCallback(async () => {
    await AsyncStorage.setItem('onboarding_completed', 'true');
    setIsOnboardingComplete(true);
  }, []);

  // ── Reset onboarding (for "new user" link on LoginScreen) ─────────────────
  const resetOnboarding = useCallback(async () => {
    await AsyncStorage.multiRemove(['onboarding_completed', 'onboarding_data_v2', 'onboarding_current_step']);
    setIsOnboardingComplete(false);
  }, []);

  // ── Refresh user from API ──────────────────────────────────────────────────
  const refreshUser = useCallback(async () => {
    const userData = await ApiService.getCurrentUser();
    setUser(userData);
  }, []);

  // ── Set premium status (called after successful purchase) ────────────────
  const setPremiumStatus = useCallback((isPremium: boolean) => {
    setUser(prev => prev ? { ...prev, is_premium: isPremium } : prev);
  }, []);

  // ── DEV BYPASS (internal, callable from loadStoredSession) ──────────────────
  const devBypassInternal = async () => {
    const devEmail = process.env.EXPO_PUBLIC_DEV_EMAIL;
    const devPassword = process.env.EXPO_PUBLIC_DEV_PASSWORD;

    if (!devEmail || !devPassword) {
      console.warn('[AuthContext] devBypass: set EXPO_PUBLIC_DEV_EMAIL and EXPO_PUBLIC_DEV_PASSWORD in .env');
      return;
    }

    try {
      // Try to register (will 400 if already exists — that's fine)
      await authService.register({
        email: devEmail,
        password: devPassword,
        first_name: 'Dev',
        last_name: 'User',
      }).catch(() => {}); // ignore "already registered"

      // Login to get real JWT tokens stored in SecureStore
      await authService.login({ username: devEmail, password: devPassword });

      // Fetch real user profile from backend
      const userData = await ApiService.getCurrentUser();

      await AsyncStorage.setItem('onboarding_completed', 'true');
      setIsOnboardingComplete(true);
      setUser(userData);
    } catch (err) {
      // Fallback: if backend is unreachable, use offline mock (no API calls will work)
      const mockUser: User = {
        id: 999,
        email: devEmail,
        first_name: 'Dev',
        last_name: 'User',
        is_active: true,
        is_premium: true,
        provider: 'email',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await AsyncStorage.setItem('onboarding_completed', 'true');
      setIsOnboardingComplete(true);
      setUser(mockUser);
    }
  };

  // ── DEV BYPASS: public wrapper ────────────────────────────────────────────
  const devBypass = useCallback(async () => {
    if (!__DEV__) return;
    await devBypassInternal();
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    isPremium: user?.is_premium ?? false,
    isOnboardingComplete,
    login,
    register,
    loginWithApple,
    loginWithGoogle,
    logout,
    markOnboardingComplete,
    resetOnboarding,
    refreshUser,
    setPremiumStatus,
    devBypass,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
