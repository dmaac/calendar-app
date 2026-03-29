/**
 * useDebouncedValue — Generic debounce hook for search bars and similar inputs.
 * Returns a debounced version of the given value after the specified delay.
 */
import { useState, useEffect } from 'react';

export function useDebouncedValue<T>(value: T, delay: number = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
