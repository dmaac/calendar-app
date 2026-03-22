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
      bg: interpolateColor(t, '#0A0A0A', '#1A1510', '#2A2015'),
      surface: interpolateColor(t, '#1C1C1E', '#252018', '#352A1F'),
      surfaceAlt: interpolateColor(t, '#2C2C2E', '#352A20', '#453A28'),
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
