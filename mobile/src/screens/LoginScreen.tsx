import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { colors, typography, spacing, radius, useLayout } from '../theme';
// FitsiMascot removed — using Ionicons icon instead

interface LoginScreenProps {
  navigation: any;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LoginScreen: React.FC<LoginScreenProps> = ({ navigation }) => {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const { login, resetOnboarding, devBypass } = useAuth();
  const { sidePadding, contentWidth } = useLayout();

  const emailError = emailTouched && email.length > 0 && !EMAIL_REGEX.test(email.trim())
    ? 'Ingresa un correo válido' : '';
  const passwordError = passwordTouched && password.length > 0 && password.length < 8
    ? 'Mínimo 8 caracteres' : '';
  const canSubmit = email.trim().length > 0 && password.length >= 8 && EMAIL_REGEX.test(email.trim());

  const handleLogin = async () => {
    setEmailTouched(true);
    setPasswordTouched(true);
    if (!canSubmit) return;
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (error: any) {
      Alert.alert('Error al iniciar sesión', error?.message || error?.response?.data?.detail || 'Verifica tu email y contraseña');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingHorizontal: sidePadding }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo + título */}
        <View style={styles.header}>
          <Ionicons name="nutrition" size={64} color={colors.accent} style={{ marginBottom: 12 }} />
          <Text style={styles.appName}>Fitsi AI</Text>
          <Text style={styles.appTagline}>Tu asistente de nutrición con IA</Text>
        </View>

        {/* Formulario */}
        <View style={styles.form}>
          <Text style={styles.formTitle}>Iniciar sesión</Text>

          <View style={styles.inputWrapper}>
            <Ionicons name="mail-outline" size={20} color={colors.gray} />
            <TextInput
              style={styles.input}
              placeholder="Correo electrónico"
              placeholderTextColor={colors.gray}
              value={email}
              onChangeText={setEmail}
              onBlur={() => setEmailTouched(true)}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          {!!emailError && <Text style={styles.errorText}>{emailError}</Text>}

          <View style={styles.inputWrapper}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.gray} />
            <TextInput
              style={styles.input}
              placeholder="Contraseña"
              placeholderTextColor={colors.gray}
              value={password}
              onChangeText={setPassword}
              onBlur={() => setPasswordTouched(true)}
              secureTextEntry={!showPass}
              autoCapitalize="none"
            />
            <TouchableOpacity onPress={() => setShowPass(v => !v)}>
              <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.gray} />
            </TouchableOpacity>
          </View>
          {!!passwordError && <Text style={styles.errorText}>{passwordError}</Text>}

          <TouchableOpacity
            style={[styles.btn, (loading || !canSubmit) && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={loading || !canSubmit}
            activeOpacity={0.85}
          >
            <Text style={styles.btnText}>{loading ? 'Ingresando...' : 'Iniciar sesión'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.link} onPress={resetOnboarding}>
            <Text style={styles.linkText}>
              ¿Nuevo aquí?{' '}
              <Text style={styles.linkBold}>Crea tu cuenta gratis</Text>
            </Text>
          </TouchableOpacity>

          {__DEV__ && (
            <TouchableOpacity style={styles.devBtn} onPress={devBypass}>
              <Text style={styles.devBtnText}>DEV: Entrar sin login</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: spacing.xxl },
  header: { alignItems: 'center', marginBottom: spacing.xxl, gap: spacing.sm },
  logoCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  logoEmoji: { fontSize: 40 },
  appName: { ...typography.hero, color: colors.black },
  appTagline: { ...typography.subtitle, color: colors.gray, textAlign: 'center' },
  form: { gap: spacing.md },
  formTitle: { ...typography.titleSm, color: colors.black, marginBottom: spacing.xs },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderRadius: radius.md,
    paddingHorizontal: spacing.md, height: 56,
  },
  input: { flex: 1, ...typography.option, color: colors.black },
  btn: {
    height: 56, borderRadius: radius.full, backgroundColor: colors.black,
    alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm,
  },
  btnDisabled: { backgroundColor: colors.disabled },
  btnText: { ...typography.button, color: colors.white },
  errorText: { color: '#E53935', fontSize: 12, marginTop: -4, marginLeft: spacing.sm },
  link: { alignItems: 'center', paddingVertical: spacing.sm },
  linkText: { ...typography.caption, color: colors.gray },
  linkBold: { color: colors.black, fontWeight: '700' },
  devBtn: {
    height: 44, borderRadius: radius.full, backgroundColor: '#4285F4',
    alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm,
  },
  devBtnText: { ...typography.button, color: colors.white, fontSize: 14 },
});

export default LoginScreen;
