/**
 * riskDeepLink -- Maps risk-related push notification routes to screen navigation.
 *
 * Usage:
 *   handleRiskDeepLink('/risk', navigation);
 */

/** Minimal navigation interface to avoid importing the full React Navigation package. */
interface NavigationLike {
  navigate(screen: string, params?: Record<string, unknown>): void;
}

const ROUTE_MAP: Record<string, { screen: string; params?: Record<string, unknown> }> = {
  '/risk': { screen: 'HomeMain', params: { scrollToRisk: true } },
  '/log': { screen: 'Registro' },
  '/scan': { screen: 'Scan' },
};

export function handleRiskDeepLink(route: string, navigation: NavigationLike): void {
  const target = ROUTE_MAP[route];
  if (target) {
    navigation.navigate(target.screen, target.params);
  }
}
