import { Platform, useWindowDimensions } from 'react-native';

// ─── Design tokens — norte.digital dark premium ─────────────────────────────
export const colors = {
  // Fondos — tinte azul marino oscuro para que los accents hagan contraste
  bg:          '#060810',   // near-black navy
  surface:     '#0D1120',   // card bg
  surfaceAlt:  '#131828',   // input/chip bg
  surfaceHigh: '#1A2035',   // elevated surface

  // Texto
  white:         '#FFFFFF',
  textPrimary:   '#FFFFFF',
  textSecondary: '#9AA0B8',
  textMuted:     '#505570',

  // Accents — vibrantes, bien saturados
  primary:    '#4181F5',   // electric blue
  primaryDim: '#0F2657',   // blue dark bg
  accent:     '#FF2A09',   // bold red/orange
  accentDim:  '#4A0C00',

  // Macros
  calories: '#FFFFFF',
  carbs:    '#F59E0B',
  protein:  '#4181F5',
  fats:     '#FF4422',
  success:  '#22C55E',

  // Legacy aliases
  black:      '#FFFFFF',
  gray:       '#9AA0B8',
  grayLight:  '#1A2035',
  disabled:   '#505570',
  disabledBg: '#0D1120',
  border:     '#1E2440',

  // Tabs
  tabActive:   '#4181F5',
  tabInactive: '#505570',

  // Badge
  badgeBg:   '#0F2657',
  badgeText: '#4181F5',
};

// ─── Meal type colors ────────────────────────────────────────────────────────
export const mealColors: Record<string, { label: string; icon: string; color: string }> = {
  breakfast: { label: 'Desayuno', icon: 'sunny-outline',      color: '#F59E0B' },
  lunch:     { label: 'Almuerzo', icon: 'restaurant-outline', color: '#22C55E' },
  dinner:    { label: 'Cena',     icon: 'moon-outline',       color: '#4181F5' },
  snack:     { label: 'Snack',    icon: 'cafe-outline',       color: '#FF2A09' },
};

export const typography = {
  hero:    { fontSize: 40, fontWeight: '800' as const, letterSpacing: -1 },
  title:   { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.5, lineHeight: 36 },
  titleMd: { fontSize: 22, fontWeight: '800' as const, letterSpacing: -0.3 },
  titleSm: { fontSize: 18, fontWeight: '700' as const },
  subtitle: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
  body:    { fontSize: 16, fontWeight: '400' as const, lineHeight: 24 },
  bodyMd:  { fontSize: 15, fontWeight: '500' as const },
  option:  { fontSize: 16, fontWeight: '500' as const },
  button:  { fontSize: 16, fontWeight: '700' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
  label:   { fontSize: 13, fontWeight: '600' as const },
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
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  xxl: 28,
  full: 999,
};

export const shadows = {
  none: {},
  sm: Platform.select({
    ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 4 },
    android: { elevation: 2 },
    web:     { boxShadow: '0 1px 4px rgba(0,0,0,0.4)' },
  }) ?? {},
  md: Platform.select({
    ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12 },
    android: { elevation: 6 },
    web:     { boxShadow: '0 4px 12px rgba(0,0,0,0.5)' },
  }) ?? {},
  lg: Platform.select({
    ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 24 },
    android: { elevation: 12 },
    web:     { boxShadow: '0 8px 24px rgba(0,0,0,0.6)' },
  }) ?? {},
  glow: Platform.select({
    ios:     { shadowColor: '#4181F5', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 16 },
    android: { elevation: 8 },
    web:     { boxShadow: '0 0 16px rgba(65,129,245,0.5)' },
  }) ?? {},
};

// ─── Responsive layout ───────────────────────────────────────────────────────
export const MAX_WIDTH = 480;

export const useLayout = () => {
  const { width, height } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const contentWidth = isWeb ? Math.min(width, MAX_WIDTH) : width;
  const sidePadding = spacing.lg;
  const innerWidth = contentWidth - sidePadding * 2;

  return { width, height, contentWidth, sidePadding, innerWidth, isWeb };
};

// ─── Legacy export para compatibilidad ──────────────────────────────────────
export const theme = {
  colors: {
    ...colors,
    primary:      colors.primary,
    primaryDark:  '#2B64D9',
    primaryLight: colors.primaryDim,
    background:   colors.bg,
    surface:      colors.surface,
    text:         colors.textPrimary,
    textSecondary: colors.textSecondary,
    textLight:    colors.disabled,
    protein:      colors.protein,
    proteinLight: colors.primaryDim,
    carbs:        colors.carbs,
    carbsLight:   '#3A2E00',
    fat:          colors.fats,
    fatLight:     colors.accentDim,
    success:      colors.success,
    warning:      colors.carbs,
    danger:       colors.accent,
    info:         colors.primary,
    water:        colors.primary,
    border:       colors.border,
    cardShadow:   '#000',
    tabActive:    colors.tabActive,
    tabInactive:  colors.tabInactive,
  },
  spacing,
  borderRadius: { sm: radius.sm, md: radius.md, lg: radius.lg, xl: radius.xxl, full: radius.full },
  fontSize: {
    xs: 11, sm: 13, md: 15, lg: 18, xl: 24, xxl: 32, hero: 48,
  },
  shadow: {
    none: { shadowColor: 'transparent', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0, shadowRadius: 0, elevation: 0 },
    sm:   { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 4,  elevation: 2 },
    md:   { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 6 },
    lg:   { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 24, elevation: 12 },
  },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
};

export type Theme = typeof theme;
