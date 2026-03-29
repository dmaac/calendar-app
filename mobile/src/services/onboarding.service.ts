/**
 * onboarding.service.ts
 * Sincroniza el estado del onboarding con el backend.
 * El context local (AsyncStorage) es la fuente de verdad durante el onboarding.
 * Al completar el step 25 (Account), se sincroniza todo con el backend.
 */
import { api } from './api';
import { OnboardingData } from '../context/OnboardingContext';
import { OnboardingProfileRead } from '../types';

/**
 * Payload accepted by POST /api/onboarding/save-step (snake_case, all optional).
 * Mirrors the backend OnboardingStepSave Pydantic schema.
 */
export interface ProfileUpdatePayload {
  gender?: string;
  workouts_per_week?: number;
  heard_from?: string;
  used_other_apps?: boolean;
  height_cm?: number;
  weight_kg?: number;
  unit_system?: string;
  birth_date?: string;
  goal?: string;
  target_weight_kg?: number;
  weekly_speed_kg?: number;
  pain_points?: string;
  diet_type?: string;
  accomplishments?: string;
  health_connected?: boolean;
  notifications_enabled?: boolean;
  referral_code?: string;
  daily_calories?: number;
  daily_protein_g?: number;
  daily_carbs_g?: number;
  daily_fats_g?: number;
}

/** Maps camelCase OnboardingData keys to snake_case backend keys. */
function toSnakeCase(partial: Partial<OnboardingData>): ProfileUpdatePayload {
  const payload: ProfileUpdatePayload = {};
  if (partial.gender !== undefined)             payload.gender = partial.gender || undefined;
  if (partial.workoutsPerWeek !== undefined)     payload.workouts_per_week = mapWorkoutsToInt(partial.workoutsPerWeek);
  if (partial.heardFrom !== undefined)           payload.heard_from = partial.heardFrom || undefined;
  if (partial.usedOtherApps !== undefined)       payload.used_other_apps = partial.usedOtherApps ?? undefined;
  if (partial.heightCm !== undefined)            payload.height_cm = partial.heightCm;
  if (partial.weightKg !== undefined)            payload.weight_kg = partial.weightKg;
  if (partial.unitSystem !== undefined)          payload.unit_system = partial.unitSystem;
  if (partial.birthDate !== undefined)           payload.birth_date = formatBirthDate(partial.birthDate);
  if (partial.goal !== undefined)                payload.goal = partial.goal || undefined;
  if (partial.targetWeightKg !== undefined)      payload.target_weight_kg = partial.targetWeightKg;
  if (partial.weeklySpeedKg !== undefined)       payload.weekly_speed_kg = partial.weeklySpeedKg;
  if (partial.dietType !== undefined)            payload.diet_type = partial.dietType || undefined;
  if (partial.healthConnected !== undefined)     payload.health_connected = partial.healthConnected;
  if (partial.notificationsEnabled !== undefined) payload.notifications_enabled = partial.notificationsEnabled;
  if (partial.referralCode !== undefined)        payload.referral_code = partial.referralCode || undefined;
  return payload;
}

/** Guarda un paso parcial del onboarding en el backend (camelCase -> snake_case). */
export const saveOnboardingStep = async (partial: Partial<OnboardingData>): Promise<void> => {
  const payload = toSnakeCase(partial);
  await api.post('/api/onboarding/save-step', payload);
};

/**
 * Update the user's profile directly with snake_case fields.
 * Used by EditProfileScreen where values are already in backend format.
 */
export const updateProfile = async (payload: ProfileUpdatePayload): Promise<OnboardingProfileRead> => {
  const res = await api.post('/api/onboarding/save-step', payload);
  return res.data;
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
