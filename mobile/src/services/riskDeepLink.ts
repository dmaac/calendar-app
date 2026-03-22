/**
 * riskDeepLink — Maps risk-related push notification routes to screen navigation.
 *
 * Usage:
 *   handleRiskDeepLink('/risk', navigation);
 */

const ROUTE_MAP: Record<string, { screen: string; params?: Record<string, unknown> }> = {
  '/risk': { screen: 'Home', params: { scrollToRisk: true } },
  '/log': { screen: 'Registro' },
  '/scan': { screen: 'Scan' },
};

export function handleRiskDeepLink(route: string, navigation: any): void {
  const target = ROUTE_MAP[route];
  if (target) {
    navigation.navigate(target.screen, target.params);
  }
}
