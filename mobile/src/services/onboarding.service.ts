/**
 * onboarding.service.ts
 * Sincroniza el estado del onboarding con el backend.
 * El context local (AsyncStorage) es la fuente de verdad durante el onboarding.
 * Al completar el step 25 (Account), se sincroniza todo con el backend.
 */
import { api } from './api';
import { OnboardingData } from '../context/OnboardingContext';
import { OnboardingProfileRead } from '../types';

/** Guarda un paso parcial del onboarding en el backend. */
export const saveOnboardingStep = async (partial: Partial<OnboardingData>): Promise<void> => {
  await api.post('/api/onboarding/save-step', partial);
};

/** Completa el onboarding — envía todos los datos y recibe el plan calculado. */
export const completeOnboarding = async (data: OnboardingData): Promise<OnboardingProfileRead> => {
  const payload = {
    gender:                data.gender || null,
    workouts_per_week:     mapWorkoutsToInt(data.workoutsPerWeek),
    heard_from:            data.heardFrom || null,
    used_other_apps:       data.usedOtherApps,
    height_cm:             data.heightCm,
    weight_kg:             data.weightKg,
    unit_system:           data.unitSystem,
    birth_date:            formatBirthDate(data.birthDate),
    goal:                  data.goal || null,
    target_weight_kg:      data.targetWeightKg,
    weekly_speed_kg:       data.weeklySpeedKg,
    pain_points:           data.painPoints.length  ? JSON.stringify(data.painPoints)  : null,
    diet_type:             data.dietType || null,
    accomplishments:       data.accomplishments.length ? JSON.stringify(data.accomplishments) : null,
    health_connected:      data.healthConnected,
    notifications_enabled: data.notificationsEnabled,
    referral_code:         data.referralCode || null,
  };
  const res = await api.post('/api/onboarding/complete', payload);
  return res.data;
};

/** Obtiene el perfil de onboarding guardado en el backend. */
export const getOnboardingProfile = async (): Promise<OnboardingProfileRead> => {
  const res = await api.get('/api/onboarding/profile');
  return res.data;
};

function formatBirthDate(bd: { monthIndex: number; day: number; year: number }): string {
  const m = String(bd.monthIndex + 1).padStart(2, '0');
  const d = String(bd.day).padStart(2, '0');
  return `${bd.year}-${m}-${d}`;
}

/** Convierte el rango de entrenamientos a un entero representativo para el backend. */
function mapWorkoutsToInt(value: string): number {
  switch (value) {
    case '0-2': return 1;
    case '3-5': return 4;
    case '6+':  return 6;
    default:    return 3;
  }
}
