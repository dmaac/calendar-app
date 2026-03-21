# Fitsi — Analytics Event Schema

> Version: 1.0 | Last updated: 2026-03-19
> Naming convention: `snake_case`. All events include a shared context block.

---

## Shared Context (sent with every event)

```json
{
  "user_id": "uuid",
  "session_id": "uuid",
  "app_version": "1.0.0",
  "platform": "ios | android",
  "is_premium": false,
  "timestamp": "ISO 8601"
}
```

---

## Stage 1 — Onboarding

These events cover the 30-step onboarding flow from first launch to first paid interaction.

### `onboarding_started`
- **Trigger:** User lands on Step01Splash for the first time
- **Screen:** Step01Splash
- **Properties:**
  - `source: "organic" | "referral" | "paid_ad"` — acquisition channel if available
  - `referral_code: string | null`

### `onboarding_step_viewed`
- **Trigger:** User navigates to any onboarding step
- **Screen:** Any Step0X screen
- **Properties:**
  - `step_number: number` — 1–30
  - `step_name: string` — e.g. `"gender"`, `"goal"`, `"paywall_main"`
  - `time_on_previous_step_ms: number`

### `onboarding_step_completed`
- **Trigger:** User taps the CTA to advance past a step
- **Screen:** Any Step0X screen
- **Properties:**
  - `step_number: number`
  - `step_name: string`
  - `answer: string | string[] | null` — selected value(s), null for non-choice steps

### `onboarding_step_back`
- **Trigger:** User taps the back button on any onboarding step
- **Screen:** Any Step0X screen
- **Properties:**
  - `step_number: number`
  - `step_name: string`

### `onboarding_goal_selected`
- **Trigger:** User picks their primary goal
- **Screen:** Step10Goal
- **Properties:**
  - `goal: "lose" | "maintain" | "gain"`

### `onboarding_plan_generated`
- **Trigger:** Plan calculation completes (Step26PlanBuilding → Step27PlanReady)
- **Screen:** Step26PlanBuilding
- **Properties:**
  - `daily_calories: number`
  - `daily_protein_g: number`
  - `daily_carbs_g: number`
  - `daily_fats_g: number`
  - `generation_time_ms: number`

### `onboarding_account_created`
- **Trigger:** User successfully creates an account
- **Screen:** Step25Account
- **Properties:**
  - `auth_method: "email" | "apple" | "google"`
  - `has_referral_code: boolean`
  - `steps_completed_before_signup: number`

### `onboarding_notification_permission`
- **Trigger:** User responds to notification permission prompt
- **Screen:** Step23Notifications
- **Properties:**
  - `granted: boolean`

### `onboarding_health_permission`
- **Trigger:** User responds to Health connect permission prompt
- **Screen:** Step20Health
- **Properties:**
  - `granted: boolean`
  - `platform: "ios" | "android"`

### `onboarding_completed`
- **Trigger:** User finishes all 30 steps and enters the main app
- **Screen:** Step30PaywallDiscount (last exit) or Step28Paywall
- **Properties:**
  - `total_duration_ms: number`
  - `steps_skipped: number`
  - `converted_to_premium: boolean`
  - `plan_selected: "monthly" | "annual" | "none"`

### `onboarding_abandoned`
- **Trigger:** App goes to background / closes during onboarding (session end detection)
- **Screen:** Current onboarding step
- **Properties:**
  - `last_step_number: number`
  - `last_step_name: string`
  - `time_in_onboarding_ms: number`

---

## Stage 2 — Activation

These events measure whether a new user reaches the "aha moment" — their first scan or first full day logged.

### `home_screen_viewed`
- **Trigger:** HomeScreen mounts (useFocusEffect fires)
- **Screen:** HomeScreen
- **Properties:**
  - `has_logs_today: boolean`
  - `streak_days: number`
  - `calories_consumed: number`
  - `calories_target: number`

### `scan_screen_opened`
- **Trigger:** User navigates to ScanScreen
- **Screen:** ScanScreen
- **Properties:**
  - `source: "home_header_button" | "home_empty_cta" | "log_screen_modal" | "tab_bar"`
  - `scans_used_today: number`
  - `scan_limit: number` — 3 for free users
  - `is_premium: boolean`

### `scan_meal_type_selected`
- **Trigger:** User taps a meal type chip on ScanScreen
- **Screen:** ScanScreen
- **Properties:**
  - `meal_type: "breakfast" | "lunch" | "dinner" | "snack"`
  - `previous_meal_type: string`

### `scan_initiated`
- **Trigger:** User picks an image (camera or gallery) and upload starts
- **Screen:** ScanScreen
- **Properties:**
  - `source: "camera" | "gallery"`
  - `meal_type: "breakfast" | "lunch" | "dinner" | "snack"`
  - `scans_used_today: number`

### `scan_completed`
- **Trigger:** AI returns a result successfully
- **Screen:** ScanScreen (result state)
- **Properties:**
  - `food_name: string`
  - `calories: number`
  - `protein_g: number`
  - `carbs_g: number`
  - `fats_g: number`
  - `ai_confidence: number` — 0.0 to 1.0
  - `cache_hit: boolean`
  - `scan_duration_ms: number`
  - `meal_type: "breakfast" | "lunch" | "dinner" | "snack"`

### `scan_failed`
- **Trigger:** AI returns an error or network timeout
- **Screen:** ScanScreen
- **Properties:**
  - `error_type: "network" | "ai_error" | "no_food_detected" | "timeout"`
  - `error_message: string`
  - `scan_duration_ms: number`
  - `meal_type: string`

### `scan_confirmed`
- **Trigger:** User taps "Guardar en mi registro" button
- **Screen:** ScanScreen (result state)
- **Properties:**
  - `food_name: string`
  - `calories: number`
  - `ai_confidence: number`
  - `cache_hit: boolean`
  - `meal_type: string`
  - `time_to_confirm_ms: number` — time from result shown to confirm tapped

### `scan_retried`
- **Trigger:** User taps "Escanear otra foto" on result screen
- **Screen:** ScanScreen (result state)
- **Properties:**
  - `food_name_discarded: string`
  - `meal_type: string`

### `scan_limit_reached`
- **Trigger:** Free user hits the 3-scan daily limit gate
- **Screen:** ScanScreen (paywall gate state)
- **Properties:**
  - `scans_today: number` — will always be 3
  - `time_of_day: string` — HH:MM in user local time

### `manual_food_add_opened`
- **Trigger:** User opens AddFoodScreen
- **Screen:** AddFoodScreen
- **Properties:**
  - `source: "log_screen_modal" | "scan_error_fallback" | "scan_limit_fallback"`
  - `meal_type: "breakfast" | "lunch" | "dinner" | "snack"`

### `manual_food_suggestion_selected`
- **Trigger:** User picks a food from the autocomplete dropdown
- **Screen:** AddFoodScreen
- **Properties:**
  - `food_name: string`
  - `calories: number`
  - `rank_in_list: number` — 1–4

### `manual_food_saved`
- **Trigger:** User taps "Guardar" on AddFoodScreen
- **Screen:** AddFoodScreen
- **Properties:**
  - `food_name: string`
  - `calories: number`
  - `protein_g: number`
  - `carbs_g: number`
  - `fats_g: number`
  - `has_fiber: boolean`
  - `has_serving_size: boolean`
  - `used_suggestion: boolean`
  - `meal_type: string`

### `first_food_logged`
- **Trigger:** First ever food_log entry for this user (fires once per account)
- **Screen:** ScanScreen or AddFoodScreen
- **Properties:**
  - `method: "scan" | "manual"`
  - `hours_since_install: number`
  - `meal_type: string`

---

## Stage 3 — Engagement

These events track ongoing daily usage, retention signals, and feature depth.

### `log_screen_viewed`
- **Trigger:** LogScreen mounts
- **Screen:** LogScreen
- **Properties:**
  - `meals_logged_today: number`
  - `calories_consumed: number`
  - `calories_target: number`
  - `water_ml: number`

### `log_add_modal_opened`
- **Trigger:** User taps the + button on a meal card in LogScreen
- **Screen:** LogScreen
- **Properties:**
  - `meal_type: "breakfast" | "lunch" | "dinner" | "snack"`
  - `meal_already_has_items: boolean`

### `log_food_deleted`
- **Trigger:** User confirms deletion of a food log entry
- **Screen:** LogScreen
- **Properties:**
  - `food_name: string`
  - `calories: number`
  - `meal_type: string`
  - `was_ai_scanned: boolean` — `image_url` not null

### `food_edited`
- **Trigger:** User saves edits on EditFoodScreen
- **Screen:** EditFoodScreen
- **Properties:**
  - `food_name: string`
  - `original_calories: number`
  - `new_calories: number`
  - `calories_delta: number`
  - `was_ai_scanned: boolean`
  - `ai_confidence: number | null`
  - `fields_changed: string[]` — e.g. `["calories", "protein_g"]`

### `water_logged`
- **Trigger:** User taps a water quick-add button
- **Screen:** LogScreen
- **Properties:**
  - `amount_ml: number` — 150 | 200 | 250 | 350 | 500
  - `new_total_ml: number`
  - `goal_ml: number` — 2000
  - `pct_of_goal: number`

### `history_screen_viewed`
- **Trigger:** HistoryScreen mounts
- **Screen:** HistoryScreen
- **Properties:**
  - `days_back: number` — 0 = today, 1 = yesterday, etc.
  - `has_logs_for_day: boolean`

### `history_day_navigated`
- **Trigger:** User taps prev/next day arrow
- **Screen:** HistoryScreen
- **Properties:**
  - `direction: "back" | "forward"`
  - `new_date: string` — YYYY-MM-DD
  - `days_back_from_today: number`

### `streak_viewed`
- **Trigger:** Streak badge is visible on HomeScreen (streak > 0)
- **Screen:** HomeScreen
- **Properties:**
  - `streak_days: number`

### `calorie_goal_exceeded`
- **Trigger:** Consumed calories surpass the daily target (first time that day)
- **Screen:** HomeScreen
- **Properties:**
  - `calories_consumed: number`
  - `calories_target: number`
  - `overage_pct: number`
  - `time_of_day: string`

### `calorie_goal_reached`
- **Trigger:** Consumed calories first reach 95–100% of target
- **Screen:** HomeScreen
- **Properties:**
  - `calories_consumed: number`
  - `calories_target: number`
  - `time_of_day: string`

### `profile_screen_viewed`
- **Trigger:** ProfileScreen mounts
- **Screen:** ProfileScreen
- **Properties:**
  - `is_premium: boolean`
  - `has_completed_profile: boolean`

### `profile_edit_opened`
- **Trigger:** User taps "Editar datos"
- **Screen:** ProfileScreen
- **Properties:** none additional

### `edit_profile_saved`
- **Trigger:** User saves changes on EditProfileScreen
- **Screen:** EditProfileScreen
- **Properties:**
  - `fields_changed: string[]`

---

## Stage 4 — Monetization

These events directly relate to paywall views, plan selection, purchase, and churn.

### `paywall_viewed`
- **Trigger:** PaywallScreen mounts
- **Screen:** PaywallScreen
- **Properties:**
  - `source: "profile_screen" | "scan_limit_gate" | "profile_premium_banner" | "onboarding_step28" | "onboarding_step30"`
  - `is_re_view: boolean` — user has seen paywall before
  - `scans_used_today: number`

### `paywall_plan_selected`
- **Trigger:** User taps a plan card (monthly or annual)
- **Screen:** PaywallScreen
- **Properties:**
  - `plan: "monthly" | "annual"`
  - `price: string` — e.g. `"$9.99"`
  - `previous_plan: string`

### `paywall_subscribe_tapped`
- **Trigger:** User taps the "Iniciar prueba gratuita 7 días" CTA
- **Screen:** PaywallScreen
- **Properties:**
  - `plan: "monthly" | "annual"`
  - `price: string`
  - `time_on_paywall_ms: number`
  - `source: string` — same as `paywall_viewed.source`

### `subscription_started`
- **Trigger:** RevenueCat confirms a successful purchase / trial start
- **Screen:** PaywallScreen
- **Properties:**
  - `plan: "monthly" | "annual"`
  - `price_usd: number`
  - `is_trial: boolean`
  - `trial_days: number` — 7
  - `revenue_cat_transaction_id: string`

### `subscription_restored`
- **Trigger:** User taps "Restaurar compra anterior" and it succeeds
- **Screen:** PaywallScreen
- **Properties:**
  - `plan: "monthly" | "annual"`

### `paywall_dismissed`
- **Trigger:** User taps the X / back button without purchasing
- **Screen:** PaywallScreen
- **Properties:**
  - `time_on_paywall_ms: number`
  - `plan_seen: "monthly" | "annual"` — whichever was last selected
  - `source: string`

### `trial_converted`
- **Trigger:** RevenueCat webhook fires: trial → active subscription
- **Source:** Backend event, forwarded to analytics
- **Properties:**
  - `plan: "monthly" | "annual"`
  - `trial_days_used: number`
  - `revenue_usd: number`

### `subscription_cancelled`
- **Trigger:** RevenueCat webhook fires: subscription cancelled
- **Source:** Backend event
- **Properties:**
  - `plan: "monthly" | "annual"`
  - `days_subscribed: number`
  - `reason: string | null` — from store if available

### `upgrade_banner_tapped`
- **Trigger:** Free user taps the "Mejorar →" link in scan screen banner
- **Screen:** ScanScreen
- **Properties:**
  - `scans_used_today: number`

---

## Implementation Notes

1. Use a single `track(eventName, properties)` wrapper around your analytics SDK (Mixpanel, Amplitude, or PostHog recommended).
2. Always merge the shared context at the wrapper level — do not repeat it manually per event.
3. `first_food_logged` must be guarded with a flag stored in AsyncStorage to prevent duplicate fires.
4. `calorie_goal_reached` and `calorie_goal_exceeded` should be guarded per-day with a flag in the daily summary store.
5. Backend events (`trial_converted`, `subscription_cancelled`) should fire server-side via the analytics SDK's server library or a webhook endpoint.
6. Redact PII: never send email, full name, or device identifiers as event properties. `user_id` (UUID) is safe.
