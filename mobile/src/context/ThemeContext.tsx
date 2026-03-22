/**
 * ThemeContext — App-level dark mode control with True Tone warmth
 * Allows toggling dark mode independently of OS setting.
 * Persists preference in AsyncStorage.
 */
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightColors, darkColors, interpolateColor } from '../theme';

const STORAGE_KEY = '@fitsi_theme_mode';
const WARMTH_KEY = '@fitsi_warmth';

type ThemeMode = 'system' | 'light' | 'dark';

interface ThemeContextType {
  mode: ThemeMode;
  isDark: boolean;
  warmth: number;
  colors: typeof lightColors;
  setMode: (mode: ThemeMode) => void;
  setWarmth: (value: number) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  mode: 'system',
  isDark: false,
  warmth: 30,
  colors: lightColors,
  setMode: () => {},
  setWarmth: () => {},
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [warmth, setWarmthState] = useState(30);
  const [loaded, setLoaded] = useState(false);

  // Load saved preferences
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(WARMTH_KEY),
    ]).then(([savedMode, savedWarmth]) => {
      if (savedMode === 'light' || savedMode === 'dark' || savedMode === 'system') {
        setModeState(savedMode);
      }
      if (savedWarmth !== null) {
        const parsed = Number(savedWarmth);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
          setWarmthState(parsed);
        }
      }
      setLoaded(true);
    });
  }, []);

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    AsyncStorage.setItem(STORAGE_KEY, newMode);
  }, []);

  const setWarmth = useCallback((value: number) => {
    const clamped = Math.round(Math.max(0, Math.min(100, value)));
    setWarmthState(clamped);
    AsyncStorage.setItem(WARMTH_KEY, String(clamped));
  }, []);

  const toggle = useCallback(() => {
    setMode(isDarkResolved ? 'light' : 'dark');
  }, [mode, systemScheme]);

  const isDarkResolved =
    mode === 'system' ? systemScheme === 'dark' : mode === 'dark';

  const colors = useMemo(() => {
    if (!isDarkResolved) return lightColors;

    const t = warmth / 100;
    return {
      ...darkColors,
      // Backgrounds — from cool black to warm brown
      bg: interpolateColor(t, '#0A0A0A', '#14120E', '#1E1A14'),
      surface: interpolateColor(t, '#1C1C1E', '#1F1C16', '#2A2520'),
      surfaceAlt: interpolateColor(t, '#2C2C2E', '#2E2A22', '#3A3428'),
      // Borders — warmer grays
      grayLight: interpolateColor(t, '#3A3A3C', '#3A3630', '#443E34'),
      border: interpolateColor(t, '#2E2E45', '#2E2C28', '#3A3630'),
      // Text — slightly warmer whites
      black: interpolateColor(t, '#F0F0F5', '#F0EDE8', '#EDE8E0'),
      gray: interpolateColor(t, '#A0A0B0', '#A0A098', '#A89E92'),
      // Disabled states
      disabled: interpolateColor(t, '#555570', '#555048', '#5A5448'),
      disabledBg: interpolateColor(t, '#252540', '#252218', '#2E2A20'),
      // Badge
      badgeBg: interpolateColor(t, '#1A237E', '#1A2040', '#2A2518'),
      badgeText: interpolateColor(t, '#8AB4F8', '#8AB0E0', '#C0B090'),
    };
  }, [isDarkResolved, warmth]);

  return (
    <ThemeContext.Provider value={{ mode, isDark: isDarkResolved, warmth, colors, setMode, setWarmth, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  return useContext(ThemeContext);
}
