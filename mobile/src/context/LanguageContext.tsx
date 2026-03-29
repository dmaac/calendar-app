import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from '../i18n';

const STORAGE_KEY = '@fitsi_language';

type TranslateFn = (scope: string, options?: Record<string, any>) => string;

interface LanguageContextType {
  locale: string;
  setLocale: (locale: string) => void;
  t: TranslateFn;
}

const LanguageContext = createContext<LanguageContextType>({
  locale: i18n.locale,
  setLocale: () => {},
  t: (scope, options) => i18n.t(scope, options) as string,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState(i18n.locale);

  // Load saved language preference on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved) {
        i18n.locale = saved;
        setLocaleState(saved);
      }
    });
  }, []);

  const setLocale = useCallback((newLocale: string) => {
    i18n.locale = newLocale;
    setLocaleState(newLocale);
    AsyncStorage.setItem(STORAGE_KEY, newLocale);
  }, []);

  const t: TranslateFn = useCallback(
    (scope: string, options?: Record<string, any>) => i18n.t(scope, options) as string,
    [locale],
  );

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  return useContext(LanguageContext);
}

export default LanguageContext;
