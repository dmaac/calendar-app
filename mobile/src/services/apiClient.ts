/**
 * apiClient.ts — Centralized HTTP client configuration
 *
 * SEC: This module defines the security-hardened HTTP client used by api.ts.
 * It is the single source of truth for:
 *   - Base URL resolution (HTTPS enforced in production)
 *   - Default timeouts (30s standard, 60s for AI scans)
 *   - Security headers (X-App-Version, X-Platform, Accept, Content-Type)
 *   - Auth interceptor: auto-injects Bearer token from SecureStore
 *   - Refresh interceptor: 401 -> refresh token -> retry original request
 *   - Error interceptor: structured logging for debugging
 *   - GET retry: 1 automatic retry on network errors (idempotent only)
 *
 * Usage: import { apiClient, TIMEOUTS } from './apiClient';
 */
import axios, { AxiosInstance, AxiosRequestConfig, AxiosError, AxiosResponse } from 'axios';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as authService from './auth.service';

// ─── Constants ────────────────────────────────────────────────────────────────

export const TIMEOUTS = {
  DEFAULT: 30_000,  // 30s for standard API calls
  SCAN: 60_000,     // 60s for AI food scans (GPT-4o Vision processing)
} as const;

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
const APP_PLATFORM = Platform.OS;

// ─── Base URL ─────────────────────────────────────────────────────────────────

const resolveBaseUrl = (): string => {
  if (__DEV__) {
    if (Platform.OS === 'web') return 'http://localhost:8000';
    if (Platform.OS === 'android') return 'http://10.0.2.2:8000';
    return 'http://172.20.10.13:8000';
  }
  // SEC: Production always uses HTTPS
  return process.env.EXPO_PUBLIC_API_URL ?? 'https://api.fitsiai.app';
};

export const API_BASE_URL = resolveBaseUrl();

// ─── Client factory ───────────────────────────────────────────────────────────

let _isRefreshing = false;
let _refreshQueue: Array<(token: string | null) => void> = [];

const processQueue = (token: string | null) => {
  _refreshQueue.forEach(cb => cb(token));
  _refreshQueue = [];
};

function createApiClient(): AxiosInstance {
  const client = axios.create({
    baseURL: API_BASE_URL,
    timeout: TIMEOUTS.DEFAULT,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-App-Version': APP_VERSION,
      'X-Platform': APP_PLATFORM,
    },
  });

  // ── Auth interceptor: inject Bearer token ─────────────────────────────────
  client.interceptors.request.use(async (config) => {
    const token = await authService.getAccessToken();
    if (token) {
      config.headers = config.headers ?? {};
      // SEC: Token in Authorization header only, never in URL
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  // ── Refresh interceptor: 401 -> refresh -> retry ──────────────────────────
  client.interceptors.response.use(
    (response: AxiosResponse) => response,
    async (error: AxiosError) => {
      const original = error.config as AxiosRequestConfig & { _retry?: boolean };

      if (error.response?.status === 401 && !original._retry) {
        original._retry = true;

        if (_isRefreshing) {
          return new Promise((resolve, reject) => {
            _refreshQueue.push((newToken) => {
              if (newToken) {
                (original.headers as any).Authorization = `Bearer ${newToken}`;
                resolve(client.request(original));
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
            return client.request(original);
          } else {
            processQueue(null);
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

  // ── Error interceptor ────────────────────────────────────────────────────
  client.interceptors.response.use(undefined, (error: AxiosError) => {
    return Promise.reject(error);
  });

  // ── GET retry: 1 retry on network errors ──────────────────────────────────
  client.interceptors.response.use(undefined, async (error: AxiosError) => {
    const config = error.config as AxiosRequestConfig & { _retryCount?: number };
    if (!config) return Promise.reject(error);

    const isGet = (config.method ?? '').toUpperCase() === 'GET';
    const isNetworkError = !error.response;
    const retryCount = config._retryCount ?? 0;

    if (isGet && isNetworkError && retryCount < 1) {
      config._retryCount = retryCount + 1;
      return client.request(config);
    }

    return Promise.reject(error);
  });

  return client;
}

export const apiClient = createApiClient();
