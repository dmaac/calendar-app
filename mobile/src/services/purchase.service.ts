/**
 * purchase.service.ts — RevenueCat integration for Fitsi IA
 *
 * Handles:
 *   - SDK initialization (iOS & Android API keys from env)
 *   - Fetching offerings (monthly, annual plans)
 *   - Executing purchases
 *   - Restoring purchases (required by Apple)
 *   - Checking premium subscription status
 *
 * Entitlement ID: "premium" — configured in RevenueCat dashboard
 * Product IDs: fitsiai_monthly, fitsiai_annual
 */
import { Platform } from 'react-native';

// ─── Safe RevenueCat import (crashes in Expo Go where native module is missing)
let Purchases: any = null;
let LOG_LEVEL: any = null;
let PURCHASES_ERROR_CODE: any = null;
type PurchasesOfferings = any;
type PurchasesPackage = any;
type CustomerInfo = any;
type PurchasesError = any;

try {
  const rc = require('react-native-purchases');
  Purchases = rc.default;
  LOG_LEVEL = rc.LOG_LEVEL;
  PURCHASES_ERROR_CODE = rc.PURCHASES_ERROR_CODE;
} catch {
  // react-native-purchases not available (Expo Go)
}

// ─── Constants ──────────────────────────────────────────────────────────────

const ENTITLEMENT_ID = 'premium';

const RC_API_KEY_IOS = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';
const RC_API_KEY_ANDROID = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PurchaseResult {
  success: boolean;
  isPremium: boolean;
  customerInfo: CustomerInfo | null;
  error?: string;
  userCancelled?: boolean;
}

export interface OfferingPackages {
  monthly: PurchasesPackage | null;
  annual: PurchasesPackage | null;
}

// ─── SDK Initialization ─────────────────────────────────────────────────────

let _initialized = false;

/**
 * Initialize the RevenueCat SDK. Call this once, early in the app lifecycle
 * (e.g., in App.tsx or AuthContext after login).
 *
 * In web environment, this is a no-op since RevenueCat only supports native.
 */
export async function initializePurchases(userId?: string): Promise<void> {
  if (_initialized) return;
  if (!Purchases) return;

  // RevenueCat is native-only — skip on web
  if (Platform.OS === 'web') {
    return;
  }

  const apiKey = Platform.OS === 'ios' ? RC_API_KEY_IOS : RC_API_KEY_ANDROID;

  if (!apiKey) {
    return;
  }

  try {
    if (__DEV__) {
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    }

    Purchases.configure({ apiKey });

    // Identify the user so purchases are linked to their account
    if (userId) {
      await Purchases.logIn(userId);
    }

    _initialized = true;
  } catch {
    // RevenueCat initialization failed
  }
}

/**
 * Identify a user after login. This links their purchases to their account.
 * Must be called after initializePurchases().
 */
export async function identifyUser(userId: string): Promise<void> {
  if (Platform.OS === 'web' || !Purchases || !_initialized) return;

  try {
    await Purchases.logIn(userId);
  } catch {
    // Failed to identify user
  }
}

/**
 * Log out the current RevenueCat user. Call on app logout.
 */
export async function logOutPurchases(): Promise<void> {
  if (Platform.OS === 'web' || !Purchases || !_initialized) return;

  try {
    await Purchases.logOut();
  } catch {
    // Failed to logout from RevenueCat
  }
}

// ─── Offerings ──────────────────────────────────────────────────────────────

/**
 * Fetch all available offerings from RevenueCat.
 * Returns the raw PurchasesOfferings object.
 */
export async function getOfferings(): Promise<PurchasesOfferings | null> {
  if (Platform.OS === 'web' || !_initialized) return null;

  try {
    const offerings = await Purchases.getOfferings();
    return offerings;
  } catch {
    return null;
  }
}

/**
 * Get the monthly and annual packages from the current (default) offering.
 * These map to the fitsiai_monthly and fitsiai_annual product IDs.
 */
export async function getCurrentPackages(): Promise<OfferingPackages> {
  const offerings = await getOfferings();

  if (!offerings?.current) {
    return { monthly: null, annual: null };
  }

  return {
    monthly: offerings.current.monthly ?? null,
    annual: offerings.current.annual ?? null,
  };
}

// ─── Purchases ──────────────────────────────────────────────────────────────

/**
 * Execute a purchase for a given package.
 * Handles user cancellation, network errors, and other failure modes.
 */
export async function purchasePackage(
  pkg: PurchasesPackage
): Promise<PurchaseResult> {
  if (Platform.OS === 'web') {
    return {
      success: false,
      isPremium: false,
      customerInfo: null,
      error: 'Las compras no están disponibles en la versión web.',
    };
  }

  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const isPremium =
      customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;

    return {
      success: isPremium,
      isPremium,
      customerInfo,
    };
  } catch (err: unknown) {
    const purchaseErr = err as PurchasesError;

    // User cancelled — not an error
    if (purchaseErr.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
      return {
        success: false,
        isPremium: false,
        customerInfo: null,
        userCancelled: true,
      };
    }

    // Payment pending (e.g., parental approval, deferred payment)
    if (purchaseErr.code === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) {
      return {
        success: false,
        isPremium: false,
        customerInfo: null,
        error: 'El pago está pendiente de aprobación. Recibirás una notificación cuando se complete.',
      };
    }

    // Product already purchased
    if (purchaseErr.code === PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR) {
      // Try to restore to get the latest customer info
      const customerInfo = await Purchases.restorePurchases();
      const isPremium =
        customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;

      return {
        success: isPremium,
        isPremium,
        customerInfo,
        error: isPremium ? undefined : 'Ya tienes esta compra activa.',
      };
    }

    // Network error
    if (purchaseErr.code === PURCHASES_ERROR_CODE.NETWORK_ERROR) {
      return {
        success: false,
        isPremium: false,
        customerInfo: null,
        error: 'Error de conexión. Verifica tu internet e inténtalo de nuevo.',
      };
    }

    // Generic error
    return {
      success: false,
      isPremium: false,
      customerInfo: null,
      error: 'No se pudo completar la compra. Inténtalo de nuevo.',
    };
  }
}

// ─── Restore ────────────────────────────────────────────────────────────────

/**
 * Restore previous purchases. Required by Apple App Store guidelines.
 * Returns whether the user has an active premium entitlement.
 */
export async function restorePurchases(): Promise<PurchaseResult> {
  if (Platform.OS === 'web') {
    return {
      success: false,
      isPremium: false,
      customerInfo: null,
      error: 'La restauración de compras no está disponible en la versión web.',
    };
  }

  if (!_initialized) {
    return {
      success: false,
      isPremium: false,
      customerInfo: null,
      error: 'El servicio de compras no está inicializado.',
    };
  }

  try {
    const customerInfo = await Purchases.restorePurchases();
    const isPremium =
      customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;

    return {
      success: true,
      isPremium,
      customerInfo,
    };
  } catch {
    return {
      success: false,
      isPremium: false,
      customerInfo: null,
      error: 'No se pudo restaurar la compra. Inténtalo de nuevo.',
    };
  }
}

// ─── Subscription Status ────────────────────────────────────────────────────

/**
 * Check if the current user has an active premium subscription.
 * Uses RevenueCat's cached customer info (fast, offline-capable).
 */
export async function checkSubscriptionStatus(): Promise<boolean> {
  if (Platform.OS === 'web' || !_initialized) return false;

  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
  } catch {
    return false;
  }
}

/**
 * Get full customer info from RevenueCat.
 * Contains subscription details, active entitlements, management URLs, etc.
 */
export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (Platform.OS === 'web' || !_initialized) return null;

  try {
    return await Purchases.getCustomerInfo();
  } catch {
    return null;
  }
}

/**
 * Listen for customer info updates (e.g., subscription renewal, cancellation).
 * Returns an unsubscribe function.
 */
export function onCustomerInfoUpdated(
  callback: (info: CustomerInfo) => void
): () => void {
  if (Platform.OS === 'web' || !_initialized) {
    return () => {};
  }

  Purchases.addCustomerInfoUpdateListener(callback);

  // Return cleanup function
  return () => {
    Purchases.removeCustomerInfoUpdateListener(callback);
  };
}
