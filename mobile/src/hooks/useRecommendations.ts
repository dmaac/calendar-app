/**
 * useRecommendations — Fetches meal recommendations from backend.
 *
 * Returns recommended meals, remaining macros, loading/error state.
 * Auto-refetches on screen focus. Passes meal_type based on current hour.
 */
import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { apiClient } from '../services/apiClient';

export interface RecommendedMeal {
  id: number;
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
  prep_time_min: number;
  difficulty: 1 | 2 | 3;
  category: string;
  meal_type: string;
  ingredients: string[];
  image_url?: string | null;
}

export interface RemainingMacros {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
}

interface RecommendationsResponse {
  meals: RecommendedMeal[];
  remaining: RemainingMacros;
}

function getCurrentMealType(): string {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 18) return 'snack';
  return 'dinner';
}

interface UseRecommendationsReturn {
  meals: RecommendedMeal[];
  remaining: RemainingMacros;
  loading: boolean;
  error: boolean;
  refetch: () => Promise<void>;
}

export default function useRecommendations(): UseRecommendationsReturn {
  const [meals, setMeals] = useState<RecommendedMeal[]>([]);
  const [remaining, setRemaining] = useState<RemainingMacros>({
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fats_g: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetch = useCallback(async () => {
    setError(false);
    setLoading(true);
    try {
      const mealType = getCurrentMealType();
      const res = await apiClient.get<RecommendationsResponse>('/api/recommendations', {
        params: { meal_type: mealType },
      });
      setMeals(res.data.meals ?? []);
      setRemaining(res.data.remaining ?? { calories: 0, protein_g: 0, carbs_g: 0, fats_g: 0 });
    } catch {
      setError(true);
      setMeals([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetch();
    }, [fetch])
  );

  return { meals, remaining, loading, error, refetch: fetch };
}
