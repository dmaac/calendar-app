import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { colors, typography, spacing, radius, useLayout } from '../theme';

interface LoginScreenProps {
  navigation: any;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ navigation }) => {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const { login, resetOnboarding } = useAuth();
  const { sidePadding } = useLayout();

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError('Completa todos los campos');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (err: any) {
      const raw = err?.message || err?.response?.data?.detail || '';
      const msg = raw.toLowerCase().includes('fetch') || raw.toLowerCase().includes('network')
        ? 'No se pudo conectar al servidor. Verifica tu conexión.'
        : raw || 'Email o contraseña incorrectos';
      setError(msg);
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
        {/* Logo */}
        <View style={styles.header}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoEmoji}>🥗</Text>
          </View>
          <Text style={styles.appName}>Cal AI</Text>
          <Text style={styles.appTagline}>Tu asistente de nutrición con IA</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <Text style={styles.formTitle}>Iniciar sesión</Text>

          {/* Error inline */}
          {error && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.accent} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={[styles.inputWrapper, !!error && styles.inputError]}>
            <Ionicons name="mail-outline" size={20} color={colors.textSecondary} />
            <TextInput
              style={styles.input}
              placeholder="Correo electrónico"
              placeholderTextColor={colors.textMuted}
              value={email}
              onChangeText={(v) => { setEmail(v); setError(null); }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={[styles.inputWrapper, !!error && styles.inputError]}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} />
            <TextInput
              style={styles.input}
              placeholder="Contraseña"
              placeholderTextColor={colors.textMuted}
              value={password}
              onChangeText={(v) => { setPassword(v); setError(null); }}
              secureTextEntry={!showPass}
              autoCapitalize="none"
            />
            <TouchableOpacity onPress={() => setShowPass(v => !v)}>
              <Ionicons
                name={showPass ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator size="small" color={colors.white} />
              : <Text style={styles.btnText}>Iniciar sesión</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity style={styles.link} onPress={resetOnboarding}>
            <Text style={styles.linkText}>
              ¿Nuevo aquí?{' '}
              <Text style={styles.linkBold}>Crea tu cuenta gratis</Text>
            </Text>
          </TouchableOpacity>
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
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  logoEmoji: { fontSize: 38 },
  appName: { ...typography.hero, color: colors.white },
  appTagline: { ...typography.subtitle, color: colors.textSecondary, textAlign: 'center' },

  form: { gap: spacing.md },
  formTitle: { ...typography.titleSm, color: colors.white, marginBottom: spacing.xs },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accent + '50',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  errorText: {
    ...typography.caption,
    color: colors.accent,
    flex: 1,
    fontWeight: '600',
  },

  inputWrapper: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md, height: 56,
  },
  inputError: {
    borderColor: colors.accent + '60',
  },
  input: { flex: 1, ...typography.option, color: colors.white },

  btn: {
    height: 56, borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    marginTop: spacing.sm,
  },
  btnDisabled: { backgroundColor: colors.disabled },
  btnText: { ...typography.button, color: colors.white },

  link: { alignItems: 'center', paddingVertical: spacing.sm },
  linkText: { ...typography.caption, color: colors.textSecondary },
  linkBold: { color: colors.primary, fontWeight: '700' },
});

export default LoginScreen;
