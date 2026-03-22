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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d).{8,}$/;

const RegisterScreen: React.FC<RegisterScreenProps> = ({ navigation }) => {
  const [firstName, setFirstName]       = useState('');
  const [lastName, setLastName]         = useState('');
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [confirmPass, setConfirmPass]   = useState('');
  const [showPass, setShowPass]         = useState(false);
  const [loading, setLoading]           = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const { register } = useAuth();
  const { sidePadding } = useLayout();

  const touch = (field: string) => setTouched(prev => ({ ...prev, [field]: true }));

  const emailError = touched.email && email.length > 0 && !EMAIL_REGEX.test(email.trim())
    ? 'Ingresa un correo válido' : '';
  const passwordError = touched.password && password.length > 0
    ? (password.length < 8
        ? 'Mínimo 8 caracteres'
        : !PASSWORD_REGEX.test(password)
          ? 'Debe incluir 1 mayúscula y 1 número'
          : '')
    : '';
  const confirmError = touched.confirmPass && confirmPass.length > 0 && password !== confirmPass
    ? 'Las contraseñas no coinciden' : '';
  const firstNameError = touched.firstName && !firstName.trim()
    ? 'El nombre es obligatorio' : '';

  const canSubmit = firstName.trim().length > 0
    && EMAIL_REGEX.test(email.trim())
    && PASSWORD_REGEX.test(password)
    && password === confirmPass;

  const handleRegister = async () => {
    setTouched({ firstName: true, email: true, password: true, confirmPass: true });
    if (!canSubmit) return;
    setLoading(true);
    try {
      await register(email.trim(), password, firstName.trim(), lastName.trim());
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
            <View style={{ flex: 1 }}>
              <View style={[styles.inputWrapper, { flex: undefined }]}>
                <TextInput
                  style={styles.input}
                  placeholder="Nombre *"
                  placeholderTextColor={colors.gray}
                  value={firstName}
                  onChangeText={setFirstName}
                  onBlur={() => touch('firstName')}
                  autoCapitalize="words"
                />
              </View>
              {!!firstNameError && <Text style={styles.errorText}>{firstNameError}</Text>}
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
              onBlur={() => touch('email')}
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
              placeholder="Contraseña (mín. 8, 1 mayúscula, 1 número) *"
              placeholderTextColor={colors.gray}
              value={password}
              onChangeText={setPassword}
              onBlur={() => touch('password')}
              secureTextEntry={!showPass}
              autoCapitalize="none"
            />
            <TouchableOpacity onPress={() => setShowPass(v => !v)}>
              <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.gray} />
            </TouchableOpacity>
          </View>
          {!!passwordError && <Text style={styles.errorText}>{passwordError}</Text>}

          <View style={styles.inputWrapper}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.gray} />
            <TextInput
              style={styles.input}
              placeholder="Confirmar contraseña *"
              placeholderTextColor={colors.gray}
              value={confirmPass}
              onChangeText={setConfirmPass}
              onBlur={() => touch('confirmPass')}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>
          {!!confirmError && <Text style={styles.errorText}>{confirmError}</Text>}

          <TouchableOpacity
            style={[styles.btn, (loading || !canSubmit) && styles.btnDisabled]}
            onPress={handleRegister}
            disabled={loading || !canSubmit}
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
  errorText: { color: '#E53935', fontSize: 12, marginTop: -2, marginLeft: spacing.sm },
  terms: { ...typography.caption, color: colors.gray, textAlign: 'center', lineHeight: 18 },
  termsBold: { color: colors.black, fontWeight: '600' },
  link: { alignItems: 'center', paddingVertical: spacing.sm },
  linkText: { ...typography.caption, color: colors.gray },
  linkBold: { color: colors.black, fontWeight: '700' },
});

export default RegisterScreen;
