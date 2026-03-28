/**
 * NotificationPreferencesScreen -- Full notification preferences UI.
 *
 * Toggles for each notification type:
 * - Meal reminders (with custom or AI-predicted times)
 * - Evening summary (with custom time)
 * - Streak alerts (risk + celebrations)
 * - Inactivity nudges
 * - Water reminders
 *
 * Includes preview cards showing what each notification looks like,
 * a test notification button, and time pickers for custom schedules.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
  Platform,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { colors, typography, spacing, radius, useThemeColors } from '../../theme';
import { haptics } from '../../hooks/useHaptics';
import {
  NotificationPreferences,
  getNotificationPreferences,
  updateNotificationPreferences,
  sendTestNotification,
  scheduleLocalNotifications,
  scheduleFromPredictedTimes,
  MealTimePrediction,
  getPredictedMealTimes,
} from '../../services/notification.service';

// ─── Types ──────────────────────────────────────────────────────────────────

type TimePickerTarget =
  | 'breakfast'
  | 'lunch'
  | 'dinner'
  | 'snack'
  | 'evening_summary'
  | 'streak_risk'
  | null;

// ─── Preview card data ──────────────────────────────────────────────────────

interface NotificationPreview {
  icon: string;
  iconColor: string;
  title: string;
  body: string;
  time: string;
}

const PREVIEWS: Record<string, NotificationPreview> = {
  meal_reminder: {
    icon: 'restaurant',
    iconColor: '#10B981',
    title: 'Fitsi AI',
    body: 'Ya almorzaste? No olvides registrar tu almuerzo',
    time: '12:45 PM',
  },
  evening_summary: {
    icon: 'stats-chart',
    iconColor: '#6366F1',
    title: 'Resumen del dia',
    body: 'Hoy consumiste 1,850 kcal de 2,100. Buen trabajo!\nP: 120g | C: 200g | G: 65g',
    time: '9:00 PM',
  },
  streak_risk: {
    icon: 'flame',
    iconColor: '#EF4444',
    title: 'Tu racha esta en riesgo!',
    body: 'Tu racha de 7 dias esta en riesgo. Registra algo para mantenerla!',
    time: '6:00 PM',
  },
  streak_celebration: {
    icon: 'trophy',
    iconColor: '#F59E0B',
    title: '30 dias seguidos!',
    body: 'Un mes entero sin fallar! 30 dias de constancia increible.',
    time: 'Al alcanzar hito',
  },
  inactivity: {
    icon: 'heart',
    iconColor: '#EC4899',
    title: 'Te extranamos!',
    body: 'Tu plan nutricional te espera. Vuelve a registrar tu comida en Fitsi.',
    time: 'Tras 2 dias sin uso',
  },
};

// ─── Helper components ──────────────────────────────────────────────────────

function SectionHeader({ title, c }: { title: string; c: ReturnType<typeof useThemeColors> }) {
  return <Text style={[styles.sectionHeader, { color: c.gray }]}>{title}</Text>;
}

function Card({ children, c }: { children: React.ReactNode; c: ReturnType<typeof useThemeColors> }) {
  return <View style={[styles.card, { backgroundColor: c.bg }]}>{children}</View>;
}

function ToggleRow({
  icon,
  iconColor,
  label,
  subtitle,
  value,
  onToggle,
  isLast,
  c,
}: {
  icon: string;
  iconColor: string;
  label: string;
  subtitle?: string;
  value: boolean;
  onToggle: (v: boolean) => void;
  isLast?: boolean;
  c: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View
      style={[
        styles.row,
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.grayLight },
      ]}
    >
      <View style={[styles.iconCircle, { backgroundColor: c.surface }]}>
        <Ionicons name={icon as any} size={18} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: c.black }]}>{label}</Text>
        {subtitle ? (
          <Text style={[styles.rowSubtitle, { color: c.gray }]}>{subtitle}</Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={(v) => {
          haptics.light();
          onToggle(v);
        }}
        trackColor={{ false: c.grayLight, true: c.accent }}
        thumbColor={c.white}
        ios_backgroundColor={c.grayLight}
      />
    </View>
  );
}

function TimeRow({
  icon,
  iconColor,
  label,
  hour,
  minute,
  onPress,
  isLast,
  c,
}: {
  icon: string;
  iconColor: string;
  label: string;
  hour: number;
  minute: number;
  onPress: () => void;
  isLast?: boolean;
  c: ReturnType<typeof useThemeColors>;
}) {
  const formattedTime = formatTime(hour, minute);

  return (
    <TouchableOpacity
      style={[
        styles.row,
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.grayLight },
      ]}
      onPress={() => {
        haptics.light();
        onPress();
      }}
      activeOpacity={0.6}
    >
      <View style={[styles.iconCircle, { backgroundColor: c.surface }]}>
        <Ionicons name={icon as any} size={18} color={iconColor} />
      </View>
      <Text style={[styles.rowLabel, { color: c.black }]}>{label}</Text>
      <Text style={[styles.timeValue, { color: c.accent }]}>{formattedTime}</Text>
      <Ionicons name="chevron-forward" size={16} color={c.disabled} />
    </TouchableOpacity>
  );
}

function PreviewCard({
  preview,
  c,
}: {
  preview: NotificationPreview;
  c: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View style={[styles.previewCard, { backgroundColor: c.surface }]}>
      <View style={[styles.previewIconContainer, { backgroundColor: c.bg }]}>
        <Ionicons name={preview.icon as any} size={20} color={preview.iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.previewHeader}>
          <Text style={[styles.previewApp, { color: c.gray }]}>{preview.title}</Text>
          <Text style={[styles.previewTime, { color: c.gray }]}>{preview.time}</Text>
        </View>
        <Text style={[styles.previewBody, { color: c.black }]} numberOfLines={3}>
          {preview.body}
        </Text>
      </View>
    </View>
  );
}

function PredictedTimeBadge({
  predictions,
  c,
}: {
  predictions: MealTimePrediction[];
  c: ReturnType<typeof useThemeColors>;
}) {
  const hasPredictions = predictions.some((p) => p.predicted_time !== null);
  if (!hasPredictions) {
    return (
      <View style={[styles.predictionBadge, { backgroundColor: c.surface }]}>
        <Ionicons name="analytics-outline" size={14} color={c.gray} />
        <Text style={[styles.predictionText, { color: c.gray }]}>
          Aun no hay suficientes datos. Registra comidas por 3+ dias para predicciones.
        </Text>
      </View>
    );
  }

  const mealLabels: Record<string, string> = {
    breakfast: 'Desayuno',
    lunch: 'Almuerzo',
    dinner: 'Cena',
    snack: 'Snack',
  };

  return (
    <View style={[styles.predictionBadge, { backgroundColor: c.surface }]}>
      <Ionicons name="analytics-outline" size={14} color={c.accent} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.predictionLabel, { color: c.accent }]}>Horarios predichos por IA</Text>
        {predictions.map(
          (p) =>
            p.predicted_time && (
              <Text key={p.meal_type} style={[styles.predictionText, { color: c.gray }]}>
                {mealLabels[p.meal_type] ?? p.meal_type}: {p.predicted_time}
              </Text>
            ),
        )}
      </View>
    </View>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTime(hour: number, minute: number): string {
  const h = hour % 12 || 12;
  const ampm = hour < 12 ? 'AM' : 'PM';
  const m = minute.toString().padStart(2, '0');
  return `${h}:${m} ${ampm}`;
}

function timeToDate(hour: number, minute: number): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function NotificationPreferencesScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const c = useThemeColors();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [predictions, setPredictions] = useState<MealTimePrediction[]>([]);
  const [sendingTest, setSendingTest] = useState(false);

  // Time picker state
  const [pickerTarget, setPickerTarget] = useState<TimePickerTarget>(null);
  const [pickerDate, setPickerDate] = useState(new Date());

  // Animation
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Load preferences
  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!loading) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    }
  }, [loading]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [prefsData, predsData] = await Promise.all([
        getNotificationPreferences(),
        getPredictedMealTimes().catch(() => []),
      ]);
      setPrefs(prefsData);
      setPredictions(predsData);
    } catch {
      // Backend unavailable — use defaults (preferences saved locally)
      setPrefs({
        notifications_enabled: true,
        meal_reminders_enabled: true,
        breakfast_reminder_hour: 8,
        breakfast_reminder_minute: 0,
        lunch_reminder_hour: 13,
        lunch_reminder_minute: 0,
        dinner_reminder_hour: 19,
        dinner_reminder_minute: 0,
        snack_reminder_hour: 16,
        snack_reminder_minute: 0,
        use_predicted_times: true,
        reminder_lead_minutes: 15,
        evening_summary_enabled: true,
        evening_summary_hour: 21,
        evening_summary_minute: 0,
        streak_alerts_enabled: true,
        streak_risk_hour: 18,
        streak_risk_minute: 0,
        streak_celebrations_enabled: true,
        inactivity_nudge_enabled: true,
        inactivity_days_threshold: 2,
        water_reminders_enabled: false,
        water_reminder_interval_hours: 2,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const updatePref = useCallback(
    async (updates: Partial<NotificationPreferences>) => {
      if (!prefs) return;

      // Optimistic update
      const newPrefs = { ...prefs, ...updates };
      setPrefs(newPrefs);

      setSaving(true);
      try {
        const updatedPrefs = await updateNotificationPreferences(updates);
        setPrefs(updatedPrefs);

        // Reschedule local notifications
        await scheduleLocalNotifications(updatedPrefs);
      } catch {
        // Backend sync failed — local prefs already saved by service
        // No revert needed since updateNotificationPreferences saves locally first
      } finally {
        setSaving(false);
      }
    },
    [prefs],
  );

  const handleTestNotification = useCallback(async () => {
    setSendingTest(true);
    haptics.medium();
    try {
      await sendTestNotification();
      Alert.alert('Enviada!', 'Revisa tus notificaciones.');
    } catch (error: any) {
      const msg =
        error?.response?.data?.detail ?? 'No se pudo enviar la notificacion de prueba.';
      Alert.alert('Error', msg);
    } finally {
      setSendingTest(false);
    }
  }, []);

  const openTimePicker = useCallback(
    (target: TimePickerTarget) => {
      if (!prefs || !target) return;

      let hour = 12;
      let minute = 0;

      switch (target) {
        case 'breakfast':
          hour = prefs.breakfast_reminder_hour;
          minute = prefs.breakfast_reminder_minute;
          break;
        case 'lunch':
          hour = prefs.lunch_reminder_hour;
          minute = prefs.lunch_reminder_minute;
          break;
        case 'dinner':
          hour = prefs.dinner_reminder_hour;
          minute = prefs.dinner_reminder_minute;
          break;
        case 'snack':
          hour = prefs.snack_reminder_hour;
          minute = prefs.snack_reminder_minute;
          break;
        case 'evening_summary':
          hour = prefs.evening_summary_hour;
          minute = prefs.evening_summary_minute;
          break;
        case 'streak_risk':
          hour = prefs.streak_risk_hour;
          minute = prefs.streak_risk_minute;
          break;
      }

      setPickerDate(timeToDate(hour, minute));
      setPickerTarget(target);
    },
    [prefs],
  );

  const handleTimeChange = useCallback(
    (_event: DateTimePickerEvent, date?: Date) => {
      if (Platform.OS === 'android') {
        setPickerTarget(null);
      }

      if (!date || !pickerTarget) return;

      const hour = date.getHours();
      const minute = date.getMinutes();

      switch (pickerTarget) {
        case 'breakfast':
          updatePref({ breakfast_reminder_hour: hour, breakfast_reminder_minute: minute });
          break;
        case 'lunch':
          updatePref({ lunch_reminder_hour: hour, lunch_reminder_minute: minute });
          break;
        case 'dinner':
          updatePref({ dinner_reminder_hour: hour, dinner_reminder_minute: minute });
          break;
        case 'snack':
          updatePref({ snack_reminder_hour: hour, snack_reminder_minute: minute });
          break;
        case 'evening_summary':
          updatePref({ evening_summary_hour: hour, evening_summary_minute: minute });
          break;
        case 'streak_risk':
          updatePref({ streak_risk_hour: hour, streak_risk_minute: minute });
          break;
      }
    },
    [pickerTarget, updatePref],
  );

  if (loading || !prefs) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.surface }]}>
        <View style={[styles.header, { backgroundColor: c.bg, borderBottomColor: c.grayLight }]}>
          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: c.surface }]}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={20} color={c.black} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: c.black }]}>Notificaciones</Text>
          <View style={styles.backButton} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={c.accent} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: c.surface }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: c.bg, borderBottomColor: c.grayLight }]}>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: c.surface }]}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={20} color={c.black} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.black }]}>Notificaciones</Text>
        {saving ? (
          <ActivityIndicator size="small" color={c.accent} style={{ width: 36 }} />
        ) : (
          <View style={{ width: 36 }} />
        )}
      </View>

      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          bounces={true}
          contentContainerStyle={styles.scroll}
        >
          {/* Master toggle */}
          <SectionHeader title="General" c={c} />
          <Card c={c}>
            <ToggleRow
              icon="notifications-outline"
              iconColor={c.accent}
              label="Notificaciones push"
              subtitle="Activar/desactivar todas las notificaciones"
              value={prefs.notifications_enabled}
              onToggle={(v) => updatePref({ notifications_enabled: v })}
              isLast
              c={c}
            />
          </Card>

          {prefs.notifications_enabled && (
            <>
              {/* ── Meal reminders ── */}
              <SectionHeader title="Recordatorios de comidas" c={c} />
              <Card c={c}>
                <ToggleRow
                  icon="restaurant-outline"
                  iconColor="#10B981"
                  label="Recordatorios de comidas"
                  subtitle="Recibe recordatorios antes de cada comida"
                  value={prefs.meal_reminders_enabled}
                  onToggle={(v) => updatePref({ meal_reminders_enabled: v })}
                  c={c}
                />
                {prefs.meal_reminders_enabled && (
                  <>
                    <ToggleRow
                      icon="analytics-outline"
                      iconColor={c.accent}
                      label="Horarios inteligentes (IA)"
                      subtitle="Usa tus patrones de logueo para predecir horarios"
                      value={prefs.use_predicted_times}
                      onToggle={(v) => updatePref({ use_predicted_times: v })}
                      c={c}
                    />

                    {prefs.use_predicted_times ? (
                      <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.sm }}>
                        <PredictedTimeBadge predictions={predictions} c={c} />
                      </View>
                    ) : (
                      <>
                        <TimeRow
                          icon="sunny-outline"
                          iconColor="#F59E0B"
                          label="Desayuno"
                          hour={prefs.breakfast_reminder_hour}
                          minute={prefs.breakfast_reminder_minute}
                          onPress={() => openTimePicker('breakfast')}
                          c={c}
                        />
                        <TimeRow
                          icon="restaurant-outline"
                          iconColor="#10B981"
                          label="Almuerzo"
                          hour={prefs.lunch_reminder_hour}
                          minute={prefs.lunch_reminder_minute}
                          onPress={() => openTimePicker('lunch')}
                          c={c}
                        />
                        <TimeRow
                          icon="moon-outline"
                          iconColor="#6366F1"
                          label="Cena"
                          hour={prefs.dinner_reminder_hour}
                          minute={prefs.dinner_reminder_minute}
                          onPress={() => openTimePicker('dinner')}
                          c={c}
                        />
                        <TimeRow
                          icon="cafe-outline"
                          iconColor="#EC4899"
                          label="Snack"
                          hour={prefs.snack_reminder_hour}
                          minute={prefs.snack_reminder_minute}
                          onPress={() => openTimePicker('snack')}
                          isLast
                          c={c}
                        />
                      </>
                    )}
                  </>
                )}
              </Card>

              {/* Preview */}
              {prefs.meal_reminders_enabled && (
                <PreviewCard preview={PREVIEWS.meal_reminder} c={c} />
              )}

              {/* ── Evening summary ── */}
              <SectionHeader title="Resumen nocturno" c={c} />
              <Card c={c}>
                <ToggleRow
                  icon="stats-chart-outline"
                  iconColor="#6366F1"
                  label="Resumen del dia"
                  subtitle="Recibe un resumen de calorias y macros al final del dia"
                  value={prefs.evening_summary_enabled}
                  onToggle={(v) => updatePref({ evening_summary_enabled: v })}
                  c={c}
                />
                {prefs.evening_summary_enabled && (
                  <TimeRow
                    icon="time-outline"
                    iconColor="#6366F1"
                    label="Hora del resumen"
                    hour={prefs.evening_summary_hour}
                    minute={prefs.evening_summary_minute}
                    onPress={() => openTimePicker('evening_summary')}
                    isLast
                    c={c}
                  />
                )}
              </Card>

              {prefs.evening_summary_enabled && (
                <PreviewCard preview={PREVIEWS.evening_summary} c={c} />
              )}

              {/* ── Streak alerts ── */}
              <SectionHeader title="Rachas" c={c} />
              <Card c={c}>
                <ToggleRow
                  icon="flame-outline"
                  iconColor="#EF4444"
                  label="Alerta de racha en riesgo"
                  subtitle="Te avisamos si tu racha puede perderse"
                  value={prefs.streak_alerts_enabled}
                  onToggle={(v) => updatePref({ streak_alerts_enabled: v })}
                  c={c}
                />
                {prefs.streak_alerts_enabled && (
                  <TimeRow
                    icon="time-outline"
                    iconColor="#EF4444"
                    label="Hora de alerta"
                    hour={prefs.streak_risk_hour}
                    minute={prefs.streak_risk_minute}
                    onPress={() => openTimePicker('streak_risk')}
                    c={c}
                  />
                )}
                <ToggleRow
                  icon="trophy-outline"
                  iconColor="#F59E0B"
                  label="Celebraciones de racha"
                  subtitle="Celebra al alcanzar 3, 7, 14, 30, 60, 100 dias"
                  value={prefs.streak_celebrations_enabled}
                  onToggle={(v) => updatePref({ streak_celebrations_enabled: v })}
                  isLast
                  c={c}
                />
              </Card>

              {prefs.streak_alerts_enabled && (
                <PreviewCard preview={PREVIEWS.streak_risk} c={c} />
              )}
              {prefs.streak_celebrations_enabled && (
                <PreviewCard preview={PREVIEWS.streak_celebration} c={c} />
              )}

              {/* ── Inactivity ── */}
              <SectionHeader title="Inactividad" c={c} />
              <Card c={c}>
                <ToggleRow
                  icon="heart-outline"
                  iconColor="#EC4899"
                  label="Recordatorio de inactividad"
                  subtitle={`Te notificamos si no usas la app por ${prefs.inactivity_days_threshold} dias`}
                  value={prefs.inactivity_nudge_enabled}
                  onToggle={(v) => updatePref({ inactivity_nudge_enabled: v })}
                  isLast
                  c={c}
                />
              </Card>

              {prefs.inactivity_nudge_enabled && (
                <PreviewCard preview={PREVIEWS.inactivity} c={c} />
              )}

              {/* ── Water reminders ── */}
              <SectionHeader title="Agua" c={c} />
              <Card c={c}>
                <ToggleRow
                  icon="water-outline"
                  iconColor="#3B82F6"
                  label="Recordatorios de agua"
                  subtitle={`Cada ${prefs.water_reminder_interval_hours} horas`}
                  value={prefs.water_reminders_enabled}
                  onToggle={(v) => updatePref({ water_reminders_enabled: v })}
                  isLast
                  c={c}
                />
              </Card>

              {/* ── Test notification ── */}
              <SectionHeader title="Prueba" c={c} />
              <Card c={c}>
                <TouchableOpacity
                  style={[styles.row, { justifyContent: 'center' }]}
                  onPress={handleTestNotification}
                  activeOpacity={0.6}
                  disabled={sendingTest}
                >
                  {sendingTest ? (
                    <ActivityIndicator size="small" color={c.accent} />
                  ) : (
                    <>
                      <Ionicons name="paper-plane-outline" size={18} color={c.accent} />
                      <Text style={[styles.testButton, { color: c.accent }]}>
                        Enviar notificacion de prueba
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </Card>
            </>
          )}

          <View style={{ height: spacing.xxl }} />
        </ScrollView>
      </Animated.View>

      {/* Time picker (iOS inline / Android dialog) */}
      {pickerTarget !== null && Platform.OS === 'ios' && (
        <View style={[styles.pickerOverlay, { backgroundColor: 'rgba(0,0,0,0.4)' }]}>
          <View style={[styles.pickerContainer, { backgroundColor: c.bg }]}>
            <View style={styles.pickerHeader}>
              <TouchableOpacity onPress={() => setPickerTarget(null)}>
                <Text style={[styles.pickerDone, { color: c.accent }]}>Listo</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={pickerDate}
              mode="time"
              display="spinner"
              onChange={handleTimeChange}
              locale="es-CL"
            />
          </View>
        </View>
      )}

      {pickerTarget !== null && Platform.OS === 'android' && (
        <DateTimePicker
          value={pickerDate}
          mode="time"
          display="default"
          onChange={handleTimeChange}
        />
      )}
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typography.titleSm,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  sectionHeader: {
    ...typography.caption,
    fontWeight: '600',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    marginLeft: spacing.sm,
  },
  card: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    gap: spacing.sm,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    ...typography.bodyMd,
    flex: 1,
  },
  rowSubtitle: {
    ...typography.caption,
    marginTop: 2,
  },
  timeValue: {
    ...typography.label,
    marginRight: 4,
  },
  // Preview card
  previewCard: {
    flexDirection: 'row',
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.sm,
    alignItems: 'flex-start',
  },
  previewIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewApp: {
    ...typography.caption,
    fontWeight: '600',
  },
  previewTime: {
    ...typography.caption,
  },
  previewBody: {
    ...typography.caption,
    marginTop: 2,
    lineHeight: 18,
  },
  // Prediction badge
  predictionBadge: {
    flexDirection: 'row',
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  predictionLabel: {
    ...typography.caption,
    fontWeight: '600',
  },
  predictionText: {
    ...typography.caption,
  },
  // Test button
  testButton: {
    ...typography.label,
    marginLeft: spacing.xs,
  },
  // Time picker
  pickerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    zIndex: 100,
  },
  pickerContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 20,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: spacing.md,
  },
  pickerDone: {
    ...typography.label,
    fontWeight: '700',
  },
});
