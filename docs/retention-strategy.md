# Fitsi AI — Retention Strategy

> Version: 1.0 | Last updated: 2026-03-22
> Complements: push-strategy.md (notification templates), analytics-events.md (event tracking)

---

## Retention Targets

| Metric | Target | Industry Avg (Health & Fitness) | Stretch Goal |
|--------|--------|-------------------------------|-------------|
| D1 Retention | > 45% | 25-30% | 55% |
| D3 Retention | > 30% | 18-22% | 38% |
| D7 Retention | > 20% | 12-15% | 28% |
| D14 Retention | > 15% | 8-10% | 20% |
| D30 Retention | > 10% | 5-7% | 15% |
| D90 Retention | > 6% | 3-4% | 9% |
| Weekly Active Users (WAU) / MAU | > 40% | 25-30% | 50% |
| Stickiness (DAU/MAU) | > 20% | 10-15% | 30% |

**North Star Metric:** Weekly meals logged per active user. Target: 14+ (2/day average).

---

## 1. PUSH NOTIFICATION SEQUENCES

> Detailed templates and payload structures are in push-strategy.md. This section defines the lifecycle sequences.

### Onboarding Sequence (Days 0-3) — "First Habit Formation"

| Day | Time | Trigger | Message Theme | Goal |
|-----|------|---------|---------------|------|
| 0 | +2h after onboarding | Completed onboarding, no meal logged | "Your plan is ready! Scan your first meal in 10 seconds" | First scan |
| 0 | +6h after onboarding | Still no meal logged | "Just point your camera at what you're eating — AI does the rest" | Remove friction |
| 1 | 08:30 | No breakfast logged | "Day 1 starts now! Log breakfast and build your streak" | Morning habit |
| 1 | 20:00 | < 2 meals logged | "You logged {{n}} meals today — one more to hit your daily target" | End-of-day nudge |
| 2 | 08:30 | No breakfast logged | "Day 2! Consistency beats perfection. Quick scan?" | Reinforce habit |
| 2 | 13:00 | No lunch logged | "Halfway through the day — log lunch and stay on track" | Midday check |
| 3 | 08:30 | No breakfast logged | "3 days in! You're officially building a habit" | Celebrate momentum |
| 3 | 21:30 | Streak at risk | "Your 3-day streak is on the line! One scan saves it" | Streak protection |

**Rules:**
- If user has logged 2+ meals on any day, skip the reminders for that day (they're self-motivated)
- Never send more than 2 push notifications per day during onboarding sequence
- All suppression rules from push-strategy.md apply

### Engagement Sequence (Days 4-14) — "Deepening the Habit"

| Day | Trigger | Message Theme | Goal |
|-----|---------|---------------|------|
| 5 | User logged 5+ days | "5-day streak! You're in the top 20% of new users" | Social proof |
| 7 | Weekly milestone | "1 week complete! Here's your first weekly report" | Introduce reports |
| 7 | User hasn't tried water tracking | "Did you know? You can track water too. Stay hydrated" | Feature discovery |
| 10 | User hasn't tried barcode scanner | "Quick tip: scan barcodes for instant nutrition info" | Feature discovery |
| 14 | 2-week milestone | "14 days! Your eating patterns are becoming clearer — check your insights" | Introduce insights |

### Retention Sequence (Days 15-30) — "Making It Stick"

| Day | Trigger | Message Theme | Goal |
|-----|---------|---------------|------|
| 18 | User has > 30 logged meals | "You've logged {{count}} meals! Here's what we learned about your eating" | Personalized insight |
| 21 | 3-week milestone | "3 weeks of consistency. Your {{macro}} intake improved by {{pct}}%" | Progress proof |
| 25 | Free user, high engagement | "You've been crushing it! Unlock unlimited scans with Premium" | Soft upgrade nudge |
| 30 | 1-month milestone | "1 MONTH! You're officially a Fitsi power user" | Celebrate + badge |

### Long-Term Retention (Day 30+) — "Sustained Engagement"

| Trigger | Message Theme | Frequency |
|---------|---------------|-----------|
| Weekly summary ready | "Your week: {{avg_cal}} avg kcal, {{days}}/7 logged. See trends" | Weekly (Mon 09:00) |
| Monthly milestone | "Month {{n}} complete! You've logged {{total}} meals total" | Monthly |
| Personal best | "New record! Longest streak ever: {{days}} days" | When achieved |
| Weight milestone (if tracking) | "You've lost {{kg}}kg since you started. Keep going!" | When achieved |
| New feature release | "New: [feature]. Try it now" | Per release, max 1/month |

---

## 2. EMAIL ONBOARDING DRIP (5 Emails)

> Sent via transactional email (SendGrid/Resend). Users opt-in during account creation.

### Email 1: Welcome (Sent immediately after account creation)

**Subject:** Welcome to Fitsi AI — here's how to get started
**Preview text:** Your personalized plan is ready. One photo is all it takes.

**Content structure:**
- Hero: App icon + "Welcome, {{first_name}}!"
- Your plan summary: {{daily_calories}} kcal, {{protein}}g protein, {{carbs}}g carbs, {{fats}}g fat
- CTA button: "Log Your First Meal" (deep link to scan screen)
- 3 quick tips: (1) Point camera at food, (2) AI identifies it, (3) Macros logged automatically
- Footer: social links, unsubscribe

**Goal:** Drive first meal scan within 24 hours.

---

### Email 2: First Win (Day 2 — only if user has logged at least 1 meal)

**Subject:** You logged your first meal! Here's what's next
**Preview text:** You're already ahead of 60% of new users.

**Content structure:**
- Congratulations on first log
- "Most users who log for 3 days straight stick with it for a month"
- Feature spotlight: Water tracking + Streak system
- CTA button: "Keep Your Streak Going" (deep link to home)
- Tip: "Try scanning a packaged food with the barcode scanner"

**Goal:** Encourage Day 2-3 engagement. Introduce secondary features.

**Alternative (if NO meal logged by Day 2):**
- Subject: "Still haven't tried the AI scanner? Here's a 10-second demo"
- Include GIF/video of scanning flow
- CTA: "Try It Now"

---

### Email 3: Social Proof (Day 5)

**Subject:** How {{first_name_or_users}} lost weight with Fitsi AI
**Preview text:** Real results from real people. No gimmicks.

**Content structure:**
- 2-3 user testimonials (with before/after stats, not photos unless consented)
  - "I lost 4kg in 6 weeks just by being aware of what I ate"
  - "The AI scanner saves me 5 minutes per meal vs. manual logging"
  - "Finally an app that doesn't make calorie counting feel like homework"
- "Join {{user_count}}+ people tracking smarter with AI"
- CTA button: "Open Fitsi AI"

**Goal:** Build trust and FOMO through social proof. Re-engage users who dropped off.

---

### Email 4: Feature Deep Dive (Day 10)

**Subject:** 5 things you might not know Fitsi AI can do
**Preview text:** Most users discover these in week 3. Get ahead now.

**Content structure:**
1. **AI Coach** — Ask nutrition questions, get instant answers
2. **Weekly Reports** — See your eating trends over time
3. **Recipes** — AI suggests meals based on your remaining macros
4. **Progress Photos** — Track visual changes alongside the data
5. **Barcode Scanner** — Scan packaged foods for instant nutrition info
- CTA button: "Explore Features"

**Goal:** Feature discovery. Increase surface area of engagement. Users who use 3+ features retain 2.5x better.

---

### Email 5: Upgrade Nudge (Day 14 — free users only)

**Subject:** You've been at this for 2 weeks. Ready for the next level?
**Preview text:** Unlimited scans, detailed insights, AI recipes — try free for 7 days.

**Content structure:**
- Recap their stats: "In 14 days, you've logged {{meals}} meals and tracked {{days}} days"
- "Here's what Premium unlocks:"
  - Unlimited AI scans (no daily cap)
  - Micronutrient analysis
  - AI-powered recipe suggestions
  - Weekly progress predictions
  - Apple Health / Google Fit sync
- Pricing: Monthly ($9.99) or Annual ($59.99 — save 50%)
- CTA button: "Start 7-Day Free Trial"
- Reassurance: "Cancel anytime. No charge during trial."

**Goal:** Convert engaged free users to trial. Only send to users with 5+ logged days.

---

### Email Drip Rules

- **Unsubscribe:** One-click unsubscribe in every email (CAN-SPAM / GDPR)
- **Suppression:** If user unsubscribes, stop ALL marketing emails. Transactional (password reset, receipts) still send.
- **Timing:** Send at 10:00 local time. If timezone unknown, send at 10:00 UTC-5 (covers US + LATAM peak).
- **Skip logic:** If the user already did the action the email promotes, skip that email (e.g., don't send Email 5 to Premium users).
- **A/B testing:** Test subject lines on 20% of audience, send winner to remaining 80% after 4 hours.

---

## 3. RE-ENGAGEMENT CAMPAIGNS (Inactive Users)

### Definition of Inactivity Tiers

| Tier | Days Inactive | Size (est.) | Win-Back Difficulty |
|------|--------------|-------------|-------------------|
| At Risk | 3-6 days | ~15% of MAU | Easy |
| Lapsed | 7-13 days | ~10% of MAU | Medium |
| Dormant | 14-29 days | ~8% of MAU | Hard |
| Churned | 30+ days | ~20% of total users | Very Hard |

### At Risk (3-6 days inactive)

**Push Notification (Day 3):**
- "We miss you, {{first_name}}! Your plan is still here — scan a meal in 10 seconds"
- Deep link: Home screen

**Push Notification (Day 5):**
- "Your streak reset, but your progress didn't. Come back and start a new one"
- Deep link: Scan screen

**In-App (on return):**
- Welcome back modal: "Good to see you! Here's what you missed" + summary of any new features
- Offer a "fresh start" — recalculate daily targets if they want

### Lapsed (7-13 days inactive)

**Push Notification (Day 7):**
- "Still there, {{first_name}}? Your nutrition history is safe. Pick up where you left off"
- Deep link: Home

**Email (Day 9):**
- Subject: "Your Fitsi AI plan misses you"
- Content: "Life gets busy. Here's the good news: your data, your plan, and your history are all still here. One photo and you're back."
- CTA: "Log a Quick Meal"

**Push Notification (Day 12):**
- "Quick question: what stopped you? [Too busy] [Not useful] [Other app]"
- Deep link: Feedback form (captures churn reason)

### Dormant (14-29 days inactive)

**Email (Day 14):**
- Subject: "Before you go — here's what you achieved"
- Content: Summary of their total meals logged, best streak, macros tracked
- "All of this is still here. One tap to pick back up."
- CTA: "Return to Fitsi AI"

**Push Notification (Day 14 — last push attempt):**
- "One last thing: your history and personalized plan are saved. We'll be here when you're ready."
- After this: stop push notifications to avoid being blocked/reported

**Email (Day 21):**
- Subject: "We added [new feature] since you've been away"
- Only send if a genuine new feature launched
- CTA: "See What's New"

### Churned (30+ days inactive)

**Email only (Day 30):**
- Subject: "It's been a month. We improved a few things."
- Highlight 2-3 improvements since they left
- Offer: "Come back and get 3 days of Premium free" (if applicable)
- CTA: "Try Fitsi AI Again"

**Email (Day 60 — final attempt):**
- Subject: "Final check-in from Fitsi AI"
- "We won't email you again unless you come back. Your account and data are safe."
- CTA: "Keep My Account" / "Delete My Account"
- After this: move to suppression list. No more re-engagement attempts.

### Re-Engagement Rules

- Never re-engage a user who explicitly deleted their account
- Max 1 re-engagement push per 7 days
- Max 1 re-engagement email per 10 days
- Track re-engagement success rate by tier (target: >15% At Risk, >8% Lapsed, >3% Dormant)
- If a user returns, reset them to the appropriate lifecycle stage (not back to onboarding)

---

## 4. GAMIFICATION LOOPS

### 4a. Streaks

**Mechanic:** Log at least 1 meal per day to maintain your streak.

| Streak Length | Visual Reward | Unlock |
|--------------|--------------|--------|
| 3 days | Bronze flame icon | Badge: "Getting Started" |
| 7 days | Silver flame icon | Badge: "Week Warrior" |
| 14 days | Gold flame icon | Badge: "Consistency King/Queen" |
| 30 days | Platinum flame + animation | Badge: "Monthly Master" + share card |
| 60 days | Diamond flame | Badge: "Unbreakable" |
| 90 days | Custom flame color (user picks) | Badge: "Legendary" + 1 week Premium free |
| 365 days | Crown icon | Badge: "Fitsi Legend" + lifetime discount |

**Streak Freeze:**
- Free users: 1 freeze per 30 days (earned by logging 7 consecutive days)
- Premium users: 2 freezes per 30 days
- A freeze auto-applies if the user misses a day but had used the app the day before
- Creates perceived value for Premium

**Streak Recovery:**
- If streak broken < 48h ago: offer "recover your streak" for watching a short survey or inviting a friend
- This creates a monetizable moment without direct payment

### 4b. Badges & Achievements

**Categories:**

| Category | Examples | Count |
|----------|---------|-------|
| Logging | First Meal, 10 Meals, 100 Meals, 500 Meals, 1000 Meals | 5 |
| Streaks | 3-Day, 7-Day, 14-Day, 30-Day, 60-Day, 90-Day, 365-Day | 7 |
| Macros | Hit Protein Goal 5x, Hit All Macros 3 Days Straight, Balanced Week | 5 |
| Hydration | First Water Log, 8 Glasses/Day, 7-Day Water Streak | 3 |
| Exploration | First Barcode Scan, First Recipe Viewed, First Report Generated, Used AI Coach | 4 |
| Social | First Referral, 3 Referrals, 10 Referrals, Shared Progress | 4 |
| Weight | First Weigh-In, 1kg Lost, 5kg Lost, Goal Reached | 4 |
| Premium | First Week Premium, First Month Premium | 2 |

**Total: 34 badges**

**Display:** Badge wall in Profile tab. New badges trigger a celebration animation + optional push notification. Shareable as social cards.

### 4c. Weekly Challenges

**Mechanic:** New challenge every Monday. Complete for XP/badges. Optional — no penalty for skipping.

| Week Type | Challenge | Reward |
|-----------|-----------|--------|
| Logging | "Log every meal for 5 of 7 days" | 50 XP + badge progress |
| Macro | "Hit your protein target 4 times this week" | 75 XP |
| Hydration | "Log 8+ glasses of water 3 days this week" | 50 XP |
| Exploration | "Try the barcode scanner on 3 different products" | 40 XP |
| Social | "Share your weekly report with a friend" | 60 XP + referral credit |
| Variety | "Log meals from 5 different food categories" | 50 XP |
| Consistency | "Open the app every day this week" | 100 XP |

**XP System:**
- XP accumulates and unlocks cosmetic levels (Level 1-50)
- Levels unlock: profile frames, custom streak flame colors, app icon variants (Premium)
- Leaderboard: optional weekly leaderboard among friends/groups
- XP is NOT purchasable — it reflects genuine engagement

---

## 5. SOCIAL LOOPS

### 5a. Referral Program Optimization

**Current mechanic:** User shares referral code. Referred user enters code during onboarding (Step24). Both get a reward.

**Optimized Referral Flow:**

| Element | Current | Optimized |
|---------|---------|-----------|
| Share trigger | Manual from settings | Prompt after achievements (streak milestones, badges, weight goals) |
| Share format | Text code | Pre-designed shareable card with user's stats |
| Referrer reward | None defined | 1 week Premium free per successful referral (max 4 weeks/year) |
| Referred reward | None defined | 3 extra AI scans on first day |
| Double-sided | No | Yes — both parties rewarded |
| Tracking | Code only | Deep link with attribution (Branch.io or Firebase Dynamic Links) |
| Viral coefficient target | — | k > 0.3 (each user brings 0.3 new users) |

**Referral Triggers (when to prompt sharing):**
1. After hitting 7-day streak — "Share your streak with a friend and challenge them"
2. After earning a badge — "You earned [badge]! Share it" with pre-made social card
3. After weekly report — "Your week was great! Share your progress"
4. After weight milestone — "You lost {{kg}}kg! Inspire a friend"
5. After 30 days — "You've been using Fitsi for a month! Know someone who'd love it?"

**Referral Analytics:**
- Referral share rate (% of prompted users who share)
- Referral conversion rate (% of shared links that convert to installs)
- Referral activation rate (% of referred installs that complete onboarding)
- Viral coefficient (k-factor): shares per user * conversion rate

### 5b. Share Achievements

**Shareable Moments:**
- Streak milestones (auto-generated card: "I've logged meals for 30 days straight on Fitsi AI!")
- Badge earned (card with badge image + context)
- Weekly summary (anonymized macro chart + days logged)
- Weight goal reached (card: "I lost 5kg with Fitsi AI!")
- Monthly wrap-up (Instagram story format: top foods, avg calories, streak, badge count)

**Share Card Design:**
- Branded template with Fitsi AI logo + app store link
- User's first name or username (configurable)
- Key stat prominently displayed
- QR code linking to app store listing
- Format: 1080x1920 (Instagram story), 1080x1080 (feed), 1200x628 (Twitter/X)

**Share Channels:**
- Instagram Stories (native share sheet)
- WhatsApp (key for LATAM market)
- Twitter/X
- Copy link
- Save to camera roll

### 5c. Groups & Community Features

**Groups (already implemented — optimize for retention):**
- Weekly group challenges (the group that logs the most meals wins)
- Group streak: everyone in the group must log to keep the group streak alive
- Group leaderboard: XP-based ranking among group members
- Group milestones: "Your group logged 500 meals together!"

**Social proof notifications (in-app, not push):**
- "{{count}} people logged breakfast in the last hour"
- "Your friend {{name}} just hit a 14-day streak!"
- "3 people in your group already logged lunch today"

---

## 6. RETENTION EXPERIMENTS ROADMAP

| # | Hypothesis | Metric | Variant | Expected Impact | Duration |
|---|-----------|--------|---------|----------------|----------|
| R1 | Streak freeze availability increases D7 retention | D7 retention | A: no freeze / B: 1 freeze per month | +3-5% D7 | 3 weeks |
| R2 | Achievement celebration animation increases next-day return | D1 retention after badge | A: toast only / B: full-screen animation | +8% next-day | 2 weeks |
| R3 | Weekly challenge participation increases WAU | WAU/MAU ratio | A: no challenges / B: weekly challenges | +5% WAU/MAU | 4 weeks |
| R4 | Personalized re-engagement push (with user's stats) outperforms generic | Re-engagement rate | A: generic copy / B: personalized with stats | +20% open rate | 3 weeks |
| R5 | Referral prompt after achievement vs. random timing | Referral share rate | A: random / B: post-achievement | +40% share rate | 4 weeks |
| R6 | Showing streak count on home screen increases streak maintenance | Avg streak length | A: no streak display / B: prominent streak | +2 days avg streak | 3 weeks |
| R7 | Email drip with GIF demo increases D3 reactivation | D3 email reactivation | A: text only / B: with GIF | +15% click rate | 2 weeks |
| R8 | Push at user's typical meal time vs. fixed schedule | Push open rate | A: fixed (08:30/13:00/20:00) / B: personalized | +25% open rate | 4 weeks |

---

## 7. RETENTION MONITORING DASHBOARD

### Daily Metrics (automated alerts if below threshold)

| Metric | Alert Threshold | Action |
|--------|----------------|--------|
| D1 retention | < 40% | Review onboarding completion funnel |
| Daily active users | -15% WoW | Check for bugs, outages, or store ranking drops |
| Meals logged per DAU | < 1.2 | Review push notification delivery + relevance |
| Streak break rate | > 30% of active streaks | Review streak-at-risk notification delivery |
| Push opt-out rate | > 2% per day | Audit notification frequency and content |
| Crash-free rate | < 99% | Engineering alert — hotfix required |

### Weekly Metrics

| Metric | How to Measure | Target |
|--------|---------------|--------|
| Cohort retention curves | D1/D3/D7/D14/D30 by signup week | Improving WoW |
| Feature adoption rate | % of WAU using each feature | > 20% for core features |
| Referral k-factor | Shares * conversion rate | > 0.3 |
| NPS (Net Promoter Score) | In-app survey at Day 14 and Day 60 | > 40 |
| Churn reason distribution | From feedback forms + exit surveys | Track top 3 reasons |
