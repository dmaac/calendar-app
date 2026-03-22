# Fitsi AI — Launch Checklist

> Last updated: 2026-03-22
> Target: Apple App Store + Google Play Store

---

## PRE-LAUNCH CHECKLIST

### App Store Assets

- [ ] **App Icon** — 1024x1024 PNG, no transparency, no rounded corners (Apple adds them)
- [ ] **Screenshots (iOS)** — 6.7" (iPhone 15 Pro Max), 6.5" (iPhone 14 Plus), 5.5" (iPhone 8 Plus), iPad Pro 12.9" (if universal)
  - Min 3, max 10 per device size
  - Recommended 5 screenshots per format:
    1. AI scan in action (hero shot)
    2. Daily calorie ring dashboard
    3. Meal log organized by meal type
    4. Water tracking + streak
    5. Personalized nutrition plan
- [ ] **Screenshots (Google Play)** — Min 2, max 8 per device type. 16:9 or 9:16 aspect ratio
- [ ] **App Preview Video (iOS)** — 15-30 seconds, shows AI scanning flow, dashboard, and key features
- [ ] **Promo Video (Google Play)** — YouTube link, 30s-2min, landscape preferred
- [ ] **Feature Graphic (Google Play)** — 1024x500 PNG or JPG (required)

### Store Listing Content

- [ ] **Title** — Finalized (EN: "Fitsi AI — Calorie Counter" / ES: "Fitsi IA: Cuenta Calorias con IA")
- [ ] **Subtitle (iOS)** — Finalized (EN: "Snap, Track & Lose Weight" / ES: "Escanea. Registra. Adelgaza.")
- [ ] **Keywords (iOS)** — 100 chars optimized, no spaces after commas
- [ ] **Short Description (Google Play)** — 80 chars finalized
- [ ] **Full Description** — Finalized for both EN and ES-419 localizations
- [ ] **Promotional Text (iOS)** — Written and ready for launch campaign
- [ ] **What's New** — v1.0 release notes written
- [ ] **Privacy Policy URL** — Hosted and accessible (required by both stores)
- [ ] **Terms of Service URL** — Hosted and accessible
- [ ] **Support URL** — Points to help page or email
- [ ] **Marketing URL** — Landing page ready (optional but recommended)

### Pricing & In-App Purchases

- [ ] **App Price** — Free (confirmed)
- [ ] **IAP Products Created** — fitsiai_monthly ($9.99/mo), fitsiai_annual ($59.99/yr)
- [ ] **Free Trial** — 7-day trial configured on both IAPs
- [ ] **Subscription Group** — Created in App Store Connect ("Fitsi AI Premium")
- [ ] **Price Points** — Verified across all target regions (currency conversion)
- [ ] **Introductory Offers** — Configured if applicable
- [ ] **RevenueCat** — Products synced, entitlements verified, sandbox tested

### Technical Readiness

- [ ] **TestFlight / Internal Testing** — At least 2 weeks of beta testing completed
- [ ] **Crash-free rate** — Above 99% in beta
- [ ] **API endpoints** — All production endpoints tested and stable
- [ ] **Performance** — App launch < 3s, AI scan < 10s, smooth scrolling 60fps
- [ ] **Deep links** — Configured and tested (onboarding, paywall, referral)
- [ ] **Push Notifications** — APNs + FCM configured and tested
- [ ] **Analytics** — Events tracking verified (see analytics-events.md)
- [ ] **Error monitoring** — Sentry/Crashlytics configured
- [ ] **Backend scaling** — Load tested for expected Day 1 traffic (see stress test results)

### Compliance & Legal

- [ ] **Age Rating** — 4+ (Apple) / Everyone (Google) — no mature content
- [ ] **App Privacy (Apple)** — Nutrition labels filled out in App Store Connect
- [ ] **Data Safety (Google Play)** — Data safety form completed
- [ ] **GDPR compliance** — Data export + account deletion implemented
- [ ] **Health data disclaimer** — "Not a medical device" disclaimer visible
- [ ] **Content rights** — All images, icons, fonts properly licensed

### Category & Discovery

- [ ] **Primary Category** — Health & Fitness
- [ ] **Secondary Category** — Food & Drink
- [ ] **Content Rating Questionnaire** — Completed in both stores

---

## DAY-1 CHECKLIST (Launch Day)

### Submission

- [ ] **Submit to Apple App Review** — Allow 24-48h review time. Submit 2-3 days before target launch
- [ ] **Submit to Google Play** — Review typically faster (hours to 1 day)
- [ ] **Release Type** — Manual release (so you control the exact launch moment)
- [ ] **Phased Release (iOS)** — Consider 7-day phased rollout for v1.0 to catch issues early
- [ ] **Staged Rollout (Google Play)** — Start at 20%, increase to 100% over 3 days

### Monitoring

- [ ] **Review status** — Check App Store Connect + Google Play Console every 2 hours
- [ ] **Rejection handling** — If rejected, address feedback immediately and resubmit
- [ ] **Backend monitoring** — Watch error rates, response times, database load
- [ ] **Crash monitoring** — Sentry/Crashlytics dashboard open and alerting
- [ ] **API rate limits** — Verify AI provider (OpenAI/Anthropic) rate limits won't be hit
- [ ] **Server auto-scaling** — Confirm scaling policies are active

### Communications

- [ ] **Press release / announcement** — Ready to publish when app goes live
- [ ] **Social media posts** — Scheduled for launch (Instagram, TikTok, Twitter/X)
- [ ] **Email to beta testers** — "We're live! Leave a review"
- [ ] **Product Hunt** — Listing prepared (if applicable)
- [ ] **Influencer outreach** — DMs/emails sent 1 week prior, follow up on launch day

### Reviews & Ratings

- [ ] **Review prompt (in-app)** — Triggers after 3rd successful AI scan (not before)
- [ ] **Monitor first reviews** — Respond to every review within 24h for first 2 weeks
- [ ] **5-star review template** — Ready for friends/family/beta users to post (never fake)
- [ ] **Negative review SOP** — Template responses for common complaints

### Analytics Baseline

- [ ] **Record Day-1 metrics:**
  - Installs
  - Onboarding completion rate
  - First meal scanned rate
  - Paywall view rate
  - Trial start rate
  - Crash-free rate

---

## WEEK-1 CHECKLIST (Days 2-7)

### ASO Adjustments

- [ ] **Check keyword rankings** — Are we indexing for target keywords?
- [ ] **Search visibility score** — Baseline recorded in AppTweak/Sensor Tower
- [ ] **Conversion rate** — Store listing page views vs. installs (target > 30%)
- [ ] **Screenshot performance** — If conversion < 25%, prepare A/B test variants
- [ ] **Subtitle A/B test** — Queue first variant if conversion is below target

### Funnel Analysis

- [ ] **Onboarding completion rate** — Target > 65%. If below, identify drop-off step
- [ ] **Activation rate** — % of users who scan first meal within 24h. Target > 40%
- [ ] **Day-1 retention** — Target > 45%
- [ ] **Day-3 retention** — Target > 30%
- [ ] **Day-7 retention** — Target > 20%
- [ ] **Paywall conversion** — Trial start rate. Target > 15% of paywall views
- [ ] **Trial-to-paid projection** — Early signal from trial engagement

### User Feedback

- [ ] **Common complaints** — Categorize and prioritize (bugs vs. feature requests vs. UX)
- [ ] **Respond to ALL reviews** — Especially negative ones. Show you're listening
- [ ] **Support tickets** — Track volume, response time < 4h
- [ ] **In-app feedback** — Review any submissions from Profile > Support

### Push Notification Activation

- [ ] **Day-1 welcome** — Sent automatically after onboarding
- [ ] **Day-2 nudge** — "Your first full day! Log breakfast to start your streak"
- [ ] **Day-3 habit formation** — "3 days in! You're building a healthy habit"
- [ ] **Lapsed user (Day 3)** — "We saved your plan — come back and scan a meal in 10 seconds"
- [ ] **Streak reminder** — Daily at user's meal times if no log by noon

### Quick Wins

- [ ] **Fix top 3 user-reported bugs** — Ship hotfix by Day 5
- [ ] **Update Promotional Text** — Reflect real user sentiment ("Join 1,000+ users...")
- [ ] **Update What's New** — If hotfix shipped
- [ ] **Social proof update** — Add real download numbers to description if impressive

### Growth Experiments to Queue

- [ ] **Experiment 1:** Onboarding length — test 20-step vs 30-step variant
- [ ] **Experiment 2:** Paywall timing — after onboarding vs. after first scan
- [ ] **Experiment 3:** Free scan limit — 3/day vs 5/day for free users
- [ ] **Experiment 4:** Push notification timing — meal-based vs. fixed schedule

---

## MONTH-1 TARGETS

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Installs | 5,000+ | Store Console |
| Onboarding completion | > 65% | Analytics |
| Day-1 retention | > 45% | Analytics |
| Day-7 retention | > 20% | Analytics |
| Day-30 retention | > 10% | Analytics |
| Trial start rate | > 15% of paywall views | RevenueCat |
| Trial-to-paid | > 50% | RevenueCat |
| Average rating | > 4.5 stars | Store Console |
| Crash-free rate | > 99.5% | Sentry/Crashlytics |
| Keyword top-10 rankings | 3+ primary keywords | AppTweak |

---

## TOOLS & SERVICES

| Purpose | Tool | Status |
|---------|------|--------|
| ASO tracking | AppTweak or Sensor Tower | [ ] Set up |
| Analytics | Mixpanel / Amplitude | [ ] Set up |
| Crash reporting | Sentry | [ ] Set up |
| Subscriptions | RevenueCat | [ ] Set up |
| Push notifications | OneSignal / Firebase | [ ] Set up |
| A/B testing | Statsig / LaunchDarkly | [ ] Set up |
| Review monitoring | AppFollow or AppBot | [ ] Set up |
| Store screenshots | Screenshots.pro or Figma | [ ] Set up |
