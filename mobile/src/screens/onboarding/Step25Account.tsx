import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, Platform, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { colors, typography, spacing, radius } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import FitsiMascot from '../../components/FitsiMascot';
import { useOnboarding } from '../../context/OnboardingContext';
import { StepProps } from './OnboardingNavigator';
import * as authService from '../../services/auth.service';
import * as onboardingService from '../../services/onboarding.service';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = Platform.select({
  ios:     process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '',
  android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '',
  default: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
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
        Alert.alert('Error', 'Error con Apple Sign In. Por favor intenta de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Google Sign In ─────────────────────────────────────────────────────────
  const handleGoogle = async () => {
    if (!GOOGLE_CLIENT_ID) {
      Alert.alert('No configurado', 'Google Sign In no está configurado aún.');
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
      Alert.alert('Error', 'Error con Google Sign In. Por favor intenta de nuevo.');
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
      Alert.alert('Error', err?.message ?? 'Error de autenticación.');
    } finally {
      setLoading(false);
    }
  };

  // ── Stagger fade-in animations ──────────────────────────────────────────
  const fadeAnims = useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    const animations = fadeAnims.map((anim, i) =>
      Animated.timing(anim, {
        toValue: 1,
        duration: 400,
        delay: 200 + i * 120,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      })
    );
    Animated.stagger(120, animations).start();
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  if (mode === 'email') {
    return (
      <OnboardingLayout
        step={step}
        totalSteps={totalSteps}
        onBack={() => setMode('options')}
        keyboardAware
        footer={
          <PrimaryButton
            label="Continuar"
            onPress={handleEmail}
            loading={loading}
            disabled={!email.includes('@') || password.length < 6}
          />
        }
      >
        <Text style={styles.title}>Crea tu{'\n'}cuenta</Text>

        <View style={styles.form}>
          <View style={styles.inputWrapper}>
            <Ionicons name="mail-outline" size={20} color={colors.gray} />
            <TextInput
              style={styles.input}
              placeholder="Correo electrónico"
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
              placeholder="Contraseña (mín. 6 caracteres)"
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
            Al continuar aceptas nuestros{' '}
            <Text style={styles.link}>Términos</Text> y{' '}
            <Text style={styles.link}>Política de privacidad</Text>.
          </Text>
        </View>
      </OnboardingLayout>
    );
  }

  return (
    <OnboardingLayout
      step={step}
      totalSteps={totalSteps}
      onBack={onBack}
      footer={
        <View style={styles.footerContainer}>
          <Text style={styles.terms}>
            Al continuar aceptas nuestros{' '}
            <Text style={styles.link}>Términos</Text> y{' '}
            <Text style={styles.link}>Política de privacidad</Text>.
          </Text>
          <TouchableOpacity onPress={onNext} activeOpacity={0.6}>
            <Text style={styles.skipLink}>Saltar por ahora</Text>
          </TouchableOpacity>
        </View>
      }
    >
      {/* Fitsi angel greeting */}
      <Animated.View style={[styles.mascotRow, { opacity: fadeAnims[0], transform: [{ translateY: fadeAnims[0].interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }]}>
        <FitsiMascot expression="angel" size="medium" animation="wave" message="Tu plan esta listo!" />
      </Animated.View>

      <Animated.View style={{ opacity: fadeAnims[0], transform: [{ translateY: fadeAnims[0].interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}>
        <Text style={styles.title}>Crea tu{'\n'}cuenta gratis</Text>
        <Text style={styles.subtitle}>Guarda tu plan personalizado y sincroniza en todos tus dispositivos.</Text>
      </Animated.View>

      <View style={styles.content}>
        <View style={styles.authButtons}>
          {/* Apple Sign In — large black button at top (iOS only) */}
          {Platform.OS === 'ios' && (
            <Animated.View style={{ opacity: fadeAnims[1], transform: [{ translateY: fadeAnims[1].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={radius.full}
                style={styles.appleBtn}
                onPress={handleApple}
              />
            </Animated.View>
          )}

          {/* Google — white with border below */}
          <Animated.View style={{ opacity: fadeAnims[2], transform: [{ translateY: fadeAnims[2].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
            <TouchableOpacity style={[styles.socialBtn, styles.googleBtn]} onPress={handleGoogle} activeOpacity={0.8}>
              <Text style={styles.googleG}>G</Text>
              <Text style={[styles.socialBtnText, { color: colors.black }]}>Continuar con Google</Text>
            </TouchableOpacity>
          </Animated.View>

          <Animated.View style={[styles.divider, { opacity: fadeAnims[2] }]}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>o</Text>
            <View style={styles.dividerLine} />
          </Animated.View>

          {/* Email */}
          <Animated.View style={{ opacity: fadeAnims[3], transform: [{ translateY: fadeAnims[3].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
            <TouchableOpacity style={[styles.socialBtn, styles.emailBtn]} onPress={() => setMode('email')} activeOpacity={0.8}>
              <Ionicons name="mail-outline" size={22} color={colors.black} />
              <Text style={[styles.socialBtnText, { color: colors.black }]}>Continuar con Email</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  mascotRow: {
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  title:    { ...typography.title, color: colors.black, marginTop: spacing.sm, textAlign: 'center' },
  subtitle: { ...typography.subtitle, color: colors.gray, marginTop: spacing.sm, textAlign: 'center', lineHeight: 20 },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md,
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
  divider:      { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.xs },
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
  footerContainer: { alignItems: 'center', gap: spacing.sm },
  terms: { ...typography.caption, color: colors.gray, textAlign: 'center', lineHeight: 18 },
  link:  { color: colors.black, fontWeight: '600' },
  skipLink: { ...typography.caption, color: colors.gray, textDecorationLine: 'underline' },
});
