# Fitsi IA — KPI Dashboard Definition

> Business metrics framework for tracking growth, engagement, and revenue.
> Each KPI includes definition, formula, target, data source, and measurement frequency.

---

## 1. ACQUISITION

### 1.1 Customer Acquisition Cost (CAC)

| Field | Value |
|-------|-------|
| **Definition** | Average cost to acquire one new user (install + signup) |
| **Formula** | `Total Marketing Spend / New Users Acquired` |
| **Target** | < $2.50 (organic-heavy mix), < $5.00 (paid channels) |
| **Data Source** | Ad platforms (Apple Search Ads, Meta Ads, Google Ads) + App Store Connect |
| **Frequency** | Weekly (by channel), Monthly (blended) |

### 1.2 Install Rate

| Field | Value |
|-------|-------|
| **Definition** | Percentage of App Store page visitors who install the app |
| **Formula** | `Installs / App Store Page Views * 100` |
| **Target** | > 30% (organic), > 15% (paid traffic) |
| **Data Source** | App Store Connect Analytics, Google Play Console |
| **Frequency** | Weekly |

### 1.3 Organic vs Paid Split

| Field | Value |
|-------|-------|
| **Definition** | Proportion of installs from organic sources vs paid campaigns |
| **Formula** | `Organic Installs / Total Installs * 100` |
| **Target** | > 60% organic (healthy growth), paid as accelerator not dependency |
| **Data Source** | App Store Connect + attribution platform (Adjust / AppsFlyer) |
| **Frequency** | Weekly |

---

## 2. ACTIVATION

### 2.1 Onboarding Completion Rate

| Field | Value |
|-------|-------|
| **Definition** | Percentage of users who complete all 30 onboarding steps |
| **Formula** | `Users who reached Step 30 / Users who started Step 01 * 100` |
| **Target** | > 65% overall, > 80% from Step 01 to Step 10 |
| **Data Source** | Analytics events (`onboarding_step_completed`), backend `onboarding_profiles.completed_at` |
| **Frequency** | Daily |
| **Segmentation** | By acquisition channel, device type, country |

### 2.2 Time to First Scan

| Field | Value |
|-------|-------|
| **Definition** | Time elapsed from signup to first AI food scan |
| **Formula** | `Median(first food_scanned timestamp - user.created_at)` |
| **Target** | < 10 minutes (same session as onboarding) |
| **Data Source** | Analytics event `food_scanned` + `users.created_at` |
| **Frequency** | Daily |

### 2.3 D1 Activation Rate

| Field | Value |
|-------|-------|
| **Definition** | Percentage of new users who return and perform a core action on Day 1 |
| **Formula** | `Users with >= 1 food_scanned OR meal_logged_manual on D1 / Total new users * 100` |
| **Target** | > 40% |
| **Data Source** | Analytics events + `users.created_at` |
| **Frequency** | Daily (7-day rolling average) |

---

## 3. ENGAGEMENT

### 3.1 DAU/MAU Ratio (Stickiness)

| Field | Value |
|-------|-------|
| **Definition** | Ratio of daily active users to monthly active users — measures how often users come back |
| **Formula** | `DAU / MAU * 100` |
| **Target** | > 25% (good for health app), aspirational > 35% |
| **Data Source** | Analytics `screen_viewed` events (unique users per day/month) |
| **Frequency** | Daily |

### 3.2 Meals Logged per User per Day

| Field | Value |
|-------|-------|
| **Definition** | Average number of food entries (scan + manual + barcode) per active user per day |
| **Formula** | `Total food_logs created today / DAU` |
| **Target** | >= 2.5 meals/day (covers breakfast + lunch + snack minimum) |
| **Data Source** | `food_logs` table, `daily_summaries.meals_logged` |
| **Frequency** | Daily |

### 3.3 Sessions per Day per User

| Field | Value |
|-------|-------|
| **Definition** | Average number of app sessions per active user per day |
| **Formula** | `Total sessions today / DAU` |
| **Target** | >= 3 sessions/day (morning check, meal logging, evening review) |
| **Data Source** | Analytics `screen_viewed` events (session = gap > 30min between events) |
| **Frequency** | Daily |

---

## 4. MONETIZATION

### 4.1 Trial-to-Paid Conversion Rate

| Field | Value |
|-------|-------|
| **Definition** | Percentage of users who start a free trial and convert to paying subscriber |
| **Formula** | `Paid subscribers from trial / Users who started trial * 100` |
| **Target** | > 55% (annual plan with 3-day trial), > 40% (monthly) |
| **Data Source** | RevenueCat dashboard, analytics `purchase_completed` events |
| **Frequency** | Weekly (cohorted by trial start date) |

### 4.2 Average Revenue Per User (ARPU)

| Field | Value |
|-------|-------|
| **Definition** | Average monthly revenue across ALL users (free + paid) |
| **Formula** | `MRR / Total Active Users` |
| **Target** | > $0.80/month at scale |
| **Data Source** | RevenueCat MRR + DAU/MAU from analytics |
| **Frequency** | Monthly |

### 4.3 Average Revenue Per Paying User (ARPPU)

| Field | Value |
|-------|-------|
| **Definition** | Average monthly revenue across paying subscribers only |
| **Formula** | `MRR / Active Paying Subscribers` |
| **Target** | $5.00-$8.00/month (blended annual + monthly plans) |
| **Data Source** | RevenueCat |
| **Frequency** | Monthly |

### 4.4 Lifetime Value (LTV)

| Field | Value |
|-------|-------|
| **Definition** | Total expected revenue from a user over their entire lifetime |
| **Formula** | `ARPPU * Average Subscriber Lifetime (months)` |
| **Target** | > $30 (annual plan), > $20 (monthly plan) |
| **Data Source** | RevenueCat (churn + revenue data), calculated model |
| **Frequency** | Monthly (recalculated with new cohort data) |
| **Notes** | Also track by acquisition channel and onboarding variant for optimization |

### 4.5 LTV:CAC Ratio

| Field | Value |
|-------|-------|
| **Definition** | Return on investment for user acquisition — how much revenue per dollar spent |
| **Formula** | `LTV / CAC` |
| **Target** | > 3:1 (healthy), > 5:1 (excellent) |
| **Data Source** | Derived from LTV and CAC calculations |
| **Frequency** | Monthly (by channel) |

---

## 5. RETENTION

### 5.1 Day-N Retention Rates

| Field | Value |
|-------|-------|
| **Definition** | Percentage of users who return on Day N after signup |
| **Formula** | `Users active on Day N / Users who signed up N days ago * 100` |
| **Targets** | D1: > 45%, D7: > 25%, D30: > 15%, D90: > 10% |
| **Data Source** | Analytics `screen_viewed` events cohorted by `users.created_at` |
| **Frequency** | Daily (D1, D7), Weekly (D30), Monthly (D90) |
| **Segmentation** | By acquisition channel, plan type, onboarding completion, country |

### 5.2 Weekly Churn Rate

| Field | Value |
|-------|-------|
| **Definition** | Percentage of active users in week N who do not return in week N+1 |
| **Formula** | `(Active users week N - Returning users week N+1) / Active users week N * 100` |
| **Target** | < 15% weekly churn for free users, < 5% for premium |
| **Data Source** | Analytics session data |
| **Frequency** | Weekly |

### 5.3 Monthly Subscriber Churn Rate

| Field | Value |
|-------|-------|
| **Definition** | Percentage of paying subscribers who cancel or do not renew in a given month |
| **Formula** | `Churned subscribers this month / Active subscribers at start of month * 100` |
| **Target** | < 8% monthly (annual plans), < 12% monthly (monthly plans) |
| **Data Source** | RevenueCat churn data, `subscriptions` table |
| **Frequency** | Monthly |

---

## 6. SUPPORT

### 6.1 Tickets per 1,000 Users

| Field | Value |
|-------|-------|
| **Definition** | Volume of support tickets relative to user base — measures product quality and UX clarity |
| **Formula** | `Support tickets opened / (MAU / 1000)` |
| **Target** | < 5 tickets per 1,000 MAU |
| **Data Source** | Help desk (Zendesk / Intercom / email), MAU from analytics |
| **Frequency** | Weekly |

### 6.2 Customer Satisfaction Score (CSAT)

| Field | Value |
|-------|-------|
| **Definition** | Post-interaction satisfaction rating from users who contact support |
| **Formula** | `(Satisfied responses / Total responses) * 100` (typically 1-5 scale, satisfied = 4 or 5) |
| **Target** | > 85% |
| **Data Source** | Help desk post-ticket survey |
| **Frequency** | Monthly |

### 6.3 Net Promoter Score (NPS)

| Field | Value |
|-------|-------|
| **Definition** | Likelihood of users recommending the app — overall product satisfaction proxy |
| **Formula** | `% Promoters (9-10) - % Detractors (0-6)` on 0-10 scale |
| **Target** | > 40 (good), > 60 (excellent for consumer app) |
| **Data Source** | In-app survey (triggered after 7+ days of usage, once per quarter) |
| **Frequency** | Quarterly |

### 6.4 Average Resolution Time

| Field | Value |
|-------|-------|
| **Definition** | Average time from ticket creation to resolution |
| **Formula** | `Mean(ticket_resolved_at - ticket_created_at)` |
| **Target** | < 4 hours (first response), < 24 hours (resolution) |
| **Data Source** | Help desk platform |
| **Frequency** | Weekly |

---

## Dashboard Layout Recommendation

```
+-----------------------------------------------------+
|  HEADER: Date Range Picker  |  Refresh  |  Export   |
+-----------------------------------------------------+
|                                                     |
|  ROW 1: Key Numbers (big cards)                     |
|  [ DAU ]  [ MAU ]  [ MRR ]  [ Trial CVR ]          |
|                                                     |
+-----------------------------------------------------+
|                                                     |
|  ROW 2: Acquisition                                 |
|  [ CAC by channel (bar) ]  [ Organic/Paid pie ]     |
|                                                     |
+-----------------------------------------------------+
|                                                     |
|  ROW 3: Activation + Engagement                     |
|  [ Onboarding funnel ]  [ DAU/MAU trend line ]      |
|  [ Time to first scan histogram ]                   |
|                                                     |
+-----------------------------------------------------+
|                                                     |
|  ROW 4: Retention                                   |
|  [ D1/D7/D30/D90 cohort heatmap ]                  |
|  [ Churn rate trend line ]                          |
|                                                     |
+-----------------------------------------------------+
|                                                     |
|  ROW 5: Revenue                                     |
|  [ MRR growth line ]  [ LTV:CAC by channel ]        |
|  [ ARPU / ARPPU comparison ]                        |
|                                                     |
+-----------------------------------------------------+
|                                                     |
|  ROW 6: Support Health                              |
|  [ Tickets/1K users ]  [ CSAT gauge ]  [ NPS ]      |
|                                                     |
+-----------------------------------------------------+
```

## Data Pipeline

```
Mobile App (analytics events)
    |
    v
Analytics Provider (Mixpanel / Amplitude / PostHog)
    |
    v
Data Warehouse (BigQuery / Redshift)
    |
    v
Dashboard Tool (Metabase / Grafana / Looker)
    |
    +---> Automated Alerts (Slack / PagerDuty)
    +---> Weekly Report Email (stakeholders)
```

## Alert Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| D1 Retention | < 40% | < 30% |
| Trial-to-Paid CVR | < 45% | < 35% |
| Monthly Subscriber Churn | > 10% | > 15% |
| DAU/MAU | < 20% | < 15% |
| Tickets per 1K MAU | > 8 | > 15 |
| Onboarding Completion | < 55% | < 40% |

---

*Last updated: 2026-03-22*
