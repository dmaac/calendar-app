# Fitsi AI — Monetization Strategy

> Version: 1.0 | Last updated: 2026-03-22
> Model: Freemium with subscription (monthly + annual) + one-time offers
> Complements: retention-strategy.md, app-store-listing.md

---

## 1. PRICING TIERS ANALYSIS

### Current Pricing

| Plan | Price | Price/Month | Annual Savings | Free Trial |
|------|-------|-------------|----------------|------------|
| Free | $0 | — | — | — |
| Monthly | $9.99/mo | $9.99 | — | 7 days |
| Annual | $59.99/yr | $5.00 | 50% vs monthly | 7 days |

### Free vs. Premium Feature Matrix

| Feature | Free | Premium |
|---------|------|---------|
| AI food scans | 3/day | Unlimited |
| Manual food logging | Unlimited | Unlimited |
| Barcode scanner | 5/day | Unlimited |
| Daily calorie dashboard | Yes | Yes |
| Macro tracking (P/C/F) | Yes | Yes |
| Water tracking | Yes | Yes |
| Streak system | Yes | Yes |
| Weekly summary | Basic | Detailed with trends |
| Micronutrient analysis | No | Yes |
| AI-powered recipes | No | Yes |
| AI Coach chat | 3 messages/day | Unlimited |
| Progress predictions | No | Yes |
| Apple Health / Google Fit | No | Yes |
| Progress photos | 1/week | Unlimited |
| PDF reports | No | Yes |
| Custom meal reminders | No | Yes |
| Premium food database | No | Yes |
| Ad-free experience | No | Yes |
| Streak freezes | 1/month | 2/month |

### Competitive Pricing Landscape

| App | Monthly | Annual | Annual/Mo | Free Tier |
|-----|---------|--------|-----------|-----------|
| MyFitnessPal | $19.99 | $79.99 | $6.67 | Generous — basic tracking free |
| Lose It! | $19.99 | $39.99 | $3.33 | Moderate — calorie tracking free |
| Cal AI | $19.99 | $69.99 | $5.83 | Limited — 3 scans/day |
| YAZIO | $9.99 | $29.99 | $2.50 | Moderate |
| Noom | $59.00 | $209.00 | $17.42 | Very limited — mostly coaching |
| Cronometer | $9.99 | $49.99 | $4.17 | Moderate |
| **Fitsi AI** | **$9.99** | **$59.99** | **$5.00** | **Moderate — 3 AI scans/day** |

### Pricing Analysis

**Current positioning:** Mid-market. Lower than MFP and Cal AI monthly, competitive annually. This is correct for a new entrant.

**Recommendation:** Keep current pricing for launch. The $9.99 monthly price is psychologically important — it's the "impulse subscription" threshold. The annual at $59.99 represents genuine savings (50%) and incentivizes commitment.

### Pricing Experiments to Run (Post-Launch)

| # | Experiment | Variants | Metric | Duration |
|---|-----------|----------|--------|----------|
| P1 | Monthly price sensitivity | A: $9.99 / B: $12.99 / C: $7.99 | Trial start rate + revenue/user | 4 weeks |
| P2 | Annual price anchoring | A: $59.99 / B: $49.99 / C: $69.99 | Annual plan selection rate | 4 weeks |
| P3 | Annual savings framing | A: "Save 50%" / B: "$5/mo" / C: "Save $60/year" | Annual plan selection rate | 3 weeks |
| P4 | Free scan limit | A: 3/day / B: 5/day / C: 1/day | Conversion rate + D7 retention | 4 weeks |
| P5 | Lifetime offer | A: no lifetime / B: $149.99 one-time | Revenue per user, churn | 6 weeks |

---

## 2. TRIAL LENGTH OPTIMIZATION

### Current: 7-Day Free Trial

**Why 7 days works:**
- Enough time to form a basic logging habit (research shows 3-7 days for micro-habits)
- User experiences 1 full weekly report cycle
- Long enough to demonstrate AI scanner value
- Short enough to create urgency

### Trial Length Experiment

| Variant | Length | Hypothesis | Risk |
|---------|--------|-----------|------|
| A (control) | 7 days | Balanced habit formation + urgency | — |
| B | 3 days | Higher urgency, faster conversion decision | Users may not see enough value, lower conversion |
| C | 14 days | Deeper habit, harder to cancel | Lower urgency, users forget they're in trial |
| D | 7 days + 7-day extension offer | "Invite a friend for 7 more days" | Adds viral loop but adds complexity |

**Recommendation:** Start with 7 days. After 2,000+ trial starts, run A/B test between 7 and 14 days. Measure:
- Trial-to-paid conversion rate (target: >50% for 7-day, >40% for 14-day)
- Revenue per trial start (accounts for both conversion rate AND retention)
- D30 retention of converted users (longer trials may yield stickier subscribers)

### Trial Engagement Milestones (trigger conversion confidence)

Track these during trial to predict conversion:

| Milestone | Day | Correlation to Conversion |
|-----------|-----|--------------------------|
| First AI scan | Day 0-1 | High — users who scan D0 convert 3x more |
| 3 meals logged | Day 1-2 | High |
| Viewed weekly report | Day 7 | Medium |
| Used 3+ features | Any | Very High — multi-feature users convert 4x |
| Hit daily calorie goal | Any | Medium |
| Streak of 3+ days | Day 3+ | High |

**Pre-Conversion Nudge:** On Day 5 of trial, if user has hit 3+ milestones:
- In-app banner: "Your trial ends in 2 days. Keep your data and progress — subscribe now."
- Push: "Your AI scans, streak, and history are safe with Premium. Trial ends {{date}}."

**Post-Trial Grace Period:**
- When trial expires, show a "Your trial ended" screen with:
  - Summary of what they accomplished during trial
  - What they'll lose (unlimited scans, recipes, insights)
  - Special offer: "Subscribe in the next 24 hours and get your first month at $7.99"
- Allow 1 free scan per day for 3 days after trial ends (taste of loss, not complete cutoff)

---

## 3. PAYWALL PLACEMENT STRATEGY

### Primary Paywall Touchpoints

| # | Location | Trigger | Type | Priority |
|---|----------|---------|------|----------|
| 1 | End of onboarding (Step28) | Completed onboarding | Hard paywall (can skip) | P0 — highest conversion |
| 2 | Spin-the-wheel discount (Step29-30) | Declined Step28 | Gamified discount paywall | P0 |
| 3 | AI scan limit hit | 4th scan attempt (free users) | Soft paywall — "Upgrade for unlimited" | P0 |
| 4 | Feature gate | Tap locked feature (recipes, insights, etc.) | Contextual paywall | P1 |
| 5 | Weekly report | View detailed weekly report (free gets basic) | Contextual — "Unlock full report" | P1 |
| 6 | Settings / subscription page | Manual visit | Informational paywall | P2 |
| 7 | Re-engagement return | Lapsed user returns after 7+ days | Win-back offer | P1 |

### Paywall Design Principles

1. **Always show value before the wall.** The user should have experienced the AI scanner at least once before seeing any paywall.
2. **The onboarding paywall is the highest-converting moment.** Users are most invested after 30 steps of personalization. Show plan summary + what Premium adds.
3. **Scan limit paywalls should feel helpful, not punitive.** "You've used your 3 free scans today! Upgrade for unlimited, or come back tomorrow."
4. **Feature gates should preview, not just block.** Show a blurred/partial version of what they'd get (e.g., blurred micronutrient chart).
5. **Never paywall core functionality.** Manual food logging, basic dashboard, and water tracking must remain free forever.

### Paywall Conversion Funnel

```
Users who see paywall (100%)
    │
    ├── Onboarding paywall: ~60% of new users see it
    │   └── Expected conversion: 8-12% start trial
    │
    ├── Scan limit paywall: ~40% of D3+ free users
    │   └── Expected conversion: 5-8% start trial
    │
    ├── Feature gate paywall: ~20% of D7+ free users
    │   └── Expected conversion: 3-5% start trial
    │
    └── Win-back paywall: ~10% of returned lapsed users
        └── Expected conversion: 10-15% start trial (high intent)
```

### Paywall A/B Tests

| # | Test | Variants | Metric |
|---|------|----------|--------|
| PW1 | Onboarding paywall timing | A: after Step27 (plan ready) / B: after first scan (Day 1) | Trial start rate |
| PW2 | Social proof on paywall | A: no proof / B: "50,000+ meals scanned" / C: user testimonials | Trial start rate |
| PW3 | Price anchoring | A: monthly first / B: annual first (with "most popular" badge) | Annual plan selection % |
| PW4 | Spin-the-wheel discount | A: 30% off / B: 40% off / C: 50% off | Conversion rate * revenue (optimize for revenue, not just conversion) |
| PW5 | Trial CTA copy | A: "Start Free Trial" / B: "Try 7 Days Free" / C: "Get Premium Free" | Trial start rate |
| PW6 | Feature gate preview | A: lock icon only / B: blurred preview / C: 1 free preview then gate | Gate-to-trial conversion |

---

## 4. LTV (LIFETIME VALUE) CALCULATION MODEL

### Formula

```
LTV = ARPU × Average Subscription Lifetime

Where:
  ARPU (Average Revenue Per User) = Total Revenue / Total Paying Users / Month
  Average Subscription Lifetime = 1 / Monthly Churn Rate
```

### Projected LTV by Plan

| Plan | Monthly Revenue | Est. Monthly Churn | Avg Lifetime (months) | LTV |
|------|----------------|-------------------|----------------------|-----|
| Monthly ($9.99) | $9.99 | 12% | 8.3 months | $82.92 |
| Annual ($59.99) | $5.00 | 4% (annual renewal churn ~45%) | ~20 months | $100.00 |
| Blended (70% annual, 30% monthly) | — | — | — | **$94.88** |

### LTV:CAC Analysis

| Metric | Conservative | Target | Optimistic |
|--------|-------------|--------|-----------|
| Blended LTV | $70 | $95 | $130 |
| Target CAC (LTV:CAC 3:1) | $23 | $32 | $43 |
| Target CAC (LTV:CAC 4:1) | $17.50 | $24 | $32.50 |
| Payback period | < 3 months | < 2 months | < 1 month |

**Rule:** LTV:CAC must be > 3:1 for sustainable growth. Target 4:1 to fund reinvestment.

### LTV Cohort Tracking

Track LTV by:
- **Acquisition channel:** Organic vs. paid (Meta, TikTok, Google UAC, influencer)
- **Signup month:** Seasonal cohorts (January cohorts retain better due to resolutions)
- **Plan type:** Monthly vs. annual
- **Onboarding completion:** Full onboarding vs. skipped steps
- **First-week engagement:** Users who scanned 5+ meals in week 1 vs. fewer
- **Geography:** US/UK vs. LATAM (different price sensitivity)

### Revenue Model (Year 1 Projection)

| Month | New Users | Trial Starts (12%) | Trial-to-Paid (50%) | New Subs | Churned Subs | Active Subs | MRR |
|-------|-----------|-------------------|---------------------|----------|-------------|-------------|-----|
| 1 | 5,000 | 600 | 300 | 300 | 0 | 300 | $2,100 |
| 2 | 6,000 | 720 | 360 | 360 | 24 | 636 | $4,452 |
| 3 | 7,500 | 900 | 450 | 450 | 51 | 1,035 | $7,245 |
| 4 | 8,000 | 960 | 480 | 480 | 83 | 1,432 | $10,024 |
| 5 | 9,000 | 1,080 | 540 | 540 | 115 | 1,857 | $12,999 |
| 6 | 10,000 | 1,200 | 600 | 600 | 149 | 2,308 | $16,156 |
| 7 | 11,000 | 1,320 | 660 | 660 | 185 | 2,783 | $19,481 |
| 8 | 12,000 | 1,440 | 720 | 720 | 223 | 3,280 | $22,960 |
| 9 | 13,000 | 1,560 | 780 | 780 | 262 | 3,798 | $26,586 |
| 10 | 14,000 | 1,680 | 840 | 840 | 304 | 4,334 | $30,338 |
| 11 | 15,000 | 1,800 | 900 | 900 | 347 | 4,887 | $34,209 |
| 12 | 16,000 | 1,920 | 960 | 960 | 391 | 5,456 | $38,192 |

**Assumptions:** 12% trial rate, 50% trial-to-paid, 8% monthly churn, blended ARPU $7.00 (70% annual / 30% monthly). New user growth: +15-20% MoM from ASO + paid acquisition.

**Year 1 total ARR (Month 12):** ~$458K

---

## 5. CHURN REDUCTION TACTICS

### Understanding Why Users Churn

| Churn Reason | Est. % | Detection Signal | Intervention |
|-------------|--------|-----------------|-------------|
| "Not using it enough" | 35% | < 3 opens in last 14 days | Re-engagement campaign |
| "Too expensive" | 20% | Cancels during trial or after first charge | Win-back discount offer |
| "Found another app" | 15% | Installs competitor (if available via attribution) | Competitive feature comparison |
| "Achieved my goal" | 10% | Weight goal reached, engagement drops | Goal reset + maintenance mode |
| "Too complicated" | 10% | Low feature adoption, short sessions | Simplified UX tour |
| "Technical issues" | 10% | Crash logs, support tickets | Bug fixes + personal apology |

### Pre-Churn Signals (Predictive Model)

Build a churn risk score (0-100) based on:

| Signal | Weight | Threshold |
|--------|--------|-----------|
| Days since last open | High | > 5 days = risk |
| Meals logged last 7 days | High | < 3 = risk |
| Streak broken | Medium | Lost streak of 7+ days = risk |
| Push notifications disabled | Medium | Disabled = risk |
| Support ticket filed | Medium | Unresolved ticket = risk |
| Session duration trending down | Low | 3 consecutive weeks declining |
| Feature usage declining | Low | Used 3+ features, now using 1 |

**Action triggers:**
- Risk score > 60: send personalized re-engagement push
- Risk score > 75: send email with personal stats recap
- Risk score > 85: trigger in-app "We noticed you've been less active" survey

### Churn Prevention by Lifecycle Stage

#### Trial Period (Days 1-7)

| Tactic | Implementation | Expected Impact |
|--------|---------------|----------------|
| Onboarding completion tracking | If user drops off mid-onboarding, send email with resume link | +5% trial completion |
| Day 3 value check-in | In-app message: "How's your experience so far? [Great / Could be better]" | Identifies at-risk trials early |
| Day 5 pre-expiry reminder | Push + email: "Your trial ends in 2 days. Here's what you'll keep/lose" | +10% trial-to-paid |
| Day 7 expiry with grace | Allow 1 scan/day for 3 days post-trial | +5% late conversion |

#### First 30 Days (Post-Conversion)

| Tactic | Implementation | Expected Impact |
|--------|---------------|----------------|
| First-month engagement program | Weekly emails with tips, feature highlights, progress check-ins | -3% M1 churn |
| Feature discovery prompts | "Did you know you can [feature]?" in-app tooltips | +15% feature adoption |
| Early warning intervention | If 0 logs for 5+ days, in-app banner on return: "Welcome back! Quick scan?" | -5% M1 churn |
| First billing confirmation | "You've been charged $X. Here's what you got this month: [stats]" | Reduces "surprise charge" cancels |

#### Months 2-6 (Establishing Long-Term Value)

| Tactic | Implementation | Expected Impact |
|--------|---------------|----------------|
| Monthly progress reports | Email: "This month you logged X meals, your avg was Y kcal" | Demonstrates ongoing value |
| Goal adjustment prompts | "You've lost 3kg! Want to update your target?" | Keeps goals relevant |
| New feature announcements | Targeted emails when features they'd use launch | Re-engages fading users |
| Annual plan upsell (for monthly users) | "Switch to annual and save 50%. Lock in your price." | Increases retention (annual churns less) |

#### Renewal Period (1-2 weeks before renewal)

| Tactic | Implementation | Expected Impact |
|--------|---------------|----------------|
| Value recap email | "In the past [month/year] with Fitsi AI: [meals logged, streak record, insights]" | -10% renewal churn |
| Annual renewal reminder | 14 days before: "Your annual plan renews on [date] at $59.99" | Reduces involuntary churn + trust |
| Win-back for cancelled | 24h after cancellation: "We're sorry to see you go. Here's 30% off if you change your mind" | 8-12% win-back rate |
| Downgrade option | Offer cheaper tier or pause instead of full cancellation | -5% hard churn |

### Involuntary Churn Prevention

| Issue | Solution | Expected Recovery |
|-------|---------|------------------|
| Payment method expired | Dunning emails: Day 1, Day 3, Day 7 post-failure. "Update your payment to keep Premium" | 40-60% recovery |
| Payment declined | Retry billing on Day 1, 3, 5, 7. Notify user on each retry | 30-50% recovery |
| App deleted but subscription active | Email: "Your Fitsi AI subscription is still active. Reinstall to keep using Premium" | 10-20% reinstall |

**RevenueCat handles most dunning automatically.** Configure:
- Grace period: 7 days (user keeps Premium during payment retry)
- Billing retry: Up to 4 attempts over 7 days
- Billing issue email: Sent on first failure

---

## 6. ONE-TIME OFFERS & PROMOTIONS

### Spin-the-Wheel Discount (Onboarding Step29-30)

**Trigger:** User declines primary paywall (Step28)
**Mechanic:** Animated wheel with discount tiers
**Odds:**
- 40% chance: 30% off first year
- 35% chance: 40% off first year
- 20% chance: 50% off first year
- 5% chance: 60% off first year (jackpot feeling)

**Psychology:** Loss aversion + gamification. User feels they "won" a deal. Significantly higher conversion than a flat discount.

### Win-Back Offers

| Segment | Offer | Channel | Timing |
|---------|-------|---------|--------|
| Cancelled < 7 days ago | 30% off next month | Email + push | Day 1 after cancel |
| Cancelled 7-30 days ago | 50% off next month | Email | Day 14 after cancel |
| Cancelled 30+ days ago | 1 month free | Email | Day 45 after cancel |
| Lapsed annual (didn't renew) | 40% off annual renewal | Email | Day 7 after expiry |

### Seasonal Promotions

| Event | Offer | Duration |
|-------|-------|----------|
| New Year (Jan 1-15) | 50% off annual plan | 15 days |
| Summer Body (May 1-15) | 40% off annual + extended 14-day trial | 15 days |
| Back to School (Aug 15-31) | 3 months for price of 2 | 17 days |
| Black Friday (Nov 25-Dec 2) | 60% off annual (best deal of the year) | 7 days |

---

## 7. MONETIZATION METRICS DASHBOARD

### Daily

| Metric | Target | Alert If |
|--------|--------|----------|
| Trial starts | > 2% of new installs | < 1.5% |
| Revenue (MRR) | Growing | Declines 2 consecutive days |
| Refund rate | < 5% | > 8% |

### Weekly

| Metric | Target | How to Calculate |
|--------|--------|-----------------|
| Trial-to-paid conversion | > 50% | Paid subs / expired trials (7 days ago) |
| MRR growth | > 10% MoM | This week MRR vs. same week last month |
| ARPU | > $7.00 | Total revenue / paying users |
| Annual plan mix | > 65% | Annual subs / total subs |
| Paywall view-to-trial rate | > 10% | Trial starts / unique paywall views |
| LTV:CAC ratio | > 3:1 | Cohort LTV / acquisition cost |

### Monthly

| Metric | Target | Action if Below |
|--------|--------|----------------|
| Monthly churn rate | < 8% | Analyze churn reasons, increase engagement |
| Net revenue retention | > 95% | Expansion revenue (upgrades) should offset churn |
| Refund rate | < 3% | Review product quality, billing transparency |
| Customer payback period | < 2 months | Reduce CAC or increase ARPU |
