/**
 * ThemeContext — App-level dark mode control
 * Allows toggling dark mode independently of OS setting.
 * Persists preference in AsyncStorage.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightColors, darkColors } from '../theme';

const STORAGE_KEY = '@fitsi_theme_mode';

type ThemeMode = 'system' | 'light' | 'dark';

interface ThemeContextType {
  mode: ThemeMode;
  isDark: boolean;
  colors: typeof lightColors;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  mode: 'system',
  isDark: false,
  colors: lightColors,
  setMode: () => {},
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [loaded, setLoaded] = useState(false);

  // Load saved preference
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        setModeState(saved);
      }
      setLoaded(true);
    });
  }, []);

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    AsyncStorage.setItem(STORAGE_KEY, newMode);
  }, []);

  const toggle = useCallback(() => {
    setMode(isDarkResolved ? 'light' : 'dark');
  }, [mode, systemScheme]);

  const isDarkResolved =
    mode === 'system' ? systemScheme === 'dark' : mode === 'dark';

  const colors = isDarkResolved ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ mode, isDark: isDarkResolved, colors, setMode, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  return useContext(ThemeContext);
}
