import React, { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated, Platform, Alert, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { colors, typography, spacing, radius } from '../../theme';
import OnboardingLayout from '../../components/onboarding/OnboardingLayout';
import PrimaryButton from '../../components/onboarding/PrimaryButton';
import { useOnboarding } from '../../context/OnboardingContext';
import { StepProps } from './OnboardingNavigator';
import { api } from '../../services/api';

const NOTIF_EXAMPLES = [
  { time: '8:00 AM', text: 'Buenos dias! Registra tu desayuno', sub: 'Manten tu racha', icon: 'sunny' },
  { time: '1:00 PM', text: 'Hora de comer! No olvides fotografiar', sub: 'Te quedan 842 calorias', icon: 'restaurant' },
  { time: '9:00 PM', text: 'Hoy consumiste 1,850 kcal. Buen trabajo!', sub: 'Toca para ver tu resumen', icon: 'stats-chart' },
];

export default function Step23Notifications({ onNext, onBack, step, totalSteps, onSkip }: StepProps) {
  const { update } = useOnboarding();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [loading, setLoading] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    // Check if permissions were previously denied so we can show the right CTA
    if (Platform.OS !== 'web') {
      Notifications.getPermissionsAsync().then(({ status }) => {
        if (status === 'denied') setPermissionDenied(true);
      }).catch(() => {});
    }
  }, []);

  const scheduleLocalReminders = async () => {
    // Cancel previous reminders first
    await Notifications.cancelAllScheduledNotificationsAsync();

    // Desayuno 8:00 AM
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Fitsi IA',
        body: 'Buenos dias! Registra tu desayuno',
        data: { type: 'meal_reminder', meal_type: 'breakfast', screen: 'LogMain' },
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 8,
        minute: 0,
      } as any,
    });
    // Almuerzo 1:00 PM
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Fitsi IA',
        body: 'Hora de comer! No olvides fotografiar tu almuerzo',
        data: { type: 'meal_reminder', meal_type: 'lunch', screen: 'LogMain' },
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 13,
        minute: 0,
      } as any,
    });
    // Cena 7:00 PM
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Fitsi IA',
        body: 'Hora de cenar! Registra tu cena en Fitsi',
        data: { type: 'meal_reminder', meal_type: 'dinner', screen: 'LogMain' },
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 19,
        minute: 0,
      } as any,
    });
    // Resumen nocturno 9:00 PM
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Fitsi IA',
        body: 'Revisa tu resumen del dia y cierra fuerte',
        data: { type: 'evening_summary', screen: 'HomeMain' },
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 21,
        minute: 0,
      } as any,
    });
    // Streak risk alert 6:00 PM
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Fitsi IA',
        body: 'No has registrado comida hoy. Tu racha puede estar en riesgo!',
        data: { type: 'streak_at_risk', screen: 'LogMain' },
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 18,
        minute: 0,
      } as any,
    });
  };

  const registerPushToken = async () => {
    try {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: projectId ?? undefined,
      });
      await api.post('/api/notifications/register', {
        token: tokenData.data,
        platform: Platform.OS,
      });
    } catch (error) {
      // Token registration will be retried on app launch via notification.service
      console.warn('[Step23] Push token registration failed (will retry):', error);
    }
  };

  const handleEnable = async () => {
    if (loading) return; // Prevent double-tap
    setLoading(true);

    try {
      if (Platform.OS !== 'web') {
        // If permissions were already denied, guide user to Settings
        if (permissionDenied) {
          Alert.alert(
            'Notificaciones desactivadas',
            'Las notificaciones estan bloqueadas. Para activarlas, ve a Ajustes y permite notificaciones para Fitsi.',
            [
              { text: 'Ir a Ajustes', onPress: () => Linking.openSettings() },
              { text: 'Continuar sin notificaciones', style: 'cancel', onPress: () => {
                update('notificationsEnabled', false);
                onNext();
              }},
            ],
          );
          return;
        }

        const { status } = await Notifications.requestPermissionsAsync();
        const granted = status === 'granted';
        update('notificationsEnabled', granted);

        if (granted) {
          // Schedule local notifications as immediate fallback
          await scheduleLocalReminders();
          // Register push token with backend (best-effort, non-blocking)
          registerPushToken().catch(() => {});
          onNext();
        } else {
          // Permission was denied by the OS prompt
          setPermissionDenied(true);
          Alert.alert(
            'Notificaciones no activadas',
            'Los usuarios con recordatorios activos pierden 3x mas peso. Puedes activarlos mas tarde en Ajustes.',
            [
              { text: 'Continuar', onPress: () => {
                update('notificationsEnabled', false);
                onNext();
              }},
            ],
          );
        }
      } else {
        update('notificationsEnabled', true);
        onNext();
      }
    } catch {
      // If something goes wrong, still allow proceeding
      update('notificationsEnabled', false);
      onNext();
    } finally {
      setLoading(false);
    }
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
      onSkip={onSkip}
      footer={
        <>
          <PrimaryButton
            label={permissionDenied ? 'Abrir Ajustes' : 'Activar recordatorios'}
            onPress={handleEnable}
            loading={loading}
            disabled={loading}
          />
          <PrimaryButton label="Ahora no" onPress={handleSkip} variant="ghost" />
        </>
      }
    >
      <Text style={styles.title}>Manten el rumbo{'\n'}con recordatorios</Text>
      <Text style={styles.subtitle}>
        Los usuarios que activan recordatorios pierden 3x mas peso.
      </Text>

      <Animated.View style={[styles.phone, { opacity: fadeAnim }]}>
        {NOTIF_EXAMPLES.map((n, i) => (
          <View key={i} style={styles.notifCard}>
            <View style={styles.notifIcon}>
              <Ionicons name={n.icon as any} size={20} color={colors.white} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.notifTop}>
                <Text style={styles.notifApp}>Fitsi IA</Text>
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
