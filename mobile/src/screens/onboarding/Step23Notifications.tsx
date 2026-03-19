import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { colors, typography, spacing, radius } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { useOnboarding } from '../../context/OnboardingContext';
import { StepProps } from './OnboardingNavigator';

const NOTIF_EXAMPLES = [
  { time: '8:00 AM', text: '🌅 ¡Buenos días! Registra tu desayuno', sub: 'Mantén tu racha' },
  { time: '1:00 PM', text: '🥗 ¡Hora de comer! No olvides fotografiar', sub: 'Te quedan 842 calorías' },
  { time: '7:30 PM', text: '✅ ¡Excelente día! Alcanzaste tu meta', sub: 'Toca para ver tu resumen' },
];

export default function Step23Notifications({ onNext, onBack, step, totalSteps }: StepProps) {
  const { update } = useOnboarding();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, []);

  const scheduleReminders = async () => {
    // Cancel previous reminders first
    await Notifications.cancelAllScheduledNotificationsAsync();

    // Desayuno 8:00 AM
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Cal AI', body: '🌅 ¡Buenos días! Registra tu desayuno' },
      trigger: { type: 'calendar', hour: 8, minute: 0, repeats: true } as any,
    });
    // Almuerzo 1:00 PM
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Cal AI', body: '🥗 ¡Hora de comer! No olvides fotografiar tu almuerzo' },
      trigger: { type: 'calendar', hour: 13, minute: 0, repeats: true } as any,
    });
    // Resumen nocturno 8:30 PM
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Cal AI', body: '✅ Revisa tu resumen del día y cierra fuerte' },
      trigger: { type: 'calendar', hour: 20, minute: 30, repeats: true } as any,
    });
  };

  const handleEnable = async () => {
    if (Platform.OS !== 'web') {
      const { status } = await Notifications.requestPermissionsAsync();
      const granted = status === 'granted';
      update('notificationsEnabled', granted);
      if (granted) await scheduleReminders();
    } else {
      update('notificationsEnabled', true);
    }
    onNext();
  };

  const handleSkip = () => {
    update('notificationsEnabled', false);
    onNext();
  };

  return (
    <OnboardingLayout
      step={step}
      totalSteps={totalSteps}
      onBack={onBack}
      footer={<><PrimaryButton label="Activar recordatorios" onPress={handleEnable} /><PrimaryButton label="Ahora no" onPress={handleSkip} variant="ghost" /></>}
    >
      <Text style={styles.title}>Mantén el rumbo{'\n'}con recordatorios</Text>
      <Text style={styles.subtitle}>
        Los usuarios que activan recordatorios pierden 3x más peso.
      </Text>

      <Animated.View style={[styles.phone, { opacity: fadeAnim }]}>
        {NOTIF_EXAMPLES.map((n, i) => (
          <View key={i} style={styles.notifCard}>
            <View style={styles.notifIcon}>
              <Ionicons name="nutrition" size={20} color={colors.white} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.notifTop}>
                <Text style={styles.notifApp}>Cal AI</Text>
                <Text style={styles.notifTime}>{n.time}</Text>
              </View>
              <Text style={styles.notifText}>{n.text}</Text>
              <Text style={styles.notifSub}>{n.sub}</Text>
            </View>
          </View>
        ))}
      </Animated.View>
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, color: colors.black, marginTop: spacing.md },
  subtitle: { ...typography.subtitle, color: colors.gray, marginTop: spacing.sm },
  phone: {
    marginTop: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: spacing.md,
    gap: spacing.sm,
  },
  notifCard: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  notifIcon: {
    width: 36, height: 36,
    borderRadius: 8,
    backgroundColor: colors.black,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notifTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  notifApp: { ...typography.caption, color: colors.gray, fontWeight: '600' },
  notifTime: { ...typography.caption, color: colors.gray },
  notifText: { ...typography.label, color: colors.black, marginTop: 2 },
  notifSub: { ...typography.caption, color: colors.gray, marginTop: 2 },
});
