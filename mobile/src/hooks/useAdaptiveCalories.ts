/**
 * useAdaptiveCalories — Hook for the adaptive calorie target system.
 *
 * Fetches the current recommendation, provides apply/dismiss actions,
 * and exposes loading/error states.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  AdaptiveTargetResponse,
  getAdaptiveTarget,
  applyAdaptiveTarget,
  dismissAdaptiveTarget,
} from '../services/adaptiveCalorie.service';

interface UseAdaptiveCaloriesReturn {
  /** The recommendation data (null while loading or on error). */
  data: AdaptiveTargetResponse | null;
  /** True while the initial fetch is in progress. */
  loading: boolean;
  /** Error message if the fetch failed. */
  error: string | null;
  /** True while an apply/dismiss action is in progress. */
  acting: boolean;
  /** Apply the recommended adjustment. Returns true on success. */
  apply: () => Promise<boolean>;
  /** Dismiss the recommendation. Returns true on success. */
  dismiss: () => Promise<boolean>;
  /** Re-fetch the recommendation. */
  refetch: () => Promise<void>;
}

export default function useAdaptiveCalories(): UseAdaptiveCaloriesReturn {
  const [data, setData] = useState<AdaptiveTargetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getAdaptiveTarget();
      setData(result);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Error fetching adaptive target';
      setError(message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const apply = useCallback(async (): Promise<boolean> => {
    setActing(true);
    try {
      const result = await applyAdaptiveTarget();
      if (result.success) {
        // Refresh to get updated state
        await fetch();
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      setActing(false);
    }
  }, [fetch]);

  const dismiss = useCallback(async (): Promise<boolean> => {
    setActing(true);
    try {
      const result = await dismissAdaptiveTarget();
      if (result.success) {
        // Clear the pending adjustment locally
        setData((prev) =>
          prev ? { ...prev, has_pending_adjustment: false, adjustment: 0 } : prev
        );
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      setActing(false);
    }
  }, []);

  return {
    data,
    loading,
    error,
    acting,
    apply,
    dismiss,
    refetch: fetch,
  };
}
