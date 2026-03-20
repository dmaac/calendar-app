/**
 * OnboardingContext tests
 *
 * AsyncStorage is auto-mocked via moduleNameMapper in jest.config.js
 * (maps to @react-native-async-storage/async-storage/jest/async-storage-mock).
 *
 * We use renderHook from @testing-library/react-native (v13+) to mount the
 * provider and exercise the hook in isolation.
 */

import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  OnboardingProvider,
  useOnboarding,
  OnboardingData,
  NutritionPlan,
} from '../context/OnboardingContext';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Wrap the hook under test inside the required provider. */
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <OnboardingProvider>{children}</OnboardingProvider>
);

/**
 * Render useOnboarding and wait until AsyncStorage load is complete
 * (isLoaded transitions from false → true).
 */
async function renderAndWait() {
  const hook = renderHook(() => useOnboarding(), { wrapper });
  await waitFor(() => expect(hook.result.current.isLoaded).toBe(true));
  return hook;
}

// ─── Setup / teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  // Start every test with a clean AsyncStorage so persisted state
  // from one test cannot bleed into the next.
  (AsyncStorage.clear as jest.Mock).mockClear();
  jest.clearAllMocks();
});

// ─── Test suite ──────────────────────────────────────────────────────────────

describe('OnboardingContext', () => {

  // ── 1. Default data values ─────────────────────────────────────────────────
  describe('default data values', () => {
    it('sets correct primitive defaults', async () => {
      const { result } = await renderAndWait();
      const { data } = result.current;

      expect(data.gender).toBe('');
      expect(data.workoutsPerWeek).toBe('');
      expect(data.heardFrom).toBe('');
      expect(data.usedOtherApps).toBeNull();
      expect(data.heightCm).toBe(170);
      expect(data.weightKg).toBe(70);
      expect(data.unitSystem).toBe('metric');
      expect(data.goal).toBe('');
      expect(data.targetWeightKg).toBe(65);
      expect(data.weeklySpeedKg).toBe(0.8);
      expect(data.dietType).toBe('');
      expect(data.healthConnected).toBe(false);
      expect(data.notificationsEnabled).toBe(false);
      expect(data.referralCode).toBe('');
      expect(data.plan).toBeNull();
    });

    it('sets correct array defaults (empty arrays)', async () => {
      const { result } = await renderAndWait();
      const { data } = result.current;

      expect(data.painPoints).toEqual([]);
      expect(data.accomplishments).toEqual([]);
    });

    it('sets correct birthDate defaults', async () => {
      const { result } = await renderAndWait();
      const { birthDate } = result.current.data;

      expect(birthDate.monthIndex).toBe(0);
      expect(birthDate.day).toBe(1);
      expect(birthDate.year).toBe(1995);
    });

    it('initialises currentStep to 1', async () => {
      const { result } = await renderAndWait();
      expect(result.current.currentStep).toBe(1);
    });

    it('exposes isLoaded as true after mount', async () => {
      const { result } = await renderAndWait();
      expect(result.current.isLoaded).toBe(true);
    });
  });

  // ── 2. update() ────────────────────────────────────────────────────────────
  describe('update()', () => {
    it('changes a single string field without affecting others', async () => {
      const { result } = await renderAndWait();

      act(() => {
        result.current.update('gender', 'Female');
      });

      expect(result.current.data.gender).toBe('Female');
      // Unrelated field must be unchanged
      expect(result.current.data.heightCm).toBe(170);
    });

    it('changes a numeric field', async () => {
      const { result } = await renderAndWait();

      act(() => {
        result.current.update('weightKg', 80);
      });

      expect(result.current.data.weightKg).toBe(80);
    });

    it('changes a boolean field', async () => {
      const { result } = await renderAndWait();

      act(() => {
        result.current.update('healthConnected', true);
      });

      expect(result.current.data.healthConnected).toBe(true);
    });

    it('changes a nested object field (birthDate)', async () => {
      const { result } = await renderAndWait();
      const newBirthDate = { monthIndex: 5, day: 15, year: 1990 };

      act(() => {
        result.current.update('birthDate', newBirthDate);
      });

      expect(result.current.data.birthDate).toEqual(newBirthDate);
    });

    it('persists the updated value to AsyncStorage', async () => {
      const { result } = await renderAndWait();

      act(() => {
        result.current.update('goal', 'lose');
      });

      await waitFor(() => {
        expect(AsyncStorage.setItem).toHaveBeenCalledWith(
          'onboarding_data_v2',
          expect.stringContaining('"goal":"lose"')
        );
      });
    });
  });

  // ── 3. updateMany() ────────────────────────────────────────────────────────
  describe('updateMany()', () => {
    it('changes multiple fields in one call', async () => {
      const { result } = await renderAndWait();

      act(() => {
        result.current.updateMany({
          gender: 'Male',
          goal: 'gain',
          heightCm: 185,
        });
      });

      expect(result.current.data.gender).toBe('Male');
      expect(result.current.data.goal).toBe('gain');
      expect(result.current.data.heightCm).toBe(185);
    });

    it('does not overwrite fields that are not in the partial object', async () => {
      // Ensure no stale AsyncStorage data from previous tests affects hydration
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      const { result } = await renderAndWait();

      act(() => {
        result.current.updateMany({ gender: 'Female' });
      });

      // These were untouched by the updateMany call
      expect(result.current.data.weightKg).toBe(70);
      expect(result.current.data.unitSystem).toBe('metric');
    });

    it('can update array fields', async () => {
      const { result } = await renderAndWait();

      act(() => {
        result.current.updateMany({ painPoints: ['stress', 'sleep'] });
      });

      expect(result.current.data.painPoints).toEqual(['stress', 'sleep']);
    });
  });

  // ── 4. computePlan() — valid NutritionPlan with correct calorie range ───────
  describe('computePlan()', () => {
    /**
     * Profile used for all computePlan tests:
     *   Male, 170 cm, 70 kg, born 1990-01-01, goal=lose, workouts=3-5
     *
     * Expected (computed manually using Mifflin-St Jeor):
     *   BMR  = 10*70 + 6.25*170 − 5*36 + 5  = 1587.5
     *   TDEE = round(1587.5 * 1.55)          = 2461
     *   cals = clamp(2461 − 500, 1200, 4000) = 1961
     *   carbs   = round(1961 * 0.40 / 4) = 196
     *   protein = round(1961 * 0.30 / 4) = 147
     *   fats    = round(1961 * 0.30 / 9) = 65
     *   BMI     = 70 / 1.7² ≈ 24.22 → healthScore = 8.5
     *   weeks   = ceil(5 / 0.8) = 7
     */
    async function renderWithLoseProfile() {
      const hook = await renderAndWait();
      act(() => {
        hook.result.current.updateMany({
          gender: 'Male',
          heightCm: 170,
          weightKg: 70,
          targetWeightKg: 65,
          weeklySpeedKg: 0.8,
          birthDate: { monthIndex: 0, day: 1, year: 1990 },
          goal: 'lose',
          workoutsPerWeek: '3-5',
        });
      });
      return hook;
    }

    it('returns a NutritionPlan object with all required fields', async () => {
      const { result } = await renderWithLoseProfile();
      let plan: NutritionPlan;

      act(() => {
        plan = result.current.computePlan();
      });

      expect(plan!).toBeDefined();
      expect(typeof plan!.dailyCalories).toBe('number');
      expect(typeof plan!.dailyCarbsG).toBe('number');
      expect(typeof plan!.dailyProteinG).toBe('number');
      expect(typeof plan!.dailyFatsG).toBe('number');
      expect(typeof plan!.healthScore).toBe('number');
      expect(typeof plan!.targetDate).toBe('string');
      expect(typeof plan!.weeklyLossKg).toBe('number');
    });

    it('stores the plan on data.plan after computePlan()', async () => {
      const { result } = await renderWithLoseProfile();

      act(() => {
        result.current.computePlan();
      });

      expect(result.current.data.plan).not.toBeNull();
    });

    it('returns dailyCalories within the enforced 1200–4000 range', async () => {
      const { result } = await renderWithLoseProfile();
      let plan: NutritionPlan;

      act(() => {
        plan = result.current.computePlan();
      });

      expect(plan!.dailyCalories).toBeGreaterThanOrEqual(1200);
      expect(plan!.dailyCalories).toBeLessThanOrEqual(4000);
    });

    it('returns correct calorie value for male/lose profile', async () => {
      const { result } = await renderWithLoseProfile();
      let plan: NutritionPlan;

      act(() => {
        plan = result.current.computePlan();
      });

      expect(plan!.dailyCalories).toBe(1961);
    });

    it('returns correct macros for male/lose profile', async () => {
      const { result } = await renderWithLoseProfile();
      let plan: NutritionPlan;

      act(() => {
        plan = result.current.computePlan();
      });

      expect(plan!.dailyCarbsG).toBe(196);
      expect(plan!.dailyProteinG).toBe(147);
      expect(plan!.dailyFatsG).toBe(65);
    });

    it('returns correct healthScore for normal-BMI profile (8.5)', async () => {
      const { result } = await renderWithLoseProfile();
      let plan: NutritionPlan;

      act(() => {
        plan = result.current.computePlan();
      });

      expect(plan!.healthScore).toBe(8.5);
    });

    it('sets weeklyLossKg to the profile weeklySpeedKg', async () => {
      const { result } = await renderWithLoseProfile();
      let plan: NutritionPlan;

      act(() => {
        plan = result.current.computePlan();
      });

      expect(plan!.weeklyLossKg).toBe(0.8);
    });

    it('returns a valid ISO targetDate string in the future', async () => {
      const { result } = await renderWithLoseProfile();
      let plan: NutritionPlan;

      act(() => {
        plan = result.current.computePlan();
      });

      const targetMs = new Date(plan!.targetDate).getTime();
      expect(isNaN(targetMs)).toBe(false);
      expect(targetMs).toBeGreaterThan(Date.now());
    });

    it('adds a 400-calorie surplus for goal=gain', async () => {
      const { result } = await renderAndWait();

      act(() => {
        result.current.updateMany({
          gender: 'Male',
          heightCm: 170,
          weightKg: 70,
          targetWeightKg: 75,
          weeklySpeedKg: 0.5,
          birthDate: { monthIndex: 0, day: 1, year: 1990 },
          goal: 'gain',
          workoutsPerWeek: '3-5',
        });
      });

      let plan: NutritionPlan;
      act(() => {
        plan = result.current.computePlan();
      });

      // TDEE=2461, surplus=+400 → 2861
      expect(plan!.dailyCalories).toBe(2861);
    });

    it('applies no adjustment for goal=maintain', async () => {
      const { result } = await renderAndWait();

      act(() => {
        result.current.updateMany({
          gender: 'Male',
          heightCm: 170,
          weightKg: 70,
          targetWeightKg: 70,
          weeklySpeedKg: 0.5,
          birthDate: { monthIndex: 0, day: 1, year: 1990 },
          goal: 'maintain',
          workoutsPerWeek: '3-5',
        });
      });

      let plan: NutritionPlan;
      act(() => {
        plan = result.current.computePlan();
      });

      // TDEE=2461, no deficit → 2461
      expect(plan!.dailyCalories).toBe(2461);
    });
  });

  // ── 5. BMR: Male vs Female produces different results ─────────────────────
  describe('BMR calculation — Male vs Female', () => {
    /**
     * Mifflin-St Jeor constants:
     *   Male   → +5   at the end
     *   Female → −161 at the end
     *
     * Using same base data (170 cm, 70 kg, born 1990-01-01, 3-5 workouts, goal=lose):
     *   BMR male   = 1587.5  → TDEE = 2461 → cals = 1961
     *   BMR female = 1421.5  → TDEE = 2203 → cals = 1703
     */
    it('produces higher daily calories for Male than for Female (same inputs)', async () => {
      const baseProfile: Partial<OnboardingData> = {
        heightCm: 170,
        weightKg: 70,
        targetWeightKg: 65,
        weeklySpeedKg: 0.8,
        birthDate: { monthIndex: 0, day: 1, year: 1990 },
        goal: 'lose',
        workoutsPerWeek: '3-5',
      };

      // — Male —
      const maleHook = await renderAndWait();
      act(() => {
        maleHook.result.current.updateMany({ ...baseProfile, gender: 'Male' });
      });
      let malePlan: NutritionPlan;
      act(() => {
        malePlan = maleHook.result.current.computePlan();
      });

      // — Female —
      const femaleHook = await renderAndWait();
      act(() => {
        femaleHook.result.current.updateMany({ ...baseProfile, gender: 'Female' });
      });
      let femalePlan: NutritionPlan;
      act(() => {
        femalePlan = femaleHook.result.current.computePlan();
      });

      expect(malePlan!.dailyCalories).toBeGreaterThan(femalePlan!.dailyCalories);
    });

    it('male calories equal 1961 for the reference profile', async () => {
      const { result } = await renderAndWait();

      act(() => {
        result.current.updateMany({
          gender: 'Male',
          heightCm: 170,
          weightKg: 70,
          targetWeightKg: 65,
          weeklySpeedKg: 0.8,
          birthDate: { monthIndex: 0, day: 1, year: 1990 },
          goal: 'lose',
          workoutsPerWeek: '3-5',
        });
      });

      let plan: NutritionPlan;
      act(() => {
        plan = result.current.computePlan();
      });

      expect(plan!.dailyCalories).toBe(1961);
    });

    it('female calories equal 1703 for the reference profile', async () => {
      const { result } = await renderAndWait();

      act(() => {
        result.current.updateMany({
          gender: 'Female',
          heightCm: 170,
          weightKg: 70,
          targetWeightKg: 65,
          weeklySpeedKg: 0.8,
          birthDate: { monthIndex: 0, day: 1, year: 1990 },
          goal: 'lose',
          workoutsPerWeek: '3-5',
        });
      });

      let plan: NutritionPlan;
      act(() => {
        plan = result.current.computePlan();
      });

      expect(plan!.dailyCalories).toBe(1703);
    });

    it('the calorie difference between Male and Female is exactly 258', async () => {
      // Δ = (TDEE_male − TDEE_female) = round(166 * 1.55) = round(257) = 258
      const baseProfile: Partial<OnboardingData> = {
        heightCm: 170,
        weightKg: 70,
        targetWeightKg: 65,
        weeklySpeedKg: 0.8,
        birthDate: { monthIndex: 0, day: 1, year: 1990 },
        goal: 'lose',
        workoutsPerWeek: '3-5',
      };

      const maleHook = await renderAndWait();
      act(() => {
        maleHook.result.current.updateMany({ ...baseProfile, gender: 'Male' });
      });
      let malePlan: NutritionPlan;
      act(() => {
        malePlan = maleHook.result.current.computePlan();
      });

      const femaleHook = await renderAndWait();
      act(() => {
        femaleHook.result.current.updateMany({ ...baseProfile, gender: 'Female' });
      });
      let femalePlan: NutritionPlan;
      act(() => {
        femalePlan = femaleHook.result.current.computePlan();
      });

      expect(malePlan!.dailyCalories - femalePlan!.dailyCalories).toBe(258);
    });
  });

  // ── 6. setCurrentStep() ────────────────────────────────────────────────────
  describe('setCurrentStep()', () => {
    it('updates currentStep state', async () => {
      const { result } = await renderAndWait();

      act(() => {
        result.current.setCurrentStep(5);
      });

      expect(result.current.currentStep).toBe(5);
    });

    it('persists the step to AsyncStorage', async () => {
      const { result } = await renderAndWait();

      act(() => {
        result.current.setCurrentStep(7);
      });

      await waitFor(() => {
        expect(AsyncStorage.setItem).toHaveBeenCalledWith(
          'onboarding_current_step',
          '7'
        );
      });
    });
  });

  // ── 7. AsyncStorage — hydration on mount ──────────────────────────────────
  describe('AsyncStorage hydration', () => {
    it('restores persisted data from AsyncStorage on mount', async () => {
      const savedData: OnboardingData = {
        gender: 'Female',
        workoutsPerWeek: '6+',
        heardFrom: 'friend',
        usedOtherApps: true,
        heightCm: 165,
        weightKg: 60,
        unitSystem: 'imperial',
        birthDate: { monthIndex: 3, day: 20, year: 1992 },
        goal: 'maintain',
        targetWeightKg: 60,
        weeklySpeedKg: 0.5,
        painPoints: ['cravings'],
        dietType: 'Vegan',
        accomplishments: ['sleep'],
        healthConnected: true,
        notificationsEnabled: true,
        referralCode: 'SAVE10',
        plan: null,
      };

      (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
        if (key === 'onboarding_data_v2') return Promise.resolve(JSON.stringify(savedData));
        if (key === 'onboarding_current_step') return Promise.resolve('12');
        return Promise.resolve(null);
      });

      const { result } = await renderAndWait();

      expect(result.current.data.gender).toBe('Female');
      expect(result.current.data.goal).toBe('maintain');
      expect(result.current.data.referralCode).toBe('SAVE10');
      expect(result.current.currentStep).toBe(12);
    });

    it('uses DEFAULT_DATA when AsyncStorage is empty', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      const { result } = await renderAndWait();

      expect(result.current.data.heightCm).toBe(170);
      expect(result.current.data.weightKg).toBe(70);
      expect(result.current.currentStep).toBe(1);
    });
  });
});
