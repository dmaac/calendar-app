/**
 * navigation/types.ts -- Type-safe navigation param lists for React Navigation v7.
 *
 * Every screen in the app has its params declared here. Screens that accept no
 * params use `undefined`. This file is the single source of truth for
 * navigation types across the entire app.
 *
 * Usage in screens:
 *   import type { HomeStackScreenProps } from '../navigation/types';
 *   export default function ScanScreen({ navigation, route }: HomeStackScreenProps<'Scan'>) { ... }
 *
 * Usage with useNavigation hook:
 *   import type { HomeStackNavigationProp } from '../navigation/types';
 *   const navigation = useNavigation<HomeStackNavigationProp>();
 */
import type {
  CompositeScreenProps,
  NavigatorScreenParams,
} from '@react-navigation/native';
import type { StackScreenProps } from '@react-navigation/stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { AIFoodLog, OnboardingProfileRead } from '../types';

// ─── Recipe type (duplicated here to avoid circular deps with RecipeDetailScreen) ──
export interface NavigationRecipe {
  id: string;
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
  prep_time: number;
  servings: number;
  ingredients: Array<{ name: string; amount: string }>;
  instructions: string[];
  image_url?: string;
  tags?: string[];
}

// ─── Auth Stack ─────────────────────────────────────────────────────────────

export type AuthStackParamList = {
  Login: undefined;
};

// ─── Home Stack ─────────────────────────────────────────────────────────────

export type HomeStackParamList = {
  HomeMain: undefined;
  Achievements: undefined;
  Reports: undefined;
  Coach: undefined;
  MealPlan: undefined;
  Challenges: undefined;
  Paywall: undefined;
  Scan: undefined;
  Barcode: { onScan?: (data: string) => void; mealType?: string } | undefined;
  Recipes: undefined;
  RecipeDetail: { recipe: NavigationRecipe };
  Favorites: undefined;
  RiskDetail: undefined;
  ShoppingList: undefined;
  AchievementShowcase: undefined;
  RewardsShop: undefined;
  MealBrowser: undefined;
  CalorieAdjustment: undefined;
};

// ─── Log Stack ──────────────────────────────────────────────────────────────

export type LogStackParamList = {
  LogMain: undefined;
  AddFood: { mealType?: string } | undefined;
  EditFood: { log: AIFoodLog };
  History: { date?: string } | undefined;
  FoodSearch: { mealType?: string } | undefined;
  CalendarView: undefined;
  Favorites: undefined;
};

// ─── Profile Stack ──────────────────────────────────────────────────────────

export type ProfileStackParamList = {
  ProfileMain: undefined;
  Paywall: undefined;
  EditProfile: { profile?: OnboardingProfileRead; firstName?: string; lastName?: string } | undefined;
  WeightTracking: undefined;
  Settings: undefined;
  PersonalDetails: undefined;
  FamilyPlan: undefined;
  RingColors: undefined;
  Language: undefined;
  TrackingReminders: undefined;
  NotificationPreferences: undefined;
  Referral: undefined;
  NutritionGoals: undefined;
  PDFReport: undefined;
  WidgetGuide: undefined;
  Help: undefined;
  Workouts: undefined;
  PrivacyPolicy: undefined;
  TermsOfService: undefined;
  About: undefined;
};

// ─── Scan Stack ─────────────────────────────────────────────────────────────

export type ScanStackParamList = {
  ScanMain: undefined;
  Barcode: { onScan?: (data: string) => void; mealType?: string } | undefined;
};

// ─── Recipes Stack ──────────────────────────────────────────────────────────

export type RecipesStackParamList = {
  RecipesMain: undefined;
  RecipeDetail: { recipe: NavigationRecipe };
};

// ─── Tab Navigator ──────────────────────────────────────────────────────────

export type MainTabParamList = {
  Inicio: NavigatorScreenParams<HomeStackParamList>;
  Registro: NavigatorScreenParams<LogStackParamList>;
  Progress: undefined;
  Groups: undefined;
  Community: undefined;
  Perfil: NavigatorScreenParams<ProfileStackParamList>;
};

// ─── Root Stack (wraps everything in AppNavigator) ──────────────────────────

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<MainTabParamList>;
};

// ─── Screen Props helpers ───────────────────────────────────────────────────

/** Props for screens inside HomeStack */
export type HomeStackScreenProps<T extends keyof HomeStackParamList> =
  CompositeScreenProps<
    StackScreenProps<HomeStackParamList, T>,
    BottomTabScreenProps<MainTabParamList>
  >;

/** Props for screens inside LogStack */
export type LogStackScreenProps<T extends keyof LogStackParamList> =
  CompositeScreenProps<
    StackScreenProps<LogStackParamList, T>,
    BottomTabScreenProps<MainTabParamList>
  >;

/** Props for screens inside ProfileStack */
export type ProfileStackScreenProps<T extends keyof ProfileStackParamList> =
  CompositeScreenProps<
    StackScreenProps<ProfileStackParamList, T>,
    BottomTabScreenProps<MainTabParamList>
  >;

/** Props for screens inside ScanStack */
export type ScanStackScreenProps<T extends keyof ScanStackParamList> =
  CompositeScreenProps<
    StackScreenProps<ScanStackParamList, T>,
    BottomTabScreenProps<MainTabParamList>
  >;

/** Props for screens inside RecipesStack */
export type RecipesStackScreenProps<T extends keyof RecipesStackParamList> =
  CompositeScreenProps<
    StackScreenProps<RecipesStackParamList, T>,
    BottomTabScreenProps<MainTabParamList>
  >;

/** Props for tab-level screens (Progress, Groups, Community) */
export type MainTabScreenProps<T extends keyof MainTabParamList> =
  BottomTabScreenProps<MainTabParamList, T>;

// ─── Navigation prop helpers (for useNavigation hook) ───────────────────────

export type HomeStackNavigationProp = HomeStackScreenProps<'HomeMain'>['navigation'];
export type LogStackNavigationProp = LogStackScreenProps<'LogMain'>['navigation'];
export type ProfileStackNavigationProp = ProfileStackScreenProps<'ProfileMain'>['navigation'];

// ─── Global type augmentation for useNavigation ─────────────────────────────
// This makes useNavigation() return typed navigation without explicit generics
// in the most common case (navigating between tabs).

declare global {
  namespace ReactNavigation {
    interface RootParamList extends MainTabParamList {}
  }
}
