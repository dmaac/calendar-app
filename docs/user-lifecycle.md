# Fitsi AI — User Lifecycle Map

> Version: 1.0 | Last updated: 2026-03-22
> Cross-references: retention-strategy.md, monetization-strategy.md, push-strategy.md, aso-keywords.md, app-store-listing.md, analytics-events.md

---

## Lifecycle Overview

```
AWARENESS ──> DOWNLOAD ──> ONBOARDING ──> ACTIVATION ──> ENGAGEMENT
                                                             │
                                                             ▼
                          WIN-BACK <── CHURN <── RETENTION <─┘
                             │                      │
                             └──> (re-enter          ▼
                                  Engagement)    MONETIZATION
                                                    │
                                                    ▼
                                                ADVOCACY
                                                    │
                                                    └──> (drives new AWARENESS)
```

---

## STAGE 1: AWARENESS

> The user discovers Fitsi AI exists. They have a problem (track food, lose weight, eat healthier) but haven't decided on a solution yet.

### User Actions
- Searches "calorie counter app" or "AI food scanner" in App Store / Google Play
- Sees a TikTok/Instagram ad or influencer post about AI food scanning
- Reads a blog article or app comparison ("best calorie counting apps 2026")
- Hears about Fitsi AI from a friend (word of mouth / referral link)
- Sees Fitsi AI in an App Store "Apps We Love" or featured list

### App Touchpoints
- App Store listing (title, icon, screenshots, preview video)
- Landing page / website (if applicable)
- Social media ads (Meta, TikTok, Google UAC)
- Influencer content (sponsored posts, reviews)
- Referral deep links shared by existing users

### Key Metrics

| Metric | Definition | Target |
|--------|-----------|--------|
| Impressions | Times the app listing or ad was seen | 100K/month (launch) |
| Reach | Unique users who saw the app | 60K/month |
| CTR (Click-Through Rate) | Clicks / Impressions | > 3% (organic search), > 1.5% (paid ads) |
| CPM (Cost Per Mille) | Cost per 1,000 ad impressions | < $8 (Meta), < $5 (TikTok) |
| Search ranking (ASO) | Position for primary keywords | Top 10 for 3+ primary keywords within 90 days |
| Brand search volume | Direct searches for "Fitsi AI" | Growing MoM |

### Company Actions
- **ASO:** Optimize title, subtitle, keywords, screenshots, preview video (see aso-keywords.md)
- **Paid Acquisition:** Run Meta + TikTok + Google UAC campaigns targeting health/fitness/diet interests
- **Content Marketing:** Publish "AI calorie counting" articles, YouTube tutorials, TikTok demos
- **Influencer Marketing:** Partner with 10-20 micro-influencers (10K-100K followers) in fitness/nutrition niche
- **PR:** Pitch to tech + health media for launch coverage
- **ASO A/B Testing:** Test screenshot variants, subtitle copy, icon designs monthly

---

## STAGE 2: DOWNLOAD

> The user decides to install the app. The store listing convinced them enough to tap "Get" / "Install."

### User Actions
- Views the App Store / Google Play listing
- Reads description, reviews, and screenshots
- Compares with competing apps (MFP, Cal AI, Lose It)
- Taps "Get" (iOS) or "Install" (Android)
- Waits for download + opens app for the first time

### App Touchpoints
- App Store listing page (full description, screenshots, ratings, reviews)
- App icon on home screen after install
- First launch splash screen

### Key Metrics

| Metric | Definition | Target |
|--------|-----------|--------|
| Store page views | Users who viewed the listing | — (baseline) |
| Install rate (CVR) | Installs / Store page views | > 30% (organic), > 8% (paid) |
| CPI (Cost Per Install) | Ad spend / Installs | < $2.50 (LATAM), < $4.00 (US) |
| Installs | Total downloads | 5,000+ Month 1, growing 15-20% MoM |
| Install-to-open rate | Users who open app / Installs | > 85% |
| Time to first open | How long between install and first launch | < 24 hours for 70%+ |
| Organic vs. Paid split | % of installs from organic search vs. paid | Target > 50% organic by Month 6 |

### Company Actions
- **Optimize listing CVR:** A/B test screenshots (first 3 are critical), preview video, description copy
- **Review management:** Respond to every review in first 2 weeks. Maintain > 4.5 stars
- **Localization:** Separate listings for EN (US/UK/AU) and ES-419 (LATAM)
- **Social proof in listing:** "50,000+ meals scanned" / "Join thousands tracking smarter"
- **Competitor monitoring:** Track competitor keyword rankings and listing changes weekly
- **Attribution tracking:** Branch.io / Firebase Dynamic Links to measure channel effectiveness

---

## STAGE 3: ONBOARDING

> The user goes through the 30-step onboarding flow. This is where personalization happens and perceived value is built before any paywall.

### User Actions
- Views splash + welcome screens (Steps 1-2)
- Enters personal data: gender, workouts, height, weight, birthday (Steps 3-9)
- Sets goals: lose/maintain/gain, target weight, speed (Steps 10-13)
- Selects preferences: pain points, diet type, accomplishments (Steps 15-17)
- Views social proof, progress charts, trust screens (Steps 7, 14, 18-19, 21-22)
- Connects health apps, enables notifications, enters referral code (Steps 20, 23-24)
- Creates account (Step 25)
- Views personalized plan being built + plan ready (Steps 26-27)
- Encounters paywall (Step 28) or spin-the-wheel discount (Steps 29-30)

### App Touchpoints
- 30 onboarding screens (mobile/src/screens/onboarding/)
- Progress bar at top of every step
- Personalized plan calculation (calorie + macro targets)
- Account creation (email / Apple / Google sign-in)
- Primary paywall + discount paywall
- Fitsi mascot animations throughout

### Key Metrics

| Metric | Definition | Target |
|--------|-----------|--------|
| Onboarding start rate | Users who pass Step 1 / Users who opened app | > 95% |
| Step-by-step drop-off | % who leave at each step | No step loses > 8% |
| Account creation rate | Users who create account / Users who started onboarding | > 75% |
| Onboarding completion rate | Users who reach Step 27 / Installs | > 65% |
| Avg time to complete | Minutes from Step 1 to Step 27 | 4-6 minutes |
| Paywall view rate | Users who see Step 28 / Onboarding completers | > 95% |
| Trial start rate (onboarding) | Trial starts from paywall / Paywall views | > 10% |
| Spin-wheel conversion | Trial starts from Step 29-30 / Users who declined Step 28 | > 8% |

### Company Actions
- **Monitor step-by-step funnel:** Identify and fix any step with > 8% drop-off
- **A/B test onboarding length:** Test 20-step vs 30-step variant (experiment R1 in retention-strategy.md)
- **Optimize account creation:** Test Apple/Google first vs. email first
- **Paywall timing experiment:** Test paywall after onboarding vs. after first scan (experiment PW1 in monetization-strategy.md)
- **Personalization depth:** The more data collected, the more invested the user feels — but each step must feel fast and purposeful
- **Mascot engagement:** Fitsi expressions change contextually to maintain delight

---

## STAGE 4: ACTIVATION

> The user performs the core value action for the first time: scanning a meal with AI. This is the "aha moment" that separates users who understand the product from those who don't.

### User Actions
- Lands on Home screen for the first time
- Takes a photo of their first meal
- Receives AI-powered calorie and macro analysis
- Sees the result logged on their daily dashboard
- Calorie ring updates in real time
- (Optional) Logs water, explores other features

### App Touchpoints
- Home screen (calorie ring, meal cards, quick actions)
- AI scan camera screen
- Scan results overlay (food identified, macros displayed)
- Daily dashboard update
- First-scan celebration (Fitsi mascot animation)
- Tooltip: "Great! Your first meal is logged. Try scanning lunch later."

### Key Metrics

| Metric | Definition | Target |
|--------|-----------|--------|
| First scan rate | % of onboarding completers who scan a meal | > 50% within 24h |
| Time to first scan | Hours between onboarding completion and first AI scan | < 4 hours (median) |
| First scan success rate | % of first scans that return accurate results (user doesn't edit) | > 80% |
| Meals logged Day 0 | Avg meals logged on signup day | > 1.2 |
| Feature discovery D0 | % who interact with 2+ features on Day 0 | > 30% |
| Activation rate | Users who scan at least 1 meal in first 48h / Installs | > 40% |

### Company Actions
- **Reduce time-to-value:** After onboarding, deep link directly to scan screen with prompt: "Scan your first meal now!"
- **First-scan experience:** Ensure AI response is fast (< 8s), accurate, and visually impressive
- **Guided first session:** Subtle tooltip tour of Home screen (calorie ring, meal slots, water tracker)
- **Welcome push (Day 0, +2h):** "Your plan is ready! Scan your first meal in 10 seconds"
- **Welcome email:** Sent immediately with plan summary + "Log Your First Meal" CTA
- **Fallback (no scan by Day 1):** Push: "Just point your camera at what you're eating — AI does the rest"
- **Track activation cohorts:** Users who activate in < 4h retain 2-3x better at D7

---

## STAGE 5: ENGAGEMENT

> The user returns regularly and builds a meal-logging habit. They explore features beyond the basic scan. This is the habit formation stage (Days 3-30).

### User Actions
- Logs meals daily (breakfast, lunch, dinner, snacks)
- Checks calorie ring and macro bars throughout the day
- Tracks water intake
- Maintains and grows their streak
- Explores secondary features: barcode scanner, AI coach, recipes, progress photos
- Views weekly summary report
- Earns first badges and achievements
- Participates in weekly challenges (when available)

### App Touchpoints
- Home screen (daily hub — calorie ring, meals, water, streak)
- Scan screen (AI camera + barcode)
- Log screen (meal history, manual entry)
- Progress tab (weight chart, progress photos, trends)
- Coach tab (AI nutrition Q&A)
- Recipes tab (AI-suggested meals based on remaining macros)
- Groups tab (community challenges)
- Achievements screen (badges, streak milestones)
- Push notifications (meal reminders, streak alerts, celebrations)
- Weekly summary notification + report

### Key Metrics

| Metric | Definition | Target |
|--------|-----------|--------|
| DAU / MAU (Stickiness) | Daily active / Monthly active | > 20% |
| Meals logged per active user per week | Core engagement metric (North Star) | > 14 (2/day) |
| Sessions per day | Average app opens per active user | > 2.5 |
| Avg session duration | Time spent per session | 2-4 minutes |
| Feature breadth | Avg features used per WAU (scan, log, water, coach, recipes, progress) | > 3 features |
| Streak length (avg) | Average current streak across active users | > 7 days |
| Weekly challenge participation | % of WAU who attempt the weekly challenge | > 25% |
| Push open rate | Opens / Delivered (across all templates) | > 15% (utility), > 8% (promo) |
| D7 retention | % of cohort returning on Day 7 | > 20% |

### Company Actions
- **Push notification sequences:** Meal reminders, streak-at-risk, milestones (see push-strategy.md)
- **Feature discovery drip:** Introduce 1 new feature per week via in-app tooltip or push
- **Gamification:** Streaks, badges, weekly challenges, XP system (see retention-strategy.md Section 4)
- **Personalized insights:** "You eat 30% more carbs on weekends" — surfaces at D14+
- **Social features:** Enable group creation, friend invites, shared challenges
- **Content freshness:** Rotate weekly challenges, add seasonal recipes, update AI coach knowledge
- **Engagement experiments:** Test notification timing, challenge formats, reward types

---

## STAGE 6: MONETIZATION

> The user converts from free to paid. This can happen at any point but has key trigger moments.

### User Actions
- Hits daily AI scan limit (3 free/day) and sees upgrade prompt
- Encounters a locked Premium feature (recipes, micronutrients, PDF reports)
- Receives upgrade nudge push/email after demonstrating high engagement
- Views paywall — compares free vs. Premium features
- Starts 7-day free trial
- Uses Premium features during trial
- Trial expires — decides to pay or revert to free
- Selects monthly ($9.99) or annual ($59.99) plan
- (Optional) Upgrades from monthly to annual later

### App Touchpoints
- Onboarding paywall (Step 28) — highest conversion moment
- Spin-the-wheel discount paywall (Steps 29-30)
- Scan limit paywall ("Upgrade for unlimited AI scans")
- Feature gate paywalls (blurred preview of locked feature)
- Settings > Subscription management
- Trial expiry screen (value recap + urgency)
- In-app banner: "Your trial ends in 2 days"
- Win-back paywall (for returning lapsed users)

### Key Metrics

| Metric | Definition | Target |
|--------|-----------|--------|
| Paywall view rate | Unique users who see any paywall / MAU | > 40% |
| Trial start rate | Trial starts / Paywall views | > 10% overall, > 12% onboarding |
| Trial-to-paid conversion | Paid subs / Expired trials | > 50% |
| Free-to-paid conversion | Paying users / Total installs (lifetime) | > 5% |
| ARPU (paying users) | Revenue / Paying users / Month | > $7.00 (blended) |
| Annual plan mix | % of subs on annual plan | > 65% |
| MRR | Monthly Recurring Revenue | Growing >10% MoM |
| LTV (Lifetime Value) | Revenue per user over subscription lifetime | $95 (blended) |
| LTV:CAC ratio | LTV / Customer Acquisition Cost | > 3:1 |
| Payback period | Months to recover CAC from subscription revenue | < 2 months |

### Company Actions
- **Paywall optimization:** A/B test placement, design, copy, pricing (see monetization-strategy.md Section 3)
- **Trial engagement tracking:** Monitor milestones that predict conversion (first scan, 3+ features, streak)
- **Pre-conversion nudges:** Day 5 of trial — "Your trial ends in 2 days. Keep your data."
- **Post-trial grace period:** 1 free scan/day for 3 days after trial ends
- **Annual upsell for monthly:** "Switch to annual and save 50%"
- **Pricing experiments:** Test $7.99 / $9.99 / $12.99 monthly (see monetization-strategy.md Section 1)
- **Seasonal promotions:** New Year 50% off, Black Friday 60% off (see monetization-strategy.md Section 6)
- **RevenueCat analytics:** Track trial funnel, renewal rates, MRR, churn by cohort

---

## STAGE 7: RETENTION

> The user stays active month after month. The product is embedded in their daily routine.

### User Actions
- Logs meals consistently (habitual behavior, not conscious effort)
- Checks progress weekly/monthly
- Updates weight, adjusts goals as they progress
- Uses Premium features regularly (recipes, insights, AI coach)
- Renews subscription (monthly auto-renew or annual renewal)
- Achieves long streaks (30, 60, 90+ days)
- Collects badges, levels up in XP system
- Adapts to new features as they launch

### App Touchpoints
- All daily-use screens (Home, Scan, Log, Progress)
- Monthly progress emails
- Weekly summary push notifications
- Streak milestone celebrations
- Goal adjustment prompts ("You've lost 3kg! Update your target?")
- Annual renewal reminder (14 days before)
- Value recap email before renewal

### Key Metrics

| Metric | Definition | Target |
|--------|-----------|--------|
| D30 retention | % of cohort returning on Day 30 | > 10% |
| D90 retention | % of cohort returning on Day 90 | > 6% |
| Monthly churn rate (subscribers) | Cancelled subs / Active subs per month | < 8% |
| Annual renewal rate | % of annual subs who renew | > 55% |
| NPS (Net Promoter Score) | Survey score (-100 to +100) | > 40 |
| Avg subscription lifetime | 1 / monthly churn rate | > 8 months |
| Feature retention | % of users still using a feature 30 days after discovery | > 40% for core features |
| Support ticket volume | Tickets per 1,000 MAU | < 15 |

### Company Actions
- **Churn prediction model:** Score users 0-100 based on engagement signals (see monetization-strategy.md Section 5)
- **Pre-churn intervention:** Personalized re-engagement when risk score > 60
- **Monthly value emails:** "This month: X meals logged, Y days tracked, avg Z kcal"
- **Goal evolution:** Prompt users who reach their target to set new goals (maintenance mode)
- **Feature releases:** Ship new value every 2-4 weeks to keep the product fresh
- **Renewal experience:** Value recap before renewal, transparent billing, grace period for payment failures
- **Dunning management:** RevenueCat retry billing up to 4 times over 7 days
- **Community building:** Groups, shared challenges, leaderboards to create social lock-in

---

## STAGE 8: ADVOCACY

> The user becomes a promoter. They actively recommend Fitsi AI to others, generating organic growth.

### User Actions
- Shares meal scans, progress, or achievements on social media
- Tells friends/family about the app (word of mouth)
- Shares referral code or deep link
- Leaves a positive App Store / Google Play review
- Participates in community groups and helps other users
- Creates user-generated content (meal photos tagged with #FitsiAI)
- Responds to the in-app NPS survey as a Promoter (9-10)

### App Touchpoints
- Share cards (streak milestones, badges, weekly summaries, weight goals)
- Referral screen (code + deep link + share button)
- In-app review prompt (triggers after 3rd successful scan, configurable)
- Social sharing buttons on achievements and progress reports
- Monthly wrap-up card (Instagram story format)
- Group invite system
- NPS survey (Day 14, Day 60)

### Key Metrics

| Metric | Definition | Target |
|--------|-----------|--------|
| NPS | Promoters (9-10) minus Detractors (0-6) as % | > 40 |
| Referral share rate | % of users who share referral code at least once | > 15% |
| Referral conversion rate | Installs from referral links / Total shares | > 20% |
| Viral coefficient (k-factor) | Avg invites sent per user * conversion rate | > 0.3 |
| App Store rating | Average star rating | > 4.5 |
| Review volume | New reviews per month | > 50/month |
| Social shares | Achievement/progress cards shared per month | Growing MoM |
| UGC volume | User-generated posts with #FitsiAI or brand mention | Growing MoM |

### Company Actions
- **Referral program:** Double-sided rewards — referrer gets 1 week Premium, referred gets 3 extra scans (see retention-strategy.md Section 5a)
- **Share triggers at high-emotion moments:** After streak milestones, badge earned, weight goal reached, great weekly report
- **Review prompts at right time:** After 3rd successful scan (not before). Never prompt unhappy users (check recent crash/error events)
- **Social card design:** Branded, beautiful, auto-generated with user stats + QR code + app store link
- **Ambassador program (Month 6+):** Identify power users (90+ day streak, 5+ referrals) and offer exclusive perks
- **UGC re-sharing:** Feature user posts on brand social channels (with permission)
- **Community moderation:** Keep groups positive and supportive to encourage participation

---

## STAGE 9: CHURN

> The user stops using the app and/or cancels their subscription.

### User Actions
- Stops logging meals (gradual disengagement over 5-14 days)
- Ignores push notifications
- Cancels subscription (voluntary churn)
- Payment method fails and is not updated (involuntary churn)
- Deletes the app
- (In some cases) Switches to a competitor

### App Touchpoints
- Cancellation flow (settings > subscription > cancel)
- Exit survey: "Why are you leaving? [Not useful / Too expensive / Found alternative / Achieved goal / Other]"
- "Are you sure?" screen with value recap before confirming cancellation
- Downgrade option: "Pause for 1 month instead of cancelling?"
- Final screen: "Your data is saved. You can come back anytime."

### Key Metrics

| Metric | Definition | Target (lower = better) |
|--------|-----------|------------------------|
| Monthly subscriber churn | Cancelled subs / Active subs | < 8% |
| Voluntary churn | User-initiated cancellations / Active subs | < 6% |
| Involuntary churn | Payment failures not recovered / Active subs | < 2% |
| Churn reason distribution | Top reasons from exit survey | Track top 3 |
| Time to churn | Avg days from signup to cancellation | > 90 days |
| Reactivation rate | Churned users who return within 60 days | > 10% |
| App deletion rate | Users who uninstall / MAU | < 5% |

### Company Actions
- **Exit survey:** Mandatory 1-question survey before cancellation confirms. Feed into product roadmap
- **Cancellation friction (ethical):** Show value recap + downgrade/pause options. Never make it hard to actually cancel
- **Pause option:** "Take a 1-month break. Your data and streak history stay safe."
- **Downgrade path:** Revert to free tier instead of full cancellation. User keeps data + basic features
- **Involuntary churn prevention:** Dunning emails Day 1, 3, 5, 7 after payment failure. 7-day grace period
- **Churn cohort analysis:** Weekly review of churn by signup month, acquisition channel, plan type, engagement level
- **Product fixes:** If "not useful" or "too complicated" are top churn reasons, prioritize UX improvements
- **Competitive analysis:** If "found alternative" is trending, audit competitor features and pricing

---

## STAGE 10: WIN-BACK

> The user is re-engaged after churning. The goal is to bring them back with improved value or a compelling offer.

### User Actions
- Receives a win-back email with personal stats recap
- Receives a win-back push notification (if not uninstalled)
- Clicks a re-engagement deep link
- Re-opens the app after a period of inactivity
- Sees a "Welcome Back" experience
- (Optional) Accepts a win-back discount offer
- Re-starts subscription or returns to free tier

### App Touchpoints
- Win-back push notifications (Day 3, 7, 14 — see retention-strategy.md Section 3)
- Win-back emails (Day 3, 9, 14, 21, 30, 60)
- "Welcome Back" modal on app re-open (shows what they missed + new features)
- Win-back paywall with special offer (30-50% off, or 1 month free)
- Re-onboarding: "Want to update your goals?" (quick 3-step refresh, not full 30 steps)
- Streak restart encouragement: "Start a new streak today!"

### Key Metrics

| Metric | Definition | Target |
|--------|-----------|--------|
| Win-back email open rate | Opens / Delivered (win-back segment) | > 25% |
| Win-back email click rate | Clicks / Opens | > 10% |
| Reactivation rate (At Risk, 3-6d) | Returned / Targeted | > 15% |
| Reactivation rate (Lapsed, 7-13d) | Returned / Targeted | > 8% |
| Reactivation rate (Dormant, 14-29d) | Returned / Targeted | > 3% |
| Reactivation rate (Churned, 30+d) | Returned / Targeted | > 2% |
| Win-back discount acceptance | Accepted offer / Saw offer | > 12% |
| Re-activated D7 retention | % of re-activated users active 7 days later | > 35% |
| Win-back LTV | LTV of re-activated users vs. new users | > 70% of new user LTV |

### Company Actions
- **Tiered re-engagement:** Escalating offers by inactivity duration (see retention-strategy.md Section 3)
  - At Risk (3-6d): gentle push reminders
  - Lapsed (7-13d): email with stats recap + push
  - Dormant (14-29d): email with "what you achieved" + last push attempt
  - Churned (30+d): email only with discount offer
  - After 60 days: final email, then suppression list
- **Win-back offers:**
  - Cancelled < 7d: 30% off next month
  - Cancelled 7-30d: 50% off next month
  - Cancelled 30+d: 1 month free
  - Lapsed annual: 40% off renewal
- **Welcome Back experience:** Never restart from scratch. Show their history, plan, and progress
- **Re-onboarding:** Quick 3-step goal refresh (not full 30 steps): "Has anything changed? Update your weight, goal, or activity level"
- **New feature highlight:** If significant features launched since they left, showcase them
- **Attribution:** Track which win-back channel/offer drove the return for optimization
- **Suppression:** Stop all outreach after 60 days of no response. Respect the user's decision

---

---

## NUMERICAL FUNNEL EXAMPLE (Month 6 Projection)

> Based on targets defined above and revenue model from monetization-strategy.md.

```
                                                          Conversion
Stage                              Users     Rate          (from prev)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

AWARENESS
  Ad impressions                   100,000    —             —
  Store page views (organic+paid)   35,000    35.0%         impressions → page views

DOWNLOAD
  Installs                          10,000    28.6%         page views → installs

ONBOARDING
  Started onboarding                 9,500    95.0%         installs → started
  Account created                    7,500    78.9%         started → account
  Completed onboarding               7,000    93.3%         account → completed
  Saw paywall                        6,650    95.0%         completed → paywall view

ACTIVATION
  First AI scan (within 48h)         4,000    57.1%         completed → scanned
  Logged 2+ meals Day 0              2,800    40.0%         completed → activated

ENGAGEMENT
  Active Day 3                       3,000    42.9%         completed → D3 active
  Active Day 7                       2,100    30.0%         completed → D7 active
  Active Day 14                      1,400    20.0%         completed → D14 active

MONETIZATION
  Trial started (all touchpoints)    1,050    15.0%         completed → trial
    From onboarding paywall            665    10.0%         paywall views → trial
    From scan limit paywall            250    —             D3+ free users
    From feature gates                 100    —             D7+ free users
    From other touchpoints              35    —             misc
  Trial-to-paid conversion             525    50.0%         trials → paid
  Active subscribers (Month 6)       2,308    —             (see monetization-strategy.md)
    Monthly plan (~30%)                692    —
    Annual plan (~70%)               1,616    —

RETENTION
  D30 active users                     700    10.0%         completed → D30
  D90 active users                     420     6.0%         completed → D90
  Monthly subscriber churn              8%    —             per month
  Annual renewal rate                  55%    —

ADVOCACY
  Shared referral code                 450    ~6.4%         completed → shared
  Referral installs                     90    20.0%         shares → installs
  App Store reviews written            120    ~1.7%         completed → reviewed
  Average rating                      4.6★    —

CHURN
  Churned subscribers (monthly)        185    8.0%          of active subs
  Involuntary churn                     46    2.0%          of active subs
  Voluntary churn                      139    6.0%          of active subs
  Top reason: "Not using enough"       ~35%   —

WIN-BACK
  Re-engagement attempts               185    100%          of churned
  Successfully reactivated              22    12.0%         of attempts
  Accepted win-back offer               10    ~5.4%         of attempts
  Re-activated D7 retention              8    35.0%         of reactivated

REVENUE (Month 6)
  MRR                            $16,156    —             (see monetization-strategy.md)
  ARR run-rate                  $193,872    —
  Blended ARPU                    $7.00    —
  LTV (blended)                   $94.88    —
  LTV:CAC (target)                 3:1+    —
```

---

## FUNNEL LEAKAGE — BIGGEST OPPORTUNITIES

| Drop-off Point | Current Rate | Leakage | Highest-Impact Fix |
|---------------|-------------|---------|-------------------|
| Impressions → Install | 10.0% | 90K users lost | Better screenshots + preview video. Test icon variants |
| Install → Onboarding complete | 70.0% | 3K users lost | Reduce onboarding steps (test 20 vs 30). Fix any step with >8% drop |
| Onboarding → First scan (48h) | 57.1% | 3K users lost | Auto-redirect to scan after onboarding. Stronger Day 0 push sequence |
| D7 active → D30 active | 33.3% | 1.4K users lost | Gamification (streaks, challenges, badges). Personalized insights at D14 |
| Paywall view → Trial start | 10.0% | 5.6K users lost | A/B test paywall design, social proof, pricing. Test "most popular" badge on annual |
| Trial → Paid | 50.0% | 525 users lost | Day 5 pre-expiry nudge. Post-trial grace period (1 scan/day for 3 days) |
| Monthly renewal | 92.0% (8% churn) | 185 subs/month | Churn prediction model + intervention. Monthly value recap emails |

---

## LIFECYCLE AUTOMATION MAP

> Which system handles each lifecycle touchpoint.

| Lifecycle Stage | Push (OneSignal/FCM) | Email (SendGrid/Resend) | In-App | Analytics | RevenueCat |
|----------------|---------------------|------------------------|--------|-----------|------------|
| Awareness | — | — | — | Attribution tracking | — |
| Download | — | — | — | Install event | — |
| Onboarding | Permission prompt (Step 23) | — | 30-step flow | Step completion events | — |
| Activation | Day 0 welcome, Day 1 nudge | Welcome email | First-scan celebration | Scan events, activation | — |
| Engagement | Meal reminders, streak alerts | — | Challenges, badges, insights | All engagement events | — |
| Monetization | Scan limit nudge, trial reminder | Day 14 upgrade email | Paywall screens | Paywall + trial events | Trial, subscription |
| Retention | Weekly summary, milestones | Monthly progress email | Goal updates, new features | Retention cohorts | Renewal tracking |
| Advocacy | — | — | Share cards, referral screen, review prompt | Share + referral events | — |
| Churn | — | — | Exit survey, pause/downgrade | Churn events + reasons | Cancellation, dunning |
| Win-back | Day 3, 7, 14 re-engagement | Day 9, 14, 21, 30, 60 | Welcome back modal | Reactivation events | Win-back offers |

---

## CROSS-REFERENCE INDEX

| Topic | Detailed In |
|-------|------------|
| Push notification templates + payload | push-strategy.md |
| ASO keywords + store listing | aso-keywords.md, app-store-listing.md |
| Retention mechanics (streaks, badges, gamification) | retention-strategy.md Section 4 |
| Email drip sequences | retention-strategy.md Section 2 |
| Re-engagement campaigns by tier | retention-strategy.md Section 3 |
| Pricing, LTV, revenue model | monetization-strategy.md Sections 1, 4 |
| Paywall strategy + A/B tests | monetization-strategy.md Section 3 |
| Churn reduction tactics | monetization-strategy.md Section 5 |
| Analytics event definitions | analytics-events.md |
| Launch timeline | launch-checklist.md |
