/**
 * AnalyticsService — Centralized event tracking for Fitsi IA
 *
 * Current implementation: console.log (dev) + in-memory ring buffer (last 100 events).
 * Prepared for Mixpanel / Amplitude / PostHog integration — swap the _send() method.
 */

export interface AnalyticsEvent {
  event: string;
  properties?: Record<string, any>;
  timestamp: string;
}

const MAX_BUFFER_SIZE = 100;

class AnalyticsService {
  private buffer: AnalyticsEvent[] = [];
  private userId: string | null = null;
  private userTraits: Record<string, any> = {};

  // ── Core API ───────────────────────────────────────────────────────────────

  /** Track a named event with optional properties */
  track(event: string, properties?: Record<string, any>): void {
    const entry: AnalyticsEvent = {
      event,
      properties: {
        ...properties,
        ...(this.userId ? { user_id: this.userId } : {}),
      },
      timestamp: new Date().toISOString(),
    };

    this._pushToBuffer(entry);
    this._send(entry);
  }

  /** Identify a user for all subsequent events */
  identify(userId: string, traits?: Record<string, any>): void {
    this.userId = userId;
    if (traits) {
      this.userTraits = { ...this.userTraits, ...traits };
    }

    if (__DEV__) {
      console.log('[Analytics] identify', userId, traits ?? {});
    }

    // Future: mixpanel.identify(userId); mixpanel.people.set(traits);
  }

  /** Track a screen view */
  screen(screenName: string, properties?: Record<string, any>): void {
    this.track('screen_viewed', { screen_name: screenName, ...properties });
  }

  /** Reset identity (on logout) */
  reset(): void {
    this.userId = null;
    this.userTraits = {};
    this.buffer = [];

    if (__DEV__) {
      console.log('[Analytics] reset');
    }

    // Future: mixpanel.reset();
  }

  // ── Buffer ─────────────────────────────────────────────────────────────────

  /** Get the last N buffered events (defaults to all) */
  getBuffer(limit?: number): AnalyticsEvent[] {
    if (limit) {
      return this.buffer.slice(-limit);
    }
    return [...this.buffer];
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private _pushToBuffer(entry: AnalyticsEvent): void {
    this.buffer.push(entry);
    if (this.buffer.length > MAX_BUFFER_SIZE) {
      this.buffer.shift();
    }
  }

  private _send(entry: AnalyticsEvent): void {
    if (__DEV__) {
      console.log(`[Analytics] ${entry.event}`, entry.properties ?? {});
    }

    // Future integration point:
    // mixpanel.track(entry.event, entry.properties);
    // amplitude.logEvent(entry.event, entry.properties);
    // posthog.capture(entry.event, entry.properties);
  }
}

/** Singleton instance — import this everywhere */
export const analyticsService = new AnalyticsService();
