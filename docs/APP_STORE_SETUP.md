# Fitsi AI -- App Store Connect Setup & Subscription Configuration

> Version: 1.0 | Last updated: 2026-03-27
> Complements: monetization-strategy.md, app-store-listing.md, DEPLOYMENT.md

---

## Table of Contents

1. [Apple Developer Account Setup](#1-apple-developer-account-setup)
2. [App Store Connect -- Create App](#2-app-store-connect--create-app)
3. [In-App Purchase Products to Create](#3-in-app-purchase-products-to-create)
4. [RevenueCat Setup](#4-revenuecat-setup)
5. [Subscription Terms (Required by Apple)](#5-subscription-terms-required-by-apple)
6. [Testing](#6-testing)
7. [Pricing for LATAM Markets](#7-pricing-for-latam-markets)
8. [Environment Variables Checklist](#8-environment-variables-checklist)

---

## 1. Apple Developer Account Setup

### Prerequisites

- An Apple ID (personal or company)
- A D-U-N-S Number (required for organization accounts; not needed for individual)
- A credit/debit card for the annual fee

### Enrollment Steps

1. Go to **https://developer.apple.com/programs/**
2. Click "Enroll"
3. Sign in with your Apple ID
4. Choose account type:
   - **Individual** ($99 USD/year) -- for solo developers; your legal name appears as the seller
   - **Organization** ($99 USD/year) -- requires D-U-N-S Number; company name appears as seller
5. Complete identity verification (may require government ID or phone call for organizations)
6. Pay the $99 USD annual fee
7. Wait for approval (typically 24-48 hours; organizations may take up to 2 weeks)

### Post-Enrollment

- Accept the latest **Apple Developer Program License Agreement** at https://developer.apple.com/account/
- Accept the **Paid Applications Agreement** in App Store Connect (required for IAPs)
- Set up **banking and tax information** in App Store Connect > Agreements, Tax, and Banking

> **IMPORTANT:** You cannot create in-app purchases or submit apps until the Paid Applications Agreement is active and banking info is verified.

---

## 2. App Store Connect -- Create App

### Register the Bundle ID

1. Go to https://developer.apple.com/account/resources/identifiers/list
2. Click the **+** button
3. Select **App IDs** > **App**
4. Fill in:
   - **Description:** Fitsi AI
   - **Bundle ID (Explicit):** `com.fitsiai.app`
5. Enable capabilities:
   - [x] In-App Purchase
   - [x] Push Notifications
   - [x] Sign In with Apple
   - [x] HealthKit
6. Click **Continue** > **Register**

> **Note:** The bundle ID `com.fitsiai.app` matches what is already configured in `mobile/app.json` (line 18).

### Create the App in App Store Connect

1. Go to https://appstoreconnect.apple.com/apps
2. Click the **+** button > **New App**
3. Fill in:

| Field | Value |
|-------|-------|
| Platforms | iOS |
| Name | Fitsi IA: Cuenta Calorias con IA |
| Primary Language | Spanish (Mexico) |
| Bundle ID | com.fitsiai.app |
| SKU | fitsiai-ios-001 |
| User Access | Full Access |

4. Click **Create**

### App Information

| Field | Value |
|-------|-------|
| Subtitle | Escanea. Registra. Adelgaza. |
| Category (Primary) | Health & Fitness |
| Category (Secondary) | Food & Drink |
| Content Rights | Does not contain third-party content |
| Age Rating | 4+ (no objectionable content) |

### App Privacy

Required nutrition/health data declarations (see Apple's App Privacy section):

| Data Type | Collection Purpose | Linked to User |
|-----------|-------------------|----------------|
| Health & Fitness | App Functionality | Yes |
| Photos | App Functionality | No |
| Email Address | Account creation | Yes |
| Name | Account creation | Yes |
| User ID | App Functionality | Yes |
| Purchase History | App Functionality | Yes |
| Crash Data | Analytics | No |

---

## 3. In-App Purchase Products to Create

### Subscription Group: "Fitsi AI Premium"

Go to App Store Connect > Your App > Subscriptions > Create Subscription Group.

- **Group Name:** Fitsi AI Premium
- **Group Reference Name:** fitsi_premium_group

> All auto-renewable subscriptions in the same group share the same subscription management page and allow upgrades/downgrades/crossgrades.

### Product 1: Premium Monthly

| Field | Value |
|-------|-------|
| Reference Name | Fitsi Premium Monthly |
| Product ID | `fitsiai_monthly` |
| Type | Auto-Renewable Subscription |
| Subscription Group | Fitsi AI Premium |
| Subscription Duration | 1 Month |
| Price | $4.99 USD (Tier 5) |
| Free Trial | None |
| Introductory Offer | None |
| Subscription Level | 2 (below Pro) |

**Localization (Spanish - Mexico):**
- Display Name: Premium Mensual
- Description: Acceso completo a escaneo con IA ilimitado, recetas inteligentes y seguimiento avanzado de macros.

### Product 2: Premium Annual

| Field | Value |
|-------|-------|
| Reference Name | Fitsi Premium Annual |
| Product ID | `fitsiai_annual` |
| Type | Auto-Renewable Subscription |
| Subscription Group | Fitsi AI Premium |
| Subscription Duration | 1 Year |
| Price | $29.99 USD (Tier 30) |
| Free Trial | 7 days |
| Introductory Offer | 7-day free trial (auto-enroll) |
| Subscription Level | 2 (below Pro) |

**Localization (Spanish - Mexico):**
- Display Name: Premium Anual
- Description: Todo lo Premium por un ano completo. Ahorra mas del 50% vs el plan mensual. Incluye 7 dias de prueba gratis.

### Product 3: Pro Monthly

| Field | Value |
|-------|-------|
| Reference Name | Fitsi Pro Monthly |
| Product ID | `fitsiai_pro_monthly` |
| Type | Auto-Renewable Subscription |
| Subscription Group | Fitsi AI Premium |
| Subscription Duration | 1 Month |
| Price | $9.99 USD (Tier 10) |
| Free Trial | None |
| Introductory Offer | None |
| Subscription Level | 1 (highest tier) |

**Localization (Spanish - Mexico):**
- Display Name: Pro Mensual
- Description: El plan mas completo. Coach IA ilimitado, predicciones de progreso, reportes PDF y todas las funciones premium.

### Product 4: Pro Annual

| Field | Value |
|-------|-------|
| Reference Name | Fitsi Pro Annual |
| Product ID | `fitsiai_pro_annual` |
| Type | Auto-Renewable Subscription |
| Subscription Group | Fitsi AI Premium |
| Subscription Duration | 1 Year |
| Price | $59.99 USD (Tier 60) |
| Free Trial | 7 days |
| Introductory Offer | 7-day free trial (auto-enroll) |
| Subscription Level | 1 (highest tier) |

**Localization (Spanish - Mexico):**
- Display Name: Pro Anual
- Description: Todas las funciones Pro por un ano. Ahorra mas del 50% vs el plan mensual. Incluye 7 dias de prueba gratis.

### Product 5: Lifetime (Post-Launch Experiment)

| Field | Value |
|-------|-------|
| Reference Name | Fitsi Premium Lifetime |
| Product ID | `fitsiai_lifetime` |
| Type | Non-Consumable |
| Price | $149.99 USD (Tier 150) |

> **Note:** The lifetime product is a post-launch pricing experiment (see monetization-strategy.md, experiment P5). Do NOT create this product at launch. Only create it when running the experiment.

**Localization (Spanish - Mexico):**
- Display Name: Premium de por Vida
- Description: Paga una sola vez y disfruta de todas las funciones premium para siempre. Sin pagos recurrentes.

### Product ID Summary

These product IDs are already referenced in the codebase:

| Product ID | File | Line |
|------------|------|------|
| `fitsiai_monthly` | `mobile/src/services/purchase.service.ts` | 12 |
| `fitsiai_annual` | `mobile/src/services/purchase.service.ts` | 12 |
| `fitsiai_monthly` | `backend/app/routers/subscriptions.py` | 1365 |
| `fitsiai_annual` | `backend/app/routers/subscriptions.py` | 1366 |
| `fitsiai_pro_monthly` | `backend/app/routers/subscriptions.py` | 1367 |
| `fitsiai_pro_annual` | `backend/app/routers/subscriptions.py` | 1368 |
| `fitsiai_monthly` | `mobile/src/screens/main/PaywallScreen.tsx` | 100 |
| `fitsiai_annual` | `mobile/src/screens/main/PaywallScreen.tsx` | 101 |
| `fitsiai_pro_monthly` | `mobile/src/screens/main/PaywallScreen.tsx` | 104 |
| `fitsiai_pro_annual` | `mobile/src/screens/main/PaywallScreen.tsx` | 105 |

---

## 4. RevenueCat Setup

### 4.1 Create RevenueCat Project

1. Go to https://app.revenuecat.com
2. Sign up / Log in
3. Click **Create New Project**
   - Project Name: **Fitsi AI**
4. Add **Apple App Store** as a platform:
   - App Name: Fitsi AI
   - Bundle ID: `com.fitsiai.app`

### 4.2 Connect Apple App Store

1. In RevenueCat project > **App Settings** > **Apple App Store**
2. Enter **App Store Connect Shared Secret**:
   - Get it from App Store Connect > Your App > App Information > App-Specific Shared Secret > Generate
   - Paste into RevenueCat
3. Enable **Apple Server Notifications V2**:
   - In App Store Connect > Your App > App Information > App Store Server Notifications
   - Production URL: `https://api.revenuecat.com/v1/subscribers/apple`
   - Sandbox URL: `https://api.revenuecat.com/v1/subscribers/apple`
   - Notification Version: Version 2

### 4.3 Create Entitlement

1. Go to **Project Settings** > **Entitlements**
2. Click **+ New**
   - Identifier: `premium`
   - Description: Full access to all Fitsi AI premium features

> This matches the `ENTITLEMENT_ID = 'premium'` constant in `mobile/src/services/purchase.service.ts` (line 99).

### 4.4 Create Products in RevenueCat

1. Go to **Products** > **+ New**
2. Create each product:

| App Store Product ID | RevenueCat Identifier |
|---------------------|----------------------|
| `fitsiai_monthly` | `fitsiai_monthly` |
| `fitsiai_annual` | `fitsiai_annual` |
| `fitsiai_pro_monthly` | `fitsiai_pro_monthly` |
| `fitsiai_pro_annual` | `fitsiai_pro_annual` |

3. For each product, add the `premium` entitlement

### 4.5 Create Offerings

1. Go to **Offerings** > **+ New Offering**
2. Create the **default** offering:
   - Identifier: `default`
   - Description: Standard paywall offering
3. Add packages to the default offering:

| Package | Type | Product |
|---------|------|---------|
| `$rc_monthly` | Monthly | `fitsiai_monthly` |
| `$rc_annual` | Annual | `fitsiai_annual` |

> The `$rc_monthly` and `$rc_annual` identifiers are RevenueCat's standard package types. They automatically map to `offerings.current.monthly` and `offerings.current.annual` in the SDK, which our `purchase.service.ts` already expects.

4. (Optional) Create a **pro** offering for the Pro tier once that UI is live:

| Package | Type | Product |
|---------|------|---------|
| `$rc_monthly` | Monthly | `fitsiai_pro_monthly` |
| `$rc_annual` | Annual | `fitsiai_pro_annual` |

### 4.6 Get API Keys

1. Go to **Project Settings** > **API Keys**
2. Copy the keys:

| Key Type | Env Variable | Usage |
|----------|-------------|-------|
| iOS Public API Key | `EXPO_PUBLIC_REVENUECAT_IOS_KEY` | Mobile app (purchase.service.ts, line 101) |
| Android Public API Key | `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` | Mobile app (purchase.service.ts, line 102) |
| Secret API Key (v1) | `REVENUECAT_SECRET_KEY` | Backend server-to-server calls |
| Webhook Auth Header | `REVENUECAT_WEBHOOK_SECRET` | Webhook signature verification |

### 4.7 Configure Webhooks

1. Go to **Project Settings** > **Integrations** > **Webhooks**
2. Add a new webhook:

| Field | Value |
|-------|-------|
| Webhook URL | `https://api.fitsiai.com/api/subscriptions/webhooks` |
| Authorization Header | Bearer token (set as `REVENUECAT_WEBHOOK_SECRET` in backend) |
| Events to send | All events |

> The backend already handles RevenueCat webhooks at `POST /api/subscriptions/webhooks` (see `backend/app/routers/subscriptions.py`, line 766). It detects the `"revenuecat"` source in the payload and routes to `_handle_revenuecat_webhook()`.

**Additional direct webhook URLs** (for direct Apple/Google server notifications as backup):

| Store | URL |
|-------|-----|
| Apple Server Notifications | `https://api.fitsiai.com/api/subscriptions/webhooks/apple` |
| Google RTDN | `https://api.fitsiai.com/api/subscriptions/webhooks/google` |

---

## 5. Subscription Terms (Required by Apple)

Apple requires specific legal URLs and disclosure text in the app metadata and within the app itself.

### 5.1 Required URLs

| Document | URL | Notes |
|----------|-----|-------|
| Privacy Policy | `https://fitsiai.com/privacy` | Must be publicly accessible (no login required) |
| Terms of Service | `https://fitsiai.com/terms` | Must be publicly accessible |

> Both URLs must be set in:
> - App Store Connect > App Information > Privacy Policy URL / Terms of Use URL
> - Within the app, visible before the user completes a purchase (PaywallScreen)

### 5.2 Subscription Description Text (for App Store product page)

Use this text in the App Store Connect subscription group localization:

**Spanish (Mexico):**

```
Fitsi AI Premium te da acceso a:
- Escaneo con IA ilimitado
- Coach nutricional con IA
- Recetas inteligentes personalizadas
- Seguimiento avanzado de macros y micronutrientes
- Reportes PDF semanales
- Integracion con Apple Health
- Experiencia sin anuncios

Elige entre plan mensual o anual. El plan anual incluye 7 dias de prueba gratis.
```

**English:**

```
Fitsi AI Premium gives you access to:
- Unlimited AI food scanning
- AI nutrition coaching
- Smart personalized recipes
- Advanced macro & micronutrient tracking
- Weekly PDF reports
- Apple Health integration
- Ad-free experience

Choose monthly or annual. Annual plan includes a 7-day free trial.
```

### 5.3 Auto-Renewal Disclosure Text

**Required by Apple** to be shown near the subscribe button and on the paywall.

**Spanish (already implemented in Step28Paywall.tsx and PaywallScreen.tsx):**

```
La suscripcion se renueva automaticamente a menos que se cancele al menos 24 horas
antes del final del periodo actual. Tu cuenta de iTunes sera cargada al confirmar
la compra. Puedes gestionar y cancelar tu suscripcion en los Ajustes de tu cuenta
de Apple ID despues de la compra. Cualquier porcion no utilizada del periodo de
prueba gratis se perdera al adquirir una suscripcion.
```

**English:**

```
Subscription automatically renews unless canceled at least 24 hours before the end
of the current period. Your iTunes account will be charged upon purchase confirmation.
You can manage and cancel your subscription in your Apple ID Account Settings after
purchase. Any unused portion of the free trial period will be forfeited upon
purchasing a subscription.
```

### 5.4 Restore Purchases

Apple requires a visible "Restore Purchases" button. This is already implemented via `restorePurchases()` in `purchase.service.ts` (line 316).

Verify it is accessible on:
- [x] PaywallScreen.tsx (main paywall)
- [x] Step28Paywall.tsx (onboarding paywall)
- [x] SettingsScreen.tsx (settings > restore purchases)

---

## 6. Testing

### 6.1 StoreKit Configuration (Local Testing)

1. In Xcode, create a StoreKit Configuration file:
   - File > New > File > StoreKit Configuration File
   - Name: `FitsiProducts.storekit`
2. Add products matching the App Store Connect product IDs:
   - `fitsiai_monthly` (Auto-Renewable, $4.99, 1 month)
   - `fitsiai_annual` (Auto-Renewable, $29.99, 1 year, 7-day trial)
   - `fitsiai_pro_monthly` (Auto-Renewable, $9.99, 1 month)
   - `fitsiai_pro_annual` (Auto-Renewable, $59.99, 1 year, 7-day trial)
3. In Xcode scheme > Run > Options > StoreKit Configuration: select `FitsiProducts.storekit`

> This allows testing purchases in the iOS Simulator without a real Apple account.

### 6.2 Sandbox Testing

1. Go to App Store Connect > Users and Access > Sandbox > Testers
2. Create sandbox test accounts:
   - Use email addresses that are NOT real Apple IDs
   - Example: `test-premium@fitsiai.com`, `test-free@fitsiai.com`
3. On a physical device:
   - Settings > App Store > Sandbox Account > sign in with sandbox credentials
4. Sandbox subscription durations are accelerated:

| Real Duration | Sandbox Duration |
|---------------|-----------------|
| 1 week | 3 minutes |
| 1 month | 5 minutes |
| 2 months | 10 minutes |
| 3 months | 15 minutes |
| 6 months | 30 minutes |
| 1 year | 1 hour |

> Subscriptions auto-renew up to 6 times in sandbox, then cancel automatically.

### 6.3 RevenueCat Sandbox Mode

1. In RevenueCat Dashboard > Project Settings, ensure **Sandbox** mode is visible
2. RevenueCat automatically detects sandbox vs production receipts
3. Use the RevenueCat **Debug UI** in development:
   ```typescript
   // Only in __DEV__ mode (already configured in purchase.service.ts)
   if (__DEV__ && LOG_LEVEL) {
     Purchases.setLogLevel(LOG_LEVEL.DEBUG);
   }
   ```
4. Monitor sandbox transactions in RevenueCat > Customer > search by app user ID

### 6.4 TestFlight Beta Testing

1. Build and upload to App Store Connect via EAS Build:
   ```bash
   cd mobile
   npx eas-cli build --platform ios --profile production
   npx eas-cli submit --platform ios
   ```
2. In App Store Connect > TestFlight:
   - Add internal testers (up to 100, instant access)
   - Add external testers (up to 10,000, requires beta review)
3. TestFlight uses the **sandbox** environment for purchases
4. Test the full flow:
   - [ ] Onboarding paywall (Step28) -- purchase triggers correctly
   - [ ] Main paywall (PaywallScreen) -- all tiers display correctly
   - [ ] Free trial starts and entitlement activates
   - [ ] Subscription renewal (wait for sandbox cycle)
   - [ ] Subscription cancellation
   - [ ] Restore purchases
   - [ ] Downgrade from Pro to Premium
   - [ ] Upgrade from Premium to Pro
   - [ ] Expired subscription correctly removes premium access
   - [ ] RevenueCat webhook fires and backend processes it

### 6.5 Test Checklist Before Submission

- [ ] All 4 product IDs resolve and display correct prices
- [ ] Free trial badge shows on annual plans only
- [ ] "Restore Purchases" button is visible and functional
- [ ] Privacy Policy and Terms of Service links work
- [ ] Auto-renewal disclosure text is visible on paywall
- [ ] Purchase completes and premium features unlock immediately
- [ ] Backend webhook receives and processes subscription events
- [ ] Cancellation revokes premium access after period ends
- [ ] App works correctly in free tier (feature gating)

---

## 7. Pricing for LATAM Markets

Apple automatically converts USD pricing to local currencies using their pricing tiers. Below are the approximate equivalents based on Apple's price tier matrix (prices may vary as Apple periodically adjusts for exchange rates).

### Tier Reference

| Product | USD Price | Apple Tier |
|---------|-----------|-----------|
| Premium Monthly | $4.99 | Tier 5 |
| Premium Annual | $29.99 | Tier 30 |
| Pro Monthly | $9.99 | Tier 10 |
| Pro Annual | $59.99 | Tier 60 |
| Lifetime (future) | $149.99 | Tier 150 |

### Chile (CLP)

| Product | USD | CLP (approx) | Apple Tier CLP |
|---------|-----|---------------|----------------|
| Premium Monthly | $4.99 | ~$4,500 CLP | $4,500 CLP |
| Premium Annual | $29.99 | ~$27,000 CLP | $26,900 CLP |
| Pro Monthly | $9.99 | ~$9,000 CLP | $8,900 CLP |
| Pro Annual | $59.99 | ~$54,000 CLP | $53,900 CLP |
| Lifetime | $149.99 | ~$135,000 CLP | $134,900 CLP |

### Mexico (MXN)

| Product | USD | MXN (approx) | Apple Tier MXN |
|---------|-----|---------------|----------------|
| Premium Monthly | $4.99 | ~$89 MXN | $89 MXN |
| Premium Annual | $29.99 | ~$549 MXN | $549 MXN |
| Pro Monthly | $9.99 | ~$179 MXN | $179 MXN |
| Pro Annual | $59.99 | ~$1,099 MXN | $1,099 MXN |
| Lifetime | $149.99 | ~$2,749 MXN | $2,749 MXN |

### Colombia (COP)

| Product | USD | COP (approx) | Apple Tier COP |
|---------|-----|---------------|----------------|
| Premium Monthly | $4.99 | ~$19,900 COP | $19,900 COP |
| Premium Annual | $29.99 | ~$119,900 COP | $119,900 COP |
| Pro Monthly | $9.99 | ~$39,900 COP | $39,900 COP |
| Pro Annual | $59.99 | ~$239,900 COP | $239,900 COP |
| Lifetime | $149.99 | ~$599,900 COP | $599,900 COP |

### Argentina (ARS)

| Product | USD | ARS (approx) | Apple Tier ARS |
|---------|-----|---------------|----------------|
| Premium Monthly | $4.99 | ~$4,999 ARS | $4,999 ARS |
| Premium Annual | $29.99 | ~$29,999 ARS | $29,999 ARS |
| Pro Monthly | $9.99 | ~$9,999 ARS | $9,999 ARS |
| Pro Annual | $59.99 | ~$59,999 ARS | $59,999 ARS |
| Lifetime | $149.99 | ~$149,999 ARS | $149,999 ARS |

> **IMPORTANT:** Apple manages LATAM pricing tiers automatically. You select the USD tier and Apple sets local prices. However, you CAN override specific country prices in App Store Connect > Pricing and Availability > Manage Prices. Review and adjust LATAM prices after Apple's automatic conversion to ensure they are competitive and psychologically rounded.

### LATAM Pricing Strategy Notes

1. **Mexico and Chile** are the primary LATAM markets for Fitsi. Ensure prices feel native (e.g., avoid $89.37 MXN -- round to $89 MXN).
2. **Argentina** has volatile currency. Apple occasionally adjusts ARS prices. Monitor quarterly.
3. **Colombia** has high mobile payment adoption via Nequi/Daviplata, but App Store payment is still credit card dominant. Consider running promotional pricing in COP.
4. **Brazil (BRL)** -- not listed above but worth adding as a future market:
   - Premium Monthly: ~R$24.90 BRL
   - Pro Annual: ~R$299.90 BRL

---

## 8. Environment Variables Checklist

These environment variables must be set in the deployment environment for subscriptions to work end-to-end.

### Mobile App (.env / EAS Secrets)

| Variable | Description | Where to Get |
|----------|-------------|-------------|
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY` | RevenueCat iOS public API key | RevenueCat > API Keys |
| `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` | RevenueCat Android public API key | RevenueCat > API Keys |

### Backend (.env)

| Variable | Description | Where to Get |
|----------|-------------|-------------|
| `REVENUECAT_SECRET_KEY` | RevenueCat secret API key (server-side) | RevenueCat > API Keys |
| `REVENUECAT_WEBHOOK_SECRET` | Webhook authorization bearer token | You generate this, set in both RevenueCat and backend |
| `APPLE_SHARED_SECRET` | App-specific shared secret for receipt validation | App Store Connect > App > App-Specific Shared Secret |
| `APPLE_CLIENT_ID` | Bundle ID for Apple Sign In | `com.fitsiai.app` |
| `GOOGLE_PLAY_PACKAGE_NAME` | Android package name | `com.fitsiai.app` |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Google Play service account credentials | Google Cloud Console |

### App Store Connect Configuration

| Setting | Value |
|---------|-------|
| Bundle ID | `com.fitsiai.app` |
| Apple Server Notification URL (Production) | `https://api.fitsiai.com/api/subscriptions/webhooks/apple` |
| Apple Server Notification URL (Sandbox) | `https://api.fitsiai.com/api/subscriptions/webhooks/apple` |
| Notification Version | Version 2 |

---

## Quick Reference: Product ID Mapping

```
App Store Connect          RevenueCat           Backend Plan       Paywall Tier
--------------------       ------------------   ---------------    ------------
fitsiai_monthly            fitsiai_monthly      "monthly"          Premium
fitsiai_annual             fitsiai_annual       "annual"           Premium
fitsiai_pro_monthly        fitsiai_pro_monthly  "monthly"          Pro
fitsiai_pro_annual         fitsiai_pro_annual   "annual"           Pro
fitsiai_lifetime (future)  fitsiai_lifetime     "lifetime"         Lifetime
```

---

*Last updated: 2026-03-27*
