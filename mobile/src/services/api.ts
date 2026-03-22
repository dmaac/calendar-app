/**
 * api.ts — HTTP transport layer
 *
 * - Único axios instance para toda la app
 * - Request interceptor: inyecta Bearer token + security headers
 * - Response interceptor: en 401, intenta refresh automático (rolling refresh)
 *   y reintenta la request original una vez
 * - GET retry: 1 automatic retry on network error
 * - Preserva compatibilidad con todos los endpoints existentes
 */
import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as authService from './auth.service';

// ─── Base URL ─────────────────────────────────────────────────────────────────

const getBaseUrl = (): string => {
  if (__DEV__) {
    if (Platform.OS === 'web')     return 'http://localhost:8000';
    if (Platform.OS === 'android') return 'http://10.0.2.2:8000';
    return 'http://172.20.10.13:8000'; // iOS físico — cambiar por tu IP local
  }
  // SEC: Production must use HTTPS
  return process.env.EXPO_PUBLIC_API_URL ?? 'https://api.fitsiai.app';
};

export const BASE_URL = getBaseUrl();
authService.setBaseUrl(BASE_URL);

// ─── App metadata for security headers ────────────────────────────────────────

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
const APP_PLATFORM = Platform.OS; // 'ios' | 'android' | 'web'

// ─── Axios instance ───────────────────────────────────────────────────────────

let _isRefreshing = false;
let _refreshQueue: Array<(token: string | null) => void> = [];

const processQueue = (token: string | null) => {
  _refreshQueue.forEach(cb => cb(token));
  _refreshQueue = [];
};

const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000, // SEC: 30s default timeout
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-App-Version': APP_VERSION,
    'X-Platform': APP_PLATFORM,
  },
});

// ── Request: inject access token ──────────────────────────────────────────────
api.interceptors.request.use(async (config) => {
  const token = await authService.getAccessToken();
  if (token) {
    config.headers = config.headers ?? {};
    // SEC: Token only in Authorization header, never in URL params
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response: handle 401 with token refresh ───────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as AxiosRequestConfig & { _retry?: boolean };

    // 307 redirect — maintain auth headers
    if (error.response?.status === 307 && !original._retry) {
      original._retry = true;
      const location = error.response.headers.location;
      if (location) {
        const token = await authService.getAccessToken();
        const url = location.startsWith('http') ? location : `${BASE_URL}${location}`;
        original.url = url;
        if (token) (original.headers as any).Authorization = `Bearer ${token}`;
        return api.request(original);
      }
    }

    // 401 — try refresh once
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;

      if (_isRefreshing) {
        // Queue this request until refresh completes
        return new Promise((resolve, reject) => {
          _refreshQueue.push((newToken) => {
            if (newToken) {
              (original.headers as any).Authorization = `Bearer ${newToken}`;
              resolve(api.request(original));
            } else {
              reject(error);
            }
          });
        });
      }

      _isRefreshing = true;

      try {
        const tokens = await authService.refreshSession();

        if (tokens) {
          processQueue(tokens.access_token);
          (original.headers as any).Authorization = `Bearer ${tokens.access_token}`;
          return api.request(original);
        } else {
          processQueue(null);
          // Refresh failed — session expired, app will detect via AuthContext
          return Promise.reject(error);
        }
      } catch (refreshError) {
        processQueue(null);
        return Promise.reject(refreshError);
      } finally {
        _isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// ── Retry interceptor: 1 automatic retry for GET on network errors ────────────
api.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config as AxiosRequestConfig & { _retryCount?: number };
  if (!config) return Promise.reject(error);

  const isGet = (config.method ?? '').toUpperCase() === 'GET';
  const isNetworkError = !error.response; // no response = network/timeout error
  const retryCount = config._retryCount ?? 0;

  // SEC: Only retry idempotent GET requests, max 1 retry, only on network errors
  if (isGet && isNetworkError && retryCount < 1) {
    config._retryCount = retryCount + 1;
    return api.request(config);
  }

  return Promise.reject(error);
});

// ─── Domain methods (legacy + new) ────────────────────────────────────────────
// Mantiene compatibilidad con todas las pantallas existentes

const ApiService = {
  // ── Auth ──────────────────────────────────────────────────────────────────
  async login(credentials: { username: string; password: string }) {
    return authService.login(credentials);
  },

  async register(userData: { email: string; password: string; first_name?: string; last_name?: string }) {
    return authService.register(userData);
  },

  async getCurrentUser() {
    const res = await api.get('/auth/me');
    return res.data;
  },

  // ── Activities ────────────────────────────────────────────────────────────
  async getActivities(startDate?: string, endDate?: string) {
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate)   params.append('end_date', endDate);
    const res = await api.get(`/activities/?${params}`);
    return res.data;
  },

  async getActivity(id: number) {
    const res = await api.get(`/activities/${id}`);
    return res.data;
  },

  async createActivity(data: any) {
    const res = await api.post('/activities/', data);
    return res.data;
  },

  async updateActivity(id: number, data: any) {
    const res = await api.put(`/activities/${id}`, data);
    return res.data;
  },

  async deleteActivity(id: number) {
    await api.delete(`/activities/${id}`);
  },

  // ── Foods ─────────────────────────────────────────────────────────────────
  async searchFoods(query?: string, limit = 50) {
    const params = new URLSearchParams();
    if (query) params.append('query', query);
    params.append('limit', limit.toString());
    const res = await api.get(`/foods/?${params}`);
    return res.data.items ?? res.data;
  },

  async getFood(id: number) {
    const res = await api.get(`/foods/${id}`);
    return res.data;
  },

  // ── Meals ─────────────────────────────────────────────────────────────────
  async logMeal(data: any) {
    const res = await api.post('/meals/', data);
    return res.data;
  },

  async getMeals(date: string) {
    const res = await api.get(`/meals/?target_date=${date}`);
    return res.data.items ?? res.data;
  },

  async deleteMeal(id: number) {
    await api.delete(`/meals/${id}`);
  },

  async getDailySummary(date: string) {
    const res = await api.get(`/meals/summary?target_date=${date}`);
    return res.data;
  },

  async updateWater(date: string, waterMl: number) {
    await api.post(`/meals/water?target_date=${date}&water_ml=${waterMl}`);
  },

  // ── Nutrition profile ─────────────────────────────────────────────────────
  async getNutritionProfile() {
    const res = await api.get('/nutrition-profile/');
    return res.data;
  },

  async createOrUpdateNutritionProfile(data: any) {
    const res = await api.post('/nutrition-profile/', data);
    return res.data;
  },

  async calculateTargets(heightCm: number, weightKg: number, age: number, gender: string, activityLevel: string, goal: string) {
    const res = await api.post('/nutrition-profile/calculate-targets', {
      height_cm: heightCm, weight_kg: weightKg, age, gender, activity_level: activityLevel, goal,
    });
    return res.data;
  },

  // ── Account ─────────────────────────────────────────────────────────────
  async deleteAccount() {
    await api.delete('/auth/me');
  },
};

export { api };
export default ApiService;
