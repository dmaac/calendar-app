/**
 * OnboardingContext — estado global del onboarding
 * - Persiste en AsyncStorage automáticamente
 * - Se sincroniza con el backend al completar
 * - Calcula el plan nutricional dinámicamente
 */
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Types ──────────────────────────────────────────────────────────────────
export interface OnboardingData {
  // Módulo 03
  gender: 'Male' | 'Female' | 'Other' | '';

  // Módulo 04
  workoutsPerWeek: '0-2' | '3-5' | '6+' | '';

  // Módulo 05
  heardFrom: string;

  // Módulo 06
  usedOtherApps: boolean | null;

  // Módulo 08
  heightCm: number;
  weightKg: number;
  unitSystem: 'metric' | 'imperial';

  // Módulo 09
  birthDate: {
    monthIndex: number;   // 0-11
    day: number;          // 1-31
    year: number;         // ej. 1995
  };

  // Módulo 10
  goal: 'lose' | 'maintain' | 'gain' | '';

  // Módulo 11
  targetWeightKg: number;

  // Módulo 13
  weeklySpeedKg: number;  // 0.1 - 1.5

  // Módulo 15
  painPoints: string[];

  // Módulo 16
  dietType: 'Classic' | 'Pescatarian' | 'Vegetarian' | 'Vegan' | '';

  // Módulo 17
  accomplishments: string[];

  // Módulo 20
  healthConnected: boolean;

  // Módulo 23
  notificationsEnabled: boolean;

  // Módulo 24
  referralCode: string;

  // Calculado al final
  plan: NutritionPlan | null;
}

export interface NutritionPlan {
  dailyCalories: number;
  dailyCarbsG: number;
  dailyProteinG: number;
  dailyFatsG: number;
  healthScore: number;
  targetDate: string;       // ISO date string
  weeklyLossKg: number;
}

interface OnboardingContextType {
  data: OnboardingData;
  update: <K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => void;
  updateMany: (partial: Partial<OnboardingData>) => void;
  computePlan: () => NutritionPlan;
  currentStep: number;
  setCurrentStep: (step: number) => void;
  isLoaded: boolean;
}

// ─── Default values ──────────────────────────────────────────────────────────
const DEFAULT_DATA: OnboardingData = {
  gender: '',
  workoutsPerWeek: '',
  heardFrom: '',
  usedOtherApps: null,
  heightCm: 170,
  weightKg: 70,
  unitSystem: 'metric',
  birthDate: { monthIndex: 0, day: 1, year: 1995 },
  goal: '',
  targetWeightKg: 65,
  weeklySpeedKg: 0.8,
  painPoints: [],
  dietType: '',
  accomplishments: [],
  healthConnected: false,
  notificationsEnabled: false,
  referralCode: '',
  plan: null,
};

const STORAGE_KEY = 'onboarding_data_v2';
const STEP_KEY = 'onboarding_current_step';

// ─── Context ─────────────────────────────────────────────────────────────────
const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export const useOnboarding = () => {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used inside OnboardingProvider');
  return ctx;
};

// ─── Plan calculator ─────────────────────────────────────────────────────────
function calculatePlan(data: OnboardingData): NutritionPlan {
  const { heightCm, weightKg, birthDate, goal, targetWeightKg, weeklySpeedKg, gender } = data;

  // Edad
  const age = new Date().getFullYear() - birthDate.year;

  // BMR — Fórmula Mifflin-St Jeor
  const bmr = gender === 'Female'
    ? 10 * weightKg + 6.25 * heightCm - 5 * age - 161
    : 10 * weightKg + 6.25 * heightCm - 5 * age + 5;

  // Factor de actividad según workouts
  const activityMultiplier =
    data.workoutsPerWeek === '6+' ? 1.725 :
    data.workoutsPerWeek === '3-5' ? 1.55 :
    1.375; // 0-2

  const tdee = Math.round(bmr * activityMultiplier);

  // Ajuste según objetivo
  const deficit =
    goal === 'lose' ? -500 :
    goal === 'gain' ? +400 :
    0;

  const dailyCalories = Math.max(1200, Math.min(4000, tdee + deficit));

  // Macros
  const dailyCarbsG    = Math.round((dailyCalories * 0.45) / 4);
  const dailyProteinG  = Math.round((dailyCalories * 0.25) / 4);
  const dailyFatsG     = Math.round((dailyCalories * 0.30) / 9);

  // Fecha objetivo
  const weightDiff = Math.abs(weightKg - targetWeightKg);
  const weeksNeeded = weightDiff > 0 ? Math.ceil(weightDiff / weeklySpeedKg) : 12;
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + weeksNeeded * 7);

  // Health score (heurístico)
  const bmi = weightKg / Math.pow(heightCm / 100, 2);
  const healthScore = bmi >= 18.5 && bmi <= 24.9 ? 8.5 :
                      bmi >= 25 && bmi <= 29.9 ? 7.0 :
                      bmi < 18.5 ? 6.5 : 5.5;

  return {
    dailyCalories,
    dailyCarbsG,
    dailyProteinG,
    dailyFatsG,
    healthScore,
    targetDate: targetDate.toISOString(),
    weeklyLossKg: weeklySpeedKg,
  };
}

// ─── Provider ────────────────────────────────────────────────────────────────
export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<OnboardingData>(DEFAULT_DATA);
  const [currentStep, setCurrentStepState] = useState(1);
  const [isLoaded, setIsLoaded] = useState(false);

  // Cargar desde AsyncStorage al iniciar
  useEffect(() => {
    (async () => {
      try {
        const [savedData, savedStep] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(STEP_KEY),
        ]);
        if (savedData) setData(JSON.parse(savedData));
        if (savedStep) setCurrentStepState(parseInt(savedStep, 10));
      } catch (e) {
        console.warn('OnboardingContext: error loading from storage', e);
      } finally {
        setIsLoaded(true);
      }
    })();
  }, []);

  // Persistir cada vez que cambia
  useEffect(() => {
    if (!isLoaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch(console.warn);
  }, [data, isLoaded]);

  const setCurrentStep = useCallback((step: number) => {
    setCurrentStepState(step);
    AsyncStorage.setItem(STEP_KEY, String(step)).catch(console.warn);
  }, []);

  const update = useCallback(<K extends keyof OnboardingData>(
    key: K,
    value: OnboardingData[K]
  ) => {
    setData(prev => ({ ...prev, [key]: value }));
  }, []);

  const updateMany = useCallback((partial: Partial<OnboardingData>) => {
    setData(prev => ({ ...prev, ...partial }));
  }, []);

  const computePlan = useCallback(() => {
    const plan = calculatePlan(data);
    setData(prev => ({ ...prev, plan }));
    return plan;
  }, [data]);

  return (
    <OnboardingContext.Provider value={{
      data,
      update,
      updateMany,
      computePlan,
      currentStep,
      setCurrentStep,
      isLoaded,
    }}>
      {children}
    </OnboardingContext.Provider>
  );
}
