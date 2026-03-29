/**
 * purchase.service.ts — RevenueCat integration for Fitsi AI
 *
 * Handles:
 *   - SDK initialization (iOS & Android API keys from env)
 *   - Fetching offerings (monthly, annual, lifetime plans)
 *   - Executing purchases
 *   - Restoring purchases (required by Apple)
 *   - Checking premium subscription status
 *   - Listening for real-time subscription status changes
 *   - Trial status detection
 *   - Detailed subscription info (plan type, expiration, renewal)
 *
 * Entitlement ID: "premium" — configured in RevenueCat dashboard
 *
 * Product IDs (must match App Store Connect & Google Play Console):
 *   - fitsi_premium_monthly   — Monthly auto-renewable subscription ($4.99/mo)
 *   - fitsi_premium_yearly    — Annual auto-renewable subscription  ($29.99/yr)
 *   - fitsi_premium_lifetime  — One-time non-consumable purchase    ($79.99)
 *
 * RevenueCat Dashboard Configuration:
 *   - Entitlement: "premium"
 *   - Offering: "default" (contains monthly, annual, lifetime packages)
 *   - Apps: iOS (com.fitsiai.app), Android (com.fitsiai.app)
 *
 * Environment Variables (set in .env / .env.local):
 *   - EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_xxxxx
 *   - EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=goog_xxxxx
 */
import { Platform } from 'react-native';

// ─── RevenueCat type stubs (library is optional, loaded at runtime) ──────────
// These minimal interfaces describe only the surface area we use. When the
// real react-native-purchases package is installed, its own types take over.

/** Minimal entitlement info shape from RevenueCat. */
interface RCEntitlementInfo {
  isActive: boolean;
  willRenew: boolean;
  periodType: string; // 'NORMAL' | 'INTRO' | 'TRIAL'
  expirationDate: string | null;
  productIdentifier: string;
  isSandbox: boolean;
  [key: string]: unknown;
}

/** Minimal entitlements shape from RevenueCat CustomerInfo. */
interface RCEntitlements {
  active: Record<string, RCEntitlementInfo>;
  all: Record<string, RCEntitlementInfo>;
}

/** Minimal CustomerInfo from RevenueCat. */
interface RCCustomerInfo {
  entitlements: RCEntitlements;
  activeSubscriptions: string[];
  allPurchasedProductIdentifiers: string[];
  managementURL: string | null;
  originalAppUserId: string;
}

/** Minimal promotional offer from RevenueCat (iOS). */
interface RCPromotionalOffer {
  identifier: string;
  keyIdentifier: string;
  nonce: string;
  signature: string;
  timestamp: number;
}

/** Minimal product discount (intro / promo offer metadata). */
interface RCProductDiscount {
  identifier: string;
  price: number;
  priceString: string;
  cycles: number;
  period: string;
  periodUnit: string;
  periodNumberOfUnits: number;
}

/** Minimal package from RevenueCat offerings. */
interface RCPackage {
  identifier: string;
  packageType: string;
  product: {
    identifier: string;
    priceString: string;
    price: number;
    currencyCode: string;
    title: string;
    description: string;
    subscriptionPeriod?: string | null;
    introPrice?: RCProductDiscount | null;
    discounts?: RCProductDiscount[];
    [key: string]: unknown;
  };
}

/** Minimal offerings from RevenueCat. */
interface RCOfferings {
  current?: {
    identifier: string;
    monthly?: RCPackage | null;
    annual?: RCPackage | null;
    lifetime?: RCPackage | null;
    availablePackages: RCPackage[];
  } | null;
  all: Record<string, unknown>;
}

/** RevenueCat error shape. */
interface RCError {
  code: number | string;
  message?: string;
  userCancelled?: boolean;
}

/** RevenueCat SDK surface area we use. */
interface RCPurchasesStatic {
  setLogLevel(level: unknown): void;
  configure(config: { apiKey: string; appUserID?: string | null }): void;
  logIn(userId: string): Promise<{ customerInfo: RCCustomerInfo; created: boolean }>;
  logOut(): Promise<RCCustomerInfo>;
  getOfferings(): Promise<RCOfferings>;
  purchasePackage(pkg: RCPackage): Promise<{ customerInfo: RCCustomerInfo }>;
  purchasePackage(
    pkg: RCPackage,
    options: { promotionalOffer: RCPromotionalOffer },
  ): Promise<{ customerInfo: RCCustomerInfo }>;
  getPromotionalOffer(
    pkg: RCPackage,
    discount: RCProductDiscount,
  ): Promise<RCPromotionalOffer | undefined>;
  restorePurchases(): Promise<RCCustomerInfo>;
  getCustomerInfo(): Promise<RCCustomerInfo>;
  addCustomerInfoUpdateListener(callback: (info: RCCustomerInfo) => void): void;
  removeCustomerInfoUpdateListener(callback: (info: RCCustomerInfo) => void): void;
}

// Re-export the stub types for consumers
export type PurchasesOfferings = RCOfferings;
export type PurchasesPackage = RCPackage;
export type CustomerInfo = RCCustomerInfo;
export type PurchasesError = RCError;

// ─── Safe RevenueCat import (crashes in Expo Go where native module is missing)
let Purchases: RCPurchasesStatic | null = null;
let LOG_LEVEL: { DEBUG: unknown } | null = null;
let PURCHASES_ERROR_CODE: Record<string, number | string> | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const rc = require('react-native-purchases') as {
    default: RCPurchasesStatic;
    LOG_LEVEL: { DEBUG: unknown };
    PURCHASES_ERROR_CODE: Record<string, number | string>;
  };
  Purchases = rc.default;
  LOG_LEVEL = rc.LOG_LEVEL;
  PURCHASES_ERROR_CODE = rc.PURCHASES_ERROR_CODE;
} catch {
  // react-native-purchases not available (Expo Go / web)
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** The RevenueCat entitlement identifier that gates all premium features. */
export const ENTITLEMENT_ID = 'premium';

/**
 * Product identifiers — must match exactly in:
 *   1. App Store Connect (iOS) — Subscriptions & In-App Purchases sections
 *   2. Google Play Console (Android) — Products > Subscriptions & In-app products
 *   3. RevenueCat Dashboard — Products tab
 *
 * Naming convention: {app}_{tier}_{period}
 */
export const PRODUCT_IDS = {
  /** Monthly auto-renewable subscription */
  MONTHLY: 'fitsi_premium_monthly',
  /** Yearly auto-renewable subscription */
  YEARLY: 'fitsi_premium_yearly',
  /** One-time (non-consumable) lifetime purchase */
  LIFETIME: 'fitsi_premium_lifetime',
} as const;

/**
 * RevenueCat API keys from environment variables.
 *
 * These are PUBLIC keys (safe to ship in app binary) — they only allow
 * client-side operations (fetch offerings, make purchases, validate receipts).
 * The SECRET/webhook keys live on the backend for server-side validation.
 */
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
  lifetime: PurchasesPackage | null;
}

export type PlanType = 'monthly' | 'yearly' | 'lifetime' | 'none';

export interface SubscriptionInfo {
  /** Whether the "premium" entitlement is currently active. */
  isActive: boolean;
  /** Whether the subscription will auto-renew at period end. */
  willRenew: boolean;
  /** ISO date string when the current period expires (null for lifetime). */
  expirationDate: string | null;
  /** The store product identifier of the active subscription. */
  productIdentifier: string | null;
  /** Resolved plan type based on the product identifier. */
  planType: PlanType;
  /** Whether the user is currently in a free trial period. */
  isTrial: boolean;
  /** Whether the subscription is in a grace period after failed billing. */
  isGracePeriod: boolean;
  /** URL to manage the subscription (App Store / Play Store settings). */
  managementURL: string | null;
  /** Whether this is a sandbox/test purchase. */
  isSandbox: boolean;
}

export interface TrialStatus {
  /** Whether the user is currently in a free trial period. */
  isTrialing: boolean;
  /** Number of full days remaining in the trial. 0 if not trialing. */
  trialDaysRemaining: number;
  /** ISO date string when the trial expires. null if not trialing. */
  trialExpirationDate: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Resolve a product identifier to a human-readable plan type. */
function resolvePlanType(productIdentifier: string | null): PlanType {
  if (!productIdentifier) return 'none';
  if (productIdentifier.includes('lifetime')) return 'lifetime';
  if (productIdentifier.includes('yearly') || productIdentifier.includes('annual')) return 'yearly';
  if (productIdentifier.includes('monthly')) return 'monthly';
  return 'none';
}

/** Check whether the SDK is ready for native operations. */
function isNativeReady(): boolean {
  return Platform.OS !== 'web' && Purchases !== null && _initialized;
}

// ─── SDK Initialization ─────────────────────────────────────────────────────

let _initialized = false;

/**
 * Initialize the RevenueCat SDK. Call this once, early in the app lifecycle
 * (e.g., in App.tsx or AuthContext after login).
 *
 * In web environment, this is a no-op since RevenueCat only supports native.
 *
 * @param userId - Optional user ID to identify with RevenueCat immediately.
 *                 If omitted, RevenueCat creates an anonymous user.
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
    if (__DEV__) {
      console.warn(
        `[PurchaseService] No RevenueCat API key for ${Platform.OS}. ` +
        `Set EXPO_PUBLIC_REVENUECAT_${Platform.OS === 'ios' ? 'IOS' : 'ANDROID'}_KEY in .env`,
      );
    }
    return;
  }

  try {
    if (__DEV__ && LOG_LEVEL) {
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    }

    Purchases.configure({
      apiKey,
      appUserID: userId ?? null,
    });

    // If userId provided, also call logIn to link anonymous -> identified
    if (userId) {
      await Purchases.logIn(userId);
    }

    _initialized = true;

    if (__DEV__) {
      console.info(
        `[PurchaseService] RevenueCat initialized (${Platform.OS}, ` +
        `user: ${userId ?? 'anonymous'})`,
      );
    }
  } catch (err) {
    console.error('[PurchaseService] RevenueCat initialization failed:', err);
  }
}

/**
 * Returns whether the SDK has been successfully initialized.
 * Useful for guards in UI components.
 */
export function isInitialized(): boolean {
  return _initialized;
}

/**
 * Identify a user after login. This links their purchases to their account.
 * Must be called after initializePurchases().
 *
 * RevenueCat will merge any anonymous purchases into this user's account.
 */
export async function identifyUser(userId: string): Promise<void> {
  if (!isNativeReady()) return;

  try {
    const { created } = await Purchases!.logIn(userId);
    if (__DEV__ && created) {
      console.info(`[PurchaseService] New RevenueCat user created for ${userId}`);
    }
  } catch (err) {
    console.error('[PurchaseService] Failed to identify user:', err);
  }
}

/**
 * Log out the current RevenueCat user. Call on app logout.
 * This resets to an anonymous user — important for multi-account devices.
 */
export async function logOutPurchases(): Promise<void> {
  if (!isNativeReady()) return;

  try {
    await Purchases!.logOut();
  } catch (err) {
    console.error('[PurchaseService] Failed to logout from RevenueCat:', err);
  }
}

// ─── Offerings ──────────────────────────────────────────────────────────────

/**
 * Fetch all available offerings from RevenueCat.
 * Returns the raw PurchasesOfferings object.
 *
 * Offerings are cached by the RevenueCat SDK — subsequent calls are fast.
 */
export async function getOfferings(): Promise<PurchasesOfferings | null> {
  if (!isNativeReady()) return null;

  try {
    const offerings = await Purchases!.getOfferings();
    return offerings;
  } catch (err) {
    console.error('[PurchaseService] Failed to fetch offerings:', err);
    return null;
  }
}

/**
 * Get the monthly, annual, and lifetime packages from the current (default) offering.
 *
 * These map to RevenueCat package types:
 *   - monthly  -> $rc_monthly  -> fitsi_premium_monthly
 *   - annual   -> $rc_annual   -> fitsi_premium_yearly
 *   - lifetime -> $rc_lifetime -> fitsi_premium_lifetime
 *
 * RevenueCat auto-maps products to package types based on subscription period.
 * Lifetime is a non-consumable IAP that gets the $rc_lifetime type.
 */
export async function getCurrentPackages(): Promise<OfferingPackages> {
  const offerings = await getOfferings();

  if (!offerings?.current) {
    return { monthly: null, annual: null, lifetime: null };
  }

  // RevenueCat may expose lifetime as a named property or inside availablePackages
  let lifetimePkg = offerings.current.lifetime ?? null;

  if (!lifetimePkg && offerings.current.availablePackages) {
    lifetimePkg =
      offerings.current.availablePackages.find(
        (p) =>
          p.identifier === '$rc_lifetime' ||
          p.identifier === 'lifetime' ||
          p.product?.identifier === PRODUCT_IDS.LIFETIME,
      ) ?? null;
  }

  return {
    monthly: offerings.current.monthly ?? null,
    annual: offerings.current.annual ?? null,
    lifetime: lifetimePkg,
  };
}

// ─── Purchases ──────────────────────────────────────────────────────────────

/**
 * Execute a purchase for a given package.
 *
 * Handles all failure modes:
 *   - User cancellation (not an error)
 *   - Payment pending (parental controls, deferred payments)
 *   - Product already purchased (auto-restores)
 *   - Store problems (StoreKit / Play Billing)
 *   - Network errors
 */
export async function purchasePackage(
  pkg: PurchasesPackage,
): Promise<PurchaseResult> {
  if (Platform.OS === 'web') {
    return {
      success: false,
      isPremium: false,
      customerInfo: null,
      error: 'Las compras no estan disponibles en la version web.',
    };
  }

  if (!isNativeReady()) {
    return {
      success: false,
      isPremium: false,
      customerInfo: null,
      error: 'El servicio de compras no esta inicializado.',
    };
  }

  try {
    const { customerInfo } = await Purchases!.purchasePackage(pkg);
    const isPremium =
      customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;

    if (__DEV__) {
      console.info(
        `[PurchaseService] Purchase complete — premium: ${isPremium}, ` +
        `product: ${pkg.product.identifier}`,
      );
    }

    return {
      success: isPremium,
      isPremium,
      customerInfo,
    };
  } catch (err: unknown) {
    const purchaseErr = err as PurchasesError;

    // User cancelled — not an error, return silently
    if (
      purchaseErr.userCancelled ||
      purchaseErr.code === PURCHASES_ERROR_CODE?.PURCHASE_CANCELLED_ERROR
    ) {
      return {
        success: false,
        isPremium: false,
        customerInfo: null,
        userCancelled: true,
      };
    }

    // Payment pending (e.g., Ask to Buy, deferred payment)
    if (purchaseErr.code === PURCHASES_ERROR_CODE?.PAYMENT_PENDING_ERROR) {
      return {
        success: false,
        isPremium: false,
        customerInfo: null,
        error: 'El pago esta pendiente de aprobacion. Recibiras una notificacion cuando se complete.',
      };
    }

    // Product already purchased — try to restore
    if (purchaseErr.code === PURCHASES_ERROR_CODE?.PRODUCT_ALREADY_PURCHASED_ERROR) {
      try {
        const customerInfo = await Purchases!.restorePurchases();
        const isPremium =
          customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;

        return {
          success: isPremium,
          isPremium,
          customerInfo,
          error: isPremium ? undefined : 'Ya tienes esta compra activa.',
        };
      } catch {
        return {
          success: false,
          isPremium: false,
          customerInfo: null,
          error: 'Ya tienes esta compra. Intenta restaurar compras.',
        };
      }
    }

    // Store problem (e.g., StoreKit error, Play Billing unavailable)
    if (purchaseErr.code === PURCHASES_ERROR_CODE?.STORE_PROBLEM_ERROR) {
      return {
        success: false,
        isPremium: false,
        customerInfo: null,
        error: 'Hubo un problema con la tienda. Intenta de nuevo en unos minutos.',
      };
    }

    // Network error
    if (purchaseErr.code === PURCHASES_ERROR_CODE?.NETWORK_ERROR) {
      return {
        success: false,
        isPremium: false,
        customerInfo: null,
        error: 'Error de conexion. Verifica tu internet e intentalo de nuevo.',
      };
    }

    // Generic error — log for debugging
    console.error(
      `[PurchaseService] Purchase failed — code: ${purchaseErr.code}, ` +
      `message: ${purchaseErr.message ?? 'unknown'}`,
    );

    return {
      success: false,
      isPremium: false,
      customerInfo: null,
      error: 'No se pudo completar la compra. Intentalo de nuevo.',
    };
  }
}

// ─── Promotional Offer Purchase ──────────────────────────────────────────────

/**
 * Purchase a package using a promotional offer (iOS) or introductory price.
 *
 * On iOS, RevenueCat supports promotional offers that require server-side
 * signing. This method first tries to fetch a promotional offer for the
 * given package's first available discount, then falls back to a standard
 * purchase (which will automatically use the introductory offer if eligible).
 *
 * On Android, introductory prices are applied automatically — no special
 * handling needed. This method is a convenience wrapper.
 */
export async function purchaseWithPromotionalOffer(
  pkg: RCPackage,
): Promise<PurchaseResult> {
  if (Platform.OS === 'web') {
    return {
      success: false,
      isPremium: false,
      customerInfo: null,
      error: 'Las compras no estan disponibles en la version web.',
    };
  }

  if (!isNativeReady()) {
    return {
      success: false,
      isPremium: false,
      customerInfo: null,
      error: 'El servicio de compras no esta inicializado.',
    };
  }

  try {
    // On iOS, attempt to use a promotional offer if one is available
    if (Platform.OS === 'ios' && pkg.product.discounts?.length) {
      const discount = pkg.product.discounts[0];
      try {
        const promoOffer = await Purchases!.getPromotionalOffer(pkg, discount);
        if (promoOffer) {
          const { customerInfo } = await Purchases!.purchasePackage(pkg, {
            promotionalOffer: promoOffer,
          });
          const isPremium =
            customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
          return { success: isPremium, isPremium, customerInfo };
        }
      } catch (promoErr) {
        // Promotional offer not available — fall through to standard purchase
        console.warn('[PurchaseService] Promo offer failed, falling back:', promoErr);
      }
    }

    // Standard purchase — will use introductory offer if eligible automatically
    return purchasePackage(pkg);
  } catch (err: unknown) {
    const purchaseErr = err as PurchasesError;

    if (purchaseErr.code === PURCHASES_ERROR_CODE?.PURCHASE_CANCELLED_ERROR) {
      return {
        success: false,
        isPremium: false,
        customerInfo: null,
        userCancelled: true,
      };
    }

    return {
      success: false,
      isPremium: false,
      customerInfo: null,
      error: 'No se pudo completar la compra. Intentalo de nuevo.',
    };
  }
}

// ─── Restore ────────────────────────────────────────────────────────────────

/**
 * Restore previous purchases. Required by Apple App Store guidelines (Section 3.1.1).
 *
 * This syncs the device's purchase receipts with RevenueCat and returns
 * whether the user has an active premium entitlement after restoration.
 *
 * Use cases:
 *   - User reinstalled the app
 *   - User switched devices
 *   - User taps "Already purchased?" / "Restore purchases"
 */
export async function restorePurchases(): Promise<PurchaseResult> {
  if (Platform.OS === 'web') {
    return {
      success: false,
      isPremium: false,
      customerInfo: null,
      error: 'La restauracion de compras no esta disponible en la version web.',
    };
  }

  if (!_initialized) {
    return {
      success: false,
      isPremium: false,
      customerInfo: null,
      error: 'El servicio de compras no esta inicializado.',
    };
  }

  try {
    const customerInfo = await Purchases!.restorePurchases();
    const isPremium =
      customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;

    if (__DEV__) {
      console.info(
        `[PurchaseService] Restore complete — premium: ${isPremium}, ` +
        `products: ${customerInfo.allPurchasedProductIdentifiers?.join(', ') ?? 'none'}`,
      );
    }

    return {
      success: true,
      isPremium,
      customerInfo,
    };
  } catch (err) {
    console.error('[PurchaseService] Failed to restore purchases:', err);
    return {
      success: false,
      isPremium: false,
      customerInfo: null,
      error: 'No se pudo restaurar la compra. Intentalo de nuevo.',
    };
  }
}

// ─── Subscription Status ────────────────────────────────────────────────────

/**
 * Check if the current user has an active premium entitlement.
 *
 * Uses RevenueCat's cached customer info — fast and offline-capable.
 * This is the primary gate for premium features throughout the app.
 */
export async function checkSubscriptionStatus(): Promise<boolean> {
  if (!isNativeReady()) return false;

  try {
    const customerInfo = await Purchases!.getCustomerInfo();
    return customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
  } catch (err) {
    console.error('[PurchaseService] Failed to check subscription status:', err);
    return false;
  }
}

/**
 * Get detailed subscription information for the current user.
 *
 * Returns plan type, expiration, renewal status, trial status, and more.
 * Useful for settings screens, account pages, and analytics.
 */
export async function getSubscriptionInfo(): Promise<SubscriptionInfo> {
  const noSub: SubscriptionInfo = {
    isActive: false,
    willRenew: false,
    expirationDate: null,
    productIdentifier: null,
    planType: 'none',
    isTrial: false,
    isGracePeriod: false,
    managementURL: null,
    isSandbox: false,
  };

  if (!isNativeReady()) return noSub;

  try {
    const customerInfo = await Purchases!.getCustomerInfo();
    const entitlement = customerInfo.entitlements.active[ENTITLEMENT_ID];

    if (!entitlement) return noSub;

    return {
      isActive: entitlement.isActive,
      willRenew: entitlement.willRenew,
      expirationDate: entitlement.expirationDate,
      productIdentifier: entitlement.productIdentifier,
      planType: resolvePlanType(entitlement.productIdentifier),
      isTrial: entitlement.periodType === 'TRIAL',
      isGracePeriod: entitlement.periodType === 'GRACE_PERIOD',
      managementURL: customerInfo.managementURL,
      isSandbox: entitlement.isSandbox,
    };
  } catch (err) {
    console.error('[PurchaseService] Failed to get subscription info:', err);
    return noSub;
  }
}

/**
 * Get full customer info from RevenueCat.
 * Contains subscription details, active entitlements, management URLs, etc.
 */
export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (!isNativeReady()) return null;

  try {
    return await Purchases!.getCustomerInfo();
  } catch (err) {
    console.error('[PurchaseService] Failed to get customer info:', err);
    return null;
  }
}

// ─── Subscription Change Listener ───────────────────────────────────────────

/**
 * Listen for real-time customer info updates from RevenueCat.
 *
 * Fires when:
 *   - A purchase completes
 *   - A subscription renews
 *   - A subscription is cancelled
 *   - A subscription enters grace period
 *   - A subscription expires
 *   - Purchases are restored
 *
 * Returns an unsubscribe function — call it in your cleanup/unmount.
 *
 * @example
 * useEffect(() => {
 *   const unsubscribe = onCustomerInfoUpdated((info) => {
 *     const isPremium = info.entitlements.active['premium'] !== undefined;
 *     setPremiumStatus(isPremium);
 *   });
 *   return unsubscribe;
 * }, []);
 */
export function onCustomerInfoUpdated(
  callback: (info: CustomerInfo) => void,
): () => void {
  if (!isNativeReady()) {
    return () => {};
  }

  Purchases!.addCustomerInfoUpdateListener(callback);

  // Return cleanup function
  return () => {
    Purchases!.removeCustomerInfoUpdateListener(callback);
  };
}

// ─── Trial Status ───────────────────────────────────────────────────────────

/**
 * Get the current trial status for the premium entitlement.
 *
 * RevenueCat marks the entitlement's periodType as 'TRIAL' during a
 * free trial. The expirationDate tells us how many days remain.
 */
export async function getTrialStatus(): Promise<TrialStatus> {
  const noTrial: TrialStatus = {
    isTrialing: false,
    trialDaysRemaining: 0,
    trialExpirationDate: null,
  };

  if (!isNativeReady()) return noTrial;

  try {
    const customerInfo = await Purchases!.getCustomerInfo();
    const entitlement = customerInfo.entitlements.active[ENTITLEMENT_ID];

    if (!entitlement) return noTrial;

    const isTrialing = entitlement.periodType === 'TRIAL';
    if (!isTrialing) return noTrial;

    const expirationDate = entitlement.expirationDate ?? null;
    let trialDaysRemaining = 0;

    if (expirationDate) {
      const now = new Date();
      const expires = new Date(expirationDate);
      const diffMs = expires.getTime() - now.getTime();
      trialDaysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    }

    return {
      isTrialing: true,
      trialDaysRemaining,
      trialExpirationDate: expirationDate,
    };
  } catch (err) {
    console.error('[PurchaseService] Failed to get trial status:', err);
    return noTrial;
  }
}

// ─── Eligibility ────────────────────────────────────────────────────────────

/**
 * Check if the user has ever purchased any product (even if now expired).
 * Useful to determine whether to show "introductory offer" or "win-back" paywall.
 */
export async function hasEverPurchased(): Promise<boolean> {
  if (!isNativeReady()) return false;

  try {
    const customerInfo = await Purchases!.getCustomerInfo();
    return (customerInfo.allPurchasedProductIdentifiers?.length ?? 0) > 0;
  } catch {
    return false;
  }
}
