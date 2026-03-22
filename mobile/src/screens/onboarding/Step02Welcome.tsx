import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, MAX_WIDTH, useLayout } from '../../theme';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { StepProps } from './OnboardingNavigator';
import FitsiMascot from '../../components/FitsiMascot';

interface Step02Props extends StepProps {
  onSkipToLogin: () => void;
}

export default function Step02Welcome({ onNext, onSkipToLogin }: Step02Props) {
  const { contentWidth } = useLayout();
  const slideAnim = useRef(new Animated.Value(30)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, speed: 12, bounciness: 4 }),
    ]).start();
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <View style={[styles.root, { width: contentWidth, alignSelf: 'center' }]}>

        {/* Phone mockup */}
        <Animated.View
          style={[styles.mockupWrapper, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
          accessibilityLabel="Vista previa de la camara de escaneo de alimentos"
        >
          <PhoneMockup />
        </Animated.View>

        {/* Fitsi saludando */}
        <Animated.View style={[{ opacity: fadeAnim, alignItems: 'center', marginBottom: spacing.sm }]}>
          <FitsiMascot expression="wink" size="medium" animation="wave" />
        </Animated.View>

        {/* Texto */}
        <Animated.View style={[styles.textBlock, { opacity: fadeAnim }]}>
          <Text style={styles.title}>Registra calorias con{'\n'}una simple foto</Text>
          <Text style={styles.subtitleText}>
            Nuestra IA identifica tu comida al instante
          </Text>
        </Animated.View>

        {/* CTAs */}
        <Animated.View style={[styles.actions, { opacity: fadeAnim }]}>
          <PrimaryButton label="Comenzar" onPress={onNext} />
          <TouchableOpacity
            onPress={onSkipToLogin}
            style={styles.signInBtn}
            activeOpacity={0.7}
            accessibilityLabel="Iniciar sesion con cuenta existente"
            accessibilityRole="button"
          >
            <Text style={styles.signInText}>
              Ya tienes una cuenta?{' '}
              <Text style={styles.signInBold}>Iniciar sesion</Text>
            </Text>
          </TouchableOpacity>
        </Animated.View>

      </View>
    </SafeAreaView>
  );
}

// ─── Phone mockup con contenido animado ─────────────────────────────────────
function PhoneMockup() {
  const scanAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.timing(scanAnim, { toValue: 0, duration: 1500, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const scanTranslate = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-60, 60],
  });

  return (
    <View style={mockStyles.phone}>
      {/* Notch */}
      <View style={mockStyles.notch} />

      {/* Contenido de la cámara */}
      <View style={mockStyles.screen}>
        {/* Fondo oscuro tipo cámara */}
        <View style={mockStyles.cameraView}>
          {/* Línea de scan animada */}
          <Animated.View
            style={[mockStyles.scanLine, { transform: [{ translateY: scanTranslate }] }]}
          />
          {/* Esquinas del visor */}
          <View style={[mockStyles.corner, { top: 12, left: 12 }]} />
          <View style={[mockStyles.corner, { top: 12, right: 12, transform: [{ scaleX: -1 }] }]} />
          <View style={[mockStyles.corner, { bottom: 12, left: 12, transform: [{ scaleY: -1 }] }]} />
          <View style={[mockStyles.corner, { bottom: 12, right: 12, transform: [{ scaleX: -1 }, { scaleY: -1 }] }]} />
        </View>

        {/* Bottom bar */}
        <View style={mockStyles.bottomBar}>
          <View style={mockStyles.scanChip}>
            <Ionicons name="scan" size={12} color={colors.white} />
            <Text style={mockStyles.scanText}>Escanear</Text>
          </View>
          <View style={mockStyles.captureBtn} />
        </View>
      </View>

      {/* Home bar */}
      <View style={mockStyles.homeBar} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  root: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  mockupWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: {
    marginBottom: spacing.xl,
  },
  title: {
    ...typography.title,
    color: colors.black,
    textAlign: 'center',
  },
  subtitleText: {
    ...typography.subtitle,
    color: colors.gray,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  actions: {
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
  signInBtn: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  signInText: {
    ...typography.body,
    color: colors.black,
  },
  signInBold: {
    fontWeight: '700',
  },
});

const mockStyles = StyleSheet.create({
  phone: {
    width: 180,
    height: 320,
    backgroundColor: '#1C1C1E',
    borderRadius: 32,
    overflow: 'hidden',
    padding: 8,
    alignItems: 'center',
  },
  notch: {
    width: 60,
    height: 6,
    backgroundColor: '#3A3A3C',
    borderRadius: 3,
    marginBottom: 6,
  },
  screen: {
    flex: 1,
    width: '100%',
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  cameraView: {
    flex: 1,
    backgroundColor: '#111',
    position: 'relative',
    overflow: 'hidden',
  },
  scanLine: {
    position: 'absolute',
    left: 16,
    right: 16,
    height: 1.5,
    backgroundColor: 'rgba(0,255,100,0.6)',
    top: '50%',
  },
  corner: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderColor: 'rgba(255,255,255,0.7)',
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderRadius: 2,
  },
  bottomBar: {
    height: 56,
    backgroundColor: '#1C1C1E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    gap: 12,
  },
  scanChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  scanText: {
    fontSize: 11,
    color: colors.white,
    fontWeight: '500',
  },
  captureBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.white,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  homeBar: {
    width: 80,
    height: 4,
    backgroundColor: '#3A3A3C',
    borderRadius: 2,
    marginTop: 6,
  },
});
