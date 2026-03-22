/**
 * useAsyncStorage — Type-safe hook for reading/writing AsyncStorage values.
 * Returns [value, setValue, loading] tuple.
 */
import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export function useAsyncStorage<T>(
  key: string,
  defaultValue: T,
): [T, (newValue: T) => Promise<void>, boolean] {
  const [value, setValueState] = useState<T>(defaultValue);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(key)
      .then((raw) => {
        if (!cancelled && raw !== null) {
          try {
            setValueState(JSON.parse(raw) as T);
          } catch {
            setValueState(raw as unknown as T);
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const setValue = useCallback(
    async (newValue: T) => {
      setValueState(newValue);
      await AsyncStorage.setItem(key, JSON.stringify(newValue));
    },
    [key],
  );

  return [value, setValue, loading];
}
