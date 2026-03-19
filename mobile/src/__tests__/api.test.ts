// All mock state lives inside the factory so it's available when hoisted
jest.mock('axios', () => {
  const instance = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  };
  return { default: { create: jest.fn(() => instance) }, create: jest.fn(() => instance) };
});

import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';

// Grab the mock instance axios.create returned
const mockApi = (axios.create as jest.Mock).mock.results[0]?.value ?? (axios as any).create();

describe('ApiService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  });

  describe('getCurrentUser', () => {
    it('fetches current user from /auth/me', async () => {
      const mockUser = {
        id: 1,
        email: 'test@test.com',
        first_name: 'Test',
        last_name: 'User',
      };
      mockApi.get.mockResolvedValue({ data: mockUser });

      const result = await api.getCurrentUser();

      expect(mockApi.get).toHaveBeenCalledWith('/auth/me');
      expect(result).toEqual(mockUser);
    });
  });

  describe('searchFoods', () => {
    it('searches foods with query param', async () => {
      const mockFoods = [{ id: 1, name: 'Chicken', calories: 165 }];
      mockApi.get.mockResolvedValue({ data: mockFoods });

      const result = await api.searchFoods('Chicken', 10);

      expect(mockApi.get).toHaveBeenCalledWith(
        expect.stringContaining('/foods/')
      );
      expect(mockApi.get).toHaveBeenCalledWith(
        expect.stringContaining('query=Chicken')
      );
      expect(result).toEqual(mockFoods);
    });

    it('searches foods without query', async () => {
      mockApi.get.mockResolvedValue({ data: [] });

      const result = await api.searchFoods(undefined, 50);

      expect(mockApi.get).toHaveBeenCalledWith(
        expect.stringContaining('/foods/')
      );
      expect(result).toEqual([]);
    });
  });

  describe('getFood', () => {
    it('fetches a single food by id', async () => {
      const mockFood = { id: 5, name: 'Rice', calories: 130 };
      mockApi.get.mockResolvedValue({ data: mockFood });

      const result = await api.getFood(5);

      expect(mockApi.get).toHaveBeenCalledWith('/foods/5');
      expect(result).toEqual(mockFood);
    });
  });

  describe('logMeal', () => {
    it('posts meal data to /meals/', async () => {
      const mealData = {
        date: '2025-01-15',
        meal_type: 'lunch' as const,
        food_id: 1,
        servings: 1.5,
      };
      const mockResponse = {
        id: 1,
        ...mealData,
        total_calories: 247.5,
        total_protein: 46.5,
        total_carbs: 0,
        total_fat: 5.4,
      };
      mockApi.post.mockResolvedValue({ data: mockResponse });

      const result = await api.logMeal(mealData);

      expect(mockApi.post).toHaveBeenCalledWith('/meals/', mealData);
      expect(result.total_calories).toBe(247.5);
    });
  });

  describe('getMeals', () => {
    it('fetches meals for a specific date', async () => {
      const mockMeals = [
        { id: 1, date: '2025-01-15', meal_type: 'lunch' },
      ];
      mockApi.get.mockResolvedValue({ data: mockMeals });

      const result = await api.getMeals('2025-01-15');

      expect(mockApi.get).toHaveBeenCalledWith(
        '/meals/?target_date=2025-01-15'
      );
      expect(result).toEqual(mockMeals);
    });
  });

  describe('deleteMeal', () => {
    it('sends DELETE request for a meal', async () => {
      mockApi.delete.mockResolvedValue({ data: {} });

      await api.deleteMeal(42);

      expect(mockApi.delete).toHaveBeenCalledWith('/meals/42');
    });
  });

  describe('getDailySummary', () => {
    it('fetches daily summary', async () => {
      const mockSummary = {
        date: '2025-01-15',
        total_calories: 1500,
        target_calories: 2000,
        meals_count: 3,
      };
      mockApi.get.mockResolvedValue({ data: mockSummary });

      const result = await api.getDailySummary('2025-01-15');

      expect(mockApi.get).toHaveBeenCalledWith(
        '/meals/summary?target_date=2025-01-15'
      );
      expect(result.total_calories).toBe(1500);
    });
  });

  describe('updateWater', () => {
    it('posts water update', async () => {
      mockApi.post.mockResolvedValue({ data: {} });

      await api.updateWater('2025-01-15', 2500);

      expect(mockApi.post).toHaveBeenCalledWith(
        '/meals/water?target_date=2025-01-15&water_ml=2500'
      );
    });
  });

  describe('getNutritionProfile', () => {
    it('fetches nutrition profile', async () => {
      const mockProfile = {
        id: 1,
        target_calories: 2000,
        target_protein_g: 150,
      };
      mockApi.get.mockResolvedValue({ data: mockProfile });

      const result = await api.getNutritionProfile();

      expect(mockApi.get).toHaveBeenCalledWith('/nutrition-profile/');
      expect(result.target_calories).toBe(2000);
    });
  });

  describe('createOrUpdateNutritionProfile', () => {
    it('posts profile data', async () => {
      const profileData = {
        height_cm: 180,
        weight_kg: 80,
        age: 30,
        gender: 'male' as const,
        activity_level: 'moderately_active' as const,
        goal: 'maintain' as const,
      };
      mockApi.post.mockResolvedValue({
        data: { id: 1, ...profileData, target_calories: 2759 },
      });

      const result = await api.createOrUpdateNutritionProfile(profileData);

      expect(mockApi.post).toHaveBeenCalledWith(
        '/nutrition-profile/',
        profileData
      );
      expect(result.target_calories).toBe(2759);
    });
  });

  describe('calculateTargets', () => {
    it('posts calculation request and returns macro targets', async () => {
      const mockTargets = {
        target_calories: 2759,
        target_protein_g: 207,
        target_carbs_g: 276,
        target_fat_g: 92,
      };
      mockApi.post.mockResolvedValue({ data: mockTargets });

      const result = await api.calculateTargets(180, 80, 30, 'male', 'moderately_active', 'maintain');

      expect(mockApi.post).toHaveBeenCalledWith(
        '/nutrition-profile/calculate-targets',
        {
          height_cm: 180,
          weight_kg: 80,
          age: 30,
          gender: 'male',
          activity_level: 'moderately_active',
          goal: 'maintain',
        }
      );
      expect(result).toEqual(mockTargets);
    });
  });

  describe('getActivities', () => {
    it('fetches activities with date range', async () => {
      const mockActivities = [{ id: 1, title: 'Workout' }];
      mockApi.get.mockResolvedValue({ data: mockActivities });

      const result = await api.getActivities('2025-01-01', '2025-01-31');

      expect(mockApi.get).toHaveBeenCalledWith(
        expect.stringContaining('/activities/')
      );
      expect(result).toEqual(mockActivities);
    });

    it('fetches activities without date params', async () => {
      mockApi.get.mockResolvedValue({ data: [] });

      const result = await api.getActivities();

      expect(mockApi.get).toHaveBeenCalledWith(
        expect.stringContaining('/activities/')
      );
      expect(result).toEqual([]);
    });
  });

  describe('deleteActivity', () => {
    it('sends DELETE for activity', async () => {
      mockApi.delete.mockResolvedValue({ data: {} });

      await api.deleteActivity(10);

      expect(mockApi.delete).toHaveBeenCalledWith('/activities/10');
    });
  });
});
