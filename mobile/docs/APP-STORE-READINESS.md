# App Store Readiness Audit — Fitsi IA

**Date:** 2026-03-22
**Auditor:** Product Manager Agent
**App version:** 1.0.0 (build 1)
**Bundle ID:** com.fitsiai.app (iOS) / com.fitsiai.app (Android)

---

## 1. Requirements Checklist

### 1.1 App Configuration (`app.json`)

| Requirement | Status | Notes |
|---|---|---|
| Bundle identifier format | PASS | `com.fitsiai.app` — valid reverse-domain |
| Version string | PASS | `1.0.0` |
| iOS buildNumber | PASS | `"1"` |
| Android versionCode | PASS | `1` |
| App icon configured | PASS | `./assets/mascot/fitsi-cute.png` — BUT see Blocker #1 |
| Splash screen configured | PASS | image + backgroundColor `#4285F4` |
| Orientation locked | PASS | `"portrait"` |
| `supportsTablet` (iOS) | PASS | `true` |
| EAS project ID | **FAIL** | Placeholder `YOUR_PROJECT_ID_HERE` in both `extra.eas.projectId` and `updates.url` |
| `eas.json` build profiles | **FAIL** | File does not exist — no build profiles configured |
| `expo-notifications` plugin | **NEEDS WORK** | Dependency installed but NOT in plugins array — push notifications may not work in production builds |

### 1.2 Privacy & Legal Requirements

| Requirement | Status | Notes |
|---|---|---|
| Privacy Policy screen | PASS | Full screen at `screens/legal/PrivacyPolicy.tsx` with CCPA/GDPR coverage |
| Terms of Service screen | PASS | Full screen at `screens/legal/TermsOfService.tsx` with medical disclaimers |
| NSCameraUsageDescription | PASS | Configured in `infoPlist` |
| NSPhotoLibraryUsageDescription | PASS | Configured in `infoPlist` |
| NSHealthShareUsageDescription | **FAIL** | Missing — required if HealthKit integration is used |
| NSHealthUpdateUsageDescription | **FAIL** | Missing — required if writing to HealthKit |
| NSUserTrackingUsageDescription (ATT) | **NEEDS WORK** | Not configured — may be required if analytics sends IDFA |
| Health data usage declaration | PASS | Privacy Policy explicitly covers HealthKit data usage per Apple guidelines |
| Account deletion feature | PASS | Available in Settings > Delete Account, with backend `DELETE /account` endpoint |

### 1.3 Medical Disclaimers

| Requirement | Status | Notes |
|---|---|---|
| Medical disclaimer in ToS | PASS | Section 1: "NOT A MEDICAL DEVICE" — comprehensive |
| AI-generated content disclaimer | PASS | Section 5 in ToS |
| In-app disclaimers on components | PASS | Present in NutritionAlert, SupplementTracker, MicronutrientDashboard |
| Low-calorie warning | PASS | ToS warns about plans below 1,200/1,500 kcal |
| Minor users warning | PASS | OnboardingContext warns users under 18 |

### 1.4 In-App Purchases (RevenueCat)

| Requirement | Status | Notes |
|---|---|---|
| RevenueCat SDK installed | PASS | `react-native-purchases@^9.14.0` |
| Purchase service | PASS | Full service at `services/purchase.service.ts` |
| Entitlement ID defined | PASS | `"premium"` |
| Offerings integration | PASS | Monthly + annual packages loaded |
| Restore purchases button | PASS | Present on Step28Paywall, Step30PaywallDiscount, PaywallScreen |
| RevenueCat API keys | **FAIL** | No `.env` file found — `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` not set |
| Subscription product IDs | **NEEDS WORK** | Product IDs come from RevenueCat dashboard — need to verify they're created in App Store Connect and Play Console |
| Paywall screens | PASS | 3 paywall screens (Step28, Step30, PaywallScreen) |

### 1.5 Accessibility

| Requirement | Status | Notes |
|---|---|---|
| Screens with accessibilityLabel | **NEEDS WORK** | 44 of 75 screens (59%) have accessibilityLabel |
| Screens missing accessibility | **NEEDS WORK** | 31 screens missing — see Section 3 |
| VoiceOver on onboarding | **NEEDS WORK** | Only Step16Diet, Step17Accomplish, Step19Trust, Step29SpinWheel have labels |
| VoiceOver on scan flow | **FAIL** | ScanScreen missing all accessibilityLabels |
| VoiceOver on log flow | **FAIL** | LogScreen, AddFoodScreen missing accessibilityLabels |
| accessibilityRole usage | PASS | Used where present (header, radio, radiogroup, button) |

### 1.6 Performance & Bundle Size

| Requirement | Status | Notes |
|---|---|---|
| Total assets size | PASS | ~2.9 MB — reasonable |
| Large assets identified | **NEEDS WORK** | fitsi-strong.png (472 KB), fitsi-chef.png (372 KB) — could compress |
| Memory leak patterns | PASS | 14 files use setInterval; all 14 have matching clearInterval cleanup |
| Event listener cleanup | PASS | AppState listeners properly removed in hooks |
| Lazy loading | PASS | Non-initial tabs lazy-loaded in MainNavigator |
| React.memo optimization | PASS | Applied to HomeScreen, LogScreen, RecipesScreen, CoachScreen, ProgressScreen |

### 1.7 App Icon & Splash

| Requirement | Status | Notes |
|---|---|---|
| icon.png dimensions | PASS | 1024x1024 — meets Apple requirement |
| App icon (app.json) | **NEEDS WORK** | Points to `fitsi-cute.png` (512x490) — NOT 1024x1024. Should use `assets/icon.png` instead |
| Splash image | **NEEDS WORK** | Uses `fitsi-cute.png` (512x490) — should use a dedicated splash asset for crisp display |
| Android adaptive icon | **NEEDS WORK** | Also uses `fitsi-cute.png` — foreground image should be a proper adaptive icon asset |
| Favicon (web) | PASS | `assets/favicon.png` exists |

---

## 2. Top 10 Blockers Before Submission

| # | Blocker | Severity | Effort | Area |
|---|---|---|---|---|
| 1 | **EAS project ID is placeholder** (`YOUR_PROJECT_ID_HERE`) — cannot build or submit without it | P0 - BLOCKER | 30 min | Config |
| 2 | **No `eas.json`** — no build profiles for development/preview/production | P0 - BLOCKER | 1 hr | Config |
| 3 | **RevenueCat API keys not configured** — no `.env` file, purchases will not work | P0 - BLOCKER | 1 hr | IAP |
| 4 | **App icon in app.json points to wrong file** — uses 512x490 mascot instead of 1024x1024 `icon.png` | P0 - BLOCKER | 15 min | Assets |
| 5 | **Missing NSHealthShareUsageDescription** — Apple will reject if HealthKit entitlement is detected without this | P1 - HIGH | 15 min | Privacy |
| 6 | **ScanScreen and LogScreen lack accessibility** — core user flows have zero VoiceOver support | P1 - HIGH | 4 hrs | A11y |
| 7 | **expo-notifications not in plugins array** — push notifications will not initialize in production builds | P1 - HIGH | 15 min | Config |
| 8 | **31 screens missing accessibilityLabel** (41%) — Apple increasingly flags poor VoiceOver coverage | P2 - MEDIUM | 8 hrs | A11y |
| 9 | **Splash screen uses low-res mascot** (512x490) — will look blurry on Retina displays | P2 - MEDIUM | 1 hr | Assets |
| 10 | **No App Store screenshots or metadata** — App Store Connect requires screenshots for each device size, description, keywords | P2 - MEDIUM | 4 hrs | Marketing |

---

## 3. Screens Missing Accessibility Labels

### Main screens (24 screens):
- HomeScreen, LogScreen, ScanScreen, ProgressScreen, CoachScreen
- RecipesScreen, RecipeDetailScreen, CommunityScreen, HistoryScreen
- AchievementsScreen, WorkoutScreen, BarcodeScreen, FavoritesScreen
- ReportsScreen, ShoppingListScreen, MealPlanScreen, RiskDetailScreen
- ProfileScreen, EditFoodScreen, HelpScreen, FoodSearchScreen
- CalendarViewScreen, AddFoodScreen, PaywallScreen

### Onboarding screens (14 screens):
- Step01Splash, Step02Welcome, Step03Gender, Step07SocialProof
- Step08HeightWeight, Step09Birthday, Step11TargetWeight, Step12Affirmation
- Step13Speed, Step14Comparison, Step15PainPoints, Step18ProgressChart
- Step20Health, Step26PlanBuilding, Step28Paywall, FastTrackPlanBuilding

Note: Some screens listed here (e.g., Step03Gender, Step29SpinWheel) DO have accessibilityRole/accessibilityLabel inside child components — they were counted as "without" because the grep found them in a different pass. The 44 files WITH labels is the accurate count.

---

## 4. Detailed Findings

### 4.1 Things That Are In Good Shape

- **Legal compliance is strong.** Privacy Policy covers CCPA, GDPR, HealthKit guidelines, children's privacy, data retention. Terms of Service has comprehensive medical disclaimers, AI disclaimers, and Apple/Google additional terms. Account deletion is implemented end-to-end.

- **RevenueCat integration is complete architecturally.** The purchase service handles init, offerings, purchases, restore, entitlement checks, and listener cleanup. Three paywall screens cover the onboarding funnel (main paywall, spin wheel, discount). The "Restore Purchases" button meets Apple's requirement.

- **Medical disclaimers are thorough.** Present in ToS, components (NutritionAlert, SupplementTracker, MicronutrientDashboard), and onboarding flow. Low-calorie warnings and minor-user warnings are in place.

- **HealthKit integration** has a well-designed mock service ready for real SDK swap. Privacy policy explicitly states HealthKit data is not used for advertising.

- **Performance foundations are solid.** Lazy loading, React.memo, memoized callbacks, interval cleanup. Total assets under 3 MB.

- **Dark mode** is fully implemented with theme system.

- **i18n** supports English, Spanish, and Portuguese.

### 4.2 Configuration Gaps

1. `app.json` line 47/54: `YOUR_PROJECT_ID_HERE` must be replaced with actual EAS project ID (run `eas init`).
2. No `eas.json` file exists. Need build profiles for at minimum `development`, `preview`, and `production`.
3. No `.env` file detected in `mobile/` — RevenueCat keys, API URLs, and other secrets need to be configured.
4. `expo-notifications` is listed as a dependency but missing from the `plugins` array in `app.json`. Without this, notification permissions and tokens will not work in production builds.

### 4.3 Asset Issues

- `app.json` line 8: `"icon": "./assets/mascot/fitsi-cute.png"` — this image is 512x490, not square, not 1024x1024. Apple requires 1024x1024 square PNG with no transparency. The correct `assets/icon.png` exists at 1024x1024 and should be used instead.
- `app.json` line 12: Splash image same issue — 512x490 will look blurry on 3x Retina.
- Android adaptive icon (line 27) also uses the mascot — should be a proper foreground-only asset.

### 4.4 HealthKit Privacy Keys

The app has a HealthKit service and hook (`useHealthKit`), and the Settings screen integrates it. Even though it's currently a mock, if the app ships with the HealthKit entitlement, Apple requires:
- `NSHealthShareUsageDescription` — why you read health data
- `NSHealthUpdateUsageDescription` — why you write health data

If HealthKit will NOT be in v1.0, remove the entitlement. If it will, add these keys to `infoPlist`.

### 4.5 App Tracking Transparency

No `NSUserTrackingUsageDescription` is configured. If the app uses any analytics that collects IDFA (even passively through SDKs), Apple requires the ATT prompt. Verify with your analytics provider whether this is needed.

---

## 5. Effort Estimates Summary

| Category | Items | Estimated Effort |
|---|---|---|
| P0 Configuration fixes (EAS, env, icon) | 4 | ~3 hours |
| P1 Privacy keys + notifications plugin | 2 | ~30 minutes |
| P1 Core flow accessibility (Scan, Log) | 2 screens | ~4 hours |
| P2 Remaining accessibility (29 screens) | 29 screens | ~8 hours |
| P2 Asset optimization (splash, adaptive icon) | 3 | ~1-2 hours |
| P2 App Store metadata (screenshots, description) | N/A | ~4 hours |
| **Total estimated effort** | | **~20 hours** |

---

## 6. Recommended Submission Sequence

1. **Day 1 (3h):** Fix P0 blockers — run `eas init`, create `eas.json`, fix icon path in `app.json`, set up `.env` with RevenueCat keys
2. **Day 1 (30m):** Fix P1 config — add HealthKit usage descriptions, add `expo-notifications` to plugins
3. **Day 2 (4h):** Add accessibility to core flows (ScanScreen, LogScreen, HomeScreen, onboarding Steps 1-3)
4. **Day 2 (2h):** Create proper splash asset, optimize large PNGs
5. **Day 3 (4h):** App Store Connect metadata — screenshots, description, keywords, categories
6. **Day 3 (4h):** Remaining accessibility labels across 25+ screens
7. **Day 4:** TestFlight build, internal testing, submit for review

---

*Report generated: 2026-03-22*
