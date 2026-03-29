/**
 * api.ts -- HTTP transport layer
 *
 * - Shared axios instance for the entire app
 * - Request interceptor: injects Bearer token + security headers
 * - Response interceptor: 401 -> refresh token -> retry original request
 * - Retry: 3 retries with exponential backoff for idempotent requests on network errors
 * - Timeout: 15s default (configurable per-request)
 * - Preserves backward compatibility with all existing endpoints
 */
import axios, { AxiosInstance, AxiosRequestConfig, AxiosError, RawAxiosRequestHeaders } from 'axios';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as authService from './auth.service';
import { TIMEOUTS, NetworkError } from './apiClient';
import { getCachedNetworkStatus } from '../hooks/useNetworkStatus';
import type {
  ActivityCreate,
  MealLogCreate,
  NutritionProfileCreate,
  Activity,
  Food,
  MealLog,
  NutritionProfile,
  MacroTargets,
  AuthTokens,
  User,
} from '../types';

// ---- Base URL ----------------------------------------------------------------

const getBaseUrl = (): string => {
  if (__DEV__) {
    if (Platform.OS === 'web')     return 'http://localhost:8000';
    if (Platform.OS === 'android') return 'http://10.0.2.2:8000';
    return 'http://172.20.10.13:8000'; // iOS device -- change to your local IP
  }
  // SEC: Production must use HTTPS
  return process.env.EXPO_PUBLIC_API_URL ?? 'https://api.fitsiai.app';
};

export const BASE_URL = getBaseUrl();
authService.setBaseUrl(BASE_URL);

// ---- App metadata for security headers ---------------------------------------

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
const APP_PLATFORM = Platform.OS; // 'ios' | 'android' | 'web'

// ---- Retry constants ---------------------------------------------------------

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1_000;
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']);

function isRetryableError(error: AxiosError): boolean {
  if (!error.response) return true; // network error
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return true;
  const status = error.response.status;
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---- Axios instance ----------------------------------------------------------

let _isRefreshing = false;
let _refreshQueue: Array<(token: string | null) => void> = [];

const processQueue = (token: string | null) => {
  _refreshQueue.forEach(cb => cb(token));
  _refreshQueue = [];
};

const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: TIMEOUTS.DEFAULT,
  headers: {
    'Accept': 'application/json',
    'X-App-Version': APP_VERSION,
    'X-Platform': APP_PLATFORM,
  },
});

// -- Dev logging: one line per request, one line per response -----------------
if (__DEV__) {
  api.interceptors.request.use((config) => {
    const method = (config.method ?? 'GET').toUpperCase();
    const url = config.url ?? '/';
    (config as any)._startTime = Date.now();
    console.log(`[API] --> ${method} ${url}`);
    return config;
  });

  api.interceptors.response.use(
    (response) => {
      const config = response.config as any;
      const ms = config._startTime ? Date.now() - config._startTime : 0;
      const method = (config.method ?? 'GET').toUpperCase();
      const url = config.url ?? '/';
      console.log(`[API] <-- ${response.status} ${method} ${url} in ${ms}ms`);
      return response;
    },
    (error) => {
      const config = (error.config ?? {}) as any;
      const ms = config._startTime ? Date.now() - config._startTime : 0;
      const method = (config.method ?? '???').toUpperCase();
      const url = config.url ?? '/';
      const status = error.response?.status ?? 'NETWORK_ERROR';
      const msg = error.response?.statusText ?? error.message ?? 'Unknown error';
      console.log(`[API] <-- ${status} ${method} ${url} in ${ms}ms | ${msg}`);
      return Promise.reject(error);
    },
  );
}

// -- Request: inject access token + offline guard ------------------------------
api.interceptors.request.use(async (config) => {
  // Quick offline check to fail fast
  const networkStatus = getCachedNetworkStatus();
  if (!networkStatus.isConnected) {
    const source = axios.CancelToken.source();
    config.cancelToken = source.token;
    source.cancel('OFFLINE');
    return config;
  }

  const token = await authService.getAccessToken();
  if (token) {
    // SEC: Token only in Authorization header, never in URL params
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

// -- Response: handle 401 with token refresh -----------------------------------
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as AxiosRequestConfig & { _retry?: boolean };

    // 307 redirect -- maintain auth headers, validate same-origin
    if (error.response?.status === 307 && !original._retry) {
      original._retry = true;
      const location = error.response.headers.location;
      if (location) {
        const url = location.startsWith('http') ? location : `${BASE_URL}${location}`;

        // SEC: Only follow redirects to our own API origin
        if (!url.startsWith(BASE_URL)) {
          return Promise.reject(new Error(`Blocked cross-origin redirect to: ${url}`));
        }

        const token = await authService.getAccessToken();
        original.url = url;
        if (token) (original.headers as RawAxiosRequestHeaders).Authorization = `Bearer ${token}`;
        return api.request(original);
      }
    }

    // 401 -- try refresh once
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;

      if (_isRefreshing) {
        // Queue this request until refresh completes
        return new Promise((resolve, reject) => {
          _refreshQueue.push((newToken) => {
            if (newToken) {
              (original.headers as RawAxiosRequestHeaders).Authorization = `Bearer ${newToken}`;
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
          (original.headers as RawAxiosRequestHeaders).Authorization = `Bearer ${tokens.access_token}`;
          return api.request(original);
        } else {
          processQueue(null);
          // Refresh failed -- session expired, app will detect via AuthContext
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

// -- Retry interceptor: 3 retries with exponential backoff ---------------------
api.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config as AxiosRequestConfig & { _retryCount?: number };
  if (!config) return Promise.reject(error);

  const method = (config.method ?? 'GET').toUpperCase();
  const isIdempotent = IDEMPOTENT_METHODS.has(method);
  const retryCount = config._retryCount ?? 0;

  // Only retry idempotent requests on retryable errors, max 3 retries
  if (isIdempotent && isRetryableError(error) && retryCount < MAX_RETRIES) {
    config._retryCount = retryCount + 1;
    const backoffMs = RETRY_BASE_DELAY_MS * Math.pow(2, retryCount);
    const jitter = Math.random() * 500;

    if (__DEV__) {
      console.log(
        `[api] Retry ${config._retryCount}/${MAX_RETRIES} for ${method} ${config.url} in ${Math.round(backoffMs + jitter)}ms`,
      );
    }

    await delay(backoffMs + jitter);
    return api.request(config);
  }

  return Promise.reject(error);
});

// -- Error transform interceptor: wrap AxiosErrors with NetworkError -----------
api.interceptors.response.use(undefined, (error: AxiosError) => {
  // Handle offline cancellation
  if (axios.isCancel(error) && (error as Error).message === 'OFFLINE') {
    const syntheticError = new AxiosError(
      'OFFLINE',
      'ERR_NETWORK',
      undefined,
      undefined,
      undefined,
    );
    return Promise.reject(new NetworkError(syntheticError));
  }

  // Wrap AxiosErrors with user-friendly messages
  if (error.isAxiosError || error instanceof AxiosError) {
    return Promise.reject(new NetworkError(error));
  }

  return Promise.reject(error);
});

// ─── Domain methods (legacy + new) ────────────────────────────────────────────
// Mantiene compatibilidad con todas las pantallas existentes

const ApiService = {
  // ── Auth ──────────────────────────────────────────────────────────────────
  async login(credentials: { username: string; password: string }): Promise<{ tokens: AuthTokens; userId: number }> {
    return authService.login(credentials);
  },

  async register(userData: { email: string; password: string; first_name?: string; last_name?: string }): Promise<void> {
    return authService.register(userData);
  },

  async getCurrentUser(): Promise<User> {
    const res = await api.get<User>('/auth/me');
    return res.data;
  },

  // ── Activities ────────────────────────────────────────────────────────────
  async getActivities(startDate?: string, endDate?: string): Promise<Activity[]> {
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate)   params.append('end_date', endDate);
    const res = await api.get<Activity[]>(`/activities/?${params}`);
    return res.data;
  },

  async getActivity(id: number): Promise<Activity> {
    const res = await api.get<Activity>(`/activities/${id}`);
    return res.data;
  },

  async createActivity(data: ActivityCreate): Promise<Activity> {
    const res = await api.post<Activity>('/activities/', data);
    return res.data;
  },

  async updateActivity(id: number, data: Partial<ActivityCreate>): Promise<Activity> {
    const res = await api.put<Activity>(`/activities/${id}`, data);
    return res.data;
  },

  async deleteActivity(id: number): Promise<void> {
    await api.delete(`/activities/${id}`);
  },

  // ── Foods ─────────────────────────────────────────────────────────────────
  async searchFoods(query?: string, limit = 50): Promise<Food[]> {
    const params = new URLSearchParams();
    if (query) params.append('query', query);
    params.append('limit', limit.toString());
    const res = await api.get<{ items?: Food[] } | Food[]>(`/foods/?${params}`);
    if (Array.isArray(res.data)) return res.data;
    return res.data.items ?? [];
  },

  async getFood(id: number): Promise<Food> {
    const res = await api.get<Food>(`/foods/${id}`);
    return res.data;
  },

  // ── Meals ─────────────────────────────────────────────────────────────────
  async logMeal(data: MealLogCreate): Promise<MealLog> {
    const res = await api.post<MealLog>('/meals/', data);
    return res.data;
  },

  async getMeals(date: string): Promise<MealLog[]> {
    const res = await api.get<{ items?: MealLog[] } | MealLog[]>(`/meals/?target_date=${date}`);
    if (Array.isArray(res.data)) return res.data;
    return res.data.items ?? [];
  },

  async deleteMeal(id: number): Promise<void> {
    await api.delete(`/meals/${id}`);
  },

  async getDailySummary(date: string): Promise<MacroTargets & { total_calories: number; total_protein: number; total_carbs: number; total_fat: number }> {
    const res = await api.get(`/meals/summary?target_date=${date}`);
    return res.data;
  },

  async updateWater(waterMl: number, date?: string): Promise<any> {
    const res = await api.post('/api/food/water', { ml: waterMl });
    return res.data;
  },

  // ── Nutrition profile ─────────────────────────────────────────────────────
  async getNutritionProfile(): Promise<NutritionProfile> {
    const res = await api.get<NutritionProfile>('/nutrition-profile/');
    return res.data;
  },

  async createOrUpdateNutritionProfile(data: NutritionProfileCreate): Promise<NutritionProfile> {
    const res = await api.post<NutritionProfile>('/nutrition-profile/', data);
    return res.data;
  },

  async calculateTargets(heightCm: number, weightKg: number, age: number, gender: string, activityLevel: string, goal: string): Promise<MacroTargets> {
    const res = await api.post<MacroTargets>('/nutrition-profile/calculate-targets', {
      height_cm: heightCm, weight_kg: weightKg, age, gender, activity_level: activityLevel, goal,
    });
    return res.data;
  },

  // ── Account ─────────────────────────────────────────────────────────────
  async deleteAccount(): Promise<void> {
    await api.delete('/auth/me');
  },
};

export { api };
export default ApiService;
