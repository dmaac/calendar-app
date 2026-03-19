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

interface RegisterScreenProps {
  navigation: any;
}

const RegisterScreen: React.FC<RegisterScreenProps> = ({ navigation }) => {
  const [firstName, setFirstName]       = useState('');
  const [lastName, setLastName]         = useState('');
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [confirmPass, setConfirmPass]   = useState('');
  const [showPass, setShowPass]         = useState(false);
  const [loading, setLoading]           = useState(false);
  const { register } = useAuth();
  const { sidePadding } = useLayout();

  const handleRegister = async () => {
    if (!firstName || !email || !password) {
      Alert.alert('Error', 'Completa los campos obligatorios');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Error', 'La contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (password !== confirmPass) {
      Alert.alert('Error', 'Las contraseñas no coinciden');
      return;
    }
    setLoading(true);
    try {
      await register(email, password, firstName, lastName);
    } catch (error: any) {
      Alert.alert('Error al registrarse', error?.response?.data?.detail || 'Inténtalo de nuevo');
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
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Crear cuenta</Text>
          <Text style={styles.subtitle}>Únete y empieza tu camino hacia una mejor nutrición</Text>
        </View>

        {/* Formulario */}
        <View style={styles.form}>
          <View style={styles.nameRow}>
            <View style={[styles.inputWrapper, { flex: 1 }]}>
              <TextInput
                style={styles.input}
                placeholder="Nombre *"
                placeholderTextColor={colors.gray}
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
              />
            </View>
            <View style={[styles.inputWrapper, { flex: 1 }]}>
              <TextInput
                style={styles.input}
                placeholder="Apellido"
                placeholderTextColor={colors.gray}
                value={lastName}
                onChangeText={setLastName}
                autoCapitalize="words"
              />
            </View>
          </View>

          <View style={styles.inputWrapper}>
            <Ionicons name="mail-outline" size={20} color={colors.gray} />
            <TextInput
              style={styles.input}
              placeholder="Correo electrónico *"
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
              placeholder="Contraseña (mín. 6 caracteres) *"
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

          <View style={styles.inputWrapper}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.gray} />
            <TextInput
              style={styles.input}
              placeholder="Confirmar contraseña *"
              placeholderTextColor={colors.gray}
              value={confirmPass}
              onChangeText={setConfirmPass}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={styles.btnText}>{loading ? 'Creando cuenta...' : 'Crear cuenta'}</Text>
          </TouchableOpacity>

          <Text style={styles.terms}>
            Al registrarte aceptas nuestros{' '}
            <Text style={styles.termsBold}>Términos de uso</Text>
            {' '}y{' '}
            <Text style={styles.termsBold}>Política de privacidad</Text>.
          </Text>

          <TouchableOpacity style={styles.link} onPress={() => navigation.navigate('Login')}>
            <Text style={styles.linkText}>
              ¿Ya tienes cuenta?{' '}
              <Text style={styles.linkBold}>Iniciar sesión</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, paddingVertical: spacing.xxl },
  header: { marginBottom: spacing.xl, gap: spacing.xs },
  title:    { ...typography.title, color: colors.black },
  subtitle: { ...typography.subtitle, color: colors.gray, lineHeight: 20 },
  form: { gap: spacing.sm },
  nameRow: { flexDirection: 'row', gap: spacing.sm },
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
  terms: { ...typography.caption, color: colors.gray, textAlign: 'center', lineHeight: 18 },
  termsBold: { color: colors.black, fontWeight: '600' },
  link: { alignItems: 'center', paddingVertical: spacing.sm },
  linkText: { ...typography.caption, color: colors.gray },
  linkBold: { color: colors.black, fontWeight: '700' },
});

export default RegisterScreen;
