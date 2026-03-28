import { Platform, useColorScheme, useWindowDimensions } from 'react-native';

// ─── Design tokens (Fitsi AI style) ───────────────────────────────────────────

/** Light mode palette — Fitsi AI (Norte Digital inspired) */
export const lightColors = {
  // Fondos
  bg: '#FFFFFF',
  surface: '#F5F5F5',
  surfaceAlt: '#EEF2F7',

  // Texto
  black: '#1A1A2E',
  gray: '#666666',
  grayLight: '#E0E0E0',

  // Acciones
  primary: '#4285F4',
  accent: '#4285F4',

  // Estados
  disabled: '#BDBDBD',
  disabledBg: '#E0E0E0',
  white: '#FFFFFF',

  // Macros (dashboard)
  calories: '#1A1A2E',
  carbs: '#FBBC04',
  protein: '#EA4335',
  fats: '#4285F4',
  success: '#34A853',

  // Tabs
  tabActive: '#4285F4',
  tabInactive: '#BDBDBD',
  border: '#E0E0E0',

  // Badge
  badgeBg: '#E8F0FE',
  badgeText: '#1967D2',
};

/** Dark mode palette — Fitsi AI (Norte Digital inspired, WCAG AA) */
export const darkColors: typeof lightColors = {
  bg: '#0D0D1A',
  surface: '#1A1A2E',
  surfaceAlt: '#252540',

  black: '#F0F0F5',
  gray: '#A0A0B0',
  grayLight: '#2E2E45',

  primary: '#5B9CF6',
  accent: '#5B9CF6',

  disabled: '#555570',
  disabledBg: '#252540',
  white: '#FFFFFF',

  calories: '#F0F0F5',
  carbs: '#FDD663',
  protein: '#F28B82',
  fats: '#8AB4F8',
  success: '#81C995',

  tabActive: '#5B9CF6',
  tabInactive: '#555570',
  border: '#2E2E45',

  badgeBg: '#1A237E',
  badgeText: '#8AB4F8',
};

// Default export for backward compatibility — light palette
export const colors = lightColors;

/**
 * Parses a hex color string (#RRGGBB) into [r, g, b] components.
 */
function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

/**
 * Converts [r, g, b] components back to a hex string.
 */
function toHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + [clamp(r), clamp(g), clamp(b)]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/**
 * Interpolates between two or three hex colors based on a normalized factor t (0..1).
 * With two colors: linear interpolation.
 * With three colors (cold, mid, warm): 0->cold, 0.5->mid, 1.0->warm.
 */
export function interpolateColor(t: number, cold: string, mid: string, warm: string): string {
  const [cr, cg, cb] = parseHex(cold);
  const [mr, mg, mb] = parseHex(mid);
  const [wr, wg, wb] = parseHex(warm);

  if (t <= 0.5) {
    const f = t * 2; // 0..1 within first half
    return toHex(
      cr + (mr - cr) * f,
      cg + (mg - cg) * f,
      cb + (mb - cb) * f,
    );
  } else {
    const f = (t - 0.5) * 2; // 0..1 within second half
    return toHex(
      mr + (wr - mr) * f,
      mg + (wg - mg) * f,
      mb + (wb - mb) * f,
    );
  }
}

/**
 * useThemeColors — Returns the correct color palette based on app theme (ThemeContext).
 * Falls back to device color scheme if ThemeContext is not available.
 */
export function useThemeColors() {
  try {
    // Use app-level theme context (supports toggle from Settings + warmth)
    const { useAppTheme } = require('../context/ThemeContext');
    const { colors: themeColors } = useAppTheme();
    return themeColors;
  } catch {
    // Fallback: use OS color scheme (for screens rendered outside ThemeProvider)
    const scheme = useColorScheme();
    return scheme === 'dark' ? darkColors : lightColors;
  }
}

// ─── Meal type colors (shared across LogScreen, HomeScreen, ScanScreen, AddFoodScreen) ─
export const mealColors: Record<string, { label: string; icon: string; color: string }> = {
  breakfast: { label: 'Desayuno', icon: 'sunny-outline',      color: '#F59E0B' },
  lunch:     { label: 'Almuerzo', icon: 'restaurant-outline', color: '#10B981' },
  dinner:    { label: 'Cena',     icon: 'moon-outline',       color: '#6366F1' },
  snack:     { label: 'Snack',    icon: 'cafe-outline',       color: '#EC4899' },
};

export const typography = {
  hero: { fontSize: 40, fontWeight: '800' as const, letterSpacing: -1 },
  title: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.5, lineHeight: 36 },
  titleMd: { fontSize: 22, fontWeight: '800' as const, letterSpacing: -0.3 },
  titleSm: { fontSize: 18, fontWeight: '700' as const },
  subtitle: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
  body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 24 },
  bodyMd: { fontSize: 15, fontWeight: '500' as const },
  option: { fontSize: 16, fontWeight: '500' as const },
  button: { fontSize: 16, fontWeight: '700' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
  label: { fontSize: 13, fontWeight: '600' as const },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 14,
  xl: 20,
  xxl: 28,
  full: 999,
};

export const shadows = {
  none: {},
  sm: Platform.select({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
    android: { elevation: 2 },
    web: { boxShadow: '0 1px 3px rgba(0,0,0,0.08)' },
  }) ?? {},
  md: Platform.select({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 },
    android: { elevation: 4 },
    web: { boxShadow: '0 2px 8px rgba(0,0,0,0.10)' },
  }) ?? {},
  lg: Platform.select({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 16 },
    android: { elevation: 8 },
    web: { boxShadow: '0 4px 16px rgba(0,0,0,0.12)' },
  }) ?? {},
};

// ─── Responsive layout ─────────────────────────────────────────────────────
export const MAX_WIDTH = 480; // máximo en web, full en mobile

export const useLayout = () => {
  const { width, height } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const contentWidth = isWeb ? Math.min(width, MAX_WIDTH) : width;
  const sidePadding = spacing.lg;
  const innerWidth = contentWidth - sidePadding * 2;

  return { width, height, contentWidth, sidePadding, innerWidth, isWeb };
};

// ─── Legacy export para compatibilidad ─────────────────────────────────────
export const theme = {
  colors: {
    ...colors,
    primary: colors.success,
    primaryDark: '#059669',
    primaryLight: '#D1FAE5',
    background: colors.bg,
    surface: colors.white,
    text: colors.black,
    textSecondary: colors.gray,
    textLight: colors.disabled,
    protein: colors.protein,
    proteinLight: '#FEE2E2',
    carbs: colors.carbs,
    carbsLight: '#CFFAFE',
    fat: colors.fats,
    fatLight: '#FEF3C7',
    success: colors.success,
    warning: colors.carbs,
    danger: colors.protein,
    info: colors.fats,
    water: colors.fats,
    border: colors.border,
    cardShadow: '#000',
    tabActive: colors.tabActive,
    tabInactive: colors.tabInactive,
  },
  spacing,
  borderRadius: { sm: radius.sm, md: radius.md, lg: radius.lg, xl: radius.xxl, full: radius.full },
  fontSize: {
    xs: 11, sm: 13, md: 15, lg: 18, xl: 24, xxl: 32, hero: 48,
  },
  shadow: {
    none: { shadowColor: 'transparent', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0, shadowRadius: 0, elevation: 0 },
    sm: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 1, elevation: 0 },
    md: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
    lg: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  },
  card: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB' },
};

export type Theme = typeof theme;
