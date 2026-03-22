# Fitsia IA

> AI-powered nutrition tracking app with 71+ screens, 37 mascot expressions, dark mode, i18n, and enterprise-grade backend.

Built by an autonomous agent organization of **248 agents** across 10+ evolution waves.

---

## Architecture

```
fitsia/
├── mobile/                 React Native + Expo 54 (TypeScript)
│   ├── src/
│   │   ├── screens/        71+ screens (30 onboarding + 25 main + legal + auth)
│   │   ├── components/     20+ reusable components (FitsiMascot, WaterTracker, etc.)
│   │   ├── context/        AuthContext, ThemeContext, LanguageContext, OnboardingContext
│   │   ├── services/       API client, analytics, offline store, barcode, feedback
│   │   ├── hooks/          useAnalytics, useNetworkStatus, useHaptics
│   │   ├── i18n/           Internationalization (en/es, 12 languages ready)
│   │   ├── navigation/     AppNavigator + MainNavigator (5 tabs + stacks)
│   │   ├── theme/          Design system (light + dark mode, Norte Digital palette)
│   │   └── data/           20 hardcoded recipes
│   └── assets/mascot/      Fitsi penguin: 37 expressions + 4 base variants
│
├── backend/                FastAPI + Python (v1.3.0)
│   ├── app/
│   │   ├── core/           Config, security, database, cache, rate limiter, circuit breaker
│   │   ├── models/         User, OnboardingProfile, MealLog, Subscription, PushToken, Feedback
│   │   ├── routers/        Auth, Food, Meals, Onboarding, Subscriptions, Notifications, Admin, Feedback
│   │   └── services/       AI scan, meals, food, notifications, nutrition, OAuth
│   ├── scripts/            Seed (1K users), load test, stress test (Locust), capacity report
│   └── alembic/            Database migrations
│
├── docs/                   35+ documentation files
│   ├── GROWTH-LOG.md       Step-by-step evolution history
│   ├── AUTOPOIESIS-LOG.md  Maturana-inspired system evolution docs
│   ├── SCALING.md          Infrastructure scaling plan ($73/mo to $21K/mo)
│   ├── app-store-listing.md ASO-optimized App Store + Google Play listings
│   └── agent-logs/         Self-documentation from each agent
│
├── nginx/                  Reverse proxy + SSL config
├── docker-compose.yml      Development orchestration
└── docker-compose.prod.yml Production with security hardening
```

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Mobile** | React Native + Expo | 54.x |
| **Language** | TypeScript | 5.9 |
| **Backend** | FastAPI + Gunicorn | 1.3.0 |
| **Database** | PostgreSQL | 15 |
| **Cache** | Redis | 7 |
| **AI Vision** | GPT-4o Vision | latest |
| **Payments** | RevenueCat | 9.14 |
| **Push** | Expo Push API | — |
| **Auth** | JWT + Apple Sign In + Google OAuth | — |
| **Charts** | react-native-svg | 15.x |
| **Navigation** | React Navigation v7 | 7.x |
| **i18n** | i18n-js + expo-localization | — |
| **Testing** | Locust + custom load test | — |
| **CI/CD** | GitHub Actions | — |
| **Container** | Docker + docker-compose | — |

## Features

### Core Nutrition
- **AI Food Scanning** — Take a photo, get instant macro analysis (GPT-4o Vision)
- **Barcode Scanner** — Scan product barcodes via OpenFoodFacts API
- **Manual Food Logging** — Add meals with full macro breakdown
- **Water Tracking** — Circular SVG progress + quick-add buttons (+250ml, +500ml, +1L)
- **Daily Dashboard** — Calorie ring, macro bars, meal cards, streak badge
- **Weight Tracking** — SVG line chart with area gradient, BMI, progress photos
- **Health Score** — 1-10 score based on macro balance (30/40/30 ratio)

### Personalization
- **30-Step Onboarding** — Comprehensive data collection for custom nutrition plan
- **Mifflin-St Jeor Formula** — Accurate BMR/TDEE calculation
- **Diet Types** — Classic, Pescatarian, Vegetarian, Vegan
- **Goal Setting** — Lose, Maintain, Gain weight with speed control
- **Nutrition Goals Editor** — Manual macro adjustment with pie chart

### Engagement
- **Streaks & Achievements** — 12 badges, daily streak counter, haptic celebrations
- **AI Coach Chat** — Mock AI nutrition coach with tips and support responses
- **Recipes** — 20 recipes with filters, ingredients, instructions, "Log This Meal"
- **Weekly/Monthly Reports** — Bar charts, pie charts, insights, adherence tracking
- **Progress Tab** — Dark mode, weight changes table, progress photos, daily calories
- **Groups/Community** — Discover and join nutrition groups

### Monetization
- **RevenueCat Integration** — Monthly ($9.99), Annual ($34.99), Lifetime
- **3-Step Trial Timeline** — Cal AI-style paywall with visual timeline
- **Spin-the-Wheel** — Gamified discount (30-80% off)
- **Referral Program** — "Refer a friend, earn $10" with share API
- **Family Plan** — Up to 6 members, save 70%

### Platform
- **Dark Mode** — Full dark theme with ThemeContext (system/light/dark toggle)
- **Internationalization** — English + Spanish, infrastructure for 12 languages
- **Offline Mode** — AsyncStorage cache, action queue, auto-sync on reconnect
- **Analytics** — 30+ events tracked across 15 screens (Mixpanel/Amplitude-ready)
- **Push Notifications** — Expo Push API with meal/water/streak reminders
- **PDF Reports** — Generate and share nutrition summary PDFs
- **Accessibility** — Screen reader labels, roles, hints, radio groups

### Mascot — Fitsi the Penguin
- **37 Expressions** — neutral, happy, angry, chef, doctor, thinking, hungry, fire, crown, etc.
- **6 Animations** — idle (breathing), bounce, wave, celebrate (haptic), thinking, sad
- **Interactive** — Tap for random expression + nutrition tip
- **Contextual** — Different expression per screen (chef in Recipes, hungry in empty Log, etc.)
- **13 Screen Integrations** — Splash, Welcome, Home, Coach, Achievements, Log, Scan, Progress, Groups, Recipes, Reports, Plan Building, Plan Ready

## Backend API (56 routes, v1.3.0)

### Authentication
```
POST /auth/register          Email/password registration
POST /auth/login             Login with JWT tokens
POST /auth/refresh           Refresh access token
POST /auth/apple             Apple Sign In
POST /auth/google            Google OAuth
GET  /auth/me                Current user info
```

### Food & Nutrition
```
POST /api/food/scan          AI food photo scanning (GPT-4o Vision)
POST /api/food/manual        Manual food entry
GET  /api/food/logs          Food log history (paginated, filterable)
PUT  /api/food/logs/:id      Edit food log
DELETE /api/food/logs/:id    Delete food log
POST /api/food/water         Log water intake
GET  /api/food/search        Search food database
```

### Dashboard & Reports
```
GET  /api/dashboard/today    Daily summary vs targets
GET  /meals/summary          Meal summary with macros
GET  /meals/list             Paginated meals with filters + sorting
```

### Onboarding
```
POST /api/onboarding/save-step    Save individual onboarding step
POST /api/onboarding/complete     Complete onboarding + calculate plan
GET  /api/onboarding/profile      Retrieve saved profile
```

### Subscriptions & Notifications
```
POST /api/subscriptions           Create subscription
GET  /api/subscriptions/current   Active subscription
DELETE /api/subscriptions/current Cancel subscription
POST /api/notifications/register  Save push token
POST /api/notifications/send-test Send test notification
```

### Admin & Monitoring
```
GET  /api/health              System health (DB, Redis, uptime, workers)
GET  /api/stats/users          Admin stats (DAU, MAU, premium count)
GET  /api/cache/stats          Cache hit/miss ratio
GET  /api/circuit-breakers     External service status
```

## Security

- **JWT** — HS256 with separate access/refresh keys, rolling refresh, blacklist via Redis
- **PBKDF2** — 600,000 rounds (OWASP 2023 recommendation)
- **Rate Limiting** — Per-IP (slowapi) + per-user (Redis sliding window)
- **Brute Force Protection** — 5 failed logins = 15 min lockout
- **IDOR Prevention** — All data endpoints scoped to authenticated user
- **SQL Injection** — Parameterized queries + LIKE wildcard escaping
- **Security Headers** — HSTS, X-Content-Type-Options, X-Frame-Options, CSP, Permissions-Policy
- **CORS** — Wildcard blocked in production
- **Token Revocation** — JTI-based blacklist for immediate invalidation
- **App Version Gate** — 426 Upgrade Required for outdated clients

## Scalability

- **8 Gunicorn Workers** — Handles 1,000 concurrent users (p95 < 250ms)
- **Connection Pooling** — pool_size=20, max_overflow=40, pool_pre_ping
- **Redis Cache** — @cached decorator, stampede protection, 120s TTL on hot endpoints
- **Circuit Breaker** — OpenAI API protection (5 failures = 30s open state)
- **N+1 Fix** — Batch queries reduced 7-90x in weekly/history endpoints
- **Lazy Loading** — Non-initial tabs loaded on demand
- **React.memo** — 12+ components memoized to prevent expensive SVG re-renders

### Stress Test Results (8 workers, local Mac)

| Users | RPS | p50 | p95 | Status |
|-------|-----|-----|-----|--------|
| 50 | 5.6 | 20ms | 94ms | Stable |
| 200 | 5.0 | 24ms | 180ms | Stable |
| 500 | 13.4 | 47ms | 250ms | Stable |
| 1,000 | 21.1 | 56ms | 180ms | Stable |
| 2,000 | 38.9 | 160ms | 300ms | Degraded |
| 5,000 | 89.6 | 350ms | 520ms | Degraded |
| 10,000 | 178.7 | 2.5s | 3.9s | Overloaded |

**System never crashed** — survived all 7 phases up to 10,000 concurrent users.

### Estimated Infrastructure Costs

| Scale | Monthly Cost | Setup |
|-------|-------------|-------|
| 1K users | $73 | 1 server, basic DB |
| 10K users | $490 | 2 servers, DB replica |
| 100K users | $3,595 | 4 servers, Redis cluster |
| 1M users | $21,710 | K8s auto-scaling |

## Development

### Prerequisites
- Node.js 18+
- Python 3.11+
- PostgreSQL 15
- Redis 7

### Quick Start

```bash
# Backend
cd backend
pip install -r requirements.txt
python -m scripts.seed_users --count 100
uvicorn app.main:app --reload

# Mobile
cd mobile
npm install
npx expo start

# Stress Test
pip install locust
locust -f scripts/stress_test.py --host http://localhost:8000
```

### Docker (Production)

```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Agent Organization

This app was built and evolved by **248 autonomous agents** organized in teams:

| Category | Agents | Purpose |
|----------|--------|---------|
| Fitsia Management | 24 | Business decisions, strategy |
| Fitsia Specialists | 11 | Feature-specific experts |
| Engineering | 19 | Frontend, backend, DevOps, QA, security |
| Fitness Domain | 10 | Exercise science, biomechanics |
| Nutrition Domain | 6 | Nutritional science, food AI |
| Equipment | 5 | Gym equipment expertise |
| Business | 5 | Product, growth, marketing |
| QA Testing | 50 | 5 user profiles x 10 agents each |
| Git Versioning | 5 | Commits, PRs, changelog, CI |
| System | 2 | Orchestrator, security daemon |

Dashboard: `http://localhost:8765` (Agent Command Center with real-time monitoring)

## Documentation

| Document | Description |
|----------|-------------|
| [GROWTH-LOG.md](docs/GROWTH-LOG.md) | Step-by-step evolution history |
| [AUTOPOIESIS-LOG.md](docs/AUTOPOIESIS-LOG.md) | Maturana-inspired system evolution |
| [SCALING.md](backend/docs/SCALING.md) | Infrastructure scaling plan |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Production deployment guide |
| [app-store-listing.md](docs/app-store-listing.md) | ASO-optimized store listings |
| [aso-keywords.md](docs/aso-keywords.md) | Keyword research & strategy |
| [launch-checklist.md](docs/launch-checklist.md) | App Store launch checklist |
| [retention-strategy.md](docs/retention-strategy.md) | User retention playbook |
| [monetization-strategy.md](docs/monetization-strategy.md) | Revenue optimization |
| [analytics-events.md](mobile/docs/analytics-events.md) | 30+ tracked events |
| [API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md) | Full API reference |

## License

Proprietary - Fitsia IA SpA. All rights reserved.

---

Built with Claude Opus 4.6 (1M context) | 248 agents | 10+ evolution waves | 80+ tasks
