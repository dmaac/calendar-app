/**
 * useCoach — Hook for AI Coach chat interactions
 *
 * Manages chat state, API communication, and message persistence.
 *
 * State: messages[], loading, error
 * Actions:
 *   sendMessage(text)    -> POST /api/coach/chat
 *   loadInsight()        -> GET  /api/coach/insight
 *   getSuggestion(type)  -> GET  /api/coach/suggest/{type}
 *
 * Messages are persisted to AsyncStorage so conversation history
 * survives app restarts. A maximum of 100 messages are kept to
 * prevent unbounded storage growth.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../services/apiClient';

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = '@fitsi/coach_messages';
const MAX_PERSISTED_MESSAGES = 100;
const CHAT_TIMEOUT = 45_000; // 45s — AI responses can be slow

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CoachMessage {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: number;
}

export interface UseCoachReturn {
  messages: CoachMessage[];
  loading: boolean;
  error: string | null;
  sendMessage: (text: string) => Promise<void>;
  loadInsight: () => Promise<void>;
  getSuggestion: (mealType: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  dismissError: () => void;
}

// ─── API response types ───────────────────────────────────────────────────────

interface CoachChatResponse {
  message: string;
}

interface CoachInsightResponse {
  insight: string;
}

interface CoachSuggestionResponse {
  suggestion: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sanitize(text: string): string {
  return text
    .trim()
    .replace(/<[^>]*>/g, '')     // strip HTML tags
    .replace(/&[a-z]+;/gi, '')   // strip HTML entities
    .slice(0, 500);
}

// ─── Persistence ──────────────────────────────────────────────────────────────

async function loadPersistedMessages(): Promise<CoachMessage[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as CoachMessage[];
  } catch {
    return [];
  }
}

async function persistMessages(messages: CoachMessage[]): Promise<void> {
  try {
    // Keep only the most recent messages to avoid storage bloat
    const toStore = messages.slice(-MAX_PERSISTED_MESSAGES);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
  } catch {
    // Persistence is best-effort; never block the UI
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCoach(): UseCoachReturn {
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initializedRef = useRef(false);

  // Load persisted messages on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    loadPersistedMessages().then((stored) => {
      if (stored.length > 0) {
        setMessages(stored);
      }
    });
  }, []);

  // Persist messages whenever they change (skip empty — avoids clearing on mount)
  useEffect(() => {
    if (messages.length > 0) {
      persistMessages(messages);
    }
  }, [messages]);

  // ── Append helpers ────────────────────────────────────────────────────────

  const appendUserMessage = useCallback((text: string): CoachMessage => {
    const msg: CoachMessage = {
      id: makeId('user'),
      text,
      isUser: true,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, msg]);
    return msg;
  }, []);

  const appendCoachMessage = useCallback((text: string): CoachMessage => {
    const msg: CoachMessage = {
      id: makeId('coach'),
      text,
      isUser: false,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, msg]);
    return msg;
  }, []);

  // ── sendMessage ───────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (rawText: string): Promise<void> => {
    const text = sanitize(rawText);
    if (!text || loading) return;

    appendUserMessage(text);
    setLoading(true);
    setError(null);

    try {
      const { data } = await apiClient.post<CoachChatResponse>(
        '/api/coach/chat',
        { message: text },
        { timeout: CHAT_TIMEOUT },
      );
      appendCoachMessage(data.message);
    } catch (err: unknown) {
      const fallback = 'No pude conectar con el coach. Intenta de nuevo.';
      if (err instanceof Error) {
        setError(err.message || fallback);
      } else {
        setError(fallback);
      }
      appendCoachMessage(fallback);
    } finally {
      setLoading(false);
    }
  }, [loading, appendUserMessage, appendCoachMessage]);

  // ── loadInsight ───────────────────────────────────────────────────────────

  const loadInsight = useCallback(async (): Promise<void> => {
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      const { data } = await apiClient.get<CoachInsightResponse>(
        '/api/coach/insight',
      );
      appendCoachMessage(data.insight);
    } catch (err: unknown) {
      const fallback = 'Hola! Soy tu coach de nutricion con IA. Preguntame lo que necesites sobre alimentacion, recetas o tu progreso.';
      // On insight failure, show a friendly welcome instead of an error
      appendCoachMessage(fallback);
    } finally {
      setLoading(false);
    }
  }, [loading, appendCoachMessage]);

  // ── getSuggestion ─────────────────────────────────────────────────────────

  const getSuggestion = useCallback(async (mealType: string): Promise<void> => {
    if (loading) return;

    const sanitizedType = encodeURIComponent(mealType.trim().toLowerCase());
    appendUserMessage(`Sugiere algo para: ${mealType}`);
    setLoading(true);
    setError(null);

    try {
      const { data } = await apiClient.get<CoachSuggestionResponse>(
        `/api/coach/suggest/${sanitizedType}`,
      );
      appendCoachMessage(data.suggestion);
    } catch (err: unknown) {
      const fallback = 'No pude obtener una sugerencia ahora. Intenta de nuevo.';
      if (err instanceof Error) {
        setError(err.message || fallback);
      } else {
        setError(fallback);
      }
      appendCoachMessage(fallback);
    } finally {
      setLoading(false);
    }
  }, [loading, appendUserMessage, appendCoachMessage]);

  // ── clearHistory ──────────────────────────────────────────────────────────

  const clearHistory = useCallback(async (): Promise<void> => {
    setMessages([]);
    setError(null);
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      // Best-effort
    }
  }, []);

  // ── dismissError ──────────────────────────────────────────────────────────

  const dismissError = useCallback((): void => {
    setError(null);
  }, []);

  return {
    messages,
    loading,
    error,
    sendMessage,
    loadInsight,
    getSuggestion,
    clearHistory,
    dismissError,
  };
}
