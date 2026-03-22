/**
 * useAnalytics — Hook for analytics tracking in screens
 *
 * Exposes track() and screen() from the analytics service.
 * Auto-tracks screen views when screenName is provided.
 */
import { useEffect, useCallback } from 'react';
import { analyticsService } from '../services/analytics.service';

export function useAnalytics(screenName?: string) {
  // Auto-track screen view on mount
  useEffect(() => {
    if (screenName) {
      analyticsService.screen(screenName);
    }
  }, [screenName]);

  const track = useCallback(
    (event: string, properties?: Record<string, any>) => {
      analyticsService.track(event, properties);
    },
    [],
  );

  const screen = useCallback(
    (name: string, properties?: Record<string, any>) => {
      analyticsService.screen(name, properties);
    },
    [],
  );

  return { track, screen };
}
