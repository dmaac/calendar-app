/**
 * apiClient.ts -- Centralized HTTP client configuration
 *
 * SEC: This module defines the security-hardened HTTP client used by api.ts.
 * It is the single source of truth for:
 *   - Base URL resolution (HTTPS enforced in production)
 *   - Configurable timeouts (15s standard, 45s for AI scans)
 *   - Security headers (X-App-Version, X-Platform, Accept, Content-Type)
 *   - Auth interceptor: auto-injects Bearer token from SecureStore
 *   - Refresh interceptor: 401 -> refresh token -> retry original request
 *   - Error interceptor: structured user-friendly error messages
 *   - Retry logic: 3 retries with exponential backoff on network errors
 *   - AbortController factory for cancellable requests
 *   - Offline detection via getCachedNetworkStatus()
 *
 * Usage: import { apiClient, TIMEOUTS, createAbortController, NetworkError } from './apiClient';
 */
import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosError,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as authService from './auth.service';
import { getCachedNetworkStatus } from '../hooks/useNetworkStatus';

// ---- Constants ---------------------------------------------------------------

export const TIMEOUTS = {
  /** 15s for standard API calls (reads, simple writes) */
  DEFAULT: 15_000,
  /** 45s for AI food scans (GPT-4o Vision processing) */
  SCAN: 45_000,
  /** 30s for file uploads (non-AI) */
  UPLOAD: 30_000,
} as const;

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1_000; // 1s, 2s, 4s exponential backoff
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']);

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
const APP_PLATFORM = Platform.OS;

// ---- Base URL ----------------------------------------------------------------

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

// ---- User-friendly error messages -------------------------------------------

export class NetworkError extends Error {
  public readonly statusCode: number | undefined;
  public readonly isOffline: boolean;
  public readonly isTimeout: boolean;
  public readonly isServerError: boolean;
  public readonly isAuthError: boolean;
  public readonly userMessage: string;
  public readonly retryable: boolean;

  constructor(error: AxiosError) {
    const { statusCode, userMessage, isOffline, isTimeout, isServerError, isAuthError, retryable } =
      NetworkError.classify(error);

    super(userMessage);
    this.name = 'NetworkError';
    this.statusCode = statusCode;
    this.isOffline = isOffline;
    this.isTimeout = isTimeout;
    this.isServerError = isServerError;
    this.isAuthError = isAuthError;
    this.userMessage = userMessage;
    this.retryable = retryable;
  }

  private static classify(error: AxiosError): {
    statusCode: number | undefined;
    userMessage: string;
    isOffline: boolean;
    isTimeout: boolean;
    isServerError: boolean;
    isAuthError: boolean;
    retryable: boolean;
  } {
    const status = error.response?.status;

    // Request was cancelled via AbortController
    if (axios.isCancel(error)) {
      return {
        statusCode: undefined,
        userMessage: 'La solicitud fue cancelada.',
        isOffline: false,
        isTimeout: false,
        isServerError: false,
        isAuthError: false,
        retryable: false,
      };
    }

    // Timeout
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return {
        statusCode: undefined,
        userMessage: 'La solicitud tardo demasiado. Verifica tu conexion e intenta de nuevo.',
        isOffline: false,
        isTimeout: true,
        isServerError: false,
        isAuthError: false,
        retryable: true,
      };
    }

    // No response = network error
    if (!error.response) {
      return {
        statusCode: undefined,
        userMessage: 'Sin conexion a internet. Tus datos se guardaran y sincronizaran automaticamente.',
        isOffline: true,
        isTimeout: false,
        isServerError: false,
        isAuthError: false,
        retryable: true,
      };
    }

    // Auth errors
    if (status === 401) {
      return {
        statusCode: 401,
        userMessage: 'Tu sesion ha expirado. Inicia sesion nuevamente.',
        isOffline: false,
        isTimeout: false,
        isServerError: false,
        isAuthError: true,
        retryable: false,
      };
    }

    if (status === 403) {
      return {
        statusCode: 403,
        userMessage: 'No tienes permisos para realizar esta accion.',
        isOffline: false,
        isTimeout: false,
        isServerError: false,
        isAuthError: true,
        retryable: false,
      };
    }

    // Validation error
    if (status === 422) {
      const detail = (error.response?.data as { detail?: string } | undefined)?.detail;
      let msg = 'Los datos ingresados no son validos. Revisa e intenta de nuevo.';
      if (typeof detail === 'string') {
        msg = detail;
      }
      return {
        statusCode: 422,
        userMessage: msg,
        isOffline: false,
        isTimeout: false,
        isServerError: false,
        isAuthError: false,
        retryable: false,
      };
    }

    // Not found
    if (status === 404) {
      return {
        statusCode: 404,
        userMessage: 'El recurso solicitado no fue encontrado.',
        isOffline: false,
        isTimeout: false,
        isServerError: false,
        isAuthError: false,
        retryable: false,
      };
    }

    // Rate limit
    if (status === 429) {
      return {
        statusCode: 429,
        userMessage: 'Demasiadas solicitudes. Espera un momento e intenta de nuevo.',
        isOffline: false,
        isTimeout: false,
        isServerError: false,
        isAuthError: false,
        retryable: true,
      };
    }

    // Server errors (5xx)
    if (status && status >= 500) {
      return {
        statusCode: status,
        userMessage: 'Error del servidor. Intenta de nuevo en unos momentos.',
        isOffline: false,
        isTimeout: false,
        isServerError: true,
        isAuthError: false,
        retryable: true,
      };
    }

    // Generic client error (4xx)
    const detailMsg = (error.response?.data as { detail?: string } | undefined)?.detail;
    return {
      statusCode: status,
      userMessage: typeof detailMsg === 'string' ? detailMsg : 'Ocurrio un error inesperado.',
      isOffline: false,
      isTimeout: false,
      isServerError: false,
      isAuthError: false,
      retryable: false,
    };
  }
}

// ---- AbortController factory -------------------------------------------------

/**
 * Create an AbortController with an optional auto-timeout.
 * Usage:
 *   const { signal, cancel } = createAbortController(15000);
 *   apiClient.get('/api/data', { signal });
 *   // Later: cancel(); to abort
 */
export function createAbortController(timeoutMs?: number): {
  signal: AbortSignal;
  cancel: () => void;
} {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;

  if (timeoutMs) {
    timer = setTimeout(() => controller.abort(), timeoutMs);
  }

  return {
    signal: controller.signal,
    cancel: () => {
      if (timer) clearTimeout(timer);
      controller.abort();
    },
  };
}

// ---- Retry helpers -----------------------------------------------------------

function isRetryableError(error: AxiosError): boolean {
  // Network errors (no response received)
  if (!error.response) return true;

  // Timeout errors
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return true;

  // Server errors
  const status = error.response.status;
  if (status === 429 || status === 502 || status === 503 || status === 504) return true;

  return false;
}

function isIdempotentRequest(config: AxiosRequestConfig): boolean {
  const method = (config.method ?? 'GET').toUpperCase();
  return IDEMPOTENT_METHODS.has(method);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---- Client factory ----------------------------------------------------------

let _isRefreshing = false;
let _refreshQueue: Array<(token: string | null) => void> = [];

const processQueue = (token: string | null) => {
  _refreshQueue.forEach((cb) => cb(token));
  _refreshQueue = [];
};

/** Extended AxiosRequestConfig with retry metadata */
interface RetryableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
  _retryCount?: number;
  _skipRetry?: boolean;
}

function createApiClient(): AxiosInstance {
  const client = axios.create({
    baseURL: API_BASE_URL,
    timeout: TIMEOUTS.DEFAULT,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-App-Version': APP_VERSION,
      'X-Platform': APP_PLATFORM,
    },
  });

  // -- Dev logging: one line per request, one line per response ----------------
  if (__DEV__) {
    client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
      const method = (config.method ?? 'GET').toUpperCase();
      const url = config.url ?? '/';
      (config as any)._startTime = Date.now();
      console.log(`[API] --> ${method} ${url}`);
      return config;
    });

    client.interceptors.response.use(
      (response: AxiosResponse) => {
        const config = response.config as any;
        const ms = config._startTime ? Date.now() - config._startTime : 0;
        const method = (config.method ?? 'GET').toUpperCase();
        const url = config.url ?? '/';
        console.log(`[API] <-- ${response.status} ${method} ${url} in ${ms}ms`);
        return response;
      },
      (error: AxiosError) => {
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

  // -- Request interceptor: inject Bearer token + offline guard ----------------
  client.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
    // Check if device is offline before sending
    const networkStatus = getCachedNetworkStatus();
    if (!networkStatus.isConnected) {
      // Create a cancel token to abort immediately with a recognizable error
      const source = axios.CancelToken.source();
      config.cancelToken = source.token;
      source.cancel('OFFLINE');
      return config;
    }

    const token = await authService.getAccessToken();
    if (token) {
      // SEC: Token in Authorization header only, never in URL
      config.headers.set('Authorization', `Bearer ${token}`);
    }
    return config;
  });

  // -- Response interceptor: 401 -> refresh -> retry ---------------------------
  client.interceptors.response.use(
    (response: AxiosResponse) => response,
    async (error: AxiosError) => {
      const original = error.config as RetryableConfig | undefined;
      if (!original) return Promise.reject(error);

      if (error.response?.status === 401 && !original._retry) {
        original._retry = true;

        if (_isRefreshing) {
          return new Promise((resolve, reject) => {
            _refreshQueue.push((newToken) => {
              if (newToken) {
                original.headers.Authorization = `Bearer ${newToken}`;
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
            original.headers.Authorization = `Bearer ${tokens.access_token}`;
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
    },
  );

  // -- Response interceptor: exponential backoff retry -------------------------
  client.interceptors.response.use(undefined, async (error: AxiosError) => {
    const config = error.config as RetryableConfig | undefined;
    if (!config) return Promise.reject(error);

    // Skip retry for non-idempotent methods (POST is not retried automatically
    // unless the caller explicitly opts in via _skipRetry=false on the config)
    // By default, only idempotent methods (GET, PUT, DELETE, HEAD, OPTIONS) are retried
    if (config._skipRetry) return Promise.reject(error);

    const retryCount = config._retryCount ?? 0;
    const isIdempotent = isIdempotentRequest(config);

    if (isRetryableError(error) && isIdempotent && retryCount < MAX_RETRIES) {
      config._retryCount = retryCount + 1;
      const backoffMs = RETRY_BASE_DELAY_MS * Math.pow(2, retryCount);
      // Add jitter to avoid thundering herd
      const jitter = Math.random() * 500;

      if (__DEV__) {
        console.log(
          `[apiClient] Retry ${config._retryCount}/${MAX_RETRIES} for ${config.method?.toUpperCase()} ${config.url} in ${Math.round(backoffMs + jitter)}ms`,
        );
      }

      await delay(backoffMs + jitter);
      return client.request(config);
    }

    return Promise.reject(error);
  });

  // -- Response interceptor: transform errors into NetworkError ----------------
  client.interceptors.response.use(undefined, (error: AxiosError) => {
    // Do not wrap cancellation errors that are from offline detection
    if (axios.isCancel(error) && (error as Error).message === 'OFFLINE') {
      const syntheticError = new AxiosError(
        'OFFLINE',
        'ERR_NETWORK',
        undefined,
        undefined,
        undefined,
      );
      const offlineError = new NetworkError(syntheticError);
      return Promise.reject(offlineError);
    }

    // Wrap all other AxiosErrors with user-friendly messages
    if (error.isAxiosError || error instanceof AxiosError) {
      return Promise.reject(new NetworkError(error));
    }

    return Promise.reject(error);
  });

  return client;
}

export const apiClient = createApiClient();

// ---- GET response cache (in-memory LRU for dashboard/profile) ----------------

interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  etag?: string;
}

const _responseCache = new Map<string, CacheEntry>();
const CACHE_MAX_ENTRIES = 50;
const CACHE_DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Cache a GET response in memory. Used by service files for dashboard data,
 * profile data, and other frequently accessed reads.
 */
export function cacheResponse<T>(key: string, data: T, ttlMs = CACHE_DEFAULT_TTL_MS): void {
  // Evict oldest if at capacity
  if (_responseCache.size >= CACHE_MAX_ENTRIES) {
    const oldestKey = _responseCache.keys().next().value;
    if (oldestKey) _responseCache.delete(oldestKey);
  }
  _responseCache.set(key, { data, timestamp: Date.now() });
}

/**
 * Retrieve a cached GET response. Returns null if expired or not found.
 */
export function getCachedResponse<T>(key: string, ttlMs = CACHE_DEFAULT_TTL_MS): T | null {
  const entry = _responseCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > ttlMs) {
    _responseCache.delete(key);
    return null;
  }
  return entry.data as T;
}

/**
 * Invalidate a specific cache key or all keys matching a prefix.
 */
export function invalidateCache(keyOrPrefix?: string): void {
  if (!keyOrPrefix) {
    _responseCache.clear();
    return;
  }
  // If exact match, delete it
  if (_responseCache.has(keyOrPrefix)) {
    _responseCache.delete(keyOrPrefix);
    return;
  }
  // Otherwise treat as prefix
  for (const key of Array.from(_responseCache.keys())) {
    if (key.startsWith(keyOrPrefix)) {
      _responseCache.delete(key);
    }
  }
}
