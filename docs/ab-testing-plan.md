# Fitsi AI — A/B Testing Plan

> Version: 1.0 | Last updated: 2026-03-22
> Cross-references: monetization-strategy.md, retention-strategy.md, push-strategy.md, onboarding-optimization.md
> Statistical framework: Two-tailed test, 95% confidence (alpha = 0.05), 80% power (beta = 0.20)

---

## Testing Philosophy

1. **One change at a time.** Never stack experiments on the same user segment unless using a holdout group.
2. **Hypothesis first.** No test runs without a written hypothesis, primary metric, and pre-calculated sample size.
3. **Ship the winner fast.** Once significance is reached, ship within 48 hours. Do not re-test unless the result is borderline (p = 0.04-0.05).
4. **Guard rails.** Every test must define a guardrail metric (something that must NOT degrade). If the guardrail metric drops by more than 2%, kill the test early.
5. **Sequential testing.** For long-running tests, use a sequential testing framework (e.g., always-valid p-values) to allow early stopping without inflating false positive rate.

---

## Sample Size Calculator Reference

```
n = (Z_alpha/2 + Z_beta)^2 * 2 * p * (1 - p) / MDE^2

Where:
  Z_alpha/2 = 1.96 (for 95% confidence)
  Z_beta    = 0.84 (for 80% power)
  p         = baseline conversion rate
  MDE       = minimum detectable effect (absolute)
```

For rate-based metrics (conversion, retention), use the formula above.
For continuous metrics (revenue, session duration), use the t-test equivalent with estimated standard deviation.

---

## Experiment Priority Matrix

| Priority | Impact | Effort | Run When |
|----------|--------|--------|----------|
| P0 | High revenue or retention impact | Low-medium | Immediately at launch |
| P1 | Medium impact, clear hypothesis | Medium | Month 1-2 |
| P2 | Incremental optimization | Low | Month 3+ |

---

## Experiment 1: Trial Length — 3-Day vs 7-Day

| Field | Detail |
|-------|--------|
| **ID** | EXP-001 |
| **Priority** | P0 |
| **Area** | Monetization / Paywall |
| **Hypothesis** | A 3-day trial creates higher urgency and drives more trial-to-paid conversions than a 7-day trial, because users who decide quickly have higher purchase intent and the shorter window reduces "forget to cancel" refunds that damage LTV. |
| **Primary Metric** | Revenue per trial start (RPTS) — accounts for both conversion rate AND post-conversion retention |
| **Secondary Metrics** | Trial-to-paid conversion rate, D30 retention of paid users, refund rate within 7 days |
| **Guardrail Metric** | Trial start rate must not drop by more than 15% (shorter trial might scare off some users) |
| **Variant A (Control)** | 7-day free trial (current) |
| **Variant B** | 3-day free trial |
| **Traffic Split** | 50/50 |
| **Targeting** | All new users who reach the onboarding paywall (Step 28) |
| **Exclusions** | Users from win-back flows, users who previously had a trial |
| **Sample Size** | Baseline: 50% trial-to-paid. MDE: 5pp (50% → 55%). n = 1,568 per variant = **3,136 total trial starts** |
| **Estimated Duration** | ~4-5 weeks (at 150 trial starts/day) |
| **Implementation** | RevenueCat offering groups: `trial_7d` vs `trial_3d`. Assign at first paywall view, persist in user profile |
| **Analysis Plan** | Primary: chi-squared test on RPTS at day 14 post-trial-end. Secondary: Kaplan-Meier survival curves for 90-day retention by variant |
| **Kill Criteria** | Stop if trial start rate drops >20% in variant B after 1 week (insufficient sample but clear signal) |
| **Expected Impact** | +5-10% revenue per trial start if 3-day wins; possible -5% if urgency backfires |

---

## Experiment 2: Onboarding Length — 20 Steps vs 30 Steps

| Field | Detail |
|-------|--------|
| **ID** | EXP-002 |
| **Priority** | P0 |
| **Area** | Onboarding / Activation |
| **Hypothesis** | A shorter 20-step onboarding reduces drop-off and increases onboarding completion rate, while maintaining personalization quality. Users who complete onboarding are 3x more likely to activate, so increasing completion rate has outsized downstream impact. The 30-step flow collects more data but risks fatigue — especially Steps 12 (Affirmation), 14 (Comparison), 18 (Progress Chart), 19 (Trust), 21 (Reviews), and 22 (Flexibility) which are persuasion screens, not data collection. |
| **Primary Metric** | Onboarding completion rate (reaching Step 27 Plan Ready) |
| **Secondary Metrics** | First scan within 24h, D7 retention, trial start rate, time-to-complete onboarding |
| **Guardrail Metric** | Trial start rate from onboarding paywall must not drop by more than 2pp (removing persuasion steps might reduce purchase intent) |
| **Variant A (Control)** | 30-step onboarding (current) |
| **Variant B** | 20-step onboarding — removes Steps 5 (Source), 6 (Other Apps), 7 (Social Proof Chart), 12 (Affirmation), 14 (Comparison), 18 (Progress Chart), 19 (Trust), 21 (Reviews), 22 (Flexibility), 24 (Referral) |
| **Traffic Split** | 50/50 |
| **Targeting** | All new installs |
| **Sample Size** | Baseline: 65% completion. MDE: 5pp (65% → 70%). n = 1,780 per variant = **3,560 total installs** |
| **Estimated Duration** | ~2-3 weeks (at 250 installs/day) |
| **Implementation** | Feature flag `onboarding_variant` in OnboardingContext. Variant B skips removed steps and adjusts progress bar accordingly |
| **Analysis Plan** | Primary: chi-squared on completion rate. Secondary: funnel comparison at each remaining step. Cohort retention curves (D1/D3/D7/D14) |
| **Kill Criteria** | Stop if trial start rate drops >3pp in variant B after 1,000 users per arm |
| **Expected Impact** | +8-12% onboarding completion, possible -2% trial start rate if persuasion screens were load-bearing |

**Steps removed in Variant B and rationale:**

| Removed Step | Type | Rationale |
|-------------|------|-----------|
| Step05 Source | Data collection | Low personalization value — only useful for attribution (can collect post-onboarding) |
| Step06 Other Apps | Data collection | Does not affect plan calculation |
| Step07 Social Proof Chart | Persuasion | Replaced by shorter social proof text on Step02 |
| Step12 Affirmation | Persuasion | Motivational — can be added as in-app content post-onboarding |
| Step14 Comparison | Persuasion | "2X faster with Fitsi" — moves to paywall screen instead |
| Step18 Progress Chart | Persuasion | Similar to Step14 — consolidate into paywall value prop |
| Step19 Trust/Privacy | Persuasion | Privacy policy link in footer is sufficient; trust badge on paywall |
| Step21 Reviews | Persuasion | Social proof consolidation — move to paywall |
| Step22 Flexibility | Persuasion | Highlight value prop — consolidate into plan ready screen |
| Step24 Referral | Data collection | Move to post-onboarding settings; low urgency at this point |

---

## Experiment 3: Monthly Pricing — $9.99 vs $7.99

| Field | Detail |
|-------|--------|
| **ID** | EXP-003 |
| **Priority** | P0 |
| **Area** | Monetization / Pricing |
| **Hypothesis** | Lowering the monthly price from $9.99 to $7.99 will increase trial-to-paid conversion rate by enough to offset the 20% revenue-per-subscriber reduction, resulting in higher total revenue per 1,000 trial starts. The $7.99 price point crosses below the "double-digit" psychological threshold and matches YAZIO ($9.99) at a discount. |
| **Primary Metric** | Revenue per 1,000 trial starts (RPT) — composite of conversion rate * price * retention |
| **Secondary Metrics** | Trial-to-paid conversion rate, D30 subscriber retention, annual plan selection rate, LTV at 90 days |
| **Guardrail Metric** | Annual plan selection rate must not drop by more than 5pp (cheaper monthly reduces annual incentive) |
| **Variant A (Control)** | $9.99/month, $59.99/year |
| **Variant B** | $7.99/month, $59.99/year (annual unchanged — increases annual savings from 50% to 37%) |
| **Traffic Split** | 50/50 |
| **Targeting** | All users who view any paywall |
| **Exclusions** | Users in EXP-001 (trial length test) — avoid confounding |
| **Sample Size** | Baseline: 50% conversion at $9.99. MDE: 7pp (50% → 57%). n = 816 per variant = **1,632 total trial expirations** |
| **Estimated Duration** | ~5-6 weeks (need trial to expire + 30 days for LTV signal) |
| **Implementation** | RevenueCat offering groups: `pricing_999` vs `pricing_799`. Separate product IDs in App Store / Google Play |
| **Analysis Plan** | Primary: bootstrapped comparison of RPT distributions. Secondary: chi-squared on conversion rate. Monitor annual mix closely — if $7.99 monthly cannibalizes annual, net effect may be negative |
| **Kill Criteria** | Stop if annual plan selection drops >10pp in variant B |
| **Expected Impact** | If conversion increases by 10pp+, RPT increases despite lower price. If conversion increases <5pp, control wins on revenue |

**Revenue math:**
- Control: 500 conversions * $9.99 * 8.3 months avg = $41,458 LTV per 1,000 trials
- Variant B (optimistic): 570 conversions * $7.99 * 8.3 months = $37,801 LTV per 1,000 trials
- Variant B needs +18% more conversions to match control revenue. This is a high bar — $7.99 may only win if it dramatically changes annual mix.

---

## Experiment 4: Home Screen — Calorie Ring vs Number Display

| Field | Detail |
|-------|--------|
| **ID** | EXP-004 |
| **Priority** | P1 |
| **Area** | Engagement / Home Screen |
| **Hypothesis** | A large numeric calorie display (e.g., "1,247 / 2,100 kcal") with a progress bar is more immediately readable than the circular ring, leading to faster comprehension and higher engagement (more frequent home screen visits and meals logged). The ring is visually appealing but requires spatial interpretation, while numbers are cognitively instant. |
| **Primary Metric** | Meals logged per active user per day (North Star proxy) |
| **Secondary Metrics** | Home screen sessions per day, time spent on home screen, D7 retention |
| **Guardrail Metric** | App Store rating must not drop (UX change can trigger negative reviews) |
| **Variant A (Control)** | Circular calorie ring (current Cal AI style) |
| **Variant B** | Large number display: "1,247 / 2,100 kcal" with horizontal progress bar + percentage |
| **Traffic Split** | 50/50 |
| **Targeting** | All active users (existing + new) |
| **Sample Size** | Baseline: 1.8 meals/day. MDE: 0.2 meals/day. SD est: 1.2. n = 565 per variant = **1,130 active users** |
| **Estimated Duration** | 3 weeks (continuous metric — need stable estimates) |
| **Implementation** | Feature flag `home_display_variant` in HomeScreen.tsx. Both variants use same data, different UI component |
| **Analysis Plan** | t-test on daily meals logged (continuous). Mann-Whitney U as robustness check. Segment by new vs existing users (existing users may resist change) |
| **Kill Criteria** | Stop if D3 retention drops >3pp for new users in variant B |
| **Expected Impact** | +0.1-0.3 meals/day if number display is more actionable. Risk: existing users prefer the ring (familiarity bias) |

---

## Experiment 5: Scan Flow — Auto-Log vs Confirm-First

| Field | Detail |
|-------|--------|
| **ID** | EXP-005 |
| **Priority** | P1 |
| **Area** | Activation / Scan UX |
| **Hypothesis** | Auto-logging scan results (skip the confirmation screen) reduces friction and increases meals logged per session. Current flow: scan → review result → tap "Save". Auto-log flow: scan → result appears as already saved (with "Undo" option for 5 seconds). This mirrors the Instagram "post first, edit later" pattern and eliminates a decision point. |
| **Primary Metric** | Scan-to-log conversion rate (% of scans that result in a saved food log) |
| **Secondary Metrics** | Meals logged per session, undo rate (signal of user discomfort), edit rate post-save, D7 retention |
| **Guardrail Metric** | Food log accuracy (edit rate should not increase by more than 10pp — if users are correcting auto-logged items too often, friction is just delayed, not removed) |
| **Variant A (Control)** | Scan → Review → Confirm ("Guardar en mi registro") — current flow |
| **Variant B** | Scan → Auto-save with 5-second undo toast ("Guardado. Deshacer?") |
| **Traffic Split** | 50/50 |
| **Targeting** | All users who initiate a scan |
| **Sample Size** | Baseline: 85% scan-to-log. MDE: 5pp (85% → 90%). n = 906 per variant = **1,812 total scans** |
| **Estimated Duration** | 2 weeks |
| **Implementation** | Feature flag `scan_auto_log`. Variant B modifies ScanScreen result state: auto-calls save API on result, shows undo toast |
| **Analysis Plan** | chi-squared on scan-to-log rate. Monitor undo rate daily — if >20%, the auto-save is too aggressive |
| **Kill Criteria** | Stop if undo rate >25% or edit rate increases >15pp |
| **Expected Impact** | +5-10pp scan-to-log rate, +0.2 meals logged per session |

---

## Experiment 6: Push Notification Timing — Fixed vs Personalized

| Field | Detail |
|-------|--------|
| **ID** | EXP-006 |
| **Priority** | P1 |
| **Area** | Retention / Push Notifications |
| **Hypothesis** | Sending meal reminders at the user's historical meal times (derived from their logging patterns) instead of fixed times (08:30/13:00/20:00) will increase push open rates by 20%+ because the notification arrives when the user is actually about to eat, not at an arbitrary time. |
| **Primary Metric** | Push notification open rate (meal reminder templates only) |
| **Secondary Metrics** | Meals logged within 30 min of push, push opt-out rate, D7 retention |
| **Guardrail Metric** | Push opt-out rate must not increase by more than 0.5pp/week |
| **Variant A (Control)** | Fixed schedule: breakfast 08:30, lunch 13:00, dinner 20:00 local time |
| **Variant B** | Personalized: send at user's median meal log time for each meal type (requires 5+ logs of that meal type; falls back to fixed for new users) |
| **Traffic Split** | 50/50 |
| **Targeting** | Users with push enabled AND 7+ days of logging history (need data for personalization) |
| **Sample Size** | Baseline: 15% open rate. MDE: 3pp (15% → 18%). n = 3,220 per variant = **6,440 push recipients** |
| **Estimated Duration** | 4 weeks |
| **Implementation** | Backend cron job calculates per-user meal time medians weekly. Push scheduler uses personalized times for variant B. Store variant assignment in user profile |
| **Analysis Plan** | chi-squared on open rate. Segment by meal type (breakfast/lunch/dinner may respond differently). Time-series analysis of opt-out rates |
| **Kill Criteria** | Stop if opt-out rate increases >1pp in any 7-day window |
| **Expected Impact** | +20-30% open rate improvement. Secondary: +0.3 meals logged per user per week |

---

## Experiment 7: Paywall Social Proof — None vs Testimonials

| Field | Detail |
|-------|--------|
| **ID** | EXP-007 |
| **Priority** | P1 |
| **Area** | Monetization / Paywall |
| **Hypothesis** | Adding user testimonials ("I lost 4kg in 6 weeks just by tracking with Fitsi") to the paywall screen increases trial start rate because social proof reduces purchase anxiety at the decision moment. The current paywall focuses on features — adding outcomes makes the value concrete. |
| **Primary Metric** | Trial start rate from paywall (trial starts / unique paywall views) |
| **Secondary Metrics** | Time on paywall, annual plan selection rate, scroll depth |
| **Guardrail Metric** | Paywall load time must not increase by more than 500ms |
| **Variant A (Control)** | Current paywall — feature comparison table, pricing, CTA |
| **Variant B** | Paywall + social proof banner: 3 rotating testimonials with name, days using app, and key result. Positioned between feature table and CTA |
| **Variant C** | Paywall + "50,000+ meals scanned" counter + "4.6 star rating" badge (quantitative social proof instead of testimonials) |
| **Traffic Split** | 33/33/33 |
| **Targeting** | All users who view any paywall |
| **Sample Size** | Baseline: 10% trial start rate. MDE: 2pp (10% → 12%). n = 4,330 per variant = **12,990 total paywall views** |
| **Estimated Duration** | 4-5 weeks |
| **Implementation** | Feature flag `paywall_social_proof`. Variants B and C add UI components to PaywallScreen. Testimonials hardcoded initially, dynamic later |
| **Analysis Plan** | chi-squared test with Bonferroni correction (3 variants). If both B and C beat A, run follow-up B vs C test |
| **Kill Criteria** | None — low risk test, all variants have same core paywall |
| **Expected Impact** | +1-3pp trial start rate. Testimonials (B) likely outperform numbers (C) based on health/fitness app benchmarks |

---

## Experiment 8: Onboarding Paywall — After Plan vs After First Scan

| Field | Detail |
|-------|--------|
| **ID** | EXP-008 |
| **Priority** | P1 |
| **Area** | Monetization / Paywall Timing |
| **Hypothesis** | Showing the paywall after the user's first successful AI scan (instead of at the end of onboarding) will increase trial start rate because the user has experienced the core value ("aha moment") firsthand. Currently, the paywall appears before the user has ever used the product — they're buying based on promises, not experience. |
| **Primary Metric** | Trial start rate per install (not per paywall view — accounts for users who never reach the paywall) |
| **Secondary Metrics** | Trial start rate per paywall view, first scan rate, D7 retention, revenue per install |
| **Guardrail Metric** | Onboarding completion rate must not drop (deferring paywall should not break the onboarding flow) |
| **Variant A (Control)** | Paywall at Step 28 (after plan is generated, before entering app) |
| **Variant B** | No paywall in onboarding. Paywall appears as a modal after the user's first successful scan confirm (with 2-second delay for celebration animation first) |
| **Traffic Split** | 50/50 |
| **Targeting** | All new installs |
| **Exclusions** | Users in EXP-002 (onboarding length test) |
| **Sample Size** | Baseline: 6% trial starts per install. MDE: 1.5pp (6% → 7.5%). n = 4,500 per variant = **9,000 installs** |
| **Estimated Duration** | 5-6 weeks |
| **Implementation** | Feature flag `paywall_timing`. Variant B removes Step28/29/30 from onboarding navigator. Adds paywall trigger in ScanScreen after first `scan_confirmed` event |
| **Analysis Plan** | chi-squared on trial-per-install. Critical: also measure time-to-trial (variant B will be delayed by hours/days vs instant). Run 90-day cohort analysis for LTV comparison |
| **Kill Criteria** | Stop if trial-per-install drops >1pp in variant B after 3,000 users per arm |
| **Expected Impact** | +15-25% trial start rate per paywall view (higher intent). But paywall view rate will be lower (not all users scan Day 0). Net effect on trial-per-install is the key question |

---

## Experiment 9: Streak Freeze Availability

| Field | Detail |
|-------|--------|
| **ID** | EXP-009 |
| **Priority** | P1 |
| **Area** | Retention / Gamification |
| **Hypothesis** | Giving free users 1 streak freeze per month (auto-applied on the first missed day) will increase D7 and D14 retention because streak loss is the #1 reason users disengage after building a streak. The freeze acts as a safety net that prevents the "all-or-nothing" psychology that causes permanent drop-off after one bad day. |
| **Primary Metric** | D14 retention (% of users active on day 14) |
| **Secondary Metrics** | D7 retention, average streak length, streak break rate, Premium upgrade rate (streak freeze is a Premium differentiator) |
| **Guardrail Metric** | Premium conversion rate must not drop by more than 1pp (streak freeze is currently a Premium perk — giving it free may reduce incentive) |
| **Variant A (Control)** | No streak freeze for free users. Premium gets 2/month |
| **Variant B** | Free users get 1 freeze/month (auto-applied). Premium gets 3/month |
| **Traffic Split** | 50/50 |
| **Targeting** | All new users (assign at signup, measure from Day 0) |
| **Sample Size** | Baseline: 15% D14 retention. MDE: 3pp (15% → 18%). n = 2,720 per variant = **5,440 installs** |
| **Estimated Duration** | 3-4 weeks (need 14+ days per user) |
| **Implementation** | Backend: add `streak_freezes_remaining` field to daily_summaries. Auto-apply on first day with 0 logs if freeze available. Frontend: show freeze icon on streak display |
| **Analysis Plan** | chi-squared on D14 retention. Segment by streak length at time of freeze (users with 3-day streaks vs 10-day streaks respond differently). Monitor premium conversion closely |
| **Kill Criteria** | Stop if premium conversion drops >2pp |
| **Expected Impact** | +3-5pp D14 retention. +1.5 days average streak length. Possible -0.5pp premium conversion (acceptable trade-off if retention gain is large) |

---

## Experiment 10: Spin-the-Wheel Discount Depth

| Field | Detail |
|-------|--------|
| **ID** | EXP-010 |
| **Priority** | P1 |
| **Area** | Monetization / Discount Strategy |
| **Hypothesis** | Increasing the minimum discount on the spin-the-wheel from 30% to 40% (and shifting the distribution toward higher discounts) will increase conversion rate enough to offset the revenue-per-subscriber impact, because the current 30% minimum is not compelling enough for users who already declined the full-price paywall. |
| **Primary Metric** | Revenue per wheel spin (conversion rate * average discounted price * 90-day retention) |
| **Secondary Metrics** | Spin-to-trial conversion rate, average discount applied, 90-day LTV of discounted users |
| **Guardrail Metric** | Full-price paywall conversion (Step28) must not change — users should not learn to "wait for the wheel" |
| **Variant A (Control)** | Distribution: 40% → 30% off, 35% → 40% off, 20% → 50% off, 5% → 60% off |
| **Variant B** | Distribution: 30% → 40% off, 40% → 50% off, 25% → 60% off, 5% → 70% off |
| **Traffic Split** | 50/50 |
| **Targeting** | Users who decline Step28 paywall and reach Step29 (spin-the-wheel) |
| **Sample Size** | Baseline: 8% spin-to-trial. MDE: 3pp (8% → 11%). n = 1,650 per variant = **3,300 wheel spins** |
| **Estimated Duration** | 5-6 weeks |
| **Implementation** | Feature flag `wheel_discount_variant`. Modify Step29SpinWheel.tsx odds table. Track which discount was "won" and applied |
| **Analysis Plan** | Bootstrapped comparison of revenue-per-spin distributions (accounts for both conversion rate and discount depth). 90-day LTV cohort comparison |
| **Kill Criteria** | Stop if average discount exceeds 55% AND conversion increase is <2pp (giving away too much for too little gain) |
| **Expected Impact** | +3-5pp spin-to-trial conversion. Revenue impact depends on whether higher conversion offsets deeper discounts — likely net positive for annual plans |

---

## Experiment Sequencing Roadmap

```
MONTH 1 (Launch)
├── EXP-001: Trial Length (3d vs 7d)         ← P0, revenue critical
├── EXP-002: Onboarding Length (20 vs 30)    ← P0, top-of-funnel
└── EXP-003: Monthly Pricing ($9.99 vs $7.99) ← P0, revenue critical
    Note: EXP-001 and EXP-003 must NOT overlap on the same users

MONTH 2
├── EXP-004: Home Display (ring vs number)    ← P1, engagement
├── EXP-005: Scan Auto-Log                    ← P1, activation
└── EXP-006: Push Timing (fixed vs personal)  ← P1, retention

MONTH 3
├── EXP-007: Paywall Social Proof             ← P1, monetization
├── EXP-008: Paywall Timing (onboarding vs post-scan) ← P1, monetization
├── EXP-009: Streak Freeze                    ← P1, retention
└── EXP-010: Spin Wheel Discounts             ← P1, monetization
    Note: EXP-007 and EXP-008 must NOT overlap (both modify paywall)
```

---

## Experiment Conflict Matrix

Tests that CANNOT run simultaneously on the same users:

| Experiment | Conflicts With | Reason |
|-----------|---------------|--------|
| EXP-001 (Trial Length) | EXP-003 (Pricing) | Both modify purchase decision variables |
| EXP-002 (Onboarding Length) | EXP-008 (Paywall Timing) | Both modify onboarding flow |
| EXP-007 (Paywall Social Proof) | EXP-008 (Paywall Timing) | Both modify paywall screen |
| EXP-007 (Paywall Social Proof) | EXP-010 (Spin Wheel) | Sequential paywall flow dependency |

Tests that CAN safely run in parallel (different parts of the funnel):

| Parallel Pair | Reason |
|--------------|--------|
| EXP-002 + EXP-004 | Onboarding vs Home Screen — no overlap |
| EXP-005 + EXP-006 | Scan UX vs Push Timing — independent systems |
| EXP-004 + EXP-009 | Home Display vs Streak Freeze — independent |

---

## Results Tracking Template

After each experiment concludes, document results in this format:

```markdown
### EXP-XXX Results — [Title]

**Run dates:** YYYY-MM-DD to YYYY-MM-DD
**Sample size:** n_A = X, n_B = Y
**Duration:** X weeks

| Metric | Control | Variant B | Delta | p-value | Significant? |
|--------|---------|-----------|-------|---------|-------------|
| Primary: [metric] | X% | Y% | +Z% | 0.0XX | Yes/No |
| Secondary: [metric] | X | Y | +Z | 0.0XX | Yes/No |
| Guardrail: [metric] | X% | Y% | +Z% | 0.0XX | Pass/Fail |

**Decision:** Ship Variant [A/B] / Inconclusive — re-test with larger MDE
**Learnings:** [What did we learn that informs future experiments?]
**Follow-up:** [Any follow-up experiment suggested?]
```

---

## Analytics Events Required for A/B Testing

All experiments require these analytics events (most already defined in analytics-events.md):

| Event | Used By Experiments |
|-------|-------------------|
| `onboarding_step_viewed` | EXP-002, EXP-008 |
| `onboarding_completed` | EXP-002, EXP-008 |
| `paywall_viewed` | EXP-001, EXP-003, EXP-007, EXP-008, EXP-010 |
| `paywall_subscribe_tapped` | EXP-001, EXP-003, EXP-007, EXP-008, EXP-010 |
| `subscription_started` | EXP-001, EXP-003, EXP-007, EXP-008, EXP-010 |
| `trial_converted` | EXP-001, EXP-003 |
| `scan_completed` | EXP-005, EXP-008 |
| `scan_confirmed` | EXP-005, EXP-008 |
| `home_screen_viewed` | EXP-004 |
| `push_opened` | EXP-006 |
| `streak_viewed` | EXP-009 |

**New events needed:**

| Event | Properties | Used By |
|-------|-----------|---------|
| `experiment_enrolled` | `experiment_id`, `variant`, `user_id`, `timestamp` | All |
| `scan_auto_saved` | `food_name`, `calories`, `undo_shown` | EXP-005 |
| `scan_auto_save_undone` | `food_name`, `time_to_undo_ms` | EXP-005 |
| `streak_freeze_applied` | `streak_days_saved`, `freezes_remaining` | EXP-009 |
| `wheel_discount_won` | `discount_pct`, `variant` | EXP-010 |

---

## Tools & Infrastructure

| Need | Recommended Tool | Alternative |
|------|-----------------|-------------|
| Feature flags | PostHog Feature Flags | LaunchDarkly, Statsig |
| Analytics | PostHog / Mixpanel | Amplitude |
| Statistical analysis | PostHog Experimentation | Custom Python (scipy.stats) |
| Revenue tracking | RevenueCat | Custom backend |
| Push A/B testing | OneSignal Experiments | Custom backend scheduler |

**Minimum viable setup for launch:** PostHog (free tier handles flags + analytics + experiments) + RevenueCat (already integrated).
