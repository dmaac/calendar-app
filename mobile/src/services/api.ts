import axios, { AxiosInstance } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import {
  User,
  Activity,
  ActivityCreate,
  LoginRequest,
  RegisterRequest,
  Food,
  MealLog,
  MealLogCreate,
  DailySummary,
  NutritionProfile,
  NutritionProfileCreate,
  MacroTargets,
} from '../types';

// Configure base URL based on platform and environment
const getBaseUrl = () => {
  if (__DEV__) {
    // Development mode
    if (Platform.OS === 'web') {
      return 'http://localhost:8000'; // Web browser
    } else if (Platform.OS === 'android') {
      return 'http://10.0.2.2:8000'; // Android emulator localhost
    } else {
      // Physical device or iOS simulator - use local network IP
      return 'http://172.20.10.13:8000';
    }
  } else {
    // Production mode - replace with your production API URL
    return 'http://localhost:8000';
  }
};

const BASE_URL = getBaseUrl();

class ApiService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add token to requests automatically
    this.api.interceptors.request.use(async (config) => {
      const token = await AsyncStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Handle redirects and maintain auth headers
    this.api.interceptors.response.use(
      (response) => response,
      async (error) => {
        const original = error.config;

        // If we get a 307 redirect, retry with the correct URL and maintain headers
        if (error.response?.status === 307 && !original._retry) {
          original._retry = true;
          const redirectUrl = error.response.headers.location;
          if (redirectUrl) {
            const token = await AsyncStorage.getItem('token');
            const newUrl = redirectUrl.startsWith('http') ? redirectUrl : `${BASE_URL}${redirectUrl}`;
            original.url = newUrl;
            if (token) {
              original.headers.Authorization = `Bearer ${token}`;
            }
            return this.api.request(original);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  // Auth endpoints
  async login(credentials: LoginRequest) {
    // OAuth2 expects form-urlencoded with username and password fields
    const params = new URLSearchParams();
    params.append('username', credentials.username);
    params.append('password', credentials.password);

    const response = await this.api.post('/auth/login', params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    return response.data;
  }

  async register(userData: RegisterRequest): Promise<User> {
    const response = await this.api.post('/auth/register', userData);
    return response.data;
  }

  async getCurrentUser(): Promise<User> {
    const response = await this.api.get('/auth/me');
    return response.data;
  }

  // Activity endpoints
  async getActivities(startDate?: string, endDate?: string): Promise<Activity[]> {
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);

    const response = await this.api.get(`/activities/?${params.toString()}`);
    return response.data;
  }

  async getActivity(id: number): Promise<Activity> {
    const response = await this.api.get(`/activities/${id}`);
    return response.data;
  }

  async createActivity(activityData: ActivityCreate): Promise<Activity> {
    const response = await this.api.post('/activities/', activityData);
    return response.data;
  }

  async updateActivity(id: number, activityData: Partial<ActivityCreate>): Promise<Activity> {
    const response = await this.api.put(`/activities/${id}`, activityData);
    return response.data;
  }

  async deleteActivity(id: number): Promise<void> {
    await this.api.delete(`/activities/${id}`);
  }

  // Food endpoints
  async searchFoods(query?: string, limit: number = 50): Promise<Food[]> {
    const params = new URLSearchParams();
    if (query) params.append('query', query);
    params.append('limit', limit.toString());
    const response = await this.api.get(`/foods/?${params.toString()}`);
    return response.data;
  }

  async getFood(id: number): Promise<Food> {
    const response = await this.api.get(`/foods/${id}`);
    return response.data;
  }

  // Meal endpoints
  async logMeal(mealData: MealLogCreate): Promise<MealLog> {
    const response = await this.api.post('/meals/', mealData);
    return response.data;
  }

  async getMeals(date: string): Promise<MealLog[]> {
    const response = await this.api.get(`/meals/?target_date=${date}`);
    return response.data;
  }

  async deleteMeal(id: number): Promise<void> {
    await this.api.delete(`/meals/${id}`);
  }

  async getDailySummary(date: string): Promise<DailySummary> {
    const response = await this.api.get(`/meals/summary?target_date=${date}`);
    return response.data;
  }

  async updateWater(date: string, waterMl: number): Promise<void> {
    await this.api.post(`/meals/water?target_date=${date}&water_ml=${waterMl}`);
  }

  // Nutrition profile endpoints
  async getNutritionProfile(): Promise<NutritionProfile> {
    const response = await this.api.get('/nutrition-profile/');
    return response.data;
  }

  async createOrUpdateNutritionProfile(profileData: NutritionProfileCreate): Promise<NutritionProfile> {
    const response = await this.api.post('/nutrition-profile/', profileData);
    return response.data;
  }

  async calculateTargets(
    heightCm: number,
    weightKg: number,
    age: number,
    gender: string,
    activityLevel: string,
    goal: string,
  ): Promise<MacroTargets> {
    const response = await this.api.post('/nutrition-profile/calculate-targets', {
      height_cm: heightCm,
      weight_kg: weightKg,
      age,
      gender,
      activity_level: activityLevel,
      goal,
    });
    return response.data;
  }
}

export default new ApiService();