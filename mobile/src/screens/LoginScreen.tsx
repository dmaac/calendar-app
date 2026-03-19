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

interface LoginScreenProps {
  navigation: any;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ navigation }) => {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const { login, resetOnboarding } = useAuth();
  const { sidePadding, contentWidth } = useLayout();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Completa todos los campos');
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
    } catch (error: any) {
      Alert.alert('Error al iniciar sesión', error?.response?.data?.detail || 'Verifica tu email y contraseña');
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
          <View style={styles.logoCircle}>
            <Text style={styles.logoEmoji}>🥗</Text>
          </View>
          <Text style={styles.appName}>Cal AI</Text>
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
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputWrapper}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.gray} />
            <TextInput
              style={styles.input}
              placeholder="Contraseña"
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

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={loading}
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
  link: { alignItems: 'center', paddingVertical: spacing.sm },
  linkText: { ...typography.caption, color: colors.gray },
  linkBold: { color: colors.black, fontWeight: '700' },
});

export default LoginScreen;
