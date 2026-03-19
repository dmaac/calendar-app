/**
 * food.service.ts
 * AI food scan + meal logs + daily summary.
 * El endpoint /api/food/scan recibe multipart/form-data con la imagen.
 */
import { api } from './api';
import { FoodScanResult, AIFoodLog, DailySummary } from '../types';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

/** Envía una imagen al backend para análisis AI. Retorna macros detectados. */
export const scanFood = async (
  imageUri: string,
  mealType: MealType = 'lunch',
): Promise<FoodScanResult> => {
  const form = new FormData();
  form.append('meal_type', mealType);

  // React Native FormData: uri + name + type
  form.append('image', {
    uri: imageUri,
    name: 'meal.jpg',
    type: 'image/jpeg',
  } as any);

  const res = await api.post('/api/food/scan', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 30000, // AI calls pueden tardar hasta 30s
  });
  return res.data;
};

// Note: scanFood auto-logs on the backend — no separate confirm step needed.

function localDateStr(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Lista los logs de comida del día. */
export const getFoodLogs = async (date?: string): Promise<AIFoodLog[]> => {
  const d = date ?? localDateStr();
  const res = await api.get(`/api/food/logs?date=${d}`);
  return res.data;
};

/** Elimina un log de comida. */
export const deleteFoodLog = async (id: number): Promise<void> => {
  await api.delete(`/api/food/logs/${id}`);
};

/** Edita las macros de un log (usuario corrige el AI). */
export const editFoodLog = async (id: number, updates: Partial<AIFoodLog>): Promise<void> => {
  await api.put(`/api/food/logs/${id}`, null, { params: updates });
};

/** Resumen del día (calorías, macros, progreso vs objetivo). */
export const getDailySummary = async (date?: string): Promise<DailySummary> => {
  const d = date ?? localDateStr();
  const res = await api.get(`/api/dashboard/today?date=${d}`);
  return res.data;
};

export interface ManualFoodEntry {
  food_name: string;
  calories: number;
  carbs_g: number;
  protein_g: number;
  fats_g: number;
  fiber_g?: number;
  serving_size?: string;
  meal_type: MealType;
}

/** Registra un alimento manualmente (sin foto). */
export const manualLogFood = async (entry: ManualFoodEntry): Promise<AIFoodLog> => {
  const res = await api.post('/api/food/manual', entry);
  return res.data;
};

/** Agrega ml de agua al registro diario. */
export const logWater = async (ml: number): Promise<{ water_ml: number }> => {
  const res = await api.post('/api/food/water', { ml });
  return res.data;
};

export interface FoodSuggestion {
  food_name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
  count: number;
}

/** Busca alimentos en el historial del usuario (autocomplete). */
export const searchFoodHistory = async (q: string, limit = 10): Promise<FoodSuggestion[]> => {
  const res = await api.get(`/api/food/search?q=${encodeURIComponent(q)}&limit=${limit}`);
  return res.data;
};
