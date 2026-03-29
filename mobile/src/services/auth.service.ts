/**
 * auth.service.ts
 * Maneja tokens JWT + SecureStore + llamadas a /auth/*
 * SecureStore = Keychain (iOS) / EncryptedSharedPreferences (Android)
 * NO usar AsyncStorage para tokens — es texto plano.
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { AuthTokens, User, LoginRequest, RegisterRequest, AppleAuthRequest, GoogleAuthRequest } from '../types';

const KEYS = {
  ACCESS_TOKEN:  'cal_access_token',
  REFRESH_TOKEN: 'cal_refresh_token',
  USER_DATA:     'cal_user_data',
} as const;

// SecureStore no está disponible en web — fallback a memory
const memStore: Record<string, string> = {};

const secureGet = async (key: string): Promise<string | null> => {
  if (Platform.OS === 'web') return memStore[key] ?? null;
  return SecureStore.getItemAsync(key);
};

const secureSet = async (key: string, value: string): Promise<void> => {
  if (Platform.OS === 'web') { memStore[key] = value; return; }
  await SecureStore.setItemAsync(key, value);
};

const secureDel = async (key: string): Promise<void> => {
  if (Platform.OS === 'web') { delete memStore[key]; return; }
  await SecureStore.deleteItemAsync(key);
};

// ─── Token management ────────────────────────────────────────────────────────

export const getAccessToken  = () => secureGet(KEYS.ACCESS_TOKEN);
export const getRefreshToken = () => secureGet(KEYS.REFRESH_TOKEN);

export const saveTokens = async (tokens: AuthTokens): Promise<void> => {
  await Promise.all([
    secureSet(KEYS.ACCESS_TOKEN,  tokens.access_token),
    secureSet(KEYS.REFRESH_TOKEN, tokens.refresh_token),
  ]);
};

export const clearTokens = async (): Promise<void> => {
  await Promise.all([
    secureDel(KEYS.ACCESS_TOKEN),
    secureDel(KEYS.REFRESH_TOKEN),
    secureDel(KEYS.USER_DATA),
  ]);
};

/** Decoded JWT payload fields relevant to client-side checks. */
interface JwtPayload {
  exp?: number;
  sub?: string | number;
  iat?: number;
  [key: string]: unknown;
}

/** Decode JWT payload without verification (for reading exp, sub client-side). */
export const decodeJwtPayload = (token: string): JwtPayload | null => {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
};

export const isTokenExpired = (token: string): boolean => {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return true;
  return Date.now() >= payload.exp * 1000;
};

// ─── API calls (these use a plain fetch to avoid circular imports with api.ts) ─

/** Resolve the base URL using the same logic as api.ts/apiClient.ts. */
const resolveAuthBaseUrl = (): string => {
  if (__DEV__) {
    if (Platform.OS === 'web') return 'http://localhost:8000';
    if (Platform.OS === 'android') return 'http://10.0.2.2:8000';
    return 'http://172.20.10.13:8000'; // iOS physical device — change to your local IP
  }
  return process.env.EXPO_PUBLIC_API_URL ?? 'https://api.fitsiai.app';
};

let _baseUrl = resolveAuthBaseUrl();
export const setBaseUrl = (url: string) => { _baseUrl = url; };

/** Generic JSON response from auth endpoints. */
interface AuthJsonResponse {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  user_id?: number;
  detail?: string;
  [key: string]: unknown;
}

const authFetch = async (path: string, body: object): Promise<AuthJsonResponse> => {
  const res = await fetch(`${_baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err: { detail?: string } = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json() as Promise<AuthJsonResponse>;
};

const authFetchForm = async (path: string, body: URLSearchParams): Promise<AuthJsonResponse> => {
  const res = await fetch(`${_baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const err: { detail?: string } = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json() as Promise<AuthJsonResponse>;
};

// ─── Auth methods ─────────────────────────────────────────────────────────────

export const login = async (credentials: LoginRequest): Promise<{ tokens: AuthTokens; userId: number }> => {
  const params = new URLSearchParams();
  params.append('username', credentials.username);
  params.append('password', credentials.password);
  const data = await authFetchForm('/auth/login', params);
  const tokens: AuthTokens = {
    access_token:  data.access_token ?? '',
    refresh_token: data.refresh_token ?? '',
    token_type:    'bearer',
  };
  await saveTokens(tokens);
  return { tokens, userId: data.user_id ?? 0 };
};

export const register = async (req: RegisterRequest): Promise<void> => {
  await authFetch('/auth/register', req);
};

export const loginWithApple = async (req: AppleAuthRequest): Promise<{ tokens: AuthTokens; userId: number }> => {
  const data = await authFetch('/auth/apple', req);
  const tokens: AuthTokens = {
    access_token:  data.access_token ?? '',
    refresh_token: data.refresh_token ?? '',
    token_type:    'bearer',
  };
  await saveTokens(tokens);
  return { tokens, userId: data.user_id ?? 0 };
};

export const loginWithGoogle = async (req: GoogleAuthRequest): Promise<{ tokens: AuthTokens; userId: number }> => {
  const data = await authFetch('/auth/google', req);
  const tokens: AuthTokens = {
    access_token:  data.access_token ?? '',
    refresh_token: data.refresh_token ?? '',
    token_type:    'bearer',
  };
  await saveTokens(tokens);
  return { tokens, userId: data.user_id ?? 0 };
};

/** Rolling refresh -- revokes old token, issues new pair. */
export const refreshSession = async (): Promise<AuthTokens | null> => {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return null;
  try {
    const data = await authFetch('/auth/refresh', { refresh_token: refreshToken });
    const tokens: AuthTokens = {
      access_token:  data.access_token ?? '',
      refresh_token: data.refresh_token ?? '',
      token_type:    'bearer',
    };
    await saveTokens(tokens);
    return tokens;
  } catch (err) {
    console.error('[AuthService] Session refresh failed, clearing tokens:', err);
    await clearTokens();
    return null;
  }
};

/** Server-side token revocation + local cleanup. */
export const logout = async (): Promise<void> => {
  const refreshToken = await getRefreshToken();
  if (refreshToken) {
    // Best-effort server revocation (don't block on failure)
    authFetch('/auth/logout', { refresh_token: refreshToken }).catch(() => {});
  }
  await clearTokens();
};
