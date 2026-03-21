import { Platform, useWindowDimensions } from 'react-native';

// ─── Design tokens (Fitsi IA style) ───────────────────────────────────────────
export const colors = {
  // Fondos
  bg: '#FFFFFF',
  surface: '#F5F5F7',
  surfaceAlt: '#F0F0F5',

  // Texto
  black: '#111111',
  gray: '#8E8E93',
  grayLight: '#E5E5EA',

  // Acciones
  primary: '#111111',       // botón primario
  accent: '#FF7A5C',        // naranja highlight

  // Estados
  disabled: '#C7C7CC',
  disabledBg: '#E5E5EA',
  white: '#FFFFFF',

  // Macros (dashboard)
  calories: '#111111',
  carbs: '#F59E0B',
  protein: '#EF4444',
  fats: '#3B82F6',
  success: '#10B981',

  // Tabs (app principal)
  tabActive: '#111111',
  tabInactive: '#C7C7CC',
  border: '#E5E5EA',

  // Badge (streak, premium)
  badgeBg: '#FEF3C7',
  badgeText: '#92400E',
};

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
