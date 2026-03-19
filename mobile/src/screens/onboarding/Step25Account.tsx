import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { colors, typography, spacing, radius } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { useOnboarding } from '../../context/OnboardingContext';
import { StepProps } from './OnboardingNavigator';
import * as authService from '../../services/auth.service';
import * as onboardingService from '../../services/onboarding.service';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = Platform.select({
  ios:     process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS ?? '',
  android: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID ?? '',
  default: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB ?? '',
}) ?? '';

export default function Step25Account({ onNext, onBack, step, totalSteps }: StepProps) {
  const { data } = useOnboarding();
  const [mode, setMode]           = useState<'options' | 'email'>('options');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [showPass, setShowPass]   = useState(false);
  const [loading, setLoading]     = useState(false);

  const [googleRequest,, googlePromptAsync] = AuthSession.useAuthRequest(
    {
      clientId: GOOGLE_CLIENT_ID,
      scopes: ['openid', 'profile', 'email'],
      responseType: AuthSession.ResponseType.IdToken,
      redirectUri: AuthSession.makeRedirectUri(),
      extraParams: { nonce: 'nonce' },
    },
    { authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth' }
  );

  // ── Sync onboarding data to backend after auth ────────────────────────────
  const syncAndProceed = async () => {
    try {
      await onboardingService.completeOnboarding(data);
    } catch {
      // Non-blocking — local state is the fallback
    }
    onNext();
  };

  // ── Apple Sign In ──────────────────────────────────────────────────────────
  const handleApple = async () => {
    try {
      setLoading(true);
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
      await syncAndProceed();
    } catch (err: any) {
      if (err?.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Error', 'Apple Sign In failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Google Sign In ─────────────────────────────────────────────────────────
  const handleGoogle = async () => {
    if (!GOOGLE_CLIENT_ID) {
      Alert.alert('Not configured', 'Google Sign In is not set up yet.');
      return;
    }
    try {
      setLoading(true);
      const result = await googlePromptAsync();
      if (result.type === 'success') {
        const idToken = result.params?.id_token;
        if (idToken) {
          await authService.loginWithGoogle({ id_token: idToken });
          await syncAndProceed();
        }
      }
    } catch {
      Alert.alert('Error', 'Google Sign In failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Email register / login ─────────────────────────────────────────────────
  const handleEmail = async () => {
    if (!email.includes('@') || password.length < 6) return;
    try {
      setLoading(true);
      // Try register first, fallback to login if email exists
      try {
        await authService.register({ email, password });
      } catch {
        // Account may already exist — try login
        await authService.login({ username: email, password });
      }
      await syncAndProceed();
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  if (mode === 'email') {
    return (
      <OnboardingLayout step={step} totalSteps={totalSteps} onBack={() => setMode('options')}>
        <Text style={styles.title}>Create your{'\n'}account</Text>

        <View style={styles.form}>
          <View style={styles.inputWrapper}>
            <Ionicons name="mail-outline" size={20} color={colors.gray} />
            <TextInput
              style={styles.input}
              placeholder="Email address"
              placeholderTextColor={colors.gray}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputWrapper}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.gray} />
            <TextInput
              style={styles.input}
              placeholder="Password (min 6 chars)"
              placeholderTextColor={colors.gray}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPass}
              autoCapitalize="none"
            />
            <TouchableOpacity onPress={() => setShowPass(v => !v)}>
              <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.gray} />
            </TouchableOpacity>
          </View>

          <Text style={styles.terms}>
            By continuing you agree to our{' '}
            <Text style={styles.link}>Terms</Text> and{' '}
            <Text style={styles.link}>Privacy Policy</Text>.
          </Text>
        </View>

        <View style={styles.footer}>
          <PrimaryButton
            label="Continue"
            onPress={handleEmail}
            loading={loading}
            disabled={!email.includes('@') || password.length < 6}
          />
        </View>
      </OnboardingLayout>
    );
  }

  return (
    <OnboardingLayout step={step} totalSteps={totalSteps} onBack={onBack}>
      <Text style={styles.title}>Create your{'\n'}free account</Text>
      <Text style={styles.subtitle}>Save your plan and start your journey.</Text>

      <View style={styles.content}>
        <View style={styles.lockBadge}>
          <Text style={{ fontSize: 40 }}>🔒</Text>
        </View>

        <View style={styles.authButtons}>
          {/* Apple Sign In — only show on iOS */}
          {Platform.OS === 'ios' && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={radius.full}
              style={styles.appleBtn}
              onPress={handleApple}
            />
          )}

          {/* Google */}
          <TouchableOpacity style={[styles.socialBtn, styles.googleBtn]} onPress={handleGoogle} activeOpacity={0.8}>
            <Text style={styles.googleG}>G</Text>
            <Text style={[styles.socialBtnText, { color: colors.black }]}>Continue with Google</Text>
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Email */}
          <TouchableOpacity style={[styles.socialBtn, styles.emailBtn]} onPress={() => setMode('email')} activeOpacity={0.8}>
            <Ionicons name="mail-outline" size={22} color={colors.black} />
            <Text style={[styles.socialBtnText, { color: colors.black }]}>Continue with Email</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.terms}>
          By continuing you agree to our{' '}
          <Text style={styles.link}>Terms</Text> and{' '}
          <Text style={styles.link}>Privacy Policy</Text>.
        </Text>
      </View>
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  title:    { ...typography.title, color: colors.black, marginTop: spacing.md },
  subtitle: { ...typography.subtitle, color: colors.gray, marginTop: spacing.sm },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xl,
  },
  lockBadge: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: colors.surface,
    justifyContent: 'center', alignItems: 'center',
  },
  authButtons: { width: '100%', gap: spacing.sm },
  appleBtn: { width: '100%', height: 56 },
  socialBtn: {
    height: 56, borderRadius: radius.full,
    backgroundColor: colors.black,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm,
  },
  googleBtn: {
    backgroundColor: colors.white,
    borderWidth: 1.5, borderColor: colors.grayLight,
  },
  emailBtn: { backgroundColor: colors.surface },
  googleG:  { fontSize: 18, fontWeight: '700', color: '#4285F4' },
  socialBtnText: { ...typography.button, color: colors.white },
  divider:      { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dividerLine:  { flex: 1, height: 1, backgroundColor: colors.grayLight },
  dividerText:  { ...typography.caption, color: colors.gray },
  form: { flex: 1, justifyContent: 'center', gap: spacing.md },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md, height: 56, gap: spacing.sm,
  },
  input: { flex: 1, ...typography.option, color: colors.black },
  footer: {
    position: 'absolute', bottom: spacing.lg,
    left: spacing.lg, right: spacing.lg,
    gap: spacing.sm,
  },
  terms: { ...typography.caption, color: colors.gray, textAlign: 'center', lineHeight: 18 },
  link:  { color: colors.black, fontWeight: '600' },
});
