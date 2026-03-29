# Fitsi IA — Analytics Events Reference

> All events tracked via `analyticsService.track()` / `useAnalytics().track()`.
> Current backend: console.log (dev) + in-memory 100-event ring buffer.
> Ready for Mixpanel / Amplitude / PostHog integration.

---

## Automatic Events

| Event | Description | Properties | Source |
|-------|-------------|------------|--------|
| `screen_viewed` | Fired on mount for every screen using `useAnalytics(screenName)` | `screen_name: string` | All screens |

---

## HomeScreen

| Event | Description | Properties |
|-------|-------------|------------|
| `screen_viewed` | Home screen loaded | `screen_name: "Home"` |
| `scan_button_pressed` | User taps scan button | `source: "header" \| "empty_state"` |
| `profile_completion_pressed` | User taps "Completar perfil" button | `percentage: number, next_step: string` |

---

## ScanScreen

| Event | Description | Properties |
|-------|-------------|------------|
| `screen_viewed` | Scan screen loaded | `screen_name: "Scan"` |
| `food_scanned` | AI scan completed successfully | `meal_type: string, confidence: number, food_name: string` |
| `food_logged_from_scan` | User confirms and logs scanned food | `meal_type: string, food_name: string, calories: number` |

---

## LogScreen

| Event | Description | Properties |
|-------|-------------|------------|
| `screen_viewed` | Log screen loaded | `screen_name: "Log"` |
| `meal_logged_manual` | User starts manual food entry | `meal_type: string` |
| `water_added` | User logs water intake | `amount_ml: number` |

---

## ProfileScreen

| Event | Description | Properties |
|-------|-------------|------------|
| `screen_viewed` | Profile screen loaded | `screen_name: "Profile"` |
| `settings_opened` | User navigates to Settings | — |

---

## Step28Paywall (Onboarding Paywall)

| Event | Description | Properties |
|-------|-------------|------------|
| `screen_viewed` | Paywall screen loaded | `screen_name: "Paywall"` |
| `plan_selected` | User selects a subscription plan | `plan: "monthly" \| "annual"` |
| `purchase_started` | User initiates purchase flow | `plan: "monthly" \| "annual"` |
| `purchase_completed` | Purchase succeeded, user is now premium | `plan: "monthly" \| "annual"` |

---

## RecipesScreen

| Event | Description | Properties |
|-------|-------------|------------|
| `screen_viewed` | Recipes screen loaded | `screen_name: "Recipes"` |
| `recipe_viewed` | User taps on a recipe card | `recipe_name: string, meal_type: string` |

---

## CoachScreen

| Event | Description | Properties |
|-------|-------------|------------|
| `screen_viewed` | Coach screen loaded | `screen_name: "Coach"` |
| `coach_message_sent` | User sends a message to the AI coach | `message_length: number` |

---

## AchievementsScreen

| Event | Description | Properties |
|-------|-------------|------------|
| `screen_viewed` | Achievements screen loaded | `screen_name: "Achievements"` |

---

## ProgressScreen

| Event | Description | Properties |
|-------|-------------|------------|
| `screen_viewed` | Progress screen loaded | `screen_name: "Progress"` |

---

## GroupsScreen

| Event | Description | Properties |
|-------|-------------|------------|
| `screen_viewed` | Groups screen loaded | `screen_name: "Groups"` |
| `group_joined` | User joins a community group | `group_id: string, group_name: string` |

---

## SettingsScreen

| Event | Description | Properties |
|-------|-------------|------------|
| `screen_viewed` | Settings screen loaded | `screen_name: "Settings"` |
| `setting_changed` | User toggles a setting | `setting: string, value: boolean` |
| `theme_changed` | User changes appearance mode | `theme: "system" \| "light" \| "dark"` |
| `language_changed` | User navigates to language selection | — |

---

## ReferralScreen

| Event | Description | Properties |
|-------|-------------|------------|
| `screen_viewed` | Referral screen loaded | `screen_name: "Referral"` |
| `referral_shared` | User shares referral link | `code: string` |
| `code_copied` | User copies referral code | `code: string` |

---

## WeightTrackingScreen

| Event | Description | Properties |
|-------|-------------|------------|
| `screen_viewed` | Weight tracking screen loaded | `screen_name: "WeightTracking"` |
| `weight_logged` | User logs a weight entry | `weight_kg: number` |
| `photo_uploaded` | User uploads a progress photo | `source: "library"` |

---

## BarcodeScreen

| Event | Description | Properties |
|-------|-------------|------------|
| `screen_viewed` | Barcode screen loaded | `screen_name: "Barcode"` |
| `barcode_scanned` | Barcode successfully looked up | `barcode: string, product_name: string` |
| `barcode_food_logged` | User confirms and logs barcode food | `product_name: string, meal_type: string, servings: number, calories: number` |

---

## Identity Events

| Method | Description | When |
|--------|-------------|------|
| `identify(userId, traits)` | Associates all future events with a user | After login / signup |
| `reset()` | Clears user identity and buffer | On logout |

---

## Architecture

```
analyticsService (singleton)
  |
  |-- track(event, properties)  -->  console.log (dev) + buffer
  |-- identify(userId, traits)  -->  sets userId for all events
  |-- screen(screenName)        -->  shortcut for track('screen_viewed', ...)
  |-- reset()                   -->  clears identity + buffer
  |-- getBuffer(limit?)         -->  returns buffered events

useAnalytics(screenName?)       -->  auto screen_viewed on mount
  |-- track()                   -->  calls analyticsService.track()
  |-- screen()                  -->  calls analyticsService.screen()
```

## Future Integration

To connect a real analytics provider, modify `_send()` in `analytics.service.ts`:

```typescript
private _send(entry: AnalyticsEvent): void {
  // Mixpanel
  mixpanel.track(entry.event, entry.properties);

  // Amplitude
  amplitude.logEvent(entry.event, entry.properties);

  // PostHog
  posthog.capture(entry.event, entry.properties);
}
```
